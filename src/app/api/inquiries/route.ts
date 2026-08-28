import { NextResponse } from "next/server";
import { addInquiry } from "@/lib/inquiries";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Per-instance throttle so a public write endpoint cannot be hammered.
    Deliberately simple: this is a demo-grade guard, not a substitute for a
    real rate limiter at the edge (it resets on every cold start). */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, number[]>();

function throttled(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  // keep the map from growing forever on a long-lived instance
  if (hits.size > 500) for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  return recent.length > MAX_PER_WINDOW;
}

/**
 * Public: record one contact-form submission so /admin/inquiries can show it.
 *
 * The form still opens its `mailto:` as well — this endpoint is additive, and
 * it is called with `keepalive` so the navigation to the mail client cannot
 * cancel it. A failure here must never block the visitor, so the client
 * ignores the response.
 */
export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  if (throttled(ip)) {
    return NextResponse.json({ error: "Too many submissions — try again shortly." }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const name = str(body.name, 120);
  const email = str(body.email, 200);
  const company = str(body.company, 160);
  const service = str(body.service, 120);
  const budget = str(body.budget, 60);
  const message = str(body.message, 4000);

  if (!name || !EMAIL_RE.test(email) || !message) {
    return NextResponse.json(
      { error: "A name, a valid email and a message are required." },
      { status: 400 }
    );
  }

  try {
    const inquiry = await addInquiry({
      name,
      email,
      company: company || undefined,
      service,
      budget,
      message,
    });
    return NextResponse.json({ ok: true, id: inquiry.id }, { status: 201 });
  } catch (err) {
    // The visitor is never blocked by this — the contact form fires the POST
    // fire-and-forget and still opens its mailto: — but log loudly, because a
    // failure here means an inquiry exists only in the studio's inbox.
    console.error("[inquiries] failed to persist submission", err);
    return NextResponse.json({ error: "Could not record that inquiry." }, { status: 503 });
  }
}
