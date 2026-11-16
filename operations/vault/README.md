# Maple Studios vault deployment

Passbolt Community Edition on rootless Podman. The deployment package is verified offline. Podman 4.9.3, Ubuntu 24.04 and the selected images must still pass the checks below together.

## Host gate and dedicated account

The vault needs at least 30 GiB free on the filesystem holding its Podman storage before any image pull. After installation it needs at least 20 GiB plus a measured allowance for upgrade and backup staging. Use the home filesystem for default rootless Podman storage and staging. If any state uses another filesystem, measure capacity for that filesystem before proceeding.

Use the Hostinger root console for these commands. Copy the reviewed archive from the deploy transfer location into a new root-owned mode 0700 directory. Verify the controller-provided SHA-256 against that root-owned copy before extraction. Stage the verified package under `/opt/maple-vault` with root ownership and permissions that allow only root to modify its scripts, templates and parent directories.

```bash
bundle=/opt/maple-vault
vault_home=/home/maple-vault
app_port=18080
bash "$bundle/provision-host.sh"
python3 "$bundle/preflight.py" --home "$vault_home" --port "$app_port" \
  --phase before-pull --reserve-bytes 0
```

For this provisional check, inspect `capacity.space_sufficient`, `tools.ok` and `port.ok`. Overall preflight stays false until the account and actual installation filesystem are verified. Choose a free port if the proposed port is in use. The root operator selects a UID and GID with the same unused numeric value in 1000–60000. After the capacity and tooling checks pass, run the following with that value in `vault_uid`.

```bash
bash "$bundle/provision-host.sh" --apply --uid "$vault_uid"
```

The script uses Ubuntu's account allocator for a locked, non-login account, its private primary group and subordinate UID/GID ranges. It creates a mode 0700 home and enables linger for the user manager. It refuses existing accounts, IDs, home paths, and an enabled mailbox-spool default. If setup stops partway or the dedicated account already exists, review its provenance, locked password, matching UID/GID, exclusive group, home and subordinate mappings before proceeding. The full root preflight checks these identity properties. Check as root that site sudo policy grants `maple-vault` no privileges and that it cannot read dashboard configuration or backups. Confirm the existing dashboard account cannot traverse the vault home.

## Private configuration and image selection

Choose a supported release with the official Passbolt CE `-ce-non-root` image tag and a compatible official MariaDB release using the selected Passbolt release's Compose example. Verify the tags and architecture against the official registries and privately record their matching OCI digests. The renderer accepts the official repository and digest form. Verify that the selected Passbolt digest is the non-root CE variant before pulling it. [Passbolt Docker install](https://www.passbolt.com/docs/hosting/install/ce/docker/) · [Passbolt non-root images](https://www.passbolt.com/docs/hosting/install/ce/docker/rootless-images/) · [Vendor Compose example](https://github.com/passbolt/passbolt_docker/blob/master/docker-compose/docker-compose-ce.yaml)

Use the dedicated UID for all vault operations. From the root operator shell, this helper gives commands the dedicated user's manager and home.

```bash
vault_run() (
  cd / || exit
  runuser -u maple-vault -- env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin \
    HOME=/home/maple-vault XDG_RUNTIME_DIR="/run/user/$vault_uid" \
    DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$vault_uid/bus" "$@"
)
# Inspect the dedicated user's containers/storage.conf and host storage defaults first.
vault_run podman info --format '{{.Host.Security.Rootless}} {{.Host.CgroupVersion}} {{.Host.CgroupManager}} {{.Host.NetworkBackend}} {{.Store.GraphRoot}}'
```

Confirm rootless execution, cgroup v2, the systemd cgroup manager, Netavark with container DNS, and a graph root inside the private home. Verify host clock synchronisation and SMTP reachability during the trial.

Create `deploy.json`, `app.env` and `db.env` inside the dedicated home as `maple-vault` with mode 0600. Enter the environment files directly in a private editor with swap and backups disabled. Keep these files out of the repository and shell history. Use plain Podman env-file syntax, with a single `KEY=value` per line. The environment files carry:

- `app.env` sets `DATASOURCES_DEFAULT_PASSWORD` to the app database password shared with `db.env`, and sets `SECURITY_SALT`. Enter the scoped Maple Studios SMTP endpoint, username, credential, verified sender and TLS mode with the vendor's `EMAIL_TRANSPORT_DEFAULT_*` and `EMAIL_DEFAULT_FROM*` settings. Leave the fixed network, database role and security policy in the Quadlet. [Passbolt environment variables](https://www.passbolt.com/docs/hosting/environment-reference/)
- `db.env` sets `MARIADB_PASSWORD` to the app database password and `MARIADB_ROOT_PASSWORD` to a distinct password. The database bootstrap uses an explicit root password because the image's automatic generation option prints the password. [MariaDB environment variables](https://mariadb.com/docs/server/server-management/automated-mariadb-deployment-and-administration/docker-and-mariadb/mariadb-server-docker-official-image-environment-variables)

