import { growthRequest, GrowthError } from "./growth-server";

export type SlotBooking = {
  claimId?: string;
  name: string;
  email: string;
  note?: string;
  /** ISO timestamp of when the visitor claimed the slot */
  at: string;
};

export type Slot = {
  /** `${date} ${time}` — stable, human-readable, unique */
  id: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm (24h), each slot is 30 minutes */
  time: string;
  booking: SlotBooking | null;
};

export const slotId = (date: string, time: string) => `${date} ${time}`;
export async function listOpenSlots(): Promise<
  Pick<Slot, "id" | "date" | "time">[]
> {
  return (await growthRequest<{ slots: Slot[] }>("/slots", {}, false)).slots;
}
export async function listAllSlots(): Promise<Slot[]> {
  return (await growthRequest<{ slots: Slot[] }>("/admin/slots")).slots;
}
export async function addSlot(date: string, time: string): Promise<Slot> {
  return (
    await growthRequest<{ slot: Slot }>("/admin/slots", {
      method: "POST",
      body: JSON.stringify({ date, time }),
    })
  ).slot;
}
export async function bookSlot(
  id: string,
  visitor: { name: string; email: string; note?: string },
): Promise<{ ok: true; slot: Slot } | { ok: false; error: string }> {
  try {
    const response = await growthRequest<{
      booked: Pick<Slot, "id" | "date" | "time">;
    }>(
      "/bookings",
      { method: "POST", body: JSON.stringify({ slotId: id, ...visitor }) },
      false,
    );
    return {
      ok: true,
      slot: {
        ...response.booked,
        booking: { ...visitor, at: new Date().toISOString() },
      },
    };
  } catch (error) {
    if (error instanceof GrowthError && [404, 409, 410].includes(error.status))
      return { ok: false, error: error.message };
    throw error;
  }
}
export async function removeSlot(
  id: string,
  opts: { force?: boolean; freeOnly?: boolean; expectedBooking?: string } = {},
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await growthRequest(
      `/admin/slots/${encodeURIComponent(id)}?force=${Boolean(opts.force)}&free=${Boolean(opts.freeOnly)}${opts.expectedBooking ? `&expectedBooking=${encodeURIComponent(opts.expectedBooking)}` : ""}`,
      { method: "DELETE" },
    );
    return { ok: true };
  } catch (error) {
    if (error instanceof GrowthError && [404, 409].includes(error.status))
      return { ok: false, error: error.message };
    throw error;
  }
}

/** The local-demo fallback key. Only ever accepted OFF a production host. */
const DEV_ADMIN_KEY = "maple-admin";

/**
 * True when the deployment actually has an admin key configured.
 *
 * On a production host an unset MAPLE_ADMIN_KEY used to silently fall back to
 * the published demo key above — which, now that /admin exposes contact-form
 * inquiries (names, emails, message bodies), would hand that data to anyone
 * who tried it. So production FAILS CLOSED: without the env var no key is
 * accepted at all, and the routes say so explicitly instead of pretending the
 * operator typed the wrong thing.
 */
export function isAdminKeyConfigured() {
  if (process.env.MAPLE_ADMIN_KEY) return true;
  return !(process.env.VERCEL || process.env.NODE_ENV === "production");
}

export function isAdminKeyValid(key: string | null | undefined) {
  if (!isAdminKeyConfigured()) return false;
  const expected = process.env.MAPLE_ADMIN_KEY || DEV_ADMIN_KEY;
  return Boolean(key) && key === expected;
}
