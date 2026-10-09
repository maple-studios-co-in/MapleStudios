import { promises as fs } from "fs";
import path from "path";

import { CMS_DIR } from "./paths";
import type { Redirect } from "./types";
import { normalisePath } from "./url";
import { problemWith } from "./validate";

/**
 * The redirect table the middleware consults on every page request. Read from
 * the console's store, cached in memory, and re-read only when the file
 * changes (checked at most every few seconds) — so a lookup is a Map hit, not
 * a disk read. No file, or an unreadable one, means no redirects: a broken
 * table must never take the site down with it.
 */
const FILE = path.join(CMS_DIR, "redirects.json");
const RECHECK_MS = 3000;

let cached: { checkedAt: number; mtimeMs: number; table: Map<string, Redirect> } | null = null;

async function table(): Promise<Map<string, Redirect>> {
  const now = Date.now();
  if (cached && now - cached.checkedAt < RECHECK_MS) return cached.table;
  try {
    const { mtimeMs } = await fs.stat(FILE);
    if (cached && cached.mtimeMs === mtimeMs) {
      cached.checkedAt = now;
      return cached.table;
    }
    const rows = JSON.parse(await fs.readFile(FILE, "utf8")) as unknown;
    const map = new Map<string, Redirect>();
    // Re-validate on load: a hand-edited file can't smuggle in a redirect the
    // API would have refused (e.g. one starting at /admin).
    for (const r of Array.isArray(rows) ? (rows as Redirect[]) : [])
      if (!problemWith("redirects", r as unknown as Record<string, unknown>, [])) map.set(normalisePath(r.from), r);
    cached = { checkedAt: now, mtimeMs, table: map };
  } catch {
    cached = { checkedAt: now, mtimeMs: -1, table: new Map() };
  }
  return cached.table;
}

export async function findRedirect(pathname: string): Promise<Redirect | null> {
  return (await table()).get(normalisePath(pathname)) ?? null;
}
