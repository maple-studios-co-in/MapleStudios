import crypto from "node:crypto";
import request from "supertest";
import { DateTime } from "luxon";
import { afterEach, describe, expect, it, vi } from "vitest";

// Imports are hoisted above everything else in this file and env.ts reads
// process.env the moment it loads, so the platform credentials have to exist
// before that. Instagram stays unconfigured on purpose: it is the 503 case.
vi.hoisted(() => {
  process.env.X_CLIENT_ID = "x-client";
  process.env.X_CLIENT_SECRET = "x-secret";
  process.env.LINKEDIN_CLIENT_ID = "li-client";
  process.env.LINKEDIN_CLIENT_SECRET = "li-secret";
  delete process.env.META_APP_ID;
  delete process.env.META_APP_SECRET;
});

import { createApp } from "../app.js";
import { env } from "../config/env.js";
import { signAccessToken } from "../middleware/auth.js";
import { decrypt, encrypt, readSignedId } from "../lib/crypto.js";
import { studioToday } from "../lib/time.js";
import {
  PublishError,
  setPublisher,
  setSocialHttp,
  type Platform,
  type Publisher,
  type PublisherAccount,
  type PublisherPost,
  type PublishResult,
} from "../lib/social/types.js";
import { X_API, xPublisher } from "../lib/social/x.js";
import { LINKEDIN_API, LINKEDIN_VERSION, linkedinPublisher, toLittleText } from "../lib/social/linkedin.js";
import { META_API, instagramPublisher } from "../lib/social/instagram.js";
import { SocialAccount, type ISocialAccount } from "../modules/social/account.model.js";
import { SocialPost, type ISocialPost } from "../modules/social/post.model.js";
import { OAuthError, SocialOAuthState, completeConnection } from "../modules/social/oauth.js";
import { runSocialTick } from "../modules/social/social.service.js";

const app = createApp();
const auth = {
  authorization: `Bearer ${signAccessToken({ sub: "test-admin", email: "owner@maplestudios.co.in", role: "owner", ver: 1 })}`,
};
const admin = "/api/v1/admin/social";
const consoleUrl = (q: string) => `${env.PUBLIC_BASE_URL}/admin/social?${q}`;

// --- scripted HTTP: every provider call is answered here, none leaves the box ---

interface Call {
  url: URL;
  init?: RequestInit;
  headers: Headers;
}

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...headers } });

const endpoint = (url: URL) => `${url.origin}${url.pathname}`;
const formOf = (init?: RequestInit) => new URLSearchParams(String(init?.body ?? ""));
const jsonOf = (init?: RequestInit) => JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;

function scriptHttp(handler: (url: URL, init?: RequestInit) => Response | undefined) {
  const calls: Call[] = [];
  setSocialHttp(async (raw, init) => {
    const url = new URL(raw);
    calls.push({ url, init, headers: new Headers(init?.headers) });
    const res = handler(url, init);
    if (!res) throw new Error(`unexpected request ${init?.method ?? "GET"} ${raw}`);
    return res;
  });
  return calls;
}

function fakePublisher(outcome: PublishResult | Error) {
  const calls: Array<{ account: PublisherAccount; post: PublisherPost }> = [];
  const impl: Publisher = {
    async publish(account, post) {
      calls.push({ account, post });
      if (outcome instanceof Error) throw outcome;
      return outcome;
    },
  };
  return { impl, calls };
}

const META: Record<Platform, ISocialAccount["meta"]> = {
  x: {},
  instagram: { pageId: "p1", igUserId: "ig1" },
  linkedin: { personUrn: "urn:li:person:abc" },
};

function connectedAccount(platform: Platform, overrides: Partial<ISocialAccount> = {}) {
  return SocialAccount.create({
    platform,
    externalId: `${platform}-1`,
    handle: `maple-${platform}`,
    displayName: "Maple Studios",
    scopes: [],
    expiresAt: new Date(Date.now() + 3_600_000),
    status: "connected",
    accessTokenEnc: encrypt(`${platform}-token`),
    meta: META[platform],
    connectedAt: new Date(),
    ...overrides,
  });
}

/** A scheduled post that is already due. */
function duePost(overrides: Partial<ISocialPost> = {}) {
  return SocialPost.create({
    text: "Hello from Maple",
    mediaUrls: [],
    platforms: ["x"],
    status: "scheduled",
    scheduledAt: new Date(Date.now() - 60_000),
    results: [],
    ...overrides,
  });
}

const publisherAccount = (platform: Platform, overrides: Partial<PublisherAccount> = {}): PublisherAccount => ({
  platform,
  externalId: "1",
  handle: "maple",
  accessToken: "tok",
  meta: META[platform],
  ...overrides,
});

afterEach(() => {
  setSocialHttp(null);
  for (const p of ["x", "instagram", "linkedin"] as const) setPublisher(p, null);
});

