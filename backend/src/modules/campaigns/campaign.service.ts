import crypto from "node:crypto";
import { DateTime } from "luxon";
import type { Types } from "mongoose";
import type { z } from "zod";
import {
  Campaign,
  TERMINAL_CAMPAIGN_STATUSES,
  type CampaignAudience,
  type CampaignDoc,
  type CampaignSchedule,
  type CampaignStats,
  type CampaignStatus,
  type CampaignStep,
} from "./campaign.model.js";
import {
  CampaignMessage,
  OPEN_MESSAGE_STATUSES,
  SENT_MESSAGE_STATUSES,
  messageWire,
  newMessage,
  type CampaignMessageDoc,
  type MessageStatus,
} from "./message.model.js";
import { Suppression, isSuppressed, suppress, type SuppressionReason } from "./suppression.model.js";
import type { createCampaignSchema, patchCampaignSchema } from "./campaign.schema.js";
import {
  appendLeadActivities,
  findLeadsForAudience,
  isMailable,
  leadSummaries,
  markLeadContacted,
  markLeadSuppressed,
  markLeadUnsubscribed,
  resolveAudience,
  setLeadSuppressedByEmail,
} from "./campaign.leads.js";
import { EmailTemplate } from "../templates/template.model.js";
import { previewUnsubscribeUrl, renderWith, senderContext } from "../templates/template.service.js";
import { Lead, CLOSED_STAGES, type LeadDoc } from "../leads/lead.model.js";
import { Segment } from "../leads/segment.model.js";
import { AppError } from "../../lib/AppError.js";
import { env } from "../../config/env.js";
import { readSignedId, safeEqual } from "../../lib/crypto.js";
import { logger } from "../../lib/logger.js";
import { getMailProvider, type MailProvider } from "../../lib/mail/provider.js";
import { leadContext } from "../../lib/merge.js";
import { registerTick } from "../../lib/scheduler.js";

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type PatchCampaignInput = z.infer<typeof patchCampaignSchema>;

/** A provider failure is retried twice (15 minutes apart); the third is final. */
export const MAX_SEND_ATTEMPTS = 3;
export const RETRY_DELAY_MS = 15 * 60_000;
/** A message still "sending" this long after its last write was interrupted. */
const STUCK_SENDING_MS = 10 * 60_000;
/** Svix rejects replayed deliveries older than this; so do we. */
const WEBHOOK_TOLERANCE_S = 5 * 60;

const EDITABLE_STATUSES: readonly CampaignStatus[] = ["draft", "scheduled"];
const DELETABLE_STATUSES: readonly CampaignStatus[] = ["draft", "cancelled", "completed"];

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const unsubscribeUrlFor = (token: string) => `${env.PUBLIC_BASE_URL}/unsubscribe/${token}`;

// --- references -----------------------------------------------------------

/** Every step must point at an existing email template; a LinkedIn template
    has nothing an email send could use. */
async function assertTemplates(steps: Array<{ templateId: string }>): Promise<void> {
  const ids = [...new Set(steps.map((s) => s.templateId))];
  const found = await EmailTemplate.find({ _id: { $in: ids } }).select("channel").exec();
  const byId = new Map(found.map((t) => [String(t._id), t]));
  const issues = steps.flatMap((s, i) => {
    const t = byId.get(s.templateId);
    if (!t) return [{ field: `steps.${i}.templateId`, message: "That template does not exist." }];
    if (t.channel !== "email") return [{ field: `steps.${i}.templateId`, message: "Campaign steps need email templates." }];
    return [];
  });
  if (issues.length) throw AppError.badRequest("Some fields need attention.", issues);
}

async function assertAudience(audience: CampaignAudience): Promise<void> {
  if (audience.segmentId && !(await Segment.exists({ _id: audience.segmentId }).exec())) {
    throw AppError.badRequest("Some fields need attention.", [
      { field: "audience.segmentId", message: "That segment does not exist." },
    ]);
  }
}

