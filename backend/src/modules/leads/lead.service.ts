import crypto from "node:crypto";
import type { FilterQuery, UpdateQuery } from "mongoose";
import { AppError } from "../../lib/AppError.js";
import { parseCsv } from "../../lib/csvParse.js";
import { normalisePhone } from "../../lib/phone.js";
import {
  Lead,
  type ActivityType,
  type ILead,
  type LeadActivity,
  type LeadDoc,
  type LeadStage,
} from "./lead.model.js";
import { Segment, type LeadFilter, type SegmentDoc } from "./segment.model.js";
import {
  LEAD_IMPORT_FIELDS,
  customKey,
  emailField,
  isLeadImportField,
  type BulkLeadsInput,
  type ColumnTarget,
  type CreateLeadInput,
  type ImportQuery,
  type LeadImportField,
  type ListLeadsQuery,
  type PatchLeadInput,
} from "./lead.schema.js";

export type { LeadFilter } from "./segment.model.js";

/* ---- helpers ---- */

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

function activity(type: ActivityType, summary: string, ref?: string): LeadActivity {
  return { at: new Date(), type, summary: clip(summary, 400), ...(ref ? { ref } : {}) };
}

const stageActivity = (from: LeadStage | null, to: LeadStage) =>
  activity("stage", from ? `Stage ${from} → ${to}` : `Stage set to ${to}`);

/**
 * Drop null/undefined before writing. An absent email or phone has to be
 * *missing*, not null: a sparse unique index still indexes null, so two
 * phone-only leads stored with `email: null` would collide.
 */
function compact<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== null && v !== undefined)
  ) as Partial<T>;
}

const unique = (xs: Array<string | undefined>) =>
  [...new Set(xs.filter((x): x is string => Boolean(x)))];

const leadGone = () => AppError.notFound("That lead no longer exists.");
const segmentGone = () => AppError.notFound("That segment no longer exists.");

/* ---- queries ---- */

/** LeadFilter -> Mongo filter. Conditions AND together; `tags` is "has any of". */
export function buildLeadQuery(filter: LeadFilter): FilterQuery<ILead> {
  const q: FilterQuery<ILead> = {};
  if (filter.stage?.length) q.stage = { $in: filter.stage };
  if (filter.tags?.length) q.tags = { $in: filter.tags };
  if (filter.segment) q.segment = filter.segment;
  if (filter.owner) q.owner = filter.owner;
  if (filter.industry) q.industry = filter.industry;
  if (filter.city) q.city = filter.city;
  // Absent contact fields are not stored at all; null in $in/$nin matches a missing field too.
  if (filter.hasEmail !== undefined) q.email = filter.hasEmail ? { $nin: [null, ""] } : { $in: [null, ""] };
  if (filter.hasPhone !== undefined) q.phone = filter.hasPhone ? { $nin: [null, ""] } : { $in: [null, ""] };
  // $text uses the compound text index; skipped entirely when q is absent.
  if (filter.q) q.$text = { $search: filter.q };
  return q;
}

export async function listLeads(opts: ListLeadsQuery) {
  const { page, limit, sort, ...filter } = opts;
  const query = buildLeadQuery(filter);
  // Stable paging needs a tiebreaker; _id is monotonic enough for that.
  const order: Record<string, 1 | -1> =
    sort === "company" ? { company: 1, _id: 1 } : { [sort]: -1, _id: -1 };

  const [items, total] = await Promise.all([
    Lead.find(query).sort(order).skip((page - 1) * limit).limit(limit).exec(),
    Lead.countDocuments(query).exec(),
  ]);
  return { items, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) };
}

/** Everything matching, for CSV export. Capped so one click cannot stream the whole database. */
export async function exportLeads(filter: LeadFilter) {
  return Lead.find(buildLeadQuery(filter)).sort({ updatedAt: -1, _id: -1 }).limit(20_000).exec();
}

/* ---- single lead ---- */

export async function createLead(input: CreateLeadInput) {
  return Lead.create(compact(input));
}

export async function getLead(id: string): Promise<LeadDoc> {
  const lead = await Lead.findById(id).exec();
  if (!lead) throw leadGone();
  return lead;
}

