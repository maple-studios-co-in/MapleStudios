"""Offline tests. Test identity is a published age example, never a vault key."""
from contextlib import contextmanager
import datetime as dt
import fcntl
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

import backup
import restore


# https://github.com/FiloSottile/age/blob/main/age_test.go (ExampleDecrypt)
IDENTITY = b"AGE-SECRET-KEY-184JMZMVQH3E6U0PSL869004Y3U2NYV7R30EU99CSEDNPH02YUVFSZW44VU\n"
RECIPIENT = "age1cy0su9fwf3gf9mw868g5yut09p6nytfmmnktexz2ya5uqg9vl9sss4euqm"
AGE = shutil.which("age") or ("/opt/homebrew/bin/age" if Path("/opt/homebrew/bin/age").exists() else None)
NOW = dt.datetime(2026, 11, 16, 12, tzinfo=dt.timezone.utc)
SOURCE = "a" * 32
JOB = "c" * 24
SQL = b"CREATE TABLE fixture (x varchar(10));\nINSERT INTO fixture VALUES ('sample');\n"
MAX = 2 * 1024 * 1024


class FixtureRunner:
    """Genuine subprocess/pipe lifecycle with stand-ins for Linux vendor tools and Drive."""
    def __init__(self, failure=None):
        self.failure = failure
        self.events = []
        self.remote = {}
        self.children = []
        self.live = True
        self.runner = backup.Runner()

    @property
    def lock_fd(self):
        return self.runner.lock_fd

    @lock_fd.setter
    def lock_fd(self, fd):
        self.runner.lock_fd = fd

    def spawn(self, stage, args, **kwargs):
        self.events.append(stage)
        code = "pass"
        params = []
        if stage == self.failure:
            if stage == "dump":
                code = "import os; os.write(1,b'partial SQL'); raise SystemExit(5)"
            elif stage == "encrypt":
                code = "raise SystemExit(5)"
            else:
                code = "raise SystemExit(5)"
        elif stage == "engine-check":
            code = "print(1)"
        elif stage in ("inspect-image", "pinned-image"):
            code = "print('f' * 64)"
        elif stage == "vault-storage":
            code, params = "import sys; print(sys.argv[1])", ["true\n" + str(self.graphroot)]
        elif stage == "inspect-mounts":
            mounts = (list(backup.VOLUMES.items())[:2] if args[-1] == backup.APP
                      else [("systemd-vault-db", "/var/lib/mysql")])
            value = [{"Type": "volume", "Name": k, "Destination": v,
                      "Source": str(self.graphroot / "volumes" / k / "_data")} for k, v in mounts]
            code, params = "import sys; print(sys.argv[1])", [json.dumps(value)]
        elif stage == "dump":
            code, params = "import os,sys; os.write(1,os.fsencode(sys.argv[1]))", [SQL.decode()]
        elif stage == "keys":
            keypath = Path(args[-1])
            vol = keypath.parent.parent.name
            code, params = "import os,sys; os.write(1,os.fsencode(sys.argv[1]))", [
                str(Path(backup.VOLUMES[vol]) / keypath.name) + " material"
            ]
        elif stage == "stop-app":
            self.live = False
        elif stage == "resume-app":
            self.live = True
        elif stage == "catalog":
            code, params = "import sys; print(sys.argv[1])", [json.dumps([
                {"Path": k, "Name": k, "Size": len(v), "ID": "id-" + str(i),
                 "IsDir": False, "MimeType": "application/octet-stream"}
                for i, (k, v) in enumerate(self.remote.items())
            ])]
        elif stage == "upload":
            self.remote[args[-1].split(":", 1)[1]] = Path(args[-2]).read_bytes()
        elif stage == "download":
            code, params = "import os,sys; os.write(1,bytes.fromhex(sys.argv[1]))", [
                self.remote[args[-1].split(":", 1)[1]].hex()
            ]
        elif stage == "expire":
            self.remote.pop(args[-1].split(":", 1)[1])
        if stage not in ("encrypt", "decrypt") or stage == self.failure:
            args = [sys.executable, "-c", code, *params]
        process = self.runner.spawn(stage, args, **kwargs)
        self.children.append(process)
        return process


