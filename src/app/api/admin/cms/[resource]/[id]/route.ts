import { NextResponse } from "next/server";

import { audit } from "@/lib/admin/cms/audit";
import { denyIfUnauthorized, readJson } from "@/lib/admin/cms/guard";
import { getContact, removeContact, updateContactStatus } from "@/lib/admin/cms/contacts";
import { deleteRow, getRow, listRows, updateRow, writeAll } from "@/lib/admin/cms/store";
import { isCollection, type Base } from "@/lib/admin/cms/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ resource: string; id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const denied = denyIfUnauthorized(req);
  if (denied) return denied;

  const { resource, id } = await params;
  if (!isCollection(resource)) return NextResponse.json({ error: "Unknown collection." }, { status: 404 });

  const row = resource === "contacts" ? await getContact(id) : await getRow(resource, id);
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ row });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const denied = denyIfUnauthorized(req);
  if (denied) return denied;

  const { resource, id } = await params;
  if (!isCollection(resource)) return NextResponse.json({ error: "Unknown collection." }, { status: 404 });

  const patch = await readJson<Record<string, unknown>>(req);

  // Contacts live in the contact-form store; only their status is editable.
  if (resource === "contacts") {
    const status = String(patch.status ?? "");
    if (!["new", "read", "replied", "archived"].includes(status))
      return NextResponse.json({ error: "Only status can be changed." }, { status: 400 });
    const updated = await updateContactStatus(id, status as never);
    if (!updated) return NextResponse.json({ error: "Not found." }, { status: 404 });
    await audit("update", "contacts", `Marked ${updated.name || updated.email} as ${status}`);
    return NextResponse.json({ row: updated });
  }

  /* The reel hero is a single pin across the whole collection: promoting one
     video has to demote whatever held it, or /reel renders two heroes. Doing
     it here (not in the client) means it holds however the edit arrives. */
  if (resource === "video" && patch.reelHero === true) {
    const rows = await listRows<Base & { reelHero?: boolean }>("video");
    const cleared = rows.map((r) => (r.id === id ? r : { ...r, reelHero: false }));
    await writeAll("video", cleared);
  }

  const row = await updateRow(resource, id, patch as never);
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // A publish flip is the one update worth naming precisely in the trail.
  const flipped =
    "status" in patch
      ? patch.status === "published"
        ? "publish"
        : "unpublish"
      : "published" in patch
        ? patch.published
          ? "publish"
          : "unpublish"
        : "update";

  const label =
    ((row as Record<string, unknown>).title as string) ||
    ((row as Record<string, unknown>).role as string) ||
    ((row as Record<string, unknown>).name as string) ||
    ((row as Record<string, unknown>).email as string) ||
    id;

  await audit(flipped, resource, `${flipped === "update" ? "Updated" : flipped === "publish" ? "Published" : "Unpublished"} ${label}`);

  return NextResponse.json({ row });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const denied = denyIfUnauthorized(req);
  if (denied) return denied;

  const { resource, id } = await params;
  if (!isCollection(resource)) return NextResponse.json({ error: "Unknown collection." }, { status: 404 });

  if (resource === "contacts") {
    const existing = await getContact(id);
    const ok = await removeContact(id);
    if (!ok) return NextResponse.json({ error: "Not found." }, { status: 404 });
    await audit("delete", "contacts", `Deleted enquiry from ${existing?.name || existing?.email || id}`);
    return NextResponse.json({ ok: true });
  }

  const existing = (await getRow(resource, id)) as Record<string, unknown> | null;
  const ok = await deleteRow(resource, id);
  if (!ok) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const label =
    (existing?.title as string) || (existing?.role as string) || (existing?.name as string) || (existing?.email as string) || id;
  await audit("delete", resource, `Deleted ${label}`);

  return NextResponse.json({ ok: true });
}
