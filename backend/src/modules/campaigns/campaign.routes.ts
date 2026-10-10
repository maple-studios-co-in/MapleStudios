import express, { Router, type Request, type Response } from "express";
import { validate, body, params, query } from "../../middleware/validate.js";
import { requireAdmin } from "../../middleware/auth.js";
import { AppError } from "../../lib/AppError.js";
import { env } from "../../config/env.js";
import { campaignWire } from "./campaign.model.js";
import { suppressionWire } from "./suppression.model.js";
import {
  audienceSchema,
  campaignIdParam,
  createCampaignSchema,
  createSuppressionSchema,
  listCampaignsQuery,
  listMessagesQuery,
  listSuppressionsQuery,
  patchCampaignSchema,
  previewQuery,
  suppressionIdParam,
} from "./campaign.schema.js";
import * as campaigns from "./campaign.service.js";

// --- public: the two URLs that appear in emails and at the provider --------

export const publicCampaignRoutes = Router();

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A plain page the recipient can read without styles, scripts or a brand lookup. */
function page(title: string, message: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>
  body { margin: 0; padding: 15vh 24px; font: 17px/1.5 -apple-system, "Segoe UI", Roboto, sans-serif; color: #1f2a37; background: #fafaf7; }
  main { max-width: 32rem; margin: 0 auto; }
  h1 { font-size: 1.6rem; margin: 0 0 .5rem; }
  p { margin: 0; color: #4b5563; }
  footer { margin-top: 2.5rem; font-size: .85rem; color: #8b93a1; }
</style>
</head>
<body>
<main>
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(message)}</p>
  <footer>${escapeHtml(env.MAIL_FROM_NAME)}</footer>
</main>
</body>
</html>
`;
}

const UNSUBSCRIBED_PAGE = page("You're unsubscribed", "You won't receive any more emails from us. Sorry to have bothered you.");
const NOT_FOUND_PAGE = page("Link not recognised", "This unsubscribe link is incomplete or has expired. Reply to the email you received and we'll take care of it by hand.");

/** GET for people, POST for mail clients' one-click (RFC 8058). Same answer. */
async function unsubscribe(req: Request, res: Response) {
  const token = String(req.params.token ?? "");
  // A forged or truncated token must look exactly like a stale one.
  const ok = token.length > 0 && token.length <= 300 && (await campaigns.unsubscribeByToken(token));
  res.status(ok ? 200 : 404).type("html").send(ok ? UNSUBSCRIBED_PAGE : NOT_FOUND_PAGE);
}

publicCampaignRoutes.get("/unsubscribe/:token", unsubscribe);
publicCampaignRoutes.post("/unsubscribe/:token", unsubscribe);

/**
 * The bytes Svix signed. app.ts parses JSON before this router runs, so the
 * raw parser on the route only sees an already-read stream; a `rawBody`
 * captured by a `verify` hook on express.json is preferred when present.
 * Failing both, the parsed body is re-serialised - byte-exact for the compact
 * JSON Resend emits, though not something every producer guarantees.
 */
function rawBodyOf(req: Request): string {
  if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
  const captured = (req as { rawBody?: unknown }).rawBody;
  if (Buffer.isBuffer(captured)) return captured.toString("utf8");
  if (typeof captured === "string") return captured;
  return req.body === undefined ? "" : JSON.stringify(req.body);
}

publicCampaignRoutes.post(
  "/webhooks/resend",
  express.raw({ type: "application/json", limit: "1mb" }),
  async (req, res) => {
    const secret = campaigns.resendWebhookSecret();
    if (!secret) {
      throw new AppError(503, "NOT_CONFIGURED", "RESEND_WEBHOOK_SECRET is not set; delivery events are not being recorded.");
    }
    const raw = rawBodyOf(req);
    const verified = campaigns.verifySvixSignature(
      { id: req.get("svix-id"), timestamp: req.get("svix-timestamp"), signature: req.get("svix-signature") },
      raw,
      secret
    );
    if (!verified) throw AppError.unauthorized("Webhook signature did not verify.");

    let event: unknown;
    try {
      event = JSON.parse(raw);
    } catch {
      throw AppError.badRequest("Invalid JSON body.");
    }
    res.json({ ok: true, ...(await campaigns.handleResendEvent(event)) });
  }
);

// --- admin ----------------------------------------------------------------

export const adminCampaignRoutes = Router();
adminCampaignRoutes.use(requireAdmin);

adminCampaignRoutes.get("/campaigns", validate({ query: listCampaignsQuery }), async (req, res) => {
  const { items, total, page: p, limit, pages } = await campaigns.listCampaigns(query(req, listCampaignsQuery));
  res.json({ items: items.map((c) => campaignWire(c)), meta: { total, page: p, limit, pages } });
});

adminCampaignRoutes.post("/campaigns", validate({ body: createCampaignSchema }), async (req, res) => {
  const created = await campaigns.createCampaign(body(req, createCampaignSchema));
  res.status(201).json({ item: campaignWire(created) });
});

/** Live recipient count for the composer, before anything is saved. */
adminCampaignRoutes.post("/campaigns/audience/count", validate({ body: audienceSchema }), async (req, res) => {
  res.json(await campaigns.countAudience(body(req, audienceSchema)));
});

adminCampaignRoutes.get("/campaigns/:id", validate({ params: campaignIdParam }), async (req, res) => {
  const { id } = params(req, campaignIdParam);
  res.json({ item: campaignWire(await campaigns.getCampaign(id)) });
});

adminCampaignRoutes.patch(
  "/campaigns/:id",
  validate({ params: campaignIdParam, body: patchCampaignSchema }),
  async (req, res) => {
    const { id } = params(req, campaignIdParam);
    const updated = await campaigns.updateCampaign(id, body(req, patchCampaignSchema));
    res.json({ item: campaignWire(updated) });
  }
);

adminCampaignRoutes.delete("/campaigns/:id", validate({ params: campaignIdParam }), async (req, res) => {
  const { id } = params(req, campaignIdParam);
  await campaigns.deleteCampaign(id);
  res.json({ ok: true });
});

const lifecycle = {
  start: campaigns.startCampaign,
  pause: campaigns.pauseCampaign,
  resume: campaigns.resumeCampaign,
  cancel: campaigns.cancelCampaign,
} as const;

for (const [action, run] of Object.entries(lifecycle)) {
  adminCampaignRoutes.post(`/campaigns/:id/${action}`, validate({ params: campaignIdParam }), async (req, res) => {
    const { id } = params(req, campaignIdParam);
    res.json({ item: campaignWire(await run(id)) });
  });
}

adminCampaignRoutes.get(
  "/campaigns/:id/preview",
  validate({ params: campaignIdParam, query: previewQuery }),
  async (req, res) => {
    const { id } = params(req, campaignIdParam);
    const { limit } = query(req, previewQuery);
    res.json(await campaigns.previewCampaign(id, limit));
  }
);

adminCampaignRoutes.get(
  "/campaigns/:id/messages",
  validate({ params: campaignIdParam, query: listMessagesQuery }),
  async (req, res) => {
    const { id } = params(req, campaignIdParam);
    const { items, total, page: p, limit, pages } = await campaigns.listMessages(id, query(req, listMessagesQuery));
    res.json({ items, meta: { total, page: p, limit, pages } });
  }
);

adminCampaignRoutes.get("/suppressions", validate({ query: listSuppressionsQuery }), async (req, res) => {
  const { items, total, page: p, limit, pages } = await campaigns.listSuppressions(query(req, listSuppressionsQuery));
  res.json({ items: items.map((s) => suppressionWire(s)), meta: { total, page: p, limit, pages } });
});

adminCampaignRoutes.post("/suppressions", validate({ body: createSuppressionSchema }), async (req, res) => {
  const { email, note } = body(req, createSuppressionSchema);
  res.status(201).json({ item: suppressionWire(await campaigns.addSuppression(email, note)) });
});

adminCampaignRoutes.delete("/suppressions/:id", validate({ params: suppressionIdParam }), async (req, res) => {
  const { id } = params(req, suppressionIdParam);
  await campaigns.removeSuppression(id);
  res.json({ ok: true });
});
