"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";
import { ArrowLeft, Pencil, Plus, Send, Trash2 } from "lucide-react";

import { EmptyState } from "../AdminShell";
import {
  Badge,
  Btn,
  Card,
  Confirm,
  Field,
  Input,
  PageHead,
  SectionLabel,
  Select,
  Spinner,
  Table,
  Td,
  Tr,
  useToast,
} from "../cms/ui";
import { useAction, useApi, useList } from "./api";
import { Chips, ErrorText, Notice, cap, fmtIst, markDryRun, useDebounced } from "./shared";
import {
  MERGE_FIELDS,
  TEMPLATE_CATEGORIES,
  TEMPLATE_CHANNELS,
  type EmailTemplate,
  type RenderResult,
  type TemplateCategory,
  type TemplateChannel,
  type TemplateInput,
  type TestSendResult,
} from "./types";

/**
 * Email and LinkedIn message templates with `{{merge|fallback}}` fields.
 * The list filters by channel; the editor renders the saved version through
 * the server (`/templates/:id/render`) so the preview is exactly what a
 * campaign would send, and test-sends say loudly when the mail provider is
 * in dry-run.
 */
export default function Templates() {
  const { show, node: toast } = useToast();
  const api = useApi();
  const { run } = useAction(show);
  const [channel, setChannel] = useState<"" | TemplateChannel>("");
  const list = useList<EmailTemplate>("/templates", { channel: channel || undefined, limit: 200 });
  const [editing, setEditing] = useState<EmailTemplate | "new" | null>(null);
  const [confirming, setConfirming] = useState<EmailTemplate | null>(null);

  if (editing) {
    return (
      <>
        <TemplateEditor
          template={editing === "new" ? null : editing}
          onBack={() => {
            setEditing(null);
            void list.reload();
          }}
          show={show}
        />
        {toast}
      </>
    );
  }

  return (
    <>
      <PageHead
        title="Templates"
        sub="Reusable email and LinkedIn messages. Merge fields pull from each lead; the preview renders exactly what goes out."
        action={
          <Btn variant="primary" onClick={() => setEditing("new")}>
            <Plus size={13} /> New template
          </Btn>
        }
      />

      <div className="mb-4">
        <Chips<"" | TemplateChannel>
          value={channel}
          onChange={setChannel}
          options={[
            { value: "", label: "All" },
            { value: "email", label: "Email" },
            { value: "linkedin", label: "LinkedIn" },
          ]}
          ariaLabel="Channel"
        />
      </div>

      <ErrorText>{list.error}</ErrorText>

      {list.loading ? (
        <Spinner />
      ) : list.items.length === 0 ? (
        <EmptyState>No templates yet — write the first cold email or LinkedIn note.</EmptyState>
      ) : (
        <Table head={["Name", "Channel", "Category", "Subject", "Merge fields", "Updated", "Actions"]}>
          {list.items.map((t) => (
            <Tr key={t.id}>
              <Td>
                <button
                  onClick={() => setEditing(t)}
                  className="cursor-pointer text-left font-medium text-[#11100e] hover:text-[#741a14]"
                >
                  {t.name}
                </button>
              </Td>
              <Td>
                <Badge tone={t.channel === "email" ? "accent" : "neutral"}>{t.channel}</Badge>
              </Td>
              <Td>{cap(t.category)}</Td>
              <Td>
                <span className="line-clamp-1 max-w-[300px] text-[#4a443d]">
                  {t.channel === "email" ? t.subject || "—" : <span className="text-[#c3b8a8]">text only</span>}
                </span>
              </Td>
              <Td>
                <span className="font-sans-luxury text-[11px] text-[#8b8178]" title={(t.mergeFields ?? []).join(", ")}>
                  {(t.mergeFields ?? []).length ? (t.mergeFields ?? []).map((f) => `{{${f}}}`).join(" ") : "—"}
                </span>
              </Td>
              <Td className="whitespace-nowrap text-[#8b8178]">{fmtIst(t.updatedAt, false)}</Td>
              <Td className="whitespace-nowrap text-right">
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    aria-label="Edit"
                    onClick={() => setEditing(t)}
                    className="cursor-pointer rounded-full p-1.5 text-[#8b8178] transition-colors hover:bg-[#741a14]/10 hover:text-[#741a14]"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    aria-label="Delete"
                    onClick={() => setConfirming(t)}
                    className="cursor-pointer rounded-full p-1.5 text-[#8b8178] transition-colors hover:bg-[#a3231b]/10 hover:text-[#a3231b]"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </Td>
            </Tr>
          ))}
        </Table>
      )}

      {confirming ? (
        <Confirm
          title="Delete this template?"
          body={`"${confirming.name}" will be removed. A template still used by a campaign that has not completed cannot be deleted.`}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            const t = confirming;
            setConfirming(null);
            void run(
              "delete",
              async () => {
                await api.request("DELETE", `/templates/${t.id}`);
                await list.reload();
              },
              "Template deleted"
            );
          }}
        />
      ) : null}

      {toast}
    </>
  );
}

