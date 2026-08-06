# Maple Studios

Marketing site for Maple Studios — an independent digital studio. Built from the
Figma design system with scroll-driven motion throughout.

**Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · motion/react

---

## Getting started

```bash
npm install
npm run dev
```

The dev server runs on **http://localhost:3006**.

| Script | Purpose |
| --- | --- |
| `npm run dev` | Dev server (port 3006) |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |

## Routes

| Path | Description |
| --- | --- |
| `/` | Home — hero, about, key facts, work track, services sequence, client stories |
| `/work` | Our work — floating-thumbnail hero, project entries with connector lines |
| `/work/[slug]` | Project detail — sticky info column, scrolling image rail (8 static pages) |
| `/services` | Services — disciplines, capability accordion, process |
| `/about` | About — studio statement, values |
| `/contact` | Contact — enquiry form (mailto), FAQ accordion |

## Project structure

```
src/
  app/                 # App Router routes + globals.css (fonts, keyframes)
  components/
    common/            # Navbar, Footer, MapleMark, GradientCycler, StripExit, …
    sections/          # Home page sections
    pages/             # Inner-page sections (work / services / about / contact)
  lib/constants.ts     # ALL page copy and content lives here
public/
  figma/               # Exact Figma exports (SVG/PNG) + gradient variants
  fonts/               # Catilde (woff2, licensed)
  video/               # Particle films (scrub-encoded)
```

**Content edits** — copy, project lists, service cards and FAQ entries are all data in
`src/lib/constants.ts`. No component edits needed for text or image swaps.

## Design & motion notes

`ROADMAP.md` documents the full Figma-to-code method and every scroll effect
(pinned strip transitions, the scroll-scrubbed services sequence, connector lines,
the horizontal work track), including the CSS traps that constrain them.

Two rules worth knowing before editing layout:

- **Nothing between `<body>` and a sticky element may set `overflow`** — it silently
  disables `position: sticky`. Horizontal bleed is handled by `overflow-x: clip` on `<body>`.
- Sections need **padding**, not child margins, at their top edge — a first-child top
  margin collapses out and opens a background-colored gap.

## Notes

- The Catilde font files in `public/fonts/` are licensed — keep them out of public forks.
- `public/video/new-era.mp4` and `new-era-dna.mp4` are unused source footage kept for
  reference; only `new-era-sphere.mp4` is served.
