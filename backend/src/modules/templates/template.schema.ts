import { z } from "zod";
import { TEMPLATE_CATEGORIES, TEMPLATE_CHANNELS } from "./template.model.js";

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Malformed id.");

/**
 * Field-level checks only. Which fields a channel needs (email: subject +
 * html; linkedin: text ≤ 3000) depends on the merged document, so a PATCH
 * cannot be judged from its own body - the service applies that rule to
 * both create and patch in one place (`normaliseTemplate`).
 */
const templateFields = {
  name: z.string().trim().min(1, "Please name the template.").max(160),
  channel: z.enum(TEMPLATE_CHANNELS),
  category: z.enum(TEMPLATE_CATEGORIES),
  subject: z.string().trim().max(300),
  preheader: z.string().trim().max(300),
  html: z.string().max(200_000),
  text: z.string().max(20_000),
};

export const createTemplateSchema = z.object({
  ...templateFields,
  category: templateFields.category.default("other"),
  subject: templateFields.subject.optional(),
  preheader: templateFields.preheader.optional(),
  html: templateFields.html.optional(),
  text: templateFields.text.optional(),
});

export const patchTemplateSchema = z
  .object(templateFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update." });

export const listTemplatesQuery = z.object({
  channel: z.enum(TEMPLATE_CHANNELS).optional(),
  category: z.enum(TEMPLATE_CATEGORIES).optional(),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const templateIdParam = z.object({ id: objectId });

export const renderTemplateSchema = z.object({
  leadId: objectId.optional(),
  /** Overrides for the built-in sample context when no lead is chosen. */
  sample: z.record(z.string().max(80), z.string().max(2000)).optional(),
});

export const testSendSchema = z.object({
  to: z.string().trim().toLowerCase().email("That email address does not look right."),
  leadId: objectId.optional(),
});
