import { sessionToken } from "./admin/access-policy";
import { headers } from "next/headers";

export class GrowthError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Server-only access to the existing API. Never fall back to ephemeral files. */
export async function growthRequest<T>(
  path: string,
  init: RequestInit = {},
  authenticated = true,
): Promise<T> {
  const incoming = await headers();
  const outgoing = new Headers(init.headers);
  outgoing.set("content-type", "application/json");
  for (const name of ["x-forwarded-for", "user-agent"]) {
    const value = incoming.get(name);
    if (value) outgoing.set(name, value);
  }
  if (authenticated) {
    const token = sessionToken(incoming.get("cookie"));
    if (token) outgoing.set("authorization", `Bearer ${token}`);
    for (const name of ["authorization", "x-admin-key"]) {
      const value = incoming.get(name);
      if (value && !token) outgoing.set(name, value);
    }
  }
  let response: Response;
  try {
    response = await fetch(
      `${process.env.GROWTH_API_ORIGIN || "http://127.0.0.1:4006"}/api/v1${path}`,
      {
        ...init,
        headers: outgoing,
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      },
    );
  } catch {
    throw new GrowthError(
      503,
      "The service is temporarily unavailable. Please try again.",
    );
  }
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new GrowthError(
      response.status,
      body?.error || "The request could not be completed.",
    );
  if (!body)
    throw new GrowthError(502, "The service returned an invalid response.");
  return body as T;
}
