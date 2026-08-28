"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { EmptyState, PageHeading, StatCard, relTime, useAdmin } from "./AdminShell";

type SlotBooking = { name: string; email: string; note?: string; at: string };
type Slot = { id: string; date: string; time: string; booking: SlotBooking | null };

/**
 * /admin/bookings — the roster view of claimed calls.
 *
 * /admin/slots is a calendar grid, which is the right shape for OPENING and
 * CLOSING availability but a poor one for answering "who is on my calendar and
 * how do I reach them". This screen is that list, grouped by day.
 */
export default function AdminBookings() {
  const { adminFetch } = useAdmin();
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await adminFetch("/api/admin/slots");
      if (!res.ok) throw new Error("Could not load the calendar.");
      const data = (await res.json()) as { slots: Slot[] };
      setSlots(data.slots);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoaded(true);
    }
  }, [adminFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  const booked = useMemo(() => slots.filter((s) => s.booking), [slots]);

  /** Group by day so the list reads like a diary rather than a flat table. */
  const byDay = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of booked) map.set(s.date, [...(map.get(s.date) ?? []), s]);
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [booked]);

  const cancel = async (slot: Slot) => {
    const b = slot.booking!;
    if (
      !window.confirm(
        `Cancel ${b.name}'s call on ${slot.date} at ${slot.time}?\n\nThe slot goes back on sale immediately. They are NOT emailed automatically — tell them yourself.`
      )
    )
      return;
    setBusyId(slot.id);
    try {
      const res = await adminFetch(`/api/admin/slots?id=${encodeURIComponent(slot.id)}&free=1`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(((await res.json()) as { error: string }).error);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not cancel that booking.");
    } finally {
      setBusyId(null);
    }
  };

  const dayLabel = (date: string) =>
    new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
      weekday: "long",
      day: "numeric",
      month: "long",
    });

  return (
    <>
      <PageHeading
        title="Booked calls"
        sub="Every upcoming 30-minute call claimed from the contact page. All times are IST, matching what the visitor saw."
        action={
          <div className="flex gap-2">
            <Link
              href="/admin/slots"
              className="rounded-full border border-[#741a14]/30 px-4 py-2 font-sans-luxury text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#741a14] transition-colors hover:bg-[#741a14]/10"
            >
              Edit availability
            </Link>
            <button
              onClick={() => void load()}
              className="cursor-pointer rounded-full bg-[#741a14] px-4 py-2 font-sans-luxury text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#fff3d3] transition-opacity hover:opacity-90"
            >
              Refresh
            </button>
          </div>
        }
      />

      <div className="mb-8 grid grid-cols-3 gap-3">
        <StatCard label="Booked" value={booked.length} tone={booked.length ? "maroon" : "cream"} />
        <StatCard label="Open" value={slots.length - booked.length} hint="Visible to visitors" />
        <StatCard label="On calendar" value={slots.length} hint="Upcoming slots" />
      </div>

      {error ? (
        <p role="alert" className="mb-4 font-sans-luxury text-[12.5px] text-[#a3231b]">
          {error}
        </p>
      ) : null}

      {!loaded ? (
        <EmptyState>Loading…</EmptyState>
      ) : byDay.length === 0 ? (
        <EmptyState>
          No calls booked.{" "}
          <Link href="/admin/slots" className="underline decoration-[#741a14]/40 underline-offset-2">
            Open some slots
          </Link>{" "}
          and they will show up here as visitors claim them.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-6">
          {byDay.map(([date, daySlots]) => (
            <section key={date}>
              <h2 className="mb-2 font-sans-luxury text-[11px] font-bold uppercase tracking-[0.16em] text-black/45">
                {dayLabel(date)}
              </h2>
              <ul className="overflow-hidden rounded-[10px] border border-[#741a14]/18 bg-white">
                {daySlots
                  .sort((a, b) => a.time.localeCompare(b.time))
                  .map((s, i) => {
                    const b = s.booking!;
                    return (
                      <motion.li
                        key={s.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.35, delay: Math.min(i, 6) * 0.04 }}
                        className="flex flex-wrap items-start gap-x-4 gap-y-2 border-b border-[#741a14]/10 px-5 py-4 last:border-b-0"
                      >
                        <span className="min-w-[62px] font-serif-luxury text-[22px] leading-none text-[#741a14]">
                          {s.time}
                        </span>
                        <div className="min-w-[180px] flex-1">
                          <p className="font-sans-luxury text-[14px] font-medium text-black">{b.name}</p>
                          <a
                            href={`mailto:${b.email}`}
                            className="font-sans-luxury text-[12.5px] text-black/55 underline decoration-[#741a14]/30 underline-offset-2"
                          >
                            {b.email}
                          </a>
                          {b.note ? (
                            <p className="mt-1.5 whitespace-pre-wrap font-sans-luxury text-[12.5px] leading-[1.5] text-black/70">
                              {b.note}
                            </p>
                          ) : null}
                          <p
                            className="mt-1 font-sans-luxury text-[11px] text-black/35"
                            title={new Date(b.at).toLocaleString()}
                          >
                            Booked {relTime(b.at)}
                          </p>
                        </div>
                        <div className="ml-auto flex gap-2">
                          <a
                            href={`mailto:${b.email}?subject=${encodeURIComponent(
                              `Our call on ${s.date} at ${s.time}`
                            )}`}
                            className="rounded-full border border-[#741a14]/30 px-3.5 py-1.5 font-sans-luxury text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#741a14] transition-colors hover:bg-[#741a14]/10"
                          >
                            Email
                          </a>
                          <button
                            disabled={busyId === s.id}
                            onClick={() => void cancel(s)}
                            className="cursor-pointer rounded-full border border-[#a3231b]/40 px-3.5 py-1.5 font-sans-luxury text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#a3231b] transition-colors hover:bg-[#a3231b]/10 disabled:opacity-40"
                          >
                            Cancel
                          </button>
                        </div>
                      </motion.li>
                    );
                  })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
