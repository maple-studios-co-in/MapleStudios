import { z } from "zod";
export const text = (max: number) => z.string().trim().max(max);
export const id = z
  .string()
  .regex(/^[a-f0-9]{24}$/i, "Invalid record reference.");
export const revision = z.number().int().nonnegative();
export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + "T00:00:00Z");
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "Invalid calendar date.");
export const reference = text(1000).refine(
  (v) => !/^\s*(javascript|vbscript|data|file):/i.test(v),
  "Use a document reference or an HTTP(S) link.",
);
export const clientInput = z
  .object({
    name: text(160).min(1),
    contactName: text(160).default(""),
    email: z
      .union([z.string().trim().toLowerCase().email(), z.literal("")])
      .default(""),
    phone: text(60).default(""),
    billingAddress: text(1500).default(""),
    gstin: text(15)
      .refine((v) => !v || /^[0-9]{2}[A-Z0-9]{13}$/.test(v), "Check the GSTIN.")
      .default(""),
    notes: text(5000).default(""),
    status: z.enum(["active", "archived"]).default("active"),
  })
  .strict();
export const projectInput = z
  .object({
    clientId: id,
    title: text(200).min(1),
    scope: text(5000).default(""),
    startDate: date,
    dueDate: date,
    status: z
      .enum(["planned", "active", "on-hold", "completed", "archived"])
      .default("planned"),
    assigneeIds: z
      .array(id)
      .max(100)
      .refine((v) => new Set(v).size === v.length, "Choose each teammate once.")
      .default([]),
  })
  .strict();
export const deliverableInput = z
  .object({
    title: text(200).min(1),
    description: text(5000).default(""),
    assigneeId: z.union([id, z.literal("")]).default(""),
    dueDate: date,
  })
  .strict();
export const progressFields = z
  .object({
    status: z.enum(["planned", "in-progress", "in-review"]).optional(),
    submissionReference: reference.optional(),
    note: text(5000).optional(),
  })
  .strict();
export const managerDeliverablePatch = deliverableInput
  .partial()
  .merge(progressFields)
  .extend({ revision })
  .strict();
export const memberDeliverablePatch = progressFields
  .extend({ revision })
  .strict();
export const decisionInput = z
  .object({
    revision,
    submissionVersion: revision,
    decision: z.enum(["approved", "changes-requested"]),
    approverName: text(160).min(1),
    decisionDate: date,
    evidenceReference: reference.refine(
      (v) => v.length > 0,
      "Add the client's approval reference.",
    ),
  })
  .strict();
export const listQuery = z.object({
  q: text(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  status: text(30).optional(),
});
export function literalSearch(q: string) {
  return new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}

/** Creation defaults must never be written over existing data by a sparse PATCH.
 * Zod 4 also applies defaults in optional fields, so keep only supplied keys
 * after the strict patch schema has validated and transformed them. */
export function parseBusinessPatch<S extends z.ZodType<Record<string, unknown>>>(
  schema: S,
  input: Record<string, unknown>,
): z.output<S> {
  return Object.fromEntries(
    Object.entries(schema.parse(input)).filter(([key]) => Object.hasOwn(input, key)),
  ) as z.output<S>;
}
