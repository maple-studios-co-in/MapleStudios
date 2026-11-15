import { z } from "zod";
import { date, text } from "./business.schema.js";
import { AppError } from "../../lib/AppError.js";
const money = z.number().int().min(0).max(1_000_000_000);
export const invoiceInput = z
  .object({
    reference: text(40).min(1),
    issueDate: date,
    dueDate: date,
    poNumber: text(100).default(""),
    placeOfSupply: text(160).default(""),
    taxMode: z.enum(["none", "intra", "inter"]),
    lines: z
      .array(
        z
          .object({
            description: text(1000).min(1),
            sac: text(8).default(""),
            quantityHundredths: z.number().int().min(1).max(10_000_000),
            unitPrice: money,
            discount: money.default(0),
            taxRateBps: z.number().int().min(0).max(10000).default(0),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    notes: text(5000).default(""),
  })
  .strict();
export type InvoiceInput = z.infer<typeof invoiceInput>;
const round = (n: bigint, d: bigint) => Number((n + d / 2n) / d);
export function calculateInvoice(input: unknown) {
  const value = invoiceInput.parse(input);
  if (value.dueDate < value.issueDate)
    throw AppError.badRequest("Payment due date must follow the invoice date.");
  const lines = value.lines.map((line) => {
    const gross = round(
      BigInt(line.quantityHundredths) * BigInt(line.unitPrice),
      100n,
    );
    if (line.discount > gross)
      throw AppError.badRequest("A line discount cannot exceed its value.");
    if (value.taxMode === "none" && line.taxRateBps !== 0)
      throw AppError.badRequest("Set tax rates to zero for a no-tax draft.");
    const taxable = gross - line.discount;
    const half =
      value.taxMode === "intra"
        ? round(BigInt(taxable) * BigInt(line.taxRateBps), 20000n)
        : 0;
    const igst =
      value.taxMode === "inter"
        ? round(BigInt(taxable) * BigInt(line.taxRateBps), 10000n)
        : 0;
    return {
      ...line,
      gross,
      taxable,
      cgst: half,
      sgst: half,
      igst,
      total: taxable + half * 2 + igst,
    };
  });
  const totals = lines.reduce(
    (t, l) => ({
      subtotal: t.subtotal + l.gross,
      discount: t.discount + l.discount,
      taxable: t.taxable + l.taxable,
      cgst: t.cgst + l.cgst,
      sgst: t.sgst + l.sgst,
      igst: t.igst + l.igst,
      total: t.total + l.total,
    }),
    {
      subtotal: 0,
      discount: 0,
      taxable: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
      total: 0,
    },
  );
  if (
    Object.values(totals).some(
      (n) => !Number.isSafeInteger(n) || n > 1_000_000_000_000,
    )
  )
    throw AppError.badRequest("Invoice amounts exceed the supported limit.");
  return { ...value, currency: "INR" as const, lines, totals };
}
export type CalculatedInvoice = ReturnType<typeof calculateInvoice>;
