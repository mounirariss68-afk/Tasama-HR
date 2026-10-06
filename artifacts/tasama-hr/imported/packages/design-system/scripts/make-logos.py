"""Tasama brand assets for the Atelier rebrand.

Inputs are the client's own files, pulled from tasama.com.sa:
  logo.png    the full lockup — TASAMA wordmark in #10069F over the bilingual
              "Business Services / تسامى لخدمات الأعمال" line in #B59E5F
  t-svg.svg   the repeating "T" mark tile, #9DCA80 outlines

Outputs (Atelier's fixed filenames):
  logo-on-light.png   the supplied lockup, untouched
  logo-on-dark.png    the same lockup with the ultramarine ink lifted to white
                      so it survives the dark theme and the hero island
  mark.png            the "T" glyph knocked out of a brand-blue rounded tile
  favicon.svg         the same tile as vector
"""
import re
import numpy as np
from PIL import Image, ImageDraw

ULTRA = (16, 6, 159)
GOLD = (181, 158, 95)

# ---------------------------------------------------------------- lockups
src = Image.open("logo.png").convert("RGBA")
src.save("logo-on-light.png")

a = np.asarray(src).astype(np.float32)
rgb, alpha = a[..., :3], a[..., 3]

# The wordmark ink is the only strongly blue, strongly dark region. Select it by
# distance from the brand ultramarine rather than by a channel threshold, so the
# antialiased edges ramp instead of stepping.
d = np.linalg.norm(rgb - np.array(ULTRA, np.float32), axis=-1)
blue = np.clip(1.0 - d / 210.0, 0, 1) ** 0.8

out = rgb * (1 - blue[..., None]) + np.array([255.0, 255.0, 255.0]) * blue[..., None]
# Lift the gold subline a little too — #B59E5F on near-black is legible but
# flat, and the lockup should read as one object.
gd = np.linalg.norm(rgb - np.array(GOLD, np.float32), axis=-1)
gold = np.clip(1.0 - gd / 120.0, 0, 1)
out = out * (1 - (gold * 0.45)[..., None]) + np.array([214.0, 191.0, 132.0]) * (gold * 0.45)[..., None]

Image.fromarray(
    np.concatenate([np.clip(out, 0, 255), alpha[..., None]], -1).astype(np.uint8), "RGBA"
).save("logo-on-dark.png")

# ------------------------------------------------------------------- mark
# The two filled shapes of one tile of t-svg.svg: the top-left bar, and the
# stem that curves in from the top right. Read straight out of the client file.
svg = open("t-svg.svg").read()
paths = re.findall(r'<path d="(M0\.25 63\.4254[^"]*)"', svg) + re.findall(
    r'<path d="(M211\.507 63\.3942[^"]*)"', svg
)
assert len(paths) == 2, paths

TILE = 512
PAD = 96
SCALE = (TILE - 2 * PAD) / 359.0


def tile_svg(fg: str, bg: str) -> str:
    body = "\n".join(
        f'    <path d="{p}" fill="{fg}"/>' for p in paths
    )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {TILE} {TILE}" '
        f'width="{TILE}" height="{TILE}">\n'
        f'  <rect width="{TILE}" height="{TILE}" rx="112" fill="{bg}"/>\n'
        f'  <g transform="translate({PAD} {PAD + 22}) scale({SCALE:.6f})">\n'
        f"{body}\n"
        f"  </g>\n"
        f"</svg>\n"
    )


open("favicon.svg", "w").write(tile_svg("#FFFFFF", "#10069F"))

# A raster mark for <BrandMark>. Rasterising the SVG needs cairosvg, which may
# not be present — draw the same two shapes with PIL instead. Both are straight
# edges plus one quarter-round, so they are exact, not an approximation.
m = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
d = ImageDraw.Draw(m)
d.rounded_rectangle([0, 0, TILE - 1, TILE - 1], radius=112, fill=ULTRA + (255,))

S = 4  # supersample the glyph, then downscale — PIL has no vector AA
g = Image.new("L", (TILE * S, TILE * S), 0)
gd = ImageDraw.Draw(g)
ox, oy, k = PAD * S, (PAD + 22) * S, SCALE * S


def X(v):
    return ox + v * k


def Y(v):
    return oy + v * k


# bar: 0,0 → 147.157, 63.4254
gd.rectangle([X(0), Y(0), X(147.157), Y(63.4254)], fill=255)
# stem: vertical leg from the bar down to the baseline
gd.rectangle([X(147.617), Y(136.915), X(211.507), Y(318.039)], fill=255)
# shoulder: the top-right bar, and the quarter-round joining it to the stem
gd.rectangle([X(211.507), Y(0.3), X(358.751), Y(63.4)], fill=255)
r = 285.384 - 147.617  # the curve's radius in glyph units
gd.pieslice(
    [X(147.617), Y(0.3), X(147.617 + 2 * r), Y(0.3 + 2 * r)], 180, 270, fill=255
)
gd.pieslice(
    [
        X(211.507),
        Y(63.4),
        X(211.507 + 2 * (r - 63.89)),
        Y(63.4 + 2 * (r - 63.89)),
    ],
    180,
    270,
    fill=0,
)

glyph = g.resize((TILE, TILE), Image.LANCZOS)
white = Image.new("RGBA", (TILE, TILE), (255, 255, 255, 255))
m.paste(white, (0, 0), glyph)
m.save("mark.png")

for f in ("logo-on-light.png", "logo-on-dark.png", "mark.png"):
    im = Image.open(f)
    print(f, im.size, im.mode)
print("favicon.svg", len(open("favicon.svg").read()), "bytes")
