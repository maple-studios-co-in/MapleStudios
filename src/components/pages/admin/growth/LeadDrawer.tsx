"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, Plus, Trash2 } from "lucide-react";

import { Badge, Btn, Confirm, CsvField, Field, Input, Select, Spinner, Textarea } from "../cms/ui";
import { useAction, useApi, useItem } from "./api";
import { Drawer, ErrorText, Kv, cap, fmtIst, fullName, growthTone, isoToIstInput, istInputToIso } from "./shared";
import { LEAD_STAGES, type Lead, type LeadInput, type LeadStage, type OutreachTarget } from "./types";

/**
 * One lead: editable fields, stage, notes, the activity timeline, and the
 * hand-off into LinkedIn outreach. `leadId === "new"` is the create form.
 */
export default function LeadDrawer({
  leadId,
  onClose,
  onChanged,
  show,
}: {
  leadId: string | "new";
  onClose: () => void;
  onChanged: () => void;
  show: (text: string, bad?: boolean) => void;
}) {
  const api = useApi();
  const isNew = leadId === "new";
  const { item, loading, error, setItem } = useItem<Lead>(isNew ? null : `/leads/${leadId}`);
  const { busy, run } = useAction(show);
  const [confirming, setConfirming] = useState(false);
  const [outreach, setOutreach] = useState(false);

  const lead = isNew ? null : item;

  const del = () =>
    run(
      "delete",
      async () => {
        await api.request("DELETE", `/leads/${leadId}`);
        onChanged();
        onClose();
      },
      "Lead deleted"
    );

  return (
    <Drawer
      title={isNew ? "New lead" : lead ? fullName(lead) || lead.email || "Lead" : "Lead"}
      sub={
        lead ? (
          <>
            Added {fmtIst(lead.createdAt)} · updated {fmtIst(lead.updatedAt)}
            {lead.source ? ` · from ${lead.source}` : ""}
          </>
        ) : undefined
      }
      onClose={onClose}
      footer={
        !isNew && lead ? (
          <>
            <Btn variant="quiet" onClick={() => setConfirming(true)} disabled={busy !== null}>
              <Trash2 size={12} /> Delete
            </Btn>
            <span className="flex-1" />
            <Btn onClick={() => setOutreach(true)} disabled={busy !== null}>
              <Plus size={12} /> Add to outreach
            </Btn>
          </>
        ) : undefined
      }
    >
      <ErrorText>{error}</ErrorText>
      {!isNew && loading && !lead ? <Spinner /> : null}

      {(isNew || lead) && (
        <LeadForm
          // remount on every save so the draft shows the server's normalised values
          key={lead ? `${lead.id}:${lead.updatedAt}` : "new"}
          lead={lead}
          busy={busy === "save"}
          onSave={async (values) => {
            await run(
              "save",
              async () => {
                if (isNew) {
                  await api.request<{ item: Lead }>("POST", "/leads", values);
                  onChanged();
                  onClose();
                } else {
                  const res = await api.request<{ item: Lead }>("PATCH", `/leads/${leadId}`, values);
                  setItem(res.item);
                  onChanged();
                }
              },
              isNew ? "Lead created" : "Saved"
            );
          }}
        />
      )}

      {lead ? (
        <>
          <Notes
            lead={lead}
            busy={busy === "note"}
            onAdd={(text) =>
              run(
                "note",
                async () => {
                  const res = await api.request<{ item: Lead }>("POST", `/leads/${lead.id}/notes`, { text });
                  setItem(res.item);
                  onChanged();
                },
                "Note added"
              )
            }
          />
          <Timeline lead={lead} />
        </>
      ) : null}

      {confirming && lead ? (
        <Confirm
          title="Delete this lead?"
          body={`${fullName(lead) || lead.email || "This lead"} and their notes and activity will be removed permanently.`}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            void del();
          }}
        />
      ) : null}

      {outreach && lead ? (
        <AddToOutreach lead={lead} onClose={() => setOutreach(false)} show={show} />
      ) : null}
    </Drawer>
  );
}

