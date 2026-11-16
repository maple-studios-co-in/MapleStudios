"""Synthetic fault injection. No PM2, live database, mail or Drive calls."""
import contextlib
import dataclasses
import hashlib
import io
import json
import os
import shutil
import signal
import socket
import sys
import struct
import subprocess
import tarfile
import tempfile
import time
import unittest
from unittest import mock
from datetime import datetime, timedelta, timezone
from pathlib import Path

import backup
import backup_watchdog
import restore_check

NOW = datetime(2026, 10, 16, 7, 45, tzinfo=timezone.utc)
DB_DATA = b"standalone database payload"
FILES_DATA = b"file payload"
SUMMARY = b'{"collections":[]}'


class Commands:
    def __init__(self, config):
        self.config = config
        self.apps = {backup.WEB: "online", backup.API: "stopped", "outside-maple": "online"}
        self.calls = []
        self.remote = {}
        self.fault = None
        self.term = False

    def run(self, args, *, timeout, limit=1024 * 1024, hash_output=False):
        self.calls.append(tuple(args))
        tool, *options = args
        if options == ["--version"]:
            return b"v1.2.3"
        if tool == self.config.tools["git"]:
            return b"deadbeef" * 5
        if tool == self.config.tools["pm2"]:
            verb, *rest = options
            if verb == "jlist":
                return json.dumps([{"name": name, "pm2_env": {"status": status}}
                                   for name, status in self.apps.items()]).encode()
            name, = rest
            if verb == "stop":
                self.apps[name] = "stopped"
                if self.term:
                    os.kill(os.getpid(), signal.SIGTERM)
            elif verb == "restart":
                self.apps[name] = "online"
            else:
                raise AssertionError(verb)
            return b""
        if tool == self.config.tools["mongosh"]:
            return SUMMARY
        self.assert_drive_options(options)
        verb, *rest = options[:options.index("--config")]
        item = rest[0].split(":", 1)[1]
        if verb == "about":
            return b'{"free":10737418240}'
        if verb == "lsjson":
            return json.dumps([{"Name": name, "Path": name, "ID": name, "Size": len(data), "IsDir": False}
                               for name, data in self.remote.items()]).encode()
        if verb == "copyto":
            raise AssertionError("copyto source should be local")
        if verb == "cat":
            if self.fault == "verify":
                data = b"wrong"
            else:
                data = self.remote[item]
            return (len(data), hashlib.sha256(data).hexdigest()) if hash_output else data
        if verb == "deletefile":
            if self.fault == "expiry":
                raise backup.JobError("command_failed")
            del self.remote[item]
            return b""
        raise AssertionError(verb)

    def probe(self, app, timeout):
        return self.apps[app] == "online"

    def assert_drive_options(self, options):
        assert "--drive-use-trash=false" in options
        assert "--drive-skip-shortcuts" in options
        assert str(self.config.folder_id) in options

    def chain(self, commands, *, timeout, output=None, input_data=None):
        self.calls.extend(map(tuple, commands))
        assert self.apps[backup.WEB] == "stopped"
        assert self.apps[backup.API] == "stopped"
        assert self.fault != "rclone_during_snapshot"
        if self.fault in {"dump", "age", "timeout"}:
            raise backup.JobError("command_timeout" if self.fault == "timeout" else "command_failed")
        assert output is not None
        output.write(b"ciphertext:" + hashlib.sha256(DB_DATA if input_data is None else FILES_DATA).digest())


class RunnerWithUpload(Commands):
    def run(self, args, **kwargs):
        if args[0] == self.config.tools["rclone"] and args[1] == "copyto":
            self.calls.append(tuple(args))
            self.assert_drive_options(args)
            assert self.apps[backup.WEB] == "online"
            assert self.apps[backup.API] == "stopped"
            if self.fault == "upload":
                raise backup.JobError("command_failed")
            item = args[3].split(":", 1)[1]
            self.remote[item] = Path(args[2]).read_bytes()
            return b""
        return super().run(args, **kwargs)


