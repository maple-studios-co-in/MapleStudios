import { NextResponse } from "next/server";
import { addSlot, isAdminKeyValid, listAllSlots, removeSlot } from "@/lib/bookings";

export const dynamic = "force-dynamic";

/**
 * Admin calendar API — guarded by the `x-admin-key` header, checked against
 * MAPLE_ADMIN_KEY (falls back to "maple-admin" for local demos; set the env
 * var before exposing this anywhere).
 */
function unauthorized() {
  return NextResponse.json({ error: "Invalid admin key." }, { status: 401 });
}

export async function GET(req: Request) {
  if (!isAdminKeyValid(req.headers.get("x-admin-key"))) return unauthorized();
  const slots = await listAllSlots();
  return NextResponse.json({ slots });
}

/** Add one availability slot: { date: "YYYY-MM-DD", time: "HH:mm" }. */
export async function POST(req: Request) {
  if (!isAdminKeyValid(req.headers.get("x-admin-key"))) return unauthorized();
  let body: { date?: string; time?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const date = (body.date ?? "").trim();
  const time = (body.time ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD and time HH:mm." }, { status: 400 });
  }
  const slot = await addSlot(date, time);
  return NextResponse.json({ slot });
}

/** Remove a slot (?id=...), cancel-and-free a booked one with &free=1. */
export async function DELETE(req: Request) {
  if (!isAdminKeyValid(req.headers.get("x-admin-key"))) return unauthorized();
  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";
  const free = url.searchParams.get("free") === "1";
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });
  const result = await removeSlot(id, free ? { freeOnly: true } : { force: true });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ ok: true });
}
