import { NextResponse } from "next/server";
import { growthRequest, GrowthError } from "@/lib/growth-server";
import { sameOriginMutation } from "@/lib/admin/access-policy";
import { cookies } from "next/headers";
export const dynamic = "force-dynamic";
const options = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
};
function fail(error: unknown) {
  return NextResponse.json(
    {
      error:
        error instanceof GrowthError
          ? error.message
          : "Could not complete sign-in.",
    },
    { status: error instanceof GrowthError ? error.status : 503 },
  );
}
function origin(req: Request) {
  return sameOriginMutation(req)
    ? null
    : NextResponse.json(
        { error: "Request origin was not accepted." },
        { status: 403 },
      );
}
export async function GET() {
  try {
    return NextResponse.json(await growthRequest("/auth/me"));
  } catch (error) {
    return fail(error);
  }
}
export async function POST(req: Request) {
  const denied = origin(req);
  if (denied) return denied;
  try {
    const session = await growthRequest<{
      token: string;
      refreshToken: string;
      admin: unknown;
    }>("/auth/login", { method: "POST", body: await req.text() }, false);
    const response = NextResponse.json({ admin: session.admin });
    response.cookies.set("maple-session", session.token, {
      ...options,
      maxAge: 900,
    });
    response.cookies.set("maple-refresh", session.refreshToken, {
      ...options,
      path: "/api/admin/session",
      maxAge: 604800,
    });
    return response;
  } catch (error) {
    return fail(error);
  }
}
export async function PATCH(req: Request) {
  const denied = origin(req);
  if (denied) return denied;
  try {
    const token = (await cookies()).get("maple-refresh")?.value;
    if (!token)
      return NextResponse.json({ error: "Sign in again." }, { status: 401 });
    const session = await growthRequest<{ token: string }>(
      "/auth/refresh",
      { method: "POST", body: JSON.stringify({ refreshToken: token }) },
      false,
    );
    const response = NextResponse.json({ ok: true });
    response.cookies.set("maple-session", session.token, {
      ...options,
      maxAge: 900,
    });
    return response;
  } catch (error) {
    return fail(error);
  }
}
export async function DELETE(req: Request) {
  const denied = origin(req);
  if (denied) return denied;
  try {
    await growthRequest("/auth/logout", { method: "POST" });
  } catch (error) {
    if (!(error instanceof GrowthError) || error.status !== 401)
      return fail(error);
    const refreshToken = (await cookies()).get("maple-refresh")?.value;
    if (refreshToken) {
      try {
        const renewed = await growthRequest<{ token: string }>(
          "/auth/refresh",
          { method: "POST", body: JSON.stringify({ refreshToken }) },
          false,
        );
        await growthRequest(
          "/auth/logout",
          {
            method: "POST",
            headers: { authorization: `Bearer ${renewed.token}` },
          },
          false,
        );
      } catch (refreshError) {
        if (
          !(refreshError instanceof GrowthError) ||
          refreshError.status !== 401
        )
          return fail(refreshError);
      }
    }
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set("maple-session", "", { ...options, maxAge: 0 });
  response.cookies.set("maple-refresh", "", {
    ...options,
    path: "/api/admin/session",
    maxAge: 0,
  });
  return response;
}
