import { Router } from "express";
import { validate, body, params, query } from "../../middleware/validate.js";
import { requireAdmin } from "../../middleware/auth.js";
import { socialAccountWire } from "./account.model.js";
import { socialPostWire } from "./post.model.js";
import {
  callbackQuery,
  createPostSchema,
  idParam,
  listPostsQuery,
  patchPostSchema,
  platformParam,
  scheduleSchema,
} from "./social.schema.js";
import * as social from "./social.service.js";

/** Public: where the OAuth provider sends the browser back. */
export const publicSocialRoutes = Router();

publicSocialRoutes.get(
  "/connect/:platform/callback",
  validate({ params: platformParam, query: callbackQuery }),
  async (req, res) => {
    const { platform } = params(req, platformParam);
    const target = await social.finishConnect(platform, query(req, callbackQuery));
    res.redirect(302, target);
  }
);

/** Admin: accounts, connect, and the post calendar. */
export const adminSocialRoutes = Router();
adminSocialRoutes.use(requireAdmin);

adminSocialRoutes.get("/social/accounts", async (_req, res) => {
  const items = await social.listAccounts();
  res.json({ items: items.map((a) => socialAccountWire(a)) });
});

adminSocialRoutes.delete("/social/accounts/:id", validate({ params: idParam }), async (req, res) => {
  const { id } = params(req, idParam);
  await social.deleteAccount(id);
  res.json({ ok: true });
});

adminSocialRoutes.get("/social/connect/:platform", validate({ params: platformParam }), async (req, res) => {
  const { platform } = params(req, platformParam);
  res.json(await social.startConnect(platform));
});

adminSocialRoutes.get("/social/posts", validate({ query: listPostsQuery }), async (req, res) => {
  const items = await social.listPosts(query(req, listPostsQuery));
  res.json({ items: items.map((p) => socialPostWire(p)) });
});

adminSocialRoutes.post("/social/posts", validate({ body: createPostSchema }), async (req, res) => {
  const created = await social.createPost(body(req, createPostSchema));
  res.status(201).json({ item: socialPostWire(created) });
});

adminSocialRoutes.get("/social/posts/:id", validate({ params: idParam }), async (req, res) => {
  const { id } = params(req, idParam);
  res.json({ item: socialPostWire(await social.getPost(id)) });
});

adminSocialRoutes.patch(
  "/social/posts/:id",
  validate({ params: idParam, body: patchPostSchema }),
  async (req, res) => {
    const { id } = params(req, idParam);
    const updated = await social.updatePost(id, body(req, patchPostSchema));
    res.json({ item: socialPostWire(updated) });
  }
);

adminSocialRoutes.delete("/social/posts/:id", validate({ params: idParam }), async (req, res) => {
  const { id } = params(req, idParam);
  await social.deletePost(id);
  res.json({ ok: true });
});

adminSocialRoutes.post(
  "/social/posts/:id/schedule",
  validate({ params: idParam, body: scheduleSchema }),
  async (req, res) => {
    const { id } = params(req, idParam);
    const { scheduledAt } = body(req, scheduleSchema);
    res.json({ item: socialPostWire(await social.schedulePost(id, scheduledAt)) });
  }
);

adminSocialRoutes.post("/social/posts/:id/publish-now", validate({ params: idParam }), async (req, res) => {
  const { id } = params(req, idParam);
  res.json({ item: socialPostWire(await social.publishNow(id)) });
});

adminSocialRoutes.post("/social/posts/:id/cancel", validate({ params: idParam }), async (req, res) => {
  const { id } = params(req, idParam);
  res.json({ item: socialPostWire(await social.cancelPost(id)) });
});
