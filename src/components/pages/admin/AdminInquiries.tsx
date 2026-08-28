"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { EmptyState, PageHeading, relTime, useAdmin } from "./AdminShell";

type InquiryStatus = "new" | "read" | "archived";
type Inquiry = {
  id: string;
  at: string;
  name: string;
  email: string;
  company?: string;
  service: string;
  budget: string;
  message: string;
  status: InquiryStatus;
};

const FILTERS: { id: "all" | InquiryStatus; label: string }[] = [
  { id: "new", label: "New" },
  { id: "read", label: "Read" },
  { id: "archived", label: "Archived" },
  { id: "all", label: "All" },
];

/** RFC-4180-ish escaping so a message containing commas, quotes or newlines
    cannot break the exported row. */
const csvCell = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export default function AdminInquiries() {
  const { adminFetch } = useAdmin();
  const [items, setItems] = useState<Inquiry[]>([]);
  const [filter, setFilter] = useState<"all" | InquiryStatus>("new");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await adminFetch("/api/admin/inquiries");
      if (!res.ok) throw new Error("Could not load inquiries.");
      const data = (await res.json()) as { inquiries: Inquiry[] };
      setItems(data.inquiries);
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

  const counts = useMemo(
    () => ({
      all: items.length,
      new: items.filter((i) => i.status === "new").length,
      read: items.filter((i) => i.status === "read").length,
      archived: items.filter((i) => i.status === "archived").length,
    }),
    [items]
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      // `|| i.id === openId` keeps the row you are READING on screen. Opening a
      // "new" inquiry marks it read, which would otherwise drop it straight out
      // of the New filter — the message you just clicked would vanish mid-read.
      .filter((i) => (filter === "all" ? true : i.status === filter || i.id === openId))
      .filter((i) =>
        !q
          ? true
          : [i.name, i.email, i.company ?? "", i.service, i.budget, i.message]
              .join(" ")
              .toLowerCase()
              .includes(q)
      );
  }, [items, filter, query, openId]);

  const setStatus = async (id: string, status: InquiryStatus) => {
    setBusyId(id);
    // optimistic: the list re-filters immediately, and load() reconciles
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
    try {
      const res = await adminFetch("/api/admin/inquiries", {
        method: "PATCH",
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error: string }).error);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update that inquiry.");
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string, name: string) => {
    if (!window.confirm(`Permanently delete ${name}'s inquiry? This cannot be undone.`)) return;
    setBusyId(id);
    try {
      const res = await adminFetch(`/api/admin/inquiries?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(((await res.json()) as { error: string }).error);
      if (openId === id) setOpenId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete that inquiry.");
    } finally {
      setBusyId(null);
    }
  };

  /** Export what is CURRENTLY filtered, not the whole store — the visible set
      is what the admin means by "export this". */
  const exportCsv = () => {
    const header = ["Received", "Name", "Email", "Company", "Service", "Budget", "Status", "Message"];
    const rows = shown.map((i) =>
      [
        new Date(i.at).toISOString(),
        i.name,
        i.email,
        i.company ?? "",
        i.service,
        i.budget,
        i.status,
        i.message,
      ]
        .map(csvCell)
        .join(",")
    );
    const blob = new Blob([[header.map(csvCell).join(","), ...rows].join("\r\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `maple-inquiries-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeading
        title="Inquiries"
        sub="Everything sent through the contact form. Opening one marks it read; archive what you have dealt with."
        action={
          <div className="flex gap-2">
            <button
              onClick={exportCsv}
              disabled={shown.length === 0}
              className="cursor-pointer rounded-full border border-[#741a14]/30 px-4 py-2 font-sans-luxury text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#741a14] transition-colors hover:bg-[#741a14]/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Export CSV
            </button>
            <button
              onClick={() => void load()}
              className="cursor-pointer rounded-full bg-[#741a14] px-4 py-2 font-sans-luxury text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#fff3d3] transition-opacity hover:opacity-90"
            >
              Refresh
            </button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`cursor-pointer rounded-full border px-3.5 py-1.5 font-sans-luxury text-[11px] font-bold uppercase tracking-[0.12em] transition-colors ${
              filter === f.id
                ? "border-[#741a14] bg-[#741a14] text-[#fff3d3]"
                : "border-[#741a14]/25 text-[#741a14] hover:bg-[#741a14]/10"
            }`}
          >
            {f.label}
            <span className={filter === f.id ? "opacity-70" : "opacity-50"}> · {counts[f.id]}</span>
          </button>
        ))}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, email, message…"
          aria-label="Search inquiries"
          className="ml-auto w-full max-w-[280px] rounded-full border border-[#741a14]/25 bg-white px-4 py-1.5 font-sans-luxury text-[12.5px] text-black outline-none focus:border-[#741a14]"
        />
      </div>

      {error ? (
        <p role="alert" className="mb-4 font-sans-luxury text-[12.5px] text-[#a3231b]">
          {error}
        </p>
      ) : null}

      {!loaded ? (
        <EmptyState>Loading…</EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState>
          {items.length === 0
            ? "No inquiries yet — submissions from the contact form land here."
            : "Nothing matches that filter."}
        </EmptyState>
      ) : (
        <ul className="overflow-hidden rounded-[10px] border border-[#741a14]/18 bg-white">
          {shown.map((i) => {
            const open = openId === i.id;
            return (
              <li key={i.id} className="border-b border-[#741a14]/10 last:border-b-0">
                <button
                  onClick={() => {
                    const next = open ? null : i.id;
                    setOpenId(next);
                    // opening an unread one marks it read, like any inbox
                    if (next && i.status === "new") void setStatus(i.id, "read");
                  }}
                  aria-expanded={open}
                  className="flex w-full cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-5 py-4 text-left transition-colors hover:bg-[#fff3d3]/50"
                >
                  <span
                    aria-hidden
                    className={`size-2 shrink-0 rounded-full ${
                      i.status === "new"
                        ? "bg-[#e0a12a]"
                        : i.status === "read"
                          ? "bg-[#741a14]/40"
                          : "bg-black/15"
                    }`}
                  />
                  <span className="font-sans-luxury text-[14px] font-medium text-black">{i.name}</span>
                  {i.company ? (
                    <span className="font-sans-luxury text-[12.5px] text-black/45">{i.company}</span>
                  ) : null}
                  <span className="hidden font-sans-luxury text-[12px] text-[#741a14] sm:inline">
                    {i.service}
                  </span>
                  <span className="hidden font-sans-luxury text-[12px] text-black/45 md:inline">
                    {i.budget}
                  </span>
                  <span
                    className="ml-auto shrink-0 font-sans-luxury text-[11.5px] text-black/40"
                    title={new Date(i.at).toLocaleString()}
                  >
                    {relTime(i.at)}
                  </span>
                </button>

                <AnimatePresence initial={false}>
                  {open ? (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-[#741a14]/10 bg-[#fff3d3]/40 px-5 py-5">
                        <dl className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
                          {[
                            ["Email", i.email],
                            ["Company", i.company || "—"],
                            ["Service", i.service || "—"],
                            ["Budget", i.budget || "—"],
                          ].map(([k, v]) => (
                            <div key={k} className="flex gap-2">
                              <dt className="min-w-[70px] font-sans-luxury text-[11px] font-bold uppercase tracking-[0.1em] text-black/40">
                                {k}
                              </dt>
                              <dd className="font-sans-luxury text-[13px] text-black">
                                {k === "Email" ? (
                                  <a
                                    href={`mailto:${v}`}
                                    className="underline decoration-[#741a14]/40 underline-offset-2"
                                  >
                                    {v}
                                  </a>
                                ) : (
                                  v
                                )}
                              </dd>
                            </div>
                          ))}
                        </dl>

                        <p className="mt-4 whitespace-pre-wrap font-sans-luxury text-[13.5px] leading-[1.6] text-black">
                          {i.message}
                        </p>

                        <div className="mt-5 flex flex-wrap gap-2">
                          <a
                            href={`mailto:${i.email}?subject=${encodeURIComponent(
                              "Re: your inquiry — Maple Studios"
                            )}`}
                            className="rounded-full bg-[#741a14] px-4 py-2 font-sans-luxury text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#fff3d3] transition-opacity hover:opacity-90"
                          >
                            Reply by email
                          </a>
                          {i.status !== "archived" ? (
                            <button
                              disabled={busyId === i.id}
                              onClick={() => void setStatus(i.id, "archived")}
                              className="cursor-pointer rounded-full border border-[#741a14]/30 px-4 py-2 font-sans-luxury text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#741a14] transition-colors hover:bg-[#741a14]/10 disabled:opacity-40"
                            >
                              Archive
                            </button>
                          ) : (
                            <button
                              disabled={busyId === i.id}
                              onClick={() => void setStatus(i.id, "read")}
                              className="cursor-pointer rounded-full border border-[#741a14]/30 px-4 py-2 font-sans-luxury text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#741a14] transition-colors hover:bg-[#741a14]/10 disabled:opacity-40"
                            >
                              Restore
                            </button>
                          )}
                          <button
                            disabled={busyId === i.id}
                            onClick={() => void remove(i.id, i.name)}
                            className="cursor-pointer rounded-full border border-[#a3231b]/40 px-4 py-2 font-sans-luxury text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#a3231b] transition-colors hover:bg-[#a3231b]/10 disabled:opacity-40"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
