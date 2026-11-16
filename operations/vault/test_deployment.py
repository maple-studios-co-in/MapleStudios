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
                        self.assertEqual(self.preflight.capacity(Path("/"), phase, reserve, Path("/"), Path("/"))["ok"], expected)
        with self.assertRaises(ValueError):
            threshold("after-install", 0)

    def test_account_requires_existing_dedicated_identity(self):
        module = self.preflight
        uid = 12345
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory).resolve()
            account = SimpleNamespace(pw_name="maple-vault", pw_uid=uid, pw_gid=uid,
                                      pw_dir=str(home), pw_shell="/usr/sbin/nologin")
            group = SimpleNamespace(gr_name="maple-vault", gr_gid=uid, gr_mem=[])
            metadata = SimpleNamespace(st_mode=stat.S_IFDIR | 0o700, st_uid=uid, st_gid=uid)
            users = [account]
            with patch.object(module.pwd, "getpwnam", return_value=account), \
                 patch.object(module.pwd, "getpwall", return_value=users), \
                 patch.object(module.grp, "getgrgid", return_value=group), \
                 patch.object(module.grp, "getgrall", return_value=[group]), \
                 patch.object(module.os, "getgrouplist", return_value=[uid]), \
                 patch.object(Path, "lstat", return_value=metadata), \
                 patch.object(module, "command_output", return_value="maple-vault:!:0::::::") as output:
                self.assertTrue(module.account_check(home, uid)["ok"])
                self.assertFalse(module.account_check(home, uid + 1)["ok"])
                self.assertFalse(module.account_check(home, None)["ok"])
                self.assertFalse(module.account_check(home / "other", uid)["ok"])
                metadata.st_mode = stat.S_IFDIR | 0o755
                self.assertFalse(module.account_check(home, uid)["ok"])
                metadata.st_mode = stat.S_IFDIR | 0o700
                group.gr_mem.append("deploy")
                self.assertFalse(module.account_check(home, uid)["ok"])
                group.gr_mem.clear()
                account.pw_gid = uid + 1
                metadata.st_gid = uid + 1
                self.assertFalse(module.account_check(home, uid)["ok"])
                account.pw_gid = uid
                metadata.st_gid = uid
                users.append(SimpleNamespace(pw_name="deploy", pw_uid=1000, pw_gid=uid))
                self.assertFalse(module.account_check(home, uid)["ok"])
                users.pop()
                output.return_value = "maple-vault:synthetic_unlocked_hash:0::::::"
                unlocked = module.account_check(home, uid)
                self.assertFalse(unlocked["ok"])
                self.assertNotIn("synthetic_unlocked_hash", json.dumps(unlocked))
                output.return_value = None
                self.assertFalse(module.account_check(home, uid)["ok"])
            with patch.object(module.pwd, "getpwnam", side_effect=KeyError):
                self.assertFalse(module.account_check(home, uid)["ok"])

    def test_subordinate_ranges_require_all_mappings_to_be_safe(self):
        module = self.preflight
        effective = "0: maple-vault 100000 65536"
        with tempfile.TemporaryDirectory() as directory:
            mappings = Path(directory) / "subuid"
            for entries, output, host_ids, expected in (
                ("maple-vault:100000:65536\nother:200000:65536", effective, {0, 12345}, True),
                ("12345:100000:65536", effective, {0, 12345}, True),
                ("maple-vault:100000:65536\nother:160000:65536", effective, {0}, False),
                ("maple-vault:100000:65536\nmaple-vault:120000:32",
                 effective + "\n1: maple-vault 120000 32", {0}, False),
                ("maple-vault:100000:65536\nmaple-vault:123:50",
                 effective + "\n1: maple-vault 123 50", {0}, False),
                ("maple-vault:100000:65536", effective, {100500}, False),
                ("maple-vault:100000:65536\nother:12000:1000", effective, {12345}, False),
                ("maple-vault:100000:65536", effective + "\n1: maple-vault 400000 65536", {0}, False),
            ):
                with self.subTest(entries=entries, output=output, host_ids=host_ids):
                    mappings.write_text(entries)
                    self.assertEqual(module.safe_subids(mappings, output, 12345, host_ids), expected)

    def test_capacity_must_cover_actual_graph_root_and_staging_mount(self):
        module = self.preflight
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory).resolve()
            graph = home / "graph"
            staging = home / "staging"
            graph.mkdir()
            staging.mkdir()
            size = SimpleNamespace(free=30 * GIB)
            with patch.object(module.shutil, "disk_usage", return_value=size):
                self.assertFalse(module.capacity(home, "before-pull", 0)["ok"])
                self.assertTrue(module.capacity(home, "before-pull", 0, graph, staging)["ok"])
                self.assertFalse(module.capacity(home, "before-pull", 0, graph, home / "missing")["ok"])
                with patch.object(module, "filesystem_devices", return_value={1, 2}):
                    self.assertFalse(module.capacity(home, "before-pull", 0, graph, staging)["ok"])

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
                                 "vault.slice"})
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
        self.assertIn("Options=isolate=true", rendered["vault.network"])

    def test_nginx_stages_acme_and_https_from_templates(self):
        module = importlib.import_module("render")
        acme = module.nginx_config("acme", "vault.example.test", 18080)
        https = module.nginx_config("https", "vault.example.test", 18080)
        self.assertIn("server_name vault.example.test;", acme)
        self.assertIn("return 404;", acme)
        self.assertNotIn("listen 443", acme)
        self.assertIn("proxy_pass http://127.0.0.1:18080;", https)
        self.assertIn("proxy_set_header X-Forwarded-Proto https;", https)
        self.assertIn("access_log off;", https)
        self.assertIn("/etc/letsencrypt/live/vault.example.test/privkey.pem", https)
        for hostname, port in (("evil; include file", 18080), ("vault.example.test", 443)):
            with self.assertRaises(module.InvalidConfig):
                module.nginx_config("https", hostname, port)

    @unittest.skipIf(os.geteuid() == 0, "requires unprivileged caller")
    def test_unprivileged_nginx_renderer_creates_no_output(self):
        result = subprocess.run(
            [sys.executable, str(HERE / "render.py"), "--nginx", "https", "--hostname",
             "vault.example.test", "--port", "18080", "--output", str(self.output)],
            capture_output=True, text=True, check=False,
        )
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertIn("root", result.stderr)
        self.assertFalse(self.output.exists())

    def test_root_staging_rejects_writable_or_symlink_ancestor(self):
        module = importlib.import_module("render")
        self.assertTrue(module.trusted_tree(Path("/"), 0))
        self.assertFalse(module.trusted_tree(self.home, 0))
        alias = self.home / "alias"
        alias.symlink_to(Path("/"), target_is_directory=True)
        self.assertFalse(module.trusted_tree(alias, 0))

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


class StageTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue((HERE / "stage_units.py").is_file(), "installer is not implemented")
        self.stage = importlib.import_module("stage_units")
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.home = Path(temporary.name).resolve()
        self.source = self.home / "rendered"
        self.source.mkdir(mode=0o700)
        self.destination = self.home / ".config" / "containers" / "systemd"
        for name in self.stage.UNITS:
            path = self.source / name
            path.write_text(f"private unit {name}")
            path.chmod(0o600)

    def host_result(self, command, **kwargs):
        code = 1 if command[0] == "podman" else 0
        return SimpleNamespace(returncode=code, stdout="")

    def generated(self, isolate=True):
        return (
            "---vault.service---\nExecStart=/usr/bin/podman run --cgroups=split "
            "--publish 127.0.0.1:18080:8080 image\nSlice=vault.slice\n"
            "---vault-db.service---\nExecStart=/usr/bin/podman run --cgroups=split image\nSlice=vault.slice\n"
            "---vault-network.service---\nExecStart=/usr/bin/podman network create "
            f"{'--opt isolate=true ' if isolate else ''}systemd-vault\n"
            "---vault-volume.service---\n---vault-jwt-volume.service---\n---vault-db-volume.service---\n"
        )

    def test_generator_requires_network_option_on_network_command(self):
        self.stage.check_generated(self.generated())
        with self.assertRaises(ValueError):
            self.stage.check_generated(self.generated(isolate=False) + "Options=isolate=true\n")

    def test_dangling_unit_and_unknown_podman_resources_abort_with_no_copy(self):
        self.destination.mkdir(parents=True)
        collision = self.destination / "vault-db.container"
        collision.symlink_to(self.home / "missing")
        with self.assertRaises(ValueError):
            self.stage.stage(self.home, self.source)
        self.assertEqual(list(self.destination.iterdir()), [collision])
        collision.unlink()

        def existing_volume(command, **kwargs):
            if command == ("podman", "volume", "exists", "systemd-vault-db"):
                return SimpleNamespace(returncode=0, stdout="")
            return self.host_result(command, **kwargs)

        with patch.object(self.stage, "run_host", side_effect=existing_volume):
            with self.assertRaises(ValueError):
                self.stage.stage(self.home, self.source)
        self.assertEqual(list(self.destination.iterdir()), [])

    def test_effective_systemd_collisions_abort_with_no_copy(self):
        with patch.object(self.stage, "run_host",
                          return_value=SimpleNamespace(returncode=0, stdout="vault.service enabled\n")):
            with self.assertRaises(ValueError):
                self.stage.stage(self.home, self.source)
        self.assertFalse(self.destination.exists())

    def test_failed_generator_stops_stage_before_any_copy(self):
        with patch.object(self.stage, "run_host", side_effect=self.host_result), \
             patch.object(self.stage, "dryrun", return_value=self.generated(isolate=False)):
            with self.assertRaises(ValueError):
                self.stage.stage(self.home, self.source)
        self.assertFalse(self.destination.exists())

    def test_loaded_units_reject_unexpected_sources_and_drop_ins(self):
        runtime = self.home / "runtime"
        quadlet = self.destination
        conflicting_source = False
        conflicting_drop_in = False

        def show_origin(command, **kwargs):
            if command[0] == "podman":
                return self.host_result(command, **kwargs)
            self.assertIn("--all", command)
            service = command[-1]
            fragment = runtime / "systemd" / "generator" / service
            source = ""
            overrides = ""
            if service == "vault.slice":
                fragment = self.home / ".config/systemd/user/vault.slice"
            if service == "vault.service":
                source = quadlet / "vault.container" if not conflicting_source else "/etc/other.container"
                overrides = "/etc/vault.service.d/other.conf" if conflicting_drop_in else ""
            if service == "vault-db.service":
                source = quadlet / "vault-db.container"
            return SimpleNamespace(returncode=0, stdout=(
                f"LoadState=loaded\nFragmentPath={fragment}\nSourcePath={source}\nDropInPaths={overrides}\n"
            ))

        with patch.dict(os.environ, {"XDG_RUNTIME_DIR": str(runtime)}), \
             patch.object(self.stage, "run_host", side_effect=show_origin):
            self.stage.verify_loaded(self.home)
            conflicting_source = True
            with self.assertRaises(ValueError):
                self.stage.verify_loaded(self.home)
            conflicting_source = False
            conflicting_drop_in = True
            with self.assertRaises(ValueError):
                self.stage.verify_loaded(self.home)

    def test_fresh_stage_writes_once_and_preserves_units(self):
        with patch.object(self.stage, "run_host", side_effect=self.host_result), \
             patch.object(self.stage, "dryrun", return_value=self.generated()):
            self.stage.stage(self.home, self.source)
            self.assertEqual((self.destination / "vault.container").read_text(),
                             "private unit vault.container")
            self.assertEqual(stat.S_IMODE((self.destination / "vault.container").stat().st_mode), 0o600)
            with self.assertRaises(ValueError):
                self.stage.stage(self.home, self.source)


