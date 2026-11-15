import mongoose, {
  Schema,
  model,
  type InferSchemaType,
  type Model,
} from "mongoose";
export const businessOptions = {
  timestamps: true,
  toJSON: {
    versionKey: false,
    transform: (_doc: unknown, ret: Record<string, unknown>) => {
      ret.id = String(ret._id);
      delete ret._id;
      return ret;
    },
  },
};
const clientSchema = new Schema(
  {
    name: { type: String, required: true },
    contactName: { type: String, default: "" },
    email: { type: String, default: "" },
    phone: { type: String, default: "" },
    billingAddress: { type: String, default: "" },
    gstin: { type: String, default: "" },
    notes: { type: String, default: "" },
    status: { type: String, enum: ["active", "archived"], default: "active" },
    revision: { type: Number, default: 0 },
    updatedBy: String,
  },
  businessOptions,
);
clientSchema.index({ name: 1, _id: 1 });
const projectSchema = new Schema(
  {
    clientId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    scope: { type: String, default: "" },
    startDate: { type: String, required: true },
    dueDate: { type: String, required: true },
    status: {
      type: String,
      enum: ["planned", "active", "on-hold", "completed", "archived"],
      default: "planned",
    },
    assigneeIds: { type: [String], default: [] },
    revision: { type: Number, default: 0 },
    updatedBy: String,
  },
  businessOptions,
);
projectSchema.index({ assigneeIds: 1, dueDate: 1 });
const eventSchema = new Schema(
  {
    action: { type: String, required: true },
    actor: { type: String, required: true },
    at: { type: Date, required: true },
    submissionVersion: Number,
    title: String,
    description: String,
    submissionReference: String,
    note: String,
    approverName: String,
    decisionDate: String,
    evidenceReference: String,
  },
  { _id: false },
);
const deliverableSchema = new Schema(
  {
    projectId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    assigneeId: { type: String, default: "" },
    dueDate: { type: String, required: true },
    status: {
      type: String,
      enum: [
        "planned",
        "in-progress",
        "in-review",
        "approved",
        "changes-requested",
      ],
      default: "planned",
    },
    submissionReference: { type: String, default: "" },
    note: { type: String, default: "" },
    submissionVersion: { type: Number, default: 0 },
    currentApproval: { type: eventSchema, default: null },
    history: { type: [eventSchema], default: [] },
    revision: { type: Number, default: 0 },
    updatedBy: String,
  },
  businessOptions,
);
function registered<T>(name: string, schema: Schema<T>): Model<T> {
  return (
    (mongoose.models[name] as Model<T> | undefined) || model<T>(name, schema)
  );
}
export const Client = registered<InferSchemaType<typeof clientSchema>>(
  "BusinessClient",
  clientSchema,
);
export const Project = registered<InferSchemaType<typeof projectSchema>>(
  "BusinessProject",
  projectSchema,
);
export const Deliverable = registered<
  InferSchemaType<typeof deliverableSchema>
>("BusinessDeliverable", deliverableSchema);
