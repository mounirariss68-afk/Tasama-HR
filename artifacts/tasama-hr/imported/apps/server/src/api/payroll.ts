/**
 * The Payroll lens: Tasama's payroll team, across every client
 * (design/payroll-addendum.md §3). Each route reads every client's schemas in
 * turn; a record opens in its own client.
 */
import { Router } from 'express';
import { pool, withClient, tx } from '../db.js';
import { client } from '../domain/rules.js';
import { CLIENTS, allClients, clientByKey } from '../domain/clients.js';
import { DIMENSIONS, payrollPolicy } from '../domain/payroll-policy.js';
import { ELEMENT_CATALOGUE, GROUP_LABEL } from '../domain/elements.js';
import { startCase, decide } from '../engine/core.js';
import { calendarFor, monthStages, monthOn, stagesForMonths } from '../payroll/calendar.js';
import { activeVersion, rulesOf } from '../payroll/policy.js';
import { draftRun, provisionHistory } from '../payroll/run.js';
import { runChecks, reschedule, ask } from '../payroll/checks.js';
import { monthView } from '../payroll/inputs.js';
import { currentRun, frozenRows } from '../payroll/runs.js';
import { payingBank, paymentFiles, valueDateFor, notifyFinance, recordApproval, bankReturnFile, readReturnFile, fileWps, recordMudad, financeApprover } from '../payroll/payments.js';
import { bankByCode } from '../domain/banks.js';
import { journalFile } from '../payroll/journals.js';
import { explain } from '../payroll/differences.js';
import { tasamaTrail } from '../tasama/service.js';
import { packagePdf, packageXlsx, reportsXlsx } from '../payroll/package.js';
import { deviceExport, summaryExport, proposeMap, headersOf, ingest, justify } from '../attendance/service.js';
import { PENALTY_TABLE, FINE_CAP_DAYS } from '../domain/attendance.js';
import { personaOf, isPayrollTeam, isTasama, type Persona, isHrOpsTeam } from './session.js';

export const payroll = Router();
const allowed = (p: Persona) => isPayrollTeam(p) || isHrOpsTeam(p) || isTasama(p);
/** The waiting-on roles that make up a persona's team inbox (design/hr-ops-addendum.md R1). */
const teamRoles = (p: Persona) => (p.roles.includes('TASAMA_HR_OPS') ? ['TASAMA_HR_OPS'] : p.roles.includes('TASAMA_PAYROLL_LEAD') ? ['TASAMA_PAYROLL_LEAD', 'TASAMA_PAYROLL'] : ['TASAMA_PAYROLL']);
const forEachClient = <T>(fn: (key: string) => Promise<T>) => Promise.all(allClients().map((c) => withClient(c.key, () => fn(c.key))));

/** Where every client's month stands: cut-off, approval, pay day. */
payroll.get('/payroll/months', async (req, res) => {
  const p = await personaOf(req);
  if (!allowed(p)) return res.status(403).json({ error: 'The payroll months are visible to Tasama only.' });
  const today = new Date().toISOString().slice(0, 10);
  const rows = await forEachClient(async (key) => {
    const c = clientByKey(key)!;
    const per = (await pool.query(`SELECT * FROM hcm.payroll_periods WHERE status='OPEN' ORDER BY start_date DESC LIMIT 1`)).rows[0];
    const people = (await pool.query(`SELECT COUNT(*)::int n FROM hcm.work_relationships WHERE worker_type='E' AND (end_date IS NULL OR end_date >= $1)`, [today])).rows[0].n;
    const waiting = (await pool.query(`SELECT COUNT(*)::int n FROM layer.requests WHERE status IN ('WAITING','ESCALATED') AND waiting_on_role = ANY($1)`, [teamRoles(p)])).rows[0].n;
    const v = await activeVersion(pool);
    const stage = !per ? 'NONE' : today <= per.cutoff_date ? 'INPUTS' : today <= per.pay_date ? 'RUN' : 'PAID';
    const calendar = await stagesForMonths(today);
    // The calendar sheet's columns (walkthrough addendum R15): who is responsible, the bank, the file's state.
    const bank = per ? await payingBank(per.period_name, key) : null;
    const file = per ? (await pool.query(`SELECT state, reconciliation FROM layer.payments WHERE period_name=$1 AND kind='REGULAR' ORDER BY id DESC LIMIT 1`, [per.period_name])).rows[0] : null;
    return {
      calendar, team: c.team ? { ...c.team, finance: await financeApprover(pool) } : null, bank: bank ? { name: bank.bank.name, name_ar: bank.bank.name_ar } : null,
      fileState: !file ? 'NOT_BUILT' : file.state === 'BUILT' ? 'BUILT' : file.state === 'SENT' ? 'IN_PORTAL' : file.state === 'APPROVED' ? 'APPROVED' : file.reconciliation?.reconciled ? 'RECONCILED' : 'PAID',
      key, short: c.short, name_ar: c.name_ar, hrms: c.hrms, employees: people, period: per?.period_name, start: per?.start_date, end: per?.end_date,
      cutoff: per?.cutoff_date, pay: per?.pay_date, approval: calendar.stages.find((s) => s.key === 'approval')?.date ?? (per ? new Date(new Date(`${per.pay_date}T00:00:00Z`).getTime() - 4 * 86_400_000).toISOString().slice(0, 10) : null),
      stage, waiting, policy: v ? { version: v.version, since: v.effective_from } : null,
    };
  });
  res.json({ today, clients: rows });
});

/** The cases waiting on the persona's Tasama team (payroll, or HR operations), across clients. */
payroll.get('/payroll/inbox', async (req, res) => {
  const p = await personaOf(req);
  if (!allowed(p)) return res.status(403).json({ error: 'Tasama only.' });
  const roles = teamRoles(p);
  const own = p.roles.includes('TASAMA_HR_OPS') ? 'TASAMA_HR_OPS' : p.roles.includes('TASAMA_PAYROLL_LEAD') ? 'TASAMA_PAYROLL_LEAD' : 'TASAMA_PAYROLL';
  const rows = (await forEachClient(async (key) => {
    const r = (await pool.query(
      `SELECT r.id, r.ref, r.workflow_id, r.title, r.title_ar, r.status, r.sla_due, r.created_at, r.waiting_on_role, r.current_step,
              s.display_name AS subject_name, s.display_name_ar AS subject_name_ar, q.display_name AS requester_name
         FROM layer.requests r JOIN hcm.persons s ON s.id=r.subject_person_id JOIN hcm.persons q ON q.id=r.requester_person_id
        WHERE r.status IN ('WAITING','ESCALATED') AND r.waiting_on_role = ANY($1) ORDER BY r.created_at`, [roles])).rows;
    const c = clientByKey(key)!;
    return r.map((x: any) => ({ ...x, client: key, client_short: c.short, client_ar: c.name_ar, mine: x.waiting_on_role === own }));
  })).flat();
  res.json({ rows });
});

/** Every client's active policy: rules, flags, a draft waiting. */
payroll.get('/payroll/policies', async (req, res) => {
  const p = await personaOf(req);
  if (!allowed(p)) return res.status(403).json({ error: 'Tasama only.' });
  const rows = await forEachClient(async (key) => {
    const c = clientByKey(key)!;
    const v = await activeVersion(pool);
    const rules = v ? await rulesOf(pool, v.id) : [];
    const draft = (await pool.query(`SELECT v.*, r.ref, r.status AS case_status, r.current_step FROM layer.policy_versions v LEFT JOIN layer.requests r ON r.id=v.request_id WHERE v.status='DRAFT' ORDER BY v.id DESC LIMIT 1`)).rows[0] ?? null;
    return { key, short: c.short, name_ar: c.name_ar, version: v?.version ?? null, since: v?.effective_from ?? null, activated_by: v?.activated_by ?? null, rules: rules.length,
      dims: new Set(rules.map((r: any) => r.dim)).size, flags: rules.filter((r: any) => r.flag).map((r: any) => ({ key: r.key, label: r.label, flag: r.flag, resolution: r.resolution })), draft };
  });
  res.json({ clients: rows, dimensions: DIMENSIONS });
});

