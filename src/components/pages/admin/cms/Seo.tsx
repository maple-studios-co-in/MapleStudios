"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { useCollection } from "./useCms";
import {
  Badge,
  Btn,
  Check,
  Confirm,
  Field,
  Input,
  Modal,
  PageHead,
  Select,
  Spinner,
  Table,
  Td,
  Textarea,
  Tr,
  useToast,
} from "./ui";
import type { Redirect, SeoEntry } from "@/lib/admin/cms/types";

/** Per-path meta + JSON-LD overrides, and a redirect manager. */
export default function Seo() {
  const [tab, setTab] = useState<"entries" | "redirects">("entries");

  return (
    <>
      <PageHead
        title="SEO"
        sub="Per-path meta + JSON-LD overrides and a redirect manager. Pages without an override fall back to the site's native metadata. sitemap.xml and robots.txt are served by the web app."
      />

      <div className="mb-5 flex gap-1 border-b border-[#d8c3a5]/50">
        {(["entries", "redirects"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`relative cursor-pointer px-3 py-2 font-sans-luxury text-[12px] font-bold uppercase tracking-[0.12em] transition-colors ${
              tab === t ? "text-[#741a14]" : "text-[#a2988b] hover:text-[#741a14]"
            }`}
          >
            {t}
            {tab === t ? (
              <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-[#741a14]" />
            ) : null}
          </button>
        ))}
      </div>

      {tab === "entries" ? <Entries /> : <Redirects />}
    </>
  );
}

/* ————— entries ————— */

const ENTRY_DEFAULTS: Omit<SeoEntry, "id" | "createdAt" | "updatedAt"> = {
  path: "",
  title: "",
  description: "",
  canonical: "",
  twitterCard: "summary_large_image",
  ogImage: "",
  ogTitle: "",
  ogDescription: "",
  jsonLd: "",
  noindex: false,
};

