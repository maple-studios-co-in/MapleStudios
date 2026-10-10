import mongoose, { Schema, model, type HydratedDocument, type Model } from "mongoose";
import { PLATFORMS, type Platform } from "../../lib/social/types.js";

export const ACCOUNT_STATUSES = ["connected", "expired", "revoked"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

/** Platform-specific ids a publisher needs beyond the token. */
export interface SocialAccountMeta {
  pageId?: string;
  igUserId?: string;
  personUrn?: string;
}

export interface ISocialAccount {
  platform: Platform;
  externalId: string;
  handle: string;
  displayName: string;
  avatarUrl?: string;
  scopes: string[];
  /** null = the provider gave no expiry (Meta page tokens). */
  expiresAt?: Date | null;
  status: AccountStatus;
  /**
   * AES-256-GCM via lib/crypto. Excluded from every query unless asked for
   * with `+accessTokenEnc`, and never part of the wire shape — so a future
   * route cannot leak them by accident.
   */
  accessTokenEnc?: string;
  refreshTokenEnc?: string;
  meta: SocialAccountMeta;
  connectedAt: Date;
  updatedAt?: Date;
}

const iso = (d?: Date | null) => (d ? new Date(d).toISOString() : null);

/** Wire shape — tokens deliberately absent. */
export function socialAccountWire(a: ISocialAccount & { _id: unknown }) {
  return {
    id: String(a._id),
    platform: a.platform,
    externalId: a.externalId,
    handle: a.handle,
    displayName: a.displayName,
    avatarUrl: a.avatarUrl ?? null,
    scopes: a.scopes ?? [],
    expiresAt: iso(a.expiresAt),
    status: a.status,
    meta: {
      pageId: a.meta?.pageId ?? null,
      igUserId: a.meta?.igUserId ?? null,
      personUrn: a.meta?.personUrn ?? null,
    },
    connectedAt: iso(a.connectedAt),
    updatedAt: iso(a.updatedAt),
  };
}

const SocialAccountSchema = new Schema<ISocialAccount>(
  {
    platform: { type: String, enum: PLATFORMS, required: true },
    externalId: { type: String, required: true, trim: true, maxlength: 200 },
    handle: { type: String, required: true, trim: true, maxlength: 200 },
    displayName: { type: String, required: true, trim: true, maxlength: 200 },
    avatarUrl: { type: String, trim: true, maxlength: 2000 },
    scopes: { type: [String], default: [] },
    expiresAt: { type: Date, default: null },
    status: { type: String, enum: ACCOUNT_STATUSES, default: "connected" },
    accessTokenEnc: { type: String, required: true, select: false },
    refreshTokenEnc: { type: String, select: false },
    meta: { pageId: String, igUserId: String, personUrn: String },
    connectedAt: { type: Date, required: true },
  },
  {
    // connectedAt is set explicitly: reconnecting an existing account must move it.
    timestamps: { createdAt: false, updatedAt: true },
    toJSON: {
      versionKey: false,
      transform: (_doc, ret) => socialAccountWire(ret as unknown as ISocialAccount & { _id: unknown }),
    },
  }
);

// One record per provider identity; reconnecting updates it in place.
SocialAccountSchema.index({ platform: 1, externalId: 1 }, { unique: true });
// The publish path asks "the connected account for this platform".
SocialAccountSchema.index({ platform: 1, status: 1, connectedAt: -1 });

export type SocialAccountDoc = HydratedDocument<ISocialAccount>;
export const SocialAccount: Model<ISocialAccount> =
  (mongoose.models.SocialAccount as Model<ISocialAccount> | undefined) ??
  model<ISocialAccount>("SocialAccount", SocialAccountSchema);
