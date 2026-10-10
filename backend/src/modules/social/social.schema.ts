import { z } from "zod";
import { PLATFORMS } from "../../lib/social/types.js";
import { POST_STATUSES } from "./post.model.js";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Malformed id.");

/** Wire dates are ISO strings with an offset; coerce.date would accept far too much. */
const isoDate = z
  .string()
  .datetime({ offset: true, message: "Use an ISO date-time such as 2026-10-12T10:30:00+05:30." })
  .transform((s) => new Date(s));

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");

/** Providers fetch the media themselves, so only a public https link will do. */
const mediaUrl = z
  .string()
  .trim()
  .max(2000)
  .url("Media URLs must be absolute links.")
  .refine((u) => /^https:\/\//i.test(u), "Media URLs must start with https://.");

const platforms = z
  .array(z.enum(PLATFORMS))
  .min(1, "Pick at least one platform.")
  .transform((list) => [...new Set(list)]);

export const platformParam = z.object({ platform: z.enum(PLATFORMS) });

export const idParam = z.object({ id: objectId });

/** Whatever the provider sends back; anything missing becomes `?error=` on the console. */
export const callbackQuery = z.object({
  code: z.string().max(4000).optional(),
  state: z.string().max(500).optional(),
  error: z.string().max(200).optional(),
  error_description: z.string().max(2000).optional(),
});

export const createPostSchema = z.object({
  text: z.string().trim().min(1, "Write something to post.").max(3000),
  mediaUrls: z.array(mediaUrl).max(10).default([]),
  platforms,
  scheduledAt: isoDate.optional(),
});
export type CreatePostInput = z.infer<typeof createPostSchema>;

export const patchPostSchema = z
  .object({
    text: z.string().trim().min(1, "Write something to post.").max(3000).optional(),
    mediaUrls: z.array(mediaUrl).max(10).optional(),
    platforms: platforms.optional(),
    /** null clears the schedule and returns the post to draft */
    scheduledAt: isoDate.nullable().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, "Nothing to update.");
export type PatchPostInput = z.infer<typeof patchPostSchema>;

export const scheduleSchema = z.object({ scheduledAt: isoDate });

export const listPostsQuery = z.object({
  from: ymd.optional(),
  to: ymd.optional(),
  platform: z.enum(PLATFORMS).optional(),
  status: z.enum(POST_STATUSES).optional(),
});
export type ListPostsQuery = z.infer<typeof listPostsQuery>;
