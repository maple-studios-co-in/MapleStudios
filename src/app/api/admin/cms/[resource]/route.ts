import { NextResponse } from "next/server";

import { audit } from "@/lib/admin/cms/audit";
import { denyIfUnauthorized, readJson } from "@/lib/admin/cms/guard";
import { listContacts } from "@/lib/admin/cms/contacts";
import { createRow, listRows } from "@/lib/admin/cms/store";
import { isCollection, type Base } from "@/lib/admin/cms/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Generic collection endpoint — GET (list) and POST (create).
 *
 * Seven of the console's modules are plain ordered lists of records, so they
 * all ride this one handler rather than each shipping a near-identical route.
 * `isCollection` is the allowlist: an unknown name 404s instead of creating a
 * stray JSON file on disk.
 *
 * Static sibling segments (dashboard, doc, site-copy) take priority over this
 * dynamic one in the App Router, so they are unaffected.
 */
type Ctx = { params: Promise<{ resource: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const denied = denyIfUnauthorized(req);
  if (denied) return denied;

  const { resource } = await params;
  if (!isCollection(resource))
    return NextResponse.json({ error: `Unknown collection "${resource}".` }, { status: 404 });

  // Contacts is a view over the real contact-form store, not a collection of
  // its own — see lib/admin/cms/contacts.ts.
  if (resource === "contacts") return NextResponse.json({ rows: await listContacts() });

  const rows = await listRows<Base & Record<string, unknown>>(resource);

  // Ordered collections sort by `order`; everything else newest-first, which is
  // what every table in the console expects on load.
  const sorted =
    rows.length && typeof rows[0].order === "number"
      ? [...rows].sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0))
      : [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return NextResponse.json({ rows: sorted });
}

export async function POST(req: Request, { params }: Ctx) {
  const denied = denyIfUnauthorized(req);
  if (denied) return denied;

  const { resource } = await params;
  if (!isCollection(resource))
    return NextResponse.json({ error: `Unknown collection "${resource}".` }, { status: 404 });

  if (resource === "contacts")
    return NextResponse.json(
      { error: "Contacts are created by the public contact form, not here." },
      { status: 405 }
    );

  const body = await readJson<Record<string, unknown>>(req);
  const row = await createRow(resource, body as never);

  const label =
    (body.title as string) || (body.role as string) || (body.name as string) || (body.email as string) || resource;
  await audit("create", resource, `Created ${label}`);

  return NextResponse.json({ row }, { status: 201 });
}
