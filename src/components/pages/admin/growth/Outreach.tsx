"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Copy, ExternalLink, Plus, Trash2 } from "lucide-react";

import { EmptyState, relTime } from "../AdminShell";
import { Badge, Btn, Card, Confirm, Field, Input, Modal, PageHead, Select, Spinner, Textarea, useToast } from "../cms/ui";
import { safeHref } from "@/lib/admin/cms/url";
import { useAction, useApi, useItem, useList } from "./api";
import {
  Drawer,
  ErrorText,
  Kv,
  Muted,
  copyText,
  fmtIst,
  growthTone,
  isoToIstInput,
  istInputToIso,
  useDebounced,
} from "./shared";
import {
  OUTREACH_STAGES,
  OUTREACH_STAGE_LABEL,
  type EmailTemplate,
  type OutreachInput,
  type OutreachRender,
  type OutreachStage,
  type OutreachTarget,
} from "./types";

/**
 * LinkedIn outreach is human-sent: the platform tracks the pipeline and
 * writes the message, the operator pastes it into LinkedIn. A kanban by
 * stage, the targets due today, and a drawer that renders a template for
 * the target and advances the stage with a note and next action.
 */

/** The happy path through the pipeline; the kanban's "advance" button follows it. */
const NEXT: Partial<Record<OutreachStage, OutreachStage>> = {
  identified: "connection_sent",
  connection_sent: "connected",
  connected: "messaged",
  messaged: "replied",
  replied: "meeting",
  meeting: "won",
};

const STAGE_OPTIONS = OUTREACH_STAGES.map((s) => ({ value: s, label: OUTREACH_STAGE_LABEL[s] }));

