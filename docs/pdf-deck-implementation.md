# PDF case-study deck on the work-detail page — how it works

The My Worker AI project page shows the ENTIRE case-study PDF as one
continuous strip scrolling on the right (sticky text on the left), and
clicking a tab (THE CHALLENGE / APPROACH / OUTCOME / WHAT WE DID)
smooth-scrolls the page to that section's exact spot on the canvas. This
doc explains the whole pipeline so it can be rebuilt or extended without
help.

## Tech stack and why each piece

| Piece | Choice | Why |
|---|---|---|
| PDF reading | **Python + PyMuPDF** (`pip install pymupdf pillow`) | Reads any PDF, renders regions to pixels, and extracts text WITH coordinates — that last part is what makes automatic section mapping possible. Runs offline, once, so visitors never pay the cost. |
| Image format | **WebP q80** via Pillow | The 20 MB PDF became 0.81 MB of images. |
| Serving | **Next.js `public/` folder + `next/image`** | Static files, automatic lazy loading, responsive `sizes`. No server code at all. |
| Scrolling | **Native `window.scrollTo({behavior:"smooth"})`** | Zero libraries. A tab's PDF y-position is mapped onto the rendered strip and the page scrolls there, minus navbar clearance. |
| State | **React `useState` + `useRef`** | One state for the active tab, one ref on the strip wrapper. |

Key insight: the "206-page PDF" is actually **one PDF page, 1920 ×
15858 pt** — a whole website design exported as a single tall canvas.
It is shown UNCUT: the 12 WebP tiles butt flush inside one wrapper
(no gaps, no per-tile rounded corners), existing purely so the browser
can lazy-load the strip progressively instead of decoding one giant
68-megapixel image up front.

## The pipeline, step by step

1. **Tile the PDF** — `python scripts/gen-workdeck.py`
   - Opens the PDF, measures it (1920 × 15858 pt), cuts it into 12
     seamless clips (`pymupdf.Rect` clip + `get_pixmap`), renders at
     0.75× (1440 px wide), saves
     `public/work/my-worker-ai/deck-v1/slice-01.webp` … `slice-12.webp`.
   - Then prints every text block with its y-coordinate
     (`page.get_text("blocks")`) — those y values ARE the tab anchors.
2. **Record the mapping** — `src/lib/constants.ts` → `WORK_DETAIL`
   - `deck: { projectId, dir, count, canvasH }` — which project shows
     the deck, where the tiles live, and the canvas height in points.
   - each tab gets `deckY` — its heading's y in PDF points, straight
     from the script's printout (challenge 2199, approach 5049,
     outcome 9324, what-we-did 11294).
3. **Render the rail** — `src/components/pages/work/ProjectDetail.tsx`
   - If `project.id === WORK_DETAIL.deck.projectId`, one ref'd
     `<motion.div>` wrapper (rounded, overflow-hidden, single fade-up
     entrance) stacks all 12 `<Image width height>` tiles flush with
     `block h-auto w-full`; otherwise the old repeated-image cards.
4. **Wire the tabs**
   - `openTab(i)` sets the tab state (text swap, as before) AND — in
     deck mode — converts the section's PDF y to a page position:
     `scrollY + wrapper.top + (deckY / canvasH) * wrapper.height - 110`
     then `window.scrollTo({top, behavior:"smooth"})`. The 110 keeps the
     target clear of the fixed navbar.
   - The left column is `lg:sticky`, so it holds still while the page
     glides down the canvas.

## Swapping in a new PDF later

1. Save the new PDF anywhere, run
   `python scripts/gen-workdeck.py path\to\new.pdf`.
2. **Bump the folder name first** (deck-v1 → deck-v2 in the script's
   `OUT` and in `constants.ts`) — deployed assets are cached as
   immutable, so replaced content must get a new URL.
3. Update `deck.canvasH` from the script's first output line and each
   tab's `deckY` from the "section anchors" printout.

## Gotchas learned the hard way

- Tiles must use `width`/`height` (NOT `fill`) so they stack in normal
  flow; `className="block h-auto w-full"` kills the inline-image
  baseline gap that would otherwise show as hairline seams.
- The jump math needs the RENDERED strip height (`getBoundingClientRect`),
  not the natural image height — the strip scales with the column.
- Don't reuse an asset folder name after changing its contents
  (immutable caching) — always version the folder.
