"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Eye, Pause, Pencil, Play, Plus, Send, Square, Trash2 } from "lucide-react";

import { EmptyState, StatCard } from "../AdminShell";
import { Badge, Btn, Card, Confirm, Field, Input, Modal, PageHead, SectionLabel, Select, Spinner, Table, Td, Tr, useToast } from "../cms/ui";
import { useAction, useApi, useItem, useList } from "./api";
import CampaignComposer from "./CampaignComposer";
import { describe } from "./Segments";
import { Chips, ErrorText, Kv, Muted, Notice, Pager, cap, fmtIst, growthTone, markDryRun, wasDryRun } from "./shared";
import {
  CAMPAIGN_STATUSES,
  MESSAGE_STATUSES,
  type Campaign,
  type CampaignMessage,
  type CampaignPreview,
  type CampaignStatus,
  type EmailTemplate,
  type Segment,
  type TestSendResult,
} from "./types";

/**
 * Email sequences. The list shows status and the headline numbers; the
 * detail has the stats, the controls, the queue, and — whenever the mail
 * provider is known to be in dry-run — a banner saying so, because a
 * campaign that "ran" without a real key sent nothing.
 */
export default function Campaigns() {
  const { show, node: toast } = useToast();
  const [status, setStatus] = useState<"" | CampaignStatus>("");
  const list = useList<Campaign>("/campaigns", { status: status || undefined, limit: 100 });
  const [openId, setOpenId] = useState<string | null>(null);
  const [composing, setComposing] = useState<Campaign | "new" | null>(null);

  if (openId) {
    return (
      <>
        <CampaignDetail
          id={openId}
          onBack={() => {
            setOpenId(null);
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
        title="Campaigns"
        sub="Scheduled email sequences to a segment, a filter, or hand-picked leads — paced by a daily cap inside a send window."
        action={
          <Btn variant="primary" onClick={() => setComposing("new")}>
            <Plus size={13} /> New campaign
          </Btn>
        }
      />

      <div className="mb-4">
        <Chips<"" | CampaignStatus>
          value={status}
          onChange={setStatus}
          options={[{ value: "", label: "All" }, ...CAMPAIGN_STATUSES.map((s) => ({ value: s, label: cap(s) }))]}
          ariaLabel="Status"
        />
      </div>

      <ErrorText>{list.error}</ErrorText>

      {list.loading ? (
        <Spinner />
      ) : list.items.length === 0 ? (
        <EmptyState>{status ? `No ${status} campaigns.` : "No campaigns yet — compose the first sequence."}</EmptyState>
      ) : (
        <Table head={["Campaign", "Status", "Recipients", "Sent", "Delivered", "Bounced", "Replied", "Starts", "Actions"]}>
          {list.items.map((c) => (
            <Tr key={c.id}>
              <Td>
                <button
                  onClick={() => setOpenId(c.id)}
                  className="cursor-pointer text-left font-medium text-[#11100e] hover:text-[#741a14]"
                >
                  {c.name}
                </button>
                <span className="block text-[11px] text-[#8b8178]">
                  {c.steps.length} step{c.steps.length === 1 ? "" : "s"} · from {c.from.email}
                </span>
              </Td>
              <Td>
                <Badge tone={growthTone(c.status)}>{c.status}</Badge>
              </Td>
              <Td>{c.stats.recipients}</Td>
              <Td>{c.stats.sent}</Td>
              <Td>{c.stats.delivered}</Td>
              <Td>{c.stats.bounced}</Td>
              <Td>{c.stats.replied}</Td>
              <Td className="whitespace-nowrap text-[#8b8178]">{fmtIst(c.schedule.startAt)}</Td>
              <Td className="whitespace-nowrap text-right">
                <div className="flex items-center justify-end gap-1.5">
                  {c.status === "draft" || c.status === "scheduled" ? (
                    <button
                      aria-label="Edit"
                      onClick={() => setComposing(c)}
                      className="cursor-pointer rounded-full p-1.5 text-[#8b8178] transition-colors hover:bg-[#741a14]/10 hover:text-[#741a14]"
                    >
                      <Pencil size={14} />
                    </button>
                  ) : null}
                  <Btn onClick={() => setOpenId(c.id)}>Open</Btn>
                </div>
              </Td>
            </Tr>
          ))}
        </Table>
      )}

      {composing ? (
        <CampaignComposer
          campaign={composing === "new" ? null : composing}
          onClose={() => setComposing(null)}
          onSaved={(c) => {
            setComposing(null);
            void list.reload();
            setOpenId(c.id);
          }}
          show={show}
        />
      ) : null}

      {toast}
    </>
  );
}

/* ————— detail ————— */

function CampaignDetail({
  id,
  onBack,
  show,
}: {
  id: string;
  onBack: () => void;
  show: (text: string, bad?: boolean) => void;
}) {
  const api = useApi();
  const { busy, run } = useAction(show);
  const { item: c, loading, error, setItem, reload } = useItem<Campaign>(`/campaigns/${id}`);
  const [msgStatus, setMsgStatus] = useState("");
  const [page, setPage] = useState(1);
  const messages = useList<CampaignMessage>(`/campaigns/${id}/messages`, {
    status: msgStatus || undefined,
    page,
    limit: 50,
  });
  const templates = useList<EmailTemplate>("/templates", { limit: 200 });
  const segments = useList<Segment>("/segments");
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState<"delete" | "cancel" | null>(null);
  const [preview, setPreview] = useState<CampaignPreview | null | "loading">(null);
  const [testTo, setTestTo] = useState("");
  const [testResult, setTestResult] = useState<TestSendResult | null>(null);
  const [sessionDry, setSessionDry] = useState(false);
  useEffect(() => setSessionDry(wasDryRun()), []);

  const dryRun =
    sessionDry ||
    testResult?.dryRun === true ||
    messages.items.some((m) => (m.providerMessageId ?? "").startsWith("dry-"));

  const act = (verb: "start" | "pause" | "resume" | "cancel", done: string) =>
    run(
      verb,
      async () => {
        const res = await api.request<{ item: Campaign }>("POST", `/campaigns/${id}/${verb}`);
        setItem(res.item);
        void messages.reload();
      },
      done
    );

  const del = () =>
    run(
      "delete",
      async () => {
        await api.request("DELETE", `/campaigns/${id}`);
        onBack();
      },
      "Campaign deleted"
    );

  const loadPreview = () =>
    run("preview", async () => {
      setPreview("loading");
      try {
        setPreview(await api.request<CampaignPreview>("GET", `/campaigns/${id}/preview?limit=3`));
      } catch (e) {
        setPreview(null);
        throw e;
      }
    });

  const templateName = (tid: string) => templates.items.find((t) => t.id === tid)?.name ?? tid;

  const audience = useMemo(() => {
    if (!c) return "";
    const a = c.audience;
    if ("segmentId" in a) {
      const s = segments.items.find((x) => x.id === a.segmentId);
      return s ? `Segment “${s.name}” — ${describe(s.filter)}` : `Segment ${a.segmentId}`;
    }
    if ("leadIds" in a) return `${a.leadIds.length} hand-picked lead${a.leadIds.length === 1 ? "" : "s"}`;
    return `Filter — ${describe(a.filter)}`;
  }, [c, segments.items]);

  const firstTemplate = c?.steps[0]?.templateId;
  const validTest = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testTo.trim());

  if (loading && !c) return <Spinner />;
  if (!c) {
    return (
      <>
        <Btn onClick={onBack}>
          <ArrowLeft size={12} /> All campaigns
        </Btn>
        <div className="mt-4">
          <ErrorText>{error ?? "Campaign not found."}</ErrorText>
        </div>
      </>
    );
  }

  const editable = c.status === "draft" || c.status === "scheduled";
  const deletable = c.status === "draft" || c.status === "cancelled" || c.status === "completed";

  return (
    <>
      <PageHead
        title={c.name}
        sub={`${cap(c.status)} · from ${c.from.name} <${c.from.email}> · created ${fmtIst(c.createdAt)}`}
        action={
          <>
            <Btn onClick={onBack}>
              <ArrowLeft size={12} /> All campaigns
            </Btn>
            {editable ? (
              <Btn onClick={() => setEditing(true)} disabled={busy !== null}>
                <Pencil size={12} /> Edit
              </Btn>
            ) : null}
            {editable ? (
              <Btn variant="primary" onClick={() => act("start", "Campaign started")} disabled={busy !== null}>
                <Play size={12} /> {busy === "start" ? "Starting…" : "Start"}
              </Btn>
            ) : null}
            {c.status === "running" ? (
              <Btn onClick={() => act("pause", "Paused")} disabled={busy !== null}>
                <Pause size={12} /> Pause
              </Btn>
            ) : null}
            {c.status === "paused" ? (
              <Btn variant="primary" onClick={() => act("resume", "Resumed")} disabled={busy !== null}>
                <Play size={12} /> Resume
              </Btn>
            ) : null}
            {c.status === "running" || c.status === "paused" || c.status === "scheduled" ? (
              <Btn variant="danger" onClick={() => setConfirming("cancel")} disabled={busy !== null}>
                <Square size={12} /> Cancel
              </Btn>
            ) : null}
            {deletable ? (
              <Btn variant="quiet" onClick={() => setConfirming("delete")} disabled={busy !== null}>
                <Trash2 size={12} /> Delete
              </Btn>
            ) : null}
          </>
        }
      />

      {dryRun ? (
        <Notice>
          <strong>Dry-run mode — RESEND_API_KEY is a placeholder.</strong> Messages are rendered and marked sent with a{" "}
          <code className="rounded bg-white/60 px-1">dry-</code> provider id, but nothing reaches an inbox until a real key is
          configured on the server.
        </Notice>
      ) : null}

      <div className="grid grid-cols-3 gap-3 lg:grid-cols-5">
        <StatCard label="Recipients" value={c.stats.recipients} tone="maroon" />
        <StatCard label="Queued" value={c.stats.queued} />
        <StatCard label="Sent" value={c.stats.sent} />
        <StatCard label="Delivered" value={c.stats.delivered} />
        <StatCard label="Replied" value={c.stats.replied} />
        <StatCard label="Bounced" value={c.stats.bounced} />
        <StatCard label="Complained" value={c.stats.complained} />
        <StatCard label="Unsubscribed" value={c.stats.unsubscribed} />
        <StatCard label="Failed" value={c.stats.failed} />
        <StatCard
          label="Progress"
          value={c.stats.recipients ? `${Math.round((c.stats.sent / c.stats.recipients) * 100)}%` : "—"}
          hint={c.startedAt ? `started ${fmtIst(c.startedAt)}` : "not started"}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <SectionLabel>Set-up</SectionLabel>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Kv label="Audience">{audience}</Kv>
            <Kv label="Reply-to">{c.replyTo ?? c.from.email}</Kv>
            <Kv label="Schedule">
              Starts {fmtIst(c.schedule.startAt)} · {c.schedule.dailyCap}/day · {c.schedule.window.start}–{c.schedule.window.end}{" "}
              {c.schedule.timezone}
              {c.schedule.weekdaysOnly ? " · weekdays only" : ""}
            </Kv>
            <Kv label="Steps">
              <ol className="list-decimal pl-4">
                {c.steps.map((s, i) => (
                  <li key={i}>
                    {templateName(s.templateId)}
                    {i > 0 ? ` — ${s.delayDays} day${s.delayDays === 1 ? "" : "s"} later` : " — at start"}
                    {s.stopIfReplied ? "" : " · continues after a reply"}
                  </li>
                ))}
              </ol>
            </Kv>
            {c.completedAt ? <Kv label="Completed">{fmtIst(c.completedAt)}</Kv> : null}
          </dl>
          <div className="mt-4">
            <Btn onClick={loadPreview} disabled={busy === "preview"}>
              <Eye size={12} /> {busy === "preview" ? "Rendering…" : "Preview 3 samples"}
            </Btn>
          </div>
        </Card>

        <Card>
          <SectionLabel>Send a test of step 1</SectionLabel>
          {!firstTemplate ? (
            <Muted>Add a step first.</Muted>
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-2">
                <Field label="To" className="min-w-[200px] flex-1">
                  <Input type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@…" />
                </Field>
                <Btn
                  variant="primary"
                  disabled={!validTest || busy === "test"}
                  onClick={() =>
                    run("test", async () => {
                      const r = await api.request<TestSendResult>("POST", `/templates/${firstTemplate}/test-send`, {
                        to: testTo.trim(),
                      });
                      setTestResult(r);
                      markDryRun(r.dryRun);
                      show(r.dryRun ? "Dry run — nothing was actually sent" : `Test sent to ${testTo.trim()}`);
                    })
                  }
                >
                  <Send size={12} /> {busy === "test" ? "Sending…" : "Send test"}
                </Btn>
              </div>
              <p className="mt-2 font-sans-luxury text-[11px] italic text-[#a2988b]">
                Uses the template as saved, with sample data — the campaign&apos;s own from address is not applied to tests.
              </p>
              {testResult ? (
                <div className="mt-3">
                  {testResult.dryRun ? (
                    <Notice>
                      <strong>Dry run — nothing was sent.</strong> The server logged the rendered message instead.
                    </Notice>
                  ) : (
                    <Notice tone="green">
                      <strong>Sent</strong>
                      {testResult.providerId ? ` · provider id ${testResult.providerId}` : ""}
                    </Notice>
                  )}
                </div>
              ) : null}
            </>
          )}
        </Card>
      </div>

      {/* ——— messages ——— */}
      <div className="mt-6 mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif-luxury text-[22px] leading-none text-[#11100e]">Messages</h2>
        <div className="flex items-center gap-2">
          <Muted>{messages.meta ? `${messages.meta.total} total` : ""}</Muted>
          <div className="w-[170px]">
            <Select
              aria-label="Message status"
              value={msgStatus}
              onChange={(e) => {
                setMsgStatus(e.target.value);
                setPage(1);
              }}
              options={[{ value: "", label: "All statuses" }, ...MESSAGE_STATUSES.map((s) => ({ value: s, label: cap(s) }))]}
            />
          </div>
          <Btn onClick={() => void Promise.all([messages.reload(), reload()])}>Refresh</Btn>
        </div>
      </div>
      <ErrorText>{messages.error}</ErrorText>
      {messages.loading ? (
        <Spinner />
      ) : (
        <>
          <Table
            head={["Lead", "Step", "Status", "Scheduled", "Sent", "Provider id", "Error"]}
            empty={c.status === "draft" ? "Nothing is queued until the campaign starts." : "No messages match."}
          >
            {messages.items.map((m) => {
              const email = m.lead?.email ?? m.leadEmail ?? "";
              const name = m.lead
                ? (m.lead.name ?? [m.lead.firstName, m.lead.lastName].filter(Boolean).join(" "))
                : (m.leadName ?? "");
              return (
                <Tr key={m.id}>
                  <Td>
                    <span className="block">{email || m.leadId}</span>
                    {name ? <span className="block text-[11px] text-[#8b8178]">{name}</span> : null}
                  </Td>
                  <Td>{m.step + 1}</Td>
                  <Td>
                    <Badge tone={growthTone(m.status)}>{m.status}</Badge>
                  </Td>
                  <Td className="whitespace-nowrap text-[#8b8178]">{fmtIst(m.scheduledFor)}</Td>
                  <Td className="whitespace-nowrap text-[#8b8178]">{m.sentAt ? fmtIst(m.sentAt) : "—"}</Td>
                  <Td>
                    <span className="font-mono text-[11px] text-[#8b8178]">
                      {m.providerMessageId ?? "—"}
                      {(m.providerMessageId ?? "").startsWith("dry-") ? (
                        <span className="ml-1.5 inline-block">
                          <Badge tone="accent">dry run</Badge>
                        </span>
                      ) : null}
                    </span>
                  </Td>
                  <Td>
                    <span className="line-clamp-2 max-w-[260px] text-[#a3231b]">{m.error ?? ""}</span>
                  </Td>
                </Tr>
              );
            })}
          </Table>
          <Pager meta={messages.meta} page={page} onPage={setPage} />
        </>
      )}

      {editing ? (
        <CampaignComposer
          campaign={c}
          onClose={() => setEditing(false)}
          onSaved={(next) => {
            setEditing(false);
            setItem(next);
            void messages.reload();
          }}
          show={show}
        />
      ) : null}

      {preview ? (
        <Modal title="Rendered samples" onClose={() => setPreview(null)} wide>
          {preview === "loading" ? (
            <Spinner label="Rendering…" />
          ) : (
            <>
              <Muted>
                {preview.recipients} recipient{preview.recipients === 1 ? "" : "s"} resolve from the audience right now.
              </Muted>
              {preview.samples.length === 0 ? (
                <p className="py-8 text-center font-sans-luxury text-[13px] text-[#a2988b]">No samples — the audience is empty.</p>
              ) : (
                <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
                  {preview.samples.map((s) => (
                    <div key={s.leadId} className="overflow-hidden rounded-[8px] border border-[#d8c3a5]/60 bg-white/70">
                      <div className="border-b border-[#d8c3a5]/45 bg-[#f3e8d5]/40 px-3 py-2">
                        <p className="truncate font-sans-luxury text-[11px] text-[#8b8178]">to {s.email}</p>
                        <p className="truncate font-sans-luxury text-[12.5px] font-medium text-[#11100e]" title={s.subject}>
                          {s.subject}
                        </p>
                      </div>
                      <iframe title={`Sample for ${s.email}`} sandbox="" srcDoc={s.html} className="h-[320px] w-full bg-white" />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </Modal>
      ) : null}

      {confirming === "delete" ? (
        <Confirm
          title="Delete this campaign?"
          body={`"${c.name}" and its message history will be removed permanently.`}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            setConfirming(null);
            void del();
          }}
        />
      ) : null}

      {confirming === "cancel" ? (
        <Confirm
          title="Cancel this campaign?"
          body="Every queued message is cancelled. Messages already sent are unaffected. This cannot be resumed."
          confirmLabel="Cancel campaign"
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            setConfirming(null);
            void act("cancel", "Campaign cancelled");
          }}
        />
      ) : null}
    </>
  );
}
