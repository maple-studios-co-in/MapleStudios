import { growthRequest, GrowthError } from "./growth-server";

export type InquiryStatus = "new" | "read" | "replied" | "archived";

export type Inquiry = {
  /** sortable + unique: ISO timestamp + short random suffix */
  id: string;
  /** ISO timestamp of submission */
  at: string;
  name: string;
  email: string;
  company?: string;
  service: string;
  budget: string;
  message: string;
  status: InquiryStatus;
};

export async function listInquiries(): Promise<Inquiry[]> {
  const rows: Inquiry[] = [];
  let page = 1;
  let pages = 1;
  do {
    const response = await growthRequest<{
      inquiries: Inquiry[];
      meta: { pages: number };
    }>(`/admin/inquiries?limit=100&page=${page}`);
    rows.push(...response.inquiries);
    pages = response.meta.pages;
    page += 1;
  } while (page <= pages);
  return rows;
}
export async function addInquiry(
  data: Omit<Inquiry, "id" | "at" | "status">,
): Promise<Inquiry> {
  const response = await growthRequest<{ id: string }>(
    "/inquiries",
    { method: "POST", body: JSON.stringify(data) },
    false,
  );
  return {
    ...data,
    id: response.id,
    at: new Date().toISOString(),
    status: "new",
  };
}
export async function setInquiryStatus(
  id: string,
  status: InquiryStatus,
): Promise<{ ok: true; inquiry: Inquiry } | { ok: false; error: string }> {
  try {
    const response = await growthRequest<{ inquiry: Inquiry }>(
      `/admin/inquiries/${encodeURIComponent(id)}`,
      { method: "PATCH", body: JSON.stringify({ status }) },
    );
    return { ok: true, inquiry: response.inquiry };
  } catch (error) {
    if (error instanceof GrowthError && error.status === 404)
      return { ok: false, error: error.message };
    throw error;
  }
}
export async function deleteInquiry(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await growthRequest(`/admin/inquiries/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof GrowthError && error.status === 404)
      return { ok: false, error: error.message };
    throw error;
  }
}