const toSchedule = (s: CreateCampaignInput["schedule"]): CampaignSchedule => ({ ...s, startAt: new Date(s.startAt) });

// --- CRUD -----------------------------------------------------------------

export async function createCampaign(input: CreateCampaignInput) {
  await Promise.all([assertTemplates(input.steps), assertAudience(input.audience)]);
  return Campaign.create({ ...input, status: "draft", schedule: toSchedule(input.schedule) });
}

export interface ListOptions {
  status?: CampaignStatus;
  q?: string;
  page: number;
  limit: number;
}

export async function listCampaigns({ status, q, page, limit }: ListOptions) {
  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;
  if (q) filter.name = { $regex: escapeRegex(q), $options: "i" };
  const [items, total] = await Promise.all([
    Campaign.find(filter)
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec(),
    Campaign.countDocuments(filter).exec(),
  ]);
  return { items, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) };
}

export async function getCampaign(id: string | Types.ObjectId): Promise<CampaignDoc> {
  const doc = await Campaign.findById(id).exec();
  if (!doc) throw AppError.notFound("That campaign no longer exists.");
  return doc;
}

export async function updateCampaign(id: string, patch: PatchCampaignInput) {
  const campaign = await getCampaign(id);
  if (!EDITABLE_STATUSES.includes(campaign.status)) {
    throw AppError.conflict("Only draft campaigns can be edited. Pause or cancel a running one instead.");
  }
  if (patch.steps) await assertTemplates(patch.steps);
  if (patch.audience) await assertAudience(patch.audience);
  campaign.set({ ...patch, ...(patch.schedule ? { schedule: toSchedule(patch.schedule) } : {}) });
  await campaign.save();
  return campaign;
}

export async function deleteCampaign(id: string): Promise<void> {
  const campaign = await getCampaign(id);
  if (!DELETABLE_STATUSES.includes(campaign.status)) {
    throw AppError.conflict("Cancel the campaign before deleting it.");
  }
  await CampaignMessage.deleteMany({ campaignId: campaign._id }).exec();
  await campaign.deleteOne();
}

// --- lifecycle ------------------------------------------------------------

/**
 * Enrol the audience: one step-0 message per eligible lead not already in the
 * campaign, due at startAt or right now, whichever is later. Returns how many
 * joined.
 */
async function enrol(campaign: CampaignDoc, now: Date): Promise<number> {
  const leads = await findLeadsForAudience(campaign.audience);
  const already = new Set(
    (await CampaignMessage.distinct("leadId", { campaignId: campaign._id }).exec()).map(String)
  );
  const fresh = leads.filter((l) => !already.has(String(l._id)));
  if (fresh.length === 0) return 0;

  const scheduledFor = campaign.schedule.startAt > now ? campaign.schedule.startAt : now;
  await CampaignMessage.insertMany(
    fresh.map((l) => newMessage({ campaignId: campaign._id, leadId: l._id, step: 0, scheduledFor }))
  );
  await appendLeadActivities(
    fresh.map((l) => ({
      leadId: l._id,
      type: "email_queued" as const,
      summary: `Queued for campaign "${campaign.name}"`,
      ref: String(campaign._id),
    })),
    now
  );
  return fresh.length;
}

export async function startCampaign(id: string, now = new Date()) {
  const campaign = await getCampaign(id);
  if (!EDITABLE_STATUSES.includes(campaign.status)) {
    throw AppError.conflict(`A ${campaign.status} campaign cannot be started.`);
  }
  const joined = await enrol(campaign, now);
  if (joined === 0 && !(await CampaignMessage.exists({ campaignId: campaign._id }).exec())) {
    throw AppError.badRequest(
      "Nobody in this audience can be emailed - check for missing addresses, unsubscribes and the suppression list."
    );
  }
  campaign.status = "running";
  campaign.startedAt ??= now;
  await campaign.save();
  await syncCampaignStats(campaign._id);
  return getCampaign(id);
}

