"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from "lucide-react";

import MarkdownEditor from "./MarkdownEditor";
import type { FieldDef, ScreenDef } from "./defs";
import { useCollection } from "./useCms";
import {
  Badge,
  Btn,
  Check,
  Confirm,
  CsvField,
  Field,
  Input,
  LinesField,
  Modal,
  PageHead,
  Select,
  SectionLabel,
  Spinner,
  Table,
  Td,
  Textarea,
  Tr,
  shortDate,
  slugify,
  statusTone,
  useToast,
} from "./ui";

type Row = Record<string, unknown> & { id: string; createdAt: string; updatedAt: string };

/**
 * The list-shaped modules: table, create/edit form, publish toggle, delete,
 * and (where the collection is ordered) move up/down.
 *
 * Everything specific to a module lives in its ScreenDef — see defs.ts.
 */
export default function ResourceScreen({ def }: { def: ScreenDef }) {
  const { data, loading, error, create, update, remove, reorder } = useCollection<Row>(def.resource);
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [confirming, setConfirming] = useState<Row | null>(null);
  const [filter, setFilter] = useState("");
  const { show, node: toast } = useToast();

  const rows = useMemo(() => {
    if (!data) return [];
    if (!def.filter || !filter) return data;
    return data.filter((r) => String(r[def.filter!.key] ?? "") === filter);
  }, [data, def.filter, filter]);

  const move = async (index: number, dir: -1 | 1) => {
    const next = [...rows];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    await reorder(next.map((r) => r.id));
    show("Order saved");
  };

  const save = async (values: Record<string, unknown>) => {
    try {
      if (editing === "new") {
        await create(values);
        show("Created");
      } else if (editing) {
        await update(editing.id, values);
        show("Saved");
      }
      setEditing(null);
    } catch (e) {
      show(e instanceof Error ? e.message : "Could not save.", true);
    }
  };

  const togglePublish = async (row: Row) => {
    if (!def.publishField) return;
    try {
      if (def.publishField === "status") {
        const next = row.status === "published" ? "draft" : "published";
        await update(row.id, { status: next });
        show(next === "published" ? "Published" : "Moved to draft");
      } else {
        const next = !row.published;
        await update(row.id, { published: next });
        show(next ? "Published" : "Unpublished");
      }
    } catch (e) {
      show(e instanceof Error ? e.message : "Could not update.", true);
    }
  };

  const head = [
    ...(def.orderable ? [""] : []),
    ...def.columns.map((c) => c.label),
    "Actions",
  ];

  return (
    <>
      <PageHead
        title={def.title}
        sub={def.sub}
        action={
          <Btn variant="primary" onClick={() => setEditing("new")}>
            <Plus size={13} />
            {def.newLabel}
          </Btn>
        }
      />

      {def.filter ? (
        <div className="mb-4 max-w-[280px]">
          <Select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            options={[
              { value: "", label: def.filter.label },
              ...def.filter.options.map((o) => ({ value: o, label: cap(o) })),
            ]}
          />
        </div>
      ) : null}

      {error ? (
        <p className="mb-4 font-sans-luxury text-[12.5px] text-[#a3231b]">{error}</p>
      ) : null}

      {loading ? (
        <Spinner />
      ) : (
        <Table head={head} empty={def.empty}>
          {rows.map((row, i) => (
            <Tr key={row.id}>
              {def.orderable ? (
                <Td className="w-[52px] whitespace-nowrap">
                  <div className="flex flex-col gap-0.5">
                    <button
                      aria-label="Move up"
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                      className="cursor-pointer text-[#a2988b] transition-colors hover:text-[#741a14] disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <ChevronUp size={13} />
                    </button>
                    <button
                      aria-label="Move down"
                      disabled={i === rows.length - 1}
                      onClick={() => move(i, 1)}
                      className="cursor-pointer text-[#a2988b] transition-colors hover:text-[#741a14] disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <ChevronDown size={13} />
                    </button>
                  </div>
                </Td>
              ) : null}

              {def.columns.map((col) => (
                <Td key={col.key}>{renderCell(row, col.key, col.as)}</Td>
              ))}

              <Td className="whitespace-nowrap text-right">
                <div className="flex items-center justify-end gap-1.5">
                  {def.publishField ? (
                    <Btn onClick={() => togglePublish(row)}>
                      {def.publishField === "status"
                        ? row.status === "published"
                          ? "Unpublish"
                          : "Publish"
                        : row.published
                          ? "Unpublish"
                          : "Publish"}
                    </Btn>
                  ) : null}
                  <button
                    aria-label="Edit"
                    onClick={() => setEditing(row)}
                    className="cursor-pointer rounded-full p-1.5 text-[#8b8178] transition-colors hover:bg-[#741a14]/10 hover:text-[#741a14]"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    aria-label="Delete"
                    onClick={() => setConfirming(row)}
                    className="cursor-pointer rounded-full p-1.5 text-[#8b8178] transition-colors hover:bg-[#a3231b]/10 hover:text-[#a3231b]"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </Td>
            </Tr>
          ))}
        </Table>
      )}

      {editing ? (
        <RecordForm
          def={def}
          row={editing === "new" ? null : editing}
          onCancel={() => setEditing(null)}
          onSave={save}
        />
      ) : null}

      {confirming ? (
        <Confirm
          title={`Delete this ${def.title.replace(/s$/, "").toLowerCase()}?`}
          body={`"${String(confirming[def.titleKey] ?? "This record")}" will be removed permanently. This cannot be undone.`}
          onCancel={() => setConfirming(null)}
          onConfirm={async () => {
            try {
              await remove(confirming.id);
              show("Deleted");
            } catch (e) {
              show(e instanceof Error ? e.message : "Could not delete.", true);
            }
            setConfirming(null);
          }}
        />
      ) : null}

      {toast}
    </>
  );
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function renderCell(row: Row, key: string, as?: ColAs) {
  const v = row[key];

  if (as === "bool")
    return <Badge tone={v ? "live" : "draft"}>{v ? "Live" : "Draft"}</Badge>;

  if (as === "badge")
    return <Badge tone={statusTone(String(v ?? ""))}>{String(v ?? "—")}</Badge>;

  if (as === "date") return <span className="text-[#8b8178]">{shortDate(String(v ?? ""))}</span>;

  if (key === "coverUrl" || key === "thumbnailUrl") {
    const url = String(v ?? "");
    return url ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt="" className="h-9 w-9 rounded-[5px] object-cover" />
    ) : (
      <span className="text-[#c3b8a8]">—</span>
    );
  }

  const text = Array.isArray(v) ? v.join(", ") : String(v ?? "");
  if (!text) return <span className="text-[#c3b8a8]">—</span>;
  return <span className="line-clamp-1 max-w-[280px]">{text}</span>;
}

