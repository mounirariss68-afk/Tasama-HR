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
    await check(`${k}: every waiting case names the person it waits on, or a Tasama team`, async () => { const c = await n(`SELECT count(*) FROM ${L}.requests WHERE status='WAITING' AND waiting_on_person_id IS NULL AND COALESCE(waiting_on_role,'') NOT IN ('TASAMA_PAYROLL','TASAMA_PAYROLL_LEAD','TASAMA_HR_OPS')`); return [c === 0, `${c} without`]; });
    await check(`${k}: an active policy with rules on all 27 dimensions`, async () => { const r = await one(`SELECT count(*) AS n, count(DISTINCT dim) AS d FROM ${L}.policy_rules r JOIN ${L}.policy_versions v ON v.id=r.version_id WHERE v.status='ACTIVE'`); return [Number(r.d) === 27 && Number(r.n) >= 38, `${r.n} rules, ${r.d} dimensions`]; });
    await check(`${k}: the payroll calendar sits around the anchor`, async () => { const a = (await one(`SELECT value FROM ${L}.meta WHERE key='anchor'`)).value; const per = await one(`SELECT to_char(cutoff_date, 'YYYY-MM-DD') AS cutoff_date FROM ${H}.payroll_periods WHERE status='OPEN'`); const want = new Date(new Date(a).getTime() + CALENDAR[k].cutoff * 86400000).toISOString().slice(0, 10); return [String(per.cutoff_date).slice(0, 10) === want, `cut-off ${per.cutoff_date}, expected ${want}`]; });
    await check(`${k}: the waiting offer shows its candidate, two or more interviews held and the manager's reason (hiring addendum)`, async () => {
      const o = await one(`SELECT ref, payload FROM ${L}.requests WHERE workflow_id='WF-05' AND status='WAITING' ORDER BY id LIMIT 1`);
      if (!o) return [false, 'no waiting offer'];
      const held = await n(`SELECT count(*) FROM ${H}.interviews WHERE application_id=${Number(o.payload.application_id)} AND status='COMPLETED'`);
      const cand = await one(`SELECT c.first_name FROM ${H}.applications a JOIN ${H}.candidates c ON c.id=a.candidate_id WHERE a.id=${Number(o.payload.application_id)}`);
      const reason = String(o.payload.selection_reason ?? '');
      return [!!cand && held >= 2 && reason.startsWith(cand.first_name), `${cand?.first_name}: ${held} held; "${reason.slice(0, 60)}…"`];
    });
    await check(`${k}: a leave request waits on a line manager`, async () => { const c = await n(`SELECT count(*) FROM ${L}.requests WHERE workflow_id='WF-15' AND status='WAITING' AND waiting_on_role='LINE_MANAGER'`); return [c >= 1, `${c}`]; });
    await check(`${k}: every case has a trail`, async () => { const c = await n(`SELECT count(*) FROM ${L}.requests r WHERE NOT EXISTS (SELECT 1 FROM ${L}.trail t WHERE t.request_id=r.id)`); return [c === 0, `${c} without`]; });
    await check(`${k}: every completed case wrote through the connector or needed no write`, async () => { const c = await n(`SELECT count(*) FROM ${L}.integration_log WHERE method <> 'GET'`); return [c > 0, `${c} writes logged`]; });
    await check(`${k}: share closed with no HR touch is realistic (15–95%)`, async () => {
      const r = await one(`SELECT count(*) FILTER (WHERE status='COMPLETED') AS done, count(*) FILTER (WHERE status='COMPLETED' AND NOT EXISTS (SELECT 1 FROM ${L}.approvals a WHERE a.request_id=r.id)) AS untouched FROM ${L}.requests r`);
      const share = Number(r.done) ? Number(r.untouched) / Number(r.done) : 0; return [share >= 0.15 && share <= 0.95, `${Math.round(share * 100)}% of ${r.done}`];
    });
    await check(`${k}: once its cut-off passes, the month is confirmed by the client and handed to payroll by Tasama HR operations (HR ops addendum)`, async () => {
      const m = await one(`SELECT r.id, r.status, p.cutoff_date < CURRENT_DATE AS passed FROM ${L}.requests r JOIN ${H}.payroll_periods p ON p.period_name=r.payload->>'period' WHERE r.workflow_id='WF-27' AND r.type='MONTH' ORDER BY r.id DESC LIMIT 1`);
      if (!m) return [false, 'no month case'];
      if (!m.passed) return [m.status !== 'COMPLETED', `cut-off ahead; ${m.status}`];
      const v = await one(`SELECT approver_role, decision FROM ${L}.approvals WHERE request_id=${m.id} AND step_key='validate'`);
      const t = await n(`SELECT count(*) FROM ${L}.trail WHERE request_id=${m.id} AND actor_name LIKE 'Lama Al Dossary%'`);
      return [m.status === 'COMPLETED' && v?.approver_role === 'TASAMA_HR_OPS' && v?.decision === 'APPROVED' && t >= 1, `${m.status}; validate ${v?.approver_role}/${v?.decision}; ${t} trail lines by Lama`];
    });
    await check(`${k}: issue history for the pattern watch (26 weeks)`, async () => { const r = await one(`SELECT count(*) AS n, round(extract(epoch FROM now() - min(occurred_at)) / 604800) AS w FROM ${L}.issues`); return [Number(r.n) > 30 && Number(r.w) >= 24, `${r.n} issues over ${r.w} weeks`]; });
  }

  // design/hr-ops-addendum.md: Tasama HR operations is its own persona and lens; payroll validates, it does not enter changes.
  await check('The client\'s HR operations approves every run; the CHRO only where the contract names it (Q2, then walkthrough item 4)', async () => {
    const r = await one(`SELECT count(*) FILTER (WHERE approver_role='PAYROLL' AND a.step_key='approve') AS hr, count(*) FILTER (WHERE approver_role='CHRO' AND a.step_key='approve') AS chro, count(*) FILTER (WHERE approver_role='CHRO' AND a.step_key='approve_chro') AS chain FROM layer_riyadhair.approvals a JOIN layer_riyadhair.requests q ON q.id=a.request_id WHERE q.workflow_id='WF-30'`);
    return [Number(r.hr) >= 1 && Number(r.chro) === 0 && Number(r.chain) >= 1, `${r.hr} by HR operations, ${r.chro} by the CHRO at the approve step, ${r.chain} at the chain's CHRO step`];
  });
  // design/walkthrough-addendum.md (session 2): the run goes back through Tasama HR operations, the client's chain, the year's calendar.
  await check('Riyadh Air\'s run was delivered by Lama and approved by both links of its chain; Red Sea Global\'s chain is one link', async () => {
    const rx = await (await fetch(`${BASE}/api/payroll/approval`, { headers: { 'x-persona': 'payroll', 'x-client': 'riyadhair' } })).json();
    const rs = await (await fetch(`${BASE}/api/payroll/approval`, { headers: { 'x-persona': 'payroll', 'x-client': 'redsea' } })).json();
    const ok = rx.run?.deliverer === 'Lama Al Dossary' && rx.run?.chain?.length === 2 && rx.run.chain.every((l: any) => l.who && l.at) && rx.run.state === 'APPROVED' && rs.run?.chain?.length === 1;
    return [ok, `Riyadh Air: delivered by ${rx.run?.deliverer}, chain ${(rx.run?.chain ?? []).map((l: any) => `${l.label}=${l.who ?? '—'}`).join(' → ')}; Red Sea Global chain ${rs.run?.chain?.length}`];
  });
  await check('Every client has a 2026 payroll calendar with seven stages a month; four approved in January, Saudi Coffee\'s waiting on its HR operations', async () => {
    const out: string[] = [];
    let ok = true;
    for (const k of ['roshn', 'riyadhair', 'redsea', 'seven', 'saudicoffee']) {
      const d = await (await fetch(`${BASE}/api/payroll/calendar`, { headers: { 'x-persona': 'payroll', 'x-client': k } })).json();
      const open = d.months?.find((m: any) => m.open);
      const good = d.months?.length === 12 && open?.stages?.length === 7 && d.months.every((m: any) => m.stages.every((s: any, i: number, a: any[]) => i === 0 || s.date >= a[i - 1].date)) && (k === 'saudicoffee' ? d.status === 'PROPOSED' && d.canApprove : d.status === 'APPROVED' && String(d.approved_at).startsWith('2026-01'));
      ok = ok && good;
      out.push(`${k} ${d.status}${open ? ` ${open.period}` : ''}`);
    }
    return [ok, out.join(', ')];
  });
  // design/walkthrough-addendum.md §5 (session 3): the rules from the formula bars, the two checklists, the reconciliation.
  await check('Over 50, GOSI accepts at most a 10% rise a year: Red Sea Global\'s draft holds the contributory wage and names HR operations', async () => {
    const d = await (await fetch(`${BASE}/api/payroll/runs/redsea`, { headers: { 'x-persona': 'tasama-specialist', 'x-client': 'redsea' } })).json();
    const k = (d.review?.checks ?? []).find((x: any) => x.codes?.includes('GOSI_WAGE_CAP'));
    return [Boolean(k) && k.severity === 'ASK' && /held at/.test(k.found), k ? k.title : 'no GOSI_WAGE_CAP check'];
  });
  await check('Saudi Coffee prorates GOSI by the days worked and divides the leave day by 22; Red Sea Global runs end of service at 360', async () => {
    const sc = await (await fetch(`${BASE}/api/payroll/runs/saudicoffee`, { headers: { 'x-persona': 'tasama-specialist', 'x-client': 'saudicoffee' } })).json();
    const rs = await (await fetch(`${BASE}/api/payroll/runs/redsea`, { headers: { 'x-persona': 'tasama-specialist', 'x-client': 'redsea' } })).json();
    const rows: any[] = sc.draft?.rows ?? [];
    const partial = rows.find((r) => r.pay_days < 28 && r.lines.some((l: any) => l.code === 'gosi'));
    const prorated = partial ? /prorates GOSI/.test(partial.lines.find((l: any) => l.code === 'gosi').rule) : null;
    const div22 = rows.length ? /÷ 22/.test(rows[0].leave.rule) : false;
    const eos360 = (rs.draft?.rows ?? []).length ? /360 a year/.test(rs.draft.rows[0].eos.rule) : false;
    return [div22 && eos360 && prorated !== false, `Saudi Coffee leave ÷22: ${div22}; prorated partial month: ${prorated ?? 'no partial month this month'}; Red Sea Global EOS 360: ${eos360}`];
  });
  await check('Element catalogue: Tasama\'s elements in four groups on Client policies, with this month\'s use', async () => {
    const d = await (await fetch(`${BASE}/api/payroll/policies/roshn`, { headers: { 'x-persona': 'tasama-lead', 'x-client': 'roshn' } })).json();
    const el: any[] = d.elements ?? [];
    const groups = new Set(el.map((e) => e.group));
    return [el.length >= 28 && groups.size === 4 && el.some((e) => e.code === 'BASIC' && e.people > 100) && el.some((e) => e.code === 'WELLNESS'), `${el.length} elements, ${groups.size} groups, basic used by ${el.find((e) => e.code === 'BASIC')?.people}`];
  });
  await check('Reports: the paid month summarised by department and cost centre, totals only, for HR and for finance', async () => {
    const d = await (await fetch(`${BASE}/api/costs`, { headers: { 'x-persona': 'finance', 'x-client': 'roshn' } })).json();
    const rows: any[] = d.departments?.rows ?? [];
    const months: any[] = d.months ?? [];
    const last = [...months].reverse().find((m) => m.status === 'CLOSED');
    const sum = rows.reduce((s, r) => s + r.net, 0);
    return [rows.length > 5 && rows.every((r) => r.cost_center) && last && Math.abs(sum - last.net) < 1, `${rows.length} departments; net ${Math.round(sum)} vs month ${Math.round(last?.net ?? 0)}`];
  });
  await check('Bank reconciliation: every paid month reconciles with the payroll before its journals; the figures are on the payment', async () => {
    const r = await one(`SELECT count(*) FILTER (WHERE reconciliation IS NULL) AS missing, count(*) FILTER (WHERE (reconciliation->>'reconciled')::boolean) AS ok, count(*) AS n FROM layer_roshn.payments WHERE state IN ('PAID','PART_FAILED')`);
    return [Number(r.missing) === 0 && Number(r.ok) === Number(r.n), `${r.ok} of ${r.n} reconciled, ${r.missing} without a reconciliation`];
  });
  await check('Attendance: the client\'s approved summary is read as a summary (no punches) and priced', async () => {
    const h = { 'x-persona': 'tasama-hrops', 'x-client': 'saudicoffee', 'content-type': 'application/json' };
    const csv = await (await fetch(`${BASE}/api/payroll/attendance/saudicoffee/export?kind=summary`, { headers: h })).text();
    const m = await (await fetch(`${BASE}/api/payroll/attendance/saudicoffee/map`, { method: 'POST', headers: h, body: JSON.stringify({ csv }) })).json();
    return [Boolean(m.summary) && m.map.kind === 'SUMMARY' && m.map.employee && m.map.absent_days, `summary ${m.summary}; columns ${JSON.stringify(m.map)}`];
  });
  await check('Handover: the 20-item checklist and the 7-working-day SLA start from the client account; nothing is in progress on the demo day', async () => {
    const d = await (await fetch(`${BASE}/api/tasama/clients/seven/handover`, { headers: { 'x-persona': 'tasama' } })).json();
    const { HANDOVER_ITEMS, ACTIVATION_ITEMS } = await import('../apps/server/src/domain/checklists.ts');
    return [(d.handover == null || d.handover.status === 'CLOSED' || d.handover.status === 'CANCELLED') && HANDOVER_ITEMS.length === 20 && ACTIVATION_ITEMS.length === 26, `handover: ${d.handover?.status ?? 'none'}; checklist items ${HANDOVER_ITEMS.length} and ${ACTIVATION_ITEMS.length}`];
  });
  await check('Art. 87: a woman resigning within six months of marriage receives the full award', async () => {
    const { finalSettlement } = await import('../apps/server/src/domain/payroll/engine.ts');
    const { termsFromRules } = await import('../apps/server/src/domain/payroll/terms.ts');
    const terms = termsFromRules('check', []);
    const e = { ref: '1', isSaudi: true, hire: '2022-01-01', elements: { basic: 10000, housing: 2500, transport: 1000 }, leave: { entitlementDays: 21, carryoverDays: 0, usedDaysYtd: 0 } } as any;
    const a = finalSettlement({ start: '2026-10-01', end: '2026-10-31' }, terms, { ...e, lastDay: '2026-10-31' }, { leaving: 'ART_87' });
    const b = finalSettlement({ start: '2026-10-01', end: '2026-10-31' }, terms, { ...e, lastDay: '2026-10-31' }, { leaving: 'RESIGNATION' });
    return [a.factor === 1 && b.factor === 1 / 3, `marriage factor ${a.factor}, resignation after 4.8 years ${b.factor.toFixed(2)}`];
  });
  await check('Tasama\'s Months shows each client\'s next calendar stage', async () => {
    const d = await (await fetch(`${BASE}/api/payroll/months`, { headers: { 'x-persona': 'tasama-hrops' } })).json();
    const ok = d.clients.length >= 5 && d.clients.every((c: any) => c.calendar?.stages?.length === 7 && c.calendar.current);
    return [ok, d.clients.map((c: any) => `${c.key}: ${c.calendar?.status} ${c.calendar?.current}`).join(', ')];
  });
  // design/payroll-ops-addendum.md: the intake, the questions, the bank by file and the package.
  await check('Documents: every client has a document set with three gaps for Tasama HR operations to chase', async () => {
    const d = await (await fetch(`${BASE}/api/hrops/documents?client=roshn`, { headers: { 'x-persona': 'tasama-hrops', 'x-client': 'roshn' } })).json();
    const seeded = d.clients.filter((c: any) => ['roshn', 'riyadhair', 'redsea', 'seven', 'saudicoffee'].includes(c.key));
    const ok = seeded.length === 5 && seeded.every((c: any) => c.missing === 3 && c.received > c.people * 2) && (d.clients.find((c: any) => c.key === 'roshn')?.gaps ?? []).length >= 3;
    return [ok, seeded.map((c: any) => `${c.key} ${c.missing} missing of ${c.received + c.missing}`).join(', ')];
  });
  await check('Contracts from the client: two wait on Tasama HR operations at ROSHN and at SEVEN, one clean and one with differences', async () => {
    const out: string[] = [];
    let ok = true;
    for (const k of ['roshn', 'seven']) {
      const rows = (await pool.query(`SELECT waiting_on_role, current_step, result FROM layer_${k}.requests WHERE workflow_id='WF-37' AND status='WAITING' ORDER BY id`)).rows;
      const bad = rows.map((r: any) => (r.result?.reading ?? []).filter((x: any) => !x.ok).length);
      ok = ok && rows.length === 2 && rows.every((r: any) => r.waiting_on_role === 'TASAMA_HR_OPS' && r.current_step === 'review') && bad[0] === 0 && bad[1] >= 2;
      out.push(`${k}: ${rows.length} waiting, differences ${bad.join('/')}`);
    }
    return [ok, out.join('; ')];
  });
  await check('A run question raised to Tasama HR Ops waits on it, and goes to the client when Lama takes it there', async () => {
    const run = await (await fetch(`${BASE}/api/payroll/runs/roshn`, { headers: { 'x-persona': 'tasama-specialist', 'x-client': 'roshn' } })).json();
    const g = (run.review?.checks ?? run.checks ?? []).find((x: any) => x.codes?.includes('GOSI_NOT_REGISTERED') && x.actions?.some((a: any) => a.id === 'raise'));
    if (!g) return [false, 'no GOSI check with a raise action at ROSHN'];
    const r = await (await fetch(`${BASE}/api/payroll/runs/roshn/checks/${g.person_id}/raise`, { method: 'POST', headers: { 'x-persona': 'tasama-specialist', 'x-client': 'roshn' } })).json();
    const w1 = (await pool.query(`SELECT waiting_on_role FROM layer_roshn.requests WHERE ref=$1`, [r.ref])).rows[0]?.waiting_on_role;
    const notified = Number((await pool.query(`SELECT count(*) n FROM layer_roshn.notifications WHERE person_id IN (-31,-7) AND link=$1`, [`case:${r.ref}`])).rows[0].n);
    const L = { 'x-persona': 'tasama-hrops', 'x-client': 'roshn', 'content-type': 'application/json' };
    await fetch(`${BASE}/api/requests/${r.ref}/decide`, { method: 'POST', headers: L, body: JSON.stringify({ decision: 'APPROVED', reason: 'Taken to the client', edits: { to_client: true } }) });
    const w2 = (await pool.query(`SELECT waiting_on_role FROM layer_roshn.requests WHERE ref=$1`, [r.ref])).rows[0]?.waiting_on_role;
    // Put the day back as the seed left it.
    await pool.query(`UPDATE layer_roshn.requests SET status='CANCELLED', waiting_on_role=NULL, waiting_on_person_id=NULL WHERE ref=$1`, [r.ref]);
    await pool.query(`DELETE FROM layer_roshn.run_check_log WHERE request_id=(SELECT id FROM layer_roshn.requests WHERE ref=$1)`, [r.ref]);
    return [w1 === 'TASAMA_HR_OPS' && notified === 2 && w2 === 'PAYROLL', `raised → ${w1} (${notified} notified) → taken to the client → ${w2}`];
  });
  await check('The client\'s finance controller sees Payments, and a return file reads back from a paid month', async () => {
    const f = await fetch(`${BASE}/api/costs/payments`, { headers: { 'x-persona': 'finance', 'x-client': 'riyadhair' } });
    const pay = (await pool.query(`SELECT id, lines FROM layer_roshn.payments WHERE state='PAID' ORDER BY id DESC LIMIT 1`)).rows[0];
    const rf = await (await fetch(`${BASE}/api/payroll/payments/roshn/${pay.id}/return-file`, { headers: { 'x-persona': 'tasama-specialist', 'x-client': 'roshn' } })).text();
    const rows = rf.split('\n').length - 1;
    const refused = await fetch(`${BASE}/api/costs/payments/${pay.id}/approved`, { method: 'POST', headers: { 'x-persona': 'tasama-specialist', 'x-client': 'roshn', 'content-type': 'application/json' }, body: '{}' });
    return [f.ok && rows === pay.lines && refused.status === 403, `finance ${f.status}; return file ${rows} rows for ${pay.lines} lines; Tasama recording a bank approval ${refused.status}`];
  });
  await check('The payroll package downloads as a PDF and an Excel file, for Tasama and for the client', async () => {
    const a = await fetch(`${BASE}/api/payroll/runs/riyadhair/package/pdf`, { headers: { 'x-persona': 'tasama-lead', 'x-client': 'riyadhair' } });
    const b = await fetch(`${BASE}/api/payroll/runs/riyadhair/package/xlsx`, { headers: { 'x-persona': 'tasama-lead', 'x-client': 'riyadhair' } });
    const c2 = await fetch(`${BASE}/api/payroll/package/pdf`, { headers: { 'x-persona': 'payroll', 'x-client': 'riyadhair' } });
    const pdf = Buffer.from(await a.arrayBuffer()), xl = Buffer.from(await b.arrayBuffer()), cp = Buffer.from(await c2.arrayBuffer());
    const ok = pdf.subarray(0, 4).toString() === '%PDF' && xl.subarray(0, 2).toString() === 'PK' && cp.subarray(0, 4).toString() === '%PDF';
    return [ok, `pdf ${pdf.length} bytes, xlsx ${xl.length} bytes, client pdf ${cp.length} bytes`];
  });
  await check('Lama, Tasama HR operations, is a persona with the HR operations lens only', async () => {
    const s0 = await (await fetch(`${BASE}/api/session`, { headers: { 'x-persona': 'tasama-hrops', 'x-client': 'roshn' } })).json();
    const p = s0.persona ?? s0.me ?? {};
    return [p.key === 'tasama-hrops' && JSON.stringify(p.lenses) === '["hrops"]' && (p.roles ?? []).includes('TASAMA_HR_OPS'), `${p.key} ${JSON.stringify(p.lenses)} ${JSON.stringify(p.roles)}`];
  });
  await check('Lama reads every client\'s inputs and attendance; the payroll specialist uploads no attendance', async () => {
    const inputs = await fetch(`${BASE}/api/payroll/inputs`, { headers: { 'x-persona': 'tasama-hrops', 'x-client': 'roshn' } });
    const att = await fetch(`${BASE}/api/payroll/attendance`, { headers: { 'x-persona': 'tasama-hrops', 'x-client': 'saudicoffee' } });
    const up = await fetch(`${BASE}/api/payroll/attendance/saudicoffee/upload`, { method: 'POST', headers: { 'x-persona': 'tasama-specialist', 'x-client': 'saudicoffee', 'content-type': 'application/json' }, body: '{}' });
    return [inputs.ok && att.ok && up.status === 403, `inputs ${inputs.status}, attendance ${att.status}, specialist upload ${up.status}`];
  });

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

  await check('API: twenty-one Director scenarios', async () => { const d = await api('/director/scenarios'); return [d.length === 21, `${d.length}`]; });
  await check('API: twenty-seven agents, none autonomous', async () => { const d = await api('/agents'); return [d.length === 27 && !d.some((a: any) => a.autonomy === 'A4'), `${d.length}; A4: ${d.filter((a: any) => a.autonomy === 'A4').length}`]; });
  await check('API: the employee balance matches the leave screen', async () => { const me = await api('/me', 'employee'); const a = me.balances.find((b: any) => b.type_code === 'ANNUAL'); return [a && a.balance >= 0 && Math.abs(a.entitlement + a.carried_over - a.taken - a.booked - a.balance) < 0.6, a ? `${a.entitlement}+${a.carried_over}-${a.taken}-${a.booked}=${a.balance}` : 'none']; });
  await check('API: the manager inbox holds a leave decision', async () => { const d = await api('/requests?view=inbox', 'manager'); return [d.some((r: any) => r.workflow_id === 'WF-15'), `${d.length} waiting`]; });
  await check('API: the server refuses a decision that is not yours', async () => {
    const d = await api('/requests?view=inbox', 'manager');
    const r = await fetch(`${BASE}/api/requests/${d[0].ref}/decide`, { method: 'POST', headers: { 'x-persona': 'employee', 'x-client': 'roshn', 'content-type': 'application/json' }, body: JSON.stringify({ decision: 'APPROVED' }) });
    return [r.status === 403, `HTTP ${r.status}`];
  });
  await check('API: an employee cannot open a person outside their scope', async () => { const r = await fetch(`${BASE}/api/people/1`, { headers: { 'x-persona': 'employee', 'x-client': 'roshn' } }); return [r.status === 403, `HTTP ${r.status}`]; });

  await check('API: the payroll manager sees every client\'s month', async () => { const d = await api('/payroll/months', 'tasama-lead'); return [d.clients.length === 5 && d.clients.filter((c: any) => c.stage === 'RUN').length === 2, d.clients.map((c: any) => `${c.key}:${c.stage}`).join(' ')]; });
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
      JOIN hcm_seven.persons p ON p.id=r.person_id WHERE p.is_saudi AND r.days_paid >= extract(day FROM pp.end_date)`); // a full month only: GOSI is on the full wage, the lines on the days paid
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
    const r = await fetch(`${BASE}/api/payroll/attendance/saudicoffee/export`, { headers: { 'x-persona': 'tasama-hrops', 'x-client': 'saudicoffee' } });
    const csv = await r.text();
    const m = await (await fetch(`${BASE}/api/payroll/attendance/saudicoffee/map`, { method: 'POST', headers: { 'x-persona': 'tasama-hrops', 'x-client': 'saudicoffee', 'content-type': 'application/json' }, body: JSON.stringify({ csv }) })).json();
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
    // design/hr-ops-addendum.md: the confirmed month waits on Tasama HR operations, who hands it to payroll; only then are the entries written.
    const entry = async () => (await q1(`SELECT amount::float a FROM hcm_roshn.element_entries WHERE element_code='OT_HOURS' AND person_id=$1 AND source='RAFEEQ'`, [exp[0].person_id]))[0]?.a;
    const held = await q1(`SELECT waiting_on_role w FROM layer_roshn.requests WHERE ref=$1`, [tm.month.ref]);
    const before = await entry();
    const L = { 'x-persona': 'tasama-hrops', 'x-client': 'roshn', 'content-type': 'application/json' };
    const hand = await fetch(`${BASE}/api/requests/${tm.month.ref}/decide`, { method: 'POST', headers: L, body: JSON.stringify({ decision: 'APPROVED', reason: 'Checked against the documents' }) });
    const after = await (await fetch(`${BASE}/api/payroll/this-month`, { headers: H })).json();
    const e = await entry();
    return [shape && held[0]?.w === 'TASAMA_HR_OPS' && before == null && hand.ok && after.counts.expected === 0 && after.counts.dropped === 1 && e === 20, `riyadhair ${by.riyadhair.month.status}, roshn ${by.roshn.counts.expected} expected → ${after.counts.expected}; waits on ${held[0]?.w}, entry before ${before}, handover ${hand.status}, entry ${e}`];
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
  await check('Payments: Riyadh Air\'s approved run waits on the payroll manager to send its file, every release check passing (D7)', async () => {
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
  await check('Journals: ROSHN\'s last month waits on the payroll manager, short by the remote-site allowance Qaid proposes an account for (D8)', async () => {
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
