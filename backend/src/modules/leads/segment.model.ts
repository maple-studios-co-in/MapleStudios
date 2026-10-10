import mongoose, { Schema, model, type HydratedDocument, type Model } from "mongoose";
import type { LeadStage } from "./lead.model.js";

/** A saved lead filter. Conditions are AND-ed; `tags` means "has any of". */
export interface LeadFilter {
  stage?: LeadStage[];
  tags?: string[];
  segment?: string;
  owner?: string;
  industry?: string;
  city?: string;
  hasEmail?: boolean;
  hasPhone?: boolean;
  q?: string;
}

export interface ISegment {
  name: string;
  filter: LeadFilter;
  createdAt?: Date;
  updatedAt?: Date;
}

export function segmentWire(s: ISegment & { _id: unknown }) {
  return {
    id: String(s._id),
    name: s.name,
    filter: s.filter ?? {},
    createdAt: s.createdAt ? new Date(s.createdAt).toISOString() : null,
    updatedAt: s.updatedAt ? new Date(s.updatedAt).toISOString() : null,
  };
}

const SegmentSchema = new Schema<ISegment>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    filter: { type: Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
    toJSON: { versionKey: false, transform: (_doc, ret) => segmentWire(ret as unknown as ISegment & { _id: unknown }) },
  }
);
SegmentSchema.index({ name: 1 }, { unique: true });

export type SegmentDoc = HydratedDocument<ISegment>;
export const Segment: Model<ISegment> =
  (mongoose.models.Segment as Model<ISegment> | undefined) ?? model<ISegment>("Segment", SegmentSchema);
