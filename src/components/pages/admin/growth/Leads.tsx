"use client";

import { useCallback, useMemo, useState } from "react";
import { Download, Plus, Upload } from "lucide-react";

import { EmptyState, relTime } from "../AdminShell";
import { Badge, Btn, Card, Check, Input, PageHead, Select, Spinner, Table, Td, Tr, useToast } from "../cms/ui";
import { useAction, useApi, useList } from "./api";
import ImportWizard from "./ImportWizard";
import LeadDrawer from "./LeadDrawer";
import SegmentsManager from "./Segments";
import { ErrorText, Muted, Pager, cap, fmtIst, fullName, growthTone, useDebounced } from "./shared";
import { EMPTY_FILTERS, filterParams, fromLeadFilter, toLeadFilter, type Filters } from "./leadFilter";
import { LEAD_STAGES, type BulkResult, type Lead, type LeadStage, type Segment } from "./types";

const splitCsv = (s: string) =>
  s
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

const LIMIT = 50;

const STAGE_OPTIONS = [
  { value: "", label: "All stages" },
  ...LEAD_STAGES.map((s) => ({ value: s, label: cap(s) })),
];

const SORTS = [
  { value: "updatedAt", label: "Recently updated" },
  { value: "createdAt", label: "Recently added" },
  { value: "company", label: "Company A–Z" },
];

