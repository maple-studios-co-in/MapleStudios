import { DateTime } from "luxon";
import { EmailTemplate, type EmailTemplateDoc, type IEmailTemplate, type TemplateCategory, type TemplateChannel } from "./template.model.js";
import { Campaign } from "../campaigns/campaign.model.js";
import { Lead, type ILead } from "../leads/lead.model.js";
import { AppError } from "../../lib/AppError.js";
import { env } from "../../config/env.js";
import { getMailProvider } from "../../lib/mail/provider.js";
import { leadContext, render, SAMPLE_CONTEXT, type MergeContext, type Rendered } from "../../lib/merge.js";

export const LINKEDIN_MAX_CHARS = 3000;

/**
 * Plain-text twin of an HTML body, for the text/plain part and for templates
 * saved without one. Block-level closers become line breaks and links keep
 * their href, so the text version still carries the unsubscribe link. Merge
 * tokens contain no angle brackets and survive untouched.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<a\s[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a\s*>/gi, (_m, href: string, label: string) =>
      label.trim() && label.trim() !== href ? `${label.trim()} (${href})` : href
    )
    .replace(/<\s*(br|hr)\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|h[1-6]|li|tr|blockquote|table)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface TemplateInput {
  name: string;
  channel: TemplateChannel;
  category: TemplateCategory;
  subject?: string;
  preheader?: string;
  html?: string;
  text?: string;
}

type Normalised = Pick<IEmailTemplate, "name" | "channel" | "category" | "text"> & {
  subject: string | undefined;
  preheader: string | undefined;
  html: string | undefined;
};

/**
 * The per-channel rule, applied to the whole (merged) document so create and
 * patch cannot drift: email needs a subject and html (text is derived when
 * blank); linkedin is text only and the message box there stops at 3000.
 */
function normaliseTemplate(input: TemplateInput): Normalised {
  const issues: Array<{ field: string; message: string }> = [];
  const base = { name: input.name, channel: input.channel, category: input.category };

  if (input.channel === "email") {
    if (!input.subject) issues.push({ field: "subject", message: "Email templates need a subject." });
    if (!input.html?.trim()) issues.push({ field: "html", message: "Email templates need an HTML body." });
    if (issues.length) throw AppError.badRequest("Some fields need attention.", issues);
    const text = input.text?.trim() ? input.text : htmlToText(input.html as string);
    if (!text) issues.push({ field: "html", message: "The HTML body has no readable text." });
    if (issues.length) throw AppError.badRequest("Some fields need attention.", issues);
    return { ...base, subject: input.subject, preheader: input.preheader || undefined, html: input.html, text };
  }

  const text = input.text?.trim() ?? "";
  if (!text) issues.push({ field: "text", message: "LinkedIn templates need the message text." });
  else if (text.length > LINKEDIN_MAX_CHARS) {
    issues.push({ field: "text", message: `LinkedIn messages are limited to ${LINKEDIN_MAX_CHARS} characters.` });
  }
  if (issues.length) throw AppError.badRequest("Some fields need attention.", issues);
  return { ...base, subject: undefined, preheader: undefined, html: undefined, text };
}

export async function createTemplate(input: TemplateInput) {
  return EmailTemplate.create(normaliseTemplate(input));
}

export interface ListOptions {
  channel?: TemplateChannel;
  category?: TemplateCategory;
  q?: string;
  page: number;
  limit: number;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function listTemplates({ channel, category, q, page, limit }: ListOptions) {
  const filter: Record<string, unknown> = {};
  if (channel) filter.channel = channel;
  if (category) filter.category = category;
  // A studio has dozens of templates, not thousands; a regex on the name
  // beats maintaining a text index for it.
  if (q) filter.name = { $regex: escapeRegex(q), $options: "i" };

  const [items, total] = await Promise.all([
    EmailTemplate.find(filter)
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec(),
    EmailTemplate.countDocuments(filter).exec(),
  ]);
  return { items, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) };
}

