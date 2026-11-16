import { afterAll, beforeAll, afterEach, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import { createApp } from "../app.js";
import { AdminUser, hashPassword } from "../modules/auth/admin.model.js";
import { encrypt } from "../lib/crypto.js";
import { env } from "../config/env.js";
import { generate } from "otplib";
import { login, refresh } from "../modules/auth/auth.service.js";
const context = vi.hoisted(() => ({ headers: new Headers(), refresh: "", pending: "" }));
vi.mock("next/headers", () => ({
  headers: async () => context.headers,
  cookies: async () => ({
    get: (name: string) =>
      name === "maple-refresh" ? { value: context.refresh } :
      name === "maple-pending" && context.pending ? { value: context.pending } : undefined,
  }),
}));
import { DELETE, GET, POST } from "../../../src/app/api/admin/session/route";
import { POST as proxyPost } from "../../../src/app/api/v2/[...path]/route";
const originalOrigin = process.env.GROWTH_API_ORIGIN;
let server: Server;
afterEach(() => {
  Object.assign(context, { headers: new Headers(), refresh: "", pending: "" });
  Object.assign(env, { MFA_REQUIRED: false });
});
beforeAll(async () => {
  server = createApp().listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  process.env.GROWTH_API_ORIGIN = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  if (originalOrigin) process.env.GROWTH_API_ORIGIN = originalOrigin;
  else delete process.env.GROWTH_API_ORIGIN;
});
it("logout revokes refresh credentials even when the access cookie expired", async () => {
  await AdminUser.create({
    email: "review@example.com",
    name: "Review",
    role: "owner",
    passwordHash: await hashPassword("review-password-long"),
  });
  const session = await login("review@example.com", "review-password-long");
  if (!("refreshToken" in session) || !session.refreshToken) throw new Error("Expected full test session");
  context.refresh = session.refreshToken;
  context.headers = new Headers({
    cookie: `maple-refresh=${session.refreshToken}`,
  });
  const result = await DELETE(
    new Request("http://localhost/api/admin/session", {
      method: "DELETE",
      headers: { origin: "http://localhost" },
    }),
  );
  expect(result.status).toBe(200);
  await expect(refresh(session.refreshToken)).rejects.toThrow();
});

const request = (body: unknown, origin = "http://localhost") => new Request("http://localhost/api/admin/session", {
  method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body),
});
const user = { email: "another@example.test", password: "synthetic-passphrase" };
async function account(secret?: string) {
  await AdminUser.create({
    email: user.email, name: "Operator", role: "owner", passwordHash: await hashPassword(user.password),
    ...(secret ? { mfaSecretEnc: encrypt(secret), mfaEnrolledAt: new Date() } : {}),
  });
}
it("sets only a scoped HttpOnly pending cookie until a second factor succeeds", async () => {
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  await account(secret);
  const result = await POST(request(user));
  expect(result.status).toBe(200);
  expect(await result.json()).toMatchObject({ state: "mfa_required", expiresAt: expect.any(String) });
  const pending = result.cookies.get("maple-pending");
  expect(pending).toMatchObject({ httpOnly: true, sameSite: "strict", path: "/api/admin/session" });
  context.pending = pending!.value;
  expect(result.cookies.get("maple-session")?.value ?? "").toBe("");
  expect(result.cookies.get("maple-refresh")?.value ?? "").toBe("");
  expect(result.headers.get("Cache-Control")).toBe("no-store");
  expect((await (await GET()).json()).state).toBe("mfa_required");
  const code = await generate({ secret });
  expect((await POST(request({ action: "verify", code }, "https://evil.example"))).status).toBe(403);
  const verified = await POST(request({ action: "verify", code }));
  expect(await verified.json()).toMatchObject({ admin: { email: user.email }, mfa: { verified: true } });
  expect(verified.cookies.get("maple-session")?.value).toBeTruthy();
  expect(verified.cookies.get("maple-refresh")?.value).toBeTruthy();
  expect(verified.cookies.get("maple-pending")?.value ?? "").toBe("");
});

it("does not relay raw session endpoints through the generic public BFF", async () => {
  await account();
  const response = await proxyPost(request(user), { params: Promise.resolve({ path: ["auth", "login"] }) });
  expect(response.status).toBe(404);
  expect(await response.json()).not.toHaveProperty("token");
});
