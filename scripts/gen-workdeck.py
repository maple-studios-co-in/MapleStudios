"""Slice a long single-page case-study PDF into the work-detail right rail.

The source (Template.pdf) is ONE PDF page, 1920 x 15858 pt — a full site
design exported as a single tall canvas. This cuts it into 12 equal slices
(1920 x 1321.5 pt, aspect ~= the rail's existing 810/556 cards), renders
each at 0.75x (1440 px wide) and saves WebP q80 into
public/work/my-worker-ai/deck-v1/ (immutable-cached: replacing the deck
later means a NEW folder name, deck-v2, per the repo's media convention).

Tab -> slice mapping (WORK_DETAIL.tabs[].deckSlice in constants.ts) comes
from the canvas y-positions of each section's heading text, extracted with
get_text("blocks"), divided by the slice height (1321.5):
  THE CHALLENGE  y= 2199 -> slice 1
  APPROACH       y= 5049 -> slice 3
  OUTCOME        y= 9324 -> slice 7
  WHAT WE DID    y=11294 -> slice 8
Re-run this file after swapping the PDF; it prints fresh y-anchors so the
mapping can be updated in one glance.

Usage:  python scripts/gen-workdeck.py [path-to-pdf]
Deps :  pip install pymupdf pillow
"""

import io
import sys
from pathlib import Path

import pymupdf
from PIL import Image

PDF = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\asus\Downloads\Template.pdf"
OUT = Path(__file__).resolve().parent.parent / "public" / "work" / "my-worker-ai" / "deck-v1"
SLICES = 12
SCALE = 0.75  # 1920 pt -> 1440 px
QUALITY = 80

doc = pymupdf.open(PDF)
page = doc[0]
w, h = page.rect.width, page.rect.height
slice_h = h / SLICES
print(f"canvas {w:.0f}x{h:.0f} pt -> {SLICES} slices of {slice_h:.1f} pt")

OUT.mkdir(parents=True, exist_ok=True)
mat = pymupdf.Matrix(SCALE, SCALE)
total = 0
for i in range(SLICES):
    clip = pymupdf.Rect(0, i * slice_h, w, (i + 1) * slice_h)
    pix = page.get_pixmap(matrix=mat, clip=clip)
    img = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
    dest = OUT / f"slice-{i + 1:02d}.webp"
    img.save(dest, "WEBP", quality=QUALITY)
    kb = dest.stat().st_size / 1024
    total += kb
    print(f"  {dest.name}  {img.size[0]}x{img.size[1]}  {kb:6.0f} KB")
print(f"total {total / 1024:.2f} MB")

# fresh section anchors for the tab mapping
print("\nsection anchors (y -> slice):")
for x0, y0, x1, y1, text, *_ in sorted(page.get_text("blocks"), key=lambda b: b[1]):
    t = " ".join(text.split())
    if t:
        print(f"  y={y0:7.0f}  slice {int(y0 // slice_h):2d}  {t[:70]}")
