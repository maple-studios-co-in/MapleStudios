export const SITE_CONFIG = {
  name: "Maple Studios",
  tagline: "An independent digital studio crafting meaningful digital experiences",
  description: "Websites, AI products, brands, and systems built for clarity, scale and impact.",
};

export const HERO_DATA = {
  badge: {
    // The figure itself is a live stopwatch (BuildTimer) counting from zero
    // on every page load — there is no static value to configure here.
    label: "HRS : MINS",
    sublabel: "Avg. time to first live build",
  },
  cta: "START A PROJECT",
  subtitle: "Websites, AI products, brands, and systems built for clarity, scale and impact.",
  headlineMain: "Intelligence,",
  headlineSub: "built into business.",
};

export const ABOUT_DATA = {
  tag: "ABOUT",
  // Rendered line-by-line (HeroSection Scene B) so the break points are the
  // designed ones rather than whatever the box width happens to produce.
  headlineLines: [
    "Maple is an independent digital",
    "studio crafting meaningful",
    "product experiences through",
    "strategy, design, and technology.",
  ],
  leftColumn: [
    "WE DESIGN FOR LONGEVITY",
    "CLARITY FIRST, CRAFT ALWAYS,",
    "BUILT TO SCALE",
  ],
  rightText: "Our mission is to make technology feel human by designing digital products that are intuitive, purposeful, and meaningful to people.",
  cta: "MORE ABOUT US",
  focusedVision: "FOCUSED VISION",
  measuredExecution: "MEASURED EXECUTION.",
  marqueeText: "AUTOMATE ✦ INTEGRATE ✦ ACCELERATE ✦",
  bottomSub: "✦ FROM IDEA TO OUTCOME",
};

export const KEY_FACTS_DATA = {
  heading: "Maple Facts",
  subtitleLines: ["A snapshot of our", "experience and impact"],
  cards: [
    {
      id: "awards",
      tag: "FEATURED & AWARDS",
      title: "Featured on top design platforms worldwide",
      stat: "50+",
      image: "/images/featured_chair.png",
      // Autoplaying muted loop behind the same overlay copy — swap filename
      // (not overwrite) if the clip changes; public assets are immutable-cached.
      video: "/video/eagle-character.mp4",
      type: "image-overlay",
    },
    {
      id: "live-build",
      tag: "AVG. TIME TO FIRST LIVE BUILD",
      stat: "22 : 40",
      sublabel: "HRS : MINS",
      title: "90% of clients trust us with their next project",
      type: "solid-maroon",
    },
    {
      id: "team",
      tag: "OUR TEAM MEMBERS",
      title: "Different skills.\nOne standard.",
      stat: "20+",
      image: "/images/eagle-portrait.webp",
      type: "image-overlay",
    },
  ],
  partnersSectionTitle: "OUR BUSINESS PARTNERS",
  partners: [
    { name: "credible", style: "lowercase font-bold tracking-tight text-xl font-sans" },
    { name: "Yellowtail", style: "font-semibold tracking-normal text-xl font-sans" },
    { name: "LUXURY PRESENCE", style: "uppercase font-light tracking-widest text-sm font-sans flex items-center gap-1.5" },
    { name: "technis", style: "lowercase font-black italic tracking-wide text-xl font-sans" },
    { name: "OCKTO", style: "uppercase font-bold tracking-wider text-lg font-sans flex items-center gap-1.5" },
  ],
};

// "Selected work & explorations" + OUR SERVICES intro (Figma Home 12:78xx region).
// Desktop runs these as a pinned horizontal scroll track (trionn-style):
// [heading + project 1] → [project 2] → [project 3] → [discover] → [giant type].
export const WORK_DATA = {
  headingLines: ["Selected work", "& explorations"],
  viewAll: "VIEW ALL PROJECTS",
  // Card copy + art for the homepage Selected work track.
  // Sequence: Get Shoku → Ecommerce → Maple Furnishers → Maple Lens → Kalaa Kaari.
  projects: [
    {
      id: "get-shoku",
      title: "Get Shoku",
      description:
        "Restaurants don't need more software. They need one loop. One system that turns walk-ins into known guests, automatically.",
      cta: "EXPLORE PROJECT",
      image: "/images/card-get-shoku.webp",
      href: "/work/get-shoku",
    },
    {
      id: "ecommerce",
      title: "Ecommerce",
      description:
        "More products don't mean more sales — better journeys do. We design e-commerce systems that make discovery, decision-making and checkout feel effortless.",
      cta: "EXPLORE PROJECT",
      image: "/images/card-maple-furnishers.webp",
      href: "/work/ecommerce",
    },
    {
      id: "maple-furnishers",
      title: "Maple Furnishers",
      description:
        "Furniture shouldn't just fill a room. The experience should make you want it.\nAn e-commerce experience designed to turn browsing into buying — without losing the brand's character.",
      cta: "EXPLORE PROJECT",
      image: "/images/card-grown-not-manufactured.webp",
      href: "/work/maple-furnishers",
    },
    {
      id: "maple-lens",
      title: "Maple Lens",
      description:
        "A furniture workshop. Turned into a digital studio.\nWe transformed the craft, process and personality behind the workshop into a sharper digital experience.",
      cta: "EXPLORE PROJECT",
      image: "/images/card-workshop-chair.webp",
      href: "/work/maple-lens",
    },
    {
      id: "kalaa-kaari",
      title: "Kalaa Kaari",
      description:
        "Craft has a story. The digital experience should too.\nA brand-led digital experience that brings heritage, craft and contemporary commerce together.",
      cta: "EXPLORE PROJECT",
      image: "/images/card-kalaa-kaari.webp",
      href: "/work/kalaa-kaari",
    },
  ],
  discover: {
    text: "Discover our complete collection of digital experiences, brands, and platforms.",
    cta: "VIEW ALL PROJECTS",
  },
  servicesLabel: "OUR SERVICES",
  servicesLines: ["A.I.", "DESIGN", "DEVELOPMENT", "BRANDING"],
};