/** Atomic status move; explains itself with the current status when it cannot. */
async function transition(id: string, from: readonly CampaignStatus[], to: CampaignStatus, verb: string) {
  const updated = await Campaign.findOneAndUpdate(
    { _id: id, status: { $in: [...from] } },
    { $set: { status: to } },
    { new: true }
  ).exec();
  if (updated) return updated;
  const current = await getCampaign(id);
  throw AppError.conflict(`A ${current.status} campaign cannot be ${verb}.`);
}

export const pauseCampaign = (id: string) => transition(id, ["running"], "paused", "paused");
export const resumeCampaign = (id: string) => transition(id, ["paused"], "running", "resumed");

export async function cancelCampaign(id: string) {
  const campaign = await getCampaign(id);
  if (TERMINAL_CAMPAIGN_STATUSES.includes(campaign.status)) {
    throw AppError.conflict(`A ${campaign.status} campaign cannot be cancelled.`);
  }
  await CampaignMessage.updateMany(
    { campaignId: campaign._id, status: "queued" },
    { $set: { status: "cancelled", error: "Campaign cancelled." } }
  ).exec();
  campaign.status = "cancelled";
  await campaign.save();
  await syncCampaignStats(campaign._id);
  return getCampaign(id);
}

// --- read models ----------------------------------------------------------

export async function previewCampaign(id: string, limit: number, now = new Date()) {
  const campaign = await getCampaign(id);
  const step = campaign.steps[0];
  if (!step) throw AppError.badRequest("The campaign has no steps.");
  const template = await EmailTemplate.findById(step.templateId).exec();
  if (!template) throw AppError.notFound("The first step's template no longer exists.");

  const leads = await findLeadsForAudience(campaign.audience);
  const extras = senderContext(campaign.from, previewUnsubscribeUrl(), now, campaign.schedule.timezone);
  const samples = leads.slice(0, limit).map((lead) => {
    const r = renderWith(template, { ...extras, ...leadContext(lead) });
    return { leadId: String(lead._id), email: lead.email, subject: r.subject, html: r.html, text: r.text, missing: r.missing };
  });
  return { recipients: leads.length, samples };
}

/** How many leads the audience names before eligibility - for the composer's live count. */
export async function countAudience(audience: CampaignAudience) {
  const all = await resolveAudience(audience);
  const eligible = await findLeadsForAudience(audience);
  return { matched: all.length, recipients: eligible.length };
}

export interface ListMessagesOptions {
  status?: MessageStatus;
  page: number;
  limit: number;
}

