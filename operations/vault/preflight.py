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
         "ss", "nginx", "certbot", "getent")
GENERATOR = Path("/usr/lib/systemd/user-generators/podman-user-generator")


def required_bytes(phase, reserve):
    if reserve < 0 or (phase == "after-install" and reserve == 0):
        raise ValueError("reserve must be nonnegative, and positive after installation")
    return 30 * GIB if phase == "before-pull" else 20 * GIB + reserve


def filesystem_devices(home, graph_root, staging):
    devices = set()
    for directory in (home, graph_root, staging):
        if not (directory and directory.is_relative_to(home) and directory.is_dir()
                and directory.resolve(strict=True) == directory):
            return set()
        devices.add(directory.stat().st_dev)
    return devices


def capacity(home, phase, reserve, graph_root=None, staging=None):
    minimum = required_bytes(phase, reserve)
    try:
        verified = len(filesystem_devices(home, graph_root, staging)) == 1
    except (OSError, RuntimeError):
        verified = False
    for directory in (home, *home.parents):
        try:
            free = shutil.disk_usage(directory).free
            return {"ok": verified and directory == home and free >= minimum,
                    "space_sufficient": free >= minimum, "free_bytes": free,
                    "required_bytes": minimum, "installation_filesystem_verified": verified,
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
        users = pwd.getpwall()
        groups_at_gid = grp.getgrall()
        shadow = (command_output("getent", "shadow", ACCOUNT) or "").splitlines()
        password = shadow[0].split(":") if len(shadow) == 1 else []
        checks = {
            "uid_gid": uid is not None and account.pw_uid == account.pw_gid == uid,
            "home": account.pw_dir == str(home) and home.resolve() == home
                    and stat.S_ISDIR(metadata.st_mode) and stat.S_IMODE(metadata.st_mode) == 0o700
                    and metadata.st_uid == account.pw_uid and metadata.st_gid == account.pw_gid,
            "group": group.gr_name == ACCOUNT and set(group.gr_mem) <= {ACCOUNT}
                     and set(groups) == {account.pw_gid}
                     and [entry.gr_name for entry in groups_at_gid if entry.gr_gid == uid] == [ACCOUNT],
            "exclusive_identity": [entry.pw_name for entry in users
                                   if entry.pw_uid == uid or entry.pw_gid == uid] == [ACCOUNT],
            "nologin": account.pw_shell == "/usr/sbin/nologin",
            "password_locked": len(password) == 9 and password[0] == ACCOUNT
                               and password[1].startswith(("!", "*")),
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


def safe_subids(path, effective, uid, host_ids):
    try:
        assignments = []
        for line in path.read_text().splitlines():
            owner, start, count = line.split(":")
            start, count = int(start), int(count)
            if not owner or start < 1 or count < 1 or start + count > (1 << 32) - 1:
                return False
            assignments.append((owner, start, start + count))
    except (OSError, ValueError):
        return False

    if any(start <= uid < end for _, start, end in assignments):
        return False
    own = {ACCOUNT, str(uid)}
    intervals = [(start, end) for owner, start, end in assignments if owner in own]
    ranges = []
    for line in (effective or "").splitlines():
        match = re.fullmatch(r"\d+: maple-vault ([1-9]\d*) ([1-9]\d*)", line)
        if not match:
            return False
        start, count = map(int, match.groups())
        ranges.append((start, start + count))
    if sorted(ranges) != sorted(intervals) or not any(end - start >= 65536 for start, end in intervals):
        return False
    for start, end in intervals:
        if start < 65536 or any(start <= host_id < end for host_id in host_ids):
            return False
        if sum(start < other_end and other_start < end
               for _, other_start, other_end in assignments) != 1:
            return False
    return True


def rootless_check(uid):
    users = pwd.getpwall()
    uid_ranges = command_output("getsubids", ACCOUNT)
    gid_ranges = command_output("getsubids", "-g", ACCOUNT)
    lingering = command_output("loginctl", "show-user", "--property=Linger", "--value", ACCOUNT)
    checks = {
        "subuid": safe_subids(Path("/etc/subuid"), uid_ranges, uid, {user.pw_uid for user in users}),
        "subgid": safe_subids(Path("/etc/subgid"), gid_ranges, uid,
                              {user.pw_gid for user in users} | {group.gr_gid for group in grp.getgrall()}),
        "linger": (lingering or "").strip() == "yes",
    }
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
    parser.add_argument("--graph-root", type=Path)
    parser.add_argument("--staging", type=Path)
    args = parser.parse_args()
    if not args.home.is_absolute() or not 1024 <= args.port <= 65535:
        parser.error("provide an absolute home and a port in 1024..65535")
    if args.uid is not None and not 1000 <= args.uid <= 60000:
        parser.error("UID must be in 1000..60000")
    try:
        disk = capacity(args.home, args.phase, args.reserve_bytes, args.graph_root, args.staging)
    except ValueError as error:
        parser.error(str(error))

    account = account_check(args.home, args.uid)
    checks = {
        "capacity": disk,
        "account": account,
        "tools": tools_check(),
        "rootless_account": rootless_check(args.uid) if account["ok"] else {"ok": False},
        "port": port_check(args.phase, args.port),
    }
    ok = all(check["ok"] for check in checks.values())
    print(json.dumps({"ok": ok, "phase": args.phase, **checks}, sort_keys=True))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
