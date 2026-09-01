import mongoose, { Schema, model, type HydratedDocument, type Model } from "mongoose";

export const INQUIRY_STATUSES = ["new", "read", "archived"] as const;
export type InquiryStatus = (typeof INQUIRY_STATUSES)[number];

export interface IInquiry {
  name: string;
  email: string;
  company?: string;
  service: string;
  budget: string;
  message: string;
  status: InquiryStatus;
  /** Kept for abuse triage only; never returned to the public API. */
  ip?: string;
  userAgent?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/** The shape the admin dashboard expects. */
export function inquiryWire(i: IInquiry & { _id: unknown }) {
  return {
    id: String(i._id),
    at: new Date(i.createdAt ?? Date.now()).toISOString(),
    name: i.name,
    email: i.email,
    ...(i.company ? { company: i.company } : {}),
    service: i.service,
    budget: i.budget,
    message: i.message,
    status: i.status,
  };
}

const InquirySchema = new Schema<IInquiry>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 200 },
    company: { type: String, trim: true, maxlength: 160 },
    service: { type: String, required: true, trim: true, maxlength: 120 },
    budget: { type: String, required: true, trim: true, maxlength: 120 },
    message: { type: String, required: true, trim: true, maxlength: 5000 },
    status: { type: String, enum: INQUIRY_STATUSES, default: "new", index: true },
    ip: { type: String, select: false },
    userAgent: { type: String, select: false, maxlength: 400 },
  },
  {
    timestamps: true,
    toJSON: {
      versionKey: false,
      transform: (_doc, ret) => inquiryWire(ret as unknown as IInquiry & { _id: unknown }),
    },
  }
);

// Inbox default view, and the same view filtered by status.
InquirySchema.index({ createdAt: -1 });
InquirySchema.index({ status: 1, createdAt: -1 });
// Free-text search across the fields the admin actually searches.
InquirySchema.index({ name: "text", email: "text", company: "text", message: "text" });

export type InquiryDoc = HydratedDocument<IInquiry>;
// Reuse an already-compiled model. Vitest keeps one process across test
// files, so this module can be evaluated twice; a bare model() call would
// then throw OverwriteModelError.
export const Inquiry: Model<IInquiry> =
  (mongoose.models.Inquiry as Model<IInquiry> | undefined) ??
  model<IInquiry>("Inquiry", InquirySchema);
