"""Read-only host gates for the rootless vault."""

import argparse
import grp
import json
import os
from pathlib import Path
import pwd
import re
import shutil
import stat
import subprocess
import sys


ACCOUNT = "maple-vault"
GIB = 1 << 30
PATH = "/usr/sbin:/usr/bin:/sbin:/bin"
TOOLS = ("podman", "systemctl", "loginctl", "newuidmap", "newgidmap", "getsubids",
         "ss", "nginx", "certbot")
GENERATOR = Path("/usr/lib/systemd/user-generators/podman-user-generator")


def required_bytes(phase, reserve):
    if reserve < 0 or (phase == "after-install" and reserve == 0):
        raise ValueError("reserve must be nonnegative, and positive after installation")
    return 30 * GIB if phase == "before-pull" else 20 * GIB + reserve


def capacity(home, phase, reserve):
    minimum = required_bytes(phase, reserve)
    for directory in (home, *home.parents):
        try:
            free = shutil.disk_usage(directory).free
            return {"ok": free >= minimum, "free_bytes": free, "required_bytes": minimum,
                    "measured_at_home": directory == home}
        except FileNotFoundError:
            continue
        except OSError:
            break
    return {"ok": False, "required_bytes": minimum, "reason": "disk usage unavailable"}


def account_check(home, uid):
    try:
        account = pwd.getpwnam(ACCOUNT)
    except KeyError:
        return {"ok": False, "reason": "dedicated account missing"}
    try:
        metadata = home.lstat()
        group = grp.getgrgid(account.pw_gid)
        groups = os.getgrouplist(ACCOUNT, account.pw_gid)
        checks = {
            "uid": account.pw_uid > 0 and (uid is None or uid == account.pw_uid),
            "home": account.pw_dir == str(home) and home.resolve() == home
                    and stat.S_ISDIR(metadata.st_mode) and stat.S_IMODE(metadata.st_mode) == 0o700
                    and metadata.st_uid == account.pw_uid and metadata.st_gid == account.pw_gid,
            "group": group.gr_name == ACCOUNT and set(group.gr_mem) <= {ACCOUNT}
                     and set(groups) == {account.pw_gid},
            "nologin": account.pw_shell == "/usr/sbin/nologin",
        }
    except (KeyError, OSError, RuntimeError):
        return {"ok": False, "reason": "dedicated account metadata unavailable"}
    return {"ok": all(checks.values()), "checks": checks}


def command_output(*args):
    command = shutil.which(args[0], path=PATH)
    if not command:
        return None
    try:
        return subprocess.run(
            [command, *args[1:]], check=True, capture_output=True, text=True, timeout=5,
            env={"PATH": PATH, "LC_ALL": "C"},
        ).stdout
    except (OSError, subprocess.SubprocessError, UnicodeError):
        return None


def rootless_check():
    uid_ranges = command_output("getsubids", ACCOUNT)
    gid_ranges = command_output("getsubids", "-g", ACCOUNT)
    lingering = command_output("loginctl", "show-user", "--property=Linger", "--value", ACCOUNT)

    def has_range(output):
        ranges = re.findall(r"(?m)^\d+: maple-vault ([1-9]\d*) ([1-9]\d*)$", output or "")
        return any(int(start) >= 65536 and int(count) >= 65536 for start, count in ranges)

    checks = {"subuid": has_range(uid_ranges), "subgid": has_range(gid_ranges),
              "linger": (lingering or "").strip() == "yes"}
    return {"ok": all(checks.values()), "checks": checks}


def tools_check():
    missing = [tool for tool in TOOLS if not shutil.which(tool, path=PATH)]
    version = re.fullmatch(r"podman version (\d+)\.(\d+)\.\d+[^\s]*\s*",
                           command_output("podman", "--version") or "")
    try:
        controllers = Path("/sys/fs/cgroup/cgroup.controllers").read_text().split()
    except OSError:
        controllers = []
    checks = {
        "linux": sys.platform == "linux",
        "podman_at_least_4_9": bool(version and tuple(map(int, version.groups())) >= (4, 9)),
        "user_quadlet_generator": GENERATOR.is_file() and os.access(GENERATOR, os.X_OK),
        "cgroup_v2_cpu_memory": {"cpu", "memory"} <= set(controllers),
    }
    return {"ok": not missing and all(checks.values()), "missing": missing, "checks": checks}


def port_check(phase, port):
    output = command_output("ss", "-H", "-ltn")
    if output is None:
        return {"ok": False, "port": port, "reason": "TCP listeners unavailable"}
    addresses = []
    for line in output.splitlines():
        fields = line.split()
        if len(fields) < 5 or ":" not in fields[3]:
            return {"ok": False, "port": port, "reason": "unexpected TCP listener output"}
        address, _, number = fields[3].rpartition(":")
        if number == str(port):
            addresses.append(address)
    expected = not addresses if phase == "before-pull" else addresses == ["127.0.0.1"]
    return {"ok": expected, "port": port, "listener_count": len(addresses),
            "loopback_only": addresses == ["127.0.0.1"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--home", required=True, type=Path)
    parser.add_argument("--phase", required=True, choices=("before-pull", "after-install"))
    parser.add_argument("--reserve-bytes", required=True, type=int)
    parser.add_argument("--port", type=int, default=18080)
    parser.add_argument("--uid", type=int)
    args = parser.parse_args()
    if not args.home.is_absolute() or not 1024 <= args.port <= 65535:
        parser.error("provide an absolute home and a port in 1024..65535")
    if args.uid is not None and not 1000 <= args.uid <= 60000:
        parser.error("UID must be in 1000..60000")
    try:
        disk = capacity(args.home, args.phase, args.reserve_bytes)
    except ValueError as error:
        parser.error(str(error))

    account = account_check(args.home, args.uid)
    checks = {
        "capacity": disk,
        "account": account,
        "tools": tools_check(),
        "rootless_account": rootless_check() if account["ok"] else {"ok": False},
        "port": port_check(args.phase, args.port),
    }
    ok = all(check["ok"] for check in checks.values())
    print(json.dumps({"ok": ok, "phase": args.phase, **checks}, sort_keys=True))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
