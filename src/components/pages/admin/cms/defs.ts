import { INDUSTRIES, VIDEO_CATEGORIES } from "@/lib/admin/cms/seed";
import type { CategoryGroup } from "@/lib/admin/cms/types";

/**
 * Declarative definitions for the list-shaped modules.
 *
 * Seven screens (portfolio, video, blog, testimonials, press, recommendations,
 * careers) are the same interaction — a table, a form, publish and delete —
 * differing only in fields. Describing them as data means <ResourceScreen>
 * is written and fixed once, instead of seven near-copies drifting apart.
 */

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "select"
  | "check"
  | "lines"
  | "csv"
  | "markdown"
  | "credits";

export type FieldDef = {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  hint?: string;
  options?: string[];
  /** take the options from this group of the Categories collection instead */
  optionsFrom?: CategoryGroup;
  /** field sits in a two-column row */
  half?: boolean;
  /** starts a new titled section in the form */
  section?: string;
  rows?: number;
  placeholder?: string;
};

export type ColDef = {
  key: string;
  label: string;
  /** "badge" renders the value as a status pill; "date" formats it */
  as?: "badge" | "date" | "bool" | "text";
  width?: string;
};

export type ScreenDef = {
  resource: string;
  title: string;
  sub: string;
  newLabel: string;
  empty: string;
  columns: ColDef[];
  fields: FieldDef[];
  defaults: Record<string, unknown>;
  /** show up/down arrows and persist order */
  orderable?: boolean;
  /** which boolean/status field the row's publish toggle writes */
  publishField?: "status" | "published";
  /** optional status filter above the table */
  filter?: { key: string; label: string; options: string[] };
  /** the column used as the row's headline in confirmations */
  titleKey: string;
  wideForm?: boolean;
};

const STATUS = ["draft", "published", "archived"];

export const PORTFOLIO: ScreenDef = {
  resource: "portfolio",
  title: "Portfolio",
  sub: "Case studies and selected work.",
  newLabel: "New project",
  empty: "No projects yet.",
  titleKey: "title",
  publishField: "status",
  wideForm: true,
  filter: { key: "status", label: "All statuses", options: STATUS },
  columns: [
    { key: "title", label: "Title" },
    { key: "client", label: "Client" },
    { key: "category", label: "Category" },
    { key: "status", label: "Status", as: "badge" },
    { key: "updatedAt", label: "Updated", as: "date" },
  ],
  fields: [
    { section: "Overview", name: "title", label: "Title", type: "text", required: true, half: true },
    {
      name: "slug",
      label: "Slug",
      type: "text",
      required: true,
      half: true,
      hint: "lowercase, hyphens only",
    },
    { name: "client", label: "Client", type: "text", half: true },
    { name: "year", label: "Year", type: "text", half: true },
    { name: "industry", label: "Industry", type: "select", options: INDUSTRIES, half: true },
    {
      name: "category",
      label: "Category",
      type: "select",
      optionsFrom: "portfolio",
      hint: "Manage the list in Categories.",
      half: true,
    },
    {
      name: "thumbnailUrl",
      label: "Thumbnail URL",
      type: "text",
      required: true,
      half: true,
      placeholder: "https://res.cloudinary.com/…",
    },
    { name: "thumbnailAlt", label: "Thumbnail alt", type: "text", half: true },
    { name: "shortDescription", label: "Short description", type: "textarea", required: true },
    { section: "Cover image", name: "coverUrl", label: "Cover image URL", type: "text" },
    {
      name: "coverImageAlt",
      label: "Cover image alt text",
      type: "text",
      placeholder: "Brief description of the image for accessibility",
    },
    { section: "Story", name: "problem", label: "Problem", type: "textarea" },
    { name: "insight", label: "Insight", type: "textarea" },
    { name: "solution", label: "Solution", type: "textarea" },
    { name: "features", label: "Features built", type: "lines" },
    { name: "techStack", label: "Tech stack", type: "csv" },
    { name: "tags", label: "Tags", type: "csv" },
    { section: "Publishing", name: "status", label: "Status", type: "select", options: STATUS, half: true },
    {
      name: "kind",
      label: "Kind",
      type: "select",
      options: ["product", "client"],
      half: true,
      hint: "Studio product or client work",
    },
    {
      name: "stage",
      label: "Stage",
      type: "select",
      options: ["building", "live", "shipped"],
      half: true,
      hint: "Drives the status badge",
    },
    { name: "featured", label: "Featured on home", type: "check", half: true },
    {
      name: "liveUrl",
      label: "Live URL",
      type: "text",
      half: true,
      hint: "External site — shows a 'Visit live site' button",
    },
    {
      name: "demoUrl",
      label: "Demo URL",
      type: "text",
      half: true,
      hint: "Internal/external demo — shows a 'Try the demo' button",
    },
  ],
  defaults: {
    title: "",
    slug: "",
    client: "",
    year: String(new Date().getFullYear()),
    industry: "D2C",
    category: "AI Product",
    thumbnailUrl: "",
    thumbnailAlt: "",
    shortDescription: "",
    coverUrl: "",
    coverImageAlt: "",
    problem: "",
    insight: "",
    solution: "",
    features: [],
    techStack: [],
    tags: [],
    status: "draft",
    featured: false,
    kind: "client",
    stage: "live",
    liveUrl: "",
    demoUrl: "",
  },
};

