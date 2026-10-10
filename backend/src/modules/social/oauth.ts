import crypto from "node:crypto";
import mongoose, { Schema, model, type Model } from "mongoose";
import { env } from "../../config/env.js";
import { AppError } from "../../lib/AppError.js";
import { randomToken, readSignedId, signId } from "../../lib/crypto.js";
import { http, readBody, snippet, PLATFORM_LABEL, type Platform } from "../../lib/social/types.js";
import { X_API } from "../../lib/social/x.js";
import { META_API } from "../../lib/social/instagram.js";
import { LINKEDIN_API } from "../../lib/social/linkedin.js";

/**
 * OAuth for the three platforms: authorize URLs, state, code exchange and
 * account resolution. Nothing here touches the database beyond the state
 * collection; the service owns SocialAccount.
 */

export interface PlatformConfig {
  clientId: string;
  clientSecret: string;
}

const ENV_VARS: Record<Platform, [string, string]> = {
  x: ["X_CLIENT_ID", "X_CLIENT_SECRET"],
  instagram: ["META_APP_ID", "META_APP_SECRET"],
  linkedin: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"],
};

export function platformConfig(platform: Platform): PlatformConfig | null {
  const [clientId, clientSecret] =
    platform === "x"
      ? [env.X_CLIENT_ID, env.X_CLIENT_SECRET]
      : platform === "instagram"
        ? [env.META_APP_ID, env.META_APP_SECRET]
        : [env.LINKEDIN_CLIENT_ID, env.LINKEDIN_CLIENT_SECRET];
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/** 503 NOT_CONFIGURED — the console turns this into a "not configured" notice, never a crash. */
export function requireConfig(platform: Platform): PlatformConfig {
  const config = platformConfig(platform);
  if (config) return config;
  const [id, secret] = ENV_VARS[platform];
  throw new AppError(
    503,
    "NOT_CONFIGURED",
    `${PLATFORM_LABEL[platform]} is not configured — set ${id} and ${secret} in backend/.env.`
  );
}

/**
 * The browser lands on /api/connect/:platform/callback and Next proxies it to
 * the API. This exact string must be registered with each provider.
 */
export const redirectUri = (platform: Platform) => `${env.PUBLIC_BASE_URL}/api/connect/${platform}/callback`;

export const consoleUrl = (query: string) => `${env.PUBLIC_BASE_URL}/admin/social?${query}`;

/** A connection failure the callback turns into `?error=<code>` on the console. */
export class OAuthError extends Error {
  constructor(
    readonly code: "exchange_failed" | "profile_failed" | "no_instagram_account" | "refresh_failed",
    message: string
  ) {
    super(message);
    this.name = "OAuthError";
  }
}

// ---------------------------------------------------------------------------
// State. A random nonce, signed so a tampered value is rejected before any
// lookup, stored for ten minutes and deleted as it is read so a replayed
// callback fails. X's PKCE verifier rides along with it.
// ---------------------------------------------------------------------------

export const STATE_TTL_MS = 10 * 60_000;

interface IOAuthState {
  nonce: string;
  platform: Platform;
  codeVerifier?: string;
  expiresAt: Date;
}

const OAuthStateSchema = new Schema<IOAuthState>(
  {
    nonce: { type: String, required: true, unique: true },
    platform: { type: String, required: true },
    codeVerifier: { type: String },
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false }
);
// Mongo sweeps expired rows about once a minute; consumeState still checks the clock.
OAuthStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const SocialOAuthState: Model<IOAuthState> =
  (mongoose.models.SocialOAuthState as Model<IOAuthState> | undefined) ??
  model<IOAuthState>("SocialOAuthState", OAuthStateSchema);

async function issueState(platform: Platform, codeVerifier?: string): Promise<string> {
  const nonce = randomToken();
  await SocialOAuthState.create({
    nonce,
    platform,
    ...(codeVerifier ? { codeVerifier } : {}),
    expiresAt: new Date(Date.now() + STATE_TTL_MS),
  });
  return signId(nonce);
}

/** null for anything unknown, tampered, expired, replayed or issued for another platform. */
export async function consumeState(platform: Platform, state: string): Promise<{ codeVerifier?: string } | null> {
  const nonce = readSignedId(state);
  if (!nonce) return null;
  const row = await SocialOAuthState.findOneAndDelete({ nonce, platform }).exec();
  if (!row || row.expiresAt.getTime() < Date.now()) return null;
  return { codeVerifier: row.codeVerifier };
}

// ---------------------------------------------------------------------------
// Authorize URLs
// ---------------------------------------------------------------------------

/** URLSearchParams writes spaces as "+"; the providers document %20, so match them. */
function withQuery(base: string, params: Record<string, string>): string {
  const url = new URL(base);
  url.search = new URLSearchParams(params).toString().replace(/\+/g, "%20");
  return url.toString();
}

export async function authorizeUrl(platform: Platform): Promise<string> {
  const { clientId } = requireConfig(platform);
  const redirect_uri = redirectUri(platform);

  if (platform === "x") {
    // PKCE S256: X requires it even for confidential clients.
    const verifier = randomToken(32);
    const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
    const state = await issueState("x", verifier);
    return withQuery(X_API.authorize, {
      response_type: "code",
      client_id: clientId,
      redirect_uri,
      scope: X_API.scopes.join(" "),
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    });
  }

  if (platform === "instagram") {
    const state = await issueState("instagram");
    return withQuery(META_API.dialog, {
      client_id: clientId,
      redirect_uri,
      state,
      response_type: "code",
      scope: META_API.scopes.join(","),
    });
  }

  const state = await issueState("linkedin");
  return withQuery(LINKEDIN_API.authorize, {
    response_type: "code",
    client_id: clientId,
    redirect_uri,
    state,
    scope: LINKEDIN_API.scopes.join(" "),
  });
}

// ---------------------------------------------------------------------------
// Code exchange and account resolution
// ---------------------------------------------------------------------------

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date | null;
  scopes: string[];
}

