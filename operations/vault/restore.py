#!/usr/bin/env python3
"""Validate a pinned vault generation into fresh, isolated recovery scratch."""
import argparse
from contextlib import contextmanager
from dataclasses import dataclass
import hashlib
import os
from pathlib import Path
import re
import resource
import shutil
import stat
import struct
import sys
import tarfile
import tempfile
import time

from backup import (BLOCK, CONFIG_MEMBERS, HEADER, HOME, KEY_MEMBERS,
                    MACHINE_ID, MIB, SHA256, SMALL_MAX, UID, JobError, Pipe, Runner, check, child, encoded,
                    exe, file_hash, generation_date, handle_signals, is_number, machine_id, manifest, matches,
                    maximum_archive, owned_fd, read_private, strict_json, wait)
from render import InvalidConfig, private_dir, safe_path

STREAM_PROTOCOL = "maple-vault-recovery-stream-v1"


@dataclass(frozen=True)
class Recovery:
    age: str | None
    generation: str
    ciphertext_sha256: str
    source_machine_id: str
    destination: Path | None
    max_sql_bytes: int
    timeout_seconds: int


def load_recovery(path, mode):
    config = safe_path(path, "recovery config")
    private_dir(config.parent, os.geteuid(), "recovery config parent")
    raw = strict_json(read_private(config))
    fields = {"generation", "ciphertext_sha256", "source_machine_id", "max_sql_bytes", "timeout_seconds"}
    if mode != "receive":
        fields.add("age")
    if mode != "export":
        fields.add("destination")
    check(isinstance(raw, dict) and raw.keys() == fields, "invalid_recovery_config")
    generation_date(raw["generation"])
    check(matches(SHA256, raw["ciphertext_sha256"]) and matches(MACHINE_ID, raw["source_machine_id"])
          and raw["source_machine_id"] != "0" * 32, "invalid_recovery_pin")
    check(is_number(raw["max_sql_bytes"], MIB, 4 << 30)
          and is_number(raw["timeout_seconds"], 30, 1800), "invalid_recovery_limits")
    destination = safe_path(raw["destination"], "recovery destination") if mode != "export" else None
    age = exe(raw["age"]) if mode != "receive" else None
    if mode != "export":
        check(sys.platform == "linux" and os.geteuid() not in (0, UID), "isolated_recovery_account_required")
        if mode == "direct":
            check(machine_id() != raw["source_machine_id"], "direct_restore_on_source_host_forbidden")
    return Recovery(age, raw["generation"], raw["ciphertext_sha256"], raw["source_machine_id"],
                    destination, raw["max_sql_bytes"], raw["timeout_seconds"])


def verify_scratch(path):
    check(sys.platform == "linux" and os.geteuid() not in (0, UID), "isolated_recovery_account_required")
    # Scratch is deliberately made by the operator after reviewing its host, swap and account.
    # Do not accept the production home or an ordinary filesystem.
    check(path != HOME and not path.is_relative_to(HOME) and path.is_relative_to(Path("/run")),
          "isolated_run_scratch_required")
    private_dir(path, os.geteuid(), "scratch parent")
    mounts = []
    for line in Path("/proc/self/mountinfo").read_text().splitlines():
        before, _, after = line.partition(" - ")
        at = before.split()[4]
        mount = Path(re.sub(r"\\([0-7]{3})", lambda m: chr(int(m[1], 8)), at))
        if path.is_relative_to(mount):
            mounts.append((mount, after.split()))
    check(mounts, "scratch_mount_not_found")
    mount, (fs, _, options) = max(mounts, key=lambda x: len(x[0].parts))
    check(mount == path and fs == "tmpfs", "dedicated_scratch_mount_required")
    swaps = Path("/proc/swaps").read_text().splitlines()
    check("noswap" in options.split(",") or len(swaps) == 1, "unswappable_scratch_required")


def exact(source, size):
    chunks = bytearray()
    while len(chunks) < size:
        block = source.read(size - len(chunks))
        check(bool(block), "truncated_restore_stream")
        chunks.extend(block)
    return bytes(chunks)


def new_file(path):
    return os.fdopen(owned_fd(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY), "wb")


