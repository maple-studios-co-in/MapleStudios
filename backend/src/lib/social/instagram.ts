import { http, readBody, snippet, PublishError, type Publisher } from "./types.js";

/**
 * Meta Graph API — Instagram publishing goes through a Facebook Page's
 * linked Instagram business account. Version pinned in one place; bump it
 * here when Meta retires v21.0.
 */
export const META_GRAPH_VERSION = "v21.0";

export const META_API = {
  dialog: `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`,
  graph: `https://graph.facebook.com/${META_GRAPH_VERSION}`,
  /** Content publishing needs the page scopes too: the IG account is reached via /me/accounts. */
  scopes: ["instagram_basic", "instagram_content_publish", "pages_show_list", "pages_read_engagement"],
} as const;

type Json = Record<string, unknown>;

/** Meta signals an expired/invalid token with code 190 inside a 400, not with a 401. */
const META_INVALID_TOKEN = 190;

async function graph(method: "GET" | "POST", url: string, token: string, payload?: Json): Promise<Json> {
  const res = await http(url, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(payload ? { "content-type": "application/json" } : {}),
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  const body = await readBody(res);
  const err = (body as { error?: { code?: unknown; message?: unknown } } | null)?.error;
  if (res.status === 401 || err?.code === META_INVALID_TOKEN) {
    throw new PublishError("reconnect", "Instagram rejected the access token — reconnect the account.");
  }
  if (!res.ok || err) {
    const why = typeof err?.message === "string" ? err.message : snippet(body);
    throw new PublishError("rejected", `Instagram ${res.status}: ${why}`);
  }
  return body && typeof body === "object" ? (body as Json) : {};
}

const idOf = (body: Json): string | undefined => (typeof body.id === "string" && body.id ? body.id : undefined);

export const instagramPublisher: Publisher = {
  async publish(account, post) {
    const igUserId = account.meta.igUserId;
    if (!igUserId) {
      throw new PublishError("reconnect", "This Instagram connection has no business account id — reconnect it.");
    }
    // Instagram has no text-only post. The service refuses to schedule one
    // without an image, so this is the last line of defence, not the first.
    const imageUrl = post.mediaUrls[0];
    if (!imageUrl) {
      throw new PublishError("invalid", "Instagram needs at least one image — add a media URL to this post.");
    }

    // Two steps: create a media container, then publish it. One image in
    // Phase 1; a carousel needs a container per item plus a parent.
    const container = await graph("POST", `${META_API.graph}/${igUserId}/media`, account.accessToken, {
      image_url: imageUrl,
      caption: post.text,
    });
    const creationId = idOf(container);
    if (!creationId) throw new PublishError("rejected", "Instagram did not return a media container id.");

    const published = await graph("POST", `${META_API.graph}/${igUserId}/media_publish`, account.accessToken, {
      creation_id: creationId,
    });
    const mediaId = idOf(published);
    if (!mediaId) throw new PublishError("rejected", "Instagram did not return a media id.");

    // The permalink is cosmetic; failing to fetch it must not fail a post that is already live.
    const url = await graph("GET", `${META_API.graph}/${mediaId}?fields=permalink`, account.accessToken)
      .then((b) => (typeof b.permalink === "string" ? b.permalink : undefined))
      .catch(() => undefined);

    return { externalId: mediaId, url };
  },
};
