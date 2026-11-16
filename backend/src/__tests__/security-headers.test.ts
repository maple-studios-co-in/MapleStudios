import { expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../../../src/middleware";
import { forwardClientIp } from "../../../src/lib/admin/proxy-ip";

it("uses a unique Next render nonce and retains same-origin dashboard previews", async () => {
  const visit = () => middleware(new NextRequest("https://studio.example/admin/drafts"));
  const response = await visit();
  const policy = response.headers.get("Content-Security-Policy") ?? "";
  const nonce = policy.match(/'nonce-([^']+)'/)?.[1];
  expect(nonce).toBeTruthy();
  expect(response.headers.get("x-middleware-request-x-nonce")).toBe(nonce);
  expect(policy).toContain("frame-src 'self' about: blob:");
  expect(policy).toContain("frame-ancestors 'none'");
  expect(policy.match(/script-src ([^;]+)/)?.[1]).not.toContain("'unsafe-inline'");
  expect((await visit()).headers.get("Content-Security-Policy")).not.toBe(policy);
});

it("keeps signing pages noncacheable and limits resource requests to this site", async () => {
  const response = await middleware(new NextRequest("https://studio.example/sign/example"));
  const policy = response.headers.get("Content-Security-Policy") ?? "";
  expect(policy).toContain("connect-src 'self'");
  expect(policy).toContain("frame-src 'none'");
  expect(policy).not.toContain("google");
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
  expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
});

it("forwards only the single address set by the trusted ingress", () => {
  const outgoing = new Headers({ "x-forwarded-for": "192.0.2.50" });
  forwardClientIp(new Headers({ "x-forwarded-for": "198.51.100.1, 203.0.113.1" }), outgoing);
  expect(outgoing.get("x-forwarded-for")).toBeNull();
  forwardClientIp(new Headers({ "x-real-ip": "2001:db8::17", "x-forwarded-for": "198.51.100.1" }), outgoing);
  expect(outgoing.get("x-forwarded-for")).toBe("2001:db8::17");
  forwardClientIp(new Headers({ "x-real-ip": "192.0.2.1, 192.0.2.2" }), outgoing);
  expect(outgoing.get("x-forwarded-for")).toBeNull();
});
