import { NextResponse } from "next/server";
import { listOpenSlots } from "@/lib/bookings";

export const dynamic = "force-dynamic";

/** Visitor-facing availability: upcoming, unclaimed 30-minute slots. */
export async function GET() {
  const slots = await listOpenSlots();
  return NextResponse.json({ slots });
}
