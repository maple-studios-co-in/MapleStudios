import { Inquiry, type InquiryStatus } from "./inquiry.model.js";
import { AppError } from "../../lib/AppError.js";

export interface CreateInquiryInput {
  name: string;
  email: string;
  company?: string;
  service: string;
  budget: string;
  message: string;
  ip?: string;
  userAgent?: string;
}

export async function createInquiry(input: CreateInquiryInput) {
  return Inquiry.create({ ...input, status: "new" });
}

export interface ListOptions {
  status?: InquiryStatus;
  q?: string;
  page: number;
  limit: number;
}

export async function listInquiries({ status, q, page, limit }: ListOptions) {
  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;
  // $text uses the compound text index; skipped entirely when q is absent.
  if (q) filter.$text = { $search: q };

  const [items, total] = await Promise.all([
    Inquiry.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec(),
    Inquiry.countDocuments(filter).exec(),
  ]);

  return { items, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) };
}

/** Every inquiry matching a filter, for CSV export. Capped defensively. */
export async function listAllForExport(status?: InquiryStatus) {
  return Inquiry.find(status ? { status } : {})
    .sort({ createdAt: -1 })
    .limit(5000)
    .exec();
}

export async function setStatus(id: string, status: InquiryStatus) {
  const updated = await Inquiry.findByIdAndUpdate(
    id,
    { $set: { status } },
    { new: true, runValidators: true }
  ).exec();
  if (!updated) throw AppError.notFound("That inquiry no longer exists.");
  return updated;
}

export async function deleteInquiry(id: string): Promise<void> {
  const deleted = await Inquiry.findByIdAndDelete(id).exec();
  if (!deleted) throw AppError.notFound("That inquiry no longer exists.");
}
