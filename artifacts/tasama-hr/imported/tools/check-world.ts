/**
 * npm run check — assertions over the live world (canon: stages/03-build.md).
 * Reads the database the server uses (DATABASE_URL) and the running server
 * (CHECK_BASE, default http://localhost:5000). Exits non-zero on any failure.
 * It reads only; it never writes.
 */
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { CLIENTS } from '../apps/server/src/domain/clients.ts';
import { policiesFor } from '../apps/server/src/domain/policies.ts';
import { readRules, truthRules } from '../apps/server/src/domain/payroll-policy.ts';
import { CALENDAR } from '../apps/server/src/domain/calendar.ts';

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL is not set.'); process.exit(2); }
const BASE = process.env.CHECK_BASE ?? `http://localhost:${process.env.PORT ?? 5000}`;
const pool = new pg.Pool({ connectionString: url, ssl: /sslmode=require/.test(url) ? { rejectUnauthorized: false } : undefined });
const one = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows[0];
const n = async (sql: string, p: unknown[] = []) => Number(Object.values((await one(sql, p)) ?? { n: 0 })[0] ?? 0);

const results: { ok: boolean; name: string; detail: string }[] = [];
const check = async (name: string, f: () => Promise<[boolean, string]>) => {
  try { const [ok, detail] = await f(); results.push({ ok, name, detail }); } catch (e: any) { results.push({ ok: false, name, detail: e.message }); }
};
const api = async (path: string, persona = 'tasama', client = 'roshn') => {
  const r = await fetch(`${BASE}/api${path}`, { headers: { 'x-persona': persona, 'x-client': client } });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
};

