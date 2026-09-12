import {
  CLIENT_STORIES_DATA,
  HERO_DATA,
  SERVICES_PAGE,
  SITE_CONFIG,
  WORK_DETAIL,
  WORK_PAGE,
} from "@/lib/constants";

import type { Category, Homepage, Portfolio, Service, Settings, SiteCopy, Testimonial } from "./types";

/**
 * First-run content, derived from the live site.
 *
 * The console is not seeded with invented rows: every project, service and
 * client story below is READ OUT of src/lib/constants.ts, which is what the
 * public pages render today. So the first time the console opens it already
 * holds the real site, and editing a row edits the thing a visitor sees.
 *
 * Deriving rather than copying matters — a pasted duplicate would drift the
 * moment someone edited constants.ts, and the console would quietly be
 * showing a stale version of the site.
 */

const now = () => new Date().toISOString();

let counter = 0;
const base = (prefix: string) => ({
  id: `seed-${prefix}-${(counter += 1)}`,
  createdAt: now(),
  updatedAt: now(),
});

/* ————— portfolio ← WORK_PAGE.projects ————— */

/** "Own your table. — Growth engine software for restaurants." splits into a
    tagline and what the project actually is; the grid shows the whole line, so
    the split only has to be good enough for the editor's two fields. */
function splitDescription(description: string) {
  const [head, ...rest] = description.split(" — ");
  return rest.length ? { tagline: head.trim(), detail: rest.join(" — ").trim() } : { tagline: "", detail: description };
}

const DECKS = WORK_DETAIL.decks as Record<string, { dir: string; count: number }>;

const PORTFOLIO: Portfolio[] = WORK_PAGE.projects.map((p, i) => {
  const { tagline, detail } = splitDescription(p.description);
  return {
    ...base("work"),
    title: p.title,
    slug: p.id,
    client: p.title,
    year: "2026",
    industry: "Other",
    category: "Web App",
    thumbnailUrl: p.image,
    thumbnailAlt: p.title,
    shortDescription: p.description,
    coverUrl: p.image,
    coverImageAlt: p.title,
    problem: "",
    insight: tagline,
    solution: detail,
    features: [],
    techStack: [],
    tags: DECKS[p.id] ? ["case-study"] : [],
    status: "published" as const,
    featured: i < 4,
    kind: "client" as const,
    stage: "shipped" as const,
    liveUrl: "",
    demoUrl: "",
  };
});

/* ————— services ← SERVICES_PAGE.panels ————— */

type Panel = (typeof SERVICES_PAGE.panels)[number];

const SERVICES: Service[] = (SERVICES_PAGE.panels as readonly Panel[]).map((panel, i) => ({
  ...base("svc"),
  slug: panel.id,
  title: panel.title,
  // The panel copy is authored with hard line breaks for the split-screen
  // layout; the editor wants one paragraph.
  tagline: (panel.statement ?? []).join(" "),
  overview: (panel.description ?? "").replace(/\n/g, " ").trim(),
  audience: [],
  weBuild: [...(panel.caps ?? [])],
  exampleUseCases: [],
  deliverables: [],
  order: i,
}));

/* ————— testimonials ← CLIENT_STORIES_DATA.stories ————— */

const TESTIMONIALS: Testimonial[] = CLIENT_STORIES_DATA.stories.map((s, i) => ({
  ...base("story"),
  quote: s.quote,
  author: s.name,
  role: s.role,
  company: s.client,
  order: i,
  featured: i === 0,
}));

/* ————— categories ————— */

/** Portfolio filters come from the categories the seeded work actually uses,
    plus the vocabulary the editor offers for new projects. */
const PORTFOLIO_CATEGORIES = [
  "AI Product",
  "AI Ads",
  "Web App",
  "Mobile App",
  "3D Experience",
  "Automation",
  "Branding",
];

