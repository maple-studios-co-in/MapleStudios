import type { ILead } from "../modules/leads/lead.model.js";

/**
 * Merge fields: `{{field}}` and `{{field|fallback}}`. Field names are
 * snake_case; values come from a flat context built by `leadContext`.
 * `render` escapes values for HTML; `renderText` leaves them raw (subjects,
 * plain-text bodies, LinkedIn messages).
 */
const TOKEN = /\{\{\s*([a-zA-Z0-9_.]+)\s*(?:\|\s*([^}]*?)\s*)?\}\}/g;

export type MergeContext = Record<string, string | undefined>;

export function mergeFieldsIn(sources: readonly string[]): string[] {
  const out = new Set<string>();
  for (const s of sources) for (const m of s.matchAll(TOKEN)) if (m[1]) out.add(m[1]);
  return [...out].sort();
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function apply(template: string, ctx: MergeContext, escape: boolean, missing: Set<string>): string {
  return template.replace(TOKEN, (_m, field: string, fallback?: string) => {
    const value = ctx[field];
    if (value !== undefined && value !== "") return escape ? escapeHtml(value) : value;
    if (fallback !== undefined) return escape ? escapeHtml(fallback) : fallback;
    missing.add(field);
    return "";
  });
}

export interface Rendered {
  subject: string;
  html: string;
  text: string;
  /** fields the template used that the context could not supply */
  missing: string[];
}

export function render(
  parts: { subject?: string; html?: string; text: string },
  ctx: MergeContext
): Rendered {
  const missing = new Set<string>();
  return {
    subject: apply(parts.subject ?? "", ctx, false, missing),
    html: apply(parts.html ?? "", ctx, true, missing),
    text: apply(parts.text, ctx, false, missing),
    missing: [...missing].sort(),
  };
}

export function renderText(template: string, ctx: MergeContext): { text: string; missing: string[] } {
  const missing = new Set<string>();
  return { text: apply(template, ctx, false, missing), missing: [...missing].sort() };
}

/** The flat context a lead contributes. Extra keys (sender_*, unsubscribe_url, today) are merged by the caller. */
export function leadContext(lead: Partial<ILead> | null | undefined): MergeContext {
  if (!lead) return {};
  const custom = lead.custom instanceof Map ? Object.fromEntries(lead.custom) : ((lead.custom as Record<string, string> | undefined) ?? {});
  const ctx: MergeContext = {
    first_name: lead.firstName,
    last_name: lead.lastName,
    full_name: [lead.firstName, lead.lastName].filter(Boolean).join(" ") || undefined,
    email: lead.email ?? undefined,
    phone: lead.phone ?? undefined,
    company: lead.company,
    role: lead.role,
    website: lead.website,
    industry: lead.industry,
    city: lead.city,
    segment: lead.segment,
    owner: lead.owner,
  };
  for (const [k, v] of Object.entries(custom)) ctx[`custom_${k.replace(/[^a-zA-Z0-9_]/g, "_")}`] = v;
  return ctx;
}

/** Sample data for previews when no lead is chosen. */
export const SAMPLE_CONTEXT: MergeContext = {
  first_name: "Asha",
  last_name: "Rao",
  full_name: "Asha Rao",
  email: "asha@example.com",
  company: "Rao Interiors",
  role: "Founder",
  city: "Jaipur",
  industry: "Furniture",
  sender_name: "Aditya",
  sender_email: "hello@maplestudios.co.in",
  unsubscribe_url: "https://maplestudios.co.in/unsubscribe/example",
  today: new Date().toISOString().slice(0, 10),
};
