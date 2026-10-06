/**
 * Generates the consumable web theme (src/index.css) and the portable token
 * object (src/generated/tokens.tsx) from tokens.json.
 *
 * tokens.json (DTCG) is the single source of truth. This runs on dev start and
 * on every tokens.json change (see vite.config.ts) and before build/typecheck
 * (see package.json). Do not edit the generated files by hand.
 *
 * - src/index.css        the design system's theme. The preview app imports it,
 *                        and consuming apps import this same file (web).
 * - src/generated/tokens.tsx  hex token object for mobile (Expo) and any other
 *                             platform, so web + mobile share one source.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const tokensPath = join(root, "tokens.json");
const templatePath = join(here, "theme-template.css");
const cssOut = join(root, "src", "index.css");
const tsOutDir = join(root, "src", "generated");
const indexHtmlPath = join(root, "index.html");
const faviconOut = join(root, "public", "favicon.svg");

/** Resolve a DTCG node's $value, following {alias} references. */
function resolveValue(node, tokens) {
  const raw = node?.$value;
  if (typeof raw === "string" && raw.startsWith("{") && raw.endsWith("}")) {
    const path = raw.slice(1, -1).split(".");
    let cur = tokens;
    for (const key of path) cur = cur?.[key];
    return resolveValue(cur, tokens);
  }
  return raw;
}

function hexToHslChannels(hex) {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let s = 0;
  let hue = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        hue = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        hue = (b - r) / d + 2;
        break;
      default:
        hue = (r - g) / d + 4;
    }
    hue /= 6;
  }
  const H = Math.round(hue * 360);
  const S = Math.round(s * 1000) / 10;
  const L = Math.round(l * 1000) / 10;
  return `${H} ${S}% ${L}%`;
}

function toFontStack(value) {
  return Array.isArray(value) ? value.join(", ") : value;
}

function normalizeHex(hex) {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  return `#${h}`;
}

/** Pick black or white text for best contrast on the given background hex. */
function contrastColor(hex) {
  const h = normalizeHex(hex).slice(1);
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return luminance > 0.5 ? "#000000" : "#ffffff";
}

/** First alphanumeric character of the design system's title, uppercased. */
function faviconLetter() {
  let title = "";
  try {
    const html = readFileSync(indexHtmlPath, "utf8");
    title = html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? "";
  } catch {
    title = "";
  }
  const match = title.match(/[A-Za-z0-9]/);
  return (match?.[0] ?? "D").toUpperCase();
}

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function buildFavicon(tokens) {
  const primary = normalizeHex(resolveValue(tokens.color.light.primary, tokens));
  const letter = escapeXml(faviconLetter());
  const fg = contrastColor(primary);
  return `<svg width="180" height="180" viewBox="0 0 180 180" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="180" height="180" rx="36" fill="${primary}"/>
  <text x="90" y="92" fill="${fg}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="104" font-weight="700" text-anchor="middle" dominant-baseline="central">${letter}</text>
</svg>
`;
}

function colorEntries(scope, tokens) {
  const out = {};
  for (const [name, node] of Object.entries(tokens.color[scope])) {
    if (name.startsWith("$")) continue;
    out[name] = resolveValue(node, tokens);
  }
  return out;
}

function statusEntries(scope, tokens) {
  const out = {};
  for (const name of ["success", "warn", "danger"]) {
    out[name] = resolveValue(tokens.brand?.status?.[scope]?.[name], tokens);
  }
  return out;
}

function backdropEntries(scope, tokens) {
  const out = {};
  for (const name of ["deep", "mid", "hi"]) {
    out[name] = resolveValue(tokens.brand?.backdrop?.[scope]?.[name], tokens);
  }
  return out;
}

function heroEntries(tokens) {
  const out = {};
  for (const [name, node] of Object.entries(tokens.brand?.hero ?? {})) {
    if (name.startsWith("$")) continue;
    out[name] = resolveValue(node, tokens);
  }
  return out;
}

