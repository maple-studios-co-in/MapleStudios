#!/usr/bin/env python3
"""Run the dedicated Passbolt backup and retention job."""
import argparse
from contextlib import contextmanager
from dataclasses import dataclass
import datetime as dt
import fcntl
import hashlib
import io
import json
import os
from pathlib import Path
import re
import resource
import shlex
import secrets
import selectors
import shutil
import signal
import stat
import subprocess
import sys
import tarfile
import tempfile
import time

from render import (InvalidConfig, UNITS, private_dir, private_file, safe_path,
                    validate as validate_deployment)

HOME = Path("/home/maple-vault")
UID = 2010
APP, DB = "maple-vault-app", "maple-vault-db"
APP_UNIT = "vault.service"
APP_IMAGE = "docker.io/passbolt/passbolt@sha256:27e27a51bc3a9339cad638bcd0ca7dabc1b6956524aab89dfdd356c8ce61dd2d"
DB_IMAGE = "docker.io/library/mariadb@sha256:135c49b72e97143b73cc273dcdc95d2b035e3ebfbd536c3d72c65b715a8e06b5"
VOLUMES = {"systemd-vault": "/etc/passbolt/gpg", "systemd-vault-jwt": "/etc/passbolt/jwt",
           "systemd-vault-db": "/var/lib/mysql"}
CONFIG_MEMBERS = ("config/deploy.json", "config/app.env", "config/db.env",
                  *(f"units/{name}" for name in UNITS))
KEY_MEMBERS = {
    "gpg/serverkey.asc": "/etc/passbolt/gpg/serverkey.asc",
    "gpg/serverkey_private.asc": "/etc/passbolt/gpg/serverkey_private.asc",
    "jwt/jwt.key": "/etc/passbolt/jwt/jwt.key",
    "jwt/jwt.pem": "/etc/passbolt/jwt/jwt.pem",
}
TOOL_NAMES = ("age", "podman", "systemctl", "systemd-run", "rclone")
MACHINE_ID = re.compile(r"[a-f0-9]{32}")
SHA256 = re.compile(r"[a-f0-9]{64}")
GENERATION = re.compile(r"maple-vault-([a-f0-9]{24})-(\d{8}T\d{6}Z)-([a-f0-9]{16})\.tar\.age")
ARCHIVE_SCHEMA = "maple-vault-backup-v1"
MIB = 1 << 20
BASE_FREE = 20 << 30
SMALL_MAX = 128 * 1024
CATALOG_MAX = 4 * MIB
BLOCK = 1024 * 1024
HEADER = b"age-encryption.org/v1\n"
RESTART_TIMER = "maple-vault-backup-resume.timer"
CREDENTIAL = 'test -n "${MARIADB_ROOT_PASSWORD:-}" || exit 1; export MYSQL_PWD="$MARIADB_ROOT_PASSWORD"; '
SQL_CLIENT = "/usr/bin/mariadb --protocol=socket --user=root"
DUMP_CLIENT = ("/usr/bin/mariadb-dump --protocol=socket --user=root --single-transaction "
               "--quick --skip-lock-tables --hex-blob --routines --events --triggers --databases passbolt")
CHECK_ENGINES = ("SELECT IF(COUNT(*)>0 AND SUM(ENGINE IS NULL OR ENGINE <> 'InnoDB')=0,1,0) "
                 "FROM information_schema.TABLES WHERE TABLE_SCHEMA='passbolt' AND TABLE_TYPE='BASE TABLE';")


class JobError(Exception):
    """An error whose message can safely be written to the job status."""


def check(ok, reason):
    if not ok:
        raise JobError(reason)


def utc_now():
    return dt.datetime.now(dt.timezone.utc)


def machine_id():
    value = Path("/etc/machine-id").read_text(encoding="ascii").strip()
    check(MACHINE_ID.fullmatch(value) and value != "0" * 32, "invalid_machine_id")
    return value


def strict_json(data):
    def unique(pairs):
        value = dict(pairs)
        check(len(value) == len(pairs), "duplicate_json_fields")
        return value

    try:
        return json.loads(data, object_pairs_hook=unique)
    except (ValueError, UnicodeError, RecursionError):
        raise JobError("invalid_json") from None


def encoded(data):
    return (json.dumps(data, separators=(",", ":"), sort_keys=True) + "\n").encode()


