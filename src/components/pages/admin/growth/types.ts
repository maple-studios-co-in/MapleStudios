/**
 * Wire shapes for the growth platform (backend/), mirrored from
 * docs/platform/phase-1-spec.md. Ids are strings, dates are ISO strings.
 * Lists come back as `{ items, meta }`, single records as `{ item }`, bare
 * mutations as `{ ok: true }`.
 */

export type ListMeta = { total: number; page: number; limit: number; pages: number };

export type ListBody<T> = { items: T[]; meta?: ListMeta };
export type ItemBody<T> = { item: T };
export type OkBody = { ok: boolean };

/* ————— leads ————— */

export const LEAD_STAGES = [
  "new",
  "contacted",
  "replied",
  "qualified",
  "meeting",
  "proposal",
  "won",
  "lost",
  "unsubscribed",
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export type ActivityType =
  | "import"
  | "note"
  | "stage"
  | "email_queued"
  | "email_sent"
  | "email_bounced"
  | "email_complained"
  | "unsubscribed"
  | "outreach";

export type Note = { at: string; by: string; text: string };
export type Activity = { at: string; type: ActivityType; summary: string; ref?: string };

export type Lead = {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  company?: string;
  role?: string;
  website?: string;
  industry?: string;
  city?: string;
  segment?: string;
  tags: string[];
  source?: string;
  stage: LeadStage;
  owner?: string;
  nextAction?: { at: string; note: string };
  lastContactedAt?: string;
  unsubscribedAt?: string;
  suppressed: boolean;
  custom: Record<string, string>;
  notes: Note[];
  activities: Activity[];
  importBatchId?: string;
  createdAt: string;
  updatedAt: string;
};

/** The editable subset sent on POST /leads and PATCH /leads/:id. */
export type LeadInput = Partial<
  Pick<
    Lead,
    | "firstName"
    | "lastName"
    | "email"
    | "phone"
    | "company"
    | "role"
    | "website"
    | "industry"
    | "city"
    | "segment"
    | "tags"
    | "source"
    | "stage"
    | "owner"
    | "nextAction"
    | "custom"
  >
>;

/** Lead fields a CSV column can map onto (plus `custom:<name>` and `ignore`). */
export const LEAD_IMPORT_FIELDS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "company",
  "role",
  "website",
  "industry",
  "city",
  "segment",
  "tags",
  "source",
  "owner",
] as const;

export type LeadFilter = {
  stage?: LeadStage[];
  tags?: string[];
  segment?: string;
  owner?: string;
  industry?: string;
  city?: string;
  hasEmail?: boolean;
  hasPhone?: boolean;
  q?: string;
};

export type Segment = {
  id: string;
  name: string;
  filter: LeadFilter;
  createdAt: string;
  updatedAt: string;
};

export type ImportMapping = Record<string, string>;

export type ImportPreview = {
  columns: string[];
  sample: string[][];
  rows: number;
  mapping: ImportMapping;
};

export type ImportResult = {
  ok: boolean;
  batchId: string;
  imported: number;
  updated: number;
  skipped: number;
  invalid: { row: number; reason: string }[];
};

export type BulkResult = { ok: boolean; updated: number };

/* ————— templates ————— */

export const TEMPLATE_CHANNELS = ["email", "linkedin"] as const;
export type TemplateChannel = (typeof TEMPLATE_CHANNELS)[number];

export const TEMPLATE_CATEGORIES = ["cold", "followup", "nurture", "other"] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export type EmailTemplate = {
  id: string;
  name: string;
  channel: TemplateChannel;
  category: TemplateCategory;
  subject?: string;
  preheader?: string;
  html?: string;
  text: string;
  mergeFields: string[];
  createdAt: string;
  updatedAt: string;
};

export type TemplateInput = Partial<
  Pick<EmailTemplate, "name" | "channel" | "category" | "subject" | "preheader" | "html" | "text">
>;

export type RenderResult = { subject?: string; html?: string; text: string; missing: string[] };

export type TestSendResult = { ok: boolean; dryRun: boolean; providerId?: string };

/** Merge fields the renderer understands (lib/merge.ts), for the palette. */
export const MERGE_FIELDS: { key: string; hint: string }[] = [
  { key: "first_name", hint: "Lead first name" },
  { key: "last_name", hint: "Lead last name" },
  { key: "email", hint: "Lead email" },
  { key: "phone", hint: "Lead phone" },
  { key: "company", hint: "Company" },
  { key: "role", hint: "Role / title" },
  { key: "website", hint: "Website" },
  { key: "industry", hint: "Industry" },
  { key: "city", hint: "City" },
  { key: "segment", hint: "Segment" },
  { key: "source", hint: "Lead source" },
  { key: "owner", hint: "Owner" },
  { key: "sender_name", hint: "From name" },
  { key: "sender_email", hint: "From email" },
  { key: "unsubscribe_url", hint: "One-click unsubscribe link" },
  { key: "today", hint: "Today's date" },
];