// Glass service cards generated from / revolving around the DNA helix
// (desktop ServicesStage) and stacked on mobile (ServicesVideoSection).
// new-era-sphere-hd.mp4 = scrub-encoded HD particle film (immutable-cache rule).
export const SERVICES_DATA = {
  video: "/video/new-era-sphere-hd.mp4",
  cards: [
    {
      id: "ai-enablement",
      title: "AI Enablement",
      lead: "Not a chatbot. A colleague that never sleeps.",
      body: "We build AI that actually does your business's job — talks to customers, recommends the right thing, runs the boring parts — so your team does the interesting parts.",
      icon: "/images/service-icons/brain.webp",
    },
    {
      id: "web-app-development",
      title: "Web & App Development",
      lead: "Fast to ship. Built to last.",
      body: "Sites and apps that don't buckle under real traffic — or real growth. Modern stack, zero duct tape.",
      icon: "/images/service-icons/devices.webp",
    },
    {
      id: "ai-ads-campaigns",
      title: "AI Ads & Campaign Systems",
      lead: "Your ad account, but it never runs out of ideas.",
      body: "One brief in, a hundred variations out. Scripts, creatives, landing pages — a system that keeps testing while you keep scaling.",
      icon: "/images/service-icons/megaphone.webp",
    },
    {
      id: "immersive-3d",
      title: "Immersive & 3D Experiences",
      lead: "Let people touch the product before they buy it.",
      body: "3D rooms, configurators, AR previews — the difference between \"looks nice\" and \"I need this.\"",
      icon: "/images/service-icons/cube.webp",
    },
    {
      id: "in-house-tools",
      title: "In-House Tools",
      lead: "AI · React · Next.js · APIs · Automation",
      body: "We build the internal tools, AI workflows and automations your business actually needs.",
      icon: "/images/service-icons/bolt.webp",
    },
  ],
};

// Client stories (Figma Home 13:79xx region)
export const CLIENT_STORIES_DATA = {
  heading: "Client stories",
  subtitle: "Great work is built through partnership. Here's what our client say.",
  cta: "BECOME A CLIENT",
  stories: [
    {
      client: "ECOMMERCE",
      quote:
        "Maple shaped our storefront into something customers actually want to stay in — fast, clear, and built for the way we sell.",
      name: "Commerce Desk",
      role: "Founder",
      avatar: "/figma/client-malte.png",
    },
    {
      client: "GET SHOKU",
      quote:
        "Maple didn't just build another restaurant platform. They understood how restaurants actually work and turned it into one connected experience.",
      name: "The Delhi Table",
      role: "Founder",
      avatar: "/figma/client-malte.png",
    },
    {
      client: "MAPLE FURNISHERS",
      quote:
        "They turned a factory story into a luxury experience — brand, site, and systems that finally match the furniture.",
      name: "Maple Furnishers",
      role: "Brand Lead",
      avatar: "/figma/client-malte.png",
    },
    {
      client: "KALAAKAARI",
      quote:
        "Maple gave our makers a digital stage that feels as crafted as the work itself — clear, cultural, and ready to grow.",
      name: "Kalaa Kaari",
      role: "Creative Director",
      avatar: "/figma/client-malte.png",
    },
    {
      client: "MADHUSUDHAN",
      quote:
        "From first brief to live build, Maple worked like part of our team — sharp thinking, calm delivery, lasting craft.",
      name: "Madhusudhan",
      role: "Founder",
      avatar: "/figma/client-malte.png",
    },
  ],
};

// ——— Inner pages ———

// /work — Figma frame 14:8050 ("Work ", 1512x6879)
export const WORK_PAGE = {
  hero: {
    title: "Our work",
    subtitle: "Websites, AI products, brands, and systems built for clarity, scale and impact.",
  },
  cta: "MORE ABOUT US",
  // WORK_DATA's projects plus Sarvottam Udyog (a /work-page-only entry) —
  // drives /work grid + hero floating thumbs. Detail-page taglines for case
  // studies come from Maple_Studios.docx / Maple_Studios-1.docx.
  projects: [
    {
      id: "get-shoku",
      title: "Get Shoku",
      description: "Own your table. — Growth engine software for restaurants.",
      image: "/images/card-get-shoku.webp",
    },
    {
      id: "ecommerce",
      title: "Ecommerce",
      description:
        "Luxury furniture. Without the luxury friction. — E-commerce & app experience for a luxury furniture brand.",
      image: "/images/card-maple-furnishers.webp",
    },
    {
      id: "maple-furnishers",
      title: "Maple Furnishers",
      description: "Product Strategy & Discovery — Grown, Not Manufactured.",
      image: "/images/card-grown-not-manufactured.webp",
    },
    {
      id: "maple-lens",
      title: "Maple Lens",
      description: "See beyond the workshop. — AI-powered catalog photography.",
      image: "/images/card-workshop-chair.webp",
    },
    {
      id: "kalaa-kaari",
      title: "Kalaa Kaari",
      description:
        "We didn't build another studio website. — Digital identity & brand-first web experience for an independent creative studio.",
      image: "/images/card-kalaa-kaari.webp",
    },
    {
      id: "sarvottam",
      title: "Sarvottam Udyog",
      description:
        "From enquiry to order, one system. — CRM, automation & business systems for an industrial manufacturer.",
      image: "/images/card-sarvottam.webp",
    },
  ],
  exploreCta: "EXPLORE PROJECT",
};

