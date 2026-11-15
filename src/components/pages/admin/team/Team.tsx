"use client";
import { employeeEditFields } from "@/lib/admin/employee-form";
import { useCallback, useEffect, useState } from "react";
import { useAdmin } from "../AdminShell";
import { Btn, Card, Field, Input, Select, PageHead, Badge } from "../cms/ui";
import { teamRequest, type Employee, type Leave, type Attendance } from "./api";
const today = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const blank = {
  name: "",
  email: "",
  title: "",
  contractStart: "2026-12-01",
  contractStatus: "draft",
  contractReference: "",
  status: "onboarding",
};
export default function Team() {
  const { account } = useAdmin();
  const manager = account?.role !== "member";
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [leave, setLeave] = useState<Leave[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [period, setPeriod] = useState(today().slice(0, 7));
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [checkin, setCheckin] = useState({
    employeeId: "",
    date: today(),
    status: "present",
    note: "",
  });
  const [request, setRequest] = useState({
    start: "2026-12-01",
    end: "2026-12-01",
    days: 1,
    reason: "",
  });
  const load = useCallback(async () => {
    try {
      const people = await teamRequest<{ items: Employee[] }>(
        "/team/employees",
      );
      setEmployees(people.items);
      const [requests, days] = await Promise.all([
        teamRequest<{ items: Leave[] }>("/team/leave"),
        teamRequest<{ items: Attendance[] }>(
          `/team/attendance?period=${period}`,
        ),
      ]);
      setLeave(requests.items);
      setAttendance(days.items);
      setError("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not load the workspace.",
      );
    } finally {
      setLoading(false);
    }
  }, [period]);
  useEffect(() => {
    void load();
  }, [load]);
  async function run(fn: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      setMessage(success);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  const name = (id: string) =>
    employees.find((e) => e.id === id)?.name || "Employee";
  const own = employees.find((e) => e.email === account?.email);
  return (
    <>
      <PageHead
        title="Team & attendance"
        sub="People, contracts, working days and leave in one place."
        action={
          manager ? (
            <Btn
              onClick={() => {
                setDraft(blank);
                setEditing(null);
                setShowForm(!showForm);
              }}
            >
              Add employee
            </Btn>
          ) : undefined
        }
      />
      {error ? (
        <p role="alert" className="mb-4 text-sm text-red-800">
          {error}{" "}
          <button onClick={() => void load()} className="underline">
            Retry
          </button>
        </p>
      ) : null}
      {message ? (
        <p role="status" className="mb-4 text-sm text-green-800">
          {message}
        </p>
      ) : null}
      {loading ? <p>Loading team…</p> : null}
      {showForm && manager ? (
        <Card className="mb-5">
          <h2 className="mb-4 text-xl">
            {editing ? "Edit employee" : "New employee"}
          </h2>
          <form
            className="grid gap-4 md:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                if (editing) {
                  await teamRequest(
                    `/team/employees/${editing}`,
                    "PATCH",
                    employeeEditFields(draft),
                  );
                } else await teamRequest("/team/employees", "POST", draft);
                setShowForm(false);
              }, "Employee saved. Account access is managed separately in Settings.");
            }}
          >
            {(
              [
                "name",
                "email",
                "title",
                "contractStart",
                "contractReference",
              ] as const
            ).map((key) => (
              <Field
                key={key}
                label={
                  {
                    name: "Name",
                    email: "Work email",
                    title: "Job title",
                    contractStart: "Contract start",
                    contractReference: "Signed contract link or reference",
                  }[key]
                }
              >
                <Input
                  aria-label={key}
                  type={
                    key === "contractStart"
                      ? "date"
                      : key === "email"
                        ? "email"
                        : "text"
                  }
                  required={["name", "email", "contractStart"].includes(key)}
                  disabled={key === "email" && Boolean(editing)}
                  value={draft[key]}
                  onChange={(e) =>
                    setDraft({ ...draft, [key]: e.target.value })
                  }
                />
              </Field>
            ))}
            <Field label="Contract">
              <Select
                value={draft.contractStatus}
                onChange={(e) =>
                  setDraft({ ...draft, contractStatus: e.target.value })
                }
              >
                <option value="draft">Draft</option>
                <option value="signed">Signed — document on file</option>
              </Select>
            </Field>
            <Field label="Employment status">
              <Select
                value={draft.status}
                onChange={(e) => setDraft({ ...draft, status: e.target.value })}
              >
                {["onboarding", "active", "inactive"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            </Field>
            <div className="flex items-end gap-2">
              <Btn type="submit" variant="primary" disabled={busy}>
                Save employee
              </Btn>
              <Btn type="button" onClick={() => setShowForm(false)}>
                Cancel
              </Btn>
            </div>
          </form>
        </Card>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {employees.map((e) => (
          <Card key={e.id}>
            <div className="flex justify-between gap-2">
              <h2 className="text-lg font-semibold">{e.name}</h2>
              {e.status ? <Badge>{e.status}</Badge> : null}
            </div>
            <p className="mt-1 text-sm">{e.title || "Job title not set"}</p>
            <p className="mt-2 break-all text-sm text-[#6b6259]">{e.email}</p>
            {manager ? (
              <>
                <p className="mt-3 text-sm">
                  Contract: {e.contractStart} · {e.contractStatus}
                </p>
                <Btn
                  className="mt-3"
                  onClick={() => {
                    setDraft({
                      ...blank,
                      ...e,
                      contractStart: e.contractStart || blank.contractStart,
                      contractStatus: e.contractStatus || "draft",
                      contractReference: e.contractReference || "",
                      status: e.status || "onboarding",
                    });
                    setEditing(e.id);
                    setShowForm(true);
                  }}
                >
                  Edit record
                </Btn>
              </>
            ) : null}
          </Card>
        ))}
      </div>
      {!loading && !employees.length ? (
        <Card>
          <p>
            No employees yet. Add the team before recording attendance or
            payroll.
          </p>
          <p className="mt-2 text-sm">Planned start: 1 December 2026.</p>
        </Card>
      ) : null}
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-xl">Record attendance</h2>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void run(
                () =>
                  teamRequest("/team/attendance", "POST", {
                    ...checkin,
                    employeeId: manager ? checkin.employeeId : own?.id,
                  }),
                "Attendance saved.",
              );
            }}
          >
            {manager ? (
              <Field label="Employee">
                <Select
                  required
                  value={checkin.employeeId}
                  onChange={(e) =>
                    setCheckin({ ...checkin, employeeId: e.target.value })
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
            ) : (
              <p className="text-sm">
                Recording for {own?.name || "your employee record"}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date">
                <Input
                  type="date"
                  required
                  max={today()}
                  min={manager ? undefined : today()}
                  value={checkin.date}
                  onChange={(e) =>
                    setCheckin({ ...checkin, date: e.target.value })
                  }
                />
              </Field>
              <Field label="Attendance">
                <Select
                  value={checkin.status}
                  onChange={(e) =>
                    setCheckin({ ...checkin, status: e.target.value })
                  }
                >
                  {["present", "remote", "half-day", "absent", "leave"].map(
                    (s) => (
                      <option key={s}>{s}</option>
                    ),
                  )}
                </Select>
              </Field>
            </div>
            <Field label="Note">
              <Input
                value={checkin.note}
                onChange={(e) =>
                  setCheckin({ ...checkin, note: e.target.value })
                }
              />
            </Field>
            <Btn
              type="submit"
              variant="primary"
              disabled={busy || (!manager && !own)}
            >
              Save attendance
            </Btn>
          </form>
        </Card>
        <Card>
          <h2 className="mb-4 text-xl">Request leave</h2>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void run(
                () => teamRequest("/team/leave", "POST", request),
                "Leave request submitted for review.",
              );
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              {(["start", "end"] as const).map((key) => (
                <Field key={key} label={key === "start" ? "From" : "To"}>
                  <Input
                    required
                    type="date"
                    value={request[key]}
                    onChange={(e) =>
                      setRequest({ ...request, [key]: e.target.value })
                    }
                  />
                </Field>
              ))}
            </div>
            <Field
              label="Working days requested"
              hint="Exclude non-working days; half days are supported."
            >
              <Input
                type="number"
                min="0.5"
                step="0.5"
                max="90"
                required
                value={request.days}
                onChange={(e) =>
                  setRequest({ ...request, days: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="Reason">
              <Input
                required
                value={request.reason}
                onChange={(e) =>
                  setRequest({ ...request, reason: e.target.value })
                }
              />
            </Field>
            <Btn type="submit" disabled={busy || !own} variant="primary">
              Request leave
            </Btn>
            {!own ? (
              <p className="text-sm">
                An employee record matching your login email is needed.
              </p>
            ) : null}
          </form>
        </Card>
      </div>
      <Card className="mt-5">
        <h2 className="mb-3 text-xl">Leave requests</h2>
        {!leave.length ? (
          <p className="text-sm">No leave requests.</p>
        ) : (
          leave.map((l) => (
            <div
              key={l.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d8c3a5] py-3"
            >
              <div>
                <p>
                  {name(l.employeeId)} · {l.start} — {l.end} · {l.days} days
                </p>
                <p className="text-sm text-[#6b6259]">{l.reason}</p>
              </div>
              <div className="flex gap-2">
                <Badge>{l.status}</Badge>
                {manager &&
                l.status === "pending" &&
                l.requestedBy !== account?.email
                  ? (["approved", "rejected"] as const).map((status) => (
                      <Btn
                        key={status}
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () =>
                              teamRequest(
                                `/team/leave/${l.id}/review`,
                                "POST",
                                { status },
                              ),
                            `Leave ${status}.`,
                          )
                        }
                      >
                        {status === "approved" ? "Approve" : "Reject"}
                      </Btn>
                    ))
                  : null}
              </div>
            </div>
          ))
        )}
      </Card>
      <Card className="mt-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl">Attendance register</h2>
          <Input
            aria-label="Attendance month"
            type="month"
            className="max-w-52"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          />
        </div>
        {!attendance.length ? (
          <p className="text-sm">No attendance recorded for this month.</p>
        ) : (
          attendance.map((a) => (
            <div
              key={a.id}
              className="flex flex-wrap justify-between gap-2 border-b border-[#d8c3a5] py-2 text-sm"
            >
              <span>
                {name(a.employeeId)} · {a.date}
              </span>
              <span>
                {a.status}
                {a.note ? ` — ${a.note}` : ""}
              </span>
            </div>
          ))
        )}
      </Card>
    </>
  );
}
