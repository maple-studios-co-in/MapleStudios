import { Router } from "express";
import { requireAdmin } from "../../middleware/auth.js";
import { Inquiry } from "../inquiries/inquiry.model.js";
import { Slot, slotWire } from "../slots/slot.model.js";

interface StatusBucket {
  _id: string;
  n: number;
}
interface CountBucket {
  n: number;
}
interface RecentRow {
  kind: string;
  at: string | Date;
  id: string;
  who: string;
  email: string;
  detail: string;
  status: string;
}
interface Facet {
  byStatus: StatusBucket[];
  total: CountBucket[];
  lastSevenDays: CountBucket[];
  recent: RecentRow[];
}

export const summaryRoutes = Router();
summaryRoutes.use(requireAdmin);

/**
 * Dashboard payload. The inquiry half is a single $facet aggregation - one
 * round trip for five counts plus the recent stream, instead of six queries.
 */
summaryRoutes.get("/summary", async (_req, res) => {
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const now = new Date();

  const facets = await Inquiry.aggregate<Facet>([
    {
      $facet: {
        byStatus: [{ $group: { _id: "$status", n: { $sum: 1 } } }],
        total: [{ $count: "n" }],
        lastSevenDays: [{ $match: { createdAt: { $gt: weekAgo } } }, { $count: "n" }],
        recent: [
          { $sort: { createdAt: -1 } },
          { $limit: 12 },
          {
            $project: {
              _id: 0,
              kind: "inquiry",
              at: "$createdAt",
              id: { $toString: "$_id" },
              who: "$name",
              email: 1,
              detail: { $ifNull: ["$service", "Inquiry"] },
              status: 1,
            },
          },
        ],
      },
    },
  ]);

  const facet: Facet = facets[0] ?? {
    byStatus: [],
    total: [],
    lastSevenDays: [],
    recent: [],
  };

  const statusCount = (s: string) => facet.byStatus.find((b) => b._id === s)?.n ?? 0;

  const [bookedRecent, openCount, bookedCount, nextCall] = await Promise.all([
    Slot.find({ booking: { $ne: null } })
      .sort({ "booking.at": -1 })
      .limit(12)
      .exec(),
    Slot.countDocuments({ booking: null, startsAt: { $gt: now } }).exec(),
    Slot.countDocuments({ booking: { $ne: null } }).exec(),
    Slot.findOne({ booking: { $ne: null }, startsAt: { $gt: now } })
      .sort({ startsAt: 1 })
      .exec(),
  ]);

  const bookingActivity: RecentRow[] = bookedRecent.map((s) => ({
    kind: "booking",
    at: s.booking?.at ?? new Date(),
    id: `${s.date} ${s.time}`,
    who: s.booking?.name ?? "",
    email: s.booking?.email ?? "",
    detail: `${s.date} at ${s.time}`,
    status: "booked",
  }));

  const activity = [...facet.recent, ...bookingActivity]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 12)
    .map((a) => ({ ...a, at: new Date(a.at).toISOString() }));

  res.json({
    inquiries: {
      total: facet.total[0]?.n ?? 0,
      new: statusCount("new"),
      read: statusCount("read"),
      archived: statusCount("archived"),
      lastSevenDays: facet.lastSevenDays[0]?.n ?? 0,
    },
    calls: {
      open: openCount,
      booked: bookedCount,
      next: nextCall ? slotWire(nextCall) : null,
    },
    activity,
  });
});
