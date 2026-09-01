import { Router } from "express";
import { validate, body, params, query } from "../../middleware/validate.js";
import { writeLimiter } from "../../middleware/rateLimit.js";
import { requireAdmin } from "../../middleware/auth.js";
import { slotWire } from "./slot.model.js";
import {
  createBookingSchema,
  createSlotSchema,
  removeSlotQuery,
  slotIdParam,
} from "./slot.schema.js";
import * as slots from "./slot.service.js";

/** Public: what the booking widget on /contact talks to. */
export const publicSlotRoutes = Router();

publicSlotRoutes.get("/slots", async (_req, res) => {
  const open = await slots.listOpenSlots();
  // The widget only needs the identity of each open slot.
  const list = open.map((s) => ({ id: `${s.date} ${s.time}`, date: s.date, time: s.time }));
  res.json({ slots: list });
});

publicSlotRoutes.post(
  "/bookings",
  writeLimiter,
  validate({ body: createBookingSchema }),
  async (req, res) => {
    const input = body(req, createBookingSchema);
    const slot = await slots.claimSlot(input);
    res.status(201).json({
      booked: { id: `${slot.date} ${slot.time}`, date: slot.date, time: slot.time },
    });
  }
);

/** Admin: the availability calendar. */
export const adminSlotRoutes = Router();
adminSlotRoutes.use(requireAdmin);

adminSlotRoutes.get("/slots", async (_req, res) => {
  const all = await slots.listAllSlots();
  res.json({ slots: all.map((s) => slotWire(s)) });
});

adminSlotRoutes.post("/slots", validate({ body: createSlotSchema }), async (req, res) => {
  const { date, time } = body(req, createSlotSchema);
  const slot = await slots.addSlot(date, time);
  res.status(201).json({ slot: slotWire(slot) });
});

adminSlotRoutes.delete(
  "/slots/:id",
  validate({ params: slotIdParam, query: removeSlotQuery }),
  async (req, res) => {
    const { id } = params(req, slotIdParam);
    const { force } = query(req, removeSlotQuery);
    await slots.removeSlot(id, force);
    res.json({ ok: true });
  }
);
