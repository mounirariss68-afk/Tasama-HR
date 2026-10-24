/**
 * npm run check:screens — the screen lint (canon: SCREEN-DISCIPLINE.md, checks/before-delivery.md row 4a).
 *
 * Opens every screen of every persona in the production build (the server must be
 * running: CHECK_BASE, default http://localhost:5000) and checks the rendered text:
 *   - no workflow ids, case ids, DEMO- ids, type codes, snake_case, rung codes,
 *     HTTP verbs or endpoint names on a work surface
 *   - no governance copy on a transaction
 *   - nothing from a "How this was checked" disclosure visible without a click
 *   - at most three panels before the fold (1440 × 900), after the hero
 * The Audit trail, Integration log, Workflows, Agents, Policies and the rig
 * (Scenarios, Settings) are the proof and are not linted for ids.
 *
 * With CHECK_LANG=ar every screen is opened in Arabic and English left on a
 * work surface is reported too: three or more English words in a row, other
 * than product and system names (Oracle, WPS, Mudad, Claude…). The fix is a
 * line in apps/web/src/lib/ar.ts, or an `_ar` field from the API.
 *
 * Needs Playwright (present in the Cognirise container; `npm i -D playwright` elsewhere).
 * Screenshots go to SHOTS_DIR when it is set.
 */
let chromium;
try { ({ chromium } = await import('playwright')); } catch { console.error('Playwright is not installed here. Run this in the Cognirise container, or `npm i -D playwright`.'); process.exit(2); }
import { mkdirSync } from 'node:fs';

const BASE = process.env.CHECK_BASE ?? `http://localhost:${process.env.PORT ?? 5000}`;
const SHOTS = process.env.SHOTS_DIR;
const CLIENT = process.env.CHECK_CLIENT ?? 'roshn';
const LANG = process.env.CHECK_LANG === 'ar' ? 'ar' : 'en';
// Names that stay in Latin script in the Arabic interface.
const KEEP_LATIN = /\b(?:Tasama HR|Oracle(?: Fusion)?(?: Cloud)?(?: HCM| Finance| REST)?|Odoo(?: Accounting)?|Claude|Replit|WPS|GOSI|Mudad|Qiwa|Muqeem|Jadarat|SARIE|IBAN|SAR|HCM|HRMS|DEMO|Excel|PDF|CSV|ZIP|TSV|API|Microsoft 365|Al Rajhi|SNB|SAB|Alinma|Albilad|Riyad Bank|ROSHN|SEVEN|Saudi National Bank|GlInterface|csv|xlsx|pdf|zip)\b/g;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const LENS_SCREENS = {
  tasama: ['tasama-portfolio', 'tasama-account', 'tasama-sla', 'tasama-escalations', 'tasama-patterns', 'tasama-finance', 'tasama-delivery', 'tasama-policies'],
  my: ['my-home', 'my-requests', 'my-leave', 'my-pay', 'my-growth', 'my-onboarding'],
  team: ['team', 'team-approvals', 'team-hiring', 'team-performance'],
  hr: ['hr-overview', 'hr-inbox', 'hr-workforce', 'hr-hiring', 'hr-onboarding', 'hr-performance', 'hr-payroll', 'hr-exits', 'hr-compliance'],
  control: ['agents', 'workflows', 'connector', 'evidence', 'policies', 'value'],
  payroll: ['payroll-months', 'payroll-inbox', 'payroll-runs', 'payroll-payments', 'payroll-journals', 'payroll-policies', 'payroll-add-client'],
  hrops: ['payroll-inbox', 'payroll-months', 'payroll-inputs', 'payroll-attendance', 'hrops-documents', 'payroll-policies'],
  fin: ['costs-reports', 'costs-provisions', 'costs-journals', 'costs-payments'],
  // The rig: in the Demo control, open to every persona.
  rig: ['scenarios', 'settings'],
};
const PROOF = new Set(['agents', 'workflows', 'scenarios', 'connector', 'evidence', 'policies', 'settings']);
const ID_RULES = [
  [/\bWF-\d{2}\b/, 'workflow id'],
  [/\b[A-Z]{3}-CASE-\d{2}-\d{4,}\b/, 'case id'],
  [/\bDEMO-[A-Z]+-[\w-]+/, 'DEMO- id'],
  [/\b[A-Z]{3}-(?:ISS|DOC)-\d{2}-\d+\b/, 'record id'],
  [/\bPAT-\d{4}-\d{3}\b/, 'pattern id'],
  [/(?<![\w-])A[0-4](?![\w-])/, 'rung code'],
  [/\b[a-z]+_[a-z_]+\b/, 'snake_case'],
  [/\b[A-Z]{2,}_[A-Z_]{2,}\b/, 'type code'],
  [/\b(?:GET|POST|PUT|PATCH|DELETE)\b/, 'HTTP verb'],
  [/hcmRestApi|\/json\/2\//, 'endpoint'],
];
const GOVERNANCE = [/the decision is yours/i, /nothing is submitted until/i, /never acts/i, /never (?:scores|ranks|rejects)/i, /synthetic data/i, /generated for this demo/i, /the agents have done the checking/i, /arrives prepared/i, /hypotheses for a person to test/i];

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? undefined });
// In Arabic, a person's English name anywhere on a work surface is reported too (two words pass the run-of-three rule).
const NAMES = LANG === 'ar' ? Object.keys(await (await fetch(`${BASE}/api/names`)).json()).filter((n) => /^[A-Z][a-z]+(?: [A-Z][a-zA-Z]+)+$/.test(n)) : [];
const session = await (await fetch(`${BASE}/api/session`, { headers: { 'x-persona': 'tasama', 'x-client': CLIENT } })).json();
const personas = session.personas;
const problems = [];
let pages = 0;

