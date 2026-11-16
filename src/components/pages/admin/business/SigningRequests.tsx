"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { AgreementText, type AgreementDocument } from "../../sign/ClientSigning";
import { ConfirmIdentity } from "../security/AuthenticatorForm";
import { useAdmin } from "../AdminShell";
import { Badge, Btn, Card, Field, Input, PageHead, Select } from "../cms/ui";
import { ErrorBox, Pager, useList } from "./shared";
import { api, downloadSigningPdf, message, signingRequest, SigningApiError, type Draft, type SigningRecord, type SigningState } from "./api";

const states: Record<SigningState, string> = {
  "awaiting-client": "Awaiting client",
  "awaiting-owner": "Awaiting owner",
  completed: "Completed",
  "closed-incomplete": "Closed incomplete",
  purged: "Purged",
};
const dateTime = (value: string) => new Date(value).toLocaleString();
type Eligibility = { ready: boolean; checks: { id: string; ok: boolean }[] };
type Preview = { contentHash: string; document: AgreementDocument };
type Provider = { name: string; purpose: string; usesAi: boolean };
type RecordAction = "countersign" | "close" | "hold" | "purge";
type Changed = { item: SigningRecord; link?: string };

function LinkStatus({ record }: { record: SigningRecord }) {
  return (
    <p className="text-sm text-[#55453b]">
      {record.link ? `Link ${record.link.status} · ${record.link.mode === "view" ? "View only" : "Agreement review"} · Expires ${dateTime(record.link.expiresAt)}` : "No client link"}
    </p>
  );
}
function Readiness({ eligibility, owner }: { eligibility?: Eligibility; owner: boolean }) {
  if (!eligibility) return <p role="status" className="text-sm">Checking issuing readiness…</p>;
  if (eligibility.ready) return <p className="text-sm font-medium text-green-900">
    {owner ? "Ready to issue and renew links." : "Signing settings are ready. An owner issues and manages links."}
  </p>;
  return (
    <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-[#614309]">
      <p className="font-semibold">Issuing and renewal are unavailable.</p>
      <ul className="list-disc pl-5">
        {eligibility.checks.filter(check => !check.ok).map(check => <li key={check.id}>{check.id.replace("attestation:", "").replaceAll("-", " ")}</li>)}
      </ul>
      {owner && (
        <div className="flex flex-wrap gap-3">
          <Link href="/admin/security" className="font-semibold underline">Review Security settings</Link>
          {eligibility.checks.some(check => check.id === "company-representative" && !check.ok) &&
            <Link href="/admin/company" className="font-semibold underline">Set company representative</Link>}
        </div>
      )}
    </div>
  );
}

function Prepare({ draft, eligibility, owner, onIssue }: {
  draft: Draft;
  eligibility?: Eligibility;
  owner: boolean;
  onIssue: (link: string) => void;
}) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [usesData, setUsesData] = useState("");
  const [preview, setPreview] = useState<Preview>();
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function invalidate() {
    setPreview(undefined);
    setApproved(false);
  }
  function changeProvider(index: number, patch: Partial<Provider>) {
    setProviders(values => values.map((value, i) => i === index ? { ...value, ...patch } : value));
    invalidate();
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const str = (name: string) => String(data.get(name) ?? "").trim();
    const currency = str("fees");
    if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(currency)) {
      setError("Enter the INR fee with up to two decimal places.");
      return;
    }
    const [rupees, paise = ""] = currency.split(".");
    const fields = {
      draftId: draft.id, draftRevision: draft.revision,
      signerName: str("signerName"), signerEmail: str("signerEmail"), signerCapacity: str("signerCapacity"),
      sowReference: str("sowReference"), sowDate: str("sowDate"), feesPaise: Number(rupees) * 100 + Number(paise.padEnd(2, "0")),
      personalOrProductionData: usesData === "yes",
      ...(usesData === "yes" && { personalDataSchedule: str("schedule"), personalDataScheduleDate: str("scheduleDate") }),
      providers,
      ...(providers.length > 0 && { providerApprovalReference: str("providerApproval"), providerApprovalDate: str("providerApprovalDate") }),
      incidentEmail: str("incidentEmail"), backupRetentionDays: 30, linkDays: Number(str("linkDays")),
    };
    setBusy(true);
    setError("");
    try {
      if (owner && preview && approved && eligibility?.ready) {
        const result = await signingRequest<Changed>("", "POST", { ...fields, previewHash: preview.contentHash });
        invalidate();
        if (result.link) onIssue(result.link);
      } else {
        setPreview(await signingRequest<Preview>("/preview", "POST", fields));
      }
    } catch (failure) {
      invalidate();
      setError(message(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card pad={false}>
      <div className="space-y-1 px-5 pt-5">
        <h2 className="text-xl font-semibold">Prepare signing request</h2>
        <p className="text-sm text-[#55453b]">{draft.title} · Draft revision {draft.revision}</p>
      </div>
      <form onSubmit={submit} onChange={invalidate} className="space-y-5 p-5">
        <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Client signer name"><Input name="signerName" defaultValue={draft.snapshot.client.contactName} required maxLength={140} /></Field>
          <Field label="Email for verification"><Input name="signerEmail" type="email" defaultValue={draft.snapshot.client.email} required maxLength={254} /></Field>
          <Field label="Client signing capacity"><Input name="signerCapacity" required maxLength={140} /></Field>
          <Field label="Statement of work reference"><Input name="sowReference" required maxLength={200} /></Field>
          <Field label="Statement of work date"><Input name="sowDate" type="date" required /></Field>
          <Field label="Project fees (INR)"><Input name="fees" inputMode="decimal" required placeholder="0.00" /></Field>
          <Field label="Personal or production data">
            <Select required value={usesData} onChange={event => setUsesData(event.target.value)} options={[
              { value: "", label: "Choose one" }, { value: "yes", label: "Yes" }, { value: "no", label: "No" },
            ]} />
          </Field>
          {usesData === "yes" && (
            <>
              <Field label="Approved data schedule reference"><Input name="schedule" required maxLength={400} /></Field>
              <Field label="Data schedule date"><Input name="scheduleDate" type="date" required /></Field>
            </>
          )}
          <p className="text-sm sm:col-span-2">The studio’s shared backup policy retains backups for up to 30 days.</p>
          <Field label="Client incident contact"><Input name="incidentEmail" type="email" required maxLength={254} /></Field>
          <Field label="Client link validity (days)"><Input name="linkDays" type="number" min={1} max={30} defaultValue={7} required /></Field>
        </fieldset>
        <fieldset disabled={busy} className="space-y-3 rounded-lg border border-[#e1d2c5] p-4">
          <legend className="px-2 text-sm font-semibold">Approved providers and AI</legend>
          {providers.length === 0 && <p className="text-sm">No providers listed.</p>}
          {providers.map((provider, index) => (
            <div key={index} className="grid gap-3 rounded-md border border-[#e3d5ca] p-3 sm:grid-cols-2">
              <Field label="Provider name"><Input value={provider.name} onChange={e => changeProvider(index, { name: e.target.value })} required maxLength={140} /></Field>
              <Field label="Approved purpose"><Input value={provider.purpose} onChange={e => changeProvider(index, { purpose: e.target.value })} required maxLength={400} /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={provider.usesAi} onChange={e => changeProvider(index, { usesAi: e.target.checked })} />Uses AI</label>
              <Btn type="button" onClick={() => { setProviders(values => values.filter((_, i) => i !== index)); invalidate(); }}>Remove provider</Btn>
            </div>
          ))}
          {providers.length > 0 && <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Provider approval reference"><Input name="providerApproval" required maxLength={200} /></Field>
            <Field label="Provider approval date"><Input name="providerApprovalDate" type="date" required /></Field>
          </div>}
          <Btn type="button" disabled={providers.length >= 20} onClick={() => { setProviders(values => [...values, { name: "", purpose: "", usesAi: false }]); invalidate(); }}>Add provider</Btn>
        </fieldset>
        {preview && (
          <>
            <AgreementText document={preview.document} />
            {owner ? (
              <label className="flex items-start gap-2 text-sm" onChange={event => event.stopPropagation()}>
                <input type="checkbox" className="mt-0.5" checked={approved} onChange={event => setApproved(event.target.checked)} />
                I reviewed this frozen copy and verified the intended recipient’s email.
              </label>
            ) : <p className="text-sm">An owner issues the private link after reviewing the agreement.</p>}
          </>
        )}
        <ErrorBox error={error} />
        {(!preview || owner) && (
          <Btn type="submit" variant="primary" disabled={busy || (Boolean(preview) && (!approved || !eligibility?.ready))}>
            {busy ? "Working…" : preview ? "Issue private link" : "Preview frozen copy"}
          </Btn>
        )}
      </form>
    </Card>
  );
}

export default function SigningRequests({ draftId }: { draftId?: string }) {
  const { account } = useAdmin();
  const owner = account?.role === "owner";
  const manager = owner || account?.role === "admin";
  const [draft, setDraft] = useState<Draft>();
  const [eligibility, setEligibility] = useState<Eligibility>();
  const [page, setPage] = useState(1);
  const records = useList<SigningRecord>(manager ? `/signing?page=${page}&limit=15` : undefined);
  const [record, setRecord] = useState<SigningRecord>();
  const [rawLink, setRawLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [action, setAction] = useState<RecordAction>();
  const [reauth, setReauth] = useState(false);
  const [actionError, setActionError] = useState("");
  const linkRef = useRef<HTMLInputElement>(null);
  const [linkDays, setLinkDays] = useState(7);
  useEffect(() => {
    if (!manager) return;
    let alive = true;
    signingRequest<Eligibility>("/eligibility").then(value => { if (alive) setEligibility(value); })
      .catch(failure => { if (alive) setError(message(failure)); });
    if (draftId) api<{ item: Draft }>(`/drafts/${draftId}`)
      .then(({ item }) => {
        if (!alive) return;
        if (item.kind === "confidentiality") setDraft(item);
        else setError("Choose a confidentiality draft to prepare a signing request.");
      })
      .catch(failure => { if (alive) setError(message(failure)); });
    return () => { alive = false; };
  }, [draftId, manager]);

  function reveal(link: string) {
    setRawLink(link);
    setCopied(false);
    records.reload();
  }
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(rawLink);
      setRawLink("");
      setCopied(true);
    } catch {
      linkRef.current?.select();
      setError("Clipboard access is unavailable. Copy the selected link, then clear it from this page.");
    }
  }
  async function refreshRecord(id: string) {
    const result = await signingRequest<Changed>(`/${id}`);
    setRecord(result.item);
  }
  async function run(work: () => Promise<void>, actionScoped = false) {
    if (busy) return;
    setBusy(true);
    setError("");
    setActionError("");
    try { await work(); }
    catch (failure) {
      if (actionScoped && failure instanceof SigningApiError && failure.code === "RECENT_MFA_REQUIRED") setReauth(true);
      else if (actionScoped) setActionError(message(failure));
      else setError(message(failure));
    } finally { setBusy(false); }
  }
  function manageLink(method: "POST" | "DELETE") {
    if (!record || !owner) return;
    const id = record.id;
    void run(async () => {
      const result = await signingRequest<Changed>(`/${id}/link`, method, method === "POST" ? { days: linkDays } : undefined);
      if (result.link) reveal(result.link);
      else { setRawLink(""); records.reload(); }
      await refreshRecord(id);
    });
  }
  function openAction(next: RecordAction) {
    setAction(next);
    setActionError("");
    setReauth(false);
  }
  function submitAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!record || !action) return;
    const data = new FormData(event.currentTarget);
    const id = record.id;
    const payload = action === "countersign" ? {
      contentHash: record.contentHash, name: data.get("name"), capacity: data.get("capacity"), place: data.get("place"),
      consent: data.has("consent"),
    } : action === "purge" ? { confirm: data.has("confirm") } : {
      reason: data.get("reason"), ...(action === "hold" ? { held: !record.held } : {}),
    };
    void run(async () => {
      await signingRequest<Changed>(`/${id}/${action}`, action === "hold" ? "PATCH" : "POST", payload);
      setAction(undefined);
      setRawLink("");
      records.reload();
      await refreshRecord(id);
    }, true);
  }

  if (!manager) return <PageHead title="Signing requests" sub="An owner or admin account is required." />;
  const canManageLink = owner && record && !["purged", "closed-incomplete"].includes(record.status);
  const studioSigner = record?.document?.studioSigner;
  const canCountersign = studioSigner && account?.name.trim() === studioSigner.name;
  return (
    <div className="space-y-5">
      <PageHead title="Signing requests" sub="Issue private links to frozen confidentiality agreements and track signatures." />
      <Readiness eligibility={eligibility} owner={owner} />
      <ErrorBox error={error || records.error} />
      {rawLink && (
        <div className="space-y-3 rounded-lg border border-[#bda08f] bg-[#fff9ec] p-4">
          <Field label="Private link shown once"><input ref={linkRef} readOnly value={rawLink} onFocus={event => event.target.select()} className="w-full rounded-md border border-[#9f8276] bg-white px-3 py-2 text-sm" /></Field>
          <div className="flex flex-wrap gap-2">
            <Btn type="button" variant="primary" onClick={copyLink}>Copy private link</Btn>
            <Btn type="button" onClick={() => setRawLink("")}>Clear link</Btn>
          </div>
        </div>
      )}
      {copied && <p role="status" className="text-sm">Private link copied. Share it with the intended signer.</p>}
      {draft ? <Prepare key={draft.id} draft={draft} eligibility={eligibility} owner={owner} onIssue={link => { reveal(link); setDraft(undefined); }} /> :
        <Link href="/admin/drafts" className="inline-flex min-h-10 items-center rounded-md border border-[#94685a] px-4 text-sm font-semibold text-[#741a14]">Prepare from a client draft</Link>}
      <Card pad={false}>
        <ul className="divide-y divide-[#e6d8c9]">
          {records.data?.items.map(item => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0 space-y-1">
                <h2 className="font-semibold [overflow-wrap:anywhere]">{item.title || `Purged record ${item.id}`}</h2>
                {item.signer && <p className="text-sm [overflow-wrap:anywhere]">{item.signer.name} · {item.signer.email}</p>}
                <LinkStatus record={item} />
                {item.createdAt && <p className="text-xs text-[#55453b]">Issued {dateTime(item.createdAt)}</p>}
                {item.retentionDue && <p className="text-sm text-amber-900">Retention review due{item.held ? " · Legal hold active" : ""}</p>}
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={item.status === "completed" ? "live" : "neutral"}>{states[item.status]}</Badge>
                <Btn type="button" onClick={() => {
                  setAction(undefined);
                  setRawLink("");
                  setCopied(false);
                  void run(() => refreshRecord(item.id));
                }} disabled={busy}>View record</Btn>
              </div>
            </li>
          ))}
          {records.data?.items.length === 0 && <li className="p-4 text-sm">No signing requests yet.</li>}
        </ul>
      </Card>
      <Pager meta={records.data?.meta} page={page} setPage={setPage} />
      {record && (
        <Card pad={false}>
          <section className="space-y-4 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">{record.title || `Purged record ${record.id}`}</h2>
                <p className="text-sm">{states[record.status]}</p>
                <LinkStatus record={record} />
                {record.retentionDueAt && <p className="text-sm">Retention date {dateTime(record.retentionDueAt)}{record.retentionDue ? " · Review due" : ""}</p>}
                {record.purgedAt && <p className="text-sm">Deleted {dateTime(record.purgedAt)}</p>}
                {record.held && <p className="text-sm font-semibold text-amber-900">Legal hold active</p>}
              </div>
              <Btn onClick={() => { setRecord(undefined); setAction(undefined); }} disabled={busy}>Close details</Btn>
            </div>
            {canManageLink && (
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Renewal days"><Input type="number" min={1} max={30} value={linkDays} onChange={e => setLinkDays(Number(e.target.value))} className="max-w-24" /></Field>
                <Btn type="button" onClick={() => manageLink("POST")} disabled={busy || !eligibility?.ready || record.retentionDue || !Number.isInteger(linkDays) || linkDays < 1 || linkDays > 30}>
                  {record.status === "completed" ? "Renew view-only link" : "Rotate private link"}
                </Btn>
                {record.link?.status === "active" && <Btn type="button" onClick={() => manageLink("DELETE")} disabled={busy}>Revoke link</Btn>}
              </div>
            )}
            {record.status === "completed" && <Btn type="button" variant="primary" disabled={busy} onClick={() => void run(() => downloadSigningPdf(record.id))}>Download signed PDF</Btn>}
            {record.clientSignature && <p className="text-sm">Client signed as {record.clientSignature.name} · {dateTime(record.clientSignature.signedAt)}</p>}
            {record.clientSignature?.audit && (
              <dl className="space-y-2 text-xs [overflow-wrap:anywhere]">
                {record.clientSignature.audit.ip && (
                  <div><dt className="font-semibold">Signing IP address</dt><dd>{record.clientSignature.audit.ip}</dd></div>
                )}
                {record.clientSignature.audit.userAgent && (
                  <div><dt className="font-semibold">Browser-reported user agent</dt><dd>{record.clientSignature.audit.userAgent}</dd></div>
                )}
              </dl>
            )}
            {record.ownerSignature && <p className="text-sm">Owner signed as {record.ownerSignature.name} · {dateTime(record.ownerSignature.signedAt)}</p>}
            {record.contentHash && <p className="text-xs [overflow-wrap:anywhere]">Agreement SHA-256 <span className="font-mono">{record.contentHash}</span></p>}
            {record.pdfHash && <p className="text-xs [overflow-wrap:anywhere]">PDF SHA-256 <span className="font-mono">{record.pdfHash}</span></p>}
            {record.document && <AgreementText document={record.document} />}
            {owner && record.status !== "purged" && (
              <div className="flex flex-wrap gap-2">
                {record.status === "awaiting-owner" && (
                  canCountersign
                    ? <Btn variant="primary" onClick={() => openAction("countersign")}>Countersign</Btn>
                    : <p className="w-full text-sm">{studioSigner
                      ? `Only ${studioSigner.name}, the authorized representative on this agreement, can countersign.`
                      : "This agreement needs a frozen company representative before it can be countersigned."}</p>
                )}
                {(record.status === "awaiting-client" || record.status === "awaiting-owner") && <Btn onClick={() => openAction("close")}>Close incomplete</Btn>}
                <Btn onClick={() => openAction("hold")}>{record.held ? "Release legal hold" : "Place legal hold"}</Btn>
                {record.retentionDue && !record.held && <Btn onClick={() => openAction("purge")}>Review deletion</Btn>}
              </div>
            )}
            {owner && action && (
              <div className="space-y-3 rounded-lg border border-[#d8c1af] bg-[#fffaf0] p-4">
                {reauth && <ConfirmIdentity onVerified={() => setReauth(false)} />}
                <form key={action} onSubmit={submitAction} className="space-y-3">
                  {action === "countersign" && (
                    <>
                      <h3 className="font-semibold">Countersign as {studioSigner?.name}</h3>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <Field label="Type your name as shown"><Input name="name" required maxLength={160} /></Field>
                        <Field label="Signing capacity"><Input name="capacity" readOnly value={studioSigner?.capacity ?? ""} /></Field>
                        <Field label="Place (optional)"><Input name="place" maxLength={140} /></Field>
                      </div>
                      <label className="flex items-start gap-2 text-sm">
                        <input className="mt-0.5" type="checkbox" name="consent" required />{record.document?.consent.owner}
                      </label>
                    </>
                  )}
                  {(action === "close" || action === "hold") && <Field label={action === "close" ? "Reason for closing incomplete" : "Legal hold change reason"}><Input name="reason" required maxLength={500} /></Field>}
                  {action === "purge" && <label className="flex items-start gap-2 text-sm"><input className="mt-0.5" type="checkbox" name="confirm" required />Delete this expired agreement, its PDF and identifying audit information.</label>}
                  <ErrorBox error={actionError} />
                  <div className="flex flex-wrap gap-2">
                    <Btn variant="primary" disabled={busy || reauth} type="submit">
                      {action === "countersign" ? "Confirm countersignature" :
                        action === "close" ? "Close incomplete" : action === "purge" ? "Delete agreement" :
                        record.held ? "Release hold" : "Place hold"}
                    </Btn>
                    <Btn type="button" onClick={() => setAction(undefined)}>Cancel</Btn>
                  </div>
                </form>
              </div>
            )}
            {record.events && (
              <details className="rounded-md border border-[#e1d2c5] p-3 text-sm">
                <summary className="cursor-pointer font-semibold">Record history</summary>
                <ul className="mt-2 space-y-2">
                  {record.events.map((item, index) => (
                    <li key={index}>{item.type.replaceAll("-", " ")} · {dateTime(item.at)}{item.reason ? ` · ${item.reason}` : ""}</li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        </Card>
      )}
    </div>
  );
}