describe("social: auth", () => {
  it("requires auth on every admin route", async () => {
    expect((await request(app).get(`${admin}/accounts`)).status).toBe(401);
    expect((await request(app).get(`${admin}/posts`)).status).toBe(401);
    expect((await request(app).get(`${admin}/connect/x`)).status).toBe(401);
  });
});

describe("social: connect", () => {
  it("answers 503 NOT_CONFIGURED for a platform without credentials", async () => {
    const res = await request(app).get(`${admin}/connect/instagram`).set(auth);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("NOT_CONFIGURED");
    expect(res.body.error).toMatch(/META_APP_ID/);
  });

  it("builds the X authorize URL with a stored, signed state and a PKCE S256 challenge", async () => {
    const res = await request(app).get(`${admin}/connect/x`).set(auth);
    expect(res.status).toBe(200);

    const url = new URL(res.body.url);
    expect(endpoint(url)).toBe(X_API.authorize);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("x-client");
    expect(url.searchParams.get("redirect_uri")).toBe(`${env.PUBLIC_BASE_URL}/api/connect/x/callback`);
    expect(url.searchParams.get("scope")).toBe(X_API.scopes.join(" "));
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");

    const nonce = readSignedId(url.searchParams.get("state") ?? "");
    expect(nonce).toBeTruthy();
    const stored = await SocialOAuthState.findOne({ nonce }).exec();
    expect(stored?.platform).toBe("x");
    expect(stored?.codeVerifier).toBeTruthy();
    expect(stored?.expiresAt.getTime()).toBeGreaterThan(Date.now() + 9 * 60_000);
    const challenge = crypto.createHash("sha256").update(stored?.codeVerifier ?? "").digest("base64url");
    expect(url.searchParams.get("code_challenge")).toBe(challenge);
  });

  it("builds the LinkedIn authorize URL", async () => {
    const res = await request(app).get(`${admin}/connect/linkedin`).set(auth);
    const url = new URL(res.body.url);
    expect(endpoint(url)).toBe(LINKEDIN_API.authorize);
    expect(url.searchParams.get("client_id")).toBe("li-client");
    expect(url.searchParams.get("scope")).toBe("openid profile email w_member_social");
    expect(url.searchParams.get("redirect_uri")).toBe(`${env.PUBLIC_BASE_URL}/api/connect/linkedin/callback`);
    expect(readSignedId(url.searchParams.get("state") ?? "")).toBeTruthy();
  });

  it("redirects with an error for a bad, missing or foreign state", async () => {
    const bad = await request(app).get("/api/v1/connect/x/callback?code=abc&state=forged.state");
    expect(bad.status).toBe(302);
    expect(bad.headers.location).toBe(consoleUrl("error=invalid_state"));

    const missing = await request(app).get("/api/v1/connect/x/callback?code=abc");
    expect(missing.headers.location).toBe(consoleUrl("error=invalid_state"));

    // A LinkedIn state presented to the X callback is just as invalid.
    const li = await request(app).get(`${admin}/connect/linkedin`).set(auth);
    const state = new URL(li.body.url).searchParams.get("state") ?? "";
    const crossed = await request(app).get(`/api/v1/connect/x/callback?code=abc&state=${encodeURIComponent(state)}`);
    expect(crossed.headers.location).toBe(consoleUrl("error=invalid_state"));
    expect(await SocialAccount.countDocuments()).toBe(0);
  });

  it("redirects with error=denied when the user refuses", async () => {
    const res = await request(app).get("/api/v1/connect/x/callback?error=access_denied&error_description=nope");
    expect(res.headers.location).toBe(consoleUrl("error=denied"));
  });

  it("exchanges the X code with PKCE and Basic auth, stores encrypted tokens, and refuses a replay", async () => {
    const start = await request(app).get(`${admin}/connect/x`).set(auth);
    const authorize = new URL(start.body.url);
    const state = authorize.searchParams.get("state") ?? "";

    const calls = scriptHttp((url) => {
      if (endpoint(url) === X_API.token) {
        return json({
          token_type: "bearer",
          access_token: "access-1",
          refresh_token: "refresh-1",
          expires_in: 7200,
          scope: "tweet.read tweet.write users.read offline.access",
        });
      }
      if (endpoint(url) === X_API.me) {
        return json({ data: { id: "123", name: "Maple Studios", username: "maplestudios", profile_image_url: "https://pbs.example/x.jpg" } });
      }
      return undefined;
    });

    const callback = `/api/v1/connect/x/callback?code=the-code&state=${encodeURIComponent(state)}`;
    const res = await request(app).get(callback);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(consoleUrl("connected=x"));

    const token = calls.find((c) => endpoint(c.url) === X_API.token);
    expect(token?.init?.method).toBe("POST");
    expect(token?.headers.get("authorization")).toBe(`Basic ${Buffer.from("x-client:x-secret").toString("base64")}`);
    expect(token?.headers.get("content-type")).toBe("application/x-www-form-urlencoded");
    const form = formOf(token?.init);
    expect(form.get("grant_type")).toBe("authorization_code");
    expect(form.get("code")).toBe("the-code");
    expect(form.get("redirect_uri")).toBe(`${env.PUBLIC_BASE_URL}/api/connect/x/callback`);
    const verifier = form.get("code_verifier") ?? "";
    expect(crypto.createHash("sha256").update(verifier).digest("base64url")).toBe(authorize.searchParams.get("code_challenge"));

    const me = calls.find((c) => endpoint(c.url) === X_API.me);
    expect(me?.headers.get("authorization")).toBe("Bearer access-1");

    const account = await SocialAccount.findOne({ platform: "x" }).select("+accessTokenEnc +refreshTokenEnc").exec();
    expect(account?.externalId).toBe("123");
    expect(account?.handle).toBe("maplestudios");
    expect(account?.displayName).toBe("Maple Studios");
    expect(account?.status).toBe("connected");
    expect(account?.scopes).toContain("offline.access");
    expect(account?.expiresAt?.getTime()).toBeGreaterThan(Date.now() + 7000 * 1000);
    // Stored as ciphertext, recoverable with the app key.
    expect(account?.accessTokenEnc).not.toContain("access-1");
    expect(decrypt(account?.accessTokenEnc ?? "")).toBe("access-1");
    expect(decrypt(account?.refreshTokenEnc ?? "")).toBe("refresh-1");

    // The state was consumed on first use.
    const replay = await request(app).get(callback);
    expect(replay.headers.location).toBe(consoleUrl("error=invalid_state"));
  });

  it("connects LinkedIn via the form-encoded token exchange and userinfo", async () => {
    const start = await request(app).get(`${admin}/connect/linkedin`).set(auth);
    const state = new URL(start.body.url).searchParams.get("state") ?? "";

    const calls = scriptHttp((url) => {
      if (endpoint(url) === LINKEDIN_API.token) {
        return json({ access_token: "li-access", expires_in: 5_184_000, scope: "openid,profile,email,w_member_social" });
      }
      if (endpoint(url) === LINKEDIN_API.userinfo) {
        return json({ sub: "abc", name: "Aditya Agrawal", picture: "https://media.example/a.jpg", email: "a@example.com" });
      }
      return undefined;
    });

    const res = await request(app).get(`/api/v1/connect/linkedin/callback?code=li-code&state=${encodeURIComponent(state)}`);
    expect(res.headers.location).toBe(consoleUrl("connected=linkedin"));

    const form = formOf(calls[0]?.init);
    expect(form.get("grant_type")).toBe("authorization_code");
    expect(form.get("client_id")).toBe("li-client");
    expect(form.get("client_secret")).toBe("li-secret");
    expect(form.get("redirect_uri")).toBe(`${env.PUBLIC_BASE_URL}/api/connect/linkedin/callback`);
    expect(calls[1]?.headers.get("authorization")).toBe("Bearer li-access");

    const account = await SocialAccount.findOne({ platform: "linkedin" }).select("+accessTokenEnc").exec();
    expect(account?.externalId).toBe("abc");
    expect(account?.meta.personUrn).toBe("urn:li:person:abc");
    expect(account?.scopes).toEqual(["openid", "profile", "email", "w_member_social"]);
    expect(decrypt(account?.accessTokenEnc ?? "")).toBe("li-access");
  });

  it("redirects with error=exchange_failed when the provider rejects the code", async () => {
    const start = await request(app).get(`${admin}/connect/x`).set(auth);
    const state = new URL(start.body.url).searchParams.get("state") ?? "";
    scriptHttp(() => json({ error: "invalid_request" }, 400));
    const res = await request(app).get(`/api/v1/connect/x/callback?code=bad&state=${encodeURIComponent(state)}`);
    expect(res.headers.location).toBe(consoleUrl("error=exchange_failed"));
    expect(await SocialAccount.countDocuments()).toBe(0);
  });

  it("resolves an Instagram business account through the page list and keeps the page token", async () => {
    const config = { clientId: "meta-id", clientSecret: "meta-secret" };
    const calls = scriptHttp((url) => {
      const ep = endpoint(url);
      if (ep === `${META_API.graph}/oauth/access_token`) {
        return url.searchParams.get("grant_type") === "fb_exchange_token"
          ? json({ access_token: "long-token", expires_in: 5_184_000 })
          : json({ access_token: "short-token", expires_in: 5000 });
      }
      if (ep === `${META_API.graph}/me/accounts`) {
        return json({
          data: [
            { id: "p1", name: "No IG page", access_token: "pt1" },
            { id: "p2", name: "Maple Page", access_token: "pt2", instagram_business_account: { id: "ig9" } },
          ],
        });
      }
      if (ep === `${META_API.graph}/ig9`) {
        return json({ username: "maple.studios", name: "Maple Studios", profile_picture_url: "https://cdn.example/ig.jpg" });
      }
      return undefined;
    });

    const account = await completeConnection("instagram", "the-code", undefined, config);
    expect(account).toMatchObject({
      externalId: "ig9",
      handle: "maple.studios",
      displayName: "Maple Studios",
      meta: { pageId: "p2", igUserId: "ig9" },
    });
    expect(account.tokens.accessToken).toBe("pt2");
    expect(account.tokens.expiresAt).toBeNull();

    expect(calls[0]?.url.searchParams.get("code")).toBe("the-code");
    expect(calls[0]?.url.searchParams.get("client_secret")).toBe("meta-secret");
    expect(calls[1]?.url.searchParams.get("fb_exchange_token")).toBe("short-token");
    expect(calls[2]?.headers.get("authorization")).toBe("Bearer long-token");
  });

  it("fails clearly when no page has an Instagram business account", async () => {
    scriptHttp((url) => {
      if (endpoint(url) === `${META_API.graph}/oauth/access_token`) return json({ access_token: "t", expires_in: 100 });
      if (endpoint(url) === `${META_API.graph}/me/accounts`) return json({ data: [{ id: "p1", name: "Plain page", access_token: "pt1" }] });
      return undefined;
    });
    const attempt = completeConnection("instagram", "code", undefined, { clientId: "a", clientSecret: "b" });
    await expect(attempt).rejects.toBeInstanceOf(OAuthError);
    await expect(attempt).rejects.toMatchObject({ code: "no_instagram_account" });
  });
});