export const VIDEO: ScreenDef = {
  resource: "video",
  title: "Video",
  sub: "Films, ads, brand videos and reels shown at /reel on the public site. Use the arrows to set display order; the Reel hero is the single pinned player at the top of /reel.",
  newLabel: "Add video",
  empty: "No videos yet.",
  titleKey: "title",
  publishField: "published",
  orderable: true,
  wideForm: true,
  columns: [
    { key: "title", label: "Title" },
    { key: "client", label: "Client" },
    { key: "category", label: "Category" },
    { key: "year", label: "Year" },
    { key: "source", label: "Source" },
    { key: "published", label: "Status", as: "bool" },
  ],
  fields: [
    { name: "title", label: "Title", type: "text", required: true, half: true },
    { name: "slug", label: "Slug", type: "text", required: true, half: true, hint: "lowercase, hyphens only" },
    { name: "client", label: "Client", type: "text", half: true },
    { name: "hindiLabel", label: "Hindi label", type: "text", half: true, hint: "Optional Devanagari label" },
    { name: "category", label: "Category", type: "select", options: VIDEO_CATEGORIES, half: true },
    { name: "year", label: "Year", type: "text", half: true },
    { name: "durationSeconds", label: "Duration (seconds)", type: "number", half: true },
    { name: "order", label: "Order", type: "number", half: true, hint: "smaller = first" },
    {
      section: "Playback",
      name: "source",
      label: "Playback source",
      type: "select",
      options: ["youtube", "vimeo", "mp4"],
      half: true,
    },
    { name: "youtubeId", label: "YouTube ID", type: "text", half: true },
    { name: "videoUrl", label: "Video / MP4 URL", type: "text", half: true },
    {
      name: "orientation",
      label: "Orientation",
      type: "select",
      options: ["landscape", "portrait"],
      half: true,
      hint: "Portrait renders 9:16 (Shorts / Reels).",
    },
    { name: "posterUrl", label: "Poster / thumbnail URL", type: "text", half: true },
    { name: "posterAlt", label: "Poster alt-text", type: "text", half: true },
    {
      name: "hoverPreviewUrl",
      label: "Hover preview MP4",
      type: "text",
      hint: "Optional muted-loop preview",
    },
    { section: "Details", name: "excerpt", label: "Excerpt", type: "textarea" },
    { name: "credits", label: "Credits", type: "credits" },
    { name: "tags", label: "Tags", type: "csv" },
    {
      section: "Publishing",
      name: "featured",
      label: "Featured on homepage",
      type: "check",
      hint: "Shows in the homepage reel section (several allowed).",
    },
    {
      name: "reelHero",
      label: "Reel page hero",
      type: "check",
      hint: "Pins this as the large player at the top of /reel. Only one video can be the hero — setting this unpins any other.",
    },
    { name: "published", label: "Published", type: "check" },
  ],
  defaults: {
    title: "",
    slug: "",
    client: "",
    hindiLabel: "",
    category: "Reel",
    year: String(new Date().getFullYear()),
    durationSeconds: null,
    order: 0,
    source: "youtube",
    youtubeId: "",
    videoUrl: "",
    orientation: "landscape",
    posterUrl: "",
    posterAlt: "",
    hoverPreviewUrl: "",
    projectId: "",
    excerpt: "",
    credits: [],
    tags: [],
    featured: false,
    reelHero: false,
    published: true,
  },
};

