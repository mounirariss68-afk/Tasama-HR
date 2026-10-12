/**
 * Basira — Pattern Watch (A1: finds and explains, never acts).
 *
 * Weekly, across every client: the rate of each kind of problem (category,
 * workflow, reason code) per 100 cases, in seven-day windows, compared with
 * its own baseline. A rise is flagged only when it holds for two windows in a
 * row, clears the threshold, and involves enough cases; one-week bursts and
 * thin numbers are recorded as "looked at, not flagged" with the reason.
 *
 * For each flag Basira contrasts the recent issues with the baseline ones
 * (what is different about them: who they waited on, when the data arrived,
 * who entered it) and states likely causes with the evidence. With Claude
 * connected the causes are written by Claude from those facts only; without
 * it, by rules. Either way they are hypotheses for a person to test, and the
 * pattern stays open until its rate is measured again.
 */
import { pool, withClient } from '../db.js';
import { CLIENTS, clientByKey } from '../domain/clients.js';
import { REASONS, CATEGORY_LABEL, reasonLabel, type Category } from '../domain/reasons.js';
import { iso, addDays } from '../domain/rules.js';
import { now } from '../clock.js';
import { aiConfigured, createMessage } from '../ai.js';
import { tasamaTrail } from './service.js';

const WEEKS = 26, DAY = 86_400_000;
const BASE_FROM = 4, BASE_TO = 15;   // baseline windows: 4..15 weeks back (a rise may have been building for a few weeks)
const MIN_ISSUES = 5;

type Win = { k: number; week: string; issues: number; cases: number; rate: number };
type Key = { category: Category; workflow_id: string | null; reason_code: string };
const keyOf = (k: Key) => `${k.category}|${k.workflow_id ?? ''}|${k.reason_code}`;
const r1 = (n: number) => Math.round(n * 10) / 10;

const ATTR_LABEL: Record<string, string> = { approver: 'Waiting on', approver_away: 'Approver away at the time', after_cutoff: 'Reached payroll after the cut-off', entered_by: 'Entered by', change_type: 'Kind of change', decided_by: 'Decided by', step: 'Step' };
const SKIP_ATTRS = new Set(['approver_id', 'days_waiting', 'approver_away']);

async function seriesFor(clientKey: string, at: Date) {
  return withClient(clientKey, async () => {
    const today = new Date(`${iso(at)}T23:59:59Z`).getTime();
    const issues = (await pool.query(`SELECT id, ref, occurred_at, category, workflow_id, reason_code, case_ref, summary, attrs FROM layer.issues WHERE occurred_at > $1 AND occurred_at <= $2`, [new Date(today - WEEKS * 7 * DAY), at])).rows;
    const vol = (await pool.query(`SELECT week, workflow_id, cases FROM layer.weekly_volume`)).rows;
    const volK: Record<string, number[]> = {};
    for (const v of vol) {
      const k = Math.floor((today - new Date(`${iso(new Date(v.week))}T00:00:00Z`).getTime()) / (7 * DAY));
      if (k < 0 || k >= WEEKS) continue;
      (volK[v.workflow_id] ??= Array(WEEKS).fill(0))[k] += v.cases;
    }
    for (const wf of Object.keys(volK)) {
      const known = volK[wf].filter((x) => x > 0);
      const avg = known.length ? known.reduce((s, x) => s + x, 0) / known.length : 1;
      volK[wf] = volK[wf].map((x) => x || Math.round(avg));
    }
    const groups = new Map<string, { key: Key; byK: any[][] }>();
    for (const i of issues) {
      const k = Math.floor((today - new Date(i.occurred_at).getTime()) / (7 * DAY));
      if (k < 0 || k >= WEEKS) continue;
      const key: Key = { category: i.category, workflow_id: i.workflow_id, reason_code: i.reason_code };
      const g = groups.get(keyOf(key)) ?? { key, byK: Array.from({ length: WEEKS }, () => []) };
      g.byK[k].push(i);
      groups.set(keyOf(key), g);
    }
    return [...groups.values()].map((g) => {
      const cases = volK[g.key.workflow_id ?? ''] ?? Array(WEEKS).fill(Math.max(1, g.byK.flat().length));
      const wins: Win[] = g.byK.map((xs, k) => ({ k, week: iso(new Date(today - (7 * (k + 1) - 1) * DAY)), issues: xs.length, cases: cases[k], rate: cases[k] ? (xs.length / cases[k]) * 100 : 0 }));
      return { ...g, wins };
    });
  });
}

