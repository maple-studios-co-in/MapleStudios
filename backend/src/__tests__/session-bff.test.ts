import { afterAll, beforeAll, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import { createApp } from "../app.js";
import { AdminUser, hashPassword } from "../modules/auth/admin.model.js";
import { login, refresh } from "../modules/auth/auth.service.js";
const context = vi.hoisted(() => ({ headers: new Headers(), refresh: "" }));
vi.mock("next/headers", () => ({
  headers: async () => context.headers,
  cookies: async () => ({
    get: (name: string) =>
      name === "maple-refresh" ? { value: context.refresh } : undefined,
  }),
}));
import { DELETE } from "../../../src/app/api/admin/session/route";
let server: Server;
beforeAll(async () => {
  server = createApp().listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  process.env.GROWTH_API_ORIGIN = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});
it("logout revokes refresh credentials even when the access cookie expired", async () => {
  await AdminUser.create({
    email: "review@example.com",
    name: "Review",
    role: "owner",
    passwordHash: await hashPassword("review-password-long"),
  });
  const session = await login("review@example.com", "review-password-long");
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
