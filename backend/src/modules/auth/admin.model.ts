import mongoose, {
  Schema,
  model,
  type HydratedDocument,
  type Model,
} from "mongoose";
import bcrypt from "bcryptjs";

export type AdminRole = "owner" | "admin" | "member";

interface MfaPending {
  nonceHash: string;
  expiresAt: Date;
  attempts: number;
}
interface MfaEnrolment extends MfaPending {
  secretEnc: string;
  recoveryHashes?: string[];
  proofStep?: number;
  proofAt?: number;
}

export interface IAdmin {
  email: string;
  name: string;
  passwordHash: string;
  role: AdminRole;
  /** Bumped to invalidate every issued refresh token for this account. */
  tokenVersion: number;
  active: boolean;
  mfaSecretEnc?: string;
  mfaEnrolledAt?: Date;
  mfaLastStep?: number;
  mfaRecoveryHashes?: string[];
  mfaRecoveryLastUsedAt?: Date;
  mfaLogin?: MfaPending;
  mfaEnrollment?: MfaPending;
  mfaSetup?: MfaEnrolment;
  mfaBudget?: { expiresAt: Date; attempts: number };
  mfaOperatorResets?: { at: Date; by: string; reference: string }[];
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
    active: a.active !== false,
    lastLoginAt: a.lastLoginAt ? new Date(a.lastLoginAt).toISOString() : null,
  };
}

const pendingFields = {
  nonceHash: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  attempts: { type: Number, required: true },
};
const PendingSchema = new Schema<MfaPending>(pendingFields, { _id: false });
const EnrolmentSchema = new Schema<MfaEnrolment>(
  {
    ...pendingFields,
    secretEnc: { type: String, required: true },
    recoveryHashes: { type: [String], default: undefined },
    proofStep: Number,
    proofAt: Number,
  },
  { _id: false },
);

const AdminSchema = new Schema<IAdmin>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    passwordHash: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ["owner", "admin", "member"],
      default: "member",
    },
    active: { type: Boolean, default: true },
    tokenVersion: { type: Number, default: 0 },
    lastLoginAt: { type: Date },
    mfaSecretEnc: { type: String, select: false },
    mfaEnrolledAt: Date,
    mfaLastStep: { type: Number, select: false },
    mfaRecoveryHashes: { type: [String], select: false, default: undefined },
    mfaRecoveryLastUsedAt: { type: Date, select: false },
    mfaLogin: { type: PendingSchema, select: false },
    mfaEnrollment: { type: PendingSchema, select: false },
    mfaSetup: { type: EnrolmentSchema, select: false },
    mfaBudget: { type: new Schema({ expiresAt: Date, attempts: Number }, { _id: false }), select: false },
    mfaOperatorResets: { type: [new Schema({ at: Date, by: String, reference: String }, { _id: false })], default: undefined, select: false },
  },
  {
    timestamps: true,
    toJSON: {
      versionKey: false,
      transform: (_doc, ret) =>
        adminWire(ret as unknown as IAdmin & { _id: unknown }),
    },
  },
);

export type AdminDoc = HydratedDocument<IAdmin>;
// Reuse an already-compiled model. Vitest keeps one process across test
// files, so this module can be evaluated twice; a bare model() call would
// then throw OverwriteModelError.
export const AdminUser: Model<IAdmin> =
  (mongoose.models.AdminUser as Model<IAdmin> | undefined) ??
  model<IAdmin>("AdminUser", AdminSchema);

export const hashPassword = (plain: string) => bcrypt.hash(plain, 12);
export const verifyPassword = (plain: string, hash: string) =>
  bcrypt.compare(plain, hash);