export async function listMessages(campaignId: string, { status, page, limit }: ListMessagesOptions) {
  const campaign = await getCampaign(campaignId);
  const filter = { campaignId: campaign._id, ...(status ? { status } : {}) };
  const [items, total] = await Promise.all([
    CampaignMessage.find(filter)
      .sort({ scheduledFor: 1, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec(),
    CampaignMessage.countDocuments(filter).exec(),
  ]);
  const leads = await leadSummaries(items.map((m) => m.leadId));
  return {
    items: items.map((m) => ({ ...messageWire(m), lead: leads.get(String(m.leadId)) ?? null })),
    total,
    page,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
  };
}

/**
 * Stats are derived from the messages (and the enrolled leads) rather than
 * incremented in place, so a crash between two writes can never leave the
 * tiles lying. Cheap at campaign scale: a handful of counts per call.
 */
export async function syncCampaignStats(campaignId: Types.ObjectId): Promise<CampaignStats> {
  const [byStatus, recipients, leadIds] = await Promise.all([
    CampaignMessage.aggregate<{ _id: MessageStatus; n: number }>([
      { $match: { campaignId } },
      { $group: { _id: "$status", n: { $sum: 1 } } },
    ]).exec(),
    CampaignMessage.countDocuments({ campaignId, step: 0 }).exec(),
    CampaignMessage.distinct("leadId", { campaignId }).exec(),
  ]);
  const count = (...statuses: readonly MessageStatus[]) =>
    byStatus.filter((b) => statuses.includes(b._id)).reduce((sum, b) => sum + b.n, 0);
  const [unsubscribed, replied] = leadIds.length
    ? await Promise.all([
        Lead.countDocuments({ _id: { $in: leadIds }, unsubscribedAt: { $ne: null } }).exec(),
        Lead.countDocuments({ _id: { $in: leadIds }, stage: "replied" }).exec(),
      ])
    : [0, 0];

  const stats: CampaignStats = {
    recipients,
    queued: count(...OPEN_MESSAGE_STATUSES),
    sent: count(...SENT_MESSAGE_STATUSES),
    delivered: count("delivered"),
    bounced: count("bounced"),
    complained: count("complained"),
    unsubscribed,
    replied,
    failed: count("failed"),
  };
  await Campaign.updateOne({ _id: campaignId }, { $set: { stats } }).exec();
  return stats;
}

async function syncStatsForLead(leadId: Types.ObjectId): Promise<void> {
  const campaignIds = await CampaignMessage.distinct("campaignId", { leadId }).exec();
  for (const id of campaignIds) await syncCampaignStats(id);
}

// --- the tick -------------------------------------------------------------

const localTime = (now: Date, zone: string) => DateTime.fromJSDate(now, { zone });

/** Inside the campaign's local send window (and on a weekday, if required). */
export function inSendWindow(schedule: CampaignSchedule, now: Date): boolean {
  const local = localTime(now, schedule.timezone);
  if (!local.isValid) return false;
  if (schedule.weekdaysOnly && local.weekday > 5) return false;
  const hhmm = local.toFormat("HH:mm");
  return hhmm >= schedule.window.start && hhmm < schedule.window.end;
}

async function sentToday(campaignId: Types.ObjectId, schedule: CampaignSchedule, now: Date): Promise<number> {
  const dayStart = localTime(now, schedule.timezone).startOf("day").toJSDate();
  return CampaignMessage.countDocuments({ campaignId, sentAt: { $gte: dayStart, $lte: now } }).exec();
}

type Outcome = "sent" | "skipped" | "dropped" | "provider_error";

async function setMessage(id: Types.ObjectId, update: Record<string, unknown>) {
  await CampaignMessage.updateOne({ _id: id }, update).exec();
}

/** The send-time eligibility check: why this lead must not get this step now, or null. */
function skipReason(lead: LeadDoc | null, step: CampaignStep): string | null {
  if (!lead) return "Lead no longer exists.";
  if (!isMailable(lead)) {
    if (lead.unsubscribedAt || lead.stage === "unsubscribed") return "Lead unsubscribed.";
    if (lead.suppressed) return "Lead is suppressed.";
    return "Lead has no email address.";
  }
  if (lead.stage === "replied") return step.stopIfReplied ? "Lead replied." : null;
  if (CLOSED_STAGES.includes(lead.stage)) return `Lead stage is ${lead.stage}.`;
  return null;
}

/** The step after this one, due the same local time `delayDays` later. */
async function scheduleNextStep(campaign: CampaignDoc, message: CampaignMessageDoc, sentAt: Date): Promise<void> {
  const next = campaign.steps[message.step + 1];
  if (!next) return;
  const scheduledFor = localTime(sentAt, campaign.schedule.timezone).plus({ days: next.delayDays }).toJSDate();
  try {
    await CampaignMessage.create(
      newMessage({ campaignId: campaign._id, leadId: message.leadId, step: message.step + 1, scheduledFor })
    );
  } catch (err) {
    // Already scheduled by an earlier, interrupted pass - the unique index did its job.
    if ((err as { code?: number }).code !== 11000) throw err;
  }
}

async function processMessage(
  campaign: CampaignDoc,
  message: CampaignMessageDoc,
  now: Date,
  provider: MailProvider
): Promise<Outcome> {
  // Claim first: whoever flips queued -> sending owns the message.
  const claimed = await CampaignMessage.findOneAndUpdate(
    { _id: message._id, status: "queued" },
    { $set: { status: "sending" } }
  ).exec();
  if (!claimed) return "skipped";

  const step = campaign.steps[message.step];
  if (!step) {
    await setMessage(message._id, { $set: { status: "skipped", error: "Step no longer exists." } });
    return "skipped";
  }

  const lead = await Lead.findById(message.leadId).exec();
  let reason = skipReason(lead, step);
  // Both lists move between enrolment and now; the suppression list is the
  // one the lead flag can lag behind (a manual add, a bounce elsewhere).
  if (!reason && lead?.email && (await isSuppressed(lead.email))) reason = "Address is on the suppression list.";
  if (reason || !lead?.email) {
    await setMessage(message._id, { $set: { status: "skipped", error: reason ?? "Lead has no email address." } });
    return "skipped";
  }

  const template = await EmailTemplate.findById(step.templateId).exec();
  if (!template) {
    await setMessage(message._id, { $set: { status: "failed", error: "Template no longer exists." } });
    return "dropped";
  }

  const unsubscribeUrl = unsubscribeUrlFor(message.unsubscribeToken);
  const rendered = renderWith(template, {
    ...senderContext(campaign.from, unsubscribeUrl, now, campaign.schedule.timezone),
    ...leadContext(lead),
  });
  const attempts = message.attempts + 1;

  try {
    const { id } = await provider.send({
      to: lead.email,
      from: { name: campaign.from.name, email: campaign.from.email },
      ...(campaign.replyTo ? { replyTo: campaign.replyTo } : {}),
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
    await setMessage(message._id, {
      $set: { status: "sent", sentAt: now, providerMessageId: id, attempts },
      $unset: { error: 1 },
    });
    await markLeadContacted(
      lead._id,
      now,
      `Sent "${rendered.subject}" (${campaign.name}, step ${message.step + 1})`.slice(0, 400),
      String(campaign._id)
    );
    await scheduleNextStep(campaign, message, now);
    return "sent";
  } catch (err) {
    const error = (err instanceof Error ? err.message : String(err)).slice(0, 1000);
    const retry = attempts < MAX_SEND_ATTEMPTS;
    await setMessage(message._id, {
      $set: {
        status: retry ? "queued" : "failed",
        error,
        attempts,
        ...(retry ? { scheduledFor: new Date(now.getTime() + RETRY_DELAY_MS) } : {}),
      },
    });
    logger.warn({ err, messageId: String(message._id), attempts, retry }, "campaigns: provider refused message");
    return "provider_error";
  }
}

/** Send what is due for one campaign, within today's remaining cap. */
async function sendDue(campaign: CampaignDoc, now: Date): Promise<void> {
  const provider = getMailProvider();
  let budget = campaign.schedule.dailyCap - (await sentToday(campaign._id, campaign.schedule, now));
  // Skips do not spend the cap, so refill the batch until the queue or the
  // budget runs out. The round limit is a belt for an unforeseen braces failure.
  for (let round = 0; budget > 0 && round < 50; round++) {
    const due = await CampaignMessage.find({ campaignId: campaign._id, status: "queued", scheduledFor: { $lte: now } })
      .sort({ scheduledFor: 1, _id: 1 })
      .limit(budget)
      .exec();
    if (due.length === 0) return;
    for (const message of due) {
      const outcome = await processMessage(campaign, message, now, provider);
      if (outcome === "sent") budget -= 1;
      // One refusal usually means the provider is unwell; the retry timer
      // handles it better than burning through the rest of the queue.
      if (outcome === "provider_error") return;
    }
  }
}

async function tickCampaign(campaign: CampaignDoc, now: Date): Promise<void> {
  // A send cut off by a restart would otherwise sit in "sending" forever and
  // hold the campaign open. Failing it (not retrying) is the no-duplicate choice.
  await CampaignMessage.updateMany(
    { campaignId: campaign._id, status: "sending", updatedAt: { $lt: new Date(now.getTime() - STUCK_SENDING_MS) } },
    { $set: { status: "failed", error: "Send interrupted; not retried to avoid a duplicate." } }
  ).exec();

  if (inSendWindow(campaign.schedule, now)) await sendDue(campaign, now);

  await syncCampaignStats(campaign._id);
  const open = await CampaignMessage.countDocuments({ campaignId: campaign._id, status: { $in: [...OPEN_MESSAGE_STATUSES] } }).exec();
  if (open === 0) {
    await Campaign.updateOne({ _id: campaign._id, status: "running" }, { $set: { status: "completed", completedAt: now } }).exec();
  }
}

/** One scheduler pass. Campaigns are isolated so one bad one never stalls the rest. */
export async function runCampaignTick(now: Date = new Date()): Promise<void> {
  const running = await Campaign.find({ status: "running" }).sort({ startedAt: 1 }).exec();
  for (const campaign of running) {
    try {
      await tickCampaign(campaign, now);
    } catch (err) {
      logger.error({ err, campaignId: String(campaign._id) }, "campaigns: tick failed");
    }
  }
}

// --- unsubscribe ----------------------------------------------------------

/**
 * Honour an unsubscribe link. True when the token named a real message (the
 * page then says "you're unsubscribed", even on a repeat visit); false for
 * anything forged or stale, which the route turns into a plain 404.
 */
export async function unsubscribeByToken(token: string, now = new Date()): Promise<boolean> {
  const messageId = readSignedId(token);
  if (!messageId || !/^[a-f\d]{24}$/i.test(messageId)) return false;
  const message = await CampaignMessage.findById(messageId).exec();
  if (!message) return false;

  const lead = await Lead.findById(message.leadId).exec();
  if (lead) {
    await markLeadUnsubscribed(lead._id, now, String(message.campaignId));
    if (lead.email) await suppress(lead.email, "unsubscribe");
    await CampaignMessage.updateMany(
      { leadId: lead._id, status: "queued" },
      { $set: { status: "cancelled", error: "Lead unsubscribed." } }
    ).exec();
    await syncStatsForLead(lead._id);
  }
  return true;
}

// --- Resend webhook -------------------------------------------------------

let webhookSecretOverride: string | null | undefined;

/** Tests toggle the secret; pass undefined to go back to the environment. */
export function setResendWebhookSecret(secret: string | null | undefined) {
  webhookSecretOverride = secret;
}

export function resendWebhookSecret(): string | undefined {
  const secret = webhookSecretOverride === undefined ? env.RESEND_WEBHOOK_SECRET : webhookSecretOverride;
  return secret || undefined;
}

export interface SvixHeaders {
  id?: string;
  timestamp?: string;
  signature?: string;
}

/**
 * Svix scheme: HMAC-SHA256 over `${id}.${timestamp}.${body}` with the
 * base64 secret after `whsec_`, compared against any of the space-separated
 * `v1,<base64>` entries (rotation sends two). Stale timestamps are refused
 * so a captured delivery cannot be replayed later.
 */
export function verifySvixSignature(headers: SvixHeaders, rawBody: string, secret: string, now = new Date()): boolean {
  if (!headers.id || !headers.timestamp || !headers.signature) return false;
  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts) || Math.abs(now.getTime() / 1000 - ts) > WEBHOOK_TOLERANCE_S) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = crypto.createHmac("sha256", key).update(`${headers.id}.${headers.timestamp}.${rawBody}`).digest("base64");
  return headers.signature.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    return version === "v1" && Boolean(sig) && safeEqual(sig as string, expected);
  });
}

