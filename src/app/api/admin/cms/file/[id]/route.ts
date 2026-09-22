import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

import { MEDIA_DIR } from "@/lib/admin/cms/paths";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  gif: "image/gif",
  mp4: "video/mp4",
  pdf: "application/pdf",
};

/**
 * Serve an uploaded asset.
 *
 * Deliberately NOT behind the admin key: the console renders these in <img>
 * tags, which cannot send the header. The id is 14 random chars, and the name
 * is matched against a strict pattern so no traversal or unexpected extension
 * can reach the filesystem — the response is then pinned to a known image type
 * with nosniff, so a stored file can never be interpreted as script.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const match = /^([a-z0-9]{6,32})\.([a-z0-9]{2,4})$/i.exec(id);
  if (!match) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const [, stem, ext] = match;
  const type = TYPES[ext.toLowerCase()];
  if (!type) return NextResponse.json({ error: "Not found." }, { status: 404 });

  try {
    const buf = await fs.readFile(path.join(MEDIA_DIR, `${stem}.${ext.toLowerCase()}`));
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "content-type": type,
        "cache-control": "private, max-age=3600",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
}