/* ————— the form ————— */

type Draft = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  role: string;
  website: string;
  industry: string;
  city: string;
  segment: string;
  source: string;
  owner: string;
  stage: LeadStage;
  tags: string[];
  nextAt: string;
  nextNote: string;
  custom: { key: string; value: string }[];
};

function toDraft(l: Lead | null): Draft {
  return {
    firstName: l?.firstName ?? "",
    lastName: l?.lastName ?? "",
    email: l?.email ?? "",
    phone: l?.phone ?? "",
    company: l?.company ?? "",
    role: l?.role ?? "",
    website: l?.website ?? "",
    industry: l?.industry ?? "",
    city: l?.city ?? "",
    segment: l?.segment ?? "",
    source: l?.source ?? "",
    owner: l?.owner ?? "",
    stage: l?.stage ?? "new",
    tags: l?.tags ?? [],
    nextAt: isoToIstInput(l?.nextAction?.at),
    nextNote: l?.nextAction?.note ?? "",
    custom: Object.entries(l?.custom ?? {}).map(([key, value]) => ({ key, value })),
  };
}

/** On create, blank optional fields are omitted. On edit they are sent as
    "", which the API treats as "clear this field" — omitting them would
    leave the old value in place and make a field impossible to empty. */
function toInput(d: Draft, editing: boolean): LeadInput {
  const opt = (s: string) => (s.trim() ? s.trim() : editing ? "" : undefined);
  const custom: Record<string, string> = {};
  for (const c of d.custom) if (c.key.trim()) custom[c.key.trim()] = c.value;
  return {
    firstName: d.firstName.trim(),
    lastName: d.lastName.trim(),
    email: opt(d.email),
    phone: opt(d.phone),
    company: opt(d.company),
    role: opt(d.role),
    website: opt(d.website),
    industry: opt(d.industry),
    city: opt(d.city),
    segment: opt(d.segment),
    source: opt(d.source),
    owner: opt(d.owner),
    stage: d.stage,
    tags: d.tags,
    nextAction: d.nextAt ? { at: istInputToIso(d.nextAt), note: d.nextNote.trim() } : undefined,
    custom,
  };
}

