import { NextResponse } from "next/server";

import { audit } from "@/lib/admin/cms/audit";
import { denyIfUnauthorized, readJson } from "@/lib/admin/cms/guard";
import { appendSiteCopyVersion } from "@/lib/admin/cms/siteCopy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const KEY = "site-copy";

/**
 * Restore an older version.
 *
 * Restoring writes a NEW version carrying the old payload rather than moving a
 * pointer backwards, so the history stays append-only: you can always see that
 * a restore happened, and undo the restore itself.
 */
export async function POST(req: Request) {
  const denied = denyIfUnauthorized(req);
  if (denied) return denied;

  const { v } = await readJson<{ v?: number }>(req);
  const next = await appendSiteCopyVersion((doc) => {
    const source = doc.versions.find((x) => x.v === v);
    return source ? { json: source.json, summary: `Restored from v${source.v}`, restoredFrom: source.v } : null;
  });
  if (!next) return NextResponse.json({ error: `No version ${v}.` }, { status: 404 });

  await audit("restore", KEY, `Restored site copy from v${v} (now v${next.live})`);

  return NextResponse.json({ doc: next });
}
