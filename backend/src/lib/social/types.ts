export const PLATFORMS = ["x", "instagram", "linkedin"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABEL: Record<Platform, string> = {
  x: "X",
  instagram: "Instagram",
  linkedin: "LinkedIn",
};

/**
 * Body/caption ceilings enforced before a post is scheduled, so a failure
 * shows up in the composer rather than in the publish log. X counts weighted
 * characters (URLs as 23, CJK as 2); code points are close enough for the
 * text-only posts Phase 1 sends.
 */
export const TEXT_LIMIT: Record<Platform, number> = { x: 280, instagram: 2200, linkedin: 3000 };

/** What a publisher needs about the account — the token is decrypted for one call only. */
export interface PublisherAccount {
  platform: Platform;
  externalId: string;
  handle: string;
  accessToken: string;
  meta: { pageId?: string; igUserId?: string; personUrn?: string };
}

export interface PublisherPost {
  text: string;
  mediaUrls: string[];
}

export interface PublishResult {
  externalId: string;
  url?: string;
}

export interface Publisher {
  publish(account: PublisherAccount, post: PublisherPost): Promise<PublishResult>;
}

/**
 * Why a publish failed, in terms the service can act on. `reconnect` is the
 * one that changes state (the account is flagged so the operator sees it);
 * `invalid` is the post's fault, `rejected` is the provider's answer.
 */
export type PublishFailure = "reconnect" | "rejected" | "invalid";

export class PublishError extends Error {
  constructor(
    readonly kind: PublishFailure,
    message: string
  ) {
    super(message);
    this.name = "PublishError";
  }
}

// ---------------------------------------------------------------------------
// HTTP. Every provider call goes through `http` so tests can script the
// responses without touching the network, and so a hung provider cannot
// stall the scheduler tick forever.
// ---------------------------------------------------------------------------

export type HttpFn = (url: string, init?: RequestInit) => Promise<Response>;

let httpOverride: HttpFn | null = null;

export const http: HttpFn = (url, init) =>
  httpOverride
    ? httpOverride(url, init)
    : fetch(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(15_000) });

/** Tests script provider responses here; pass null to go back to fetch. */
export function setSocialHttp(fn: HttpFn | null) {
  httpOverride = fn;
}

/** Body as JSON when it parses, else the raw text — provider errors come in both shapes. */
export async function readBody(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/** Enough of a provider response to diagnose, little enough to store on the post. */
export function snippet(body: unknown): string {
  const s = typeof body === "string" ? body : JSON.stringify(body ?? "");
  return s.slice(0, 300);
}

// ---------------------------------------------------------------------------
// Registry. The service registers the real publishers; tests swap in fakes
// per platform with setPublisher() so no test performs network I/O.
// ---------------------------------------------------------------------------

const defaults = new Map<Platform, Publisher>();
const overrides = new Map<Platform, Publisher>();

export function registerPublisher(platform: Platform, impl: Publisher) {
  defaults.set(platform, impl);
}

export function setPublisher(platform: Platform, impl: Publisher | null) {
  if (impl) overrides.set(platform, impl);
  else overrides.delete(platform);
}

export function getPublisher(platform: Platform): Publisher {
  const impl = overrides.get(platform) ?? defaults.get(platform);
  if (!impl) throw new Error(`No publisher registered for ${platform}.`);
  return impl;
}
