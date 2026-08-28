import { promises as fs } from "fs";
import os from "os";
import path from "path";

/**
 * File-backed store for contact-page inquiries.
 *
 * Until now the contact form only opened a `mailto:` — the studio had no
 * record of anything a visitor sent, and nothing for an admin screen to show.
 * The form now ALSO posts here (the mailto still fires, so nothing about the
 * visitor's experience changed), and this module is what /admin reads.
 *
 * Deliberately mirrors `bookings.ts`: same JSON-on-disk store, same atomic
 * write-then-rename, same read-only-host fallback. Swap both for a database
 * client behind these signatures when one exists.
 */
export type InquiryStatus = "new" | "read" | "archived";

export type Inquiry = {
  /** sortable + unique: ISO timestamp + short random suffix */
  id: string;
  /** ISO timestamp of submission */
  at: string;
  name: string;
  email: string;
  company?: string;
  service: string;
  budget: string;
  message: string;
  status: InquiryStatus;
};

type Store = { inquiries: Inquiry[] };

/** Serverless hosts mount the deploy READ-ONLY; /tmp is the one writable path
    (per-instance, wiped on cold start — so this does not durably persist in
    production until it sits on a real database). Same trade-off as bookings. */
const FILE = process.env.VERCEL
  ? path.join(os.tmpdir(), "maple-inquiries.json")
  : path.join(process.cwd(), "data", "inquiries.json");

/** Hard cap so a spam run can never grow the file without bound. Oldest go
    first; archived ones are dropped before anything still unread. */
const MAX_KEPT = 500;

async function readStore(): Promise<Store> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw) as Store;
    if (!Array.isArray(parsed.inquiries)) throw new Error("malformed store");
    return parsed;
  } catch {
    return { inquiries: [] };
  }
}

async function writeStore(store: Store) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  // write-then-rename so a crash mid-write never truncates the live file
  const tmp = `${FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(store, null, 2), "utf8");
  await fs.rename(tmp, FILE);
}

/** Newest first — every screen wants that order. */
const newestFirst = (a: Inquiry, b: Inquiry) => b.at.localeCompare(a.at);

function trim(list: Inquiry[]): Inquiry[] {
  if (list.length <= MAX_KEPT) return list;
  const keep = [...list].sort(newestFirst);
  // drop archived first, then the oldest of whatever is left
  const archived = keep.filter((i) => i.status === "archived");
  const rest = keep.filter((i) => i.status !== "archived");
  const overflow = keep.length - MAX_KEPT;
  const dropped = new Set(archived.slice(-overflow).map((i) => i.id));
  const after = keep.filter((i) => !dropped.has(i.id));
  return after.length <= MAX_KEPT ? after : rest.slice(0, MAX_KEPT);
}

export async function listInquiries(): Promise<Inquiry[]> {
  const store = await readStore();
  return store.inquiries.sort(newestFirst);
}

export async function addInquiry(
  data: Omit<Inquiry, "id" | "at" | "status">
): Promise<Inquiry> {
  const store = await readStore();
  const at = new Date().toISOString();
  const inquiry: Inquiry = {
    ...data,
    id: `${at}-${Math.random().toString(36).slice(2, 8)}`,
    at,
    status: "new",
  };
  store.inquiries = trim([inquiry, ...store.inquiries]);
  // A read-only filesystem (or a full disk) must surface as a handled error,
  // not an unhandled rejection that 500s the public endpoint.
  await writeStore(store);
  return inquiry;
}

export async function setInquiryStatus(
  id: string,
  status: InquiryStatus
): Promise<{ ok: true; inquiry: Inquiry } | { ok: false; error: string }> {
  const store = await readStore();
  const inquiry = store.inquiries.find((i) => i.id === id);
  if (!inquiry) return { ok: false, error: "Unknown inquiry." };
  inquiry.status = status;
  await writeStore(store);
  return { ok: true, inquiry };
}

export async function deleteInquiry(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const store = await readStore();
  const before = store.inquiries.length;
  store.inquiries = store.inquiries.filter((i) => i.id !== id);
  if (store.inquiries.length === before) return { ok: false, error: "Unknown inquiry." };
  await writeStore(store);
  return { ok: true };
}
