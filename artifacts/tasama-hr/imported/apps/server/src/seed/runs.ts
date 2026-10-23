/**
 * Each client's run on the demo day (design/payroll-addendum.md §18, section 8's calendar).
 *
 *  - Riyadh Air: its cut-off passed two days ago. Nasser cleared the two checks, sent the run,
 *    Sharifa validated, the CHRO approved; written to Oracle HCM and payslips issued.
 *  - Red Sea Global: its cut-off passed yesterday. The run is prepared and two checks stop it.
 *  - The other three are before their cut-off: the draft only.
 */
import type { PoolClient } from 'pg';
import type { ClientConfig } from '../domain/clients.js';
import type { BaseResult } from './base.js';
import { startCase, decide } from '../engine/core.js';
import { setClock } from '../clock.js';
import { draftRun, engineInputs } from '../payroll/run.js';
import { runPayroll } from '../domain/payroll/engine.js';
import { HCM_OF } from '../domain/payroll/terms.js';
import { reschedule } from '../payroll/checks.js';
import { gosiContribution } from '../domain/payroll/gosi.js';

const DAY = 86_400_000;
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The closed months recalculated by the engine once every seeded entry is in (advances from the
 * case history, last month's overtime sheets), so what was paid matches the master the
 * differences are explained from (§18).
 */
export async function replayClosedMonths(c: PoolClient) {
  const periods = (await c.query(`SELECT * FROM hcm.payroll_periods WHERE status='CLOSED' ORDER BY start_date`)).rows;
  for (const per of periods) {
    const x = await engineInputs(c, per);
    const run = runPayroll({ start: x.ps, end: x.pe }, x.terms, x.input);
    await c.query(`DELETE FROM hcm.payroll_results WHERE period_id=$1`, [per.id]);
    await c.query(`DELETE FROM hcm.payroll_provisions WHERE period_id=$1`, [per.id]);
    for (const r of run.employees) {
      const lines = r.lines.map((l) => ({ code: HCM_OF[l.code] ?? l.code.toUpperCase(), name: l.label, amount: l.amount, kind: l.kind === 'EMPLOYER' ? 'EMPLOYER_CONTRIBUTION' : l.kind, rule: l.rule }));
      const er = r.lines.filter((l) => l.kind === 'EMPLOYER').reduce((n, l) => n + l.amount, 0);
      await c.query(`INSERT INTO hcm.payroll_results (period_id, person_id, days_paid, gross, deductions, employer_contributions, net, lines, wps_status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'PAID')`, [per.id, Number(r.ref), r.payDays, r.gross, r.deductions, r2(er), r.net, JSON.stringify(lines)]);
      const pv = r.provisions;
      await c.query(`INSERT INTO hcm.payroll_provisions (period_id, person_id, eos_wage, eos_accrued, eos_month, leave_days, leave_accrued, leave_month, rules) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [per.id, Number(r.ref), r2(pv.eos.wage), r2(pv.eos.accrued), r2(pv.eos.month), Math.round(pv.leave.balanceDays * 1000) / 1000, r2(pv.leave.accrued), r2(pv.leave.monthCost), JSON.stringify({ eos: pv.eos.rule, leave: pv.leave.rule, terms: run.terms })]);
    }
  }
}

/**
 * Edge 11 (§21): ROSHN pays its site staff a remote-site allowance from its last closed month. Its finance
 * has no account for it, so that month's journal cannot balance until one is approved.
 */
async function seedRemoteSite(c: PoolClient) {
  const last = (await c.query(`SELECT to_char(start_date,'YYYY-MM-DD') s FROM hcm.payroll_periods WHERE status='CLOSED' ORDER BY start_date DESC LIMIT 1`)).rows[0];
  if (!last) return;
  await c.query(`INSERT INTO hcm.element_types (code, name, name_ar, classification, recurring) VALUES ('REMOTE_SITE','Remote-site allowance','بدل العمل في المواقع النائية','EARNING',true) ON CONFLICT DO NOTHING`);
  const staff = (await c.query(`SELECT p.id FROM hcm.persons p JOIN hcm.work_relationships wr ON wr.person_id=p.id AND wr.worker_type='E' AND wr.end_date IS NULL
      JOIN LATERAL (SELECT department_id FROM hcm.assignments a WHERE a.person_id=p.id ORDER BY a.effective_start DESC LIMIT 1) a ON true JOIN hcm.departments d ON d.id=a.department_id
     WHERE d.name IN ('Development and Projects','Project Controls') ORDER BY p.person_number LIMIT 14`)).rows;
  for (const p of staff) await c.query(`INSERT INTO hcm.element_entries (entry_number, person_id, element_code, amount, effective_start, source, reference) VALUES ($1,$2,'REMOTE_SITE',1500,$3,'ORACLE_HCM','Remote-site allowance, Al Widyan site')`, [`RSA-${p.id}`, p.id, last.s]);
}

export async function seedRuns(c: PoolClient, base: BaseResult, cl: ClientConfig) {
  if (cl.key === 'roshn') await seedRemoteSite(c);
  await replayClosedMonths(c);
  if (!['riyadhair', 'redsea'].includes(cl.key)) return;
  const per = (await c.query(`SELECT period_name, to_char(start_date,'YYYY-MM-DD') s, to_char(end_date,'YYYY-MM-DD') e, to_char(cutoff_date,'YYYY-MM-DD') co FROM hcm.payroll_periods WHERE status='OPEN' ORDER BY start_date DESC LIMIT 1`)).rows[0];
  const cutoff = Date.parse(`${per.co}T00:00:00Z`);
  const ops = base.persona.payroll;
  const month = new Date(`${per.s}T00:00:00Z`).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const nasser = { prepared_by: 'tasama-specialist', prepared_by_name: 'Nasser AlFarraj' };

  if (cl.key === 'riyadhair') {
    // The two checks, cleared the morning after the cut-off: the advance rescheduled, the joiner's GOSI registration given by HR operations.
    setClock(new Date(cutoff + DAY + 8 * 3600e3));
    const d = (await draftRun(c))!;
    const adv = d.rows.find((r) => r.flags.some((f: any) => f.code === 'ADVANCE_CAP'));
    if (adv) await reschedule(c, d, adv.person_id, 'Nasser AlFarraj');
    for (const r of d.rows.filter((x) => x.flags.some((f: any) => f.code === 'GOSI_NOT_REGISTERED'))) {
      const p = (await c.query(`SELECT p.is_saudi, to_char(wr.start_date,'YYYY-MM-DD') s FROM hcm.persons p JOIN hcm.work_relationships wr ON wr.person_id=p.id WHERE p.id=$1`, [r.person_id])).rows[0];
      await c.query(`INSERT INTO hcm.gosi_registrations (person_id, first_registered, system, source) VALUES ($1,$2,'NEW','THIS_EMPLOYER') ON CONFLICT (person_id) DO NOTHING`, [r.person_id, p.s]);
      const wage = (r.lines as any[]).filter((l) => ['basic', 'housing'].includes(l.code)).reduce((s, l) => s + l.amount, 0);
      const g = gosiContribution(wage, p.is_saudi, p.s, per.e);
      await c.query(`INSERT INTO hcm.element_entries (entry_number, person_id, element_code, amount, effective_start, source, reference) VALUES ($1,$2,'GOSI_ER',$3,$4,'RAFEEQ','Registered by HR operations')`, [`GOSI-${r.person_id}-S`, r.person_id, g.employer, per.s]);
      await c.query(`INSERT INTO layer.run_check_log (period_name, person_id, code, action, by_name, summary) VALUES ($1,$2,'GOSI_NOT_REGISTERED','ANSWERED','HR operations',$3)`, [per.period_name, r.person_id, `HR operations gave ${r.name}'s GOSI registration date; the run now calculates the contribution.`]);
    }
  }
  setClock(new Date(cutoff + DAY + 9 * 3600e3));
  const k = await startCase(c, { workflowId: 'WF-30', type: 'RUN', title: `${cl.short} payroll, ${month}`, title_ar: `رواتب ${cl.name_ar}`, requester: ops, subject: ops, channel: 'SCHEDULE', payload: { period: per.period_name } });
  if (cl.key === 'riyadhair') {
    setClock(new Date(cutoff + DAY + 11 * 3600e3));
    await decide(c, { requestId: k.id, personId: 0, decision: 'APPROVED', reason: 'Checks cleared', edits: nasser, actorName: 'Nasser AlFarraj, Tasama' });
    setClock(new Date(cutoff + DAY + 15 * 3600e3));
    await decide(c, { requestId: k.id, personId: 0, decision: 'APPROVED', reason: 'Lines and totals checked', edits: { validated_by_name: 'Sharifa AlMousa' }, actorName: 'Sharifa AlMousa, Tasama' });
    setClock(new Date(cutoff + 2 * DAY - 6 * 3600e3));
    await decide(c, { requestId: k.id, personId: base.persona.chro, decision: 'APPROVED', reason: 'Differences reviewed' });
  }
  setClock(null);
}
