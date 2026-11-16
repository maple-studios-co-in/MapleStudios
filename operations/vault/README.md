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

## Vault backup: pinned releases and private job

This backup and restore package targets Linux amd64 Passbolt CE `5.18.0-1-ce-non-root` and MariaDB `10.11.19`. The reviewed references are:

| Component | Official image |
| --- | --- |
| Passbolt, running as `www-data` | `docker.io/passbolt/passbolt@sha256:27e27a51bc3a9339cad638bcd0ca7dabc1b6956524aab89dfdd356c8ce61dd2d` |
| MariaDB | `docker.io/library/mariadb@sha256:135c49b72e97143b73cc273dcdc95d2b035e3ebfbd536c3d72c65b715a8e06b5` |

The job requires `maple-vault` UID 2010, home `/home/maple-vault`, the two reviewed user units and their exact container names. A release, volume or account change requires a reviewed update and a fresh restore drill. Keep the root-owned scripts with their reviewed deployment templates. Use the root console's `vault_run` helper with `vault_uid=2010`; do not add sudo access for the vault or shared deploy account.

Create a separate Drive folder accessible to a dedicated vault-backup OAuth desktop client through `drive.file`. Create that folder with the client that will use it. Pin its ID in both settings files. Use a company-owned application with a usable refresh token and verify private sharing, refresh, upload, readback and exact-object deletion with a synthetic object. The scheduled runner is the only writer. The dashboard backup location and owner recovery bundle require separate access; this runner must be unable to list, read or delete them. [rclone Drive scopes and root folders](https://rclone.org/drive/#scopes)

Create `staging` and `vault-backup-journal` with mode 0700 in the dedicated home. The job JSON, rclone configuration, deployment JSON, app and DB environment files, and staged vault units must be private regular files owned by the dedicated account. Use mode 0600. Supply the actual installed absolute tool paths. The following is an example, with placeholder values for the public recipient, folder and job identifiers. Give the vault a stable, unique 24-character lowercase hex job identifier; it is a name, not a key. Set the reserve to the same measured allowance as in the deployment configuration.

```json
{
  "tools": {
    "age": "/usr/bin/age",
    "podman": "/usr/bin/podman",
    "systemctl": "/usr/bin/systemctl",
    "systemd-run": "/usr/bin/systemd-run",
    "rclone": "/usr/bin/rclone"
  },
  "containers": {"app": "maple-vault-app", "db": "maple-vault-db"},
  "volumes": {
    "systemd-vault": "/etc/passbolt/gpg",
    "systemd-vault-jwt": "/etc/passbolt/jwt",
    "systemd-vault-db": "/var/lib/mysql"
  },
  "deploy_config": "/home/maple-vault/deploy.json",
  "recipient": "VAULT_PUBLIC_AGE_RECIPIENT",
  "job_id": "VAULT_JOB_ID",
  "rclone_config": "/home/maple-vault/vault-drive.conf",
  "remote": "vault-backups",
  "folder_id": "PINNED_VAULT_BACKUP_FOLDER_ID",
  "staging": "/home/maple-vault/staging",
  "journal": "/home/maple-vault/vault-backup-journal",
  "status": "/home/maple-vault/vault-backup-status.json",
  "lock": "/home/maple-vault/vault-backup.lock",
  "max_sql_bytes": 268435456,
  "reserve_bytes": 1073741824,
  "capture_seconds": 90,
  "remote_seconds": 900
}
```

The rclone file must contain one section, `[vault-backups]`, with only: `type = drive`, `scope = drive.file`, the pinned `root_folder_id`, `client_id`, `client_secret` and `token`. The runner has no local private age identity. Keep OAuth configuration and unrelated service secrets out of the capture sources.

```bash
vault_run python3 /opt/maple-vault/backup.py --config /home/maple-vault/backup.json --verify-config
vault_run python3 /opt/maple-vault/backup.py --config /home/maple-vault/backup.json
vault_run python3 /opt/maple-vault/backup.py --config /home/maple-vault/backup.json --expire-only
```

`--verify-config` checks the local inputs and tests the public recipient with empty plaintext in a pipe. It makes no provider call and starts or stops no service. Schedule the first actual backup during an approved maintenance window. Confirm no concurrent vault deployment, key rotation, direct DB clients, background SQL events or other writers. The job verifies the live containers use the pinned images, the exact named mounts and dedicated rootless storage on the staging filesystem. It briefly stops only `vault.service`; the database stays running. A transient user systemd timer is armed before the stop and starts that same unit if the coordinator dies. The job restarts the application and checks the unit is active before contacting Drive for upload. During commissioning, kill the job in a controlled synthetic trial, check that the timer recovers the app, and measure its actual outage with a loopback probe. If restart fails, inspect the timer and start only the vault unit through `vault_run`.

Capture includes a socket-authenticated `mariadb-dump --single-transaction --quick` on the InnoDB `passbolt` database, the two GPG and two JWT key files, `deploy.json`, both environment files and the exact staged vault unit sources. DB credentials flow through the container's existing environment, without password arguments. TLS is reissued from the host and path information in `deploy.json`; the existing TLS private key is outside the source allowlist. The script reads only those four key files from the verified volume paths inside the rootless namespace. Only ciphertext is written to a temporary file, and the local file is removed once the copy is verified. Reserve at least 20 GiB plus the measured deployment reserve and the configured maximum ciphertext allowance; start with realistic SQL and time ceilings and measure them with synthetic data. [Passbolt Docker backup and recovery](https://www.passbolt.com/docs/hosting/maintenance/backup/from-docker/) · [MariaDB dump options](https://mariadb.com/docs/server/clients-and-utilities/backup-restore-and-import-clients/mariadb-dump) · [Podman rootless namespace](https://docs.podman.io/en/v4.9.3/markdown/podman-unshare.1.html)

The protected, atomic status contains the latest attempt, a safe error code and the last verified generation and SHA-256. A separate private journal records intended uploads before transfer. Keep the journal and independent receipt history; without the journal, reconcile old objects as an operator before enabling expiry on a rebuilt host. Retention verifies the size, ciphertext hash and any previously recorded provider ID before permanent deletion of that exact recognized file in the pinned folder. Day 29 starts deletion; a recognized object still present when checked on or after day 30 fails the run, even when cleared by that run. Unknown names, lookalikes, shortcuts, duplicates and mismatched objects are never deleted. Check provider retention/hold policies before promising physical deletion by a date.

After the off-server custody and restore gate passes, schedule a regular capture and more frequent `--expire-only` sweeps to leave retry time. Use an independent monitor for process exits, stale or failed status, a nonrunning app, and low disk. A failed status or a process stuck at `running` past the configured budgets needs intervention. Lock conflicts return nonzero and leave the current job's status intact; avoid overlapping schedules. Copy the non-secret verified generation, ciphertext SHA-256, source machine ID and verification time to a trusted company-controlled location that survives loss of the vault VPS and backup OAuth access. Use an independently authenticated channel for this receipt; a checksum supplied beside the ciphertext by the same untrusted source does not authenticate it. Supervise the first upload, restore, expiry and alert before automatic use.

## Owner recovery bundle

Use a trusted owner-controlled environment and verified maintained [age tools](https://github.com/FiloSottile/age). With the owner present, arrange private unswappable RAM storage, disable core dumps and shell tracing, and check the transport to the owner's authenticated company Drive session before generating credentials. Never make an identity on the VPS or write plaintext recovery material to the Mac's filesystem. The browser extension necessarily retains its encrypted personal key. If the extension's encrypted recovery kit must first download to personal disk, disclose the exact temporary path; verify the protected transfer and obtain approval to clean up that one file.

At the authorised custody session, the owner creates the two distinct identities directly in the private RAM directory with `age-keygen -o "$owner_ram/dashboard.agekey"` and `age-keygen -o "$owner_ram/vault.agekey"`. Only their respective **public** recipients go to the dashboard and vault runners. Put the owner's Passbolt recovery kit there as `passbolt-owner-kit.asc`; the kit uses the owner's Passbolt passphrase. The owner chooses and enters a separate strong recovery passphrase in age's terminal prompt, and must remember it without needing this vault, this VPS or the company Google password. Losing this passphrase loses this recovery route. Do not leave the prompt blank, put a passphrase in a command or environment variable, or share it in chat.

```bash
(
  set -o pipefail
  umask 077
  ulimit -c 0
  tar -C "$owner_ram" -cf - dashboard.agekey vault.agekey passbolt-owner-kit.asc |
    age --passphrase --output "$owner_ram/maple-owner-recovery-v1.tar.age"
)
```

Upload only the encrypted bundle through the owner's company Drive session to a folder accessible only to the owner, outside both backup runners' delegated access. Record its version and non-secret encrypted checksum and verify independent owner retrieval into private RAM. From the retrieved copy, the owner can verify each identity's public recipient without displaying private material using `age --decrypt "$retrieved_bundle" | tar -xOf - vault.agekey | age-keygen -y` (repeat for `dashboard.agekey`). Check the independent Google sign-in and MFA/recovery path with the live vault unavailable. Then use those independently retrieved materials for the disposable restore, import the Passbolt kit into the isolated owner browser profile and read one synthetic credential. Tear down the transient RAM environment after verified transfer; keep only the approved encrypted Drive copy and the extension's encrypted state. Rotate this bundle deliberately when keys change.

## Restore a verified backup into disposable scratch

Obtain the named ciphertext from Drive as the owner and the matching receipt through a trusted independent channel. Use a private mode 0700 directory and mode 0600 archive. Set the matching generation (the exact full filename), ciphertext SHA-256, source machine ID and limits in a separate mode 0600 JSON file under a private directory. For example, the direct restore configuration has these fields:

```json
{
  "age": "/usr/bin/age",
  "generation": "EXACT_GENERATION_FILENAME",
  "ciphertext_sha256": "VERIFIED_CIPHERTEXT_SHA256",
  "source_machine_id": "VERIFIED_SOURCE_MACHINE_ID",
  "destination": "/run/maple-vault-recovery/verified",
  "max_sql_bytes": 268435456,
  "timeout_seconds": 900
}
```

The destination must be absent. Its parent must be a dedicated mode 0700 Linux tmpfs mount under `/run`, owned by a separate unprivileged recovery account, with `noswap` (or no system swap active). Review free RAM and set a bounded mount size large enough for the archive and the disposable database. Use a separate account with its own subordinate IDs and private Podman storage; verify it cannot read production or dashboard homes. Root and the production vault UID cannot receive the archive. There is no automatic SQL import into any existing service.

On an independent approved recovery host, run `restore.py --config PATH --archive PATH --identity-stdin` with the identity supplied through a private pipe; the production host rejects direct restore. For a same-VPS **isolated drill**, configure the owner-side sender with the same JSON except omit `destination`. Configure the remote receiver with the same pins and destination but omit `age`. Place only public verification pins and the reviewed tooling on the receiver. From the owner environment, use an approved SSH destination for the dedicated recovery account, with its host key already verified. Put the ciphertext and bundle in private RAM and compare the bundle checksum with the independently stored value before decrypting it. No identity is sent in the stream or stored on the server.

```bash
(
  set -o pipefail
  umask 077
  ulimit -c 0
  age --decrypt "$retrieved_bundle" |
    tar -xOf - vault.agekey |
    python3 "$trusted_tools/restore.py" --config "$sender_config" --archive "$ciphertext" \
      --identity-stdin --export-stream |
    ssh -T -o BatchMode=yes -o StrictHostKeyChecking=yes -o ForwardAgent=no vault-recovery-host \
      'umask 077; ulimit -c 0; exec /usr/bin/python3 /opt/maple-vault/restore.py --config /run/maple-vault-recovery/receive.json --receive-stream'
)
```

The age sender checks the trusted ciphertext hash, decrypts only through a pipe and emits a final marker after age authenticates the complete archive. The authenticated SSH receiver checks the generation, archive member allowlist, sizes and final marker before it publishes the new scratch directory. Its status `verified_scratch` proves archive validation only. SSH trusts the identified recovery user and pinned host; never tunnel through an untrusted receiver or tee the stream. Treat any pipeline failure as a failed drill even if a scratch directory exists. An interruption may leave a private `.pending-recovery-*` only in RAM; review its exact path before discarding it. A same-VPS drill tests application loss; a separate host restore with the VPS unreachable is needed to prove whole-host disaster recovery.

### Import SQL and validate vendor service in the isolated environment

Use the disposable account on the approved host. The commands below assume `scratch=/run/maple-vault-recovery`, a verified generation at `"$scratch/verified"`, and the two pinned images available in an otherwise empty recovery Podman graph. Stage only the reviewed images through the separately approved activation procedure; never use a live Podman storage directory. Use fresh storage on private unswappable tmpfs for the database and server key volumes. On the same VPS, confirm memory, distinct UID/sub-IDs, loopback port and the names below are free before starting. Keep network egress blocked and omit live SMTP configuration. Do not start the archived Quadlets: they are a configuration reference, and contain original paths and names.

```bash
umask 077
ulimit -c 0
scratch=/run/maple-vault-recovery
stash="$scratch/verified"
p() {
  /usr/bin/podman --root "$scratch/graphroot" --runroot "$scratch/runroot" "$@"
}
app_image=docker.io/passbolt/passbolt@sha256:27e27a51bc3a9339cad638bcd0ca7dabc1b6956524aab89dfdd356c8ce61dd2d
db_image=docker.io/library/mariadb@sha256:135c49b72e97143b73cc273dcdc95d2b035e3ebfbd536c3d72c65b715a8e06b5

# Review graphroot, image IDs, existing storage and network before continuing.
test "$(id -u)" -ne 0 && test "$(id -u)" -ne 2010 &&
test "$(p info --format '{{.Host.Security.Rootless}} {{.Store.GraphRoot}}')" = "true $scratch/graphroot" &&
p image exists "$app_image" && p image exists "$db_image" &&
test -s "$stash/database.sql"
```

Stop if any gate fails. Set an isolated test URL, a reserved private loopback port and a TLS proxy for the test profile before starting the app. You can route the original vault hostname only inside that disposable browser profile when needed for owner recovery; keep public DNS and production Nginx unchanged. Provide a trusted certificate for the isolated profile and vendor health query. Route the test origin privately from both the browser and the app, for example through a TLS proxy attached to the recovery bridge if the vendor health check needs to resolve itself. Use a separate local SMTP sink only if the approved owner test requires an email. Never send real mail from the restored database.

```bash
(
  set -eu
  test ! -e "$scratch/recovery-db.env" && test ! -e "$scratch/recovery-app.env"
  awk -F= '$1=="MARIADB_PASSWORD" || $1=="MARIADB_ROOT_PASSWORD"' \
    "$stash/config/db.env" > "$scratch/recovery-db.env"
  awk -F= '$1=="DATASOURCES_DEFAULT_PASSWORD" || $1=="SECURITY_SALT" || $1=="PASSBOLT_GPG_SERVER_KEY_FINGERPRINT"' \
    "$stash/config/app.env" > "$scratch/recovery-app.env"

  # Inspect the isolated store first. Decline any pre-existing trial names/resources.
  p network create --internal --opt isolate=true maple-vault-recovery-net
  for vol in maple-vault-recovery-db maple-vault-recovery-gpg maple-vault-recovery-jwt; do
    if p volume exists "$vol"; then exit 1; fi
    p volume create "$vol"
    test "$(p volume inspect --format '{{.Mountpoint}}' "$vol")" = "$scratch/graphroot/volumes/$vol/_data"
  done
  gpg_dir="$scratch/graphroot/volumes/maple-vault-recovery-gpg/_data"
  jwt_dir="$scratch/graphroot/volumes/maple-vault-recovery-jwt/_data"
  # Confirm www-data is UID/GID 33 in the selected official image during the trial.
  p unshare /usr/bin/install -d -m 0750 -o 33 -g 33 "$gpg_dir"
  p unshare /usr/bin/install -d -m 0750 -o 0 -g 33 "$jwt_dir"
  p unshare /usr/bin/install -m 0600 -o 33 -g 33 \
    "$stash/gpg/serverkey.asc" "$stash/gpg/serverkey_private.asc" "$gpg_dir"
  p unshare /usr/bin/install -m 0640 -o 0 -g 33 \
    "$stash/jwt/jwt.key" "$stash/jwt/jwt.pem" "$jwt_dir"

  p run -d --pull=never --name maple-vault-recovery-db --network maple-vault-recovery-net \
    --http-proxy=false --security-opt=no-new-privileges --log-driver=none --memory=768m --cpus=1 \
    --env-file "$scratch/recovery-db.env" --env MARIADB_DATABASE=passbolt \
    --env MARIADB_USER=passbolt --env MARIADB_ROOT_HOST=localhost \
    --volume maple-vault-recovery-db:/var/lib/mysql "$db_image" --general-log=0 --slow-query-log=0
)
```

Verify `p port maple-vault-recovery-db` lists no port, and `p exec maple-vault-recovery-db healthcheck.sh --connect --innodb_initialized` passes after initialization. Confirm the app database exists and contains no tables through the local socket, using the credential from the disposable container environment. A failed check or import aborts this generation; do not retry into partially imported DB state.

```bash
(
  set -eu
  tables=$(p exec maple-vault-recovery-db /bin/sh -ec '
    test -n "${MARIADB_ROOT_PASSWORD:-}"
    export MYSQL_PWD="$MARIADB_ROOT_PASSWORD"
    exec /usr/bin/mariadb --protocol=socket --user=root --batch --skip-column-names passbolt \
      --execute="SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE();"
  ')
  test "$tables" = 0
  p exec -i maple-vault-recovery-db /bin/sh -ec '
    test -n "${MARIADB_ROOT_PASSWORD:-}"
    export MYSQL_PWD="$MARIADB_ROOT_PASSWORD"
    exec /usr/bin/mariadb --protocol=socket --user=root --binary-mode --local-infile=0 passbolt
  ' < "$stash/database.sql"
)
```

Verify the fresh isolated network blocks external egress before starting Passbolt. For example, after setting `trial_url` to the approved TLS test origin and `trial_port` to the reviewed unused loopback port:

```bash
p run -d --pull=never --name maple-vault-recovery-app --network maple-vault-recovery-net \
  --http-proxy=false --security-opt=no-new-privileges --cap-drop=all --memory=1024m --cpus=1 --log-driver=none \
  -p "127.0.0.1:$trial_port:8080" --env-file "$scratch/recovery-app.env" \
  --env "APP_FULL_BASE_URL=$trial_url" --env DATASOURCES_DEFAULT_HOST=maple-vault-recovery-db \
  --env DATASOURCES_DEFAULT_PORT=3306 --env DATASOURCES_DEFAULT_USERNAME=passbolt \
  --env DATASOURCES_DEFAULT_DATABASE=passbolt --env DATASOURCES_DEFAULT_LOG=false --env DEBUG=false \
  --env PASSBOLT_SSL_FORCE=true --env PASSBOLT_SECURITY_PROXIES_ACTIVE=true \
  --env PASSBOLT_SECURITY_FULLBASEURL_ENFORCE=true --env PASSBOLT_PLUGINS_SELF_REGISTRATION_ENABLED=false \
  --env PASSBOLT_SECURITY_SMTP_SETTINGS_ENDPOINTS_DISABLED=true \
  --volume maple-vault-recovery-gpg:/etc/passbolt/gpg:nocopy \
  --volume maple-vault-recovery-jwt:/etc/passbolt/jwt:ro,nocopy \
  "$app_image" /usr/bin/wait-for.sh -t 60 maple-vault-recovery-db:3306 -- /docker-entrypoint.sh

p exec --user www-data maple-vault-recovery-app /bin/bash -c \
  '. /etc/environment && ./bin/cake passbolt healthcheck'
```

Run the vendor check privately and keep only safe pass/fail evidence. Confirm the server GPG and JWT keys are reused, the database schema is healthy and only the selected app port is bound to loopback. Treat any rootless volume ownership or vendor health error as a failed drill to diagnose; do not generate replacement keys or weaken the production sandbox to make it pass. Use the owner extension and recovered kit in the independent browser profile to verify sign-in, MFA and the known synthetic credential's readability. Record receipt pins, versions, health, owner verification and cleanup evidence without credentials, fingerprints, emails or URLs. When approved, stop and remove only those disposable names, then unmount the exact scratch mount after reviewing its contents. Check the live units and dashboard independently. Successful encryption, checksum verification and synthetic parser tests are not vendor recovery evidence.
