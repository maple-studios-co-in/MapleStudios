import { z } from "zod";
import { LEAD_STAGES } from "./lead.model.js";
import type { LeadFilter } from "./segment.model.js";
import { normalisePhone } from "../../lib/phone.js";

const objectId = (what: string) => z.string().regex(/^[a-f\d]{24}$/i, `Malformed ${what} id.`);
export const leadIdParam = z.object({ id: objectId("lead") });
export const segmentIdParam = z.object({ id: objectId("segment") });

/* ---- building blocks ---- */

// The console clears a text input by sending "". Treat that as null so a
// PATCH can tell "leave alone" (absent) from "empty this" ("" or null).
const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const text = (max: number) => z.string().trim().max(max);
const optText = (max: number) => z.preprocess(blank, text(max).nullable().optional());

export const emailField = z.string().trim().toLowerCase().email("That email address does not look right.");
const optEmail = z.preprocess(blank, emailField.nullable().optional());

/** Anything a human types; stored as E.164 so the unique index can match spellings. */
const phoneField = z
  .string()
  .trim()
  .max(40)
  .transform((v, ctx) => {
    const e164 = normalisePhone(v);
    if (!e164) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "That phone number does not look right." });
      return z.NEVER;
    }
    return e164;
  });
const optPhone = z.preprocess(blank, phoneField.nullable().optional());

/** ["a", "b"] or "a, b" - trimmed, de-duplicated, empties dropped. */
const tagsField = z
  .union([z.string(), z.array(z.string())])
  .transform((v) => {
    const parts = (Array.isArray(v) ? v : v.split(",")).map((t) => t.trim()).filter(Boolean);
    return [...new Set(parts)];
  })
  .pipe(z.array(z.string().max(60)).max(50));

/** A Map key MongoDB and Mongoose both accept: no dots or dollars, bounded. */
export function customKey(name: string): string {
  return name.trim().replace(/[.$]/g, "_").slice(0, 60);
}

const customField = z.record(z.string().min(1).max(60), z.string().max(1000)).transform((rec) => {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(rec)) {
    const key = customKey(k);
    if (key) out[key] = v;
  }
  return out;
});

const leadFields = {
  lastName: optText(120),
  email: optEmail,
  phone: optPhone,
  company: optText(160),
  role: optText(120),
  website: optText(300),
  industry: optText(120),
  city: optText(120),
  segment: optText(120),
  source: optText(120),
  owner: optText(120),
  nextAction: z.object({ at: z.coerce.date(), note: optText(400) }).nullable().optional(),
  lastContactedAt: z.coerce.date().nullable().optional(),
  suppressed: z.boolean().optional(),
  /** Replaces the whole map - the drawer edits the full set at once. */
  custom: customField.optional(),
};

export const createLeadSchema = z
  .object({
    ...leadFields,
    firstName: text(120).min(1, "First name is required."),
    tags: tagsField.default([]),
    stage: z.enum(LEAD_STAGES).default("new"),
  })
  .refine((v) => Boolean(v.email) || Boolean(v.phone), {
    message: "A lead needs an email address or a phone number.",
    path: ["email"],
  });
export type CreateLeadInput = z.infer<typeof createLeadSchema>;

export const patchLeadSchema = z
  .object({
    ...leadFields,
    firstName: text(120).min(1, "First name is required.").optional(),
    tags: tagsField.optional(),
    stage: z.enum(LEAD_STAGES).optional(),
    // Clearing this is the only way back onto a campaign audience after an
    // accidental "unsubscribed" stage, so it has to be an explicit act.
    unsubscribedAt: z.coerce.date().nullable().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Nothing to update." });
export type PatchLeadInput = z.infer<typeof patchLeadSchema>;

export const noteSchema = z.object({ text: text(4000).min(1, "Write something first.") });

export const bulkLeadsSchema = z
  .object({
    ids: z
      .array(objectId("lead"))
      .min(1)
      .max(500)
      .transform((ids) => [...new Set(ids)]),
    set: z.object({ stage: z.enum(LEAD_STAGES).optional(), owner: optText(120) }).optional(),
    addTags: tagsField.optional(),
    removeTags: tagsField.optional(),
  })
  .refine(
    (v) =>
      v.set?.stage !== undefined ||
      v.set?.owner !== undefined ||
      Boolean(v.addTags?.length) ||
      Boolean(v.removeTags?.length),
    { message: "Nothing to change.", path: ["set"] }
  );
export type BulkLeadsInput = z.infer<typeof bulkLeadsSchema>;

/* ---- filters: query-string form (lists, export) and JSON form (segments) ---- */

/** "a,b" or ?x=a&x=b -> ["a", "b"]; absent or empty -> undefined. */
const csvParam = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined;
    const parts = (Array.isArray(v) ? v : [v])
      .flatMap((s) => s.split(","))
      .map((s) => s.trim())
      .filter(Boolean);
    return parts.length ? [...new Set(parts)] : undefined;
  });
