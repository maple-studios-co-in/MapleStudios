import { http, readBody, snippet, PublishError, type Publisher } from "./types.js";

/**
 * LinkedIn Marketing API. The versioned REST surface requires the
 * LinkedIn-Version header on every call; versions are retired roughly a year
 * after release, so this constant needs bumping periodically.
 */
export const LINKEDIN_VERSION = "202501";

export const LINKEDIN_API = {
  authorize: "https://www.linkedin.com/oauth/v2/authorization",
  token: "https://www.linkedin.com/oauth/v2/accessToken",
  userinfo: "https://api.linkedin.com/v2/userinfo",
  posts: "https://api.linkedin.com/rest/posts",
  /** openid/profile/email identify the member; w_member_social is the posting right. */
  scopes: ["openid", "profile", "email", "w_member_social"],
} as const;

/**
 * `commentary` is LinkedIn's "little text" format: these characters are
 * markup there, and an unescaped parenthesis in an ordinary sentence gets
 * the whole post rejected. Hashtags are written in the format's own syntax
 * so they stay clickable.
 */
const LITTLE_TEXT = /(^|\s)#([\p{L}\p{N}_]+)|[\\|{}@[\]()<>#*_~]/gu;

export function toLittleText(text: string): string {
  return text.replace(LITTLE_TEXT, (match, lead: string | undefined, tag: string | undefined) =>
    tag === undefined ? `\\${match}` : `${lead ?? ""}{hashtag|\\#|${tag}}`
  );
}

/** Text only in Phase 1 — images need the separate /rest/images upload. */
export const linkedinPublisher: Publisher = {
  async publish(account, post) {
    const author = account.meta.personUrn;
    if (!author) {
      throw new PublishError("reconnect", "This LinkedIn connection has no member URN — reconnect it.");
    }
    const res = await http(LINKEDIN_API.posts, {
      method: "POST",
      headers: {
        authorization: `Bearer ${account.accessToken}`,
        "content-type": "application/json",
        "LinkedIn-Version": LINKEDIN_VERSION,
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        author,
        commentary: toLittleText(post.text),
        visibility: "PUBLIC",
        distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
      }),
    });
    if (res.status === 401) {
      throw new PublishError("reconnect", "LinkedIn rejected the access token — reconnect the account.");
    }
    if (!res.ok) throw new PublishError("rejected", `LinkedIn ${res.status}: ${snippet(await readBody(res))}`);

    // A 201 with an empty body; the new post's URN travels in a header.
    const id = res.headers.get("x-restli-id");
    if (!id) throw new PublishError("rejected", "LinkedIn did not return a post id.");
    return { externalId: id, url: `https://www.linkedin.com/feed/update/${id}` };
  },
};
