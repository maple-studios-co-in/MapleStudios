import { Slot } from "./slot.model.js";
import { AppError } from "../../lib/AppError.js";
import { toStartsAt } from "../../lib/time.js";

export interface ClaimInput {
  slotId?: string;
  date?: string;
  time?: string;
  name: string;
  email: string;
  note?: string;
}

/** "2026-09-04 10:30" -> { date, time } */
function splitId(id: string): { date: string; time: string } {
  const [date = "", time = ""] = id.split(" ");
  return { date, time };
}

/** Open, future slots - what the public booking widget renders. */
export async function listOpenSlots() {
  return Slot.find({ booking: null, startsAt: { $gt: new Date() } })
    .sort({ startsAt: 1 })
    .limit(200)
    .exec();
}

/** Everything, booked and open - the admin calendar. */
export async function listAllSlots() {
  return Slot.find().sort({ startsAt: 1 }).limit(1000).exec();
}

/**
 * Claim a slot.
 *
 * THE IMPORTANT PART: this is one atomic findOneAndUpdate whose filter
 * includes `booking: null`. MongoDB serialises writes to a single document,
 * so with ten concurrent requests exactly one matches a free slot and the
 * other nine get null back. A read-then-write would let all ten pass the
 * check and the last write would silently win.
 */
export async function claimSlot(input: ClaimInput) {
  const { date, time } = input.slotId
    ? splitId(input.slotId)
    : { date: input.date as string, time: input.time as string };

  const claimed = await Slot.findOneAndUpdate(
    { date, time, booking: null, startsAt: { $gt: new Date() } },
    {
      $set: {
        booking: {
          name: input.name,
          email: input.email,
          ...(input.note ? { note: input.note } : {}),
          at: new Date(),
        },
      },
    },
    { new: true, runValidators: true }
  ).exec();

  if (claimed) return claimed;

  // Nothing matched. One extra read, purely to explain why.
  const existing = await Slot.findOne({ date, time }).exec();
  if (!existing) throw AppError.notFound("That slot is no longer listed.");
  if (existing.booking) throw AppError.conflict("That slot was just taken - please pick another.");
  throw AppError.gone("That slot is in the past.");
}

/** Open a new slot. A duplicate hits the unique index and surfaces as 409. */
export async function addSlot(date: string, time: string) {
  const existing = await Slot.findOne({ date, time }).exec();
  if (existing) throw AppError.conflict("That slot already exists.");
  return Slot.create({ date, time, startsAt: toStartsAt(date, time), booking: null });
}

/** Close a slot. Refuses to discard a booked call unless explicitly forced. */
export async function removeSlot(id: string, force = false): Promise<void> {
  const { date, time } = splitId(id);
  const slot = await Slot.findOne({ date, time }).exec();
  if (!slot) throw AppError.notFound("That slot no longer exists.");
  if (slot.booking && !force) {
    throw AppError.conflict("That slot is booked - cancel the call before removing it.");
  }
  await slot.deleteOne();
}
