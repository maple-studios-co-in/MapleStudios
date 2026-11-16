import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { findRedirect } from "@/lib/admin/cms/redirects";

/**
 * Redirects managed in the console (/admin/seo → Redirects).
 *
 * Node runtime so the table can be read from the store; the lookup itself is
 * an in-memory Map hit (see lib/admin/cms/redirects.ts). Anything unexpected
 * falls through to the page — this runs on every page request, so it must
 * never be the thing that breaks one.
 */
export const config = {
  runtime: "nodejs",
  // Public CMS redirects and sensitive page nonces; never Next assets or APIs.
  matcher: ["/admin/:path*", "/sign/:path*", "/((?!_next/|api/|admin|sign/|favicon\\.ico).*)"],
};

/**
 * The origin the visitor actually used. Next needs an absolute Location, but
 * its own request URL is the internal address nginx proxies to (and whether
 * Next turns that back into a relative path depends on how the server was
 * started). nginx passes the public Host and the scheme, so build on those; a
 * Host that isn't a plain hostname can't shape the redirect.
 */
function publicOrigin(req: NextRequest): string {
  const host = req.headers.get("host") ?? "";
  if (!/^[a-z0-9.-]+(:\d{1,5})?$/i.test(host)) return req.nextUrl.origin;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim();
  return `${proto === "https" || proto === "http" ? proto : req.nextUrl.protocol.replace(":", "")}://${host}`;
}

function sensitivePage(req: NextRequest, isSigning: boolean) {
  const nonce = randomBytes(24).toString("base64");
  const dev = process.env.NODE_ENV === "development";
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    isSigning ? "style-src 'self' 'unsafe-inline'" : "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    isSigning ? "img-src 'self' data:" : "img-src 'self' data: blob: https:",
    isSigning ? "font-src 'self'" : "font-src 'self' https://fonts.gstatic.com",
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    isSigning ? "frame-src 'none'" : "frame-src 'self' about: blob:",
    isSigning ? "media-src 'none'" : "media-src 'self' blob: https:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
  const incoming = new Headers(req.headers);
  incoming.set("x-nonce", nonce);
  incoming.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers: incoming } });
  response.headers.set("Content-Security-Policy", policy);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export async function middleware(req: NextRequest) {
  const route = req.nextUrl.pathname;
  if (route === "/admin" || route.startsWith("/admin/"))
    return sensitivePage(req, false);
  if (route === "/sign" || route.startsWith("/sign/"))
    return sensitivePage(req, true);
  try {
    const hit = await findRedirect(req.nextUrl.pathname);
    if (!hit) return NextResponse.next();
    if (!hit.to.startsWith("/")) return NextResponse.redirect(hit.to, hit.code);
    // A target without its own query keeps the visitor's.
    const target = new URL(hit.to, publicOrigin(req));
    if (!hit.to.includes("?")) target.search = req.nextUrl.search;
    return NextResponse.redirect(target, hit.code);
  } catch {
    return NextResponse.next();
  }
}
