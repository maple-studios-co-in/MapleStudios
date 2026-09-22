/**
 * Link and image URLs an operator types end up in href/src attributes, some of
 * them on the public site. Only schemes that navigate are allowed, so a
 * `javascript:` or `data:` URL can never become a clickable link.
 */
const SAFE_HREF = /^(https?:\/\/|mailto:|tel:|\/|#)/i;

/** The trimmed URL when it is safe to put in an href, otherwise "". */
export function safeHref(url: string | null | undefined): string {
  const u = (url ?? "").trim();
  return SAFE_HREF.test(u) ? u : "";
}

/** Absolute http(s) URLs skip next/image optimisation: the optimiser only
    serves hosts listed in next.config, and an operator can paste any host. */
export function isRemoteUrl(src: string): boolean {
  return /^https?:\/\//i.test(src);
}
