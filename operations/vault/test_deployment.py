import importlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch


HERE = Path(__file__).resolve().parent
GIB = 1 << 30


class PreflightTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue((HERE / "preflight.py").is_file(), "preflight is not implemented")
        self.preflight = importlib.import_module("preflight")

    def test_capacity_boundaries(self):
        threshold = self.preflight.required_bytes
        self.assertEqual(threshold("before-pull", 0), 30 * GIB)
        self.assertEqual(threshold("after-install", 2 * GIB), 22 * GIB)
        for phase, reserve, minimum in (("before-pull", 0, 30 * GIB),
                                         ("after-install", 123, 20 * GIB + 123)):
            with self.subTest(phase=phase):
                with self.assertRaises(ValueError):
                    threshold(phase, -1)
                for available, expected in ((minimum - 1, False), (minimum, True)):
                    with patch.object(self.preflight.shutil, "disk_usage",
                                      return_value=SimpleNamespace(free=available)):
                        self.assertEqual(self.preflight.capacity(Path("/"), phase, reserve)["ok"], expected)
        with self.assertRaises(ValueError):
            threshold("after-install", 0)

    def test_account_requires_existing_dedicated_identity(self):
        module = self.preflight
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory).resolve()
            account = SimpleNamespace(pw_uid=os.geteuid(), pw_gid=os.getegid(),
                                      pw_dir=str(home), pw_shell="/usr/sbin/nologin")
            group = SimpleNamespace(gr_name="maple-vault", gr_mem=[])
            with patch.object(module.pwd, "getpwnam", return_value=account), \
                 patch.object(module.grp, "getgrgid", return_value=group), \
                 patch.object(module.os, "getgrouplist", return_value=[os.getegid()]):
                self.assertTrue(module.account_check(home, os.geteuid())["ok"])
                self.assertFalse(module.account_check(home, os.geteuid() + 1)["ok"])
                self.assertFalse(module.account_check(home / "other", None)["ok"])
                home.chmod(0o755)
                self.assertFalse(module.account_check(home, None)["ok"])
                home.chmod(0o700)
                group.gr_mem.append("deploy")
                self.assertFalse(module.account_check(home, None)["ok"])
                group.gr_mem.clear()
                account.pw_shell = "/bin/bash"
                self.assertFalse(module.account_check(home, None)["ok"])
            with patch.object(module.pwd, "getpwnam", side_effect=KeyError):
                self.assertFalse(module.account_check(home, None)["ok"])

    def test_port_reserved_before_pull_and_loopback_only_after_install(self):
        for addresses, expected_before, expected_after in [
            ([], True, False),
            (["127.0.0.1"], False, True),
            (["0.0.0.0"], False, False),
            (["[::]"], False, False),
            (["127.0.0.1", "[::]"], False, False),
        ]:
            with self.subTest(addresses=addresses):
                listeners = "LISTEN 0 128 127.0.0.1:443 0.0.0.0:*\n" + "".join(
                    f"LISTEN 0 128 {address}:18080 0.0.0.0:*\n" for address in addresses
                )
                with patch.object(self.preflight, "command_output", return_value=listeners):
                    self.assertEqual(self.preflight.port_check("before-pull", 18080)["ok"], expected_before)
                    self.assertEqual(self.preflight.port_check("after-install", 18080)["ok"], expected_after)

    def test_preflight_returns_safe_json_for_unavailable_account(self):
        result = subprocess.run(
            [sys.executable, str(HERE / "preflight.py"), "--home",
             "/home/maple-vault-test-absent", "--phase", "before-pull", "--reserve-bytes", "0"],
            capture_output=True, text=True, check=False,
        )
        self.assertEqual(result.returncode, 1, result.stderr)
        checks = json.loads(result.stdout)
        self.assertFalse(checks["ok"])
        self.assertFalse(checks["account"]["ok"])
        self.assertFalse(Path("/home/maple-vault-test-absent").exists())
        self.assertEqual(result.stderr, "")


class RenderTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.home = Path(temp.name).resolve()
        self.output = self.home / "rendered"
        self.config = self.home / "deploy.json"
        self.app_env = self.home / "app.env"
        self.db_env = self.home / "db.env"
        for path in (self.app_env, self.db_env):
            path.write_text("SYNTHETIC=fixture_value_must_not_be_copied\n")
            path.chmod(0o600)
        self.settings = {
            "hostname": "vault.example.test",
            "uid": os.geteuid(),
            "home": str(self.home),
            "app_bind": "127.0.0.1",
            "app_port": 18080,
            "app_image": "docker.io/passbolt/passbolt@sha256:" + "a" * 64,
            "db_image": "docker.io/library/mariadb@sha256:" + "b" * 64,
            "app_env": str(self.app_env),
            "db_env": str(self.db_env),
            "tls_certificate": "/etc/letsencrypt/live/vault.example.test/fullchain.pem",
            "tls_certificate_key": "/etc/letsencrypt/live/vault.example.test/privkey.pem",
            "memory_bytes": 2_000_000_000,
            "cpu_quota_percent": 200,
            "reserve_bytes": GIB,
        }
        self.write_config()

    def write_config(self):
        self.config.write_text(json.dumps(self.settings))
        self.config.chmod(0o600)

    def run_render(self):
        return subprocess.run(
            [sys.executable, str(HERE / "render.py"), "--config", str(self.config),
             "--output", str(self.output)], capture_output=True, text=True, check=False,
        )

    def assert_rejection(self, message):
        before = {p.name for p in self.home.iterdir()}
        result = self.run_render()
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertIn(message, result.stderr)
        self.assertEqual(result.stdout, "")
        self.assertEqual({p.name for p in self.home.iterdir()}, before)

    def test_rendered_units_are_private_and_publish_only_loopback(self):
        result = self.run_render()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(stat.S_IMODE(self.output.stat().st_mode), 0o700)
        names = {path.name for path in self.output.iterdir()}
        self.assertEqual(names, {"vault.container", "vault-db.container", "vault.network",
                                 "vault.volume", "vault-jwt.volume", "vault-db.volume",
                                 "vault.slice", "nginx.conf"})
        rendered = {}
        for path in self.output.iterdir():
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
            rendered[path.name] = path.read_text()
            self.assertNotIn("fixture_value_must_not_be_copied", rendered[path.name])
        app = rendered["vault.container"]
        db = rendered["vault-db.container"]
        self.assertEqual([line for line in app.splitlines() if line.startswith("PublishPort=")],
                         ["PublishPort=127.0.0.1:18080:8080"])
        self.assertNotIn("PublishPort=", db)
        for unit in (app, db):
            self.assertIn("Network=vault.network", unit)
            self.assertIn("Slice=vault.slice", unit)
            self.assertIn("NoNewPrivileges=true", unit)
            self.assertIn("Pull=never", unit)
            self.assertNotRegex(unit, r"(?m)^Volume=/|--privileged|--network=host")
        self.assertIn("vault.volume:/etc/passbolt/gpg", app)
        self.assertIn("vault-jwt.volume:/etc/passbolt/jwt", app)
        self.assertIn("vault-db.volume:/var/lib/mysql", db)
        self.assertIn("MemoryMax=2000000000", rendered["vault.slice"])
        self.assertIn("CPUQuota=200%", rendered["vault.slice"])
        self.assertIn("proxy_pass http://127.0.0.1:18080;", rendered["nginx.conf"])
        self.assertIn("proxy_set_header X-Forwarded-Proto https;", rendered["nginx.conf"])
        self.assertIn("access_log off;", rendered["nginx.conf"])

    def test_non_loopback_bind_is_rejected(self):
        self.settings["app_bind"] = "0.0.0.0"
        self.write_config()
        self.assert_rejection("app_bind")

    def test_database_publish_request_is_rejected(self):
        self.settings["db_publish_port"] = 3306
        self.write_config()
        self.assert_rejection("configuration fields")

    def test_mutable_images_and_unofficial_digest_are_rejected(self):
        for key, value in (
            ("app_image", "docker.io/passbolt/passbolt:latest-ce-non-root"),
            ("db_image", "docker.io/library/mariadb:10.11"),
            ("app_image", "docker.io/example/passbolt@sha256:" + "a" * 64),
        ):
            with self.subTest(key=key, value=value):
                old = self.settings[key]
                self.settings[key] = value
                self.write_config()
                self.assert_rejection(key)
                self.settings[key] = old

    def test_symlink_config_is_rejected(self):
        original = self.home / "original.json"
        self.config.rename(original)
        self.config.symlink_to(original)
        self.assert_rejection("config")
        self.assertTrue(self.config.is_symlink())

    def test_config_must_be_owner_only(self):
        for mode in (0o640, 0o604):
            with self.subTest(mode=mode):
                self.config.chmod(mode)
                self.assert_rejection("config")

    def test_env_files_must_be_private_regular_files_under_home(self):
        self.app_env.chmod(0o640)
        self.assert_rejection("app_env")
        self.app_env.chmod(0o600)
        self.db_env.unlink()
        self.db_env.symlink_to(self.app_env)
        self.assert_rejection("db_env")

    def test_output_overwrite_or_symlink_is_rejected(self):
        self.output.mkdir()
        marker = self.output / "keep"
        marker.write_text("preserve")
        self.assert_rejection("output")
        self.assertEqual(marker.read_text(), "preserve")
        previous = self.home / "previous"
        self.output.rename(previous)
        self.output.symlink_to(previous, target_is_directory=True)
        self.assert_rejection("output")
        self.assertEqual((previous / "keep").read_text(), "preserve")

    def test_unsafe_hostname_and_path_are_rejected(self):
        for key, value in (
            ("hostname", "vault.example.test;include evil"),
            ("hostname", "bad..example.test"),
            ("app_env", str(self.home / "foo") + "\nExecStart=/bin/false"),
            ("db_env", str(self.home / "../outside.env")),
            ("tls_certificate_key", "/tmp/other.key"),
        ):
            with self.subTest(key=key):
                old = self.settings[key]
                self.settings[key] = value
                self.write_config()
                self.assert_rejection(key)
                self.settings[key] = old

    def test_excessive_resource_ceilings_are_rejected(self):
        for key, value in (("memory_bytes", 2_000_000_001), ("cpu_quota_percent", 201)):
            with self.subTest(key=key):
                old = self.settings[key]
                self.settings[key] = value
                self.write_config()
                self.assert_rejection(key)
                self.settings[key] = old

    def test_unexpected_inline_credentials_are_rejected_without_echo(self):
        self.settings["smtp_password"] = "fixture_value_must_not_be_copied"
        self.write_config()
        self.assert_rejection("configuration fields")
        self.assertNotIn("fixture_value_must_not_be_copied", self.run_render().stderr)


class ProvisionTests(unittest.TestCase):
    def test_defaults_to_checklist_and_rejects_invalid_uid(self):
        script = str(HERE / "provision-host.sh")
        result = subprocess.run(["bash", script], capture_output=True, text=True, check=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Dry run", result.stdout)
        self.assertIn("/home/maple-vault", result.stdout)
        result = subprocess.run(["bash", script, "--apply", "--uid", "0"],
                                capture_output=True, text=True, check=False)
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertIn("UID", result.stderr)


if __name__ == "__main__":
    unittest.main()