export default function Leads() {
  const api = useApi();
  const { show, node: toast } = useToast();
  const { busy, run } = useAction(show);

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sort, setSort] = useState("updatedAt");
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const q = useDebounced(filters.q, 300);

  const leadFilter = useMemo(() => toLeadFilter({ ...filters, q }), [filters, q]);
  const params = useMemo(
    () => ({ ...filterParams(leadFilter), page, limit: LIMIT, sort }),
    [leadFilter, page, sort]
  );

  const list = useList<Lead>("/leads", params);
  const segments = useList<Segment>("/segments");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | "new" | null>(null);
  const [importing, setImporting] = useState(false);
  const [managing, setManaging] = useState(false);

  const setFilter = useCallback(<K extends keyof Filters>(k: K, v: Filters[K]) => {
    setFilters((f) => ({ ...f, [k]: v }));
    setPage(1);
  }, []);

  const applySegment = (s: Segment | null) => {
    setFilters(s ? fromLeadFilter(s.filter) : EMPTY_FILTERS);
    setPage(1);
  };

  const pageIds = list.items.map((l) => l.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPage) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const bulk = async (
    body: { set?: { stage?: LeadStage; owner?: string }; addTags?: string[]; removeTags?: string[] },
    label: string
  ) => {
    const ok = await run("bulk", async () => {
      const res = await api.request<BulkResult>("POST", "/leads/bulk", { ids: [...selected], ...body });
      show(`${label} on ${res.updated} lead${res.updated === 1 ? "" : "s"}`);
      await list.reload();
    });
    if (ok) setSelected(new Set());
  };

  const exportCsv = () =>
    run(
      "export",
      () =>
        api.download(
          "/leads.csv",
          `maple-leads-${new Date().toISOString().slice(0, 10)}.csv`,
          filterParams(leadFilter)
        ),
      "Export started"
    );

  const stageValue = filters.stage.length === 1 ? filters.stage[0] : filters.stage.length ? "__several" : "";
  const stageOptions =
    filters.stage.length > 1
      ? [{ value: "__several", label: `${filters.stage.length} stages (from segment)` }, ...STAGE_OPTIONS]
      : STAGE_OPTIONS;

  const activeFilters = Object.keys(leadFilter).length;

  return (
    <>
      <PageHead
        title="Leads"
        sub="Everyone you might sell to — imported, filtered into segments, and fed to campaigns and outreach."
        action={
          <>
            <Btn onClick={exportCsv} disabled={busy === "export" || list.items.length === 0}>
              <Download size={12} /> Export CSV
            </Btn>
            <Btn onClick={() => setImporting(true)}>
              <Upload size={12} /> Import CSV
            </Btn>
            <Btn variant="primary" onClick={() => setOpen("new")}>
              <Plus size={13} /> New lead
            </Btn>
          </>
        }
      />

      {/* ——— filter bar ——— */}
      <Card className="mb-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">
          <Input
            value={filters.q}
            onChange={(e) => setFilter("q", e.target.value)}
            placeholder="Search name, company, email…"
            aria-label="Search leads"
          />
          <Select
            aria-label="Stage"
            value={stageValue}
            onChange={(e) => setFilter("stage", e.target.value && e.target.value !== "__several" ? [e.target.value as LeadStage] : [])}
            options={stageOptions}
          />
          <Input
            value={filters.tags}
            onChange={(e) => setFilter("tags", e.target.value)}
            placeholder="Tags (any of, comma-separated)"
            aria-label="Tags"
          />
          <Input
            value={filters.owner}
            onChange={(e) => setFilter("owner", e.target.value)}
            placeholder="Owner"
            aria-label="Owner"
          />
          <Select
            aria-label="Saved segment"
            value=""
            onChange={(e) => {
              const s = segments.items.find((x) => x.id === e.target.value) ?? null;
              if (s) applySegment(s);
            }}
            options={[
              { value: "", label: segments.items.length ? "Apply a segment…" : "No segments saved" },
              ...segments.items.map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
          <button
            type="button"
            onClick={() => setMore((v) => !v)}
            className="cursor-pointer font-sans-luxury text-[11px] font-bold uppercase tracking-[0.12em] text-[#741a14] hover:underline"
          >
            {more ? "Fewer filters" : "More filters"}
          </button>
          <button
            type="button"
            onClick={() => setManaging(true)}
            className="cursor-pointer font-sans-luxury text-[11px] font-bold uppercase tracking-[0.12em] text-[#741a14] hover:underline"
          >
            Segments ({segments.items.length})
          </button>
          {activeFilters ? (
            <button
              type="button"
              onClick={() => applySegment(null)}
              className="cursor-pointer font-sans-luxury text-[11px] font-bold uppercase tracking-[0.12em] text-[#8b8178] hover:text-[#741a14]"
            >
              Clear filters
            </button>
          ) : null}
          <span className="ml-auto">
            <Muted>
              {list.meta ? `${list.meta.total} lead${list.meta.total === 1 ? "" : "s"}` : ""}
            </Muted>
          </span>
          <div className="w-[180px]">
            <Select
              aria-label="Sort"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
              options={SORTS}
            />
          </div>
        </div>

        {more ? (
          <div className="mt-3 grid grid-cols-1 gap-3 border-t border-[#d8c3a5]/45 pt-3 sm:grid-cols-2 lg:grid-cols-4">
            <Input
              value={filters.industry}
              onChange={(e) => setFilter("industry", e.target.value)}
              placeholder="Industry"
              aria-label="Industry"
            />
            <Input
              value={filters.city}
              onChange={(e) => setFilter("city", e.target.value)}
              placeholder="City"
              aria-label="City"
            />
            <Check label="Has email" checked={filters.hasEmail} onChange={(v) => setFilter("hasEmail", v)} />
            <Check label="Has phone" checked={filters.hasPhone} onChange={(v) => setFilter("hasPhone", v)} />
          </div>
        ) : null}
      </Card>

      {/* ——— bulk bar ——— */}
      {selected.size > 0 ? (
        <BulkBar
          count={selected.size}
          busy={busy === "bulk"}
          onClear={() => setSelected(new Set())}
          onStage={(stage) => bulk({ set: { stage } }, "Stage set")}
          onOwner={(owner) => bulk({ set: { owner } }, "Owner set")}
          onAddTags={(tags) => bulk({ addTags: tags }, "Tags added")}
          onRemoveTags={(tags) => bulk({ removeTags: tags }, "Tags removed")}
        />
      ) : null}

      <ErrorText>{list.error}</ErrorText>

      {list.loading ? (
        <Spinner />
      ) : list.items.length === 0 ? (
        <EmptyState>
          {activeFilters
            ? "No leads match these filters."
            : "No leads yet — import a CSV or add the first one by hand."}
        </EmptyState>
      ) : (
        <>
          <Table
            head={["", "Name", "Company", "Email / phone", "Stage", "Owner", "Last contacted"]}
            empty="No leads match."
          >
            {list.items.map((l) => (
              <Tr key={l.id}>
                <Td className="w-[36px]">
                  <input
                    type="checkbox"
                    checked={selected.has(l.id)}
                    onChange={() => toggle(l.id)}
                    aria-label={`Select ${fullName(l) || l.email || l.id}`}
                    className="h-[15px] w-[15px] cursor-pointer accent-[#741a14]"
                  />
                </Td>
                <Td>
                  <button
                    onClick={() => setOpen(l.id)}
                    className="cursor-pointer text-left font-medium text-[#11100e] hover:text-[#741a14]"
                  >
                    {fullName(l) || <span className="text-[#a2988b]">(no name)</span>}
                  </button>
                  {l.role ? <span className="block text-[11px] text-[#8b8178]">{l.role}</span> : null}
                  {l.tags.length ? (
                    <span className="mt-0.5 block truncate text-[10.5px] text-[#a2988b]" title={l.tags.join(", ")}>
                      {l.tags.join(" · ")}
                    </span>
                  ) : null}
                </Td>
                <Td>{l.company || <span className="text-[#c3b8a8]">—</span>}</Td>
                <Td>
                  <span className="block truncate">{l.email || <span className="text-[#c3b8a8]">—</span>}</span>
                  {l.phone ? <span className="block text-[11px] text-[#8b8178]">{l.phone}</span> : null}
                  {l.suppressed ? (
                    <span className="mt-0.5 inline-block">
                      <Badge tone="archived">Suppressed</Badge>
                    </span>
                  ) : null}
                </Td>
                <Td>
                  <Badge tone={growthTone(l.stage)}>{cap(l.stage)}</Badge>
                </Td>
                <Td>{l.owner || <span className="text-[#c3b8a8]">—</span>}</Td>
                <Td className="whitespace-nowrap text-[#8b8178]">
                  {l.lastContactedAt ? (
                    <span title={fmtIst(l.lastContactedAt)}>{relTime(l.lastContactedAt)}</span>
                  ) : (
                    <span className="text-[#c3b8a8]">never</span>
                  )}
                </Td>
              </Tr>
            ))}
          </Table>
          <div className="mt-2 flex items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 font-sans-luxury text-[11.5px] text-[#8b8178]">
              <input
                type="checkbox"
                checked={allOnPage}
                onChange={toggleAll}
                className="h-[14px] w-[14px] cursor-pointer accent-[#741a14]"
              />
              Select all on this page
            </label>
          </div>
          <Pager meta={list.meta} page={page} onPage={setPage} />
        </>
      )}

      {open ? (
        <LeadDrawer
          leadId={open}
          onClose={() => setOpen(null)}
          onChanged={() => void list.reload()}
          show={show}
        />
      ) : null}

      {importing ? (
        <ImportWizard
          onClose={() => setImporting(false)}
          onDone={() => {
            setImporting(false);
            void list.reload();
            void segments.reload();
          }}
          show={show}
        />
      ) : null}

      {managing ? (
        <SegmentsManager
          segments={segments.items}
          current={leadFilter}
          onApply={(s) => {
            applySegment(s);
            setManaging(false);
          }}
          onChanged={() => void segments.reload()}
          onClose={() => setManaging(false)}
          show={show}
        />
      ) : null}

      {toast}
    </>
  );
}

/* ————— bulk bar ————— */

function BulkBar({
  count,
  busy,
  onClear,
  onStage,
  onOwner,
  onAddTags,
  onRemoveTags,
}: {
  count: number;
  busy: boolean;
  onClear: () => void;
  onStage: (s: LeadStage) => void;
  onOwner: (owner: string) => void;
  onAddTags: (tags: string[]) => void;
  onRemoveTags: (tags: string[]) => void;
}) {
  const [stage, setStage] = useState<string>("");
  const [owner, setOwner] = useState("");
  const [add, setAdd] = useState("");
  const [remove, setRemove] = useState("");

  return (
    <div className="mb-4 rounded-[12px] border-2 border-[#741a14] bg-[#fff8ed] px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-[#741a14] px-3 py-1 font-sans-luxury text-[11px] font-bold uppercase tracking-[0.16em] text-[#fff8ed]">
          {count} selected
        </span>

        <div className="flex items-center gap-1.5">
          <div className="w-[150px]">
            <Select
              aria-label="Set stage"
              value={stage}
              onChange={(e) => setStage(e.target.value)}
              options={[{ value: "", label: "Set stage…" }, ...LEAD_STAGES.map((s) => ({ value: s, label: cap(s) }))]}
            />
          </div>
          <Btn disabled={!stage || busy} onClick={() => onStage(stage as LeadStage)}>
            Apply
          </Btn>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="w-[130px]">
            <Input aria-label="Set owner" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Owner" />
          </div>
          <Btn disabled={!owner.trim() || busy} onClick={() => onOwner(owner.trim())}>
            Set
          </Btn>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="w-[200px]">
            <Input
              aria-label="Add tags"
              value={add}
              onChange={(e) => setAdd(e.target.value)}
              placeholder="Add tags, comma-separated"
            />
          </div>
          <Btn
            disabled={!splitCsv(add).length || busy}
            onClick={() => {
              onAddTags(splitCsv(add));
              setAdd("");
            }}
          >
            Add
          </Btn>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="w-[160px]">
            <Input
              aria-label="Remove tags"
              value={remove}
              onChange={(e) => setRemove(e.target.value)}
              placeholder="Remove tags"
            />
          </div>
          <Btn
            disabled={!splitCsv(remove).length || busy}
            onClick={() => {
              onRemoveTags(splitCsv(remove));
              setRemove("");
            }}
          >
            Remove
          </Btn>
        </div>

        <button
          onClick={onClear}
          className="ml-auto cursor-pointer font-sans-luxury text-[11px] font-bold uppercase tracking-[0.12em] text-[#8b8178] hover:text-[#741a14]"
        >
          Clear selection
        </button>
      </div>
    </div>
  );
}
