import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { audit, labelOf } from "@/lib/admin/cms/audit";
import { renameCategoryUses } from "@/lib/admin/cms/categories";
import { denyIfUnauthorized, readJson } from "@/lib/admin/cms/guard";
import { getContact, removeContact, updateContactStatus } from "@/lib/admin/cms/contacts";
import { updatePinnedVideo } from "@/lib/admin/cms/reel";
import { deleteRow, getRow, listRows, removeMediaFile, updateRow } from "@/lib/admin/cms/store";
import { FIXED_SET, READ_ONLY, isCollection, type Base, type CategoryGroup } from "@/lib/admin/cms/types";
import { normalisePath } from "@/lib/admin/cms/url";
import { problemWith } from "@/lib/admin/cms/validate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ resource: string; id: string }> };
type Row = Base & Record<string, unknown>;

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

  if (READ_ONLY.includes(resource))
    return NextResponse.json({ error: `The ${resource} trail is written by the server.` }, { status: 405 });

  const existing = await getRow<Row>(resource, id);
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  if (FIXED_SET.includes(resource) && "slug" in patch && patch.slug !== existing.slug)
    return NextResponse.json({ error: "The slug is fixed — the public routes depend on it." }, { status: 400 });

  if (resource === "seo" || resource === "redirects") {
    const problem = problemWith(resource, { ...existing, ...patch, id }, await listRows<Row>(resource));
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  }

  const row =
    resource === "video" && patch.reelHero === true
      ? await updatePinnedVideo(id, patch)
      : await updateRow(resource, id, patch as never);
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // A renamed category is carried onto every record already using it.
  const renamed =
    resource === "categories" && typeof patch.name === "string" && patch.name !== existing.name
      ? await renameCategoryUses(existing.group as CategoryGroup, String(existing.name), patch.name)
      : 0;

  if (resource === "seo") {
    revalidatePath(normalisePath(String(existing.path)));
    revalidatePath(normalisePath(String((row as Row).path)));
  }

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

  const verb = flipped === "update" ? "Updated" : flipped === "publish" ? "Published" : "Unpublished";
  const also = renamed ? ` (and ${renamed} record${renamed === 1 ? "" : "s"} using it)` : "";
  await audit(flipped, resource, `${verb} ${labelOf(resource, row as Row, id)}${also}`);

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

  if (READ_ONLY.includes(resource))
    return NextResponse.json({ error: `The ${resource} trail is written by the server.` }, { status: 405 });
  if (FIXED_SET.includes(resource))
    return NextResponse.json({ error: `The ${resource} are a fixed set and can't be deleted.` }, { status: 405 });

  const existing = await getRow<Row>(resource, id);
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // A media row is only a pointer: /api/admin/cms/file serves the file itself
  // to anyone, so dropping the row alone would leave the asset downloadable
  // forever. The file goes first — if that fails the row stays, and the
  // delete can simply be retried.
  if (resource === "media") await removeMediaFile(existing.url);

  const ok = await deleteRow(resource, id);
  if (!ok) return NextResponse.json({ error: "Not found." }, { status: 404 });

  if (resource === "seo") revalidatePath(normalisePath(String(existing.path)));

  await audit("delete", resource, `Deleted ${labelOf(resource, existing, id)}`);

  return NextResponse.json({ ok: true });
}
