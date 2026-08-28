"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { EmptyState, PageHeading, StatCard, relTime, useAdmin } from "./AdminShell";

/** Shape returned by /api/admin/summary. */
type Summary = {
  inquiries: { total: number; new: number; read: number; archived: number; lastSevenDays: number };
  calls: {
    upcomingSlots: number;
    open: number;
    booked: number;
    next: { id: string; date: string; time: string; name: string; email: string } | null;
  };
  content: { projects: number; servicePanels: number; routes: string[] };
  activity: {
    kind: "inquiry" | "booking";
    at: string;
    id: string;
    who: string;
    email: string;
    detail: string;
    status: string;
  }[];
};

function prettyDate(date: string, time: string) {
  const d = new Date(`${date}T${time}:00`);
  return d.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminOverview() {
  const { adminFetch } = useAdmin();
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await adminFetch("/api/admin/summary");
      if (!res.ok) throw new Error("Could not load the dashboard.");
      setData((await res.json()) as Summary);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
  }, [adminFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <EmptyState>{error}</EmptyState>;
  if (!data) return <EmptyState>Loading…</EmptyState>;

  const { inquiries, calls, content, activity } = data;

  return (
    <>
      <PageHeading
        title="Overview"
        sub="Everything the site has received — contact-form inquiries and booked calls — plus what is currently published."
        action={
          <button
            onClick={() => void load()}
            className="cursor-pointer rounded-full border border-[#741a14]/30 px-4 py-2 font-sans-luxury text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#741a14] transition-colors hover:bg-[#741a14]/10"
          >
            Refresh
          </button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="New inquiries"
          value={inquiries.new}
          hint={`${inquiries.total} total · ${inquiries.lastSevenDays} in the last 7 days`}
          tone={inquiries.new > 0 ? "maroon" : "cream"}
        />
        <StatCard label="Booked calls" value={calls.booked} hint="Upcoming, from the contact page" />
        <StatCard label="Open slots" value={calls.open} hint={`${calls.upcomingSlots} slots on the calendar`} />
        <StatCard
          label="Published"
          value={content.projects}
          hint={`case studies · ${content.servicePanels} service panels`}
        />
      </div>

      {/* Next call — the one thing worth surfacing above the fold */}
      <section className="mt-8">
        <h2 className="font-sans-luxury text-[11px] font-bold uppercase tracking-[0.16em] text-black/45">
          Next call
        </h2>
        {calls.next ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-4 rounded-[10px] border border-[#741a14]/18 bg-white p-5">
            <div>
              <p className="font-serif-luxury text-[24px] leading-none text-[#741a14]">
                {prettyDate(calls.next.date, calls.next.time)}
              </p>
              <p className="mt-2 font-sans-luxury text-[13px] text-black/70">
                {calls.next.name} ·{" "}
                <a href={`mailto:${calls.next.email}`} className="underline decoration-[#741a14]/40 underline-offset-2">
                  {calls.next.email}
                </a>
              </p>
            </div>
            <Link
              href="/admin/bookings"
              className="rounded-full bg-[#741a14] px-4 py-2 font-sans-luxury text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#fff3d3] transition-opacity hover:opacity-90"
            >
              All calls
            </Link>
          </div>
        ) : (
          <div className="mt-3">
            <EmptyState>
              No calls booked yet.{" "}
              <Link href="/admin/slots" className="underline decoration-[#741a14]/40 underline-offset-2">
                Open some slots
              </Link>{" "}
              so visitors can pick a time.
            </EmptyState>
          </div>
        )}
      </section>

      {/* Activity — inquiries and bookings merged, newest first */}
      <section className="mt-8">
        <div className="flex items-end justify-between gap-3">
          <h2 className="font-sans-luxury text-[11px] font-bold uppercase tracking-[0.16em] text-black/45">
            Recent activity
          </h2>
          <Link
            href="/admin/inquiries"
            className="font-sans-luxury text-[11px] font-bold uppercase tracking-[0.12em] text-[#741a14] underline decoration-[#741a14]/40 underline-offset-4"
          >
            All inquiries
          </Link>
        </div>

        {activity.length === 0 ? (
          <div className="mt-3">
            <EmptyState>
              Nothing yet. Submissions from the contact form and booked calls will appear here.
            </EmptyState>
          </div>
        ) : (
          <ul className="mt-3 overflow-hidden rounded-[10px] border border-[#741a14]/18 bg-white">
            {activity.map((a, i) => (
              <motion.li
                key={`${a.kind}-${a.id}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: Math.min(i, 8) * 0.035 }}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[#741a14]/10 px-5 py-3.5 last:border-b-0"
              >
                <span
                  className={`rounded-full px-2 py-0.5 font-sans-luxury text-[9.5px] font-bold uppercase tracking-[0.12em] ${
                    a.kind === "booking"
                      ? "bg-[#741a14] text-[#fff3d3]"
                      : a.status === "new"
                        ? "bg-[#f0c56a] text-[#4b2a06]"
                        : "bg-[#741a14]/10 text-[#741a14]"
                  }`}
                >
                  {a.kind === "booking" ? "Call" : a.status}
                </span>
                <span className="font-sans-luxury text-[13.5px] font-medium text-black">{a.who}</span>
                <span className="font-sans-luxury text-[12.5px] text-black/50">{a.detail}</span>
                <span
                  className="ml-auto font-sans-luxury text-[11.5px] text-black/40"
                  title={new Date(a.at).toLocaleString()}
                >
                  {relTime(a.at)}
                </span>
              </motion.li>
            ))}
          </ul>
        )}
      </section>

      {/* Content is compiled, not editable at runtime — say so plainly rather
          than shipping an editor that cannot actually publish. */}
      <section className="mt-8">
        <h2 className="font-sans-luxury text-[11px] font-bold uppercase tracking-[0.16em] text-black/45">
          Published content
        </h2>
        <div className="mt-3 rounded-[10px] border border-[#741a14]/18 bg-white p-5">
          <div className="flex flex-wrap gap-2">
            {content.routes.map((r) => (
              <a
                key={r}
                href={r}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-[#741a14]/25 px-3 py-1.5 font-sans-luxury text-[11.5px] text-[#741a14] transition-colors hover:bg-[#741a14]/10"
              >
                {r}
              </a>
            ))}
          </div>
          <p className="mt-4 font-sans-luxury text-[12.5px] leading-[1.55] text-black/55">
            Page copy and the {content.projects} case studies live in{" "}
            <code className="rounded bg-[#741a14]/8 px-1.5 py-0.5 text-[11.5px] text-[#741a14]">
              src/lib/constants.ts
            </code>{" "}
            and are statically generated at build time, so they are shown here as an inventory only —
            changing them is a code edit plus a redeploy, not a runtime write.
          </p>
        </div>
      </section>
    </>
  );
}
