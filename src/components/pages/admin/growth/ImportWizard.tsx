"use client";

import { useRef, useState } from "react";
import { FileUp } from "lucide-react";

import { StatCard } from "../AdminShell";
import { Btn, Field, Input, Modal, Select, Table, Td, Textarea, Tr } from "../cms/ui";
import { useAction, useApi } from "./api";
import { Chips } from "./shared";
import { LEAD_IMPORT_FIELDS, type ImportMapping, type ImportPreview, type ImportResult } from "./types";

/**
 * CSV → leads in three screens: paste or pick a file, confirm how columns map
 * onto lead fields (the server guesses from the headers), choose what to do
 * with duplicates, then read the result — including every row that was
 * rejected and why, so nothing is dropped silently.
 */

type Step = "source" | "mapping" | "result";

const FIELD_LABEL: Record<string, string> = {
  firstName: "First name",
  lastName: "Last name",
  email: "Email",
  phone: "Phone",
  company: "Company",
  role: "Role",
  website: "Website",
  industry: "Industry",
  city: "City",
  segment: "Segment",
  tags: "Tags",
  source: "Source",
  owner: "Owner",
};

const CUSTOM = "__custom";

const MAP_OPTIONS = [
  { value: "ignore", label: "— ignore —" },
  ...LEAD_IMPORT_FIELDS.map((f) => ({ value: f, label: FIELD_LABEL[f] ?? f })),
  { value: CUSTOM, label: "Custom field…" },
];

