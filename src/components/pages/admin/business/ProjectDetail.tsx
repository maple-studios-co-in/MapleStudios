"use client";
import { useEffect, useState } from "react";
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
  Deliverable,
  Project,
  Person,
  labels,
  states,
  today,
  message,
} from "./api";
import { ErrorBox, TeamPicker } from "./shared";
import Drafts from "./Drafts";
export default function ProjectDetail({ id }: { id: string }) {
  const { account } = useAdmin(),
    manager = account?.role !== "member";
  const [p, setP] = useState<Project>(),
    [people, setPeople] = useState<Person[]>([]),
    [eligible, setEligible] = useState<Person[]>([]),
    [ds, setDs] = useState<Deliverable[]>([]),
    [tab, setTab] = useState("overview"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [tick, setTick] = useState(0),
    [edit, setEdit] = useState<Deliverable | null>(),
    [history, setHistory] = useState<Deliverable>(),
    [decision, setDecision] = useState<Deliverable>();
  const [df, setDf] = useState({
    title: "",
    description: "",
    dueDate: today(),
    assigneeId: "",
    status: "planned",
    submissionReference: "",
    note: "",
  });
  const [approval, setApproval] = useState({
    decision: "approved",
    approverName: "",
    decisionDate: today(),
    evidenceReference: "",
  });
  const [formError, setFormError] = useState("");
  useEffect(() => {
    let alive = true;
    setError("");
    Promise.all([
      api<{ item: Project; people: Person[] }>(`/projects/${id}`),
      api<{ items: Deliverable[] }>(`/projects/${id}/deliverables`),
      manager
        ? api<{ items: Person[] }>("/people")
        : Promise.resolve({ items: [] as Person[] }),
    ])
      .then(([a, b, c]) => {
        if (alive) {
          setP(a.item);
          setPeople(a.people);
          setDs(b.items);
          setEligible(c.items);
        }
      })
      .catch((e) => {
        if (alive) setError(message(e));
      });
    return () => {
      alive = false;
    };
  }, [id, tick, manager]);
  async function saveProject(e: React.FormEvent) {
    e.preventDefault();
    if (!p) return;
    setBusy(true);
    setError("");
    try {
      const {
        title,
        scope,
        startDate,
        dueDate,
        status,
        assigneeIds,
        revision,
      } = p;
      await api(`/projects/${id}`, "PATCH", {
        title,
        scope,
        startDate,
        dueDate,
        status,
        assigneeIds,
        revision,
      });
      setTick((t) => t + 1);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  function open(d: Deliverable | null) {
    setFormError("");
    setEdit(d);
    setDf(
      d
        ? {
            title: d.title,
            description: d.description,
            dueDate: d.dueDate,
            assigneeId: d.assigneeId,
            status: d.status,
            submissionReference: d.submissionReference,
            note: d.note,
          }
        : {
            title: "",
            description: "",
            dueDate: p!.dueDate,
            assigneeId: "",
            status: "planned",
            submissionReference: "",
            note: "",
          },
    );
  }
  async function saveDeliverable(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError("");
    try {
      if (!edit) {
        const { title, description, dueDate, assigneeId } = df;
        await api(`/projects/${id}/deliverables`, "POST", {
          title,
          description,
          dueDate,
          assigneeId,
        });
      } else {
        const progress = {
          submissionReference: df.submissionReference,
          note: df.note,
          ...(df.status !== edit.status || df.status === "in-review"
            ? { status: df.status }
            : {}),
        };
        await api(`/deliverables/${edit.id}`, "PATCH", {
          revision: edit.revision,
          ...(manager
            ? {
                title: df.title,
                description: df.description,
                dueDate: df.dueDate,
                assigneeId: df.assigneeId,
              }
            : {}),
          ...progress,
        });
      }
      setEdit(undefined);
      setTick((t) => t + 1);
    } catch (e) {
      setFormError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function recordDecision(e: React.FormEvent) {
    e.preventDefault();
    if (!decision) return;
    setBusy(true);
    setFormError("");
    try {
      await api(`/deliverables/${decision.id}/decision`, "POST", {
        ...approval,
        revision: decision.revision,
        submissionVersion: decision.submissionVersion,
      });
      setDecision(undefined);
      setTick((t) => t + 1);
    } catch (e) {
      setFormError(message(e));
    } finally {
      setBusy(false);
    }
  }
  if (!p)
    return (
      <>
        <ErrorBox error={error} />
        <p>Loading project…</p>
      </>
    );
  return (
    <>
      <Link
        href="/admin/projects"
        className="mb-4 inline-block text-sm underline"
      >
        ← All projects
      </Link>
      <PageHead title={p.title} sub={`${p.clientName} · Due ${p.dueDate}`} />
      <div className="mb-5 flex flex-wrap gap-2">
        {[
          "overview",
          "deliverables",
          ...(manager ? ["client drafts"] : []),
        ].map((t) => (
          <Btn
            key={t}
            variant={tab === t ? "primary" : "ghost"}
            onClick={() => setTab(t)}
          >
            {t}
          </Btn>
        ))}
      </div>
      <ErrorBox error={error} />
      {tab === "overview" && (
        <Card>
          <form onSubmit={saveProject} className="space-y-4">
            <Field label="Title">
              <Input
                disabled={!manager}
                value={p.title}
                required
                maxLength={200}
                onChange={(e) => setP({ ...p, title: e.target.value })}
              />
            </Field>
            <Field label="Scope">
              <Textarea
                disabled={!manager}
                rows={5}
                value={p.scope}
                maxLength={5000}
                onChange={(e) => setP({ ...p, scope: e.target.value })}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              {(["startDate", "dueDate"] as const).map((k) => (
                <Field
                  key={k}
                  label={k === "startDate" ? "Start date" : "Due date"}
                >
                  <Input
                    disabled={!manager}
                    required
                    type="date"
                    value={p[k]}
                    onChange={(e) => setP({ ...p, [k]: e.target.value })}
                  />
                </Field>
              ))}
              <Field label="Status">
                <Select
                  disabled={!manager}
                  value={p.status}
                  options={labels(states)}
                  onChange={(e) => setP({ ...p, status: e.target.value })}
                />
              </Field>
            </div>
            {manager ? (
              <TeamPicker
                people={[
                  ...eligible,
                  ...people
                    .filter((x) => !eligible.some((a) => a.id === x.id))
                    .map((x) => ({ ...x, name: x.name + " (inactive)" })),
                ]}
                selected={p.assigneeIds}
                onChange={(assigneeIds) => setP({ ...p, assigneeIds })}
              />
            ) : (
              <p className="text-sm">
                Team:{" "}
                {people.map((x) => x.name).join(", ") || "No team assigned"}
              </p>
            )}
            {manager && (
              <Btn type="submit" variant="primary" disabled={busy}>
                {busy ? "Saving…" : "Save project"}
              </Btn>
            )}
          </form>
        </Card>
      )}
      {tab === "deliverables" && (
        <div className="space-y-4">
          {manager && (
            <Btn variant="primary" onClick={() => open(null)}>
              Add deliverable
            </Btn>
          )}
          {!ds.length && <Card>No deliverables recorded yet.</Card>}
          {ds.map((d) => (
            <Card key={d.id}>
              <div className="flex flex-wrap justify-between gap-2">
                <h2 className="font-serif-luxury text-xl">{d.title}</h2>
                <Badge tone={d.status === "approved" ? "live" : "neutral"}>
                  {d.status}
                </Badge>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm">
                {d.description}
              </p>
              <p className="my-3 text-sm text-[#6b6259]">
                Due {d.dueDate} ·{" "}
                {people.find((x) => x.id === d.assigneeId)?.name ||
                  "Unassigned"}{" "}
                · Submission {d.submissionVersion}
              </p>
              {d.submissionReference && (
                <p className="mb-3 break-all text-sm">
                  Reference: {d.submissionReference}
                </p>
              )}
              {d.currentApproval && (
                <p className="my-3 text-sm">
                  Approved by {d.currentApproval.approverName} on{" "}
                  {d.currentApproval.decisionDate} ·{" "}
                  {d.currentApproval.evidenceReference}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {(manager || d.assigneeId === account?.id) && (
                  <Btn onClick={() => open(d)}>Update work</Btn>
                )}
                {manager && d.status === "in-review" && (
                  <Btn
                    onClick={() => {
                      setDecision(d);
                      setFormError("");
                      setApproval({
                        decision: "approved",
                        approverName: "",
                        decisionDate: today(),
                        evidenceReference: "",
                      });
                    }}
                  >
                    Record client decision
                  </Btn>
                )}
                <Btn onClick={() => setHistory(d)}>History</Btn>
              </div>
            </Card>
          ))}
        </div>
      )}
      {tab === "client drafts" && manager && <Drafts projectId={id} />}
      {edit !== undefined && (
        <Modal
          title={edit ? "Update deliverable" : "New deliverable"}
          onClose={() => {
            if (!busy) setEdit(undefined);
          }}
        >
          <form onSubmit={saveDeliverable} className="space-y-4">
            {manager && (
              <>
                <Field label="Title">
                  <Input
                    required
                    value={df.title}
                    maxLength={200}
                    onChange={(e) => setDf({ ...df, title: e.target.value })}
                  />
                </Field>
                <Field label="Description">
                  <Textarea
                    value={df.description}
                    maxLength={5000}
                    onChange={(e) =>
                      setDf({ ...df, description: e.target.value })
                    }
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Due date">
                    <Input
                      required
                      type="date"
                      value={df.dueDate}
                      onChange={(e) =>
                        setDf({ ...df, dueDate: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Assignee">
                    <Select
                      value={df.assigneeId}
                      options={[
                        { value: "", label: "Unassigned" },
                        ...people.map((x) => ({ value: x.id, label: x.name })),
                      ]}
                      onChange={(e) =>
                        setDf({ ...df, assigneeId: e.target.value })
                      }
                    />
                  </Field>
                </div>
              </>
            )}
            {edit && (
              <>
                <Field
                  label="Progress"
                  hint="Submitting creates a new review version. Editing approved content requires a new approval."
                >
                  <Select
                    value={df.status}
                    options={labels([
                      ...new Set([
                        edit.status,
                        "planned",
                        "in-progress",
                        "in-review",
                      ]),
                    ])}
                    onChange={(e) => setDf({ ...df, status: e.target.value })}
                  />
                </Field>
                <Field label="Submission link or document reference">
                  <Input
                    value={df.submissionReference}
                    maxLength={1000}
                    onChange={(e) =>
                      setDf({ ...df, submissionReference: e.target.value })
                    }
                  />
                </Field>
                <Field label="Progress note">
                  <Textarea
                    value={df.note}
                    maxLength={5000}
                    onChange={(e) => setDf({ ...df, note: e.target.value })}
                  />
                </Field>
              </>
            )}
            <ErrorBox error={formError} />
            <Btn variant="primary" type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save deliverable"}
            </Btn>
          </form>
        </Modal>
      )}
      {decision && (
        <Modal
          title={`Record decision · Submission ${decision.submissionVersion}`}
          onClose={() => {
            if (!busy) setDecision(undefined);
          }}
        >
          <form onSubmit={recordDecision} className="space-y-4">
            <p className="text-sm">
              Record the decision already received from the client for:{" "}
              {decision.submissionReference}
            </p>
            <Field label="Decision">
              <Select
                value={approval.decision}
                options={labels(["approved", "changes-requested"])}
                onChange={(e) =>
                  setApproval({ ...approval, decision: e.target.value })
                }
              />
            </Field>
            <Field label="Client approver name">
              <Input
                required
                maxLength={160}
                value={approval.approverName}
                onChange={(e) =>
                  setApproval({ ...approval, approverName: e.target.value })
                }
              />
            </Field>
            <Field label="Decision date">
              <Input
                required
                type="date"
                max={today()}
                value={approval.decisionDate}
                onChange={(e) =>
                  setApproval({ ...approval, decisionDate: e.target.value })
                }
              />
            </Field>
            <Field label="Email / evidence reference">
              <Input
                required
                maxLength={1000}
                value={approval.evidenceReference}
                onChange={(e) =>
                  setApproval({
                    ...approval,
                    evidenceReference: e.target.value,
                  })
                }
              />
            </Field>
            <ErrorBox error={formError} />
            <Btn type="submit" variant="primary" disabled={busy}>
              Save client decision
            </Btn>
          </form>
        </Modal>
      )}
      {history && (
        <Modal
          title="Deliverable history"
          onClose={() => setHistory(undefined)}
        >
          <div className="space-y-4">
            {history.history
              .slice()
              .reverse()
              .map((h, i) => (
                <div key={i} className="border-b border-[#d8c3a5] pb-3 text-sm">
                  <strong>
                    {h.action} · Submission {h.submissionVersion ?? 0}
                  </strong>
                  <p>
                    {h.actor} · {new Date(h.at).toLocaleString()}
                  </p>
                  <p className="whitespace-pre-wrap break-words">
                    {[
                      h.title,
                      h.description,
                      h.submissionReference,
                      h.note,
                      h.approverName,
                      h.decisionDate,
                      h.evidenceReference,
                    ]
                      .filter(Boolean)
                      .join("\n")}
                  </p>
                </div>
              ))}
          </div>
        </Modal>
      )}
    </>
  );
}
