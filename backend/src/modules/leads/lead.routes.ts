import { Router } from "express";
import { validate, body, params, query } from "../../middleware/validate.js";
import { requireAdmin } from "../../middleware/auth.js";
import { toCsv } from "../../lib/csv.js";
import { leadWire } from "./lead.model.js";
import { segmentWire } from "./segment.model.js";
import {
  bulkLeadsSchema,
  createLeadSchema,
  createSegmentSchema,
  csvBody,
  exportLeadsQuery,
  importQuery,
  leadIdParam,
  listLeadsQuery,
  noteSchema,
  patchLeadSchema,
  patchSegmentSchema,
  segmentIdParam,
} from "./lead.schema.js";
import * as leads from "./lead.service.js";

/**
 * Nothing public in Phase 1 - the unsubscribe page belongs to campaigns.
 * Exported anyway so routes.ts mounts every module the same way.
 */
export const publicLeadRoutes = Router();

/** Admin: the lead book, CSV import/export and saved segments. */
export const adminLeadRoutes = Router();
adminLeadRoutes.use(requireAdmin);

adminLeadRoutes.get("/leads", validate({ query: listLeadsQuery }), async (req, res) => {
  const { items, total, page, limit, pages } = await leads.listLeads(query(req, listLeadsQuery));
  res.json({ items: items.map((d) => leadWire(d)), meta: { total, page, limit, pages } });
});

const CSV_COLUMNS = [
  "id", "firstName", "lastName", "email", "phone", "company", "role", "website", "industry",
  "city", "segment", "tags", "source", "stage", "owner", "nextActionAt", "lastContactedAt",
  "unsubscribedAt", "suppressed", "importBatchId", "createdAt", "updatedAt",
];

adminLeadRoutes.get("/leads.csv", validate({ query: exportLeadsQuery }), async (req, res) => {
  const docs = await leads.exportLeads(query(req, exportLeadsQuery));
  // Custom fields become "custom:<name>" columns, which the importer maps straight back.
  const customKeys = [...new Set(docs.flatMap((d) => [...d.custom.keys()]))].sort();
  const rows = docs.map((d) => {
    const w = leadWire(d);
    const row: Record<string, unknown> = { ...w, tags: w.tags.join(", "), nextActionAt: w.nextAction?.at ?? "" };
    for (const k of customKeys) row[`custom:${k}`] = d.custom.get(k) ?? "";
    return row;
  });
  const csv = toCsv(rows, [...CSV_COLUMNS, ...customKeys.map((k) => `custom:${k}`)]);
  res.setHeader("content-type", "text/csv; charset=utf-8");
  res.setHeader("content-disposition", 'attachment; filename="maple-leads.csv"');
  res.send(csv);
});

adminLeadRoutes.post("/leads", validate({ body: createLeadSchema }), async (req, res) => {
  const created = await leads.createLead(body(req, createLeadSchema));
  res.status(201).json({ item: leadWire(created) });
});

// Fixed paths before "/leads/:id" so "bulk" and "import" are never read as ids.
adminLeadRoutes.post("/leads/bulk", validate({ body: bulkLeadsSchema }), async (req, res) => {
  const updated = await leads.bulkUpdateLeads(body(req, bulkLeadsSchema));
  res.json({ ok: true, updated });
});

adminLeadRoutes.post("/leads/import/preview", validate({ body: csvBody }), (req, res) => {
  res.json(leads.previewImport(body(req, csvBody)));
});

adminLeadRoutes.post(
  "/leads/import",
  validate({ body: csvBody, query: importQuery }),
  async (req, res) => {
    const result = await leads.importLeads(body(req, csvBody), query(req, importQuery));
    res.json({ ok: true, ...result });
  }
);

adminLeadRoutes.get("/leads/:id", validate({ params: leadIdParam }), async (req, res) => {
  const { id } = params(req, leadIdParam);
  res.json({ item: leadWire(await leads.getLead(id)) });
});

adminLeadRoutes.patch(
  "/leads/:id",
  validate({ params: leadIdParam, body: patchLeadSchema }),
  async (req, res) => {
    const { id } = params(req, leadIdParam);
    const updated = await leads.patchLead(id, body(req, patchLeadSchema));
    res.json({ item: leadWire(updated) });
  }
);

adminLeadRoutes.delete("/leads/:id", validate({ params: leadIdParam }), async (req, res) => {
  const { id } = params(req, leadIdParam);
  await leads.deleteLead(id);
  res.json({ ok: true });
});

adminLeadRoutes.post(
  "/leads/:id/notes",
  validate({ params: leadIdParam, body: noteSchema }),
  async (req, res) => {
    const { id } = params(req, leadIdParam);
    const { text } = body(req, noteSchema);
    const updated = await leads.addNote(id, text, req.admin?.email ?? "admin");
    res.json({ item: leadWire(updated) });
  }
);

/* ---- segments: saved filters ---- */

adminLeadRoutes.get("/segments", async (_req, res) => {
  const items = await leads.listSegments();
  res.json({ items: items.map((s) => segmentWire(s)) });
});

adminLeadRoutes.post("/segments", validate({ body: createSegmentSchema }), async (req, res) => {
  const created = await leads.createSegment(body(req, createSegmentSchema));
  res.status(201).json({ item: segmentWire(created) });
});

adminLeadRoutes.patch(
  "/segments/:id",
  validate({ params: segmentIdParam, body: patchSegmentSchema }),
  async (req, res) => {
    const { id } = params(req, segmentIdParam);
    const updated = await leads.patchSegment(id, body(req, patchSegmentSchema));
    res.json({ item: segmentWire(updated) });
  }
);

adminLeadRoutes.delete("/segments/:id", validate({ params: segmentIdParam }), async (req, res) => {
  const { id } = params(req, segmentIdParam);
  await leads.deleteSegment(id);
  res.json({ ok: true });
});

adminLeadRoutes.get("/segments/:id/count", validate({ params: segmentIdParam }), async (req, res) => {
  const { id } = params(req, segmentIdParam);
  res.json({ count: await leads.countSegment(id) });
});
