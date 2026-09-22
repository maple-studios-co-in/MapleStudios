"use client";

import { useState } from "react";
import { Check as CheckIcon, ChevronDown, ChevronUp, Pencil, Plus, Trash2, X } from "lucide-react";

import { useCollection } from "./useCms";
import { Btn, Card, Confirm, Input, PageHead, Spinner, useToast } from "./ui";
import type { Category, CategoryGroup } from "@/lib/admin/cms/types";

const GROUPS: { key: CategoryGroup; label: string }[] = [
  { key: "portfolio", label: "Portfolio" },
  { key: "blog", label: "Blog" },
  { key: "media", label: "Media" },
];

/** Add, rename, reorder, or remove the categories the Portfolio and Blog forms
    offer, and the Media library's folder suggestions. */
export default function Categories() {
  const { data, loading, error, create, update, remove, reorder } = useCollection<Category>("categories");
  const [confirming, setConfirming] = useState<Category | null>(null);
  const { show, node: toast } = useToast();

  if (loading) return <Spinner />;
  if (error) return <p className="font-sans-luxury text-[13px] text-[#a3231b]">{error}</p>;

  const all = data ?? [];

  return (
    <>
      <PageHead
        title="Categories"
        sub="The categories the Portfolio and Blog forms offer, and the Media library's folder suggestions. Renaming a category updates every project, post or asset already using it."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {GROUPS.map((g) => {
          const rows = all
            .filter((c) => c.group === g.key)
            .sort((a, b) => a.order - b.order);
          return (
            <GroupCard
              key={g.key}
              label={g.label}
              rows={rows}
              onAdd={async (name) => {
                await create({ group: g.key, name, order: rows.length });
                show("Category added");
              }}
              onRename={async (id, name) => {
                await update(id, { name });
                show("Renamed");
              }}
              onMove={async (index, dir) => {
                const next = [...rows];
                const t = index + dir;
                if (t < 0 || t >= next.length) return;
                [next[index], next[t]] = [next[t], next[index]];
                // Reorder is collection-wide, so send this group's new order
                // followed by every other group untouched.
                const others = all.filter((c) => c.group !== g.key).map((c) => c.id);
                await reorder([...next.map((c) => c.id), ...others]);
              }}
              onDelete={setConfirming}
            />
          );
        })}
      </div>

      {confirming ? (
        <Confirm
          title="Remove this category?"
          body={`"${confirming.name}" will no longer be offered in the forms. Records already using it keep the value until you change it.`}
          confirmLabel="Remove"
          onCancel={() => setConfirming(null)}
          onConfirm={async () => {
            await remove(confirming.id);
            show("Removed");
            setConfirming(null);
          }}
        />
      ) : null}

      {toast}
    </>
  );
}

function GroupCard({
  label,
  rows,
  onAdd,
  onRename,
  onMove,
  onDelete,
}: {
  label: string;
  rows: Category[];
  onAdd: (name: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onMove: (index: number, dir: -1 | 1) => Promise<void>;
  onDelete: (c: Category) => void;
}) {
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const add = async () => {
    const name = draft.trim();
    if (!name) return;
    setDraft("");
    await onAdd(name);
  };

  return (
    <Card>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-serif-luxury text-[19px] leading-none text-[#11100e]">{label}</h2>
        <span className="font-sans-luxury text-[11px] text-[#a2988b]">{rows.length}</span>
      </div>

      <div className="flex gap-2">
        <Input
          value={draft}
          placeholder="New category…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <Btn variant="primary" onClick={add} className="shrink-0">
          <Plus size={12} /> Add
        </Btn>
      </div>

      <ul className="mt-3 divide-y divide-[#d8c3a5]/35">
        {rows.map((c, i) => (
          <li key={c.id} className="flex items-center gap-1.5 py-1.5">
            {editing === c.id ? (
              <>
                <Input
                  autoFocus
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === "Enter" && editDraft.trim()) {
                      await onRename(c.id, editDraft.trim());
                      setEditing(null);
                    }
                    if (e.key === "Escape") setEditing(null);
                  }}
                />
                <button
                  aria-label="Save name"
                  onClick={async () => {
                    if (editDraft.trim()) await onRename(c.id, editDraft.trim());
                    setEditing(null);
                  }}
                  className="cursor-pointer rounded-full p-1.5 text-[#2f6b4a] hover:bg-[#2f6b4a]/10"
                >
                  <CheckIcon size={14} />
                </button>
                <button
                  aria-label="Cancel"
                  onClick={() => setEditing(null)}
                  className="cursor-pointer rounded-full p-1.5 text-[#8b8178] hover:bg-[#741a14]/10"
                >
                  <X size={14} />
                </button>
              </>
            ) : (
              <>
                <span className="min-w-0 flex-1 truncate font-sans-luxury text-[12.5px] text-[#11100e]">
                  {c.name}
                </span>
                <button
                  aria-label="Move up"
                  disabled={i === 0}
                  onClick={() => onMove(i, -1)}
                  className="cursor-pointer p-1 text-[#a2988b] hover:text-[#741a14] disabled:opacity-25"
                >
                  <ChevronUp size={13} />
                </button>
                <button
                  aria-label="Move down"
                  disabled={i === rows.length - 1}
                  onClick={() => onMove(i, 1)}
                  className="cursor-pointer p-1 text-[#a2988b] hover:text-[#741a14] disabled:opacity-25"
                >
                  <ChevronDown size={13} />
                </button>
                <button
                  aria-label="Rename"
                  onClick={() => {
                    setEditing(c.id);
                    setEditDraft(c.name);
                  }}
                  className="cursor-pointer rounded-full p-1.5 text-[#8b8178] hover:bg-[#741a14]/10 hover:text-[#741a14]"
                >
                  <Pencil size={13} />
                </button>
                <button
                  aria-label="Remove"
                  onClick={() => onDelete(c)}
                  className="cursor-pointer rounded-full p-1.5 text-[#8b8178] hover:bg-[#a3231b]/10 hover:text-[#a3231b]"
                >
                  <Trash2 size={13} />
                </button>
              </>
            )}
          </li>
        ))}
        {rows.length === 0 ? (
          <li className="py-4 text-center font-sans-luxury text-[12px] text-[#a2988b]">
            No categories yet.
          </li>
        ) : null}
      </ul>
    </Card>
  );
}
