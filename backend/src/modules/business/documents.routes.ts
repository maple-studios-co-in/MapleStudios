import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/auth.js";
import { AppError } from "../../lib/AppError.js";
import {
  noLegacy,
  requireBusinessManager,
  requireBusinessOwner,
} from "./business.access.js";
import { id, revision, listQuery, literalSearch } from "./business.schema.js";
import {
  companyInput,
  templateInput,
  draftInput,
  draftEdit,
} from "./documents.schema.js";
import {
  BusinessCompany,
  BusinessTemplate,
  BusinessDraft,
} from "./documents.model.js";
import {
  companyProfile,
  generateDraft,
  unresolved,
  type DraftSnapshot,
} from "./documents.service.js";
import { calculateInvoice } from "./invoice.js";
import { renderDocx, renderHtml, type ExportDraft } from "./document-export.js";
export const documentRoutes = Router();
documentRoutes.use(authenticate, noLegacy, requireBusinessManager);
documentRoutes.get("/company", async (_req, res) => {
  const c = await companyProfile();
  res.json({ item: { ...c.profile, revision: c.revision } });
});
documentRoutes.patch("/company", requireBusinessOwner, async (req, res) => {
  const { revision: rev, ...patch } = companyInput
    .partial()
    .extend({ revision })
    .strict()
    .parse(req.body);
  const current = await companyProfile();
  if (current.revision !== rev)
    throw AppError.conflict("Company details changed. Refresh before saving.");
  const profile = companyInput.parse({ ...current.profile, ...patch });
  const item = await BusinessCompany.findOneAndUpdate(
    { _id: "company", revision: rev },
    { $set: { profile, updatedBy: req.admin!.email }, $inc: { revision: 1 } },
    { new: true, upsert: rev === 0, setDefaultsOnInsert: true },
  );
  if (!item) throw AppError.conflict("Company details changed.");
  res.json({ item: { ...profile, revision: item.revision } });
});
documentRoutes.get("/templates", async (_req, res) =>
  res.json({
    items: await BusinessTemplate.find()
      .select("-versions")
      .sort({ name: 1, _id: 1 }),
  }),
);
documentRoutes.put("/templates", requireBusinessOwner, async (req, res) => {
  const {
    id: templateId,
    revision: rev,
    ...input
  } = templateInput.parse(req.body);
  if (!templateId) {
    if (rev !== 0)
      throw AppError.badRequest("A new template starts at revision zero.");
    return res.status(201).json({
      item: await BusinessTemplate.create({
        ...input,
        updatedBy: req.admin!.email,
      }),
    });
  }
  const current = await BusinessTemplate.findById(templateId);
  if (!current) throw AppError.notFound();
  if (current.versions.length >= 100)
    throw AppError.conflict(
      "Create a new template to continue; previous versions are retained.",
    );
  const previous = {
    revision: current.revision,
    name: current.name,
    kind: current.kind,
    subject: current.subject,
    body: current.body,
    status: current.status,
    updatedBy: current.updatedBy,
    updatedAt: current.updatedAt,
  };
  const item = await BusinessTemplate.findOneAndUpdate(
    { _id: templateId, revision: rev },
    {
      $set: { ...input, updatedBy: req.admin!.email },
      $inc: { revision: 1 },
      $push: { versions: previous },
    },
    { new: true },
  ).select("-versions");
  if (!item)
    throw AppError.conflict("Template changed. Refresh before saving.");
  res.json({ item });
});
documentRoutes.get("/drafts", async (req, res) => {
  const { q, page, limit } = listQuery.parse(req.query);
  const projectId = req.query.projectId
    ? id.parse(req.query.projectId)
    : undefined;
  const filter = {
    ...(projectId ? { projectId } : {}),
    ...(q ? { title: literalSearch(q) } : {}),
  };
  const [items, total] = await Promise.all([
    BusinessDraft.find(filter)
      .select("-versions")
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    BusinessDraft.countDocuments(filter),
  ]);
  res.json({
    items,
    meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
});
documentRoutes.post("/drafts", async (req, res) => {
  const item = await BusinessDraft.create(
    await generateDraft(req, draftInput.parse(req.body)),
  );
  res.status(201).json({ item });
});
async function findDraft(value: unknown) {
  const item = await BusinessDraft.findById(id.parse(value));
  if (!item) throw AppError.notFound("Draft not found.");
  return item;
}
documentRoutes.get("/drafts/:id", async (req, res) => {
  const item = await findDraft(req.params.id);
  const output = item.toJSON();
  delete (output as Partial<typeof output>).versions;
  res.json({ item: output });
});
documentRoutes.patch("/drafts/:id", async (req, res) => {
  const current = await findDraft(req.params.id);
  const { revision: rev, invoice, ...input } = draftEdit.parse(req.body);
  if (Object.keys(input).length === 0 && !invoice)
    throw AppError.badRequest("Nothing to update.");
  if (invoice && current.kind !== "invoice")
    throw AppError.badRequest("Line items are only allowed on invoice drafts.");
  if (current.versions.length >= 100)
    throw AppError.conflict(
      "Create a new draft to continue; previous versions are retained.",
    );
  const snapshot = current.snapshot as DraftSnapshot;
  const updatedSnapshot = invoice
    ? { ...snapshot, invoice: calculateInvoice(invoice) }
    : snapshot;
  const previous = {
    revision: current.revision,
    title: current.title,
    subject: current.subject,
    body: current.body,
    snapshot,
    updatedBy: current.updatedBy,
    updatedAt: current.updatedAt,
  };
  const item = await BusinessDraft.findOneAndUpdate(
    { _id: current._id, revision: rev },
    {
      $set: {
        ...input,
        snapshot: updatedSnapshot,
        missing: unresolved(
          input.body ?? current.body,
          input.subject ?? current.subject,
        ),
        updatedBy: req.admin!.email,
      },
      $inc: { revision: 1 },
      $push: { versions: previous },
    },
    { new: true },
  ).select("-versions");
  if (!item) throw AppError.conflict("Draft changed. Refresh before saving.");
  res.json({ item });
});
documentRoutes.post("/drafts/:id/regenerate", async (req, res) => {
  const current = await findDraft(req.params.id);
  const { revision: rev, ...options } = draftInput
    .omit({ projectId: true, kind: true })
    .extend({ revision })
    .strict()
    .parse(req.body);
  if (current.versions.length >= 100)
    throw AppError.conflict("Create a new draft; the version history is full.");
  const old = current.snapshot as DraftSnapshot;
  const generated = await generateDraft(
    req,
    draftInput.parse({
      projectId: current.projectId,
      kind: current.kind,
      templateId: old.templateId,
      invoice: old.invoice
        ? {
            reference: old.invoice.reference,
            issueDate: old.invoice.issueDate,
            dueDate: old.invoice.dueDate,
            poNumber: old.invoice.poNumber,
            placeOfSupply: old.invoice.placeOfSupply,
            taxMode: old.invoice.taxMode,
            notes: old.invoice.notes,
            lines: old.invoice.lines.map((l) => ({
              description: l.description,
              sac: l.sac,
              quantityHundredths: l.quantityHundredths,
              unitPrice: l.unitPrice,
              discount: l.discount,
              taxRateBps: l.taxRateBps,
            })),
          }
        : undefined,
      ...options,
    }),
  );
  const { createdBy: _createdBy, ...changes } = generated;
  void _createdBy;
  const item = await BusinessDraft.findOneAndUpdate(
    { _id: current._id, revision: rev },
    {
      $set: changes,
      $inc: { revision: 1 },
      $push: {
        versions: {
          revision: current.revision,
          title: current.title,
          subject: current.subject,
          body: current.body,
          snapshot: old,
          updatedBy: current.updatedBy,
          updatedAt: current.updatedAt,
        },
      },
    },
    { new: true },
  ).select("-versions");
  if (!item)
    throw AppError.conflict("Draft changed. Refresh before regenerating.");
  res.json({ item });
});
documentRoutes.get("/drafts/:id/versions", async (req, res) => {
  const d = await findDraft(req.params.id);
  res.json({
    items: [
      {
        revision: d.revision,
        title: d.title,
        subject: d.subject,
        body: d.body,
        snapshot: d.snapshot,
        updatedBy: d.updatedBy,
        updatedAt: d.updatedAt,
      },
      ...d.versions.slice().reverse(),
    ],
  });
});
documentRoutes.get("/drafts/:id/export", async (req, res) => {
  const format = z.enum(["html", "docx", "txt"]).parse(req.query.format);
  const item = await findDraft(req.params.id);
  if (item.missing.length)
    throw AppError.badRequest(
      "Fill these placeholders before exporting: " + item.missing.join(", "),
    );
  if (format === "txt" && !["onboarding", "update"].includes(item.kind))
    throw AppError.badRequest("Use Word or PDF for this document.");
  const d = item.toObject() as unknown as ExportDraft;
  res.setHeader("cache-control", "private, no-store");
  res.setHeader("x-content-type-options", "nosniff");
  const filename = `maple-${item.kind}-draft-${String(item._id).slice(-8)}-v${item.revision}.${format}`;
  res.setHeader("content-disposition", `attachment; filename="${filename}"`);
  if (format === "html") res.type("html").send(renderHtml(d));
  else if (format === "docx")
    res
      .type(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      )
      .send(await renderDocx(d));
  else
    res
      .type("text/plain")
      .send(`${d.title}\nDRAFT FOR REVIEW\n\n${d.subject}\n\n${d.body}`);
});
