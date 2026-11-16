import mongoose, { Schema, model, type Model } from "mongoose";

export const attestationIds = [
  "devices", "staff-confidentiality", "offboarding", "cloud-mfa", "provider-permissions", "incident-response",
] as const;
export type AttestationId = typeof attestationIds[number];
export interface Attestation {
  id: AttestationId;
  scope: string;
  confirmedAt: Date;
  confirmedBy: { id: string; email: string };
}
interface AttestationEvent extends Attestation { confirmed: boolean; revision: number }

export interface ISecurityPolicy {
  _id: "studio";
  revision: number;
  agreementRetentionMonths: number | null;
  retentionBasis: string;
  legalHoldPolicy: string;
  attestations: Attestation[];
  attestationHistory: AttestationEvent[];
  mfaEnforcedAt?: Date;
}
const fields = {
  id: { type: String, enum: attestationIds, required: true },
  scope: { type: String, required: true },
  confirmedAt: { type: Date, required: true },
  confirmedBy: { id: { type: String, required: true }, email: { type: String, required: true } },
};
const policySchema = new Schema<ISecurityPolicy>({
  _id: { type: String, enum: ["studio"] },
  revision: { type: Number, default: 0 },
  agreementRetentionMonths: { type: Number, default: null },
  retentionBasis: { type: String, default: "" },
  legalHoldPolicy: { type: String, default: "" },
  attestations: { type: [new Schema(fields, { _id: false })], default: [] },
  attestationHistory: {
    type: [new Schema({ ...fields, confirmed: Boolean, revision: Number }, { _id: false })],
    default: [],
    select: false,
  },
  mfaEnforcedAt: { type: Date, select: false },
}, { timestamps: true });

export const SecurityPolicy: Model<ISecurityPolicy> =
  (mongoose.models.SecurityPolicy as Model<ISecurityPolicy> | undefined) ??
  model<ISecurityPolicy>("SecurityPolicy", policySchema);
