"use client";
import { useState } from "react";
import Link from "next/link";
import { useAdmin } from "../AdminShell";
import {
  PageHead,
  Btn,
  Card,
  Field,
  Input,
  Textarea,
  Select,
  Modal,
  Badge,
} from "../cms/ui";
import {
  api,
  all,
  Client,
  Project,
  Person,
  labels,
  states,
  today,
  message,
} from "./api";
import { ErrorBox, Filters, Pager, TeamPicker, useList } from "./shared";
export default function Projects() {
  const { account } = useAdmin();
  const manager = account?.role !== "member";
  const [q, setQ] = useState(""),
    [status, setStatus] = useState(""),
    [page, setPage] = useState(1),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [clients, setClients] = useState<Client[]>([]),
    [people, setPeople] = useState<Person[]>([]);
  const [form, setForm] = useState({
    clientId: "",
    title: "",
    scope: "",
    startDate: today(),
    dueDate: today(),
    status: "planned",
    assigneeIds: [] as string[],
  });
  const list = useList<Project>(
    `/projects?q=${encodeURIComponent(q)}&status=${status}&page=${page}`,
  );
  async function create() {
    setError("");
    try {
      const [c, p] = await Promise.all([
        all<Client>("/clients?status=active"),
        api<{ items: Person[] }>("/people"),
      ]);
      setClients(c);
      setPeople(p.items);
      setForm({
        clientId: c[0]?.id || "",
        title: "",
        scope: "",
        startDate: today(),
        dueDate: today(),
        status: "planned",
        assigneeIds: [],
      });
      setOpen(true);
    } catch (e) {
      setError(message(e));
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/projects", "POST", form);
      setOpen(false);
      list.reload();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHead
        title="Projects"
        sub={
          manager
            ? "Plan the work, assign the team and keep client approvals tied to a submitted version."
            : "Your assigned projects and upcoming deliverables."
        }
        action={
          manager && (
            <Btn variant="primary" onClick={create}>
              New project
            </Btn>
          )
        }
      />
      <Filters
        q={q}
        setQ={(v) => {
          setQ(v);
          setPage(1);
        }}
        status={status}
        setStatus={(v) => {
          setStatus(v);
          setPage(1);
        }}
        options={labels(states)}
      />
      <ErrorBox error={list.error || (!open ? error : "")} />
      <div className="grid gap-4 md:grid-cols-2">
        {list.data?.items.map((p) => (
          <Card key={p.id}>
            <div className="flex justify-between gap-3">
              <p className="text-sm text-[#6b6259]">{p.clientName}</p>
              <Badge>{p.status}</Badge>
            </div>
            <h2 className="my-2 font-serif-luxury text-2xl">
              <Link
                className="underline decoration-[#d8c3a5] underline-offset-4"
                href={`/admin/projects/${p.id}`}
              >
                {p.title}
              </Link>
            </h2>
            <p className="text-sm">
              Due {p.dueDate} · {p.assigneeIds.length} teammates
            </p>
          </Card>
        ))}
      </div>
      {list.data?.items.length === 0 && (
        <Card>
          {manager
            ? "No projects yet. Create a client first, then add a project."
            : "No projects assigned to you yet."}
        </Card>
      )}
      <Pager meta={list.data?.meta} page={page} setPage={setPage} />
      {open && (
        <Modal
          title="New project"
          onClose={() => {
            if (!busy) setOpen(false);
          }}
        >
          <form onSubmit={save} className="space-y-4">
            <Field label="Client">
              <Select
                required
                value={form.clientId}
                onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                options={[
                  { value: "", label: "Choose client" },
                  ...clients.map((c) => ({ value: c.id, label: c.name })),
                ]}
              />
            </Field>
            {!clients.length && (
              <Link href="/admin/clients" className="underline">
                Add a client first
              </Link>
            )}
            <Field label="Project title">
              <Input
                required
                maxLength={200}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </Field>
            <Field label="Scope">
              <Textarea
                maxLength={5000}
                value={form.scope}
                onChange={(e) => setForm({ ...form, scope: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              {(["startDate", "dueDate"] as const).map((k) => (
                <Field
                  key={k}
                  label={k === "startDate" ? "Start date" : "Due date"}
                >
                  <Input
                    required
                    type="date"
                    value={form[k]}
                    onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                  />
                </Field>
              ))}
            </div>
            <TeamPicker
              people={people}
              selected={form.assigneeIds}
              onChange={(assigneeIds) => setForm({ ...form, assigneeIds })}
            />
            <ErrorBox error={error} />
            <Btn
              type="submit"
              variant="primary"
              disabled={busy || !clients.length}
            >
              {busy ? "Saving…" : "Create project"}
            </Btn>
          </form>
        </Modal>
      )}
    </>
  );
}
