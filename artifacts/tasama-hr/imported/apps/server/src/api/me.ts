/** My HR (self-service) and My Team. Every HRMS read goes through the connector. */
import { Router } from 'express';
import { aiStatus } from '../ai.js';
import { CLIENTS } from '../domain/clients.js';
import { pool } from '../db.js';
import { personaOf, personas, has , TASAMA_PERSONA } from './session.js';
import { worker, team, balances } from '../hcm/queries.js';
import { read, type Ctx } from '../hcm/connector.js';
import { client, gratuity, yearsBetween, iso, daysBetween, round2, gosi, advanceMax, advanceMaxTerm } from '../domain/rules.js';

export const me = Router();
const ui = (actor = 'ui'): Ctx => ({ c: pool, actor });
const today = () => iso(new Date());

me.get('/session', async (req, res) => {
  const p = await personaOf(req);
  const anchor = (await pool.query(`SELECT value FROM layer.meta WHERE key='anchor'`)).rows[0]?.value;
  const counts = (await pool.query(`SELECT waiting_on_person_id AS pid, COUNT(*)::int n FROM layer.requests WHERE status IN ('WAITING','ESCALATED') GROUP BY 1`)).rows;
  const openEsc = (await pool.query(`SELECT COUNT(*)::int n FROM tasama.escalations WHERE status <> 'RESOLVED'`).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n;
  const cl = client();
  res.json({
    persona: p,
    personas: [{ ...TASAMA_PERSONA, inbox: openEsc }, ...(await personas()).map((x) => ({ ...x, inbox: counts.find((c: any) => c.pid === x.person_id)?.n ?? 0 }))],
    client: { key: cl.key, code: cl.code, name: cl.name, name_ar: cl.name_ar, short: cl.short, sector: cl.sector, sector_ar: cl.sector_ar, hrms: cl.hrms, hrmsLabel: cl.hrmsLabel, bank: cl.bank, services: cl.contract.services },
    clients: CLIENTS.map((c) => ({ key: c.key, code: c.code, name: c.name, name_ar: c.name_ar, short: c.short, sector: c.sector, sector_ar: c.sector_ar, hrms: c.hrms, hrmsLabel: c.hrmsLabel })),
    ai: aiStatus(),
    anchor,
    today: today(),
  });
});

me.get('/me', async (req, res) => {
  const p = await personaOf(req);
  const ctx = ui('rafeeq');
  const w = await worker(ctx, p.person_id, today());
  if (!w) return res.status(404).json({ error: 'No worker' });
  const year = Number(today().slice(0, 4));
  const [bal, pay, docs, goals, learning, notif, journeys, advances, absences] = await Promise.all([
    balances(ctx, p.person_id, year),
    read(ctx, 'payrollResults', `q=PersonId=${p.person_id}`, 'Payslips', async () => (await pool.query(`SELECT r.*, pp.period_name, pp.pay_date FROM hcm.payroll_results r JOIN hcm.payroll_periods pp ON pp.id=r.period_id WHERE r.person_id=$1 ORDER BY pp.start_date DESC`, [p.person_id])).rows),
    read(ctx, 'documentRecords', `q=PersonId=${p.person_id}`, 'Letters issued', async () => (await pool.query(`SELECT document_number, type, addressee, language, status, issued_at, body FROM hcm.document_records WHERE person_id=$1 ORDER BY issued_at DESC LIMIT 20`, [p.person_id])).rows),
    read(ctx, 'goals', `q=PersonId=${p.person_id}`, 'Goals', async () => (await pool.query(`SELECT * FROM hcm.goals WHERE person_id=$1 ORDER BY year DESC, weight DESC`, [p.person_id])).rows),
    read(ctx, 'learningRecords', `q=PersonId=${p.person_id}`, 'Learning', async () => (await pool.query(`SELECT e.*, i.title, i.title_ar, i.kind, i.hours FROM hcm.learning_enrollments e JOIN hcm.learning_items i ON i.id=e.item_id WHERE e.person_id=$1`, [p.person_id])).rows),
    pool.query(`SELECT * FROM layer.notifications WHERE person_id=$1 ORDER BY created_at DESC LIMIT 12`, [p.person_id]).then((r) => r.rows),
    read(ctx, 'journeys', `q=PersonId=${p.person_id}`, 'Journeys', async () => (await pool.query(`SELECT j.*, COALESCE(json_agg(t ORDER BY t.seq) FILTER (WHERE t.id IS NOT NULL), '[]') AS tasks FROM hcm.journeys j LEFT JOIN hcm.journey_tasks t ON t.journey_id=j.id WHERE j.person_id=$1 GROUP BY j.id ORDER BY j.started_at DESC`, [p.person_id])).rows),
    pool.query(`SELECT * FROM hcm.advances WHERE person_id=$1 ORDER BY id DESC`, [p.person_id]).then((r) => r.rows),
    read(ctx, 'absences', `q=PersonId=${p.person_id}`, 'Absence records', async () => (await pool.query(`SELECT a.*, t.name, t.name_ar FROM hcm.absences a JOIN hcm.absence_types t ON t.code=a.type_code WHERE a.person_id=$1 ORDER BY start_date DESC LIMIT 20`, [p.person_id])).rows),
  ]);
  const perf = (await pool.query(`SELECT review_period, status, self_rating, manager_rating, calibrated_rating FROM hcm.performance_documents WHERE person_id=$1 ORDER BY review_period DESC`, [p.person_id])).rows;
  const years = yearsBetween(w.original_hire_date, today());
  // End-of-service award (Saudi Labor Law Arts. 84-85): what accrues if the company ended the contract, and if you resigned today.
  const gT = gratuity(w.basic, w.original_hire_date, today(), 0, 'TERMINATION');
  const gR = gratuity(w.basic, w.original_hire_date, today(), 0, 'RESIGNATION');
  const eos: any = {
    basis: 'GRATUITY', accrued: gT.amount, years: gT.years, rule: `${gT.rule} HR-11 §11.1`,
    accruedLabel: 'Accrued if the company ended the contract',
    ifResigned: gR.amount, ifResignedFactor: gR.factor, ifResignedLabel: 'If you resigned today', ifResignedRule: `Saudi Labor Law Art. 85: none under 2 years, one third for 2-5 years, two thirds for 5-10, full award at 10 years or more. HR-11 §11.2`,
    gosi: null,
  };
  if (w.is_saudi) {
    const g = gosi(w.basic + w.housing, w.original_hire_date, true, today());
    eos.gosi = { monthlyEmployee: g.employee, monthlyEmployer: g.employer, contributionSalary: g.contributionSalary, rates: [g.eeRate, g.erRate], rule: 'GOSI annuities and SANED, paid separately from the end-of-service award. HR-10 §10.4; HR-11 §11.3' };
  }
  const nextPay = (await pool.query(`SELECT pay_date, period_name FROM hcm.payroll_periods WHERE status IN ('OPEN','RELEASED') ORDER BY start_date LIMIT 1`)).rows[0];
  res.json({ worker: w, balances: bal, payslips: pay, documents: docs, goals, learning, notifications: notif, journeys, advances, absences, performance: perf, eos, nextPay, years: round2(years), advanceMax: advanceMax(w.basic, w.basic + w.housing + w.transport + w.other_allowance), advanceMaxTerm: advanceMaxTerm() });
});

/** Ajaza's live check while the form is being filled. Read-only: nothing is created. */
me.post('/leave/check', async (req, res) => {
  const p = await personaOf(req);
  const { start, end, type_code = 'ANNUAL' } = req.body;
  if (!start || !end || end < start) return res.json({ ok: false, issues: ['Choose a start and an end date.'] });
  const ctx: Ctx = { c: pool, actor: 'ajaza', quiet: true };
  const w = (await worker(ctx, p.person_id, today()))!;
  const days = daysBetween(start, end) + 1;
  const bal = (await balances(ctx, p.person_id, Number(start.slice(0, 4)))).find((b: any) => b.type_code === (type_code === 'SICK' ? 'SICK' : 'ANNUAL'));
  const issues: string[] = [], notes: string[] = [];
  if (type_code === 'ANNUAL' && (bal?.balance ?? 0) < days) issues.push(`Balance is ${bal?.balance ?? 0} days; ${days} requested.`);
  if (type_code === 'ANNUAL' && daysBetween(today(), start) < 14) notes.push('Less than 10 working days’ notice: your manager may ask to move it (HR-04 §4.1).');
  if (type_code === 'SICK') notes.push('Attach a medical certificate within 3 working days. Sick pay: 30 days at full pay, the next 60 at 75%, the next 30 unpaid in a year (Art. 117; HR-04 §4.5).');
  if (type_code === 'SICK' && w.probation_status === 'IN_PROBATION') notes.push('Sick leave days do not count toward the probation period (Art. 53).');
  const mates = w.manager_person_id ? await team(ctx, w.manager_person_id, today()) : [];
  const away = (await pool.query(`SELECT p.display_name, a.start_date, a.end_date FROM hcm.absences a JOIN hcm.persons p ON p.id=a.person_id WHERE a.person_id = ANY($1) AND a.person_id <> $2 AND a.status IN ('APPROVED','SUBMITTED') AND a.start_date <= $4 AND a.end_date >= $3`, [mates.map((m) => m.person_id), p.person_id, start, end])).rows;
  if (away.length >= 2) issues.push(`${away.length} colleagues already away then: ${away.map((a: any) => a.display_name).join(', ')}.`);
  else if (away.length === 1) notes.push(`${away[0].display_name} is away ${away[0].start_date} to ${away[0].end_date}.`);
  res.json({ ok: issues.length === 0, days, balance: bal?.balance ?? null, after: bal ? round2(bal.balance - (type_code === 'ANNUAL' ? days : 0)) : null, issues, notes, away });
});

me.get('/team', async (req, res) => {
  const p = await personaOf(req);
  if (!has(p, 'LINE_MANAGER')) return res.status(403).json({ error: 'Line managers only' });
  const ctx = ui('rafeeq');
  const t = await team(ctx, p.person_id, today());
  const ids = t.map((x) => x.person_id);
  const [away, perf, flight, pending] = await Promise.all([
    pool.query(`SELECT person_id, type_code, start_date, end_date, status FROM hcm.absences WHERE person_id = ANY($1) AND end_date >= $2::date AND start_date <= $2::date + 30 AND status IN ('APPROVED','SUBMITTED') ORDER BY start_date`, [ids, today()]),
    pool.query(`SELECT DISTINCT ON (person_id) person_id, review_period, status, self_rating, manager_rating FROM hcm.performance_documents WHERE person_id = ANY($1) ORDER BY person_id, review_period DESC`, [ids]),
    pool.query(`SELECT person_id, potential, flight_risk FROM hcm.talent_profiles WHERE person_id = ANY($1)`, [ids]),
    pool.query(`SELECT subject_person_id, ref, title, workflow_id FROM layer.requests WHERE subject_person_id = ANY($1) AND status IN ('WAITING','ESCALATED')`, [ids]),
  ]);
  const goals = (await pool.query(`SELECT person_id, ROUND(AVG(progress))::int AS progress FROM hcm.goals WHERE person_id = ANY($1) AND year = (SELECT MAX(year) FROM hcm.goals WHERE progress > 0) GROUP BY person_id`, [ids])).rows;
  res.json(t.map((w) => ({
    ...w,
    away: away.rows.filter((a: any) => a.person_id === w.person_id),
    review: perf.rows.find((r: any) => r.person_id === w.person_id) ?? null,
    talent: flight.rows.find((r: any) => r.person_id === w.person_id) ?? null,
    goals: goals.find((g: any) => g.person_id === w.person_id)?.progress ?? null,
    open: pending.rows.filter((r: any) => r.subject_person_id === w.person_id),
  })));
});

me.get('/notifications', async (req, res) => {
  const p = await personaOf(req);
  res.json((await pool.query(`SELECT * FROM layer.notifications WHERE person_id=$1 ORDER BY created_at DESC LIMIT 20`, [p.person_id])).rows);
});
