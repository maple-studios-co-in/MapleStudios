"use client";
import { useCallback, useEffect, useState } from "react";
import { useAdmin } from "../AdminShell";
import { Btn, Card, Field, Input, Select, PageHead, Badge } from "../cms/ui";
import { teamRequest, type Employee, type Attendance, type Leave } from "./api";
type Pay = {
  revision: number;
  id: string;
  employeeId: string;
  employeeName: string;
  period: string;
  base: number;
  allowances: number;
  adjustment: number;
  deductions: number;
  leaveDeduction: number;
  net: number;
  notes: string;
  status: string;
  paymentReference?: string;
  history: { action: string; actor: string; at: string }[];
};
const fields = [
  "base",
  "allowances",
  "adjustment",
  "deductions",
  "leaveDeduction",
] as const;
const labels = {
  base: "Base monthly pay",
  allowances: "Allowances",
  adjustment: "Other adjustment (+ / −)",
  deductions: "Other deductions",
  leaveDeduction: "Unpaid leave deduction",
};
const empty = {
  employeeId: "",
  base: "",
  allowances: "0",
  adjustment: "0",
  deductions: "0",
  leaveDeduction: "0",
  notes: "",
};
const money = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
    n / 100,
  );
export default function Payroll() {
  const { account } = useAdmin();
  const [period, setPeriod] = useState("2026-12");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [rows, setRows] = useState<Pay[]>([]);
  const [days, setDays] = useState<Attendance[]>([]);
  const [leave, setLeave] = useState<Leave[]>([]);
  const [draft, setDraft] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [editingRevision, setEditingRevision] = useState(0);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [references, setReferences] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (account?.role !== "owner") return;
    try {
      const [p, e, a, l] = await Promise.all([
        teamRequest<{ items: Pay[] }>(`/team/payroll?period=${period}`),
        teamRequest<{ items: Employee[] }>("/team/employees"),
        teamRequest<{ items: Attendance[] }>(
          `/team/attendance?period=${period}`,
        ),
        teamRequest<{ items: Leave[] }>("/team/leave"),
      ]);
      setRows(p.items);
      setEmployees(e.items);
      setDays(a.items);
      setLeave(l.items);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load payroll.");
    } finally {
      setLoading(false);
    }
  }, [period, account?.role]);
  useEffect(() => {
    void load();
  }, [load]);
  async function run(fn: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      setMessage(message);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save payroll.");
    } finally {
      setBusy(false);
    }
  }
  if (account?.role !== "owner") return <p>Payroll is restricted to Owners.</p>;
  const selected = draft.employeeId;
  const selectedDays = days.filter((d) => d.employeeId === selected);
  const selectedLeave = leave.filter(
    (l) =>
      l.employeeId === selected &&
      l.status === "approved" &&
      l.start.slice(0, 7) <= period &&
      l.end.slice(0, 7) >= period,
  );
  const total = rows.reduce((sum, r) => sum + r.net, 0);
  return (
    <>
      <PageHead
        title="Monthly payroll"
        sub="Prepare pay in INR, review attendance and leave, then record approval and external payment."
        action={
          <Btn
            onClick={() => {
              setDraft(empty);
              setEditing(null);
              setShow(!show);
            }}
          >
            New payroll draft
          </Btn>
        }
      />
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <Field label="Payroll month">
          <Input
            type="month"
            required
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value);
              setShow(false);
            }}
          />
        </Field>
        <p className="text-xl">
          {rows.length} employees · {money(total)} total
        </p>
      </div>
      {error ? (
        <p role="alert" className="mb-4 text-sm text-red-800">
          {error}{" "}
          <button className="underline" onClick={() => void load()}>
            Retry
          </button>
        </p>
      ) : null}
      {message ? (
        <p role="status" className="mb-4 text-green-800">
          {message}
        </p>
      ) : null}
      {loading ? <p>Loading payroll…</p> : null}
      {show ? (
        <Card className="mb-5">
          <h2 className="mb-4 text-xl">
            {editing ? "Edit draft" : "Prepare a draft"} · {period}
          </h2>
          <form
            className="grid gap-4 md:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const amounts = Object.fromEntries(
                  fields.map((f) => [f, Math.round(Number(draft[f]) * 100)]),
                );
                const input = { ...amounts, notes: draft.notes };
                await teamRequest(
                  editing ? `/team/payroll/${editing}` : "/team/payroll",
                  editing ? "PATCH" : "POST",
                  editing
                    ? { ...input, revision: editingRevision }
                    : { ...input, employeeId: draft.employeeId, period },
                );
                setShow(false);
              }, "Payroll draft saved.");
            }}
          >
            <Field label="Employee">
              <Select
                required
                disabled={Boolean(editing)}
                value={draft.employeeId}
                onChange={(e) =>
                  setDraft({ ...draft, employeeId: e.target.value })
                }
              >
                <option value="">Choose employee</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </Select>
            </Field>
            {fields.map((f) => (
              <Field key={f} label={`${labels[f]} (₹)`}>
                <Input
                  type="number"
                  required
                  step="0.01"
                  min={f === "adjustment" ? undefined : "0"}
                  max="10000000"
                  value={draft[f]}
                  onChange={(e) => setDraft({ ...draft, [f]: e.target.value })}
                />
              </Field>
            ))}
            <Field
              label="Calculation notes"
              hint="Record agreed adjustments and the working behind deductions."
            >
              <Input
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              />
            </Field>
            <div className="rounded bg-[#f3e8d5] p-3 text-sm">
              <p>
                {selectedDays.length} attendance entries in {period};{" "}
                {selectedDays.filter((d) => d.status === "absent").length}{" "}
                absent,{" "}
                {selectedDays.filter((d) => d.status === "half-day").length}{" "}
                half days.
              </p>
              {selectedLeave.map((l) => (
                <p key={l.id}>
                  Approved leave: {l.start}–{l.end}, {l.days} working days
                  across those dates.
                </p>
              ))}
              <p className="mt-2">
                Adjustments are entered manually; attendance does not
                automatically reduce pay.
              </p>
            </div>
            <div className="flex gap-2">
              <Btn type="submit" variant="primary" disabled={busy}>
                Save draft
              </Btn>
              <Btn type="button" onClick={() => setShow(false)}>
                Cancel
              </Btn>
            </div>
          </form>
        </Card>
      ) : null}
      {!loading && !rows.length ? (
        <Card>
          <p>
            No payroll drafts for {period}. Add employee records, then prepare
            the first month.
          </p>
        </Card>
      ) : null}
      <div className="space-y-4">
        {rows.map((p) => (
          <Card key={p.id}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl">{p.employeeName}</h2>
                <p className="mt-1 text-sm">
                  {p.period} · <Badge>{p.status}</Badge>
                </p>
              </div>
              <strong className="text-2xl text-[#741a14]">
                {money(p.net)}
              </strong>
            </div>
            <dl className="my-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
              {fields.map((f) => (
                <div key={f}>
                  <dt className="text-[#6b6259]">{labels[f]}</dt>
                  <dd>{money(p[f])}</dd>
                </div>
              ))}
            </dl>
            {p.notes ? <p className="mb-3 text-sm">{p.notes}</p> : null}
            {p.status === "draft" ? (
              <div className="flex flex-wrap gap-2">
                <Btn
                  disabled={busy}
                  onClick={() => {
                    setDraft({
                      employeeId: p.employeeId,
                      base: String(p.base / 100),
                      allowances: String(p.allowances / 100),
                      adjustment: String(p.adjustment / 100),
                      deductions: String(p.deductions / 100),
                      leaveDeduction: String(p.leaveDeduction / 100),
                      notes: p.notes,
                    });
                    setEditing(p.id);
                    setEditingRevision(p.revision);
                    setShow(true);
                  }}
                >
                  Edit draft
                </Btn>
                <Btn
                  variant="primary"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () =>
                        teamRequest(`/team/payroll/${p.id}/approve`, "POST", {
                          revision: p.revision,
                        }),
                      "Payroll approved. Amounts are now locked.",
                    )
                  }
                >
                  Approve {money(p.net)} & lock
                </Btn>
              </div>
            ) : null}
            {p.status === "approved" ? (
              <form
                className="flex flex-wrap items-end gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(
                    () =>
                      teamRequest(`/team/payroll/${p.id}/paid`, "POST", {
                        reference: references[p.id],
                      }),
                    "External payment recorded.",
                  );
                }}
              >
                <Field
                  label="Payment reference"
                  hint="Enter this after making the payment externally."
                >
                  <Input
                    required
                    aria-label={`Payment reference for ${p.employeeName}`}
                    value={references[p.id] || ""}
                    onChange={(e) =>
                      setReferences({ ...references, [p.id]: e.target.value })
                    }
                  />
                </Field>
                <Btn variant="primary" type="submit" disabled={busy}>
                  Record as paid
                </Btn>
              </form>
            ) : null}
            {p.paymentReference ? (
              <p className="text-sm">Payment reference: {p.paymentReference}</p>
            ) : null}
            <details className="mt-4 text-sm text-[#6b6259]">
              <summary className="cursor-pointer">Activity history</summary>
              {p.history.map((h, i) => (
                <p key={i} className="mt-1">
                  {h.action} · {h.actor} ·{" "}
                  {new Date(h.at).toLocaleString("en-IN", {
                    timeZone: "Asia/Kolkata",
                  })}
                </p>
              ))}
            </details>
          </Card>
        ))}
      </div>
    </>
  );
}
