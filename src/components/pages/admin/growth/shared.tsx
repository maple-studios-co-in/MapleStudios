"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import { Btn } from "../cms/ui";
import type { ListMeta } from "./types";

/**
 * The few pieces the growth screens need beyond cms/ui.tsx: a side drawer
 * (the CMS has only a centred modal), IST date helpers, the pill-filter row
 * the operations screens use, and a pager for the paginated lists.
 * Colours are the console tokens from cms/ui.tsx.
 */

/** The value, settling `ms` after the last change — search boxes query on
    pause, not on every keystroke. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/* ————— dates in IST ————— */

export const IST = "Asia/Kolkata";

/** "11 Oct 2026, 09:30 am" in IST, or — when empty. */
export function fmtIst(iso?: string | null, withTime = true): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", {
    timeZone: IST,
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

/** "09:30 am" in IST. */
export function fmtIstTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString("en-IN", { timeZone: IST, hour: "2-digit", minute: "2-digit" });
}

type Parts = { y: number; m: number; d: number; hh: number; mm: number };

const PART_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: IST,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Calendar parts of an instant, in IST. */
export function istParts(date: Date): Parts {
  const p: Record<string, string> = {};
  for (const part of PART_FMT.formatToParts(date)) p[part.type] = part.value;
  return {
    y: Number(p.year),
    m: Number(p.month),
    d: Number(p.day),
    hh: Number(p.hour) % 24,
    mm: Number(p.minute),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" of an instant in IST — the calendar's bucket key. */
export function istDateKey(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "";
  const p = istParts(d);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

/** ISO instant → the value a `datetime-local` input shows, read in IST. */
export function isoToIstInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = istParts(d);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.hh)}:${pad(p.mm)}`;
}

/** `datetime-local` value, interpreted as IST → ISO instant ("" when blank). */
export function istInputToIso(local: string): string {
  if (!local) return "";
  const d = new Date(`${local.length === 16 ? `${local}:00` : local}+05:30`);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

/** Today's "YYYY-MM-DD" in IST. */
export function todayIst(): string {
  return istDateKey(new Date());
}

/** Add days to a "YYYY-MM-DD" key (pure calendar arithmetic, no zones). */
export function shiftDateKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** 0 = Monday … 6 = Sunday for a "YYYY-MM-DD" key. */
export function weekdayOf(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

export function fullName(p: { firstName?: string; lastName?: string }): string {
  return [p.firstName, p.lastName].filter(Boolean).join(" ").trim();
}

export function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ") : s;
}

export function copyText(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    return navigator.clipboard.writeText(text);
  }
  return Promise.reject(new Error("Clipboard is not available."));
}

/* ————— dry-run flag ————— */

const DRY_KEY = "growth-mail-dry-run";

/** Remember that the mail provider reported dryRun so the Campaigns screen
    can show its banner even when the test-send happened on Templates. */
export function markDryRun(on: boolean) {
  try {
    if (on) sessionStorage.setItem(DRY_KEY, "1");
    else sessionStorage.removeItem(DRY_KEY);
  } catch {
    /* private mode — the banner simply relies on message ids instead */
  }
}

export function wasDryRun(): boolean {
  try {
    return sessionStorage.getItem(DRY_KEY) === "1";
  } catch {
    return false;
  }
}

/* ————— drawer ————— */

export function Drawer({
  title,
  sub,
  onClose,
  children,
  footer,
  wide,
}: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-[#11100e]/40 backdrop-blur-[2px]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <aside
        role="dialog"
        aria-modal="true"
        className={`flex h-full w-full flex-col border-l border-[#d8c3a5]/60 bg-[#fff8ed] shadow-[-24px_0_60px_rgba(17,16,14,0.25)] ${
          wide ? "max-w-[760px]" : "max-w-[560px]"
        }`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#d8c3a5]/45 px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate font-serif-luxury text-[21px] leading-[1.15] text-[#11100e]">{title}</h2>
            {sub ? (
              <p className="mt-1 font-sans-luxury text-[11.5px] leading-[1.45] text-[#8b8178]">{sub}</p>
            ) : null}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="cursor-pointer rounded-full p-1 text-[#8b8178] transition-colors hover:bg-[#741a14]/10 hover:text-[#741a14]"
          >
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#d8c3a5]/45 px-5 py-3.5">
            {footer}
          </div>
        ) : null}
      </aside>
    </div>
  );
}

/* ————— pill filters ————— */

export function Chips<T extends string | number>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; count?: number }[];
  ariaLabel?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label={ariaLabel}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`cursor-pointer rounded-full border px-3.5 py-1.5 font-sans-luxury text-[11px] font-bold uppercase tracking-[0.12em] transition-colors ${
              active
                ? "border-[#741a14] bg-[#741a14] text-[#fff8ed]"
                : "border-[#741a14]/25 text-[#741a14] hover:bg-[#741a14]/10"
            }`}
          >
            {o.label}
            {o.count !== undefined ? (
              <span className={active ? "opacity-70" : "opacity-50"}> · {o.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** A multi-select pill (platform toggles, stage picks). */
export function TogglePill({
  on,
  onClick,
  children,
  disabled,
  title,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`cursor-pointer rounded-full border px-3 py-1 font-sans-luxury text-[11px] font-bold uppercase tracking-[0.1em] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        on
          ? "border-[#741a14] bg-[#741a14] text-[#fff8ed]"
          : "border-[#d8c3a5] bg-white/60 text-[#6b6259] hover:border-[#741a14]/50"
      }`}
    >
      {children}
    </button>
  );
}

/* ————— pager ————— */

export function Pager({
  meta,
  page,
  onPage,
}: {
  meta: ListMeta | null;
  page: number;
  onPage: (p: number) => void;
}) {
  if (!meta || meta.pages <= 1) return null;
  return (
    <div className="mt-3 flex items-center justify-between gap-3">
      <p className="font-sans-luxury text-[11.5px] text-[#8b8178]">
        {meta.total} total · page {meta.page} of {meta.pages}
      </p>
      <div className="flex items-center gap-1.5">
        <Btn onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page">
          <ChevronLeft size={13} />
        </Btn>
        <Btn onClick={() => onPage(page + 1)} disabled={page >= meta.pages} aria-label="Next page">
          <ChevronRight size={13} />
        </Btn>
      </div>
    </div>
  );
}

/* ————— small text pieces ————— */

export function ErrorText({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="mb-4 font-sans-luxury text-[12.5px] text-[#a3231b]">
      {children}
    </p>
  );
}

export function Muted({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`font-sans-luxury text-[11.5px] text-[#8b8178] ${className}`}>{children}</span>;
}

