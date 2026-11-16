import mongoose, { model, Schema, type Model } from "mongoose";
import type { AgreementDetails } from "./signing.schema.js";

export type SigningStatus = "awaiting-client" | "awaiting-owner" | "completed" | "closed-incomplete" | "purged";
export type EventType = "issued" | "client-signed" | "owner-signed" | "link-revoked" | "link-renewed"
  | "closed-incomplete" | "hold-placed" | "hold-released" | "purged";
export type SigningEvent = { type: EventType; at: Date; actorId?: string; reason?: string };
export type SigningSnapshot = {
  version: 1;
  source: { draftId: string; draftRevision: number; templateId: string; templateRevision: number };
  title: string;
  body: string;
  completion: string;
  details: AgreementDetails;
  studioSigner?: { name: string; capacity: string };
  retention: { months: number; basis: string; legalHoldPolicy: string; notice: string };
  consent: { client: string; owner: string };
};
export type Signature = {
  name: string;
  capacity: string;
  place: string;
  signedAt: Date;
  verifiedAt: Date;
};
type Link = { hash: string; createdAt: Date; expiresAt: Date; mode: "sign" | "view"; revokedAt?: Date };
type Code = { nonce: string; hash: string; expiresAt: Date; attempts: number; delivered: boolean };
type Session = { hash: string; expiresAt: Date; verifiedAt: Date };
export interface SigningEnvelope {
  _id: string;
  status: SigningStatus;
  snapshot?: SigningSnapshot;
  contentHash?: string;
  pdf?: Buffer;
  pdfHash?: string;
  link?: Link;
  otp?: Code;
  session?: Session;
  lastCodeAt?: Date;
  clientSignature?: Signature;
  ownerSignature?: Signature;
  createdAt?: Date;
  completedAt?: Date;
  closedAt?: Date;
  retentionDueAt?: Date;
  purgedAt?: Date;
  held?: boolean;
  events: SigningEvent[];
  linkChanges?: number;
  holdChanges?: number;
  revision?: number;
}

const link = new Schema<Link>({
  hash: String, createdAt: Date, expiresAt: Date, mode: String, revokedAt: Date,
}, { _id: false });
const otp = new Schema<Code>({
  nonce: String, hash: String, expiresAt: Date, attempts: Number, delivered: Boolean,
}, { _id: false });
const session = new Schema<Session>({
  hash: String, expiresAt: Date, verifiedAt: Date,
}, { _id: false });
const signature = new Schema<Signature>({
  name: String, capacity: String, place: String, signedAt: Date, verifiedAt: Date,
}, { _id: false });
const event = new Schema<SigningEvent>({
  type: String, at: Date, actorId: String, reason: String,
}, { _id: false });
const envelope = new Schema<SigningEnvelope>({
  _id: String,
  status: { type: String, required: true },
  snapshot: { type: Schema.Types.Mixed, immutable: true },
  contentHash: { type: String, immutable: true },
  pdf: { type: Buffer, select: false },
  pdfHash: String,
  link,
  otp,
  session,
  lastCodeAt: Date,
  clientSignature: signature,
  ownerSignature: signature,
  createdAt: Date,
  completedAt: Date,
  closedAt: Date,
  retentionDueAt: Date,
  purgedAt: Date,
  held: Boolean,
  events: [event],
  linkChanges: Number,
  holdChanges: Number,
  revision: Number,
}, { minimize: false, versionKey: false });
envelope.index({ createdAt: -1, _id: -1 });
envelope.index({ "otp.expiresAt": 1 }, { sparse: true });
envelope.index({ "session.expiresAt": 1 }, { sparse: true });

type DeliveryBudget = { _id: string; count: number; expiresAt: Date };
const deliveryBudget = new Schema<DeliveryBudget>({
  _id: String, count: Number, expiresAt: { type: Date, expires: 0 },
}, { versionKey: false });

export const Envelope: Model<SigningEnvelope> =
  (mongoose.models.SigningEnvelope as Model<SigningEnvelope> | undefined) ??
  model<SigningEnvelope>("SigningEnvelope", envelope);
export const DeliveryBudget: Model<DeliveryBudget> =
  (mongoose.models.SigningDeliveryBudget as Model<DeliveryBudget> | undefined) ??
  model<DeliveryBudget>("SigningDeliveryBudget", deliveryBudget);
