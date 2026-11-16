#!/usr/bin/env python3
"""Verify a Drive-retrieved Maple generation against an isolated scratch restore."""
import argparse
import contextlib
import hashlib
import os
import secrets
import selectors
import shutil
import signal
import socket
import struct
import subprocess
import stat
import sys
import tarfile
import tempfile
import time
from pathlib import Path, PurePosixPath
from urllib.parse import quote

sys.dont_write_bytecode = True

from backup import (ARCHIVES, JSON_LIMIT, MANIFEST_LIMIT, SAFE_LABEL, SHA256, JobError, Runner,
                    atomic_json, decode_json, file_digest, json_bytes, lock, mongo_run, mongo_summary_args,
                    private_dir, private_process, private_read, read_status, remaining, resolved_path, terminate,
                    timestamp, utc_now, validate_manifest, validate_summary, valid_str)

IDENTITY_LIMIT = 16 * 1024
RESTORE_ERRORS = {
    "archive_hash_mismatch", "backup_running", "command_failed", "command_timeout", "config_invalid",
    "file_inventory_mismatch", "invalid_archive", "invalid_evidence", "isolated_mongo_failed",
    "missing_upload_evidence", "mongo_inventory_mismatch", "stream_ciphertext_mismatch", "stream_incomplete",
    "stream_invalid", "stream_timeout", "unsafe_identity_input", "unsafe_restore_path", "unsafe_restore_port",
    "unsafe_stream_input",
}


def native_identity(raw):
    if not 0 < len(raw) <= IDENTITY_LIMIT:
        raise JobError("unsafe_identity_input")
    identities = [line for line in raw.decode("ascii").splitlines() if line and not line.startswith("#")]
    if len(identities) != 1 or not valid_str(r"AGE-SECRET-KEY-(?:PQ-)?1[023456789ACDEFGHJKLMNPQRSTUVWXYZ]{58}", identities[0]):
        raise JobError("unsafe_identity_input")
    return (identities[0] + "\n").encode("ascii")


def safe_member(name):
    if not isinstance(name, str) or not name or len(name) > 4096 or "\\" in name:
        return False
    parts = name.split("/")
    return (len(parts) >= 2 and parts[0] == "files" and valid_str(SAFE_LABEL, parts[1])
            and all(part not in {"", ".", ".."} and len(part) <= 255 and
                    not any(ord(ch) < 32 for ch in part) for part in parts))


def unpack(source, target):
    files, seen = {}, set()
    snapshot = None
    (target / "files").mkdir(mode=0o700)
    with tarfile.open(fileobj=source, mode="r|") as tar:
        for member in tar:
            name = member.name
            if name in seen or snapshot is not None or member.size < 0 or len(seen) >= 100000:
                raise JobError("invalid_archive")
            seen.add(name)
            if name == "snapshot.json":
                if member.type != tarfile.REGTYPE or not 0 < member.size <= JSON_LIMIT:
                    raise JobError("invalid_archive")
                snapshot = decode_json(tar.extractfile(member).read())
                continue
            if not safe_member(name) or member.type not in (tarfile.REGTYPE, tarfile.DIRTYPE):
                raise JobError("invalid_archive")
            path = target.joinpath(*PurePosixPath(name).parts)
            if not path.parent.is_dir():
                raise JobError("invalid_archive")
            if member.type == tarfile.DIRTYPE:
                if member.size != 0:
                    raise JobError("invalid_archive")
                path.mkdir(mode=0o700)
            else:
                with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600),
                               "wb") as out:
                    shutil.copyfileobj(tar.extractfile(member), out, 1024 * 1024)
                files[name] = file_digest(path)
    # Do not stop consuming the decrypting stream at the end of tar blocks.
    while source.read(1024 * 1024):
        pass
    if (not isinstance(snapshot, dict) or set(snapshot) != {"version", "database", "mongo", "files"}
            or type(snapshot["version"]) is not int or snapshot["version"] != 1
            or not valid_str(SAFE_LABEL, snapshot["database"]) or not isinstance(snapshot["files"], dict)
            or snapshot["database"] in ("admin", "local", "config") or snapshot["files"] != files):
        raise JobError("file_inventory_mismatch")
    validate_summary(json_bytes(snapshot["mongo"]))
    return snapshot


