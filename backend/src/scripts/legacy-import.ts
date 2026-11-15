import { z } from "zod";
import { Inquiry } from "../modules/inquiries/inquiry.model.js";
import { Slot } from "../modules/slots/slot.model.js";
import { createInquirySchema } from "../modules/inquiries/inquiry.schema.js";
import { createSlotSchema } from "../modules/slots/slot.schema.js";
import { toStartsAt } from "../lib/time.js";
const dataSchema = z.object({
  inquiries: z.array(
    createInquirySchema.extend({
      id: z.string().min(1),
      at: z.string().datetime(),
      service: z
        .string()
        .max(120)
        .transform((v) => v.trim() || "Not specified"),
      budget: z
        .string()
        .max(120)
        .transform((v) => v.trim() || "Not specified"),
      status: z.enum(["new", "read", "replied", "archived"]),
    }),
  ),
  slots: z.array(
    createSlotSchema.extend({
      booking: z
        .object({
          name: z.string().min(1),
          email: z.string().email(),
          note: z.string().optional(),
          at: z.string().datetime(),
        })
        .nullable(),
    }),
  ),
});
export async function importLegacyData(input: unknown, dryRun = false) {
  // Validate the complete snapshot before the first write; corrupt files are errors.
  const data = dataSchema.parse(input);
  for (const slot of data.slots) {
    const instant = toStartsAt(slot.date, slot.time);
    if (!Number.isFinite(instant.getTime()))
      throw new Error("Invalid legacy slot date");
  }
  if (!dryRun) {
    for (const { id, at, ...inquiry } of data.inquiries) {
      // Also recognise imports made by the older migration command.
      const exists = await Inquiry.exists({
        $or: [
          { legacyId: id },
          {
            legacyId: { $exists: false },
            email: inquiry.email,
            createdAt: new Date(at),
          },
        ],
      });
      if (!exists)
        await Inquiry.updateOne(
          { legacyId: id },
          {
            $setOnInsert: {
              ...inquiry,
              legacyId: id,
              createdAt: new Date(at),
              updatedAt: new Date(at),
            },
          },
          { upsert: true, timestamps: false },
        );
    }
    for (const slot of data.slots) {
      await Slot.updateOne(
        { date: slot.date, time: slot.time },
        {
          $setOnInsert: { ...slot, startsAt: toStartsAt(slot.date, slot.time) },
        },
        { upsert: true, timestamps: false },
      );
    }
  }
  return { inquiries: data.inquiries.length, slots: data.slots.length, dryRun };
}
