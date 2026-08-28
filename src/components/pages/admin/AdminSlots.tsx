"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { PageHeading, useAdmin } from "./AdminShell";

/**
 * /admin/slots — the studio-side calendar behind the contact page's
 * "Book a 30-minute call". Two weeks of days; each day shows every
 * half-hour between 09:00 and 18:30 as a cell the admin toggles:
 *
 *   outlined  = closed (visitors never see it)   → click to open
 *   filled    = open (visible on the contact page) → click to close
 *   maroon    = booked (name + email shown)        → ✕ frees it again
 *
 * Auth used to be duplicated in here; it now lives in <AdminShell>, which
 * owns the key prompt and hands every screen the same `adminFetch`.
 */
type SlotBooking = { name: string; email: string; note?: string; at: string };
type Slot = { id: string; date: string; time: string; booking: SlotBooking | null };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_COUNT = 14;
const TIMES = Array.from({ length: 20 }, (_, i) => {
  const h = 9 + Math.floor(i / 2);
  return `${String(h).padStart(2, "0")}:${i % 2 ? "30" : "00"}`;
});

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function AdminSlots() {
  const { adminFetch } = useAdmin();
  const [slots, setSlots] = useState<Slot[]>([]);
  const [day, setDay] = useState(() => isoDate(new Date(Date.now() + 86400000)));
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const days = useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i < DAY_COUNT; i++) out.push(isoDate(new Date(Date.now() + (i + 1) * 86400000)));
    return out;
  }, []);

  const load = useCallback(async () => {
    const res = await adminFetch("/api/admin/slots");
    if (!res.ok) {
      setError("Could not load the calendar.");
      return;
    }
    const data = (await res.json()) as { slots: Slot[] };
    setSlots(data.slots);
    setError(null);
  }, [adminFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  const byId = useMemo(() => new Map(slots.map((s) => [s.id, s])), [slots]);

  const toggle = async (time: string) => {
    const id = `${day} ${time}`;
    const existing = byId.get(id);
    setBusyId(id);
    setError(null);
    try {
      if (!existing) {
        const res = await adminFetch("/api/admin/slots", {
          method: "POST",
          body: JSON.stringify({ date: day, time }),
        });
        if (!res.ok) throw new Error((await res.json()).error);
      } else if (existing.booking) {
        if (!window.confirm(`Free ${existing.booking.name}'s ${time} booking? They will NOT be emailed automatically.`))
          return;
        const res = await adminFetch(`/api/admin/slots?id=${encodeURIComponent(id)}&free=1`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error((await res.json()).error);
      } else {
        const res = await adminFetch(`/api/admin/slots?id=${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error((await res.json()).error);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusyId(null);
    }
  };

  const dayMeta = (d: string) => {
    const dt = new Date(`${d}T00:00:00`);
    return { dow: WEEKDAYS[dt.getDay()], num: dt.getDate(), month: MONTHS[dt.getMonth()] };
  };
  const openCount = (d: string) => slots.filter((s) => s.date === d && !s.booking).length;
  const bookedCount = (d: string) => slots.filter((s) => s.date === d && s.booking).length;

  return (
    <>
      <PageHeading
        title="Availability"
        sub="What you open here is exactly what visitors can book on the contact page. Times are IST."
        action={
          <div className="flex items-center gap-4 font-sans-luxury text-[12px] text-black/70">
            <span className="flex items-center gap-2">
              <span className="inline-block size-3 rounded-[3px] border border-[#741a14]/50" /> closed
            </span>
            <span className="flex items-center gap-2">
              <span className="inline-block size-3 rounded-[3px] bg-[#2c7a4b]" /> open
            </span>
            <span className="flex items-center gap-2">
              <span className="inline-block size-3 rounded-[3px] bg-[#741a14]" /> booked
            </span>
          </div>
        }
      />

      {/* Day strip */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {days.map((d) => {
          const m = dayMeta(d);
          const active = d === day;
          const open = openCount(d);
          const booked = bookedCount(d);
          return (
            <button
              key={d}
              type="button"
              onClick={() => setDay(d)}
              className={`flex w-[86px] shrink-0 cursor-pointer flex-col items-center rounded-[8px] border px-2 py-3 transition-colors ${
                active
                  ? "border-[#741a14] bg-[#741a14] text-[#fff3d3]"
                  : "border-[#741a14]/35 text-[#741a14] hover:border-[#741a14]"
              }`}
            >
              <span className="font-sans-luxury text-[11px] font-bold uppercase opacity-75">{m.dow}</span>
              <span className="font-serif-luxury text-[24px] leading-tight">{m.num}</span>
              <span className="font-sans-luxury text-[10.5px] uppercase opacity-75">{m.month}</span>
              <span className="mt-1 font-sans-luxury text-[10px] opacity-70">
                {open} open{booked ? ` · ${booked} booked` : ""}
              </span>
            </button>
          );
        })}
      </div>

      {/* Half-hour grid for the selected day */}
      <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
        {TIMES.map((time) => {
          const id = `${day} ${time}`;
          const slot = byId.get(id);
          const booked = Boolean(slot?.booking);
          const open = Boolean(slot) && !booked;
          return (
            <motion.button
              key={id}
              type="button"
              whileTap={{ scale: 0.97 }}
              disabled={busyId === id}
              onClick={() => void toggle(time)}
              title={
                booked
                  ? `${slot?.booking?.name} · ${slot?.booking?.email} — click to free`
                  : open
                    ? "Open — click to close"
                    : "Closed — click to open"
              }
              className={`cursor-pointer rounded-[8px] border px-3 py-4 text-left font-sans-luxury transition-colors disabled:opacity-50 ${
                booked
                  ? "border-[#741a14] bg-[#741a14] text-[#fff3d3]"
                  : open
                    ? "border-[#2c7a4b] bg-[#2c7a4b] text-white"
                    : "border-[#741a14]/40 text-[#741a14] hover:border-[#741a14]"
              }`}
            >
              <span className="block text-[14px] font-bold">{time}</span>
              <span className="mt-1 block truncate text-[11px] opacity-80">
                {booked ? `${slot?.booking?.name} ✕` : open ? "open — 30 min" : "closed"}
              </span>
            </motion.button>
          );
        })}
      </div>

      {error ? <p className="mt-4 font-sans-luxury text-[13px] text-[#a1281e]">{error}</p> : null}
    </>
  );
}
