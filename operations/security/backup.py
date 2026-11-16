#!/usr/bin/env python3
"""Create, remotely verify, and expire private age-encrypted Maple backups."""
import argparse
import configparser
import contextlib
import dataclasses
import fcntl
import hashlib
import io
import json
import os
import re
import resource
import selectors
import secrets
import shutil
import signal
import stat
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

WEB = "maple-studios-web"
API = "maple-studios-api"
APPS = (WEB, API)
HEALTH = {WEB: "http://127.0.0.1:3006/", API: "http://127.0.0.1:4006/readyz"}
RETENTION = timedelta(days=30)
EXPIRY_AGE = RETENTION - timedelta(days=1)
MAX_STATUS_AGE = timedelta(hours=26)
ARCHIVES = ("database.age", "files.tar.age")
METADATA = ("pending.json", "manifest.json")
META_TEMP = {name: f".{name}.tmp" for name in METADATA}
MANIFEST_LIMIT = 8192
JSON_LIMIT = 4 * 1024 * 1024
TOOLS = ("age", "git", "mongodump", "mongosh", "pm2", "rclone", "timeout")
STAMP = "%Y%m%dT%H%M%SZ"
GENERATION = re.compile(r"[0-9]{8}T[0-9]{6}Z-[a-f0-9]{32}")
SAFE_LABEL = re.compile(r"[a-zA-Z0-9_-]{1,64}")
SHA256 = re.compile(r"[a-f0-9]{64}")
CODES = {
    "app_state", "backup_interrupted", "backup_stale", "command_failed", "command_timeout",
    "config_invalid", "disk_low", "drive_invalid", "drive_quota", "expiry_failed",
    "internal_error", "maintenance_interrupted", "recovery_failed", "retention_overdue", "snapshot_failed",
    "upload_failed", "upload_mismatch",
}


class JobError(Exception):
    """Safe operational code only. Never publish provider/tool error text."""


class Interrupted(JobError):
    def __init__(self):
        super().__init__("backup_interrupted")


def terminate(_signum, _frame):
    # A second TERM must not interrupt PM2 recovery or child reaping.
    signal.signal(signal.SIGTERM, signal.SIG_IGN)
    signal.signal(signal.SIGINT, signal.SIG_IGN)
    raise Interrupted()


def utc_now():
    return datetime.now(timezone.utc)


def timestamp(point):
    return point.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def datetime_value(value):
    if not isinstance(value, str):
        raise ValueError("timestamp")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("timezone")
    return parsed.astimezone(timezone.utc)


def decode_json(content):
    def unique(pairs):
        result = dict(pairs)
        if len(pairs) != len(result):
            raise ValueError("duplicate keys")
        return result

    return json.loads(content, object_pairs_hook=unique, parse_constant=lambda _: _bad_json())


def _bad_json():
    raise ValueError("invalid JSON constant")


def json_bytes(value):
    return (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()


def resolved_path(value, *, required=True):
    if not isinstance(value, str) or not value or any(ord(char) < 32 for char in value):
        raise JobError("config_invalid")
    path = Path(value)
    # Literal canonical paths keep overlap, symlink and sensitive exclusions auditable.
    if not path.is_absolute() or path == Path("/") or path.resolve(strict=required) != path:
        raise JobError("config_invalid")
    return path


def private_dir(path):
    info = path.stat()
    if path.is_symlink() or not stat.S_ISDIR(info.st_mode) or info.st_uid != os.geteuid() or info.st_mode & 0o077:
        raise JobError("config_invalid")
    return path


def private_read(path, limit=JSON_LIMIT, *, group_read=False):
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK), "rb") as source:
        info = os.fstat(source.fileno())
        disallowed = 0o137 if group_read else 0o177
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or info.st_mode & disallowed or info.st_nlink != 1:
            raise JobError("config_invalid")
        raw = source.read(limit + 1)
        if len(raw) > limit:
            raise JobError("config_invalid")
        return raw


