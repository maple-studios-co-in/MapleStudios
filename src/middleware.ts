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
  // Pages only — never Next's assets, the API, or the console.
  matcher: ["/((?!_next/|api/|admin|favicon\\.ico).*)"],
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

export async function middleware(req: NextRequest) {
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
