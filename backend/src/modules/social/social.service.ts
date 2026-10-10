import { DateTime } from "luxon";
import { env } from "../../config/env.js";
import { AppError } from "../../lib/AppError.js";
import { decrypt, encrypt } from "../../lib/crypto.js";
import { logger } from "../../lib/logger.js";
import { registerTick } from "../../lib/scheduler.js";
import {
  getPublisher,
  registerPublisher,
  PublishError,
  PLATFORM_LABEL,
  TEXT_LIMIT,
  type Platform,
} from "../../lib/social/types.js";
import { xPublisher } from "../../lib/social/x.js";
import { instagramPublisher } from "../../lib/social/instagram.js";
import { linkedinPublisher } from "../../lib/social/linkedin.js";
import { SocialAccount, type SocialAccountDoc } from "./account.model.js";
import { SocialPost, type PostResult, type PostStatus, type SocialPostDoc } from "./post.model.js";
import {
  authorizeUrl,
  completeConnection,
  consumeState,
  consoleUrl,
  platformConfig,
  refreshXToken,
  OAuthError,
  type ResolvedAccount,
} from "./oauth.js";
import type { CreatePostInput, ListPostsQuery, PatchPostInput } from "./social.schema.js";

// The real publishers. Tests swap fakes in with setPublisher().
registerPublisher("x", xPublisher);
registerPublisher("instagram", instagramPublisher);
registerPublisher("linkedin", linkedinPublisher);

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export async function listAccounts() {
  return SocialAccount.find().sort({ platform: 1, connectedAt: -1 }).exec();
}

/** Disconnect. The provider-side grant is left for the operator to revoke in their own settings. */
export async function deleteAccount(id: string): Promise<void> {
  const deleted = await SocialAccount.findByIdAndDelete(id).exec();
  if (!deleted) throw AppError.notFound("That account is no longer connected.");
}

export async function startConnect(platform: Platform): Promise<{ url: string }> {
  return { url: await authorizeUrl(platform) };
}

export interface CallbackQuery {
  code?: string;
  state?: string;
  error?: string;
}

/**
 * The provider redirects the browser here. Whatever happens, the answer is a
 * console URL: `?connected=<platform>` or `?error=<code>`. Details go to the
 * log, never into the URL.
 */
export async function finishConnect(platform: Platform, q: CallbackQuery): Promise<string> {
  if (q.error) return consoleUrl("error=denied");
  if (!q.code || !q.state) return consoleUrl("error=invalid_state");

  const state = await consumeState(platform, q.state);
  if (!state) return consoleUrl("error=invalid_state");

  try {
    const resolved = await completeConnection(platform, q.code, state.codeVerifier);
    await upsertAccount(platform, resolved);
    return consoleUrl(`connected=${platform}`);
  } catch (err) {
    logger.warn({ err, platform }, "social: connect failed");
    const code =
      err instanceof OAuthError
        ? err.code
        : err instanceof AppError && err.code === "NOT_CONFIGURED"
          ? "not_configured"
          : "connect_failed";
    return consoleUrl(`error=${code}`);
  }
}

async function upsertAccount(platform: Platform, acct: ResolvedAccount, now = new Date()) {
  const { tokens } = acct;
  return SocialAccount.findOneAndUpdate(
    { platform, externalId: acct.externalId },
    {
      $set: {
        handle: acct.handle,
        displayName: acct.displayName,
        ...(acct.avatarUrl ? { avatarUrl: acct.avatarUrl } : {}),
        scopes: tokens.scopes,
        expiresAt: tokens.expiresAt,
        status: "connected",
        accessTokenEnc: encrypt(tokens.accessToken),
        ...(tokens.refreshToken ? { refreshTokenEnc: encrypt(tokens.refreshToken) } : {}),
        meta: acct.meta,
        connectedAt: now,
      },
      // A reconnect without a refresh token must not keep a stale one around.
      ...(tokens.refreshToken ? {} : { $unset: { refreshTokenEnc: 1 } }),
    },
    { upsert: true, new: true }
  ).exec();
}

// ---------------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------------

const MAX_CALENDAR_ITEMS = 500;

export async function listPosts({ from, to, platform, status }: ListPostsQuery) {
  const filter: Record<string, unknown> = {};
  if (platform) filter.platforms = platform;
  if (status) filter.status = status;

  // Calendar days are the studio's days, not UTC's.
  const zone = env.STUDIO_TIMEZONE;
  const range: Record<string, Date> = {};
  if (from) {
    const start = DateTime.fromISO(from, { zone });
    if (!start.isValid) throw AppError.badRequest("Invalid `from` date.");
    range.$gte = start.startOf("day").toJSDate();
  }
  if (to) {
    const end = DateTime.fromISO(to, { zone });
    if (!end.isValid) throw AppError.badRequest("Invalid `to` date.");
    range.$lt = end.plus({ days: 1 }).startOf("day").toJSDate();
  }
  // Drafts have no slot yet; they sit on the day they were written.
  if (from || to) filter.$or = [{ scheduledAt: range }, { scheduledAt: null, createdAt: range }];

  return SocialPost.find(filter).sort({ scheduledAt: 1, createdAt: 1 }).limit(MAX_CALENDAR_ITEMS).exec();
}

