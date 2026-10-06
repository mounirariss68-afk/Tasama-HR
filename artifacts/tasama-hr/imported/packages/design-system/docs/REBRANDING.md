# Rebranding an app for a client

One app, one client, one palette. A rebrand changes **four things and nothing
else**: the logo assets, the color tokens, the two backdrops, and the app's
name. Layout, spacing, radii, type scale, glass alphas, component behaviour and
every other structural decision stay identical across every app — that
sameness is the point of the system.

## What may change

| Changes per client | Never changes |
| --- | --- |
| `public/brand/*` — logos, mark, favicon, backdrop art | `src/components/**` structure and behaviour |
| `color.light` / `color.dark` in `tokens.json` | `radius`, `spacing`, the type scale |
| `brand.*` in `tokens.json` | glass alphas, blur radii, shadows, easing |
| `typography.fontFamily` when the client mandates a typeface | the layout in `docs/LAYOUT.md` |
| the product name and `<title>` | anything in `src/index.css` (it is generated) |

Everything in the left column lives in `tokens.json` or `public/brand/`. If a
rebrand makes you reach for a component file or a stylesheet, stop — the value
you need should have been a token, so add it to the brand block instead.

## Inputs

Ask the client (or Mounir) for two things:

1. **The logo** — vector if possible (SVG/AI/PDF), otherwise the largest PNG
   with transparency. Ideally three forms: full lockup for dark surfaces, full
   lockup for light surfaces, and the glyph-only mark.
2. **The website URL** — the live brand in use, which is where the real palette
   lives.

## Procedure

### 1. Extract the palette

From the **website** (the authority — it shows the colors in production use):
fetch the homepage and one interior page, and pull the values actually used for
the primary button/CTA fill, link color, header/footer background, body
background, body text, muted text, and borders. A rendered screenshot plus the
stylesheet together beat either alone; CSS custom properties on `:root` are
often the client's own token names and are worth reading directly.

From the **logo**: sample its distinct hues and rank them by ink area. The
dominant hue is usually the brand primary; a strong secondary hue becomes
`secondary`; a small high-saturation accent becomes `accent`.

Reconcile the two. Where they disagree, the website wins for UI roles and the
logo wins for the gradient and the hero island. Record where each value came
from — you will want that when the client asks.

### 2. Fill the token sets

`color.light` and `color.dark` — map the extracted palette onto the roles:

- `primary` — the client's main brand color. Deepen it for `color.light` until
  white text on it clears **4.5:1**; lighten it for `color.dark` until it
  clears 4.5:1 against the dark background.
- `secondary`, `accent` — supporting brand hues. `accent` should differ from
  `primary` in hue, not merely in lightness.
- `background` / `foreground` — the client's page background and body ink.
  Light backgrounds stay near-white with a hint of the brand hue; dark
  backgrounds stay deep and desaturated enough for glass to read over.
- `card`, `popover`, `muted`, `border`, `input` — derived neutrals. Keep their
  relationship to `background` the same as the shipped defaults: card slightly
  lifted, muted slightly recessed, border visible but quiet.
- `chart1`–`chart5` — five hues that stay distinguishable side by side and in
  both themes. Start from the gradient stops and add one clearly different hue.
- `destructive` — red. Do not brand this.
- The `sidebar*` set mirrors the core roles; keep them consistent.

`brand.gradient` — four stops of the signature accent gradient, ordered
left to right. Derive them from the logo; `stop3` should be `color.dark.primary`
or very close to it. If the logo has fewer than four hues, interpolate between
what it has rather than inventing an unrelated color.

`brand.hero` — the dark island. Take the client's deepest brand surface as
`background`, then build `card` one step lighter, `border` lighter again,
`foreground` near-white and `mutedForeground` a desaturated mid-tone. `primary`
here is the version of the brand color that reads on that deep surface.

`brand.status` — keep success green, warning amber, danger red in both themes,
whatever the client palette is. Status is not brand.

