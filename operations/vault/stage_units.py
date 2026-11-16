"""Check for collisions and place first-install units in the vault user's search paths."""

import argparse
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys

from preflight import GENERATOR
from render import UNITS, private_dir, private_file, require, safe_path


GENERATED = {
    "vault.container": "vault.service",
    "vault-db.container": "vault-db.service",
    "vault.network": "vault-network.service",
    "vault.volume": "vault-volume.service",
    "vault-jwt.volume": "vault-jwt-volume.service",
    "vault-db.volume": "vault-db-volume.service",
}
RESOURCES = (
    ("container", "maple-vault-app"), ("container", "maple-vault-db"),
    ("network", "systemd-vault"),
    ("volume", "systemd-vault"), ("volume", "systemd-vault-jwt"), ("volume", "systemd-vault-db"),
)


def run_host(command, **kwargs):
    return subprocess.run(command, capture_output=True, text=True, timeout=20, **kwargs)


def check_resources():
    for kind, name in RESOURCES:
        flags = ("--external",) if kind == "container" else ()
        result = run_host(("podman", kind, "exists", *flags, name))
        require(result.returncode != 0, f"pre-existing Podman {kind} {name}")
        require(result.returncode == 1, f"Podman {kind} lookup for {name}")


def dryrun(source):
    result = run_host((str(GENERATOR), "--dryrun"), env={**os.environ, "QUADLET_UNIT_DIRS": str(source)})
    require(result.returncode == 0, "Quadlet generator result")
    return result.stdout


def check_generated(output):
    parts = re.split(r"(?m)^---([^\n]+)---\s*$", output)
    units = dict(zip(parts[1::2], parts[2::2]))
    require(len(parts) == 1 + 2 * len(GENERATED)
            and set(units) == set(GENERATED.values()), "generated Quadlet services")
    commands = {}
    for name in ("vault", "vault-db", "vault-network"):
        unit = units[f"{name}.service"]
        starts = re.findall(r"(?m)^ExecStart=(.*)$", unit)
        require(len(starts) == 1, f"generated {name} start command")
        commands[name] = shlex.split(starts[0])
        if name != "vault-network":
            require("Slice=vault.slice" in unit.splitlines() and "--cgroups=split" in commands[name],
                    f"generated {name} cgroup")
    network = commands["vault-network"]
    require(any(pair == ("--opt", "isolate=true") for pair in zip(network, network[1:])),
            "generated network isolation")
    publish = [value for flag, value in zip(commands["vault"], commands["vault"][1:])
               if flag in ("--publish", "-p")]
    require(len(publish) == 1 and re.fullmatch(r"127\.0\.0\.1:\d+:8080", publish[0]),
            "generated app binding")
    require(not {"--publish", "-p", "-P", "--publish-all"} & set(commands["vault-db"]),
            "generated database binding")


def no_unit_collisions(quadlet):
    services = (*GENERATED.values(), "vault.slice")
    for action in ("list-unit-files", "list-units"):
        flags = ("--all", "--plain") if action == "list-units" else ()
        result = run_host(("systemctl", "--user", action, *flags,
                           "--no-legend", "--no-pager", *services))
        require(result.returncode == 0 and not result.stdout.strip(),
                "existing or unverified systemd units")

    # Also inspect on-disk Quadlets the manager may not have seen yet.
    global_dir = Path("/etc/containers/systemd/users")
    for directory in (quadlet, global_dir, global_dir / str(os.geteuid())):
        if directory.is_dir():
            for root, dirs, files in os.walk(directory.resolve(), onerror=raise_walk_error):
                if directory == global_dir and Path(root) == directory.resolve():
                    dirs[:] = [name for name in dirs if not name.isdecimal()]
                require(not (set(files) | set(dirs)) & set(GENERATED), "existing Quadlet filename")


def raise_walk_error(error):
    raise error


def stage(home, source):
    uid = os.geteuid()
    private_dir(home, uid, "vault home")
    private_dir(source, uid, "rendered directory")
    require(source.is_relative_to(home) and source != home, "rendered directory location")
    quadlet = home / ".config" / "containers" / "systemd"
    slice_dir = home / ".config" / "systemd" / "user"
    destinations = {name: (slice_dir if name == "vault.slice" else quadlet) / name for name in UNITS}

    for name, destination in destinations.items():
        require(destination.resolve(strict=False) == destination and not destination.exists(),
                f"existing unit path {name}")
        private_file(source / name, uid, "rendered unit")
    no_unit_collisions(quadlet)
    check_resources()
    check_generated(dryrun(source))
    contents = {name: (source / name).read_bytes() for name in UNITS}

    created = []
    try:
        for name, destination in destinations.items():
            destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            fd = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            created.append(destination)
            with os.fdopen(fd, "wb") as file:
                file.write(contents[name])
    except OSError:
        for destination in created:
            destination.unlink()
        raise


def verify_loaded(home):
    quadlet = home / ".config" / "containers" / "systemd"
    runtime = safe_path(os.environ.get("XDG_RUNTIME_DIR"), "runtime directory")
    generated_dirs = {runtime / "systemd" / directory
                      for directory in ("generator.early", "generator", "generator.late")}
    for source, service in {**GENERATED, "vault.slice": "vault.slice"}.items():
        result = run_host(("systemctl", "--user", "show", "--all", "--no-pager",
                           "--property=LoadState,FragmentPath,SourcePath,DropInPaths", service))
        fields = dict(line.split("=", 1) for line in result.stdout.splitlines() if "=" in line)
        require(result.returncode == 0 and fields.get("LoadState") == "loaded"
                and fields.get("DropInPaths") == "", f"loaded systemd unit {service}")
        fragment = Path(fields.get("FragmentPath", ""))
        if source == "vault.slice":
            require(fragment == home / ".config" / "systemd" / "user" / source,
                    f"loaded origin for {service}")
        else:
            require(fragment.name == service and fragment.parent in generated_dirs,
                    f"loaded origin for {service}")
            source_path = fields.get("SourcePath", "")
            if source.endswith(".container") or source_path:
                require(source_path == str(quadlet / source), f"loaded source for {service}")
    check_resources()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--home", required=True)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--source")
    mode.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    os.umask(0o077)
    try:
        require(os.geteuid() != 0, "dedicated vault account required")
        home = safe_path(args.home, "home")
        require(Path.home() == home, "dedicated home")
        if args.verify:
            verify_loaded(home)
        else:
            stage(home, safe_path(args.source, "source"))
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 1
    except (OSError, RuntimeError, subprocess.SubprocessError):
        print("vault units could not be checked or staged", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
