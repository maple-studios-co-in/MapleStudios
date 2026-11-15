"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { sessionFetch } from "@/lib/admin/session-client";
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
  Draft,
  Project,
  Template,
  Invoice,
  cleanInvoice,
  labels,
  today,
  message,
} from "./api";
import { ErrorBox, Pager, Filters, useList } from "./shared";
import InvoiceEditor, { newInvoice } from "./InvoiceEditor";
export default function Drafts({ projectId }: { projectId?: string }) {
  const [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [edit, setEdit] = useState<Draft>(),
    [versions, setVersions] = useState<Draft[]>(),
    [preview, setPreview] = useState(""),
    [projects, setProjects] = useState<Project[]>([]),
    [templates, setTemplates] = useState<Template[]>([]),
    [regenerate, setRegenerate] = useState<Draft>();
  const frame = useRef<HTMLIFrameElement>(null);
  const [form, setForm] = useState({
    projectId: projectId || "",
    kind: "onboarding",
    templateId: "",
    notes: "",
    reference: "",
    documentDate: today(),
    periodStart: today(),
    periodEnd: today(),
  });
  const [invoice, setInvoice] = useState<Invoice>(newInvoice);
  const list = useList<Draft>(
    `/drafts?q=${encodeURIComponent(q)}&page=${page}${projectId ? `&projectId=${projectId}` : ""}`,
  );
  async function openGenerator(d?: Draft) {
    setError("");
    setBusy(true);
    try {
      const [p, t] = await Promise.all([
        all<Project>("/projects"),
        api<{ items: Template[] }>("/templates"),
      ]);
      setProjects(p);
      setTemplates(t.items);
      setForm({
        projectId: d?.projectId || projectId || p[0]?.id || "",
        kind: d?.kind || "onboarding",
        templateId: d?.snapshot.templateId || "",
        notes: "",
        reference: d?.snapshot.reference || "",
        documentDate: today(),
        periodStart: today(),
        periodEnd: today(),
      });
      setInvoice(
        d?.snapshot.invoice ? cleanInvoice(d.snapshot.invoice) : newInvoice(),
      );
      setRegenerate(d);
      setOpen(true);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function generate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const {
        projectId: pid,
        kind,
        templateId,
        periodStart,
        periodEnd,
        ...rest
      } = form;
      const options = {
        ...rest,
        ...(templateId
          ? { templateId }
          : regenerate
            ? { templateId: null }
            : {}),
        ...(kind === "update" ? { periodStart, periodEnd } : {}),
        ...(kind === "invoice" ? { invoice: cleanInvoice(invoice) } : {}),
      };
      const r = await api<{ item: Draft }>(
        regenerate ? `/drafts/${regenerate.id}/regenerate` : "/drafts",
        "POST",
        regenerate
          ? { ...options, revision: regenerate.revision }
          : { ...options, projectId: pid, kind },
      );
      setOpen(false);
      setEdit(r.item);
      list.reload();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!edit) return;
    setBusy(true);
    setError("");
    try {
      const r = await api<{ item: Draft }>(`/drafts/${edit.id}`, "PATCH", {
        revision: edit.revision,
        title: edit.title,
        subject: edit.subject,
        body: edit.body,
        ...(edit.snapshot.invoice
          ? { invoice: cleanInvoice(edit.snapshot.invoice) }
          : {}),
      });
      setEdit(r.item);
      list.reload();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function exportDraft(d: Draft, format: string) {
    setBusy(true);
    setError("");
    try {
      const response = await sessionFetch(
        `/api/v2/business/drafts/${d.id}/export?format=${format}`,
      );
      if (!response.ok) {
        const r = await response.json();
        throw new Error(r.error || "Export failed.");
      }
      if (format === "html") {
        setPreview(await response.text());
      } else {
        const url = URL.createObjectURL(await response.blob());
        const a = document.createElement("a");
        a.href = url;
        a.download = `maple-${d.kind}-draft-v${d.revision}.${format}`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function history(d: Draft) {
    setError("");
    try {
      setVersions(
        (await api<{ items: Draft[] }>(`/drafts/${d.id}/versions`)).items,
      );
    } catch (e) {
      setError(message(e));
    }
  }
  return (
    <>
      <PageHead
        title="Client drafts"
        sub="Generate, edit and export. Nothing is emailed or signed automatically."
        action={
          <Btn
            variant="primary"
            disabled={busy}
            onClick={() => openGenerator()}
          >
            Generate draft
          </Btn>
        }
      />
      <Filters
        q={q}
        setQ={(v) => {
          setQ(v);
          setPage(1);
        }}
      />
      <ErrorBox error={!open && !edit ? error : list.error} />
      <div className="space-y-3">
        {list.data?.items.map((d) => (
          <Card key={d.id}>
            <div className="flex flex-wrap justify-between gap-2">
              <h2 className="font-serif-luxury text-xl">{d.title}</h2>
              <Badge>Draft · v{d.revision}</Badge>
            </div>
            <p className="my-2 text-sm">
              {d.snapshot.client.name} · {d.snapshot.project.title}
            </p>
            {d.missing.length > 0 && (
              <p className="my-2 text-sm text-red-800">
                Needs: {d.missing.join(", ")}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Btn
                onClick={() => {
                  setEdit(d);
                  setError("");
                }}
              >
                Edit & export
              </Btn>
              <Btn onClick={() => history(d)}>Versions</Btn>
              <Btn disabled={busy} onClick={() => openGenerator(d)}>
                Regenerate
              </Btn>
            </div>
          </Card>
        ))}
      </div>
      {list.data?.items.length === 0 && (
        <Card>
          No drafts yet. Generate an onboarding email or your first project
          document.
        </Card>
      )}
      <Pager meta={list.data?.meta} page={page} setPage={setPage} />
      {open && (
        <Modal
          title={
            regenerate ? "Regenerate as a new version" : "Generate client draft"
          }
          wide
          onClose={() => {
            if (!busy) setOpen(false);
          }}
        >
          <form onSubmit={generate} className="space-y-4">
            {regenerate && (
              <p className="text-sm">
                This generates fresh text using current company, client and
                project details. Previous versions and edits remain in history.
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Project">
                <Select
                  required
                  disabled={!!regenerate || !!projectId}
                  value={form.projectId}
                  options={[
                    { value: "", label: "Choose project" },
                    ...projects.map((p) => ({
                      value: p.id,
                      label: `${p.clientName} · ${p.title}`,
                    })),
                  ]}
                  onChange={(e) =>
                    setForm({ ...form, projectId: e.target.value })
                  }
                />
              </Field>
              <Field label="Document type">
                <Select
                  disabled={!!regenerate}
                  value={form.kind}
                  options={labels([
                    "onboarding",
                    "update",
                    "invoice",
                    "confidentiality",
                  ])}
                  onChange={(e) =>
                    setForm({ ...form, kind: e.target.value, templateId: "" })
                  }
                />
              </Field>
            </div>
            {form.kind !== "invoice" && (
              <Field label="Template">
                <Select
                  required={form.kind === "confidentiality"}
                  value={form.templateId}
                  options={[
                    {
                      value: "",
                      label:
                        form.kind === "confidentiality"
                          ? "Choose published agreement"
                          : "Standard email draft",
                    },
                    ...templates
                      .filter(
                        (t) => t.status === "published" && t.kind === form.kind,
                      )
                      .map((t) => ({ value: t.id, label: t.name })),
                  ]}
                  onChange={(e) =>
                    setForm({ ...form, templateId: e.target.value })
                  }
                />
              </Field>
            )}
            {form.kind === "confidentiality" && (
              <p className="text-sm">
                Only published templates can be used. The Owner can review and
                publish the reference draft in{" "}
                <Link className="underline" href="/admin/company">
                  Company & templates
                </Link>
                .
              </p>
            )}
            {form.kind === "update" && (
              <div className="grid grid-cols-2 gap-3">
                {(["periodStart", "periodEnd"] as const).map((k) => (
                  <Field
                    key={k}
                    label={k === "periodStart" ? "Period start" : "Period end"}
                  >
                    <Input
                      required
                      type="date"
                      value={form[k]}
                      onChange={(e) =>
                        setForm({ ...form, [k]: e.target.value })
                      }
                    />
                  </Field>
                ))}
              </div>
            )}
            {form.kind !== "invoice" && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Reference (optional)">
                  <Input
                    maxLength={80}
                    value={form.reference}
                    onChange={(e) =>
                      setForm({ ...form, reference: e.target.value })
                    }
                  />
                </Field>
                <Field label="Document date">
                  <Input
                    required
                    type="date"
                    value={form.documentDate}
                    onChange={(e) =>
                      setForm({ ...form, documentDate: e.target.value })
                    }
                  />
                </Field>
              </div>
            )}
            {form.kind === "invoice" && (
              <InvoiceEditor value={invoice} onChange={setInvoice} />
            )}
            <Field label="Notes / next steps">
              <Textarea
                maxLength={5000}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </Field>
            <ErrorBox error={error} />
            <Btn
              type="submit"
              disabled={busy || !form.projectId}
              variant="primary"
            >
              {busy
                ? "Generating…"
                : regenerate
                  ? "Create new version"
                  : "Generate draft"}
            </Btn>
          </form>
        </Modal>
      )}
      {edit && !open && (
        <Modal
          title="Edit client draft"
          wide
          onClose={() => {
            if (!busy) setEdit(undefined);
          }}
        >
          <form onSubmit={save} className="space-y-4">
            <p className="text-sm">
              Saved v{edit.revision} · {edit.snapshot.client.name}. Exports use
              the last saved version.
            </p>
            <Field label="Title">
              <Input
                required
                maxLength={200}
                value={edit.title}
                onChange={(e) => setEdit({ ...edit, title: e.target.value })}
              />
            </Field>
            <Field label="Subject">
              <Input
                maxLength={300}
                value={edit.subject}
                onChange={(e) => setEdit({ ...edit, subject: e.target.value })}
              />
            </Field>
            <Field label="Draft text">
              <Textarea
                required
                rows={12}
                maxLength={50000}
                value={edit.body}
                onChange={(e) => setEdit({ ...edit, body: e.target.value })}
              />
            </Field>
            {edit.snapshot.invoice && (
              <InvoiceEditor
                key={`${edit.id}-${edit.revision}`}
                value={edit.snapshot.invoice}
                onChange={(invoice) =>
                  setEdit({ ...edit, snapshot: { ...edit.snapshot, invoice } })
                }
              />
            )}
            <ErrorBox error={error} />
            {edit.missing.length > 0 && (
              <p className="text-sm text-red-800">
                Resolve placeholders and save before exporting:{" "}
                {edit.missing.join(", ")}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Btn type="submit" variant="primary" disabled={busy}>
                Save new version
              </Btn>
              <Btn
                type="button"
                disabled={busy || !!edit.missing.length}
                onClick={() => exportDraft(edit, "html")}
              >
                Preview / Save PDF
              </Btn>
              <Btn
                type="button"
                disabled={busy || !!edit.missing.length}
                onClick={() => exportDraft(edit, "docx")}
              >
                Download Word
              </Btn>
              {["onboarding", "update"].includes(edit.kind) && (
                <Btn
                  type="button"
                  disabled={busy || !!edit.missing.length}
                  onClick={() => exportDraft(edit, "txt")}
                >
                  Download email text
                </Btn>
              )}
            </div>
          </form>
        </Modal>
      )}
      {versions && (
        <Modal
          title="Saved versions"
          wide
          onClose={() => setVersions(undefined)}
        >
          <div className="space-y-3">
            {versions.map((v) => (
              <details
                key={v.revision}
                className="rounded-lg border border-[#d8c3a5] p-3"
              >
                <summary className="cursor-pointer text-sm">
                  Version {v.revision} · {v.updatedBy} ·{" "}
                  {new Date(v.updatedAt).toLocaleString()}
                </summary>
                <h3 className="my-3 font-bold">{v.title}</h3>
                <p className="text-sm">{v.subject}</p>
                <pre className="my-3 whitespace-pre-wrap break-words font-sans text-sm">
                  {v.body}
                </pre>
                {v.snapshot.invoice && (
                  <p className="text-sm">
                    Invoice {v.snapshot.invoice.reference} · Total ₹
                    {((v.snapshot.invoice.totals?.total || 0) / 100).toFixed(2)}
                  </p>
                )}
              </details>
            ))}
          </div>
        </Modal>
      )}
      {preview && (
        <Modal title="Print preview" wide onClose={() => setPreview("")}>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <Btn onClick={() => frame.current?.contentWindow?.print()}>
              Print / Save as PDF
            </Btn>
            <p className="text-sm">Choose “Save as PDF” in the print dialog.</p>
          </div>
          <iframe
            ref={frame}
            title="Document preview"
            sandbox="allow-same-origin allow-modals"
            srcDoc={preview}
            className="h-[65vh] w-full border bg-white"
          />
        </Modal>
      )}
    </>
  );
}