function judge(wins: Win[]) {
  const base = wins.filter((w) => w.k >= BASE_FROM && w.k <= BASE_TO).map((w) => w.rate);
  const mean = base.reduce((s, x) => s + x, 0) / base.length;
  const sd = Math.sqrt(base.reduce((s, x) => s + (x - mean) ** 2, 0) / base.length);
  const threshold = mean + Math.max(2 * sd, 0.5 * mean, 1);
  const [w0, w1] = [wins[0], wins[1]];
  const high0 = w0.rate > threshold, high1 = w1.rate > threshold;
  const n = w0.issues + w1.issues;
  const current = (w0.issues + w1.issues) / Math.max(1, w0.cases + w1.cases) * 100;
  if (high0 && high1 && n >= MIN_ISSUES) return { flag: true as const, mean, sd, threshold, current };
  if ((high0 || high1) && n >= 3) return { flag: false as const, mean, sd, threshold, current, note: high0 && high1 ? `Above the usual rate for two weeks but only ${n} cases: too few to tell yet.` : high1 ? `Above the usual rate in the week before last only (${w1.issues} cases against about ${r1(mean * w1.cases / 100)} expected), then back to normal. Not flagged: a rise has to hold for two weeks.` : `Above the usual rate in the last week only (${w0.issues} cases against about ${r1(mean * w0.cases / 100)} expected). Not flagged yet; Basira looks again next week.` };
  return null;
}

