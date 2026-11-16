# Company Vault Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare and deploy Passbolt CE on the existing VPS with isolated access and independently recoverable encrypted backups.
**Architecture:** A dedicated unprivileged OS account runs official Passbolt and database images under rootless Podman. Nginx fronts a loopback listener. Vault recovery is independent of the dashboard and depends on an owner-controlled encrypted Drive bundle.
**Tech Stack:** Ubuntu 24.04, Podman 4.9.3, systemd 255/Quadlet, Python 3, Nginx, Passbolt CE official rootless image, compatible MariaDB, age and rclone.
**Spec:** docs/superpowers/specs/2026-11-16-company-vault-design.md (approved 16 November 2026).

## Global Constraints

- Dedicated `maple-vault` OS account, private home/storage, no sudo and no dashboard filesystem access. Never run vault containers as the existing shared deploy user.
- Require at least 30 GiB free before image pulls, and at least 20 GiB after installation plus a measured upgrade/backup working-space allowance.
- No purchase, unrelated service restarts or broad cleanup. Present exact deletion targets for explicit approval.
- Only official version-pinned images; no privileged container, host network, host socket mount or published database port. Loopback-only app port behind valid HTTPS.
- Initial proposed ceiling: 2 GB RAM and 2 CPUs for the combined vault stack; adjust only from measurement and host capacity.
- No secrets/passphrases/setup URLs in git, chat, logs or ordinary generated documents. Real identities/provider settings stay in private deployment configuration.
- No employee invitations or real client messages without explicit instruction. First owner sets their own credentials.
- Private age identities never reside on the VPS. No standalone recovery material retained on the Mac after approved transfer/cleanup. Encrypted browser extension key is required and disclosed.
- Separate dashboard/vault age identities. Bootstrap recovery bundle in owner-only Drive is outside the backup runner's access and rolling expiry. No production secrets migrated until independent recovery is verified.

## Review Focus

- Re-running provisioning against an existing account or unexpected ownership must fail closed rather than grant access or overwrite data (task1).
- Missing, symlinked or permissive secrets/config and mutable image references must fail before service changes (task1).
- Backup interruption at any pipeline stage must not claim success or leave plaintext material (task2).
- Restore must reject unrelated archives, traversal and existing/live targets, and must work without the live vault (task2/3).
- Full disk or failed startup must not affect unrelated VPS services; actual isolation and recovery evidence must precede secret migration (task1/3).

### Task 1: Isolated deployment package and preflight

**Files:** create operations/vault/{README.md,preflight.py,render.py,provision-host.sh}, operations/vault/templates/{vault.container,vault-db.container,vault.network,vault.volume,vault-db.volume,vault.slice,nginx.conf}, operations/vault/test_deployment.py.

**Interfaces:** `preflight.py --home PATH --phase before-pull|after-install --reserve-bytes N` reports safe JSON capacity/tool/account/port checks and exits nonzero on failed gates, without mutations. `render.py --config PATH --output PATH` validates private JSON, renders into a new owner-only directory, never starts services. Configuration defines hostname, dedicated UID/home, loopback app port, digest-pinned official image references, private env-file paths, public TLS paths, resource ceiling and reserve. It contains no inline credentials. Provisioning script defaults to a dry-run checklist; explicit `--apply` as root creates only the dedicated account/home/subuid-subgid ranges and user linger, refusing pre-existing conflicting accounts. It never edits deploy sudo, installs a daemon, prunes files, or starts services.

- [ ] Add failing tests for capacity boundaries, existing/mismatched account, non-loopback port, exposed DB, mutable image tags, config symlinks and group/world-readable files, output overwrite, unsafe hostname/path input. Assert negative paths do not mutate services/files.
- [ ] Run `python3 -m unittest discover -s operations/vault -p 'test_deployment.py'` and record RED.
- [ ] Implement the preflight, rendering and narrowly scoped root provisioning package. Use official vendor docs for exact container paths and rootless behavior; pin deployment digests only after verification, no invented release tags. Bound logs, add combined cgroup resource ceiling, run persistent DB/GPG/JWT volumes, protect env files and restrict network exposure.
- [ ] Include account/bootstrap, Nginx/TLS and DNS instructions with rollback limited to these units. SMTP secrets enter protected files directly, never rendered output. Describe Podman compatibility as unverified until tested. Prefer vendor standard procedures over custom automation.
- [ ] Run focused tests, `bash -n operations/vault/provision-host.sh`, Python compile checks and static template validation; no live provisioning or image pull in this task. Commit and report exact user-required provisioning steps and measured compatibility gaps.