def verify_port(port):
    # Imposes a broad separation from Maple and standard MongoDB ports.
    if type(port) is not int or not 49152 <= port <= 65535:
        raise JobError("unsafe_restore_port")
    with socket.socket() as sock:
        try:
            sock.bind(("127.0.0.1", port))
        except OSError:
            raise JobError("unsafe_restore_port") from None


def restore_config(config_path):
    path = resolved_path(str(config_path))
    private_dir(path.parent)
    cfg = decode_json(private_read(path, 16384))
    if (not isinstance(cfg, dict) or set(cfg) != {"tools", "scratch_dir", "port", "timeout_seconds"}
            or not isinstance(cfg["tools"], dict) or set(cfg["tools"]) != {"age", "mongod", "mongorestore", "mongosh"}
            or type(cfg["timeout_seconds"]) is not int or not 60 <= cfg["timeout_seconds"] <= 3600):
        raise JobError("config_invalid")
    for tool in cfg["tools"].values():
        if not isinstance(tool, str) or not os.path.isabs(tool) or not os.path.isfile(tool) or not os.access(tool, os.X_OK):
            raise JobError("config_invalid")
    cfg["scratch_dir"] = private_dir(resolved_path(cfg["scratch_dir"]))
    if (cfg["scratch_dir"] != path.parent / "maple-restore-scratch" or tuple(cfg["scratch_dir"].iterdir())
            or any((parent / ".git").exists() for parent in path.parents)
            or any(path.is_relative_to(Path(root)) for root in ("/var/lib", "/var/www", "/etc"))):
        raise JobError("unsafe_restore_path")
    verify_port(cfg["port"])
    return cfg


def contents(download, job_id):
    download = resolved_path(str(download))
    private_dir(download)
    if not valid_str(r"[a-f0-9]{32}", job_id):
        raise JobError("invalid_archive")
    gen_manifest = [path for path in download.iterdir() if path.name.endswith(".manifest.json")]
    if len(gen_manifest) != 1:
        raise JobError("invalid_archive")
    manifest_path = gen_manifest[0]
    manifest_raw = private_read(manifest_path, MANIFEST_LIMIT)
    decoded = decode_json(manifest_raw)
    gen = decoded["generation"]
    manifest = validate_manifest(decoded, job_id, gen)
    prefix = f"maple-{job_id}-{gen}"
    if manifest_path.name != prefix + ".manifest.json":
        raise JobError("invalid_archive")
    paths = {}
    for name in ARCHIVES:
        path = download / (prefix + "." + name)
        info = path.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_uid != os.geteuid() or info.st_mode & 0o177:
            raise JobError("invalid_archive")
        if file_digest(path) != manifest["archives"][name]:
            raise JobError("archive_hash_mismatch")
        paths[name] = path
    return manifest, hashlib.sha256(manifest_raw).hexdigest(), paths


@contextlib.contextmanager
def scratch_daemon(runner, mongod, dbpath, socket_path, port, end, *, authenticated):
    args = [mongod, "--dbpath", str(dbpath), "--bind_ip", str(socket_path), "--port", str(port)]
    if authenticated:
        args.extend(("--auth", "--setParameter", "enableLocalhostAuthBypass=false"))
    child = runner.spawn(args, timeout=remaining(end))
    try:
        yield child
    finally:
        if child.poll() is None:
            try:
                child.terminate()
                child.wait(timeout=10)
            except (subprocess.TimeoutExpired, ProcessLookupError):
                pass
        runner.finish([child])
        socket_path.unlink(missing_ok=True)