// /work/[slug] — Figma frame 14:8429 ("Work Details", 1512x1597)

export type WorkTabId = "challenge" | "approach" | "outcome" | "what-we-did";

/**
 * A case-study deck for the work-detail right rail: one tall PDF canvas
 * (1920 pt wide) rendered to `count` seamless WebP slices that the rail
 * stacks flush, so the visitor reads the uncut design while the browser
 * lazy-loads it in pieces.
 *
 * `anchors` maps each tab to the y — in PDF points — of that section's lead
 * line on the canvas. It drives both directions of the tab/rail sync:
 * clicking a tab scrolls that spot under the navbar, and scrolling the rail
 * past a spot lights up its tab. Values MUST ascend in tab order, or the
 * tabs appear to jump around as the visitor scrolls.
 *
 * `tileW`/`tileH` are the rendered slice dimensions in pixels, so the rail
 * reserves its true height before a single image byte arrives — the anchor
 * maths measures the strip, and an unloaded strip would measure short.
 *
 * Every field here is printed ready-to-paste by
 * `python scripts/gen-workdeck.py <slug> <pdf>`. A replacement PDF goes in a
 * NEW folder (deck-v2): deployed assets are immutable-cached.
 */
export type WorkDeck = {
  dir: string;
  count: number;
  canvasH: number;
  tileW: number;
  tileH: number;
  anchors: Record<WorkTabId, number>;
};