/** One client's policy: the rules of a version by dimension, the versions, the handbook. */
payroll.get('/payroll/policies/:client', async (req, res) => {
  const p = await personaOf(req);
  if (!allowed(p) && !p.roles.includes('CHRO')) return res.status(403).json({ error: 'Not visible to this persona.' });
  const key = req.params.client;
  const c = clientByKey(key);
  if (!c) return res.status(404).json({ error: 'No such client' });
  const out = await withClient(key, async () => {
    const versions = (await pool.query(`SELECT v.*, r.ref FROM layer.policy_versions v LEFT JOIN layer.requests r ON r.id=v.request_id ORDER BY v.id DESC`)).rows;
    const pick = versions.find((v: any) => String(v.id) === String(req.query.version)) ?? versions.find((v: any) => v.status === 'DRAFT') ?? versions.find((v: any) => v.status === 'ACTIVE');
    const rules = pick ? await rulesOf(pool, pick.id) : [];
    const active = versions.find((v: any) => v.status === 'ACTIVE');
    const activeRules = active && pick && active.id !== pick.id ? await rulesOf(pool, active.id) : null;
    const changed = activeRules ? rules.filter((r: any) => { const a = activeRules.find((x: any) => x.key === r.key); return !a || a.value !== r.value || (a.flag ?? null) !== (r.flag ?? null); }).map((r: any) => r.key) : [];
    const clauses = (await pool.query(`SELECT c.id, c.policy_id, c.clause_ref, c.heading, c.heading_ar, c.text_en, c.text_ar FROM layer.policy_clauses c ORDER BY c.policy_id, c.id`)).rows;
    // The element catalogue (walkthrough addendum R6): Tasama's list, the client's extra allowances, and this month's use of each.
    const per = (await pool.query(`SELECT to_char(start_date,'YYYY-MM-DD') s, to_char(end_date,'YYYY-MM-DD') e FROM hcm.payroll_periods WHERE status='OPEN' ORDER BY start_date DESC LIMIT 1`)).rows[0];
    const use = per ? new Map((await pool.query(`SELECT element_code, count(DISTINCT person_id)::int people, SUM(amount)::float total FROM hcm.element_entries WHERE effective_start <= $2 AND effective_end >= $1 GROUP BY 1`, [per.s, per.e])).rows.map((r: any) => [r.element_code, r])) : new Map();
    const extras = payrollPolicy(key).extra.filter((x) => !ELEMENT_CATALOGUE.some((e) => e.code === x.code)).map((x) => ({ code: x.code, name: x.name, name_ar: x.name_ar, group: 'RECURRING_EARNING', gosi: false, eos: x.inEos, termMonths: null, source: 'The client\'s policy', source_ar: 'سياسة العميل' }));
    const elements = [...ELEMENT_CATALOGUE, ...extras].map((e) => ({ ...e, people: use.get(e.code)?.people ?? 0, total: use.get(e.code)?.total ?? 0, groupLabel: GROUP_LABEL[e.group as keyof typeof GROUP_LABEL] }));
    return { versions, version: pick ?? null, rules, changed, clauses, elements };
  });
  res.json({ client: { key, short: c.short, name_ar: c.name_ar, hrms: c.hrms }, dimensions: DIMENSIONS, ...out });
});

