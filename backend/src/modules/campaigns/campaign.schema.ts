import { z } from "zod";
import { IANAZone } from "luxon";
import { env } from "../../config/env.js";
import { CAMPAIGN_STATUSES } from "./campaign.model.js";
import { MESSAGE_STATUSES } from "./message.model.js";
import { LEAD_STAGES } from "../leads/lead.model.js";

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Malformed id.");
const email = z.string().trim().toLowerCase().email("That email address does not look right.");
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be HH:mm (24-hour).");

/** Mirrors LeadFilter in leads/segment.model.ts. Unknown keys are rejected
    rather than silently ignored, so a typo cannot widen an audience. */
export const leadFilterSchema = z
  .object({
    stage: z.array(z.enum(LEAD_STAGES)).max(LEAD_STAGES.length).optional(),
    tags: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
    segment: z.string().trim().max(120).optional(),
    owner: z.string().trim().max(120).optional(),
    industry: z.string().trim().max(120).optional(),
    city: z.string().trim().max(120).optional(),
    hasEmail: z.boolean().optional(),
    hasPhone: z.boolean().optional(),
    q: z.string().trim().max(120).optional(),
  })
  .strict();

export const audienceSchema = z
  .object({
    segmentId: objectId.optional(),
    leadIds: z.array(objectId).min(1, "Pick at least one lead.").max(5000).optional(),
    filter: leadFilterSchema.optional(),
  })
  .strict()
  .refine((a) => [a.segmentId, a.leadIds, a.filter].filter((v) => v !== undefined).length === 1, {
    message: "Choose exactly one of segmentId, leadIds or filter.",
  });

export const stepSchema = z.object({
  templateId: objectId,
  delayDays: z.number().int().min(0).max(365),
  stopIfReplied: z.boolean().default(true),
});

export const stepsSchema = z
  .array(stepSchema)
  .min(1, "A campaign needs at least one step.")
  .max(10)
  .superRefine((steps, ctx) => {
    steps.forEach((s, i) => {
      // Step 0 is timed by startAt; a 0-day follow-up would fire in the
      // same tick as the step before it.
      if (i === 0 && s.delayDays !== 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [i, "delayDays"], message: "The first step goes out at startAt; set its delayDays to 0." });
      }
      if (i > 0 && s.delayDays < 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [i, "delayDays"], message: "Follow-up steps need at least a day's delay." });
      }
    });
  });

export const scheduleSchema = z
  .object({
    startAt: z.string().datetime({ offset: true, message: "startAt must be an ISO 8601 instant." }),
    dailyCap: z.number().int().min(1).max(1000).default(30),
    window: z.object({ start: hhmm.default("09:30"), end: hhmm.default("18:00") }).default({}),
    weekdaysOnly: z.boolean().default(true),
    timezone: z
      .string()
      .refine((tz) => IANAZone.isValidZone(tz), { message: "Unknown IANA timezone." })
      .default(env.STUDIO_TIMEZONE),
  })
  .refine((s) => s.window.start < s.window.end, {
    message: "The send window must end after it starts.",
    path: ["window", "end"],
  });

export const createCampaignSchema = z.object({
  name: z.string().trim().min(1, "Please name the campaign.").max(160),
  from: z.object({ name: z.string().trim().min(1).max(120), email }),
  replyTo: email.optional(),
  audience: audienceSchema,
  steps: stepsSchema,
  schedule: scheduleSchema,
});

/** Sub-objects are replaced whole; the console always sends the full shape. */
export const patchCampaignSchema = createCampaignSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update." });

export const listCampaignsQuery = z.object({
  status: z.enum(CAMPAIGN_STATUSES).optional(),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const campaignIdParam = z.object({ id: objectId });

export const previewQuery = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

export const listMessagesQuery = z.object({
  status: z.enum(MESSAGE_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const listSuppressionsQuery = z.object({
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const createSuppressionSchema = z.object({
  email,
  note: z.string().trim().max(400).optional(),
});

export const suppressionIdParam = z.object({ id: objectId });
