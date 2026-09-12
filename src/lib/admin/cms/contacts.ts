import { deleteInquiry, listInquiries, setInquiryStatus, type Inquiry } from "@/lib/inquiries";

import type { Contact, ContactStatus } from "./types";

/**
 * The console's Contacts screen, backed by the REAL contact form.
 *
 * The public form at /contact already posts to /api/inquiries, which writes
 * src/lib/inquiries.ts's store. So Contacts is a projection over that store
 * rather than a second collection of its own: one inbox, two screens
 * (/admin/inquiries and /admin/contacts), and no dual-write to drift.
 *
 * That is why `contacts` is special-cased out of the generic collection
 * handlers — a file-backed `contacts.json` would have sat there permanently
 * empty while every real submission landed somewhere else.
 */

/** The store's vocabulary is the console's vocabulary; only the labels differ
    (the UI shows "In review" for `read`, "Closed" for `archived`). */
function toContact(i: Inquiry): Contact {
  return {
    id: i.id,
    createdAt: i.at,
    updatedAt: i.at,
    name: i.name,
    email: i.email,
    // The form collects a company, not a phone — surfaced in the phone slot's
    // place by the screen, which labels it correctly.
    phone: "",
    company: i.company ?? "",
    project: i.service,
    budget: i.budget,
    timeline: "",
    message: i.message,
    status: i.status as ContactStatus,
  };
}

export async function listContacts(): Promise<Contact[]> {
  const rows = await listInquiries();
  return rows.map(toContact).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getContact(id: string): Promise<Contact | null> {
  const rows = await listInquiries();
  const found = rows.find((i) => i.id === id);
  return found ? toContact(found) : null;
}

/** Only the status is editable — the rest is what a visitor actually typed,
    and the console has no business rewriting that. */
export async function updateContactStatus(id: string, status: ContactStatus) {
  const result = await setInquiryStatus(id, status);
  if (!result.ok) return null;
  return getContact(id);
}

export async function removeContact(id: string) {
  const result = await deleteInquiry(id);
  return result.ok;
}
