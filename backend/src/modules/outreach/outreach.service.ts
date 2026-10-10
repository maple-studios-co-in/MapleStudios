import type { UpdateQuery } from "mongoose";
import { env } from "../../config/env.js";
import { AppError } from "../../lib/AppError.js";
import { leadContext, renderText, type MergeContext } from "../../lib/merge.js";
import { studioToday } from "../../lib/time.js";
import { CLOSED_STAGES, Lead, type ILead, type LeadDoc } from "../leads/lead.model.js";
import { EmailTemplate } from "../templates/template.model.js";
import { OutreachTarget, TERMINAL_STAGES, type OutreachStage, type OutreachTargetDoc } from "./outreach.model.js";
import type { AdvanceInput, CreateTargetInput, ListTargetsQuery, PatchTargetInput } from "./outreach.schema.js";

export async function getTarget(id: string): Promise<OutreachTargetDoc> {
  const target = await OutreachTarget.findById(id).exec();
  if (!target) throw AppError.notFound("That outreach target no longer exists.");
  return target;
}

async function requireLead(leadId: string): Promise<LeadDoc> {
  const lead = await Lead.findById(leadId).exec();
  if (!lead) throw AppError.notFound("That lead no longer exists.");
  return lead;
}

/** Friendlier than the duplicate-key 409 the unique indexes would otherwise produce. */
async function assertUnique(linkedinUrl: string, leadId: string | null | undefined, exceptId?: unknown) {
  const not = exceptId ? { _id: { $ne: exceptId } } : {};
  if (await OutreachTarget.exists({ linkedinUrl, ...not }).exec()) {
    throw AppError.conflict("That LinkedIn profile is already in outreach.");
  }
  if (leadId && (await OutreachTarget.exists({ leadId, ...not }).exec())) {
    throw AppError.conflict("That lead is already in outreach.");
  }
}

export async function createTarget(input: CreateTargetInput, now = new Date()) {
  const lead = input.leadId ? await requireLead(input.leadId) : null;
  await assertUnique(input.linkedinUrl, input.leadId);

  const stage: OutreachStage = input.stage ?? "identified";
  return OutreachTarget.create({
    leadId: lead?._id ?? null,
    // Inline fields win; the lead fills whatever was left blank.
    name: input.name ?? [lead?.firstName, lead?.lastName].filter(Boolean).join(" "),
    company: input.company ?? lead?.company,
    role: input.role ?? lead?.role,
    linkedinUrl: input.linkedinUrl,
    stage,
    templateId: input.templateId ?? null,
    nextActionAt: input.nextActionAt ?? null,
    notes: [],
    history: [{ at: now, stage }],
  });
}

export async function listTargets({ stage, q, due, page, limit }: ListTargetsQuery, now = new Date()) {
  const filter: Record<string, unknown> = {};
  if (stage) filter.stage = stage;
  if (due) {
    filter.nextActionAt = { $lte: now };
    if (!stage) filter.stage = { $nin: TERMINAL_STAGES };
  }
  if (q) {
    // Partial matches matter more than relevance ranking for a pipeline this size.
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ name: rx }, { company: rx }, { linkedinUrl: rx }];
  }

  const [items, total] = await Promise.all([
    OutreachTarget.find(filter)
      .sort(due ? { nextActionAt: 1 } : { updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec(),
    OutreachTarget.countDocuments(filter).exec(),
  ]);
  return { items, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) };
}

/** "Due today" — oldest first, finished targets excluded. */
export async function listDue(now = new Date()) {
  return OutreachTarget.find({ nextActionAt: { $lte: now }, stage: { $nin: TERMINAL_STAGES } })
    .sort({ nextActionAt: 1 })
    .limit(200)
    .exec();
}

export async function updateTarget(id: string, patch: PatchTargetInput) {
  const target = await getTarget(id);
  if (patch.leadId) await requireLead(patch.leadId);
  if (patch.linkedinUrl !== undefined || patch.leadId) {
    await assertUnique(patch.linkedinUrl ?? target.linkedinUrl, patch.leadId, target._id);
  }

  if (patch.name !== undefined) target.name = patch.name;
  if (patch.company !== undefined) target.company = patch.company;
  if (patch.role !== undefined) target.role = patch.role;
  if (patch.linkedinUrl !== undefined) target.linkedinUrl = patch.linkedinUrl;
  if (patch.leadId !== undefined) target.set("leadId", patch.leadId);
  if (patch.templateId !== undefined) target.set("templateId", patch.templateId);
  if (patch.nextActionAt !== undefined) target.nextActionAt = patch.nextActionAt;

  await target.save();
  return target;
}