interface ResendEvent {
  type?: unknown;
  data?: { email_id?: unknown; bounce?: { message?: unknown }; [k: string]: unknown };
}

const str = (v: unknown, max = 400) => (typeof v === "string" ? v.slice(0, max) : undefined);

/** A bounce or complaint ends every conversation with that address. */
async function suppressFromEvent(
  message: CampaignMessageDoc,
  reason: Extract<SuppressionReason, "bounce" | "complaint">,
  note: string | undefined,
  now: Date
) {
  const lead = await Lead.findById(message.leadId).exec();
  if (!lead) return;
  if (lead.email) await suppress(lead.email, reason, note);
  await markLeadSuppressed(
    lead._id,
    reason === "bounce" ? "email_bounced" : "email_complained",
    reason === "bounce" ? `Email bounced${note ? `: ${note}` : ""}` : "Recipient marked the email as spam",
    now,
    String(message.campaignId)
  );
  await CampaignMessage.updateMany(
    { leadId: lead._id, status: "queued" },
    { $set: { status: "cancelled", error: reason === "bounce" ? "Address bounced." : "Recipient complained." } }
  ).exec();
}

const WEBHOOK_HANDLERS: Record<string, (message: CampaignMessageDoc, event: ResendEvent, now: Date) => Promise<void>> = {
  "email.delivered": async (message) => {
    // Only forward from sent: a late "delivered" must not undo a bounce.
    await CampaignMessage.updateOne({ _id: message._id, status: "sent" }, { $set: { status: "delivered" } }).exec();
  },
  "email.bounced": async (message, event, now) => {
    const note = str(event.data?.bounce?.message);
    await setMessage(message._id, { $set: { status: "bounced", ...(note ? { error: note } : {}) } });
    await suppressFromEvent(message, "bounce", note, now);
  },
  "email.complained": async (message, _event, now) => {
    await setMessage(message._id, { $set: { status: "complained" } });
    await suppressFromEvent(message, "complaint", undefined, now);
  },
};