type ColAs = "badge" | "date" | "bool" | "text" | undefined;

/* ————— the form ————— */

function RecordForm({
  def,
  row,
  onCancel,
  onSave,
}: {
  def: ScreenDef;
  row: Row | null;
  onCancel: () => void;
  onSave: (values: Record<string, unknown>) => void | Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, unknown>>(() => ({
    ...def.defaults,
    ...(row ?? {}),
  }));
  const [touchedSlug, setTouchedSlug] = useState(Boolean(row));
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (name: string, v: unknown) => setValues((prev) => ({ ...prev, [name]: v }));

  /** Slug follows the title until the operator edits it themselves — the
      usual CMS affordance, and it stops empty-slug saves on new records. */
  const setTitle = (name: string, v: string) => {
    set(name, v);
    const hasSlug = def.fields.some((f) => f.name === "slug");
    if (hasSlug && !touchedSlug && (name === "title" || name === "role")) set("slug", slugify(v));
  };

  const submit = async () => {
    const missing = def.fields.find(
      (f) => f.required && !String((values[f.name] ?? "") as string).trim()
    );
    if (missing) {
      setProblem(`${missing.label} is required.`);
      return;
    }
    setProblem(null);
    setSaving(true);
    await onSave(values);
    setSaving(false);
  };

  // group the flat field list into the sections declared on the defs
  const groups: { section: string | null; fields: FieldDef[] }[] = [];
  for (const f of def.fields) {
    if (f.section || groups.length === 0) groups.push({ section: f.section ?? null, fields: [] });
    groups[groups.length - 1].fields.push(f);
  }

  return (
    <Modal
      title={row ? `Edit ${def.title.replace(/s$/, "").toLowerCase()}` : def.newLabel}
      onClose={onCancel}
      wide={def.wideForm}
    >
      <div className="max-h-[68vh] overflow-y-auto pr-1">
        {groups.map((g, gi) => (
          <section key={gi} className={gi > 0 ? "mt-6 border-t border-[#d8c3a5]/45 pt-5" : ""}>
            {g.section ? <SectionLabel>{g.section}</SectionLabel> : null}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {g.fields.map((f) => (
                <div key={f.name} className={f.half ? "sm:col-span-1" : "sm:col-span-2"}>
                  <FieldControl
                    field={f}
                    value={values[f.name]}
                    onChange={(v) => (f.name === "title" || f.name === "role" ? setTitle(f.name, v as string) : set(f.name, v))}
                    onSlugTouched={() => setTouchedSlug(true)}
                  />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {problem ? (
        <p role="alert" className="mt-4 font-sans-luxury text-[12.5px] text-[#a3231b]">
          {problem}
        </p>
      ) : null}

      <div className="mt-6 flex justify-end gap-2 border-t border-[#d8c3a5]/45 pt-4">
        <Btn onClick={onCancel}>Cancel</Btn>
        <Btn variant="primary" onClick={submit} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Btn>
      </div>
    </Modal>
  );
}

function FieldControl({
  field: f,
  value,
  onChange,
  onSlugTouched,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
  onSlugTouched: () => void;
}) {
  switch (f.type) {
    case "textarea":
      return (
        <Field label={f.label} hint={f.hint} required={f.required}>
          <Textarea
            rows={f.rows ?? 3}
            value={String(value ?? "")}
            placeholder={f.placeholder}
            onChange={(e) => onChange(e.target.value)}
          />
        </Field>
      );

    case "number":
      return (
        <Field label={f.label} hint={f.hint} required={f.required}>
          <Input
            type="number"
            value={value === null || value === undefined ? "" : String(value)}
            onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          />
        </Field>
      );

    case "select":
      return (
        <Field label={f.label} hint={f.hint} required={f.required}>
          <Select
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
            options={(f.options ?? []).map((o) => ({ value: o, label: cap(o) }))}
          />
        </Field>
      );

    case "check":
      return <Check label={f.label} hint={f.hint} checked={Boolean(value)} onChange={onChange} />;

    case "lines":
      return (
        <LinesField
          label={f.label}
          value={Array.isArray(value) ? (value as string[]) : []}
          onChange={onChange}
          rows={f.rows ?? 4}
        />
      );

    case "csv":
      return (
        <CsvField
          label={f.label}
          value={Array.isArray(value) ? (value as string[]) : []}
          onChange={onChange}
        />
      );

    case "markdown":
      return (
        <Field label={f.label || undefined} hint={f.hint}>
          <MarkdownEditor value={String(value ?? "")} onChange={onChange} />
        </Field>
      );

    case "credits":
      return (
        <CreditsField
          value={Array.isArray(value) ? (value as { role: string; name: string }[]) : []}
          onChange={onChange}
        />
      );

    default:
      return (
        <Field label={f.label} hint={f.hint} required={f.required}>
          <Input
            value={String(value ?? "")}
            placeholder={f.placeholder}
            onChange={(e) => {
              if (f.name === "slug") onSlugTouched();
              onChange(e.target.value);
            }}
          />
        </Field>
      );
  }
}

/** Repeating role/name pairs — the one field shape the generic controls
    cannot express, so it gets a small bespoke editor. */
function CreditsField({
  value,
  onChange,
}: {
  value: { role: string; name: string }[];
  onChange: (v: { role: string; name: string }[]) => void;
}) {
  return (
    <Field label="Credits">
      <div className="space-y-2">
        {value.map((c, i) => (
          <div key={i} className="flex gap-2">
            <Input
              placeholder="Role"
              value={c.role}
              onChange={(e) => {
                const next = [...value];
                next[i] = { ...next[i], role: e.target.value };
                onChange(next);
              }}
            />
            <Input
              placeholder="Name"
              value={c.name}
              onChange={(e) => {
                const next = [...value];
                next[i] = { ...next[i], name: e.target.value };
                onChange(next);
              }}
            />
            <button
              type="button"
              aria-label="Remove credit"
              onClick={() => onChange(value.filter((_, j) => j !== i))}
              className="shrink-0 cursor-pointer rounded-full p-2 text-[#8b8178] transition-colors hover:bg-[#a3231b]/10 hover:text-[#a3231b]"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <Btn onClick={() => onChange([...value, { role: "", name: "" }])}>
          <Plus size={12} /> Add credit
        </Btn>
      </div>
    </Field>
  );
}