export default function Outreach() {
  const api = useApi();
  const { show, node: toast } = useToast();
  const { busy, run } = useAction(show);
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 300);
  const list = useList<OutreachTarget>("/outreach", { q: dq || undefined, limit: 500 });
  const due = useList<OutreachTarget>("/outreach/due");
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const byStage = useMemo(() => {
    const m = new Map<OutreachStage, OutreachTarget[]>();
    for (const s of OUTREACH_STAGES) m.set(s, []);
    for (const t of list.items) (m.get(t.stage) ?? m.get("identified"))?.push(t);
    for (const arr of m.values()) arr.sort((a, b) => (b.lastActionAt ?? b.updatedAt).localeCompare(a.lastActionAt ?? a.updatedAt));
    return m;
  }, [list.items]);

  const reloadAll = () => {
    void list.reload();
    void due.reload();
  };

  const quickAdvance = (t: OutreachTarget) => {
    const next = NEXT[t.stage];
    if (!next) return;
    void run(
      `adv-${t.id}`,
      async () => {
        await api.request("POST", `/outreach/${t.id}/advance`, { stage: next });
        reloadAll();
      },
      `${t.name} → ${OUTREACH_STAGE_LABEL[next]}`
    );
  };

  const now = Date.now();

  return (
    <>
      <PageHead
        title="Outreach"
        sub="LinkedIn pipeline, sent by hand. The console writes the message and tracks every step; you press send on LinkedIn."
        action={
          <Btn variant="primary" onClick={() => setCreating(true)}>
            <Plus size={13} /> New target
          </Btn>
        }
      />

      {/* ——— due today ——— */}
      <Card className="mb-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="font-sans-luxury text-[10px] font-bold uppercase tracking-[0.18em] text-[#741a14]">
            Due today · {due.items.length}
          </p>
          <Muted>next action on or before now, oldest first</Muted>
        </div>
        {due.loading ? (
          <Muted>Loading…</Muted>
        ) : due.items.length === 0 ? (
          <p className="font-sans-luxury text-[12.5px] text-[#8b8178]">Nothing due — set a next action on a target to see it here.</p>
        ) : (
          <ul className="divide-y divide-[#d8c3a5]/40">
            {due.items.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 py-2">
                <button
                  onClick={() => setOpen(t.id)}
                  className="cursor-pointer text-left font-sans-luxury text-[13px] font-medium text-[#11100e] hover:text-[#741a14]"
                >
                  {t.name}
                </button>
                <Muted>{[t.company, t.role].filter(Boolean).join(" · ")}</Muted>
                <Badge tone={growthTone(t.stage)}>{OUTREACH_STAGE_LABEL[t.stage]}</Badge>
                <span className="ml-auto font-sans-luxury text-[11.5px] text-[#a3231b]">
                  due {t.nextActionAt ? fmtIst(t.nextActionAt) : "now"}
                </span>
                <Btn onClick={() => setOpen(t.id)}>Open</Btn>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="w-full max-w-[320px]">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, company…" aria-label="Search targets" />
        </div>
        <Muted>{list.meta ? `${list.meta.total} target${list.meta.total === 1 ? "" : "s"}` : ""}</Muted>
      </div>

      <ErrorText>{list.error}</ErrorText>

      {list.loading ? (
        <Spinner />
      ) : list.items.length === 0 ? (
        <EmptyState>
          {dq ? "No targets match." : "No outreach targets yet — add one here or from a lead's drawer."}
        </EmptyState>
      ) : (
        <div className="-mx-5 overflow-x-auto px-5 pb-3 sm:-mx-8 sm:px-8">
          <div className="flex min-w-max gap-3">
            {OUTREACH_STAGES.map((stage) => {
              const cards = byStage.get(stage) ?? [];
              return (
                <section key={stage} className="w-[240px] shrink-0">
                  <div className="mb-2 flex items-center justify-between px-1">
                    <p className="font-sans-luxury text-[10px] font-bold uppercase tracking-[0.16em] text-[#8b8178]">
                      {OUTREACH_STAGE_LABEL[stage]}
                    </p>
                    <span className="font-sans-luxury text-[11px] text-[#a2988b]">{cards.length}</span>
                  </div>
                  <div className="min-h-[120px] space-y-2 rounded-[12px] border border-dashed border-[#d8c3a5]/70 bg-[#fff8ed]/50 p-2">
                    {cards.map((t) => {
                      const dueNow = t.nextActionAt ? new Date(t.nextActionAt).getTime() <= now : false;
                      const next = NEXT[t.stage];
                      return (
                        <article key={t.id} className="rounded-[10px] border border-[#d8c3a5]/60 bg-[#fff8ed] p-3">
                          <button
                            onClick={() => setOpen(t.id)}
                            className="block w-full cursor-pointer text-left font-sans-luxury text-[13px] font-medium leading-[1.3] text-[#11100e] hover:text-[#741a14]"
                          >
                            {t.name}
                          </button>
                          {t.company || t.role ? (
                            <p className="mt-0.5 truncate font-sans-luxury text-[11px] text-[#8b8178]">
                              {[t.role, t.company].filter(Boolean).join(" · ")}
                            </p>
                          ) : null}
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <span
                              className={`font-sans-luxury text-[10.5px] ${dueNow ? "font-bold text-[#a3231b]" : "text-[#a2988b]"}`}
                              title={t.nextActionAt ? `Next: ${fmtIst(t.nextActionAt)}` : undefined}
                            >
                              {dueNow ? "due" : t.lastActionAt ? relTime(t.lastActionAt) : relTime(t.createdAt)}
                            </span>
                            {next ? (
                              <button
                                onClick={() => quickAdvance(t)}
                                disabled={busy !== null}
                                title={`Move to ${OUTREACH_STAGE_LABEL[next]}`}
                                className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-[#741a14]/30 px-2 py-[3px] font-sans-luxury text-[9.5px] font-bold uppercase tracking-[0.1em] text-[#741a14] transition-colors hover:bg-[#741a14]/10 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {OUTREACH_STAGE_LABEL[next]} <ArrowRight size={10} />
                              </button>
                            ) : null}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}

      {open ? (
        <TargetDrawer id={open} onClose={() => setOpen(null)} onChanged={reloadAll} show={show} />
      ) : null}

      {creating ? (
        <NewTarget
          onClose={() => setCreating(false)}
          onCreated={(t) => {
            setCreating(false);
            reloadAll();
            setOpen(t.id);
          }}
          show={show}
        />
      ) : null}

      {toast}
    </>
  );
}

/* ————— new target ————— */

function NewTarget({
  onClose,
  onCreated,
  show,
}: {
  onClose: () => void;
  onCreated: (t: OutreachTarget) => void;
  show: (text: string, bad?: boolean) => void;
}) {
  const api = useApi();
  const { busy, run } = useAction(show);
  const [d, setD] = useState({ name: "", company: "", role: "", linkedinUrl: "", nextAt: "" });
  const set = (k: keyof typeof d, v: string) => setD((p) => ({ ...p, [k]: v }));
  const valid = d.name.trim() && /^https?:\/\//i.test(d.linkedinUrl.trim());

  return (
    <Modal title="New outreach target" onClose={onClose}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Name" required>
          <Input value={d.name} onChange={(e) => set("name", e.target.value)} autoFocus />
        </Field>
        <Field label="LinkedIn profile URL" required>
          <Input value={d.linkedinUrl} onChange={(e) => set("linkedinUrl", e.target.value)} placeholder="https://www.linkedin.com/in/…" />
        </Field>
        <Field label="Company">
          <Input value={d.company} onChange={(e) => set("company", e.target.value)} />
        </Field>
        <Field label="Role">
          <Input value={d.role} onChange={(e) => set("role", e.target.value)} />
        </Field>
        <Field label="Next action (IST)" hint="Shows under Due today when it arrives">
          <Input type="datetime-local" value={d.nextAt} onChange={(e) => set("nextAt", e.target.value)} />
        </Field>
      </div>
      <p className="mt-3 font-sans-luxury text-[11.5px] italic text-[#a2988b]">
        To track someone who is already a lead, use “Add to outreach” in their drawer on the Leads screen — that links the two.
      </p>
      <div className="mt-5 flex justify-end gap-2 border-t border-[#d8c3a5]/45 pt-4">
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn
          variant="primary"
          disabled={!valid || busy === "create"}
          onClick={() =>
            run(
              "create",
              async () => {
                const body: OutreachInput = {
                  name: d.name.trim(),
                  linkedinUrl: d.linkedinUrl.trim(),
                  company: d.company.trim() || undefined,
                  role: d.role.trim() || undefined,
                  nextActionAt: d.nextAt ? istInputToIso(d.nextAt) : undefined,
                };
                const res = await api.request<{ item: OutreachTarget }>("POST", "/outreach", body);
                onCreated(res.item);
              },
              "Target added"
            )
          }
        >
          {busy === "create" ? "Adding…" : "Add target"}
        </Btn>
      </div>
    </Modal>
  );
}

/* ————— drawer ————— */

function TargetDrawer({
  id,
  onClose,
  onChanged,
  show,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => void;
  show: (text: string, bad?: boolean) => void;
}) {
  const api = useApi();
  const { item: t, loading, error, setItem } = useItem<OutreachTarget>(`/outreach/${id}`);
  const { busy, run } = useAction(show);
  const templates = useList<EmailTemplate>("/templates", { channel: "linkedin", limit: 200 });
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState(false);

  // message
  const [templateId, setTemplateId] = useState<string>("");
  const [rendered, setRendered] = useState<OutreachRender | null>(null);
  const [message, setMessage] = useState("");

  // advance
  const [stage, setStage] = useState<OutreachStage | "">("");
  const [note, setNote] = useState("");
  const [noteText, setNoteText] = useState("");
  const [nextAt, setNextAt] = useState("");

  const effectiveTemplate = templateId || t?.templateId || "";
  const effectiveStage: OutreachStage | "" = stage || (t ? NEXT[t.stage] ?? "" : "");

  const renderTemplate = (tid: string) => {
    if (!t || !tid) return;
    void run("render", async () => {
      const r = await api.request<OutreachRender>("POST", `/outreach/${t.id}/render`, { templateId: tid });
      setRendered(r);
      setMessage(r.text);
      if (t.templateId !== tid) {
        // remember the pick on the target; a failure here is not worth a toast
        api
          .request<{ item: OutreachTarget }>("PATCH", `/outreach/${t.id}`, { templateId: tid })
          .then((res) => setItem(res.item))
          .catch(() => undefined);
      }
    });
  };

  const advance = () => {
    if (!t || !effectiveStage) return;
    void run(
      "advance",
      async () => {
        const res = await api.request<{ item: OutreachTarget }>("POST", `/outreach/${t.id}/advance`, {
          stage: effectiveStage,
          note: note.trim() || undefined,
          nextActionAt: nextAt ? istInputToIso(nextAt) : undefined,
        });
        setItem(res.item);
        setStage("");
        setNote("");
        setNextAt("");
        onChanged();
      },
      `Moved to ${OUTREACH_STAGE_LABEL[effectiveStage]}`
    );
  };

  const href = t ? safeHref(t.linkedinUrl) : "";
  const history = [...(t?.history ?? [])].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <Drawer
      title={t?.name ?? "Target"}
      sub={t ? [t.role, t.company].filter(Boolean).join(" · ") || undefined : undefined}
      onClose={onClose}
      footer={
        t ? (
          <>
            <Btn variant="quiet" onClick={() => setConfirming(true)} disabled={busy !== null}>
              <Trash2 size={12} /> Delete
            </Btn>
            <span className="flex-1" />
            <Btn onClick={() => setEditing((v) => !v)}>{editing ? "Done editing" : "Edit details"}</Btn>
          </>
        ) : undefined
      }
    >
      <ErrorText>{error}</ErrorText>
      {loading && !t ? <Spinner /> : null}

      {t ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={growthTone(t.stage)}>{OUTREACH_STAGE_LABEL[t.stage]}</Badge>
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-sans-luxury text-[11.5px] font-bold uppercase tracking-[0.12em] text-[#741a14] underline underline-offset-4"
              >
                LinkedIn profile <ExternalLink size={11} />
              </a>
            ) : (
              <Muted>no valid profile URL</Muted>
            )}
            {t.leadId ? <Badge tone="neutral">Linked lead</Badge> : null}
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Kv label="Last action">{t.lastActionAt ? fmtIst(t.lastActionAt) : "—"}</Kv>
            <Kv label="Next action">
              {t.nextActionAt ? (
                <span className={new Date(t.nextActionAt).getTime() <= Date.now() ? "font-bold text-[#a3231b]" : ""}>
                  {fmtIst(t.nextActionAt)}
                </span>
              ) : (
                "—"
              )}
            </Kv>
            <Kv label="Added">{fmtIst(t.createdAt, false)}</Kv>
          </dl>

          {editing ? (
            <EditDetails
              target={t}
              busy={busy === "edit"}
              onSave={(body) =>
                run(
                  "edit",
                  async () => {
                    const res = await api.request<{ item: OutreachTarget }>("PATCH", `/outreach/${t.id}`, body);
                    setItem(res.item);
                    setEditing(false);
                    onChanged();
                  },
                  "Saved"
                )
              }
            />
          ) : null}

          {/* ——— message ——— */}
          <section className="mt-6 border-t border-[#d8c3a5]/45 pt-5">
            <p className="mb-3 font-sans-luxury text-[10px] font-bold uppercase tracking-[0.18em] text-[#8b8178]">
              Message
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Template" className="min-w-[220px] flex-1">
                <Select
                  value={effectiveTemplate}
                  onChange={(e) => {
                    setTemplateId(e.target.value);
                    renderTemplate(e.target.value);
                  }}
                  options={[
                    { value: "", label: templates.items.length ? "Pick a LinkedIn template…" : "No LinkedIn templates yet" },
                    ...templates.items.map((x) => ({ value: x.id, label: x.name })),
                  ]}
                />
              </Field>
              <Btn
                onClick={() => renderTemplate(effectiveTemplate)}
                disabled={!effectiveTemplate || busy === "render"}
              >
                {busy === "render" ? "Rendering…" : "Render"}
              </Btn>
            </div>

            {rendered ? (
              <div className="mt-3">
                {rendered.missing.length ? (
                  <p className="mb-2 font-sans-luxury text-[11.5px] text-[#a3231b]">
                    No value for: {rendered.missing.map((m) => `{{${m}}}`).join(", ")} — fill them in below.
                  </p>
                ) : null}
                <Textarea rows={7} value={message} onChange={(e) => setMessage(e.target.value)} />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <Muted>{message.length} / 3000</Muted>
                  <div className="flex gap-2">
                    <Btn
                      variant="primary"
                      onClick={() =>
                        copyText(message)
                          .then(() => show("Message copied — paste it into LinkedIn"))
                          .catch(() => show("Could not copy; select the text and copy it by hand.", true))
                      }
                    >
                      <Copy size={12} /> Copy
                    </Btn>
                    {t.stage !== "messaged" ? (
                      <Btn
                        onClick={() => {
                          setStage("messaged");
                          if (!note) setNote("Sent LinkedIn message");
                        }}
                      >
                        Mark as messaged ↓
                      </Btn>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
          </section>

          {/* ——— advance ——— */}
          <section className="mt-6 border-t border-[#d8c3a5]/45 pt-5">
            <p className="mb-3 font-sans-luxury text-[10px] font-bold uppercase tracking-[0.18em] text-[#8b8178]">
              Advance stage
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="New stage">
                <Select
                  value={effectiveStage}
                  onChange={(e) => setStage(e.target.value as OutreachStage)}
                  options={[{ value: "", label: "Choose…" }, ...STAGE_OPTIONS]}
                />
              </Field>
              <Field label="Next action (IST)">
                <Input type="datetime-local" value={nextAt} onChange={(e) => setNextAt(e.target.value)} />
              </Field>
              <Field label="Note" className="sm:col-span-2">
                <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened…" />
              </Field>
            </div>
            <div className="mt-3 flex justify-end">
              <Btn variant="primary" onClick={advance} disabled={!effectiveStage || busy === "advance"}>
                {busy === "advance" ? "Saving…" : effectiveStage ? `Move to ${OUTREACH_STAGE_LABEL[effectiveStage]}` : "Advance"}
              </Btn>
            </div>
          </section>

          {/* ——— history ——— */}
          {history.length ? (
            <section className="mt-6 border-t border-[#d8c3a5]/45 pt-5">
              <p className="mb-3 font-sans-luxury text-[10px] font-bold uppercase tracking-[0.18em] text-[#8b8178]">
                History
              </p>
              <ol className="relative ml-2 border-l border-[#d8c3a5]/70 pl-4">
                {history.map((h, i) => (
                  <li key={`${h.at}-${i}`} className="relative mb-3 last:mb-0">
                    <span className="absolute -left-[21px] top-[5px] h-[9px] w-[9px] rounded-full border-2 border-[#fff8ed] bg-[#741a14]/70" />
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={growthTone(h.stage)}>{OUTREACH_STAGE_LABEL[h.stage] ?? h.stage}</Badge>
                      <span className="font-sans-luxury text-[10.5px] text-[#8b8178]">{fmtIst(h.at)}</span>
                    </div>
                    {h.note ? (
                      <p className="mt-1 whitespace-pre-wrap font-sans-luxury text-[12.5px] leading-[1.5] text-[#11100e]">{h.note}</p>
                    ) : null}
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          <section className="mt-6 border-t border-[#d8c3a5]/45 pt-5">
            <p className="mb-3 font-sans-luxury text-[10px] font-bold uppercase tracking-[0.18em] text-[#8b8178]">
              Notes
            </p>
            <div className="mb-3 flex items-start gap-2">
              <Textarea
                rows={2}
                value={noteText}
                placeholder="Something worth remembering about this person…"
                onChange={(e) => setNoteText(e.target.value)}
              />
              <Btn
                disabled={!noteText.trim() || busy === "note"}
                onClick={() =>
                  void run(
                    "note",
                    async () => {
                      const res = await api.request<{ item: OutreachTarget }>("POST", `/outreach/${t.id}/notes`, {
                        text: noteText.trim(),
                      });
                      setItem(res.item);
                      setNoteText("");
                    },
                    "Note added"
                  )
                }
              >
                Add
              </Btn>
            </div>
            {t.notes?.length ? (
              <ul className="space-y-2">
                {[...t.notes].sort((a, b) => b.at.localeCompare(a.at)).map((n, i) => (
                  <li key={`${n.at}-${i}`} className="rounded-[8px] bg-[#f3e8d5]/60 px-3 py-2">
                    <p className="whitespace-pre-wrap font-sans-luxury text-[12.5px] leading-[1.55] text-[#11100e]">{n.text}</p>
                    <p className="mt-1 font-sans-luxury text-[10.5px] text-[#8b8178]">
                      {n.by || "console"} · {fmtIst(n.at)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        </>
      ) : null}

      {confirming && t ? (
        <Confirm
          title="Delete this target?"
          body={`${t.name} and their outreach history will be removed. The linked lead, if any, is untouched.`}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            void run(
              "delete",
              async () => {
                await api.request("DELETE", `/outreach/${t.id}`);
                onChanged();
                onClose();
              },
              "Target deleted"
            );
          }}
        />
      ) : null}
    </Drawer>
  );
}

function EditDetails({
  target,
  busy,
  onSave,
}: {
  target: OutreachTarget;
  busy: boolean;
  onSave: (body: OutreachInput) => Promise<boolean>;
}) {
  const [d, setD] = useState({
    name: target.name,
    company: target.company ?? "",
    role: target.role ?? "",
    linkedinUrl: target.linkedinUrl,
    nextAt: isoToIstInput(target.nextActionAt),
  });
  const set = (k: keyof typeof d, v: string) => setD((p) => ({ ...p, [k]: v }));
  const valid = d.name.trim() && /^https?:\/\//i.test(d.linkedinUrl.trim());

  return (
    <div className="mt-4 rounded-[10px] border border-[#d8c3a5]/60 bg-[#f3e8d5]/40 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Name" required>
          <Input value={d.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="LinkedIn URL" required>
          <Input value={d.linkedinUrl} onChange={(e) => set("linkedinUrl", e.target.value)} />
        </Field>
        <Field label="Company">
          <Input value={d.company} onChange={(e) => set("company", e.target.value)} />
        </Field>
        <Field label="Role">
          <Input value={d.role} onChange={(e) => set("role", e.target.value)} />
        </Field>
        <Field label="Next action (IST)">
          <Input type="datetime-local" value={d.nextAt} onChange={(e) => set("nextAt", e.target.value)} />
        </Field>
      </div>
      <div className="mt-3 flex justify-end">
        <Btn
          variant="primary"
          disabled={!valid || busy}
          onClick={() =>
            void onSave({
              name: d.name.trim(),
              linkedinUrl: d.linkedinUrl.trim(),
              company: d.company.trim() || undefined,
              role: d.role.trim() || undefined,
              nextActionAt: d.nextAt ? istInputToIso(d.nextAt) : undefined,
            })
          }
        >
          {busy ? "Saving…" : "Save details"}
        </Btn>
      </div>
    </div>
  );
}