/* ————— editor ————— */

type Draft = {
  name: string;
  channel: TemplateChannel;
  category: TemplateCategory;
  subject: string;
  preheader: string;
  html: string;
  text: string;
};

const SAMPLE_DEFAULT: Record<string, string> = {
  first_name: "Priya",
  last_name: "Sharma",
  email: "priya@example.com",
  company: "Acme Hotels",
  role: "Head of Marketing",
  city: "Jaipur",
  industry: "Hospitality",
};

const LINKEDIN_LIMIT = 3000;

function toDraft(t: EmailTemplate | null): Draft {
  return {
    name: t?.name ?? "",
    channel: t?.channel ?? "email",
    category: t?.category ?? "cold",
    subject: t?.subject ?? "",
    preheader: t?.preheader ?? "",
    html: t?.html ?? "",
    text: t?.text ?? "",
  };
}

type Focusable = "subject" | "preheader" | "html" | "text";

function TemplateEditor({
  template,
  onBack,
  show,
}: {
  template: EmailTemplate | null;
  onBack: () => void;
  show: (text: string, bad?: boolean) => void;
}) {
  const api = useApi();
  const { busy, run } = useAction(show);
  const [saved, setSaved] = useState<EmailTemplate | null>(template);
  const [d, setD] = useState<Draft>(() => toDraft(template));
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<"html" | "text">(template?.channel === "linkedin" ? "text" : "html");
  const [problem, setProblem] = useState<string | null>(null);

  // merge-field insertion goes into whichever field was focused last; the
  // element is captured on focus because the kit's <Input> takes no ref
  const active = useRef<{ key: Focusable; el: HTMLInputElement | HTMLTextAreaElement } | null>(null);
  const [focused, setFocused] = useState<Focusable>(template?.channel === "linkedin" ? "text" : "html");
  const focus = (key: Focusable) => (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    active.current = { key, el: e.currentTarget };
    setFocused(key);
  };

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setD((p) => ({ ...p, [k]: v }));
    setDirty(true);
  };

  const isEmail = d.channel === "email";

  const insert = (key: string) => {
    const target: Focusable = isEmail ? focused : "text";
    const cur = active.current;
    const el = cur && cur.key === target && cur.el.isConnected ? cur.el : null;
    const snippet = `{{${key}}}`;
    if (!el) {
      set(target, `${d[target]}${snippet}`);
      return;
    }
    const a = el.selectionStart ?? el.value.length;
    const b = el.selectionEnd ?? a;
    const next = `${el.value.slice(0, a)}${snippet}${el.value.slice(b)}`;
    set(target, next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + snippet.length, a + snippet.length);
    });
  };

  const toInput = (): TemplateInput => ({
    name: d.name.trim(),
    channel: d.channel,
    category: d.category,
    ...(isEmail
      ? {
          subject: d.subject.trim(),
          preheader: d.preheader.trim() || undefined,
          html: d.html,
          text: d.text,
        }
      : { text: d.text }),
  });

  const save = async (): Promise<EmailTemplate | null> => {
    if (!d.name.trim()) {
      setProblem("Give the template a name.");
      return null;
    }
    if (isEmail && !d.subject.trim()) {
      setProblem("Email templates need a subject.");
      return null;
    }
    if (isEmail && !d.html.trim()) {
      setProblem("Email templates need HTML — the text version is derived from it when left empty.");
      return null;
    }
    if (!isEmail && !d.text.trim()) {
      setProblem("Write the message text.");
      return null;
    }
    if (!isEmail && d.text.length > LINKEDIN_LIMIT) {
      setProblem(`LinkedIn messages are limited to ${LINKEDIN_LIMIT} characters.`);
      return null;
    }
    setProblem(null);
    let result: EmailTemplate | null = null;
    await run(
      "save",
      async () => {
        const res = saved
          ? await api.request<{ item: EmailTemplate }>("PATCH", `/templates/${saved.id}`, toInput())
          : await api.request<{ item: EmailTemplate }>("POST", "/templates", toInput());
        result = res.item;
        setSaved(res.item);
        setD(toDraft(res.item));
        setDirty(false);
      },
      saved ? "Saved" : "Template created"
    );
    return result;
  };

  const charCount = d.text.length;

  return (
    <>
      <PageHead
        title={saved ? saved.name : "New template"}
        sub={saved ? `${cap(saved.channel)} · ${cap(saved.category)} · updated ${fmtIst(saved.updatedAt)}` : "Email or LinkedIn message with merge fields."}
        action={
          <>
            <Btn onClick={onBack}>
              <ArrowLeft size={12} /> All templates
            </Btn>
            <Btn variant="primary" onClick={() => void save()} disabled={busy === "save" || (!dirty && saved !== null)}>
              {busy === "save" ? "Saving…" : saved ? "Save changes" : "Create template"}
            </Btn>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {/* ——— left: the template ——— */}
        <div className="space-y-4">
          <Card>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Name" required className="sm:col-span-1">
                <Input value={d.name} onChange={(e) => set("name", e.target.value)} />
              </Field>
              <Field label="Channel" hint={saved ? "Changing channel changes which fields are required" : undefined}>
                <Select
                  value={d.channel}
                  onChange={(e) => {
                    const ch = e.target.value as TemplateChannel;
                    set("channel", ch);
                    if (ch === "linkedin") {
                      setTab("text");
                      setFocused("text");
                    }
                  }}
                  options={TEMPLATE_CHANNELS.map((c) => ({ value: c, label: cap(c) }))}
                />
              </Field>
              <Field label="Category">
                <Select
                  value={d.category}
                  onChange={(e) => set("category", e.target.value as TemplateCategory)}
                  options={TEMPLATE_CATEGORIES.map((c) => ({ value: c, label: cap(c) }))}
                />
              </Field>
            </div>

            {isEmail ? (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Subject" required>
                  <Input
                    value={d.subject}
                    onFocus={focus("subject")}
                    onChange={(e) => set("subject", e.target.value)}
                    placeholder="A quick idea for {{company|your hotel}}"
                  />
                </Field>
                <Field label="Preheader" hint="Inbox preview line">
                  <Input
                    value={d.preheader}
                    onFocus={focus("preheader")}
                    onChange={(e) => set("preheader", e.target.value)}
                  />
                </Field>
              </div>
            ) : null}
          </Card>

          <Card pad={false} className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#d8c3a5]/45 bg-[#f3e8d5]/45 px-4 py-2.5">
              {isEmail ? (
                <Chips<"html" | "text">
                  value={tab}
                  onChange={(t) => {
                    setTab(t);
                    setFocused(t);
                  }}
                  options={[
                    { value: "html", label: "HTML" },
                    { value: "text", label: "Plain text" },
                  ]}
                  ariaLabel="Body format"
                />
              ) : (
                <SectionLabel>Message</SectionLabel>
              )}
              <span
                className={`font-sans-luxury text-[11px] ${
                  !isEmail && charCount > LINKEDIN_LIMIT ? "font-bold text-[#a3231b]" : "text-[#8b8178]"
                }`}
              >
                {isEmail
                  ? tab === "html"
                    ? `${d.html.length} chars`
                    : d.text
                      ? `${d.text.length} chars`
                      : "empty — derived from HTML on save"
                  : `${charCount} / ${LINKEDIN_LIMIT}`}
              </span>
            </div>

            {isEmail && tab === "html" ? (
              <textarea
                value={d.html}
                onFocus={focus("html")}
                onChange={(e) => set("html", e.target.value)}
                rows={18}
                spellCheck={false}
                placeholder={"<p>Hi {{first_name|there}},</p>\n<p>…</p>\n<p><a href=\"{{unsubscribe_url}}\">Unsubscribe</a></p>"}
                className="w-full resize-y bg-transparent px-4 py-3 font-mono text-[12.5px] leading-[1.6] text-[#11100e] outline-none placeholder:text-[#b3a897]"
              />
            ) : (
              <textarea
                value={d.text}
                onFocus={focus("text")}
                onChange={(e) => set("text", e.target.value)}
                rows={18}
                placeholder={
                  isEmail
                    ? "Plain-text alternative. Leave empty to derive it from the HTML."
                    : "Hi {{first_name}}, loved what {{company}} is doing in {{city|your city}}…"
                }
                className="w-full resize-y bg-transparent px-4 py-3 font-sans-luxury text-[13.5px] leading-[1.65] text-[#11100e] outline-none placeholder:text-[#b3a897]"
              />
            )}
          </Card>

          <Card>
            <SectionLabel>Merge fields — click to insert</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {MERGE_FIELDS.filter((f) => isEmail || !["unsubscribe_url", "sender_email"].includes(f.key)).map((f) => (
                <button
                  key={f.key}
                  type="button"
                  title={f.hint}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insert(f.key)}
                  className="cursor-pointer rounded-full border border-[#d8c3a5] bg-white/60 px-2.5 py-1 font-mono text-[11px] text-[#741a14] transition-colors hover:border-[#741a14]/60 hover:bg-[#741a14]/8"
                >
                  {`{{${f.key}}}`}
                </button>
              ))}
            </div>
            <p className="mt-2 font-sans-luxury text-[11px] italic text-[#a2988b]">
              Fallbacks: <code className="font-mono not-italic">{"{{company|your team}}"}</code>. Custom lead fields are{" "}
              <code className="font-mono not-italic">{"{{custom_<name>}}"}</code>.
            </p>
          </Card>

          {problem ? (
            <p role="alert" className="font-sans-luxury text-[12.5px] text-[#a3231b]">
              {problem}
            </p>
          ) : null}
        </div>

        {/* ——— right: preview + test send ——— */}
        <div className="space-y-4">
          <Preview saved={saved} dirty={dirty} isEmail={isEmail} />
          {saved ? <TestSend template={saved} dirty={dirty} show={show} /> : null}
        </div>
      </div>
    </>
  );
}

