"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { PageHeading, useAdmin } from "@/components/pages/admin/AdminShell";
import { sessionFetch, type MfaStatus } from "@/lib/admin/session-client";
import AuthenticatorForm, { ConfirmIdentity, field, primary, secondary } from "./AuthenticatorForm";

const attestations = [
  ["devices", "Authorised devices", "Disk encryption and maintained protection are in place on devices approved for client work."],
  ["staff-confidentiality", "Staff confidentiality", "People with access have signed applicable staff or contractor confidentiality terms."],
  ["offboarding", "Offboarding", "A named owner removes client access promptly when someone leaves or changes roles."],
  ["cloud-mfa", "Cloud account MFA", "Supported company and provider accounts used for client work have MFA enabled."],
  ["provider-permissions", "Provider permissions", "The providers and permissions in scope are approved for the data they handle."],
  ["incident-response", "Incident response", "The response owner, contact channel and escalation steps are in place."],
] as const;
type AttestationId = typeof attestations[number][0];
type Attestation = { scope: string; confirmedAt: string; confirmedBy: { id: string; email: string } };
type Policy = {
  revision: number;
  agreementRetentionMonths: number | null;
  retentionBasis: string;
  legalHoldPolicy: string;
  attestations: Partial<Record<AttestationId, Attestation>>;
};
type Readiness = {
  ready: boolean;
  checks: { id: string; ok: boolean; detail: string }[];
  policy: Policy;
};
const labels: Record<string, string> = {
  "mfa-enforcement": "Dashboard MFA", "owner-mfa": "Owner recovery",
  "backup-upload": "Google Drive upload", "backup-retention": "Backup retention",
  "backup-restore": "Isolated restore", "backup-legacy": "Legacy plaintext backups",
};
const card = "rounded-xl border border-[#d8c3a5] bg-[#fff8ed] p-5 text-[#211715] sm:p-6";

