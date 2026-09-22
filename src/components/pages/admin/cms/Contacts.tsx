"use client";

import { useMemo, useState } from "react";
import { Download, Trash2 } from "lucide-react";

import { useCollection } from "./useCms";
import {
  Badge,
  Btn,
  Card,
  Confirm,
  Input,
  PageHead,
  Select,
  Spinner,
  downloadCsv,
  shortDate,
  statusTone,
  useToast,
} from "./ui";
import type { Contact, ContactStatus } from "@/lib/admin/cms/types";

const STATUSES: { value: ContactStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "read", label: "In review" },
  { value: "replied", label: "Replied" },
  { value: "archived", label: "Closed" },
];

const LABEL = new Map(STATUSES.map((s) => [s.value, s.label]));

/** Briefs, leads, and replies — list on the left, the brief on the right. */
export default function Contacts() {
  const { data, loading, error, update, remove } = useCollection<Contact>("contacts");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Contact | null>(null);
  const { show, node: toast } = useToast();

  const rows = useMemo(() => {
    const all = data ?? [];
    const needle = q.trim().toLowerCase();
    return all.filter((c) => {
      if (status && c.status !== status) return false;
      if (!needle) return true;
      return [c.name, c.email, c.message, c.project].some((v) =>
        String(v ?? "").toLowerCase().includes(needle)
      );
    });
  }, [data, q, status]);

  const active = rows.find((c) => c.id === selected) ?? null;

  if (loading) return <Spinner />;
  if (error) return <p className="font-sans-luxury text-[13px] text-[#a3231b]">{error}</p>;

  return (
    <>
      <PageHead
        title="Contacts"
        sub="Briefs, leads, and replies."
        action={
          <Btn
            onClick={() =>
              downloadCsv(
                `maple-contacts-${new Date().toISOString().slice(0, 10)}.csv`,
                (data ?? []).map((c) => ({
                  name: c.name,
                  email: c.email,
                  company: c.company,
                  project: c.project,
                  budget: c.budget,
                  timeline: c.timeline,
                  status: c.status,
                  message: c.message,
                  received: c.createdAt,
                }))
              )
            }
            disabled={!data?.length}
          >
            <Download size={12} /> Export CSV
          </Btn>
        }
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="w-full max-w-[340px]">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, email, message…"
          />
        </div>
        <div className="w-full max-w-[220px]">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={[{ value: "", label: "All statuses" }, ...STATUSES]}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,380px)_1fr]">
        <Card pad={false} className="h-fit overflow-hidden">
          {rows.length === 0 ? (
            <p className="px-4 py-12 text-center font-sans-luxury text-[13px] text-[#a2988b]">
              No submissions match.
            </p>
          ) : (
            <ul>
              {rows.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => setSelected(c.id)}
                    className={`flex w-full cursor-pointer items-start justify-between gap-2 border-b border-[#d8c3a5]/35 px-4 py-3 text-left transition-colors ${
                      active?.id === c.id ? "bg-[#741a14]/8" : "hover:bg-[#f3e8d5]/60"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-sans-luxury text-[13px] text-[#11100e]">
                        {c.name || "—"}
                      </span>
                      <span className="block truncate font-sans-luxury text-[11px] text-[#8b8178]">
                        {c.project || "—"} · {shortDate(c.createdAt)}
                      </span>
                    </span>
                    <Badge tone={statusTone(c.status)}>{LABEL.get(c.status) ?? c.status}</Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          {!active ? (
            <p className="py-16 text-center font-sans-luxury text-[13px] text-[#a2988b]">
              Select a submission to view it.
            </p>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <h2 className="font-serif-luxury text-[24px] leading-none text-[#11100e]">
                  {active.name || "—"}
                </h2>
                <div className="flex items-center gap-2">
                  <div className="w-[150px]">
                    <Select
                      value={active.status}
                      onChange={async (e) => {
                        await update(active.id, { status: e.target.value as ContactStatus });
                        show("Status updated");
                      }}
                      options={STATUSES}
                    />
                  </div>
                  <button
                    aria-label="Delete submission"
                    onClick={() => setConfirming(active)}
                    className="cursor-pointer rounded-full p-2 text-[#8b8178] transition-colors hover:bg-[#a3231b]/10 hover:text-[#a3231b]"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-3">
                <Detail label="Email" value={active.email} />
                <Detail label="Company" value={active.company} />
                <Detail label="Project" value={active.project} />
                <Detail label="Budget" value={active.budget} />
                <Detail label="Timeline" value={active.timeline} />
                <Detail label="When" value={new Date(active.createdAt).toLocaleString()} />
              </dl>

              <div className="mt-5 border-t border-[#d8c3a5]/45 pt-4">
                <p className="mb-1.5 font-sans-luxury text-[10px] font-bold uppercase tracking-[0.16em] text-[#8b8178]">
                  Message
                </p>
                <p className="whitespace-pre-wrap font-sans-luxury text-[13.5px] leading-[1.65] text-[#11100e]">
                  {active.message || "—"}
                </p>
              </div>

              {active.email ? (
                <a
                  href={`mailto:${active.email}?subject=${encodeURIComponent(
                    `Re: your enquiry to Maple Studios`
                  )}`}
                  className="mt-5 inline-block font-sans-luxury text-[11px] font-bold uppercase tracking-[0.14em] text-[#741a14] underline underline-offset-4 transition-opacity hover:opacity-70"
                >
                  Reply by email →
                </a>
              ) : null}
            </>
          )}
        </Card>
      </div>

      {confirming ? (
        <Confirm
          title="Delete this submission?"
          body={`The brief from ${confirming.name || confirming.email} will be removed permanently.`}
          onCancel={() => setConfirming(null)}
          onConfirm={async () => {
            await remove(confirming.id);
            if (selected === confirming.id) setSelected(null);
            show("Deleted");
            setConfirming(null);
          }}
        />
      ) : null}

      {toast}
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="font-sans-luxury text-[10px] font-bold uppercase tracking-[0.16em] text-[#8b8178]">
        {label}
      </dt>
      <dd className="mt-0.5 truncate font-sans-luxury text-[13px] text-[#11100e]" title={value}>
        {value || "—"}
      </dd>
    </div>
  );
}