describe("social: accounts", () => {
  it("never puts tokens on the wire", async () => {
    await connectedAccount("x", { refreshTokenEnc: encrypt("x-refresh") });
    const res = await request(app).get(`${admin}/accounts`).set(auth);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    const item = res.body.items[0];
    expect(item).toMatchObject({ platform: "x", handle: "maple-x", status: "connected" });
    expect(item).not.toHaveProperty("accessTokenEnc");
    expect(item).not.toHaveProperty("refreshTokenEnc");
    expect(item).not.toHaveProperty("accessToken");
    expect(JSON.stringify(res.body)).not.toMatch(/token/i);
    expect(typeof item.connectedAt).toBe("string");
  });

  it("round-trips tokens through encrypt/decrypt and stores only ciphertext", async () => {
    const account = await connectedAccount("linkedin");
    const raw = await SocialAccount.findById(account._id).select("+accessTokenEnc").lean().exec();
    expect(raw?.accessTokenEnc).toMatch(/^v1\./);
    expect(raw?.accessTokenEnc).not.toContain("linkedin-token");
    expect(decrypt(raw?.accessTokenEnc ?? "")).toBe("linkedin-token");
    // Default projection leaves the ciphertext out entirely.
    const plain = await SocialAccount.findById(account._id).lean().exec();
    expect(plain?.accessTokenEnc).toBeUndefined();
  });

  it("disconnects an account", async () => {
    const account = await connectedAccount("x");
    const res = await request(app).delete(`${admin}/accounts/${account._id}`).set(auth);
    expect(res.body).toEqual({ ok: true });
    expect((await request(app).delete(`${admin}/accounts/${account._id}`).set(auth)).status).toBe(404);
  });
});

