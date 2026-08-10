"""Generate Trionn-style depth maps for the Maple Studios eagle assets.

Feeds src/components/common/DepthParallax.tsx (the about-hero eagle).
Re-run only when an eagle image changes; commit the resulting *-depth.jpg.

Pipeline: Depth-Anything-V2-small (ONNX, CPU) -> normalize -> background
suppression (color-distance or alpha mask) -> heavy gaussian blur (the
smoothness is what makes the head move as one cohesive mass) -> mild curve.

Model (~99 MB, not committed) goes next to this script as depth_v2_small.onnx:
https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model.onnx
Deps: pip install onnxruntime numpy pillow
"""
import os

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ABOUT = os.path.normpath(os.path.join(HERE, "..", "public", "figma", "about"))
MODEL = os.path.join(HERE, "depth_v2_small.onnx")

sess = ort.InferenceSession(MODEL, providers=["CPUExecutionProvider"])
INP = sess.get_inputs()[0].name
MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


def estimate(rgb: Image.Image) -> np.ndarray:
    """Run DA-V2 on a PIL RGB image, return depth in [0,1] at native size."""
    w, h = rgb.size
    x = np.asarray(rgb.resize((518, 518), Image.BICUBIC), dtype=np.float32) / 255.0
    x = ((x - MEAN) / STD).transpose(2, 0, 1)[None]
    d = sess.run(None, {INP: x})[0].squeeze().astype(np.float32)
    d = (d - d.min()) / (d.max() - d.min() + 1e-8)
    return np.asarray(Image.fromarray((d * 65535).astype(np.uint16)).resize((w, h), Image.BICUBIC), dtype=np.float32) / 65535.0


def finish(d: np.ndarray, mask: np.ndarray, w: int, out_path: str, peak: float = 0.85):
    """Suppress bg, renormalize the subject range, curve, blur, save."""
    d = d * mask
    # renormalize so the subject occupies the full range before shaping
    hi = np.percentile(d[mask > 0.5], 99.5) if (mask > 0.5).any() else 1.0
    d = np.clip(d / max(hi, 1e-6), 0, 1)
    d = d ** 0.9 * peak
    img = Image.fromarray((d * 255).astype(np.uint8), "L")
    img = img.filter(ImageFilter.GaussianBlur(radius=w / 55))
    img.save(out_path, quality=90)
    print("wrote", out_path, "size", img.size)


# ——— eagle-front.webp: RGB with cream bg baked in ———
src = Image.open(ABOUT + r"\eagle-front.webp")
rgb = src.convert("RGB")
w, h = rgb.size
px = np.asarray(rgb, dtype=np.float32)
corner = px[2, 2]  # bg reference color
print("eagle-front corner bg:", corner)
dist = np.sqrt(((px - corner) ** 2).sum(-1))
mask = np.clip((dist - 18.0) / 30.0, 0, 1)  # 0 on bg, 1 on subject
mask = np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2)), dtype=np.float32) / 255.0
d = estimate(rgb)
print("front: bg depth mean", d[mask < 0.1].mean(), "subject depth mean", d[mask > 0.9].mean())
finish(d, mask, w, ABOUT + r"\eagle-front-depth.jpg")

# ——— eagle.webp: RGBA, mask straight from alpha ———
src2 = Image.open(ABOUT + r"\eagle.webp").convert("RGBA")
w2, h2 = src2.size
a = np.asarray(src2, dtype=np.float32)[:, :, 3] / 255.0
flat = Image.new("RGB", src2.size, (255, 243, 211))
flat.paste(src2, mask=src2.split()[3])
d2 = estimate(flat)
finish(d2, a, w2, ABOUT + r"\eagle-depth.jpg")

# ——— eagle-live.webp: the front-facing bald eagle (EagleLive.tsx). RGBA,
# alpha mask. NOTE: EagleLive's shader bakes this asset's eye geometry as
# GLSL consts — if the image changes, remeasure the iris centers/radii. ———
src3 = Image.open(ABOUT + r"\eagle-live.webp").convert("RGBA")
w3, h3 = src3.size
a3 = np.asarray(src3, dtype=np.float32)[:, :, 3] / 255.0
flat3 = Image.new("RGB", src3.size, (255, 243, 211))
flat3.paste(src3, mask=src3.split()[3])
d3 = estimate(flat3)
finish(d3, a3, w3, ABOUT + r"\eagle-live-depth.jpg")