function Entries() {
  const { data, loading, error, create, update, remove } = useCollection<SeoEntry>("seo");
  const [editing, setEditing] = useState<SeoEntry | "new" | null>(null);
  const [confirming, setConfirming] = useState<SeoEntry | null>(null);
  const { show, node: toast } = useToast();

  if (loading) return <Spinner />;
  if (error) return <p className="font-sans-luxury text-[13px] text-[#a3231b]">{error}</p>;

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Btn variant="primary" onClick={() => setEditing("new")}>
          <Plus size={13} /> New entry
        </Btn>
      </div>

      <Table
        head={["Path", "Title", "Indexed", "Actions"]}
        empty="No SEO overrides yet. Pages fall back to their native metadata."
      >
        {(data ?? []).map((e) => (
          <Tr key={e.id}>
            <Td className="font-mono text-[12px]">{e.path}</Td>
            <Td>{e.title || <span className="text-[#c3b8a8]">—</span>}</Td>
            <Td>
              <Badge tone={e.noindex ? "archived" : "live"}>{e.noindex ? "noindex" : "indexed"}</Badge>
            </Td>
            <Td className="whitespace-nowrap text-right">
              <div className="flex items-center justify-end gap-1.5">
                <button
                  aria-label="Edit"
                  onClick={() => setEditing(e)}
                  className="cursor-pointer rounded-full p-1.5 text-[#8b8178] hover:bg-[#741a14]/10 hover:text-[#741a14]"
                >
                  <Pencil size={14} />
                </button>
                <button
                  aria-label="Delete"
                  onClick={() => setConfirming(e)}
                  className="cursor-pointer rounded-full p-1.5 text-[#8b8178] hover:bg-[#a3231b]/10 hover:text-[#a3231b]"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </Td>
          </Tr>
        ))}
      </Table>

      {editing ? (
        <EntryForm
          row={editing === "new" ? null : editing}
          onCancel={() => setEditing(null)}
          onSave={async (values) => {
            // Throws on failure: the form shows it and stays open.
            if (editing === "new") await create(values);
            else await update(editing.id, values);
            show("Saved");
            setEditing(null);
          }}
        />
      ) : null}

      {confirming ? (
        <Confirm
          title="Delete this override?"
          body={`${confirming.path} will fall back to the site's native metadata.`}
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

function EntryForm({
  row,
  onCancel,
  onSave,
}: {
  row: SeoEntry | null;
  onCancel: () => void;
  onSave: (v: Partial<SeoEntry>) => Promise<void>;
}) {
  const [v, setV] = useState({ ...ENTRY_DEFAULTS, ...(row ?? {}) });
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV({ ...v, [k]: val });

  return (
    <Modal title={row ? "Edit SEO entry" : "New SEO entry"} onClose={onCancel} wide>
      <div className="grid max-h-[64vh] grid-cols-1 gap-4 overflow-y-auto pr-1 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Path" required hint="e.g. / or /work/aroha">
            <Input value={v.path} onChange={(e) => set("path", e.target.value)} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Title">
            <Input value={v.title} onChange={(e) => set("title", e.target.value)} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Description" hint="~155 chars ideal.">
            <Textarea rows={2} value={v.description} onChange={(e) => set("description", e.target.value)} />
          </Field>
        </div>
        <Field label="Canonical URL">
          <Input value={v.canonical} onChange={(e) => set("canonical", e.target.value)} />
        </Field>
        <Field label="Twitter card">
          <Select
            value={v.twitterCard}
            onChange={(e) => set("twitterCard", e.target.value as SeoEntry["twitterCard"])}
            options={[
              { value: "summary_large_image", label: "summary_large_image" },
              { value: "summary", label: "summary" },
            ]}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="OG image URL">
            <Input value={v.ogImage} onChange={(e) => set("ogImage", e.target.value)} />
          </Field>
        </div>
        <Field label="OG title">
          <Input value={v.ogTitle} onChange={(e) => set("ogTitle", e.target.value)} />
        </Field>
        <Field label="OG description">
          <Input value={v.ogDescription} onChange={(e) => set("ogDescription", e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="JSON-LD (raw JSON object)">
            <textarea
              value={v.jsonLd}
              onChange={(e) => set("jsonLd", e.target.value)}
              spellCheck={false}
              rows={7}
              className="w-full resize-y rounded-[8px] border border-[#d8c3a5]/70 bg-white/70 px-3.5 py-3 font-mono text-[12px] leading-[1.6] text-[#11100e] outline-none focus:border-[#741a14]"
            />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Check label="noindex, nofollow" checked={v.noindex} onChange={(b) => set("noindex", b)} />
        </div>
      </div>

      {problem ? (
        <p role="alert" className="mt-3 font-sans-luxury text-[12.5px] text-[#a3231b]">
          {problem}
        </p>
      ) : null}

      <div className="mt-5 flex justify-end gap-2 border-t border-[#d8c3a5]/45 pt-4">
        <Btn onClick={onCancel}>Cancel</Btn>
        <Btn
          variant="primary"
          disabled={saving}
          onClick={async () => {
            if (!v.path.trim()) return setProblem("Path is required.");
            if (!v.path.startsWith("/")) return setProblem("Path must start with a slash.");
            // Invalid JSON-LD would be emitted into a <script> tag on the
            // public page, so it is rejected here rather than at render time.
            if (v.jsonLd.trim()) {
              try {
                JSON.parse(v.jsonLd);
              } catch (e) {
                return setProblem(`JSON-LD is not valid JSON — ${(e as Error).message}`);
              }
            }
            setProblem(null);
            setSaving(true);
            try {
              await onSave(v);
            } catch (e) {
              setProblem(e instanceof Error ? e.message : "Could not save.");
            }
            setSaving(false);
          }}
        >
          {saving ? "Saving…" : "Save"}
        </Btn>
      </div>
    </Modal>
  );
}

/* ————— redirects ————— */

function Redirects() {
  const { data, loading, error, create, remove } = useCollection<Redirect>("redirects");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [code, setCode] = useState("301");
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirming, setConfirming] = useState<Redirect | null>(null);
  const { show, node: toast } = useToast();

  if (loading) return <Spinner />;
  if (error) return <p className="font-sans-luxury text-[13px] text-[#a3231b]">{error}</p>;

  const add = async () => {
    if (!from.trim() || !to.trim()) return setProblem("Both paths are required.");
    if (!from.startsWith("/")) return setProblem("From must be a root-relative path.");
    if (/^\/(api|_next|admin)(\/|$)/i.test(from.trim()))
      return setProblem("Redirects can't start at /api, /_next or /admin.");
    if (!to.startsWith("/") && !/^https?:\/\//.test(to))
      return setProblem("Redirect target must be a root-relative path or an http(s) URL.");
    if (from.trim() === to.trim()) return setProblem("A redirect cannot point at itself.");
    setProblem(null);
    setAdding(true);
    try {
      await create({ from: from.trim(), to: to.trim(), code: Number(code) as Redirect["code"], note });
      setFrom("");
      setTo("");
      setNote("");
      show("Redirect added");
    } catch (e) {
      // e.g. the server refusing a duplicate or a loop
      setProblem(e instanceof Error ? e.message : "Could not add the redirect.");
    }
    setAdding(false);
  };

  return (
    <>
      <div className="mb-4 rounded-[12px] border border-[#d8c3a5]/45 bg-[#fff8ed] p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Field label="From (path)" required>
            <Input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="/old-work" />
          </Field>
          <Field label="To (path or absolute URL)" required>
            <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="/work" />
          </Field>
          <Field label="Code">
            <Select
              value={code}
              onChange={(e) => setCode(e.target.value)}
              options={[
                { value: "301", label: "301 — permanent" },
                { value: "302", label: "302 — temporary" },
                { value: "307", label: "307 — temporary (preserve method)" },
                { value: "308", label: "308 — permanent (preserve method)" },
              ]}
            />
          </Field>
          <Field label="Note">
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
        {problem ? (
          <p role="alert" className="mt-2 font-sans-luxury text-[12.5px] text-[#a3231b]">
            {problem}
          </p>
        ) : null}
        <div className="mt-3 flex justify-end">
          <Btn variant="primary" onClick={add} disabled={adding}>
            <Plus size={12} /> {adding ? "Adding…" : "Add redirect"}
          </Btn>
        </div>
      </div>

      <Table head={["From", "To", "Code", "Note", "Actions"]} empty="No redirects yet.">
        {(data ?? []).map((r) => (
          <Tr key={r.id}>
            <Td className="font-mono text-[12px]">{r.from}</Td>
            <Td className="font-mono text-[12px]">{r.to}</Td>
            <Td>
              <Badge>{String(r.code)}</Badge>
            </Td>
            <Td className="text-[#8b8178]">{r.note || "—"}</Td>
            <Td className="text-right">
              <button
                aria-label="Delete redirect"
                onClick={() => setConfirming(r)}
                className="cursor-pointer rounded-full p-1.5 text-[#8b8178] hover:bg-[#a3231b]/10 hover:text-[#a3231b]"
              >
                <Trash2 size={14} />
              </button>
            </Td>
          </Tr>
        ))}
      </Table>

      {confirming ? (
        <Confirm
          title="Delete this redirect?"
          body={`${confirming.from} → ${confirming.to} will stop redirecting.`}
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
