"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";

import { Btn, Confirm, Field, Input, Modal } from "../cms/ui";
import { useAction, useApi } from "./api";
import { Muted, cap } from "./shared";
import type { LeadFilter, Segment } from "./types";

/** Saved filters. Saving the current filter and applying/deleting existing
    ones; each row shows how many leads it matches right now. */
export default function SegmentsManager({
  segments,
  current,
  onApply,
  onChanged,
  onClose,
  show,
}: {
  segments: Segment[];
  current: LeadFilter;
  onApply: (s: Segment) => void;
  onChanged: () => void;
  onClose: () => void;
  show: (text: string, bad?: boolean) => void;
}) {
  const api = useApi();
  const { busy, run } = useAction(show);
  const [name, setName] = useState("");
  const [counts, setCounts] = useState<Record<string, number | null>>({});
  const [confirming, setConfirming] = useState<Segment | null>(null);

  const ids = segments.map((s) => s.id).join(",");
  useEffect(() => {
    let alive = true;
    for (const id of ids.split(",").filter(Boolean)) {
      void api
        .request<{ count: number }>("GET", `/segments/${id}/count`)
        .then((r) => alive && setCounts((c) => ({ ...c, [id]: r.count })))
        .catch(() => alive && setCounts((c) => ({ ...c, [id]: null })));
    }
    return () => {
      alive = false;
    };
  }, [api, ids]);

  const currentEmpty = Object.keys(current).length === 0;

  return (
    <Modal title="Segments" onClose={onClose}>
      <div className="rounded-[10px] border border-[#d8c3a5]/60 bg-[#f3e8d5]/50 p-4">
        <p className="mb-2 font-sans-luxury text-[10px] font-bold uppercase tracking-[0.18em] text-[#8b8178]">
          Save the current filter
        </p>
        <p className="mb-3 font-sans-luxury text-[12px] text-[#4a443d]">
          {currentEmpty ? "No filter is active — set one on the Leads screen first." : describe(current)}
        </p>
        <div className="flex gap-2">
          <Field className="flex-1">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Segment name"
              disabled={currentEmpty}
            />
          </Field>
          <Btn
            variant="primary"
            disabled={currentEmpty || !name.trim() || busy === "save"}
            onClick={() =>
              run(
                "save",
                async () => {
                  await api.request("POST", "/segments", { name: name.trim(), filter: current });
                  setName("");
                  onChanged();
                },
                "Segment saved"
              )
            }
          >
            {busy === "save" ? "Saving…" : "Save"}
          </Btn>
        </div>
      </div>

      <ul className="mt-4 divide-y divide-[#d8c3a5]/40">
        {segments.length === 0 ? (
          <li className="py-8 text-center font-sans-luxury text-[13px] text-[#a2988b]">No segments saved yet.</li>
        ) : (
          segments.map((s) => (
            <li key={s.id} className="flex items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-sans-luxury text-[13.5px] font-medium text-[#11100e]">{s.name}</p>
                <p className="mt-0.5 font-sans-luxury text-[11.5px] text-[#8b8178]">{describe(s.filter)}</p>
              </div>
              <Muted className="whitespace-nowrap pt-1">
                {counts[s.id] === undefined ? "…" : counts[s.id] === null ? "?" : `${counts[s.id]} leads`}
              </Muted>
              <Btn onClick={() => onApply(s)}>Apply</Btn>
              <button
                aria-label={`Delete segment ${s.name}`}
                onClick={() => setConfirming(s)}
                className="cursor-pointer rounded-full p-1.5 text-[#8b8178] transition-colors hover:bg-[#a3231b]/10 hover:text-[#a3231b]"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))
        )}
      </ul>

      {confirming ? (
        <Confirm
          title="Delete this segment?"
          body={`"${confirming.name}" is a saved filter — the leads it matches are untouched. Campaigns that target it by id will need a new audience.`}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            const s = confirming;
            setConfirming(null);
            void run(
              "delete",
              async () => {
                await api.request("DELETE", `/segments/${s.id}`);
                onChanged();
              },
              "Segment deleted"
            );
          }}
        />
      ) : null}
    </Modal>
  );
}

/** Human summary of a LeadFilter: "stage: new, contacted · tags: expo · has email". */
export function describe(f: LeadFilter): string {
  const parts: string[] = [];
  if (f.q) parts.push(`search "${f.q}"`);
  if (f.stage?.length) parts.push(`stage ${f.stage.map(cap).join(", ")}`);
  if (f.tags?.length) parts.push(`tags ${f.tags.join(", ")}`);
  if (f.segment) parts.push(`segment ${f.segment}`);
  if (f.owner) parts.push(`owner ${f.owner}`);
  if (f.industry) parts.push(`industry ${f.industry}`);
  if (f.city) parts.push(`city ${f.city}`);
  if (f.hasEmail) parts.push("has email");
  if (f.hasPhone) parts.push("has phone");
  return parts.length ? parts.join(" · ") : "all leads";
}