export async function deleteTarget(id: string): Promise<void> {
  const deleted = await OutreachTarget.findByIdAndDelete(id).exec();
  if (!deleted) throw AppError.notFound("That outreach target no longer exists.");
}

export async function addNote(id: string, text: string, by: string, now = new Date()) {
  const target = await getTarget(id);
  target.notes.push({ at: now, by, text });
  await target.save();
  return target;
}

const STAGE_SUMMARY: Record<OutreachStage, string> = {
  identified: "Added to LinkedIn outreach",
  connection_sent: "Connection request sent on LinkedIn",
  connected: "Connected on LinkedIn",
  messaged: "Messaged on LinkedIn",
  replied: "Replied on LinkedIn",
  meeting: "Meeting booked via LinkedIn",
  won: "Won via LinkedIn outreach",
  lost: "Lost after LinkedIn outreach",
  not_interested: "Not interested (LinkedIn outreach)",
};

/**
 * Move a target along the pipeline. The history is the audit trail; the
 * linked lead gets an `outreach` activity so its timeline tells the same
 * story, and a reply flips the lead to `replied` — the signal campaigns use
 * to stop emailing someone who is already talking to us.
 */
export async function advanceTarget(id: string, input: AdvanceInput, now = new Date()) {
  const target = await getTarget(id);
  target.history.push({ at: now, stage: input.stage, ...(input.note ? { note: input.note } : {}) });
  target.stage = input.stage;
  target.lastActionAt = now;
  target.nextActionAt = input.nextActionAt ?? null;
  await target.save();

  if (target.leadId) await reflectOnLead(target, input.stage, now);
  return target;
}

async function reflectOnLead(target: OutreachTargetDoc, stage: OutreachStage, now: Date) {
  const set: Partial<ILead> = {};
  if (stage === "connection_sent" || stage === "messaged") set.lastContactedAt = now;
  if (stage === "replied") {
    const lead = await Lead.findById(target.leadId).select("stage").exec();
    // Never pull a won/lost/unsubscribed lead back into the funnel.
    if (lead && !CLOSED_STAGES.includes(lead.stage)) set.stage = "replied";
  }

  const update: UpdateQuery<ILead> = {
    $push: { activities: { at: now, type: "outreach", summary: STAGE_SUMMARY[stage], ref: String(target._id) } },
    ...(Object.keys(set).length ? { $set: set } : {}),
  };
  await Lead.updateOne({ _id: target.leadId }, update).exec();
}

/**
 * The message the operator will paste into LinkedIn. Lead fields come first;
 * the target's own name/company/role fill anything the lead cannot (or
 * everything, for a target with no lead).
 */
export async function renderForTarget(id: string, templateId: string) {
  const target = await getTarget(id);
  const template = await EmailTemplate.findById(templateId).exec();
  if (!template) throw AppError.notFound("That template no longer exists.");
  if (template.channel !== "linkedin") {
    throw AppError.badRequest("Pick a LinkedIn template — email templates are for campaigns.");
  }

  const lead = target.leadId ? await Lead.findById(target.leadId).exec() : null;
  const ctx: MergeContext = {
    ...leadContext(lead),
    sender_name: env.MAIL_FROM_NAME,
    sender_email: env.MAIL_FROM_EMAIL,
    today: studioToday(),
    linkedin_url: target.linkedinUrl,
  };
  const [first = "", ...rest] = target.name.trim().split(/\s+/);
  const fill = (key: string, value: string | undefined) => {
    if (!ctx[key] && value) ctx[key] = value;
  };
  fill("first_name", first);
  fill("last_name", rest.join(" "));
  fill("full_name", target.name);
  fill("name", ctx.full_name ?? target.name);
  fill("company", target.company);
  fill("role", target.role);

  const rendered = renderText(template.text, ctx);

  // Remember the template so the drawer reopens on the one that was used.
  if (String(target.templateId ?? "") !== String(template._id)) {
    target.set("templateId", template._id);
    await target.save();
  }
  return rendered;
}