Use the fields below. Substitute the actual numeric UID and a positive working-space allowance in bytes for the trial. Replace the trial allowance with the measured upgrade and backup reserve before using the vault for company data. The script validates the image reference syntax offline. The values below are placeholders.

```json
{
  "hostname": "vault.maplestudios.ai",
  "uid": "REPLACE_WITH_NUMERIC_UID",
  "home": "/home/maple-vault",
  "app_bind": "127.0.0.1",
  "app_port": 18080,
  "app_image": "docker.io/passbolt/passbolt@sha256:VERIFIED_CE_NON_ROOT_DIGEST",
  "db_image": "docker.io/library/mariadb@sha256:VERIFIED_MARIADB_DIGEST",
  "app_env": "/home/maple-vault/app.env",
  "db_env": "/home/maple-vault/db.env",
  "tls_certificate": "/etc/letsencrypt/live/vault.maplestudios.ai/fullchain.pem",
  "tls_certificate_key": "/etc/letsencrypt/live/vault.maplestudios.ai/privkey.pem",
  "memory_bytes": 2000000000,
  "cpu_quota_percent": 200,
  "reserve_bytes": "REPLACE_WITH_NUMERIC_BYTE_COUNT"
}
```

The slice caps the two containers together at 2 GB (2,000,000,000 bytes), zero additional swap and 200% CPU quota. The rootless bridge provides egress for Passbolt SMTP. Only the Passbolt HTTP port is published, on loopback. Podman keeps a bounded 10 MB database log. Passbolt container output and vault-vhost request logs are discarded because vendor access lines can contain setup and recovery URLs. Retain secret-free health and unit-state evidence. [Podman 4.9.3 networking and logging](https://docs.podman.io/en/v4.9.3/markdown/podman-run.1.html) · [systemd resource controls](https://www.freedesktop.org/software/systemd/man/255/systemd.resource-control.html)

## Stage and validate the containers

Enter the verified app and DB references from the handoff in `app_image` and `db_image`. Use those same references in `deploy.json`. Set `reserve_bytes` to the trial working-space allowance.

```bash
backup_stage="$vault_home/staging"
vault_run install -d -m 0700 "$backup_stage"
graph_root=$(vault_run podman info --format '{{.Store.GraphRoot}}')
vault_preflight() {
  python3 "$bundle/preflight.py" --home "$vault_home" --uid "$vault_uid" \
    --port "$app_port" --graph-root "$graph_root" --staging "$backup_stage" \
    --phase "$1" --reserve-bytes "$2"
}
vault_run python3 "$bundle/render.py" --config "$vault_home/deploy.json" \
  --output "$vault_home/rendered"
```

The staging command checks target filenames including dangling symlinks, existing systemd unit names, unprocessed Quadlets and Podman resources. It dry-runs the actual generator and requires split cgroups under the shared slice, a single loopback app mapping, zero DB mappings, and `--opt isolate=true` in the generated network command. Initial staging refuses collisions. For an interrupted installation, stop and review any existing units or named resources. Reuse a resource only after matching its provenance, owner, storage path, driver and options to this deployment. Keep the original files and persistent volumes available while resolving the collision. [Ubuntu Quadlet manual](https://manpages.ubuntu.com/manpages/noble/man5/quadlet.5.html) · [Podman 4.9.3 generator](https://github.com/containers/podman/blob/v4.9.3/pkg/systemd/quadlet/quadlet.go)

Run the full root preflight immediately before pulling. It verifies the actual graph root, backup staging path and home are existing directories on the same filesystem. The checks stop the command chain before a pull or start if a gate fails.

```bash
vault_preflight before-pull 0 &&
vault_run podman pull "$app_image" &&
vault_run podman pull "$db_image" &&
vault_run python3 "$bundle/stage_units.py" --home "$vault_home" --source "$vault_home/rendered" &&
vault_run systemctl --user daemon-reload &&
vault_run python3 "$bundle/stage_units.py" --home "$vault_home" --verify &&
vault_run systemctl --user start vault.service
```

The verification command checks effective generated unit origins and container source paths. Unexpected systemd overrides or late resource collisions stop activation. Run this sequence from the root console with exclusive control of the dedicated account. If it fails after staging, use the rollback below to prevent a subsequent reboot from starting the trial.

Validate both unit statuses. Check `vault_run podman port maple-vault-app` for just the selected loopback port and `vault_run podman port maple-vault-db` for zero mappings. View only allowlisted fields from `podman inspect --format`, since unrestricted output includes environment credentials. Check that both container PIDs' unified cgroups are descendants of `vault.slice` and verify the slice's `memory.max`, `memory.swap.max` and `cpu.max`. Verify that the network is a DNS-enabled bridge with isolation and that the GPG, JWT and DB volumes are writable, persistent and located inside the checked graph root. [Passbolt container backup requirements](https://www.passbolt.com/docs/hosting/maintenance/backup/from-docker/)

Remeasure the working space needed for an upgrade and backup. Use that positive byte count in `reserve_bytes`. Run the following before requesting the DNS change or creating TLS. If the commands fail, stop the trial using the rollback section and retain its data.

```bash
graph_root=$(vault_run podman info --format '{{.Store.GraphRoot}}') &&
vault_preflight after-install "$reserve_bytes"
```

## DNS and TLS

After the post-install gate and container checks, the DNS operator points the dedicated `vault.maplestudios.ai` A record at the VPS in DNS-only mode. Add AAAA only after verifying the IPv6 listeners and ingress. Check for existing DNS or Nginx mapping conflicts.

From the root console, choose the approved hostname independently of the vault JSON and use the same loopback port checked above. The two vhost stages are generated directly from the trusted root-owned package and reviewed in root-owned storage. Stage the HTTP-only challenge configuration first.

```bash
vault_hostname=vault.maplestudios.ai
nginx_stage=$(mktemp -d /root/maple-vault-nginx.XXXXXX)
nginx_site=/etc/nginx/sites-available/maple-vault.conf
nginx_link=/etc/nginx/sites-enabled/maple-vault.conf
python3 "$bundle/render.py" --nginx acme --hostname "$vault_hostname" \
  --port "$app_port" --output "$nginx_stage/acme.conf"
```

Review `"$nginx_stage/acme.conf"` from that directory. Ensure the ACME webroot path is controlled by root. Enable the reviewed file when both site paths are free.

```bash
test ! -e "$nginx_site" && test ! -L "$nginx_site" &&
test ! -e "$nginx_link" && test ! -L "$nginx_link" &&
install -d -m 0755 -o root -g root /var/lib/maple-vault-acme &&
install -m 0600 -o root -g root "$nginx_stage/acme.conf" "$nginx_site" &&
ln -sT "$nginx_site" "$nginx_link" &&
nginx -t && systemctl reload nginx
```

After the ACME site is enabled and DNS resolves, issue the certificate and render the HTTPS site into the same root-owned staging directory.

```bash
certbot certonly --webroot -w /var/lib/maple-vault-acme \
  --cert-name "$vault_hostname" -d "$vault_hostname" \
  --deploy-hook '/usr/sbin/nginx -t && /usr/bin/systemctl reload nginx' &&
python3 "$bundle/render.py" --nginx https --hostname "$vault_hostname" \
  --port "$app_port" --output "$nginx_stage/https.conf"
```

Review the HTTPS file in root-owned staging. Replace only the installed ACME file for this vault, then test and gracefully reload.

```bash
cmp -s "$nginx_site" "$nginx_stage/acme.conf" &&
install -m 0600 -o root -g root "$nginx_stage/https.conf" "$nginx_site" &&
nginx -t && systemctl reload nginx
```

If the validation fails after replacing the file, restore the reviewed ACME file and retest before a reload. Test renewal for this certificate. Verify HTTPS, proxy scheme handling, disabled public signup, restart and approved reboot persistence, and the absence of sensitive values in logs with synthetic requests. [Certbot webroot and renewal](https://eff-certbot.readthedocs.io/en/stable/using.html) · [Nginx configuration testing](https://nginx.org/en/docs/switches.html)

Run the vendor health check under the image's existing non-root identity using `vault_run podman exec maple-vault-app /bin/bash -c '. /etc/environment && ./bin/cake passbolt healthcheck'`. The designated owner performs the vendor first-admin registration and opens the one-time setup link in a private session. Keep the link in that session. Complete MFA and the separate recovery custody and disposable-restore checks before storing company secrets. [Passbolt first admin setup](https://www.passbolt.com/docs/hosting/install/ce/docker/#step-5-create-first-admin-user)

## Rollback

For a failed trial or capacity gate, stop both vault services and move their container source files out of the user generator's search path. This parks boot activation while retaining the network, persistent data and configuration.

```bash
(
  failed=0
  quadlet="$vault_home/.config/containers/systemd"
  for service in vault.service vault-db.service; do
    vault_run systemctl --user stop "$service" || {
      printf 'Could not stop %s. Check its current state.\n' "$service" >&2
      failed=1
    }
  done

  parked=
  for unit in vault.container vault-db.container; do
    source="$quadlet/$unit"
    [[ -e $source || -L $source ]] || continue
    if [[ -z $parked ]]; then
      parked=$(vault_run mktemp -d "$vault_home/parked-units.XXXXXX") || {
        printf '%s\n' 'Could not create the directory for parked units.' >&2
        failed=1
        break
      }
    fi
    vault_run mv -T -- "$source" "$parked/$unit" || {
      printf 'Could not park %s. Its boot activation may still be present.\n' "$unit" >&2
      failed=1
    }
  done

  vault_run systemctl --user daemon-reload || {
    printf '%s\n' 'Could not reload the vault user manager.' >&2
    failed=1
  }
  exit "$failed"
)
```

A nonzero result means rollback needs further attention before reboot. Check both unit statuses, verify the vault port has closed and confirm neither container source file remains in the generator's search path. If an Nginx site was enabled for the trial, move only its enabled symlink to the root staging directory. Test Nginx and reload. Preserve the private account, images, environment files, volumes, certificate and backups. If the Podman trial fails, record the specific error before assessing Passbolt's supported Docker deployment.
