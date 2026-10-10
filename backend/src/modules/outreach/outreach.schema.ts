import { z } from "zod";
import { OUTREACH_STAGES } from "./outreach.model.js";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Malformed id.");

const isoDate = z
  .string()
  .datetime({ offset: true, message: "Use an ISO date-time such as 2026-10-12T10:30:00+05:30." })
  .transform((s) => new Date(s));

/**
 * A linkedin.com profile link, normalised so the same person pasted with a
 * tracking query or a trailing slash is recognised as a duplicate.
 */
const linkedinUrl = z
  .string()
  .trim()
  .max(500)
  .url("Enter the LinkedIn profile URL.")
  .refine((u) => /^https?:\/\/([a-z0-9-]+\.)?linkedin\.com\//i.test(u), "Enter a linkedin.com profile URL.")
  .transform((u) => {
    const url = new URL(u);
    return `https://${url.hostname.toLowerCase()}${url.pathname.replace(/\/+$/, "")}`;
  });

const text = (max: number) => z.string().trim().max(max);

export const idParam = z.object({ id: objectId });

export const createTargetSchema = z
  .object({
    leadId: objectId.optional(),
    name: text(160).min(1).optional(),
    company: text(160).optional(),
    role: text(120).optional(),
    linkedinUrl,
    stage: z.enum(OUTREACH_STAGES).optional(),
    templateId: objectId.optional(),
    nextActionAt: isoDate.optional(),
  })
  .refine((o) => o.leadId || o.name, { path: ["name"], message: "Give the person a name or pick a lead." });
export type CreateTargetInput = z.infer<typeof createTargetSchema>;

export const patchTargetSchema = z
  .object({
    name: text(160).min(1).optional(),
    company: text(160).optional(),
    role: text(120).optional(),
    linkedinUrl: linkedinUrl.optional(),
    leadId: objectId.nullable().optional(),
    templateId: objectId.nullable().optional(),
    nextActionAt: isoDate.nullable().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, "Nothing to update.");
export type PatchTargetInput = z.infer<typeof patchTargetSchema>;

export const advanceSchema = z.object({
  stage: z.enum(OUTREACH_STAGES),
  note: text(4000).optional(),
  nextActionAt: isoDate.nullable().optional(),
});
export type AdvanceInput = z.infer<typeof advanceSchema>;

export const renderSchema = z.object({ templateId: objectId });

export const noteSchema = z.object({ text: text(4000).min(1, "Write the note first.") });

export const listTargetsQuery = z.object({
  stage: z.enum(OUTREACH_STAGES).optional(),
  q: text(120).optional(),
  due: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListTargetsQuery = z.infer<typeof listTargetsQuery>;