/** Label-over-value pair for detail panels. */
export function Kv({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="font-sans-luxury text-[10px] font-bold uppercase tracking-[0.16em] text-[#8b8178]">{label}</dt>
      <dd className="mt-0.5 break-words font-sans-luxury text-[13px] text-[#11100e]">{children ?? "—"}</dd>
    </div>
  );
}

/** Amber notice strip — the dry-run and not-configured states. */
export function Notice({
  children,
  tone = "amber",
}: {
  children: React.ReactNode;
  tone?: "amber" | "red" | "green";
}) {
  const style = {
    amber: "border-[#e0a12a]/40 bg-[#fbf0d6] text-[#6b4a00]",
    red: "border-[#a3231b]/30 bg-[#fbe4e1] text-[#7a1a13]",
    green: "border-[#2f6b4a]/30 bg-[#e3efe2] text-[#2f6b4a]",
  }[tone];
  return (
    <div
      role="status"
      className={`mb-4 rounded-[10px] border px-4 py-3 font-sans-luxury text-[12.5px] leading-[1.5] ${style}`}
    >
      {children}
    </div>
  );
}

/** Stage/status → badge tone shared by the growth screens. */
export function growthTone(
  s: string
): "neutral" | "live" | "draft" | "archived" | "accent" {
  switch (s) {
    case "won":
    case "replied":
    case "delivered":
    case "published":
    case "connected":
    case "running":
    case "sent":
    case "completed":
    case "meeting":
      return "live";
    case "lost":
    case "unsubscribed":
    case "cancelled":
    case "revoked":
    case "expired":
    case "not_interested":
    case "skipped":
      return "archived";
    case "draft":
    case "new":
    case "identified":
    case "queued":
      return "draft";
    case "bounced":
    case "complained":
    case "failed":
    case "partial":
    case "paused":
      return "accent";
    default:
      return "neutral";
  }
}