function buildCss(tokens) {
  let css = readFileSync(templatePath, "utf8");
  const replacements = {};

  for (const scope of ["light", "dark"]) {
    for (const [name, hex] of Object.entries(colorEntries(scope, tokens))) {
      replacements[`__DS_${scope.toUpperCase()}_${name.toUpperCase()}__`] =
        hexToHslChannels(hex);
    }
  }

  replacements.__DS_FONT_SANS__ = toFontStack(
    resolveValue(tokens.typography.fontFamily.sans, tokens),
  );
  replacements.__DS_FONT_SERIF__ = toFontStack(
    resolveValue(tokens.typography.fontFamily.serif, tokens),
  );
  replacements.__DS_FONT_MONO__ = toFontStack(
    resolveValue(tokens.typography.fontFamily.mono, tokens),
  );
  replacements.__DS_RADIUS__ = resolveValue(tokens.radius.base, tokens);
  replacements.__DS_SPACING__ = resolveValue(tokens.spacing.base, tokens);
  replacements.__DS_FONT_WORDMARK__ = toFontStack(
    resolveValue(tokens.typography.fontFamily.wordmark, tokens),
  );

  // ---- Brand layer -------------------------------------------------------
  // Everything a client rebrand touches beyond the core color sets. Emitted as
  // hex (gradient/status/backdrop) or HSL channels (hero island, which
  // re-declares core tokens and must stay in the `hsl(var(--x))` form).
  const brand = tokens.brand ?? {};
  for (const stop of ["stop1", "stop2", "stop3", "stop4"]) {
    replacements[`__DS_BRAND_GRADIENT_${stop.toUpperCase()}__`] = normalizeHex(
      resolveValue(brand.gradient?.[stop], tokens),
    );
  }
  for (const scope of ["light", "dark"]) {
    for (const name of ["success", "warn", "danger"]) {
      replacements[`__DS_BRAND_STATUS_${scope.toUpperCase()}_${name.toUpperCase()}__`] =
        normalizeHex(resolveValue(brand.status?.[scope]?.[name], tokens));
    }
    for (const name of ["deep", "mid", "hi"]) {
      replacements[`__DS_BRAND_BACKDROP_${scope.toUpperCase()}_${name.toUpperCase()}__`] =
        normalizeHex(resolveValue(brand.backdrop?.[scope]?.[name], tokens));
    }
    replacements[`__DS_BRAND_BACKDROPART_${scope.toUpperCase()}__`] = resolveValue(
      brand.backdropArt?.[scope],
      tokens,
    );
    replacements[`__DS_BRAND_BACKDROPARTOPACITY_${scope.toUpperCase()}__`] = String(
      resolveValue(brand.backdropArtOpacity?.[scope], tokens),
    );
  }
  // ---- Highlight ---------------------------------------------------------
  // Optional. A client whose brand has a highlight/call-to-action colour
  // declares it here; one that does not falls back to the accent, so an older
  // tokens.json keeps building unchanged.
  const highlight = brand.highlight ?? {};
  const accentLight = resolveValue(tokens.color?.light?.accent, tokens);
  const accentDark = resolveValue(tokens.color?.dark?.accent, tokens);
  replacements.__DS_BRAND_HIGHLIGHT_WASH__ = normalizeHex(
    resolveValue(highlight.wash, tokens) ?? accentLight,
  );
  replacements.__DS_BRAND_HIGHLIGHT_LIGHT__ = normalizeHex(
    resolveValue(highlight.light, tokens) ?? accentLight,
  );
  replacements.__DS_BRAND_HIGHLIGHT_DARK__ = normalizeHex(
    resolveValue(highlight.dark, tokens) ?? accentDark,
  );

  for (const name of [
    "background",
    "foreground",
    "card",
    "cardForeground",
    "border",
    "mutedForeground",
    "primary",
    "primaryForeground",
  ]) {
    replacements[`__DS_BRAND_HERO_${name.toUpperCase()}__`] = hexToHslChannels(
      resolveValue(brand.hero?.[name], tokens),
    );
  }

  for (const [token, value] of Object.entries(replacements)) {
    if (value === undefined || value === "undefined" || value === "") {
      throw new Error(`tokens.json is missing a value for ${token}`);
    }
    css = css.split(token).join(value);
  }

  const leftover = css.match(/__DS_[A-Z0-9_]+__/g);
  if (leftover) {
    throw new Error(
      `tokens.json is missing values for: ${[...new Set(leftover)].join(", ")}`,
    );
  }
  return css;
}

function buildTs(tokens) {
  const portable = {
    color: {
      light: colorEntries("light", tokens),
      dark: colorEntries("dark", tokens),
    },
    fontFamily: {
      sans: resolveValue(tokens.typography.fontFamily.sans, tokens),
      serif: resolveValue(tokens.typography.fontFamily.serif, tokens),
      mono: resolveValue(tokens.typography.fontFamily.mono, tokens),
      wordmark: resolveValue(tokens.typography.fontFamily.wordmark, tokens),
    },
    radius: resolveValue(tokens.radius.base, tokens),
    spacing: resolveValue(tokens.spacing.base, tokens),
    // Native (Expo) has no CSS custom properties, so the brand layer ships in
    // the portable object too — gradient stops, status hues, backdrop stops and
    // the hero island are all consumed directly by React Native styles.
    brand: {
      gradient: ["stop1", "stop2", "stop3", "stop4"].map((s) =>
        resolveValue(tokens.brand?.gradient?.[s], tokens),
      ),
      status: {
        light: statusEntries("light", tokens),
        dark: statusEntries("dark", tokens),
      },
      backdrop: {
        light: backdropEntries("light", tokens),
        dark: backdropEntries("dark", tokens),
      },
      hero: heroEntries(tokens),
    },
  };
  return `/* GENERATED FROM tokens.json -- DO NOT EDIT. Run scripts/build-tokens.mjs. */
// Portable design tokens (colors as hex). Web consumes the theme via
// src/index.css; mobile (Expo) and any other platform import this object so the
// whole product shares one source of truth.
export const tokens = ${JSON.stringify(portable, null, 2)} as const;

export type Tokens = typeof tokens;
export default tokens;
`;
}

/** Committed brand favicons, in priority order. The first one that exists wins
 * and is copied over the token-generated placeholder, so `pnpm tokens` and
 * prebuild never revert a real brand icon. A client rebrand drops its own icon
 * at public/brand/favicon.svg. */
const brandFaviconCandidates = [
  join(root, "public", "brand", "favicon.svg"),
  join(root, "docs", "references", "logos", "cognirise-favicon.svg"),
];

export function buildTokens() {
  const tokens = JSON.parse(readFileSync(tokensPath, "utf8"));
  writeFileSync(cssOut, buildCss(tokens));
  mkdirSync(tsOutDir, { recursive: true });
  writeFileSync(join(tsOutDir, "tokens.tsx"), buildTs(tokens));
  mkdirSync(dirname(faviconOut), { recursive: true });
  // Write the token-generated favicon first, then immediately overwrite it
  // with the committed Cognirise brand favicon if one exists. This ensures
  // `pnpm tokens` and prebuild never revert the real brand icon.
  writeFileSync(faviconOut, buildFavicon(tokens));
  const brandFavicon = brandFaviconCandidates.find((candidate) =>
    existsSync(candidate),
  );
  if (brandFavicon) {
    copyFileSync(brandFavicon, faviconOut);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildTokens();
  process.stdout.write(
    "Generated src/index.css, src/generated/tokens.tsx, and public/favicon.svg\n",
  );
}
