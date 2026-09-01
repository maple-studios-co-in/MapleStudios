import { Router } from "express";
import { validate, body, params, query } from "../../middleware/validate.js";
import { writeLimiter } from "../../middleware/rateLimit.js";
import { requireAdmin } from "../../middleware/auth.js";
import { toCsv } from "../../lib/csv.js";
import { inquiryWire } from "./inquiry.model.js";
import {
  createInquirySchema,
  exportInquiriesQuery,
  inquiryIdParam,
  listInquiriesQuery,
  patchInquirySchema,
} from "./inquiry.schema.js";
import * as inquiries from "./inquiry.service.js";

/** Public: the contact form. */
export const publicInquiryRoutes = Router();

publicInquiryRoutes.post(
  "/inquiries",
  writeLimiter,
  validate({ body: createInquirySchema }),
  async (req, res) => {
    const input = body(req, createInquirySchema);
    const created = await inquiries.createInquiry({
      ...input,
      ip: req.ip,
      userAgent: req.get("user-agent"),
    });
    // Matches the current route: the form only needs an ack and an id.
    res.status(201).json({ ok: true, id: String(created._id) });
  }
);

/** Admin: the inbox. */
export const adminInquiryRoutes = Router();
adminInquiryRoutes.use(requireAdmin);

adminInquiryRoutes.get(
  "/inquiries",
  validate({ query: listInquiriesQuery }),
  async (req, res) => {
    const opts = query(req, listInquiriesQuery);
    const { items, total, page, limit, pages } = await inquiries.listInquiries(opts);
    res.json({ inquiries: items.map((d) => inquiryWire(d)), meta: { total, page, limit, pages } });
  }
);

adminInquiryRoutes.get(
  "/inquiries.csv",
  validate({ query: exportInquiriesQuery }),
  async (req, res) => {
    const { status } = query(req, exportInquiriesQuery);
    const docs = await inquiries.listAllForExport(status);
    const rows = docs.map((d) => inquiryWire(d));
    const csv = toCsv(rows, [
      "at",
      "name",
      "email",
      "company",
      "service",
      "budget",
      "status",
      "message",
    ]);
    res.setHeader("content-type", "text/csv; charset=utf-8");
    res.setHeader("content-disposition", 'attachment; filename="maple-inquiries.csv"');
    res.send(csv);
  }
);

adminInquiryRoutes.patch(
  "/inquiries/:id",
  validate({ params: inquiryIdParam, body: patchInquirySchema }),
  async (req, res) => {
    const { id } = params(req, inquiryIdParam);
    const { status } = body(req, patchInquirySchema);
    const updated = await inquiries.setStatus(id, status);
    res.json({ inquiry: inquiryWire(updated) });
  }
);

adminInquiryRoutes.delete(
  "/inquiries/:id",
  validate({ params: inquiryIdParam }),
  async (req, res) => {
    const { id } = params(req, inquiryIdParam);
    await inquiries.deleteInquiry(id);
    res.json({ ok: true });
  }
);
