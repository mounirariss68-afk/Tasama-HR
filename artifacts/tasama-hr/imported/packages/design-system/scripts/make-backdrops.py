"""Tasama HR backdrops, quiet version.

The client asked for backgrounds that are quiet: not dark, not saturated, not
distracting. So this is close to a plain page: a clean near-white (light) or a
soft neutral charcoal with a faint navy tint (dark), a barely-there wash of
Tasama nimbus green / gold in the lower right, and three hairline arcs in
Tasama navy and violet at very low alpha, centred off-frame bottom-right.
Nothing crosses the reading column at more than a whisper.

Target: greyscale spread under ~20 overall and under ~12 mid-frame.
Deterministic.  python3 make-backdrops.py   (run from scripts/)
"""
import numpy as np
from PIL import Image, ImageFilter

W, H = 2560, 1440

PAPER = np.array([248, 248, 251], float)    # = color.light.background #F8F8FB
MIST = np.array([236, 237, 244], float)     # = brand.backdrop.light.deep #ECEDF4
NAVY = np.array([7, 16, 95], float)         # Tasama hero navy #07105F
VIOLET = np.array([52, 43, 173], float)     # Tasama panel violet #342BAD
GOLD = np.array([181, 158, 95], float)      # Tasama bilingual gold #B59E5F
NIMBUS = np.array([173, 220, 145], float)   # Tasama nimbus green #ADDC91
CHAR = np.array([21, 23, 31], float)        # = color.dark.background #15171F
CHAR_HI = np.array([28, 31, 41], float)     # = color.dark.card #1C1F29
VIOLET_DK = np.array([139, 130, 245], float)  # = color.dark.primary #8B82F5
GOLD_DK = np.array([217, 192, 132], float)    # = color.dark.accent #D9C084

YY, XX = np.mgrid[0:H, 0:W].astype(np.float32)
NX, NY = XX / W, YY / H
AX = XX / H
CX, CY = 1.92, 1.25  # arc centre, off-frame bottom-right


def blur(a, r):
    im = Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8), "L")
    return np.asarray(im.filter(ImageFilter.GaussianBlur(r)), np.float32) / 255.0


def hairline(R, width=0.0022):
    d = np.abs(np.sqrt((AX - CX) ** 2 + (NY - CY) ** 2) - R)
    return np.exp(-(d / width) ** 2).astype(np.float32)


def soft(cx, cy, sx, sy):
    return np.exp(-(((NX - cx) / sx) ** 2 + ((NY - cy) / sy) ** 2)).astype(np.float32)


def mix(rgb, col, a):
    a = a[..., None]
    return rgb * (1 - a) + col * a


def save(rgb, path):
    Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), "RGB").save(path, "WEBP", quality=90, method=6)
    g = np.asarray(Image.open(path).convert("L"), float)
    mid = g[H // 3: 2 * H // 3, W // 4: 3 * W // 4]
    print(f"{path}: spread {np.percentile(g,99.5)-np.percentile(g,0.5):.0f}  "
          f"mid-frame {np.percentile(mid,99.5)-np.percentile(mid,0.5):.0f}  mean {g.mean():.0f}")


# Light: clean near-white, a cool mist in the lower right, a breath of nimbus
# green and gold, three navy/violet hairlines.
rgb = np.broadcast_to(PAPER, (H, W, 3)).astype(np.float32).copy()
rgb = mix(rgb, MIST, soft(0.95, 1.0, 0.55, 0.55) * 0.6)
rgb = mix(rgb, NIMBUS, soft(1.05, 1.05, 0.30, 0.35) * 0.06)
rgb = mix(rgb, GOLD, soft(0.80, 1.10, 0.25, 0.25) * 0.03)
rgb = mix(rgb, np.array([255.0, 255.0, 255.0]), soft(0.15, 0.0, 0.6, 0.5) * 0.5)
for R, col, k in [(0.78, NAVY, 0.07), (1.02, VIOLET, 0.06), (1.30, NAVY, 0.04)]:
    rgb = mix(rgb, col, blur(hairline(R), 1.2) * k)
save(rgb, "../public/brand/light-backdrop.webp")

# Dark: soft charcoal, slightly lifted in the lower right, a faint nimbus wash,
# three faint violet/gold hairlines.
rgb = np.broadcast_to(CHAR, (H, W, 3)).astype(np.float32).copy()
rgb = mix(rgb, CHAR_HI, soft(0.95, 1.0, 0.6, 0.6) * 0.9)
rgb = mix(rgb, NIMBUS, soft(1.0, 1.05, 0.28, 0.32) * 0.025)
for R, col, k in [(0.78, VIOLET_DK, 0.08), (1.02, GOLD_DK, 0.06), (1.30, VIOLET_DK, 0.05)]:
    rgb = mix(rgb, col, blur(hairline(R), 1.2) * k)
save(rgb, "../public/brand/dark-backdrop.webp")
