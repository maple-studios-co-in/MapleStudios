"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import LogoMark from "@/components/common/LogoMark";

/**
 * Chrome + auth for every /admin screen.
 *
 * The whole dashboard is gated on ONE key sent as `x-admin-key`
 * (MAPLE_ADMIN_KEY, default "maple-admin" for local demos) and remembered in
 * sessionStorage. Before this existed each admin page carried its own copy of
 * that dance; now the shell owns it and screens just call `adminFetch`.
 *
 * The gate is convenience, not security — every /api/admin/* route validates
 * the key server-side on every request, which is what actually protects the
 * data. Rendering the shell unauthenticated exposes nothing.
 */
type AdminCtx = {
  /** the validated key, "" until sign-in */
  key: string;
  /** fetch against an /api/admin/* route with the key attached */
  adminFetch: (input: string, init?: RequestInit) => Promise<Response>;
  signOut: () => void;
};

const Ctx = createContext<AdminCtx | null>(null);

export function useAdmin() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAdmin must be used inside <AdminShell>");
  return ctx;
}

const NAV = [
  { href: "/admin", label: "Overview", hint: "At a glance" },
  { href: "/admin/inquiries", label: "Inquiries", hint: "Contact form" },
  { href: "/admin/bookings", label: "Calls", hint: "Booked slots" },
  { href: "/admin/slots", label: "Availability", hint: "Open / close slots" },
];

