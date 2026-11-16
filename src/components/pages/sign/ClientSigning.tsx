"use client";

import Image from "next/image";
import { useEffect, useState, useRef, type FormEvent } from "react";

export type AgreementDocument = {
  title: string;
  body: string;
  completion: string;
  retention: { months: number; basis: string; legalHoldPolicy: string; notice: string };
  consent: { client: string; owner: string };
};

type PrivateDocument = {
  document: AgreementDocument;
  status: "awaiting-client" | "awaiting-owner" | "completed";
  contentHash: string;
  signer: { name: string; capacity: string };
  sessionExpiresAt: string;
  completedAt?: string;
  retentionDueAt?: string;
  pdfHash?: string;
};

const actionButton = "min-h-11 rounded-md bg-[#741a14] px-5 py-2.5 text-sm font-semibold text-white transition-colors enabled:hover:bg-[#5d1411] disabled:opacity-55 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#741a14]";
const secondaryButton = "min-h-11 rounded-md border border-[#9f8276] px-4 py-2 text-sm font-semibold text-[#741a14] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#741a14]";
const field = "min-h-11 w-full rounded-md border border-[#987f74] bg-white px-3 py-2 text-[#241b18] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#741a14]";
const errorText = (error: unknown) => error instanceof Error ? error.message : "Private signing is temporarily unavailable.";

class SigningRequestError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export function AgreementText({ document }: { document: AgreementDocument }) {
  return (
    <article className="min-w-0 space-y-6 rounded-xl border border-[#decfc2] bg-white px-5 py-6 text-[#241b18] sm:px-8 sm:py-8">
      <h2 className="text-2xl font-semibold tracking-[-0.025em] [overflow-wrap:anywhere]">{document.title}</h2>
      <p className="whitespace-pre-wrap text-[15px] leading-7 [overflow-wrap:anywhere]">{document.body}</p>
      <section className="border-t border-[#e5d9d1] pt-5">
        <h3 className="mb-2 text-base font-semibold text-[#741a14]">Engagement details</h3>
        <p className="whitespace-pre-wrap text-[15px] leading-7 [overflow-wrap:anywhere]">{document.completion}</p>
      </section>
      <section className="border-t border-[#e5d9d1] pt-5">
        <h3 className="mb-2 text-base font-semibold text-[#741a14]">Record retention</h3>
        <p className="whitespace-pre-wrap text-sm leading-6 [overflow-wrap:anywhere]">{document.retention.notice}</p>
      </section>
    </article>
  );
}

