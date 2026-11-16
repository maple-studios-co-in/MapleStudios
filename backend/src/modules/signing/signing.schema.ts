import { z } from "zod";
import { date, id, revision, text } from "../business/business.schema.js";

const singleLine = (limit: number) => text(limit).refine(
  value => !/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(value), "Use visible text on one line.",
);
const required = (limit: number) => singleLine(limit).refine(Boolean, "This field is required.");
const email = z.string().trim().toLowerCase().max(254).email();
const consent = z.literal(true, { error: "Affirmative consent is required." });
export const contentHash = z.string().regex(/^[a-f0-9]{64}$/);
export const linkSecret = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const linkDays = z.number().int().min(1).max(30).default(7);
const issueFields = z.strictObject({
  draftId: id,
  draftRevision: revision,
  linkDays,
  signerName: required(140),
  signerEmail: email,
  signerCapacity: required(140),
  sowReference: required(200),
  sowDate: date,
  feesPaise: z.number().int().min(0).max(999_999_999_999),
  personalOrProductionData: z.boolean(),
  personalDataSchedule: singleLine(400).default(""),
  personalDataScheduleDate: date.optional(),
  providers: z.array(z.strictObject({
    name: required(140),
    purpose: required(400),
    usesAi: z.boolean(),
  })).max(20),
  providerApprovalReference: singleLine(200).default(""),
  providerApprovalDate: date.optional(),
  backupRetentionDays: z.literal(30, { error: "The studio's current backup retention limit is 30 days." }),
  incidentEmail: email,
});
function completionDetails(value: z.infer<typeof issueFields>, ctx: z.RefinementCtx) {
  if (value.personalOrProductionData && (!value.personalDataSchedule || !value.personalDataScheduleDate))
    ctx.addIssue({ code: "custom", path: ["personalDataSchedule"], message: "Provide the approved schedule reference and date." });
  if (Boolean(value.personalDataSchedule) !== Boolean(value.personalDataScheduleDate))
    ctx.addIssue({ code: "custom", path: ["personalDataSchedule"], message: "Provide the schedule reference and date together." });
  if (value.providers.length && (!value.providerApprovalReference || !value.providerApprovalDate))
    ctx.addIssue({ code: "custom", path: ["providerApprovalReference"], message: "Provide the provider approval reference and date." });
  if (Boolean(value.providerApprovalReference) !== Boolean(value.providerApprovalDate))
    ctx.addIssue({ code: "custom", path: ["providerApprovalReference"], message: "Provide the provider approval reference and date together." });
}
export const previewInput = issueFields.superRefine(completionDetails);
export const issueInput = issueFields.extend({ previewHash: contentHash }).superRefine(completionDetails);
export type PreviewInput = z.infer<typeof previewInput>;
export type AgreementDetails = Omit<PreviewInput, "draftId" | "draftRevision" | "linkDays">;
export const linkInput = z.strictObject({ days: linkDays });
export const codeInput = z.strictObject({ secret: linkSecret });
export const verifyInput = codeInput.extend({ code: z.string().regex(/^\d{6}$/) });
export const signInput = z.strictObject({
  contentHash, name: required(140), capacity: required(140), consent, place: singleLine(140).default(""),
});
export const studioSignerInput = z.strictObject({ name: required(160), capacity: required(160) });
export const counterInput = signInput.extend(studioSignerInput.shape);
export const closeInput = z.strictObject({ reason: required(500) });
export const holdInput = closeInput.extend({ held: z.boolean() });
export const purgeInput = z.strictObject({ confirm: consent });

export const consentVersion = 2;
export const clientConsent = "I confirm that I am authorized to represent the client in the stated capacity. I have reviewed this copy, agree to its terms, and consent to sign it electronically.";
export const ownerConsent = "I have reviewed this copy and the client's signature. I consent to countersign this agreement electronically on behalf of the studio.";