export async function getTemplate(id: string): Promise<EmailTemplateDoc> {
  const doc = await EmailTemplate.findById(id).exec();
  if (!doc) throw AppError.notFound("That template no longer exists.");
  return doc;
}

export async function updateTemplate(id: string, patch: Partial<TemplateInput>) {
  const doc = await getTemplate(id);
  const merged = normaliseTemplate({
    name: patch.name ?? doc.name,
    channel: patch.channel ?? doc.channel,
    category: patch.category ?? doc.category,
    subject: patch.subject ?? doc.subject,
    preheader: patch.preheader ?? doc.preheader,
    html: patch.html ?? doc.html,
    // Sending text: "" is how the console asks for a fresh derivation.
    text: patch.text ?? doc.text,
  });
  // Explicit undefineds unset the paths a channel change leaves behind.
  doc.set(merged);
  await doc.save();
  return doc;
}

/** Terminal campaigns never send again, so their templates are free to go. */
const TERMINAL_CAMPAIGN_STATUSES = ["completed", "cancelled"];

export async function deleteTemplate(id: string): Promise<void> {
  const doc = await getTemplate(id);
  const inUse = await Campaign.exists({
    "steps.templateId": doc._id,
    status: { $nin: TERMINAL_CAMPAIGN_STATUSES },
  }).exec();
  if (inUse) throw AppError.conflict("That template is used by a campaign that has not finished.");
  await doc.deleteOne();
}

/** Sender identity for previews and test sends: the studio's configured mailbox. */
export function defaultSender() {
  return {
    name: env.MAIL_FROM_NAME,
    email: env.MAIL_FROM_EMAIL ?? `no-reply@${new URL(env.PUBLIC_BASE_URL).hostname}`,
  };
}

/** The non-lead merge keys, shared by previews and campaign sends. */
export function senderContext(from: { name: string; email: string }, unsubscribeUrl: string, now = new Date(), zone = env.STUDIO_TIMEZONE): MergeContext {
  return {
    sender_name: from.name,
    sender_email: from.email,
    unsubscribe_url: unsubscribeUrl,
    today: DateTime.fromJSDate(now, { zone }).toISODate() ?? now.toISOString().slice(0, 10),
  };
}

/** A preview link that is visibly not a real token. */
export const previewUnsubscribeUrl = () => `${env.PUBLIC_BASE_URL}/unsubscribe/preview`;

async function contextFor(leadId: string | undefined, sample: Record<string, string> | undefined): Promise<MergeContext> {
  const extras = senderContext(defaultSender(), previewUnsubscribeUrl());
  if (leadId) {
    const lead = await Lead.findById(leadId).exec();
    if (!lead) throw AppError.notFound("That lead no longer exists.");
    return { ...extras, ...leadContext(lead as ILead) };
  }
  return { ...SAMPLE_CONTEXT, ...extras, ...(sample ?? {}) };
}

export function renderWith(template: Pick<IEmailTemplate, "subject" | "html" | "text">, ctx: MergeContext): Rendered {
  return render({ subject: template.subject, html: template.html, text: template.text }, ctx);
}

export async function renderTemplate(id: string, opts: { leadId?: string; sample?: Record<string, string> }) {
  const doc = await getTemplate(id);
  return renderWith(doc, await contextFor(opts.leadId, opts.sample));
}

export async function testSend(id: string, opts: { to: string; leadId?: string }) {
  const doc = await getTemplate(id);
  if (doc.channel !== "email") throw AppError.badRequest("Only email templates can be sent.");

  const rendered = renderWith(doc, await contextFor(opts.leadId, undefined));
  const provider = getMailProvider();
  const { id: providerId } = await provider.send({
    to: opts.to,
    from: defaultSender(),
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
  return { ok: true as const, dryRun: provider.name === "dry-run", providerId };
}
