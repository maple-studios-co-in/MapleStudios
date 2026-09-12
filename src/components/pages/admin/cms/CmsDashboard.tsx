"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { useEndpoint } from "./useCms";
import { Card, PageHead, SectionLabel, Spinner, shortDate } from "./ui";
import { StatCard } from "../AdminShell";

type Dash = {
  totals: {
    contacts: number;
    contactsLast30: number;
    portfolio: number;
    blog: number;
    subscribers: number;
  };
  mostSelected: { label: string; count: number } | null;
  recent: { id: string; name: string; email: string; project: string; createdAt: string }[];
  months: { label: string; count: number }[];
};

/** Content-side snapshot. The operations KPIs (calls, availability) stay on
    /admin — this one answers "what is published and who is asking". */
export default function CmsDashboard() {
  const { data, loading, error } = useEndpoint<Dash>("/dashboard");

  if (loading) return <Spinner />;
  if (error || !data)
    return <p className="font-sans-luxury text-[13px] text-[#a3231b]">{error ?? "No data."}</p>;

  const { totals, mostSelected, recent, months } = data;
  const peak = Math.max(1, ...months.map((m) => m.count));

  return (
    <>
      <PageHead title="Dashboard" sub="A snapshot of the studio." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total enquiries"
          value={totals.contacts}
          hint={`${totals.contactsLast30} in the last 30 days`}
        />
        <StatCard label="Portfolio projects" value={totals.portfolio} />
        <StatCard label="Blog posts" value={totals.blog} />
        <StatCard
          label="Most selected"
          value={
            mostSelected ? (
              <span className="text-[26px] leading-tight">{mostSelected.label}</span>
            ) : (
              "—"
            )
          }
          hint={mostSelected ? `${mostSelected.count} request${mostSelected.count === 1 ? "" : "s"}` : "No enquiries yet"}
        />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[1.15fr_1fr]">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-serif-luxury text-[19px] leading-none text-[#11100e]">
              Recent enquiries
            </h2>
            <Link
              href="/admin/contacts"
              className="flex items-center gap-1 font-sans-luxury text-[10px] font-bold uppercase tracking-[0.16em] text-[#741a14] transition-opacity hover:opacity-70"
            >
              See inbox <ArrowRight size={12} />
            </Link>
          </div>

          {recent.length === 0 ? (
            <p className="py-8 text-center font-sans-luxury text-[13px] text-[#a2988b]">
              No enquiries yet.
            </p>
          ) : (
            <ul className="divide-y divide-[#d8c3a5]/40">
              {recent.map((r) => (
                <li key={r.id} className="py-2.5">
                  <p className="font-sans-luxury text-[13px] text-[#11100e]">
                    {r.name} <span className="text-[#a2988b]">· {r.email}</span>
                  </p>
                  <p className="font-sans-luxury text-[11px] text-[#8b8178]">
                    {r.project || "—"} · {shortDate(r.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="font-serif-luxury text-[19px] leading-none text-[#11100e]">Last 12 months</h2>
          <SectionLabel>
            <span className="mt-1 block normal-case tracking-normal">Enquiries by month</span>
          </SectionLabel>

          {/* Plain flex bars — a chart library would be the console's only
              runtime dependency, for one 12-bar histogram. */}
          <div className="mt-2 flex h-[170px] items-end gap-1.5">
            {months.map((m, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                <span className="font-sans-luxury text-[10px] text-[#8b8178]">
                  {m.count || ""}
                </span>
                <div
                  className="w-full rounded-t-[3px] bg-[#741a14] transition-all"
                  style={{
                    height: `${Math.max(m.count ? 4 : 1, (m.count / peak) * 118)}px`,
                    opacity: m.count ? 1 : 0.16,
                  }}
                  title={`${m.label}: ${m.count}`}
                />
                <span className="font-sans-luxury text-[9px] uppercase tracking-[0.08em] text-[#a2988b]">
                  {m.label}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
