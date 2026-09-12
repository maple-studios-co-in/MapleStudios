import { NextResponse } from "next/server";

import { audit } from "@/lib/admin/cms/audit";
import { denyIfUnauthorized, readJson } from "@/lib/admin/cms/guard";
import { SITE_COPY_DEFAULT } from "@/lib/admin/cms/seed";
import { readDoc, writeDoc } from "@/lib/admin/cms/store";
import type { SiteCopy } from "@/lib/admin/cms/types";

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
  const doc = await readDoc<SiteCopy>(KEY, SITE_COPY_DEFAULT);
  const source = doc.versions.find((x) => x.v === v);
  if (!source) return NextResponse.json({ error: `No version ${v}.` }, { status: 404 });

  const nextV = Math.max(0, ...doc.versions.map((x) => x.v)) + 1;
  const next: SiteCopy = {
    live: nextV,
    versions: [
      {
        v: nextV,
        json: source.json,
        summary: `Restored from v${source.v}`,
        at: new Date().toISOString(),
        who: "admin",
        restoredFrom: source.v,
      },
      ...doc.versions,
    ],
  };

  await writeDoc(KEY, next);
  await audit("restore", KEY, `Restored site copy from v${source.v} (now v${nextV})`);

  return NextResponse.json({ doc: next });
}