export async function getPost(id: string): Promise<SocialPostDoc> {
  const post = await SocialPost.findById(id).exec();
  if (!post) throw AppError.notFound("That post no longer exists.");
  return post;
}

/**
 * Everything that would make a publish fail for reasons visible now. Called
 * when a post is scheduled or published, never when a draft is saved.
 */
export function assertPublishable(post: { text: string; mediaUrls: string[]; platforms: Platform[] }) {
  const length = [...post.text].length;
  for (const platform of post.platforms) {
    if (platform === "instagram" && post.mediaUrls.length === 0) {
      throw AppError.badRequest(
        "Instagram needs at least one image URL — add a media URL or drop Instagram from this post."
      );
    }
    if (length > TEXT_LIMIT[platform]) {
      throw AppError.badRequest(
        `${PLATFORM_LABEL[platform]} allows ${TEXT_LIMIT[platform]} characters; this post has ${length}.`
      );
    }
  }
}

/** A minute of grace for clock skew between the operator's browser and the server. */
function assertFuture(at: Date, now: Date) {
  if (at.getTime() < now.getTime() - 60_000) throw AppError.badRequest("Pick a time in the future.");
}

function assertEditable(post: SocialPostDoc) {
  if (post.status === "publishing") throw AppError.conflict("This post is being published right now.");
  if (post.status === "published") {
    throw AppError.conflict("This post has already been published — create a new one instead.");
  }
}

export async function createPost(input: CreatePostInput, now = new Date()) {
  if (input.scheduledAt) {
    assertPublishable(input);
    assertFuture(input.scheduledAt, now);
  }
  return SocialPost.create({
    text: input.text,
    mediaUrls: input.mediaUrls,
    platforms: input.platforms,
    scheduledAt: input.scheduledAt ?? null,
    status: input.scheduledAt ? "scheduled" : "draft",
    results: [],
  });
}

export async function updatePost(id: string, patch: PatchPostInput, now = new Date()) {
  const post = await getPost(id);
  assertEditable(post);

  if (patch.text !== undefined) post.text = patch.text;
  if (patch.mediaUrls !== undefined) post.mediaUrls = patch.mediaUrls;
  if (patch.platforms !== undefined) post.platforms = patch.platforms;
  if (patch.scheduledAt === null) {
    post.scheduledAt = null;
    if (post.status === "scheduled") post.status = "draft";
  } else if (patch.scheduledAt) {
    assertFuture(patch.scheduledAt, now);
    post.scheduledAt = patch.scheduledAt;
    post.status = "scheduled";
  }
  // Editing a scheduled post must not sneak past the checks scheduling ran.
  if (post.status === "scheduled") assertPublishable(post);

  await post.save();
  return post;
}

export async function deletePost(id: string): Promise<void> {
  const post = await getPost(id);
  if (post.status === "publishing") throw AppError.conflict("This post is being published right now.");
  await post.deleteOne();
}

export async function schedulePost(id: string, scheduledAt: Date, now = new Date()) {
  const post = await getPost(id);
  assertEditable(post);
  assertFuture(scheduledAt, now);
  assertPublishable(post);
  post.scheduledAt = scheduledAt;
  post.status = "scheduled";
  await post.save();
  return post;
}

export async function cancelPost(id: string) {
  const post = await getPost(id);
  if (post.status !== "scheduled") throw AppError.conflict("Only a scheduled post can be cancelled.");
  // The slot is kept so the draft still shows where it was on the calendar.
  post.status = "draft";
  await post.save();
  return post;
}

/** The transition into `publishing` is atomic so two ticks (or a tick and publish-now) cannot both send. */
async function claim(id: string, from: PostStatus[]): Promise<SocialPostDoc | null> {
  return SocialPost.findOneAndUpdate(
    { _id: id, status: { $in: from } },
    { $set: { status: "publishing" } },
    { new: true }
  ).exec();
}

export async function publishNow(id: string, now = new Date()) {
  const post = await getPost(id);
  assertEditable(post);
  assertPublishable(post);
  const claimed = await claim(id, ["draft", "scheduled", "failed", "partial"]);
  if (!claimed) throw AppError.conflict("This post changed state — reload and try again.");
  // Give it a slot so the calendar shows when it actually went out.
  if (!claimed.scheduledAt) claimed.scheduledAt = now;
  return publishPost(claimed, now);
}

// ---------------------------------------------------------------------------
// The publish path — shared by the tick and publish-now
// ---------------------------------------------------------------------------

/** Refresh when this close to expiry, so a token never dies mid-publish. */
const REFRESH_WINDOW_MS = 5 * 60_000;
/** A post left in `publishing` this long was interrupted; let the operator at it again. */
const STUCK_MS = 15 * 60_000;
const DUE_BATCH = 25;

