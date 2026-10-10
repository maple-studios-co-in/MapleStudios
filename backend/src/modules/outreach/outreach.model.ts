import mongoose, { Schema, model, type HydratedDocument, type Model, type Types } from "mongoose";

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

/** Nothing is due on a target that is finished. */
export const TERMINAL_STAGES: readonly OutreachStage[] = ["won", "lost", "not_interested"];

export interface OutreachNote {
  at: Date;
  by: string;
  text: string;
}

export interface OutreachHistory {
  at: Date;
  stage: OutreachStage;
  note?: string;
}

/**
 * One person the operator is working on LinkedIn by hand. LinkedIn has no
 * API for invitations or messages, so this is a tracker: it remembers the
 * stage, writes the message, and the operator sends it.
 */
export interface IOutreachTarget {
  leadId?: Types.ObjectId | null;
  name: string;
  company?: string;
  role?: string;
  linkedinUrl: string;
  stage: OutreachStage;
  templateId?: Types.ObjectId | null;
  lastActionAt?: Date | null;
  nextActionAt?: Date | null;
  notes: OutreachNote[];
  history: OutreachHistory[];
  createdAt?: Date;
  updatedAt?: Date;
}

const iso = (d?: Date | null) => (d ? new Date(d).toISOString() : null);

export function outreachWire(t: IOutreachTarget & { _id: unknown }) {
  return {
    id: String(t._id),
    leadId: t.leadId ? String(t.leadId) : null,
    name: t.name,
    company: t.company ?? "",
    role: t.role ?? "",
    linkedinUrl: t.linkedinUrl,
    stage: t.stage,
    templateId: t.templateId ? String(t.templateId) : null,
    lastActionAt: iso(t.lastActionAt),
    nextActionAt: iso(t.nextActionAt),
    notes: (t.notes ?? []).map((n) => ({ at: iso(n.at), by: n.by, text: n.text })),
    history: (t.history ?? []).map((h) => ({ at: iso(h.at), stage: h.stage, note: h.note ?? "" })),
    createdAt: iso(t.createdAt),
    updatedAt: iso(t.updatedAt),
  };
}

const OutreachTargetSchema = new Schema<IOutreachTarget>(
  {
    leadId: { type: Schema.Types.ObjectId, ref: "Lead", default: null },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    company: { type: String, trim: true, maxlength: 160 },
    role: { type: String, trim: true, maxlength: 120 },
    linkedinUrl: { type: String, required: true, trim: true, maxlength: 500 },
    stage: { type: String, enum: OUTREACH_STAGES, default: "identified" },
    templateId: { type: Schema.Types.ObjectId, ref: "EmailTemplate", default: null },
    lastActionAt: { type: Date, default: null },
    nextActionAt: { type: Date, default: null },
    notes: {
      type: [new Schema<OutreachNote>({ at: Date, by: String, text: { type: String, maxlength: 4000 } }, { _id: false })],
      default: [],
    },
    history: {
      type: [
        new Schema<OutreachHistory>(
          { at: Date, stage: { type: String, enum: OUTREACH_STAGES }, note: { type: String, maxlength: 4000 } },
          { _id: false }
        ),
      ],
      default: [],
    },
  },
  {
    timestamps: true,
    toJSON: {
      versionKey: false,
      transform: (_doc, ret) => outreachWire(ret as unknown as IOutreachTarget & { _id: unknown }),
    },
  }
);

// One pipeline entry per profile, and per lead. Partial rather than sparse:
// inline targets store leadId as null, which a sparse index would still index.
OutreachTargetSchema.index({ linkedinUrl: 1 }, { unique: true });
OutreachTargetSchema.index({ leadId: 1 }, { unique: true, partialFilterExpression: { leadId: { $type: "objectId" } } });
// The kanban (by stage) and the due list.
OutreachTargetSchema.index({ stage: 1, updatedAt: -1 });
OutreachTargetSchema.index({ nextActionAt: 1 });

export type OutreachTargetDoc = HydratedDocument<IOutreachTarget>;
export const OutreachTarget: Model<IOutreachTarget> =
  (mongoose.models.OutreachTarget as Model<IOutreachTarget> | undefined) ??
  model<IOutreachTarget>("OutreachTarget", OutreachTargetSchema);