### Task 2: Encrypted vault backup and independent restore package

**Files:** create operations/vault/{backup.py,restore.py,test_backup.py}; extend operations/vault/README.md. Avoid changes to dashboard backup modules.

**Interfaces:** `backup.py --config PATH [--verify-config|--expire-only]` consumes dedicated private job config (absolute tool paths, container names, exact source volumes/config, public recipient, pinned folder, rclone config, status and lock paths). `restore.py --config PATH --archive PATH --identity-stdin` is for an independent approved recovery host only, never the production VPS or personal disk. Also document an off-server memory decrypt/SSH stream path into isolated server scratch, with no private identity on server, if safe tooling can implement it. No claim that a synthetic drill establishes live recovery.

- [ ] Write failure tests for dump/encrypt/upload/hash/expiry errors, interrupted pipeline cleanup, job collision, low disk and unknown objects; no plaintext archives, false success or unrelated deletion.
- [ ] Record RED, then implement a bounded vendor-consistent database/key/config capture encrypted with age before disk. Use protected FIFO/pipe streams and authenticated vendor DB tools; no secrets in process arguments. Coordinate writes for a consistent snapshot and restore service availability in failure paths. Never stop unrelated services.
- [ ] Upload only ciphertext to the pinned dedicated Drive folder, verify retrieved hash, maintain safe atomic status. Expire recognised job generations from day29, report any generation reaching30days as failure, no blanket delete/sync. Bootstrap bundle is inaccessible to this runner.
- [ ] Add restore validation tests for tampered archives, traversal, occupied targets and wrong generation. Restore only into an empty isolated destination, run vendor healthcheck, verify synthetic item readability with owner credentials later. Database/GPG/JWT/config coverage is mandatory; exact vendor restore commands and supported image version go in runbook.
- [ ] Document owner recovery-bundle creation using maintained age passphrase encryption and no custom cryptography. Passphrases entered by owner; no generated private keys until safe custody and transport are available. Test independent owner retrieval/decryption and loss of live vault explicitly at activation.
- [ ] Run the focused suite and syntax checks; perform real-tool synthetic round trip where environment supports it, explicitly report gaps. Commit and obtain independent review.

### Task 3: Host activation and owner recovery verification

**Files:** private operational evidence outside git; update operations/vault/README.md only for non-secret corrections.

- [ ] Complete reviewed disk inventory; obtain approval for exact cleanup targets or a separately approved storage increase. Require capacity preflight pass before pulling images.
- [ ] Hand owner a reviewed root provisioning command if privileged access remains unavailable; never ask for root password in chat. Confirm dedicated user/subuid mappings and cross-user access restrictions. Verify official image digests then test rootless compatibility and supervision with synthetic data.
- [ ] Configure approved DNS hostname, valid TLS and Nginx proxy, test private DB/no external app listener, restart/persistence and bounded resource use. Do not reboot the entire shared VPS without separate approval; verify user-unit boot wiring and scoped unit restart, report full-host reboot test as pending until authorised.
- [ ] Configure dedicated SMTP transport and first owner setup. Owner chooses passphrase/extension/recovery kit and enables MFA; confirm any consequential browser action at that action. No team invitation yet.
- [ ] Create two distinct age identities only through a protected off-server workflow. Owner enters independent recovery passphrase, stores encrypted bundle in private company Drive outside runner access, and verifies it can be decrypted and used without this vault/VPS. Check independent Google sign-in/recovery access. Complete exact temporary-file cleanup with owner approval.
- [ ] Supervise encrypted vault backup, Drive retrieval and isolated restore; verify health and synthetic credential readability, then verify failure alert delivery. Enable scheduled operations only after recovery and independent custody pass. Keep private keys off server.
- [ ] Whole-change review and final verification. Report installed vs live vs awaiting owner separately. Do not migrate production credentials until all acceptance checks pass; no new billing.
