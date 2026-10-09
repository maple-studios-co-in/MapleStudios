import { NextResponse } from "next/server";

import { audit } from "@/lib/admin/cms/audit";
import { denyIfUnauthorized, readJson } from "@/lib/admin/cms/guard";
import { siteCopyProblems } from "@/lib/admin/cms/public";
import { SITE_COPY_DEFAULT } from "@/lib/admin/cms/seed";
import { appendSiteCopyVersion } from "@/lib/admin/cms/siteCopy";
import { readDoc } from "@/lib/admin/cms/store";
import type { SiteCopy } from "@/lib/admin/cms/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const KEY = "site-copy";

export async function GET(req: Request) {
  const denied = denyIfUnauthorized(req);
  if (denied) return denied;

  const doc = await readDoc<SiteCopy>(KEY, SITE_COPY_DEFAULT);
  return NextResponse.json({ doc });
}

/**
 * Save a new version.
 *
 * The payload is validated before it is stored — as JSON, and against the
 * shape the site renders — because a blob saved as "live" that the site can't
 * use would silently not show, and the editor has no way to tell the operator
 * that after the fact.
 */
export async function POST(req: Request) {
  const denied = denyIfUnauthorized(req);
  if (denied) return denied;

  const { json, summary } = await readJson<{ json?: string; summary?: string }>(req);
  if (typeof json !== "string")
    return NextResponse.json({ error: "Expected { json: string }." }, { status: 400 });

  const problems = siteCopyProblems(json);
  if (problems.length) return NextResponse.json({ error: problems.slice(0, 5).join("; ") }, { status: 400 });

  const next = (await appendSiteCopyVersion(() => ({
    json,
    summary: (summary ?? "").trim(),
    restoredFrom: null,
  }))) as SiteCopy;
  await audit("update", KEY, `Saved site copy v${next.live}`);

  return NextResponse.json({ doc: next });
}