/* ————— campaigns ————— */

export const CAMPAIGN_STATUSES = [
  "draft",
  "scheduled",
  "running",
  "paused",
  "completed",
  "cancelled",
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export type CampaignAudience =
  | { segmentId: string }
  | { leadIds: string[] }
  | { filter: LeadFilter };

export type CampaignStep = { templateId: string; delayDays: number; stopIfReplied: boolean };

export type CampaignSchedule = {
  startAt: string;
  dailyCap: number;
  window: { start: string; end: string };
  weekdaysOnly: boolean;
  timezone: string;
};

export type CampaignStats = {
  recipients: number;
  queued: number;
  sent: number;
  delivered: number;
  bounced: number;
  complained: number;
  unsubscribed: number;
  replied: number;
  failed: number;
};

export type Campaign = {
  id: string;
  name: string;
  status: CampaignStatus;
  from: { name: string; email: string };
  replyTo?: string;
  audience: CampaignAudience;
  steps: CampaignStep[];
  schedule: CampaignSchedule;
  stats: CampaignStats;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type CampaignInput = Partial<
  Pick<Campaign, "name" | "from" | "replyTo" | "audience" | "steps" | "schedule">
>;

export const MESSAGE_STATUSES = [
  "queued",
  "sending",
  "sent",
  "delivered",
  "bounced",
  "complained",
  "failed",
  "skipped",
  "cancelled",
] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

/** The messages list is "joined with lead email/name" — the exact key names
    are the backend's call, so both likely spellings are read. */
export type CampaignMessage = {
  id: string;
  campaignId: string;
  leadId: string;
  step: number;
  status: MessageStatus;
  scheduledFor: string;
  sentAt?: string;
  providerMessageId?: string;
  error?: string;
  unsubscribeToken?: string;
  /** joined by the API as { id, name, email }; older shapes kept as fallbacks */
  lead?: { id?: string; name?: string; email?: string; firstName?: string; lastName?: string } | null;
  leadEmail?: string;
  leadName?: string;
};

export type CampaignPreview = {
  recipients: number;
  samples: { leadId: string; email: string; subject: string; html: string; text: string }[];
};

export type Suppression = {
  id: string;
  email: string;
  reason: "unsubscribe" | "bounce" | "complaint" | "manual";
  note?: string;
  createdAt: string;
};

/* ————— social ————— */

export const PLATFORMS = ["x", "instagram", "linkedin"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABEL: Record<Platform, string> = {
  x: "X",
  instagram: "Instagram",
  linkedin: "LinkedIn",
};

export const PLATFORM_LIMIT: Record<Platform, number> = {
  x: 280,
  linkedin: 3000,
  instagram: 2200,
};

export type SocialAccount = {
  id: string;
  platform: Platform;
  externalId: string;
  handle: string;
  displayName: string;
  avatarUrl?: string;
  scopes: string[];
  expiresAt?: string;
  status: "connected" | "expired" | "revoked";
  meta: { pageId?: string; igUserId?: string; personUrn?: string };
  connectedAt: string;
  updatedAt: string;
};

export const POST_STATUSES = [
  "draft",
  "scheduled",
  "publishing",
  "published",
  "partial",
  "failed",
] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export type PostResult = {
  platform: Platform;
  status: "pending" | "published" | "failed";
  externalId?: string;
  url?: string;
  error?: string;
  publishedAt?: string;
};

export type SocialPost = {
  id: string;
  text: string;
  mediaUrls: string[];
  platforms: Platform[];
  scheduledAt?: string;
  status: PostStatus;
  results: PostResult[];
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type SocialPostInput = Partial<Pick<SocialPost, "text" | "mediaUrls" | "platforms" | "scheduledAt">>;

/* ————— outreach ————— */

export const OUTREACH_STAGES = [
  "identified",
  "connection_sent",
  "connected",
  "messaged",
  "replied",
  "meeting",
  "won",
  "lost",
  "not_interested",
] as const;
export type OutreachStage = (typeof OUTREACH_STAGES)[number];

export const OUTREACH_STAGE_LABEL: Record<OutreachStage, string> = {
  identified: "Identified",
  connection_sent: "Connection sent",
  connected: "Connected",
  messaged: "Messaged",
  replied: "Replied",
  meeting: "Meeting",
  won: "Won",
  lost: "Lost",
  not_interested: "Not interested",
};

export type OutreachTarget = {
  id: string;
  leadId?: string;
  name: string;
  company?: string;
  role?: string;
  linkedinUrl: string;
  stage: OutreachStage;
  templateId?: string;
  lastActionAt?: string;
  nextActionAt?: string;
  notes: Note[];
  history: { at: string; stage: OutreachStage; note?: string }[];
  createdAt: string;
  updatedAt: string;
};

export type OutreachInput = Partial<
  Pick<OutreachTarget, "leadId" | "name" | "company" | "role" | "linkedinUrl" | "templateId" | "nextActionAt">
>;

export type OutreachRender = { text: string; missing: string[] };