export async function runSocialTick(now: Date): Promise<void> {
  // A crash mid-publish would otherwise lock a post forever (PATCH and DELETE
  // refuse while publishing).
  await SocialPost.updateMany(
    { status: "publishing", updatedAt: { $lt: new Date(now.getTime() - STUCK_MS) } },
    { $set: { status: "failed" } }
  ).exec();

  const due = await SocialPost.find({ status: "scheduled", scheduledAt: { $lte: now } })
    .sort({ scheduledAt: 1 })
    .limit(DUE_BATCH)
    .exec();

  for (const post of due) {
    const claimed = await claim(String(post._id), ["scheduled"]);
    if (!claimed) continue;
    try {
      await publishPost(claimed, now);
    } catch (err) {
      logger.error({ err, post: String(post._id) }, "social: publish failed");
      await SocialPost.updateOne({ _id: post._id, status: "publishing" }, { $set: { status: "failed" } }).exec();
    }
  }
}

registerTick("social", runSocialTick);

async function publishPost(post: SocialPostDoc, now: Date): Promise<SocialPostDoc> {
  const previous = new Map(post.results.map((r) => [r.platform, r]));
  const results: PostResult[] = [];
  for (const platform of post.platforms) {
    const earlier = previous.get(platform);
    // Retrying a partial post must not post twice to the platforms that worked.
    if (earlier?.status === "published") {
      results.push(earlier);
      continue;
    }
    results.push(await publishTo(platform, post, now));
  }

  const ok = results.filter((r) => r.status === "published").length;
  post.results = results;
  post.status = ok === results.length ? "published" : ok > 0 ? "partial" : "failed";
  if (post.status === "published") post.publishedAt = now;
  await post.save();
  return post;
}

const failed = (platform: Platform, error: string): PostResult => ({
  platform,
  status: "failed",
  error: error.slice(0, 1000),
  publishedAt: null,
});

async function publishTo(platform: Platform, post: SocialPostDoc, now: Date): Promise<PostResult> {
  const label = PLATFORM_LABEL[platform];
  const account = await SocialAccount.findOne({ platform, status: "connected" })
    .sort({ connectedAt: -1 })
    .select("+accessTokenEnc +refreshTokenEnc")
    .exec();

  if (!account) {
    const known = await SocialAccount.exists({ platform }).exec();
    return failed(
      platform,
      known
        ? `${label} account needs reconnecting — open the Social page and connect it again.`
        : `No ${label} account is connected.`
    );
  }

  try {
    const accessToken = await freshAccessToken(account, now);
    const published = await getPublisher(platform).publish(
      {
        platform,
        externalId: account.externalId,
        handle: account.handle,
        accessToken,
        meta: {
          pageId: account.meta?.pageId,
          igUserId: account.meta?.igUserId,
          personUrn: account.meta?.personUrn,
        },
      },
      { text: post.text, mediaUrls: post.mediaUrls }
    );
    return { platform, status: "published", externalId: published.externalId, url: published.url, publishedAt: now };
  } catch (err) {
    // A provider refusing the token after our own expiry check passed means it was revoked.
    if (err instanceof PublishError && err.kind === "reconnect" && account.status === "connected") {
      account.status = "revoked";
      await account.save();
    }
    logger.warn({ err, platform, post: String(post._id) }, "social: platform publish failed");
    return failed(platform, err instanceof Error ? err.message : String(err));
  }
}

/**
 * The decrypted access token, refreshed first when it is about to expire.
 * Only X hands out refresh tokens (offline.access); LinkedIn and Meta tokens
 * simply expire and the operator reconnects.
 */
async function freshAccessToken(account: SocialAccountDoc, now: Date): Promise<string> {
  const label = PLATFORM_LABEL[account.platform];
  const reconnect = (why: string) =>
    new PublishError("reconnect", `${label} ${why} — reconnect the account from the Social page.`);

  if (!account.accessTokenEnc) throw reconnect("connection has no stored token");
  const msLeft = account.expiresAt ? account.expiresAt.getTime() - now.getTime() : Infinity;
  if (msLeft > REFRESH_WINDOW_MS) return decrypt(account.accessTokenEnc);

  const config = account.platform === "x" ? platformConfig("x") : null;
  if (config && account.refreshTokenEnc) {
    try {
      const fresh = await refreshXToken(config, decrypt(account.refreshTokenEnc));
      account.accessTokenEnc = encrypt(fresh.accessToken);
      if (fresh.refreshToken) account.refreshTokenEnc = encrypt(fresh.refreshToken);
      account.expiresAt = fresh.expiresAt;
      await account.save();
      return fresh.accessToken;
    } catch (err) {
      logger.warn({ err }, "social: X token refresh failed");
      account.status = "expired";
      await account.save();
      throw reconnect("token could not be refreshed");
    }
  }

  if (msLeft <= 0) {
    account.status = "expired";
    await account.save();
    throw reconnect("access token has expired");
  }
  // Inside the window but still valid, and nothing to refresh with: try anyway.
  return decrypt(account.accessTokenEnc);
}
