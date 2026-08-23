import { promises as fs } from "fs";
import os from "os";
import path from "path";

/**
 * File-backed store for the contact page's "Book a 30-minute call" feature.
 *
 * The admin curates 30-minute availability slots from /admin/slots; the
 * contact page shows exactly that calendar to visitors and lets them claim a
 * slot. Everything lives in data/bookings.json so the demo needs no external
 * service — swap this module for a database client when one exists. On
 * serverless hosts the filesystem is ephemeral: fine for local demos, but
 * production wants a real store behind these same functions.
 *
 * Times are naive local (IST for the studio) — the UI labels them as such.
 */
export type SlotBooking = {
  name: string;
  email: string;
  note?: string;
  /** ISO timestamp of when the visitor claimed the slot */
  at: string;
};

export type Slot = {
  /** `${date} ${time}` — stable, human-readable, unique */
  id: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm (24h), each slot is 30 minutes */
  time: string;
  booking: SlotBooking | null;
};

type Store = { slots: Slot[] };

/** Serverless hosts (Vercel) mount the deploy READ-ONLY — writing next to the
    code throws EROFS and every booking route would 500. /tmp is the one
    writable path there (per-instance and wiped on cold start, so bookings
    do not persist in production until this sits on a real database). */
const FILE = process.env.VERCEL
  ? path.join(os.tmpdir(), "maple-bookings.json")
  : path.join(process.cwd(), "data", "bookings.json");

/** Weekday pattern seeded on first run so the calendar is never empty —
    the admin page edits it from there. */
const SEED_TIMES = ["10:00", "10:30", "11:00", "15:00", "15:30", "16:00"];
const SEED_DAYS = 14;

export const slotId = (date: string, time: string) => `${date} ${time}`;

function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function seedStore(): Store {
  const slots: Slot[] = [];
  const now = new Date();
  for (let i = 1; i <= SEED_DAYS; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue; // weekdays only
    const date = isoDate(d);
    for (const time of SEED_TIMES) slots.push({ id: slotId(date, time), date, time, booking: null });
  }
  return { slots };
}

async function readStore(): Promise<Store> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw) as Store;
    if (!Array.isArray(parsed.slots)) throw new Error("malformed store");
    return parsed;
  } catch {
    const seeded = seedStore();
    try {
      await writeStore(seeded);
    } catch {
      /* read-only host — still serve the seed from memory rather than 500 */
    }
    return seeded;
  }
}

async function writeStore(store: Store) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  // write-then-rename so a crash mid-write never truncates the live file
  const tmp = `${FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(store, null, 2), "utf8");
  await fs.rename(tmp, FILE);
}

/** True while the slot's start is still in the future. */
function isUpcoming(s: Slot) {
  return new Date(`${s.date}T${s.time}:00`).getTime() > Date.now();
}

const byStart = (a: Slot, b: Slot) => a.id.localeCompare(b.id);

/** Visitor view: upcoming, unclaimed slots only. */
export async function listOpenSlots(): Promise<Pick<Slot, "id" | "date" | "time">[]> {
  const store = await readStore();
  return store.slots
    .filter((s) => !s.booking && isUpcoming(s))
    .sort(byStart)
    .map(({ id, date, time }) => ({ id, date, time }));
}

export async function bookSlot(
  id: string,
  visitor: { name: string; email: string; note?: string }
): Promise<{ ok: true; slot: Slot } | { ok: false; error: string }> {
  const store = await readStore();
  const slot = store.slots.find((s) => s.id === id);
  if (!slot) return { ok: false, error: "That slot no longer exists." };
  if (!isUpcoming(slot)) return { ok: false, error: "That slot is in the past." };
  if (slot.booking) return { ok: false, error: "That slot was just taken — pick another." };
  slot.booking = { ...visitor, at: new Date().toISOString() };
  await writeStore(store);
  return { ok: true, slot };
}

/** Admin view: every upcoming slot, bookings included. */
export async function listAllSlots(): Promise<Slot[]> {
  const store = await readStore();
  return store.slots.filter(isUpcoming).sort(byStart);
}

export async function addSlot(date: string, time: string): Promise<Slot> {
  const store = await readStore();
  const id = slotId(date, time);
  const existing = store.slots.find((s) => s.id === id);
  if (existing) return existing;
  const slot: Slot = { id, date, time, booking: null };
  store.slots.push(slot);
  await writeStore(store);
  return slot;
}

/** Remove an open slot, or cancel + free a booked one when `force`. */
export async function removeSlot(
  id: string,
  opts: { force?: boolean; freeOnly?: boolean } = {}
): Promise<{ ok: true } | { ok: false; error: string }> {
  const store = await readStore();
  const slot = store.slots.find((s) => s.id === id);
  if (!slot) return { ok: false, error: "Unknown slot." };
  if (opts.freeOnly) {
    slot.booking = null;
  } else {
    if (slot.booking && !opts.force)
      return { ok: false, error: "Slot is booked — cancel the booking first." };
    store.slots = store.slots.filter((s) => s.id !== id);
  }
  await writeStore(store);
  return { ok: true };
}

export function isAdminKeyValid(key: string | null | undefined) {
  const expected = process.env.MAPLE_ADMIN_KEY || "maple-admin";
  return Boolean(key) && key === expected;
}
