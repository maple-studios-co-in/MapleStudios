import { NextResponse } from "next/server";

import { audit } from "@/lib/admin/cms/audit";
import { denyIfUnauthorized, readJson } from "@/lib/admin/cms/guard";
import { SITE_COPY_DEFAULT } from "@/lib/admin/cms/seed";
import { readDoc, writeDoc } from "@/lib/admin/cms/store";
import type { SiteCopy } from "@/lib/admin/cms/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const KEY = "site-copy";

/** Newest version wins; the store keeps every one so Restore is always
    available. Capped so the history panel stays readable. */
const MAX_VERSIONS = 40;

export async function GET(req: Request) {
  const denied = denyIfUnauthorized(req);
  if (denied) return denied;

  const doc = await readDoc<SiteCopy>(KEY, SITE_COPY_DEFAULT);
  return NextResponse.json({ doc });
}

/**
 * Save a new version.
 *
 * The payload is validated as JSON before it is stored — a malformed copy blob
 * saved as "live" would break every string on the public site, and the editor
 * has no way to tell the operator that after the fact.
 */
export async function POST(req: Request) {
  const denied = denyIfUnauthorized(req);
  if (denied) return denied;

  const { json, summary } = await readJson<{ json?: string; summary?: string }>(req);
  if (typeof json !== "string")
    return NextResponse.json({ error: "Expected { json: string }." }, { status: 400 });

  try {
    JSON.parse(json);
  } catch (e) {
    return NextResponse.json(
      { error: `That is not valid JSON — ${(e as Error).message}` },
      { status: 400 }
    );
  }

  const doc = await readDoc<SiteCopy>(KEY, SITE_COPY_DEFAULT);
  const v = Math.max(0, ...doc.versions.map((x) => x.v)) + 1;

  const next: SiteCopy = {
    live: v,
    versions: [
      {
        v,
        json,
        summary: (summary ?? "").trim(),
        at: new Date().toISOString(),
        who: "admin",
        restoredFrom: null,
      },
      ...doc.versions,
    ].slice(0, MAX_VERSIONS),
  };

  await writeDoc(KEY, next);
  await audit("update", KEY, `Saved site copy v${v}`);

  return NextResponse.json({ doc: next });
}
