"use client";
import { useEffect, useState } from "react";
import { Btn, Input, Select } from "../cms/ui";
import { api, List, Meta, message, Person } from "./api";
export function ErrorBox({ error }: { error: string }) {
  return error ? (
    <p
      role="alert"
      className="my-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900"
    >
      {error}
    </p>
  ) : null;
}
export function Pager({
  meta,
  page,
  setPage,
}: {
  meta?: Meta;
  page: number;
  setPage: (n: number) => void;
}) {
  return (
    <div className="my-4 flex items-center justify-between gap-3 text-sm">
      <span>
        {meta
          ? `${meta.total} records · Page ${page} of ${meta.pages}`
          : "Loading…"}
      </span>
      <div className="flex gap-2">
        <Btn disabled={page <= 1} onClick={() => setPage(page - 1)}>
          Previous
        </Btn>
        <Btn
          disabled={!meta || page >= meta.pages}
          onClick={() => setPage(page + 1)}
        >
          Next
        </Btn>
      </div>
    </div>
  );
}
export function useList<T>(path: string | undefined) {
  const [data, setData] = useState<List<T>>();
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    setData(undefined);
    setError("");
    api<List<T>>(path)
      .then((r) => {
        if (alive) setData(r);
      })
      .catch((e) => {
        if (alive) setError(message(e));
      });
    return () => {
      alive = false;
    };
  }, [path, tick]);
  return { data, error, reload: () => setTick((t) => t + 1) };
}
export function Filters({
  q,
  setQ,
  status,
  setStatus,
  options,
}: {
  q: string;
  setQ: (s: string) => void;
  status?: string;
  setStatus?: (s: string) => void;
  options?: { value: string; label: string }[];
}) {
  return (
    <div className="mb-4 flex flex-wrap gap-3">
      <Input
        aria-label="Search records"
        placeholder="Search…"
        maxLength={120}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="max-w-sm"
      />
      {setStatus && (
        <Select
          aria-label="Filter status"
          className="max-w-xs"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={[{ value: "", label: "All statuses" }, ...(options || [])]}
        />
      )}
    </div>
  );
}
export function TeamPicker({
  people,
  selected,
  onChange,
}: {
  people: Person[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <fieldset className="rounded-lg border border-[#d8c3a5] p-3">
      <legend className="px-1 text-sm">Project team</legend>
      <div className="flex flex-wrap gap-4">
        {people.map((p) => (
          <label key={p.id} className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={selected.includes(p.id)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...selected, p.id]
                    : selected.filter((id) => id !== p.id),
                )
              }
            />
            {p.name}
          </label>
        ))}
      </div>
      {!people.length && (
        <p className="text-sm">No active accounts available.</p>
      )}
    </fieldset>
  );
}
