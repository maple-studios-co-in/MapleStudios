export type StudioRole = "owner" | "admin" | "member";
export function permitsStudio(role: StudioRole, path: string): boolean {
  if (role === "owner") return true;
  if (role === "member") return false;
  try {
    path = decodeURIComponent(path);
  } catch {
    return false;
  }
  return !path.includes("/doc/settings") && !path.includes("/audit");
}
export function sameOriginMutation(req: Request): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return true;
  const origin = req.headers.get("origin");
  try {
    // Proxy requests may carry an internal URL. Use the configured public
    // origin rather than trusting client-controlled forwarding headers.
    const expected = new URL(process.env.MAPLE_PUBLIC_ORIGIN || req.url);
    return ["http:", "https:"].includes(expected.protocol) && origin === expected.origin;
  } catch {
    return false;
  }
}
export function sessionToken(cookie: string | null): string | undefined {
  return cookie
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith("maple-session="))
    ?.slice("maple-session=".length);
}
