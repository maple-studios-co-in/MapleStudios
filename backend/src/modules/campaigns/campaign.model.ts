import mongoose, { Schema, model, type HydratedDocument, type Model, type Types } from "mongoose";
import { env } from "../../config/env.js";
import type { LeadFilter } from "../leads/segment.model.js";

export const CAMPAIGN_STATUSES = ["draft", "scheduled", "running", "paused", "completed", "cancelled"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

/** Nothing sends again once a campaign reaches one of these. */
export const TERMINAL_CAMPAIGN_STATUSES: readonly CampaignStatus[] = ["completed", "cancelled"];

/** Exactly one of the three is set; the zod schema enforces it. */
export interface CampaignAudience {
  segmentId?: string;
  leadIds?: string[];
  filter?: LeadFilter;
}

export interface CampaignStep {
  templateId: Types.ObjectId;
  /** days after the previous step was sent; 0 for the first */
  delayDays: number;
  stopIfReplied: boolean;
}

export interface CampaignSchedule {
  startAt: Date;
  dailyCap: number;
  /** local wall-clock bounds, "HH:mm", in `timezone` */
  window: { start: string; end: string };
  weekdaysOnly: boolean;
  timezone: string;
}

export interface CampaignStats {
  recipients: number;
  queued: number;
  sent: number;
  delivered: number;
  bounced: number;
  complained: number;
  unsubscribed: number;
  replied: number;
  failed: number;
}

export interface ICampaign {
  name: string;
  status: CampaignStatus;
  from: { name: string; email: string };
  replyTo?: string;
  audience: CampaignAudience;
  steps: CampaignStep[];
  schedule: CampaignSchedule;
  stats: CampaignStats;
  startedAt?: Date | null;
  completedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const iso = (d?: Date | null) => (d ? new Date(d).toISOString() : null);

export const EMPTY_STATS: CampaignStats = {
  recipients: 0,
  queued: 0,
  sent: 0,
  delivered: 0,
  bounced: 0,
  complained: 0,
  unsubscribed: 0,
  replied: 0,
  failed: 0,
};

/** Read each counter by name: on a hydrated document `stats` is a subdocument
    whose paths are prototype getters, so spreading it would copy internals
    and report zeros. */
const statsWire = (s: Partial<CampaignStats> | undefined): CampaignStats =>
  Object.fromEntries(
    (Object.keys(EMPTY_STATS) as Array<keyof CampaignStats>).map((k) => [k, s?.[k] ?? 0])
  ) as unknown as CampaignStats;

/** Only the audience key that is set goes on the wire, so the console can
    switch on it without checking three fields. */
export function audienceWire(a: CampaignAudience) {
  if (a.segmentId) return { segmentId: a.segmentId };
  if (a.leadIds) return { leadIds: a.leadIds.map(String) };
  return { filter: a.filter ?? {} };
}

export function campaignWire(c: ICampaign & { _id: unknown }) {
  const s = c.schedule;
  return {
    id: String(c._id),
    name: c.name,
    status: c.status,
    from: { name: c.from.name, email: c.from.email },
    replyTo: c.replyTo ?? "",
    audience: audienceWire(c.audience ?? {}),
    steps: (c.steps ?? []).map((st) => ({
      templateId: String(st.templateId),
      delayDays: st.delayDays,
      stopIfReplied: st.stopIfReplied,
    })),
    schedule: {
      startAt: iso(s.startAt),
      dailyCap: s.dailyCap,
      window: { start: s.window.start, end: s.window.end },
      weekdaysOnly: s.weekdaysOnly,
      timezone: s.timezone,
    },
    stats: statsWire(c.stats),
    startedAt: iso(c.startedAt),
    completedAt: iso(c.completedAt),
    createdAt: iso(c.createdAt),
    updatedAt: iso(c.updatedAt),
  };
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const AudienceSchema = new Schema<CampaignAudience>(
  {
    segmentId: { type: String },
    // No default: Mongoose would otherwise store [] and make every audience
    // look like an (empty) lead list.
    leadIds: { type: [String], default: undefined },
    filter: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const StepSchema = new Schema<CampaignStep>(
  {
    templateId: { type: Schema.Types.ObjectId, required: true },
    delayDays: { type: Number, required: true, min: 0, max: 365 },
    stopIfReplied: { type: Boolean, default: true },
  },
  { _id: false }
);

const ScheduleSchema = new Schema<CampaignSchedule>(
  {
    startAt: { type: Date, required: true },
    dailyCap: { type: Number, default: 30, min: 1, max: 1000 },
    window: {
      start: { type: String, default: "09:30", match: HHMM },
      end: { type: String, default: "18:00", match: HHMM },
    },
    weekdaysOnly: { type: Boolean, default: true },
    timezone: { type: String, default: env.STUDIO_TIMEZONE },
  },
  { _id: false }
);

const statCounter = { type: Number, default: 0, min: 0 };
const StatsSchema = new Schema<CampaignStats>(
  {
    recipients: statCounter,
    queued: statCounter,
    sent: statCounter,
    delivered: statCounter,
    bounced: statCounter,
    complained: statCounter,
    unsubscribed: statCounter,
    replied: statCounter,
    failed: statCounter,
  },
  { _id: false }
);

const CampaignSchema = new Schema<ICampaign>(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    status: { type: String, enum: CAMPAIGN_STATUSES, default: "draft" },
    from: {
      name: { type: String, required: true, trim: true, maxlength: 120 },
      email: { type: String, required: true, trim: true, lowercase: true, maxlength: 200 },
    },
    replyTo: { type: String, trim: true, lowercase: true, maxlength: 200 },
    audience: { type: AudienceSchema, required: true },
    steps: { type: [StepSchema], required: true },
    schedule: { type: ScheduleSchema, required: true },
    stats: { type: StatsSchema, default: () => ({ ...EMPTY_STATS }) },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: { versionKey: false, transform: (_doc, ret) => campaignWire(ret as unknown as ICampaign & { _id: unknown }) },
  }
);

// The list view and the tick's "every running campaign" scan.
CampaignSchema.index({ status: 1, updatedAt: -1 });
// The template delete guard asks "is this template still in play?".
CampaignSchema.index({ "steps.templateId": 1, status: 1 });

export type CampaignDoc = HydratedDocument<ICampaign>;
export const Campaign: Model<ICampaign> =
  (mongoose.models.Campaign as Model<ICampaign> | undefined) ?? model<ICampaign>("Campaign", CampaignSchema);
