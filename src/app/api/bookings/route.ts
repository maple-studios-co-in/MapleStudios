import { NextResponse } from "next/server";
import { bookSlot } from "@/lib/bookings";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Claim one open slot: { slotId, name, email, note? }. */
export async function POST(req: Request) {
  let body: { slotId?: string; name?: string; email?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const slotIdParam = (body.slotId ?? "").trim();
  const name = (body.name ?? "").trim().slice(0, 120);
  const email = (body.email ?? "").trim().slice(0, 200);
  const note = (body.note ?? "").trim().slice(0, 1000) || undefined;

  if (!slotIdParam || !name || !EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "A slot, your name, and a valid email are required." },
      { status: 400 }
    );
  }

  const result = await bookSlot(slotIdParam, { name, email, note });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ booked: { id: result.slot.id, date: result.slot.date, time: result.slot.time } });
}