def unpack(cfg, source, scratch):
    """Read this format only. No link handling, extraction APIs or PAX extensions."""
    expected = set(CONFIG_MEMBERS) | set(KEY_MEMBERS)
    for path in ("config", "gpg", "jwt", "units"):
        (scratch / path).mkdir(mode=0o700)
    seen = set()
    found_manifest = False
    count = size = 0
    with new_file(scratch / "database.sql") as sql:
        while True:
            header = exact(source, 512)
            if not any(header):
                check(not any(exact(source, 512)), "invalid_tar_trailer")
                break
            try:
                member = tarfile.TarInfo.frombuf(header, "ascii", "strict")
            except (tarfile.HeaderError, UnicodeError, ValueError):
                raise JobError("invalid_tar_header") from None
            check(member.type == tarfile.REGTYPE and not member.linkname
                  and header[257:265] == b"ustar\x0000"
                  and not found_manifest, "invalid_tar_member")
            if member.name in expected:
                check(member.name not in seen and 0 < member.size <= SMALL_MAX, "invalid_restore_source")
                with new_file(scratch / member.name) as f:
                    f.write(exact(source, member.size))
                seen.add(member.name)
            elif member.name == f"sql/{count:06d}":
                check(0 < member.size <= BLOCK and size + member.size <= cfg.max_sql_bytes
                      and size == count * BLOCK, "invalid_sql_member")
                sql.write(exact(source, member.size))
                count += 1
                size += member.size
            elif member.name == "manifest.json":
                check(0 < member.size <= SMALL_MAX and seen == expected and count > 0,
                      "incomplete_restore_sources")
                actual = strict_json(exact(source, member.size))
                check(actual == manifest(cfg.source_machine_id, cfg.generation, count, size),
                      "generation_binding_failed")
                found_manifest = True
            else:
                raise JobError("unknown_tar_member")
            padding = (-member.size) % 512
            check(not any(exact(source, padding)), "invalid_tar_padding")
    check(found_manifest, "missing_manifest")
    trailer = 0
    while block := source.read(10240):
        trailer += len(block)
        check(trailer < 10240 and not any(block), "unexpected_tar_trailing_data")


@contextmanager
def destination(cfg):
    dest = cfg.destination
    check(dest is not None and dest.name not in ("", ".", ".."), "invalid_destination")
    verify_scratch(dest.parent)
    check(not dest.exists() and not dest.is_symlink(), "destination_occupied")
    check(shutil.disk_usage(dest.parent)[2] >= maximum_archive(cfg.max_sql_bytes),
          "insufficient_scratch_space")
    data_dir = Path(tempfile.mkdtemp(prefix=".pending-recovery-", dir=dest.parent))
    published = False
    reserved = False
    try:
        yield data_dir
        # mkdir reserves the approved pathname without replacing an existing file or directory.
        dest.mkdir(mode=0o700)
        reserved = True
        data_dir.rename(dest)
        published = True
    finally:
        if not published:
            shutil.rmtree(data_dir, ignore_errors=True)
            if reserved:
                dest.rmdir()


@contextmanager
def decrypted(cfg, archive, identity, runner, deadline):
    check(archive.name == cfg.generation and archive.resolve(strict=True) == archive,
          "archive_name_or_path_mismatch")
    private_dir(archive.parent, os.geteuid(), "ciphertext parent")
    with os.fdopen(owned_fd(archive), "rb") as source:
        state = os.fstat(source.fileno())
        check(source.read(len(HEADER)) == HEADER, "invalid_age_header")
        source.seek(0)
        _, observed = file_hash(source, maximum_archive(cfg.max_sql_bytes))
        check(observed == cfg.ciphertext_sha256, "ciphertext_pin_mismatch")
        source.seek(0)
        fd = source.fileno()
        with child(runner, "decrypt", [cfg.age, "-d", "-i", "-", f"/dev/fd/{fd}"],
                   stdin=identity, pass_fds=(fd,)) as proc:
            yield Pipe(proc.stdout, deadline)
            wait(proc, deadline, "decrypt")
        after = os.fstat(fd)
        check((after.st_size, after.st_mtime_ns, after.st_ctime_ns) ==
              (state.st_size, state.st_mtime_ns, state.st_ctime_ns), "archive_changed_during_restore")


