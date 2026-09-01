import mongoose, { Schema, model, type HydratedDocument, type Model } from "mongoose";

export interface SlotBooking {
  name: string;
  email: string;
  note?: string;
  at: Date;
}

export interface ISlot {
  date: string;
  time: string;
  /** The real instant, derived from date+time in the studio timezone. */
  startsAt: Date;
  booking: SlotBooking | null;
  createdAt?: Date;
  updatedAt?: Date;
}

/** The shape the site expects on the wire. Single source for the route
    responses and the toJSON transform, so the two can never drift. */
export function slotWire(s: ISlot) {
  return {
    id: `${s.date} ${s.time}`,
    date: s.date,
    time: s.time,
    booking: s.booking
      ? {
          name: s.booking.name,
          email: s.booking.email,
          ...(s.booking.note ? { note: s.booking.note } : {}),
          at: new Date(s.booking.at).toISOString(),
        }
      : null,
  };
}

const BookingSchema = new Schema<SlotBooking>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 200 },
    note: { type: String, trim: true, maxlength: 2000 },
    at: { type: Date, required: true, default: () => new Date() },
  },
  { _id: false }
);

const SlotSchema = new Schema<ISlot>(
  {
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    time: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    startsAt: { type: Date, required: true, index: true },
    booking: { type: BookingSchema, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      versionKey: false,
      transform: (_doc, ret) => slotWire(ret as unknown as ISlot),
    },
  }
);

// One slot per date+time. This index is what makes a duplicate POST a 409
// instead of a second row.
SlotSchema.index({ date: 1, time: 1 }, { unique: true });
// Admin views: who booked what, newest first.
SlotSchema.index({ "booking.at": -1 }, { sparse: true });

export type SlotDoc = HydratedDocument<ISlot>;
// Reuse an already-compiled model. Vitest keeps one process across test
// files, so this module can be evaluated twice; a bare model() call would
// then throw OverwriteModelError.
export const Slot: Model<ISlot> =
  (mongoose.models.Slot as Model<ISlot> | undefined) ??
  model<ISlot>("Slot", SlotSchema);
