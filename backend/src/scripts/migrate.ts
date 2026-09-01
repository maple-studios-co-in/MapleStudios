import { readFile } from "node:fs/promises";
import path from "node:path";
import { connectDb, disconnectDb } from "../config/db.js";
import { logger } from "../lib/logger.js";
import { toStartsAt } from "../lib/time.js";
import { Slot } from "../modules/slots/slot.model.js";
import { Inquiry } from "../modules/inquiries/inquiry.model.js";

/** The site's JSON stores live at ../data relative to the backend folder. */
const DATA_DIR = path.resolve(process.cwd(), "..", "data");

interface JsonSlot {
  date?: string;
  time?: string;
  booking?: { name?: string; email?: string; note?: string; at?: string } | null;
}
interface JsonInquiry {
  at?: string;
  name?: string;
  email?: string;
  company?: string;
  service?: string;
  budget?: string;
  message?: string;
  status?: string;
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path.join(DATA_DIR, file), "utf8")) as T;
  } catch {
    logger.warn(`${file} not found - skipping`);
    return fallback;
  }
}

async function main() {
  await connectDb();

  const { slots = [] } = await readJson<{ slots?: JsonSlot[] }>("bookings.json", {});
  let slotCount = 0;
  for (const s of slots) {
    if (!s.date || !s.time) continue;
    // Idempotent by (date,time): re-running updates rather than duplicating.
    await Slot.updateOne(
      { date: s.date, time: s.time },
      {
        $set: {
          startsAt: toStartsAt(s.date, s.time),
          booking: s.booking
            ? {
                name: s.booking.name ?? "Unknown",
                email: s.booking.email ?? "unknown@example.com",
                ...(s.booking.note ? { note: s.booking.note } : {}),
                at: new Date(s.booking.at ?? Date.now()),
              }
            : null,
        },
        $setOnInsert: { date: s.date, time: s.time },
      },
      { upsert: true }
    ).exec();
    slotCount += 1;
  }

  const { inquiries = [] } = await readJson<{ inquiries?: JsonInquiry[] }>("inquiries.json", {});
  let inqCount = 0;
  for (const i of inquiries) {
    if (!i.email || !i.message) continue;
    // The JSON id is not an ObjectId, so dedupe on the natural key instead.
    const at = new Date(i.at ?? Date.now());
    const exists = await Inquiry.findOne({ email: i.email, createdAt: at }).exec();
    if (exists) continue;
    await Inquiry.create({
      name: i.name ?? "Unknown",
      email: i.email,
      company: i.company,
      service: i.service ?? "-",
      budget: i.budget ?? "-",
      message: i.message,
      status: i.status ?? "new",
      createdAt: at,
      updatedAt: at,
    });
    inqCount += 1;
  }

  logger.info(`migrated ${slotCount} slots, ${inqCount} inquiries`);
  await disconnectDb();
}

main().catch((err) => {
  logger.fatal({ err }, "migration failed");
  process.exit(1);
});