class ProvisionTests(unittest.TestCase):
    def test_account_and_home_collisions_cause_zero_mutations(self):
        # Exercise the shell function used by --apply with read-only NSS doubles.
        with tempfile.TemporaryDirectory() as directory:
            for collision in ("name", "uid", "group", "gid", "home", "lookup-error", "mail", "orphaned-primary"):
                with self.subTest(collision=collision):
                    trapfile = Path(directory) / "mutations"
                    code = r'''source "$1"
collision=$2
trapfile=$3
home=$4
getent() {
    case "$collision:$1:${2-}" in
        name:passwd:maple-vault|uid:passwd:12345|group:group:maple-vault|gid:group:12345) return 0 ;;
        lookup-error:passwd:maple-vault) return 3 ;;
        orphaned-primary:passwd:) printf 'other:x:2000:12345::/nonexistent:/usr/sbin/nologin\n'; return ;;
        *:passwd:) return 0 ;;
        *) return 2 ;;
    esac
}
useradd() {
    if [[ $1 == -D ]]; then
        if [[ $collision == mail ]]; then
            printf 'CREATE_MAIL_SPOOL=yes\n'
        else
            printf 'CREATE_MAIL_SPOOL=no\n'
        fi
        return
    fi
    printf useradd >>"$trapfile"
}
install() { printf install >>"$trapfile"; }
loginctl() { printf loginctl >>"$trapfile"; }
if [[ $collision == home ]]; then
    ln -s "$home/missing" "$home"
fi
provision_account 12345
'''
                    result = subprocess.run(["bash", "-c", code, "test", str(HERE / "provision-host.sh"),
                                             collision, str(trapfile), f"{directory}/{collision}"],
                                            capture_output=True, text=True, check=False)
                    self.assertEqual(result.returncode, 1, result.stderr)
                    self.assertRegex(result.stderr, "already|lookup|mail")
                    self.assertFalse(trapfile.exists())

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