const boolParam = z
  .enum(["true", "false"])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === "true"));

export const leadFilterQuery = z.object({
  stage: csvParam.pipe(z.array(z.enum(LEAD_STAGES)).optional()),
  tags: csvParam,
  segment: text(120).optional(),
  owner: text(120).optional(),
  industry: text(120).optional(),
  city: text(120).optional(),
  hasEmail: boolParam,
  hasPhone: boolParam,
  q: text(120).optional(),
});

export const listLeadsQuery = leadFilterQuery.extend({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.enum(["updatedAt", "createdAt", "company"]).default("updatedAt"),
});
export type ListLeadsQuery = z.infer<typeof listLeadsQuery>;

export const exportLeadsQuery = leadFilterQuery;

export const leadFilterSchema = z
  .object({
    stage: z.array(z.enum(LEAD_STAGES)).optional(),
    tags: tagsField.optional(),
    segment: optText(120),
    owner: optText(120),
    industry: optText(120),
    city: optText(120),
    hasEmail: z.boolean().optional(),
    hasPhone: z.boolean().optional(),
    q: optText(120),
  })
  .transform((f): LeadFilter => {
    // Keep only what was actually set, so a saved filter reads as written.
    const out: LeadFilter = {};
    if (f.stage?.length) out.stage = [...new Set(f.stage)];
    if (f.tags?.length) out.tags = f.tags;
    if (f.segment) out.segment = f.segment;
    if (f.owner) out.owner = f.owner;
    if (f.industry) out.industry = f.industry;
    if (f.city) out.city = f.city;
    if (f.hasEmail !== undefined) out.hasEmail = f.hasEmail;
    if (f.hasPhone !== undefined) out.hasPhone = f.hasPhone;
    if (f.q) out.q = f.q;
    return out;
  });

export const createSegmentSchema = z.object({
  name: text(120).min(1, "Give the segment a name."),
  filter: leadFilterSchema.default({}),
});
export const patchSegmentSchema = z
  .object({
    name: text(120).min(1, "Give the segment a name.").optional(),
    filter: leadFilterSchema.optional(),
  })
  .refine((v) => v.name !== undefined || v.filter !== undefined, { message: "Nothing to update." });

/* ---- CSV import ---- */

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
export type LeadImportField = (typeof LEAD_IMPORT_FIELDS)[number];
/** Where a CSV column goes: a lead field, a custom field, or nowhere. */
export type ColumnTarget = LeadImportField | `custom:${string}` | "ignore";

export function isLeadImportField(v: string): v is LeadImportField {
  return (LEAD_IMPORT_FIELDS as readonly string[]).includes(v);
}
export function isColumnTarget(v: string): v is ColumnTarget {
  return v === "ignore" || v.startsWith("custom:") || isLeadImportField(v);
}

export const importMappingSchema = z.record(
  z.string(),
  z.string().refine(isColumnTarget, "Map each column to a lead field, custom:<name> or ignore.")
);

export const importQuery = z.object({
  /** JSON in the query string; absent means "use the server's guess". */
  mapping: z
    .string()
    .optional()
    .transform((s, ctx) => {
      if (!s) return undefined;
      try {
        return JSON.parse(s) as unknown;
      } catch {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "mapping must be a JSON object." });
        return z.NEVER;
      }
    })
    .pipe(importMappingSchema.optional()),
  dedupe: z.enum(["skip", "update"]).default("skip"),
  tags: csvParam,
  source: text(120).optional(),
});
export type ImportQuery = z.infer<typeof importQuery>;

/** The CSV arrives as the raw file text (express.text for text/csv). */
export const csvBody = z
  .string({
    required_error: "Send the CSV as a text/csv request body.",
    invalid_type_error: "Send the CSV as a text/csv request body.",
  })
  .min(1, "The CSV is empty.");