export async function patchLead(id: string, patch: PatchLeadInput): Promise<LeadDoc> {
  const lead = await getLead(id);
  const from = lead.stage;

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    // null clears. Mongoose turns an undefined path into $unset on save,
    // which keeps the sparse unique indexes honest (see compact()).
    lead.set(key, value === null ? undefined : value);
  }
  if (!lead.email && !lead.phone) {
    throw AppError.badRequest("A lead needs an email address or a phone number.");
  }
  if (patch.stage && patch.stage !== from) {
    lead.activities.push(stageActivity(from, patch.stage));
    if (patch.stage === "unsubscribed" && !lead.unsubscribedAt) lead.unsubscribedAt = new Date();
  }

  await lead.save();
  return lead;
}

export async function deleteLead(id: string): Promise<void> {
  const deleted = await Lead.findByIdAndDelete(id).exec();
  if (!deleted) throw leadGone();
}

export async function addNote(id: string, text: string, by: string): Promise<LeadDoc> {
  const lead = await Lead.findByIdAndUpdate(
    id,
    { $push: { notes: { at: new Date(), by, text }, activities: activity("note", text) } },
    { new: true, runValidators: true }
  ).exec();
  if (!lead) throw leadGone();
  return lead;
}

/** Returns how many of the ids exist. Leads already in the requested state are left alone. */
export async function bulkUpdateLeads({ ids, set, addTags, removeTags }: BulkLeadsInput): Promise<number> {
  const scope = { _id: { $in: ids } };
  const matched = await Lead.countDocuments(scope).exec();
  if (!matched) return 0;

  if (set?.stage) {
    const stage = set.stage;
    if (stage === "unsubscribed") {
      await Lead.updateMany({ ...scope, unsubscribedAt: null }, { $set: { unsubscribedAt: new Date() } }).exec();
    }
    await Lead.updateMany(
      { ...scope, stage: { $ne: stage } },
      { $set: { stage }, $push: { activities: stageActivity(null, stage) } }
    ).exec();
  }

  const update: UpdateQuery<ILead> = {};
  if (set && set.owner !== undefined) {
    if (set.owner) update.$set = { owner: set.owner };
    else update.$unset = { owner: 1 };
  }
  if (addTags?.length) update.$addToSet = { tags: { $each: addTags } };
  if (Object.keys(update).length) await Lead.updateMany(scope, update).exec();
  // $pull and $addToSet cannot touch the same field in one update.
  if (removeTags?.length) await Lead.updateMany(scope, { $pull: { tags: { $in: removeTags } } }).exec();

  return matched;
}

/* ---- CSV import ---- */

export interface ImportPreview {
  columns: string[];
  sample: string[][];
  rows: number;
  mapping: Record<string, ColumnTarget>;
}

export interface ImportResult {
  batchId: string;
  imported: number;
  updated: number;
  skipped: number;
  invalid: Array<{ row: number; reason: string }>;
}

export function previewImport(text: string): ImportPreview {
  const { header, rows } = parseCsv(text);
  if (!header.length) throw AppError.badRequest("The CSV has no header row.");
  return { columns: header, sample: rows.slice(0, 5), rows: rows.length, mapping: guessMapping(header) };
}

/**
 * Header spellings seen in CRM, LinkedIn, Apollo and hand-made exports.
 * Keys are lowercased with everything but letters and digits removed.
 */
const HEADER_ALIASES: Record<string, LeadImportField> = {
  firstname: "firstName", first: "firstName", givenname: "firstName", forename: "firstName",
  name: "firstName", fullname: "firstName", contactname: "firstName", contact: "firstName",
  contactperson: "firstName", person: "firstName", leadname: "firstName",
  lastname: "lastName", last: "lastName", surname: "lastName", familyname: "lastName",
  email: "email", emailaddress: "email", emailid: "email", mail: "email", workemail: "email", businessemail: "email",
  phone: "phone", phonenumber: "phone", phoneno: "phone", mobile: "phone", mobilenumber: "phone", mobileno: "phone",
  contactnumber: "phone", contactno: "phone", telephone: "phone", tel: "phone", whatsapp: "phone",
  whatsappnumber: "phone", cell: "phone", cellphone: "phone",
  company: "company", companyname: "company", organisation: "company", organization: "company", org: "company",
  business: "company", businessname: "company", firm: "company", brand: "company", account: "company",
  accountname: "company", employer: "company",
  role: "role", title: "role", jobtitle: "role", designation: "role", position: "role",
  website: "website", web: "website", url: "website", site: "website", domain: "website", companywebsite: "website",
  industry: "industry", sector: "industry", vertical: "industry",
  city: "city", town: "city", location: "city",
  segment: "segment", list: "segment",
  tags: "tags", tag: "tags", labels: "tags", label: "tags",
  source: "source", leadsource: "source", origin: "source", channel: "source",
  owner: "owner", assignedto: "owner", assignee: "owner", rep: "owner", salesrep: "owner",
};

