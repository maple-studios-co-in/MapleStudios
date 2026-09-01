import { DateTime } from "luxon";
import { env } from "../config/env.js";
import { AppError } from "./AppError.js";

/**
 * "2026-09-04" + "10:30" in the studio's timezone -> a real UTC instant.
 *
 * Comparing date strings works only for viewers in the studio's timezone and
 * breaks across DST. Storing the instant makes "upcoming" an indexed range
 * query instead of a string comparison.
 */
export function toStartsAt(date: string, time: string): Date {
  const dt = DateTime.fromISO(`${date}T${time}`, { zone: env.STUDIO_TIMEZONE });
  if (!dt.isValid) {
    throw AppError.badRequest(`Invalid date/time for timezone ${env.STUDIO_TIMEZONE}.`);
  }
  return dt.toUTC().toJSDate();
}

/** Today in the studio's timezone, as YYYY-MM-DD. */
export function studioToday(): string {
  return DateTime.now().setZone(env.STUDIO_TIMEZONE).toISODate() as string;
}

/** N days forward from the studio's today, inclusive of day 0. */
export function studioDays(count: number): string[] {
  const base = DateTime.now().setZone(env.STUDIO_TIMEZONE).startOf("day");
  return Array.from({ length: count }, (_, i) => base.plus({ days: i }).toISODate() as string);
}

/** Monday-Friday check in the studio's timezone. */
export function isWeekday(date: string): boolean {
  const wd = DateTime.fromISO(date, { zone: env.STUDIO_TIMEZONE }).weekday;
  return wd >= 1 && wd <= 5;
}
