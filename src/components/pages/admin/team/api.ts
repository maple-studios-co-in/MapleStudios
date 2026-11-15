import { sessionFetch } from "@/lib/admin/session-client";
export async function teamRequest<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await sessionFetch(`/api/v2${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      data.details
        ?.map(
          (d: { field: string; message: string }) => `${d.field}: ${d.message}`,
        )
        .join(" · ") ||
        data.error ||
        "Request failed.",
    );
  return data;
}
export type Employee = {
  id: string;
  name: string;
  email: string;
  title: string;
  contractStart?: string;
  contractStatus?: string;
  contractReference?: string;
  status?: string;
};
export type Leave = {
  id: string;
  employeeId: string;
  start: string;
  end: string;
  days: number;
  reason: string;
  status: string;
  requestedBy: string;
};
export type Attendance = {
  id: string;
  employeeId: string;
  date: string;
  status: string;
  note: string;
};
