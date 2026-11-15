import { afterEach, expect, it, vi } from "vitest";
import { sameOriginMutation } from "../../../src/lib/admin/access-policy";
afterEach(() => vi.unstubAllEnvs());
const request = (origin?: string) => new Request("http://localhost:4307/api/admin/session", {
  method: "POST", headers: { host: "maplestudios.ai", "x-forwarded-proto": "https", ...(origin ? { origin } : {}) },
});
it("accepts the configured public origin behind a reverse proxy", () => {
  vi.stubEnv("MAPLE_PUBLIC_ORIGIN", "https://maplestudios.ai");
  expect(sameOriginMutation(request("https://maplestudios.ai"))).toBe(true);
});
it("rejects foreign, missing and internal origins when public origin is configured", () => {
  vi.stubEnv("MAPLE_PUBLIC_ORIGIN", "https://maplestudios.ai");
  for (const origin of [undefined, "null", "https://evil.example", "http://localhost:4307", "https://maplestudios.ai.evil.example"])
    expect(sameOriginMutation(request(origin))).toBe(false);
});
it("uses direct request origin for local development without trusting forwarded headers", () => {
  vi.stubEnv("MAPLE_PUBLIC_ORIGIN", "");
  expect(sameOriginMutation(request("http://localhost:4307"))).toBe(true);
  expect(sameOriginMutation(request("https://maplestudios.ai"))).toBe(false);
});
it("fails closed for invalid configured origins", () => {
  vi.stubEnv("MAPLE_PUBLIC_ORIGIN", "invalid");
  expect(sameOriginMutation(request("http://localhost:4307"))).toBe(false);
});
