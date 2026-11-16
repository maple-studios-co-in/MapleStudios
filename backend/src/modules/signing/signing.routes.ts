import { Router, type Request, type Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../../lib/AppError.js";
import { authenticate, requireRecentMfa } from "../../middleware/auth.js";
import { noLegacy, requireBusinessManager, requireBusinessOwner } from "../business/business.access.js";
import { id as objectId, listQuery } from "../business/business.schema.js";
import { Envelope } from "./signing.model.js";
import {
  closeInput, codeInput, counterInput, holdInput, issueInput, linkInput, linkSecret, previewInput, purgeInput, signInput, verifyInput,
} from "./signing.schema.js";
import {
  acceptAgreement, changeHold, clientDocument, closeAgreement, countersignAgreement,
  executedPdf, issueAgreement, manageLink, purgeAgreement, sendCode,
  signerDocument, signingEligibility, signingPreview, staffView, verifyCode,
} from "./signing.service.js";

export const staffSigningRoutes = Router();
export const publicSigningRoutes = Router();

function confidential(_req: Request, res: Response, next: () => void) {
  res.set({
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
  });
  next();
}

const staffId = (req: Request) => objectId.parse(req.params.id).toLowerCase();
function publicId(req: Request) {
  const id = objectId.safeParse(req.params.id);
  if (!id.success) throw AppError.notFound();
  return id.data.toLowerCase();
}
function clientToken(req: Request) {
  const header = req.get("authorization");
  const match = header?.startsWith("Bearer ") && linkSecret.safeParse(header.slice(7));
  if (!match || !match.success) throw AppError.unauthorized("Open your private link and verify by email.");
  return match.data;
}

// PDF bytes are served only as an attachment after authorization.
async function sendPdf(res: Response, id: string, token?: string) {
  const result = await executedPdf(id, token);
  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="maple-agreement-${id}.pdf"`,
    "X-Agreement-Pdf-Sha256": result.hash,
  });
  res.send(result.bytes);
}

staffSigningRoutes.use(confidential, authenticate, noLegacy, requireBusinessManager);
staffSigningRoutes.get("/", async (req, res) => {
  const { page, limit } = listQuery.parse(req.query);
  const [items, total] = await Promise.all([
    Envelope.find().select("-otp -session -events").sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Envelope.countDocuments(),
  ]);
  res.json({ items: items.map(item => staffView(item)), meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } });
});
staffSigningRoutes.get("/eligibility", async (_req, res) => { res.json(await signingEligibility()); });
staffSigningRoutes.post("/preview", async (req, res) => {
  const { snapshot, contentHash } = await signingPreview(previewInput.parse(req.body));
  res.json({ document: signerDocument(snapshot), contentHash });
});
staffSigningRoutes.post("/", async (req, res) => {
  res.status(201).json(await issueAgreement(issueInput.parse(req.body), req.admin!.id));
});
staffSigningRoutes.get("/:id", async (req, res) => {
  const row = await Envelope.findById(staffId(req)).select("-otp -session").lean();
  if (!row) throw AppError.notFound("Agreement not found.");
  res.json({ item: staffView(row, true) });
});
staffSigningRoutes.get("/:id/pdf", async (req, res) => { await sendPdf(res, staffId(req)); });
staffSigningRoutes.post("/:id/link", async (req, res) => {
  res.json(await manageLink(staffId(req), req.admin!.id, linkInput.parse(req.body).days));
});
staffSigningRoutes.delete("/:id/link", async (req, res) => {
  res.json(await manageLink(staffId(req), req.admin!.id));
});
staffSigningRoutes.post("/:id/countersign", requireBusinessOwner, requireRecentMfa, async (req, res) => {
  res.json({ item: await countersignAgreement(staffId(req), req.admin!, counterInput.parse(req.body)) });
});
staffSigningRoutes.post("/:id/close", requireBusinessOwner, requireRecentMfa, async (req, res) => {
  res.json({ item: await closeAgreement(staffId(req), req.admin!.id, closeInput.parse(req.body).reason) });
});
staffSigningRoutes.patch("/:id/hold", requireBusinessOwner, requireRecentMfa, async (req, res) => {
  const { held, reason } = holdInput.parse(req.body);
  res.json({ item: await changeHold(staffId(req), req.admin!.id, held, reason) });
});
staffSigningRoutes.post("/:id/purge", requireBusinessOwner, requireRecentMfa, async (req, res) => {
  purgeInput.parse(req.body);
  res.json({ item: await purgeAgreement(staffId(req)) });
});

publicSigningRoutes.use(confidential);
publicSigningRoutes.post("/:id/code", async (req, res) => {
  res.json(await sendCode(publicId(req), codeInput.parse(req.body).secret));
});
publicSigningRoutes.post("/:id/verify", async (req, res) => {
  const { secret, code } = verifyInput.parse(req.body);
  res.json(await verifyCode(publicId(req), secret, code));
});
publicSigningRoutes.get("/:id/document", async (req, res) => {
  res.json(await clientDocument(publicId(req), clientToken(req)));
});
publicSigningRoutes.post("/:id/sign", async (req, res) => {
  res.json(await acceptAgreement(publicId(req), clientToken(req), signInput.parse(req.body)));
});
publicSigningRoutes.get("/:id/pdf", async (req, res) => {
  await sendPdf(res, publicId(req), clientToken(req));
});

// The global fallback includes originalUrl, which could contain a mistyped link.
for (const routes of [publicSigningRoutes, staffSigningRoutes]) {
  routes.use((_req, _res, next) => next(AppError.notFound()));
  routes.use((error: unknown, _req: Request, res: Response, next: (error: unknown) => void) => {
    if (error instanceof ZodError || error instanceof AppError) return next(error);
    // Database/provider errors can include full agreement or credential values.
    res.status(503).json({ code: "UNAVAILABLE", error: "Private signing is temporarily unavailable." });
  });
}
