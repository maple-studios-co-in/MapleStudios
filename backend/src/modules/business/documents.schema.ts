import { z } from "zod";
import { text, date, id, revision } from "./business.schema.js";
import { paymentImage } from "./payment-image.js";
import { invoiceInput } from "./invoice.js";
export const kinds = z.enum([
  "onboarding",
  "update",
  "invoice",
  "confidentiality",
]);
export const companyInput = z
  .object({
    name: text(160).min(1),
    legalName: text(160).default(""),
    address: text(700).default(""),
    website: z
      .union([
        z
          .string()
          .url()
          .refine((v) => /^https?:\/\//.test(v)),
        z.literal(""),
      ])
      .default(""),
    email: z.union([z.string().trim().email(), z.literal("")]).default(""),
    phone: text(60).default(""),
    gstin: text(15)
      .refine((v) => !v || /^[0-9]{2}[A-Z0-9]{13}$/.test(v), "Check the GSTIN.")
      .default(""),
    representative: text(160).default(""),
    representativeTitle: text(160).default(""),
    paymentInstructions: text(1500).default(""),
    bankBeneficiary: text(160).default(""),
    bankName: text(160).default(""),
    bankAccount: text(34)
      .regex(/^(?:[0-9]{6,34})?$/, "Use 6–34 digits for the account number.")
      .default(""),
    bankIfsc: text(11)
      .transform((v) => v.toUpperCase())
      .refine(
        (v) => !v || /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v),
        "Enter a valid 11-character IFSC.",
      )
      .default(""),
    upiId: text(100)
      .refine(
        (v) => !v || /^[A-Za-z0-9._-]{2,}@[A-Za-z0-9.-]{2,}$/.test(v),
        "Enter a UPI ID such as name@bank.",
      )
      .default(""),
    upiPayee: text(160).default(""),
    paymentQr: z
      .string()
      .max(70000)
      .default("")
      .transform((v, ctx) => {
        if (!v) return "";
        try {
          return paymentImage(v).url;
        } catch {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              "Upload a valid PNG QR image, at most 1024 pixels and 50 KB.",
          });
          return z.NEVER;
        }
      }),
  })
  .strict();
export type CompanyProfile = z.infer<typeof companyInput>;
export const defaults = companyInput.parse({
  name: "Maple Studios",
  website: "https://maplestudios.ai",
});
export const templateInput = z
  .object({
    id: id.optional(),
    revision,
    name: text(160).min(1),
    kind: z.enum(["onboarding", "update", "confidentiality"]),
    body: text(40000).min(1),
    subject: text(300).default(""),
    status: z.enum(["draft", "published"]),
  })
  .strict();
export const draftInput = z
  .object({
    projectId: id,
    kind: kinds,
    templateId: id.optional(),
    notes: text(5000).default(""),
    periodStart: date.optional(),
    periodEnd: date.optional(),
    reference: text(80).default(""),
    documentDate: date.optional(),
    invoice: invoiceInput.optional(),
  })
  .strict();
export type DraftInput = z.infer<typeof draftInput>;
export const draftEdit = z
  .object({
    revision,
    title: text(200).min(1).optional(),
    subject: text(300).optional(),
    body: text(50000).min(1).optional(),
    invoice: invoiceInput.optional(),
  })
  .strict();