/**
 * Best-guess mapping from header names. Each lead field is claimed once (the
 * first matching column wins); anything unrecognised becomes a custom field
 * named after its header, so no column is dropped without the operator seeing it.
 */
export function guessMapping(header: string[]): Record<string, ColumnTarget> {
  const mapping = new Map<string, ColumnTarget>();
  const taken = new Set<LeadImportField>();
  for (const col of header) {
    if (mapping.has(col)) continue;
    if (!col) {
      mapping.set(col, "ignore");
      continue;
    }
    const field = HEADER_ALIASES[col.toLowerCase().replace(/[^a-z0-9]/g, "")];
    if (field && !taken.has(field)) {
      taken.add(field);
      mapping.set(col, field);
      continue;
    }
    // "custom:foo" is what our own export writes, so it round-trips.
    const name = customKey(col.replace(/^custom:/i, ""));
    mapping.set(col, name ? `custom:${name}` : "ignore");
  }
  return Object.fromEntries(mapping);
}

interface Column {
  index: number;
  target: ColumnTarget;
}

type ScalarField = Exclude<LeadImportField, "tags">;
const SCALAR_FIELDS = LEAD_IMPORT_FIELDS.filter((f): f is ScalarField => f !== "tags");

/** Schema maxlengths. bulkWrite validates, and one over-long cell would fail the whole batch instead of one row. */
const MAX_LEN: Record<ScalarField, number> = {
  firstName: 120, lastName: 120, email: 200, phone: 40, company: 160, role: 120,
  website: 300, industry: 120, city: 120, segment: 120, source: 120, owner: 120,
};

interface Candidate {
  row: number;
  fields: Partial<Record<ScalarField, string>>;
  tags: string[];
  custom: Record<string, string>;
}
type ParsedRow = { ok: true; candidate: Candidate } | { ok: false; reason: string };

const splitTags = (s: string) => s.split(/[,;|]/).map((t) => t.trim()).filter(Boolean);

function parseRow(cells: string[], columns: Column[], row: number, splitName: boolean): ParsedRow {
  const fields: Partial<Record<ScalarField, string>> = {};
  const custom: Record<string, string> = {};
  const tags: string[] = [];

  for (const { index, target } of columns) {
    const value = (cells[index] ?? "").trim();
    if (!value || target === "ignore") continue;
    if (!isLeadImportField(target)) {
      const key = customKey(target.slice("custom:".length));
      if (key) custom[key] = value.slice(0, 1000);
      continue;
    }
    if (target === "tags") {
      tags.push(...splitTags(value));
      continue;
    }
    fields[target] = value.slice(0, MAX_LEN[target]);
  }

  // "Asha Rao" in a single Name column -> first/last at the first space.
  if (splitName && fields.firstName) {
    const space = fields.firstName.indexOf(" ");
    if (space > 0) {
      fields.lastName = fields.firstName.slice(space + 1).trim();
      fields.firstName = fields.firstName.slice(0, space);
    }
  }
  if (fields.email) {
    const parsed = emailField.safeParse(fields.email);
    if (!parsed.success) return { ok: false, reason: `Invalid email "${fields.email}"` };
    fields.email = parsed.data;
  }
  if (fields.phone) {
    const e164 = normalisePhone(fields.phone);
    if (!e164) return { ok: false, reason: `Invalid phone "${fields.phone}"` };
    fields.phone = e164;
  }
  if (!fields.email && !fields.phone) return { ok: false, reason: "No email or phone" };

  return { ok: true, candidate: { row, fields, tags, custom } };
}