export const BLOG: ScreenDef = {
  resource: "blog",
  title: "Blog",
  sub: "Insights, field notes, and what we're learning.",
  newLabel: "New post",
  empty: "No posts yet.",
  titleKey: "title",
  publishField: "status",
  wideForm: true,
  filter: { key: "status", label: "All statuses", options: STATUS },
  columns: [
    { key: "title", label: "Title" },
    { key: "category", label: "Category" },
    { key: "authorName", label: "Author" },
    { key: "status", label: "Status", as: "badge" },
    { key: "updatedAt", label: "Updated", as: "date" },
  ],
  fields: [
    { name: "title", label: "Title", type: "text", required: true, half: true },
    { name: "slug", label: "Slug", type: "text", required: true, half: true, hint: "lowercase, hyphens" },
    {
      name: "category",
      label: "Category",
      type: "select",
      optionsFrom: "blog",
      hint: "Manage the list in Categories.",
      half: true,
    },
    { name: "readingMinutes", label: "Reading minutes", type: "number", half: true },
    { name: "coverUrl", label: "Cover image URL", type: "text", required: true, half: true },
    { name: "tags", label: "Tags", type: "csv", half: true },
    { name: "authorName", label: "Author name", type: "text", half: true },
    { name: "authorRole", label: "Author role", type: "text", half: true },
    { name: "excerpt", label: "Excerpt", type: "textarea", required: true },
    {
      section: "Content",
      name: "content",
      label: "",
      type: "markdown",
      hint: "Rich text — outputs Markdown for the public site renderer",
    },
    { section: "Publishing", name: "status", label: "Status", type: "select", options: STATUS },
  ],
  defaults: {
    title: "",
    slug: "",
    category: "AI in Business",
    readingMinutes: 5,
    coverUrl: "",
    tags: [],
    authorName: "",
    authorRole: "",
    excerpt: "",
    content: "",
    status: "draft",
  },
};

export const TESTIMONIALS: ScreenDef = {
  resource: "testimonials",
  title: "Testimonials",
  sub: "Voice of the client.",
  newLabel: "New testimonial",
  empty: "No testimonials yet.",
  titleKey: "author",
  orderable: true,
  columns: [
    { key: "quote", label: "Quote" },
    { key: "author", label: "Author" },
    { key: "company", label: "Company" },
    { key: "featured", label: "Featured", as: "bool" },
  ],
  fields: [
    { name: "quote", label: "Quote", type: "textarea", required: true, rows: 4 },
    { name: "author", label: "Author", type: "text", required: true, half: true },
    { name: "role", label: "Role", type: "text", half: true },
    { name: "company", label: "Company", type: "text", half: true },
    { name: "order", label: "Order", type: "number", half: true },
    { name: "featured", label: "Featured", type: "check" },
  ],
  defaults: { quote: "", author: "", role: "", company: "", order: 0, featured: false },
};

