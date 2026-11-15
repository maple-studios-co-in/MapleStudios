import mongoose, {
  Schema,
  model,
  type InferSchemaType,
  type Model,
} from "mongoose";
import { businessOptions } from "./business.model.js";
const companySchema = new Schema(
  {
    _id: { type: String, default: "company" },
    profile: { type: Schema.Types.Mixed, required: true },
    revision: { type: Number, default: 0 },
    updatedBy: String,
  },
  businessOptions,
);
const templateSchema = new Schema(
  {
    name: { type: String, required: true },
    kind: {
      type: String,
      enum: ["onboarding", "update", "confidentiality"],
      required: true,
    },
    body: { type: String, required: true },
    subject: { type: String, default: "" },
    status: { type: String, enum: ["draft", "published"], default: "draft" },
    revision: { type: Number, default: 0 },
    versions: { type: [Schema.Types.Mixed], default: [] },
    updatedBy: String,
  },
  businessOptions,
);
const draftSchema = new Schema(
  {
    projectId: { type: String, required: true, index: true },
    clientId: { type: String, required: true, index: true },
    kind: {
      type: String,
      required: true,
      enum: ["onboarding", "update", "invoice", "confidentiality"],
    },
    title: { type: String, required: true },
    subject: { type: String, default: "" },
    body: { type: String, required: true },
    snapshot: { type: Schema.Types.Mixed, required: true },
    missing: { type: [String], default: [] },
    revision: { type: Number, default: 0 },
    versions: { type: [Schema.Types.Mixed], default: [] },
    createdBy: String,
    updatedBy: String,
  },
  businessOptions,
);
draftSchema.index({ projectId: 1, createdAt: -1, _id: -1 });
function registered<T>(name: string, schema: Schema<T>): Model<T> {
  return (
    (mongoose.models[name] as Model<T> | undefined) || model<T>(name, schema)
  );
}
export const BusinessCompany = registered<
  InferSchemaType<typeof companySchema>
>("BusinessCompany", companySchema);
export const BusinessTemplate = registered<
  InferSchemaType<typeof templateSchema>
>("BusinessTemplate", templateSchema);
export const BusinessDraft = registered<InferSchemaType<typeof draftSchema>>(
  "BusinessDraft",
  draftSchema,
);
