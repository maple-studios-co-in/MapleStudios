import { afterAll, beforeAll, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import { createApp } from "../app.js";
import { Inquiry } from "../modules/inquiries/inquiry.model.js";
import { Slot } from "../modules/slots/slot.model.js";
import { AdminUser, hashPassword } from "../modules/auth/admin.model.js";
import { login } from "../modules/auth/auth.service.js";
import * as inquiries from "../../../src/lib/inquiries";
import * as slots from "../../../src/lib/bookings";

const context = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => context.headers }));
let server: Server;
beforeAll(async () => {
  server = createApp().listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as { port: number };
  process.env.GROWTH_API_ORIGIN = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
async function authenticate() {
  await AdminUser.create({
    email: "test@example.com",
    name: "Test",
    role: "owner",
    passwordHash: await hashPassword("test-password-long"),
  });
  const session = await login("test@example.com", "test-password-long");
  context.headers.set("authorization", `Bearer ${session.token}`);
}
const input = {
  name: "Visitor",
  email: "visitor@example.com",
  service: "Website",
  budget: "Discuss",
  message: "Build a website",
};
it("stores every parallel website enquiry in MongoDB", async () => {
  const results = await Promise.allSettled(
    Array.from({ length: 10 }, () => inquiries.addInquiry(input)),
  );
  expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(10);
  expect(await Inquiry.countDocuments()).toBe(10);
});
it("loads every page for Contacts rather than truncating at the API page limit", async () => {
  await authenticate();
  await Inquiry.insertMany(
    Array.from({ length: 105 }, () => ({ ...input, status: "new" })),
  );
  expect(await inquiries.listInquiries()).toHaveLength(105);
});
it("claims one slot atomically and preserves the calendar free-only action", async () => {
  await authenticate();
  await Slot.create({
    date: "2099-01-05",
    time: "10:00",
    startsAt: new Date("2099-01-05T04:30:00Z"),
    booking: null,
  });
  const results = await Promise.all(
    Array.from({ length: 10 }, () => slots.bookSlot("2099-01-05 10:00", input)),
  );
  expect(results.filter((x) => x.ok)).toHaveLength(1);
  expect((await Slot.findOne())?.booking?.email).toBe(input.email);
  const current = (await slots.listAllSlots())[0]!;
  expect(
    await slots.removeSlot("2099-01-05 10:00", {
      freeOnly: true,
      expectedBooking: current.booking!.claimId || current.booking!.at,
    }),
  ).toEqual({ ok: true });
  expect((await Slot.findOne())?.booking).toBeNull();
  expect(await Slot.countDocuments()).toBe(1);
});
it("surfaces an unavailable database API instead of returning an empty inbox", async () => {
  await authenticate();
  const origin = process.env.GROWTH_API_ORIGIN;
  process.env.GROWTH_API_ORIGIN = "http://127.0.0.1:1";
  try {
    await expect(inquiries.listInquiries()).rejects.toThrow();
  } finally {
    process.env.GROWTH_API_ORIGIN = origin;
  }
});
it("never clears a replacement booking when cancellation is retried", async () => {
  await authenticate();
  await Slot.create({
    date: "2099-01-05",
    time: "10:00",
    startsAt: new Date("2099-01-05T04:30:00Z"),
    booking: null,
  });
  await slots.bookSlot("2099-01-05 10:00", input);
  const before = (await slots.listAllSlots())[0]!;
  const expectedBooking =
    (before.booking as { claimId?: string; at: string }).claimId ||
    before.booking!.at;
  await slots.removeSlot(before.id, {
    freeOnly: true,
    expectedBooking,
  } as Parameters<typeof slots.removeSlot>[1]);
  await slots.bookSlot(before.id, {
    name: "Replacement",
    email: "replacement@example.com",
  });
  const retried = await slots.removeSlot(before.id, {
    freeOnly: true,
    expectedBooking,
  } as Parameters<typeof slots.removeSlot>[1]);
  expect(retried.ok).toBe(false);
  expect((await Slot.findOne())?.booking?.email).toBe(
    "replacement@example.com",
  );
});

it("only acknowledges form success when the API saved a record", async()=>{
  const {submitInquiry}=await import("../../../src/lib/submit-inquiry");
  const saved=await submitInquiry(input,`${process.env.GROWTH_API_ORIGIN}/api/v1/inquiries`);
  expect(await Inquiry.exists({_id:saved})).toBeTruthy();
  await expect(submitInquiry({...input,email:"not-an-email"},`${process.env.GROWTH_API_ORIGIN}/api/v1/inquiries`)).rejects.toThrow();
  expect(await Inquiry.countDocuments()).toBe(1);
});
