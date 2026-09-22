"use client";

import { useEffect, useState } from "react";
import { Eye, RotateCcw, Save } from "lucide-react";

import { useEndpoint, usePost } from "./useCms";
import {
  Badge,
  Btn,
  Card,
  Confirm,
  Field,
  Input,
  Modal,
  PageHead,
  SectionLabel,
  Spinner,
  relTime,
  useToast,
} from "./ui";
import type { SiteCopy as SiteCopyDoc } from "@/lib/admin/cms/types";

/**
 * Versioned editor for the public-site copy blob.
 *
 * Every save writes a NEW version and makes it live; restoring an old one also
 * writes a new version carrying the old payload. The history is therefore
 * append-only — you can always see that a restore happened and undo the
 * restore itself, which a "move the live pointer" design cannot offer.
 */
export default function SiteCopy() {
  const { data, loading, error, reload, setData } = useEndpoint<{ doc: SiteCopyDoc }>("/site-copy");
  const post = usePost();

  const [draft, setDraft] = useState("");
  const [summary, setSummary] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [viewing, setViewing] = useState<number | null>(null);
  const [restoring, setRestoring] = useState<number | null>(null);
  const { show, node: toast } = useToast();

  const doc = data?.doc ?? null;
  const liveVersion = doc?.versions.find((v) => v.v === doc.live) ?? doc?.versions[0] ?? null;

  useEffect(() => {
    if (liveVersion && !draft) setDraft(liveVersion.json);
  }, [liveVersion, draft]);

  if (loading) return <Spinner />;
  if (error || !doc)
    return <p className="font-sans-luxury text-[13px] text-[#a3231b]">{error ?? "No data."}</p>;

  const dirty = draft !== (liveVersion?.json ?? "");

  const save = async () => {
    try {
      JSON.parse(draft);
    } catch (e) {
      setProblem(`Not valid JSON — ${(e as Error).message}`);
      return;
    }
    setProblem(null);
    setSaving(true);
    try {
      const res = await post<{ doc: SiteCopyDoc }>("/site-copy", { json: draft, summary });
      setData(res);
      setSummary("");
      show(`Saved v${res.doc.live}`);
    } catch (e) {
      show(e instanceof Error ? e.message : "Could not save.", true);
    }
    setSaving(false);
  };

  return (
    <>
      <PageHead
        title="Site copy"
        sub="Authoritative source of every public-facing string on the marketing site."
        action={
          <>
            <Badge tone="accent">Live v{doc.live}</Badge>
            <Btn
              onClick={() => {
                setDraft(liveVersion?.json ?? "");
                setProblem(null);
              }}
              disabled={!dirty}
            >
              <RotateCcw size={12} /> Discard
            </Btn>
            <Btn variant="primary" onClick={save} disabled={saving || !dirty}>
              <Save size={12} /> {saving ? "Saving…" : "Save new version"}
            </Btn>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <Field label="Summary (optional)" hint="A short note like a git commit message — shows up in History.">
            <Input
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="e.g. tighten hero body line; swap MapleLens before/after labels"
            />
          </Field>

          <div className="mt-4">
            <SectionLabel>copy.json</SectionLabel>
            <textarea
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                if (problem) setProblem(null);
              }}
              spellCheck={false}
              rows={26}
              className="w-full resize-y rounded-[8px] border border-[#d8c3a5]/70 bg-white/70 px-3.5 py-3 font-mono text-[12px] leading-[1.6] text-[#11100e] outline-none focus:border-[#741a14]"
            />
            {problem ? (
              <p role="alert" className="mt-2 font-sans-luxury text-[12.5px] text-[#a3231b]">
                {problem}
              </p>
            ) : (
              <p className="mt-2 font-sans-luxury text-[11.5px] text-[#a2988b]">
                {dirty ? "Unsaved changes." : "Matches the live version."}
              </p>
            )}
          </div>
        </Card>

        <Card>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-serif-luxury text-[19px] leading-none text-[#11100e]">History</h2>
            <span className="font-sans-luxury text-[11px] text-[#a2988b]">{doc.versions.length}</span>
          </div>

          <ul className="max-h-[560px] space-y-2 overflow-y-auto pr-1">
            {doc.versions.map((v) => (
              <li
                key={v.v}
                className={`rounded-[9px] border px-3.5 py-3 ${
                  v.v === doc.live
                    ? "border-[#741a14]/35 bg-[#741a14]/6"
                    : "border-[#d8c3a5]/50 bg-white/40"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-sans-luxury text-[12px] font-bold text-[#11100e]">
                    v{v.v}
                    {v.v === doc.live ? (
                      <span className="ml-2 font-normal text-[#741a14]">live</span>
                    ) : null}
                  </span>
                  <span
                    className="font-sans-luxury text-[10.5px] text-[#a2988b]"
                    title={new Date(v.at).toLocaleString()}
                  >
                    {relTime(v.at)}
                  </span>
                </div>

                {v.restoredFrom ? (
                  <p className="mt-1">
                    <Badge tone="accent">Restored from v{v.restoredFrom}</Badge>
                  </p>
                ) : null}

                {v.summary ? (
                  <p className="mt-1.5 font-sans-luxury text-[12px] italic leading-[1.45] text-[#6b6259]">
                    “{v.summary}”
                  </p>
                ) : null}

                <div className="mt-2.5 flex gap-1.5">
                  <Btn onClick={() => setViewing(v.v)}>
                    <Eye size={11} /> View
                  </Btn>
                  {v.v === doc.live ? null : (
                    <Btn onClick={() => setRestoring(v.v)}>
                      <RotateCcw size={11} /> Restore
                    </Btn>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {viewing !== null ? (
        <Modal title={`Version ${viewing}`} onClose={() => setViewing(null)} wide>
          <pre className="max-h-[62vh] overflow-auto rounded-[8px] bg-[#11100e] p-4 font-mono text-[11.5px] leading-[1.6] text-[#e8ddcb]">
            {doc.versions.find((v) => v.v === viewing)?.json}
          </pre>
          <div className="mt-4 flex justify-end gap-2">
            <Btn onClick={() => setViewing(null)}>Close</Btn>
            <Btn
              variant="primary"
              onClick={() => {
                setDraft(doc.versions.find((v) => v.v === viewing)?.json ?? draft);
                setViewing(null);
                show("Loaded into the editor — save to make it live");
              }}
            >
              Load into editor
            </Btn>
          </div>
        </Modal>
      ) : null}

      {restoring !== null ? (
        <Confirm
          title={`Restore v${restoring}?`}
          body={`This writes a new version carrying v${restoring}'s copy and makes it live. Nothing is overwritten — the current version stays in the history.`}
          confirmLabel="Restore"
          onCancel={() => setRestoring(null)}
          onConfirm={async () => {
            try {
              const res = await post<{ doc: SiteCopyDoc }>("/site-copy/restore", { v: restoring });
              setData(res);
              setDraft(res.doc.versions.find((v) => v.v === res.doc.live)?.json ?? draft);
              show(`Restored as v${res.doc.live}`);
            } catch (e) {
              show(e instanceof Error ? e.message : "Could not restore.", true);
              void reload();
            }
            setRestoring(null);
          }}
        />
      ) : null}

      {toast}
    </>
  );
}