describe("social: posts", () => {
  it("creates, reads, updates, lists and deletes a draft", async () => {
    const created = await request(app)
      .post(`${admin}/posts`)
      .set(auth)
      .send({ text: "Hello world", platforms: ["x", "x", "linkedin"], mediaUrls: ["https://cdn.example.com/a.jpg"] });
    expect(created.status).toBe(201);
    const { item } = created.body;
    expect(item).toMatchObject({ text: "Hello world", status: "draft", platforms: ["x", "linkedin"], results: [], scheduledAt: null });

    const got = await request(app).get(`${admin}/posts/${item.id}`).set(auth);
    expect(got.body.item.id).toBe(item.id);

    const patched = await request(app).patch(`${admin}/posts/${item.id}`).set(auth).send({ text: "Hello again" });
    expect(patched.status).toBe(200);
    expect(patched.body.item.text).toBe("Hello again");

    const list = await request(app).get(`${admin}/posts`).set(auth);
    expect(list.body.items.map((p: { id: string }) => p.id)).toEqual([item.id]);

    expect((await request(app).delete(`${admin}/posts/${item.id}`).set(auth)).body).toEqual({ ok: true });
    expect((await request(app).get(`${admin}/posts/${item.id}`).set(auth)).status).toBe(404);
  });

  it("schedules on create when scheduledAt is given", async () => {
    const at = new Date(Date.now() + 3_600_000).toISOString();
    const res = await request(app).post(`${admin}/posts`).set(auth).send({ text: "Later", platforms: ["x"], scheduledAt: at });
    expect(res.status).toBe(201);
    expect(res.body.item.status).toBe("scheduled");
    expect(res.body.item.scheduledAt).toBe(at);
  });

  it("filters the calendar by studio-timezone day range, platform and status", async () => {
    const zone = env.STUDIO_TIMEZONE;
    const at = (iso: string) => DateTime.fromISO(iso, { zone }).toJSDate();
    const nov = await duePost({ platforms: ["x"], scheduledAt: at("2026-11-05T10:00") });
    // 00:30 on 1 Dec in the studio is still 30 Nov in UTC — it must not leak into November.
    const dec = await duePost({ platforms: ["linkedin"], scheduledAt: at("2026-12-01T00:30") });
    const draft = await SocialPost.create({ text: "Draft", mediaUrls: [], platforms: ["x"], status: "draft", results: [] });

    const ids = async (qs: string) =>
      ((await request(app).get(`${admin}/posts?${qs}`).set(auth)).body.items as Array<{ id: string }>).map((p) => p.id);

    expect(await ids("from=2026-11-01&to=2026-11-30")).toEqual([String(nov._id)]);
    expect(await ids("from=2026-12-01&to=2026-12-31")).toEqual([String(dec._id)]);
    expect(await ids("from=2026-11-01&to=2026-12-31&platform=linkedin")).toEqual([String(dec._id)]);
    expect(await ids("status=draft")).toEqual([String(draft._id)]);
    // Drafts sit on the day they were written.
    const today = studioToday();
    expect(await ids(`from=${today}&to=${today}`)).toEqual([String(draft._id)]);
    expect((await request(app).get(`${admin}/posts?from=2026-13-01`).set(auth)).status).toBe(400);
  });

  it("refuses to schedule an Instagram post without an image", async () => {
    const post = await SocialPost.create({ text: "No image", mediaUrls: [], platforms: ["instagram"], status: "draft", results: [] });
    const at = new Date(Date.now() + 3_600_000).toISOString();
    const res = await request(app).post(`${admin}/posts/${post._id}/schedule`).set(auth).send({ scheduledAt: at });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Instagram needs at least one image/);
    expect((await SocialPost.findById(post._id).exec())?.status).toBe("draft");

    const direct = await request(app)
      .post(`${admin}/posts`)
      .set(auth)
      .send({ text: "No image", platforms: ["instagram", "x"], scheduledAt: at });
    expect(direct.status).toBe(400);
    expect(direct.body.error).toMatch(/image/i);

    const ok = await request(app)
      .post(`${admin}/posts/${post._id}/schedule`)
      .set(auth)
      .send({ scheduledAt: at })
      .then(() => request(app).patch(`${admin}/posts/${post._id}`).set(auth).send({ mediaUrls: ["https://cdn.example.com/a.jpg"], scheduledAt: at }));
    expect(ok.status).toBe(200);
    expect(ok.body.item.status).toBe("scheduled");
  });

  it("validates per-platform length, future dates, https media and the platform list", async () => {
    const at = new Date(Date.now() + 3_600_000).toISOString();
    const long = await SocialPost.create({ text: "x".repeat(281), mediaUrls: [], platforms: ["x"], status: "draft", results: [] });
    const tooLong = await request(app).post(`${admin}/posts/${long._id}/schedule`).set(auth).send({ scheduledAt: at });
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error).toMatch(/X allows 280 characters/);

    const past = await request(app)
      .post(`${admin}/posts/${long._id}/schedule`)
      .set(auth)
      .send({ scheduledAt: new Date(Date.now() - 3_600_000).toISOString() });
    expect(past.status).toBe(400);
    expect(past.body.error).toMatch(/future/i);

    const http = await request(app).post(`${admin}/posts`).set(auth).send({ text: "Hi", platforms: ["x"], mediaUrls: ["http://cdn.example.com/a.jpg"] });
    expect(http.status).toBe(400);
    expect(http.body.details[0].field).toBe("mediaUrls.0");

    const none = await request(app).post(`${admin}/posts`).set(auth).send({ text: "Hi", platforms: [] });
    expect(none.status).toBe(400);
    expect(none.body.details[0].field).toBe("platforms");

    const notDate = await request(app).post(`${admin}/posts/${long._id}/schedule`).set(auth).send({ scheduledAt: "tomorrow" });
    expect(notDate.status).toBe(400);
    expect((await request(app).get(`${admin}/posts/not-an-id`).set(auth)).status).toBe(400);
  });

  it("cancels a scheduled post back to draft and keeps its slot", async () => {
    const post = await duePost({ scheduledAt: new Date(Date.now() + 3_600_000) });
    const res = await request(app).post(`${admin}/posts/${post._id}/cancel`).set(auth);
    expect(res.status).toBe(200);
    expect(res.body.item.status).toBe("draft");
    expect(res.body.item.scheduledAt).toBe(post.scheduledAt?.toISOString());
    expect((await request(app).post(`${admin}/posts/${post._id}/cancel`).set(auth)).status).toBe(409);
  });

  it("locks published and in-flight posts against edits", async () => {
    const published = await duePost({ status: "published", publishedAt: new Date() });
    expect((await request(app).patch(`${admin}/posts/${published._id}`).set(auth).send({ text: "Edit" })).status).toBe(409);
    expect((await request(app).post(`${admin}/posts/${published._id}/publish-now`).set(auth)).status).toBe(409);
    expect((await request(app).post(`${admin}/posts/${published._id}/schedule`).set(auth).send({ scheduledAt: new Date(Date.now() + 3_600_000).toISOString() })).status).toBe(409);

    const publishing = await duePost({ status: "publishing" });
    expect((await request(app).patch(`${admin}/posts/${publishing._id}`).set(auth).send({ text: "Edit" })).status).toBe(409);
    expect((await request(app).delete(`${admin}/posts/${publishing._id}`).set(auth)).status).toBe(409);
  });
});

