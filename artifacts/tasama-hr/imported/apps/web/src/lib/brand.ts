/**
 * Client skins (design/payroll-addendum.md §14). The skin follows the person's
 * employer: Tasama staff see Tasama, everyone inside a client sees that client.
 *
 * Only the primary colour family changes; status and chart colours, layout and
 * type stay the same. Each primary keeps the brand's hue and passes 4.5:1 for
 * white text in the light theme and against the dark background in the dark
 * theme. The colours approximate each brand; replace them here with official
 * values when Tasama has them. Logos are the files the demo letters use
 * (public/brands, sources in SOURCES.md), shown as published.
 */
export type Skin = {
  key: string;
  /** Tile behind the logo in the title bar. */
  tile: string;
  logo: string | null;
  /** HSL triplets, as the design system's tokens take them. */
  light: string;
  dark: string;
};

export const SKINS: Record<string, Skin> = {
  tasama: { key: 'tasama', tile: '#FFFFFF', logo: null, light: '244 92.7% 32.4%', dark: '245 85.2% 73.5%' },
  roshn: { key: 'roshn', tile: '#FFFFFF', logo: 'roshn-wordmark.png', light: '172 62% 24%', dark: '165 38% 66%' },
  riyadhair: { key: 'riyadhair', tile: '#FFFFFF', logo: 'riyadhair-wordmark.png', light: '266 62% 34%', dark: '266 75% 78%' },
  redsea: { key: 'redsea', tile: '#FFFFFF', logo: 'redsea-wordmark.png', light: '36 55% 30%', dark: '38 48% 62%' },
  seven: { key: 'seven', tile: '#FFFFFF', logo: 'seven-wordmark.png', light: '214 100% 24%', dark: '212 70% 72%' },
  saudicoffee: { key: 'saudicoffee', tile: '#FFFFFF', logo: 'saudicoffee-wordmark.png', light: '158 42% 25%', dark: '150 32% 64%' },
};

/** Tasama staff persona keys all start with "tasama". */
export const isTasamaPersona = (personaKey?: string | null) => !personaKey || personaKey.startsWith('tasama');

export const skinFor = (personaKey: string | null | undefined, clientKey: string | null | undefined): Skin =>
  isTasamaPersona(personaKey) ? SKINS.tasama : SKINS[clientKey ?? ''] ?? SKINS.tasama;

const lighter = (hsl: string, by: number) => hsl.replace(/(\d+(?:\.\d+)?)%$/, (_, l) => `${Math.min(92, Number(l) + by)}%`);

/** One stylesheet for every skin; html[data-skin] outranks the design system's :root and .dark. */
export function skinCss(): string {
  return Object.values(SKINS).filter((s) => s.key !== 'tasama').map((s) => {
    const block = (p: string, fg: string, sec: string) =>
      `--primary:${p};--primary-foreground:${fg};--secondary:${sec};--ring:${p};--sidebar-primary:${p};--sidebar-primary-foreground:${fg};--sidebar-ring:${p};`;
    return `html[data-skin="${s.key}"]{${block(s.light, '0 0% 100%', lighter(s.light, 10))}}`
      + `html.dark[data-skin="${s.key}"]{${block(s.dark, '228 19.2% 10.2%', lighter(s.dark, -10))}}`;
  }).join('\n');
}

let installed = false;
export function applySkin(skin: Skin) {
  if (typeof document === 'undefined') return;
  if (!installed) {
    const el = document.createElement('style');
    el.id = 'client-skins';
    el.textContent = skinCss();
    document.head.appendChild(el);
    installed = true;
  }
  document.documentElement.dataset.skin = skin.key;
}

export const logoUrl = (skin: Skin) => (skin.logo ? `${import.meta.env.BASE_URL}brands/${skin.logo}` : null);
