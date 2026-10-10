import mongoose, { Schema, model, type HydratedDocument, type Model } from "mongoose";
import { PLATFORMS, type Platform } from "../../lib/social/types.js";

export const POST_STATUSES = ["draft", "scheduled", "publishing", "published", "partial", "failed"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export const RESULT_STATUSES = ["pending", "published", "failed"] as const;
export type ResultStatus = (typeof RESULT_STATUSES)[number];

/** One platform's outcome for one post. A `published` result is final: a retry never re-posts it. */
export interface PostResult {
  platform: Platform;
  status: ResultStatus;
  externalId?: string;
  url?: string;
  error?: string;
  publishedAt?: Date | null;
}

export interface ISocialPost {
  text: string;
  /** absolute https URLs; Instagram requires at least one */
  mediaUrls: string[];
  platforms: Platform[];
  scheduledAt?: Date | null;
  status: PostStatus;
  results: PostResult[];
  publishedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const iso = (d?: Date | null) => (d ? new Date(d).toISOString() : null);

export function socialPostWire(p: ISocialPost & { _id: unknown }) {
  return {
    id: String(p._id),
    text: p.text,
    mediaUrls: p.mediaUrls ?? [],
    platforms: p.platforms ?? [],
    scheduledAt: iso(p.scheduledAt),
    status: p.status,
    results: (p.results ?? []).map((r) => ({
      platform: r.platform,
      status: r.status,
      externalId: r.externalId ?? null,
      url: r.url ?? null,
      error: r.error ?? null,
      publishedAt: iso(r.publishedAt),
    })),
    publishedAt: iso(p.publishedAt),
    createdAt: iso(p.createdAt),
    updatedAt: iso(p.updatedAt),
  };
}

const ResultSchema = new Schema<PostResult>(
  {
    platform: { type: String, enum: PLATFORMS, required: true },
    status: { type: String, enum: RESULT_STATUSES, required: true },
    externalId: { type: String, maxlength: 300 },
    url: { type: String, maxlength: 2000 },
    error: { type: String, maxlength: 1000 },
    publishedAt: { type: Date, default: null },
  },
  { _id: false }
);

const SocialPostSchema = new Schema<ISocialPost>(
  {
    text: { type: String, required: true, maxlength: 3000 },
    mediaUrls: { type: [String], default: [] },
    platforms: { type: [{ type: String, enum: PLATFORMS }], required: true },
    scheduledAt: { type: Date, default: null },
    status: { type: String, enum: POST_STATUSES, default: "draft" },
    results: { type: [ResultSchema], default: [] },
    publishedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      versionKey: false,
      transform: (_doc, ret) => socialPostWire(ret as unknown as ISocialPost & { _id: unknown }),
    },
  }
);

// The tick's query: due scheduled posts, oldest first.
SocialPostSchema.index({ status: 1, scheduledAt: 1 });
// The calendar's range query.
SocialPostSchema.index({ scheduledAt: 1, createdAt: 1 });

export type SocialPostDoc = HydratedDocument<ISocialPost>;
export const SocialPost: Model<ISocialPost> =
  (mongoose.models.SocialPost as Model<ISocialPost> | undefined) ??
  model<ISocialPost>("SocialPost", SocialPostSchema);