describe("social: publishing", () => {
  it("publishes due posts per platform and records a partial result", async () => {
    await connectedAccount("x");
    await connectedAccount("linkedin");
    const x = fakePublisher({ externalId: "x-1", url: "https://x.com/maple-x/status/x-1" });
    const li = fakePublisher(new PublishError("rejected", "LinkedIn 422: commentary rejected"));
    setPublisher("x", x.impl);
    setPublisher("linkedin", li.impl);

    const due = await duePost({ platforms: ["x", "linkedin"] });
    const later = await duePost({ platforms: ["x"], scheduledAt: new Date(Date.now() + 3_600_000) });
    await runSocialTick(new Date());

    const post = await SocialPost.findById(due._id).exec();
    expect(post?.status).toBe("partial");
    expect(post?.publishedAt).toBeNull();
    expect(post?.results.map((r) => [r.platform, r.status])).toEqual([
      ["x", "published"],
      ["linkedin", "failed"],
    ]);
    expect(post?.results[0]).toMatchObject({ externalId: "x-1", url: "https://x.com/maple-x/status/x-1" });
    expect(post?.results[0]?.publishedAt).toBeInstanceOf(Date);
    expect(post?.results[1]?.error).toMatch(/422/);

    // The publisher saw the decrypted token and the post body; the future post was left alone.
    expect(x.calls).toHaveLength(1);
    expect(x.calls[0]?.account).toMatchObject({ platform: "x", handle: "maple-x", accessToken: "x-token" });
    expect(x.calls[0]?.post.text).toBe("Hello from Maple");
    expect((await SocialPost.findById(later._id).exec())?.status).toBe("scheduled");
  });

  it("marks a post published when every platform succeeds, failed when none does", async () => {
    await connectedAccount("x");
    await connectedAccount("linkedin");
    setPublisher("x", fakePublisher({ externalId: "x-2" }).impl);
    setPublisher("linkedin", fakePublisher({ externalId: "urn:li:share:2" }).impl);
    const good = await duePost({ platforms: ["x", "linkedin"] });
    await runSocialTick(new Date());
    const published = await SocialPost.findById(good._id).exec();
    expect(published?.status).toBe("published");
    expect(published?.publishedAt).toBeInstanceOf(Date);

    setPublisher("x", fakePublisher(new Error("socket hang up")).impl);
    setPublisher("linkedin", fakePublisher(new PublishError("rejected", "LinkedIn 500")).impl);
    const bad = await duePost({ platforms: ["x", "linkedin"] });
    await runSocialTick(new Date());
    const failed = await SocialPost.findById(bad._id).exec();
    expect(failed?.status).toBe("failed");
    expect(failed?.results.map((r) => r.error)).toEqual(["socket hang up", "LinkedIn 500"]);
  });

  it("fails a platform with no connected account instead of crashing", async () => {
    setPublisher("linkedin", fakePublisher({ externalId: "never" }).impl);
    const post = await duePost({ platforms: ["linkedin"] });
    await runSocialTick(new Date());
    const saved = await SocialPost.findById(post._id).exec();
    expect(saved?.status).toBe("failed");
    expect(saved?.results[0]?.error).toMatch(/No LinkedIn account is connected/);
  });

  it("retries only the failed platforms of a partial post on publish-now", async () => {
    await connectedAccount("x");
    await connectedAccount("linkedin");
    const x = fakePublisher({ externalId: "x-1" });
    setPublisher("x", x.impl);
    setPublisher("linkedin", fakePublisher(new PublishError("rejected", "LinkedIn 503")).impl);
    const post = await duePost({ platforms: ["x", "linkedin"] });
    await runSocialTick(new Date());
    expect((await SocialPost.findById(post._id).exec())?.status).toBe("partial");

    setPublisher("linkedin", fakePublisher({ externalId: "urn:li:share:9" }).impl);
    const res = await request(app).post(`${admin}/posts/${post._id}/publish-now`).set(auth);
    expect(res.status).toBe(200);
    expect(res.body.item.status).toBe("published");
    expect(res.body.item.results).toMatchObject([
      { platform: "x", status: "published", externalId: "x-1" },
      { platform: "linkedin", status: "published", externalId: "urn:li:share:9" },
    ]);
    expect(x.calls).toHaveLength(1);
  });

  it("publish-now runs the same path for a draft and gives it a slot", async () => {
    await connectedAccount("x");
    setPublisher("x", fakePublisher({ externalId: "x-3" }).impl);
    const draft = await SocialPost.create({ text: "Now", mediaUrls: [], platforms: ["x"], status: "draft", results: [] });
    const res = await request(app).post(`${admin}/posts/${draft._id}/publish-now`).set(auth);
    expect(res.status).toBe(200);
    expect(res.body.item.status).toBe("published");
    expect(res.body.item.scheduledAt).not.toBeNull();
    expect(res.body.item.results[0]).toMatchObject({ platform: "x", status: "published", externalId: "x-3" });
  });

  it("flags an expired account and asks for a reconnect without calling the publisher", async () => {
    const account = await connectedAccount("linkedin", { expiresAt: new Date(Date.now() - 3_600_000) });
    const li = fakePublisher({ externalId: "never" });
    setPublisher("linkedin", li.impl);
    const post = await duePost({ platforms: ["linkedin"] });
    await runSocialTick(new Date());

    const saved = await SocialPost.findById(post._id).exec();
    expect(saved?.status).toBe("failed");
    expect(saved?.results[0]?.error).toMatch(/reconnect/i);
    expect(li.calls).toHaveLength(0);
    expect((await SocialAccount.findById(account._id).exec())?.status).toBe("expired");

    // Next time round the account is no longer `connected`, so the message changes but it still never crashes.
    const again = await duePost({ platforms: ["linkedin"] });
    await runSocialTick(new Date());
    expect((await SocialPost.findById(again._id).exec())?.results[0]?.error).toMatch(/reconnect/i);
  });

  it("marks the account revoked when the provider rejects the token mid-publish", async () => {
    const account = await connectedAccount("x");
    setPublisher("x", fakePublisher(new PublishError("reconnect", "X rejected the access token — reconnect the account.")).impl);
    const post = await duePost({ platforms: ["x"] });
    await runSocialTick(new Date());
    expect((await SocialPost.findById(post._id).exec())?.results[0]?.error).toMatch(/reconnect/);
    expect((await SocialAccount.findById(account._id).exec())?.status).toBe("revoked");
  });

  it("refreshes an X token that is about to expire and stores the rotated pair", async () => {
    const now = new Date();
    const account = await connectedAccount("x", {
      expiresAt: new Date(now.getTime() + 2 * 60_000),
      refreshTokenEnc: encrypt("refresh-old"),
    });
    const calls = scriptHttp((url) =>
      endpoint(url) === X_API.token ? json({ access_token: "access-new", refresh_token: "refresh-new", expires_in: 7200 }) : undefined
    );
    const x = fakePublisher({ externalId: "x-4" });
    setPublisher("x", x.impl);

    const post = await duePost({ platforms: ["x"] });
    await runSocialTick(now);

    expect(x.calls[0]?.account.accessToken).toBe("access-new");
    expect((await SocialPost.findById(post._id).exec())?.status).toBe("published");

    const form = formOf(calls[0]?.init);
    expect(form.get("grant_type")).toBe("refresh_token");
    expect(form.get("refresh_token")).toBe("refresh-old");
    expect(calls[0]?.headers.get("authorization")).toBe(`Basic ${Buffer.from("x-client:x-secret").toString("base64")}`);

    const reloaded = await SocialAccount.findById(account._id).select("+accessTokenEnc +refreshTokenEnc").exec();
    expect(decrypt(reloaded?.accessTokenEnc ?? "")).toBe("access-new");
    expect(decrypt(reloaded?.refreshTokenEnc ?? "")).toBe("refresh-new");
    expect(reloaded?.expiresAt?.getTime()).toBeGreaterThan(now.getTime() + 3_600_000);
    expect(reloaded?.status).toBe("connected");
  });

  it("expires the X account when the refresh is refused", async () => {
    const account = await connectedAccount("x", {
      expiresAt: new Date(Date.now() + 60_000),
      refreshTokenEnc: encrypt("refresh-dead"),
    });
    scriptHttp(() => json({ error: "invalid_grant" }, 400));
    const x = fakePublisher({ externalId: "never" });
    setPublisher("x", x.impl);
    const post = await duePost({ platforms: ["x"] });
    await runSocialTick(new Date());
    expect((await SocialPost.findById(post._id).exec())?.results[0]?.error).toMatch(/reconnect/);
    expect((await SocialAccount.findById(account._id).exec())?.status).toBe("expired");
    expect(x.calls).toHaveLength(0);
  });
});

