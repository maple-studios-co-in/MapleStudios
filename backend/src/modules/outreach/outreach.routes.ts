import { Router } from "express";
import { validate, body, params, query } from "../../middleware/validate.js";
import { requireAdmin } from "../../middleware/auth.js";
import { outreachWire } from "./outreach.model.js";
import {
  advanceSchema,
  createTargetSchema,
  idParam,
  listTargetsQuery,
  noteSchema,
  patchTargetSchema,
  renderSchema,
} from "./outreach.schema.js";
import * as outreach from "./outreach.service.js";

/** Nothing public: LinkedIn outreach is operator-only. Exported so routes.ts mounts every module the same way. */
export const publicOutreachRoutes = Router();

export const adminOutreachRoutes = Router();
adminOutreachRoutes.use(requireAdmin);

adminOutreachRoutes.get("/outreach", validate({ query: listTargetsQuery }), async (req, res) => {
  const { items, total, page, limit, pages } = await outreach.listTargets(query(req, listTargetsQuery));
  res.json({ items: items.map((t) => outreachWire(t)), meta: { total, page, limit, pages } });
});

// Before /outreach/:id, or "due" would be rejected as a malformed id.
adminOutreachRoutes.get("/outreach/due", async (_req, res) => {
  const items = await outreach.listDue();
  res.json({ items: items.map((t) => outreachWire(t)) });
});

adminOutreachRoutes.post("/outreach", validate({ body: createTargetSchema }), async (req, res) => {
  const created = await outreach.createTarget(body(req, createTargetSchema));
  res.status(201).json({ item: outreachWire(created) });
});

adminOutreachRoutes.get("/outreach/:id", validate({ params: idParam }), async (req, res) => {
  const { id } = params(req, idParam);
  res.json({ item: outreachWire(await outreach.getTarget(id)) });
});

adminOutreachRoutes.patch(
  "/outreach/:id",
  validate({ params: idParam, body: patchTargetSchema }),
  async (req, res) => {
    const { id } = params(req, idParam);
    res.json({ item: outreachWire(await outreach.updateTarget(id, body(req, patchTargetSchema))) });
  }
);

adminOutreachRoutes.delete("/outreach/:id", validate({ params: idParam }), async (req, res) => {
  const { id } = params(req, idParam);
  await outreach.deleteTarget(id);
  res.json({ ok: true });
});

adminOutreachRoutes.post(
  "/outreach/:id/advance",
  validate({ params: idParam, body: advanceSchema }),
  async (req, res) => {
    const { id } = params(req, idParam);
    res.json({ item: outreachWire(await outreach.advanceTarget(id, body(req, advanceSchema))) });
  }
);

adminOutreachRoutes.post(
  "/outreach/:id/render",
  validate({ params: idParam, body: renderSchema }),
  async (req, res) => {
    const { id } = params(req, idParam);
    const { templateId } = body(req, renderSchema);
    res.json(await outreach.renderForTarget(id, templateId));
  }
);

adminOutreachRoutes.post(
  "/outreach/:id/notes",
  validate({ params: idParam, body: noteSchema }),
  async (req, res) => {
    const { id } = params(req, idParam);
    const { text } = body(req, noteSchema);
    const updated = await outreach.addNote(id, text, req.admin?.email ?? "admin");
    res.json({ item: outreachWire(updated) });
  }
);