const STORAGE_KEY = "maple-admin-key";

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [key, setKey] = useState("");
  const [draft, setDraft] = useState("");
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** Validate a key by hitting a cheap guarded endpoint.
      A 503 means the DEPLOYMENT has no MAPLE_ADMIN_KEY (production fails
      closed) — a different problem from a mistyped key, so it gets its own
      message rather than sending the operator round the wrong loop. */
  const verify = useCallback(async (candidate: string) => {
    const res = await fetch("/api/admin/summary", {
      headers: { "x-admin-key": candidate },
      cache: "no-store",
    });
    if (res.ok) return { ok: true as const };
    if (res.status === 503) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false as const, message: body.error ?? "The admin API is disabled on this deployment." };
    }
    return { ok: false as const };
  }, []);

  // restore a session key if there is one
  useEffect(() => {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (!saved) {
      setChecking(false);
      return;
    }
    let alive = true;
    void verify(saved).then((result) => {
      if (!alive) return;
      if (result.ok) {
        setKey(saved);
        setAuthed(true);
      } else {
        sessionStorage.removeItem(STORAGE_KEY);
        if (result.message) setError(result.message);
      }
      setChecking(false);
    });
    return () => {
      alive = false;
    };
  }, [verify]);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const candidate = draft.trim();
    if (!candidate) return setError("Enter the admin key.");
    const result = await verify(candidate);
    if (result.ok) {
      sessionStorage.setItem(STORAGE_KEY, candidate);
      setKey(candidate);
      setAuthed(true);
      setDraft("");
    } else {
      setError(result.message ?? "That key wasn't accepted.");
    }
  };

  const signOut = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setKey("");
    setAuthed(false);
  }, []);

  const adminFetch = useCallback(
    (input: string, init: RequestInit = {}) =>
      fetch(input, {
        ...init,
        cache: "no-store",
        headers: { ...(init.headers ?? {}), "x-admin-key": key, "content-type": "application/json" },
      }),
    [key]
  );

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fff3d3]">
        <span className="font-sans-luxury text-[13px] uppercase tracking-[0.28em] text-[#741a14]/60">
          Checking session…
        </span>
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fff3d3] px-6">
        <motion.form
          onSubmit={signIn}
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-[380px] rounded-[10px] border border-[#741a14]/20 bg-white p-8 shadow-[0_18px_50px_rgba(116,26,20,0.10)]"
        >
          <LogoMark className="h-[26px] w-auto text-[#741a14]" />
          <h1 className="mt-5 font-serif-luxury text-[30px] leading-none text-[#741a14]">
            Studio admin
          </h1>
          <p className="mt-2 font-sans-luxury text-[13px] leading-[1.5] text-black/60">
            Enter the admin key to manage inquiries, calls and availability.
          </p>
          <input
            type="password"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Admin key"
            aria-label="Admin key"
            autoFocus
            className="mt-6 w-full rounded-[6px] border border-[#741a14]/25 bg-[#fff3d3]/60 px-4 py-3 font-sans-luxury text-[14px] text-black outline-none focus:border-[#741a14]"
          />
          {error ? (
            <p role="alert" className="mt-2 font-sans-luxury text-[12.5px] text-[#a3231b]">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            className="mt-5 w-full cursor-pointer rounded-full bg-[#741a14] px-4 py-3 font-sans-luxury text-[12px] font-bold uppercase tracking-[0.18em] text-[#fff3d3] transition-opacity hover:opacity-90"
          >
            Enter dashboard
          </button>
        </motion.form>
      </div>
    );
  }

  return (
    <Ctx.Provider value={{ key, adminFetch, signOut }}>
      <div className="min-h-screen bg-[#fff3d3] text-black">
        {/* top bar — the site's own chrome is deliberately absent here so the
            dashboard never inherits the marketing navbar's fixed overlays */}
        <header className="sticky top-0 z-30 border-b border-[#741a14]/15 bg-[#fff3d3]/95 backdrop-blur-sm">
          <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-4 px-5 py-4 sm:px-8">
            <Link href="/admin" className="flex items-center gap-2.5">
              <LogoMark className="h-[22px] w-auto text-[#741a14]" />
              <span className="whitespace-nowrap font-serif-luxury text-[17px] leading-none text-[#741a14] sm:text-[19px]">
                Studio admin
              </span>
            </Link>
            <div className="flex items-center gap-2">
              <Link
                href="/"
                className="whitespace-nowrap rounded-full border border-[#741a14]/30 px-3 py-1.5 font-sans-luxury text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#741a14] transition-colors hover:bg-[#741a14]/10"
              >
                View site
              </Link>
              <button
                onClick={signOut}
                className="cursor-pointer whitespace-nowrap rounded-full bg-[#741a14] px-3 py-1.5 font-sans-luxury text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#fff3d3] transition-opacity hover:opacity-90"
              >
                Sign out
              </button>
            </div>
          </div>
          {/* nav scrolls horizontally on a phone rather than wrapping into a
              second row that pushes the content down */}
          <nav className="mx-auto max-w-[1180px] overflow-x-auto px-5 sm:px-8">
            <ul className="flex min-w-max gap-1 pb-1">
              {NAV.map((item) => {
                const active =
                  item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`relative block px-3 py-2 font-sans-luxury text-[12px] font-bold uppercase tracking-[0.12em] transition-colors ${
                        active ? "text-[#741a14]" : "text-black/45 hover:text-[#741a14]"
                      }`}
                    >
                      {item.label}
                      {active ? (
                        <motion.span
                          layoutId="admin-nav-underline"
                          className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-[#741a14]"
                        />
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </header>

        <main className="mx-auto max-w-[1180px] px-5 pb-24 pt-8 sm:px-8">{children}</main>
      </div>
    </Ctx.Provider>
  );
}

/* ————— small shared pieces every admin screen uses ————— */

export function StatCard({
  label,
  value,
  hint,
  tone = "cream",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "cream" | "maroon";
}) {
  const maroon = tone === "maroon";
  return (
    <div
      className={`rounded-[10px] border p-5 ${
        maroon ? "border-[#741a14] bg-[#741a14] text-[#fff3d3]" : "border-[#741a14]/18 bg-white text-black"
      }`}
    >
      <p
        className={`font-sans-luxury text-[10.5px] font-bold uppercase tracking-[0.16em] ${
          maroon ? "text-[#fff3d3]/70" : "text-black/45"
        }`}
      >
        {label}
      </p>
      <p
        className={`mt-2 font-serif-luxury text-[34px] leading-none ${
          maroon ? "text-[#fff3d3]" : "text-[#741a14]"
        }`}
      >
        {value}
      </p>
      {hint ? (
        <p
          className={`mt-2 font-sans-luxury text-[12px] leading-[1.45] ${
            maroon ? "text-[#fff3d3]/75" : "text-black/55"
          }`}
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function PageHeading({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-serif-luxury text-[clamp(28px,4vw,40px)] leading-none text-[#741a14]">
          {title}
        </h1>
        {sub ? (
          <p className="mt-2 max-w-[560px] font-sans-luxury text-[13px] leading-[1.5] text-black/60">{sub}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[10px] border border-dashed border-[#741a14]/25 bg-white/50 px-6 py-14 text-center">
      <p className="font-sans-luxury text-[13.5px] text-black/55">{children}</p>
    </div>
  );
}

/** "3 minutes ago" / "2 days ago" — the dashboard shows relative time
    everywhere, with the absolute stamp on hover via `title`. */
export function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString();
}
