# Maple Studios company vault

Status: proposed design, awaiting owner review. 16 November 2026.

## Intent and decisions

Run a company-controlled vault for team passwords, API keys and the dashboard backup recovery key, without another software subscription. The owner chose company-hosted Passbolt Community Edition and asked to reuse the existing Hostinger VPS. The owner rejected retaining standalone backup/recovery files on this Mac. Passbolt's encrypted browser key and required recovery kit were disclosed before the choice.

## Approaches

- A bespoke company vault would require maintaining cryptography, sharing and recovery ourselves. Rejected in favour of a maintained product.
- A hosted password manager reduces operations but adds an external vault service. The owner prefers company hosting.
- Passbolt CE supplies individual accounts and selective sharing without per-seat software cost. Selected by the owner. A separate VPS provides stronger isolation but adds hosting cost; propose the existing VPS first, subject to the gates below.

## Verified starting point

Existing production VPS: 4 CPUs, about 16 GB RAM with about 11.3 GB available. Disk is 91% full, about 19.2 GiB free. Existing Podman reports rootless/overlay support; no containers currently run under deploy. This establishes tooling availability, not that Passbolt is tested under Podman. The ordinary deploy account runs other services. Full sudo requires owner authentication; its limited passwordless Nginx permissions must not be repurposed to gain root.

No Passbolt installation, account, credential, DNS or hosting purchase has been made. Existing dashboard security/signing implementation continues separately.

## Proposed deployment

- Proposed hostname: `vault.maplestudios.ai`; public HTTPS endpoint with no self-registration.
- Dedicated `maple-vault` OS account, private home/storage, no sudo and no dashboard filesystem access. Never run vault containers as the existing shared deploy user.
- Official version-pinned Passbolt CE rootless OCI image and version-pinned compatible database image. Prefer existing Podman under the dedicated account; validate persistence, rootless networking, image compatibility, restart and health checks before storing real secrets. If compatibility fails, return with the measured issue and supported Docker alternative; do not weaken isolation or install a privileged daemon silently.
- Nginx terminates valid TLS and proxies to a loopback-only high port. Database remains inside the private container network; no published DB port, host socket mounts, privileged containers or host network.
- Dedicated user systemd/Quadlet supervision, restart on reboot, bounded logs, memory/CPU limits, protected secrets and volumes. Initial proposed ceiling: 2 GB RAM and 2 CPUs, adjusted only from testing and host capacity.
- Before installation, inventory storage by directory; present any cleanup targets and obtain explicit deletion approval. Do not prune all unused images. Require at least 30 GiB free before image pulls, and at least 20 GiB after installation plus a measured upgrade/backup working-space allowance. If unavailable, defer installation or obtain approval for a storage upgrade; no purchase is authorised.
- Host root compromise still threatens both services. Separate accounts/containers reduce ordinary cross-service access but do not constitute a separate host or independent disaster-recovery copy.

## Accounts and day-to-day sharing

The designated company owner is the first vault administrator; the approved account email stays in private deployment configuration. Dashboard Owner/Admin roles do not automatically grant vault privileges. Initially owner-only: backup recovery, infrastructure/registrar credentials and billing secrets. Proposed Engineering, Design and Growth groups begin empty; share only project-specific credentials with named employees after their accounts are approved. The designated dashboard administrator receives no blanket secret access by virtue of that role.

Each user sets their own passphrase and anti-phishing token and installs the official extension. Enable available CE MFA for the owner and verify it before adding production credentials; do not promise paid central MFA policy enforcement, Google SSO, administrator escrow or premium audit history. No secrets/passphrases/setup URLs in git, chat, logs or ordinary generated documents. No employee invitations or real client messages without explicit instruction.

SMTP uses an appropriately scoped Maple Studios sending credential and verified sender; no reuse of Maple Furnishers identity. Select provider from current company configuration and validate it without sending unrequested employee mail. Owner setup email may be requested explicitly at the handoff if needed.