/* ————— live preview ————— */

function Preview({ saved, dirty, isEmail }: { saved: EmailTemplate | null; dirty: boolean; isEmail: boolean }) {
  const api = useApi();
  const [sample, setSample] = useState<Record<string, string>>(SAMPLE_DEFAULT);
  const [leadId, setLeadId] = useState("");
  const [result, setResult] = useState<RenderResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"html" | "text">(isEmail ? "html" : "text");
  const debouncedSample = useDebounced(sample, 400);
  const debouncedLead = useDebounced(leadId.trim(), 400);

  const render = useCallback(async () => {
    if (!saved) return;
    setLoading(true);
    try {
      const body = debouncedLead ? { leadId: debouncedLead, sample: debouncedSample } : { sample: debouncedSample };
      const r = await api.request<RenderResult>("POST", `/templates/${saved.id}/render`, body);
      setResult(r);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not render.");
    } finally {
      setLoading(false);
    }
  }, [api, saved, debouncedSample, debouncedLead]);

  useEffect(() => {
    void render();
  }, [render]);

  useEffect(() => {
    setMode(isEmail ? "html" : "text");
  }, [isEmail]);

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <SectionLabel>Preview</SectionLabel>
        {saved && isEmail ? (
          <Chips<"html" | "text">
            value={mode}
            onChange={setMode}
            options={[
              { value: "html", label: "HTML" },
              { value: "text", label: "Text" },
            ]}
          />
        ) : null}
      </div>

      {!saved ? (
        <p className="py-8 text-center font-sans-luxury text-[13px] text-[#a2988b]">
          Save the template to preview it — the preview is rendered by the server from the saved version.
        </p>
      ) : (
        <>
          {dirty ? (
            <Notice>Unsaved changes — the preview shows the last saved version.</Notice>
          ) : null}

          <details className="mb-3 rounded-[8px] border border-[#d8c3a5]/60 bg-[#f3e8d5]/40 px-3 py-2">
            <summary className="cursor-pointer font-sans-luxury text-[11px] font-bold uppercase tracking-[0.14em] text-[#8b8178]">
              Sample data
            </summary>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {Object.keys(SAMPLE_DEFAULT).map((k) => (
                <Field key={k} label={k}>
                  <Input value={sample[k] ?? ""} onChange={(e) => setSample((s) => ({ ...s, [k]: e.target.value }))} />
                </Field>
              ))}
              <Field label="or a lead id" hint="renders with that lead's real data" className="col-span-2">
                <Input value={leadId} onChange={(e) => setLeadId(e.target.value)} placeholder="paste a lead id" />
              </Field>
            </div>
          </details>

          <ErrorText>{error}</ErrorText>

          {result ? (
            <>
              {result.missing.length ? (
                <Notice>
                  Fields with no value and no fallback render empty: {result.missing.map((m) => `{{${m}}}`).join(", ")}
                </Notice>
              ) : null}
              {isEmail && result.subject !== undefined ? (
                <p className="mb-2 font-sans-luxury text-[13px] text-[#11100e]">
                  <span className="font-bold uppercase tracking-[0.12em] text-[10px] text-[#8b8178]">Subject </span>
                  {result.subject || <span className="text-[#c3b8a8]">(empty)</span>}
                </p>
              ) : null}
              {mode === "html" && isEmail ? (
                <iframe
                  title="Rendered email"
                  sandbox=""
                  srcDoc={result.html ?? ""}
                  className={`h-[460px] w-full rounded-[8px] border border-[#d8c3a5]/60 bg-white ${loading ? "opacity-60" : ""}`}
                />
              ) : (
                <pre
                  className={`max-h-[460px] overflow-auto whitespace-pre-wrap rounded-[8px] border border-[#d8c3a5]/60 bg-white px-4 py-3 font-sans-luxury text-[13px] leading-[1.6] text-[#11100e] ${
                    loading ? "opacity-60" : ""
                  }`}
                >
                  {result.text || "(empty)"}
                </pre>
              )}
            </>
          ) : loading ? (
            <Spinner label="Rendering…" />
          ) : null}
        </>
      )}
    </Card>
  );
}

