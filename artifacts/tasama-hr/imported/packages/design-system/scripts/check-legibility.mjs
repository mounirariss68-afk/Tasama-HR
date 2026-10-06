/**
 * Rendered-legibility audit.
 *
 *   node scripts/check-legibility.mjs [url]     (or: npm run legibility)
 *
 * `check-contrast.mjs` verifies TOKEN PAIRS. That is necessary but not
 * sufficient once the backdrop carries real artwork: what a person actually
 * reads is text against the pixels composited behind it — glass fill, blur,
 * and whatever the wallpaper is doing at that spot. A palette can pass every
 * token pair and still have a headline sitting on a bright ribbon.
 *
 * This loads the running app, records where each kind of text sits, hides all
 * text to photograph the surface underneath, and reports the WORST pixel under
 * each text block in both themes. Run it against a dev or preview server after
 * changing the backdrops or the glass alphas.
 *
 * Requires `playwright` and `pngjs` (dev-only; install them when you need this).
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const URL = process.argv[2] ?? 'http://localhost:4610/';
let failures = 0;
const b = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
);

function lin(c){c/=255;return c<=0.03928?c/12.92:((c+0.055)/1.055)**2.4;}
function lum(r,g,bb){return 0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(bb);}
function ratio(a,c){const hi=Math.max(a,c),lo=Math.min(a,c);return (hi+0.05)/(lo+0.05);}

for (const theme of ['light','dark']) {
  const ctx = await b.newContext({ viewport:{width:1760,height:1180} });
  await ctx.addInitScript(([t])=>localStorage.setItem('atelier-theme',t),[theme]);
  const p = await ctx.newPage();
  await p.goto(URL,{waitUntil:'networkidle'});
  await p.waitForTimeout(1800);

  const targets = await p.evaluate(() => {
    const picks = [
      ['hero lede', '.lede'],
      ['hero headline', '.headline'],
      ['feed headline', 'article h3'],
      ['feed consequence', 'article p'],
      ['stat label', '[class*="uppercase"][class*="tracking-widest"]'],
      ['panel title', 'section h2'],
      ['rail assistant text', 'aside .text-muted-foreground'],
      ['nav active', 'nav [aria-current="page"]'],
    ];
    const out = [];
    for (const [name, sel] of picks) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      out.push({ name, color: getComputedStyle(el).color,
                 box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } });
    }
    return out;
  });

  // Hide all text so we can photograph the surface underneath it.
  await p.addStyleTag({ content: `* { color: transparent !important; text-shadow: none !important; }` });
  await p.waitForTimeout(400);
  const shot = `/tmp/plate-${theme}.png`;
  await p.screenshot({ path: shot });
  await ctx.close();

  const { PNG } = await import('pngjs');
  const png = PNG.sync.read(fs.readFileSync(shot));
  console.log(`\n--- ${theme} : text over what is actually painted behind it ---`);
  let worst = 99;
  for (const t of targets) {
    const m = t.color.match(/(\d+),\s*(\d+),\s*(\d+)/);
    if (!m) continue;
    const fg = lum(+m[1], +m[2], +m[3]);
    // sample a grid across the text's own box
    let best = 99;
    for (let i = 1; i <= 6; i++) for (let j = 1; j <= 3; j++) {
      const x = Math.min(png.width-1, t.box.x + Math.round(t.box.w * i/7));
      const y = Math.min(png.height-1, t.box.y + Math.round(t.box.h * j/4));
      const idx = (png.width * y + x) << 2;
      const bg = lum(png.data[idx], png.data[idx+1], png.data[idx+2]);
      best = Math.min(best, ratio(fg, bg));
    }
    worst = Math.min(worst, best);
    const verdict = best >= 4.5 ? 'AA' : best >= 3 ? 'large-text only' : 'FAIL';
    if (best < 4.5) failures += 1;
    console.log(`${t.name.padEnd(22)} worst-pixel ${best.toFixed(2).padStart(6)}  ${verdict}`);
  }
  console.log(`worst across all sampled text: ${worst.toFixed(2)}`);
}
await b.close();

if (failures > 0) {
  process.stdout.write(
    `\n${failures} text block(s) fall below 4.5:1 against what is painted behind them.\n` +
    `Raise the glass fill for that level, or calm the backdrop where those blocks sit.\n`,
  );
  process.exit(1);
}
process.stdout.write('\nEvery sampled text block clears AA against the rendered backdrop.\n');
