import { NextResponse } from "next/server";

import { audit } from "@/lib/admin/cms/audit";
import { denyIfUnauthorized, readJson } from "@/lib/admin/cms/guard";
import { reorderRows } from "@/lib/admin/cms/store";
import { ORDERABLE, isCollection } from "@/lib/admin/cms/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ resource: string }> };

/** POST { ids: [...] } — persist a manual display order. */
export async function POST(req: Request, { params }: Ctx) {
  const denied = denyIfUnauthorized(req);
  if (denied) return denied;

  const { resource } = await params;
  if (!isCollection(resource) || !ORDERABLE.includes(resource))
    return NextResponse.json({ error: `"${resource}" is not reorderable.` }, { status: 404 });

  const { ids } = await readJson<{ ids?: string[] }>(req);
  if (!Array.isArray(ids)) return NextResponse.json({ error: "Expected { ids: string[] }." }, { status: 400 });

  await reorderRows(resource, ids);
  await audit("reorder", resource, `Reordered ${ids.length} item${ids.length === 1 ? "" : "s"}`);

  return NextResponse.json({ ok: true });
}
