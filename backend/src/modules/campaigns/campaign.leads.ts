import type { Types } from "mongoose";
import { Lead, type ActivityType, type ILead, type LeadDoc } from "../leads/lead.model.js";
import { Segment, type LeadFilter } from "../leads/segment.model.js";
import { buildLeadQuery, touchContacted } from "../leads/lead.service.js";
import { Suppression } from "./suppression.model.js";
import type { CampaignAudience } from "./campaign.model.js";
import { AppError } from "../../lib/AppError.js";

/**
 * The campaign module's view of leads: audience resolution plus the
 * bookkeeping a send leaves behind (activities, contact stamps, suppression
 * flags). The filter translation itself comes from the leads module, so a
 * campaign's recipient count always matches what the Leads screen lists for
 * the same filter.
 */

/** Hard ceiling on one audience resolution; a 30-a-day campaign never needs more. */
export const AUDIENCE_LIMIT = 5000;

/** LeadFilter -> Mongo query, shared with the Leads screen. */
export const leadFilterQuery = buildLeadQuery;

/** Every lead the audience names, before any eligibility check. */
export async function resolveAudience(audience: CampaignAudience): Promise<LeadDoc[]> {
  if (audience.leadIds) {
    return Lead.find({ _id: { $in: audience.leadIds } }).sort({ createdAt: 1 }).limit(AUDIENCE_LIMIT).exec();
  }
  let filter: LeadFilter = audience.filter ?? {};
  if (audience.segmentId) {
    const segment = await Segment.findById(audience.segmentId).exec();
    if (!segment) throw AppError.notFound("That segment no longer exists.");
    filter = segment.filter ?? {};
  }
  return Lead.find(leadFilterQuery(filter)).sort({ createdAt: 1 }).limit(AUDIENCE_LIMIT).exec();
}

/** Is this lead someone a campaign may still write to? Checked at enrolment
    and again at send time, because both lists move between the two. */
export function isMailable<T extends Pick<ILead, "email" | "suppressed" | "unsubscribedAt" | "stage">>(
  lead: T
): lead is T & { email: string } {
  return Boolean(lead.email) && !lead.suppressed && !lead.unsubscribedAt && lead.stage !== "unsubscribed";
}

/** The audience minus anyone we must not email: suppressed (flag or list),
    unsubscribed, or without an address. */
export async function findLeadsForAudience(audience: CampaignAudience): Promise<Array<LeadDoc & { email: string }>> {
  const mailable = (await resolveAudience(audience)).filter((l): l is LeadDoc & { email: string } => isMailable(l));
  const listed = new Set(await suppressedEmails(mailable.map((l) => l.email)));
  return mailable.filter((l) => !listed.has(l.email));
}

/** Which of these addresses are on the suppression list. */
export async function suppressedEmails(emails: string[]): Promise<string[]> {
  if (emails.length === 0) return [];
  const found = await Suppression.distinct("email", { email: { $in: emails.map((e) => e.toLowerCase()) } }).exec();
  return found.map(String);
}

export interface ActivityInput {
  leadId: Types.ObjectId;
  type: ActivityType;
  summary: string;
  /** campaign id, so the timeline links back */
  ref?: string;
}

/** One activity each on many leads in a single round trip (enrolment). */
export async function appendLeadActivities(entries: ActivityInput[], at = new Date()): Promise<void> {
  if (entries.length === 0) return;
  await Lead.bulkWrite(
    entries.map((e) => ({
      updateOne: {
        filter: { _id: e.leadId },
        update: { $push: { activities: { at, type: e.type, summary: e.summary, ...(e.ref ? { ref: e.ref } : {}) } } },
      },
    })),
    { ordered: false }
  );
}

export async function appendLeadActivity(entry: ActivityInput, at = new Date()): Promise<void> {
  await appendLeadActivities([entry], at);
}

/** A campaign email went out: stamp the lead (a `new` lead becomes
    `contacted`, like any other first touch) and leave the trail. */
export async function markLeadContacted(leadId: Types.ObjectId | string, at: Date, summary: string, ref: string): Promise<void> {
  await touchContacted(String(leadId), at);
  await Lead.updateOne({ _id: leadId }, { $push: { activities: { at, type: "email_sent", summary, ref } } }).exec();
}

/** The lead asked out: no campaign may write to them again. Idempotent. */
export async function markLeadUnsubscribed(leadId: Types.ObjectId | string, at: Date, ref?: string): Promise<void> {
  await Lead.updateOne(
    { _id: leadId, unsubscribedAt: null },
    {
      $set: { unsubscribedAt: at, stage: "unsubscribed" },
      $push: { activities: { at, type: "unsubscribed", summary: "Unsubscribed via email link", ...(ref ? { ref } : {}) } },
    }
  ).exec();
}

/** A bounce or complaint: flag the lead so every campaign skips them. */
export async function markLeadSuppressed(
  leadId: Types.ObjectId | string,
  type: "email_bounced" | "email_complained",
  summary: string,
  at: Date,
  ref?: string
): Promise<void> {
  await Lead.updateOne(
    { _id: leadId },
    { $set: { suppressed: true }, $push: { activities: { at, type, summary, ...(ref ? { ref } : {}) } } }
  ).exec();
}

/** Manual suppression list edits keep the lead flag in step with the list. */
export async function setLeadSuppressedByEmail(email: string, suppressed: boolean): Promise<void> {
  await Lead.updateMany({ email: email.toLowerCase() }, { $set: { suppressed } }).exec();
}

/** Name and email for a set of leads - the join the messages table needs. */
export async function leadSummaries(ids: Array<Types.ObjectId | string>) {
  if (ids.length === 0) return new Map<string, { id: string; name: string; email: string | null }>();
  const leads = await Lead.find({ _id: { $in: ids } }).select("firstName lastName email").exec();
  return new Map(
    leads.map((l) => [
      String(l._id),
      { id: String(l._id), name: [l.firstName, l.lastName].filter(Boolean).join(" "), email: l.email ?? null },
    ])
  );
}
