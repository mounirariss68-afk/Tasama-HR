/**
 * npm run check — assertions over the live world (canon: stages/03-build.md).
 * Reads the database the server uses (DATABASE_URL) and the running server
 * (CHECK_BASE, default http://localhost:5000). Exits non-zero on any failure.
 * It reads only; it never writes.
 */
import pg from 'pg';
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

  await check('API: twelve Director scenarios', async () => { const d = await api('/director/scenarios'); return [d.length === 12, `${d.length}`]; });
  await check('API: twenty-one agents, none autonomous', async () => { const d = await api('/agents'); return [d.length === 21 && !d.some((a: any) => a.autonomy === 'A4'), `${d.length}; A4: ${d.filter((a: any) => a.autonomy === 'A4').length}`]; });
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
  const q1 = async (sql: string) => (await pool.query(sql)).rows;
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

  await pool.end();
  const failed = results.filter((r) => !r.ok);
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  (${r.detail})`);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
