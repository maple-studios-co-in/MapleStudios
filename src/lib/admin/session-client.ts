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
