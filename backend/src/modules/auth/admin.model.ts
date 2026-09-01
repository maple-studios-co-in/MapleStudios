import mongoose, { Schema, model, type HydratedDocument, type Model } from "mongoose";
import bcrypt from "bcryptjs";

export type AdminRole = "owner" | "admin";

export interface IAdmin {
  email: string;
  name: string;
  passwordHash: string;
  role: AdminRole;
  /** Bumped to invalidate every issued refresh token for this account. */
  tokenVersion: number;
  lastLoginAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

/** Never includes passwordHash. */
export function adminWire(a: IAdmin & { _id: unknown }) {
  return {
    id: String(a._id),
    email: a.email,
    name: a.name,
    role: a.role,
    lastLoginAt: a.lastLoginAt ? new Date(a.lastLoginAt).toISOString() : null,
  };
}

const AdminSchema = new Schema<IAdmin>(
  {
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ["owner", "admin"], default: "admin" },
    tokenVersion: { type: Number, default: 0 },
    lastLoginAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: {
      versionKey: false,
      transform: (_doc, ret) => adminWire(ret as unknown as IAdmin & { _id: unknown }),
    },
  }
);

export type AdminDoc = HydratedDocument<IAdmin>;
// Reuse an already-compiled model. Vitest keeps one process across test
// files, so this module can be evaluated twice; a bare model() call would
// then throw OverwriteModelError.
export const AdminUser: Model<IAdmin> =
  (mongoose.models.AdminUser as Model<IAdmin> | undefined) ??
  model<IAdmin>("AdminUser", AdminSchema);

export const hashPassword = (plain: string) => bcrypt.hash(plain, 12);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);