@unittest.skipUnless(AGE, "requires the published-vector age CLI")
class BackupRoundTrip(unittest.TestCase):
    @contextmanager
    def identity(self):
        r, w = os.pipe()
        with os.fdopen(w, "wb") as pipe:
            pipe.write(IDENTITY)
        with os.fdopen(r, "rb") as pipe:
            yield pipe

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name).resolve()
        self.stage = self.home / "staging"
        self.records = self.home / "records"
        for d in (self.stage, self.records):
            d.mkdir(mode=0o700)
        self.sources = {}
        for i, name in enumerate(backup.CONFIG_MEMBERS):
            p = self.home / f"source-{i}"
            p.write_text(f"CONFIG {name}")
            p.chmod(0o600)
            self.sources[name] = p
        self.job = backup.Job(
            tools={key: AGE for key in backup.TOOL_NAMES},
            home=self.home, sources=self.sources,
            staging=self.stage, journal=self.records, status=self.home / "status.json",
            lock=self.home / "backup.lock", recipient=RECIPIENT, job_id=JOB,
            source_machine_id=SOURCE, rclone_config=self.home / "rclone.conf", remote="vault",
            max_sql_bytes=MAX, reserve_bytes=1, capture_seconds=5, remote_seconds=12,
        )
        self.disk = patch.object(backup.shutil, "disk_usage", return_value=(100 << 30, 0, 100 << 30))
        self.disk.start()
        self.addCleanup(self.disk.stop)

    def run_job(self, runner, now=NOW, expiry_only=False):
        runner.graphroot = self.home / "storage"
        runner.graphroot.mkdir(exist_ok=True)
        return backup.run_job(self.job, runner, now=lambda: now, expiry_only=expiry_only)

    def status(self):
        return json.loads(self.job.status.read_bytes())

    def test_real_age_round_trip_covers_each_required_source(self):
        runner = FixtureRunner()
        self.assertTrue(self.run_job(runner))
        self.assertTrue(runner.live)
        self.assertEqual(list(self.stage.iterdir()), [])
        (name, ciphertext), = runner.remote.items()
        self.assertTrue(ciphertext.startswith(b"age-encryption.org/v1\n"))
        self.assertNotIn(SQL, ciphertext)
        archive = self.home / name
        archive.write_bytes(ciphertext)
        archive.chmod(0o600)
        stash = self.home / "verified"
        cfg = self.recovery_config(name, ciphertext, stash)
        with patch.object(restore, "verify_scratch"):
            with self.identity() as identity:
                restore.recover(cfg, archive, identity, runner)
        self.assertEqual((stash / "database.sql").read_bytes(), SQL)
        self.assertEqual((stash / "database.sql").stat().st_mode & 0o777, 0o600)
        for name, p in self.sources.items():
            self.assertEqual((stash / name).read_bytes(), p.read_bytes())
        for name, volume_path in backup.KEY_MEMBERS.items():
            self.assertEqual((stash / name).read_text(), volume_path + " material")
        self.assertLess(runner.events.index("stop-app"), runner.events.index("dump"))
        self.assertLess(runner.events.index("resume-app"), runner.events.index("upload"))

    def recovery_config(self, name, ciphertext, dest):
        return restore.Recovery(
            age=AGE, generation=name, ciphertext_sha256=hashlib.sha256(ciphertext).hexdigest(),
            source_machine_id=SOURCE, destination=dest, max_sql_bytes=MAX, timeout_seconds=8,
        )

    def test_failures_record_failure_and_remove_partial_without_false_success(self):
        for failure in ("dump", "encrypt", "upload", "download"):
            with self.subTest(failure=failure):
                runner = FixtureRunner(failure)
                self.assertFalse(self.run_job(runner, NOW + dt.timedelta(seconds=len(runner.remote))))
                self.assertTrue(runner.live)
                self.assertEqual(list(self.stage.iterdir()), [])
                self.assertEqual(self.status()["state"], "failed")
                self.assertIsNone(self.status()["last_success"])
                self.assertTrue(all(p.poll() is not None for p in runner.children))

    def test_changed_remote_ciphertext_does_not_pass_verification(self):
        class CorruptRemote(FixtureRunner):
            def spawn(self, stage, args, **kwargs):
                if stage == "download":
                    name = args[-1].split(":", 1)[1]
                    self.remote[name] = bytes([self.remote[name][0] ^ 1]) + self.remote[name][1:]
                return super().spawn(stage, args, **kwargs)

        self.assertFalse(self.run_job(CorruptRemote()))
        self.assertIsNone(self.status()["last_success"])

    def test_container_mount_drift_fails_before_the_app_is_stopped(self):
        class MountDrift(FixtureRunner):
            def spawn(self, stage, args, **kwargs):
                if stage == "inspect-mounts":
                    mounts = (list(backup.VOLUMES.items())[:2] if args[-1] == backup.APP
                              else [("systemd-vault-db", "/var/lib/mysql")])
                    data = [{"Type": "volume", "Name": k, "Destination": v, "Source": "/elsewhere"}
                            for k, v in mounts]
                    return self.runner.spawn(stage, [sys.executable, "-c", "import sys; print(sys.argv[1])",
                                                    json.dumps(data)], **kwargs)
                return super().spawn(stage, args, **kwargs)

        runner = MountDrift()
        self.assertFalse(self.run_job(runner))
        self.assertNotIn("stop-app", runner.events)

    def test_termination_reaps_pipeline_and_restarts_app(self):
        class Interrupt(FixtureRunner):
            def spawn(self, stage, args, **kwargs):
                if stage == "dump":
                    os.kill(os.getpid(), signal.SIGTERM)
                return super().spawn(stage, args, **kwargs)

        runner = Interrupt()
        with backup.handle_signals():
            self.assertFalse(self.run_job(runner))
        self.assertTrue(runner.live)
        self.assertTrue(all(p.poll() is not None for p in runner.children))
        self.assertEqual(list(self.stage.iterdir()), [])

    def test_lock_collision_preserves_running_status(self):
        self.job.status.write_text('{"state":"running","last_success":null}')
        self.job.status.chmod(0o600)
        with self.job.lock.open("x+b") as lock:
            self.job.lock.chmod(0o600)
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.assertFalse(self.run_job(FixtureRunner()))
        self.assertEqual(self.status()["state"], "running")

    def test_insufficient_space_leaves_app_available_and_no_archive(self):
        with patch.object(backup.shutil, "disk_usage", return_value=(100 << 30, 99 << 30, 1 << 30)):
            runner = FixtureRunner()
            self.assertFalse(self.run_job(runner))
        self.assertTrue(runner.live)
        self.assertNotIn("stop-app", runner.events)
        self.assertEqual(list(self.stage.iterdir()), [])

    def test_expiry_deletes_only_known_generations_at_day_29(self):
        runner = FixtureRunner()
        self.assertTrue(self.run_job(runner))
        known, = runner.remote
        lookalike = known.replace("20261116", "20261001")
        runner.remote[lookalike] = b"not produced by this job"
        runner.remote["owner-bootstrap.age"] = b"outside rolling retention"
        self.assertTrue(self.run_job(runner, NOW + dt.timedelta(days=28), True))
        self.assertIn(known, runner.remote)
        self.assertTrue(self.run_job(runner, NOW + dt.timedelta(days=29), True))
        self.assertEqual(set(runner.remote), {lookalike, "owner-bootstrap.age"})

    def test_expiry_does_not_delete_an_object_with_changed_bytes(self):
        runner = FixtureRunner()
        self.assertTrue(self.run_job(runner))
        name, = runner.remote
        runner.remote[name] = bytes([runner.remote[name][0] ^ 1]) + runner.remote[name][1:]
        self.assertFalse(self.run_job(runner, NOW + dt.timedelta(days=29), True))
        self.assertIn(name, runner.remote)
        self.assertNotIn("expire", runner.events)

    def test_expiry_error_and_late_deletion_are_reported(self):
        runner = FixtureRunner()
        self.assertTrue(self.run_job(runner))
        runner.failure = "expire"
        self.assertFalse(self.run_job(runner, NOW + dt.timedelta(days=29), True))
        self.assertEqual(len(runner.remote), 1)
        runner.failure = None
        self.assertFalse(self.run_job(runner, NOW + dt.timedelta(days=30), True))
        self.assertEqual(runner.remote, {})
        self.assertEqual(self.status()["state"], "failed")
        self.assertIsNotNone(self.status()["last_success"])

    def test_truncated_recovery_stream_is_never_published(self):
        runner = FixtureRunner()
        self.assertTrue(self.run_job(runner))
        (name, ciphertext), = runner.remote.items()
        archive = self.home / name
        archive.write_bytes(ciphertext)
        archive.chmod(0o600)
        dest = self.home / "verified"
        cfg = self.recovery_config(name, ciphertext, dest)
        payload = io.BytesIO()
        with self.identity() as identity:
            restore.export_stream(cfg, archive, identity, payload, runner)
        result = payload.getvalue()
        with patch.object(restore, "verify_scratch"):
            with self.assertRaises(backup.JobError):
                restore.receive_stream(cfg, io.BytesIO(result[:-1]))
            self.assertFalse(dest.exists())
            restore.receive_stream(cfg, io.BytesIO(result))
        self.assertEqual((dest / "database.sql").read_bytes(), SQL)
        self.assertNotIn(IDENTITY.strip(), result)

    def test_restore_rejects_tampered_ciphertext(self):
        runner = FixtureRunner()
        self.assertTrue(self.run_job(runner))
        (name, ciphertext), = runner.remote.items()
        archive = self.home / name
        archive.write_bytes(ciphertext[:-1] + bytes([ciphertext[-1] ^ 1]))
        archive.chmod(0o600)
        dest = self.home / "verified"
        for pinned in (ciphertext, archive.read_bytes()):
            with self.subTest(wrong_sha=pinned == ciphertext), patch.object(restore, "verify_scratch"):
                with self.assertRaises(backup.JobError), self.identity() as identity:
                    restore.recover(self.recovery_config(name, pinned, dest), archive, identity, runner)
                self.assertFalse(dest.exists())

    def test_restore_rejects_traversal_wrong_generation_and_occupied_target(self):
        runner = FixtureRunner()
        self.assertTrue(self.run_job(runner))
        (name, ciphertext), = runner.remote.items()
        archive = self.home / name
        archive.write_bytes(ciphertext)
        archive.chmod(0o600)
        with archive.open("rb") as f:
            decrypted = subprocess.check_output([AGE, "-d", "-i", "-", f"/dev/fd/{f.fileno()}"],
                                                input=IDENTITY, pass_fds=(f.fileno(),))
        for case in ("traversal", "generation", "occupied"):
            with self.subTest(case=case), patch.object(restore, "verify_scratch"):
                dest = self.home / f"verified-{case}"
                if case == "occupied":
                    dest.mkdir(mode=0o700)
                    (dest / "existing").write_text("keep")
                    attack = ciphertext
                else:
                    data = io.BytesIO()
                    with tarfile.open(fileobj=io.BytesIO(decrypted)) as source, tarfile.open(fileobj=data, mode="w") as out:
                        if case == "traversal":
                            member = tarfile.TarInfo("../../escaped")
                            member.size = 3
                            out.addfile(member, io.BytesIO(b"bad"))
                        for member in source:
                            value = source.extractfile(member).read()
                            if case == "generation" and member.name == "manifest.json":
                                manifest = json.loads(value)
                                manifest["generation"] = name.replace("20261116", "20261001")
                                value = json.dumps(manifest).encode()
                                member.size = len(value)
                            out.addfile(member, io.BytesIO(value))
                    attack = subprocess.check_output([AGE, "-r", RECIPIENT], input=data.getvalue())
                archive.write_bytes(attack)
                with self.assertRaises(backup.JobError), self.identity() as identity:
                    restore.recover(self.recovery_config(name, attack, dest), archive, identity, runner)
                if case == "occupied":
                    self.assertEqual((dest / "existing").read_text(), "keep")
                else:
                    self.assertFalse(dest.exists())
                self.assertFalse((self.home.parent / "escaped").exists())


if __name__ == "__main__":
    unittest.main()
