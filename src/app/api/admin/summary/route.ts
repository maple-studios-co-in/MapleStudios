import { NextResponse } from "next/server";
import { isAdminKeyConfigured, isAdminKeyValid, listAllSlots } from "@/lib/bookings";
import { listInquiries } from "@/lib/inquiries";
import { SERVICES_PAGE, WORK_PAGE } from "@/lib/constants";

export const dynamic = "force-dynamic";

/**
 * One call behind the /admin overview: every KPI and the merged activity feed,
 * so the dashboard does not fan out to three endpoints on load.
 */
export async function GET(req: Request) {
  if (!isAdminKeyConfigured())
    return NextResponse.json(
      {
        error:
          "This deployment has no MAPLE_ADMIN_KEY set, so the admin API is disabled. Set it in the hosting environment and redeploy.",
        code: "admin_key_unconfigured",
      },
      { status: 503 }
    );
  if (!isAdminKeyValid(req.headers.get("x-admin-key")))
    return NextResponse.json({ error: "Invalid admin key." }, { status: 401 });

  const [inquiries, slots] = await Promise.all([listInquiries(), listAllSlots()]);
  const weekAgo = Date.now() - 7 * 86400_000;

  const booked = slots.filter((s) => s.booking);
  const open = slots.filter((s) => !s.booking);

  /** Newest-first stream of everything that came IN, so the overview can show
      "what happened lately" without the client merging two shapes. */
  const activity = [
    ...inquiries.map((i) => ({
      kind: "inquiry" as const,
      at: i.at,
      id: i.id,
      who: i.name,
      email: i.email,
      detail: i.service || "Inquiry",
      status: i.status,
    })),
    ...booked.map((s) => ({
      kind: "booking" as const,
      at: s.booking!.at,
      id: s.id,
      who: s.booking!.name,
      email: s.booking!.email,
      detail: `${s.date} at ${s.time}`,
      status: "booked" as const,
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 12);

  return NextResponse.json({
    inquiries: {
      total: inquiries.length,
      new: inquiries.filter((i) => i.status === "new").length,
      read: inquiries.filter((i) => i.status === "read").length,
      archived: inquiries.filter((i) => i.status === "archived").length,
      lastSevenDays: inquiries.filter((i) => new Date(i.at).getTime() > weekAgo).length,
    },
    calls: {
      upcomingSlots: slots.length,
      open: open.length,
      booked: booked.length,
      /** soonest upcoming booked call, for the "next call" tile */
      next: booked.length
        ? (() => {
            const n = booked[0];
            return { id: n.id, date: n.date, time: n.time, name: n.booking!.name, email: n.booking!.email };
          })()
        : null,
    },
    /** Page copy and case studies are compiled into src/lib/constants.ts and
        statically generated, so they are reported here as an inventory only —
        editing them needs a code change plus a redeploy, not a runtime write. */
    content: {
      projects: WORK_PAGE.projects.length,
      servicePanels: SERVICES_PAGE.panels.length,
      routes: ["/", "/about", "/work", "/services", "/contact"],
    },
    activity,
  });
}
