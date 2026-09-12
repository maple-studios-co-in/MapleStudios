import {
  CLIENT_STORIES_DATA,
  HERO_DATA,
  SERVICES_PAGE,
  SITE_CONFIG,
  WORK_PAGE,
} from "@/lib/constants";

import { HOMEPAGE_DEFAULT, SITE_COPY_DEFAULT } from "./seed";
import { readAll, readDoc } from "./store";
import type { Homepage, Portfolio, Service, SiteCopy, Testimonial } from "./types";

/**
 * Read side of the console — what the PUBLIC pages call.
 *
 * The console is the source of truth, and src/lib/constants.ts is the
 * fallback. Two reasons it is built that way rather than as a hard cutover:
 *
 *  1. The store seeds itself FROM constants, so on a fresh clone the two agree
 *     and the site renders identically whether or not anyone has opened
 *     /admin yet.
 *  2. A read failure (missing file, bad JSON, read-only filesystem) degrades
 *     to the shipped copy instead of rendering an empty marketing site. A CMS
 *     outage must never blank the homepage.
 *
 * Everything here runs in Server Components and hands plain props down to the
 * existing client components.
 */

/** Never let a CMS read break a public page. */
async function safe<T>(read: () => Promise<T[]>): Promise<T[]> {
  try {
    return await read();
  } catch {
    return [];
  }
}

async function safeDoc<T>(read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read();
  } catch {
    return fallback;
  }
}

/**
 * Overlay `patch` onto `base`, key by key, keeping anything the patch does not
 * mention.
 *
 * This is what makes Site Copy safe to hand an operator: deleting a key from
 * the JSON falls back to the shipped string instead of rendering `undefined`
 * on the live site. Arrays are replaced wholesale (a 3-item list edited down
 * to 2 must become 2, not merge into 3), and a null/empty patch value is
 * treated as "not supplied".
 */
function deepMerge<T>(base: T, patch: unknown): T {
  if (patch === undefined || patch === null || patch === "") return base;
  if (Array.isArray(base)) return (Array.isArray(patch) ? patch : base) as T;
  if (typeof base !== "object" || base === null) return patch as T;
  if (typeof patch !== "object" || Array.isArray(patch)) return base;

  const out = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    if (k in out) out[k] = deepMerge(out[k], v);
  }
  return out as T;
}

/* ————— site copy ————— */

/** The shape Site Copy edits — the shipped strings are the schema. */
export type SiteCopyShape = {
  site: typeof SITE_CONFIG;
  hero: typeof HERO_DATA;
  work: { hero: typeof WORK_PAGE.hero; cta: string; exploreCta: string };
  services: { hero: typeof SERVICES_PAGE.hero; intro: string; words: string[] };
  clientStories: { heading: string; subtitle: string; cta: string };
};

const COPY_BASE: SiteCopyShape = {
  site: SITE_CONFIG,
  hero: HERO_DATA,
  work: { hero: WORK_PAGE.hero, cta: WORK_PAGE.cta, exploreCta: WORK_PAGE.exploreCta },
  services: {
    hero: SERVICES_PAGE.hero,
    intro: SERVICES_PAGE.intro,
    words: [...SERVICES_PAGE.words],
  },
  clientStories: {
    heading: CLIENT_STORIES_DATA.heading,
    subtitle: CLIENT_STORIES_DATA.subtitle,
    cta: CLIENT_STORIES_DATA.cta,
  },
};

/**
 * Every public-facing string, with the live Site Copy version laid over the
 * shipped defaults.
 *
 * Malformed JSON cannot reach here — the save endpoint parses before storing —
 * but it is re-parsed defensively anyway, because the file is on disk and a
 * human with an editor is a real failure mode.
 */
export async function getSiteCopy(): Promise<SiteCopyShape> {
  const doc = await safeDoc(() => readDoc<SiteCopy>("site-copy", SITE_COPY_DEFAULT), SITE_COPY_DEFAULT);
  const live = doc.versions.find((v) => v.v === doc.live) ?? doc.versions[0];
  if (!live) return COPY_BASE;

  try {
    return deepMerge(COPY_BASE, JSON.parse(live.json));
  } catch {
    return COPY_BASE;
  }
}

/* ————— homepage ————— */