/** What is different about the recent issues, compared with the baseline ones. */
function contrast(recent: any[], baseline: any[]) {
  const facts: any[] = [];
  const keys = new Set<string>();
  for (const i of [...recent, ...baseline]) for (const k of Object.keys(i.attrs ?? {})) if (!SKIP_ATTRS.has(k)) keys.add(k);
  for (const k of keys) {
    const val = (i: any) => String(i.attrs?.[k]);
    const counts = new Map<string, number>();
    for (const i of recent) counts.set(val(i), (counts.get(val(i)) ?? 0) + 1);
    const [top, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
    const share = recent.length ? n / recent.length : 0;
    const bshare = baseline.length ? baseline.filter((i) => val(i) === top).length / baseline.length : 0;
    if (top === 'undefined') continue;
    if (share >= 0.5 && share - bshare >= 0.25) facts.push({ attr: k, label: ATTR_LABEL[k] ?? k, value: top, recent_share: Math.round(share * 100), baseline_share: Math.round(bshare * 100), kind: 'concentrated' });
    else if (counts.size >= 3 && share < 0.45 && k !== 'step') facts.push({ attr: k, label: ATTR_LABEL[k] ?? k, value: null, distinct: counts.size, recent_share: Math.round(share * 100), kind: 'spread' });
  }
  return facts;
}

function ruleCauses(p: { scope: string; clients: string[]; facts: any[]; extra: any }) {
  const causes: { cause: string; evidence: string; strength: 'strong' | 'moderate' | 'weak'; next_step: string }[] = [];
  const f = (a: string) => p.facts.find((x) => x.attr === a && x.kind === 'concentrated');
  const appr = f('approver');
  if (appr && p.extra.absence) causes.push({ cause: `${appr.value} is away with no delegate set, so requests wait on someone who cannot act`,
    evidence: `${appr.recent_share}% of the recent escalations waited on ${appr.value} (${appr.baseline_share}% before). ${appr.value} has been on leave since ${p.extra.absence.start_date}${p.extra.absence.end_date ? ` (back ${p.extra.absence.end_date})` : ''}; the HRMS has no approval delegate recorded.`,
    strength: 'strong', next_step: 'Set a delegate in the client\'s HRMS now; agree with the client that absences over three days need a delegate before they start.' });
  else if (appr) causes.push({ cause: `Requests are piling up with one approver, ${appr.value}`, evidence: `${appr.recent_share}% of the recent escalations waited on ${appr.value} (${appr.baseline_share}% before).`, strength: 'moderate', next_step: 'Check the approver\'s queue and availability with the client.' });
  const cut = f('after_cutoff');
  if (cut && cut.value === 'true') causes.push({ cause: 'Changes are reaching payroll after the cut-off, so they miss the element entries for the month',
    evidence: `${cut.recent_share}% of the recent findings concern changes entered after the cut-off (${cut.baseline_share}% before).`, strength: 'strong', next_step: 'Find what moved the timing: a new cut-off date, a later approval step, or a batch upload.' });
  const spread = p.facts.find((x) => x.attr === 'entered_by' && x.kind === 'spread');
  if (p.scope === 'CROSS_CLIENT') causes.push({ cause: 'A change in Tasama\'s own process, not in one client',
    evidence: `The rise started in the same weeks at ${p.clients.length} clients${spread ? ` and is spread across ${spread.distinct} people who enter changes (none above ${spread.recent_share}%)` : ''}; nothing points to one client or one person.`,
    strength: 'moderate', next_step: 'Check what changed in Tasama\'s payroll calendar or procedure in that week, and whether client HR teams were told.' });
  if (!causes.length) causes.push({ cause: 'No single factor stands out in the recorded facts', evidence: 'The recent issues look like the earlier ones on every recorded attribute.', strength: 'weak', next_step: 'Read a sample of the cases; consider whether the reason codes are being chosen consistently.' });
  return causes;
}

async function claudeCauses(p: any, samples: string[]) {
  const prompt = `You are Basira, the pattern-watch agent of Tasama HR Services (an HR outsourcing provider in Saudi Arabia). A rise has been detected. Propose up to three likely causes, each a hypothesis for a person to test, using ONLY the facts below. Do not invent facts, names, dates or numbers. Plain English, no hype.

Pattern: ${p.title}
Scope: ${p.scope === 'CROSS_CLIENT' ? `the same rise at ${p.clientNames.join(', ')}` : p.clientNames[0]}
Rate per 100 cases: ${r1(p.current)} over the last two weeks, against a baseline of ${r1(p.baseline)}.
What differs between the recent issues and earlier ones: ${JSON.stringify(p.facts)}
Other facts: ${JSON.stringify(p.extra)}
Sample of recent issues:
${samples.map((s) => `- ${s}`).join('\n')}

Reply with JSON only: [{"cause": "...", "evidence": "... the facts above that support it ...", "strength": "strong|moderate|weak", "next_step": "... what a person should check or do ..."}]`;
  const { msg } = await createMessage({ max_tokens: 900, messages: [{ role: 'user', content: prompt }] });
  const text = msg.content.map((b: any) => (b.type === 'text' ? b.text : '')).join('');
  const json = JSON.parse(text.slice(text.indexOf('['), text.lastIndexOf(']') + 1));
  if (!Array.isArray(json) || !json.length) throw new Error('No causes');
  return json.slice(0, 3).map((c: any) => ({ cause: String(c.cause), evidence: String(c.evidence), strength: ['strong', 'moderate', 'weak'].includes(c.strength) ? c.strength : 'moderate', next_step: String(c.next_step ?? '') }));
}

/** Basira's scan across all clients. */
export async function basiraScan(opts: { useClaude?: boolean } = {}) {
  const at = now();
  const flags: { client: string; key: Key; wins: Win[]; j: any; byK: any[][] }[] = [];
  const watch: any[] = [];
  for (const cl of CLIENTS) {
    for (const g of await seriesFor(cl.key, at)) {
      const j = judge(g.wins);
      if (!j) continue;
      if (j.flag) flags.push({ client: cl.key, key: g.key, wins: g.wins, j, byK: g.byK });
      else watch.push({ client_key: cl.key, ...g.key, note: j.note, series: g.wins.slice(0, 16).reverse().map((w) => ({ week: w.week, rate: r1(w.rate), issues: w.issues })) });
    }
  }
  await pool.query(`DELETE FROM tasama.pattern_watch`);
  for (const w of watch) await pool.query(`INSERT INTO tasama.pattern_watch (client_key, category, workflow_id, reason_code, note, series, scanned_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [w.client_key, w.category, w.workflow_id, w.reason_code, w.note, JSON.stringify(w.series), at]);

  // The same rise at two or more clients is one pattern about Tasama's own process.
  const byKey = new Map<string, typeof flags>();
  for (const f of flags) byKey.set(keyOf(f.key), [...(byKey.get(keyOf(f.key)) ?? []), f]);
  const out: string[] = [];
  for (const [, fs] of byKey) {
    const key = fs[0].key;
    const scope = fs.length >= 2 ? 'CROSS_CLIENT' : 'CLIENT';
    const clients = fs.map((f) => f.client);
    const clientNames = clients.map((k) => clientByKey(k)!.short);
    const recent = fs.flatMap((f) => [...f.byK[0], ...f.byK[1]]);
    const baseline = fs.flatMap((f) => f.byK.slice(BASE_FROM, BASE_TO + 1).flat());
    const sum = (ks: number[], fld: 'issues' | 'cases') => fs.reduce((s, f) => s + ks.reduce((t, k) => t + f.wins[k][fld], 0), 0);
    const baseK = Array.from({ length: BASE_TO - BASE_FROM + 1 }, (_, i) => BASE_FROM + i);
    const baseline_rate = (sum(baseK, 'issues') / Math.max(1, sum(baseK, 'cases'))) * 100;
    const current_rate = (sum([0, 1], 'issues') / Math.max(1, sum([0, 1], 'cases'))) * 100;
    const series = Array.from({ length: 16 }, (_, i) => 15 - i).map((k) => ({ week: fs[0].wins[k].week, rate: r1((sum([k], 'issues') / Math.max(1, sum([k], 'cases'))) * 100), issues: sum([k], 'issues'), cases: sum([k], 'cases') }));
    const facts = contrast(recent, baseline);
    const extra: any = { clients: clientNames };
    const appr = facts.find((x) => x.attr === 'approver' && x.kind === 'concentrated');
    if (appr) {
      const id = recent.find((i) => i.attrs?.approver === appr.value)?.attrs?.approver_id;
      if (id) extra.absence = await withClient(clients[0], async () => (await pool.query(`SELECT to_char(start_date,'YYYY-MM-DD') start_date, to_char(end_date,'YYYY-MM-DD') end_date, comments FROM hcm.absences WHERE person_id=$1 AND start_date <= $2::date AND end_date >= $2::date - 14 ORDER BY start_date DESC LIMIT 1`, [id, iso(at)])).rows[0] ?? null);
    }
    const label = reasonLabel(key.reason_code);
    const title = scope === 'CROSS_CLIENT' ? `${label}: rising at ${clientNames.length} clients` : `${label}: rising at ${clientNames[0]}`;
    const title_ar = scope === 'CROSS_CLIENT' ? `${REASONS[key.reason_code]?.label_ar ?? key.reason_code}: ارتفاع لدى ${clientNames.length} عملاء` : `${REASONS[key.reason_code]?.label_ar ?? key.reason_code}: ارتفاع لدى ${clientByKey(clients[0])!.name_ar}`;
    let causes = ruleCauses({ scope, clients, facts, extra });
    let causes_by = 'rules';
    if (opts.useClaude !== false && aiConfigured()) {
      try { causes = await claudeCauses({ title, scope, clientNames, current: current_rate, baseline: baseline_rate, facts, extra }, recent.slice(-12).map((i) => i.summary)); causes_by = 'claude'; }
      catch (e: any) { console.warn('[basira] Claude causes failed, using rules:', e.message); }
    }
    const issue_refs = recent.map((i) => i.ref);
    const case_refs = recent.map((i) => i.case_ref).filter(Boolean);
    const existing = (await pool.query(`SELECT id, ref FROM tasama.patterns WHERE scope=$1 AND client_keys=$2 AND category=$3 AND COALESCE(workflow_id,'')=$4 AND reason_code=$5 AND status <> 'CLOSED'`, [scope, clients, key.category, key.workflow_id ?? '', key.reason_code])).rows[0];
    const vals = [r1(baseline_rate), r1(current_rate), JSON.stringify(series), issue_refs, case_refs, JSON.stringify(facts), JSON.stringify(causes), causes_by, at];
    if (existing) {
      await pool.query(`UPDATE tasama.patterns SET baseline_rate=$2, current_rate=$3, series=$4, issue_refs=$5, case_refs=$6, facts=$7, causes=$8, causes_by=$9, updated_at=$10 WHERE id=$1`, [existing.id, ...vals]);
      out.push(existing.ref);
    } else {
      const n = (await pool.query(`SELECT COUNT(*)::int n FROM tasama.patterns`)).rows[0].n + 1;
      const ref = `PAT-${at.getUTCFullYear()}-${String(n).padStart(3, '0')}`;
      await pool.query(`INSERT INTO tasama.patterns (ref, scope, client_keys, category, workflow_id, reason_code, title, title_ar, baseline_rate, current_rate, series, issue_refs, case_refs, facts, causes, causes_by, detected_at, updated_at)
                        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$17)`, [ref, scope, clients, key.category, key.workflow_id, key.reason_code, title, title_ar, ...vals.slice(0, 8), at]);
      await tasamaTrail(pool, { client_key: scope === 'CLIENT' ? clients[0] : null, actor_type: 'AGENT', actor_id: 'basira', actor_name: 'Basira', act: 'FLAG', autonomy: 'A1', ref, at,
        summary: `${ref} ${title}: ${r1(current_rate)} per 100 cases over the last two weeks against ${r1(baseline_rate)} before; ${causes.length} likely cause${causes.length === 1 ? '' : 's'} stated.`,
        summary_ar: `${ref} ${title_ar}.` });
      out.push(ref);
    }
  }
  return { flagged: out, watched: watch.length, scanned_at: at };
}

export async function patterns() {
  const rows = (await pool.query(`SELECT p.*, s.name AS owner, s.name_ar AS owner_ar FROM tasama.patterns p LEFT JOIN tasama.staff s ON s.id=p.owner_staff_id ORDER BY (p.status='CLOSED'), p.detected_at DESC`)).rows;
  const watch = (await pool.query(`SELECT * FROM tasama.pattern_watch ORDER BY client_key`)).rows;
  const label = (r: any) => ({ ...r, client_names: (r.client_keys ?? [r.client_key]).map((k: string) => clientByKey(k)?.short ?? k), reason: reasonLabel(r.reason_code), reason_ar: reasonLabel(r.reason_code, true), category_label: CATEGORY_LABEL[r.category as Category] ?? [r.category, r.category] });
  const staff = (await pool.query(`SELECT id, name, name_ar, role FROM tasama.staff ORDER BY id`)).rows;
  return { patterns: rows.map(label), watch: watch.map(label), staff };
}

/** The issues behind a pattern, from each client's records. */
export async function patternIssues(id: number) {
  const p = (await pool.query(`SELECT * FROM tasama.patterns WHERE id=$1`, [id])).rows[0];
  if (!p) return [];
  const out: any[] = [];
  for (const k of p.client_keys) out.push(...(await withClient(k, async () => (await pool.query(`SELECT ref, occurred_at, case_ref, summary, attrs FROM layer.issues WHERE ref = ANY($1) ORDER BY occurred_at DESC`, [p.issue_refs])).rows.map((r: any) => ({ ...r, client: clientByKey(k)!.short, client_key: k })))));
  return out.sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());
}

export async function assignPattern(id: number, by: string, body: { staff_id: number; action: string; recheck_days?: number }) {
  const p = (await pool.query(`SELECT * FROM tasama.patterns WHERE id=$1`, [id])).rows[0];
  if (!p) throw new Error('No such pattern');
  if (!body.action?.trim()) throw new Error('Say what will be done about the cause.');
  const s = (await pool.query(`SELECT name FROM tasama.staff WHERE id=$1`, [body.staff_id])).rows[0];
  if (!s) throw new Error('Choose an owner');
  const recheck = iso(addDays(now(), Number(body.recheck_days ?? 14)));
  await pool.query(`UPDATE tasama.patterns SET status='MONITORING', owner_staff_id=$2, action=$3, recheck_on=$4, updated_at=$5 WHERE id=$1`, [id, body.staff_id, body.action.trim(), recheck, now()]);
  await tasamaTrail(pool, { client_key: p.scope === 'CLIENT' ? p.client_keys[0] : null, actor_type: 'HUMAN', actor_id: 'tasama', actor_name: by, act: 'ASSIGN', ref: p.ref,
    summary: `${p.ref} assigned to ${s.name}: ${body.action.trim()} Rate to be measured again on ${recheck}.`, summary_ar: `أُسند ${p.ref} إلى ${s.name}.` });
}

export async function closePattern(id: number, by: string, outcome: string) {
  const p = (await pool.query(`SELECT * FROM tasama.patterns WHERE id=$1`, [id])).rows[0];
  if (!p) throw new Error('No such pattern');
  if (!outcome?.trim()) throw new Error('Record the outcome before closing.');
  await pool.query(`UPDATE tasama.patterns SET status='CLOSED', outcome=$2, updated_at=$3 WHERE id=$1`, [id, outcome.trim(), now()]);
  await tasamaTrail(pool, { client_key: p.scope === 'CLIENT' ? p.client_keys[0] : null, actor_type: 'HUMAN', actor_id: 'tasama', actor_name: by, act: 'CLOSE', ref: p.ref, summary: `${p.ref} closed: ${outcome.trim()}`, summary_ar: `أُغلق ${p.ref}.` });
}

/** A live issue, written when it happens (Raqeeb's escalations, rejections). */
export async function recordIssue(clientKey: string, i: { category: Category; workflow_id: string | null; reason_code: string; case_ref: string | null; summary: string; attrs: any; at?: Date }) {
  const cl = clientByKey(clientKey)!;
  await withClient(clientKey, async () => {
    const n = (await pool.query(`SELECT COUNT(*)::int n FROM layer.issues`)).rows[0].n + 1;
    await pool.query(`INSERT INTO layer.issues (ref, occurred_at, category, workflow_id, reason_code, case_ref, summary, attrs) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (ref) DO NOTHING`,
      [`${cl.code}-ISS-${String((i.at ?? now()).getUTCFullYear()).slice(2)}-L${String(n).padStart(4, '0')}`, i.at ?? now(), i.category, i.workflow_id, i.reason_code, i.case_ref, i.summary, JSON.stringify(i.attrs)]);
  });
}
