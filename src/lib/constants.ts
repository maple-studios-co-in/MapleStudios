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
  headlineMain: "Designed to",
  headlineSub: "mean purpose.",
};

export const ABOUT_DATA = {
  tag: "ABOUT",
  headline: "Maple is an independent digital studio crafting meaningful brand experiences through strategy, design, and technology.",
  leftColumn: [
    "WE DESIGN FOR LONGEVITY",
    "CLARITY FIRST, CRAFT ALWAYS,",
    "BUILT TO SCALE",
  ],
  rightText: "Our mission is to make technology feel human by designing digital products that are intuitive, purposeful, and meaningful to people.",
  cta: "MORE ABOUT US",
  focusedVision: "FOCUSED VISION",
  measuredExecution: "MEASURED EXECUTION.",
  marqueeText: "INNOVATE ✦ IMPACT ✦ INSPIRE ✦",
  bottomSub: "✦ FROM IDEA TO OUTCOME",
};

export const KEY_FACTS_DATA = {
  heading: "Maple Facts",
  subtitle: "A snapshot of our experience and impact",
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
  // Same projects as WORK_DATA — drives /work grid + hero floating thumbs.
  // Detail-page taglines for case studies come from Maple_Studios.docx.
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
        "More products don't mean more sales — better journeys do. We design e-commerce systems that make discovery, decision-making and checkout feel effortless.",
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
        "Craft has a story. The digital experience should too.\nA brand-led digital experience that brings heritage, craft and contemporary commerce together.",
      image: "/images/card-kalaa-kaari.webp",
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
  // Cream page scheme for the PDF case studies
  lightProjects: ["get-shoku", "maple-furnishers", "maple-lens"],
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
    // Figma 14:8896 (typos "8. MOBILE DESION" corrected)
    listLines: [
      "AI & INTELLIGENT AUTOMATION WEB DEVELOPMENT PRODUCT DESIGN",
      "WEBSITE & MOBILE DESIGN WORDPRESS DEVELOPMENT BRANDING",
    ],
  },
  intro: "Focused disciplines where strategy, design, and technology work as one",
  introLinks: [
    { label: "VIEW ALL PROJECTS", href: "/work" },
    { label: "LET'S CONNECT", href: "/contact" },
  ],
  words: ["BRANDING", "DESIGN", "AI"],
  wordsCaption: "CAPABILITIES SHAPED TO SCALE WITH AMBITION.",
  // Split-screen service panels (Figma Groups 29-31): pinned left visual,
  // heading + capabilities list right — one panel per discipline.
  panels: [
    {
      id: "ai",
      title: "AI & Intelligent Automation",
      description: "AI that does your business's job — talks to customers,\nruns the boring parts, and never sleeps.",
      capsLabel: "OUR CORE CAPABILITIES",
      caps: [
        "AI-powered digital experiences",
        "Custom agents and copilots",
        "Retrieval and knowledge systems",
        "Workflow automation across teams",
        "Semantic search & recommendations",
        "AI-powered business automation",
      ],
      image: "/figma/worker-ai-card.png",
    },
    {
      id: "web",
      title: "Web & App Development",
      description: "Sites and apps that don't buckle under real traffic —\nmodern stack, zero duct tape.",
      capsLabel: "OUR CORE CAPABILITIES",
      caps: [
        "High-performance marketing sites",
        "Web apps & customer portals",
        "Design systems at scale",
        "Commerce and CMS builds",
        "Performance engineering",
        "API design & integrations",
      ],
      image: "/figma/worker-ai-card.png",
    },
    {
      id: "immersive",
      title: "Immersive & 3D Experiences",
      description: "Let people touch the product before they buy it —\n3D rooms, configurators, AR previews.",
      capsLabel: "OUR CORE CAPABILITIES",
      caps: [
        "Interactive 3D scenes",
        "Product configurators",
        "AR previews",
        "WebGL & WebGPU pipelines",
        "Motion & interaction design",
        "Immersive storytelling",
      ],
      image: "/figma/worker-ai-card.png",
    },
  ],
  stackHeading: ["TECHNOLOGY", "STACK"],
  stackNote: "WE DESIGN FOR LONGEVITY CLARITY FIRST, CRAFT ALWAYS, BUILT TO SCALE",
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
  ],
};

