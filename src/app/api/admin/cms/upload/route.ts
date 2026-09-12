import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { NextResponse } from "next/server";

import { audit } from "@/lib/admin/cms/audit";
import { denyIfUnauthorized } from "@/lib/admin/cms/guard";
import { createRow } from "@/lib/admin/cms/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Uploads land beside the JSON store, NOT in public/ — the public folder is
    the marketing site's, and admin uploads have no business being statically
    served from it. They are read back through /api/admin/cms/file/[id]. */
const MEDIA_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), "maple-cms", "files")
  : path.join(process.cwd(), "data", "cms", "files");

const MAX_BYTES = 8 * 1024 * 1024;

/** Only formats a brand site actually places. Anything else — SVG included,
    since it can carry script — is refused rather than stored. */
const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "application/pdf": "pdf",
};

export async function POST(req: Request) {
  const denied = denyIfUnauthorized(req);
  if (denied) return denied;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File))
    return NextResponse.json({ error: "Expected a file field." }, { status: 400 });

  if (file.size > MAX_BYTES)
    return NextResponse.json(
      { error: `That file is ${(file.size / 1048576).toFixed(1)} MB — the limit is 8 MB.` },
      { status: 413 }
    );

  const ext = ALLOWED[file.type];
  if (!ext)
    return NextResponse.json(
      { error: `${file.type || "That file type"} is not allowed. Use JPG, PNG, WebP, AVIF, GIF, MP4 or PDF.` },
      { status: 415 }
    );

  await fs.mkdir(MEDIA_DIR, { recursive: true });

  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  await fs.writeFile(path.join(MEDIA_DIR, `${id}.${ext}`), Buffer.from(await file.arrayBuffer()));

  const row = await createRow("media", {
    url: `/api/admin/cms/file/${id}.${ext}`,
    filename: file.name,
    folder: String(form?.get("folder") ?? "maple/uploads"),
    alt: String(form?.get("alt") ?? ""),
    bytes: file.size,
    format: ext,
  } as never);

  await audit("create", "media", `Uploaded ${file.name}`);

  return NextResponse.json({ row }, { status: 201 });
}
