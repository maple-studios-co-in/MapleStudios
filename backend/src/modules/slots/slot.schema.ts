import { z } from "zod";

export const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD.");

export const timeStr = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be HH:mm (24-hour).");

/** The site posts either { slotId } or { date, time } - accept both. */
export const createBookingSchema = z
  .object({
    slotId: z.string().trim().optional(),
    date: dateStr.optional(),
    time: timeStr.optional(),
    name: z.string().trim().min(1, "Please enter your name.").max(120),
    email: z.string().trim().toLowerCase().email("That email address does not look right."),
    note: z.string().trim().max(2000).optional(),
  })
  .refine((v) => Boolean(v.slotId) || (Boolean(v.date) && Boolean(v.time)), {
    message: "Provide slotId, or date and time.",
    path: ["slotId"],
  });

export const createSlotSchema = z.object({ date: dateStr, time: timeStr });

export const slotIdParam = z.object({
  // "YYYY-MM-DD HH:mm", url-encoded by the client
  id: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2} ([01]\d|2[0-3]):[0-5]\d$/, "Malformed slot id."),
});

export const removeSlotQuery = z.object({
  force: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});
