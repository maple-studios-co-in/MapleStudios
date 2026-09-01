import request from "supertest";
import { describe, it, expect, beforeEach } from "vitest";
import { createApp } from "../app.js";
import { Slot } from "../modules/slots/slot.model.js";
import { toStartsAt } from "../lib/time.js";

const app = createApp();

/** A slot comfortably in the future so startsAt > now passes. */
async function openSlot(date = "2099-01-05", time = "10:00") {
  return Slot.create({ date, time, startsAt: toStartsAt(date, time), booking: null });
}

const visitor = { name: "Asha", email: "asha@example.com" };

describe("POST /api/v1/bookings", () => {
  beforeEach(async () => {
    await openSlot();
  });

  it("claims a free slot", async () => {
    const res = await request(app)
      .post("/api/v1/bookings")
      .send({ date: "2099-01-05", time: "10:00", ...visitor });

    expect(res.status).toBe(201);
    expect(res.body.booked).toEqual({
      id: "2099-01-05 10:00",
      date: "2099-01-05",
      time: "10:00",
    });

    const slot = await Slot.findOne({ date: "2099-01-05", time: "10:00" }).exec();
    expect(slot?.booking?.email).toBe("asha@example.com");
  });

  it("accepts slotId instead of date and time", async () => {
    const res = await request(app)
      .post("/api/v1/bookings")
      .send({ slotId: "2099-01-05 10:00", ...visitor });
    expect(res.status).toBe(201);
  });

  it("rejects a second claim with 409", async () => {
    await request(app)
      .post("/api/v1/bookings")
      .send({ date: "2099-01-05", time: "10:00", ...visitor });

    const second = await request(app)
      .post("/api/v1/bookings")
      .send({ date: "2099-01-05", time: "10:00", name: "Ravi", email: "ravi@example.com" });

    expect(second.status).toBe(409);
    expect(second.body.code).toBe("CONFLICT");
  });

  /**
   * The regression this whole design exists for. Ten simultaneous claims on
   * one slot must produce exactly one booking - a read-then-write store
   * fails this every time.
   */
  it("survives ten concurrent claims - exactly one wins", async () => {
    const attempts = Array.from({ length: 10 }, (_, i) =>
      request(app)
        .post("/api/v1/bookings")
        .send({
          date: "2099-01-05",
          time: "10:00",
          name: `Person ${i}`,
          email: `p${i}@example.com`,
        })
    );

    const results = await Promise.all(attempts);
    const created = results.filter((r) => r.status === 201);
    const conflicts = results.filter((r) => r.status === 409);

    expect(created).toHaveLength(1);
    expect(conflicts).toHaveLength(9);

    const slot = await Slot.findOne({ date: "2099-01-05", time: "10:00" }).exec();
    expect(slot?.booking).not.toBeNull();
  });

  it("404s an unknown slot", async () => {
    const res = await request(app)
      .post("/api/v1/bookings")
      .send({ date: "2099-02-02", time: "09:00", ...visitor });
    expect(res.status).toBe(404);
  });

  it("410s a slot in the past", async () => {
    await Slot.create({
      date: "2020-01-01",
      time: "10:00",
      startsAt: toStartsAt("2020-01-01", "10:00"),
      booking: null,
    });
    const res = await request(app)
      .post("/api/v1/bookings")
      .send({ date: "2020-01-01", time: "10:00", ...visitor });
    expect(res.status).toBe(410);
  });

  it("validates the payload", async () => {
    const res = await request(app)
      .post("/api/v1/bookings")
      .send({ date: "2099-01-05", time: "10:00", name: "", email: "nope" });
    expect(res.status).toBe(400);
    expect(Array.isArray(res.body.details)).toBe(true);
  });
});

describe("GET /api/v1/slots", () => {
  it("lists only open, future slots", async () => {
    await openSlot("2099-01-05", "10:00");
    await Slot.create({
      date: "2020-01-01",
      time: "10:00",
      startsAt: toStartsAt("2020-01-01", "10:00"),
      booking: null,
    });
    await Slot.create({
      date: "2099-01-06",
      time: "11:00",
      startsAt: toStartsAt("2099-01-06", "11:00"),
      booking: { name: "Taken", email: "t@example.com", at: new Date() },
    });

    const res = await request(app).get("/api/v1/slots");
    expect(res.status).toBe(200);
    expect(res.body.slots).toHaveLength(1);
    expect(res.body.slots[0].id).toBe("2099-01-05 10:00");
  });
});
