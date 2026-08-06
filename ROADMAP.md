# Maple Studios — Figma-to-Code Implementation Roadmap

How the Figma design (`Maple Studios (Copy)`, file key `plbfoAJRROxq23L1Hsrv0v`) was implemented
in this Next.js app, step by step, so you can repeat the process yourself for any future section.

---

## 0. The general workflow (works for ANY Figma design)

1. **Pull the design context, not just a screenshot.** With the Figma MCP/dev-mode you get
   generated reference JSX+Tailwind per node. It contains every element's absolute `left/top`,
   size, font, color, and asset URLs. Treat it as a *spec sheet*, never paste it verbatim.
2. **Map the canvas.** Every frame here is **1512 px wide** (hero canvas 1512×797, services video
   1512×1124, footer 1513×841). Convert every absolute coordinate into a **percentage of the
   canvas** so it scales: `left % = x / 1512`, `top % = y / frameHeight`.
   Example: hero star at x=425, y=415 → `left-[28.09%] top-[52.06%]`.
3. **Convert fixed font sizes to `clamp()`.** Design size ÷ 1512 gives the vw value:
   80 px → `clamp(44px, 5.29vw, 80px)`; 141.6 px → `clamp(56px, 9.37vw, 141.6px)`;
   30 px → `clamp(20px, 1.98vw, 30px)`.
4. **Download every exported asset immediately** (Figma MCP asset URLs expire in ~7 days) into
   `public/figma/` and reference them locally.
5. **Verify with the browser, not your eyes only:** `tsc --noEmit`, `next lint`, `next build`,
   then JS probes in the running page (`getBoundingClientRect` of key nodes vs the expected
   percentages, `document.fonts.check`, video `paused/loop/muted` flags, `scrollWidth` overflow
   check at 375 px).

---

## 1. Design tokens (globals.css)

| Token | Value | Where it came from |
|---|---|---|
| Cream | `#FFF3D3` | Figma page background + hero heading fill (replaced the old `#faf6eb`) |
| Maroon panel | `#741A14` | Key-facts card, footer rectangle, accent text |
| Footer giant text | `#93352F` | "Maple Studios" wordmark fill |
| Hero gradient | `radial-gradient(53% 240% at 50% 68%, #741A14 18.5%, #520F0A 59%, #2F0500 100%)` | Figma radial gradient stops (116,26,20 → 82,15,10 → 47,5,0) |
| Sans font | **Red Hat Display** (Google Fonts) | Figma uses `Red Hat Display` for all body/UI text |
| Serif font | Instrument Serif (kept) | Figma uses "Catilde", a paid custom font — Instrument Serif is the closest free stand-in already in the project |

Changes: added Red Hat Display to the Google-Fonts `@import`, pointed `--font-sans` and
`.font-sans-luxury` at it, updated `--bg-cream/--text-cream` to `#fff3d3`.

## 2. Hero (Figma node `120-980`) — `src/components/sections/HeroSection.tsx`

The hero is a **relative section with absolutely-positioned children**, all placed with
percentages of the 1512×797 canvas:

