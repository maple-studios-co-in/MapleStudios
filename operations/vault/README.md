# Maple Studios vault deployment

Passbolt Community Edition on rootless Podman. The deployment package is verified offline. Podman 4.9.3, Ubuntu 24.04 and the selected images must still pass the checks below together.

## Host gate and dedicated account

The vault needs at least 30 GiB free on the filesystem holding its Podman storage before any image pull. After installation it needs at least 20 GiB plus a measured allowance for upgrade and backup staging. Use the home filesystem for default rootless Podman storage and staging. If any state uses another filesystem, measure capacity for that filesystem before proceeding.

Stage the reviewed `operations/vault` directory at `/opt/maple-vault` under root ownership on the VPS. The following commands are for the root operator at activation.

```bash
bundle=/opt/maple-vault
vault_home=/home/maple-vault
app_port=18080
bash "$bundle/provision-host.sh"
python3 "$bundle/preflight.py" --home "$vault_home" --port "$app_port" \
  --phase before-pull --reserve-bytes 0
```

Before the account exists, preflight reports account failure and measures the nearest existing parent for a provisional capacity result. Choose a free port if the proposed port is in use. The root operator selects a UID and GID with the same unused numeric value in 1000–60000. After the capacity and tooling checks pass, run the following with that value in `vault_uid`.

```bash
bash "$bundle/provision-host.sh" --apply --uid "$vault_uid"
python3 "$bundle/preflight.py" --home "$vault_home" --uid "$vault_uid" \
  --port "$app_port" --phase before-pull --reserve-bytes 0
```

The script uses Ubuntu's account allocator for a locked, non-login account, its private primary group and subordinate UID/GID ranges. It creates a mode 0700 home and enables linger for the user manager. It refuses any existing account, IDs or home. If setup stops partway or the dedicated account already exists, review its state and use the preflight checks before proceeding. Check as root that site sudo policy grants `maple-vault` no privileges and that it cannot read dashboard configuration or backups. Confirm the existing dashboard account cannot traverse the vault home.

## Private configuration and image selection

Choose a supported release with the official Passbolt CE `-ce-non-root` image tag and a compatible official MariaDB release using the selected Passbolt release's Compose example. Verify the tags and architecture against the official registries and privately record their matching OCI digests. The renderer accepts the official repository and digest form. Verify that the selected Passbolt digest is the non-root CE variant before pulling it. [Passbolt Docker install](https://www.passbolt.com/docs/hosting/install/ce/docker/) · [Passbolt non-root images](https://www.passbolt.com/docs/hosting/install/ce/docker/rootless-images/) · [Vendor Compose example](https://github.com/passbolt/passbolt_docker/blob/master/docker-compose/docker-compose-ce.yaml)

Use the dedicated UID for all vault operations. From the root operator shell, this helper gives commands the dedicated user's manager and home.

```bash
vault_run() {
  runuser -u maple-vault -- env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin \
    HOME=/home/maple-vault XDG_RUNTIME_DIR="/run/user/$vault_uid" \
    DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$vault_uid/bus" "$@"
}
vault_run podman info --format '{{.Host.Security.Rootless}} {{.Host.CgroupVersion}} {{.Host.CgroupManager}} {{.Host.NetworkBackend}} {{.Store.GraphRoot}}'
```

Confirm rootless execution, cgroup v2, the systemd cgroup manager, Netavark with container DNS and a graph root inside the private home on the checked filesystem. Inspect the user's Podman configuration for a custom storage root before the first Podman command. Verify host clock synchronisation and SMTP reachability during the trial.

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

```bash
vault_run python3 "$bundle/render.py" --config "$vault_home/deploy.json" \
  --output "$vault_home/rendered"
vault_run env QUADLET_UNIT_DIRS="$vault_home/rendered" \
  /usr/lib/systemd/user-generators/podman-user-generator --dryrun
```

