# PDF case-study decks on the work-detail page — how it works

Three project pages — My Worker AI, Pulse Studio, Loftgoom — show an ENTIRE
case-study PDF as one continuous strip scrolling on the right, with the
sticky text column on the left. The tabs (THE CHALLENGE / APPROACH /
OUTCOME / WHAT WE DID) and the strip stay in sync **both ways**: clicking a
tab smooth-scrolls to that section's exact spot on the canvas, and scrolling
the strip lights up the tab of the section you have reached. This doc
explains the whole pipeline so it can be rebuilt or extended without help.

## Tech stack and why each piece

| Piece | Choice | Why |
|---|---|---|
| PDF reading | **Python + PyMuPDF** (`pip install pymupdf pillow`) | Reads any PDF, renders regions to pixels, and extracts text WITH coordinates — that last part is what makes automatic section mapping possible. Runs offline, once, so visitors never pay the cost. |
| Image format | **WebP q80** via Pillow | ~20 MB of PDF becomes ~0.8 MB of images per deck. |
| Serving | **Next.js `public/` folder + `next/image`** | Static files, automatic lazy loading, responsive `sizes`. No server code at all. |
| Scrolling | **Native `window.scrollTo({behavior:"smooth"})`** | Zero libraries. A tab's PDF y-position is mapped onto the rendered strip and the page scrolls there, minus navbar clearance. |
| Scroll-spy | **`scroll` listener + `requestAnimationFrame`** | Same maths read backwards; matches the pattern already used in `Navbar`. An IntersectionObserver would need injected marker elements and still could not answer "which section did I last pass". |
| State | **React `useState` + `useRef`** | One state for the active tab, one ref on the strip wrapper, one ref for the in-flight jump. |

Key insight: each "long PDF" is actually **one PDF page, 1920 pt wide and
15 000+ pt tall** — a whole website design exported as a single canvas.
It is shown UNCUT: the 12 WebP tiles butt flush inside one wrapper
(no gaps, no per-tile rounded corners), existing purely so the browser
can lazy-load the strip progressively instead of decoding one giant
70-megapixel image up front.

## The pipeline, step by step

1. **Tile the PDF** — `python scripts/gen-workdeck.py <project-slug> <pdf>`
   - Measures the page, cuts it into 12 seamless clips (`pymupdf.Rect`
     clip + `get_pixmap`), renders at 0.75× (1440 px wide), saves
     `public/work/<slug>/deck-v1/slice-01.webp` … `slice-12.webp`.
   - Prints a **paste-ready `WORK_DETAIL.decks` entry** plus every text
     block with its y-coordinate (`page.get_text("blocks")`) — those y
     values ARE the tab anchors.
   - Refuses to write into a deck folder that already has content: deployed
     assets are immutable-cached, so a replacement deck needs
     `--version 2` (`deck-v2`), not an overwrite.
2. **Record the mapping** — `src/lib/constants.ts` → `WORK_DETAIL.decks`
   - Keyed by project id, so adding a deck is adding one entry; a project
     without an entry keeps the plain repeated-image rail.
   - `dir`, `count` — where the tiles live and how many.
   - `canvasH` — the PDF canvas height in points, the denominator of the
     anchor maths.
   - `tileW`/`tileH` — rendered slice pixels, handed to `next/image` so the
     strip reserves its true height before any image loads (the anchor
     maths measures the strip; an unloaded strip would measure short).
   - `anchors` — `{ challenge, approach, outcome, "what-we-did" }`, each the
     y in PDF points of that section's lead line, straight from the
     script's printout. `WorkDeck` types it as `Record<WorkTabId, number>`,
     so a deck that forgets an anchor fails `npm run typecheck`.
3. **Render the rail** — `src/components/pages/work/ProjectDetail.tsx`
   - `deckFor(project.id)` returns the deck or null. In deck mode one ref'd
     `<motion.div>` wrapper (rounded, overflow-hidden, single fade-up
     entrance) stacks all 12 `<Image width height>` tiles flush with
     `block h-auto w-full`; otherwise the old repeated-image cards.
4. **Wire the tabs — both directions around one shared line**
   - `sectionTops()` measures the strip (`getBoundingClientRect`) and maps
     every anchor onto the page: `scrollY + rect.top + (anchor / canvasH) *
     rect.height`.
   - **Tab → strip:** `openTab(i)` sets the tab state (text swap, as
     before) and scrolls to `sectionTops()[i] - 110`. The 110 keeps the
     target clear of the fixed navbar.
   - **Strip → tab:** a `scroll`/`resize` listener (rAF-throttled) marks
     active the LAST section whose top has passed `scrollY + 110` — the
     same line a click scrolls to, which is exactly why a click leaves the
     tab it selected active instead of fighting the spy.
   - A click stores `{top, until}` in `jumpRef` and the spy stays quiet
     until the scroll lands on that top (or 1.6 s passes); without it, the
     sections a jump flies over would each flash their tab and restart the
     copy animation. A `wheel`/`touchmove` gesture releases the mute early,
     because those cancel the browser's smooth scroll.
   - The left column is `lg:sticky`, so it holds still while the page glides
     down the canvas.

## Adding or swapping a deck

1. `python scripts/gen-workdeck.py <project-slug> path\to\new.pdf`
   (add `--version 2` when REPLACING a deck that has already shipped —
   deployed assets are cached as immutable, so changed content needs a new
   URL).
2. Paste the printed entry into `WORK_DETAIL.decks`.
3. Fill `anchors` from the printed y values: one per tab, **ascending in tab
   order**, ideally ~2000 pt apart. Ascending is not cosmetic — the spy
   picks the last anchor scrolled past, so an out-of-order anchor makes the
   tabs jump backwards as the visitor scrolls forwards.

## Gotchas learned the hard way

- Tiles must use `width`/`height` (NOT `fill`) so they stack in normal
  flow; `className="block h-auto w-full"` kills the inline-image
  baseline gap that would otherwise show as hairline seams.
- The jump maths needs the RENDERED strip height (`getBoundingClientRect`),
  not the natural image height — the strip scales with the column.
- `globals.css` sets `html { scroll-behavior: smooth }`, so a
  `prefers-reduced-motion` jump must ask for `behavior: "instant"`;
  `"auto"` inherits the CSS and animates anyway.
- Slice heights differ by a pixel after rounding — `tileH` is the tallest,
  so the reserved space is never short of the image.
- Don't reuse an asset folder name after changing its contents
  (immutable caching) — always version the folder.
