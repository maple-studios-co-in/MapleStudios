"use client";

import { useState, type FormEvent } from "react";
import { sessionAction, SessionActionError, type Account, type MfaStatus } from "@/lib/admin/session-client";

export const field = "w-full rounded-md border border-[#d8c3a5] bg-white px-3 py-2 text-[#211715] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#741a14]";
export const primary = "rounded-full bg-[#741a14] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";
export const secondary = "rounded-full border border-[#741a14]/35 px-4 py-2 text-sm font-semibold text-[#741a14] disabled:opacity-50";

type FullSession = { admin: Account; mfa: MfaStatus };

export function ConfirmIdentity({ onVerified }: { onVerified: (mfa: MfaStatus) => void }) {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await sessionAction<FullSession>({ action: "reauthenticate", password, code });
      onVerified(result.mfa);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not confirm your identity.");
    } finally {
      setBusy(false);
      setPassword("");
      setCode("");
    }
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block text-sm">Current password
        <input className={field} value={password} type="password" autoComplete="current-password" required onChange={e => setPassword(e.target.value)} />
      </label>
      <label className="block text-sm">Authenticator or recovery code
        <input className={field} value={code} autoComplete="one-time-code" autoCapitalize="none" spellCheck={false} required onChange={e => setCode(e.target.value)} />
      </label>
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
      <button className={primary} disabled={busy}>{busy ? "Confirming…" : "Confirm identity"}</button>
    </form>
  );
}

export default function AuthenticatorForm({
  replacing = false, recentlyVerified = false, onComplete, onCancel,
}: {
  replacing?: boolean;
  recentlyVerified?: boolean;
  onComplete: (session: FullSession) => void;
  onCancel: () => void;
}) {
  const [identity, setIdentity] = useState(!replacing || recentlyVerified);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [key, setKey] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (codes.length) {
        const result = await sessionAction<FullSession>({ action: "confirmEnrolment", savedRecoveryCodes: saved });
        setCodes([]);
        onComplete(result);
      } else if (key) {
        const result = await sessionAction<{ recoveryCodes: string[] }>({ action: "proveEnrolment", code });
        setKey("");
        setCode("");
        setCodes(result.recoveryCodes);
      } else {
        const result = await sessionAction<{ manualKey: string }>({ action: "startEnrolment", password });
        setKey(result.manualKey);
        setPassword("");
      }
    } catch (failure) {
      if (failure instanceof SessionActionError && failure.code === "RECENT_MFA_REQUIRED") {
        setIdentity(false);
        setPassword("");
        setError("");
      } else {
        setError(failure instanceof Error ? failure.message : "Could not complete authenticator setup.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (!identity) return (
    <div className="space-y-3">
      <p className="text-sm">Confirm your identity with your current authenticator or a recovery code before replacing it.</p>
      <ConfirmIdentity onVerified={() => setIdentity(true)} />
      <button type="button" className={secondary} onClick={onCancel}>Cancel</button>
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-3">
      {codes.length ? (
        <>
          <p className="text-sm">Save these single-use recovery codes in your password manager. They are shown only once. A recovery code can sign you in if you lose your authenticator.</p>
          <ul className="space-y-1 rounded border border-[#d8c3a5] bg-white p-3 font-mono text-sm" aria-label="Recovery codes">
            {codes.map(value => <li key={value}>{value}</li>)}
          </ul>
          <label className="flex items-start gap-2 text-sm">
            <input className="mt-1" type="checkbox" checked={saved} onChange={e => setSaved(e.target.checked)} required />
            I saved my recovery codes somewhere I can access if I lose my authenticator.
          </label>
        </>
      ) : key ? (
        <>
          <p className="text-sm">In your authenticator app, add a time-based account named Maple Studios and enter this setup key manually.</p>
          <output className="block break-all rounded border border-[#d8c3a5] bg-white p-3 font-mono text-sm" aria-label="Authenticator setup key">{key}</output>
          <label className="block text-sm">Six-digit authenticator code
            <input className={field} inputMode="numeric" pattern="[0-9]{6}" autoComplete="one-time-code" required value={code} onChange={e => setCode(e.target.value)} />
          </label>
        </>
      ) : (
        <label className="block text-sm">Current password
          <input className={field} value={password} type="password" autoComplete="current-password" required onChange={e => setPassword(e.target.value)} />
        </label>
      )}
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={primary} disabled={busy || (codes.length > 0 && !saved)}>
          {busy ? "Working…" : codes.length ? "Finish setup" : key ? "Verify authenticator" : "Get setup key"}
        </button>
        {key || codes.length ? (
          <button className={secondary} type="button" disabled={busy} onClick={() => { setKey(""); setCodes([]); setCode(""); setSaved(false); setError(""); }}>Restart setup</button>
        ) : null}
        <button className={secondary} type="button" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