export interface ResolvedAccount {
  externalId: string;
  handle: string;
  displayName: string;
  avatarUrl?: string;
  meta: { pageId?: string; igUserId?: string; personUrn?: string };
  /** For Meta these are the page's, not the user's — see resolveMeta. */
  tokens: TokenSet;
}

type Json = Record<string, unknown>;

const asObject = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const asString = (v: unknown): string | undefined =>
  typeof v === "string" && v ? v : typeof v === "number" ? String(v) : undefined;

const form = (fields: Record<string, string>) => new URLSearchParams(fields).toString();

const basicAuth = ({ clientId, clientSecret }: PlatformConfig) =>
  `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;

const expiry = (expiresIn: unknown): Date | null =>
  typeof expiresIn === "number" && expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000) : null;

function toTokenSet(body: Json): TokenSet {
  const scope = asString(body.scope);
  return {
    accessToken: asString(body.access_token) as string,
    refreshToken: asString(body.refresh_token),
    expiresAt: expiry(body.expires_in),
    // X separates scopes with spaces, LinkedIn with commas.
    scopes: scope ? scope.split(/[\s,]+/).filter(Boolean) : [],
  };
}

async function tokenRequest(
  platform: Platform,
  headers: Record<string, string>,
  fields: Record<string, string>,
  code: OAuthError["code"]
): Promise<Json> {
  const url = platform === "x" ? X_API.token : LINKEDIN_API.token;
  const res = await http(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
    body: form(fields),
  });
  const body = asObject(await readBody(res));
  if (!res.ok || !asString(body.access_token)) {
    throw new OAuthError(code, `${PLATFORM_LABEL[platform]} token endpoint ${res.status}: ${snippet(body)}`);
  }
  return body;
}

async function graphGet(url: string, code: OAuthError["code"], token?: string): Promise<Json> {
  const res = await http(url, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  const body = asObject(await readBody(res));
  if (!res.ok || body.error) {
    const err = asObject(body.error);
    throw new OAuthError(code, `Meta ${res.status}: ${asString(err.message) ?? snippet(body)}`);
  }
  return body;
}

async function bearerGet(url: string, token: string, platform: Platform, headers: Record<string, string> = {}): Promise<Json> {
  const res = await http(url, { headers: { authorization: `Bearer ${token}`, ...headers } });
  const body = asObject(await readBody(res));
  if (!res.ok) throw new OAuthError("profile_failed", `${PLATFORM_LABEL[platform]} profile ${res.status}: ${snippet(body)}`);
  return body;
}

// --- X ---

async function exchangeX(config: PlatformConfig, code: string, codeVerifier?: string): Promise<TokenSet> {
  if (!codeVerifier) throw new OAuthError("exchange_failed", "X exchange is missing its PKCE verifier.");
  const body = await tokenRequest(
    "x",
    { authorization: basicAuth(config) },
    {
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri("x"),
      code_verifier: codeVerifier,
      client_id: config.clientId,
    },
    "exchange_failed"
  );
  return toTokenSet(body);
}

/** X rotates refresh tokens: the returned set replaces both stored tokens. */
export async function refreshXToken(config: PlatformConfig, refreshToken: string): Promise<TokenSet> {
  const body = await tokenRequest(
    "x",
    { authorization: basicAuth(config) },
    { grant_type: "refresh_token", refresh_token: refreshToken, client_id: config.clientId },
    "refresh_failed"
  );
  return toTokenSet(body);
}

async function resolveX(tokens: TokenSet): Promise<ResolvedAccount> {
  const body = await bearerGet(`${X_API.me}?user.fields=profile_image_url`, tokens.accessToken, "x");
  const data = asObject(body.data);
  const id = asString(data.id);
  const username = asString(data.username);
  if (!id || !username) throw new OAuthError("profile_failed", "X did not return the user's id and handle.");
  return {
    externalId: id,
    handle: username,
    displayName: asString(data.name) ?? username,
    avatarUrl: asString(data.profile_image_url),
    meta: {},
    tokens,
  };
}

// --- LinkedIn ---

async function exchangeLinkedIn(config: PlatformConfig, code: string): Promise<TokenSet> {
  const body = await tokenRequest(
    "linkedin",
    {},
    {
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri("linkedin"),
      client_id: config.clientId,
      client_secret: config.clientSecret,
    },
    "exchange_failed"
  );
  return toTokenSet(body);
}

async function resolveLinkedIn(tokens: TokenSet): Promise<ResolvedAccount> {
  const body = await bearerGet(LINKEDIN_API.userinfo, tokens.accessToken, "linkedin");
  const sub = asString(body.sub);
  if (!sub) throw new OAuthError("profile_failed", "LinkedIn did not return the member id.");
  // userinfo has no vanity handle; the name is what the operator recognises.
  const fullName = [asString(body.given_name), asString(body.family_name)].filter(Boolean).join(" ");
  const name = asString(body.name) ?? (fullName || sub);
  return {
    externalId: sub,
    handle: name,
    displayName: name,
    avatarUrl: asString(body.picture),
    meta: { personUrn: `urn:li:person:${sub}` },
    tokens,
  };
}

// --- Meta / Instagram ---

async function exchangeMeta(config: PlatformConfig, code: string): Promise<TokenSet> {
  const short = await graphGet(
    `${META_API.graph}/oauth/access_token?${form({
      client_id: config.clientId,
      redirect_uri: redirectUri("instagram"),
      client_secret: config.clientSecret,
      code,
    })}`,
    "exchange_failed"
  );
  const shortToken = asString(short.access_token);
  if (!shortToken) throw new OAuthError("exchange_failed", "Meta did not return an access token.");

  // Short-lived tokens die in an hour; the long-lived one lasts ~60 days.
  const long = await graphGet(
    `${META_API.graph}/oauth/access_token?${form({
      grant_type: "fb_exchange_token",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      fb_exchange_token: shortToken,
    })}`,
    "exchange_failed"
  );
  const longToken = asString(long.access_token);
  if (!longToken) throw new OAuthError("exchange_failed", "Meta did not return a long-lived token.");
  return { accessToken: longToken, expiresAt: expiry(long.expires_in), scopes: [...META_API.scopes] };
}

/**
 * Instagram is reached through a Facebook Page. The first page with a linked
 * business account wins; its page token is what gets stored, because a page
 * token derived from a long-lived user token does not expire.
 */
async function resolveMeta(tokens: TokenSet): Promise<ResolvedAccount> {
  const accounts = await graphGet(
    `${META_API.graph}/me/accounts?fields=id,name,access_token,instagram_business_account`,
    "profile_failed",
    tokens.accessToken
  );
  const pages = Array.isArray(accounts.data) ? accounts.data.map(asObject) : [];
  const page = pages.find((p) => asString(asObject(p.instagram_business_account).id));
  if (!page) {
    throw new OAuthError(
      "no_instagram_account",
      "None of your Facebook Pages has an Instagram business account linked."
    );
  }
  const pageId = asString(page.id) as string;
  const igUserId = asString(asObject(page.instagram_business_account).id) as string;
  const pageToken = asString(page.access_token);
  const pageName = asString(page.name) ?? igUserId;

  // Username and picture are cosmetic — a hiccup here must not fail the connection.
  const profile = await graphGet(
    `${META_API.graph}/${igUserId}?fields=username,name,profile_picture_url`,
    "profile_failed",
    pageToken ?? tokens.accessToken
  ).catch(() => ({}) as Json);

  return {
    externalId: igUserId,
    handle: asString(profile.username) ?? pageName,
    displayName: asString(profile.name) ?? pageName,
    avatarUrl: asString(profile.profile_picture_url),
    meta: { pageId, igUserId },
    tokens: pageToken
      ? { accessToken: pageToken, expiresAt: null, scopes: tokens.scopes }
      : tokens,
  };
}

// --- entry point ---

/**
 * Code → tokens → account, for one platform. `config` is a parameter so the
 * exchange can be exercised without the platform being configured in env.
 */
export async function completeConnection(
  platform: Platform,
  code: string,
  codeVerifier?: string,
  config: PlatformConfig = requireConfig(platform)
): Promise<ResolvedAccount> {
  if (platform === "x") return resolveX(await exchangeX(config, code, codeVerifier));
  if (platform === "linkedin") return resolveLinkedIn(await exchangeLinkedIn(config, code));
  return resolveMeta(await exchangeMeta(config, code));
}
