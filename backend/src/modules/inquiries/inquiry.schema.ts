import { z } from "zod";
import { INQUIRY_STATUSES } from "./inquiry.model.js";

export const createInquirySchema = z.object({
  name: z.string().trim().min(1, "Please enter your name.").max(120),
  email: z.string().trim().toLowerCase().email("That email address does not look right."),
  company: z.string().trim().max(160).optional(),
  service: z.string().trim().min(1, "Please select a service.").max(120),
  budget: z.string().trim().min(1, "Please select an estimated budget.").max(120),
  message: z
    .string()
    .trim()
    .min(1, "Please tell us a little about the project.")
    .max(5000),
});

export const listInquiriesQuery = z.object({
  status: z.enum(INQUIRY_STATUSES).optional(),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const exportInquiriesQuery = z.object({
  status: z.enum(INQUIRY_STATUSES).optional(),
});

export const inquiryIdParam = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, "Malformed inquiry id."),
});

export const patchInquirySchema = z.object({
  status: z.enum(INQUIRY_STATUSES),
});
