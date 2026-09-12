import { NextResponse } from "next/server";

import { denyIfUnauthorized } from "@/lib/admin/cms/guard";
import { readAll } from "@/lib/admin/cms/store";
import type { BlogPost, Contact, Portfolio, Subscriber } from "@/lib/admin/cms/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Label for the last 12 calendar months, oldest first. */
function lastTwelveMonths() {
  const out: { key: string; label: string }[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 11; i >= 0; i -= 1) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push({
      key: `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`,
      label: m.toLocaleString(undefined, { month: "short" }),
    });
  }
  return out;
}

/**
 * One call behind the CMS dashboard: counts, the recent-enquiry strip, and the
 * 12-month histogram. Kept server-side so the dashboard does not pull four
 * whole collections down to the browser just to count them.
 */
export async function GET(req: Request) {
  const denied = denyIfUnauthorized(req);
  if (denied) return denied;

  const [contacts, portfolio, blog, subscribers] = await Promise.all([
    readAll<Contact>("contacts"),
    readAll<Portfolio>("portfolio"),
    readAll<BlogPost>("blog"),
    readAll<Subscriber>("newsletter"),
  ]);

  const thirtyDaysAgo = Date.now() - 30 * 86_400_000;
  const recentCount = contacts.filter((c) => new Date(c.createdAt).getTime() >= thirtyDaysAgo).length;

  // Which service line gets asked for most — the console shows this as the
  // headline "most selected" tile.
  const tally = new Map<string, number>();
  for (const c of contacts) {
    const k = (c.project || "").trim();
    if (k) tally.set(k, (tally.get(k) ?? 0) + 1);
  }
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];

  const buckets = new Map(lastTwelveMonths().map((m) => [m.key, 0]));
  for (const c of contacts) {
    const d = new Date(c.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  return NextResponse.json({
    totals: {
      contacts: contacts.length,
      contactsLast30: recentCount,
      portfolio: portfolio.length,
      blog: blog.length,
      subscribers: subscribers.filter((s) => s.status === "active").length,
    },
    mostSelected: top ? { label: top[0], count: top[1] } : null,
    recent: contacts
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5)
      .map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        project: c.project,
        createdAt: c.createdAt,
      })),
    months: lastTwelveMonths().map((m) => ({ label: m.label, count: buckets.get(m.key) ?? 0 })),
  });
}
