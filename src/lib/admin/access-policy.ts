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
  return origin === new URL(req.url).origin;
}
export function sessionToken(cookie: string | null): string | undefined {
  return cookie
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith("maple-session="))
    ?.slice("maple-session=".length);
}
