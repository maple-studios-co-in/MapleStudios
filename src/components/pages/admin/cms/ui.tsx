"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

/**
 * Shared primitives for the authoring console.
 *
 * Colours are the console's own tokens, written as Tailwind arbitrary values
 * so nothing has to be added to the app-wide globals.css that the marketing
 * site also loads:
 *   charcoal #11100e (sidebar)  beige #f3e8d5 (canvas)  ivory #fff8ed (cards)
 *   maple500 #741a14 (accent)   warm-grey #8b8178 (muted)  sand #d8c3a5 (rules)
 */

export const T = {
  charcoal: "#11100e",
  beige: "#f3e8d5",
  ivory: "#fff8ed",
  sand: "#d8c3a5",
  maple: "#741a14",
  maple300: "#d87265",
  warm: "#8b8178",
};

/* ————— typography ————— */

export function PageHead({
  title,
  sub,
  action,
}: {
  title: string;
  sub?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-serif-luxury text-[clamp(26px,3.2vw,34px)] leading-[1.1] text-[#11100e]">
          {title}
        </h1>
        {sub ? (
          <p className="mt-1.5 max-w-[640px] font-sans-luxury text-[12.5px] leading-[1.55] text-[#8b8178]">
            {sub}
          </p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function Card({
  children,
  className = "",
  pad = true,
}: {
  children: React.ReactNode;
  className?: string;
  pad?: boolean;
}) {
  return (
    <div
      className={`rounded-[12px] border border-[#d8c3a5]/45 bg-[#fff8ed] ${pad ? "p-5" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 font-sans-luxury text-[10px] font-bold uppercase tracking-[0.18em] text-[#8b8178]">
      {children}
    </p>
  );
}

/* ————— badges ————— */

type Tone = "neutral" | "live" | "draft" | "archived" | "accent";

const TONES: Record<Tone, string> = {
  neutral: "bg-[#d8c3a5]/30 text-[#6b6259]",
  live: "bg-[#e3efe2] text-[#2f6b4a]",
  draft: "bg-[#d8c3a5]/35 text-[#7d6f5f]",
  archived: "bg-[#11100e]/8 text-[#8b8178]",
  accent: "bg-[#f8dad4] text-[#741a14]",
};

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: Tone }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2.5 py-[3px] font-sans-luxury text-[9.5px] font-bold uppercase tracking-[0.12em] ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

/** Map a status string onto a badge tone. */
export function statusTone(status: string): Tone {
  if (status === "published" || status === "active" || status === "replied") return "live";
  if (status === "archived" || status === "unsubscribed" || status === "closed") return "archived";
  if (status === "draft" || status === "new") return "draft";
  if (status === "read") return "accent";
  return "neutral";
}

/* ————— buttons ————— */

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger" | "quiet";
};

export function Btn({ variant = "ghost", className = "", ...rest }: BtnProps) {
  const styles = {
    primary:
      "bg-[#741a14] text-[#fff8ed] hover:bg-[#5c140f] border border-transparent",
    ghost:
      "border border-[#741a14]/30 text-[#741a14] hover:bg-[#741a14]/8 bg-transparent",
    danger: "bg-[#a3231b] text-[#fff8ed] hover:bg-[#8a1d16] border border-transparent",
    quiet: "border border-transparent text-[#8b8178] hover:text-[#741a14] bg-transparent",
  }[variant];

  return (
    <button
      {...rest}
      className={`inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 font-sans-luxury text-[11px] font-bold uppercase tracking-[0.12em] transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${styles} ${className}`}
    />
  );
}

/* ————— form fields ————— */

const INPUT =
  "w-full rounded-[7px] border border-[#d8c3a5]/70 bg-white/70 px-3 py-2 font-sans-luxury text-[13px] text-[#11100e] outline-none transition-colors placeholder:text-[#b3a897] focus:border-[#741a14]";

export function Field({
  label,
  hint,
  required,
  children,
  className = "",
}: {
  label?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      {label ? (
        <span className="mb-1.5 block font-sans-luxury text-[10px] font-bold uppercase tracking-[0.16em] text-[#8b8178]">
          {label}
          {required ? <span className="ml-1 text-[#a3231b]">*</span> : null}
        </span>
      ) : null}
      {children}
      {hint ? (
        <span className="mt-1 block font-sans-luxury text-[11px] italic text-[#a2988b]">{hint}</span>
      ) : null}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${INPUT} ${props.className ?? ""}`} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${INPUT} min-h-[90px] resize-y leading-[1.55] ${props.className ?? ""}`} />;
}

export function Select({
  options,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[] }) {
  return (
    <select {...rest} className={`${INPUT} cursor-pointer ${rest.className ?? ""}`}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Check({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 py-1">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-[3px] h-[15px] w-[15px] shrink-0 cursor-pointer accent-[#741a14]"
      />
      <span className="min-w-0">
        <span className="block font-sans-luxury text-[12.5px] text-[#11100e]">{label}</span>
        {hint ? (
          <span className="block font-sans-luxury text-[11px] leading-[1.45] text-[#a2988b]">{hint}</span>
        ) : null}
      </span>
    </label>
  );
}

/** Textarea whose value is a string[] edited one-per-line. */
export function LinesField({
  label,
  value,
  onChange,
  rows = 5,
  hint = "One per line",
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  rows?: number;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <Textarea
        rows={rows}
        value={value.join("\n")}
        onChange={(e) =>
          onChange(
            e.target.value
              .split("\n")
              .map((s) => s.trimStart())
              .filter((s, i, all) => s.length > 0 || i < all.length - 1)
          )
        }
      />
    </Field>
  );
}

/** Comma-separated string[] (tags, tech stack). */
export function CsvField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [draft, setDraft] = useState(value.join(", "));
  useEffect(() => setDraft(value.join(", ")), [value]);
  return (
    <Field label={label} hint="comma-separated">
      <Input
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          onChange(
            e.target.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          );
        }}
      />
    </Field>
  );
}

/* ————— table ————— */

export function Table({
  head,
  children,
  empty,
}: {
  head: string[];
  children: React.ReactNode;
  empty?: string;
}) {
  const rows = Array.isArray(children) ? children.flat() : children;
  const isEmpty = !rows || (Array.isArray(rows) && rows.filter(Boolean).length === 0);

  return (
    <Card pad={false} className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr className="border-b border-[#d8c3a5]/45 bg-[#f3e8d5]/45">
              {head.map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left font-sans-luxury text-[9.5px] font-bold uppercase tracking-[0.16em] text-[#8b8178]"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isEmpty ? (
              <tr>
                <td
                  colSpan={head.length}
                  className="px-4 py-14 text-center font-sans-luxury text-[13px] text-[#a2988b]"
                >
                  {empty ?? "Nothing here yet."}
                </td>
              </tr>
            ) : (
              rows
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function Td({
  children,
  className = "",
  colSpan,
}: {
  children?: React.ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={`border-b border-[#d8c3a5]/30 px-4 py-3 font-sans-luxury text-[12.5px] text-[#11100e] ${className}`}
    >
      {children}
    </td>
  );
}

export function Tr({ children }: { children: React.ReactNode }) {
  return <tr className="transition-colors hover:bg-[#f3e8d5]/40">{children}</tr>;
}

/* ————— modal ————— */

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  // Escape closes, and the body cannot scroll behind the sheet.
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
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#11100e]/45 px-4 py-10 backdrop-blur-[2px]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={`w-full ${wide ? "max-w-[900px]" : "max-w-[620px]"} rounded-[14px] border border-[#d8c3a5]/60 bg-[#fff8ed] shadow-[0_30px_80px_rgba(17,16,14,0.28)]`}
      >
        <div className="flex items-center justify-between border-b border-[#d8c3a5]/45 px-5 py-3.5">
          <h2 className="font-serif-luxury text-[19px] leading-none text-[#11100e]">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="cursor-pointer rounded-full p-1 text-[#8b8178] transition-colors hover:bg-[#741a14]/10 hover:text-[#741a14]"
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-5">{children}</div>
      </div>
    </div>
  );
}

/* ————— confirm ————— */

export function Confirm({
  title,
  body,
  confirmLabel = "Delete",
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="font-sans-luxury text-[13px] leading-[1.6] text-[#4a443d]">{body}</p>
      <div className="mt-6 flex justify-end gap-2">
        <Btn onClick={onCancel}>Cancel</Btn>
        <Btn variant="danger" onClick={onConfirm}>
          {confirmLabel}
        </Btn>
      </div>
    </Modal>
  );
}

/* ————— toast ————— */

export function useToast() {
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = (text: string, bad = false) => {
    setMsg({ text, bad });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 3200);
  };

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const node = msg ? (
    <div
      role="status"
      className={`fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full px-5 py-2.5 font-sans-luxury text-[12px] font-bold tracking-[0.04em] shadow-[0_12px_36px_rgba(17,16,14,0.3)] ${
        msg.bad ? "bg-[#a3231b] text-[#fff8ed]" : "bg-[#11100e] text-[#fff8ed]"
      }`}
    >
      {msg.text}
    </div>
  ) : null;

  return { show, node };
}

/* ————— misc ————— */

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="px-4 py-16 text-center font-sans-luxury text-[12px] uppercase tracking-[0.22em] text-[#a2988b]">
      {label}
    </div>
  );
}

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

export function shortDate(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

/** Download rows as a CSV file, client-side — no server round trip. */
export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