// /contact — Figma frame 20:3 ("Contact", 1512x4158)
export const CONTACT_PAGE = {
  hero: { title: "Let's start something.", subtitle: "Websites, AI products, brands, and systems built for clarity, scale and impact." },
  note: "WE DESIGN FOR LONGEVITY CLARITY FIRST, CRAFT ALWAYS, BUILT TO SCALE",
  step: "01 / 05",
  formHeading: "Let's start with the basics.",
  formSub: "A few details to begin the conversation.",
  fields: [
    { id: "name", label: "Full Name*", type: "text", required: true },
    { id: "email", label: "Email Address*", type: "email", required: true },
    { id: "company", label: "Company or Brand", type: "text", required: false },
  ],
  submit: "CONTINUE",
  columns: [
    { title: "Location", body: "Our mission is to make technology feel human by designing digital products that are intuitive, purposeful, and meaningful to people." },
    { title: "Join us", body: "Our mission is to make technology feel human by designing digital products that are intuitive, purposeful, and meaningful to people." },
  ],
  email: "contact@maplestudios.co.in",
  emailNote: "Or, reach out via contact form.",
  faqHeading: "Questions",
  faqs: [
    { q: "AI & Intelligent Automation", platformsLabel: "AI PLATFORMS", platforms: ["OpenAI API", "Anthropic Claude"], coreLabel: "OUR CORE CAPABILITIES", core: ["AI platform simplifying hiring, management", "Retrieval and knowledge systems", "Workflow automation across teams", "Agents that action, not just answer", "Measurement and guardrails built in"] },
    { q: "How fast can we start?", platformsLabel: "TYPICAL TIMELINE", platforms: ["Kickoff in 48 hours", "First build in a day"], coreLabel: "WHAT YOU GET", core: ["A scoped plan before we build", "Weekly shipping cadence", "Direct access to the makers"] },
    { q: "What does an engagement cost?", platformsLabel: "ENGAGEMENT MODELS", platforms: ["Project-based", "Monthly retainer"], coreLabel: "HOW WE SCOPE", core: ["Fixed scope, fixed price", "Retainers for continuous work", "No surprise line items"] },
    { q: "Do you work with existing teams?", platformsLabel: "WAYS WE PLUG IN", platforms: ["Embedded squad", "Advisory + build"], coreLabel: "WHAT THAT LOOKS LIKE", core: ["We adopt your rituals", "Handover documentation included", "Your team owns what we ship"] },
  ],
};

// /about — Figma frame 22:624 ("About", 1512x4158)
export const ABOUT_PAGE = {
  hero: {
    title: "Maple is a growth-compressed product studio. What normally takes a quarter, we take from seed to shipped in a day",
    subtitle: "Websites, AI products, brands, and systems built for clarity, scale and impact.",
  },
  words: ["BRANDING", "DESIGN", "AI"],
  wordsCaption: "CAPABILITIES SHAPED TO SCALE WITH AMBITION.",
  atMaple: "AT MAPLE,",
  atMapleBody: "We build teams around ideas. Each project is led by designers, engineers, and specialists chosen specifically for the challenge at hand.",
  badge: "SHAPING IDEAS TO DIGITAL DIRECTION IN 24 HOURS",
  mission: [
    "Our mission is to make technology feel human by designing digital products that are intuitive, purposeful, and meaningful to people.",
    "Our mission is to make technology feel human by designing digital products that are intuitive, purposeful, and meaningful to people.",
  ],
  missionCta: "LET'S CONNECT",
  valuesHeading: "Our values",
  valuesIntro: "We're proud to be one of India's most creative and recognized web design studios, driven by purpose, aesthetics and bold ideas.",
  values: [
    "Driven by excellence",
    "Honesty & Authenticity",
    "Designs that last",
    "Purposeful decision",
    "Creativity with impact",
    "Experience & attitude",
  ],
  valueBody: "Our work is shaped by high standards, continuous learning, and deep respect for craft, pushing every project beyond the expected.",
  valuesCaption: "WHAT WE BELIEVE SHAPES BETTER WORK",
  // Founder + team sections (Figma 2124:211 / 2124:105 lower region)
  founder: {
    name: "Aditya Agrawal",
    role: "FOUNDER & CEO",
    statement: "Focused disciplines where strategy, design, and technology work as one",
    body: "We're proud to be one of India's most creative and recognized web design studios, driven by purpose, aesthetics and bold ideas.",
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