class BackupTests(unittest.TestCase):
    def setUp(self):
        self.env = tempfile.TemporaryDirectory()
        self.addCleanup(self.env.cleanup)
        self.logs = contextlib.ExitStack()
        self.addCleanup(self.logs.close)
        self.logs.enter_context(contextlib.redirect_stdout(io.StringIO()))
        self.logs.enter_context(contextlib.redirect_stderr(io.StringIO()))
        self.root = Path(self.env.name).resolve()
        for directory in ("out", "source", "state", "config"):
            (self.root / directory).mkdir(mode=0o700)
        self.config = backup.Config(
            settings_path=self.root / "config/job.json", deploy_lock=self.root / "state/deploy.lock",
            output_dir=self.root / "out", status_path=self.root / "state/status.json",
            revision_dir=self.root / "source",
            tools={name: f"/tool/{name}" for name in ("age", "git", "mongodump", "mongosh", "pm2", "rclone")},
            pm2_home=self.root / "state", recipient="age1" + "a" * 58,
            rclone_config=self.root / "config/drive.conf", rclone_remote="test_drive",
            folder_id="private_folder_id", job_id="1" * 32,
            mongo_config=self.root / "config/mongo.json", database="example",
            sources={"config": self.root / "source"},
            excluded_paths=[self.root / "source/skip"],
            maintenance_seconds=60, transfer_seconds=60, minimum_free_bytes=1024,
            alert={"from": "Ops <ops@example.invalid>", "to": "incident@example.invalid",
                   "key_file": str(self.root / "config/mail.key")},
        )
        self.runner = RunnerWithUpload(self.config)
        self.config_path = self.config.settings_path
        self.rclone_conf = f'[test_drive]\ntype = drive\nscope = drive.file\nroot_folder_id = {self.config.folder_id}\nclient_id = synthetic.apps.googleusercontent.com\nclient_secret = synthetic\ntoken = {{"refresh_token":"synthetic"}}\n'
        for path, content in ((self.config.mongo_config, '{"uri":"mongodb://127.0.0.1:27017/example"}'),
                              (self.config.rclone_config, self.rclone_conf),
                              (Path(self.config.alert["key_file"]), "synthetic")):
            path.write_text(content)
            path.chmod(0o600)

    def run_job(self, **kwargs):
        return backup.run_backup(self.config, self.runner, now=lambda: NOW, **kwargs)

    def status(self):
        return json.loads(self.config.status_path.read_text())

    def test_verified_upload_only_after_recovery_and_preserves_evidence(self):
        old = backup.default_status()
        old.update(lastRestoreVerifiedAt=backup.timestamp(NOW - timedelta(days=3)), legacyPlaintextCleared=True)
        backup.atomic_json(self.config.status_path, old)
        self.assertTrue(self.run_job())
        self.assertEqual(self.runner.apps, {backup.WEB: "online", backup.API: "stopped", "outside-maple": "online"})
        status = self.status()
        self.assertTrue(status["ok"])
        self.assertEqual(status["lastUploadVerifiedAt"], backup.timestamp(NOW))
        self.assertEqual(status["lastRestoreVerifiedAt"], old["lastRestoreVerifiedAt"])
        self.assertTrue(status["legacyPlaintextCleared"])
        self.assertEqual(self.config.status_path.stat().st_mode & 0o777, 0o600)
        self.assertEqual(len([k for k in self.runner.remote if k.endswith(".manifest.json")]), 1)
        for path in self.config.output_dir.glob("*/*.age"):
            self.assertTrue(path.read_bytes().startswith(b"ciphertext:"))

    def test_error_restarts_only_previously_online_and_never_reports_upload(self):
        for fault in ("dump", "age", "timeout", "upload", "verify"):
            with self.subTest(fault=fault):
                self.runner.fault = fault
                self.assertFalse(self.run_job())
                self.assertFalse(self.status()["ok"])
                self.assertIsNone(self.status()["lastUploadVerifiedAt"])
                self.assertEqual(self.runner.apps[backup.WEB], "online")
                self.assertEqual(self.runner.apps[backup.API], "stopped")
                self.assertFalse(any(k.endswith(".manifest.json") for k in self.runner.remote))
                self.assertFalse(any(path.read_bytes() in (DB_DATA, FILES_DATA)
                                     for path in self.config.output_dir.rglob("*") if path.is_file()))

    def test_nonoverlap_and_shared_deploy_lock_leave_previous_status_intact(self):
        self.assertTrue(self.run_job())
        prior = self.status()
        self.runner.calls.clear()
        for path in (self.config.run_lock, self.config.deploy_lock):
            with self.subTest(path=path), backup.lock(path) as fd:
                self.assertIsNotNone(fd)
                self.assertFalse(self.run_job())
            self.assertEqual(self.status(), prior)
            self.assertFalse(any(call[1] == "stop" for call in self.runner.calls))

    def test_bad_drive_credentials_fail_status_without_touching_pm2(self):
        self.assertTrue(self.run_job())
        self.runner.calls.clear()
        self.rclone_conf = self.rclone_conf.replace("drive.file", "drive")
        self.config.rclone_config.write_text(self.rclone_conf)
        self.assertFalse(self.run_job())
        self.assertFalse(self.status()["ok"])
        self.assertFalse(any(call[1] == "stop" for call in self.runner.calls))

    def test_low_disk_avoids_stopping_a_writer_and_fails_closed(self):
        with mock.patch.object(backup.shutil, "disk_usage",
                                        return_value=shutil._ntuple_diskusage(1000, 999, 1)):
            self.assertFalse(self.run_job())
        self.assertEqual(self.status()["error"], "disk_low")
        self.assertFalse(any(call[1] == "stop" for call in self.runner.calls))

    def test_termination_during_stop_recovers_application(self):
        self.runner.term = True
        term, interrupt = signal.getsignal(signal.SIGTERM), signal.getsignal(signal.SIGINT)
        signal.signal(signal.SIGTERM, backup.terminate)
        try:
            self.assertFalse(self.run_job())
        finally:
            signal.signal(signal.SIGTERM, term)
            signal.signal(signal.SIGINT, interrupt)
        self.assertEqual(self.runner.apps[backup.WEB], "online")
        self.assertFalse(self.status()["ok"])

    def test_watchdog_recovers_abandoned_maintenance_and_rate_bounds_stale_alerts(self):
        self.runner.apps[backup.WEB] = "stopped"
        backup.atomic_json(self.config.journal_path, {"version": 1, "online": [backup.WEB]})
        alerts = []
        for _ in range(2):
            backup_watchdog.watch(self.config, self.runner, now=lambda: NOW,
                                  send=lambda config, codes: alerts.append(codes))
        self.assertEqual(self.runner.apps[backup.WEB], "online")
        self.assertEqual(self.runner.apps[backup.API], "stopped")
        self.assertFalse(self.config.journal_path.exists())
        self.assertEqual(len(alerts), 1)
        self.assertIn("backup_stale", alerts[0])

    def test_exact_retention_boundary_clears_owned_objects_only_with_permanent_delete(self):
        started = NOW - timedelta(days=29)
        self.assertTrue(backup.run_backup(self.config, self.runner, now=lambda: started))
        owned = set(self.runner.remote)
        self.runner.remote["some-other-data.age"] = b"untouched"
        self.runner.remote[f"maple-{self.config.job_id}-unknown.db.age"] = b"untouched"
        backup.expire(self.config, self.runner, NOW - timedelta(microseconds=1))
        self.assertTrue(owned <= self.runner.remote.keys())
        backup.expire(self.config, self.runner, NOW)
        self.assertEqual(len(self.runner.remote), 2)
        self.assertTrue(all("--drive-use-trash=false" in cmd for cmd in self.runner.calls
                            if cmd[1] == "deletefile"))

    def test_partial_upload_expires_and_failed_expiry_is_visible(self):
        self.runner.fault = "verify"
        started = NOW - timedelta(days=29)
        self.assertFalse(backup.run_backup(self.config, self.runner, now=lambda: started))
        self.assertEqual(len(self.runner.remote), 1)
        self.runner.fault = "expiry"
        self.assertFalse(backup.run_backup(self.config, self.runner, now=lambda: NOW, expiry_only=True))
        self.assertEqual(self.status()["error"], "expiry_failed")
        self.assertEqual(len(self.runner.remote), 1)
        self.runner.fault = None
        self.assertTrue(backup.run_backup(self.config, self.runner, now=lambda: NOW, expiry_only=True))
        self.assertFalse(self.runner.remote)
        self.assertFalse(self.status()["ok"])

    def test_overdue_generation_is_removed_and_fails_retention_status(self):
        self.assertTrue(backup.run_backup(self.config, self.runner, now=lambda: NOW - timedelta(days=30)))
        status = self.status()
        self.assertFalse(backup.run_backup(self.config, self.runner, now=lambda: NOW, expiry_only=True))
        self.assertFalse(self.runner.remote)
        self.assertFalse(self.status()["ok"])
        self.assertEqual(self.status()["error"], "retention_overdue")
        self.assertEqual(self.status()["lastSuccessAt"], status["lastSuccessAt"])

    def test_streamed_tar_round_trip_excludes_auth_material(self):
        source = self.config.sources["config"]
        (source / ".env").write_bytes(FILES_DATA)
        (source / "skip").write_bytes(b"backup credential")
        raw = io.BytesIO()
        backup.pack_files(self.config, {"collections": []}, raw)
        self.assertNotIn(b"backup credential", raw.getvalue())
        target = self.root / "out/check"
        target.mkdir(mode=0o700)
        raw.seek(0)
        snapshot = restore_check.unpack(raw, target)
        self.assertEqual((target / "files/config/.env").read_bytes(), FILES_DATA)
        self.assertEqual(snapshot["files"]["files/config/.env"]["sha256"], hashlib.sha256(FILES_DATA).hexdigest())

    def test_no_more_than_two_authenticated_streams(self):
        sha = hashlib.sha256(b"ciphertext").digest()
        expected = {"bytes": 10, "sha256": sha.hex()}
        payload = struct.pack(">I", 3) + b"abc" + bytes(4) + struct.pack(">Q32s", 10, sha)
        with tempfile.TemporaryFile() as stream:
            stream.write(payload + payload[:5])
            stream.seek(0)
            reader = restore_check.FrameReader(stream.fileno(), time.monotonic() + 2, expected)
            self.assertEqual(reader.read(), b"abc")
            with self.assertRaises(backup.JobError):
                restore_check.FrameReader(stream.fileno(), time.monotonic() + 2, expected).read()

    def test_watchdog_configuration_survives_missing_source_and_transfer_tool(self):
        data = dataclasses.asdict(self.config)
        del data["settings_path"]
        data["tools"]["pm2"] = sys.executable
        data["tools"]["timeout"] = sys.executable
        self.config_path.write_text(json.dumps(data, default=str))
        self.config_path.chmod(0o600)
        self.config.revision_dir.rmdir()
        self.config.rclone_config.unlink()
        loaded = backup.load_config(self.config_path, check_credentials=False, recovery_only=True)
        self.assertEqual(loaded.journal_path, self.config.journal_path)

    def test_config_refuses_default_rclone_oauth_client(self):
        self.config.rclone_config.write_text(self.rclone_conf.replace(
            "client_id = synthetic.apps.googleusercontent.com\n", ""))
        with self.assertRaises(backup.JobError):
            backup.verify_drive_config(self.config)

    def test_untrusted_manifest_cannot_define_arbitrary_paths(self):
        gen = backup.new_generation(NOW)
        manifest = {"version": 1, "jobId": self.config.job_id, "generation": gen,
                    "createdAt": backup.timestamp(NOW), "archives": {"../evil": {}}}
        with self.assertRaises(backup.JobError):
            backup.validate_manifest(manifest, self.config.job_id, gen)

    def test_restore_refuses_traversal_symlink_and_production_ports(self):
        for name, kind in (("../escape", tarfile.REGTYPE), ("files/config/link", tarfile.SYMTYPE)):
            target = self.root / "out" / name.replace("/", "-").replace(".", "d")
            target.mkdir(mode=0o700)
            raw = io.BytesIO()
            with tarfile.open(fileobj=raw, mode="w") as tar:
                member = tarfile.TarInfo(name)
                member.type = kind
                member.linkname = "../escape"
                tar.addfile(member)
            raw.seek(0)
            with self.assertRaises(backup.JobError):
                restore_check.unpack(raw, target)
        for port in (27017, 3006, 4006):
            with self.assertRaises(backup.JobError):
                restore_check.verify_port(port)


