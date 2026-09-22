import { NextResponse } from "next/server";
import { isAdminKeyConfigured, isAdminKeyValid } from "@/lib/bookings";

/**
 * Shared gate for every /api/admin/cms/* route.
 *
 * Reuses the exact key check the existing admin routes use, so the console has
 * ONE sign-in: the key the operator already types into <AdminShell> unlocks
 * the CMS modules too. Returns a response to send, or null to proceed.
 */
export function denyIfUnauthorized(req: Request): NextResponse | null {
  if (!isAdminKeyConfigured())
    return NextResponse.json(
      {
        error:
          "This deployment has no MAPLE_ADMIN_KEY set, so the admin API is disabled. Set it in the hosting environment and redeploy.",
        code: "admin_key_unconfigured",
      },
      { status: 503 }
    );

  if (!isAdminKeyValid(req.headers.get("x-admin-key")))
    return NextResponse.json({ error: "Invalid admin key." }, { status: 401 });

  return null;
}

/** Parse a JSON body, tolerating an empty one. */
export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}