const BLOG_CATEGORIES = [
  "AI in Business",
  "Marketing Technology",
  "Product Design",
  "Automation",
  "Web & App Development",
  "Creative AI",
  "Interior & 3D Visualization",
];

const CATEGORIES: Category[] = [
  ...PORTFOLIO_CATEGORIES.map((name, order) => ({ ...base("cat"), group: "portfolio" as const, name, order })),
  ...BLOG_CATEGORIES.map((name, order) => ({ ...base("cat"), group: "blog" as const, name, order })),
];

/** A fixed vocabulary rather than a managed taxonomy, so it lives in code. */
export const INDUSTRIES = [
  "Dairy & Food",
  "Food & Hospitality",
  "Furniture & Interiors",
  "Real Estate",
  "D2C",
  "Retail",
  "Healthcare",
  "Wellness",
  "Education",
  "SaaS",
  "Hospitality",
  "Other",
];

export const VIDEO_CATEGORIES = [
  "Reel",
  "Ad Film",
  "Brand Film",
  "Music Video",
  "BTS",
  "Short Film",
  "Documentary",
  "Other",
];

/* ————— homepage ← HERO_DATA ————— */

export const HOMEPAGE_DEFAULT: Homepage = {
  hero: {
    eyebrow: HERO_DATA.badge.sublabel,
    // Newline-separated: the hero renders one line per break, so the editor
    // controls where the headline wraps without touching code.
    headline: `${HERO_DATA.headlineMain}
${HERO_DATA.headlineSub}`,
    subhead: HERO_DATA.subtitle,
    primaryCtaLabel: HERO_DATA.cta,
    primaryCtaHref: "/contact",
    secondaryCtaLabel: WORK_PAGE.cta,
    secondaryCtaHref: "/work",
    chips: (SERVICES_PAGE.panels as readonly Panel[]).map((p) => p.title),
  },
  marquee: { items: [...SERVICES_PAGE.words] },
  whatWeDo: {
    heading: SERVICES_PAGE.hero.title,
    body: SERVICES_PAGE.intro,
  },
  ctaBanner: {
    heading: CLIENT_STORIES_DATA.heading,
    body: CLIENT_STORIES_DATA.subtitle,
    primaryCtaLabel: CLIENT_STORIES_DATA.cta,
    primaryCtaHref: "/contact",
  },
};

/* ————— site copy ————— */

const SITE_COPY_SEED = {
  $comment: "Authoritative source of every public-facing string on the marketing site.",
  site: SITE_CONFIG,
  hero: HERO_DATA,
  work: { hero: WORK_PAGE.hero, cta: WORK_PAGE.cta, exploreCta: WORK_PAGE.exploreCta },
  services: { hero: SERVICES_PAGE.hero, intro: SERVICES_PAGE.intro, words: SERVICES_PAGE.words },
  clientStories: {
    heading: CLIENT_STORIES_DATA.heading,
    subtitle: CLIENT_STORIES_DATA.subtitle,
    cta: CLIENT_STORIES_DATA.cta,
  },
};

export const SITE_COPY_DEFAULT: SiteCopy = {
  live: 1,
  versions: [
    {
      v: 1,
      json: JSON.stringify(SITE_COPY_SEED, null, 2),
      summary: "imported from the live site",
      at: now(),
      who: "system",
      restoredFrom: null,
    },
  ],
};

export const SETTINGS_DEFAULT: Settings = {
  profile: {
    name: "Studio admin",
    email: "contact@maplestudios.co.in",
    role: "admin",
    memberSince: new Date().toISOString().slice(0, 10),
  },
  invites: [],
};

/** Collections seeded from the live site; everything else starts empty. */
export function seedFor(name: string): unknown[] {
  if (name === "services") return SERVICES;
  if (name === "categories") return CATEGORIES;
  if (name === "portfolio") return PORTFOLIO;
  if (name === "testimonials") return TESTIMONIALS;
  return [];
}