## Recovery without a circular dependency

Use two distinct age identities: dashboard backup and vault backup. Public recipients may reside on the VPS; private identities may not. Dashboard identity can be an owner-only item in Passbolt, but that is not its sole recovery copy.

Before activation, prepare an independent recovery bundle containing both age identities and the owner's passphrase-encrypted Passbolt recovery kit. Encrypt the complete bundle using age's maintained passphrase encryption on the owner's device with a separate owner-entered strong recovery passphrase. No custom encryption scheme or server-side decryption service. That passphrase must remain available independently of this vault, VPS and company Google password; a memorised owner-held passphrase is the proposed no-paper/no-second-manager compromise. Forgetting it loses this recovery route, which must be clearly acknowledged at setup. Never ask the owner to send it in chat.

Store only the encrypted bundle in an owner-only company Google Drive recovery folder. This folder must be outside the backup runner's `drive.file` access: upload through the owner's Drive session, not the recurring-backup app. Confirm permissions and record non-secret checksum/version. The unattended backup job cannot delete the bootstrap recovery bundle. Direct company Google login and its independent MFA/recovery path must work without this VPS or vault before activating backups.

No plaintext identity or standalone recovery file is retained on the Mac. Use transient memory where supported. If Passbolt's mandatory recovery-kit download requires a temporary encrypted file, disclose its exact path, transfer and verify the protected copy, then ask for targeted cleanup approval; do not silently leave it or pretend the extension has no local key. The browser extension necessarily retains its encrypted user key. The owner enters all newly chosen passphrases directly. If a safe handoff cannot meet these requirements, pause custody activation rather than weaken encryption.

## Vault backups and restore

Vault backups include a transaction-consistent database export, GPG server keys, JWT keys where required by the selected version, configuration, and required TLS/redeployment information. Use the vendor's documented backup and restore procedures. Encrypt before uploading to a separate private Google Drive backup folder under a dedicated/scoped runner configuration. Local staging is protected and bounded; no unencrypted archive persists after completion or failed cleanup.

Keep the existing dashboard backup machinery isolated; do not point its Mongo-specific restore procedure at Passbolt. Vault restore uses its own database and health-check runbook. Expire normal backup generations conservatively before 30 days with retry headroom and overdue failure reporting. The bootstrap recovery bundle is not a rolling backup and is excluded from this expiry; replace it deliberately when keys change.

Test a disposable restore from Drive, then verify Passbolt health and owner decryption of a synthetic credential before adding company credentials. Test independent recovery with the live vault unavailable: owner can access Drive, decrypt the bundle, rebuild the vault from its encrypted backup, import the kit and retrieve the synthetic credential. Never use the only production instance for a destructive restore test. No production backup activation until this recovery path is verified.

## Operations and acceptance

The builder chooses exact compatible image versions, unoccupied port, unit names, filesystem paths and resource limits after current inspection. Owner performs root provisioning and DNS steps if delegated access is unavailable. Do not expand deploy sudo privileges. No purchase, unrelated service restarts or broad cleanup.

Acceptance requires valid HTTPS; private database and loopback app listener; successful reboot/persistence test; no cross-account read access; owner extension sign-in and MFA; synthetic per-item/group access test; successful encrypted backup and separate restore; verified independent bundle custody; monitored disk/backup age and failure alert delivery. Reports distinguish tested synthetic behavior, live provider verification and owner actions still pending. Until satisfied, label the vault staged and do not migrate production secrets into it.

## Sources

- https://www.passbolt.com/pricing/pro — CE and paid-feature boundaries.
- https://www.passbolt.com/docs/hosting/requirements/ — published baseline requirements.
- https://www.passbolt.com/docs/hosting/install/ce/docker/ — official image deployment, version pinning and SMTP.
- https://www.passbolt.com/docs/hosting/maintenance/backup/ — required backup material and restore health check.
- https://www.passbolt.com/docs/user/quickstart/browser/first-setup/ — extension, passphrase and recovery kit.