function LeadForm({
  lead,
  busy,
  onSave,
}: {
  lead: Lead | null;
  busy: boolean;
  onSave: (values: LeadInput) => Promise<void>;
}) {
  const [d, setD] = useState<Draft>(() => toDraft(lead));
  const [problem, setProblem] = useState<string | null>(null);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));

  const submit = () => {
    if (!d.firstName.trim() && !d.lastName.trim()) return setProblem("A name is required.");
    if (!d.email.trim() && !d.phone.trim()) return setProblem("An email or a phone number is required.");
    setProblem(null);
    void onSave(toInput(d, Boolean(lead)));
  };

  return (
    <section>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="First name" required>
          <Input value={d.firstName} onChange={(e) => set("firstName", e.target.value)} />
        </Field>
        <Field label="Last name">
          <Input value={d.lastName} onChange={(e) => set("lastName", e.target.value)} />
        </Field>
        <Field label="Email" hint={lead?.unsubscribedAt ? `Unsubscribed ${fmtIst(lead.unsubscribedAt)}` : undefined}>
          <Input type="email" value={d.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="Phone" hint="+91 added to 10-digit numbers">
          <Input value={d.phone} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label="Company">
          <Input value={d.company} onChange={(e) => set("company", e.target.value)} />
        </Field>
        <Field label="Role">
          <Input value={d.role} onChange={(e) => set("role", e.target.value)} />
        </Field>
        <Field label="Website">
          <Input value={d.website} onChange={(e) => set("website", e.target.value)} placeholder="https://" />
        </Field>
        <Field label="Industry">
          <Input value={d.industry} onChange={(e) => set("industry", e.target.value)} />
        </Field>
        <Field label="City">
          <Input value={d.city} onChange={(e) => set("city", e.target.value)} />
        </Field>
        <Field label="Segment">
          <Input value={d.segment} onChange={(e) => set("segment", e.target.value)} />
        </Field>
        <Field label="Owner">
          <Input value={d.owner} onChange={(e) => set("owner", e.target.value)} />
        </Field>
        <Field label="Source">
          <Input value={d.source} onChange={(e) => set("source", e.target.value)} />
        </Field>
        <Field label="Stage" hint="Changing it records a stage activity">
          <Select
            value={d.stage}
            onChange={(e) => set("stage", e.target.value as LeadStage)}
            options={LEAD_STAGES.map((s) => ({ value: s, label: cap(s) }))}
          />
        </Field>
        <CsvField label="Tags" value={d.tags} onChange={(v) => set("tags", v)} />
        <Field label="Next action (IST)">
          <Input type="datetime-local" value={d.nextAt} onChange={(e) => set("nextAt", e.target.value)} />
        </Field>
        <Field label="Next action note">
          <Input value={d.nextNote} onChange={(e) => set("nextNote", e.target.value)} />
        </Field>
      </div>

      <div className="mt-4">
        <Field label="Custom fields" hint="Available to templates as {{custom_<name>}}">
          <div className="space-y-2">
            {d.custom.map((c, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  placeholder="name"
                  value={c.key}
                  onChange={(e) => {
                    const next = [...d.custom];
                    next[i] = { ...next[i], key: e.target.value };
                    set("custom", next);
                  }}
                />
                <Input
                  placeholder="value"
                  value={c.value}
                  onChange={(e) => {
                    const next = [...d.custom];
                    next[i] = { ...next[i], value: e.target.value };
                    set("custom", next);
                  }}
                />
                <button
                  type="button"
                  aria-label="Remove custom field"
                  onClick={() => set("custom", d.custom.filter((_, j) => j !== i))}
                  className="shrink-0 cursor-pointer rounded-full p-2 text-[#8b8178] transition-colors hover:bg-[#a3231b]/10 hover:text-[#a3231b]"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <Btn onClick={() => set("custom", [...d.custom, { key: "", value: "" }])}>
              <Plus size={12} /> Add field
            </Btn>
          </div>
        </Field>
      </div>

      {lead ? (
        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-[#d8c3a5]/45 pt-4 sm:grid-cols-3">
          <Kv label="Last contacted">{lead.lastContactedAt ? fmtIst(lead.lastContactedAt) : "never"}</Kv>
          <Kv label="Suppressed">{lead.suppressed ? <Badge tone="archived">Yes</Badge> : "No"}</Kv>
          <Kv label="Import batch">{lead.importBatchId ?? "—"}</Kv>
        </dl>
      ) : null}

      {problem ? (
        <p role="alert" className="mt-3 font-sans-luxury text-[12.5px] text-[#a3231b]">
          {problem}
        </p>
      ) : null}

      <div className="mt-4 flex justify-end">
        <Btn variant="primary" onClick={submit} disabled={busy}>
          {busy ? "Saving…" : lead ? "Save changes" : "Create lead"}
        </Btn>
      </div>
    </section>
  );
}

/* ————— notes ————— */

function Notes({ lead, busy, onAdd }: { lead: Lead; busy: boolean; onAdd: (text: string) => Promise<boolean> }) {
  const [text, setText] = useState("");
  const notes = [...(lead.notes ?? [])].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <section className="mt-6 border-t border-[#d8c3a5]/45 pt-5">
      <p className="mb-3 font-sans-luxury text-[10px] font-bold uppercase tracking-[0.18em] text-[#8b8178]">
        Notes
      </p>
      <Textarea
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What happened, what to do next…"
      />
      <div className="mt-2 flex justify-end">
        <Btn
          disabled={!text.trim() || busy}
          onClick={async () => {
            if (await onAdd(text.trim())) setText("");
          }}
        >
          {busy ? "Adding…" : "Add note"}
        </Btn>
      </div>
      {notes.length ? (
        <ul className="mt-3 space-y-2">
          {notes.map((n, i) => (
            <li key={`${n.at}-${i}`} className="rounded-[8px] bg-[#f3e8d5]/60 px-3 py-2">
              <p className="whitespace-pre-wrap font-sans-luxury text-[12.5px] leading-[1.55] text-[#11100e]">
                {n.text}
              </p>
              <p className="mt-1 font-sans-luxury text-[10.5px] text-[#8b8178]">
                {n.by || "console"} · {fmtIst(n.at)}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/* ————— activity timeline ————— */

function Timeline({ lead }: { lead: Lead }) {
  const items = [...(lead.activities ?? [])].sort((a, b) => b.at.localeCompare(a.at));
  if (!items.length) return null;
  return (
    <section className="mt-6 border-t border-[#d8c3a5]/45 pt-5">
      <p className="mb-3 font-sans-luxury text-[10px] font-bold uppercase tracking-[0.18em] text-[#8b8178]">
        Activity
      </p>
      <ol className="relative ml-2 border-l border-[#d8c3a5]/70 pl-4">
        {items.map((a, i) => (
          <li key={`${a.at}-${i}`} className="relative mb-3 last:mb-0">
            <span className="absolute -left-[21px] top-[5px] h-[9px] w-[9px] rounded-full border-2 border-[#fff8ed] bg-[#741a14]/70" />
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={growthTone(a.type.replace("email_", ""))}>{cap(a.type)}</Badge>
              <span className="font-sans-luxury text-[10.5px] text-[#8b8178]">{fmtIst(a.at)}</span>
            </div>
            <p className="mt-1 font-sans-luxury text-[12.5px] leading-[1.5] text-[#11100e]">{a.summary}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ————— hand-off to outreach ————— */

function AddToOutreach({
  lead,
  onClose,
  show,
}: {
  lead: Lead;
  onClose: () => void;
  show: (text: string, bad?: boolean) => void;
}) {
  const api = useApi();
  const { busy, run } = useAction(show);
  const guess = lead.custom?.linkedin ?? lead.custom?.linkedin_url ?? lead.custom?.linkedinUrl ?? "";
  const [url, setUrl] = useState(guess);
  const [created, setCreated] = useState<OutreachTarget | null>(null);

  return (
    <div className="mt-6 rounded-[10px] border border-[#741a14]/25 bg-[#f3e8d5]/50 p-4">
      <p className="mb-2 font-sans-luxury text-[10px] font-bold uppercase tracking-[0.18em] text-[#741a14]">
        Add to LinkedIn outreach
      </p>
      {created ? (
        <p className="font-sans-luxury text-[12.5px] text-[#11100e]">
          Added as an outreach target.{" "}
          <Link href="/admin/outreach" className="font-bold text-[#741a14] underline underline-offset-2">
            Open outreach <ExternalLink size={11} className="inline" />
          </Link>
        </p>
      ) : (
        <>
          <Field label="LinkedIn profile URL" required>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.linkedin.com/in/…"
              autoFocus
            />
          </Field>
          <div className="mt-3 flex justify-end gap-2">
            <Btn onClick={onClose} disabled={busy !== null}>
              Cancel
            </Btn>
            <Btn
              variant="primary"
              disabled={!/^https?:\/\//i.test(url.trim()) || busy !== null}
              onClick={() =>
                run(
                  "outreach",
                  async () => {
                    const res = await api.request<{ item: OutreachTarget }>("POST", "/outreach", {
                      leadId: lead.id,
                      linkedinUrl: url.trim(),
                    });
                    setCreated(res.item);
                  },
                  "Added to outreach"
                )
              }
            >
              {busy ? "Adding…" : "Add target"}
            </Btn>
          </div>
        </>
      )}
    </div>
  );
}