Check that the generator produces both services, that each uses `vault.slice` and `--cgroups=split`, and that the app's only published port is `127.0.0.1:18080:8080` (substitute the checked port if changed). MariaDB is addressed by its container name on the bridge. The three volumes persist the database, GPG keys and JWT keys. [Ubuntu's Quadlet manual](https://manpages.ubuntu.com/manpages/noble/man5/quadlet.5.html) · [Podman 4.9.3 generator source](https://github.com/containers/podman/blob/v4.9.3/pkg/systemd/quadlet/quadlet.go) · [Passbolt Docker backup requirements](https://www.passbolt.com/docs/hosting/maintenance/backup/from-docker/)

After the pre-pull gate and digest verification, `vault_run podman pull` each of the two verified digest references. Transfer the rendered container, network and volume units into the dedicated account's Quadlet directory. Place the regular systemd slice under its user unit directory.

```bash
quadlet="$vault_home/.config/containers/systemd"
user_units="$vault_home/.config/systemd/user"
vault_run install -d -m 0700 "$quadlet" "$user_units"
for unit in vault.container vault-db.container vault.network vault.volume vault-jwt.volume vault-db.volume; do
  vault_run install -m 0600 "$vault_home/rendered/$unit" "$quadlet/$unit"
done
vault_run install -m 0600 "$vault_home/rendered/vault.slice" "$user_units/vault.slice"
vault_run systemctl --user daemon-reload
vault_run systemctl --user start vault.service
```

Validate both unit statuses. Check `vault_run podman port maple-vault-app` for just the selected loopback port and `vault_run podman port maple-vault-db` for zero mappings. View only allowlisted fields from `podman inspect --format`, since the unrestricted output contains environment credentials. Check that both container PIDs' unified cgroups are descendants of `vault.slice` and inspect the slice's `memory.max`, `memory.swap.max` and `cpu.max`. Run `preflight.py` with the same home, UID and port, `--phase after-install` and the positive `--reserve-bytes` measured for upgrade/backup staging. Verify volume permissions, MariaDB health, and key/data persistence after a restart and an approved reboot. The app's Quadlet starts the DB as a dependency and enables boot startup through its `[Install]` section.

## DNS and TLS

The owner points the specific `vault.maplestudios.ai` A record at the VPS. Add AAAA only after enabling and validating the corresponding IPv6 virtual-host listeners and ingress. Confirm no existing DNS or Nginx mapping conflicts. Set up an HTTP-only Nginx site for the exact hostname first, using the port 80 block in the rendered config with `return 404` in the ordinary location until issuance. Create the root-controlled `/var/lib/maple-vault-acme` webroot. Run `nginx -t` before a graceful reload.

```bash
certbot certonly --webroot -w /var/lib/maple-vault-acme \
  --cert-name vault.maplestudios.ai -d vault.maplestudios.ai \
  --deploy-hook '/usr/sbin/nginx -t && /usr/bin/systemctl reload nginx'
```

Review the complete rendered Nginx site and install a root-owned copy in `/etc/nginx/sites-available/maple-vault.conf`. Enable only that copy via the corresponding `sites-enabled` link. The enabled site must live outside the vault account's writable home. Run `nginx -t` and gracefully reload after validation. Test certificate renewal for this certificate and verify HTTPS, proxy scheme handling, disabled public signup and the absence of sensitive values in logs with synthetic requests. If there's an upstream proxy, verify its request logging and forwarded client identity before exposing the site. [Certbot webroot and renewal](https://eff-certbot.readthedocs.io/en/stable/using.html) · [Nginx proxy headers](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)

Run the vendor health check under the image's existing non-root identity using `vault_run podman exec maple-vault-app /bin/bash -c '. /etc/environment && ./bin/cake passbolt healthcheck'`. The designated owner performs the vendor first-admin registration and opens the one-time setup link in a private session. Keep the link in that session. Complete MFA and the separate recovery custody and disposable-restore checks before storing company secrets. [Passbolt first admin setup](https://www.passbolt.com/docs/hosting/install/ce/docker/#step-5-create-first-admin-user)

## Rollback

Stop `vault.service` and `vault-db.service` through the dedicated user manager. To keep them stopped over reboot, move the two installed vault container files out of the Quadlet search path into private staging and reload that manager. Disable only the vault's Nginx site by moving its enabled symlink out of the include directory. Validate Nginx and gracefully reload. Keep the private account, images, volumes, certificate, environment files and backups available for recovery. If the Podman trial fails, record the exact error before assessing Passbolt's supported Docker deployment.
