"""Render reviewed vault templates without running deployment commands."""

import argparse
import json
import os
from pathlib import Path
import re
import stat
from string import Template
import sys


TEMPLATES = Path(__file__).resolve().with_name("templates")
UNITS = ("vault.container", "vault-db.container", "vault.network",
         "vault.volume", "vault-jwt.volume", "vault-db.volume", "vault.slice")
IMAGES = {"app_image": "docker.io/passbolt/passbolt", "db_image": "docker.io/library/mariadb"}
FIELDS = {"hostname", "uid", "home", "app_bind", "app_port", *IMAGES,
          "app_env", "db_env", "tls_certificate", "tls_certificate_key",
          "memory_bytes", "cpu_quota_percent", "reserve_bytes"}
LABEL = r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?"


class InvalidConfig(ValueError):
    pass


def require(condition, field):
    if not condition:
        raise InvalidConfig(f"invalid {field}")


def safe_path(value, field):
    require(isinstance(value, (str, Path)), field)
    value = str(value)
    require(re.fullmatch(r"(?:/[A-Za-z0-9_.-]+)+", value)
            and not {".", ".."} & set(value.split("/")), field)
    return Path(value)


def private_dir(path, uid, field):
    try:
        metadata = path.lstat()
        require(path.resolve(strict=True) == path and stat.S_ISDIR(metadata.st_mode)
                and metadata.st_uid == uid and stat.S_IMODE(metadata.st_mode) == 0o700, field)
    except (OSError, RuntimeError):
        raise InvalidConfig(f"invalid {field}") from None


def private_file(path, uid, field, *, read_json=False):
    try:
        require(path.resolve(strict=True) == path, field)
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(fd, "rb") as file:
            metadata = os.fstat(file.fileno())
            require(stat.S_ISREG(metadata.st_mode) and metadata.st_uid == uid
                    and stat.S_IMODE(metadata.st_mode) in (0o400, 0o600)
                    and metadata.st_nlink == 1, field)
            if read_json:
                data = file.read(16_385)
                require(len(data) <= 16_384, field)
                return json.loads(data, object_pairs_hook=unique_fields)
    except (OSError, UnicodeError, json.JSONDecodeError, RuntimeError):
        raise InvalidConfig(f"invalid {field}") from None


def unique_fields(pairs):
    result = dict(pairs)
    require(len(result) == len(pairs), "configuration fields")
    return result


def validate(config):
    uid = os.geteuid()
    settings = private_file(config, uid, "config", read_json=True)
    require(isinstance(settings, dict) and settings.keys() == FIELDS, "configuration fields")

    hostname = settings["hostname"]
    require(isinstance(hostname, str) and len(hostname) <= 253
            and re.fullmatch(rf"(?:{LABEL}\.)+[a-z](?:[a-z0-9-]{{0,61}}[a-z0-9])?", hostname),
            "hostname")

    for field, minimum, maximum in (
        ("uid", 1, 60000), ("app_port", 1024, 65535), ("memory_bytes", 1, 2_000_000_000),
        ("cpu_quota_percent", 1, 200), ("reserve_bytes", 1, (1 << 63) - 1),
    ):
        value = settings[field]
        require(type(value) is int and minimum <= value <= maximum, field)
    require(settings["uid"] == uid, "uid")
    require(settings["app_bind"] == "127.0.0.1", "app_bind")

    home = safe_path(settings["home"], "home")
    private_dir(home, uid, "home")
    require(config.is_relative_to(home), "config location")
    paths = {config}
    for field in ("app_env", "db_env"):
        path = safe_path(settings[field], field)
        require(path.is_relative_to(home) and path not in paths, field)
        private_file(path, uid, field)
        paths.add(path)

    for field, repository in IMAGES.items():
        value = settings[field]
        require(isinstance(value, str) and re.fullmatch(
            rf"{re.escape(repository)}@sha256:[0-9a-f]{{64}}", value), field)

    for field, name in (("tls_certificate", "fullchain.pem"),
                        ("tls_certificate_key", "privkey.pem")):
        require(settings[field] == f"/etc/letsencrypt/live/{hostname}/{name}", field)
    return settings, home


def render(config, output):
    settings, home = validate(safe_path(config, "config"))
    output = safe_path(output, "output path")
    require(output != home and output.is_relative_to(home), "output location")
    private_dir(output.parent, os.geteuid(), "output parent")

    # Resolve every template before creating any output.
    rendered = {}
    for name in (*UNITS, "nginx.conf"):
        source = "vault.volume" if name == "vault-jwt.volume" else name
        rendered[name] = Template((TEMPLATES / source).read_text()).substitute(settings)

    created = []
    output.mkdir(mode=0o700)
    try:
        for name, contents in rendered.items():
            path = output / name
            fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
            created.append(path)
            with os.fdopen(fd, "w", encoding="utf-8") as file:
                file.write(contents)
    except OSError:
        for path in created:
            path.unlink()
        output.rmdir()
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    os.umask(0o077)
    try:
        render(args.config, args.output)
    except InvalidConfig as error:
        print(str(error), file=sys.stderr)
        return 1
    except OSError:
        print("cannot render to a new private output directory", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