def wait_for_our_mongo(runner, mongosh, child, socket_path, port, endpoint, end, *, authenticated=False):
    deadline = min(end, time.monotonic() + 35)
    while child.poll() is None:
        # A private owner-created socket and verified process ID identify this scratch database.
        if socket_path.is_socket():
            verify_port(port)
            if authenticated:
                js_path = json_bytes(str(endpoint)).decode().strip()
                script = (f"const uri=JSON.parse(require('fs').readFileSync({js_path},'utf8')).uri;"
                          "print(new Mongo(uri).getDB('admin').runCommand({serverStatus:1}).pid.toString())")
                args = [mongosh, "--nodb", "--norc", "--quiet", "--eval", script]
            else:
                args = [mongosh, "--norc", "--quiet", endpoint, "--eval",
                        "print(db.adminCommand({serverStatus:1}).pid.toString())"]
            try:
                response = mongo_run(runner, args, timeout=min(3, remaining(deadline)), limit=1024)
                if response.strip() == str(child.pid).encode():
                    return
            except JobError:
                pass
        time.sleep(min(0.2, remaining(deadline)))
    raise JobError("isolated_mongo_failed")


@contextlib.contextmanager
def authenticated_mongo(runner, tools, target, port, database, end):
    dbpath = target / "mongo"
    dbpath.mkdir(mode=0o700)
    verify_port(port)
    password = secrets.token_urlsafe(32)
    credential = target / "restore-mongo.json"
    bootstrap = target / "bootstrap-mongo.json"
    # A short path avoids the platform-specific Unix-domain socket path limit.
    with tempfile.TemporaryDirectory(prefix="maple-mongo-", dir="/tmp") as socket_dir:
        socket_path = Path(socket_dir) / "mongo.sock"
        authority = quote(str(socket_path), safe="")
        options = "directConnection=true&serverSelectionTimeoutMS=1000"
        endpoint = f"mongodb://{authority}/admin?{options}"
        # Bootstrap stays on the private socket and the database still holds no backup data.
        atomic_json(bootstrap, {"password": password})
        try:
            with scratch_daemon(runner, tools["mongod"], dbpath, socket_path, port, end, authenticated=False) as child:
                wait_for_our_mongo(runner, tools["mongosh"], child, socket_path, port, endpoint, end)
                path = json_bytes(str(bootstrap)).decode().strip()
                name = json_bytes(database).decode().strip()
                script = (f"const pw=JSON.parse(require('fs').readFileSync({path},'utf8')).password;"
                          "db.createUser({user:'maple_drill',pwd:pw,roles:[{role:'restore',db:'admin'},"
                          f"{{role:'clusterMonitor',db:'admin'}},{{role:'read',db:{name}}}]}})")
                mongo_run(runner, [tools["mongosh"], "--norc", "--quiet", endpoint, "--eval", script],
                          timeout=remaining(end), limit=1024)
        finally:
            bootstrap.unlink()
        uri = f"mongodb://maple_drill:{password}@{authority}/{database}?authSource=admin&{options}"
        atomic_json(credential, {"uri": uri})
        try:
            with scratch_daemon(runner, tools["mongod"], dbpath, socket_path, port, end, authenticated=True) as child:
                wait_for_our_mongo(runner, tools["mongosh"], child, socket_path, port, credential, end, authenticated=True)
                yield credential
        finally:
            credential.unlink()


FRAME_LIMIT = 64 * 1024
CIPHERTEXT_PROOF = struct.Struct(">Q32s")


def fd_read(fd, maximum, deadline):
    with selectors.SelectSelector() as selector:
        selector.register(fd, selectors.EVENT_READ)
        if not selector.select(remaining(deadline)):
            raise JobError("stream_timeout")
        return os.read(fd, maximum)


class FrameReader:
    """Read one archive and verify the sender's authenticated ciphertext evidence."""

    def __init__(self, fd, deadline, expected):
        self.fd, self.deadline, self.expected = fd, deadline, expected
        self.pending = b""
        self.complete = False

    def exact(self, count):
        result = bytearray()
        while len(result) < count:
            chunk = fd_read(self.fd, count - len(result), self.deadline)
            if not chunk:
                raise JobError("stream_incomplete")
            result.extend(chunk)
        return bytes(result)

    def read(self, count=-1):
        result = bytearray()
        while not self.complete and (count < 0 or len(result) < count):
            if not self.pending:
                length, = struct.unpack(">I", self.exact(4))
                if length == 0:
                    size, digest = CIPHERTEXT_PROOF.unpack(self.exact(CIPHERTEXT_PROOF.size))
                    if {"bytes": size, "sha256": digest.hex()} != self.expected:
                        raise JobError("stream_ciphertext_mismatch")
                    self.complete = True
                    break
                if length > FRAME_LIMIT:
                    raise JobError("stream_invalid")
                self.pending = self.exact(length)
            size = len(self.pending) if count < 0 else min(count - len(result), len(self.pending))
            result.extend(self.pending[:size])
            self.pending = self.pending[size:]
        return bytes(result)