export const WORK_DETAIL = {
  back: "BACK TO WORK",
  services: ["AI Product Design", "UI/Ux Design", "Web Development", "Interaction Design"],
  // Project pages that flip the scheme: the cream that is normally the ink
  // becomes the ground and the maroon ground becomes the ink. Add an id here
  // to invert that project's page — nothing else needs touching.
  // Cream page scheme for the PDF case studies — every project detail page
  // runs cream (#FFF3D3) ground with maroon (#741A14) ink.
  lightProjects: [
    "get-shoku",
    "ecommerce",
    "maple-furnishers",
    "maple-lens",
    "kalaa-kaari",
    "sarvottam",
  ],
  // Projects whose rail shows a real case-study deck, keyed by project id.
  // Anything not listed falls back to the repeated hero shot.
  // Mapping:
  //   get-shoku        → SHOKU / My Worker AI deck
  //   maple-furnishers → Maple Furnishers / Loftgoom deck
  //   maple-lens       → Maple Lens / Pulse Studio deck
  decks: {
    "get-shoku": {
      dir: "/work/my-worker-ai/deck-v1",
      count: 12,
      canvasH: 15858,
      tileW: 1440,
      tileH: 992,
      anchors: {
        challenge: 2199,
        approach: 5049,
        outcome: 9324,
        "what-we-did": 11294,
      },
    },
    "maple-furnishers": {
      dir: "/work/loftgoom/deck-v1",
      count: 12,
      canvasH: 15107,
      tileW: 1440,
      tileH: 946,
      anchors: {
        challenge: 1731,
        approach: 3574,
        outcome: 6316,
        "what-we-did": 8452,
      },
    },
    "maple-lens": {
      dir: "/work/pulse-studio/deck-v1",
      count: 12,
      canvasH: 15614,
      tileW: 1440,
      tileH: 977,
      anchors: {
        challenge: 1432,
        approach: 3211,
        outcome: 6876,
        "what-we-did": 11294,
      },
    },
    ecommerce: {
      dir: "/work/ecommerce/deck-v1",
      count: 12,
      canvasH: 13608,
      tileW: 1440,
      tileH: 851,
      anchors: {
        challenge: 2092,
        approach: 4952,
        outcome: 9557,
        "what-we-did": 11101,
      },
    },
    "kalaa-kaari": {
      dir: "/work/kalaa-kaari/deck-v1",
      count: 12,
      canvasH: 13027,
      tileW: 1440,
      tileH: 816,
      anchors: {
        challenge: 3741,
        approach: 7120,
        outcome: 9547,
        "what-we-did": 12132,
      },
    },
    sarvottam: {
      dir: "/work/sarvottam/deck-v1",
      count: 12,
      canvasH: 13416,
      tileW: 1440,
      tileH: 839,
      anchors: {
        challenge: 3582,
        approach: 4997,
        outcome: 8084,
        "what-we-did": 10450,
      },
    },
  } satisfies Record<string, WorkDeck>,
  // Fallback tab bodies when a project has no dedicated case-study copy yet.
  tabs: [
    {
      id: "challenge",
      label: "THE CHALLENGE",
      body: "Every brief starts with a real constraint — audience, market, or product — that the experience has to solve before it can look beautiful.",
    },
    {
      id: "approach",
      label: "APPROACH",
      body: "We mapped the product surface before touching a pixel — audience, constraints, and the one metric that mattered. Strategy, design, and engineering then ran as a single track so decisions never waited on a handoff.",
    },
    {
      id: "outcome",
      label: "OUTCOME",
      body: "A platform that ships weekly instead of quarterly, with a design system its own team extends. Adoption climbed without a single line of onboarding copy being rewritten.",
    },
    {
      id: "what-we-did",
      label: "WHAT WE DID",
      body: "AI product design, interface architecture, a component library, and the front-end build — delivered as one continuous engagement from seed to shipped.",
    },
  ] satisfies { id: WorkTabId; label: string; body: string }[],
  // Per-project case-study copy (Maple_Studios.docx). Falls back to `tabs`.
  projectTabs: {
    "get-shoku": [
      {
        id: "challenge",
        label: "THE CHALLENGE",
        body: "Restaurants were running POS, ordering, loyalty, analytics, and marketing across five different logins, with no single view of the guest. Anonymous walk-ins stayed anonymous — every visit was a one-off transaction instead of a relationship the restaurant could build on.",
      },
      {
        id: "approach",
        label: "APPROACH",
        body: "We didn't build another point tool — we built the loop. POS, ordering, loyalty engine, analytics & insights, and WhatsApp marketing were unified onto one table, with AI enablement wired directly into operational data so recommendations and personalization worked off real guest behavior, not a separate system bolted on after the fact.",
      },
      {
        id: "outcome",
        label: "OUTCOME",
        body: "Five tools became one loop. Shoku turns anonymous walk-ins into known guests automatically, closing the loop on the guest experience and giving restaurants a growth engine instead of five disconnected logins — proof, not a pitch.",
      },
      {
        id: "what-we-did",
        label: "WHAT WE DID",
        body: "Product strategy, AI enablement, and the guest and restaurant-facing interfaces — delivered as one continuous engagement from five disconnected tools to a single loop.",
      },
    ],
    "maple-furnishers": [
      {
        id: "challenge",
        label: "THE CHALLENGE",
        body: "Maple Furnishers was named after a tree — grown, not manufactured — but nothing about the actual experience felt that way. The brand promise of natural, literal, and memorable didn't show up anywhere: not in the product story, not in how furniture was discovered, not in how the space felt end to end.",
      },
      {
        id: "approach",
        label: "APPROACH",
        body: "We went back to why each object exists before designing how it's presented — material, craft, furnishing, and lighting as the four pillars of the product story. From there we mapped the full Maple Experience (loyalty, analytics, WhatsApp marketing, QR ordering & POS) as one connected system, following a Discover → Define → Design → Engineer → Enable → Evolve process so brand strategy and product design moved together, not in handoffs.",
      },
      {
        id: "outcome",
        label: "OUTCOME",
        body: "A furnishing experience where every element — the app, the space visualization, the ordering flow — is reshapeable around the customer, not fixed around the catalog. The brand's “grown, not manufactured” promise now runs through the product itself, from how a space is imagined to how it's ordered.",
      },
      {
        id: "what-we-did",
        label: "WHAT WE DID",
        body: "Brand strategy, product discovery, and the UI/UX for the full furnishing experience — delivered as one continuous engagement from brand story to shippable product.",
      },
    ],
    ecommerce: [
      {
        id: "challenge",
        label: "THE CHALLENGE",
        body: "Buying luxury furniture online meant buying blind. A screen can't show you how a sofa ages, how quiet the craftsmanship is, or how something is built to survive real living — so browsing never built enough trust to actually buy. Big-ticket decisions were being asked of people with catalog-browsing tools.",
      },
      {
        id: "approach",
        label: "APPROACH",
        body: "We designed the decision to buy, not just the store. “The Maple Difference” — Ages Beautifully, Quiet Luxury, Strength You Don't See, Built for Real Living — became a trust layer built into the journey itself, not a features list. We mapped the full arc as Discover → Define → Design → Engineer → Enable → Evolve, and structured the buying flow around Want It → Understand It → Make It Yours → Buy It. Showing the workshop in Kirti Nagar, and the piece's path from there to a customer's home, gave the brand's provenance an actual visual role instead of a claim.",
      },
      {
        id: "outcome",
        label: "OUTCOME",
        body: "The journey doesn't end at checkout — it ends when the piece feels like it belongs in the home it was bought for. Theme-based browsing lets customers shop by how they want to live, not just by SKU. What used to be a cold scroll through a catalog now feels like a piece being chosen, not sold.",
      },
      {
        id: "what-we-did",
        label: "WHAT WE DID",
        body: "UX strategy, web and app design, and the trust-content system spanning workshop to home — delivered as one continuous engagement from browse to belonging.",
      },
    ],
    "kalaa-kaari": [
      {
        id: "challenge",
        label: "THE CHALLENGE",
        body: "Kalaakaari's work had character — expressive, editorial, craft-first — but the studio's digital presence didn't carry any of it. A standard studio website couldn't hold what the brand actually stood for: Kalaa (the art), Kaari (the fire), Culture (the pulse).",
      },
      {
        id: "approach",
        label: "APPROACH",
        body: "We built a digital space that behaves like Kalaakaari, not one that just describes it. System architecture, UX strategy, web development, and visual direction were treated as a single track, so the site's motion, tone, and type could carry the same editorial energy as the studio's own work — not sit on top of it as decoration.",
      },
      {
        id: "outcome",
        label: "OUTCOME",
        body: "Craft meets code. We didn't just make the site look like Kalaakaari — we made it feel like them, so the brand's identity lives in how the site behaves, not just in how it's styled.",
      },
      {
        id: "what-we-did",
        label: "WHAT WE DID",
        body: "UX strategy, visual direction, and web development — delivered as one continuous engagement from brand identity to digital presence.",
      },
    ],
    sarvottam: [
      {
        id: "challenge",
        label: "THE CHALLENGE",
        body: "The business — cable systems, hydraulics, process industries, material handling, engineering — was complex. The workflow shouldn't have been. Every deal moved through email, WhatsApp, phone calls, and Excel before it ever became an enquiry, quotation, or order. Too many handoffs, too little visibility, and every product line brought its own set of requirements and follow-ups.",
      },
      {
        id: "approach",
        label: "APPROACH",
        body: "We didn't build another dashboard — we built a CRM that understands what's actually being sold. Multiple products, multiple requirements, multiple follow-ups all needed to connect through one system, so we mapped the real deal path — enquiry, customer, requirement, quotation, follow-up, order — and built the CRM around that sequence instead of around generic sales-tool logic.",
      },
      {
        id: "outcome",
        label: "OUTCOME",
        body: "One customer. One record. One source of truth. Every interaction — from the first enquiry to the next follow-up — now stays in context, so the team spends its time moving deals instead of hunting for where one was left off.",
      },
      {
        id: "what-we-did",
        label: "WHAT WE DID",
        body: "CRM and automation design, business systems architecture, and the dashboard interface — delivered as one continuous engagement from scattered handoffs to one connected system.",
      },
    ],
    "maple-lens": [
      {
        id: "challenge",
        label: "THE CHALLENGE",
        body: "Every new SKU needed a professional photoshoot before it could go live — on the website, marketplaces, or campaigns. Workshop photos were inconsistent, unbranded, and couldn't be used as-is, and studio shoots couldn't keep pace with how fast the catalog was growing.",
      },
      {
        id: "approach",
        label: "APPROACH",
        body: "We started from the photo, not the tool. Mapped the exact leap from a raw workshop shot to a marketplace-ready image, then split it into three speed tiers — Quick, Atelier, and Spaces — so sellers could choose depth over speed per SKU. Design and the AI staging logic ran as one track, since a preset is only as good as the render behind it.",
      },
      {
        id: "outcome",
        label: "OUTCOME",
        body: "A single workshop photo now becomes an editorial-ready catalog image in minutes, not a scheduled shoot. Sellers get on-brand, watermark-free shots without booking a studio, and a free tier removes the barrier to trying it — turning what used to be a bottleneck into a self-serve step in the pipeline.",
      },
      {
        id: "what-we-did",
        label: "WHAT WE DID",
        body: "AI product design, prompt engineering, and the upload-to-download interface — delivered as one continuous engagement from raw photo to catalog-ready output.",
      },
    ],
  } satisfies Record<string, { id: WorkTabId; label: string; body: string }[]>,
  prev: "PRE PROJECT",
  next: "NEXT PROJECT",
};

