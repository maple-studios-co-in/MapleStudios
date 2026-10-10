import mongoose, { Schema, model, type HydratedDocument, type Model } from "mongoose";

export const SUPPRESSION_REASONS = ["unsubscribe", "bounce", "complaint", "manual"] as const;
export type SuppressionReason = (typeof SUPPRESSION_REASONS)[number];

/** An address we must never email again, whatever list it turns up on. */
export interface ISuppression {
  email: string;
  reason: SuppressionReason;
  note?: string;
  createdAt?: Date;
}

export function suppressionWire(s: ISuppression & { _id: unknown }) {
  return {
    id: String(s._id),
    email: s.email,
    reason: s.reason,
    note: s.note ?? "",
    createdAt: s.createdAt ? new Date(s.createdAt).toISOString() : null,
  };
}

const SuppressionSchema = new Schema<ISuppression>(
  {
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 200 },
    reason: { type: String, enum: SUPPRESSION_REASONS, required: true },
    note: { type: String, trim: true, maxlength: 400 },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: { versionKey: false, transform: (_doc, ret) => suppressionWire(ret as unknown as ISuppression & { _id: unknown }) },
  }
);
SuppressionSchema.index({ email: 1 }, { unique: true });

export type SuppressionDoc = HydratedDocument<ISuppression>;
export const Suppression: Model<ISuppression> =
  (mongoose.models.Suppression as Model<ISuppression> | undefined) ??
  model<ISuppression>("Suppression", SuppressionSchema);

/** Upsert: a second reason for the same address keeps the first record. */
export async function suppress(email: string, reason: SuppressionReason, note?: string) {
  await Suppression.updateOne(
    { email: email.toLowerCase() },
    { $setOnInsert: { email: email.toLowerCase(), reason, ...(note ? { note } : {}) } },
    { upsert: true }
  ).exec();
}

export async function isSuppressed(email: string): Promise<boolean> {
  return Boolean(await Suppression.exists({ email: email.toLowerCase() }).exec());
}