/** Every existing lead sharing an email or phone with the file, in a few round trips rather than one per row. */
async function findExisting(candidates: Candidate[]): Promise<LeadDoc[]> {
  const emails = unique(candidates.map((c) => c.fields.email));
  const phones = unique(candidates.map((c) => c.fields.phone));
  const found = new Map<string, LeadDoc>();
  const CHUNK = 2000;
  for (let i = 0; i < Math.max(emails.length, phones.length); i += CHUNK) {
    const or: FilterQuery<ILead>[] = [];
    const e = emails.slice(i, i + CHUNK);
    const p = phones.slice(i, i + CHUNK);
    if (e.length) or.push({ email: { $in: e } });
    if (p.length) or.push({ phone: { $in: p } });
    for (const lead of await Lead.find({ $or: or }).exec()) found.set(String(lead._id), lead);
  }
  return [...found.values()];
}

interface Pending {
  row: number;
  doc: Record<string, unknown>;
}
interface Fill {
  lead: LeadDoc;
  set: Record<string, unknown>;
  tags: string[];
  filled: string[];
  rows: number[];
}
type Target = { kind: "new"; item: Pending } | { kind: "existing"; item: Fill };

const sourceOf = (c: Candidate, opts: ImportQuery) => c.fields.source ?? (opts.source || undefined);
const tagsOf = (c: Candidate, opts: ImportQuery) => unique([...c.tags, ...(opts.tags ?? [])]);

function newLeadDoc(c: Candidate, batchId: string, opts: ImportQuery): Record<string, unknown> {
  return compact({
    ...c.fields,
    source: sourceOf(c, opts),
    tags: tagsOf(c, opts),
    custom: c.custom,
    stage: "new",
    importBatchId: batchId,
    activities: [activity("import", "Imported from CSV", batchId)],
  });
}

/** A later row of the same file for a lead this batch is about to create. */
function fillPending(doc: Record<string, unknown>, c: Candidate, opts: ImportQuery): boolean {
  let changed = false;
  for (const f of SCALAR_FIELDS) {
    const value = f === "source" ? sourceOf(c, opts) : c.fields[f];
    if (value && !doc[f]) {
      doc[f] = value;
      changed = true;
    }
  }
  const custom = doc.custom as Record<string, string>;
  for (const [k, v] of Object.entries(c.custom)) {
    if (!custom[k]) {
      custom[k] = v;
      changed = true;
    }
  }
  const tags = doc.tags as string[];
  for (const t of tagsOf(c, opts)) {
    if (!tags.includes(t)) {
      tags.push(t);
      changed = true;
    }
  }
  return changed;
}

/** Fill only the EMPTY fields of an existing lead - an import never overwrites what the operator typed. */
function fillExisting(fill: Fill, c: Candidate, opts: ImportQuery): boolean {
  let changed = false;
  for (const f of SCALAR_FIELDS) {
    if (f === "firstName") continue; // required, so never empty
    const value = f === "source" ? sourceOf(c, opts) : c.fields[f];
    if (!value || fill.lead.get(f) || fill.set[f] !== undefined) continue;
    fill.set[f] = value;
    fill.filled.push(f);
    changed = true;
  }
  for (const [k, v] of Object.entries(c.custom)) {
    const path = `custom.${k}`;
    if (fill.lead.custom?.get(k) || fill.set[path] !== undefined) continue;
    fill.set[path] = v;
    fill.filled.push(path);
    changed = true;
  }
  for (const t of tagsOf(c, opts)) {
    if (fill.lead.tags.includes(t) || fill.tags.includes(t)) continue;
    fill.tags.push(t);
    if (!fill.filled.includes("tags")) fill.filled.push("tags");
    changed = true;
  }
  if (changed) fill.rows.push(c.row);
  return changed;
}