/** The case-study deck for a project, or null when it has no PDF yet. */
export function deckFor(projectId: string): WorkDeck | null {
  return (WORK_DETAIL.decks as Record<string, WorkDeck>)[projectId] ?? null;
}

/** Per-project tab copy, falling back to the shared WORK_DETAIL.tabs. */
export function tabsFor(projectId: string) {
  return (
    (WORK_DETAIL.projectTabs as Record<string, typeof WORK_DETAIL.tabs>)[projectId] ??
    WORK_DETAIL.tabs
  );
}

/** True when a project page runs cream-on-maroon instead of maroon-on-cream. */
export function isLightProject(projectId: string): boolean {
  return WORK_DETAIL.lightProjects.includes(projectId);
}

// /services — Figma frame 14:8638 ("Services", 1512x6719)
export const SERVICES_PAGE = {
  hero: {
    title: "Area of expertise",
    subtitle: "Websites, AI products, brands, and systems built for clarity, scale and impact.",
    eyebrow: "WHAT WE DO BEST",
    // Discipline tags per Maple_Studios_Services_Page_Content.docx
    listLines: [
      "AI & INTELLIGENT AUTOMATION WEB & APP DEVELOPMENT PRODUCT DESIGN",
      "WEBSITE & MOBILE DESIGN IMMERSIVE & 3D EXPERIENCES BRANDING",
    ],
  },
  intro: "Focused disciplines where strategy, design, and technology work as one.",
  // Phone layout breaks the intro on these exact points; desktop keeps the
  // single string and lets its own box width do the wrapping.
  introLines: [
    "Focused disciplines",
    "where strategy, design, and",
    "technology work as one.",
  ],
  introLinks: [
    { label: "VIEW ALL PROJECTS", href: "/work" },
    { label: "LET'S CONNECT", href: "/contact" },
  ],
  words: ["BRANDING", "DESIGN", "AI"],
  wordsCaption: "CAPABILITIES SHAPED TO SCALE WITH AMBITION.",
  // Split-screen service panels, trionn.com/services layout. LEFT half: a
  // FLAT colour behind the image card (`leftBg` — cream or deep maroon, no
  // gradient cycling on these by request), the small 2-line uppercase
  // statement above the card, and the card's own overlay copy (`overlay`:
  // bottom-left two-liner in Red Hat Display 35px/700 (+400 line), bottom-
  // right tag 13.85px/300 — supplied typography). RIGHT half cream with
  // title / description / capabilities. `portrait` cards keep the image's
  // full height so nothing is cropped. Panels pin and the next slides up OVER
  // the pinned one. ORDER IS DELIBERATE (user-specified).
  panels: [
    {
      id: "ai",
      title: "AI & Intelligent Automation",
      leftBg: "#FFF3D3",
      statement: ["AI THAT WORKS.", "BUILT FOR BUSINESS."],
      overlay: {
        lines: [
          { text: "AI & Intelligent", bold: true },
          { text: "Automation", bold: false },
        ],
        tag: "// WORK SMARTER. SCALE FASTER.",
        ink: "#000",
      },
      description:
        "We build AI into the parts of your business that need it most —\ntalking to customers, handling repeat work, and surfacing answers before someone has to go looking for them.",
      capsLabel: "OUR CORE CAPABILITIES",
      caps: [
        "AI-powered digital experiences",
        "Custom agents and copilots",
        "Retrieval and knowledge systems",
        "Workflow automation across teams",
        "Semantic search & recommendations",
        "AI-powered business automation",
      ],
      image: "/images/services/svc-ai-brain.webp",
    },
    {
      id: "ads",
      title: "AI Ads & Campaign System",
      leftBg: "#3A0906",
      statement: ["MORE VARIATIONS. BETTER TESTING.", "FASTER GROWTH."],
      overlay: {
        lines: [
          { text: "From one idea to your", bold: false },
          { text: "next winning campaign.", bold: true },
        ],
        tag: "// CREATE. TEST. OPTIMIZE. SCALE.",
        ink: "#000",
        /** longer copy — set a size so each line still fits on ONE line */
        size: 27,
      },
      description:
        "One brief in. Endless campaign possibilities out.\nGenerate ad concepts, copy, creatives, landing pages and variations — then test what works and scale the winners.",
      capsLabel: "OUR CORE CAPABILITIES",
      caps: [
        "AI Creative",
        "Campaign Strategy",
        "Multi-Channel",
        "A/B Testing",
        "Optimization",
        "Scaling",
      ],
      image: "/images/services/svc-ads-engine.webp",
    },
    {
      id: "web",
      title: "Web & App Development",
      leftBg: "#FFF3D3",
      statement: ["PRODUCTS PEOPLE ACTUALLY USE", "DESIGN • BUILD • SHIP"],
      overlay: {
        lines: [
          { text: "Web & App", bold: true },
          { text: "Development", bold: false },
        ],
        tag: "// FAST. SOLID. SCALABLE.",
        ink: "#fff",
      },
      description:
        "We design and build sites and applications that hold up under real traffic,\nreal content, and real growth — using a modern stack with no shortcuts underneath.",
      capsLabel: "OUR CORE CAPABILITIES",
      caps: [
        "High-performance marketing sites",
        "Web apps & customer portals",
        "Design systems at scale",
        "Commerce and CMS builds",
        "Performance engineering",
        "API design & integrations",
      ],
      image: "/images/services/svc-web-dairy.webp",
    },
    {
      id: "immersive",
      title: "Immersive & 3D Experiences",
      leftBg: "#3A0906",
      statement: ["EXPLORE PRODUCTS IN 3D", "CONFIGURE • VISUALIZE • BUY"],
      overlay: {
        lines: [
          { text: "Turn Browsing", bold: false },
          { text: "Into Experience.", bold: true },
        ],
        tag: "// CREATE. TEST. OPTIMIZE. SCALE.",
        ink: "#fff",
        size: 29,
      },
      description:
        "We give people something to explore, not just scroll past —\n3D product views, configurators, and AR previews that make the product tangible before it's purchased.",
      capsLabel: "OUR CORE CAPABILITIES",
      caps: [
        "Interactive 3D scenes",
        "Product configurators",
        "AR previews",
        "WebGL & WebGPU pipelines",
        "Motion & interaction design",
        "Immersive storytelling",
      ],
      image: "/images/services/svc-3d-bedroom.webp",
    },
    {
      id: "in-house-tools",
      title: "In-House Tools",
      leftBg: "#FFF3D3",
      statement: ["If your business has a process,", "we can build the system around it."],
      overlay: {
        /** deliberately empty — this card carries no caption, only the tag */
        lines: [] as { text: string; bold: boolean }[],
        tag: "// BUILT AROUND YOUR OPERATIONS.",
        ink: "#fff",
      },
      description:
        "Your business has its own way of working. Your software should too.\nWe build the custom tools, AI systems, and automations that fit directly into your operations — from internal dashboards and workflows to intelligent agents and connected platforms.",
      capsLabel: "OUR CORE CAPABILITIES",
      caps: [
        "Custom Software",
        "AI Workflows",
        "Automation",
        "Dashboards",
        "Integrations",
        "AI Agents",
      ],
      image: "/images/services/svc-inhouse-robot.webp",
      /** 1024×1536 transparent PNG — shown whole in a portrait card, never cropped */
      portrait: true,
      /** Figma 2235:108 — cream panel, robot on its own deep-maroon card with
          faint vertical rules (the transparent PNG needs a ground of its own) */
      cardBg:
        "radial-gradient(58% 62% at 50% 42%, #7A1B14 0%, #4E0F0B 52%, #2F0500 100%)",
      cardRules: true,
    },
  ],
  stackHeading: ["TECHNOLOGY", "STACK"],
  stackNote: "WE DESIGN FOR LONGEVITY — CLARITY FIRST, CRAFT ALWAYS, BUILT TO SCALE.",
  capabilities: [
    { n: "1.", title: "AI & Intelligent Automation", platformsLabel: "AI PLATFORMS", platforms: ["OpenAI API", "Anthropic Claude"], coreLabel: "OUR CORE CAPABILITIES", core: ["Custom agents and copilots", "Retrieval and knowledge systems", "Workflow automation across teams", "Evaluation and guardrails built in", "Fine-tuned prompt systems"] },
    { n: "2.", title: "Web & Product Engineering", platformsLabel: "FRAMEWORKS", platforms: ["Next.js / React", "Node & Edge runtimes"], coreLabel: "OUR CORE CAPABILITIES", core: ["Design systems at scale", "Commerce and CMS builds", "Performance engineering", "Accessibility by default", "CI/CD and preview environments"] },
    { n: "3.", title: "Brand & Identity", platformsLabel: "TOOLING", platforms: ["Figma", "Adobe Suite"], coreLabel: "OUR CORE CAPABILITIES", core: ["Naming and positioning", "Visual identity systems", "Brand guidelines", "Art direction", "Launch and rollout kits"] },
    { n: "4.", title: "Immersive & 3D", platformsLabel: "ENGINES", platforms: ["Three.js / R3F", "WebGL & WebGPU"], coreLabel: "OUR CORE CAPABILITIES", core: ["Product configurators", "Interactive 3D scenes", "AR previews", "Real-time rendering pipelines", "Spatial interaction design"] },
  ],
  processLabel: "OUR PROCESS",
  processHeading: "How we work",
  processIntro: "A repeatable method applied across every engagement.",
  steps: [
    { step: "STEP - 1", title: "Understand", body: "We map the problem, the audience, and the constraints before a single pixel moves." },
    { step: "STEP - 2", title: "Design & Build", body: "Strategy, design, and engineering run as one track — shipping in days, not quarters." },
    { step: "STEP - 3", title: "Refine & Evolve", body: "We measure what shipped, tighten what matters, and keep the system compounding." },
    { step: "STEP - 4", title: "Improve", body: "Launching isn't the finish line. We look at what works, what doesn't and what can become better — then keep moving." },
  ],
};

