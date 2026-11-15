import { denyIfUnauthorized } from "@/lib/admin/cms/guard";
import { NextResponse } from "next/server";
import { deleteInquiry, listInquiries, setInquiryStatus, type InquiryStatus } from "@/lib/inquiries";

export const dynamic = "force-dynamic";

/** Studio access is verified against the current individual account. */
const STATUSES: InquiryStatus[] = ["new", "read", "replied", "archived"];

export async function GET(req: Request) {
  const denied = await denyIfUnauthorized(req);
  if (denied) return denied;
  const inquiries = await listInquiries();
  return NextResponse.json({ inquiries });
}

/** Move one inquiry between new / read / archived: { id, status }. */
export async function PATCH(req: Request) {
  const denied = await denyIfUnauthorized(req);
  if (denied) return denied;
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
  const denied = await denyIfUnauthorized(req);
  if (denied) return denied;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });
  const result = await deleteInquiry(id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
  return NextResponse.json({ ok: true });
}