def sync_dir(path):
    fd = os.open(path, os.O_DIRECTORY | os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def atomic_json(path, value, *, generation_file=False):
    if generation_file:
        name = path.parent / META_TEMP[path.name]
        fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    else:
        fd, name = tempfile.mkstemp(prefix=".tmp-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as out:
            out.write(json_bytes(value))
            out.flush()
            os.fsync(out.fileno())
        os.replace(name, path)
        sync_dir(path.parent)
    finally:
        Path(name).unlink(missing_ok=True)


@contextlib.contextmanager
def lock(path):
    fd = os.open(path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW | os.O_NONBLOCK, 0o600)
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or info.st_nlink != 1 or info.st_mode & 0o177:
            raise JobError("config_invalid")
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            yield None
        else:
            # Closing, rather than explicitly unlocking, lets a running child retain
            # the flock if the coordinator was killed during an external command.
            yield fd
    finally:
        os.close(fd)


@dataclasses.dataclass(frozen=True)
class Config:
    settings_path: Path
    deploy_lock: Path
    output_dir: Path
    status_path: Path
    revision_dir: Path
    tools: dict
    pm2_home: Path
    recipient: str
    rclone_config: Path
    rclone_remote: str
    folder_id: str
    job_id: str
    mongo_config: Path
    database: str
    sources: dict
    excluded_paths: list
    maintenance_seconds: int
    transfer_seconds: int
    minimum_free_bytes: int
    alert: dict

    @property
    def run_lock(self):
        return self.output_dir / ".job.lock"

    @property
    def journal_path(self):
        return self.deploy_lock.with_name(self.deploy_lock.name + ".recovery.json")

    @property
    def alert_path(self):
        return self.status_path.with_name(self.status_path.name + ".alerts.json")

    @property
    def exclusions(self):
        return (*self.excluded_paths, self.settings_path.parent, self.mongo_config,
                self.rclone_config.parent, self.output_dir, self.status_path.parent,
                self.deploy_lock.parent, self.pm2_home, Path(self.alert["key_file"]))


def valid_str(pattern, value):
    return isinstance(value, str) and re.fullmatch(pattern, value) is not None


def verify_drive_config(cfg):
    ini = configparser.ConfigParser(interpolation=None)
    ini.read_string(private_read(cfg.rclone_config, 65536).decode())
    remote = ini[cfg.rclone_remote]
    allowed = {"type", "scope", "root_folder_id", "client_id", "client_secret", "token", "use_trash", "skip_shortcuts"}
    if (ini.defaults() or ini.sections() != [cfg.rclone_remote] or not set(remote) <= allowed
            or remote.get("type") != "drive" or remote.get("scope") != "drive.file"
            or remote.get("root_folder_id") != cfg.folder_id
            or not valid_str(r"[A-Za-z0-9_-]+\.apps\.googleusercontent\.com", remote.get("client_id"))
            or remote.get("client_id", "").startswith(("202264815644.", "202264815644-"))
            or not remote.get("client_secret") or remote.get("use_trash", "false") != "false"
            or remote.get("skip_shortcuts", "true") != "true"):
        raise JobError("drive_invalid")
    token = decode_json(remote.get("token", "{}"))
    if not isinstance(token, dict) or not isinstance(token.get("refresh_token"), str) or not token["refresh_token"]:
        raise JobError("drive_invalid")


def load_config(config_path, *, check_credentials=True, recovery_only=False):
    try:
        path = resolved_path(str(config_path))
        private_dir(path.parent)
        data = decode_json(private_read(path, 32768))
        if set(data) != {field.name for field in dataclasses.fields(Config)} - {"settings_path"}:
            raise JobError("config_invalid")
        for name in ("deploy_lock", "status_path"):
            data[name] = resolved_path(data[name], required=False)
            private_dir(data[name].parent)
        for name in ("output_dir", "revision_dir", "pm2_home", "mongo_config", "rclone_config"):
            necessary = name in ("output_dir", "pm2_home") or (not recovery_only and name == "revision_dir")
            data[name] = resolved_path(data[name], required=check_credentials or necessary)
        if not data["pm2_home"].is_dir() or (not recovery_only and not data["revision_dir"].is_dir()):
            raise JobError("config_invalid")
        private_dir(data["output_dir"])
        if not recovery_only:
            private_dir(data["mongo_config"].parent)
            private_dir(data["rclone_config"].parent)
        required_tools = {"pm2", "timeout"} if recovery_only else set(TOOLS)
        if (not isinstance(data["tools"], dict) or set(data["tools"]) != set(TOOLS)
                or any(not isinstance(tool, str) or not os.path.isabs(tool) or
                       (name in required_tools and (not os.path.isfile(tool) or not os.access(tool, os.X_OK)))
                       for name, tool in data["tools"].items())):
            raise JobError("config_invalid")
        if (not valid_str(r"age1(?:[023456789acdefghjklmnpqrstuvwxyz]{58}|pq1[023456789acdefghjklmnpqrstuvwxyz]{1800,2300})", data["recipient"])
                or not valid_str(r"[a-f0-9]{32}", data["job_id"])
                or not valid_str(r"[A-Za-z0-9_-]{8,128}", data["folder_id"])
                or not valid_str(SAFE_LABEL, data["rclone_remote"])
                or not valid_str(SAFE_LABEL, data["database"])
                or data["database"] in ("admin", "config", "local")):
            raise JobError("config_invalid")
        if (not isinstance(data["sources"], dict) or not data["sources"] or len(data["sources"]) > 32
                or any(not valid_str(SAFE_LABEL, name) for name in data["sources"])):
            raise JobError("config_invalid")
        data["sources"] = {name: resolved_path(source, required=not recovery_only)
                           for name, source in data["sources"].items()}
        if not isinstance(data["excluded_paths"], list):
            raise JobError("config_invalid")
        data["excluded_paths"] = [resolved_path(source, required=False) for source in data["excluded_paths"]]
        for name, lower, upper in (("maintenance_seconds", 15, 180), ("transfer_seconds", 15, 1800),
                                   ("minimum_free_bytes", 1, 2**50)):
            if type(data[name]) is not int or not lower <= data[name] <= upper:
                raise JobError("config_invalid")
        alert = data["alert"]
        if (not isinstance(alert, dict) or set(alert) != {"from", "to", "key_file"}
                or not valid_str(r"[^@\s,<>]+@[^@\s,<>]+\.[^@\s,<>]+", alert["to"])
                or not isinstance(alert["from"], str) or not alert["from"] or len(alert["from"]) > 254
                or any(ord(char) < 32 for char in alert["from"])):
            raise JobError("config_invalid")
        key = resolved_path(alert["key_file"], required=check_credentials)
        if not recovery_only:
            private_dir(key.parent)
        if check_credentials and not valid_str(r"re_[A-Za-z0-9_-]{8,}", private_read(key, 1024).decode().strip()):
            raise JobError("config_invalid")
        cfg = Config(settings_path=path, **data)
        protected = (cfg.output_dir, cfg.pm2_home, cfg.settings_path.parent, cfg.status_path.parent,
                     cfg.deploy_lock.parent, cfg.mongo_config.parent, cfg.rclone_config.parent, key.parent)
        for source in cfg.sources.values():
            # Permit a source ancestor only for individually configured non-secret exclusions.
            if any(source.is_relative_to(item) or item.is_relative_to(source) for item in protected):
                raise JobError("config_invalid")
            if any(source.is_relative_to(item) for item in cfg.excluded_paths):
                raise JobError("config_invalid")
            if not recovery_only:
                info = source.lstat()
                if not (stat.S_ISREG(info.st_mode) or stat.S_ISDIR(info.st_mode)):
                    raise JobError("config_invalid")
        if check_credentials:
            verify_mongo_config(cfg)
            verify_drive_config(cfg)
        return cfg
    except JobError:
        raise
    except (OSError, KeyError, TypeError, ValueError, configparser.Error):
        raise JobError("config_invalid") from None


def verify_mongo_config(cfg):
    data = decode_json(private_read(cfg.mongo_config, 8192))
    if not isinstance(data, dict) or set(data) != {"uri"}:
        raise JobError("config_invalid")
    uri = urllib.parse.urlsplit(data["uri"])
    if (uri.scheme != "mongodb" or uri.hostname not in ("127.0.0.1", "::1") or uri.port != 27017
            or uri.path != "/" + cfg.database or uri.fragment):
        raise JobError("config_invalid")
    query = urllib.parse.parse_qs(uri.query)
    if (set(query) - {"authSource", "authMechanism", "directConnection"}
            or any(len(values) != 1 for values in query.values())
            or query.get("authMechanism", ["SCRAM-SHA-256"])[0] not in ("SCRAM-SHA-1", "SCRAM-SHA-256")
            or query.get("directConnection", ["true"])[0] != "true"):
        raise JobError("config_invalid")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class Runner:
    """Run argument vectors, bound children, and never persist command stdout/stderr."""

    def __init__(self, cfg=None):
        self.timeout_tool = cfg.tools["timeout"] if cfg else None
        self.inherited = ()
        self.env = {key: os.environ[key] for key in ("HOME", "PATH", "LANG", "LC_ALL") if key in os.environ}
        if cfg:
            self.env["PM2_HOME"] = str(cfg.pm2_home)

    def spawn(self, args, *, timeout, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL):
        if timeout <= 0:
            raise JobError("command_timeout")
        if self.timeout_tool:
            args = [self.timeout_tool, "--kill-after=2s", f"{timeout:.3f}s", *args]
        try:
            return subprocess.Popen(args, stdin=stdin, stdout=stdout, stderr=subprocess.DEVNULL,
                                    env=self.env, start_new_session=True, pass_fds=self.inherited)
        except OSError:
            raise JobError("command_failed") from None

    @staticmethod
    def finish(children):
        for child in children:
            if child.poll() is None:
                try:
                    os.killpg(child.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
        for child in children:
            child.wait()
            for stream in (child.stdin, child.stdout):
                if stream:
                    stream.close()

    @staticmethod
    def wait(child, deadline):
        try:
            returncode = child.wait(timeout=max(0, deadline - time.monotonic()))
        except subprocess.TimeoutExpired:
            raise JobError("command_timeout") from None
        if returncode != 0:
            raise JobError("command_timeout" if returncode in (124, 137) else "command_failed")

    def run(self, args, *, timeout, limit=1024 * 1024, hash_output=False):
        end = time.monotonic() + timeout
        child = self.spawn(args, timeout=timeout, stdout=subprocess.PIPE)
        raw = bytearray()
        sha = hashlib.sha256()
        size = 0
        try:
            with selectors.DefaultSelector() as selector:
                selector.register(child.stdout, selectors.EVENT_READ)
                while True:
                    wait = end - time.monotonic()
                    if wait <= 0 or not selector.select(wait):
                        raise JobError("command_timeout")
                    chunk = os.read(child.stdout.fileno(), 256 * 1024)
                    if not chunk:
                        break
                    size += len(chunk)
                    if size > limit:
                        raise JobError("command_failed")
                    if hash_output:
                        sha.update(chunk)
                    else:
                        raw.extend(chunk)
            self.wait(child, end)
            return (size, sha.hexdigest()) if hash_output else bytes(raw)
        finally:
            self.finish([child])

    def chain(self, commands, *, timeout, output=None, input_data=None):
        end = time.monotonic() + timeout
        children = []
        try:
            for index, args in enumerate(commands):
                stdin = children[-1].stdout if index else (subprocess.PIPE if input_data is not None else subprocess.DEVNULL)
                stdout = (output if output is not None else subprocess.DEVNULL) if index == len(commands) - 1 else subprocess.PIPE
                children.append(self.spawn(args, timeout=end - time.monotonic(), stdin=stdin, stdout=stdout))
                if index:
                    children[-2].stdout.close()
            if input_data is not None:
                try:
                    children[0].communicate(input=input_data, timeout=max(0, end - time.monotonic())) if len(children) == 1 else self.feed(children[0], input_data, end)
                except (BrokenPipeError, subprocess.TimeoutExpired):
                    raise JobError("command_failed") from None
            for child in reversed(children):
                self.wait(child, end)
        finally:
            self.finish(children)

    @staticmethod
    def feed(child, data, deadline):
        Runner.put(child.stdin.fileno(), data, deadline)
        child.stdin.close()

    @staticmethod
    def put(fd, data, deadline):
        os.set_blocking(fd, False)
        remaining = memoryview(data)
        with selectors.DefaultSelector() as selector:
            selector.register(fd, selectors.EVENT_WRITE)
            while remaining:
                wait = deadline - time.monotonic()
                if wait <= 0 or not selector.select(wait):
                    raise JobError("command_timeout")
                try:
                    remaining = remaining[os.write(fd, remaining):]
                except BlockingIOError:
                    continue

    @staticmethod
    def probe(app, timeout):
        try:
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
            with opener.open(HEALTH[app], timeout=timeout) as response:
                return response.status == 200 and response.url == HEALTH[app]
        except (OSError, ValueError):
            return False


def remaining(end):
    seconds = end - time.monotonic()
    if seconds <= 0:
        raise JobError("command_timeout")
    return seconds


class MapleApps:
    def __init__(self, cfg, runner):
        self.cfg, self.runner = cfg, runner

    def command(self, *args, end):
        return self.runner.run([self.cfg.tools["pm2"], *args], timeout=min(12, remaining(end)), limit=8 * 1024 * 1024)

    def states(self, end):
        states = {}
        for app in decode_json(self.command("jlist", end=end)):
            if app.get("name") in APPS:
                name = app["name"]
                if name in states:
                    raise JobError("app_state")
                states[name] = app["pm2_env"]["status"]
        if set(states) != set(APPS):
            raise JobError("app_state")
        return states

    def pause(self, end):
        states = self.states(end)
        if set(states.values()) - {"stopped", "online"} or "online" not in states.values():
            raise JobError("app_state")
        online = [name for name in APPS if states[name] == "online"]
        atomic_json(self.cfg.journal_path, {"version": 1, "online": online})
        # Stop the web entry point first, then the API and its in-process scheduler.
        for name in online:
            self.command("stop", name, end=end)
        if any(status != "stopped" for status in self.states(end).values()):
            raise JobError("app_state")

    def recover(self):
        try:
            journal = decode_json(private_read(self.cfg.journal_path, 1024))
        except FileNotFoundError:
            return False
        if (not isinstance(journal, dict) or set(journal) != {"version", "online"} or journal["version"] != 1
                or not isinstance(journal["online"], list) or not journal["online"]
                or any(name not in APPS for name in journal["online"])
                or len(set(journal["online"])) != len(journal["online"])):
            raise JobError("recovery_failed")
        end = time.monotonic() + 60
        failed = False
        # Restart the API first; attempt both applications even if one command fails.
        for name in reversed(APPS):
            if name not in journal["online"]:
                continue
            try:
                if self.states(end)[name] not in {"online", "launching"}:
                    self.command("restart", name, end=end)
            except (JobError, KeyError, ValueError, TypeError, OSError):
                failed = True
        if failed:
            raise JobError("recovery_failed")
        while True:
            try:
                states = self.states(end)
                if all(states[name] == "online" and self.runner.probe(name, min(3, remaining(end)))
                       for name in journal["online"]):
                    break
                time.sleep(min(1, remaining(end)))
            except (JobError, KeyError, ValueError, TypeError, OSError):
                raise JobError("recovery_failed") from None
        self.cfg.journal_path.unlink()
        sync_dir(self.cfg.deploy_lock.parent)
        return True


# Executed via mongosh --nodb; the credential is read from a protected file, not argv.
# Sorted _id order and canonical Extended JSON make the full document fingerprints
# independent of physical storage. Index key order is retained (compound indexes).
MONGO_SUMMARY = """
const fs = require('fs');
const crypto = require('crypto');
const db = new Mongo(REPLACE_URI).getDB(REPLACE_DB);
const sets = db.getCollectionInfos().sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
const results = [];
for (const c of sets) {
  if (c.name.startsWith('system.') || c.type !== 'collection') throw new Error('unsupported collection');
  const col = db.getCollection(c.name);
  const digest = crypto.createHash('sha256');
  let count = 0;
  col.find().collation({locale:'simple'}).sort({_id:1}).forEach(doc => {
    digest.update(EJSON.stringify(doc, null, 0, {relaxed:false}) + '\\n');
    count++;
  });
  const indexes = col.getIndexes().map(({ns, ...index}) => index)
    .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  const idx = crypto.createHash('sha256').update(EJSON.stringify(indexes, null, 0, {relaxed:false})).digest('hex');
  results.push({name:c.name,count,documents: digest.digest('hex'), indexes:idx});
}
print(JSON.stringify({collections:results}));
"""


def mongo_summary_args(tool, database, *, config=None, port=None):
    uri = (f"JSON.parse(fs.readFileSync({json.dumps(str(config))}, 'utf8')).uri" if config is not None
           else json.dumps(f"mongodb://127.0.0.1:{port}/{database}?directConnection=true"))
    script = MONGO_SUMMARY.replace("REPLACE_URI", uri).replace("REPLACE_DB", json.dumps(database))
    return [tool, "--nodb", "--norc", "--quiet", "--eval", script]


def mongo_run(runner, args, **kwargs):
    if not isinstance(runner, Runner):
        return runner.run(args, **kwargs)
    # Mongosh otherwise writes logs and configuration under the operator's home.
    # Give it a disposable HOME and disable logs, updates and telemetry before connecting.
    with tempfile.TemporaryDirectory(prefix="maple-shell-") as temp:
        settings = Path(temp) / ".mongodb/mongosh"
        settings.mkdir(parents=True, mode=0o700)
        atomic_json(settings / "config", {"disableLogging": True, "enableTelemetry": False, "updateURL": ""})
        original = runner.env
        runner.env = {**original, "HOME": temp}
        try:
            return runner.run(args, **kwargs)
        finally:
            runner.env = original


def validate_summary(raw):
    value = decode_json(raw)
    if not isinstance(value, dict) or set(value) != {"collections"} or not isinstance(value["collections"], list):
        raise JobError("snapshot_failed")
    names = set()
    for collection in value["collections"]:
        if (not isinstance(collection, dict) or set(collection) != {"name", "count", "documents", "indexes"}
                or not isinstance(collection["name"], str) or not collection["name"]
                or collection["name"] in names or type(collection["count"]) is not int or collection["count"] < 0
                or not valid_str(SHA256, collection["documents"]) or not valid_str(SHA256, collection["indexes"])):
            raise JobError("snapshot_failed")
        names.add(collection["name"])
    return value


def file_digest(source):
    sha = hashlib.sha256()
    size = 0
    with source.open("rb") as src:
        for chunk in iter(lambda: src.read(1024 * 1024), b""):
            sha.update(chunk)
            size += len(chunk)
    return {"bytes": size, "sha256": sha.hexdigest()}


class Digested:
    def __init__(self, source):
        self.source = source
        self.sha = hashlib.sha256()

    def read(self, size):
        contents = self.source.read(size)
        self.sha.update(contents)
        return contents


def pack_files(cfg, summary, stream):
    inventory = {}

    def walk(tar, path, name):
        if any(path.is_relative_to(excluded) for excluded in cfg.exclusions):
            return
        if any(part in {".", "..", ""} or any(ord(ch) < 32 for ch in part) or "\\" in part
               for part in name.split("/")):
            raise JobError("snapshot_failed")
        info = path.lstat()
        if stat.S_ISDIR(info.st_mode):
            member = tarfile.TarInfo(name)
            member.type = tarfile.DIRTYPE
            member.mode = 0o700
            tar.addfile(member)
            for child in sorted(path.iterdir()):
                walk(tar, child, name + "/" + child.name)
        elif stat.S_ISREG(info.st_mode) and info.st_nlink == 1:
            with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK), "rb") as src:
                before = os.fstat(src.fileno())
                if (info.st_dev, info.st_ino) != (before.st_dev, before.st_ino) or not stat.S_ISREG(before.st_mode):
                    raise JobError("snapshot_failed")
                member = tarfile.TarInfo(name)
                member.size = before.st_size
                member.mode = 0o600
                digest = Digested(src)
                tar.addfile(member, digest)
                after = os.fstat(src.fileno())
                if (before.st_size, before.st_mtime_ns, before.st_ctime_ns, before.st_nlink) != (
                        after.st_size, after.st_mtime_ns, after.st_ctime_ns, after.st_nlink):
                    raise JobError("snapshot_failed")
                inventory[name] = {"bytes": member.size, "sha256": digest.sha.hexdigest()}
        else:
            raise JobError("snapshot_failed")

    with tarfile.open(fileobj=stream, mode="w|") as tar:
        for label, path in sorted(cfg.sources.items()):
            walk(tar, path, f"files/{label}")
        body = json_bytes({"version": 1, "database": cfg.database, "mongo": summary, "files": inventory})
        if len(body) > JSON_LIMIT:
            raise JobError("snapshot_failed")
        entry = tarfile.TarInfo("snapshot.json")
        entry.size = len(body)
        tar.addfile(entry, io.BytesIO(body))


def new_generation(now):
    return now.astimezone(timezone.utc).strftime(STAMP) + "-" + secrets.token_hex(16)


def generation_time(gen):
    if not valid_str(GENERATION, gen):
        raise JobError("drive_invalid")
    return datetime.strptime(gen.split("-")[0], STAMP).replace(tzinfo=timezone.utc)


def validate_manifest(value, job_id, gen):
    if (not isinstance(value, dict) or set(value) != {"version", "jobId", "generation", "createdAt",
                                                     "archives", "revision", "recipientId", "tools"}
            or type(value["version"]) is not int or value["version"] != 1
            or value["jobId"] != job_id or not valid_str(r"[a-f0-9]{32}", job_id) or value["generation"] != gen
            or datetime_value(value["createdAt"]).replace(microsecond=0) != generation_time(gen)
            or not valid_str(r"[a-f0-9]{40}|[a-f0-9]{64}", value["revision"])
            or not valid_str(SHA256, value["recipientId"])
            or not isinstance(value["tools"], dict) or set(value["tools"]) != {"age", "mongodump", "mongosh", "rclone"}
            or any(not valid_str(r"[0-9]+\.[0-9]+\.[0-9]+", version) for version in value["tools"].values())
            or not isinstance(value["archives"], dict) or set(value["archives"]) != set(ARCHIVES)):
        raise JobError("drive_invalid")
    for info in value["archives"].values():
        if (not isinstance(info, dict) or set(info) != {"bytes", "sha256"} or type(info["bytes"]) is not int
                or not 0 < info["bytes"] <= 2**50 or not valid_str(SHA256, info["sha256"])):
            raise JobError("drive_invalid")
    return value


class Drive:
    def __init__(self, cfg, runner, end):
        self.cfg, self.runner, self.end = cfg, runner, end

    def remote(self, name=""):
        return self.cfg.rclone_remote + ":" + name

    def name(self, gen, suffix):
        return f"maple-{self.cfg.job_id}-{gen}.{suffix}"

    def run(self, *args, limit=JSON_LIMIT, hash_output=False):
        return self.runner.run([self.cfg.tools["rclone"], *args, "--config", str(self.cfg.rclone_config),
                                "--drive-root-folder-id", self.cfg.folder_id, "--drive-scope", "drive.file",
                                "--drive-use-trash=false", "--drive-skip-shortcuts", "--retries", "1",
                                "--low-level-retries", "1", "--contimeout", "10s", "--timeout", "20s"],
                               timeout=remaining(self.end), limit=limit, hash_output=hash_output)

    def items(self):
        data = decode_json(self.run("lsjson", self.remote(), "--max-depth", "1"))
        prefix = f"maple-{self.cfg.job_id}-"
        grouped = {}
        for entry in data:
            name = entry.get("Name", "")
            if not name.startswith(prefix):
                continue
            gen, sep, suffix = name[len(prefix):].partition(".")
            if not sep or not valid_str(GENERATION, gen) or suffix not in (*ARCHIVES, *METADATA):
                continue  # unrecognized objects are never deletion targets
            files = grouped.setdefault(gen, {})
            if (entry.get("IsDir") is not False or entry.get("Path") != name or not entry.get("ID")
                    or type(entry.get("Size")) is not int or suffix in files):
                raise JobError("drive_invalid")
            files[suffix] = entry
        return grouped

    def cat(self, gen, suffix, **kwargs):
        return self.run("cat", self.remote(self.name(gen, suffix)), **kwargs)

    def upload(self, gen, directory, manifest):
        if gen in self.items():
            raise JobError("upload_failed")
        for suffix in ("pending.json", *ARCHIVES, "manifest.json"):
            source = directory / (suffix if suffix in ARCHIVES else "pending.json")
            self.run("copyto", str(source), self.remote(self.name(gen, suffix)), "--immutable")
            if suffix in ARCHIVES:
                expected = manifest["archives"][suffix]
                if self.cat(gen, suffix, limit=expected["bytes"], hash_output=True) != (
                        expected["bytes"], expected["sha256"]):
                    raise JobError("upload_mismatch")
            elif self.cat(gen, suffix, limit=MANIFEST_LIMIT) != private_read(source, MANIFEST_LIMIT):
                raise JobError("upload_mismatch")
        seen = self.items().get(gen, {})
        if set(seen) != set((*ARCHIVES, *METADATA)):
            raise JobError("upload_mismatch")

    def quota(self, required):
        about = decode_json(self.run("about", self.remote(), "--json", limit=65536))
        free = about.get("free")
        # Some accounts provide usage but do not expose a fixed quota.
        if free is not None and (type(free) is not int or free < required):
            raise JobError("drive_quota")

    def expire(self, now):
        overdue = False
        for gen, files in sorted(self.items().items()):
            if now - generation_time(gen) < EXPIRY_AGE:
                continue
            # The pending marker is uploaded and verified before archives. Keep it
            # until all other files have been deleted to allow retry after interruption.
            if "pending.json" not in files:
                raise JobError("expiry_failed")
            raw = self.cat(gen, "pending.json", limit=MANIFEST_LIMIT)
            manifest = validate_manifest(decode_json(raw), self.cfg.job_id, gen)
            age = now - datetime_value(manifest["createdAt"])
            if age < EXPIRY_AGE:
                continue
            overdue |= age >= RETENTION
            if "manifest.json" in files and self.cat(gen, "manifest.json", limit=MANIFEST_LIMIT) != raw:
                raise JobError("expiry_failed")
            for suffix in ARCHIVES:
                if suffix not in files:
                    continue
                expected = manifest["archives"][suffix]
                if (files[suffix]["Size"] != expected["bytes"] or
                        self.cat(gen, suffix, limit=expected["bytes"], hash_output=True) !=
                        (expected["bytes"], expected["sha256"])):
                    raise JobError("expiry_failed")
            for suffix in ("manifest.json", *ARCHIVES, "pending.json"):
                if suffix in files:
                    self.run("deletefile", self.remote(self.name(gen, suffix)))
            if gen in self.items():
                raise JobError("expiry_failed")
        return overdue


def local_dir_name(cfg, gen):
    return f"maple-{cfg.job_id}-{gen}"


def expire_local(cfg, now):
    overdue = False
    for directory in cfg.output_dir.iterdir():
        prefix = f"maple-{cfg.job_id}-"
        gen = directory.name.removeprefix(prefix)
        if not directory.name.startswith(prefix) or not valid_str(GENERATION, gen):
            continue
        age = now - generation_time(gen)
        if age < EXPIRY_AGE:
            continue
        private_dir(directory)
        entries = {entry.name: entry for entry in directory.iterdir()}
        if not set(entries) <= set((*ARCHIVES, *METADATA, *META_TEMP.values())):
            raise JobError("expiry_failed")
        # The job exclusively creates these private, random generation directories.
        if "pending.json" in entries:
            manifest = validate_manifest(decode_json(private_read(entries["pending.json"], MANIFEST_LIMIT)), cfg.job_id, gen)
            age = now - datetime_value(manifest["createdAt"])
            if age < EXPIRY_AGE:
                continue
            expected = json_bytes(manifest)
            if "manifest.json" in entries and private_read(entries["manifest.json"], MANIFEST_LIMIT) != expected:
                raise JobError("expiry_failed")
        elif "manifest.json" in entries:
            raise JobError("expiry_failed")
        for name, entry in entries.items():
            info = entry.lstat()
            if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_uid != os.geteuid():
                raise JobError("expiry_failed")
            if name in ARCHIVES and info.st_mode & 0o177:
                raise JobError("expiry_failed")
        for name in (*META_TEMP.values(), "manifest.json", *ARCHIVES, "pending.json"):
            if name in entries:
                entries[name].unlink()
        overdue |= age >= RETENTION
        directory.rmdir()
        sync_dir(cfg.output_dir)
    return overdue


def expire(cfg, runner, now, *, drive=None):
    overdue = False
    failure = False
    # A failed local check must not block the remote expiry attempt, or vice versa.
    remote = drive or Drive(cfg, runner, time.monotonic() + cfg.transfer_seconds)
    for sweep in (lambda: expire_local(cfg, now), lambda: remote.expire(now)):
        try:
            overdue |= sweep()
        except Interrupted:
            raise
        except (JobError, OSError, ValueError, KeyError, TypeError, AttributeError):
            failure = True
    if overdue:
        raise JobError("retention_overdue")
    if failure:
        raise JobError("expiry_failed")


def default_status():
    return {"version": 1, "lastAttemptAt": None, "lastSuccessAt": None, "lastUploadVerifiedAt": None,
            "lastRestoreVerifiedAt": None, "retentionDays": 30, "encryption": "age",
            "offsite": "google-drive", "legacyPlaintextCleared": False, "ok": False}


def read_status(cfg):
    try:
        value = decode_json(private_read(cfg.status_path, 4096, group_read=True))
        status = default_status()
        if (not isinstance(value, dict) or not set(status) <= set(value)
                or value["version"] != 1 or value["retentionDays"] != 30
                or value["encryption"] != "age" or value["offsite"] != "google-drive"
                or any(type(value[key]) is not bool for key in ("legacyPlaintextCleared", "ok"))):
            return status
        for field in ("lastAttemptAt", "lastSuccessAt", "lastUploadVerifiedAt", "lastRestoreVerifiedAt"):
            if value[field] is not None:
                datetime_value(value[field])
        status.update({key: value[key] for key in status})
        if value.get("error") in CODES:
            status["error"] = value["error"]
        if type(value.get("diskFreeBytes")) is int and value["diskFreeBytes"] >= 0:
            status["diskFreeBytes"] = value["diskFreeBytes"]
        return status
    except (OSError, ValueError, TypeError, JobError):
        return default_status()


def tool_versions(cfg, runner):
    versions = {}
    for tool in ("age", "mongodump", "mongosh", "rclone"):
        version = re.search(rb"\b([0-9]+\.[0-9]+\.[0-9]+)\b|\bv([0-9]+\.[0-9]+\.[0-9]+)\b",
                            runner.run([cfg.tools[tool], "--version"], timeout=4, limit=65536))
        if version is None:
            raise JobError("config_invalid")
        versions[tool] = (version.group(1) or version.group(2)).decode("ascii")
    return versions


def snapshot(cfg, runner, directory, end):
    body = mongo_run(runner, mongo_summary_args(cfg.tools["mongosh"], cfg.database, config=cfg.mongo_config),
                     timeout=remaining(end), limit=JSON_LIMIT)
    summary = validate_summary(body)
    inputs = {
        "database.age": ([cfg.tools["mongodump"], "--config", str(cfg.mongo_config), "--db",
                          cfg.database, "--archive", "--gzip"], None),
        "files.tar.age": ([sys.executable, str(Path(__file__).resolve()), "--config",
                           str(cfg.settings_path), "--internal-files"], json_bytes(summary)),
    }
    for name, (producer, data) in inputs.items():
        with os.fdopen(os.open(directory / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "wb") as out:
            runner.chain([producer, [cfg.tools["age"], "-r", cfg.recipient]], timeout=remaining(end), output=out,
                         input_data=data)
            out.flush()
            os.fsync(out.fileno())


@contextlib.contextmanager
def inherited_lock(runner, fd):
    before = getattr(runner, "inherited", ())
    runner.inherited = (*before, fd)
    try:
        yield
    finally:
        runner.inherited = before


def run_backup(cfg, runner, *, now=utc_now, expiry_only=False):
    with lock(cfg.run_lock) as run_fd:
        if run_fd is None:
            return False
        with inherited_lock(runner, run_fd):
            return _run_locked(cfg, runner, now, expiry_only)


def _run_locked(cfg, runner, now, expiry_only):
    status = read_status(cfg)
    if not expiry_only:
        prior_status = status.copy()
        status.update(ok=False, lastAttemptAt=timestamp(now()), error="backup_interrupted")
        atomic_json(cfg.status_path, status)
    directory = None
    code = "drive_invalid"
    try:
        verify_drive_config(cfg)
        code = "expiry_failed"
        expire(cfg, runner, now())
        if expiry_only:
            return True
        code = "config_invalid"
        verify_mongo_config(cfg)
        code = "disk_low"
        free = shutil.disk_usage(cfg.output_dir).free
        status["diskFreeBytes"] = free
        if free < cfg.minimum_free_bytes:
            raise JobError("disk_low")
        code = "drive_quota"
        Drive(cfg, runner, time.monotonic() + cfg.transfer_seconds).quota(cfg.minimum_free_bytes)
        code = "snapshot_failed"
        versions = tool_versions(cfg, runner)
        apps = MapleApps(cfg, runner)
        with lock(cfg.deploy_lock) as maint_fd:
            if maint_fd is None:
                # The deploy itself has no backup-failure significance; the next
                # attempt or independent stale alarm handles a skipped window.
                atomic_json(cfg.status_path, prior_status)
                return False
            with inherited_lock(runner, maint_fd):
                # Recover any prior abandoned maintenance before the next attempt.
                try:
                    if apps.recover():
                        # Do not take another maintenance window in this invocation.
                        raise JobError("maintenance_interrupted")
                except JobError as error:
                    code = str(error)
                    raise
                revision = runner.run([cfg.tools["git"], "-C", str(cfg.revision_dir), "rev-parse", "HEAD"],
                                      timeout=5, limit=128).decode().strip()
                if not valid_str(r"[a-f0-9]{40}|[a-f0-9]{64}", revision):
                    raise JobError("snapshot_failed")
                created = now()
                gen = new_generation(created)
                directory = cfg.output_dir / local_dir_name(cfg, gen)
                directory.mkdir(mode=0o700)
                sync_dir(cfg.output_dir)
                start = time.monotonic()
                try:
                    apps.pause(start + cfg.maintenance_seconds)
                    snapshot(cfg, runner, directory, start + cfg.maintenance_seconds)
                finally:
                    try:
                        apps.recover()
                        print(f"maple-backup maintenance_seconds={time.monotonic() - start:.2f}", flush=True)
                    except (JobError, ValueError, KeyError, TypeError, OSError):
                        code = "recovery_failed"
                        raise JobError(code) from None
        manifest = validate_manifest({"version": 1, "jobId": cfg.job_id, "generation": gen,
                                      "createdAt": timestamp(created), "revision": revision,
                                      "recipientId": hashlib.sha256(cfg.recipient.encode()).hexdigest(), "tools": versions,
                                      "archives": {archive: file_digest(directory / archive) for archive in ARCHIVES}},
                                     cfg.job_id, gen)
        atomic_json(directory / "pending.json", manifest, generation_file=True)
        code = "upload_failed"
        drive = Drive(cfg, runner, time.monotonic() + cfg.transfer_seconds)
        drive.quota(sum(item["bytes"] for item in manifest["archives"].values()) + 2 * MANIFEST_LIMIT)
        drive.upload(gen, directory, manifest)
        atomic_json(directory / "manifest.json", manifest, generation_file=True)
        verified = timestamp(now())
        status.update(ok=True, lastSuccessAt=verified, lastUploadVerifiedAt=verified)
        status.pop("error", None)
        atomic_json(cfg.status_path, status)
        return True
    except (JobError, OSError, ValueError, KeyError, TypeError, AttributeError, configparser.Error) as error:
        if isinstance(error, Interrupted):
            if code != "recovery_failed":
                code = str(error)
        elif isinstance(error, JobError) and str(error) in CODES - {"command_failed", "command_timeout"}:
            if code != "expiry_failed" or str(error) == "retention_overdue":
                code = str(error)
        if code == "snapshot_failed" and directory is not None and not (directory / "pending.json").exists():
            for archive in ARCHIVES:
                (directory / archive).unlink(missing_ok=True)
            # Any additional files make expiry fail closed rather than deleting recursively.
            directory.rmdir()
        status.update(ok=False, error=code)
        atomic_json(cfg.status_path, status)
        print(f"maple-backup failed: {code}", file=sys.stderr)
        return False


def private_process():
    os.umask(0o077)
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", required=True, type=Path)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--verify-config", action="store_true")
    mode.add_argument("--expire-only", action="store_true")
    mode.add_argument("--internal-files", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()
    private_process()
    signal.signal(signal.SIGTERM, terminate)
    signal.signal(signal.SIGINT, terminate)
    try:
        cfg = load_config(args.config, check_credentials=args.verify_config)
        if args.internal_files:
            raw = sys.stdin.buffer.read(JSON_LIMIT + 1)
            if len(raw) > JSON_LIMIT:
                raise JobError("snapshot_failed")
            pack_files(cfg, validate_summary(raw), sys.stdout.buffer)
            return 0
        if args.verify_config:
            # Encrypt empty input in memory to check the public recipient, including its checksum.
            encrypted = Runner(cfg).run([cfg.tools["age"], "-r", cfg.recipient], timeout=5, limit=32 * 1024)
            if not encrypted.startswith(b"age-encryption.org/v1\n"):
                raise JobError("config_invalid")
            print("maple-backup local configuration is valid")
            return 0
        return 0 if run_backup(cfg, Runner(cfg), expiry_only=args.expire_only) else 1
    except (JobError, OSError, ValueError, KeyError, TypeError, AttributeError, configparser.Error) as error:
        code = str(error) if isinstance(error, JobError) and str(error) in CODES else "internal_error"
        print(f"maple-backup failed: {code}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
