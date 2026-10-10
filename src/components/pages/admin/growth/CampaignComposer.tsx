"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Btn, Check, Field, Input, Modal, SectionLabel, Select, Spinner } from "../cms/ui";
import { useAction, useApi, useList } from "./api";
import { EMPTY_FILTERS, fromLeadFilter, toLeadFilter, type Filters } from "./leadFilter";
import { describe } from "./Segments";
import { Chips, ErrorText, IST, Kv, Muted, Notice, TogglePill, cap, fmtIst, fullName, isoToIstInput, istInputToIso, useDebounced } from "./shared";
import {
  LEAD_STAGES,
  type Campaign,
  type CampaignInput,
  type CampaignPreview,
  type EmailTemplate,
  type Lead,
  type LeadStage,
  type Segment,
} from "./types";

/**
 * Four steps and a review: who it is from → who gets it (with a live
 * recipient count) → which templates, how many days apart → when and how
 * fast → a look at three rendered samples before starting. Saving creates
 * or updates a draft; only "Start" puts anything in the queue.
 */

type Step = 1 | 2 | 3 | 4 | 5;
type Mode = "segment" | "filter" | "leads";

type Draft = {
  name: string;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  mode: Mode;
  segmentId: string;
  filter: Filters;
  leadIds: string[];
  picked: Record<string, Lead>;
  steps: { templateId: string; delayDays: number; stopIfReplied: boolean }[];
  startAt: string;
  dailyCap: number;
  windowStart: string;
  windowEnd: string;
  weekdaysOnly: boolean;
  timezone: string;
};

/** Next full hour in IST, as a datetime-local value. */
function defaultStart(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  const v = isoToIstInput(d.toISOString());
  return v ? `${v.slice(0, 14)}00` : "";
}

function toDraft(c: Campaign | null): Draft {
  const a = c?.audience;
  return {
    name: c?.name ?? "",
    fromName: c?.from.name ?? "Maple Studios",
    fromEmail: c?.from.email ?? "",
    replyTo: c?.replyTo ?? "",
    mode: a && "segmentId" in a ? "segment" : a && "leadIds" in a ? "leads" : "filter",
    segmentId: a && "segmentId" in a ? a.segmentId : "",
    filter: a && "filter" in a ? fromLeadFilter(a.filter) : EMPTY_FILTERS,
    leadIds: a && "leadIds" in a ? a.leadIds : [],
    picked: {},
    steps: c?.steps.length ? c.steps.map((s) => ({ ...s })) : [{ templateId: "", delayDays: 0, stopIfReplied: true }],
    startAt: c ? isoToIstInput(c.schedule.startAt) : defaultStart(),
    dailyCap: c?.schedule.dailyCap ?? 30,
    windowStart: c?.schedule.window.start ?? "09:30",
    windowEnd: c?.schedule.window.end ?? "18:00",
    weekdaysOnly: c?.schedule.weekdaysOnly ?? true,
    timezone: c?.schedule.timezone ?? IST,
  };
}