/* ————— test send ————— */

function TestSend({
  template,
  dirty,
  show,
}: {
  template: EmailTemplate;
  dirty: boolean;
  show: (text: string, bad?: boolean) => void;
}) {
  const api = useApi();
  const { busy, run } = useAction(show);
  const [to, setTo] = useState("");
  const [leadId, setLeadId] = useState("");
  const [result, setResult] = useState<TestSendResult | null>(null);

  if (template.channel !== "email") {
    return (
      <Card>
        <SectionLabel>Send test</SectionLabel>
        <p className="font-sans-luxury text-[12.5px] text-[#8b8178]">
          LinkedIn messages are sent by hand from the Outreach screen — there is nothing to test-send.
        </p>
      </Card>
    );
  }

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim());

  return (
    <Card>
      <SectionLabel>Send a test</SectionLabel>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="To" className="min-w-[220px] flex-1">
          <Input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="you@maplestudios.co.in" />
        </Field>
        <Field label="Lead id (optional)" className="w-[180px]">
          <Input value={leadId} onChange={(e) => setLeadId(e.target.value)} placeholder="renders with their data" />
        </Field>
        <Btn
          variant="primary"
          disabled={!valid || busy === "send"}
          onClick={() =>
            run("send", async () => {
              const r = await api.request<TestSendResult>("POST", `/templates/${template.id}/test-send`, {
                to: to.trim(),
                ...(leadId.trim() ? { leadId: leadId.trim() } : {}),
              });
              setResult(r);
              markDryRun(r.dryRun);
              show(r.dryRun ? "Dry run — nothing was actually sent" : `Test sent to ${to.trim()}`);
            })
          }
        >
          <Send size={12} /> {busy === "send" ? "Sending…" : "Send test"}
        </Btn>
      </div>
      {dirty ? (
        <p className="mt-2 font-sans-luxury text-[11px] italic text-[#a2988b]">
          Unsaved changes are not included — save first to test the latest version.
        </p>
      ) : null}

      {result ? (
        <div className="mt-3">
          {result.dryRun ? (
            <Notice>
              <strong>Dry run — nothing was sent.</strong> RESEND_API_KEY is a placeholder, so the mail provider only
              logged the rendered message on the server. Campaigns would behave the same way until a real key is set.
            </Notice>
          ) : (
            <Notice tone="green">
              <strong>Sent</strong> to {to.trim()}
              {result.providerId ? ` · provider id ${result.providerId}` : ""}
            </Notice>
          )}
        </div>
      ) : null}
    </Card>
  );
}
