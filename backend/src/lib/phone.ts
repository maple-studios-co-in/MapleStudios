/**
 * Phone numbers are stored as E.164 so the unique index can do its job:
 * "98765 43210", "098765-43210" and "+91 98765 43210" are one person and
 * only one spelling may exist. Rules from docs/platform/phase-1-spec.md §1 -
 * strip spaces, dashes and parentheses; keep a leading "+"; a national
 * Indian number (10 digits, 0 + 10 digits, or 91 + 10 digits) gets the
 * default country code; anything else must already be 8-15 digits.
 */
const E164 = /^\+[1-9]\d{7,14}$/;

export function isValidE164(value: string): boolean {
  return E164.test(value);
}

export function normalisePhone(raw: unknown, defaultCountry = "+91"): string | null {
  if (typeof raw !== "string") return null;
  const compact = raw.replace(/[\s\-()]/g, "");
  if (!compact) return null;

  const hasPlus = compact.startsWith("+");
  const digits = hasPlus ? compact.slice(1) : compact;
  if (!/^\d+$/.test(digits)) return null;

  const country = defaultCountry.replace(/\D/g, "");
  let candidate: string;
  if (hasPlus) candidate = `+${digits}`;
  else if (digits.length === 10) candidate = `+${country}${digits}`;
  else if (digits.length === 11 && digits.startsWith("0")) candidate = `+${country}${digits.slice(1)}`;
  else if (digits.length === country.length + 10 && digits.startsWith(country)) candidate = `+${digits}`;
  else candidate = `+${digits}`;

  // The regex is the single source of truth: it also rejects "+0…", which
  // the fall-through above can produce from a trunk-prefixed foreign number.
  return isValidE164(candidate) ? candidate : null;
}