// /contact — Figma frame 20:3 ("Contact", 1512x4158)
export const CONTACT_PAGE = {
  hero: { title: "Let's start something.", subtitle: "Websites, AI products, brands, and systems built for clarity, scale and impact." },
  note: "WE DESIGN FOR LONGEVITY CLARITY FIRST, CRAFT ALWAYS, BUILT TO SCALE",
  formHeading: "Let's work together",
  formSub: "A few details to begin the conversation.",
  // trionn.com field set: name / email / company, service + budget pickers,
  // a goals textarea, and the Send Inquiry action.
  fields: [
    { id: "name", label: "Full Name", type: "text", required: true },
    { id: "email", label: "Email address", type: "email", required: true },
    { id: "company", label: "Company / Website name", type: "text", required: false },
  ],
  services: {
    placeholder: "Select a service",
    options: [
      "Website Design & Development",
      "UI/UX Design",
      "Web Development",
      "Mobile App Design",
      "Branding & Identity",
      "AI-Powered Digital Product",
      "Something Else",
    ],
  },
  budgets: {
    placeholder: "Select your estimated budget",
    options: ["Under $5K", "$5K - $15K", "$15K - $30K", "$30K - $60K", "$60K+", "Not sure yet"],
  },
  message: {
    id: "message",
    label: "Share a little about your goals, timeline, and requirements...",
  },
  submit: "SEND INQUIRY",
  or: "or",
  bookCall: {
    cta: "BOOK A 30-MINUTE CALL",
    heading: "Pick a slot that suits you",
    sub: "Live availability from our calendar — all times are IST (GMT+5:30).",
    confirm: "CONFIRM BOOKING",
    successTitle: "You're booked.",
    successBody: "A confirmation is on its way — we'll meet you on the call.",
    empty: "No open slots in the next two weeks — send the form instead and we'll find a time.",
    note: "Prefer email? Write to contact@maplestudios.co.in — we reply within a day.",
  },
  columns: [
    {
      title: "Location",
      // `lead` renders bold above the body (the studio name over its address)
      lead: "MAPLE STUDIOS",
      body: "A-2/56 - 57, W.H.S, Kirti Nagar,\nNew Delhi, Delhi, 110015",
    },
    {
      title: "Join us",
      body: "Our mission is to make technology feel human by designing digital products that are intuitive, purposeful, and meaningful to people.",
    },
  ],
  email: "contact@maplestudios.co.in",
  emailNote: "Or, reach out via contact form.",
  faqHeading: "Questions",
  // Verbatim from FAQs.pdf (2026-08-22). Shape: question + prose answer, with
  // optional `bullets` and a closing `after` paragraph (only Q06 uses those).
  faqs: [
    {
      q: "What do you actually build?",
      a: "Websites, digital products, AI systems, internal tools, and immersive experiences. We work across design and development—from high-converting websites and mobile apps to AI agents, automation systems, custom platforms, and 3D/AR experiences.",
    },
    {
      q: "Do you work with startups or established businesses?",
      a: "Both. We work with startups building their first product, growing businesses improving their digital systems, and established teams looking to launch something new or modernize what they already have.",
    },
    {
      q: "Can you work with our existing team?",
      a: "Absolutely. We can work as an extension of your team, take ownership of a specific project, or handle the entire build from strategy through launch. We adapt to your tools, processes, and existing technology wherever it makes sense.",
    },
    {
      q: "How does a project usually start?",
      a: "With a conversation, not a sales pitch. We start by understanding what you're trying to achieve, what isn't working today, your users, technical constraints, and the outcome you need. From there, we define the scope, approach, timeline, and next steps.",
    },
    {
      q: "How long does a project take?",
      a: "It depends on what we're building. A focused website or prototype can move quickly, while a full digital product, AI platform, or custom system takes longer. Before we start, you'll get a clear scope and realistic delivery plan.",
    },
    {
      q: "How do you price projects?",
      a: "We price based on scope, complexity, and the level of involvement required. Projects can be structured as:",
      bullets: ["Fixed-scope projects", "Monthly retainers", "Ongoing product partnerships"],
      after: "We define what's included before work begins, so there are no surprise charges later.",
    },
    {
      q: "Can you sign an NDA?",
      a: "Yes. If your project involves confidential product ideas, business processes, customer data, or proprietary technology, we're happy to put an NDA in place before sharing sensitive information.",
    },
    {
      q: "Do you provide support after launch?",
      a: "Yes. Launch isn't the end of the relationship. We can continue with maintenance, optimization, new features, AI improvements, performance work, and ongoing product development depending on what your business needs.",
    },
    {
      q: "Can you work on an existing website or product?",
      a: "Yes. We don't always need to start from zero. We can audit, redesign, rebuild, optimize, or extend an existing product—while keeping what already works and fixing what doesn't.",
    },
    {
      q: "What makes Maple different?",
      a: "We don't just deliver screens or code. We build the system behind the idea. That means design, technology, AI, automation, and product thinking can work together from the start—so the final product isn't just visually strong, but useful, scalable, and built to perform.",
    },
    {
      q: "Do you use AI in every project?",
      a: "No—and that's intentional. We use AI where it creates a genuine advantage. Sometimes that's an AI agent or automated workflow. Sometimes it's simply better product architecture, design, or development. The technology follows the problem, not the other way around.",
    },
    {
      q: "Are you currently taking on new projects?",
      a: "Yes, subject to availability. We deliberately keep the number of active projects manageable so we can stay close to the work and maintain the quality of what we ship.",
    },
  ] as { q: string; a: string; bullets?: string[]; after?: string }[],
};

