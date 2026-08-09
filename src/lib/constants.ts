export const SITE_CONFIG = {
  name: "Maple Studios",
  tagline: "An independent digital studio crafting meaningful digital experiences",
  description: "Websites, AI products, brands, and systems built for clarity, scale and impact.",
};

export const HERO_DATA = {
  badge: {
    // The figure itself is a live stopwatch (BuildTimer) counting from zero
    // on every page load — there is no static value to configure here.
    label: "HRS : MINS : SECS",
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
  heading: "Key facts",
  subtitle: "A snapshot of our experience and impact",
  cards: [
    {
      id: "awards",
      tag: "FEATURED & AWARDS",
      title: "Featured on top design platforms worldwide",
      stat: "50+",
      image: "/images/featured_chair.png",
      type: "image-overlay",
    },
    {
      id: "projects",
      tag: "PROJECTS COMPLETED",
      stat: "1.5K+",
      title: "90% of our clients seek our services for a second project.",
      type: "solid-maroon",
    },
    {
      id: "team",
      tag: "OUR TEAM MEMBERS",
      title: "Different skills.\nOne standard.",
      stat: "20+",
      image: "/images/team_dining.png",
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
// NOTE: the two attached "MyWorker AI" SVGs embed pixel-identical images, so all
// three entries reuse the same visual for now — swap title/image here per project.
export const WORK_DATA = {
  headingLines: ["Selected work", "& explorations"],
  viewAll: "VIEW ALL PROJECTS",
  projects: [
    {
      id: "my-worker-ai",
      title: "My Worker AI",
      description: "AI platform simplifying hiring, management,\nand workforce scaling.",
      cta: "EXPLORE PROJECT",
      image: "/figma/worker-ai-card.png",
    },
    {
      id: "my-worker-ai-2",
      title: "My Worker AI",
      description: "AI platform simplifying hiring, management,\nand workforce scaling.",
      cta: "EXPLORE PROJECT",
      image: "/figma/worker-ai-card.png",
    },
    {
      id: "my-worker-ai-3",
      title: "My Worker AI",
      description: "AI platform simplifying hiring, management,\nand workforce scaling.",
      cta: "EXPLORE PROJECT",
      image: "/figma/worker-ai-card.png",
    },
  ],
  discover: {
    text: "Discover our complete collection of digital experiences, brands, and platforms.",
    cta: "VIEW ALL PROJECTS",
  },
  servicesLabel: "OUR SERVICES",
  servicesLines: ["A.I.", "DESIGN", "DEVELOPMENT", "BRANDING"],
};

// Video-backed services cards (Figma node 2001:19 "new-era" + 12:79xx cards).
// new-era-sphere.mp4 = scrub-encoded (keyframe every 5 frames) ORIGINAL maroon
// particle film: sphere → ring → vase → DNA helix (~2.7-3.6s) → terrain.
export const SERVICES_DATA = {
  video: "/video/new-era-sphere.mp4",
  cards: [
    {
      id: "ai-enablement",
      titleLines: ["AI", "Enablement"],
      lead: "Not a chatbot. A colleague that never sleeps.",
      body: "We build AI that actually does your business's job — talks to customers, recommends the right thing, runs the boring parts — so your team does the interesting parts.",
      tone: "light" as const,
      pos: { left: "4.56%", top: "7.65%" },
    },
    {
      id: "web-app-development",
      titleLines: ["Web & App", "Development"],
      lead: "Fast to ship. Built to last.",
      body: "Sites and apps that don't buckle under real traffic — or real growth. Modern stack, zero duct tape.",
      tone: "grey" as const,
      pos: { left: "59.79%", top: "27.58%" },
    },
    {
      id: "ai-ads-campaigns",
      titleLines: ["AI Ads &", "Campaign Systems"],
      lead: "Your ad account, but it never runs out of ideas.",
      body: "One brief in, a hundred variations out. Scripts, creatives, landing pages — a system that keeps testing while you keep scaling.",
      tone: "grey" as const,
      pos: { left: "2.58%", top: "43.24%" },
    },
    {
      id: "immersive-3d",
      titleLines: ["Immersive & 3D", "Experiences"],
      lead: "Let people touch the product before they buy it.",
      body: "3D rooms, configurators, AR previews — the difference between \"looks nice\" and \"I need this.\"",
      tone: "grey" as const,
      pos: { left: "57.80%", top: "64.06%" },
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
      client: "LUXURY PRESENCE",
      quote: "Lorem ipsum began as scrambled, nonsensical Latin derived from Cicero's 1st-century BC text De Finibus Bonorum et Malorum.",
      name: "Malte Smith",
      role: "Founder & CEO · USA",
      avatar: "/figma/client-malte.png",
    },
    {
      client: "CREDIBLE",
      quote: "Lorem ipsum began as scrambled, nonsensical Latin derived from Cicero's 1st-century BC text De Finibus Bonorum et Malorum.",
      name: "Malte Smith",
      role: "Founder & CEO · USA",
      avatar: "/figma/client-malte.png",
    },
    {
      client: "FAST RESUME",
      quote: "Contrary to popular belief, Lorem ipsum is not simply random text — it has roots in a piece of classical Latin literature.",
      name: "Malte Smith",
      role: "Founder & CEO · USA",
      avatar: "/figma/client-malte.png",
    },
    {
      client: "TECHNIS",
      quote: "The standard chunk of Lorem ipsum used since the 1500s is reproduced here for those interested in exact fidelity.",
      name: "Malte Smith",
      role: "Founder & CEO · USA",
      avatar: "/figma/client-malte.png",
    },
    {
      client: "VENTIGENCE",
      quote: "It is a long established fact that a reader will be distracted by readable content when looking at a page layout.",
      name: "Malte Smith",
      role: "Founder & CEO · USA",
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
  projects: [
    { id: "my-worker-ai", title: "My Worker AI", description: "AI platform simplifying hiring, management, and workforce scaling.", image: "/figma/worker-ai-card.png" },
    { id: "pulse-studio", title: "Pulse Studio", description: "An independent music studio shaped by sound, built to move culture.", image: "/figma/worker-ai-card.png" },
    { id: "loftgoom", title: "Loftgoom", description: "Live life inspired — an immersive property experience for modern living.", image: "/figma/worker-ai-card.png" },
    { id: "northbank", title: "Northbank", description: "Brand system and platform for a next-generation financial product.", image: "/figma/worker-ai-card.png" },
    { id: "atlas-ai", title: "Atlas AI", description: "Conversational intelligence that turns support tickets into insight.", image: "/figma/worker-ai-card.png" },
    { id: "verde", title: "Verde", description: "Sustainable commerce, designed to make the responsible choice obvious.", image: "/figma/worker-ai-card.png" },
    { id: "studio-lumen", title: "Studio Lumen", description: "Immersive 3D configurator for a lighting house with a century of craft.", image: "/figma/worker-ai-card.png" },
    { id: "cadence", title: "Cadence", description: "Workflow automation for teams that ship faster than they scale.", image: "/figma/worker-ai-card.png" },
  ],
  exploreCta: "EXPLORE PROJECT",
};

// /work/[slug] — Figma frame 14:8429 ("Work Details", 1512x1597)
export const WORK_DETAIL = {
  back: "BACK TO WORK",
  services: ["AI Product Design", "UI/Ux Design", "Web Development", "Interaction Design"],
  tabs: [
    {
      id: "challenge",
      label: "THE CHALLENGE",
      body: "Lorem ipsum began as scrambled, nonsensical Latin derived from Cicero's 1st-century BC text De Finibus Bonorum et Malorum. Lorem ipsum began as scrambled, nonsensical Latin derived from Cicero's 1st-century BC text De Finibus Bonorum et Malorum.",
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
  ],
  prev: "PRE PROJECT",
  next: "NEXT PROJECT",
};

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