| Element | Figma geometry | Implementation |
|---|---|---|
| Headline "Designed to / mean purpose." | x=28, lines at y=137/226, 80px, tracking 4px, `#FFF3D3` | `absolute left-[1.85%] top-[17.2%]`, `text-[clamp(42px,5.29vw,80px)] leading-[1.11] tracking-[0.05em]` |
| Glassy **M** | 571.96×372, centered x, center-y at 326 (40.9%) | Inline SVG component `MapleMark.tsx` — the *exact* SVG you supplied (stroke `#FFF3D3` 1.597px + `feMorphology erode 34 → blur → inner glow` filter = the glass inset shadow). The big 4-point star on the right leg is part of this same vector. `left-1/2 top-[40.9%] -translate-x-1/2 -translate-y-1/2 w-[clamp(300px,37.83vw,572px)]` |
| Little star sparkle | 20.7px at (425, 415), animated | `left-[28.09%] top-[52.06%]`, `motion` rotate loop (spring, 2 s — from Figma's motion data) |
| Grand dashed orbit | 1941×458 PNG rotated −15.55°, container at (−233, 167) 1993×962 | container `left-[-15.46%] top-[20.98%] w-[131.83%] h-[120.71%]` + `rotate-[-15.55deg]` image |
| Right dashed orbit | 1102×251 at (485, 405) | `left-[32.11%] top-[50.81%] w-[72.85%]` |
| Left solid orbit | 502×231 at (−67, 425) | `left-[-4.43%] top-[53.35%] w-[33.24%]` |
| START A PROJECT | label at (35, 344.5), arrow at x=211, 191px underline at y=363 | flex column `left-[2.31%] top-[43.2%]`, width `clamp(150px,12.63vw,191px)` |
| 22h 40m badge | 218×79 at (1225, 387): cream 102px box + white 1px border | `left-[81.02%] top-[48.56%]`, `aspect-[218/79]`, split 46.79% / rest |
| Description | 249px wide at (1225, 577 center) | `left-[81.02%] top-[72.4%] -translate-y-1/2 w-[16.47%]` |
| Scroll circle | 20px at (33, 585) + small down arrow | exact SVG exports, arrow `rotate-90` with a soft y-bob |
| Corner ornaments | 40px at y=81.43%, x=7.2% and 90.09% | exact SVG exports |

Mobile: the badge/description get `max-md:` overrides (badge to the right edge, description
full-width near the bottom) — everything else scales by percentage.

## 3. Selected work + OUR SERVICES (Figma `12:78xx`) — `WorkSection.tsx`

Cream `#FFF3D3` section that replaced the old "Our work" block:

- **StarDivider** (reused everywhere): 86%-wide 1px black line + the black/maroon 4-point star
  export overlaid at a configurable `left` (center here; 42.92% on the client-stories bottom rule).
- Two-column grid `lg:grid-cols-[50.86%_1fr]` (the Figma vertical rule sits at x=769/1512):
  left column = heading (80 px serif) + underlined "VIEW ALL PROJECTS" link, vertically centered;
  right column = `border-l` + project card (image `aspect-[810/556]`, rounded 6px, then
  title 25px bold / description 14px / "EXPLORE PROJECT" underline link 148px wide).
- **OUR SERVICES** label (20px bold) then the giant stacked serif lines
  `A.I. / DESIGN / DEVELOPMENT / BRANDING` — `text-[clamp(56px,9.37vw,141.6px)] leading-[0.72]
  text-[#741a14] text-center`, staggered rise-in with `whileInView`.

## 4. Services over video (Figma `2001-19`) — `ServicesVideoSection.tsx`

- Your `new-era_202607302354.mp4` lives at `public/video/new-era.mp4` and plays as
  `absolute inset-0 object-cover`, `autoPlay muted loop playsInline` (muted is what allows
  autoplay in all browsers).
- Desktop keeps the exact Figma scatter inside an `aspect-[1512/1124]` box; the 4 glass cards are
  38.76% wide, `aspect-[586/306]`, `rounded-[8px]`, `backdrop-blur-[3px]`:

  | Card | left | top | fill |
  |---|---|---|---|
  | AI Enablement | 4.56% | 7.65% | `bg-white/33` |
  | Web & App Development | 59.79% | 27.58% | `bg-[#d9d9d9]/33` |
  | AI Ads & Campaign Systems | 2.58% | 43.24% | `bg-[#d9d9d9]/33` |
  | Immersive & 3D Experiences | 57.80% | 64.06% | `bg-[#d9d9d9]/33` |

  Card anatomy: 30px bold title (leading 1.13, two lines) top; 14px body pinned low, first
  sentence bold. Below `lg` the cards stack in normal flow over the same video.
- The **center circle button** in the mock is not part of the video (verified by extracting the
  embedded frame from the SVG export) — implemented as a real replay button (`RotateCcw` icon,
  `bg-black/60` circle) that rewinds and replays the video on click.

## 5. Client stories (Figma `13:79xx`) — `ClientStoriesSection.tsx`

- Header grid: "Client stories" (80px serif) left, 20px subtitle right; StarDivider below.
- Content grid `lg:grid-cols-[41%_1fr]`:
  - Left: the 5 client names as buttons (16px bold uppercase; active = full black, inactive =
    `opacity-[0.54]` — CREDIBLE is the design default), plus the exported 40px circle
    prev/next arrows (`carousel-next.svg` is the same asset rotated 180°).
  - Right: 30px quote inside `AnimatePresence mode="wait"` (fade/slide swap on change),
    76×75 avatar (exact export), name 16px bold / role 14px, and the "BECOME A CLIENT"
    maroon underline link (191px).
- State: one `useState` index; list buttons, prev and next all drive it.

## 6. Footer (Figma `13-8015`) — `common/Footer.tsx`

Replaced the old "Have a vision? Let's build it." footer entirely:

- Maroon `#741A14` canvas, `rounded-t-[8px]`, generous `pt-[clamp(96px,12.9vw,195px)]`.
- Kicker "LET'S BUILD WORK THAT INSPIRES." → heading "Ready to build / something bold?"
  (80px cream serif) with the "START A COLLABORATION" underline CTA on the right.
- Contact grid: `@Maple studios 2026` | BUSINESS ENQUIRY (E. email / P. phone) | SOCIAL
  (2×2: Linkedin, Facebook, Whatsapp, Instagram).
- Giant clipped wordmark: `absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-[26%]`,
  `text-[clamp(76px,15.54vw,235px)] text-[#93352f] whitespace-nowrap` inside
  `overflow-hidden` — that's how the design cuts it at the frame edge. `pb` on the footer
  reserves its space.

## 7. Assets (`public/figma/` + `public/video/`)

All exported straight from Figma (exact bytes) because the MCP asset URLs expire:
`orbit-grand.png`, `orbit-right.svg`, `orbit-left.svg`, `star-hero.svg`, `star-divider.svg`,
`carousel-prev/next.svg`, `client-malte.png`, `worker-ai-card.png`, `hero-corner-left/right.svg`,
`logo-mark.svg`, `arrow-{cream,maroon,maroon-sm,cream-footer,down-sm}.svg`, `scroll-circle.svg`,
plus `video/new-era.mp4` (copied from your Downloads). The M is inline JSX (`MapleMark.tsx`)
so the inner-glow filter renders exactly.

## 8. Animations

- Figma motion data: the sparkle stars run a 2 s continuous rotation; the M floats. Implemented
  with `motion/react`: spring rotate loop for the star, gentle `y: [0,-9,0]` 7 s float for the M
  (the raw Figma track had a smart-animate jump artifact at 99.9% — deliberately smoothed).
- Everything below the fold uses `whileInView` + `viewport={{ once: true }}` fade/rise, staggered
  by index — same pattern the project already used.

## 9. Verification checklist (what was actually run)

1. `npm run typecheck` → clean. `npm run lint` → clean. `npm run build` → static prerender OK.
2. Dev server on **:3006** + JS probes: all 7 section ids mount; M box centered at 40.9% height
   with 572/372 aspect; star at 27.97%/52.06%; badge at 80.7% left; 3 orbit images; video
   `playing/muted/loop`; 5 client buttons; footer giant text present; "Have a vision" gone;
   zero console errors; zero asset 404s; fonts (`Red Hat Display`, `Instrument Serif`) loaded.
3. Carousel state verified through React fiber + classNames (note: with the browser pane hidden,
   CSS transitions freeze, so *computed* opacity lags — classNames are the source of truth).
4. Mobile 375px: `scrollWidth === clientWidth` (no horizontal overflow), stacked service cards.

## 10. Scroll & motion effects round (second pass)

### 10.1 Hero polish
- **Heading/M overlap**: the design's Catilde font is wider than Instrument Serif, so the
  heading was enlarged to `text-[clamp(44px,6.3vw,95px)]` — its right edge now reaches
  ~6.5vw past the M's left edge, tucking the "se." of "purpose." under the glass exactly like
  the Figma inspect (M box: left 472 / top 140 / right 469 / bottom 285). The M wrapper got
  `z-20` (above the `z-10` heading) — it stays fully transparent (1% fill = invisible), so the
  text reads through the glass. Heading + CTA live in **one anchored block** so they can
  never collide at short viewports.
- **Breathing gradient**: `.hero-glow` overlay — a lighter-red radial
  (`rgba(190,62,45,…)`) with a 9 s `@keyframes heroGlow` loop animating only `opacity` and
  `transform` (compositor-friendly, no repaints).

### 10.2 About headline scroll fade — `common/ScrollFadeText.tsx`
Splits the sentence into words; `useScroll({ target, offset: ["start 0.85","start 0.35"] })`
gives 0→1 progress while the block crosses the viewport; each word maps its own slice
(`start = i/words * 0.9`, width 0.1) through `useTransform(progress, range, [0.12, 1])`.
Result: words light up left-to-right as you scroll (verified: mid-scroll opacities
`1,1,1,1,1,1,1,0.82,0.3,0.12,…`).

### 10.3 Venetian-blind section transition — `common/BlindsReveal.tsx`
The Studio.mp4 dark→light shutter: a full-bleed block (`h-[42vh]`) painted in the outgoing
section's color, containing 6 absolute cream bands (each `height: 100/6 %`). Each band's
`scaleY` (origin center) maps a staggered slice of the block's scroll progress
(`start = i/6 * 0.45`, width 0.55) from 0.03 → 1.05 — bands grow like blinds until the block
is solid cream. Placed at the top of **Key Facts** (backdrop `#5d1411`) and
**Client stories** (backdrop `#2f0500`, after the video section).

### 10.4 Key-facts cards tilt-in
Grid gets `perspective: 1400px`; each card:
`initial={{ opacity: 0, y: 140, rotate: ∓(11–16°), rotateX: 34, scale: 0.9 }}` →
`whileInView` to upright, `ease: [0.22,1,0.36,1]`, stagger 0.15 s. Cards fly in tilted and
straighten, like the reference video.

### 10.5 Horizontal work track (Studio2.mp4) — `WorkSection.tsx`
The classic **pinned horizontal scroll-jack**, no extra libraries:
1. Wrapper `<div>` with `height: calc(100vh + shift)` where
   `shift = track.scrollWidth − innerWidth` (measured in `useLayoutEffect`, kept fresh by
   `ResizeObserver` + window resize; `0` below `lg` → wrapper collapses).
2. Inside it, `sticky top-0 h-screen overflow-hidden` — the pin.
3. The track (`flex gap-[7vw]`) translates with
   `x = useTransform(scrollYProgress(wrapper, ["start start","end end"]), [0,1], [0, -shift])`.
4. Slides: [heading + project 1 (the original two-column layout)] → [project 2] →
   [project 3] → [Discover copy + VIEW ALL] → [OUR SERVICES + giant A.I./DESIGN/… type,
   which slides in as the final panel — "comes accordingly"].
5. Below `lg`: plain vertical fallback (heading, card 1, giant type).

**Critical prerequisite:** `position: sticky` dies inside any `overflow-x: hidden` ancestor.
The page previously had `overflow-x-hidden` on `<main>` and `overflow-x: hidden` on body —
both replaced with **`overflow-x: clip` on `<body>`** (clips without creating a scroll
container, so sticky keeps working). Verified: sticky stays at `top: 0` through the whole
runway and the track reaches `x: −3600px` at 1440×900.

Note: the two attached "MyWorker AI" SVGs embed **pixel-identical** images (md5-checked), so
all three carousel entries currently share one visual — edit `WORK_DATA.projects` in
`src/lib/constants.ts` to drop in real titles/images.

### 10.6 How this round was verified
The in-app browser pane freezes rAF/CSS-transitions/scroll when hidden, so scroll-linked
values can't be probed there. Verification ran in **headless-but-compositing Chrome**
(`playwright-core`, `channel: "chrome"`): hero overlap 78–90px across 1280/1440/1512
viewports with 16–21px heading→CTA gap; about words gradient mid-scroll; blind bands
staggered (0.5/0.36/0.23/0.09/0.03/0.03) then ~1; cards settle to identity transform; track
x hits −1800 @ 50% and −3600 @ 100% with sticky pinned; giant type on-screen at track end.
Plus `tsc`, `next lint`, `next build` all clean.

## 11. Typography spec, gradients & inner pages (third pass)

### 11.1 Exact typography (as supplied)
Catilde is a paid font, so `font-serif-luxury` (Instrument Serif) carries the Catilde
*metrics*; every size below is the design px converted to `clamp(min, px/1512*100 vw, px)`:

| Element | Spec | Implementation |
|---|---|---|
| "Designed to / mean purpose." | #FFF3D3, 80px, w400, ls 4px | `text-[clamp(42px,5.29vw,80px)] font-normal tracking-[0.05em] text-[#fff3d3]` |
| About statement | #FFF3D3, 80px, **w300**, lh 100% | `text-[clamp(40px,5.29vw,80px)] font-light leading-none text-[#fff3d3]` |
| Hero description | #FFF, Red Hat 18px, w400 | `text-[clamp(13px,1.19vw,18px)] text-white` |
| Badge "22h 40m" | #741A14, Red Hat 19.149px, w700 | `text-[clamp(15px,1.27vw,19.1px)] font-bold text-[#741a14]` |
| Marquee (INNOVATE…) | #FFF3D3, 141.641px, ls 7.082px | `text-[clamp(64px,9.37vw,141.6px)] tracking-[0.05em] text-[#fff3d3]` |
| "Key facts" | #741A14, 100px | `text-[clamp(56px,6.61vw,100px)] text-[#741a14]` |
| "A snapshot…" | Red Hat 20px | `text-[clamp(15px,1.32vw,20px)] text-black` |
| "Selected work & explorations" | #000, 80px | `text-[clamp(44px,5.29vw,80px)] text-black` |
| A.I./DESIGN/DEV/BRANDING | #741A14, 141.641px, **lh 70%** | `text-[clamp(56px,9.37vw,141.6px)] leading-[0.7] text-[#741a14]` |
| "Client stories" | #000, 80px | same as Selected work |
| Testimonial quote | #000, Red Hat 30px, w500, lh 120% | `text-[clamp(20px,1.98vw,30px)] font-medium leading-[1.2]` |
| "Ready to build something bold?" | #FFF3D3, 80px | `text-[clamp(44px,5.29vw,80px)] text-[#fff3d3]` |

### 11.2 Auto-cycling hero gradient
The four PNGs from *Maple Studio Gradient* (3026×1594) were converted to **WebP**
(1.4 MB → ~4 KB each) into `public/figma/gradients/gradient-{1..4}.webp`. Each is stacked
`absolute inset-0 object-cover` with class `.gradient-cycle`: a 28 s `@keyframes
gradientCycle` (0→8% fade in, hold to 25%, out by 33%) plus `animation-delay: (i-1)*7s`.
Result: one variant visible at a time, crossfading every ~7 s, forever. Verified live —
opacity pairs pass through `[0.61, 0.39]` and `[0.37, 0.63]` mid-crossfade.

### 11.3 Glassy M
`MapleMark.tsx` path fill changed from `black/0.01` to `url(#mGlassFill)` — a linear
gradient of #FFF8E7 / #FFF3D3 / #FFFFFF at 0.17 / 0.07 / 0.15 alpha. The inner-glow
`feMorphology` filter is unchanged, so the mark reads as frosted glass over any
background while the heading stays legible through it (matching the supplied PNG).

### 11.4 Slower, full-screen, naturally blending strips
`BlindsReveal` was **inverted**: instead of cream bands growing over dark, the block is
cream with 7 bands painted in the *outgoing section's* color that **shrink to nothing**
(`scaleY 1.04 → 0`, `origin-center`, staggered `start = i/7 * 0.6`, width 0.4). It now
starts 100% solid dark — seamless with the section above — and dissolves. Height is
`h-screen` (full viewport, verified 900 = 900) and the scroll window is
`["start 0.95", "end 0.35"]` ≈ 1.6 viewport-heights of travel, so it is much slower.
Mid-scroll the bands read `[0.31, 0.53, 0.75, 0.98, 1.04, 1.04, 1.04]` — exactly the
thin-to-thick strip pattern from the reference.

`ScrollFadeText` slowed the same way: window `["start 0.9", "start 0.1"]`, per-word slices
widened to 0.3 with heavy overlap, so words blend instead of popping.

### 11.5 Four new pages
| Route | Figma frame | Structure |
|---|---|---|
| `/work` | 14:8050 | Maroon "Our work" hero → cream two-column **staggered** project grid (right column offset ~226px, 8 projects) → MORE ABOUT US |
| `/services` | 14:8638 | Maroon hero → focused-disciplines statement → BRANDING✦DESIGN✦AI marquee → 3 numbered service blocks → TECHNOLOGY / STACK → 4-row capability accordion → OUR PROCESS (3 steps) |
| `/contact` | 20:3 | **Cream** hero (maroon M + star, "Let's start something.") → maroon form region (note + `01 / 05`, 3 rounded 62px inputs, CONTINUE → mailto) → cream rule → Location / Join us / email → cream "Questions" accordion |
| `/about` | 22:624 | Cream throughout: statement hero over the cut-out eagle with the word marquee crossing it → AT MAPLE → 24-hours split badge + mission + LET'S CONNECT → "Our values" 6-row list |

Shared primitives live in `src/components/pages/PageKit.tsx` (`PageHero`, `Rule`,
`UnderlineLink`, `Eyebrow`, `Reveal`, `HERO_GRADIENT`); page copy lives in
`WORK_PAGE` / `SERVICES_PAGE` / `CONTACT_PAGE` / `ABOUT_PAGE` in `src/lib/constants.ts`.
Each page composes the shared `Navbar` + `Footer`, so the frames' own header/footer
regions were deliberately skipped. The nav menu now routes to the real pages
(`/`, `/about`, `/work`, `/services`, `/contact`) and LET'S TALK → `/contact`.

The eagle export was 8.4 MB PNG → **124 KB WebP** (4096px → 1400px).

### 11.6 Verification
`tsc --noEmit` clean, `next lint` clean, `next build` → all **5 routes statically
prerendered**. Headless Chrome (playwright-core) over every route: correct titles/H1s,
navbar + footer present, **zero broken images, zero console errors, zero horizontal
overflow at both 1440×900 and 375×812**. Home effects re-verified: gradients crossfading,
M fill = `url(#mGlassFill)`, heading 76.2px / 3.81px tracking / rgb(255,243,211), blinds
full-screen and gradual, about-text word fade sweeping left-to-right.

## 12. Catilde, trionn-style work cards & detail pages (fourth pass)

### 12.1 Real Catilde font
The licensed OTF/TTF pack was converted to **woff2** with `fontTools` + `brotli`
(`catilde-{light,regular,semibold,italic,semicondensed}.woff2`, 49–70 KB each) into
`public/fonts/`, declared with `@font-face` in `globals.css` at weights 300/400/600
(+ italic, + a separate `Catilde Condensed` family), and put **first** in
`--font-serif` and `.font-serif-luxury`. Instrument Serif remains only as a fallback.
Every `clamp()` size from §11.1 now renders in the real face — verified live:
`fontFamily → "Catilde"`, `document.fonts.check('40px Catilde') → true`.

### 12.2 Fully transparent M
Reverted the glass gradient: the path is back to `fill="black" fillOpacity="0.01"`
(the original Figma export value) so **nothing** is painted inside the letterform —
only the #FFF3D3 stroke and the inset glow. The background shows through completely.

### 12.3 Navbar edge alignment
Dropped the `max-w-7xl mx-auto` wrapper for a full-bleed flex row. Logo now sits at the
far left, LET'S TALK + MENU at the far right — measured 32 px from each edge at 1440.

### 12.4 Section transition, rebuilt
The scale-based blinds were replaced with an **opacity dissolve**:
- The block is **60vh** (not `h-screen`) and its strips are an *overlay* on the
  boundary, so it no longer eats a full extra screen of scrolling.
- 9 strips of the outgoing color **fade out** (`opacity 1 → 0`) on staggered windows
  (`start = i/9 * 0.55`, width 0.45) with a small `y: 0 → -14px` drift.
- Scroll window `["start 0.85", "end 0.45"]` — the whole transition resolves inside
  roughly one viewport of travel.

Because it is opacity rather than geometry, the old background genuinely *fades out*
while the new one *fades in* underneath — the trionn behaviour asked for, instead of
"scroll a lot, then arrive". Verified mid-transition:
`[0.11, 0.25, 0.38, 0.52, 0.65, 0.79, 0.93, 1, 1]`.

### 12.5 trionn-style work cards
Each project on `/work` is now a scroll-driven entry (`WorkGrid.tsx`):
- a **ghost wordmark** of the project name parallaxes behind it
  (`y: 40 → -60`, `opacity 0 → 0.09 → 0.04`),
- the image reveals through an opening **clip-path**
  (`inset(38% 0 38% 0) → inset(0)`) with a light `scale 1.06 → 1` settle.
  (2026-08-06: the original ±10% overscan parallax was removed — it permanently
  zoomed the art ~20% and cut the "Hi, I'm Alex." baseline off the card. The card
  and detail-rail aspects now match the artwork (810/556), so at rest the frame
  shows the full image with zero crop; hover feedback is a lift, not a zoom.),
- info column and image **alternate sides** row to row.

That combination — frame opening + image drifting inside it — is what produces the
"card grows and breathes" feel in the reference capture.

### 12.6 Project detail pages — `/work/[slug]`
New dynamic route built from Figma frame **14:8429**, statically generated for all 8
projects via `generateStaticParams`. Layout mirrors the request: the **left column is
`position: sticky` (top 110px) and stays put** — BACK TO WORK, title, description,
bulleted services, the THE CHALLENGE / APPROACH / OUTCOME / WHAT WE DID tab strip and
its copy — **while the right rail of project imagery scrolls past it**. PRE PROJECT /
NEXT PROJECT wrap around the list. Every `EXPLORE PROJECT` link and card on `/work`
routes here.

### 12.7 Verification
`tsc` clean; `next build` → **13 statically prerendered routes** (5 pages + 8 project
pages). Headless Chrome: Catilde active, navbar flush to both edges, M fill-opacity
0.01, strip cascade measured, 8 work entries with live clip-path
(`inset(26.24% 0%)` mid-reveal), detail page sticky column at `top: 110px` with 4 tabs,
**zero page errors, zero 4xx, zero horizontal overflow**.

## 13. Pinned trionn transition, pure-outline M & connected work cards (fifth pass)

### 13.1 The transition, finally exact
Frame-analysis of the trionn capture showed the missing ingredient: **the boundary is
pinned** — the screen holds still while the strips grow. `BlindsReveal` is now:
- a **190vh wrapper** containing a `sticky top-0 h-screen` panel painted in the
  outgoing dark color (seamless with the section above);
- **10 cream bands** (thinned from 6 on 2026-08-06 — ~10vh each) grow
  `scaleY 0 → 1.03` (origin center), staggered top-first (`start = i/10 * 0.5`,
  window 0.5), driven by the wrapper's scroll progress. The wrapper breaks out of
  any padded parent with `mx-[calc(50%-50vw)]`, so the strips always span the full
  viewport width;
- when all bands are full the panel is solid cream and unpins into the section.

Verified: `stickyTop` stays **0** through the whole runway on both boundaries, bands
read `[1.03, 0.86, 0.69, 0.52, 0.34, 0.17]` at the midpoint — the graded
thin-to-thick pattern from the reference.

**Trap that broke it first:** both cream sections had `overflow-hidden`, and any
`overflow != visible` ancestor silently disables `position: sticky`. Removed — the
body-level `overflow-x: clip` already handles horizontal bleed. Rule of thumb for this
codebase: *nothing between `<body>` and a sticky element may set overflow.*

### 13.2 M mark: outline only
`MapleMark` now renders a single stroked path (`stroke #FFF3D3`, `fill: none`) — the
silhouette path and the `feMorphology` inner-glow filter are gone. That glow was what
read as "color filled inside". The user-supplied compact 280×182 M+star
(`MapleOutlineMark.tsx`) sits above the "Our work" title, also stroke-only.

### 13.3 /work — floating-merge hero + connector lines
- **WorkHero**: four small project thumbnails bob around the title (independent
  5–6.6s float loops) and, on scroll, are pulled into the heading — converging
  (`x/y → centre`), shrinking to 0.3 and fading out by 85% of the hero's exit.
  Measured at scroll 700px: opacity 0.22, scale 0.36, thumbs moved ±(230–460)px.
- **Connector lines**: between consecutive entries an S-curve
  (`M 790 8 C 1010 128, 560 148, 452 210 C 344 272, 250 300, 208 394`, mirrored on
  alternate rows, `vector-effect: non-scaling-stroke`) **draws itself** with scroll:
  `motion.path style={{ pathLength: scrollYProgress }}` — measured dasharray
  0 → 0.41 → 0.85 across the gap. Hidden below `lg`.
  Final form (2026-08-06, matched to trionn): **two DOTTED strands** travelling
  together (dot patterns `0.6 8.4` / `0.6 10`, round caps, maroon at 90%/55%).
  Because motion's `pathLength` owns `stroke-dasharray`, the dotted pair is static and
  revealed through an SVG **`<mask>`** whose hidden 80-unit-wide stroke draws along the
  same curve with scroll — one synchronized tip uncovering both strands, gradually
  progressing to the next card. `pathLength={1000}` on the dotted paths keeps dot
  spacing uniform despite the stretched viewBox. The 4-point star still scales in at
  the landing point over the last 20%.
- The §12.5 clip-reveal cards remain underneath these two layers.

### 13.4 Verification
`tsc` clean; `next build` → 13 static routes. Headless Chrome: M = 1 path / no filter /
fill none; both pins hold at `top: 0`; bands graded; 4 floating thumbs converge; 7
connectors draw with scroll; zero page errors; zero horizontal overflow.

## 14. Video-matched motion pass (sixth pass, 2026-08-06)

All four effects were rebuilt from frame-by-frame analysis of the supplied captures.

### 14.1 Strip exit over LIVE content — `common/StripExit.tsx` (replaces BlindsReveal)
The reference shows the marquee still visible, squeezed between growing white strips —
the transition happens ON the outgoing section, not in a reserved block. `StripExit`
wraps the outgoing section (About, and the services video section in `page.tsx`):
- wrapper = [sticky section][100vh spacer]; the section gets
  `position: sticky; top: calc(100vh − height)` (measured via ResizeObserver), so it
  scrolls normally and then **pins exactly when its last screen fills the viewport**;
- 10 cream strips grow (`scaleY 0 → 1.03`) over that pinned screen in a **shuffled
  order** (`[6,2,9,4,0,7,3,8,1,5]`) matching the organic pattern in the video;
- progress = `useScroll(offset: ["end 2", "end 1"])` — exactly the spacer phase.

**Sticky trap #2 (the twin of the overflow one):** `sticky bottom-0` pins at the
START of visibility (footer-reveal). Pin-at-END requires a **negative `top`**
(`100vh − sectionHeight`). Verified: before the runway About scrolls free; through it
About's bottom sits at the viewport bottom (±0px) with the marquee on screen while
strips grow 0 → 2 → 9.

### 14.2 Home track card jump
Each slide in the horizontal work track wraps in
`initial {y:170, opacity:0} → whileInView {y:0, opacity:1}` with a **spring**
(stiffness 90, damping 15) and `viewport {once:false, amount:0.3}` — cards leap up
from below as the track carries them in, replaying in both directions
(measured y 170→0, opacity 0→1).

### 14.3 Key-facts cards, both directions
Tilt strengthened to the video's lie-back look (`rotateX 52`, small z-rotate, y 120)
and `viewport {once:false, amount:0.3}` so the cards stand up on every entry and lie
back down when you scroll away — verified settled → tilted → settled across a
down-up-down cycle.

### 14.4 /work fully reddish + scatter hero
- `<main>` carries the hero's radial gradient with `background-attachment: fixed`
  (viewport-locked, identical on every screenful); WorkHero and WorkGrid are
  transparent — **no beige anywhere on the page**.
- Hero now floats **9 thumbnails of varied sizes** across the whole viewport; on
  scroll each is flung OUTWARD away from the title (dx/dy proportional to its offset
  from centre, rotation amplifying, fading by 72%) — measured mid-scroll at
  x ±(260–914)px, opacity 0.17. (The earlier converge-to-title behaviour was
  backwards vs. the reference.)
- Dark-theme recolor: ghost wordmarks, titles, links and the dotted connector pair
  are cream `#FFF3D3`; the landing ornament is the cream star (`star-hero.svg`).

## 15. Flow, smoothness & living gradients (seventh pass, 2026-08-06)

- **Wandering hero cards (/work)**: each thumbnail now drifts through its own loop of
  waypoints (`x/y` keyframe arrays in vw/vh, ±3–12 units, 12–20s out-of-phase
  durations, rotation drift) on the inner node, composing with the scroll fling on
  the outer node — the field flows freely instead of bobbing in place.
- **Strips slower + de-lagged**: runway 100vh → **170vh** (offset `["end 2.7","end 1"]`)
  and progress routed through `useSpring(stiffness 70, damping 22)` so bands glide
  between scroll events instead of stepping. The *real* jank near client stories was
  the background video still decoding after being scrolled past — an
  IntersectionObserver (`rootMargin 25%`) now pauses/resumes it with visibility
  (verified: playing near the section, paused inside client stories).
- **Living gradients everywhere**: the 4-variant cycler was extracted into
  `common/GradientCycler.tsx` (28s crossfade loop; host needs `relative isolate`,
  cycler sits at `-z-10`; `fixed` prop = viewport-locked page background). Applied to:
  home hero, /work page (fixed), services PageHero, the contact maroon region, and
  the project-detail pages — every reddish-gradient surface now cycles the supplied
  shades (verified 4 cycling layers on each).

## 16. The DNA sequence, living gradients & twin strands (eighth pass, 2026-08-06)

### 16.1 Pinned burst-and-orbit services sequence — `ServicesVideoSection.tsx` rewrite
Built from the AiSec (trionn rock sequence) + new-era particle film references:
- The giant type moved OUT of the horizontal track into this section: pinned
  centre-screen in cream over the film inside a **420vh wrapper + sticky screen**.
- The new film (`public/video/new-era-dna.mp4` — ring → vase → DNA helix → terrain)
  is **scroll-scrubbed, not played**: re-encoded with a keyframe every 5 frames
  (`-g 5 -keyint_min 5`, 1280px, 6.8 MB) so `currentTime` seeks resolve instantly;
  a piecewise map `progress [0, .3, .46, 1] → time [0.04, 2.35, 2.95, 3.35]` holds the
  ring/vase behind the type, hits the helix at the burst, then crawls across the DNA.
  Scrubbing makes the whole sequence deterministic AND reversible.
- **Letter burst**: every glyph is a span; per-letter deterministic trajectories from
  a `sin`-hash (`dx ±65vw, dy ±55vh, spin ±260°`, jittered windows around
  progress 0.30–0.46). Verified 28/29 letters >30px displaced mid-burst.
- **Orbit cards**: the four service cards sweep 180° around the helix on an ellipse
  (`x = cos(angle)·31vw, y = sin(angle)·25vh`, 90° apart, fade in at 0.46) — the
  floating-stat-cards look from the reference film. Glass styling: `bg-black/35`,
  cream titles, white leads.
- The section feeds straight into the existing `StripExit` pin → Client stories.
- Everything rides one `useSpring`-smoothed progress; mobile keeps a playing video
  with stacked type + cards (IO pause/play retained, gated off the scrub video).

### 16.1b Swapped to the ORIGINAL maroon film (same-day revision)
The sequence now scrubs `new-era-sphere.mp4` — the scrub-encode (g=5, 3.9 MB) of the
original brand-matched maroon/gold particle film, which contains a true DNA helix at
~2.7–3.6s (sphere → ring → vase → helix → terrain). Time map retuned to
`[0, .3, .46, 1] → [0.05, 2.3, 2.85, 3.55]`; everything else unchanged.
Verified scrub: t=1.17s at early hold, 2.96s at the card phase, 3.48s late.

**Margin-collapse trap:** removing `overflow-hidden` from the client-stories section
(needed for the sticky pins) let its heading's `mt-[clamp(72px,8vw,150px)]` collapse
OUT of the section — a maroon page-background band appeared between the strip exit
and the cream section. Fix: the space became `pt` on the section itself. Verified:
0px seam. Rule: with no overflow/padding/border, a first-child top margin leaks out.

### 16.2 Gradient change made unmissable
Cycle 28s → **16s** (4s per shade), and each layer now also **pans/zooms while lit**
(`gradientDrift`: scale 1.02→1.18 with translate) plus slight per-variant
brightness/saturation offsets — the light visibly travels on every reddish surface.

### 16.3 Connector strands separated
The companion strand is now a genuinely different curve (`M 842 62 …`), ~45 units away
and deliberately **shorter** (starts after the departure, releases before the landing),
with its **own mask trailing behind** the main draw
(`twinProgress = progress mapped [0.16, 0.96] → [0, 1]`) and both strands
spring-smoothed. Verified: two masks, main 0.40 drawn while twin at 0.30.

## 17. Gotchas worth remembering

- **OneDrive + `.next`**: delete `.next` if the dev server ever crashes with `EINVAL readlink`.
- Never run `next build` while `next dev` is up — they share `.next`.
- Autoplaying video **must** be `muted` + `playsInline`.
- Duplicate inline SVGs with `<filter id>` collide — the M is rendered once (single responsive
  canvas) so its filter id stays unique.
- Tailwind v4 arbitrary values used heavily: `left-[28.09%]`, `aspect-[586/306]`,
  `text-[clamp(...)]`, `bg-[#d9d9d9]/33` — this is the cleanest way to carry exact Figma
  geometry without a config file.
