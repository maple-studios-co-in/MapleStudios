import { http, readBody, snippet, PublishError, type Publisher } from "./types.js";

/**
 * X API v2 — the only place these URLs live. Verify them against the
 * developer portal when registering the app; endpoints drift.
 */
export const X_API = {
  authorize: "https://x.com/i/oauth2/authorize",
  token: "https://api.x.com/2/oauth2/token",
  me: "https://api.x.com/2/users/me",
  tweets: "https://api.x.com/2/tweets",
  /** offline.access is what yields a refresh token; without it every token dies in 2 hours. */
  scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
} as const;

/** Text only in Phase 1 — media needs the separate upload endpoint. */
export const xPublisher: Publisher = {
  async publish(account, post) {
    const res = await http(X_API.tweets, {
      method: "POST",
      headers: { authorization: `Bearer ${account.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ text: post.text }),
    });
    const body = await readBody(res);
    if (res.status === 401) {
      throw new PublishError("reconnect", "X rejected the access token — reconnect the account.");
    }
    if (!res.ok) throw new PublishError("rejected", `X ${res.status}: ${snippet(body)}`);

    const id = (body as { data?: { id?: unknown } } | null)?.data?.id;
    if (typeof id !== "string" || !id) throw new PublishError("rejected", "X did not return a post id.");
    return { externalId: id, url: `https://x.com/${account.handle}/status/${id}` };
  },
};
