"use client";

import { useEffect, useState } from "react";

import { useCollection } from "./useCms";
import {
  Btn,
  Card,
  Field,
  Input,
  LinesField,
  PageHead,
  Spinner,
  Textarea,
  useToast,
} from "./ui";
import type { Service } from "@/lib/admin/cms/types";

/**
 * Master-detail editor for the six service lines.
 *
 * Services are not created or deleted here — their slugs back public routes,
 * so the set is fixed and only the copy is editable. That is a deliberate
 * constraint, not a missing feature.
 */
export default function Services() {
  const { data, loading, error, update } = useCollection<Service>("services");
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Service | null>(null);
  const [saving, setSaving] = useState(false);
  const { show, node: toast } = useToast();

  const rows = data ?? [];
  const active = rows.find((s) => s.id === selected) ?? rows[0] ?? null;

  // Load the selected service into a local draft so edits are not lost while
  // the collection refetches.
  useEffect(() => {
    if (active && (!draft || draft.id !== active.id)) setDraft({ ...active });
  }, [active, draft]);

  if (loading) return <Spinner />;
  if (error) return <p className="font-sans-luxury text-[13px] text-[#a3231b]">{error}</p>;

  const set = <K extends keyof Service>(k: K, v: Service[K]) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d));

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await update(draft.id, draft);
      show("Service saved");
    } catch (e) {
      show(e instanceof Error ? e.message : "Could not save.", true);
    }
    setSaving(false);
  };

  return (
    <>
      <PageHead title="Services" sub={`Edit the ${rows.length} services. The slugs are fixed.`} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
        <Card pad={false} className="h-fit overflow-hidden">
          <ul>
            {rows.map((s, i) => {
              const on = draft?.id === s.id;
              return (
                <li key={s.id}>
                  <button
                    onClick={() => {
                      setSelected(s.id);
                      setDraft({ ...s });
                    }}
                    className={`flex w-full cursor-pointer items-start justify-between gap-2 border-b border-[#d8c3a5]/35 px-4 py-3 text-left transition-colors ${
                      on ? "bg-[#741a14]/8" : "hover:bg-[#f3e8d5]/60"
                    }`}
                  >
                    <span className="min-w-0">
                      <span
                        className={`block truncate font-sans-luxury text-[12.5px] ${
                          on ? "text-[#741a14]" : "text-[#11100e]"
                        }`}
                      >
                        {s.title}
                      </span>
                      <span className="block truncate font-sans-luxury text-[10.5px] text-[#a2988b]">
                        {s.slug}
                      </span>
                    </span>
                    <span className="shrink-0 font-sans-luxury text-[10px] text-[#c3b8a8]">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>

        {draft ? (
          <Card>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Title">
                <Input value={draft.title} onChange={(e) => set("title", e.target.value)} />
              </Field>
              <Field label="Tagline">
                <Input value={draft.tagline} onChange={(e) => set("tagline", e.target.value)} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Overview">
                  <Textarea
                    rows={4}
                    value={draft.overview}
                    onChange={(e) => set("overview", e.target.value)}
                  />
                </Field>
              </div>
              <LinesField
                label="Who it's for"
                value={draft.audience}
                onChange={(v) => set("audience", v)}
              />
              <LinesField
                label="What we build"
                value={draft.weBuild}
                onChange={(v) => set("weBuild", v)}
              />
              <LinesField
                label="Example use cases"
                value={draft.exampleUseCases}
                onChange={(v) => set("exampleUseCases", v)}
              />
              <LinesField
                label="Deliverables"
                value={draft.deliverables}
                onChange={(v) => set("deliverables", v)}
              />
            </div>

            <div className="mt-5 flex justify-end border-t border-[#d8c3a5]/45 pt-4">
              <Btn variant="primary" onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save service"}
              </Btn>
            </div>
          </Card>
        ) : null}
      </div>

      {toast}
    </>
  );
}