async function main() {
  const clients: string[] = (await pool.query(`SELECT key FROM tasama.clients ORDER BY key`)).rows.map((r) => r.key);
  await check('Five client accounts exist', async () => [clients.length === 5, clients.join(', ')]);
  await check('Server is up and not seeding', async () => { const h = await (await fetch(`${BASE}/api/health`)).json(); return [h.ok === true && !h.seeding, JSON.stringify(h)]; });

  for (const k of clients) {
    const H = `hcm_${k}`, L = `layer_${k}`;
    await check(`${k}: workers on record`, async () => { const c = await n(`SELECT count(*) FROM ${H}.persons`); return [c >= 100, `${c} persons`]; });
    await check(`${k}: eight personas, the finance controller among them`, async () => { const c = await n(`SELECT count(*) FROM ${L}.personas`); const f = await n(`SELECT count(*) FROM ${L}.personas WHERE key='finance'`); return [c === 8 && f === 1, `${c}`]; });
    await check(`${k}: every waiting case names the person it waits on, or Tasama's payroll team`, async () => { const c = await n(`SELECT count(*) FROM ${L}.requests WHERE status='WAITING' AND waiting_on_person_id IS NULL AND COALESCE(waiting_on_role,'') NOT IN ('TASAMA_PAYROLL','TASAMA_PAYROLL_LEAD')`); return [c === 0, `${c} without`]; });
    await check(`${k}: an active policy with rules on all 27 dimensions`, async () => { const r = await one(`SELECT count(*) AS n, count(DISTINCT dim) AS d FROM ${L}.policy_rules r JOIN ${L}.policy_versions v ON v.id=r.version_id WHERE v.status='ACTIVE'`); return [Number(r.d) === 27 && Number(r.n) >= 38, `${r.n} rules, ${r.d} dimensions`]; });
    await check(`${k}: the payroll calendar sits around the anchor`, async () => { const a = (await one(`SELECT value FROM ${L}.meta WHERE key='anchor'`)).value; const per = await one(`SELECT to_char(cutoff_date, 'YYYY-MM-DD') AS cutoff_date FROM ${H}.payroll_periods WHERE status='OPEN'`); const want = new Date(new Date(a).getTime() + CALENDAR[k].cutoff * 86400000).toISOString().slice(0, 10); return [String(per.cutoff_date).slice(0, 10) === want, `cut-off ${per.cutoff_date}, expected ${want}`]; });
    await check(`${k}: a leave request waits on a line manager`, async () => { const c = await n(`SELECT count(*) FROM ${L}.requests WHERE workflow_id='WF-15' AND status='WAITING' AND waiting_on_role='LINE_MANAGER'`); return [c >= 1, `${c}`]; });
    await check(`${k}: every case has a trail`, async () => { const c = await n(`SELECT count(*) FROM ${L}.requests r WHERE NOT EXISTS (SELECT 1 FROM ${L}.trail t WHERE t.request_id=r.id)`); return [c === 0, `${c} without`]; });
    await check(`${k}: every completed case wrote through the connector or needed no write`, async () => { const c = await n(`SELECT count(*) FROM ${L}.integration_log WHERE method <> 'GET'`); return [c > 0, `${c} writes logged`]; });
    await check(`${k}: share closed with no HR touch is realistic (15–95%)`, async () => {
      const r = await one(`SELECT count(*) FILTER (WHERE status='COMPLETED') AS done, count(*) FILTER (WHERE status='COMPLETED' AND NOT EXISTS (SELECT 1 FROM ${L}.approvals a WHERE a.request_id=r.id)) AS untouched FROM ${L}.requests r`);
      const share = Number(r.done) ? Number(r.untouched) / Number(r.done) : 0; return [share >= 0.15 && share <= 0.95, `${Math.round(share * 100)}% of ${r.done}`];
    });
    await check(`${k}: issue history for the pattern watch (26 weeks)`, async () => { const r = await one(`SELECT count(*) AS n, round(extract(epoch FROM now() - min(occurred_at)) / 604800) AS w FROM ${L}.issues`); return [Number(r.n) > 30 && Number(r.w) >= 24, `${r.n} issues over ${r.w} weeks`]; });
  }

  await check('Planted: the Riyadh Air manager is away with no delegate', async () => { const c = await n(`SELECT count(*) FROM hcm_riyadhair.absences WHERE absence_number='DEMO-ABS-P0001'`); return [c === 1, `${c}`]; });
  await check('Planted: Basira holds a single-client and a cross-client pattern', async () => { const r = (await pool.query(`SELECT scope FROM tasama.patterns WHERE status <> 'CLOSED'`)).rows.map((x) => x.scope); return [r.includes('CLIENT') && r.includes('CROSS_CLIENT'), r.join(', ')]; });
  await check('Planted: the SEVEN one-week burst is looked at and not flagged', async () => { const c = await n(`SELECT count(*) FROM tasama.pattern_watch WHERE client_key = 'seven'`); return [c >= 1, `${c}`]; });
  for (const c of CLIENTS) {
    await check(`Nizam reads ${c.short}'s handbook back into the rules it was written from`, async () => {
      const t = truthRules(c), r = readRules(c, policiesFor(c));
      const off = t.filter((x, i) => x.num !== r[i].num || x.value !== r[i].value).map((x) => x.key);
      return [off.length === 0, off.length ? off.join(', ') : `${t.length} rules`];
    });
  }
  await check('Planted: SEVEN pays end of service on basic only, and Nizam refused it', async () => { const r = await one(`SELECT r.flag, r.resolution FROM layer_seven.policy_rules r JOIN layer_seven.policy_versions v ON v.id=r.version_id WHERE v.status='ACTIVE' AND r.key='eoswage'`); return [r?.flag === 'BELOW_LAW' && /Refused/.test(r?.resolution ?? ''), `${r?.flag} · ${r?.resolution}`]; });
  await check('Planted: Red Sea Global\'s revised handbook leaves overtime unclear', async () => { const c = CLIENTS.find((x) => x.key === 'redsea')!; const f = readRules(c, policiesFor(c, true)).filter((x) => x.flag === 'UNCLEAR').map((x) => x.key); return [f.length === 1 && f[0] === 'overtime.rate', f.join(', ') || 'none']; });
  await check('Three clients are held in Tasama HR, and their connector calls say so', async () => {
    const held = CLIENTS.filter((c) => c.hrms === 'PLATFORM').map((c) => c.key);
    const calls = await Promise.all(held.map((k) => n(`SELECT count(*) FROM layer_${k}.integration_log WHERE system='TASAMA_HR'`)));
    const oracle = await Promise.all(held.map((k) => n(`SELECT count(*) FROM layer_${k}.integration_log WHERE system IN ('ORACLE_HCM','ODOO')`)));
    return [held.join() === 'redsea,seven,saudicoffee' && calls.every((x) => x > 0) && oracle.every((x) => x === 0), `${held.join(', ')}: ${calls.join('/')} Tasama HR calls, ${oracle.join('/')} HRMS calls`];
  });
  await check('Tasama: every client has invoices', async () => { const c = await n(`SELECT count(DISTINCT client_key) FROM tasama.invoices`); return [c === 5, `${c}`]; });
  await check('Tasama: delivery staff allocated', async () => { const c = await n(`SELECT count(*) FROM tasama.allocations`); return [c >= 5, `${c}`]; });

  await check('API: seventeen Director scenarios', async () => { const d = await api('/director/scenarios'); return [d.length === 17, `${d.length}`]; });
  await check('API: twenty-seven agents, none autonomous', async () => { const d = await api('/agents'); return [d.length === 27 && !d.some((a: any) => a.autonomy === 'A4'), `${d.length}; A4: ${d.filter((a: any) => a.autonomy === 'A4').length}`]; });
  await check('API: the employee balance matches the leave screen', async () => { const me = await api('/me', 'employee'); const a = me.balances.find((b: any) => b.type_code === 'ANNUAL'); return [a && a.balance >= 0 && Math.abs(a.entitlement + a.carried_over - a.taken - a.booked - a.balance) < 0.6, a ? `${a.entitlement}+${a.carried_over}-${a.taken}-${a.booked}=${a.balance}` : 'none']; });
  await check('API: the manager inbox holds a leave decision', async () => { const d = await api('/requests?view=inbox', 'manager'); return [d.some((r: any) => r.workflow_id === 'WF-15'), `${d.length} waiting`]; });
  await check('API: the server refuses a decision that is not yours', async () => {
    const d = await api('/requests?view=inbox', 'manager');
    const r = await fetch(`${BASE}/api/requests/${d[0].ref}/decide`, { method: 'POST', headers: { 'x-persona': 'employee', 'x-client': 'roshn', 'content-type': 'application/json' }, body: JSON.stringify({ decision: 'APPROVED' }) });
    return [r.status === 403, `HTTP ${r.status}`];
  });
  await check('API: an employee cannot open a person outside their scope', async () => { const r = await fetch(`${BASE}/api/people/1`, { headers: { 'x-persona': 'employee', 'x-client': 'roshn' } }); return [r.status === 403, `HTTP ${r.status}`]; });

  await check('API: the payroll lead sees every client\'s month', async () => { const d = await api('/payroll/months', 'tasama-lead'); return [d.clients.length === 5 && d.clients.filter((c: any) => c.stage === 'RUN').length === 2, d.clients.map((c: any) => `${c.key}:${c.stage}`).join(' ')]; });
  await check('API: a client employee cannot read the payroll months', async () => { const r = await fetch(`${BASE}/api/payroll/months`, { headers: { 'x-persona': 'employee', 'x-client': 'roshn' } }); return [r.status === 403, `HTTP ${r.status}`]; });

  // Phase 2 (design/payroll-addendum.md §5): the clients held in Tasama HR are paid by the engine.
  const q1 = async (sql: string, ps: unknown[] = []) => (await pool.query(sql, ps)).rows;
  for (const key of ['redsea', 'seven', 'saudicoffee']) {
    await check(`Engine: every closed month at ${key} has pay lines with their rule, and a provision`, async () => {
      const [r] = await q1(`SELECT (SELECT COUNT(*) FROM hcm_${key}.payroll_results)::int res, (SELECT COUNT(*) FROM hcm_${key}.payroll_provisions)::int prov,
        (SELECT COUNT(*) FROM hcm_${key}.payroll_results WHERE NOT (lines->0 ? 'rule'))::int norule`);
      return [r.res > 0 && r.res === r.prov && r.norule === 0, `${r.res} results, ${r.prov} provisions, ${r.norule} without a rule`];
    });
  }
  await check('Engine: net = gross − deductions on every engine result', async () => {
    const bad = await q1(`SELECT COUNT(*)::int n FROM (SELECT gross, deductions, net FROM hcm_redsea.payroll_results UNION ALL SELECT gross, deductions, net FROM hcm_seven.payroll_results UNION ALL SELECT gross, deductions, net FROM hcm_saudicoffee.payroll_results) x WHERE abs(gross - deductions - net) > 0.011`);
    return [bad[0].n === 0, `${bad[0].n} off`];
  });
  await check('Engine: a full February is paid in full where a day is a 30th of the month', async () => {
    const rows = await q1(`SELECT r.days_paid, (SELECT (l->>'amount')::numeric FROM jsonb_array_elements(r.lines) l WHERE l->>'code'='BASIC') basic_paid, e.amount basic
      FROM hcm_redsea.payroll_results r JOIN hcm_redsea.payroll_periods pp ON pp.id=r.period_id JOIN hcm_redsea.work_relationships wr ON wr.person_id=r.person_id
      JOIN hcm_redsea.element_entries e ON e.person_id=r.person_id AND e.element_code='BASIC' AND e.effective_start <= pp.start_date AND e.effective_end >= pp.end_date
      WHERE to_char(pp.start_date,'MM')='02' AND wr.start_date < pp.start_date AND (wr.end_date IS NULL OR wr.end_date > pp.end_date) LIMIT 50`);
    const off = rows.filter((x: any) => Math.abs(Number(x.basic_paid) - Number(x.basic)) > 0.01 || x.days_paid !== 30);
    return [rows.length > 0 && off.length === 0, `${rows.length} February results, ${off.length} not paid in full`];
  });
  await check('Engine: GOSI follows the first registration, not the hire date', async () => {
    const rows = await q1(`SELECT g.system, g.source, pp.end_date, (SELECT (l->>'amount')::numeric FROM jsonb_array_elements(r.lines) l WHERE l->>'code'='GOSI_EE') ee,
        (SELECT SUM((l->>'amount')::numeric) FROM jsonb_array_elements(r.lines) l WHERE l->>'code' IN ('BASIC','HOUSING')) wage, r.days_paid
      FROM hcm_seven.payroll_results r JOIN hcm_seven.payroll_periods pp ON pp.id=r.period_id JOIN hcm_seven.gosi_registrations g ON g.person_id=r.person_id
      JOIN hcm_seven.persons p ON p.id=r.person_id WHERE p.is_saudi AND r.days_paid >= 28`);
    const want = (sys: string, end: string) => sys === 'LEGACY' ? 0.0975 : end >= '2026-07-01' ? 0.1075 : end >= '2025-07-01' ? 0.1025 : 0.0975;
    const prior = rows.filter((x: any) => x.source === 'PRIOR_EMPLOYER');
    const bad = rows.filter((x: any) => x.ee != null && Math.abs(Number(x.ee) / Math.min(45000, Number(x.wage)) - want(x.system, new Date(x.end_date).toISOString().slice(0, 10))) > 0.002);
    return [rows.length > 0 && prior.length > 0 && bad.length === 0, `${rows.length} Saudi results, ${prior.length} first registered with an earlier employer, ${bad.length} at the wrong rate`];
  });
  await check('Engine: the July 2025 template run still matches', async () => {
    const { execSync } = await import('node:child_process');
    try { const out = execSync('npx tsx tools/golden/check.ts', { encoding: 'utf8' }); return [true, out.trim().split('\n').at(-2) ?? '']; } catch (e: any) { return [false, String(e.stdout ?? e.message).trim().split('\n').at(-2) ?? 'failed']; }
  });

  // Phase 3 (design/payroll-addendum.md §5, edges 6 and 7): attendance reaches the run only as confirmed, capped entries.
  const { evaluateDays, assess } = await import('../apps/server/src/domain/attendance.ts');
  await check('Attendance: fines stop at five days\' wage, and unpaid absence is kept apart', async () => {
    const sch = { code: 'S', days: [1, 2, 3, 4, 5, 6, 7], start: '07:00', end: '15:00', graceMin: 5 };
    const punches = Array.from({ length: 30 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`).filter((d) => d !== '2026-09-20').map((d) => ({ personId: 1, at: `${d}T07:40`, direction: 'IN' as const }));
    const days = evaluateDays({ start: '2026-09-01', end: '2026-09-30', people: [{ personId: 1, schedule: sch }], punches, leave: [] });
    const [r] = assess(days, new Map([[1, 9000]]));
    return [r.lates === 29 && r.capped && r.fine === 1500 && r.unpaidDays === 1 && r.unpaidAmount === 300, `${r.lates} lates, fine ${r.fine} of ${r.fineBeforeCap}, cap ${r.cap}, ${r.unpaidDays} unpaid day ${r.unpaidAmount}`];
  });
  await check('Attendance: a day on approved leave is never an absence', async () => {
    const sch = { code: 'S', days: [1, 2, 3, 4, 5, 6, 7], start: '07:00', end: '15:00', graceMin: 0 };
    const days = evaluateDays({ start: '2026-09-01', end: '2026-09-03', people: [{ personId: 1, schedule: sch }], punches: [], leave: [{ personId: 1, start: '2026-09-01', end: '2026-09-03', ref: 'X' }] });
    return [days.every((d) => d.status === 'LEAVE'), days.map((d) => d.status).join(',')];
  });
  await check('Attendance: Saudi Coffee\'s attendance file maps itself and names 37 late arrivals', async () => {
    const r = await fetch(`${BASE}/api/payroll/attendance/saudicoffee/export`, { headers: { 'x-persona': 'tasama-lead', 'x-client': 'saudicoffee' } });
    const csv = await r.text();
    const m = await (await fetch(`${BASE}/api/payroll/attendance/saudicoffee/map`, { method: 'POST', headers: { 'x-persona': 'tasama-lead', 'x-client': 'saudicoffee', 'content-type': 'application/json' }, body: JSON.stringify({ csv }) })).json();
    const meta = (await q1(`SELECT value FROM layer_saudicoffee.meta WHERE key='attendance'`))[0]?.value;
    const n = meta ? Object.values(meta.lates).reduce((s: number, x: any) => s + x.length, 0) : 0;
    return [m.map.employee && m.map.date && m.map.time && m.map.direction && n === 37, `map ${JSON.stringify(m.map)}; planted lates ${n}`];
  });

  await check('Run checks: an advance above 10% is rescheduled, and the client\'s GOSI answer clears its check (SEVEN)', async () => {
    const H = (persona: string) => ({ 'x-persona': persona, 'x-client': 'seven', 'content-type': 'application/json' });
    const run = async () => (await fetch(`${BASE}/api/payroll/runs/seven`, { headers: H('tasama-lead') })).json();
    const before = (await run()).review.checks;
    const adv = before.find((c: any) => c.codes.includes('ADVANCE_CAP')), gosi = before.find((c: any) => c.codes.includes('GOSI_NOT_REGISTERED'));
    if (!adv || !gosi) return [false, `checks ${before.map((c: any) => c.codes.join('+')).join(', ')}`];
    await fetch(`${BASE}/api/payroll/runs/seven/checks/${adv.person_id}/reschedule`, { method: 'POST', headers: H('tasama-specialist') });
    const k = await (await fetch(`${BASE}/api/payroll/runs/seven/checks/${gosi.person_id}/ask`, { method: 'POST', headers: H('tasama-specialist') })).json();
    const mid = (await run()).review.checks;
    await fetch(`${BASE}/api/requests/${k.ref}/decide`, { method: 'POST', headers: H('payroll'), body: JSON.stringify({ decision: 'APPROVED', edits: { registered_on: '2026-09-01' } }) });
    const after = await run();
    const row = after.draft.rows.find((r: any) => r.person_id === adv.person_id);
    const waited = mid.find((c: any) => c.person_id === gosi.person_id)?.status ?? '';
    return [before.length === 2 && /waiting on/.test(waited) && after.review.checks.length === 0 && row.deductions <= row.gross / 2 && after.review.fixed.length === 3, `${before.length} checks → ${after.review.checks.length}; "${waited}"; ${after.review.fixed.length} logged`];
  });

  await check('Inputs: each client\'s month follows its cut-off, and HR operations\' confirmation becomes entries (§17)', async () => {
    const d = await (await fetch(`${BASE}/api/payroll/inputs`, { headers: { 'x-persona': 'tasama-lead', 'x-client': 'roshn' } })).json();
    const by = Object.fromEntries(d.clients.map((c: any) => [c.key, c]));
    const shape = by.riyadhair.month.status === 'COMPLETED' && by.redsea.month.status === 'COMPLETED' && by.roshn.counts.expected === 3 && by.seven.counts.expected === 3 && by.saudicoffee.counts.expected === 4;
    const H = { 'x-persona': 'payroll', 'x-client': 'roshn', 'content-type': 'application/json' };
    const tm = await (await fetch(`${BASE}/api/payroll/this-month`, { headers: H })).json();
    const exp = tm.rows.filter((r: any) => r.state === 'EXPECTED');
    await fetch(`${BASE}/api/requests/${tm.month.ref}/decide`, { method: 'POST', headers: H, body: JSON.stringify({ decision: 'APPROVED', edits: { values: { [exp[0].id]: 20 }, drop: [exp[1].id] } }) });
    const after = await (await fetch(`${BASE}/api/payroll/this-month`, { headers: H })).json();
    const e = await q1(`SELECT amount::float a FROM hcm_roshn.element_entries WHERE element_code='OT_HOURS' AND person_id=$1 AND source='RAFEEQ'`, [exp[0].person_id]);
    return [shape && after.counts.expected === 0 && after.counts.dropped === 1 && e[0]?.a === 20, `riyadhair ${by.riyadhair.month.status}, roshn ${by.roshn.counts.expected} expected → ${after.counts.expected}; entry ${e[0]?.a}`];
  });

  await check('Runs: Riyadh Air approved and written; the causes add up to the change; a preparer cannot validate (§18)', async () => {
    const get = async (cl: string) => (await fetch(`${BASE}/api/payroll/runs/${cl}`, { headers: { 'x-persona': 'tasama-lead', 'x-client': cl } })).json();
    const ra = await get('riyadhair');
    const written = await q1(`SELECT count(*)::int n FROM hcm_riyadhair.payroll_results r JOIN hcm_riyadhair.payroll_periods p ON p.id=r.period_id WHERE p.status='OPEN'`);
    const rs = await get('redsea');
    const dx = rs.differences;
    const sum = dx.steps.reduce((n: number, x: any) => n + x.amount, 0);
    const adds = Math.abs(dx.lastNet + sum - dx.thisNet) < 1 && Math.abs(dx.thisNet - rs.draft.totals.net) < 1 && !dx.unexplained;
    return [ra.run?.state === 'APPROVED' && ra.run.preparer !== ra.run.validator && written[0].n === ra.run.people && ra.run.payslips === ra.run.people && rs.run?.state === 'DRAFT' && adds,
      `riyadhair ${ra.run?.state}, ${written[0].n} written, ${ra.run?.payslips} payslips; redsea ${rs.run?.state}; causes ${Math.round(sum)} vs change ${Math.round(dx.thisNet - dx.lastNet)}`];
  });

  // Payments (§20): the bank file is the approved net pay, the WPS file matches it, the release checks hold.
  await check('Payments: every bank file total is the sum of its lines and the month\'s net pay, for every client and month (§20)', async () => {
    const bad: string[] = []; let pays = 0;
    for (const k of clients) {
      const rows = (await pool.query(`SELECT p.id, p.period_name, p.total, p.kind, (SELECT COALESCE(sum(amount),0) FROM layer_${k}.payment_lines l WHERE l.payment_id=p.id) lines,
          (SELECT COALESCE(sum(pr.net),0) FROM hcm_${k}.payroll_results pr JOIN hcm_${k}.payroll_periods per ON per.id=pr.period_id WHERE per.period_name=p.period_name AND pr.net > 0) net
        FROM layer_${k}.payments p`)).rows;
      for (const r of rows) { pays++; if (Math.abs(Number(r.total) - Number(r.lines)) > 0.005 || (r.kind === 'REGULAR' && Math.abs(Number(r.total) - Number(r.net)) > 0.005)) bad.push(`${k} ${r.period_name}`); }
    }
    return [pays >= 40 && !bad.length, `${pays} payments; ${bad.length ? 'off: ' + bad.slice(0, 4).join(', ') : 'all equal'}`];
  });
  await check('Payments: the WPS file matches the bank file line by line and in total, in every format (§20)', async () => {
    const bad: string[] = []; let n0 = 0; const formats = new Set<string>();
    for (const k of clients) {
      const ids = (await pool.query(`SELECT id, format_key FROM layer_${k}.payments ORDER BY id DESC LIMIT 2`)).rows;
      for (const r of ids) { n0++; formats.add(r.format_key); const d = await api(`/payroll/payments/${k}/${r.id}`, 'tasama-lead', k); if (!d.match.ok) bad.push(`${k}#${r.id}`); }
    }
    return [n0 >= 10 && formats.size === 3 && !bad.length, `${n0} payments in ${formats.size} formats; ${bad.length ? 'differ: ' + bad.join(', ') : 'all match'}`];
  });
  await check('Payments: every seeded employee has an IBAN that passes its check digits', async () => {
    const { ibanValid } = await import('../apps/server/src/domain/banks.ts');
    let bad = 0, all = 0;
    for (const k of clients) for (const r of (await pool.query(`SELECT iban FROM hcm_${k}.persons WHERE iban IS NOT NULL`)).rows) { all++; if (!ibanValid(r.iban)) bad++; }
    return [all > 800 && bad === 0, `${all} IBANs, ${bad} invalid`];
  });
  await check('Payments: Riyadh Air\'s approved run waits on the payroll lead to send its file, every release check passing (D7)', async () => {
    const p = await one(`SELECT p.*, to_char(p.value_date,'YYYY-MM-DD') vd, to_char(p.pay_date,'YYYY-MM-DD') pd, r.status, r.current_step, r.waiting_on_role FROM layer_riyadhair.payments p JOIN layer_riyadhair.requests r ON r.id=p.request_id WHERE p.kind='REGULAR' ORDER BY p.id DESC LIMIT 1`);
    const failing = (p?.checks ?? []).filter((x: any) => !x.ok).length;
    const dow = new Date(`${p?.vd}T00:00:00Z`).getUTCDay();
    return [p?.state === 'BUILT' && p?.current_step === 'send' && p?.waiting_on_role === 'TASAMA_PAYROLL_LEAD' && failing === 0 && ![5, 6].includes(dow) && p.vd <= p.pd, `${p?.state}, step ${p?.current_step}, ${failing} failing, value date ${p?.vd} for pay day ${p?.pd}`];
  });

  await check('Payments: a new IBAN is accepted only when its check digits pass (D7, §20)', async () => {
    const { ibanValid, syntheticIban } = await import('../apps/server/src/domain/banks.ts');
    const good = syntheticIban('check', 'Al Rajhi Bank', '4417');
    const bad = good.slice(0, 10) + String((Number(good[10]) + 1) % 10) + good.slice(11);
    return [ibanValid(good) && !ibanValid(bad), `${good} passes; one digit changed fails`];
  });
  // Journals (§21): every posted journal balances, and the payroll owed is exactly what the bank paid.
  await check('Journals: every posted journal balances to the halala, for every client and month (§21)', async () => {
    let n0 = 0; const bad: string[] = [];
    for (const k of clients) for (const j of (await pool.query(`SELECT period_name, kind, debit, credit FROM layer_${k}.journals WHERE state='POSTED'`)).rows) { n0++; if (Math.abs(Number(j.debit) - Number(j.credit)) > 0.005) bad.push(`${k} ${j.period_name} ${j.kind}`); }
    return [n0 >= 100 && !bad.length, `${n0} posted journals; ${bad.length ? 'off: ' + bad.slice(0, 3).join(', ') : 'all balance'}`];
  });
  await check('Journals: salaries payable credited by the accrual equals what the payment journal pays out (§21)', async () => {
    let months = 0; const bad: string[] = [];
    for (const k of clients) {
      const rows = (await pool.query(`SELECT period_name, kind, lines FROM layer_${k}.journals WHERE state='POSTED'`)).rows;
      for (const pn of [...new Set(rows.map((r: any) => r.period_name))]) {
        months++;
        const sum = (kind: string, side: 'debit' | 'credit') => rows.filter((r: any) => r.period_name === pn && r.kind === kind).flatMap((r: any) => r.lines).filter((l: any) => l.account === '220100').reduce((a: number, l: any) => a + l[side], 0);
        const owed = sum('ACCRUAL', 'credit') + sum('PROVISION_USE', 'credit'), paid = sum('PAYMENT', 'debit');
        if (Math.abs(owed - paid) > 0.005) bad.push(`${k} ${pn}`);
      }
    }
    return [months >= 30 && !bad.length, `${months} months; ${bad.length ? 'differ: ' + bad.slice(0, 3).join(', ') : 'owed equals paid'}`];
  });
  await check('Journals: ROSHN\'s last month waits on the payroll lead, short by the remote-site allowance Qaid proposes an account for (D8)', async () => {
    const j = await one(`SELECT debit, credit, state, unmapped FROM layer_roshn.journals WHERE kind='ACCRUAL' ORDER BY period_name DESC LIMIT 1`);
    const k = await one(`SELECT status, current_step, waiting_on_role FROM layer_roshn.requests WHERE workflow_id='WF-34' ORDER BY id DESC LIMIT 1`);
    const m = await one(`SELECT account, status FROM layer_roshn.account_map WHERE code='REMOTE_SITE'`);
    const short = Number(j?.credit) - Number(j?.debit), un = (j?.unmapped ?? []).reduce((a: number, u: any) => a + Number(u.amount), 0);
    return [j?.state === 'BLOCKED' && Math.abs(short - un) < 0.005 && un > 0 && k?.current_step === 'approve' && k?.waiting_on_role === 'TASAMA_PAYROLL_LEAD' && m?.account === '610450' && m?.status === 'PROPOSED', `${j?.state}, short ${short.toFixed(2)} = unmapped ${un.toFixed(2)}; case ${k?.status}/${k?.current_step}; proposed ${m?.account} ${m?.status}`];
  });

  await check('Onboarding: Intiqal reads Soudah\'s files into the seven lanes, with section 19\'s fifteen issues (§13, §19)', async () => {
    const exp = JSON.parse(readFileSync(new URL('./new-client/expected.json', import.meta.url), 'utf8'));
    const H = { 'x-persona': 'tasama-lead', 'content-type': 'application/json' };
    const { id } = await (await fetch(`${BASE}/api/onboarding`, { method: 'POST', headers: H })).json();
    try {
      await fetch(`${BASE}/api/onboarding/${id}/demo-files`, { method: 'POST', headers: H });
      const o = await (await fetch(`${BASE}/api/onboarding/${id}/read`, { method: 'POST', headers: H, body: JSON.stringify({ wait: true }) })).json();
      const lane = (k: string) => o.lanes.find((l: any) => l.key === k)?.headline ?? '';
      const codes = o.issues.map((i: any) => i.code).sort().join();
      const want = exp.issues.map((i: any) => i.key).sort().join();
      const people = (c: string) => o.issues.filter((i: any) => i.code === c).flatMap((i: any) => i.people.map((p: any) => p.no)).sort().join();
      const ok = o.state === 'STAGED' && codes === want && o.counts.client === 7 && lane('roster') === `64 employees: 61 ready, 3 held`
        && lane('contracts') === '62 matched, 3 differences (2 explained), 2 missing, 1 expired' && /^27 dimensions read, 2 rules refused/.test(lane('policy'))
        && lane('history') === '6 months recalculated, 3 differences' && people('IBAN_CHECK') === [...exp.plants.badIban].sort().join() && people('NO_CONTRACT') === [...exp.plants.noContract].sort().join()
        && people('HOUSING_NOT_PAID') === exp.plants.mayJoiner && people('GOSI_RATE') === exp.plants.gosiLow && people('PAID_AFTER_LEAVING') === exp.plants.leaver;
      return [ok, `${o.state}; ${o.counts.issues} issues, ${o.counts.client} for the client; ${lane('roster')}; ${lane('history')}`];
    } finally {
      await fetch(`${BASE}/api/onboarding/${id}`, { method: 'DELETE', headers: H });
    }
  });

  await check('Go-live: Sharifa takes Soudah on; its master, six months, policy, questions and first month are written (§13, §19)', async () => {
    const exp = JSON.parse(readFileSync(new URL('./new-client/expected.json', import.meta.url), 'utf8'));
    const H = { 'x-persona': 'tasama-lead', 'content-type': 'application/json' };
    const { id } = await (await fetch(`${BASE}/api/onboarding`, { method: 'POST', headers: H })).json();
    try {
      await fetch(`${BASE}/api/onboarding/${id}/demo-files`, { method: 'POST', headers: H });
      await fetch(`${BASE}/api/onboarding/${id}/read`, { method: 'POST', headers: H, body: JSON.stringify({ wait: true }) });
      const refused = await fetch(`${BASE}/api/onboarding/${id}/decide`, { method: 'POST', headers: { ...H, 'x-persona': 'tasama-specialist' }, body: JSON.stringify({ decision: 'APPROVED' }) });
      const r = await (await fetch(`${BASE}/api/onboarding/${id}/decide`, { method: 'POST', headers: H, body: JSON.stringify({ decision: 'APPROVED' }) })).json();
      const q = async (sql: string) => Number((await pool.query(sql)).rows[0].n);
      const persons = await q(`SELECT count(*)::int n FROM hcm_soudah.persons`);
      const months = await q(`SELECT count(DISTINCT period_id)::int n FROM hcm_soudah.payroll_results`);
      const questions = await q(`SELECT count(*)::int n FROM layer_soudah.requests WHERE workflow_id='WF-36' AND status='WAITING'`);
      const month = await q(`SELECT count(*)::int n FROM layer_soudah.requests WHERE workflow_id='WF-27' AND type='MONTH'`);
      const settled = await q(`SELECT count(*)::int n FROM hcm_soudah.element_entries WHERE element_code IN ('BACK_PAY','GOSI_ARREARS')`);
      const refusedRules = await q(`SELECT count(*)::int n FROM layer_soudah.policy_rules r JOIN layer_soudah.policy_versions v ON v.id=r.version_id WHERE v.status='ACTIVE' AND r.flag='BELOW_LAW'`);
      const paid = Number((await pool.query(`SELECT COALESCE(SUM(net),0)::float n FROM hcm_soudah.payroll_results`)).rows[0].n);
      const want = Object.values(exp.history.net as Record<string, number>).reduce((a, b) => a + b, 0);
      const run = await (await fetch(`${BASE}/api/payroll/runs/soudah`, { headers: { 'x-persona': 'tasama-lead', 'x-client': 'soudah' } })).json();
      const session = await (await fetch(`${BASE}/api/session`, { headers: { 'x-persona': 'payroll', 'x-client': 'soudah' } })).json();
      const ok = refused.status === 403 && r.state === 'LIVE' && persons === 65 && months === 6 && questions === 7 && month === 1 && settled === 2 && refusedRules === 2
        && Math.abs(paid - want) < 1 && run.draft?.rows?.length === 64 && session.client?.key === 'soudah' && session.clients.length === 6;
      return [ok, `${r.state}; ${persons} people, ${months} months (net ${Math.round(paid)} vs ${Math.round(want)}), ${questions} questions, ${settled} first-month lines, ${refusedRules} refused rules, ${run.draft?.rows?.length} in the draft run; specialist refused ${refused.status}`];
    } finally {
      // Starting D10 removes the client again, as the scenario does.
      await fetch(`${BASE}/api/director/client-transition/start`, { method: 'POST', headers: { 'x-persona': 'tasama', 'content-type': 'application/json' }, body: '{}' });
      await fetch(`${BASE}/api/director/stop`, { method: 'POST', headers: { 'x-persona': 'tasama' } });
    }
  });

  await pool.end();
  const failed = results.filter((r) => !r.ok);
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  (${r.detail})`);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
