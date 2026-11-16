# Account security rollout

The API listens on `127.0.0.1` by default. Production rejects non-loopback `API_HOST`. The web process must use `npm run start` (which binds `127.0.0.1:3006`) or equivalent explicit PM2 launch arguments. Verify both process sockets and public HTTPS. Nginx must overwrite `X-Real-IP` with `$remote_addr`; the web server sends only that validated address to the API. Do not put an untrusted service between that proxy and the loopback listeners.

1. Deploy with `MFA_REQUIRED=false`. Staging permits existing individual accounts to continue with a password until each enrols. A successfully enrolled account always needs its second factor, even during staging.
2. The owner sets up their own time-based authenticator on **Security**, verifies it, and saves the recovery codes in protected storage. In a separate session, the owner signs in with one recovery code and makes sure the rest are still available. The API records use of a recovery code issued for the current authenticator. Test the authenticator itself in a fresh time slot as well.
3. Verify the maintenance and backup status, confirm the team's enrolment window, then deploy or restart the API with `MFA_REQUIRED=true`. Its first start refuses to serve if no active owner has a usable encrypted authenticator, a tested recovery sign-in for that authenticator, and a remaining code. The first successful cutover records `mfaEnforcedAt` on MongoDB collection `securitypolicies`, record `_id: "studio"`.
4. Everyone signs in again after cutover. Previous access and refresh tokens lack the enforcement claim. Existing enrolled users sign in with a second factor; unenrolled accounts can only enrol. The legacy shared key does not work while enforcement is on. Remove it after compatible integrations have migrated. A process that supports the marker refuses to start with enforcement off after the first cutover. Operators must prevent rollback to releases that cannot read the marker.
5. A restricted backup status file must report a recent encrypted and verified offsite run, a recent isolated restore, 30-day retention, and proven cleanup of inventoried legacy plaintext. Owner attestations are separate and must be based on actual checks. These checks control NDA template publication. Set a distinct agreement retention policy before issuing live signing links.

## Lost authenticator and recovery codes

If one recovery code remains, the account holder can use it to sign in and replace the authenticator under **Security**. Start replacement within five minutes of that sign-in and confirm the password. After that window, the app asks for a fresh second factor, which requires another unused recovery code if the authenticator is unavailable.

If all factors are lost, do not turn off MFA globally. Open a restricted incident record, verify the person's identity using an established independent channel, and obtain approval from the account owner or designated incident owner. For the sole owner, verify control against the pre-established company recovery contacts before changing access. The operator records the verification and approval in the incident record. Reset only the verified active account by ID from the intended Maple API host and database:

```sh
npm run operator:reset-mfa -- ACCOUNT_ID INCIDENT_REFERENCE --identity-verified
```

Run from the built `backend/` release with its normal protected database configuration. Do not put passwords, authenticator keys, recovery codes, client details or verification evidence in the command or incident reference. The command records the host operator identity, timestamp and reference in the same account update that revokes existing sessions and clears the failed factor. With enforcement enabled the affected user can only enrol, and must set up and test their own account recovery again. If the password is also lost or suspected compromised, use the separate authorised password/account recovery process before allowing enrolment; do not reset or send credentials in an ordinary dashboard message.
