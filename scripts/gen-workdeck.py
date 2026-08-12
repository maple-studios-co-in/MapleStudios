"""Slice a long single-page case-study PDF into a work-detail right rail.

Each source is ONE PDF page ~1920 pt wide and 15000+ pt tall — a full site
design exported as a single canvas. This cuts it into equal slices, renders
each at 0.75x (1920 pt -> 1440 px) and saves WebP q80 into
public/work/<slug>/deck-<version>/. The slices are seamless: the rail stacks
them flush so visitors see the uncut canvas, and the only reason to cut at
all is progressive lazy-loading instead of one 70-megapixel decode.

Deck folders are cached as immutable, so a REPLACED deck must get a new
folder name — pass --version 2 (deck-v2) rather than overwriting; the script
refuses to write into a populated folder unless --force is given.

After rendering, this prints
  1. a paste-ready WORK_DETAIL.decks entry for src/lib/constants.ts, and
  2. every text block with its y in PDF points — those y values are the
     section anchors a tab jumps to (WORK_DETAIL.decks[].anchors).

Usage:  python scripts/gen-workdeck.py <project-slug> <path-to-pdf>
                                       [--version N] [--slices N]
Deps :  pip install pymupdf pillow
"""

import argparse
import io
import sys
from pathlib import Path

import pymupdf
from PIL import Image

SCALE = 0.75  # 1920 pt -> 1440 px
QUALITY = 80

# design text carries em dashes and check marks; the Windows console is cp1252
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ap = argparse.ArgumentParser()
ap.add_argument("slug", help="project id in WORK_PAGE.projects, e.g. pulse-studio")
ap.add_argument("pdf", help="path to the single-page case-study PDF")
ap.add_argument("--version", type=int, default=1, help="deck folder version (deck-vN)")
ap.add_argument("--slices", type=int, default=12)
ap.add_argument("--force", action="store_true", help="overwrite a populated deck folder")
args = ap.parse_args()

out = Path(__file__).resolve().parent.parent / "public" / "work" / args.slug / f"deck-v{args.version}"
if out.exists() and any(out.iterdir()) and not args.force:
    sys.exit(
        f"{out} already holds a deck. Deployed assets are immutable-cached: "
        f"bump --version instead of replacing it (or pass --force if this deck "
        f"has never shipped)."
    )

doc = pymupdf.open(args.pdf)
if len(doc) != 1:
    print(f"warning: {len(doc)} pages, only page 1 is rendered")
page = doc[0]
w, h = page.rect.width, page.rect.height
slice_h = h / args.slices
print(f"canvas {w:.0f}x{h:.0f} pt -> {args.slices} slices of {slice_h:.1f} pt")

out.mkdir(parents=True, exist_ok=True)
mat = pymupdf.Matrix(SCALE, SCALE)
total_kb = 0
tile_w = tile_h = 0
for i in range(args.slices):
    clip = pymupdf.Rect(0, i * slice_h, w, (i + 1) * slice_h)
    pix = page.get_pixmap(matrix=mat, clip=clip)
    img = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
    dest = out / f"slice-{i + 1:02d}.webp"
    img.save(dest, "WEBP", quality=QUALITY)
    kb = dest.stat().st_size / 1024
    total_kb += kb
    # slice heights land a pixel apart on rounding; report the tallest so the
    # rail never reserves LESS room than an image needs
    tile_w, tile_h = img.size[0], max(tile_h, img.size[1])
    print(f"  {dest.name}  {img.size[0]}x{img.size[1]}  {kb:6.0f} KB")
print(f"total {total_kb / 1024:.2f} MB")

# paste-ready config: tileW/tileH are what next/image reserves per slice, so
# the rail holds its height before a single byte of image has arrived
print(f"""
src/lib/constants.ts -> WORK_DETAIL.decks:

  "{args.slug}": {{
    dir: "/work/{args.slug}/deck-v{args.version}",
    count: {args.slices},
    canvasH: {h:.0f},
    tileW: {tile_w},
    tileH: {tile_h},
    anchors: {{ challenge: 0, approach: 0, outcome: 0, "what-we-did": 0 }},
  }},

Fill anchors from the y values below — one per tab, ASCENDING, and at least
~2000 pt apart so each lands on its own screenful (the rail scroll-spy picks
the last anchor scrolled past, so out-of-order values make the tabs jump).
""")

print("section anchors (y in PDF points):")
for x0, y0, x1, y1, text, *_ in sorted(page.get_text("blocks"), key=lambda b: b[1]):
    t = " ".join(text.split())
    if t:
        print(f"  y={y0:7.0f}  {t[:80]}")
