import type { LeadFilter, LeadStage } from "./types";

/** What the filter bar holds. Converted to the contract's LeadFilter for the
    query string and for saving as a Segment. */
export type Filters = {
  stage: LeadStage[];
  tags: string;
  q: string;
  owner: string;
  industry: string;
  city: string;
  hasEmail: boolean;
  hasPhone: boolean;
};

export const EMPTY_FILTERS: Filters = {
  stage: [],
  tags: "",
  q: "",
  owner: "",
  industry: "",
  city: "",
  hasEmail: false,
  hasPhone: false,
};

const splitCsv = (s: string) =>
  s
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

export function toLeadFilter(f: Filters): LeadFilter {
  const out: LeadFilter = {};
  if (f.stage.length) out.stage = f.stage;
  const tags = splitCsv(f.tags);
  if (tags.length) out.tags = tags;
  if (f.q.trim()) out.q = f.q.trim();
  if (f.owner.trim()) out.owner = f.owner.trim();
  if (f.industry.trim()) out.industry = f.industry.trim();
  if (f.city.trim()) out.city = f.city.trim();
  if (f.hasEmail) out.hasEmail = true;
  if (f.hasPhone) out.hasPhone = true;
  return out;
}

export function fromLeadFilter(lf: LeadFilter): Filters {
  return {
    stage: lf.stage ?? [],
    tags: (lf.tags ?? []).join(", "),
    q: lf.q ?? "",
    owner: lf.owner ?? "",
    industry: lf.industry ?? "",
    city: lf.city ?? "",
    hasEmail: Boolean(lf.hasEmail),
    hasPhone: Boolean(lf.hasPhone),
  };
}

/** LeadFilter → query params (`stage`/`tags` comma-joined by `qs`). */
export function filterParams(lf: LeadFilter) {
  return {
    stage: lf.stage,
    tags: lf.tags,
    q: lf.q,
    owner: lf.owner,
    industry: lf.industry,
    city: lf.city,
    segment: lf.segment,
    hasEmail: lf.hasEmail ? true : undefined,
    hasPhone: lf.hasPhone ? true : undefined,
  };
}
