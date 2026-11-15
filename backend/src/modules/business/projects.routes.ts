import { Router } from "express";
import type { z } from "zod";
import type { Request } from "express";
import { authenticate } from "../../middleware/auth.js";
import { AppError } from "../../lib/AppError.js";
import { Client, Project, Deliverable } from "./business.model.js";
import {
  clientInput,
  projectInput,
  deliverableInput,
  managerDeliverablePatch,
  memberDeliverablePatch,
  decisionInput,
  id,
  revision,
  listQuery,
  literalSearch,
} from "./business.schema.js";
import {
  eligiblePeople,
  isManager,
  memberActive,
  noLegacy,
  projectFor,
  requireBusinessManager,
  validateAssignments,
} from "./business.access.js";
import { AdminUser } from "../auth/admin.model.js";
export const projectRoutes = Router();
projectRoutes.use(authenticate, noLegacy);
const actor = (req: Request) => req.admin!.email;
async function clientAvailable(clientId: string) {
  if (!(await Client.exists({ _id: clientId, status: "active" })))
    throw AppError.badRequest("Choose an active client.");
}
async function wireProject(p: Awaited<ReturnType<typeof projectFor>>) {
  const client = await Client.findById(p.clientId).select("name");
  return { ...p.toJSON(), clientName: client?.name || "Archived client" };
}
projectRoutes.get("/people", requireBusinessManager, async (_req, res) =>
  res.json({
    items: (await eligiblePeople()).map((p) => ({
      id: String(p._id),
      name: p.name,
      email: p.email,
      role: p.role,
    })),
  }),
);
projectRoutes.get("/clients", requireBusinessManager, async (req, res) => {
  const { q, page, limit, status } = listQuery.parse(req.query);
  const filter = {
    ...(q ? { name: literalSearch(q) } : {}),
    ...(status ? { status } : {}),
  };
  const [items, total] = await Promise.all([
    Client.find(filter)
      .sort({ name: 1, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Client.countDocuments(filter),
  ]);
  res.json({
    items,
    meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
});
projectRoutes.post("/clients", requireBusinessManager, async (req, res) =>
  res
    .status(201)
    .json({
      item: await Client.create({
        ...clientInput.parse(req.body),
        updatedBy: actor(req),
      }),
    }),
);
projectRoutes.get("/clients/:id", requireBusinessManager, async (req, res) => {
  const item = await Client.findById(id.parse(req.params.id));
  if (!item) throw AppError.notFound();
  res.json({ item });
});
projectRoutes.patch(
  "/clients/:id",
  requireBusinessManager,
  async (req, res) => {
    const { revision: rev, ...input } = clientInput
      .partial()
      .extend({ revision })
      .strict()
      .parse(req.body);
    const item = await Client.findOneAndUpdate(
      { _id: id.parse(req.params.id), revision: rev },
      { $set: { ...input, updatedBy: actor(req) }, $inc: { revision: 1 } },
      { new: true, runValidators: true },
    );
    if (!item)
      throw AppError.conflict("Client changed. Refresh before saving.");
    res.json({ item });
  },
);
projectRoutes.get("/projects", async (req, res) => {
  const { q, page, limit, status } = listQuery.parse(req.query);
  if (!isManager(req) && !(await memberActive(req)))
    return res.json({ items: [], meta: { page, limit, total: 0, pages: 1 } });
  const filter = {
    ...(!isManager(req) ? { assigneeIds: req.admin!.id } : {}),
    ...(q ? { title: literalSearch(q) } : {}),
    ...(status ? { status } : {}),
  };
  const [rows, total] = await Promise.all([
    Project.find(filter)
      .sort({ dueDate: 1, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Project.countDocuments(filter),
  ]);
  res.json({
    items: await Promise.all(rows.map(wireProject)),
    meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
});
projectRoutes.post("/projects", requireBusinessManager, async (req, res) => {
  const input = projectInput.parse(req.body);
  if (input.startDate > input.dueDate)
    throw AppError.badRequest("Due date must follow the start date.");
  await clientAvailable(input.clientId);
  await validateAssignments(input.assigneeIds);
  res
    .status(201)
    .json({
      item: await wireProject(
        await Project.create({ ...input, updatedBy: actor(req) }),
      ),
    });
});
projectRoutes.get("/projects/:id", async (req, res) => {
  const p = await projectFor(req, String(req.params.id));
  const people = await AdminUser.find({ _id: { $in: p.assigneeIds } }).select(
    "name",
  );
  res.json({
    item: await wireProject(p),
    people: people.map((x) => ({ id: String(x._id), name: x.name })),
  });
});
projectRoutes.patch(
  "/projects/:id",
  requireBusinessManager,
  async (req, res) => {
    const p = await projectFor(req, String(req.params.id));
    const { revision: rev, ...input } = projectInput
      .omit({ clientId: true })
      .partial()
      .extend({ revision })
      .strict()
      .parse(req.body);
    if ((input.startDate ?? p.startDate) > (input.dueDate ?? p.dueDate))
      throw AppError.badRequest("Due date must follow the start date.");
    if (input.assigneeIds) await validateAssignments(input.assigneeIds);
    const changed = await Project.findOneAndUpdate(
      { _id: p._id, revision: rev },
      { $set: { ...input, updatedBy: actor(req) }, $inc: { revision: 1 } },
      { new: true, runValidators: true },
    );
    if (!changed)
      throw AppError.conflict("Project changed. Refresh before saving.");
    res.json({ item: await wireProject(changed) });
  },
);
projectRoutes.get("/projects/:id/deliverables", async (req, res) => {
  const p = await projectFor(req, String(req.params.id));
  res.json({
    items: await Deliverable.find({ projectId: String(p._id) }).sort({
      dueDate: 1,
      _id: 1,
    }),
  });
});
projectRoutes.post(
  "/projects/:id/deliverables",
  requireBusinessManager,
  async (req, res) => {
    const p = await projectFor(req, String(req.params.id));
    if (["completed", "archived"].includes(p.status))
      throw AppError.conflict("Reopen the project before adding work.");
    const input = deliverableInput.parse(req.body);
    if (input.assigneeId && !p.assigneeIds.includes(input.assigneeId))
      throw AppError.badRequest(
        "Assign this deliverable to a project teammate.",
      );
    if (input.assigneeId) await validateAssignments([input.assigneeId]);
    res
      .status(201)
      .json({
        item: await Deliverable.create({
          ...input,
          projectId: String(p._id),
          updatedBy: actor(req),
          history: [{ action: "created", actor: actor(req), at: new Date() }],
        }),
      });
  },
);
projectRoutes.patch("/deliverables/:id", async (req, res) => {
  const d = await Deliverable.findById(id.parse(req.params.id));
  if (!d) throw AppError.notFound();
  const p = await projectFor(req, d.projectId);
  if (!isManager(req) && d.assigneeId !== req.admin!.id)
    throw AppError.forbidden();
  const parsed: z.infer<typeof managerDeliverablePatch> = (
    isManager(req) ? managerDeliverablePatch : memberDeliverablePatch
  ).parse(req.body);
  const { revision: rev, ...input } = parsed;
  if (Object.keys(input).length === 0)
    throw AppError.badRequest("Nothing to update.");
  if ("assigneeId" in input && input.assigneeId) {
    if (!p.assigneeIds.includes(input.assigneeId))
      throw AppError.badRequest("Choose a project teammate.");
    await validateAssignments([input.assigneeId]);
  }
  const merged = { ...d.toObject(), ...input };
  const contentChanged = [
    "title",
    "description",
    "submissionReference",
    "note",
  ].some((k) => k in input && input[k as keyof typeof input] !== d.get(k));
  const invalidated =
    contentChanged && ["approved", "in-review"].includes(d.status);
  let status = input.status ?? (invalidated ? "in-progress" : d.status);
  const submitting = input.status === "in-review";
  if (submitting && !merged.submissionReference.trim())
    throw AppError.badRequest(
      "Add the submission link or reference before requesting review.",
    );
  if (!isManager(req) && ["completed", "archived"].includes(p.status))
    throw AppError.conflict("Ask a manager to reopen this project.");
  if (submitting) status = "in-review";
  const version = d.submissionVersion + (submitting ? 1 : 0);
  const event = {
    action: submitting
      ? "submitted"
      : invalidated
        ? "approval-invalidated"
        : "updated",
    actor: actor(req),
    at: new Date(),
    submissionVersion: version,
    title: merged.title,
    description: merged.description,
    submissionReference: merged.submissionReference,
    note: merged.note,
  };
  if (d.history.length >= 500)
    throw AppError.conflict(
      "This deliverable has reached its history limit. Create a new deliverable for further work.",
    );
  const item = await Deliverable.findOneAndUpdate(
    { _id: d._id, revision: rev },
    {
      $set: {
        ...input,
        status,
        submissionVersion: version,
        ...(submitting || invalidated || input.status
          ? { currentApproval: null }
          : {}),
        updatedBy: actor(req),
      },
      $inc: { revision: 1 },
      $push: { history: event },
    },
    { new: true, runValidators: true },
  );
  if (!item)
    throw AppError.conflict("Deliverable changed. Refresh before saving.");
  res.json({ item });
});
projectRoutes.post(
  "/deliverables/:id/decision",
  requireBusinessManager,
  async (req, res) => {
    const input = decisionInput.parse(req.body);
    const d = await Deliverable.findById(id.parse(req.params.id));
    if (!d) throw AppError.notFound();
    await projectFor(req, d.projectId);
    if (
      input.decisionDate >
      new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
    )
      throw AppError.badRequest("An approval cannot be dated in the future.");
    const event = {
      action: input.decision,
      actor: actor(req),
      at: new Date(),
      submissionVersion: input.submissionVersion,
      approverName: input.approverName,
      decisionDate: input.decisionDate,
      evidenceReference: input.evidenceReference,
    };
    const item = await Deliverable.findOneAndUpdate(
      {
        _id: d._id,
        revision: input.revision,
        status: "in-review",
        submissionVersion: input.submissionVersion,
      },
      {
        $set: {
          status: input.decision,
          currentApproval: input.decision === "approved" ? event : null,
          updatedBy: actor(req),
        },
        $inc: { revision: 1 },
        $push: { history: event },
      },
      { new: true, runValidators: true },
    );
    if (!item)
      throw AppError.conflict(
        "The submitted version changed. Refresh and review it again.",
      );
    res.json({ item });
  },
);
