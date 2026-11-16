import { NextResponse } from "next/server";
import { growthRequest, GrowthError } from "@/lib/growth-server";
import { ACCESS_COOKIE, PENDING_COOKIE, REFRESH_COOKIE, SESSION_PATH, sameOriginMutation } from "@/lib/admin/access-policy";
import { cookies } from "next/headers";
export const dynamic = "force-dynamic";

const options = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
};
const scoped = { ...options, path: SESSION_PATH };
function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
function fail(error: unknown) {
  return error instanceof GrowthError
    ? json({ error: error.message, ...(error.code ? { code: error.code } : {}) }, error.status)
    : json({ error: "Could not complete the security request." }, 503);
}
function origin(req: Request) {
  return sameOriginMutation(req) ? null : json({ error: "Request origin was not accepted." }, 403);
}
function clearPending(response: NextResponse) {
  response.cookies.set(PENDING_COOKIE, "", { ...scoped, maxAge: 0 });
}
function clearFullSession(response: NextResponse) {
  response.cookies.set(ACCESS_COOKIE, "", { ...options, maxAge: 0 });
  response.cookies.set(REFRESH_COOKIE, "", { ...scoped, maxAge: 0 });
}

interface Pending { state: "mfa_required" | "enrolment_required"; expiresAt: string }
interface PendingSession extends Pending { pendingToken: string }
interface FullSession { token: string; refreshToken: string; admin: unknown; mfa?: unknown }
function fullResponse(result: FullSession) {
  const response = json({ admin: result.admin, ...(result.mfa ? { mfa: result.mfa } : {}) });
  response.cookies.set(ACCESS_COOKIE, result.token, { ...options, maxAge: 900 });
  response.cookies.set(REFRESH_COOKIE, result.refreshToken, { ...scoped, maxAge: 604800 });
  return response;
}
function pendingResponse(result: PendingSession) {
  const response = json({ state: result.state, expiresAt: result.expiresAt });
  clearFullSession(response);
  response.cookies.set(PENDING_COOKIE, result.pendingToken, {
    ...scoped, maxAge: result.state === "mfa_required" ? 300 : 900,
  });
  return response;
}

const apiWithToken = <T,>(path: string, method: string, token: string, body?: object) =>
  growthRequest<T>(path, {
    method, headers: { authorization: `Bearer ${token}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }, false);

export async function GET() {
  const pending = (await cookies()).get(PENDING_COOKIE)?.value;
  if (pending) {
    try {
      return json(await apiWithToken<Pending>("/auth/mfa/pending", "GET", pending));
    } catch (error) {
      const response = fail(error);
      if (response.status === 401) clearPending(response);
      return response;
    }
  }
  try {
    return json(await growthRequest("/auth/me"));
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request) {
  const denied = origin(req);
  if (denied) return denied;
  let input: unknown;
  try {
    input = await req.json();
  } catch {
    return json({ error: "Invalid security request." }, 400);
  }
  if (!input || typeof input !== "object" || Array.isArray(input))
    return json({ error: "Invalid security request." }, 400);
  const { action = "login", ...payload } = input as { action?: unknown; [key: string]: unknown };
  try {
    if (action === "login") {
      const result = await growthRequest<FullSession | PendingSession>(
        "/auth/login", { method: "POST", body: JSON.stringify(payload) }, false,
      );
      if ("state" in result) return pendingResponse(result);
      const response = fullResponse(result);
      clearPending(response);
      return response;
    }
    const jar = await cookies();
    const pending = jar.get(PENDING_COOKIE)?.value;
    const access = jar.get(ACCESS_COOKIE)?.value;
    if (action === "verify") {
      if (!pending) return json({ error: "Sign in again to continue." }, 401);
      const response = fullResponse(await apiWithToken<FullSession>("/auth/mfa/challenge", "POST", pending, payload));
      clearPending(response);
      return response;
    }
    if (action === "reauthenticate") {
      if (!access || pending) return json({ error: "Sign in again to continue." }, 401);
      return fullResponse(await apiWithToken<FullSession>("/auth/mfa/reauthenticate", "POST", access, payload));
    }
    if (action === "startEnrolment" || action === "proveEnrolment" || action === "confirmEnrolment") {
      const token = pending ?? access;
      if (!token) return json({ error: "Sign in again to continue." }, 401);
      const part = action === "startEnrolment" ? "start" : action === "proveEnrolment" ? "prove" : "confirm";
      if (part !== "confirm")
        return json(await apiWithToken(`/auth/mfa/enrolment/${part}`, "POST", token, payload));
      const response = fullResponse(await apiWithToken<FullSession>("/auth/mfa/enrolment/confirm", "POST", token, payload));
      clearPending(response);
      return response;
    }
    return json({ error: "Invalid security action." }, 400);
  } catch (error) {
    return fail(error);
  }
}

async function renew(refreshToken: string) {
  return growthRequest<{ token: string }>(
    "/auth/refresh",
    { method: "POST", body: JSON.stringify({ refreshToken }) },
    false,
  );
}
export async function PATCH(req: Request) {
  const denied = origin(req);
  if (denied) return denied;
  try {
    const jar = await cookies();
    const token = jar.get(REFRESH_COOKIE)?.value;
    if (!token || jar.get(PENDING_COOKIE)?.value)
      return json({ error: "Sign in again." }, 401);
    const session = await renew(token);
    const response = json({ ok: true });
    response.cookies.set(ACCESS_COOKIE, session.token, { ...options, maxAge: 900 });
    return response;
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(req: Request) {
  const denied = origin(req);
  if (denied) return denied;
  const jar = await cookies();
  const pending = jar.get(PENDING_COOKIE)?.value;
  try {
    if (pending) await apiWithToken("/auth/mfa/pending", "DELETE", pending);
    else await growthRequest("/auth/logout", { method: "POST" });
  } catch (error) {
    if (!(error instanceof GrowthError) || error.status !== 401) return fail(error);
    const refreshToken = jar.get(REFRESH_COOKIE)?.value;
    if (!pending && refreshToken) {
      try {
        const renewed = await renew(refreshToken);
        await apiWithToken("/auth/logout", "POST", renewed.token);
      } catch (refreshError) {
        if (!(refreshError instanceof GrowthError) || refreshError.status !== 401) return fail(refreshError);
      }
    }
  }
  const response = json({ ok: true });
  clearFullSession(response);
  clearPending(response);
  return response;
}