export default function ImportWizard({
  onClose,
  onDone,
  show,
}: {
  onClose: () => void;
  onDone: () => void;
  show: (text: string, bad?: boolean) => void;
}) {
  const api = useApi();
  const { busy, run } = useAction(show);
  const fileInput = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("source");
  const [text, setText] = useState("");
  const [filename, setFilename] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<ImportMapping>({});
  const [dedupe, setDedupe] = useState<"skip" | "update">("skip");
  const [tags, setTags] = useState("");
  const [source, setSource] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);

  const readFile = (f: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setText(typeof reader.result === "string" ? reader.result : "");
      setFilename(f.name);
      if (!source) setSource(f.name.replace(/\.csv$/i, ""));
    };
    reader.onerror = () => show("Could not read that file.", true);
    reader.readAsText(f);
  };

  const doPreview = () =>
    run("preview", async () => {
      const p = await api.uploadCsv<ImportPreview>("/leads/import/preview", text);
      setPreview(p);
      setMapping(p.mapping ?? {});
      setStep("mapping");
    });

  const doImport = () =>
    run("import", async () => {
      const r = await api.uploadCsv<ImportResult>("/leads/import", text, {
        mapping: JSON.stringify(mapping),
        dedupe,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        source: source.trim() || undefined,
      });
      setResult(r);
      setStep("result");
    });

  const mapped = Object.values(mapping).filter((v) => v && v !== "ignore");
  const hasContact = mapped.includes("email") || mapped.includes("phone");

  return (
    <Modal title="Import leads from CSV" onClose={step === "result" ? onDone : onClose} wide>
      <div className="mb-5">
        <Chips<Step>
          value={step}
          onChange={(s) => {
            // only backwards, and never out of the result
            if (step === "result") return;
            if (s === "source") setStep("source");
            if (s === "mapping" && preview) setStep("mapping");
          }}
          options={[
            { value: "source", label: "1 · File" },
            { value: "mapping", label: "2 · Columns & duplicates" },
            { value: "result", label: "3 · Result" },
          ]}
          ariaLabel="Import steps"
        />
      </div>

      {step === "source" ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInput}
              type="file"
              hidden
              accept=".csv,text/csv,text/plain"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) readFile(f);
                e.target.value = "";
              }}
            />
            <Btn onClick={() => fileInput.current?.click()}>
              <FileUp size={12} /> Choose CSV file
            </Btn>
            <span className="font-sans-luxury text-[12px] text-[#8b8178]">
              {filename ? `${filename} · ${(text.length / 1024).toFixed(0)} KB` : "or paste the CSV below · up to 10 MB"}
            </span>
          </div>
          <div className="mt-3">
            <Field hint="First row must be the header. Each row needs an email or a phone number.">
              <Textarea
                rows={10}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setFilename("");
                }}
                placeholder={"first_name,last_name,email,company\nPriya,Sharma,priya@example.com,Acme"}
                className="font-mono text-[12px]"
                spellCheck={false}
              />
            </Field>
          </div>
          <div className="mt-5 flex justify-end gap-2 border-t border-[#d8c3a5]/45 pt-4">
            <Btn onClick={onClose}>Cancel</Btn>
            <Btn variant="primary" onClick={doPreview} disabled={!text.trim() || busy === "preview"}>
              {busy === "preview" ? "Reading…" : "Preview →"}
            </Btn>
          </div>
        </>
      ) : null}

      {step === "mapping" && preview ? (
        <>
          <p className="mb-3 font-sans-luxury text-[12.5px] text-[#4a443d]">
            <strong>{preview.rows}</strong> data row{preview.rows === 1 ? "" : "s"} ·{" "}
            <strong>{preview.columns.length}</strong> columns. Check the guessed mapping; anything mapped to a
            custom field is available to templates as{" "}
            <code className="rounded bg-[#f3e8d5] px-1">{"{{custom_<name>}}"}</code>.
          </p>

          <Table head={["CSV column", "Sample values", "Maps to"]}>
            {preview.columns.map((col, ci) => {
              const cur = mapping[col] ?? "ignore";
              const isCustom = cur.startsWith("custom:");
              const selectValue = isCustom ? CUSTOM : cur;
              return (
                <Tr key={col}>
                  <Td className="font-medium">{col}</Td>
                  <Td className="text-[#8b8178]">
                    <span className="line-clamp-2 max-w-[320px]">
                      {preview.sample
                        .map((r) => r[ci])
                        .filter((v) => v !== undefined && v !== "")
                        .slice(0, 3)
                        .join(" · ") || <span className="text-[#c3b8a8]">empty</span>}
                    </span>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <div className="w-[190px]">
                        <Select
                          aria-label={`Map ${col}`}
                          value={selectValue}
                          onChange={(e) => {
                            const v = e.target.value;
                            setMapping((m) => ({
                              ...m,
                              [col]: v === CUSTOM ? `custom:${col.toLowerCase().replace(/[^a-z0-9]+/g, "_")}` : v,
                            }));
                          }}
                          options={MAP_OPTIONS}
                        />
                      </div>
                      {isCustom ? (
                        <div className="w-[150px]">
                          <Input
                            aria-label={`Custom field name for ${col}`}
                            value={cur.slice("custom:".length)}
                            onChange={(e) => setMapping((m) => ({ ...m, [col]: `custom:${e.target.value}` }))}
                            placeholder="field name"
                          />
                        </div>
                      ) : null}
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </Table>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field
              label="Duplicates"
              hint={
                dedupe === "skip"
                  ? "Existing leads (same email, then phone) are left untouched."
                  : "Existing leads get their EMPTY fields filled; edited data is never overwritten."
              }
            >
              <Select
                value={dedupe}
                onChange={(e) => setDedupe(e.target.value as "skip" | "update")}
                options={[
                  { value: "skip", label: "Skip existing leads" },
                  { value: "update", label: "Fill empty fields on existing leads" },
                ]}
              />
            </Field>
            <Field label="Tag every imported lead" hint="comma-separated">
              <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="expo-2026, delhi" />
            </Field>
            <Field label="Source" hint="recorded on each lead">
              <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. Hotel expo list" />
            </Field>
          </div>

          {!hasContact ? (
            <p role="alert" className="mt-3 font-sans-luxury text-[12.5px] text-[#a3231b]">
              Map at least one column to Email or Phone — every row needs one of them.
            </p>
          ) : null}

          <div className="mt-5 flex justify-end gap-2 border-t border-[#d8c3a5]/45 pt-4">
            <Btn onClick={() => setStep("source")}>← Back</Btn>
            <Btn variant="primary" onClick={doImport} disabled={!hasContact || busy === "import"}>
              {busy === "import" ? "Importing…" : `Import ${preview.rows} row${preview.rows === 1 ? "" : "s"}`}
            </Btn>
          </div>
        </>
      ) : null}

      {step === "result" && result ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Imported" value={result.imported} tone="maroon" />
            <StatCard label="Updated" value={result.updated} />
            <StatCard label="Skipped" value={result.skipped} hint="already present" />
            <StatCard label="Invalid" value={result.invalid.length} hint="rows not imported" />
          </div>
          <p className="mt-3 font-sans-luxury text-[11.5px] text-[#8b8178]">
            Batch <code className="rounded bg-[#f3e8d5] px-1">{result.batchId}</code> — every lead it touched
            carries this id and an import activity.
          </p>

          {result.invalid.length ? (
            <div className="mt-4">
              <Table head={["Row", "Why it was rejected"]}>
                {result.invalid.map((r) => (
                  <Tr key={r.row}>
                    <Td className="w-[80px] text-[#8b8178]">#{r.row}</Td>
                    <Td>{r.reason}</Td>
                  </Tr>
                ))}
              </Table>
            </div>
          ) : null}

          <div className="mt-5 flex justify-end gap-2 border-t border-[#d8c3a5]/45 pt-4">
            <Btn variant="primary" onClick={onDone}>
              Done
            </Btn>
          </div>
        </>
      ) : null}
    </Modal>
  );
}