export async function importLeads(text: string, opts: ImportQuery): Promise<ImportResult> {
  const { header, rows } = parseCsv(text);
  if (!header.length) throw AppError.badRequest("The CSV has no header row.");
  if (!rows.length) throw AppError.badRequest("The CSV has no data rows.");

  const mapping = opts.mapping ?? guessMapping(header);
  const columns: Column[] = header.map((col, index) => ({
    index,
    target: Object.hasOwn(mapping, col) ? (mapping[col] as ColumnTarget) : "ignore",
  }));
  const splitName = !columns.some((c) => c.target === "lastName");

  const batchId = crypto.randomUUID();
  const invalid: Array<{ row: number; reason: string }> = [];
  const candidates: Candidate[] = [];
  rows.forEach((cells, i) => {
    const row = i + 2; // spreadsheet numbering: the header is row 1
    const parsed = parseRow(cells, columns, row, splitName);
    if (parsed.ok) candidates.push(parsed.candidate);
    else invalid.push({ row, reason: parsed.reason });
  });

  // One index dedupes against the database and within the file: it holds
  // existing leads and the batch's own pending inserts, keyed by contact.
  const index = new Map<string, Target>();
  const register = (t: Target, email?: string, phone?: string) => {
    if (email && !index.has(`e:${email}`)) index.set(`e:${email}`, t);
    if (phone && !index.has(`p:${phone}`)) index.set(`p:${phone}`, t);
  };
  for (const lead of await findExisting(candidates)) {
    register({ kind: "existing", item: { lead, set: {}, tags: [], filled: [], rows: [] } }, lead.email, lead.phone);
  }

  const inserts: Pending[] = [];
  const fills = new Set<Fill>();
  let skipped = 0;
  let updated = 0;

  for (const c of candidates) {
    const { email, phone } = c.fields;
    let hit = email ? index.get(`e:${email}`) : undefined; // email first, then phone
    if (!hit && phone) hit = index.get(`p:${phone}`);

    if (!hit) {
      if (!c.fields.firstName) {
        invalid.push({ row: c.row, reason: "Missing name" });
        continue;
      }
      const item: Pending = { row: c.row, doc: newLeadDoc(c, batchId, opts) };
      inserts.push(item);
      register({ kind: "new", item }, email, phone);
      continue;
    }

    if (opts.dedupe === "skip") {
      skipped++;
      continue;
    }
    const changed =
      hit.kind === "new" ? fillPending(hit.item.doc, c, opts) : fillExisting(hit.item, c, opts);
    if (changed) {
      updated++;
      if (hit.kind === "existing") fills.add(hit.item);
    } else {
      skipped++;
    }
    register(hit, email, phone); // a phone learnt from this row now identifies the lead too
  }

  let imported = inserts.length;
  const ops: Parameters<typeof Lead.bulkWrite>[0] = [];
  const opRows: number[][] = [];
  for (const n of inserts) {
    // bulkWrite casts through the schema (custom -> Map, timestamps, defaults).
    ops.push({ insertOne: { document: n.doc as unknown as ILead } });
    opRows.push([n.row]);
  }
  for (const f of fills) {
    const update: UpdateQuery<ILead> = {
      $set: { ...f.set, importBatchId: batchId },
      $push: { activities: activity("import", `Updated from CSV import: ${f.filled.join(", ")}`, batchId) },
    };
    if (f.tags.length) update.$addToSet = { tags: { $each: f.tags } };
    ops.push({ updateOne: { filter: { _id: f.lead._id }, update } });
    opRows.push(f.rows);
  }

  if (ops.length) {
    try {
      await Lead.bulkWrite(ops, { ordered: false });
    } catch (err) {
      // Unordered: everything else was written; only the failed ops come back, by index.
      const writeErrors = (err as { writeErrors?: unknown }).writeErrors;
      if (!Array.isArray(writeErrors)) throw err;
      for (const we of writeErrors as Array<{ index: number; code?: number; errmsg?: string }>) {
        const failedRows = opRows[we.index] ?? [];
        if (we.index < inserts.length) imported -= 1;
        else updated -= failedRows.length;
        const reason =
          we.code === 11000
            ? "Another lead already has that email or phone"
            : (we.errmsg ?? "Could not be written");
        for (const row of failedRows) invalid.push({ row, reason });
      }
    }
  }

  invalid.sort((a, b) => a.row - b.row);
  return { batchId, imported, updated, skipped, invalid };
}

/* ---- hooks for campaigns, outreach and the unsubscribe page ---- */

