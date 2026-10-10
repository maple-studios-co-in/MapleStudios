import { Router } from "express";
import { validate, body, params, query } from "../../middleware/validate.js";
import { requireAdmin } from "../../middleware/auth.js";
import { templateWire } from "./template.model.js";
import {
  createTemplateSchema,
  listTemplatesQuery,
  patchTemplateSchema,
  renderTemplateSchema,
  templateIdParam,
  testSendSchema,
} from "./template.schema.js";
import * as templates from "./template.service.js";

/** Public: nothing yet - templates are an operator tool. Exported so the
    mount lines in routes.ts stay uniform across modules. */
export const publicTemplateRoutes = Router();

/** Admin: the template library. */
export const adminTemplateRoutes = Router();
adminTemplateRoutes.use(requireAdmin);

adminTemplateRoutes.get("/templates", validate({ query: listTemplatesQuery }), async (req, res) => {
  const opts = query(req, listTemplatesQuery);
  const { items, total, page, limit, pages } = await templates.listTemplates(opts);
  res.json({ items: items.map((d) => templateWire(d)), meta: { total, page, limit, pages } });
});

adminTemplateRoutes.post("/templates", validate({ body: createTemplateSchema }), async (req, res) => {
  const created = await templates.createTemplate(body(req, createTemplateSchema));
  res.status(201).json({ item: templateWire(created) });
});

adminTemplateRoutes.get("/templates/:id", validate({ params: templateIdParam }), async (req, res) => {
  const { id } = params(req, templateIdParam);
  res.json({ item: templateWire(await templates.getTemplate(id)) });
});

adminTemplateRoutes.patch(
  "/templates/:id",
  validate({ params: templateIdParam, body: patchTemplateSchema }),
  async (req, res) => {
    const { id } = params(req, templateIdParam);
    const updated = await templates.updateTemplate(id, body(req, patchTemplateSchema));
    res.json({ item: templateWire(updated) });
  }
);

adminTemplateRoutes.delete("/templates/:id", validate({ params: templateIdParam }), async (req, res) => {
  const { id } = params(req, templateIdParam);
  await templates.deleteTemplate(id);
  res.json({ ok: true });
});

adminTemplateRoutes.post(
  "/templates/:id/render",
  validate({ params: templateIdParam, body: renderTemplateSchema }),
  async (req, res) => {
    const { id } = params(req, templateIdParam);
    res.json(await templates.renderTemplate(id, body(req, renderTemplateSchema)));
  }
);

adminTemplateRoutes.post(
  "/templates/:id/test-send",
  validate({ params: templateIdParam, body: testSendSchema }),
  async (req, res) => {
    const { id } = params(req, templateIdParam);
    res.json(await templates.testSend(id, body(req, testSendSchema)));
  }
);