/** Structured homepage fields. Takes precedence over Site Copy for the hero:
    it is the purpose-built editor for it, Site Copy is the escape hatch. */
export async function getHomepage(): Promise<Homepage> {
  const doc = await safeDoc(() => readDoc<Homepage>("homepage", HOMEPAGE_DEFAULT), HOMEPAGE_DEFAULT);
  return deepMerge(HOMEPAGE_DEFAULT, doc);
}

export type HeroCopy = {
  /** rendered one <span> per line, so the editor controls the line break */
  headlineLines: string[];
  subtitle: string;
  cta: string;
  badgeLabel: string;
  badgeSublabel: string;
};

/**
 * Hero copy for the homepage, resolved across all three sources:
 * Homepage doc → Site Copy → shipped constants.
 */
export async function getHeroCopy(): Promise<HeroCopy> {
  const [home, copy] = await Promise.all([getHomepage(), getSiteCopy()]);

  const headline = home.hero.headline?.trim();
  const headlineLines = headline
    ? headline.split("\n").map((l) => l.trim()).filter(Boolean)
    : [copy.hero.headlineMain, copy.hero.headlineSub];

  return {
    headlineLines,
    subtitle: home.hero.subhead || copy.hero.subtitle,
    cta: home.hero.primaryCtaLabel || copy.hero.cta,
    badgeLabel: copy.hero.badge.label,
    badgeSublabel: home.hero.eyebrow || copy.hero.badge.sublabel,
  };
}

/* ————— /work ————— */

export type WorkProject = (typeof WORK_PAGE.projects)[number];

/** Published projects in console order, shaped exactly like the constant the
    grid already renders — so the client component needs no new data model. */
export async function getWorkProjects(): Promise<WorkProject[]> {
  const rows = await safe<Portfolio>(() => readAll<Portfolio>("portfolio"));
  const live = rows.filter((p) => p.status === "published");
  if (live.length === 0) return WORK_PAGE.projects;

  return live.map((p) => ({
    id: p.slug,
    title: p.title,
    description: p.shortDescription,
    image: p.thumbnailUrl || p.coverUrl,
  }));
}

/* ————— client stories ————— */

export type Story = (typeof CLIENT_STORIES_DATA.stories)[number];

/**
 * Testimonials for the homepage carousel.
 *
 * Avatars stay with the shipped constant: they are art-directed files with a
 * per-portrait `focal` crop, and the console has no field for either. A story
 * is matched to its avatar by author name, so an edited quote keeps its face
 * and a brand-new testimonial simply renders without one.
 */
export async function getClientStories(): Promise<Story[]> {
  const rows = await safe<Testimonial>(() => readAll<Testimonial>("testimonials"));
  if (rows.length === 0) return CLIENT_STORIES_DATA.stories;

  const art = new Map(CLIENT_STORIES_DATA.stories.map((s) => [s.name, s]));

  return [...rows]
    .sort((a, b) => a.order - b.order)
    .map((t) => {
      const shipped = art.get(t.author);
      return {
        client: t.company,
        quote: t.quote,
        name: t.author,
        role: t.role,
        avatar: shipped?.avatar ?? "",
        focal: shipped?.focal ?? "50% 30%",
      };
    });
}

/* ————— /services ————— */

export type Panel = (typeof SERVICES_PAGE.panels)[number];

/**
 * Service panels with the console's copy laid over them.
 *
 * The panels carry art direction the console does not model — background
 * colour, image, overlay typography, the pinned-scroll order. So this merges
 * BY SLUG rather than replacing: editable copy (title, description,
 * capabilities) comes from the console, everything visual stays with the
 * constant. A console row with no matching panel is ignored, because there
 * would be no art to render it with.
 */
export async function getServicePanels(): Promise<Panel[]> {
  const rows = await safe<Service>(() => readAll<Service>("services"));
  if (rows.length === 0) return SERVICES_PAGE.panels;

  const bySlug = new Map(rows.map((s) => [s.slug, s]));

  return SERVICES_PAGE.panels.map((panel) => {
    const edit = bySlug.get(panel.id);
    if (!edit) return panel;
    return {
      ...panel,
      title: edit.title || panel.title,
      description: edit.overview || panel.description,
      caps: edit.weBuild.length ? edit.weBuild : panel.caps,
    };
  });
}
