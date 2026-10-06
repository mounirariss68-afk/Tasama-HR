/* GENERATED FROM tokens.json -- DO NOT EDIT. Run scripts/build-tokens.mjs. */
// Portable design tokens (colors as hex). Web consumes the theme via
// src/index.css; mobile (Expo) and any other platform import this object so the
// whole product shares one source of truth.
export const tokens = {
  "color": {
    "light": {
      "background": "#F8F8FB",
      "foreground": "#0A1033",
      "border": "#DFE1EC",
      "card": "#FFFFFF",
      "cardForeground": "#0A1033",
      "popover": "#F1F2F8",
      "popoverForeground": "#0A1033",
      "primary": "#10069F",
      "primaryForeground": "#FFFFFF",
      "secondary": "#342BAD",
      "secondaryForeground": "#FFFFFF",
      "muted": "#F1F2F8",
      "mutedForeground": "#4B5170",
      "accent": "#806722",
      "accentForeground": "#FFFFFF",
      "destructive": "#B91C1C",
      "destructiveForeground": "#FFFFFF",
      "input": "#DFE1EC",
      "ring": "#10069F",
      "chart1": "#636ED4",
      "chart2": "#987423",
      "chart3": "#49A763",
      "chart4": "#874BA2",
      "chart5": "#B04921",
      "sidebar": "#FFFFFF",
      "sidebarForeground": "#0A1033",
      "sidebarBorder": "#DFE1EC",
      "sidebarPrimary": "#10069F",
      "sidebarPrimaryForeground": "#FFFFFF",
      "sidebarAccent": "#F1F2F8",
      "sidebarAccentForeground": "#0A1033",
      "sidebarRing": "#10069F"
    },
    "dark": {
      "background": "#15171F",
      "foreground": "#E9EBF3",
      "border": "#2E3240",
      "card": "#1C1F29",
      "cardForeground": "#E9EBF3",
      "popover": "#232633",
      "popoverForeground": "#E9EBF3",
      "primary": "#8B82F5",
      "primaryForeground": "#15171F",
      "secondary": "#6F63E6",
      "secondaryForeground": "#FFFFFF",
      "muted": "#232633",
      "mutedForeground": "#A3A8BC",
      "accent": "#D9C084",
      "accentForeground": "#1A1305",
      "destructive": "#F87171",
      "destructiveForeground": "#15171F",
      "input": "#2E3240",
      "ring": "#8B82F5",
      "chart1": "#7D8AE0",
      "chart2": "#B98D1C",
      "chart3": "#1FAE76",
      "chart4": "#9A66CB",
      "chart5": "#DB6134",
      "sidebar": "#1C1F29",
      "sidebarForeground": "#E9EBF3",
      "sidebarBorder": "#2E3240",
      "sidebarPrimary": "#8B82F5",
      "sidebarPrimaryForeground": "#15171F",
      "sidebarAccent": "#232633",
      "sidebarAccentForeground": "#E9EBF3",
      "sidebarRing": "#8B82F5"
    }
  },
  "fontFamily": {
    "sans": [
      "Inter",
      "Alexandria",
      "system-ui",
      "-apple-system",
      "sans-serif"
    ],
    "serif": [
      "Alexandria",
      "Inter",
      "system-ui",
      "sans-serif"
    ],
    "mono": [
      "ui-monospace",
      "SFMono-Regular",
      "Menlo",
      "monospace"
    ],
    "wordmark": [
      "Alexandria",
      "system-ui",
      "sans-serif"
    ]
  },
  "radius": "0.625rem",
  "spacing": "0.25rem",
  "brand": {
    "gradient": [
      "#10069F",
      "#342BAD",
      "#8B82F5",
      "#D9C084"
    ],
    "status": {
      "light": {
        "success": "#15803D",
        "warn": "#B45309",
        "danger": "#B91C1C"
      },
      "dark": {
        "success": "#4ADE80",
        "warn": "#FBBF24",
        "danger": "#F87171"
      }
    },
    "backdrop": {
      "light": {
        "deep": "#ECEDF4",
        "mid": "#F8F8FB",
        "hi": "#FFFFFF"
      },
      "dark": {
        "deep": "#111319",
        "mid": "#15171F",
        "hi": "#1C1F29"
      }
    },
    "hero": {
      "background": "#1B1F4A",
      "foreground": "#EEF0FA",
      "card": "#242960",
      "cardForeground": "#EEF0FA",
      "border": "#3A407A",
      "mutedForeground": "#AEB4D8",
      "primary": "#B59E5F",
      "primaryForeground": "#1B1F4A"
    }
  }
} as const;

export type Tokens = typeof tokens;
export default tokens;
