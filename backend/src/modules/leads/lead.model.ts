import mongoose, { Schema, model, type HydratedDocument, type Model } from "mongoose";

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

/** Stages after which a campaign must stop writing to the lead. */
export const CLOSED_STAGES: readonly LeadStage[] = ["replied", "won", "lost", "unsubscribed"];

export const ACTIVITY_TYPES = [
  "import",
  "note",
  "stage",
  "email_queued",
  "email_sent",
  "email_bounced",
  "email_complained",
  "unsubscribed",
  "outreach",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export interface LeadNote {
  at: Date;
  by: string;
  text: string;
}

export interface LeadActivity {
  at: Date;
  type: ActivityType;
  summary: string;
  /** campaign id, outreach id, import batch id … */
  ref?: string;
}

export interface ILead {
  firstName: string;
  lastName?: string;
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
  nextAction?: { at: Date; note?: string } | null;
  lastContactedAt?: Date | null;
  unsubscribedAt?: Date | null;
  /** bounced/complained/manually suppressed — campaigns skip these */
  suppressed: boolean;
  custom: Map<string, string>;
  notes: LeadNote[];
  activities: LeadActivity[];
  importBatchId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const iso = (d?: Date | null) => (d ? new Date(d).toISOString() : null);

/** Wire shape — ids and ISO dates, `custom` as a plain object. */
export function leadWire(l: ILead & { _id: unknown }) {
  return {
    id: String(l._id),
    firstName: l.firstName,
    lastName: l.lastName ?? "",
    email: l.email ?? null,
    phone: l.phone ?? null,
    company: l.company ?? "",
    role: l.role ?? "",
    website: l.website ?? "",
    industry: l.industry ?? "",
    city: l.city ?? "",
    segment: l.segment ?? "",
    tags: l.tags ?? [],
    source: l.source ?? "",
    stage: l.stage,
    owner: l.owner ?? "",
    nextAction: l.nextAction ? { at: iso(l.nextAction.at), note: l.nextAction.note ?? "" } : null,
    lastContactedAt: iso(l.lastContactedAt),
    unsubscribedAt: iso(l.unsubscribedAt),
    suppressed: Boolean(l.suppressed),
    custom: l.custom instanceof Map ? Object.fromEntries(l.custom) : (l.custom ?? {}),
    notes: (l.notes ?? []).map((n) => ({ at: iso(n.at), by: n.by, text: n.text })),
    activities: (l.activities ?? []).map((a) => ({ at: iso(a.at), type: a.type, summary: a.summary, ref: a.ref ?? null })),
    importBatchId: l.importBatchId ?? null,
    createdAt: iso(l.createdAt),
    updatedAt: iso(l.updatedAt),
  };
}

const LeadSchema = new Schema<ILead>(
  {
    firstName: { type: String, required: true, trim: true, maxlength: 120 },
    lastName: { type: String, trim: true, maxlength: 120 },
    email: { type: String, trim: true, lowercase: true, maxlength: 200 },
    phone: { type: String, trim: true, maxlength: 20 },
    company: { type: String, trim: true, maxlength: 160 },
    role: { type: String, trim: true, maxlength: 120 },
    website: { type: String, trim: true, maxlength: 300 },
    industry: { type: String, trim: true, maxlength: 120 },
    city: { type: String, trim: true, maxlength: 120 },
    segment: { type: String, trim: true, maxlength: 120 },
    tags: { type: [String], default: [] },
    source: { type: String, trim: true, maxlength: 120 },
    stage: { type: String, enum: LEAD_STAGES, default: "new" },
    owner: { type: String, trim: true, maxlength: 120 },
    nextAction: { type: { at: Date, note: String }, default: null },
    lastContactedAt: { type: Date, default: null },
    unsubscribedAt: { type: Date, default: null },
    suppressed: { type: Boolean, default: false },
    custom: { type: Map, of: String, default: () => new Map() },
    notes: { type: [{ at: Date, by: String, text: { type: String, maxlength: 4000 } }], default: [] },
    activities: {
      type: [{ at: Date, type: { type: String, enum: ACTIVITY_TYPES }, summary: { type: String, maxlength: 400 }, ref: String }],
      default: [],
    },
    importBatchId: { type: String },
  },
  {
    timestamps: true,
    toJSON: { versionKey: false, transform: (_doc, ret) => leadWire(ret as unknown as ILead & { _id: unknown }) },
  }
);

// Sparse so leads with only a phone (or only an email) don't collide on null.
LeadSchema.index({ email: 1 }, { unique: true, sparse: true });
LeadSchema.index({ phone: 1 }, { unique: true, sparse: true });
LeadSchema.index({ stage: 1, updatedAt: -1 });
LeadSchema.index({ tags: 1 });
LeadSchema.index({ owner: 1 });
LeadSchema.index({ importBatchId: 1 });
LeadSchema.index({ firstName: "text", lastName: "text", company: "text", email: "text" });

export type LeadDoc = HydratedDocument<ILead>;
export const Lead: Model<ILead> =
  (mongoose.models.Lead as Model<ILead> | undefined) ?? model<ILead>("Lead", LeadSchema);
