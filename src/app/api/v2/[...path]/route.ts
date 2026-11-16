import { forwardClientIp } from "@/lib/admin/proxy-ip";
import { NextResponse } from "next/server";
import { sessionToken, sameOriginMutation } from "@/lib/admin/access-policy";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
async function proxy(req: Request, { params }: Context) {
  const token = sessionToken(req.headers.get("cookie"));
  if (token && !sameOriginMutation(req))
    return NextResponse.json(
      { error: "Request origin was not accepted." },
      { status: 403 },
    );
  const { path } = await params;
  if (!path[0] || !/^[a-z][a-z0-9-]*$/i.test(path[0]))
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  // Session credentials may cross only the dedicated HttpOnly-cookie BFF.
  // Match both the literal and encoded/dot-normalized aliases.
  const target = new URL(
    `/api/v1/${path.map(encodeURIComponent).join("/")}${new URL(req.url).search}`,
    process.env.GROWTH_API_ORIGIN || "http://127.0.0.1:4006",
  );
  const namespace = decodeURIComponent(target.pathname).toLowerCase();
  if (/^\/api\/v1\/signing(?:\/|$)/.test(namespace) || /^\/api\/v1\/auth\/(login|refresh|logout|mfa)(?:\/|$)/.test(namespace))
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  const headers = new Headers();
  forwardClientIp(req.headers, headers);
  for (const name of ["content-type", "user-agent"]) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (token) headers.set("authorization", `Bearer ${token}`);
  else
    for (const name of ["authorization", "x-admin-key"]) {
      const value = req.headers.get(name);
      if (value) headers.set(name, value);
    }
  try {
    const response = await fetch(
      target,
      {
        method: req.method,
        headers,
        body: ["GET", "HEAD"].includes(req.method)
          ? undefined
          : await req.arrayBuffer(),
        cache: "no-store",
        signal: AbortSignal.timeout(30000),
      },
    );
    return new Response(response.body, {
      status: response.status,
      headers: {
        "content-type":
          response.headers.get("content-type") || "application/json",
        "cache-control": "no-store",
        ...(response.headers.has("x-agreement-pdf-sha256") ? { "x-agreement-pdf-sha256": response.headers.get("x-agreement-pdf-sha256")! } : {}),
        ...(response.headers.has("content-disposition")
          ? {
              "content-disposition": response.headers.get(
                "content-disposition",
              )!,
            }
          : {}),
      },
    });
  } catch {
    return NextResponse.json(
      { error: "The service is temporarily unavailable." },
      { status: 503 },
    );
  }
}
export {
  proxy as GET,
  proxy as POST,
  proxy as PATCH,
  proxy as PUT,
  proxy as DELETE,
};
