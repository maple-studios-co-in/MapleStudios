# Maple dashboard backup and recovery

This job snapshots the standalone dashboard MongoDB database and explicitly listed files, encrypts each stream with age, and verifies a downloaded copy of each ciphertext and the manifest in a private Google Drive folder. The local and remote copies use the same generation. The job briefly stops **only** `maple-studios-web` and `maple-studios-api` while their data is captured. It restores previously online processes, verifies their loopback health endpoints, and releases the deployment lock before transfer.

## Install and configure

- Use Python 3.10 or newer on the VPS plus GNU Coreutils `timeout`, util-linux `flock`, PM2, Git, [MongoDB Database Tools](https://www.mongodb.com/docs/database-tools/installation/) and [mongosh](https://www.mongodb.com/try/download/shell). Install maintained versions of [age](https://github.com/FiloSottile/age/releases) and [rclone](https://rclone.org/downloads/) from the official vendor channels for the host's architecture. Verify official checksums/signatures where published before installation. Record the checked releases and results of `age --version`, `rclone version`, `mongodump --version`, `mongosh --version`, and `timeout --version` privately. The code uses native age X25519 or age hybrid recipients and Drive features tested against age 1.3.2 / rclone 1.76.0. Use the same MongoDB major release and matching/pinned mongosh version for the drill.
- Provision a **dedicated company OAuth desktop client** per [rclone's Drive instructions](https://rclone.org/drive/#making-your-own-client-id). The shared rclone client ID is being retired. Authorize the company account with `drive.file`, then use that OAuth app to create the private backup folder so the app has access under the limited scope. Pin its verified ID as `root_folder_id` and `folder_id`. Use the dedicated private folder as the job's only writer. Check the company account, permissions, no public sharing, token refresh, and deletion rights; config validation alone cannot verify these provider settings. Do not broaden the Drive scope to make a folder created outside the authorized app visible. In Google Cloud, leave the OAuth app in an appropriate company-approved production or internal state so a short-lived test refresh token cannot silently halt the job.
- Establish owner-controlled off-server recovery custody and a recoverable second copy before changing the backup schedule or touching known-good backups. The VPS receives **only the public recipient**. Private identities belong in approved off-server custody; never print them, put them on the server, or write them into transcripts, Git, terminal history, or a personal computer's filesystem. Use the vault's secure pipe output when doing a drill. Plan for the owner's absence and for the loss of both the VPS and the OAuth credential.
- Create owner-only directories (0700) for configuration, status/locks, and encrypted generations, outside the application checkout. Keep all private configuration files 0600 under the deploy user. The rclone config is a dedicated INI file containing just the selected `[remote]`, with `type=drive`, `scope=drive.file`, `client_id`, `client_secret`, `root_folder_id`, and an authorized `token` with a refresh token. Optional `use_trash=false` and `skip_shortcuts=true` are also accepted and are forced on commands. rclone must be able to update its private config when it refreshes the token. The MongoDB tools config is a protected JSON object (also valid YAML for mongodump) with a single `"uri"`: percent-encode MongoDB credentials, include the literal loopback IP, port `27017`, exact dashboard database in the URI path, and `authSource` if needed. Use a read-only account with permission to list collections/indexes and read the app database. Use a restricted Resend sending key for the existing company transport; supply it as a one-line file and use the approved sender and company incident mailbox.
- Inventory mutable files during setup. Back up required CMS/media and runtime configuration as explicit sources. Keep backup-specific OAuth, MongoDB, Resend, vault and recovery configuration outside the sources and list other sensitive paths in `excluded_paths`. Do not back up an entire checkout, home, build cache, backup tree or old deployment directories. The packer rejects symlinks, multiple hard links, and non-file/directory entries; explicitly exclude those if not required. Runtime application secrets in required environment files are encrypted in the generation and remain sensitive.

Example structure, with placeholder values only. Canonical absolute paths are required; each tool executable may be installed outside the checkout. The two exact Maple PM2 names are fixed in code. On a shared MongoDB include only the Maple dashboard database.

```json
{
  "deploy_lock": "/home/ops/.local/state/maple/locks/deploy.lock",
  "output_dir": "/home/ops/.local/state/maple/encrypted",
  "status_path": "/home/ops/.local/state/maple/locks/status.json",
  "revision_dir": "/home/ops/application",
  "tools": {
    "age": "/opt/tools/age",
    "git": "/usr/bin/git",
    "mongodump": "/usr/bin/mongodump",
    "mongosh": "/usr/bin/mongosh",
    "pm2": "/opt/node/bin/pm2",
    "rclone": "/opt/tools/rclone",
    "timeout": "/usr/bin/timeout"
  },
  "pm2_home": "/home/ops/.pm2",
  "recipient": "<native age public recipient>",
  "rclone_config": "/home/ops/.config/maple-backup/drive.conf",
  "rclone_remote": "company-backups",
  "folder_id": "<verified private folder ID>",
  "job_id": "<32 random lowercase hex digits; stable for this repository of backups>",
  "mongo_config": "/home/ops/.config/maple-backup/mongo.json",
  "database": "dashboard_example",
  "sources": {
    "web-env": "/home/ops/application/.env.local",
    "api-env": "/home/ops/application/backend/.env",
    "cms": "/home/ops/application/cms-data",
    "media": "/home/ops/application/uploads"
  },
  "excluded_paths": [],
  "maintenance_seconds": 90,
  "transfer_seconds": 300,
  "minimum_free_bytes": 1073741824,
  "alert": {
    "from": "Operations <ops@example.invalid>",
    "to": "incident@example.invalid",
    "key_file": "/home/ops/.config/maple-backup/resend.key"
  }
}
```

`maintenance_seconds` accepts 15–180; recovery has a separate one-minute budget. Adjust `transfer_seconds` (15–1800) to bound each remote stage while covering full ciphertext downloads and expiry checks. Size the disk/quota reserve for maximum expected generation growth. Run `python3 backup.py --config /protected/job.json --verify-config`: it reads protected inputs and checks the public recipient with a tiny in-memory encryption. It does not call PM2, Drive, MongoDB or Resend, write status, or create a generation.

## Supervised cutover and schedule

1. Use a stable absolute path for installed scripts. Wrap **all** deploys and rollbacks that may touch the apps, database or source paths in `flock -n /protected/locks/deploy.lock /path/to/deploy-or-rollback`. Use the same file and inode as `deploy_lock`. Never remove or replace a lock file. If the recovery journal exists, run the watchdog and confirm both previously online processes are healthy before starting a deploy. Keep other writers, maintenance jobs and database TTL/index changes from modifying the backed-up sources during the snapshot.
2. Install the independent watchdog under the same user with an explicit PATH containing the PM2 command's Node interpreter. Run the backup once in the approved maintenance window as that user. Check the production home page/API readiness before and after. Record actual outage duration with a loopback and public probe. The script emits elapsed maintenance seconds without exposing archive data; elapsed time includes its checks and is not the exact external outage measurement. Mongo and unrelated apps must stay online.
3. Verify the same generation in the pinned Drive folder, retrieve its ciphertext and manifest, and successfully complete the off-server identity drill below. Record the receipt after verifying custody and the retrieval. Review the exact list of old plaintext dumps, workspace copies and old restore scratch directories; separate build/dependency rollback assets. Preserve known-good files until new Drive upload, retrieval, restore and key custody have all been verified. Convert any still-required historical plaintext to separately encrypted managed copies with a defined expiry, or retire precisely inventoried files with explicit operator approval. This job never deletes any legacy path. Only record `legacyPlaintextCleared=true` after the independent legacy inventory is cleared. The operator should preserve other status fields and use the same non-overlap lock and atomic 0600 replacement as the job.
4. Replace the old plaintext job only after the cutover checks. On a UTC host, `15 2 * * *` is 07:45 IST. Confirm the host cron timezone first. Example cron entries using protected absolute paths and a privately rotated log; watchdog remains active if only the backup schedule is disabled:

```cron
PATH=/opt/node/bin:/usr/local/bin:/usr/bin:/bin
15 2 * * * /usr/bin/python3 /opt/maple-sec/backup.py --config /protected/job.json >> /protected/backup.log 2>&1
* * * * * /usr/bin/python3 /opt/maple-sec/backup_watchdog.py --config /protected/job.json >> /protected/backup.log 2>&1
1-59/5 * * * * /usr/bin/python3 /opt/maple-sec/backup.py --config /protected/job.json --expire-only >> /protected/backup.log 2>&1
```

The expiry schedule checks exact ages at or after 30 days; the scheduler interval and provider issues can delay physical deletion. Select a sufficiently frequent interval and verify deletions against the company's retention commitment. Backups, deploys and expiry never collide in the data capture window; the expiry check uses the backup lock and simply skips if another backup operation is busy. Both daily backup and shorter expiry checks permanently delete only recognized expired job objects with a validated ownership manifest in the pinned folder. Unknown objects, invalid manifests, ambiguous duplicates and modified archives are not deleted. No bulk Trash emptying, recursive deletion or Drive sync is used. Confirm that Workspace/Vault retention, holds, or provider recovery controls do not extend your deletion commitment.

Set the API service's `BACKUP_STATUS_PATH` to `status_path`. Keep it accessible to the API service's intended user only. The status schema distinguishes latest attempt, verified upload, restore evidence and legacy clearance. It also includes a safe error code and most recent measured free bytes. The independent scheduler sends at most one incident-mail attempt per six hours, including when delivery fails. It can recover abandoned maintenance via the durable journal even if Drive credentials stop working. The journal is written before stopping a writer. Wrapped child tools retain the maintenance lock until they complete or are killed at their deadline, after which the independent watchdog can recover. Keep an independent health/cron monitor for host failure and verify alerts reach the company incident mailbox during supervised commissioning.

If cutover fails, disable the new daily capture, keep the watchdog on until journal recovery and health checks pass, and keep existing approved recovery copies and the legacy rollback schedule available under the agreed risk controls. Do not change the API readiness status to simulate a pass. If the Drive folder is unavailable or expiry fails, inspect the safe failure code and confirm the exact known generation(s); no bulk cleanup. Restore only into an isolated target; a drill does not replace a separate live data recovery/release decision.

## Monthly Drive recovery drill

Create an empty protected directory named `maple-restore-scratch` beside a private restore JSON file; both directories must be 0700. Prepare a separate 0700 staging directory with **only encrypted** archives and the manifest rclone retrieved from the pinned Drive folder. Use the exact remote object names `maple-<job_id>-<generation>.manifest.json`, `.files.tar.age`, and `.database.age`; chmod 0600. Do not use the local backup generation as the retrieval. The identity is held by the owner off-server. Never start a drill on a personal machine if company data is not permitted there.

Example private restore configuration:

```json
{
  "scratch_dir": "/protected/restore/maple-restore-scratch",
  "port": 49732,
  "timeout_seconds": 300,
  "tools": {
    "age": "/opt/tools/age",
    "mongod": "/usr/bin/mongod",
    "mongorestore": "/usr/bin/mongorestore",
    "mongosh": "/usr/bin/mongosh"
  }
}
```

Use a free loopback port in 49152–65535. The checker starts a new, identified MongoDB process with a fresh database directory and shuts it down after comparing source and restored document counts/hashes and index fingerprints. Restored files are extracted only into the empty private scratch area, with file hashes verified against the encrypted capture inventory. It rejects archive traversal, links, metadata mismatches and occupied/production ports. Use a protected temporary volume and restrict local access to the scratch database and filesystem. On an abrupt host or operator kill, check for the isolated MongoDB process and remove only the known drill scratch directory; an unclean shutdown cannot write proof. The receipt is a safe manifest hash, generation and verification timestamp. Keep receipt and evidence separate from test data.

**Streaming drill, with no personal disk copies and no identity on the VPS.** First retrieve each ciphertext and the manifest into a disposable private directory on the VPS. From a Bash-compatible shell, open separate SSH stdout pipes for the two exact ciphertexts, and pipe vault output into the local sender. The local sender authenticates with age in memory and forwards plaintext frames over a second SSH connection to the isolated scratch checker. Before running, substitute reviewed, literal host and paths in the example and use verified SSH host keys. Do not interpolate an identity or any token into a command. Ensure both receivers use the same retrieved generation. Disable core dumps and shell xtrace; use a company-approved off-server vault client with a direct pipe (never use a file, exported variable, shell substitution or clipboard for the identity).

```bash
set -o pipefail
set +x
ulimit -c 0
exec 3< <(ssh -n -T -o BatchMode=yes -o StrictHostKeyChecking=yes maple-vps 'cat -- /protected/drill/maple-JOB-GENERATION.files.tar.age')
exec 4< <(ssh -n -T -o BatchMode=yes -o StrictHostKeyChecking=yes maple-vps 'cat -- /protected/drill/maple-JOB-GENERATION.database.age')
approved-vault-read-age-identity |
  python3 /trusted/restore_check.py --stream-send --age-tool /opt/tools/age --files-fd 3 --database-fd 4 |
  ssh -T -o BatchMode=yes -o StrictHostKeyChecking=yes maple-vps \
    'umask 077; ulimit -c 0; python3 /opt/maple-sec/restore_check.py --stream-receive --config /protected/restore/restore.json --download-dir /protected/drill --job-id JOB --evidence /protected/restore/receipt.json'
result=$?
exec 3<&- 4<&-
test "$result" -eq 0
```

Neither transfer stream carries the identity. The sender only completes a phase after age has authenticated the entire archive; missing or tampered tails fail the receiver and prevent proof. The receiver also checks the manifest and ciphertext hashes from the retrieved VPS staging copy. Retire only this drill's staging directories after evidence is captured. Trusted hosts and the company account remain part of the custody boundary.

**Fully isolated off-server drill.** If company policy permits recovery data on a dedicated recovery host, use `restore_check.py --config /protected/restore/restore.json --download-dir /protected/drill --job-id JOB --identity-stdin --evidence /protected/restore/receipt.json`, piping directly from the approved vault. A protected owner-only off-server identity file is supported for dedicated hosts that allow it; do not use it on the VPS or a personal machine.

After independently verifying retrieval and successful isolated restore, place only the protected receipt on the backup host. Run `restore_check.py --record-restore --config /protected/job.json --evidence /protected/restore/receipt.json`. It checks the exact receipt against the local manifest marked after a verified upload and preserves other status fields. A periodic encrypted upload and hash check, by itself, does not verify recoverability. Do not set or advance a restore timestamp based on a failed, local-only, or simulated drill.

Run the synthetic test suite without credentials using:
```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s operations/security -p 'test_backup.py'
```
