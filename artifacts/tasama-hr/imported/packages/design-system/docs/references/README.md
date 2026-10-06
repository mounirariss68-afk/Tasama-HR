# Retained Cognirise brand assets

Everything here is retained verbatim from the Atelier employee portal. Do not
redraw, recolor, or regenerate these files.

These are the **reference** copies — Cognirise's own brand. The assets an app
actually renders live at fixed paths under `public/brand/`, which is what a
client rebrand replaces (see `docs/REBRANDING.md`). This folder is where the
Cognirise originals stay so they can be restored.

| `public/brand/` path | Cognirise original here |
| --- | --- |
| `logo-on-dark.png` | `logos/cognirise-logo.png` |
| `logo-on-light.png` | `logos/cognirise-logo-light.png` |
| `mark.png` | `logos/cognirise-mark.png` |
| `favicon.svg` | `logos/cognirise-favicon.svg` |
| `light-backdrop.webp` | `light-bg-wave.webp` |
| `dark-backdrop.webp` | `dark-bg.webp` |

## Logos & marks (`logos/`)

| File | Use |
| --- | --- |
| `cognirise-logo.png` | Full lockup, light wordmark — for navy/dark surfaces (top nav, hero). |
| `cognirise-logo-light.png` | Full lockup, navy ink — for light/white surfaces (reports, print, exports). |
| `cognirise-mark.png` | Gradient "C" glyph only — reads on any background (favicons, avatars, sign-in). |
| `cognirise-favicon.svg` | The shipped favicon: the mark on a navy rounded square (SVG wrapping an embedded PNG — image-only, safe). |
| `cognirise-favicon.png` | PNG favicon fallback. |

Note: the token build regenerates `public/favicon.svg` from tokens, then
copies `public/brand/favicon.svg` over it automatically, so the real icon
survives every build.

## Backdrop artwork & imagery

| File | Use |
| --- | --- |
| `dark-bg.webp` | Dark-theme wallpaper: navy network waves. |
| `light-bg-wave.webp` | Light-theme wallpaper: pale blue→magenta→coral wave. |
| `opengraph.jpg` | Social-share (OG) image reference. |
| `riser-avatar.png` | "Riser" assistant avatar used in chat/prep-card surfaces. |

## Backdrop layering pattern

Atelier paints its backdrop once, fixed, behind everything (bottom → top):

1. `body::before` — fixed 160° gradient (`--backdrop-deep → mid → hi`), the
   color fallback while artwork loads. Provided as `.cog-backdrop` on `<body>`.
2. Wallpaper layer — a fixed, pointer-events-none div. Provided as
   `.cog-backdrop-art` and rendered by `<AppBackdrop />`; the image and its
   opacity come from `brand.backdropArt` / `brand.backdropArtOpacity` and swap
   with the theme, so no app names an asset.
3. Content — glass surfaces (`Card`, `.glass-panel`, `.page-hero`) blur over
   the layers below. Fixed pseudo-elements are used instead of
   `background-attachment: fixed` (broken/slow on iOS Safari).

The `--glass-*-alpha` knobs in `scripts/theme-template.css` control how much
fill each surface carries per theme; reduced-transparency and
no-backdrop-filter fallbacks re-opaque everything automatically.
