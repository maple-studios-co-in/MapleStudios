import { normalisePath, safeHref } from "./url";

type Row = Record<string, unknown>;

/**
 * Server-side checks for the two collections the public site acts on. The
 * console checks these too, but the API is the boundary: an SEO entry is
 * served to every visitor and crawler, and a bad redirect can take a page off
 * the site. `others` is the collection as stored (the row itself included on
 * an update). Returns a problem, or null.
 */
export function problemWith(resource: string, row: Row, others: Row[]): string | null {
  const str = (k: string) => String(row[k] ?? "").trim();
  const clash = (field: string, value: string) =>
    others.some((o) => o.id !== row.id && normalisePath(String(o[field] ?? "")) === normalisePath(value));

  if (resource === "seo") {
    const path = str("path");
    if (!path.startsWith("/")) return "Path must start with a slash.";
    if (clash("path", path)) return `There is already an override for ${normalisePath(path)}.`;
    for (const k of ["canonical", "ogImage"])
      if (str(k) && !safeHref(str(k))) return `${k} must be a /path or an http(s) URL.`;
    if (str("jsonLd")) {
      try {
        const data = JSON.parse(str("jsonLd"));
        if (typeof data !== "object" || data === null) return "JSON-LD must be a JSON object or array.";
      } catch (e) {
        return `JSON-LD is not valid JSON — ${(e as Error).message}`;
      }
    }
  }

  if (resource === "redirects") {
    const from = str("from");
    const to = str("to");
    if (!from.startsWith("/")) return "From must be a root-relative path.";
    // The console, the API and Next's own assets are never redirected — a
    // redirect there could lock the operator out of the console itself.
    if (/^\/(api|_next|admin)(\/|$)/i.test(from)) return "Redirects can't start at /api, /_next or /admin.";
    if (!/^(\/|https?:\/\/)/i.test(to) || !safeHref(to)) return "Redirect target must be a /path or an http(s) URL.";
    if (normalisePath(from) === normalisePath(to)) return "A redirect cannot point at itself.";
    if (![301, 302, 307, 308].includes(Number(row.code))) return "Code must be 301, 302, 307 or 308.";
    if (clash("from", from)) return `${normalisePath(from)} already redirects.`;
    const loop = others.some(
      (o) =>
        o.id !== row.id &&
        normalisePath(String(o.from ?? "")) === normalisePath(to) &&
        normalisePath(String(o.to ?? "")) === normalisePath(from)
    );
    if (loop) return `That would loop: ${normalisePath(to)} already redirects back to ${normalisePath(from)}.`;
  }

  return null;
}
