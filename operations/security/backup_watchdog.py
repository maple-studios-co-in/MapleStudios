#!/usr/bin/env python3
"""Run independently of backup; recover abandoned maintenance and alert on failures."""
import argparse
import json
import signal
import sys
import urllib.request
from datetime import timedelta
from pathlib import Path

sys.dont_write_bytecode = True

from backup import (CODES, MAX_STATUS_AGE, JobError, MapleApps, NoRedirect, Runner, atomic_json,
                    datetime_value, decode_json, inherited_lock, load_config, lock,
                    private_process, private_read, read_status, terminate, timestamp, utc_now)

ALERT_INTERVAL = timedelta(hours=6)


def send_alert(cfg, codes):
    key = private_read(Path(cfg.alert["key_file"]), 1024).decode().strip()
    body = {"from": cfg.alert["from"], "to": [cfg.alert["to"]],
            "subject": "Maple backup requires attention",
            "text": "Backup monitoring codes: " + ", ".join(sorted(codes)) +
                    ". Review the private backup status and scheduler."}
    request = urllib.request.Request("https://api.resend.com/emails",
                                     data=json.dumps(body).encode(),
                                     headers={"Content-Type": "application/json", "Authorization": "Bearer " + key})
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    with opener.open(request, timeout=10) as response:
        if response.status // 100 != 2:
            raise JobError("alert_failed")


def recent(value, now, maximum=MAX_STATUS_AGE):
    try:
        return timedelta() <= now - datetime_value(value) <= maximum
    except (TypeError, ValueError):
        return False


def alert_due(cfg, now):
    try:
        data = decode_json(private_read(cfg.alert_path, 1024))
        last = datetime_value(data["lastAttemptAt"])
        return not (abs(now - last) < ALERT_INTERVAL)
    except (OSError, TypeError, ValueError, KeyError, JobError):
        return True


def watch(cfg, runner, *, now=utc_now, send=send_alert):
    with lock(cfg.alert_path.with_name(cfg.alert_path.name + ".lock")) as watch_fd:
        if watch_fd is None:
            return set()
        with inherited_lock(runner, watch_fd):
            return _observe(cfg, runner, now(), send)


def _observe(cfg, runner, now, send):
    codes = set()
    with lock(cfg.deploy_lock) as maint_fd:
        if maint_fd is not None:
            with inherited_lock(runner, maint_fd):
                try:
                    if MapleApps(cfg, runner).recover():
                        codes.add("maintenance_interrupted")
                except (JobError, OSError, ValueError, KeyError, TypeError, AttributeError):
                    codes.add("recovery_failed")

    with lock(cfg.run_lock) as run_fd:
        status = read_status(cfg)
        if not all(recent(status[field], now) for field in
                   ("lastAttemptAt", "lastSuccessAt", "lastUploadVerifiedAt")):
            # Do not alarm on the first backup while it is within the normal job budget.
            budget = timedelta(seconds=cfg.transfer_seconds * 3 + cfg.maintenance_seconds + 120)
            if run_fd is not None or not recent(status["lastAttemptAt"], now, budget):
                codes.add("backup_stale")
        if not status["ok"] and run_fd is not None:
            codes.add(status.get("error", "backup_stale"))
        if run_fd is not None and codes:
            status["ok"] = False
            status["error"] = next((code for code in
                                    ("recovery_failed", "maintenance_interrupted", status.get("error"),
                                     "backup_stale") if code in codes), "backup_stale")
            atomic_json(cfg.status_path, status)

    if codes and alert_due(cfg, now):
        codes.intersection_update(CODES)
        # Claim the attempt before contacting the provider, including in failure cases.
        atomic_json(cfg.alert_path, {"version": 1, "lastAttemptAt": timestamp(now), "codes": sorted(codes)})
        try:
            send(cfg, codes)
        except (OSError, ValueError, JobError):
            print("maple-backup watchdog: alert_failed", file=sys.stderr)
        else:
            atomic_json(cfg.alert_path, {"version": 1, "lastAttemptAt": timestamp(now),
                                         "lastSentAt": timestamp(now), "codes": sorted(codes)})
    return codes


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", required=True, type=Path)
    args = parser.parse_args()
    private_process()
    signal.signal(signal.SIGTERM, terminate)
    signal.signal(signal.SIGINT, terminate)
    try:
        cfg = load_config(args.config, check_credentials=False, recovery_only=True)
        codes = watch(cfg, Runner(cfg))
        if codes:
            print("maple-backup watchdog: " + ", ".join(sorted(codes)), file=sys.stderr)
        return bool(codes)
    except (JobError, OSError, ValueError, KeyError, TypeError, AttributeError):
        print("maple-backup watchdog: configuration or state failure", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