function toInput(d: Draft): CampaignInput {
  return {
    name: d.name.trim(),
    from: { name: d.fromName.trim(), email: d.fromEmail.trim() },
    replyTo: d.replyTo.trim() || undefined,
    audience:
      d.mode === "segment"
        ? { segmentId: d.segmentId }
        : d.mode === "leads"
          ? { leadIds: d.leadIds }
          : { filter: toLeadFilter(d.filter) },
    steps: d.steps.map((s, i) => ({
      templateId: s.templateId,
      delayDays: i === 0 ? 0 : Math.max(0, Math.round(s.delayDays)),
      stopIfReplied: s.stopIfReplied,
    })),
    schedule: {
      startAt: istInputToIso(d.startAt),
      dailyCap: Math.max(1, Math.round(d.dailyCap)),
      window: { start: d.windowStart, end: d.windowEnd },
      weekdaysOnly: d.weekdaysOnly,
      timezone: d.timezone.trim() || IST,
    },
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(step: Step, d: Draft): string | null {
  if (step === 1) {
    if (!d.name.trim()) return "Name the campaign.";
    if (!d.fromName.trim()) return "Who is it from?";
    if (!EMAIL_RE.test(d.fromEmail.trim())) return "Enter a valid from address.";
    if (d.replyTo.trim() && !EMAIL_RE.test(d.replyTo.trim())) return "Reply-to must be an email address.";
  }
  if (step === 2) {
    if (d.mode === "segment" && !d.segmentId) return "Pick a segment.";
    if (d.mode === "leads" && d.leadIds.length === 0) return "Pick at least one lead.";
  }
  if (step === 3) {
    if (!d.steps.length) return "Add at least one step.";
    if (d.steps.some((s) => !s.templateId)) return "Every step needs a template.";
  }
  if (step === 4) {
    if (!istInputToIso(d.startAt)) return "Set a start date and time.";
    if (!(d.dailyCap >= 1)) return "Daily cap must be at least 1.";
    if (!/^\d{2}:\d{2}$/.test(d.windowStart) || !/^\d{2}:\d{2}$/.test(d.windowEnd)) return "Set the send window.";
    if (d.windowStart >= d.windowEnd) return "The send window must end after it starts.";
  }
  return null;
}

const STEPS: { value: Step; label: string }[] = [
  { value: 1, label: "1 · Basics" },
  { value: 2, label: "2 · Audience" },
  { value: 3, label: "3 · Steps" },
  { value: 4, label: "4 · Schedule" },
  { value: 5, label: "Review" },
];

export default function CampaignComposer({
  campaign,
  onClose,
  onSaved,
  show,
}: {
  campaign: Campaign | null;
  onClose: () => void;
  /** called with the saved record on close-after-save and after start */
  onSaved: (c: Campaign) => void;
  show: (text: string, bad?: boolean) => void;
}) {
  const api = useApi();
  const { busy, run } = useAction(show);
  const [step, setStep] = useState<Step>(1);
  const [d, setD] = useState<Draft>(() => toDraft(campaign));
  const [saved, setSaved] = useState<Campaign | null>(campaign);
  const [dirty, setDirty] = useState(campaign === null);
  const [problem, setProblem] = useState<string | null>(null);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setD((p) => ({ ...p, [k]: v }));
    setDirty(true);
  };

  const segments = useList<Segment>("/segments");
  const templates = useList<EmailTemplate>("/templates", { channel: "email", limit: 200 });
  const count = useRecipientCount(d);

  const next = () => {
    const p = validate(step, d);
    if (p) return setProblem(p);
    setProblem(null);
    setStep((s) => (s < 5 ? ((s + 1) as Step) : s));
  };

  const goto = (s: Step) => {
    // back any time; forward only through validated steps
    if (s <= step) {
      setProblem(null);
      return setStep(s);
    }
    for (let i = step; i < s; i++) {
      const p = validate(i as Step, d);
      if (p) {
        setStep(i as Step);
        return setProblem(p);
      }
    }
    setProblem(null);
    setStep(s);
  };

  const save = async (): Promise<Campaign | null> => {
    for (const s of [1, 2, 3, 4] as Step[]) {
      const p = validate(s, d);
      if (p) {
        setStep(s);
        setProblem(p);
        return null;
      }
    }
    let out: Campaign | null = null;
    await run(
      "save",
      async () => {
        const res = saved
          ? await api.request<{ item: Campaign }>("PATCH", `/campaigns/${saved.id}`, toInput(d))
          : await api.request<{ item: Campaign }>("POST", "/campaigns", toInput(d));
        out = res.item;
        setSaved(res.item);
        setDirty(false);
      },
      saved ? "Draft saved" : "Draft created"
    );
    return out;
  };

  const start = async () => {
    const c = dirty || !saved ? await save() : saved;
    if (!c) return;
    await run(
      "start",
      async () => {
        const res = await api.request<{ item: Campaign }>("POST", `/campaigns/${c.id}/start`);
        onSaved(res.item);
      },
      "Campaign started"
    );
  };

  const templateName = (id: string) => templates.items.find((t) => t.id === id)?.name ?? id;

  return (
    <Modal title={saved ? `Edit · ${saved.name}` : "New campaign"} onClose={onClose} wide>
      <div className="mb-5">
        <Chips<Step> value={step} onChange={goto} options={STEPS} ariaLabel="Composer steps" />
      </div>

      <div className="min-h-[320px]">
        {step === 1 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Campaign name" required className="sm:col-span-2">
              <Input value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="Hotel FF&E — Jaipur, Oct 2026" autoFocus />
            </Field>
            <Field label="From name" required>
              <Input value={d.fromName} onChange={(e) => set("fromName", e.target.value)} />
            </Field>
            <Field label="From email" required hint="Must be on the verified sending domain">
              <Input type="email" value={d.fromEmail} onChange={(e) => set("fromEmail", e.target.value)} placeholder="hello@…" />
            </Field>
            <Field label="Reply-to" hint="Where replies land; defaults to the from address">
              <Input type="email" value={d.replyTo} onChange={(e) => set("replyTo", e.target.value)} />
            </Field>
          </div>
        ) : null}

        {step === 2 ? (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <Chips<Mode>
                value={d.mode}
                onChange={(m) => set("mode", m)}
                options={[
                  { value: "segment", label: "Saved segment" },
                  { value: "filter", label: "Filter" },
                  { value: "leads", label: "Pick leads" },
                ]}
                ariaLabel="Audience type"
              />
              <RecipientCount count={count} />
            </div>

            {d.mode === "segment" ? (
              <Field label="Segment" hint="Saved on the Leads screen">
                <Select
                  value={d.segmentId}
                  onChange={(e) => set("segmentId", e.target.value)}
                  options={[
                    { value: "", label: segments.items.length ? "Choose a segment…" : "No segments saved yet" },
                    ...segments.items.map((s) => ({ value: s.id, label: `${s.name} — ${describe(s.filter)}` })),
                  ]}
                />
              </Field>
            ) : null}

            {d.mode === "filter" ? <FilterFields value={d.filter} onChange={(f) => set("filter", f)} /> : null}

            {d.mode === "leads" ? (
              <LeadPicker
                ids={d.leadIds}
                picked={d.picked}
                onChange={(ids, picked) => {
                  setD((p) => ({ ...p, leadIds: ids, picked }));
                  setDirty(true);
                }}
              />
            ) : null}

            <p className="mt-4 font-sans-luxury text-[11.5px] italic text-[#a2988b]">
              Leads without an email, suppressed or unsubscribed, or already in this campaign are dropped at start.
            </p>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <ErrorText>{templates.error}</ErrorText>
            {templates.items.length === 0 && !templates.loading ? (
              <Notice>No email templates yet — create one on the Templates screen first.</Notice>
            ) : null}
            <div className="space-y-3">
              {d.steps.map((s, i) => (
                <div key={i} className="grid grid-cols-1 items-end gap-3 rounded-[10px] border border-[#d8c3a5]/60 bg-[#f3e8d5]/40 p-3 sm:grid-cols-[1fr_130px_auto_auto]">
                  <Field label={`Step ${i + 1} template`} required>
                    <Select
                      value={s.templateId}
                      onChange={(e) => {
                        const steps = [...d.steps];
                        steps[i] = { ...steps[i], templateId: e.target.value };
                        set("steps", steps);
                      }}
                      options={[{ value: "", label: "Choose…" }, ...templates.items.map((t) => ({ value: t.id, label: t.name }))]}
                    />
                  </Field>
                  <Field label={i === 0 ? "Delay" : "Days after previous"}>
                    <Input
                      type="number"
                      min={0}
                      value={i === 0 ? 0 : s.delayDays}
                      disabled={i === 0}
                      onChange={(e) => {
                        const steps = [...d.steps];
                        steps[i] = { ...steps[i], delayDays: Number(e.target.value) };
                        set("steps", steps);
                      }}
                    />
                  </Field>
                  <Check
                    label="Stop if replied"
                    checked={s.stopIfReplied}
                    onChange={(v) => {
                      const steps = [...d.steps];
                      steps[i] = { ...steps[i], stopIfReplied: v };
                      set("steps", steps);
                    }}
                  />
                  <button
                    type="button"
                    aria-label="Remove step"
                    disabled={d.steps.length === 1}
                    onClick={() => set("steps", d.steps.filter((_, j) => j !== i))}
                    className="mb-1 cursor-pointer rounded-full p-2 text-[#8b8178] transition-colors hover:bg-[#a3231b]/10 hover:text-[#a3231b] disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-3">
              <Btn onClick={() => set("steps", [...d.steps, { templateId: "", delayDays: 3, stopIfReplied: true }])}>
                <Plus size={12} /> Add follow-up
              </Btn>
            </div>
          </>
        ) : null}

        {step === 4 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Start (IST)" required hint="Sending begins at the first window after this">
              <Input type="datetime-local" value={d.startAt} onChange={(e) => set("startAt", e.target.value)} />
            </Field>
            <Field label="Daily cap" hint="Emails per day across all steps">
              <Input type="number" min={1} value={d.dailyCap} onChange={(e) => set("dailyCap", Number(e.target.value))} />
            </Field>
            <Field label="Send window — from">
              <Input type="time" value={d.windowStart} onChange={(e) => set("windowStart", e.target.value)} />
            </Field>
            <Field label="Send window — to">
              <Input type="time" value={d.windowEnd} onChange={(e) => set("windowEnd", e.target.value)} />
            </Field>
            <Field label="Timezone" hint="IANA name; the window and start are read in it">
              <Input value={d.timezone} onChange={(e) => set("timezone", e.target.value)} />
            </Field>
            <div className="pt-5">
              <Check label="Weekdays only" hint="Skip Saturday and Sunday" checked={d.weekdaysOnly} onChange={(v) => set("weekdaysOnly", v)} />
            </div>
          </div>
        ) : null}

        {step === 5 ? (
          <Review d={d} saved={saved} dirty={dirty} count={count} templateName={templateName} segments={segments.items} />
        ) : null}
      </div>

      {problem ? (
        <p role="alert" className="mt-3 font-sans-luxury text-[12.5px] text-[#a3231b]">
          {problem}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-[#d8c3a5]/45 pt-4">
        <div className="flex gap-2">
          {step > 1 ? <Btn onClick={() => goto((step - 1) as Step)}>← Back</Btn> : <Btn onClick={onClose}>Cancel</Btn>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Btn
            onClick={async () => {
              const c = await save();
              if (c) onSaved(c);
            }}
            disabled={busy !== null || (!dirty && saved !== null)}
          >
            {busy === "save" ? "Saving…" : saved ? "Save changes" : "Save draft"}
          </Btn>
          {step < 5 ? (
            <Btn variant="primary" onClick={next}>
              Next →
            </Btn>
          ) : (
            <Btn variant="primary" onClick={start} disabled={busy !== null}>
              {busy === "start" ? "Starting…" : "Start campaign"}
            </Btn>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ————— live recipient count ————— */

type CountKey = { mode: Mode; segmentId: string; filter: ReturnType<typeof toLeadFilter>; n: number };

function useRecipientCount(d: Draft): number | null | "loading" {
  const api = useApi();
  const [count, setCount] = useState<number | null | "loading">(null);
  const key = JSON.stringify({
    mode: d.mode,
    segmentId: d.segmentId,
    filter: toLeadFilter(d.filter),
    n: d.leadIds.length,
  } satisfies CountKey);
  const dk = useDebounced(key, 400);

  useEffect(() => {
    const k = JSON.parse(dk) as CountKey;
    let alive = true;
    if (k.mode === "leads") {
      setCount(k.n);
      return;
    }
    if (k.mode === "segment" && !k.segmentId) {
      setCount(null);
      return;
    }
    setCount("loading");
    // The API applies the same eligibility rules a start would (no email,
    // suppressed, unsubscribed), so this is the number that will actually be
    // enrolled — not just how many leads match the filter.
    const audience = k.mode === "segment" ? { segmentId: k.segmentId } : { filter: k.filter };
    const p = api
      .request<{ matched: number; recipients: number }>("POST", "/campaigns/audience/count", { audience })
      .then((r) => r.recipients);
    p.then((n) => alive && setCount(n)).catch(() => alive && setCount(null));
    return () => {
      alive = false;
    };
  }, [api, dk]);

  return count;
}

function RecipientCount({ count }: { count: number | null | "loading" }) {
  return (
    <span className="rounded-full bg-[#741a14]/10 px-3 py-1 font-sans-luxury text-[11px] font-bold uppercase tracking-[0.12em] text-[#741a14]">
      {count === "loading" ? "Counting…" : count === null ? "— recipients" : `${count} recipient${count === 1 ? "" : "s"}`}
    </span>
  );
}

/* ————— filter audience ————— */

function FilterFields({ value, onChange }: { value: Filters; onChange: (f: Filters) => void }) {
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Stages" hint="any of; none = all" className="sm:col-span-2 lg:col-span-3">
        <div className="flex flex-wrap gap-1.5 pt-1">
          {LEAD_STAGES.map((s) => (
            <TogglePill
              key={s}
              on={value.stage.includes(s)}
              onClick={() =>
                set(
                  "stage",
                  value.stage.includes(s) ? value.stage.filter((x) => x !== s) : [...value.stage, s as LeadStage]
                )
              }
            >
              {cap(s)}
            </TogglePill>
          ))}
        </div>
      </Field>
      <Field label="Tags" hint="has any of, comma-separated">
        <Input value={value.tags} onChange={(e) => set("tags", e.target.value)} />
      </Field>
      <Field label="Owner">
        <Input value={value.owner} onChange={(e) => set("owner", e.target.value)} />
      </Field>
      <Field label="Search">
        <Input value={value.q} onChange={(e) => set("q", e.target.value)} placeholder="name, company, email" />
      </Field>
      <Field label="Industry">
        <Input value={value.industry} onChange={(e) => set("industry", e.target.value)} />
      </Field>
      <Field label="City">
        <Input value={value.city} onChange={(e) => set("city", e.target.value)} />
      </Field>
      <div className="pt-5">
        <Check label="Has email" checked={value.hasEmail} onChange={(v) => set("hasEmail", v)} />
      </div>
    </div>
  );
}

/* ————— pick leads ————— */

function LeadPicker({
  ids,
  picked,
  onChange,
}: {
  ids: string[];
  picked: Record<string, Lead>;
  onChange: (ids: string[], picked: Record<string, Lead>) => void;
}) {
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 300);
  const results = useList<Lead>("/leads", { q: dq || undefined, hasEmail: true, limit: 20, sort: "updatedAt" });

  const toggle = (l: Lead) => {
    if (ids.includes(l.id)) {
      const rest = { ...picked };
      delete rest[l.id];
      onChange(
        ids.filter((x) => x !== l.id),
        rest
      );
    } else {
      onChange([...ids, l.id], { ...picked, [l.id]: l });
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div>
        <Field label="Find leads">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, company, email…" />
        </Field>
        <ErrorText>{results.error}</ErrorText>
        <ul className="mt-2 max-h-[300px] divide-y divide-[#d8c3a5]/40 overflow-y-auto rounded-[8px] border border-[#d8c3a5]/60 bg-white/60">
          {results.loading ? (
            <li>
              <Spinner label="Searching…" />
            </li>
          ) : results.items.length === 0 ? (
            <li className="px-3 py-6 text-center font-sans-luxury text-[12.5px] text-[#a2988b]">No leads with an email match.</li>
          ) : (
            results.items.map((l) => (
              <li key={l.id}>
                <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-[#f3e8d5]/50">
                  <input
                    type="checkbox"
                    checked={ids.includes(l.id)}
                    onChange={() => toggle(l)}
                    className="h-[15px] w-[15px] cursor-pointer accent-[#741a14]"
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-sans-luxury text-[12.5px] text-[#11100e]">
                      {fullName(l) || l.email}
                      {l.company ? <span className="text-[#8b8178]"> · {l.company}</span> : null}
                    </span>
                    <span className="block truncate font-sans-luxury text-[11px] text-[#8b8178]">{l.email}</span>
                  </span>
                </label>
              </li>
            ))
          )}
        </ul>
      </div>
      <div>
        <SectionLabel>Picked · {ids.length}</SectionLabel>
        {ids.length === 0 ? (
          <Muted>Nobody yet — tick leads on the left.</Muted>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {ids.map((id) => {
              const l = picked[id];
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => (l ? toggle(l) : onChange(ids.filter((x) => x !== id), picked))}
                    title="Remove"
                    className="cursor-pointer rounded-full border border-[#741a14]/30 px-2.5 py-1 font-sans-luxury text-[11px] text-[#741a14] hover:bg-[#a3231b]/10 hover:text-[#a3231b]"
                  >
                    {l ? fullName(l) || l.email : id} ×
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ————— review ————— */

function Review({
  d,
  saved,
  dirty,
  count,
  templateName,
  segments,
}: {
  d: Draft;
  saved: Campaign | null;
  dirty: boolean;
  count: number | null | "loading";
  templateName: (id: string) => string;
  segments: Segment[];
}) {
  const api = useApi();
  const [preview, setPreview] = useState<CampaignPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showHtml, setShowHtml] = useState(false);

  const savedKey = saved ? `${saved.id}:${saved.updatedAt}` : "";
  useEffect(() => {
    if (!savedKey) return;
    const id = savedKey.split(":")[0];
    let alive = true;
    setLoading(true);
    api
      .request<CampaignPreview>("GET", `/campaigns/${id}/preview?limit=3`)
      .then((p) => {
        if (!alive) return;
        setPreview(p);
        setError(null);
      })
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : "Could not render samples."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [api, savedKey]);

  const audience = useMemo(() => {
    if (d.mode === "segment") {
      const s = segments.find((x) => x.id === d.segmentId);
      return s ? `Segment “${s.name}” — ${describe(s.filter)}` : "Segment";
    }
    if (d.mode === "leads") return `${d.leadIds.length} hand-picked lead${d.leadIds.length === 1 ? "" : "s"}`;
    return `Filter — ${describe(toLeadFilter(d.filter))}`;
  }, [d, segments]);

  return (
    <>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Kv label="Campaign">{d.name}</Kv>
        <Kv label="From">
          {d.fromName} &lt;{d.fromEmail}&gt;{d.replyTo ? ` · reply-to ${d.replyTo}` : ""}
        </Kv>
        <Kv label="Audience">
          {audience} · <RecipientCount count={count} />
        </Kv>
        <Kv label="Schedule">
          Starts {fmtIst(istInputToIso(d.startAt))} · {d.dailyCap}/day · {d.windowStart}–{d.windowEnd} {d.timezone}
          {d.weekdaysOnly ? " · weekdays only" : ""}
        </Kv>
        <Kv label="Steps">
          <ol className="list-decimal pl-4">
            {d.steps.map((s, i) => (
              <li key={i}>
                {templateName(s.templateId)}
                {i > 0 ? ` — ${s.delayDays} day${s.delayDays === 1 ? "" : "s"} later` : " — at start"}
                {s.stopIfReplied ? "" : " · continues after a reply"}
              </li>
            ))}
          </ol>
        </Kv>
      </dl>

      <div className="mt-5 border-t border-[#d8c3a5]/45 pt-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <SectionLabel>Rendered samples</SectionLabel>
          {preview?.samples.length ? (
            <Chips<"text" | "html">
              value={showHtml ? "html" : "text"}
              onChange={(v) => setShowHtml(v === "html")}
              options={[
                { value: "text", label: "Text" },
                { value: "html", label: "HTML" },
              ]}
            />
          ) : null}
        </div>
        {!saved ? (
          <Muted>Save the draft to render three sample emails against real recipients.</Muted>
        ) : dirty ? (
          <Notice>Unsaved changes — samples reflect the last saved version. Save to refresh them.</Notice>
        ) : null}
        <ErrorText>{error}</ErrorText>
        {loading ? <Spinner label="Rendering…" /> : null}
        {preview && !loading ? (
          preview.samples.length === 0 ? (
            <Muted>
              {preview.recipients === 0
                ? "No recipients resolve from this audience yet."
                : "No samples were returned."}
            </Muted>
          ) : (
            <>
              <Muted>{preview.recipients} recipient{preview.recipients === 1 ? "" : "s"} would be queued at start.</Muted>
              <div className="mt-2 grid grid-cols-1 gap-3 lg:grid-cols-3">
                {preview.samples.map((s) => (
                  <div key={s.leadId} className="overflow-hidden rounded-[8px] border border-[#d8c3a5]/60 bg-white/70">
                    <div className="border-b border-[#d8c3a5]/45 bg-[#f3e8d5]/40 px-3 py-2">
                      <p className="truncate font-sans-luxury text-[11px] text-[#8b8178]">to {s.email}</p>
                      <p className="truncate font-sans-luxury text-[12.5px] font-medium text-[#11100e]" title={s.subject}>
                        {s.subject}
                      </p>
                    </div>
                    {showHtml ? (
                      <iframe title={`Sample for ${s.email}`} sandbox="" srcDoc={s.html} className="h-[260px] w-full bg-white" />
                    ) : (
                      <pre className="max-h-[260px] overflow-auto whitespace-pre-wrap px-3 py-2 font-sans-luxury text-[12px] leading-[1.55] text-[#11100e]">
                        {s.text}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </>
          )
        ) : null}
      </div>
    </>
  );
}