class ProcessTests(unittest.TestCase):
    def test_pipeline_checks_every_exit_and_reaps_timed_out_children(self):
        runner = backup.Runner()
        with tempfile.TemporaryFile() as out:
            ok = [sys.executable, "-c", "import sys; sys.stdout.buffer.write(b'payload')"]
            consumer = [sys.executable, "-c", "import hashlib,sys; print(hashlib.sha256(sys.stdin.buffer.read()).hexdigest())"]
            runner.chain([ok, consumer], timeout=3, output=out)
            with self.assertRaises(backup.JobError):
                runner.chain([[sys.executable, "-c", "import sys; print('partial'); sys.exit(9)"], consumer],
                             timeout=3, output=out)
            started = time.monotonic()
            with self.assertRaises(backup.JobError):
                runner.chain([[sys.executable, "-c", "import time; time.sleep(30)"], consumer],
                             timeout=0.1, output=out)
            self.assertLess(time.monotonic() - started, 5)
            out.seek(0)
            self.assertEqual(out.readline().decode().strip(), hashlib.sha256(b"payload").hexdigest())
            self.assertNotIn(b"payload", out.read())


MONGO_TOOLS = {
    "mongosh": os.environ.get("MAPLE_TEST_MONGOSH") or shutil.which("mongosh"),
    **{name: shutil.which(name) for name in ("mongod", "mongodump", "mongorestore", "age")},
}


