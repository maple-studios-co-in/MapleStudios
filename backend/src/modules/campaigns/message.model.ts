import mongoose, { Schema, Types, model, type HydratedDocument, type Model } from "mongoose";
import { signId } from "../../lib/crypto.js";

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

/** Statuses that still have work ahead of them; a campaign with none is done. */
export const OPEN_MESSAGE_STATUSES: readonly MessageStatus[] = ["queued", "sending"];
/** Statuses meaning the provider accepted the message (it counts as sent). */
export const SENT_MESSAGE_STATUSES: readonly MessageStatus[] = ["sent", "delivered", "bounced", "complained"];

/** One planned email: a campaign step addressed to one lead. */
export interface ICampaignMessage {
  campaignId: Types.ObjectId;
  leadId: Types.ObjectId;
  step: number;
  status: MessageStatus;
  scheduledFor: Date;
  sentAt?: Date | null;
  providerMessageId?: string;
  error?: string;
  /** provider attempts so far; the third failure is final */
  attempts: number;
  /** signId(messageId): the unsubscribe link proves which message it came from */
  unsubscribeToken: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const iso = (d?: Date | null) => (d ? new Date(d).toISOString() : null);

export function messageWire(m: ICampaignMessage & { _id: unknown }) {
  return {
    id: String(m._id),
    campaignId: String(m.campaignId),
    leadId: String(m.leadId),
    step: m.step,
    status: m.status,
    scheduledFor: iso(m.scheduledFor),
    sentAt: iso(m.sentAt),
    providerMessageId: m.providerMessageId ?? null,
    error: m.error ?? null,
    attempts: m.attempts ?? 0,
    unsubscribeToken: m.unsubscribeToken,
    createdAt: iso(m.createdAt),
    updatedAt: iso(m.updatedAt),
  };
}

const MessageSchema = new Schema<ICampaignMessage>(
  {
    campaignId: { type: Schema.Types.ObjectId, required: true },
    leadId: { type: Schema.Types.ObjectId, required: true },
    step: { type: Number, required: true, min: 0 },
    status: { type: String, enum: MESSAGE_STATUSES, default: "queued" },
    scheduledFor: { type: Date, required: true },
    sentAt: { type: Date, default: null },
    providerMessageId: { type: String },
    error: { type: String, maxlength: 1000 },
    attempts: { type: Number, default: 0 },
    unsubscribeToken: { type: String, required: true },
  },
  {
    timestamps: true,
    toJSON: { versionKey: false, transform: (_doc, ret) => messageWire(ret as unknown as ICampaignMessage & { _id: unknown }) },
  }
);

// The tick's "due messages, oldest first" pull and the admin status filter.
MessageSchema.index({ campaignId: 1, status: 1, scheduledFor: 1 });
// Today's sent count for the daily cap.
MessageSchema.index({ campaignId: 1, sentAt: 1 });
// Unsubscribe and bounce handling cancel a lead's queue across campaigns.
MessageSchema.index({ leadId: 1, status: 1 });
// Webhook events arrive keyed by the provider's id.
MessageSchema.index({ providerMessageId: 1 }, { sparse: true });
// A lead gets each step of a campaign once, even if two starts race.
MessageSchema.index({ campaignId: 1, leadId: 1, step: 1 }, { unique: true });

export type CampaignMessageDoc = HydratedDocument<ICampaignMessage>;
export const CampaignMessage: Model<ICampaignMessage> =
  (mongoose.models.CampaignMessage as Model<ICampaignMessage> | undefined) ??
  model<ICampaignMessage>("CampaignMessage", MessageSchema);

/**
 * A new queued message with its token already derived. The id is minted here
 * rather than by the insert so the token can be stored in the same write.
 */
export function newMessage(input: { campaignId: Types.ObjectId; leadId: Types.ObjectId; step: number; scheduledFor: Date }) {
  const _id = new Types.ObjectId();
  return { _id, ...input, status: "queued" as const, attempts: 0, unsubscribeToken: signId(String(_id)) };
}