/** Apply one verified Resend event. Unknown types and unknown ids are ignored, not errors. */
export async function handleResendEvent(event: unknown, now = new Date()): Promise<{ handled: boolean; type: string | null }> {
  const e = (event && typeof event === "object" ? event : {}) as ResendEvent;
  const type = str(e.type, 80) ?? null;
  const emailId = str(e.data?.email_id, 200);
  const handler = type ? WEBHOOK_HANDLERS[type] : undefined;
  if (!handler || !emailId) return { handled: false, type };

  const message = await CampaignMessage.findOne({ providerMessageId: emailId }).exec();
  if (!message) return { handled: false, type };

  await handler(message, e, now);
  await syncCampaignStats(message.campaignId);
  return { handled: true, type };
}

// --- suppressions ---------------------------------------------------------

export async function listSuppressions({ q, page, limit }: { q?: string; page: number; limit: number }) {
  const filter: Record<string, unknown> = q ? { email: { $regex: escapeRegex(q), $options: "i" } } : {};
  const [items, total] = await Promise.all([
    Suppression.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec(),
    Suppression.countDocuments(filter).exec(),
  ]);
  return { items, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) };
}

/** Manual block. Idempotent: an address already listed keeps its first record. */
export async function addSuppression(email: string, note?: string) {
  await suppress(email, "manual", note);
  await setLeadSuppressedByEmail(email, true);
  const doc = await Suppression.findOne({ email: email.toLowerCase() }).exec();
  if (!doc) throw AppError.notFound("The suppression could not be read back.");
  return doc;
}

/** Lifting a block also clears the lead flag; an unsubscribe stays honoured
    because the mailable check looks at unsubscribedAt too. */
export async function removeSuppression(id: string): Promise<void> {
  const doc = await Suppression.findByIdAndDelete(id).exec();
  if (!doc) throw AppError.notFound("That suppression no longer exists.");
  await setLeadSuppressedByEmail(doc.email, false);
}

// The scheduler never runs under test; tests call runCampaignTick(now) directly.
registerTick("campaigns", runCampaignTick);
