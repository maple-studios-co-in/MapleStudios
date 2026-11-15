/** A form succeeds only when storage acknowledges a durable record. */
export async function submitInquiry(
  input: Record<string, string>,
  endpoint = "/api/inquiries",
): Promise<string> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.ok !== true || typeof body?.id !== "string") {
    throw new Error(
      body?.error ||
        "We could not save your enquiry. Please try again; your details are still here.",
    );
  }
  return body.id;
}
