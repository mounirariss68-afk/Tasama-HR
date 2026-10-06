/**
 * Contrast audit for tokens.json. Run after every rebrand:
 *
 *   node scripts/check-contrast.mjs        (or: npm run contrast)
 *
 * Checks the pairs that actually carry text in this design system, in both
 * themes plus the hero dark island, against WCAG 2.1 AA (4.5:1 for body text,
 * 3:1 for large text and accent marks). Exits non-zero when a text pair misses
 * its threshold. Pairs between 3:1 and 4.5:1 are reported as accent-only: fine
 * for icons and large headings, not for body copy.
 *
 * Decorative hairlines (`border`, `input`) are deliberately quiet in this
 * system and are not checked — they carry no information on their own. If a
 * border is the ONLY thing identifying a control in your UI, that control
 * needs a visible label or fill, not a darker hairline.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tokens = JSON.parse(readFileSync(join(root, "tokens.json"), "utf8"));

function channel(c) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const value = (group, name) => group[name].$value;

const pairs = [];
for (const scope of ["light", "dark"]) {
  const c = tokens.color[scope];
  pairs.push(
    [`${scope}: foreground on background`, value(c, "foreground"), value(c, "background"), "body"],
    [`${scope}: cardForeground on card`, value(c, "cardForeground"), value(c, "card"), "body"],
    [`${scope}: mutedForeground on background`, value(c, "mutedForeground"), value(c, "background"), "body"],
    [`${scope}: mutedForeground on muted`, value(c, "mutedForeground"), value(c, "muted"), "body"],
    [`${scope}: primaryForeground on primary`, value(c, "primaryForeground"), value(c, "primary"), "body"],
    [`${scope}: secondaryForeground on secondary`, value(c, "secondaryForeground"), value(c, "secondary"), "body"],
    [`${scope}: accentForeground on accent`, value(c, "accentForeground"), value(c, "accent"), "body"],
    [`${scope}: destructiveForeground on destructive`, value(c, "destructiveForeground"), value(c, "destructive"), "body"],
    [`${scope}: primary on background`, value(c, "primary"), value(c, "background"), "accent"],
    [`${scope}: primary on card`, value(c, "primary"), value(c, "card"), "accent"],
  );
}
const hero = tokens.brand.hero;
pairs.push(
  ["hero: foreground on background", value(hero, "foreground"), value(hero, "background"), "body"],
  ["hero: mutedForeground on background", value(hero, "mutedForeground"), value(hero, "background"), "body"],
  ["hero: primaryForeground on primary", value(hero, "primaryForeground"), value(hero, "primary"), "body"],
  ["hero: primary on background", value(hero, "primary"), value(hero, "background"), "accent"],
  ...(tokens.brand.highlight
    ? [
        // The highlight is a client colour, so it is checked like any other:
        // the ink against both surfaces it will actually sit on, per theme.
        ["highlight: ink on light background", value(tokens.brand.highlight, "light"), value(tokens.color.light, "background"), "body"],
        ["highlight: ink on light card", value(tokens.brand.highlight, "light"), value(tokens.color.light, "card"), "body"],
        ["highlight: ink on dark background", value(tokens.brand.highlight, "dark"), value(tokens.color.dark, "background"), "body"],
        ["highlight: ink on dark card", value(tokens.brand.highlight, "dark"), value(tokens.color.dark, "card"), "body"],
      ]
    : []),
);

let failures = 0;
let belowBody = 0;
const lines = pairs.map(([label, a, b, kind]) => {
  const r = ratio(a, b);
  let verdict;
  if (r < 3) {
    verdict = "FAIL";
    failures += 1;
  } else if (r < 4.5) {
    verdict = kind === "body" ? "FAIL for body text" : "accent only";
    if (kind === "body") failures += 1;
    else belowBody += 1;
  } else {
    verdict = "AA";
  }
  return `${label.padEnd(48)}${r.toFixed(2).padStart(6)}  ${verdict}`;
});

process.stdout.write(
  `${"pair".padEnd(48)}${"ratio".padStart(6)}  verdict\n${"-".repeat(70)}\n${lines.join("\n")}\n\n`,
);

if (failures > 0) {
  process.stdout.write(
    `${failures} pair(s) below the threshold for their use. Adjust tokens.json — do not ship this palette.\n`,
  );
  process.exit(1);
}
process.stdout.write(
  `All pairs pass${belowBody ? ` (${belowBody} accent pair(s) between 3:1 and 4.5:1 — fine for borders, icons and large headings, not for body copy)` : ""}.\n`,
);