describe("social: real publishers (scripted HTTP)", () => {
  it("X posts the text with the bearer token", async () => {
    const calls = scriptHttp((url) => (endpoint(url) === X_API.tweets ? json({ data: { id: "111", text: "hi" } }, 201) : undefined));
    const result = await xPublisher.publish(publisherAccount("x"), { text: "hi", mediaUrls: [] });
    expect(result).toEqual({ externalId: "111", url: "https://x.com/maple/status/111" });
    expect(calls[0]?.init?.method).toBe("POST");
    expect(calls[0]?.headers.get("authorization")).toBe("Bearer tok");
    expect(jsonOf(calls[0]?.init)).toEqual({ text: "hi" });
  });

  it("X 401 means reconnect, anything else is a rejection", async () => {
    scriptHttp(() => json({ title: "Unauthorized" }, 401));
    await expect(xPublisher.publish(publisherAccount("x"), { text: "hi", mediaUrls: [] })).rejects.toMatchObject({ kind: "reconnect" });
    scriptHttp(() => json({ detail: "duplicate content" }, 403));
    await expect(xPublisher.publish(publisherAccount("x"), { text: "hi", mediaUrls: [] })).rejects.toMatchObject({
      kind: "rejected",
      message: expect.stringMatching(/X 403/),
    });
  });

  it("LinkedIn sends a versioned Posts call and reads the id from x-restli-id", async () => {
    const calls = scriptHttp((url) =>
      endpoint(url) === LINKEDIN_API.posts ? new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:555" } }) : undefined
    );
    const result = await linkedinPublisher.publish(publisherAccount("linkedin"), { text: "Hello (world) #maple", mediaUrls: [] });
    expect(result).toEqual({ externalId: "urn:li:share:555", url: "https://www.linkedin.com/feed/update/urn:li:share:555" });
    expect(calls[0]?.headers.get("LinkedIn-Version")).toBe(LINKEDIN_VERSION);
    expect(calls[0]?.headers.get("X-Restli-Protocol-Version")).toBe("2.0.0");
    expect(calls[0]?.headers.get("authorization")).toBe("Bearer tok");
    expect(jsonOf(calls[0]?.init)).toMatchObject({
      author: "urn:li:person:abc",
      commentary: "Hello \\(world\\) {hashtag|\\#|maple}",
      visibility: "PUBLIC",
      lifecycleState: "PUBLISHED",
      distribution: { feedDistribution: "MAIN_FEED" },
    });
  });

  it("escapes LinkedIn little-text markup but keeps plain text intact", () => {
    expect(toLittleText("Plain sentence, no markup.")).toBe("Plain sentence, no markup.");
    expect(toLittleText("a_b (c) [d] @e *f* ~g~ #tag1 #tag_2")).toBe("a\\_b \\(c\\) \\[d\\] \\@e \\*f\\* \\~g\\~ {hashtag|\\#|tag1} {hashtag|\\#|tag_2}");
    expect(toLittleText("#lead first, then 2#3 is not a tag")).toBe("{hashtag|\\#|lead} first, then 2\\#3 is not a tag");
  });

  it("Instagram creates a container, publishes it and fetches the permalink", async () => {
    const calls = scriptHttp((url) => {
      const ep = endpoint(url);
      if (ep === `${META_API.graph}/ig1/media`) return json({ id: "c1" });
      if (ep === `${META_API.graph}/ig1/media_publish`) return json({ id: "m1" });
      if (ep === `${META_API.graph}/m1`) return json({ permalink: "https://www.instagram.com/p/abc/" });
      return undefined;
    });
    const result = await instagramPublisher.publish(publisherAccount("instagram"), {
      text: "Caption",
      mediaUrls: ["https://cdn.example.com/a.jpg", "https://cdn.example.com/b.jpg"],
    });
    expect(result).toEqual({ externalId: "m1", url: "https://www.instagram.com/p/abc/" });
    expect(jsonOf(calls[0]?.init)).toEqual({ image_url: "https://cdn.example.com/a.jpg", caption: "Caption" });
    expect(jsonOf(calls[1]?.init)).toEqual({ creation_id: "c1" });
    expect(calls[2]?.url.searchParams.get("fields")).toBe("permalink");
    for (const c of calls) expect(c.headers.get("authorization")).toBe("Bearer tok");
  });

  it("Instagram refuses a text-only post before any request, and treats code 190 as reconnect", async () => {
    const calls = scriptHttp(() => json({ error: { message: "Error validating access token", code: 190 } }, 400));
    await expect(instagramPublisher.publish(publisherAccount("instagram"), { text: "x", mediaUrls: [] })).rejects.toMatchObject({ kind: "invalid" });
    expect(calls).toHaveLength(0);
    await expect(
      instagramPublisher.publish(publisherAccount("instagram"), { text: "x", mediaUrls: ["https://cdn.example.com/a.jpg"] })
    ).rejects.toMatchObject({ kind: "reconnect" });
  });
});