def relay_ciphertext(proof_fd):
    """Hash exactly the ciphertext streamed to age; the relay never sees the identity."""
    sha = hashlib.sha256()
    size = 0
    with os.fdopen(proof_fd, "wb") as proof:
        while chunk := sys.stdin.buffer.read1(FRAME_LIMIT):
            sys.stdout.buffer.write(chunk)
            sha.update(chunk)
            size += len(chunk)
        sys.stdout.buffer.flush()
        proof.write(CIPHERTEXT_PROOF.pack(size, sha.digest()))


def send_archive(runner, age, source_fd, identity, output, end):
    children = []
    with contextlib.ExitStack() as files:
        identity_fd, identity_write = os.pipe()
        identity_read = files.enter_context(os.fdopen(identity_fd, "rb"))
        with os.fdopen(identity_write, "wb") as writer:
            writer.write(identity)
        proof_fd, proof_write = os.pipe()
        proof = files.enter_context(os.fdopen(proof_fd, "rb"))
        try:
            with os.fdopen(proof_write, "wb") as writer:
                runner.inherited = (identity_read.fileno(),)
                decrypt = runner.spawn([age, "-d", "-i", f"/dev/fd/{identity_fd}"], timeout=remaining(end),
                                       stdin=subprocess.PIPE, stdout=subprocess.PIPE)
                children.append(decrypt)
                runner.inherited = (writer.fileno(),)
                relay = runner.spawn([sys.executable, str(Path(__file__).resolve()), "--internal-ciphertext", str(proof_write)],
                                     timeout=remaining(end), stdin=source_fd, stdout=decrypt.stdin)
                children.append(relay)
                decrypt.stdin.close()
            while chunk := fd_read(decrypt.stdout.fileno(), FRAME_LIMIT, end):
                runner.put(output, struct.pack(">I", len(chunk)) + chunk, end)
            for child in children:
                runner.wait(child, end)
            # This proof has no authentication value until both age and the relay exited 0.
            encoded = proof.read(CIPHERTEXT_PROOF.size + 1)
            if len(encoded) != CIPHERTEXT_PROOF.size:
                raise JobError("stream_incomplete")
            runner.put(output, bytes(4) + encoded, end)
        finally:
            runner.inherited = ()
            runner.finish(children)


def send_stream(age, files_fd, database_fd, identity, *, output, timeout):
    if (not os.path.isabs(age) or not os.access(age, os.X_OK) or not 0 < len(identity) <= IDENTITY_LIMIT
            or not 3 <= files_fd <= 1023 or not 3 <= database_fd <= 1023 or files_fd == database_fd
            or any(not stat.S_ISFIFO(os.fstat(fd).st_mode) for fd in (files_fd, database_fd))):
        raise JobError("unsafe_stream_input")
    identity = native_identity(identity)
    runner = Runner()
    end = time.monotonic() + timeout
    for fd in (files_fd, database_fd):
        send_archive(runner, age, fd, identity, output, end)


def pipe_mongo(runner, args, source, end):
    child = runner.spawn(args, timeout=remaining(end), stdin=subprocess.PIPE)
    try:
        while chunk := source.read(FRAME_LIMIT):
            runner.put(child.stdin.fileno(), chunk, end)
        child.stdin.close()
        runner.wait(child, end)
    finally:
        runner.finish([child])


