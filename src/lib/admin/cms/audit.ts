import { mutate, newId } from "./store";
import type { AuditAction, AuditEntry } from "./types";

/** Keep the log bounded — it is a trail, not an archive. */
const MAX_ENTRIES = 500;

/** The field that names a row in the trail, per collection. A testimonial is
    its author, not its role ("Updated Founder" named no one); anything not
    listed is its title. */
const LABEL_FIELD: Record<string, string> = {
  testimonials: "author",
  careers: "role",
  categories: "name",
  newsletter: "email",
  seo: "path",
  redirects: "from",
  media: "filename",
};

/** A human name for a row, for audit summaries. */
export function labelOf(resource: string, row: Record<string, unknown> | null | undefined, fallback = ""): string {
  const pick = (k: string | undefined) => (k && typeof row?.[k] === "string" ? (row[k] as string).trim() : "");
  return pick(LABEL_FIELD[resource]) || pick("title") || pick("name") || pick("email") || fallback;
}

/**
 * Append one line to the audit trail.
 *
 * Deliberately never throws: an audit write failing must not turn a successful
 * content save into a 500 for the operator. A lost log line is recoverable,
 * a lost edit is not.
 */
export async function audit(
  action: AuditAction,
  resource: string,
  summary: string,
  who = "admin"
): Promise<void> {
  try {
    const now = new Date().toISOString();
    await mutate<AuditEntry, true>("audit", (rows) => ({
      rows: [{ id: newId(), createdAt: now, updatedAt: now, who, action, resource, summary }, ...rows].slice(
        0,
        MAX_ENTRIES
      ),
      result: true,
    }));
  } catch {
    /* trail is best-effort */
  }
}