// /about — Figma frame 22:624 ("About", 1512x4158)
export const ABOUT_PAGE = {
  hero: {
    // Two designed lines — the break lives in the copy so it can never drift
    // with the box width. AboutHero renders each line as its own block.
    titleLines: ["We turn good ideas into digital products", "people want to use"],
    title: "We turn good ideas into digital products people want to use",
    subtitle: "We bring designers, engineers and specialists together around a single idea, and build the right team for the problem in front of us.",
  },
  words: ["BRANDING", "DESIGN", "AI"],
  wordsCaption: "IDEAS BECOME CLEARER WHEN THE RIGHT PEOPLE BUILD THEM TOGETHER.",
  atMaple: "AT MAPLE,",
  atMapleBody: "We bring designers, engineers and specialists together around a single idea. Instead of forcing every project through the same process, we build the right team for the problem in front of us.",
  badge: "IDEAS IN. DIGITAL PRODUCTS OUT.",
  mission: [
    "Our goal is simple: make technology easier to understand, easier to use and more useful to the people it is built for.",
    "We work quickly, but we do not rush the thinking. Every project gets the attention it needs to find a clear direction and turn that direction into something real.",
  ],
  missionCta: "LET'S CONNECT",
  valuesHeading: "Our values",
  valuesIntro: "We care about the quality of the work, the way we get there and the people we build it with.",
  // each row carries its own body copy (Figma 2124:183-206)
  values: [
    {
      title: "Driven by excellence",
      body: "We look closely. We question the first answer, refine the details and keep working until the final result feels considered.",
    },
    {
      title: "Honesty & Authenticity",
      body: "We keep conversations straightforward. No unnecessary jargon, no inflated promises and no pretending something is right when it needs more work.",
    },
    {
      title: "Designs that last",
      body: "We want the work to remain useful after the launch. That means making choices that can grow with a business rather than following a trend for the sake of it.",
    },
    {
      title: "Purposeful decision",
      body: "Every part of a project should have a reason behind it. If a feature, visual element or piece of content does not add value, we leave it out.",
    },
    {
      title: "Creativity with impact",
      body: "Good ideas should do more than look interesting. They should help a business communicate better, solve a problem or create a better experience.",
    },
    {
      title: "Experience & judgement",
      body: "Experience teaches you when to push an idea and when to simplify it. We bring that judgement to every project, including the lessons that came from things that did not work.",
    },
  ],
  valuesCaption: "WHAT WE BELIEVE SHOWS UP IN THE WORK.",
  // Founder + team sections (Figma 2124:211 / 2124:105 lower region)
  founder: {
    name: "Aditya Agrawal",
    role: "FOUNDER & CEO",
    statement: "Good work isn't about doing more it's about doing the right things with total focus",
    body: "We're proud to be one of the most creative and web design studios, driven by purpose, aesthetics and bold ideas.",
  },
  team: {
    headline1: "Different skills,",
    headline2: "one standard",
    dragHint: "DRAG A MEMBER TO REVEAL",
    cta: "JOIN OUR TEAM",
  },
};

// Final CTA / footer (Figma Home 13:80xx + 14:80xx region)
export const FOOTER_DATA = {
  kicker: "LET'S BUILD WORK THAT INSPIRES.",
  headingLines: ["Ready to build", "something bold?"],
  cta: "START A COLLABORATION",
  copyright: "@Maple studios 2026",
  enquiryLabel: "BUSINESS ENQUIRY",
  email: "contact@maplestudios.co.in",
  phone: "+91 9876543210",
  socialLabel: "SOCIAL",
  socials: [
    { name: "Linkedin", href: "https://linkedin.com" },
    { name: "Facebook", href: "https://facebook.com" },
    { name: "Whatsapp", href: "https://wa.me/919876543210" },
    { name: "Instagram", href: "https://instagram.com" },
  ],
  giant: "Maple Studios",
};