def check(download, job_id, cfg, identity, evidence, *, framed_input=None):
    manifest, manifest_hash, paths = contents(download, job_id)
    evidence = resolved_path(str(evidence), required=False)
    private_dir(evidence.parent)
    if (evidence.exists() or evidence.is_relative_to(download) or evidence.is_relative_to(cfg["scratch_dir"])
            or cfg["scratch_dir"].is_relative_to(download)
            or (framed_input is None and not 0 < len(identity) <= IDENTITY_LIMIT)):
        raise JobError("unsafe_restore_path")
    if framed_input is None:
        identity = native_identity(identity)
    tools, port = cfg["tools"], cfg["port"]
    runner = Runner()
    end = time.monotonic() + cfg["timeout_seconds"]
    with tempfile.TemporaryDirectory(prefix="drill-", dir=cfg["scratch_dir"]) as temporary:
        target = Path(temporary)
        files = target / "payload"
        files.mkdir(mode=0o700)
        if framed_input is None:
            runner.chain([[tools["age"], "-d", "-i", "-", str(paths["files.tar.age"])],
                          [sys.executable, str(Path(__file__).resolve()), "--internal-unpack", str(files)]],
                         timeout=remaining(end), input_data=identity)
            snapshot = decode_json(private_read(files / ".verified-snapshot.json", JSON_LIMIT))
        else:
            snapshot = unpack(FrameReader(framed_input, end, manifest["archives"]["files.tar.age"]), files)
        database = snapshot["database"]
        with authenticated_mongo(runner, tools, target, port, database, end) as credential:
            restore = [tools["mongorestore"], "--config", str(credential), "--archive", "--gzip", "--stopOnError",
                       "--nsInclude", database + ".*"]
            if framed_input is None:
                runner.chain([[tools["age"], "-d", "-i", "-", str(paths["database.age"])], restore],
                             timeout=remaining(end), input_data=identity)
            else:
                pipe_mongo(runner, restore, FrameReader(framed_input, end, manifest["archives"]["database.age"]), end)
                if fd_read(framed_input, 1, end):
                    raise JobError("stream_invalid")
            result = validate_summary(mongo_run(
                runner, mongo_summary_args(tools["mongosh"], database, config=credential),
                timeout=remaining(end), limit=JSON_LIMIT))
            if result != snapshot["mongo"]:
                raise JobError("mongo_inventory_mismatch")
    atomic_json(evidence, {"version": 1, "jobId": job_id, "generation": manifest["generation"],
                           "manifestSha256": manifest_hash, "verifiedAt": timestamp(utc_now())})


def record_restore(cfg, evidence_path):
    # Imported only after the operator verified these are the Drive-retrieved files.
    from backup import RETENTION, datetime_value, local_dir_name
    path = resolved_path(str(evidence_path))
    private_dir(path.parent)
    evidence = decode_json(private_read(path, 4096))
    if (not isinstance(evidence, dict) or set(evidence) !=
            {"version", "jobId", "generation", "manifestSha256", "verifiedAt"}
            or type(evidence["version"]) is not int or evidence["version"] != 1 or evidence["jobId"] != cfg.job_id
            or not valid_str(SHA256, evidence["manifestSha256"])):
        raise JobError("invalid_evidence")
    from backup import generation_time
    gen = evidence["generation"]
    generation_time(gen)
    observed = datetime_value(evidence["verifiedAt"])
    current = utc_now()
    if not generation_time(gen) <= observed <= current or current - generation_time(gen) >= RETENTION:
        raise JobError("invalid_evidence")
    with lock(cfg.run_lock) as fd:
        if fd is None:
            raise JobError("backup_running")
        path = cfg.output_dir / local_dir_name(cfg, gen) / "manifest.json"
        raw = private_read(path, MANIFEST_LIMIT)
        validate_manifest(decode_json(raw), cfg.job_id, gen)
        if hashlib.sha256(raw).hexdigest() != evidence["manifestSha256"]:
            raise JobError("invalid_evidence")
        status = read_status(cfg)
        from backup import default_status
        if status == default_status() or status["lastUploadVerifiedAt"] is None:
            raise JobError("missing_upload_evidence")
        prior = status["lastRestoreVerifiedAt"]
        if prior is None or observed > datetime_value(prior):
            status["lastRestoreVerifiedAt"] = timestamp(observed)
            atomic_json(cfg.status_path, status)


def identity_pipe():
    if not stat.S_ISFIFO(os.fstat(sys.stdin.fileno()).st_mode):
        raise JobError("unsafe_identity_input")
    deadline = time.monotonic() + 90
    fd = sys.stdin.fileno()
    raw = bytearray()
    while len(raw) <= IDENTITY_LIMIT:
        piece = fd_read(fd, min(4096, IDENTITY_LIMIT + 1 - len(raw)), deadline)
        if not piece:
            return bytes(raw)
        raw.extend(piece)
    raise JobError("unsafe_identity_input")