@unittest.skipUnless(all(MONGO_TOOLS.values()), "Requires age and MongoDB tools (MAPLE_TEST_MONGOSH can set mongosh path)")
class DisposableRestoreTests(unittest.TestCase):
    # Public fixture from the official age-keygen manual, exclusively for synthetic data.
    public = "age1lvyvwawkr0mcnnnncaghunadrqkmuf9e6507x9y920xxpp866cnql7dp2z"
    identity = b"AGE-SECRET-KEY-1N9JEPW6DWJ0ZQUDX63F5A03GX8QUW7PXDE39N8UYF82VZ9PC8UFS3M7XA9\n"
    job_id = "1" * 32

    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        self.runner = backup.Runner()
        self.source_port = self.free_port()
        source = self.root / "source"
        source.mkdir(mode=0o700)
        mongo = self.runner.spawn([MONGO_TOOLS["mongod"], "--dbpath", str(source), "--bind_ip", "127.0.0.1",
                                  "--port", str(self.source_port), "--nounixsocket"], timeout=30)
        self.addCleanup(self.runner.finish, [mongo])
        self.uri = f"mongodb://127.0.0.1:{self.source_port}/synthetic?directConnection=true&serverSelectionTimeoutMS=1000"
        ready = time.monotonic() + 15
        while True:
            try:
                self.assertEqual(self.shell(self.uri, "print(db.serverStatus().pid.toString())").strip(),
                                 str(mongo.pid).encode())
                break
            except backup.JobError:
                if mongo.poll() is not None or time.monotonic() >= ready:
                    raise
                time.sleep(0.2)
        self.shell(self.uri, "db.sample.insertOne({_id:1, value:'initial'}); db.sample.createIndex({value:1,_id:-1})")
        self.restore_port = self.free_port()
        scratch = self.root / "maple-restore-scratch"
        scratch.mkdir(mode=0o700)
        self.config = {"scratch_dir": scratch, "timeout_seconds": 60, "port": self.restore_port, "tools": MONGO_TOOLS}

    @staticmethod
    def free_port():
        for port in range(53452, 53552):
            try:
                restore_check.verify_port(port)
            except backup.JobError:
                continue
            return port
        raise AssertionError("no free disposable test port")

    def shell(self, uri, script):
        return backup.mongo_run(self.runner, [MONGO_TOOLS["mongosh"], "--norc", "--quiet", uri, "--eval", script],
                                timeout=5)

    def generation(self, label, *, document_label=None):
        encrypted = self.root / label
        encrypted.mkdir(mode=0o700)
        source = self.root / f"{label}.txt"
        source.write_text(f"synthetic file for generation {label}")
        self.shell(self.uri, f"db.sample.updateOne({{_id:1}},{{$set:{{value:{json.dumps(document_label or label)}}}}})")
        capture = type("Capture", (), {"sources": {"config": source}, "exclusions": (), "database": "synthetic"})()
        raw = io.BytesIO()
        snapshot = backup.validate_summary(backup.mongo_run(
            self.runner, backup.mongo_summary_args(MONGO_TOOLS["mongosh"], "synthetic", port=self.source_port),
            timeout=8))
        backup.pack_files(capture, snapshot, raw)
        gen = backup.new_generation(NOW)
        prefix = f"maple-{self.job_id}-{gen}"
        paths = {archive: encrypted / (prefix + "." + archive) for archive in backup.ARCHIVES}
        age = [MONGO_TOOLS["age"], "-r", self.public]
        with os.fdopen(os.open(paths["database.age"], os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600), "wb") as db:
            self.runner.chain([[MONGO_TOOLS["mongodump"], "--uri", self.uri, "--archive", "--gzip"], age],
                              timeout=15, output=db)
        with os.fdopen(os.open(paths["files.tar.age"], os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600), "wb") as files:
            self.runner.chain([age], timeout=10, output=files, input_data=raw.getvalue())
        manifest = encrypted / (prefix + ".manifest.json")
        backup.atomic_json(manifest, {
            "version": 1, "jobId": self.job_id, "generation": gen, "createdAt": backup.timestamp(NOW),
            "revision": "1" * 40, "recipientId": "2" * 64,
            "tools": {tool: "1.2.3" for tool in ("age", "mongodump", "mongosh", "rclone")},
            "archives": {name: backup.file_digest(path) for name, path in paths.items()},
        })
        return encrypted, paths, manifest

    def send(self, paths, stream):
        with subprocess.Popen(("/bin/cat", str(paths["files.tar.age"])), stdout=subprocess.PIPE) as files:
            with subprocess.Popen(("/bin/cat", str(paths["database.age"])), stdout=subprocess.PIPE) as db:
                restore_check.send_stream(MONGO_TOOLS["age"], files.stdout.fileno(), db.stdout.fileno(),
                                          self.identity, output=stream.fileno(), timeout=15)

    def test_receipt_binds_the_generation_actually_decrypted(self):
        wrong_dir, _, _ = self.generation("different")
        correct_dir, actual_paths, actual_manifest = self.generation("actual")
        evidence = self.root / "receipt.json"
        with tempfile.TemporaryFile() as frames:
            self.send(actual_paths, frames)
            frames.seek(0)
            with self.assertRaises(backup.JobError):
                restore_check.check(wrong_dir, self.job_id, self.config, b"", evidence, framed_input=frames.fileno())
            self.assertFalse(evidence.exists())
            frames.seek(0)
            restore_check.check(correct_dir, self.job_id, self.config, b"", evidence, framed_input=frames.fileno())
        # Re-encrypt the same Mongo snapshot under a fresh ephemeral age file header.
        # The contents are identical but the database ciphertext no longer matches the manifest.
        _, equivalent_paths, _ = self.generation("actual-reencoded", document_label="actual")
        mixed = {**actual_paths, "database.age": equivalent_paths["database.age"]}
        wrong_database_receipt = self.root / "wrong-db-receipt.json"
        with tempfile.TemporaryFile() as frames:
            self.send(mixed, frames)
            frames.seek(0)
            with self.assertRaisesRegex(backup.JobError, "stream_ciphertext_mismatch"):
                restore_check.check(correct_dir, self.job_id, self.config, b"", wrong_database_receipt,
                                    framed_input=frames.fileno())
            self.assertFalse(wrong_database_receipt.exists())
        receipt = json.loads(evidence.read_bytes())
        self.assertEqual(receipt["manifestSha256"], hashlib.sha256(actual_manifest.read_bytes()).hexdigest())
        self.assertEqual(receipt["generation"], json.loads(actual_manifest.read_bytes())["generation"])
        self.assertFalse(list(self.config["scratch_dir"].iterdir()))

    def test_unrelated_loopback_client_cannot_read_or_write_restored_records(self):
        encrypted, paths, _ = self.generation("private")
        evidence = self.root / "receipt.json"
        original = restore_check.pipe_mongo
        checked = []

        def inspect_while_running(runner, args, source, end):
            original(runner, args, source, end)
            with self.assertRaises(OSError):
                with socket.create_connection(("127.0.0.1", self.restore_port), timeout=0.4):
                    pass
            config = Path(args[args.index("--config") + 1])
            config_mode = config.stat().st_mode & 0o777
            self.assertEqual(config_mode, 0o600)
            # Even a client that knows the Unix socket path needs the temporary password.
            uri = "mongodb://" + json.loads(config.read_bytes())["uri"].split("@", 1)[1]
            for operation in ("db.sample.findOne()", "db.sample.insertOne({_id:2})"):
                script = f"try {{ {operation}; print('access granted') }} catch (error) {{ print(error.code) }}"
                self.assertEqual(self.shell(uri, script).strip(), b"13")
            checked.append(True)

        with tempfile.TemporaryFile() as frames:
            self.send(paths, frames)
            frames.seek(0)
            with mock.patch.object(restore_check, "pipe_mongo", side_effect=inspect_while_running):
                restore_check.check(encrypted, self.job_id, self.config, b"", evidence, framed_input=frames.fileno())
        self.assertEqual(checked, [True])
        self.assertTrue(evidence.exists())
        self.assertFalse(list(self.config["scratch_dir"].iterdir()))
        local_evidence = self.root / "local-receipt.json"
        restore_check.check(encrypted, self.job_id, self.config, self.identity, local_evidence)
        self.assertEqual(json.loads(local_evidence.read_bytes())["manifestSha256"],
                         json.loads(evidence.read_bytes())["manifestSha256"])
        self.assertFalse(list(self.config["scratch_dir"].iterdir()))


if __name__ == "__main__":
    unittest.main()
