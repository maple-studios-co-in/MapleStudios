import { Router } from "express";
import { publicSlotRoutes, adminSlotRoutes } from "./modules/slots/slot.routes.js";
import { publicInquiryRoutes, adminInquiryRoutes } from "./modules/inquiries/inquiry.routes.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { summaryRoutes } from "./modules/summary/summary.routes.js";
import { publicSocialRoutes, adminSocialRoutes } from "./modules/social/social.routes.js";
import { publicOutreachRoutes, adminOutreachRoutes } from "./modules/outreach/outreach.routes.js";
import { publicLimiter } from "./middleware/rateLimit.js";

export const api = Router();

api.use(publicLimiter);

// public
api.use("/", publicSlotRoutes);
api.use("/", publicInquiryRoutes);
api.use("/auth", authRoutes);

// admin - each router applies requireAdmin itself, so mounting order can
// never accidentally expose one of them.
api.use("/admin", adminSlotRoutes);
api.use("/admin", adminInquiryRoutes);
api.use("/admin", summaryRoutes);

// growth platform — docs/platform/phase-1-spec.md
// Each module exports `publicXRoutes` (mounted at "/") and `adminXRoutes`
// (mounted at "/admin"); add exactly two lines per module here.
// [leads]
// [templates]
// [campaigns]
api.use("/", publicSocialRoutes);
api.use("/admin", adminSocialRoutes);
api.use("/", publicOutreachRoutes);
api.use("/admin", adminOutreachRoutes);
