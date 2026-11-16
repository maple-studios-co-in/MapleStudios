import type { StudioRole } from "./access-policy";

let refreshing: Promise<boolean> | null = null;
export async function sessionFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const send = () => fetch(input, { ...init, cache: "no-store" });
  let response = await send();
  if (response.status !== 401) return response;
  refreshing ??= fetch("/api/admin/session", { method: "PATCH" })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  if (await refreshing) response = await send();
  return response;
}

export type Account = { id: string; email: string; name: string; role: StudioRole };
export type MfaStatus = {
  enrolled: boolean;
  enforced: boolean;
  verified: boolean;
  recent: boolean;
  verifiedAt: string | null;
  recoveryCodesRemaining: number;
};
export type BrowserSession =
  | { admin: Account; mfa?: MfaStatus }
  | { state: "mfa_required" | "enrolment_required"; expiresAt: string };

export class SessionActionError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = "SessionActionError";
  }
}

export async function sessionAction<T>(input: object): Promise<T> {
  // A failed verification must not be retried automatically as a refresh.
  const response = await fetch("/api/admin/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) throw new SessionActionError(data.error || "Could not complete the security request.", data.code);
  return data as T;
}
