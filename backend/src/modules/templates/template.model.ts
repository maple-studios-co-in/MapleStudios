import mongoose, { Schema, model, type HydratedDocument, type Model } from "mongoose";
import { mergeFieldsIn } from "../../lib/merge.js";

export const TEMPLATE_CHANNELS = ["email", "linkedin"] as const;
export type TemplateChannel = (typeof TEMPLATE_CHANNELS)[number];
export const TEMPLATE_CATEGORIES = ["cold", "followup", "nurture", "other"] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export interface IEmailTemplate {
  name: string;
  channel: TemplateChannel;
  category: TemplateCategory;
  subject?: string;
  preheader?: string;
  html?: string;
  text: string;
  /** every {{field}} the template references — derived on save */
  mergeFields: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

export function templateWire(t: IEmailTemplate & { _id: unknown }) {
  return {
    id: String(t._id),
    name: t.name,
    channel: t.channel,
    category: t.category,
    subject: t.subject ?? "",
    preheader: t.preheader ?? "",
    html: t.html ?? "",
    text: t.text,
    mergeFields: t.mergeFields ?? [],
    createdAt: t.createdAt ? new Date(t.createdAt).toISOString() : null,
    updatedAt: t.updatedAt ? new Date(t.updatedAt).toISOString() : null,
  };
}

const TemplateSchema = new Schema<IEmailTemplate>(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    channel: { type: String, enum: TEMPLATE_CHANNELS, required: true },
    category: { type: String, enum: TEMPLATE_CATEGORIES, default: "other" },
    subject: { type: String, trim: true, maxlength: 300 },
    preheader: { type: String, trim: true, maxlength: 300 },
    html: { type: String, maxlength: 200_000 },
    text: { type: String, required: true, maxlength: 20_000 },
    mergeFields: { type: [String], default: [] },
  },
  {
    timestamps: true,
    toJSON: { versionKey: false, transform: (_doc, ret) => templateWire(ret as unknown as IEmailTemplate & { _id: unknown }) },
  }
);

// Keep mergeFields honest however the document is saved.
TemplateSchema.pre("validate", function () {
  this.mergeFields = mergeFieldsIn([this.subject ?? "", this.preheader ?? "", this.html ?? "", this.text]);
});

TemplateSchema.index({ channel: 1, updatedAt: -1 });

export type EmailTemplateDoc = HydratedDocument<IEmailTemplate>;
export const EmailTemplate: Model<IEmailTemplate> =
  (mongoose.models.EmailTemplate as Model<IEmailTemplate> | undefined) ??
  model<IEmailTemplate>("EmailTemplate", TemplateSchema);