/** Append to the lead's timeline. False when the lead no longer exists; callers decide whether that matters. */
export async function recordActivity(
  leadId: string,
  entry: { type: ActivityType; summary: string; ref?: string }
): Promise<boolean> {
  const res = await Lead.updateOne(
    { _id: leadId },
    { $push: { activities: activity(entry.type, entry.summary, entry.ref) } }
  ).exec();
  return res.matchedCount > 0;
}

/** Stage + timestamp + timeline entry. Idempotent; the first unsubscribe time is kept. */
export async function markUnsubscribed(leadId: string): Promise<LeadDoc | null> {
  const lead = await Lead.findById(leadId).exec();
  if (!lead) return null;
  if (lead.stage === "unsubscribed" && lead.unsubscribedAt) return lead;

  if (lead.stage !== "unsubscribed") lead.activities.push(stageActivity(lead.stage, "unsubscribed"));
  lead.stage = "unsubscribed";
  lead.unsubscribedAt ??= new Date();
  lead.activities.push(activity("unsubscribed", "Unsubscribed from email"));
  await lead.save();
  return lead;
}

/** An email went out. A fresh lead becomes "contacted"; later stages are the operator's to manage. */
export async function touchContacted(leadId: string, at: Date = new Date()): Promise<void> {
  const moved = await Lead.updateOne(
    { _id: leadId, stage: "new" },
    {
      $set: { stage: "contacted" },
      $max: { lastContactedAt: at },
      $push: { activities: stageActivity("new", "contacted") },
    }
  ).exec();
  // $max so a late delivery event can never move the timestamp backwards.
  if (moved.matchedCount === 0) await Lead.updateOne({ _id: leadId }, { $max: { lastContactedAt: at } }).exec();
}

export interface Audience {
  segmentId?: string;
  leadIds?: string[];
  filter?: LeadFilter;
}

/**
 * Who a campaign may write to: the audience minus anyone without an email,
 * suppressed, or unsubscribed. Those exclusions win over the filter, so a
 * saved segment of "unsubscribed" leads resolves to nobody.
 */
export async function findLeadsForAudience(audience: Audience): Promise<LeadDoc[]> {
  let filter: LeadFilter = {};
  let query: FilterQuery<ILead>;
  if (audience.segmentId) {
    filter = (await getSegment(audience.segmentId)).filter ?? {};
    query = buildLeadQuery(filter);
  } else if (audience.leadIds) {
    query = { _id: { $in: audience.leadIds } };
  } else if (audience.filter) {
    filter = audience.filter;
    query = buildLeadQuery(filter);
  } else {
    throw AppError.badRequest("An audience needs a segment, a filter or a list of leads.");
  }

  if (filter.hasEmail === false) return [];
  const stages = (filter.stage ?? []).filter((s) => s !== "unsubscribed");
  if (filter.stage?.length && !stages.length) return [];

  query.email = { $nin: [null, ""] };
  query.stage = stages.length ? { $in: stages } : { $ne: "unsubscribed" };
  query.suppressed = { $ne: true };
  query.unsubscribedAt = null;
  return Lead.find(query).sort({ createdAt: 1, _id: 1 }).exec();
}

/* ---- segments ---- */

export async function listSegments(): Promise<SegmentDoc[]> {
  return Segment.find().sort({ name: 1 }).exec();
}

export async function createSegment(input: { name: string; filter: LeadFilter }) {
  return Segment.create(input);
}

export async function getSegment(id: string): Promise<SegmentDoc> {
  const segment = await Segment.findById(id).exec();
  if (!segment) throw segmentGone();
  return segment;
}

export async function patchSegment(id: string, patch: { name?: string; filter?: LeadFilter }) {
  const segment = await getSegment(id);
  if (patch.name !== undefined) segment.name = patch.name;
  if (patch.filter !== undefined) {
    segment.filter = patch.filter;
    segment.markModified("filter"); // Mixed paths are not change-tracked
  }
  await segment.save();
  return segment;
}

export async function deleteSegment(id: string): Promise<void> {
  const deleted = await Segment.findByIdAndDelete(id).exec();
  if (!deleted) throw segmentGone();
}

export async function countSegment(id: string): Promise<number> {
  const segment = await getSegment(id);
  return Lead.countDocuments(buildLeadQuery(segment.filter ?? {})).exec();
}
