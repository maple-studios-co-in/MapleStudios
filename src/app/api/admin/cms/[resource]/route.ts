import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { audit, labelOf } from "@/lib/admin/cms/audit";
import { denyIfUnauthorized, readJson } from "@/lib/admin/cms/guard";
import { listContacts } from "@/lib/admin/cms/contacts";
import { createPinnedVideo } from "@/lib/admin/cms/reel";
import { createRow, listRows } from "@/lib/admin/cms/store";
import { FIXED_SET, ORDERABLE, READ_ONLY, isCollection, type Base } from "@/lib/admin/cms/types";
import { normalisePath } from "@/lib/admin/cms/url";
import { problemWith } from "@/lib/admin/cms/validate";

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
type Row = Base & Record<string, unknown>;

/** A cleared order sorts last rather than scrambling the list. */
const orderOf = (r: Row) => (typeof r.order === "number" ? r.order : Number.MAX_SAFE_INTEGER);

export async function GET(req: Request, { params }: Ctx) {
  const denied = denyIfUnauthorized(req);
  if (denied) return denied;

  const { resource } = await params;
  if (!isCollection(resource))
    return NextResponse.json({ error: `Unknown collection "${resource}".` }, { status: 404 });

  // Contacts is a view over the real contact-form store, not a collection of
  // its own — see lib/admin/cms/contacts.ts.
  if (resource === "contacts") return NextResponse.json({ rows: await listContacts() });

  const rows = await listRows<Row>(resource);

  // Orderable collections sort by `order`; everything else newest-first, which
  // is what every table in the console expects on load. Decided per
  // collection, not by sniffing the first row, which one cleared field flipped.
  const sorted = ORDERABLE.includes(resource)
    ? [...rows].sort((a, b) => orderOf(a) - orderOf(b))
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
  if (READ_ONLY.includes(resource))
    return NextResponse.json({ error: `The ${resource} trail is written by the server.` }, { status: 405 });
  if (FIXED_SET.includes(resource))
    return NextResponse.json({ error: `The ${resource} are a fixed set — edit the existing ones.` }, { status: 405 });

  const body = await readJson<Record<string, unknown>>(req);

  if (resource === "seo" || resource === "redirects") {
    const problem = problemWith(resource, body, await listRows<Row>(resource));
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  }

  const row =
    resource === "video" && body.reelHero === true
      ? await createPinnedVideo(body)
      : await createRow(resource, body as never);

  // Pages that aren't rendered per request (/about, /contact) pick up a new
  // override on their next visit.
  if (resource === "seo") revalidatePath(normalisePath(String(body.path)));

  await audit("create", resource, `Created ${labelOf(resource, body, resource)}`);

  return NextResponse.json({ row }, { status: 201 });
}