export default function Security() {
  const { account, adminFetch } = useAdmin();
  const owner = account?.role === "owner" && account.id !== "legacy";
  const [mfa, setMfa] = useState<MfaStatus>();
  const [readiness, setReadiness] = useState<Readiness>();
  const [loading, setLoading] = useState(true);
  const [setup, setSetup] = useState(false);
  const [reauth, setReauth] = useState(false);
  const [policy, setPolicy] = useState({ months: "", basis: "", holds: "" });
  const [scopes, setScopes] = useState<Partial<Record<AttestationId, string>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const requests = [sessionFetch("/api/admin/session"), ...(owner ? [adminFetch("/api/v2/security/readiness")] : [])];
    const [session, report] = await Promise.all(requests);
    if (!session.ok || (report && !report.ok)) throw new Error("Could not load the security checks. Try again.");
    setMfa((await session.json()).mfa);
    if (report) {
      const data: Readiness = await report.json();
      setReadiness(data);
      setPolicy({
        months: data.policy.agreementRetentionMonths?.toString() ?? "",
        basis: data.policy.retentionBasis, holds: data.policy.legalHoldPolicy,
      });
    }
  }, [adminFetch, owner]);
  useEffect(() => {
    void load().catch(e => setError(e.message)).finally(() => setLoading(false));
  }, [load]);

  async function save(patch: object) {
    if (!readiness || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await adminFetch("/api/v2/security/policy", {
        method: "PATCH", body: JSON.stringify({ revision: readiness.policy.revision, ...patch }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (result.code === "RECENT_MFA_REQUIRED") setReauth(true);
        throw new Error(result.error || "Could not save security policy.");
      }
      setNotice("Security policy saved.");
      await load();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save security policy.");
    } finally {
      setBusy(false);
    }
  }

  const saveRetention = (event: FormEvent) => {
    event.preventDefault();
    void save({ agreementRetentionMonths: policy.months ? Number(policy.months) : null, retentionBasis: policy.basis, legalHoldPolicy: policy.holds });
  };
  return (
    <div className="space-y-5">
      <PageHeading title="Security" sub={owner ? "Account protection, observed readiness and company policy." : "Manage your individual account protection."} />
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="text-sm text-[#24553a]">{notice}</p>}
      {loading && <p role="status">Checking security settings…</p>}
      {mfa && <section className={card} aria-labelledby="authenticator-heading">
        <h2 id="authenticator-heading" className="font-serif-luxury text-2xl">Authenticator</h2>
        <p className="my-2 text-sm">{mfa.enrolled
          ? `Enrolled. ${mfa.recoveryCodesRemaining} recovery codes remain.`
          : "Set up an authenticator app so your password alone cannot open your account."}</p>
        {setup ? <AuthenticatorForm replacing={mfa.enrolled} recentlyVerified={mfa.recent} onCancel={() => setSetup(false)} onComplete={session => {
          setSetup(false); setMfa(session.mfa); setNotice("Authenticator is ready."); void load().catch(e => setError(e.message));
        }} /> : <button className={primary} onClick={() => { setSetup(true); setReauth(false); }}>{mfa.enrolled ? "Replace authenticator" : "Set up authenticator"}</button>}
      </section>}
      {owner && readiness && <>
        <section className={card} aria-labelledby="readiness-heading">
          <h2 id="readiness-heading" className="font-serif-luxury text-2xl">Technical readiness</h2>
          <p className="my-2 text-sm">{readiness.ready ? "Ready to publish the confidentiality template." : "Confidentiality publication is blocked until the technical checks and owner attestations pass."}</p>
          <ul className="divide-y divide-[#d8c3a5]">
            {readiness.checks.filter(check => labels[check.id]).map(check => <li key={check.id} className="py-3">
              <p className="font-semibold">{labels[check.id]} <span className={check.ok ? "text-[#24553a]" : "text-[#8a2e20]"}>· {check.ok ? "Verified" : "Needs attention"}</span></p>
              <p className="mt-1 text-sm">{check.detail}</p>
            </li>)}
          </ul>
        </section>
        {reauth && <section className={card} aria-label="Confirm identity">
          <h2 className="mb-3 font-serif-luxury text-xl">Confirm your identity to change policy</h2>
          <ConfirmIdentity onVerified={status => { setMfa(status); setReauth(false); setError(""); setNotice("Identity confirmed. Save your change again."); }} />
        </section>}
        <section className={card} aria-labelledby="attestations-heading">
          <h2 id="attestations-heading" className="font-serif-luxury text-2xl">Owner attestations</h2>
          <p className="my-2 text-sm">Record what you personally confirmed and the people, devices or systems it covers. Only include people and systems with client access.</p>
          <ul className="divide-y divide-[#d8c3a5]">
            {attestations.map(([id, label, description]) => {
              const attestation = readiness.policy.attestations[id];
              const scope = scopes[id] ?? attestation?.scope ?? "";
              return <li key={id} className="space-y-2 py-4">
                <p className="font-semibold">{label}</p><p className="text-sm">{description}</p>
                {attestation && <p className="text-sm text-[#24553a]">Confirmed by {attestation.confirmedBy.email} on {new Date(attestation.confirmedAt).toLocaleString()}.</p>}
                <label className="block text-sm">Scope of confirmation
                  <input className={field} value={scope} maxLength={400} onChange={e => setScopes(prev => ({ ...prev, [id]: e.target.value }))} />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button className={secondary} disabled={busy || !scope.trim()} onClick={() => void save({ attestations: [{ id, confirmed: true, scope }] })}>{attestation ? "Confirm again" : "Record confirmation"}</button>
                  {attestation && <button className={secondary} disabled={busy} onClick={() => void save({ attestations: [{ id, confirmed: false, scope: attestation.scope }] })}>Withdraw confirmation</button>}
                </div>
              </li>;
            })}
          </ul>
        </section>
        <section className={card} aria-labelledby="retention-heading">
          <h2 id="retention-heading" className="font-serif-luxury text-2xl">Signed agreement retention</h2>
          <p className="my-2 text-sm">Set how long the signed PDF, signer identity and related audit records are retained. Client signing links remain unavailable until all three fields are set.</p>
          <form onSubmit={saveRetention} className="space-y-3">
            <label className="block text-sm">Retention in months
              <input className={field} value={policy.months} type="number" min="1" max="1200" step="1" onChange={e => setPolicy(prev => ({ ...prev, months: e.target.value }))} />
            </label>
            <label className="block text-sm">Retention basis
              <textarea className={field} value={policy.basis} maxLength={1500} onChange={e => setPolicy(prev => ({ ...prev, basis: e.target.value }))} />
            </label>
            <label className="block text-sm">Legal hold process
              <textarea className={field} value={policy.holds} maxLength={1500} onChange={e => setPolicy(prev => ({ ...prev, holds: e.target.value }))} />
            </label>
            <button className={primary} disabled={busy}>Save agreement policy</button>
          </form>
        </section>
      </>}
    </div>
  );
}
