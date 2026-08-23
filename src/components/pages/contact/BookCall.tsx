"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CONTACT_PAGE } from "@/lib/constants";

/**
 * "Book a 30-minute call" — the in-site take on trionn's Calendly button.
 * Expanding panel under the contact form: pick a day (next two weeks of
 * admin-published availability), pick a 30-minute slot, leave name + email,
 * confirm. Slots come live from /api/slots — exactly the calendar the admin
 * curates at /admin/slots — and a claimed slot disappears for everyone else.
 */
type OpenSlot = { id: string; date: string; time: string };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function prettyDay(date: string) {
  const d = new Date(`${date}T00:00:00`);
  return { dow: WEEKDAYS[d.getDay()], day: d.getDate(), month: MONTHS[d.getMonth()] };
}

function prettyTime(time: string) {
  const [h, m] = time.split(":").map(Number);
  const am = h < 12;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${am ? "AM" : "PM"}`;
}

const field =
  "h-[52px] w-full rounded-[8px] border border-[#fff3d3]/35 bg-transparent px-5 font-sans-luxury text-[14px] text-[#fff3d3] outline-none transition-colors placeholder:text-[#fff3d3]/60 focus:border-[#fff3d3] [&:-webkit-autofill]:[-webkit-text-fill-color:#fff3d3] [&:-webkit-autofill]:[transition:background-color_9999s_ease-in-out_0s] [&:-webkit-autofill]:[box-shadow:0_0_0_1000px_#741a14_inset]";

/** Same rule the API validates with, so client and server agree. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function BookFieldError({ msg }: { msg?: string }) {
  return msg ? (
    <p role="alert" className="mt-1.5 font-sans-luxury text-[12px] text-[#ffcf9a]">
      {msg}
    </p>
  ) : null;
}

export default function BookCall() {
  const t = CONTACT_PAGE.bookCall;
  const [open, setOpen] = useState(false);
  const [slots, setSlots] = useState<OpenSlot[] | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [slotIdSel, setSlotIdSel] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [booked, setBooked] = useState<OpenSlot | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/slots", { cache: "no-store" });
      const data = (await res.json()) as { slots: OpenSlot[] };
      setSlots(data.slots);
      setDay((d) => d ?? data.slots[0]?.date ?? null);
    } catch {
      setSlots([]);
    }
  }, []);

  useEffect(() => {
    if (open && slots === null) void load();
  }, [open, slots, load]);

  const days = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of slots ?? []) map.set(s.date, (map.get(s.date) ?? 0) + 1);
    return [...map.entries()].map(([date, count]) => ({ date, count }));
  }, [slots]);

  const daySlots = useMemo(() => (slots ?? []).filter((s) => s.date === day), [slots, day]);

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;

    // warn on anything missing rather than silently doing nothing
    const found: Record<string, string> = {};
    if (!slotIdSel) found.slot = "Please pick a time slot first.";
    if (!name.trim()) found.name = "Please enter your name.";
    const mail = email.trim();
    if (!mail) found.email = "Please enter your email address.";
    else if (!EMAIL_RE.test(mail)) found.email = "That email address doesn't look right.";
    setFieldErrors(found);
    if (Object.keys(found).length > 0) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slotId: slotIdSel, name, email }),
      });
      const data = (await res.json()) as { booked?: OpenSlot; error?: string };
      if (!res.ok || !data.booked) {
        setError(data.error ?? "Something went wrong — try another slot.");
        setSlotIdSel(null);
        await load();
      } else {
        setBooked(data.booked);
      }
    } catch {
      setError("Network hiccup — please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full">
      {/* Trigger — bordered pill, same language as trionn's book-a-call row */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="group flex w-full cursor-pointer items-center justify-center gap-3 rounded-[10px] border border-[#fff3d3]/45 bg-black/20 px-6 py-5 transition-colors hover:border-[#fff3d3] hover:bg-black/30"
      >
        <span className="inline-block size-[7px] rounded-full bg-[#26e07f] shadow-[0_0_10px_rgba(38,224,127,0.9)]" />
        <span className="font-sans-luxury text-[max(13px,0.95vw)] font-bold uppercase tracking-[0.08em] text-[#fff3d3]">
          {t.cta}
        </span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.3 }}
          className="font-sans-luxury text-[15px] text-[#fff3d3]/80"
          aria-hidden="true"
        >
          ↓
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-5 rounded-[10px] border border-[#fff3d3]/25 bg-black/15 p-6 sm:p-8">
              {booked ? (
                <div className="py-6 text-center">
                  <p className="font-serif-luxury text-[max(26px,2.2vw)] text-[#fff3d3]">{t.successTitle}</p>
                  <p className="mt-3 font-sans-luxury text-[15px] font-bold text-[#fff3d3]">
                    {prettyDay(booked.date).dow}, {prettyDay(booked.date).day} {prettyDay(booked.date).month} ·{" "}
                    {prettyTime(booked.time)} IST · 30 min
                  </p>
                  <p className="mt-2 font-sans-luxury text-[13px] text-[#fff3d3]/75">{t.successBody}</p>
                </div>
              ) : (
                <>
                  <p className="font-sans-luxury text-[15px] font-bold text-[#fff3d3]">{t.heading}</p>
                  <p className="mt-1 font-sans-luxury text-[12.5px] text-[#fff3d3]/70">{t.sub}</p>

                  {slots === null ? (
                    <p className="mt-6 font-sans-luxury text-[13px] text-[#fff3d3]/70">Loading availability…</p>
                  ) : days.length === 0 ? (
                    <p className="mt-6 font-sans-luxury text-[13px] text-[#fff3d3]/80">{t.empty}</p>
                  ) : (
                    <>
                      {/* Day strip */}
                      <div className="mt-6 flex gap-2 overflow-x-auto pb-2">
                        {days.map(({ date, count }) => {
                          const p = prettyDay(date);
                          const active = date === day;
                          return (
                            <button
                              key={date}
                              type="button"
                              onClick={() => {
                                setDay(date);
                                setSlotIdSel(null);
                              }}
                              className={`flex w-[74px] shrink-0 cursor-pointer flex-col items-center rounded-[8px] border px-2 py-3 transition-colors ${
                                active
                                  ? "border-[#fff3d3] bg-[#fff3d3] text-[#741a14]"
                                  : "border-[#fff3d3]/35 text-[#fff3d3] hover:border-[#fff3d3]/80"
                              }`}
                            >
                              <span className="font-sans-luxury text-[11px] font-bold uppercase opacity-75">{p.dow}</span>
                              <span className="font-serif-luxury text-[22px] leading-tight">{p.day}</span>
                              <span className="font-sans-luxury text-[10.5px] uppercase opacity-75">{p.month}</span>
                              <span className={`mt-1 font-sans-luxury text-[10px] ${active ? "opacity-70" : "opacity-55"}`}>
                                {count} open
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Time grid */}
                      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                        {daySlots.map((s) => {
                          const active = s.id === slotIdSel;
                          return (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => {
                                setSlotIdSel(active ? null : s.id);
                                // drop the "pick a time slot" warning the
                                // moment they actually pick one
                                if (!active) setFieldErrors((p) => ({ ...p, slot: "" }));
                              }}
                              className={`cursor-pointer rounded-[8px] border py-3 font-sans-luxury text-[13px] font-bold transition-colors ${
                                active
                                  ? "border-[#fff3d3] bg-[#fff3d3] text-[#741a14]"
                                  : "border-[#fff3d3]/35 text-[#fff3d3] hover:border-[#fff3d3]/80"
                              }`}
                            >
                              {prettyTime(s.time)}
                            </button>
                          );
                        })}
                      </div>

                      <BookFieldError msg={fieldErrors.slot} />

                      {/* Claim form — ALWAYS rendered once the panel is open,
                          not gated on a slot being picked. Gating it meant the
                          confirm button did not exist yet, so "no slot chosen"
                          could never be reported; now every requirement
                          (slot + name + email) is enforced from one place. */}
                      {/* noValidate: without it the browser's own type="email"
                          check blocks submit for a malformed address, so this
                          handler never runs and the visitor gets a native
                          tooltip (or, on a mis-scrolled form, nothing at all)
                          instead of our styled warning. */}
                      <form onSubmit={confirm} noValidate>
                            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                              <div>
                                <input
                                  type="text"
                                  placeholder="Full Name *"
                                  aria-label="Full Name"
                                  aria-invalid={Boolean(fieldErrors.name)}
                                  value={name}
                                  onChange={(e) => {
                                    setName(e.target.value);
                                    setFieldErrors((p) => ({ ...p, name: "" }));
                                  }}
                                  className={`${field} ${fieldErrors.name ? "border-[#ffcf9a]" : ""}`}
                                />
                                <BookFieldError msg={fieldErrors.name} />
                              </div>
                              <div>
                                <input
                                  type="email"
                                  placeholder="Email address *"
                                  aria-label="Email address"
                                  aria-invalid={Boolean(fieldErrors.email)}
                                  value={email}
                                  onChange={(e) => {
                                    setEmail(e.target.value);
                                    setFieldErrors((p) => ({ ...p, email: "" }));
                                  }}
                                  className={`${field} ${fieldErrors.email ? "border-[#ffcf9a]" : ""}`}
                                />
                                <BookFieldError msg={fieldErrors.email} />
                              </div>
                            </div>
                            <button
                              type="submit"
                              disabled={busy}
                              className="mt-4 w-full cursor-pointer rounded-[8px] bg-[#fff3d3] py-4 font-sans-luxury text-[13px] font-bold uppercase tracking-[0.08em] text-[#741a14] transition-opacity hover:opacity-90 disabled:opacity-60"
                            >
                              {busy ? "BOOKING…" : t.confirm}
                            </button>
                      </form>

                      {error ? (
                        <p className="mt-3 font-sans-luxury text-[12.5px] text-[#ffd9a8]">{error}</p>
                      ) : null}
                    </>
                  )}
                </>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
