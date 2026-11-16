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


def validate_hostname(hostname):
    require(isinstance(hostname, str) and len(hostname) <= 253
            and re.fullmatch(rf"(?:{LABEL}\.)+[a-z](?:[a-z0-9-]{{0,61}}[a-z0-9])?", hostname),
            "hostname")


def public_tls(hostname):
    base = f"/etc/letsencrypt/live/{hostname}"
    return {"tls_certificate": f"{base}/fullchain.pem", "tls_certificate_key": f"{base}/privkey.pem"}


def nginx_config(phase, hostname, port):
    validate_hostname(hostname)
    require(type(port) is int and 1024 <= port <= 65535, "port")
    require(phase in ("acme", "https"), "Nginx phase")
    http = Template((TEMPLATES / "nginx-http.conf").read_text())
    redirect = "return 404;" if phase == "acme" else f"return 308 https://{hostname}$request_uri;"
    contents = http.substitute(hostname=hostname, redirect=redirect)
    if phase == "https":
        https = Template((TEMPLATES / "nginx.conf").read_text())
        contents += "\n" + https.substitute(hostname=hostname, app_port=port, **public_tls(hostname))
    return contents


def trusted_tree(path, uid):
    for directory in (path, *path.parents):
        metadata = directory.lstat()
        if not (stat.S_ISDIR(metadata.st_mode) and metadata.st_uid == uid
                and not metadata.st_mode & 0o022):
            return False
    return True


def stage_nginx(phase, hostname, port, output):
    require(os.geteuid() == 0, "root required to stage Nginx")
    output = safe_path(output, "output path")
    require(trusted_tree(output.parent, 0) and trusted_tree(TEMPLATES, 0), "root-owned staging")
    for name in ("nginx-http.conf", "nginx.conf"):
        template = (TEMPLATES / name).lstat()
        require(stat.S_ISREG(template.st_mode) and template.st_uid == 0
                and not template.st_mode & 0o022 and template.st_nlink == 1, "root-owned template")
    contents = nginx_config(phase, hostname, port)
    with output.open("x", encoding="utf-8") as file:
        file.write(contents)


def validate(config):
    uid = os.geteuid()
    settings = private_file(config, uid, "config", read_json=True)
    require(isinstance(settings, dict) and settings.keys() == FIELDS, "configuration fields")

    hostname = settings["hostname"]
    validate_hostname(hostname)

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

    for field, path in public_tls(hostname).items():
        require(settings[field] == path, field)
    return settings, home


def render(config, output):
    settings, home = validate(safe_path(config, "config"))
    output = safe_path(output, "output path")
    require(output != home and output.is_relative_to(home), "output location")
    private_dir(output.parent, os.geteuid(), "output parent")

    # Resolve every template before creating any output.
    rendered = {}
    for name in UNITS:
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
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--config")
    mode.add_argument("--nginx", choices=("acme", "https"))
    parser.add_argument("--hostname")
    parser.add_argument("--port", type=int)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    if args.nginx and (args.hostname is None or args.port is None):
        parser.error("--nginx requires --hostname and --port")
    if args.config and (args.hostname is not None or args.port is not None):
        parser.error("--hostname and --port are only used with --nginx")
    os.umask(0o077)
    try:
        if args.nginx:
            stage_nginx(args.nginx, args.hostname, args.port, args.output)
        else:
            render(args.config, args.output)
    except InvalidConfig as error:
        print(str(error), file=sys.stderr)
        return 1
    except OSError:
        print("cannot create private output", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