export default function ClientSigning({ id }: { id: string }) {
  const secret = useRef("");
  const initialized = useRef(false);
  const busyRef = useRef(false);
  const [hasSecret, setHasSecret] = useState(false);
  const [document, setDocument] = useState<PrivateDocument>();
  const [initializing, setInitializing] = useState(true);
  const [codeSent, setCodeSent] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [place, setPlace] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const endpoint = `/api/sign/${id}`;

  useEffect(() => {
    if (!initialized.current) {
      const fragment = window.location.hash.slice(1);
      if (window.location.hash || window.location.search)
        window.history.replaceState(window.history.state, "", window.location.pathname);
      if (/^[A-Za-z0-9_-]{43}$/.test(fragment)) {
        secret.current = fragment;
        setHasSecret(true);
      }
      initialized.current = true;
    }
    const controller = new AbortController();
    fetch(`${endpoint}/document`, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (response.ok) {
          const result: PrivateDocument = await response.json();
          if (controller.signal.aborted) return;
          setDocument(result);
          secret.current = "";
          setHasSecret(false);
        } else if (response.status !== 401 && !controller.signal.aborted) {
          setError("Could not open the agreement. Please try again.");
        }
      })
      .catch(() => { if (!controller.signal.aborted) setError("Private signing is temporarily unavailable."); })
      .finally(() => { if (!controller.signal.aborted) setInitializing(false); });
    return () => controller.abort();
  }, [endpoint]);

  useEffect(() => {
    if (!retryAt) return;
    const timer = window.setTimeout(() => setRetryAt(0), Math.max(0, retryAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [retryAt]);

  useEffect(() => {
    if (!document?.sessionExpiresAt) return;
    const timer = window.setTimeout(() => {
      setDocument(undefined);
      setName("");
      setPlace("");
      setConsent(false);
      setError("Your private session expired. Open the original link to verify again.");
    }, Math.max(0, Date.parse(document.sessionExpiresAt) - Date.now()));
    return () => window.clearTimeout(timer);
  }, [document?.sessionExpiresAt]);

  async function call<T>(action: string, payload?: object): Promise<T> {
    const response = await fetch(`${endpoint}/${action}`, {
      cache: "no-store",
      ...(payload ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) } : {}),
    });
    const data = await response.json();
    if (!response.ok) throw new SigningRequestError(data.error || "The request could not be completed.", response.status);
    return data as T;
  }
  async function run(action: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (failure) {
      if (document && failure instanceof SigningRequestError && failure.status === 401) {
        setDocument(undefined);
        setName("");
        setPlace("");
        setConsent(false);
      }
      setError(errorText(failure));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function requestCode() {
    void run(async () => {
      const result = await call<{ retryAt: string }>("code", { secret: secret.current });
      setCode("");
      setCodeSent(true);
      setRetryAt(Date.parse(result.retryAt));
    });
  }
  function verify(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      await call("verify", { secret: secret.current, code });
      setCode("");
      setCodeSent(false);
      secret.current = "";
      setHasSecret(false);
      setDocument(await call<PrivateDocument>("document"));
    });
  }
  function refresh() {
    void run(async () => setDocument(await call<PrivateDocument>("document")));
  }
  function sign(event: FormEvent) {
    event.preventDefault();
    if (!document || !consent) return;
    void run(async () => {
      await call("sign", { name, place, consent, contentHash: document.contentHash });
      setDocument({ ...document, status: "awaiting-owner" });
      setName("");
      setPlace("");
      setConsent(false);
    });
  }

  return (
    <main className="min-h-dvh bg-[#f8f3eb] text-[#241b18] [font-family:system-ui,sans-serif]">
      <header className="border-b border-[#e1d2c5] bg-[#fffaf2]">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <div className="flex items-center gap-2.5 font-semibold text-[#741a14]">
            <Image src="/brand/maple-mark.svg" width={25} height={27} alt="" unoptimized />
            Maple Studios
          </div>
          <span className="text-xs font-medium text-[#63534b]">Private agreement</span>
        </div>
      </header>
      <div className={`mx-auto space-y-5 px-5 py-8 sm:px-8 sm:py-12 ${document ? "max-w-4xl" : "max-w-xl"}`}>
        {initializing ? (
          <p role="status">Checking your private session…</p>
        ) : document ? (
          <>
            <header className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
                {document.status === "awaiting-client" ? "Review your agreement" : document.status === "completed" ? "Agreement signed" : "Your signature is recorded"}
              </h1>
              {document.status === "awaiting-owner" && (
                <p className="text-[#5a4840]">The signed PDF will be available here after the studio owner countersigns.</p>
              )}
            </header>
            {error && document.status !== "awaiting-client" && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{error}</p>}
            {document.status === "completed" && (
              <section className="space-y-3 rounded-xl border border-[#decfc2] bg-white p-5">
                <a href={`${endpoint}/pdf`} download className={`inline-flex items-center ${actionButton}`}>Download signed PDF</a>
                {document.retentionDueAt && <p className="text-sm">Download your copy before {new Date(document.retentionDueAt).toLocaleString()}.</p>}
                {document.pdfHash && <p className="text-xs text-[#62524a]">PDF SHA-256 <output className="mt-1 block font-mono [overflow-wrap:anywhere]">{document.pdfHash}</output></p>}
              </section>
            )}
            {document.status === "awaiting-owner" &&
              <button type="button" className={secondaryButton} disabled={busy} onClick={refresh}>Check signing status</button>
            }
            <AgreementText document={document.document} />
            {document.status === "awaiting-client" && (
              <form onSubmit={sign} className="space-y-4 rounded-xl border border-[#decfc2] bg-[#fffaf2] p-5 sm:p-7">
                <h2 className="text-xl font-semibold">Sign the agreement</h2>
                <p className="text-sm">Sign as <strong>{document.signer.name}</strong>, {document.signer.capacity}.</p>
                <label className="block text-sm font-medium">Type your name as shown above
                  <input className={`mt-1.5 ${field}`} value={name} onChange={event => setName(event.target.value)} required maxLength={140} autoComplete="off" />
                </label>
                <label className="block text-sm font-medium">Place of signing (optional)
                  <input className={`mt-1.5 ${field}`} value={place} onChange={event => setPlace(event.target.value)} maxLength={140} autoComplete="off" />
                </label>
                <label className="flex items-start gap-3 text-sm leading-6">
                  <input type="checkbox" required checked={consent} onChange={event => setConsent(event.target.checked)} className="mt-1.5 size-4 accent-[#741a14]" />
                  {document.document.consent.client}
                </label>
                {error && <p role="alert" className="text-sm text-red-900">{error}</p>}
                <button className={actionButton} disabled={busy || !consent || name.trim() !== document.signer.name}>{busy ? "Working…" : "Sign agreement"}</button>
              </form>
            )}
          </>
        ) : (
          <section className="space-y-5 rounded-2xl border border-[#decfc2] bg-[#fffaf2] p-6 sm:p-9">
            <h1 className="text-3xl font-semibold tracking-[-0.035em]">{hasSecret ? "Verify your email" : "Open your private link"}</h1>
            <p className="text-sm leading-6 text-[#5a4840]">
              {hasSecret
                ? "We’ll send a six-digit code to the email address on the agreement. Use the code on this page and keep the link and code private."
                : "Open the full agreement link you received. Ask your Maple Studios contact for a current link if you need one."}
            </p>
            {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{error}</p>}
            {hasSecret && (codeSent ? (
              <form className="space-y-4" onSubmit={verify}>
                <p role="status" className="text-sm text-[#5a4840]">Code sent. It expires within 10 minutes.</p>
                <label className="block text-sm font-medium">Verification code
                  <input className={`mt-1.5 ${field} max-w-55 tracking-[0.15em]`} value={code}
                    onChange={event => setCode(event.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                    inputMode="numeric" pattern="[0-9]{6}" autoComplete="one-time-code" maxLength={6} required />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button className={actionButton} disabled={busy || code.length !== 6}>{busy ? "Working…" : "Verify email"}</button>
                  <button type="button" className={secondaryButton} disabled={busy || retryAt > 0} onClick={requestCode}>Send a new code</button>
                </div>
              </form>
            ) : (
              <button type="button" className={actionButton} disabled={busy} onClick={requestCode}>{busy ? "Sending…" : "Send verification code"}</button>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