async function open(page, persona, screen) {
  await page.goto(`${BASE}/#/${screen}`);
  await page.evaluate(([p, c, l]) => { localStorage.setItem('tasama-persona', p); localStorage.setItem('tasama-client', c); localStorage.setItem('atelier-nav-orientation', 'vertical'); localStorage.setItem('rafeeq-lang', l); }, [persona, CLIENT, LANG]);
  await page.evaluate((h) => { window.location.hash = h; }, `#/${screen}`);
  await page.reload();
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(900);
}

async function lint(page, persona, screen, where) {
  const res = await page.evaluate(() => {
    const main = document.querySelector('.glass-l1') ?? document.body;
    const text = main.innerText;
    const tops = [...main.querySelectorAll('.glass-l2')].filter((el) => !el.parentElement?.closest('.glass-l2') && !el.querySelector('h1.headline'));
    const fold = tops.filter((el) => el.getBoundingClientRect().top < window.innerHeight - 40).length;
    const openProof = [...document.querySelectorAll('details[open]')].length;
    return { text, fold, openProof };
  });
  const out = [];
  if (!PROOF.has(screen)) {
    let text = res.text;
    text = text.replace(/\b[A-Z]{3}-CASE-\d{2}-\d{4,}\b/, ''); // one, small, in the case's meta line
    for (const [re, what] of ID_RULES) { const m = text.match(re); if (m) out.push(`${what}: "${m[0]}" in "…${text.slice(Math.max(0, m.index - 50), m.index + m[0].length + 30).replace(/\s+/g, ' ')}…"`); }
    for (const re of GOVERNANCE) { const m = res.text.match(re); if (m) out.push(`governance copy: "${m[0]}"`); }
    if (LANG === 'ar') {
      const seen = new Set();
      for (const line of res.text.split('\n')) {
        if ((line.match(/,/g) ?? []).length >= 5) continue; // a file's contents shown as a preview stay as the file has them
        const m = line.replace(KEEP_LATIN, ' ').match(/[A-Za-z][A-Za-z'’]+(?:[\s,.:;·()\-–]+[A-Za-z][A-Za-z'’]*){2,}/);
        if (m && !seen.has(m[0])) { seen.add(m[0]); out.push(`English in Arabic: "${line.trim().slice(0, 110)}"`); continue; }
        const who = NAMES.find((n) => line.includes(n));
        if (who && !seen.has(who)) { seen.add(who); out.push(`English name in Arabic: "${who}" in "${line.trim().slice(0, 90)}"`); }
      }
    }
  }
  if (res.openProof) out.push('a disclosure is open without a click');
  if (where === 'screen' && !PROOF.has(screen) && res.fold > 3) out.push(`${res.fold} panels before the fold (budget 3)`);
  for (const o of out) problems.push({ persona, screen: where === 'reader' ? `${screen} › case` : screen, problem: o });
  return res;
}

for (const p of personas) {
  const ctx = await browser.newContext({ viewport: { width: Number(process.env.CHECK_W ?? 1440), height: Number(process.env.CHECK_H ?? 900) }, colorScheme: 'light' });
  const page = await ctx.newPage();
  for (const lens of [...p.lenses, 'rig']) {
    for (const screen of LENS_SCREENS[lens] ?? []) {
      await open(page, p.key, screen);
      const forbidden = await page.evaluate(() => /Outside your data scope|not permitted/i.test(document.body.innerText));
      if (forbidden) continue;
      await lint(page, p.key, screen, 'screen');
      pages++;
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/${p.key}--${screen}.png` });
      if (['hr-inbox', 'team-approvals', 'my-requests'].includes(screen)) {
        const item = page.locator('article').first();
        if (await item.count()) { await item.click(); await page.waitForTimeout(1200); await lint(page, p.key, screen, 'reader'); pages++; if (SHOTS) await page.screenshot({ path: `${SHOTS}/${p.key}--${screen}--case.png` }); }
      }
    }
  }
  await ctx.close();
}
await browser.close();

for (const x of problems) console.log(`FAIL  ${x.persona.padEnd(9)} ${x.screen.padEnd(28)} ${x.problem}`);
console.log(`\n${pages} views checked, ${problems.length} problems`);
process.exit(problems.length ? 1 : 0);
