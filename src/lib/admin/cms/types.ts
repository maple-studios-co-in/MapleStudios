/**
 * Content model for the authoring console (/admin CMS modules).
 *
 * Every collection is a flat list of records in one JSON file under /data/cms
 * (gitignored, same convention as src/lib/bookings.ts). The shapes here mirror
 * the production console at admin.maplestudios.co.in field-for-field so the
 * two can be reconciled later without a migration.
 */

export type Id = string;

/** Every collection record carries these. */
export type Base = {
  id: Id;
  createdAt: string;
  updatedAt: string;
};

/** Draft/published lifecycle shared by the editorial collections. */
export type Status = "draft" | "published" | "archived";

export type Portfolio = Base & {
  title: string;
  slug: string;
  /** the constants.ts project a seeded row came from — the key its art
      direction (deck, tabs, palette) lives under, so it survives a slug
      edit. Absent on projects created in the console. */
  artKey?: string;
  client: string;
  year: string;
  industry: string;
  category: string;
  thumbnailUrl: string;
  thumbnailAlt: string;
  shortDescription: string;
  coverUrl: string;
  coverImageAlt: string;
  problem: string;
  insight: string;
  solution: string;
  /** one per line in the editor */
  features: string[];
  techStack: string[];
  tags: string[];
  status: Status;
  featured: boolean;
  kind: "product" | "client";
  stage: "building" | "live" | "shipped";
  liveUrl: string;
  demoUrl: string;
};

export type VideoCredit = { role: string; name: string };

export type Video = Base & {
  title: string;
  slug: string;
  client: string;
  hindiLabel: string;
  category: string;
  year: string;
  durationSeconds: number | null;
  order: number;
  source: "youtube" | "vimeo" | "mp4";
  youtubeId: string;
  videoUrl: string;
  orientation: "landscape" | "portrait";
  posterUrl: string;
  posterAlt: string;
  hoverPreviewUrl: string;
  /** id of a Portfolio record, or "" */
  projectId: string;
  excerpt: string;
  credits: VideoCredit[];
  tags: string[];
  featured: boolean;
  /** only one video may hold this — setting it unpins every other */
  reelHero: boolean;
  published: boolean;
};

export type BlogPost = Base & {
  title: string;
  slug: string;
  category: string;
  readingMinutes: number | null;
  coverUrl: string;
  tags: string[];
  authorName: string;
  authorRole: string;
  excerpt: string;
  /** markdown — the public renderer takes markdown */
  content: string;
  status: Status;
};

export type Service = Base & {
  /** fixed — the public routes depend on these */
  slug: string;
  title: string;
  tagline: string;
  overview: string;
  audience: string[];
  weBuild: string[];
  exampleUseCases: string[];
  deliverables: string[];
  order: number;
};

export type CategoryGroup = "portfolio" | "blog" | "media";

export type Category = Base & {
  group: CategoryGroup;
  name: string;
  order: number;
};

export type Testimonial = Base & {
  quote: string;
  author: string;
  role: string;
  company: string;
  order: number;
  featured: boolean;
};

export type Press = Base & {
  type: "award" | "press" | "feature";
  date: string;
  title: string;
  publication: string;
  url: string;
  excerpt: string;
  logoUrl: string;
  imageUrl: string;
  order: number;
  published: boolean;
};

export type Recommendation = Base & {
  type: "music" | "movie" | "book";
  creator: string;
  title: string;
  coverUrl: string;
  link: string;
  note: string;
  order: number;
  published: boolean;
};

export type Career = Base & {
  role: string;
  department: string;
  location: string;
  type: "Full-time" | "Part-time" | "Contract" | "Internship" | "Freelance";
  applyEmail: string;
  description: string;
  requirements: string[];
  published: boolean;
};

/** Mirrors InquiryStatus in lib/inquiries.ts — Contacts is a view over that
    store, so one vocabulary, displayed with friendlier labels. */
export type ContactStatus = "new" | "read" | "replied" | "archived";

export type Contact = Base & {
  name: string;
  email: string;
  phone: string;
  /** the contact form collects a company, not a phone */
  company: string;
  project: string;
  budget: string;
  timeline: string;
  message: string;
  status: ContactStatus;
};

export type Subscriber = Base & {
  email: string;
  source: string;
  status: "active" | "unsubscribed";
};

export type SeoEntry = Base & {
  path: string;
  title: string;
  description: string;
  canonical: string;
  twitterCard: "summary_large_image" | "summary";
  ogImage: string;
  ogTitle: string;
  ogDescription: string;
  /** raw JSON object as typed by the operator */
  jsonLd: string;
  noindex: boolean;
};

export type Redirect = Base & {
  from: string;
  to: string;
  code: 301 | 302 | 307 | 308;
  note: string;
};

export type MediaAsset = Base & {
  url: string;
  filename: string;
  folder: string;
  alt: string;
  bytes: number;
  format: string;
};

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "publish"
  | "unpublish"
  | "reorder"
  | "restore"
  | "login";

export type AuditEntry = Base & {
  who: string;
  action: AuditAction;
  resource: string;
  summary: string;
};

/* ————— singletons ————— */

export type Homepage = {
  hero: {
    eyebrow: string;
    headline: string;
    subhead: string;
    primaryCtaLabel: string;
    primaryCtaHref: string;
    secondaryCtaLabel: string;
    secondaryCtaHref: string;
    chips: string[];
  };
  marquee: { items: string[] };
  whatWeDo: { heading: string; body: string };
  ctaBanner: {
    heading: string;
    body: string;
    primaryCtaLabel: string;
    primaryCtaHref: string;
  };
};

/** One saved revision of the public-site copy blob. */
export type SiteCopyVersion = {
  v: number;
  json: string;
  summary: string;
  at: string;
  who: string;
  /** set when this version was produced by restoring an older one */
  restoredFrom: number | null;
};

export type SiteCopy = {
  live: number;
  versions: SiteCopyVersion[];
};

export type Invite = {
  id: Id;
  email: string;
  role: "admin" | "editor";
  sentAt: string;
  expiresAt: string;
};

export type Settings = {
  profile: { name: string; email: string; role: string; memberSince: string };
  invites: Invite[];
};

/* ————— collection registry —————
   The generic /api/admin/cms/[resource] handlers work off this list: a name
   here is a readable+writable collection, anything else 404s. Keeping it in
   one place is what lets 7 of the modules share one route handler. */
export const COLLECTIONS = [
  "portfolio",
  "video",
  "blog",
  "services",
  "categories",
  "testimonials",
  "press",
  "recommendations",
  "careers",
  "contacts",
  "newsletter",
  "seo",
  "redirects",
  "media",
  "audit",
] as const;

export type CollectionName = (typeof COLLECTIONS)[number];

export function isCollection(value: string): value is CollectionName {
  return (COLLECTIONS as readonly string[]).includes(value);
}

/** Collections that carry a manual `order` field and support /reorder. */
export const ORDERABLE: CollectionName[] = [
  "video",
  "services",
  "categories",
  "testimonials",
  "press",
  "recommendations",
];