def recover(cfg, archive, identity, runner):
    deadline = time.monotonic() + cfg.timeout_seconds
    with destination(cfg) as scratch, decrypted(cfg, archive, identity, runner, deadline) as stream:
        unpack(cfg, stream, scratch)


def stream_header(cfg):
    return encoded({"protocol": STREAM_PROTOCOL, "generation": cfg.generation,
                    "ciphertext_sha256": cfg.ciphertext_sha256, "source_machine_id": cfg.source_machine_id})


def write_frame(out, data):
    out.write(struct.pack(">I", len(data)))
    out.write(data)


def export_stream(cfg, archive, identity, out, runner, deadline=None):
    """Send plaintext over an authenticated private transport; no on-disk plaintext."""
    deadline = deadline if deadline is not None else time.monotonic() + cfg.timeout_seconds
    sha = hashlib.sha256()
    with decrypted(cfg, archive, identity, runner, deadline) as source:
        write_frame(out, stream_header(cfg))
        while data := source.read(BLOCK):
            sha.update(data)
            write_frame(out, data)
    # The receiver waits for this trailer and EOF. If age authenticates a prefix and then
    # fails, SSH can deliver that prefix, but the receiver never publishes it.
    write_frame(out, b"")
    out.write(sha.digest())


class FramedReader:
    def __init__(self, source, cfg):
        self.source = source
        expected = stream_header(cfg)
        check(self.size() == len(expected) and exact(source, len(expected)) == expected,
              "recovery_stream_pin_mismatch")
        self.hash = hashlib.sha256()
        self.left = 0
        self.ended = False

    def size(self):
        return struct.unpack(">I", exact(self.source, 4))[0]

    def read(self, size):
        if self.ended:
            return b""
        if self.left == 0:
            self.left = self.size()
            check(self.left <= BLOCK, "recovery_frame_size")
            if self.left == 0:
                check(exact(self.source, 32) == self.hash.digest() and not self.source.read(1),
                      "recovery_stream_trailer")
                self.ended = True
                return b""
        block = exact(self.source, min(self.left, size))
        self.hash.update(block)
        self.left -= len(block)
        return block


def receive_stream(cfg, source):
    with destination(cfg) as scratch:
        unpack(cfg, FramedReader(source, cfg), scratch)


def private_stream(stream):
    mode = os.fstat(stream.fileno()).st_mode
    return stat.S_ISFIFO(mode) or stat.S_ISSOCK(mode)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", required=True)
    parser.add_argument("--archive")
    parser.add_argument("--identity-stdin", action="store_true")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--export-stream", action="store_true")
    mode.add_argument("--receive-stream", action="store_true")
    args = parser.parse_args()
    if args.receive_stream:
        if args.archive or args.identity_stdin:
            parser.error("--receive-stream accepts only the protected stream on stdin")
    elif not args.archive or not args.identity_stdin:
        parser.error("--archive and --identity-stdin are required")
    os.umask(0o077)
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    with handle_signals():
        try:
            cfg = load_recovery(args.config, "receive" if args.receive_stream else
                                "export" if args.export_stream else "direct")
            deadline = time.monotonic() + cfg.timeout_seconds
            if args.receive_stream:
                check(private_stream(sys.stdin), "stdin_must_be_private_pipe")
                receive_stream(cfg, Pipe(sys.stdin.buffer, deadline))
            else:
                check(private_stream(sys.stdin), "identity_must_be_private_pipe")
                archive = safe_path(args.archive, "ciphertext archive")
                if args.export_stream:
                    check(private_stream(sys.stdout), "stdout_must_be_private_transport")
                    export_stream(cfg, archive, sys.stdin.buffer, Pipe(sys.stdout.buffer, deadline), Runner(), deadline)
                else:
                    recover(cfg, archive, sys.stdin.buffer, Runner())
        except (JobError, InvalidConfig, OSError, ValueError):
            print("Vault recovery validation failed; no restore was published.", file=sys.stderr)
            return 1
    if not args.export_stream:
        print('{"state":"verified_scratch","vendor_restore_required":true}')
    return 0


if __name__ == "__main__":
    sys.exit(main())
