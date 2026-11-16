import { NextResponse } from "next/server";
import { sameOriginMutation } from "@/lib/admin/access-policy";
import { forwardClientIp } from "@/lib/admin/proxy-ip";

export const dynamic = "force-dynamic";

const cookieName = "__Secure-maple-signing";
const secret = /^[A-Za-z0-9_-]{43}$/;
const privateHeaders = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
};
type Context = { params: Promise<{ path: string[] }> };

const fail = (error: string, status: number, code?: string) =>
  NextResponse.json({ error, ...(code ? { code } : {}) }, { status, headers: privateHeaders });
const cookieOptions = (id: string) => ({
  httpOnly: true, secure: true, sameSite: "strict" as const, path: `/api/sign/${id}`,
});

function getToken(req: Request) {
  const values = (req.headers.get("cookie") ?? "").split(";").map(part => part.trim())
    .filter(part => part.startsWith(cookieName + "="));
  const token = values.length === 1 ? values[0].slice(cookieName.length + 1) : "";
  return secret.test(token) ? token : undefined;
}

async function jsonBody(req: Request) {
  const type = req.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (type !== "application/json" || !req.body) throw new Error("Expected JSON.");

  const reader = req.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let result = "";
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 4096) {
        await reader.cancel();
        throw new Error("Request too large.");
      }
      result += decoder.decode(value, { stream: true });
    }
    result += decoder.decode();
    return JSON.stringify(JSON.parse(result));
  } finally {
    reader.releaseLock();
  }
}

async function proxy(req: Request, { params }: Context) {
  const { path } = await params;
  const [id, action] = path;
  const isPost = req.method === "POST";
  const actions = isPost ? ["code", "verify", "sign"] : ["document", "pdf"];
  if (path.length !== 2 || !/^[0-9a-f]{24}$/.test(id) || !actions.includes(action) || new URL(req.url).search)
    return fail("Not found.", 404);
  if (!sameOriginMutation(req))
    return fail("Request origin was not accepted.", 403);

  const usesSession = ["document", "pdf", "sign"].includes(action);
  const token = usesSession ? getToken(req) : undefined;
  if (usesSession && !token)
    return fail("Open your private link and verify by email.", 401);

  const headers = new Headers();
  forwardClientIp(req.headers, headers);
  if (token) headers.set("authorization", `Bearer ${token}`);
  let body: string | undefined;
  if (isPost) {
    try {
      body = await jsonBody(req);
    } catch {
      return fail("Invalid signing request.", 400);
    }
    headers.set("content-type", "application/json");
  }

  try {
    const origin = process.env.GROWTH_API_ORIGIN || "http://127.0.0.1:4006";
    const response = await fetch(new URL(`/api/v1/signing/${id}/${action}`, origin), {
      method: req.method, headers, body, cache: "no-store", redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      const result = fail(error.error || "Private signing is temporarily unavailable.", response.status, error.code);
      if (usesSession && response.status === 401)
        result.cookies.set(cookieName, "", { ...cookieOptions(id), maxAge: 0 });
      return result;
    }
    if (action === "verify") {
      const { sessionToken, expiresAt } = await response.json();
      if (typeof sessionToken !== "string" || !secret.test(sessionToken) || typeof expiresAt !== "string")
        return fail("Email verification is temporarily unavailable.", 503);
      const result = NextResponse.json({ expiresAt }, { headers: privateHeaders });
      result.cookies.set(cookieName, sessionToken, { ...cookieOptions(id), maxAge: 900 });
      return result;
    }
    if (action === "pdf")
      return new Response(response.body, { headers: {
        ...privateHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="maple-agreement-${id}.pdf"`,
        "X-Agreement-Pdf-Sha256": response.headers.get("X-Agreement-Pdf-Sha256") ?? "",
      } });
    return new Response(response.body, { headers: { ...privateHeaders, "Content-Type": "application/json" } });
  } catch {
    return fail("Private signing is temporarily unavailable.", 503);
  }
}

export { proxy as GET, proxy as POST };
