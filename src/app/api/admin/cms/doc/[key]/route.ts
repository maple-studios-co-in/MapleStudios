import { NextResponse } from "next/server";

import { audit } from "@/lib/admin/cms/audit";
import { denyIfUnauthorized, readJson } from "@/lib/admin/cms/guard";
import { HOMEPAGE_DEFAULT, SETTINGS_DEFAULT } from "@/lib/admin/cms/seed";
import { readDoc, writeDoc } from "@/lib/admin/cms/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Singleton documents — one JSON object rather than a list of records.
 * Homepage copy and Settings are edited as a whole and saved as a whole.
 */
const DOCS: Record<string, unknown> = {
  homepage: HOMEPAGE_DEFAULT,
  settings: SETTINGS_DEFAULT,
};

type Ctx = { params: Promise<{ key: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const denied = denyIfUnauthorized(req);
  if (denied) return denied;

  const { key } = await params;
  if (!(key in DOCS)) return NextResponse.json({ error: "Unknown document." }, { status: 404 });

  const doc = await readDoc(key, DOCS[key]);
  return NextResponse.json({ doc });
}

export async function PUT(req: Request, { params }: Ctx) {
  const denied = denyIfUnauthorized(req);
  if (denied) return denied;

  const { key } = await params;
  if (!(key in DOCS)) return NextResponse.json({ error: "Unknown document." }, { status: 404 });

  const body = await readJson<{ doc?: unknown }>(req);
  if (!body.doc || typeof body.doc !== "object")
    return NextResponse.json({ error: "Expected { doc: object }." }, { status: 400 });

  await writeDoc(key, body.doc);
  await audit("update", key, `Saved ${key}`);

  return NextResponse.json({ doc: body.doc });
}
