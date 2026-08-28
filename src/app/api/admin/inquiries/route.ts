import { NextResponse } from "next/server";
import { isAdminKeyConfigured, isAdminKeyValid } from "@/lib/bookings";
import { deleteInquiry, listInquiries, setInquiryStatus, type InquiryStatus } from "@/lib/inquiries";

export const dynamic = "force-dynamic";

/**
 * Admin inquiry API — same `x-admin-key` guard as /api/admin/slots, checked
 * against MAPLE_ADMIN_KEY (falls back to "maple-admin" for local demos; set
 * the env var before exposing this anywhere).
 */
function unauthorized() {
  return NextResponse.json({ error: "Invalid admin key." }, { status: 401 });
}

/**
 * 503, not 401: the operator's key is not wrong, the deployment simply has no
 * MAPLE_ADMIN_KEY set. Production fails closed (see isAdminKeyConfigured), so
 * say exactly that rather than sending them round the "wrong password" loop.
 */
function notConfigured() {
  return NextResponse.json(
    {
      error:
        "This deployment has no MAPLE_ADMIN_KEY set, so the admin API is disabled. Set it in the hosting environment and redeploy.",
      code: "admin_key_unconfigured",
    },
    { status: 503 }
  );
}


const STATUSES: InquiryStatus[] = ["new", "read", "archived"];

export async function GET(req: Request) {
  if (!isAdminKeyConfigured()) return notConfigured();
  if (!isAdminKeyValid(req.headers.get("x-admin-key"))) return unauthorized();
  const inquiries = await listInquiries();
  return NextResponse.json({ inquiries });
}

/** Move one inquiry between new / read / archived: { id, status }. */
export async function PATCH(req: Request) {
  if (!isAdminKeyConfigured()) return notConfigured();
  if (!isAdminKeyValid(req.headers.get("x-admin-key"))) return unauthorized();
  let body: { id?: string; status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const id = (body.id ?? "").trim();
  const status = (body.status ?? "") as InquiryStatus;
  if (!id || !STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `id and a status of ${STATUSES.join(" | ")} are required.` },
      { status: 400 }
    );
  }
  const result = await setInquiryStatus(id, status);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
  return NextResponse.json({ inquiry: result.inquiry });
}

/** Permanently drop one inquiry (?id=...). */
export async function DELETE(req: Request) {
  if (!isAdminKeyConfigured()) return notConfigured();
  if (!isAdminKeyValid(req.headers.get("x-admin-key"))) return unauthorized();
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });
  const result = await deleteInquiry(id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
  return NextResponse.json({ ok: true });
}