/** A client sends a revised handbook: Nizam reads it (WF-26). Used by the screen and by scenario D1. */
payroll.post('/payroll/policies/:client/handbook', async (req, res) => {
  const p = await personaOf(req);
  if (!allowed(p)) return res.status(403).json({ error: 'Tasama only.' });
  const key = req.params.client;
  const c = clientByKey(key);
  if (!c) return res.status(404).json({ error: 'No such client' });
  try {
    const r = await withClient(key, () => tx(async (db) => {
      const people = (await db.query(`SELECT value FROM layer.meta WHERE key='people'`)).rows[0].value;
      const chro = people.persona.chro as number;
      return startCase(db, { workflowId: 'WF-26', type: 'CLIENT_POLICY', title: `${c.short} handbook, revised`, title_ar: `دليل ${c.name_ar} المعدل`, requester: chro, subject: chro, channel: 'FORM',
        payload: { revised: true, source: `${c.short} HR handbook, revised`, effective: new Date().toISOString().slice(0, 10) }, scenario: req.body?.scenario ?? null });
    }));
    res.json(r);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

/** One dimension across every client (POL-07). */
payroll.get('/payroll/policies-compare', async (req, res) => {
  const p = await personaOf(req);
  if (!allowed(p)) return res.status(403).json({ error: 'Tasama only.' });
  const dim = Number(req.query.dim ?? 3);
  const rows = await forEachClient(async (key) => {
    const c = clientByKey(key)!;
    const v = await activeVersion(pool);
    const rules = v ? (await rulesOf(pool, v.id)).filter((r: any) => r.dim === dim) : [];
    return { key, short: c.short, name_ar: c.name_ar, version: v?.version ?? null, rules };
  });
  res.json({ dim: DIMENSIONS.find((d) => d.n === dim), rows });
});

/** Every client's open run: the draft for clients held in Tasama HR; clients on Oracle run their payroll there. */
payroll.get('/payroll/runs', async (req, res) => {
  const p = await personaOf(req);
  if (!allowed(p)) return res.status(403).json({ error: 'Tasama only.' });
  const rows = await forEachClient(async (key) => {
    const c = clientByKey(key)!;
    const d = await draftRun(pool);
    const run = await currentRun(pool);
    if (!d) return { key, short: c.short, name_ar: c.name_ar, hrms: c.hrms, draft: null };
    const blocks = (await runChecks(pool, d)).checks.filter((x) => x.severity === 'BLOCK').length;
    const prevNet = d.rows.reduce((n, r) => n + (r.prev_net ?? 0), 0);
    return { key, short: c.short, name_ar: c.name_ar, hrms: c.hrms, run: run ? { state: run.state, ref: run.ref } : null, draft: { period: d.period, people: d.rows.length, gross: d.totals.gross, net: d.totals.net, prev_net: Math.round(prevNet * 100) / 100, blocks, version: d.version } };
  });
  res.json({ clients: rows });
});

/** One client's draft run, its checks and its provisions. */
payroll.get('/payroll/runs/:client', async (req, res) => {
  const p = await personaOf(req);
  if (!allowed(p)) return res.status(403).json({ error: 'Tasama only.' });
  const c = clientByKey(req.params.client);
  if (!c) return res.status(404).json({ error: 'No such client' });
  const out = await withClient(c.key, async () => {
    const run = await currentRun(pool);
    let draft = await draftRun(pool);
    // From "Send for validation" on, the run shows its frozen lines: what is approved is what is paid (§18).
    if (draft && run && !['DRAFT', 'RETURNED'].includes(run.state)) draft = { ...draft, rows: await frozenRows(pool, run.id), totals: run.totals };
    const differences = run?.differences ?? (draft ? await explain(pool, draft.period) : null);
    return { draft, run, differences, history: await provisionHistory(pool), review: draft ? await runChecks(pool, draft) : null };
  });
  res.json({ client: { key: c.key, short: c.short, name_ar: c.name_ar, hrms: c.hrms }, ...out });
});

/** Act on a check (§16): Tasama reschedules an advance to the legal limit, or asks the client's HR operations. */
payroll.post('/payroll/runs/:client/checks/:person/:action', async (req, res) => {
  const p = await personaOf(req);
  if (!isPayrollTeam(p)) return res.status(403).json({ error: 'Only Tasama payroll acts on a run\'s checks.' });
  const c = clientByKey(req.params.client);
  if (!c) return res.status(404).json({ error: 'No such client run' });
  const personId = Number(req.params.person);
  try {
    const out = await withClient(c.key, () => tx(async (db) => {
      const draft = await draftRun(db);
      if (!draft) throw new Error('No open month for this client.');
      if (req.params.action === 'reschedule') return { summary: (await reschedule(db, draft, personId, p.display_name)).summary };
      if (req.params.action === 'ask') { const k = await ask(db, draft, personId, p.display_name, c.short); return { ref: k.ref, summary: `Asked HR operations at ${c.short}.` }; }
      if (req.params.action === 'raise') { const k = await ask(db, draft, personId, p.display_name, c.short, 'HR_OPS'); return { ref: k.ref, summary: `Raised to Tasama HR operations for ${c.short}.` }; }
      throw new Error('Unknown action');
    }));
    await tasamaTrail(pool, { client_key: c.key, actor_type: 'HUMAN', actor_id: p.key, actor_name: p.display_name, act: ['ask', 'raise'].includes(req.params.action) ? 'NUDGE' : 'WRITE', summary: out.summary, summary_ar: out.summary, ref: (out as any).ref ?? null });
    res.json(out);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

/** Start the month's run once the cut-off has passed (WF-30, §18). */
payroll.post('/payroll/runs/:client/start', async (req, res) => {
  const p = await personaOf(req);
  if (!isPayrollTeam(p)) return res.status(403).json({ error: 'Only Tasama payroll starts a run.' });
  const c = clientByKey(req.params.client);
  if (!c) return res.status(404).json({ error: 'No such client' });
  try {
    const out = await withClient(c.key, async () => {
      const run = await currentRun(pool);
      if (run && run.state !== 'RETURNED') throw new Error(`This month's run is already ${run.state.toLowerCase()} (${run.ref}).`);
      const per = (await pool.query(`SELECT period_name FROM hcm.payroll_periods WHERE status='OPEN' ORDER BY start_date DESC LIMIT 1`)).rows[0];
      const ops = (await pool.query(`SELECT value FROM layer.meta WHERE key='people'`)).rows[0].value.persona.payroll;
      const month = new Date(`${per.period_name}-01T00:00:00Z`).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
      return tx((db) => startCase(db, { workflowId: 'WF-30', type: 'RUN', title: `${c.short} payroll, ${month}`, title_ar: `رواتب ${c.name_ar}`, requester: ops, subject: ops, channel: 'FORM', payload: { period: per.period_name } }));
    });
    res.json({ ref: out.ref });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

/* ------------------------------------------------------------------ Inputs (WF-27, §17) */

/** Every client's month of changes: confirmed, expected before the cut-off, moved to next month. */
payroll.get('/payroll/inputs', async (req, res) => {
  const p = await personaOf(req);
  if (!allowed(p)) return res.status(403).json({ error: 'Tasama only.' });
  const today = new Date().toISOString().slice(0, 10);
  const clients = await forEachClient(async (key) => {
    const c = clientByKey(key)!;
    const v = await monthView(pool);
    return { key, short: c.short, name_ar: c.name_ar, hrms: c.hrms, hrmsLabel: c.hrmsLabel, ...(v ?? {}), passed: v ? v.period.cutoff < today : false };
  });
  res.json({ today, clients });
});

/** The client's own month (HR Workspace › Payroll › This month). */
payroll.get('/payroll/this-month', async (req, res) => {
  const p = await personaOf(req);
  // Tasama HR operations reads it too, to follow the client's changes up (design/hr-ops-addendum.md, pass 3).
  if (!p.roles.some((r) => ['PAYROLL', 'CHRO', 'TASAMA_HR_OPS'].includes(r))) return res.status(403).json({ error: 'HR operations and the CHRO only.' });
  const v = await monthView(pool);
  res.json({ today: new Date().toISOString().slice(0, 10), ...(v ?? {}) });
});

/** The client's view of this month's run and why it differs from last month (HR Workspace › Payroll › Approval). */
payroll.get('/payroll/approval', async (req, res) => {
  const p = await personaOf(req);
  if (!p.roles.some((r) => ['PAYROLL', 'CHRO'].includes(r))) return res.status(403).json({ error: 'HR operations and the CHRO only.' });
  const run = await currentRun(pool);
  const d = await draftRun(pool);
  res.json({ period: d?.period ?? null, run, totals: run?.totals ?? d?.totals ?? null, differences: run?.differences ?? null });
});

/** The client's payroll calendar for the year (HR Workspace › Payroll › Calendar; design/walkthrough-addendum.md item 5). */
payroll.get('/payroll/calendar', async (req, res) => {
  const p = await personaOf(req);
  if (!p.roles.some((r) => ['PAYROLL', 'CHRO', 'FINANCE', 'TASAMA_HR_OPS', 'TASAMA_PAYROLL', 'TASAMA_PAYROLL_LEAD'].includes(r))) return res.status(403).json({ error: 'The payroll calendar is for HR operations, the CHRO, finance and Tasama.' });
  const today = new Date().toISOString().slice(0, 10);
  const year = Number(req.query.year ?? today.slice(0, 4));
  const k = await calendarFor(pool, year);
  const open = monthOn(k.months, today);
  res.json({ today, year, status: k.onFile ? k.status : 'NONE', ref: k.ref ?? null, approved_by: k.approved_by, approved_at: k.approved_at, canApprove: k.onFile && k.status === 'PROPOSED' && p.roles.includes('PAYROLL'),
    months: k.months.map((m) => ({ period: m.period, open: m.period === open?.period, stages: monthStages(m, today) })) });
});

/** The client's HR operations approves the year's calendar from the Calendar tab (WF-38 `approve`). */
payroll.post('/payroll/calendar/approve', async (req, res) => {
  const p = await personaOf(req);
  if (!p.roles.includes('PAYROLL')) return res.status(403).json({ error: 'The client\'s HR operations approves the calendar.' });
  const year = Number(req.body?.year ?? new Date().getUTCFullYear());
  const k = (await pool.query(`SELECT request_id FROM layer.payroll_calendar WHERE year=$1 AND status='PROPOSED'`, [year])).rows[0];
  if (!k?.request_id) return res.status(409).json({ error: `${year}'s calendar is not waiting for approval.` });
  await tx((c) => decide(c, { requestId: k.request_id, personId: p.person_id, decision: 'APPROVED', reason: req.body?.reason ?? 'The dates work for us' }));
  res.json({ ok: true });
});

/** Net pay and employer cost by month (HR Workspace › Payroll › Reports). */
payroll.get('/payroll/reports', async (req, res) => {
  const p = await personaOf(req);
  if (!p.roles.some((r) => ['PAYROLL', 'CHRO'].includes(r))) return res.status(403).json({ error: 'HR operations and the CHRO only.' });
  const rows = (await pool.query(`SELECT pp.period_name, COUNT(r.*)::int people, SUM(r.gross)::float gross, SUM(r.net)::float net, SUM(r.employer_contributions)::float employer
      FROM hcm.payroll_periods pp JOIN hcm.payroll_results r ON r.period_id=pp.id GROUP BY pp.period_name, pp.start_date ORDER BY pp.start_date`)).rows;
  res.json({ months: rows, departments: await departmentSummary() });
});

/* ------------------------------------------------------------------ Attendance (WF-29) */

const d10 = (v: any) => (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10);

/** The month as Hudoor read it: per person, the day strip, the fine against the cap and the unpaid days. */
async function attendanceView() {
  const up = (await pool.query(`SELECT u.*, r.ref, r.status AS case_status, r.current_step FROM layer.attendance_uploads u LEFT JOIN layer.requests r ON r.id=u.request_id ORDER BY u.id DESC LIMIT 1`)).rows[0];
  if (!up) return null;
  const days = (await pool.query(`SELECT person_id, to_char(day,'YYYY-MM-DD') AS day, status, minutes_late, justification, decision, unpaid_days::float unpaid, fine::float fine, to_char(first_in,'HH24:MI') first_in FROM layer.attendance_days WHERE upload_id=$1 ORDER BY person_id, day`, [up.id])).rows;
  const ids = [...new Set(days.map((d: any) => d.person_id))];
  const ppl = new Map((await pool.query(`SELECT p.id, p.display_name, p.display_name_ar, d.name dept, (SELECT SUM(amount)::float FROM hcm.element_entries e WHERE e.person_id=p.id AND e.element_code IN ('BASIC','HOUSING','TRANSPORT','OTHER_ALW') AND e.effective_start <= $2 AND e.effective_end >= $2) wage
      FROM hcm.persons p LEFT JOIN hcm.assignments a ON a.person_id=p.id AND a.effective_end='4712-12-31' LEFT JOIN hcm.departments d ON d.id=a.department_id WHERE p.id = ANY($1)`, [ids, d10(up.period_end)])).rows.map((r: any) => [r.id, r]));
  const people = ids.map((id) => {
    const mine = days.filter((d: any) => d.person_id === id);
    const p: any = ppl.get(id) ?? {};
    const before = Math.round(mine.reduce((s: number, d: any) => s + d.fine, 0) * 100) / 100;
    const cap = Math.round(FINE_CAP_DAYS * (p.wage ?? 0) / 30 * 100) / 100;
    return { person_id: id, name: p.display_name, name_ar: p.display_name_ar, dept: p.dept, lates: mine.filter((d: any) => d.status === 'LATE').length, absences: mine.filter((d: any) => d.status === 'ABSENT').length,
      leave: mine.filter((d: any) => d.status === 'LEAVE').length, fine_before: before, cap, fine: Math.min(before, cap), unpaid_days: mine.reduce((s: number, d: any) => s + d.unpaid, 0), daily: Math.round((p.wage ?? 0) / 30 * 100) / 100,
      explained: mine.filter((d: any) => d.justification).map((d: any) => ({ day: d.day, text: d.justification, decision: d.decision })),
      strip: mine.map((d: any) => ({ day: d.day, s: d.status, m: d.minutes_late, f: d.fine })) };
  });
  const flagged = people.filter((p) => p.lates || p.absences || p.leave).sort((a, b) => (b.fine_before + b.unpaid_days * b.daily) - (a.fine_before + a.unpaid_days * a.daily));
  const sum = (k: string) => days.filter((d: any) => d.status === k).length;
  return {
    upload: { id: up.id, file: up.file_name, device: up.device, from: d10(up.period_start), to: d10(up.period_end), rows: up.rows, map: up.column_map, status: up.status, by: up.uploaded_by, ref: up.ref, case_status: up.case_status },
    totals: { people: ids.length, lates: sum('LATE'), absences: sum('ABSENT'), leave: sum('LEAVE'), fines: Math.round(people.reduce((s, p) => s + p.fine, 0) * 100) / 100, unpaid_days: people.reduce((s, p) => s + p.unpaid_days, 0), capped: people.filter((p) => p.fine_before > p.cap).length, explained: people.reduce((s, p) => s + p.explained.length, 0) },
    people: flagged, table: PENALTY_TABLE, capDays: FINE_CAP_DAYS,
  };
}

payroll.get('/payroll/attendance', async (req, res) => {
  const p = await personaOf(req);
  if (!allowed(p)) return res.status(403).json({ error: 'Tasama only.' });
  const rows = await forEachClient(async (key) => {
    const c = clientByKey(key)!;
    const up = (await pool.query(`SELECT u.status, u.period_start, r.status AS case_status FROM layer.attendance_uploads u LEFT JOIN layer.requests r ON r.id=u.request_id ORDER BY u.id DESC LIMIT 1`)).rows[0];
    const expected = c.hrms === 'PLATFORM' && (await pool.query(`SELECT 1 FROM layer.meta WHERE key='attendance'`)).rowCount;
    return { key, short: c.short, name_ar: c.name_ar, hrms: c.hrms, upload: up ? { status: up.status, case_status: up.case_status, month: d10(up.period_start).slice(0, 7) } : null, expected: Boolean(expected) };
  });
  res.json({ clients: rows });
});

payroll.get('/payroll/attendance/:client', async (req, res) => {
  const p = await personaOf(req);
  if (!allowed(p) && !p.roles.includes('PAYROLL')) return res.status(403).json({ error: 'Not visible to this persona.' });
  const c = clientByKey(req.params.client);
  if (!c) return res.status(404).json({ error: 'No such client' });
  const view = await withClient(c.key, async () => attendanceView());
  res.json({ client: { key: c.key, short: c.short, name_ar: c.name_ar, hrms: c.hrms }, ...(view ?? { upload: null }) });
});

/** The client's device export for the month, as a file (the demo stands in for the client's shared folder). */
payroll.get('/payroll/attendance/:client/export', async (req, res) => {
  const c = clientByKey(req.params.client);
  if (!c) return res.status(404).json({ error: 'No such client' });
  const f = await withClient(c.key, async () => (req.query.kind === 'summary' ? summaryExport(pool) : deviceExport(pool)));
  if (!f) return res.status(404).json({ error: 'No device export for this client this month.' });
  res.setHeader('content-type', 'text/csv; charset=utf-8');
  res.setHeader('content-disposition', `attachment; filename="${f.fileName}"`);
  res.send(f.csv);
});

/** Hudoor proposes how the file's own columns map to ours; a person confirms. */
payroll.post('/payroll/attendance/:client/map', async (req, res) => {
  const p = await personaOf(req);
  if (!isHrOpsTeam(p) && !isTasama(p)) return res.status(403).json({ error: 'Tasama HR operations uploads the attendance file.' });
  const csv = String(req.body?.csv ?? '');
  if (!csv.trim()) return res.status(400).json({ error: 'The file is empty.' });
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  const map = proposeMap(csv);
  res.json({ headers: headersOf(csv), map, summary: map.kind === 'SUMMARY', sample: lines.slice(1, 4).map((l) => l.split(',')), rows: lines.length - 1 });
});

/** Store the punches and open the attendance month (WF-29): Hudoor reads it at once. */
payroll.post('/payroll/attendance/:client/upload', async (req, res) => {
  const p = await personaOf(req);
  if (!isHrOpsTeam(p) && !isTasama(p)) return res.status(403).json({ error: 'Tasama HR operations uploads the attendance file.' });
  const c = clientByKey(req.params.client);
  if (!c) return res.status(404).json({ error: 'No such client' });
  try {
    const out = await withClient(c.key, () => tx(async (db) => {
      const csv = String(req.body?.csv ?? '');
      const map = req.body?.map ?? proposeMap(csv);
      const up = await ingest(db, { fileName: String(req.body?.fileName ?? 'attendance.csv'), csv, map, by: p.display_name, month: req.body?.month });
      const people = (await db.query(`SELECT value FROM layer.meta WHERE key='people'`)).rows[0].value;
      const ops = people.persona.payroll as number;
      const k = await startCase(db, { workflowId: 'WF-29', type: 'ATTENDANCE_MONTH', title: `${c.short} attendance, ${req.body?.month ?? 'last month'}`, title_ar: `حضور ${c.name_ar}`, requester: ops, subject: ops, channel: 'FORM',
        payload: { upload_id: up.uploadId, rows: up.rows, file: req.body?.fileName ?? 'attendance.csv' }, scenario: req.body?.scenario ?? null });
      return { ...up, ref: k.ref };
    }));
    res.json(out);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

/** The employee's own late or absent days in the month being read, to explain before any fine (Art. 71). */
payroll.get('/attendance/mine', async (req, res) => {
  const p = await personaOf(req);
  const rows = (await pool.query(`SELECT to_char(d.day,'YYYY-MM-DD') AS day, d.status, d.minutes_late, to_char(d.first_in,'HH24:MI') first_in, d.justification, d.decision
      FROM layer.attendance_days d JOIN layer.attendance_uploads u ON u.id=d.upload_id WHERE u.status='READ' AND d.person_id=$1 AND d.status IN ('LATE','ABSENT') ORDER BY d.day`, [p.person_id])).rows;
  res.json({ rows });
});
payroll.post('/attendance/mine/justify', async (req, res) => {
  const p = await personaOf(req);
  try { res.json(await justify(pool, p.person_id, String(req.body?.day), String(req.body?.text ?? '').slice(0, 500))); } catch (e: any) { res.status(400).json({ error: e.message }); }
});

/* ------------------------------------------------------------------ Payments (§20, WF-33) */

/** Every client's month from approved run to WPS: what is sent, approved in the bank, paid and accepted. */
payroll.get('/payroll/payments', async (req, res) => {
  const p = await personaOf(req);
  if (!allowed(p)) return res.status(403).json({ error: 'Tasama only.' });
  const rows = await forEachClient(async (key) => {
    const c = clientByKey(key)!;
    const per = (await pool.query(`SELECT period_name, to_char(pay_date,'YYYY-MM-DD') pay FROM hcm.payroll_periods WHERE status='OPEN' ORDER BY start_date DESC LIMIT 1`)).rows[0];
    const run = await currentRun(pool);
    const pb = await payingBank(per?.period_name ?? '9999-12', key);
    const pays = (await pool.query(`SELECT p.*, to_char(p.value_date,'YYYY-MM-DD') vd, r.ref, r.status case_status, r.current_step,
        (SELECT count(*)::int FROM layer.payment_lines l WHERE l.payment_id=p.id AND l.status='PAID') paid,
        (SELECT count(*)::int FROM layer.payment_lines l WHERE l.payment_id=p.id AND l.status='FAILED') failed
      FROM layer.payments p LEFT JOIN layer.requests r ON r.id=p.request_id WHERE p.period_name=$1 ORDER BY p.id`, [per?.period_name])).rows;
    const history = (await pool.query(`SELECT period_name, state, wps_state, mudad_state, lines, total, to_char(value_date,'YYYY-MM-DD') vd FROM layer.payments WHERE period_name < $1 AND kind='REGULAR' ORDER BY period_name DESC LIMIT 6`, [per?.period_name ?? '9999'])).rows;
    const approved = run && run.state === 'APPROVED' ? { people: run.people, net: Number(run.totals?.net ?? 0) } : null;
    const v = per ? valueDateFor(per.pay) : null;
    return { key, short: c.short, name_ar: c.name_ar, period: per?.period_name ?? null, pay: per?.pay ?? null, valueDate: v?.valueDate ?? null, moved: v?.moved ?? false,
      bank: { name: pb.bank.name, name_ar: pb.bank.name_ar }, format: { name: pb.format.name, name_ar: pb.format.name_ar, illustrative: pb.format.illustrative },
      run: run ? { state: run.state, people: run.people, net: Number(run.totals?.net ?? 0) } : null, approved,
      payments: pays.map((x: any) => ({ id: x.id, kind: x.kind, ref: x.ref, case_status: x.case_status, step: x.current_step, state: x.state, wps: x.wps_state, mudad: x.mudad_state, lines: x.lines, total: Number(x.total), paid: x.paid, failed: x.failed, valueDate: x.vd, blocked: (x.checks ?? []).filter((k: any) => !k.ok).length })),
      history: history.map((h: any) => ({ period: h.period_name, state: h.state, wps: h.wps_state, mudad: h.mudad_state, lines: h.lines, total: Number(h.total), valueDate: h.vd })) };
  });
  res.json({ clients: rows });
});

/** One payment: its checks, its lines (failed first) and the two files side by side. */
payroll.get('/payroll/payments/:client/:id', async (req, res) => {
  const p = await personaOf(req);
  if (!allowed(p)) return res.status(403).json({ error: 'Tasama only.' });
  const c = clientByKey(req.params.client);
  if (!c) return res.status(404).json({ error: 'No such client' });
  const out = await withClient(c.key, async () => {
    const f = await paymentFiles(pool, Number(req.params.id));
    if (!f) return null;
    const lines = (await pool.query(`SELECT l.*, p.display_name_ar FROM layer.payment_lines l LEFT JOIN hcm.persons p ON p.id=l.person_id WHERE l.payment_id=$1 ORDER BY (l.status IN ('FAILED','REPAID')) DESC, l.employee_no`, [f.payment.id])).rows;
    const head = (t: string, n = 6) => t.split(/\r?\n/).slice(0, n).join('\n');
    const followUps = (await pool.query(`SELECT p.id, p.state, p.lines, p.total, to_char(p.value_date,'YYYY-MM-DD') vd, p.wps_state, p.mudad_state, r.ref, r.status FROM layer.payments p LEFT JOIN layer.requests r ON r.id=p.request_id WHERE p.follow_up_of=$1 ORDER BY p.id`, [f.payment.id])).rows
      .map((x: any) => ({ id: x.id, state: x.state, lines: x.lines, total: Number(x.total), valueDate: x.vd, wps: x.wps_state, mudad: x.mudad_state, ref: x.ref, case_status: x.status }));
    const counts = (await pool.query(`SELECT count(*) FILTER (WHERE status='PAID')::int paid, count(*) FILTER (WHERE status='FAILED')::int failed, count(*) FILTER (WHERE status='REPAID')::int repaid FROM layer.payment_lines WHERE payment_id=$1`, [f.payment.id])).rows[0];
    const req0 = f.payment.request_id ? (await pool.query(`SELECT ref, status, current_step FROM layer.requests WHERE id=$1`, [f.payment.request_id])).rows[0] : null;
    return {
      payment: { ...f.payment, total: Number(f.payment.total), value_date: f.payment.vd, case: req0 }, followUps, counts,
      bank: { name: f.bank.name, format: f.bank.format.name, format_ar: f.bank.format.name_ar, basis: f.bank.format.basis, illustrative: f.bank.format.illustrative, preview: head(f.bank.text), lines: f.bank.text.split(/\r?\n/).filter(Boolean).length },
      wps: { name: f.wps.name, format: f.wps.format.name, format_ar: f.wps.format.name_ar, basis: f.wps.format.basis, preview: head(f.wps.text), lines: f.wps.text.split(/\r?\n/).filter(Boolean).length },
      match: f.match,
      lines: lines.map((l: any) => ({ person_id: l.person_id, no: l.employee_no, name: l.name, name_ar: l.display_name_ar, iban: `${String(l.iban).slice(0, 4)} •••• ${String(l.iban).slice(-4)}`, bank: bankByCode(l.bank_code)?.name ?? '—', bank_ar: bankByCode(l.bank_code)?.name_ar ?? '—', amount: Number(l.amount), status: l.status, reason: l.reason, reason_ar: l.reason_ar })),
    };
  });
  if (!out) return res.status(404).json({ error: 'No such payment' });
  res.json({ client: { key: c.key, short: c.short, name_ar: c.name_ar }, ...out });
});

/** Downloads the bank file or the WPS file of a payment, written from its lines. */
payroll.get('/payroll/payments/:client/:id/file/:which', async (req, res) => {
  const p = await personaOf(req);
  if (!allowed(p)) return res.status(403).json({ error: 'Tasama only.' });
  const c = clientByKey(req.params.client);
  if (!c) return res.status(404).json({ error: 'No such client' });
  const f = await withClient(c.key, () => paymentFiles(pool, Number(req.params.id)));
  if (!f) return res.status(404).json({ error: 'No such payment' });
  const file = req.params.which === 'wps' ? f.wps : f.bank;
  res.setHeader('content-type', `${file.format.type === 'CSV' ? 'text/csv' : 'text/plain'}; charset=utf-8`);
  res.setHeader('content-disposition', `attachment; filename="${file.name}"`);
  res.send(file.text);
});

/* ------------------------------------------------------------------ Tasama HR operations: each employee's document set (design/payroll-ops-addendum.md 1.5, 1.7) */

const DOC_LABEL: Record<string, [string, string]> = { CONTRACT: ['Contract', 'العقد'], NATIONAL_ID: ['National ID', 'الهوية الوطنية'], IQAMA: ['Iqama', 'الإقامة'], IBAN_LETTER: ['IBAN letter', 'خطاب الآيبان'] };

/** Every client's document gaps and record checks; the selected client's people who miss something. */
payroll.get('/hrops/documents', async (req, res) => {
  const p = await personaOf(req);
  if (!isHrOpsTeam(p) && !isTasama(p)) return res.status(403).json({ error: 'Tasama HR operations only.' });
  const sel = String(req.query.client ?? '');
  const { ibanValid } = await import('../domain/banks.js');
  const rows = await forEachClient(async (key) => {
    const c = clientByKey(key)!;
    const people = (await pool.query(`SELECT count(DISTINCT person_id)::int n FROM layer.employee_documents`)).rows[0].n;
    const by = (await pool.query(`SELECT kind, status, count(*)::int n FROM layer.employee_documents GROUP BY 1,2`)).rows;
    const expiring = (await pool.query(`SELECT count(*)::int n FROM layer.employee_documents WHERE status='RECEIVED' AND expires_on IS NOT NULL AND expires_on <= CURRENT_DATE + 60`)).rows[0].n;
    const ibans = (await pool.query(`SELECT p.iban FROM hcm.persons p JOIN hcm.work_relationships wr ON wr.person_id=p.id WHERE wr.end_date IS NULL AND p.iban IS NOT NULL`)).rows;
    const badIban = ibans.filter((x: any) => !ibanValid(x.iban)).length;
    const ops = (await pool.query(`SELECT p.display_name FROM layer.personas pe JOIN hcm.persons p ON p.id=pe.person_id WHERE pe.key='payroll'`)).rows[0]?.display_name ?? null;
    const gaps = key === sel ? (await pool.query(`SELECT d.id, d.kind, d.status, to_char(d.requested_on,'YYYY-MM-DD') requested_on, to_char(d.expires_on,'YYYY-MM-DD') expires_on, p.display_name name, p.display_name_ar name_ar, p.person_number, d.person_id
        FROM layer.employee_documents d JOIN hcm.persons p ON p.id=d.person_id WHERE d.status IN ('MISSING','REQUESTED') OR (d.expires_on IS NOT NULL AND d.expires_on <= CURRENT_DATE + 60) ORDER BY d.status DESC, p.display_name`)).rows
      .map((g: any) => ({ ...g, label: DOC_LABEL[g.kind]?.[0] ?? g.kind, label_ar: DOC_LABEL[g.kind]?.[1] ?? g.kind })) : null;
    const count = (st: string) => by.filter((x: any) => x.status === st).reduce((s: number, x: any) => s + x.n, 0);
    return { key, short: c.short, name_ar: c.name_ar, hrOps: c.contract.services.includes('HR_OPS'), ops, people, received: count('RECEIVED'), missing: count('MISSING'), requested: count('REQUESTED'), expiring, badIban,
      byKind: Object.keys(DOC_LABEL).map((k) => ({ kind: k, label: DOC_LABEL[k][0], label_ar: DOC_LABEL[k][1], missing: by.filter((x: any) => x.kind === k && x.status !== 'RECEIVED').reduce((s: number, x: any) => s + x.n, 0) })).filter((x) => x.missing),
      gaps };
  });
  res.json({ clients: rows });
});

/** Ask the client's HR operations for a missing document, or record that it arrived. */
payroll.post('/hrops/documents/:client/:id/:action', async (req, res) => {
  const p = await personaOf(req);
  if (!isHrOpsTeam(p) && !isTasama(p)) return res.status(403).json({ error: 'Tasama HR operations only.' });
  const c = clientByKey(req.params.client);
  if (!c) return res.status(404).json({ error: 'No such client' });
  try {
    const out = await withClient(c.key, () => tx(async (db) => {
      const d = (await db.query(`SELECT d.*, p.display_name FROM layer.employee_documents d JOIN hcm.persons p ON p.id=d.person_id WHERE d.id=$1`, [Number(req.params.id)])).rows[0];
      if (!d) throw new Error('No such document.');
      const label = (DOC_LABEL[d.kind]?.[0] ?? d.kind).toLowerCase();
      if (req.params.action === 'ask') {
        await db.query(`UPDATE layer.employee_documents SET status='REQUESTED', requested_on=CURRENT_DATE WHERE id=$1`, [d.id]);
        const ops = (await db.query(`SELECT person_id FROM layer.personas WHERE key='payroll'`)).rows[0]?.person_id;
        if (ops) await db.query(`INSERT INTO layer.notifications (person_id, title, title_ar, body, link, created_at) VALUES ($1,$2,$3,$4,NULL,now())`,
          [ops, `Tasama needs ${d.display_name}'s ${label}`, `تحتاج تسامى ${DOC_LABEL[d.kind]?.[1] ?? d.kind} للموظف ${d.display_name}`, `${p.display_name}, Tasama HR operations: please send it by email or upload it to the shared folder.`]);
        return { summary: `Asked ${c.short} for ${d.display_name}'s ${label}.` };
      }
      if (req.params.action === 'received') {
        await db.query(`UPDATE layer.employee_documents SET status='RECEIVED', received_on=CURRENT_DATE, file_name=$2 WHERE id=$1`, [d.id, `${d.display_name} ${label}.pdf`]);
        return { summary: `Filed ${d.display_name}'s ${label}.` };
      }
      throw new Error('Unknown action');
    }));
    await tasamaTrail(pool, { client_key: c.key, actor_type: 'HUMAN', actor_id: p.key, actor_name: p.display_name, act: 'WRITE', summary: out.summary, summary_ar: out.summary, ref: null });
    res.json(out);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

/* ------------------------------------------------------------------ the payroll package and the month's documents (design/payroll-ops-addendum.md 2.9, 2.11) */

async function sendPackage(res: any, key: string, fmt: string) {
  const f = await withClient(key, () => (fmt === 'xlsx' ? packageXlsx(pool) : packagePdf(pool)));
  if (!f) return res.status(404).json({ error: 'No open month for this client.' });
  res.setHeader('content-type', fmt === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf');
  res.setHeader('content-disposition', `attachment; filename="${f.name}"`);
  res.send(f.buf);
}

/** Tasama's copy of a client's payroll package. */
payroll.get('/payroll/runs/:client/package/:fmt', async (req, res) => {
  const p = await personaOf(req);
  if (!allowed(p)) return res.status(403).json({ error: 'Tasama only.' });
  const c = clientByKey(req.params.client);
  if (!c) return res.status(404).json({ error: 'No such client' });
  await sendPackage(res, c.key, req.params.fmt);
});

/** The client's copy: its HR operations, CHRO and finance controller. */
payroll.get('/payroll/package/:fmt', async (req, res) => {
  const p = await personaOf(req);
  if (!p.roles.some((r) => ['PAYROLL', 'CHRO'].includes(r)) && !p.lenses.includes('fin')) return res.status(403).json({ error: 'The client\'s HR operations, CHRO and finance only.' });
  await sendPackage(res, client().key, req.params.fmt);
});

/** Everything filed for a client's month: the package and its approval, the bank file, the WPS file, the bank's report, Mudad and the journals. */
payroll.get('/payroll/runs/:client/documents', async (req, res) => {
  const p = await personaOf(req);
  if (!allowed(p)) return res.status(403).json({ error: 'Tasama only.' });
  const c = clientByKey(req.params.client);
  if (!c) return res.status(404).json({ error: 'No such client' });
  const out = await withClient(c.key, async () => {
    const run = await currentRun(pool);
    const per = (await pool.query(`SELECT period_name FROM hcm.payroll_periods WHERE status='OPEN' ORDER BY start_date DESC LIMIT 1`)).rows[0];
    const pays = (await pool.query(`SELECT id, kind, file_name, state, sent_by, sent_at, approved_by, approved_at, feedback_at, wps_state, wps_at, mudad_state, mudad_at, mudad_ref, mudad_by FROM layer.payments WHERE period_name=$1 ORDER BY id`, [per?.period_name])).rows;
    const journals = (await pool.query(`SELECT count(*)::int n, count(*) FILTER (WHERE state='POSTED')::int posted FROM layer.journals WHERE period_name=$1`, [per?.period_name])).rows[0];
    const docs: any[] = [];
    docs.push({ key: 'package-pdf', label: 'Payroll package: summary and sign-offs (PDF)', state: run?.state === 'APPROVED' ? 'Approved' : run ? 'Before approval' : 'Draft', who: run?.approver ?? null, at: run?.approved_at ?? null, href: `/api/payroll/runs/${c.key}/package/pdf` });
    docs.push({ key: 'package-xlsx', label: 'Payroll package: every line (Excel)', state: run?.state === 'APPROVED' ? 'Approved' : run ? 'Before approval' : 'Draft', who: null, at: null, href: `/api/payroll/runs/${c.key}/package/xlsx` });
    for (const x of pays) {
      const fu = x.kind === 'FOLLOW_UP' ? ' (follow-up)' : '';
      docs.push({ key: `bank-${x.id}`, label: `Bank file${fu}: ${x.file_name}`, state: x.approved_at ? 'Approved in the bank' : x.sent_at ? 'Uploaded to the portal' : 'Built', who: x.approved_by ?? x.sent_by, at: x.approved_at ?? x.sent_at, href: `/api/payroll/payments/${c.key}/${x.id}/file/bank` });
      docs.push({ key: `wps-${x.id}`, label: `WPS file${fu}`, state: x.wps_state === 'ACCEPTED' ? 'Signed copy filed' : 'Written', who: null, at: x.wps_at, href: `/api/payroll/payments/${c.key}/${x.id}/file/wps` });
      if (x.feedback_at) docs.push({ key: `ret-${x.id}`, label: `The bank's return file${fu}`, state: x.state === 'PART_FAILED' ? 'Read, with returns' : 'Read', who: null, at: x.feedback_at, href: `/api/payroll/payments/${c.key}/${x.id}/return-file` });
      if (x.mudad_state !== 'WAITING') docs.push({ key: `mudad-${x.id}`, label: `Mudad${fu}${x.mudad_ref ? `: ${x.mudad_ref}` : ''}`, state: x.mudad_state === 'ACKNOWLEDGED' ? 'Acknowledged' : 'Uploaded', who: x.mudad_by, at: x.mudad_at, href: null });
    }
    if (journals?.n) docs.push({ key: 'journals', label: `Journals: ${journals.n}`, state: journals.posted === journals.n ? 'Posted' : 'Waiting', who: null, at: null, href: null });
    return { period: per?.period_name ?? null, docs };
  });
  res.json(out);
});

/* ------------------------------------------------------------------ the bank by file (design/payroll-ops-addendum.md §2) */

/** Tasama's next step on a payment, recorded by a person: remind the client's finance, read the return file, file the WPS file, record Mudad. */
payroll.post('/payroll/payments/:client/:id/:step', async (req, res) => {
  const p = await personaOf(req);
  if (!isPayrollTeam(p) && !isTasama(p)) return res.status(403).json({ error: 'Tasama payroll records the bank\'s reports.' });
  const c = clientByKey(req.params.client);
  if (!c) return res.status(404).json({ error: 'No such client' });
  const id = Number(req.params.id);
  try {
    const out = await withClient(c.key, () => tx(async (db) => {
      switch (req.params.step) {
        case 'remind': await notifyFinance(db, id, true); return { summary: `Reminded ${await financeApprover(db)} to approve the file in the bank.` };
        case 'return': {
          const csv = String(req.body?.csv ?? '') || (await bankReturnFile(db, id))?.text || '';
          const r = await readReturnFile(db, id, csv);
          return { summary: `Read the bank's return file: ${r.paid} paid${r.failed ? `, ${r.failed} returned and asked for a new IBAN` : ''}.`, asked: r.asked };
        }
        case 'wps': { const w = await fileWps(db, id); return { summary: w.ok ? 'Filed the signed WPS file; it matches what was paid.' : 'Filed the signed WPS file; it differs from what was paid.' }; }
        case 'mudad': {
          const state = req.body?.state === 'ACKNOWLEDGED' ? 'ACKNOWLEDGED' : 'UPLOADED';
          const by = req.body?.by === 'CLIENT' ? `${c.short}` : p.display_name;
          await recordMudad(db, id, state, by, req.body?.ref ? String(req.body.ref) : null);
          return { summary: state === 'UPLOADED' ? `Recorded the WPS file's upload to Mudad${req.body?.by === 'CLIENT' ? ` by ${c.short}` : ''}.` : 'Recorded Mudad\'s acknowledgement.' };
        }
        default: throw new Error('Unknown step');
      }
    }));
    await tasamaTrail(pool, { client_key: c.key, actor_type: 'HUMAN', actor_id: p.key, actor_name: p.display_name, act: 'WRITE', summary: out.summary, summary_ar: out.summary, ref: null });
    res.json(out);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

/** The bank's return file as the portal offers it, to download (simulated: no bank is connected). */
payroll.get('/payroll/payments/:client/:id/return-file', async (req, res) => {
  const p = await personaOf(req);
  if (!allowed(p)) return res.status(403).json({ error: 'Tasama only.' });
  const c = clientByKey(req.params.client);
  if (!c) return res.status(404).json({ error: 'No such client' });
  const f = await withClient(c.key, () => bankReturnFile(pool, Number(req.params.id)));
  if (!f) return res.status(404).json({ error: 'No such payment' });
  res.setHeader('content-type', 'text/csv; charset=utf-8');
  res.setHeader('content-disposition', `attachment; filename="${f.name}"`);
  res.send(f.text);
});

/* ------------------------------------------------------------------ Journals (§21, WF-34) */

/** Every client's paid months and their four journals: balanced, waiting or posted, and how much is mapped. */
payroll.get('/payroll/journals', async (req, res) => {
  const p = await personaOf(req);
  if (!allowed(p)) return res.status(403).json({ error: 'Tasama only.' });
  const rows = await forEachClient(async (key) => {
    const c = clientByKey(key)!;
    const js = (await pool.query(`SELECT period_name, kind, debit, credit, state, unmapped, request_id FROM layer.journals ORDER BY period_name DESC, id`)).rows;
    const periods = [...new Set(js.map((j: any) => j.period_name))].slice(0, 6).reverse();
    const cases = (await pool.query(`SELECT ref, status, payload->>'period' period FROM layer.requests WHERE workflow_id='WF-34' AND status IN ('WAITING','ESCALATED')`)).rows;
    return { key, short: c.short, name_ar: c.name_ar, ledger: c.finance,
      months: periods.map((pn) => {
        const m = js.filter((j: any) => j.period_name === pn);
        const un = m.reduce((s: number, j: any) => s + (j.unmapped as any[]).reduce((a, u) => a + Number(u.amount), 0), 0);
        const debit = m.reduce((s: number, j: any) => s + Number(j.debit), 0), credit = m.reduce((s: number, j: any) => s + Number(j.credit), 0);
        return { period: pn, debit, credit, mapped: credit ? Math.max(0, Math.min(1, (credit - un) / credit)) : 1, unmapped: un,
          state: m.every((j: any) => j.state === 'POSTED') ? 'POSTED' : m.some((j: any) => j.state === 'BLOCKED') ? 'BLOCKED' : 'WAITING', journals: m.length, case: cases.find((k: any) => k.period === pn)?.ref ?? null };
      }) };
  });
  res.json({ clients: rows });
});

/** One month's journals, their lines, Qaid's proposals and the ledger file. */
payroll.get('/payroll/journals/:client/:period', async (req, res) => {
  const p = await personaOf(req);
  if (!allowed(p)) return res.status(403).json({ error: 'Tasama only.' });
  const c = clientByKey(req.params.client);
  if (!c) return res.status(404).json({ error: 'No such client' });
  const out = await withClient(c.key, async () => {
    const js = (await pool.query(`SELECT j.*, r.ref, r.status case_status FROM layer.journals j LEFT JOIN layer.requests r ON r.id=j.request_id WHERE j.period_name=$1 ORDER BY j.id`, [req.params.period])).rows;
    if (!js.length) return null;
    const accounts = new Map((await pool.query(`SELECT code, name, name_ar FROM layer.gl_accounts`)).rows.map((a: any) => [a.code, a]));
    const props = (await pool.query(`SELECT m.*, a.name account_name, a.name_ar account_name_ar FROM layer.account_map m LEFT JOIN layer.gl_accounts a ON a.code=m.account WHERE m.status='PROPOSED'`)).rows;
    const f = await journalFile(pool, req.params.period);
    return {
      journals: js.map((j: any) => ({ kind: j.kind, state: j.state, debit: Number(j.debit), credit: Number(j.credit), unmapped: j.unmapped, ref: j.ref, case_status: j.case_status, approved_by: j.approved_by, approved_at: j.approved_at, posted_at: j.posted_at, import_status: j.import_status, import_ref: j.import_ref,
        lines: (j.lines as any[]).map((l) => ({ ...l, name: accounts.get(l.account)?.name ?? l.description, name_ar: accounts.get(l.account)?.name_ar ?? l.description })) })),
      proposals: props.map((m: any) => ({ code: m.code, account: m.account, account_name: m.account_name, account_name_ar: m.account_name_ar, reason: m.reason })),
      file: { name: f.name, layout: f.layout, illustrative: f.illustrative, rows: f.rows, preview: f.preview },
    };
  });
  if (!out) return res.status(404).json({ error: 'No journals for this month' });
  res.json({ client: { key: c.key, short: c.short, name_ar: c.name_ar, ledger: c.finance }, period: req.params.period, ...out });
});

payroll.get('/payroll/journals/:client/:period/file', async (req, res) => {
  const p = await personaOf(req);
  if (!allowed(p)) return res.status(403).json({ error: 'Tasama only.' });
  const c = clientByKey(req.params.client);
  if (!c) return res.status(404).json({ error: 'No such client' });
  const f = await withClient(c.key, () => journalFile(pool, req.params.period));
  res.setHeader('content-type', f.type);
  res.setHeader('content-disposition', `attachment; filename="${f.name}"`);
  res.send(f.body);
});

/* ------------------------------------------------------------------ Payroll costs, the client's finance controller (§3, §21) */

const financeView = (p: Persona) => p.lenses.includes('fin') || isTasama(p) || isPayrollTeam(p);

/** The payroll summary by department and cost centre for the latest paid month (walkthrough addendum R26): totals only, no employee detail. */
async function departmentSummary() {
  const per = (await pool.query(`SELECT id, period_name, end_date FROM hcm.payroll_periods WHERE status='CLOSED' ORDER BY start_date DESC LIMIT 1`)).rows[0];
  if (!per) return { period: null, rows: [] };
  // Each person's department as of the month's end (a leaver keeps the department it left from).
  const rows = (await pool.query(`WITH dept AS (SELECT r.person_id, (SELECT a.department_id FROM hcm.assignments a WHERE a.person_id=r.person_id AND a.effective_start <= $2 ORDER BY a.effective_start DESC, a.effective_sequence DESC LIMIT 1) AS department_id FROM hcm.payroll_results r WHERE r.period_id=$1)
      SELECT d.name AS department, d.name_ar AS department_ar, d.cost_center, d.division, count(r.*)::int people, SUM(r.gross)::float gross, SUM(r.deductions)::float deductions, SUM(r.net)::float net, SUM(r.employer_contributions)::float employer,
      COALESCE((SELECT SUM(v.eos_month + v.leave_month) FROM hcm.payroll_provisions v JOIN dept x ON x.person_id=v.person_id WHERE v.period_id=$1 AND x.department_id=d.id),0)::float provisions
      FROM hcm.payroll_results r JOIN dept ON dept.person_id=r.person_id JOIN hcm.departments d ON d.id=dept.department_id
      WHERE r.period_id=$1 GROUP BY d.id, d.name, d.name_ar, d.cost_center, d.division ORDER BY d.division, d.name`, [per.id, per.end_date])).rows;
  return { period: per.period_name, rows };
}

/** Payroll reports as Excel, for the client's finance (design/payroll-ops-addendum.md 3.9). */
payroll.get('/costs/reports.xlsx', async (req, res) => {
  const p = await personaOf(req);
  if (!financeView(p)) return res.status(403).json({ error: 'The client\'s finance controller only.' });
  const months = (await pool.query(`SELECT pp.period_name, COUNT(r.*)::int people, COALESCE(SUM(r.gross),0)::float gross, COALESCE(SUM(r.net),0)::float net, COALESCE(SUM(r.employer_contributions),0)::float employer,
      COALESCE((SELECT SUM(v.eos_accrued) FROM hcm.payroll_provisions v WHERE v.period_id=pp.id),0)::float eos, COALESCE((SELECT SUM(v.leave_accrued) FROM hcm.payroll_provisions v WHERE v.period_id=pp.id),0)::float leave
      FROM hcm.payroll_periods pp JOIN hcm.payroll_results r ON r.period_id=pp.id GROUP BY pp.id, pp.period_name, pp.start_date ORDER BY pp.start_date`)).rows;
  const buf = await reportsXlsx(months, client().name, await departmentSummary());
  res.setHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('content-disposition', `attachment; filename="${client().code}_PayrollCosts.xlsx"`);
  res.send(buf);
});

/** The client's finance controller: the payroll files waiting for its approval in the bank, and the last ones it approved (§2). */
payroll.get('/costs/payments', async (req, res) => {
  const p = await personaOf(req);
  if (!financeView(p)) return res.status(403).json({ error: 'The client\'s finance controller only.' });
  const rows = (await pool.query(`SELECT p.id, p.kind, p.period_name, p.state, p.lines, p.total, p.file_name, p.file_ref, p.bank_code, p.checks, p.sent_by, p.sent_at, p.approved_by, p.approved_at, p.feedback_at, p.wps_state, p.mudad_state,
      to_char(p.value_date,'YYYY-MM-DD') vd, to_char(p.pay_date,'YYYY-MM-DD') pd,
      (SELECT count(*)::int FROM layer.payment_lines l WHERE l.payment_id=p.id AND l.status='FAILED') failed
      FROM layer.payments p ORDER BY p.id DESC LIMIT 8`)).rows;
  const { bankByCode } = await import('../domain/banks.js');
  const out = rows.map((x: any) => ({ id: x.id, kind: x.kind, period: x.period_name, state: x.state, lines: x.lines, total: Number(x.total), file: x.file_name, ref: x.file_ref, bank: bankByCode(x.bank_code)?.name ?? '', bank_ar: bankByCode(x.bank_code)?.name_ar ?? '',
    checks: (x.checks ?? []).length, checksOk: (x.checks ?? []).every((k: any) => k.ok), sent_by: x.sent_by, sent_at: x.sent_at, approved_by: x.approved_by, approved_at: x.approved_at, value_date: x.vd, pay_date: x.pd, paid: !!x.feedback_at, failed: x.failed, wps: x.wps_state, mudad: x.mudad_state }));
  res.json({ client: { short: client().short, name_ar: client().name_ar }, waiting: out.filter((x) => x.state === 'SENT'), recent: out.filter((x) => x.state !== 'SENT' && x.state !== 'BUILT').slice(0, 6) });
});

/** The finance controller records the approval it gave in the bank portal, with the value date it set. */
payroll.post('/costs/payments/:id/approved', async (req, res) => {
  const p = await personaOf(req);
  if (!p.lenses.includes('fin')) return res.status(403).json({ error: 'Only the client\'s finance controller records an approval in the bank.' });
  try {
    await tx((db) => recordApproval(db, Number(req.params.id), p.display_name, req.body?.value_date ? String(req.body.value_date).slice(0, 10) : null));
    await tasamaTrail(pool, { client_key: client().key, actor_type: 'HUMAN', actor_id: p.key, actor_name: p.display_name, act: 'DECIDE', summary: `${p.display_name} approved the payroll file in the bank.`, summary_ar: `اعتمد ${p.display_name} ملف الرواتب في البنك.`, ref: null });
    res.json({ ok: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

/** Net pay and employer cost by month, the provisions owed, and the journals posted to the ledger. Read only. */
payroll.get('/costs', async (req, res) => {
  const p = await personaOf(req);
  if (!financeView(p)) return res.status(403).json({ error: 'The client\'s finance controller only.' });
  const months = (await pool.query(`SELECT pp.period_name, pp.status, COUNT(r.*)::int people, COALESCE(SUM(r.gross),0)::float gross, COALESCE(SUM(r.net),0)::float net, COALESCE(SUM(r.employer_contributions),0)::float employer,
      COALESCE((SELECT SUM(v.eos_accrued) FROM hcm.payroll_provisions v WHERE v.period_id=pp.id),0)::float eos, COALESCE((SELECT SUM(v.leave_accrued) FROM hcm.payroll_provisions v WHERE v.period_id=pp.id),0)::float leave,
      COALESCE((SELECT SUM(v.eos_month) FROM hcm.payroll_provisions v WHERE v.period_id=pp.id),0)::float eos_month, COALESCE((SELECT SUM(v.leave_month) FROM hcm.payroll_provisions v WHERE v.period_id=pp.id),0)::float leave_month
      FROM hcm.payroll_periods pp JOIN hcm.payroll_results r ON r.period_id=pp.id GROUP BY pp.id, pp.period_name, pp.status, pp.start_date ORDER BY pp.start_date`)).rows.slice(-7);
  const journals = (await pool.query(`SELECT period_name, kind, debit, state, to_char(posted_at,'YYYY-MM-DD') posted, import_status FROM layer.journals ORDER BY period_name, id`)).rows;
  const c = client();
  res.json({ client: { short: c.short, name_ar: c.name_ar, ledger: c.finance }, months, departments: await departmentSummary(),
    journals: [...new Set(journals.map((j: any) => j.period_name))].map((pn) => ({ period: pn, journals: journals.filter((j: any) => j.period_name === pn).map((j: any) => ({ kind: j.kind, amount: Number(j.debit), state: j.state, posted: j.posted, status: j.import_status })) })).slice(-6) });
});
payroll.get('/costs/journals/:period/file', async (req, res) => {
  const p = await personaOf(req);
  if (!financeView(p)) return res.status(403).json({ error: 'The client\'s finance controller only.' });
  const f = await journalFile(pool, req.params.period);
  res.setHeader('content-type', f.type);
  res.setHeader('content-disposition', `attachment; filename="${f.name}"`);
  res.send(f.body);
});