def stream_sender_cli():
    parser = argparse.ArgumentParser(description="Decrypt two ciphertext pipes from a vault-fed age process.")
    parser.add_argument("--age-tool", required=True)
    parser.add_argument("--files-fd", required=True, type=int)
    parser.add_argument("--database-fd", required=True, type=int)
    parser.add_argument("--timeout-seconds", type=int, default=300, choices=range(60, 3601), metavar="60..3600")
    args = parser.parse_args(sys.argv[2:])
    send_stream(args.age_tool, args.files_fd, args.database_fd, identity_pipe(),
                output=sys.stdout.fileno(), timeout=args.timeout_seconds)
    return 0


def main():
    # Internal unpack takes raw plaintext only on stdin from age, in a fresh scratch directory.
    private_process()
    signal.signal(signal.SIGTERM, terminate)
    signal.signal(signal.SIGINT, terminate)
    try:
        if len(sys.argv) > 1 and sys.argv[1] == "--stream-send":
            return stream_sender_cli()
        if len(sys.argv) == 3 and sys.argv[1] == "--internal-ciphertext":
            relay_ciphertext(int(sys.argv[2]))
            return 0
        if len(sys.argv) == 3 and sys.argv[1] == "--internal-unpack":
            target = private_dir(resolved_path(sys.argv[2]))
            if target.name != "payload" or target.parent.parent.name != "maple-restore-scratch" or tuple(target.iterdir()):
                raise JobError("unsafe_restore_path")
            snapshot = unpack(sys.stdin.buffer, target)
            atomic_json(target / ".verified-snapshot.json", snapshot)
            return 0
        parser = argparse.ArgumentParser(description=__doc__)
        parser.add_argument("--config", required=True, type=Path)
        parser.add_argument("--download-dir", type=Path)
        parser.add_argument("--job-id")
        parser.add_argument("--evidence", required=True, type=Path)
        mode = parser.add_mutually_exclusive_group()
        mode.add_argument("--stream-receive", action="store_true",
                          help="Receive two age-authenticated plaintext streams over trusted SSH. No identity.")
        mode.add_argument("--record-restore", action="store_true",
                            help="Import a verified drill receipt on the backup host; config is the backup job config.")
        identity = parser.add_mutually_exclusive_group()
        identity.add_argument("--identity-stdin", action="store_true", help="Read identity from a vault pipe; never log it.")
        identity.add_argument("--identity-file", type=Path, help="Read a protected off-server identity, owner-only.")
        args = parser.parse_args()
        if args.record_restore:
            if args.download_dir or args.job_id or args.identity_file or args.identity_stdin:
                parser.error("--record-restore takes only --config and --evidence")
            from backup import load_config
            record_restore(load_config(args.config), args.evidence)
        else:
            if not args.download_dir or not args.job_id:
                parser.error("restore requires --download-dir and --job-id")
            cfg = restore_config(args.config)
            if args.stream_receive:
                if args.identity_file or args.identity_stdin:
                    parser.error("--stream-receive never accepts the identity")
                check(args.download_dir, args.job_id, cfg, b"", args.evidence, framed_input=sys.stdin.fileno())
            else:
                if args.identity_stdin:
                    secret = identity_pipe()
                elif args.identity_file:
                    path = resolved_path(str(args.identity_file))
                    private_dir(path.parent)
                    secret = private_read(path, IDENTITY_LIMIT)
                else:
                    parser.error("local restore requires a protected identity input")
                check(args.download_dir, args.job_id, cfg, secret, args.evidence)
        print("maple-backup isolated restore evidence verified")
        return 0
    except (JobError, ValueError, OSError, KeyError, TypeError, AttributeError, tarfile.TarError) as error:
        code = str(error) if isinstance(error, JobError) else ""
        safe = code if code in RESTORE_ERRORS else "check isolated tools, ciphertext, and target"
        print(f"maple-backup restore failed: {safe}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
