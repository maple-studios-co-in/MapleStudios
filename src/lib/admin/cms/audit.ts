import { mutate, newId } from "./store";
import type { AuditAction, AuditEntry } from "./types";

/** Keep the log bounded — it is a trail, not an archive. */
const MAX_ENTRIES = 500;

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