`brand.backdrop` — three stops for the fixed 160° gradient, per theme. Light
runs from a faintly brand-tinted off-white to white; dark runs from the
client's deepest surface to a lifted version of it. These also show while the
wallpaper art loads, so they must already look right on their own.

### 3. Produce the two backdrops

The light and dark wallpapers go at `public/brand/light-backdrop.webp` and
`public/brand/dark-backdrop.webp`, referenced only through `brand.backdropArt`.

**Backdrop contrast is the fuel for the whole visual language.** Glass has
nothing to refract over a flat wash: the panels stop reading as glass and
become plain cards, and the three-level depth scale collapses into one. A timid
backdrop does not make the app safer — it makes it look unfinished.

So: confident, large-scale form with real luminance range — flowing ribbons
with lit edges, a sweeping wave, filaments of the accent cutting across, a
drift of particles. Built from the client's palette and, where the logo has
one, its geometry. As a rough calibration, artwork that works here carries a
greyscale luminance spread in the **150–220** range across the image, including
the middle of the frame. Below about 60 there is nothing for the glass to do.

What keeps it legible is not flatness, it is the glass stack:

- content sits on L1/L2 surfaces carrying real fill (`--glass-l1-alpha`,
  `--glass-l2-alpha`) plus 8–20px of blur, which turns a busy backdrop into a
  soft field of colour behind text;
- the pinned bars sit at chrome level (`--glass-chrome-alpha`), higher again,
  because the page scrolls under them;
- if a region still reads badly, raise the fill for that level, or lower
  `brand.backdropArtOpacity` for that theme — never flatten the artwork.

Nothing in it should read as a photograph or a literal picture of something.

**Verify rather than eyeball.** `npm run legibility` loads the running app,
hides all text to photograph what is composited underneath, and reports the
worst pixel under each text block in both themes. Every block should clear
4.5:1. That check, not a quiet backdrop, is what makes a bold one safe.

Shipping the gradient alone (both `brand.backdropArt` values `none`) is a
deliberate minimal choice, not the default.

### 4. Replace the assets

| Path | What |
| --- | --- |
| `public/brand/logo-on-dark.png` | full lockup, light ink |
| `public/brand/logo-on-light.png` | full lockup, dark ink |
| `public/brand/mark.png` | glyph only, square-ish, transparent |
| `public/brand/favicon.svg` | copied over `public/favicon.svg` by the token build |
| `public/brand/light-backdrop.webp`, `dark-backdrop.webp` | the wallpapers |

Keep the filenames. No component references a client name, so a rebrand touches
no code. Never redraw, recolor or regenerate a client's logo — use the files
they supplied.

### 5. Rebuild and verify

```bash
npm run tokens      # regenerates src/index.css + src/generated/tokens.tsx
npm run contrast    # every text pair, both themes + the hero island
npm run typecheck
npm run build
npm run legibility  # text vs what is ACTUALLY painted behind it (app running)
```

`npm run contrast` exits non-zero when a text pair misses its threshold; fix
the palette rather than shipping it. Then check by eye, in **both** themes:
- The title bar, a card, the hero and the chat rail all read correctly over
  the new backdrop art — glass is translucent, so a busy wallpaper shows
  through as noise behind text.
- The gradient divider, the accent pill and the mono chips still read as the
  client's brand rather than as leftovers of the previous one.
- Nothing in `src/index.css` was hand-edited. It is generated; the diff should
  show only values that trace back to `tokens.json`.

Run the app's own preview (`npm run dev`) and look at the Brand, Glass
patterns and Default page layout pages before calling a rebrand done.

## What to hand back

A short note recording, per token role, where the value came from (website
element or logo hue), the contrast results, and anything you had to deviate on
— a client whose brand color fails contrast on white gets a deepened `primary`
in light mode, and they should hear that from you rather than notice it later.