export const PRESS: ScreenDef = {
  resource: "press",
  title: "Press & Awards",
  sub: "Logos, mentions, and awards. Pinned by order, then sorted newest first.",
  newLabel: "Add entry",
  empty: "No press entries yet.",
  titleKey: "title",
  publishField: "published",
  orderable: true,
  columns: [
    { key: "type", label: "Type", as: "badge" },
    { key: "title", label: "Title" },
    { key: "publication", label: "Publication" },
    { key: "date", label: "Date" },
    { key: "published", label: "Published", as: "bool" },
  ],
  fields: [
    { name: "type", label: "Type", type: "select", options: ["award", "press", "feature"], half: true },
    { name: "date", label: "Date", type: "text", half: true, placeholder: "YYYY-MM-DD" },
    { name: "title", label: "Title", type: "text", required: true },
    { name: "publication", label: "Publication / award body", type: "text" },
    { name: "url", label: "External URL", type: "text" },
    { name: "excerpt", label: "Excerpt", type: "textarea" },
    { name: "logoUrl", label: "Logo URL", type: "text", half: true },
    { name: "imageUrl", label: "Image URL", type: "text", half: true },
    { name: "published", label: "Published", type: "check" },
  ],
  defaults: {
    type: "press",
    date: "",
    title: "",
    publication: "",
    url: "",
    excerpt: "",
    logoUrl: "",
    imageUrl: "",
    order: 0,
    published: true,
  },
};

export const RECOMMENDATIONS: ScreenDef = {
  resource: "recommendations",
  title: "Recommendations",
  sub: "Music, movies, and books the team is into — shown at /recommendations. Add a pick, then use the arrows to reorder.",
  newLabel: "Add pick",
  empty: "No recommendations yet.",
  titleKey: "title",
  publishField: "published",
  orderable: true,
  columns: [
    { key: "coverUrl", label: "Cover" },
    { key: "title", label: "Title" },
    { key: "creator", label: "Creator" },
    { key: "type", label: "Type", as: "badge" },
    { key: "published", label: "Published", as: "bool" },
  ],
  fields: [
    { name: "type", label: "Type", type: "select", options: ["music", "movie", "book"], half: true },
    { name: "creator", label: "Creator", type: "text", half: true, hint: "artist · director · author" },
    { name: "title", label: "Title", type: "text", required: true },
    { name: "coverUrl", label: "Cover URL", type: "text", hint: "cover art / poster image" },
    { name: "link", label: "External link", type: "text" },
    { name: "note", label: "Note", type: "textarea", hint: "a short why we love it" },
    { name: "published", label: "Published", type: "check" },
  ],
  defaults: {
    type: "music",
    creator: "",
    title: "",
    coverUrl: "",
    link: "",
    note: "",
    order: 0,
    published: true,
  },
};

export const CAREERS: ScreenDef = {
  resource: "careers",
  title: "Careers",
  sub: "Open roles shown on the public site. Unpublished posts stay hidden from visitors.",
  newLabel: "New role",
  empty: "No roles yet — click New role to add one.",
  titleKey: "role",
  publishField: "published",
  columns: [
    { key: "role", label: "Role" },
    { key: "department", label: "Department" },
    { key: "location", label: "Location" },
    { key: "type", label: "Type" },
    { key: "published", label: "Published", as: "bool" },
  ],
  fields: [
    { name: "role", label: "Role", type: "text", required: true, placeholder: "Senior Brand Designer" },
    { name: "department", label: "Department", type: "text", half: true, placeholder: "Design" },
    { name: "location", label: "Location", type: "text", half: true, placeholder: "Remote" },
    {
      name: "type",
      label: "Type",
      type: "select",
      options: ["Full-time", "Part-time", "Contract", "Internship", "Freelance"],
      half: true,
    },
    {
      name: "applyEmail",
      label: "Apply email",
      type: "text",
      half: true,
      placeholder: "careers@maplestudios.co.in",
    },
    { name: "description", label: "Description", type: "textarea", placeholder: "What the role is about…" },
    { name: "requirements", label: "Requirements", type: "lines" },
    { name: "published", label: "Published", type: "check" },
  ],
  defaults: {
    role: "",
    department: "",
    location: "",
    type: "Full-time",
    applyEmail: "",
    description: "",
    requirements: [],
    published: true,
  },
};
