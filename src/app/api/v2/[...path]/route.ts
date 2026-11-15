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
  const headers = new Headers();
  for (const name of ["content-type", "x-forwarded-for", "user-agent"]) {
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
      `${process.env.GROWTH_API_ORIGIN || "http://127.0.0.1:4006"}/api/v1/${path.map(encodeURIComponent).join("/")}${new URL(req.url).search}`,
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