def owned_fd(path, flags=os.O_RDONLY, mode=0o600):
    fd = os.open(path, flags | os.O_NOFOLLOW | os.O_NONBLOCK, mode)
    try:
        st = os.fstat(fd)
        check(stat.S_ISREG(st.st_mode) and st.st_uid == os.geteuid()
              and stat.S_IMODE(st.st_mode) in (0o400, 0o600)
              and st.st_nlink == 1, "unsafe_private_file")
        return fd
    except BaseException:
        os.close(fd)
        raise


def read_private(path, limit=SMALL_MAX):
    with os.fdopen(owned_fd(path), "rb") as src:
        data = src.read(limit + 1)
    check(0 < len(data) <= limit, "invalid_private_file_size")
    return data


def sync_dir(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def atomic_json(path, content):
    fd, name = tempfile.mkstemp(prefix=".writing-", dir=path.parent)
    tmp = Path(name)
    try:
        with os.fdopen(fd, "wb") as dst:
            dst.write(encoded(content))
            dst.flush()
            os.fsync(dst.fileno())
        if path.exists() or path.is_symlink():
            os.close(owned_fd(path))
        os.replace(tmp, path)
        sync_dir(path.parent)
    finally:
        tmp.unlink(missing_ok=True)


def exe(value):
    path = safe_path(value, "tool path")
    resolved = path.resolve(strict=True)
    check(resolved.is_file() and os.access(resolved, os.X_OK), "invalid_tool")
    return str(resolved)


def is_number(value, minimum, maximum):
    return type(value) is int and minimum <= value <= maximum


def matches(pattern, value):
    return isinstance(value, str) and re.fullmatch(pattern, value) is not None


def generation_date(name):
    m = GENERATION.fullmatch(name) if isinstance(name, str) else None
    check(m is not None, "invalid_generation")
    try:
        return dt.datetime.strptime(m[2], "%Y%m%dT%H%M%SZ").replace(tzinfo=dt.timezone.utc)
    except ValueError:
        raise JobError("invalid_generation") from None


def maximum_archive(max_sql):
    # SQL member headers and padding, bounded config/key members and age overhead.
    return max_sql + (1 + max_sql // BLOCK) * 1024 + (len(CONFIG_MEMBERS) + len(KEY_MEMBERS) + 4) * (SMALL_MAX + 1024)


@dataclass(frozen=True)
class Job:
    tools: dict
    home: Path
    sources: dict
    staging: Path
    journal: Path
    status: Path
    lock: Path
    recipient: str
    job_id: str
    source_machine_id: str
    rclone_config: Path
    remote: str
    max_sql_bytes: int
    reserve_bytes: int
    capture_seconds: int
    remote_seconds: int


def verify_drive(path, remote, folder):
    import configparser
    ini = configparser.ConfigParser(interpolation=None)
    try:
        ini.read_string(read_private(path).decode())
        check(not ini.defaults() and ini.sections() == [remote], "invalid_drive_remote")
        data = ini[remote]
        check(set(data) == {"type", "scope", "root_folder_id", "client_id", "client_secret", "token"}
              and data["type"] == "drive" and data["scope"] == "drive.file"
              and data["root_folder_id"] == folder
              and data["client_id"].endswith(".apps.googleusercontent.com")
              and bool(data["client_secret"])
              and isinstance(strict_json(data["token"]), dict), "invalid_drive_scope")
    except (UnicodeError, configparser.Error):
        raise JobError("invalid_drive_config") from None


def load_job(config):
    check(sys.platform == "linux" and os.geteuid() == UID, "dedicated_vault_account_required")
    private_dir(HOME, UID, "vault home")
    config = safe_path(config, "backup config")
    check(config.parent == HOME, "invalid_backup_config_location")
    raw = strict_json(read_private(config))
    fields = {"tools", "containers", "volumes", "deploy_config", "recipient", "job_id",
              "rclone_config", "remote", "folder_id", "staging", "journal", "status", "lock",
              "max_sql_bytes", "reserve_bytes", "capture_seconds", "remote_seconds"}
    check(isinstance(raw, dict) and raw.keys() == fields, "invalid_backup_config_fields")
    check(raw["containers"] == {"app": APP, "db": DB} and raw["volumes"] == VOLUMES,
          "invalid_source_allowlist")
    check(isinstance(raw["tools"], dict) and set(raw["tools"]) == set(TOOL_NAMES), "invalid_tools")
    tools = {name: exe(path) for name, path in raw["tools"].items()}
    check(matches(r"age1[023456789acdefghjklmnpqrstuvwxyz]{58}", raw["recipient"])
          and matches(r"[a-f0-9]{24}", raw["job_id"])
          and matches(r"[A-Za-z0-9_-]{12,128}", raw["folder_id"])
          and matches(r"[a-z][a-z0-9_-]{0,30}", raw["remote"]), "invalid_recipient_or_drive")
    for key, lo, hi in (("max_sql_bytes", MIB, 4 << 30), ("reserve_bytes", 1, 100 << 30),
                        ("capture_seconds", 30, 180), ("remote_seconds", 60, 1800)):
        check(is_number(raw[key], lo, hi), f"invalid_{key}")
    paths = {}
    for name in ("deploy_config", "rclone_config", "staging", "journal", "status", "lock"):
        path = safe_path(raw[name], name)
        check(path.parent == HOME and path not in (config, *paths.values()), "invalid_job_paths")
        paths[name] = path
    for name in ("staging", "journal"):
        private_dir(paths[name], UID, name)
        check(paths[name].stat().st_dev == HOME.stat().st_dev, "invalid_staging_filesystem")
    for name in ("status", "lock"):
        if paths[name].exists() or paths[name].is_symlink():
            os.close(owned_fd(paths[name]))

    deploy = paths["deploy_config"]
    opts, home = validate_deployment(deploy)
    check(home == HOME and opts["app_image"] == APP_IMAGE and opts["db_image"] == DB_IMAGE
          and opts["reserve_bytes"] == raw["reserve_bytes"], "invalid_deployment_binding")
    sources = {"config/deploy.json": deploy, "config/app.env": Path(opts["app_env"]),
               "config/db.env": Path(opts["db_env"])}
    for name in UNITS:
        unit_dir = ".config/systemd/user" if name == "vault.slice" else ".config/containers/systemd"
        sources[f"units/{name}"] = HOME / unit_dir / name
    check(len(set(sources.values())) == len(sources)
          and not set(sources.values()) & {config, *(v for k, v in paths.items() if k != "deploy_config")},
          "source_and_job_paths_overlap")
    for p in sources.values():
        private_file(p, UID, "backup source")
    verify_drive(paths["rclone_config"], raw["remote"], raw["folder_id"])
    return Job(tools, HOME, sources, paths["staging"], paths["journal"], paths["status"],
               paths["lock"], raw["recipient"], raw["job_id"], machine_id(), paths["rclone_config"],
               raw["remote"], raw["max_sql_bytes"], raw["reserve_bytes"], raw["capture_seconds"],
               raw["remote_seconds"])


@contextmanager
def handle_signals():
    def interrupted(_sig, _frame):
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        signal.signal(signal.SIGINT, signal.SIG_IGN)
        raise JobError("interrupted")

    previous = {sig: signal.signal(sig, interrupted) for sig in (signal.SIGINT, signal.SIGTERM)}
    try:
        yield
    finally:
        for sig, handler in previous.items():
            signal.signal(sig, handler)


def remaining(deadline):
    seconds = deadline - time.monotonic()
    check(seconds > 0, "deadline_exceeded")
    return seconds


class Pipe:
    """Deadline-bounded anonymous pipe adapter for tarfile and the vendor clients."""

    def __init__(self, stream, deadline):
        self.fd = stream.fileno()
        self.deadline = deadline
        os.set_blocking(self.fd, False)

    def ready(self, event):
        with selectors.DefaultSelector() as selector:
            selector.register(self.fd, event)
            check(selector.select(remaining(self.deadline)), "deadline_exceeded")

    def read(self, size):
        self.ready(selectors.EVENT_READ)
        return os.read(self.fd, size)

    def write(self, data):
        pending = memoryview(data)
        while pending:
            self.ready(selectors.EVENT_WRITE)
            pending = pending[os.write(self.fd, pending):]
        return len(data)


class Runner:
    def __init__(self):
        self.lock_fd = None

    def spawn(self, stage, args, *, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, pass_fds=()):
        env = {k: os.environ[k] for k in ("HOME", "XDG_RUNTIME_DIR", "DBUS_SESSION_BUS_ADDRESS",
                                          "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME") if k in os.environ}
        env.update({"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "LANG": "C", "TZ": "UTC"})
        if self.lock_fd is not None:
            pass_fds = (*pass_fds, self.lock_fd)
        return subprocess.Popen(args, stdin=stdin, stdout=stdout, stderr=subprocess.DEVNULL,
                                env=env, pass_fds=pass_fds, start_new_session=True)


def wait(proc, deadline, stage):
    try:
        check(proc.wait(timeout=remaining(deadline)) == 0, stage)
    except subprocess.TimeoutExpired:
        raise JobError(stage + "_timeout") from None


@contextmanager
def child(runner, stage, args, **kwargs):
    proc = None
    # A termination between Popen and registering the child could otherwise leave an orphan.
    suspended = signal.pthread_sigmask(signal.SIG_BLOCK, {signal.SIGTERM, signal.SIGINT})
    try:
        proc = runner.spawn(stage, args, **kwargs)
    finally:
        try:
            signal.pthread_sigmask(signal.SIG_SETMASK, suspended)
            if proc is not None:
                yield proc
        finally:
            if proc is not None:
                if proc.poll() is None:
                    try:
                        os.killpg(proc.pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                    except PermissionError:
                        # Darwin can return EPERM for a process group whose last member
                        # exited between poll() and killpg(). Reap that exact child.
                        proc.kill()
                    try:
                        proc.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        raise JobError("child_cleanup_timeout") from None
                for stream in (proc.stdin, proc.stdout):
                    if stream is not None:
                        stream.close()


def collect(runner, stage, args, deadline, limit=SMALL_MAX, *, digest=False):
    with child(runner, stage, args) as proc:
        stream = Pipe(proc.stdout, deadline)
        output = bytearray()
        sha = hashlib.sha256()
        count = 0
        while block := stream.read(min(BLOCK, limit + 1 - count)):
            count += len(block)
            check(count <= limit, stage + "_size")
            if digest:
                sha.update(block)
            else:
                output.extend(block)
        wait(proc, deadline, stage)
    return (count, sha.hexdigest()) if digest else bytes(output)


def simple(runner, stage, args, deadline):
    with child(runner, stage, args, stdout=subprocess.DEVNULL) as proc:
        wait(proc, deadline, stage)


def add(tar, name, content):
    entry = tarfile.TarInfo(name)
    entry.size = len(content)
    entry.mode = 0o600
    tar.addfile(entry, io.BytesIO(content))


def capture(job, runner, file, generation):
    podman, systemctl = (job.tools[k] for k in ("podman", "systemctl"))
    graphroot = verify_sources(job, runner)
    end = time.monotonic() + job.capture_seconds
    # Escape hatch if the coordinator is killed after requesting the stop. It starts the same
    # reviewed unit only. Its deadline exceeds the entire capture and synchronous recovery budget.
    simple(runner, "arm-resume", [job.tools["systemd-run"], "--user", "--collect",
           "--unit=maple-vault-backup-resume", f"--on-active={job.capture_seconds + 155}s",
           "--timer-property=AccuracySec=1s", systemctl, "--user", "start", APP_UNIT], end)
    try:
        simple(runner, "stop-app", [systemctl, "--user", "stop", APP_UNIT], end)
        check(not collect(runner, "app-stopped", [podman, "ps", "--filter", f"name=^{APP}$",
                                                 "--format", "{{.Names}}"], end).strip(), "vault_still_running")
        opts = [podman, "exec", DB, "/bin/sh", "-ec"]
        engines = collect(runner, "engine-check", [*opts, CREDENTIAL + SQL_CLIENT
                          + " --batch --skip-column-names --execute " + shlex.quote(CHECK_ENGINES)], end)
        check(engines.strip() == b"1", "unsupported_database_engines")
        with child(runner, "encrypt", [job.tools["age"], "-r", job.recipient],
                   stdin=subprocess.PIPE, stdout=file) as age:
            with tarfile.open(mode="w|", format=tarfile.USTAR_FORMAT,
                              fileobj=Pipe(age.stdin, end)) as tar:
                for name, path in job.sources.items():
                    add(tar, name, read_private(path))
                key_volumes = {v: k for k, v in VOLUMES.items()}
                for name, path in KEY_MEMBERS.items():
                    key = Path(path)
                    volume = key_volumes[str(key.parent)]
                    key_path = graphroot / "volumes" / volume / "_data" / key.name
                    data = collect(runner, "keys",
                                   [podman, "unshare", "/bin/sh", "-ec",
                                    'test "$(readlink -f -- "$1")" = "$1" && test -f "$1" '
                                    '&& test ! -L "$1" && exec /usr/bin/cat -- "$1"',
                                    "vault-key", str(key_path)], end)
                    check(data, "empty_key")
                    add(tar, name, data)
                count = size = 0
                with child(runner, "dump", [*opts, CREDENTIAL + "exec " + DUMP_CLIENT]) as dump:
                    stream = Pipe(dump.stdout, end)
                    # Fill each bounded chunk so the amount of archive overhead does not depend on
                    # how frequently the producer flushes its pipe.
                    while True:
                        chunk = bytearray()
                        while len(chunk) < BLOCK:
                            piece = stream.read(BLOCK - len(chunk))
                            if not piece:
                                break
                            chunk.extend(piece)
                            check(size + len(chunk) <= job.max_sql_bytes, "sql_size_limit")
                        if not chunk:
                            break
                        add(tar, f"sql/{count:06d}", chunk)
                        count += 1
                        size += len(chunk)
                    wait(dump, end, "dump")
                check(count > 0, "empty_dump")
                add(tar, "manifest.json", encoded(manifest(job.source_machine_id, generation, count, size)))
            age.stdin.close()
            wait(age, end, "encrypt")
        file.flush()
        os.fsync(file.fileno())
    finally:
        recovery_end = time.monotonic() + 140
        simple(runner, "resume-app", [systemctl, "--user", "start", APP_UNIT], recovery_end)
        simple(runner, "app-resumed", [systemctl, "--user", "is-active", "--quiet", APP_UNIT],
               recovery_end)
        simple(runner, "disarm-resume", [systemctl, "--user", "stop", RESTART_TIMER], recovery_end)


def verify_sources(job, runner):
    end = time.monotonic() + 15
    for stage, unit in (("app-active", APP_UNIT), ("db-active", "vault-db.service")):
        simple(runner, stage, [job.tools["systemctl"], "--user", "is-active", "--quiet", unit], end)
    podman = job.tools["podman"]
    info = collect(runner, "vault-storage", [podman, "info", "--format",
                   "{{.Host.Security.Rootless}}\n{{.Store.GraphRoot}}"], end).decode().splitlines()
    check(len(info) == 2 and info[0] == "true", "rootless_storage_required")
    try:
        graphroot = safe_path(info[1], "graphroot")
    except InvalidConfig:
        raise JobError("invalid_graphroot") from None
    check(graphroot != job.home and graphroot.is_relative_to(job.home)
          and graphroot.resolve(strict=True) == graphroot
          and graphroot.stat().st_dev == job.staging.stat().st_dev, "unexpected_graphroot")
    # Match exact images and both named mounts and actual source paths. Never inspect the
    # container's complete configuration, because that includes the credential environment.
    for name, image, expected in ((APP, APP_IMAGE, dict(list(VOLUMES.items())[:2])),
                                  (DB, DB_IMAGE, {"systemd-vault-db": "/var/lib/mysql"})):
        actual = collect(runner, "inspect-image", [podman, "inspect", "--type=container",
                         "--format", "{{.Image}}", name], end).strip()
        exact = collect(runner, "pinned-image", [podman, "image", "inspect",
                        "--format", "{{.Id}}", image], end).strip()
        check(actual and actual.removeprefix(b"sha256:") == exact.removeprefix(b"sha256:"), "image_drift")
        data = strict_json(collect(runner, "inspect-mounts", [podman, "inspect", "--type=container",
                                   "--format", "{{json .Mounts}}", name], end))
        check(isinstance(data, list) and all(isinstance(entry, dict) and entry.get("Type") == "volume"
              and isinstance(entry.get("Name"), str) for entry in data) and len(data) == len(expected)
              and {entry.get("Name"): entry.get("Destination") for entry in data} == expected
              and all(entry.get("Source") == str(graphroot / "volumes" / entry["Name"] / "_data")
                      for entry in data), "mount_drift")
    return graphroot


def manifest(source, generation, chunks, size):
    return {"schema": ARCHIVE_SCHEMA, "source_machine_id": source, "generation": generation,
            "app_image": APP_IMAGE, "db_image": DB_IMAGE, "sql_chunks": chunks, "sql_bytes": size,
            "tls_recovery": "reissue-certificate-using-deploy-config"}


def file_hash(file, maximum):
    sha = hashlib.sha256()
    size = 0
    while block := file.read(BLOCK):
        size += len(block)
        check(size <= maximum, "ciphertext_size_limit")
        sha.update(block)
    return size, sha.hexdigest()


class Drive:
    def __init__(self, job, runner, deadline):
        self.job, self.runner, self.deadline = job, runner, deadline

    def args(self, *args):
        return [self.job.tools["rclone"], "--config", str(self.job.rclone_config),
                "--retries", "1", "--low-level-retries", "2", "--contimeout", "15s", "--timeout", "45s",
                "--drive-skip-shortcuts", "--drive-skip-gdocs", "--drive-use-trash=false", *args]

    def remote(self, name=""):
        return f"{self.job.remote}:{name}"

    def catalog(self):
        data = strict_json(collect(self.runner, "catalog",
                                  self.args("lsjson", "--max-depth", "1", self.remote()),
                                  self.deadline, CATALOG_MAX))
        check(isinstance(data, list) and all(isinstance(x, dict) for x in data), "invalid_drive_catalog")
        return data

    @staticmethod
    def object(items, name, size):
        candidates = [entry for entry in items if entry.get("Path") == name or entry.get("Name") == name]
        if not candidates:
            return None
        check(len(candidates) == 1, "ambiguous_drive_object")
        info = candidates[0]
        check(info.get("Path") == info.get("Name") == name and info.get("IsDir") is False
              and info.get("Size") == size and matches(r"[A-Za-z0-9_-]{2,200}", info.get("ID"))
              and not info.get("OrigID") and isinstance(info.get("MimeType"), str)
              and not info["MimeType"].startswith("application/vnd.google-apps."), "unexpected_drive_object")
        return info["ID"]

    def verify(self, receipt):
        name = receipt["generation"]
        item_id = self.object(self.catalog(), name, receipt["bytes"])
        check(item_id is not None and receipt["drive_id"] in (None, item_id), "drive_object_identity")
        observed = collect(self.runner, "download", self.args("cat", self.remote(name)), self.deadline,
                           receipt["bytes"], digest=True)
        check(observed == (receipt["bytes"], receipt["sha256"]), "drive_hash_mismatch")
        check(self.object(self.catalog(), name, receipt["bytes"]) == item_id, "drive_object_changed")
        return item_id

    def upload(self, file, receipt):
        name = receipt["generation"]
        check(self.object(self.catalog(), name, receipt["bytes"]) is None, "drive_generation_collision")
        simple(self.runner, "upload", self.args("copyto", "--immutable", str(file), self.remote(name)),
               self.deadline)
        return self.verify(receipt)

    def delete(self, receipt):
        name = receipt["generation"]
        self.verify(receipt)
        simple(self.runner, "expire", self.args("deletefile", self.remote(name)), self.deadline)
        check(self.object(self.catalog(), name, receipt["bytes"]) is None, "expiry_unconfirmed")


def expire(job, drive, now):
    paths = list(job.journal.iterdir())
    check(len(paths) <= 2048, "retention_journal_limit")
    overdue = False
    for p in sorted(paths):
        # Interrupted atomic writes and unrelated entries cannot identify remote objects.
        name = p.name.removesuffix(".json")
        if not p.name.endswith(".json") or not GENERATION.fullmatch(name):
            continue
        check(GENERATION.fullmatch(name)[1] == job.job_id, "retention_job_mismatch")
        receipt = strict_json(read_private(p))
        check(isinstance(receipt, dict) and receipt.keys() == {"generation", "bytes", "sha256", "drive_id"}
              and receipt["generation"] == name and matches(SHA256, receipt["sha256"])
              and is_number(receipt["bytes"], len(HEADER) + 1, maximum_archive(job.max_sql_bytes))
              and (receipt["drive_id"] is None or matches(r"[A-Za-z0-9_-]{2,200}", receipt["drive_id"])),
              "invalid_retention_receipt")
        age = now - generation_date(name)
        if age < dt.timedelta(days=29):
            continue
        if drive.object(drive.catalog(), name, receipt["bytes"]) is not None:
            overdue |= age >= dt.timedelta(days=30)
            drive.delete(receipt)
        p.unlink()
        sync_dir(job.journal)
    check(not overdue, "retention_overdue")


@contextmanager
def lock_job(path):
    fd = owned_fd(path, os.O_CREAT | os.O_RDWR)
    try:
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise JobError("job_collision") from None
        yield fd
    finally:
        os.close(fd)


def run_job(job, runner, *, now=utc_now, expiry_only=False):
    try:
        with lock_job(job.lock) as fd:
            runner.lock_fd = fd
            try:
                return run_locked(job, runner, now, expiry_only)
            finally:
                runner.lock_fd = None
    except (JobError, OSError):
        return False


def run_locked(job, runner, now, expiry_only):
    previous = None
    started = now()
    if job.status.exists() or job.status.is_symlink():
        status = strict_json(read_private(job.status))
        check(isinstance(status, dict) and "last_success" in status, "invalid_status")
        previous = status["last_success"]
    write_status = lambda state, success, error=None: atomic_json(job.status, {
        "state": state, "started_at": started.isoformat(), "updated_at": now().isoformat(),
        "last_success": success, "error": error,
    })
    write_status("running", previous)
    partial = job.staging / "vault-capture.partial"
    owned_partial = False
    try:
        if partial.exists() or partial.is_symlink():
            os.close(owned_fd(partial))
            partial.unlink()
        expire(job, Drive(job, runner, time.monotonic() + job.remote_seconds), now())
        if expiry_only:
            write_status("expiry_ok", previous)
            return True
        bound = maximum_archive(job.max_sql_bytes)
        check(shutil.disk_usage(job.staging)[2] >= BASE_FREE + job.reserve_bytes + bound, "insufficient_space")
        timestamp = started.strftime("%Y%m%dT%H%M%SZ")
        name = f"maple-vault-{job.job_id}-{timestamp}-{secrets.token_hex(8)}.tar.age"
        receipt_path = job.journal / (name + ".json")
        check(not receipt_path.exists() and not receipt_path.is_symlink(), "local_generation_collision")
        with os.fdopen(owned_fd(partial, os.O_CREAT | os.O_EXCL | os.O_RDWR), "w+b") as outfile:
            owned_partial = True
            capture(job, runner, outfile, name)
            outfile.seek(0)
            check(outfile.read(len(HEADER)) == HEADER, "missing_age_header")
            outfile.seek(0)
            size, sha = file_hash(outfile, bound)
        receipt = {"generation": name, "bytes": size, "sha256": sha, "drive_id": None}
        # Journal the attempted name before upload so an interrupted upload cannot escape retention.
        atomic_json(receipt_path, receipt)
        drive = Drive(job, runner, time.monotonic() + job.remote_seconds)
        receipt["drive_id"] = drive.upload(partial, receipt)
        atomic_json(receipt_path, receipt)
        partial.unlink()
        owned_partial = False
        write_status("ok", receipt | {"verified_at": now().isoformat(), "source_machine_id": job.source_machine_id})
        return True
    except (JobError, OSError, ValueError, tarfile.TarError) as error:
        label = str(error) if isinstance(error, JobError) else "local_io_or_archive_error"
        try:
            write_status("failed", previous, label)
        except (JobError, OSError):
            pass
        return False
    finally:
        if owned_partial:
            partial.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", required=True)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--verify-config", action="store_true")
    modes.add_argument("--expire-only", action="store_true")
    args = parser.parse_args()
    os.umask(0o077)
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    with handle_signals():
        try:
            job = load_job(args.config)
            if args.verify_config:
                simple(Runner(), "invalid_age_recipient", [job.tools["age"], "-r", job.recipient],
                       time.monotonic() + 5)
                print('{"config":"valid"}')
                return 0
            if run_job(job, Runner(), expiry_only=args.expire_only):
                return 0
        except (JobError, InvalidConfig, OSError, ValueError):
            pass
    print("Vault job failed; check the protected job status and user unit state.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
