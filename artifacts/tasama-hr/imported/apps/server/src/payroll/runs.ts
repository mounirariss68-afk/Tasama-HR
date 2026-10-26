/**
 * A payroll run from preparation to payslips (design/payroll-addendum.md §18, WF-30).
 * The draft is live until the specialist sends it for validation; from then on its lines are
 * frozen in `pay_lines`, and what the client approves is what is written and paid.
 */
import type { PoolClient } from 'pg';
import { draftRun } from './run.js';
import { runChecks } from './checks.js';
import { explain } from './differences.js';
import { HCM_OF } from '../domain/payroll/terms.js';
import { client } from '../domain/rules.js';
import { now } from '../clock.js';

type Q = PoolClient | { query: PoolClient['query'] };
const r2 = (n: number) => Math.round(n * 100) / 100;

/** The run for the open month, if one was started: its state follows its case. */
export async function currentRun(c: Q) {
  const per = (await c.query(`SELECT period_name FROM hcm.payroll_periods WHERE status='OPEN' ORDER BY start_date DESC LIMIT 1`)).rows[0];
  if (!per) return null;
  const run = (await c.query(
    `SELECT pr.*, r.ref, r.status AS case_status, r.current_step, r.waiting_on_role, r.waiting_on_person_id, w.display_name AS waiting_on,
            (SELECT a.decided_at FROM layer.approvals a WHERE a.request_id=r.id AND a.step_key='deliver' AND a.decision='APPROVED' ORDER BY a.decided_at DESC LIMIT 1) AS delivered_at,
            (SELECT a.decided_at FROM layer.approvals a WHERE a.request_id=r.id AND a.step_key='approve' AND a.decision='APPROVED' ORDER BY a.decided_at DESC LIMIT 1) AS hr_approved_at,
            (SELECT pp.display_name FROM layer.approvals a JOIN hcm.persons pp ON pp.id=a.approver_person_id WHERE a.request_id=r.id AND a.step_key='approve' AND a.decision='APPROVED' ORDER BY a.decided_at DESC LIMIT 1) AS hr_approver,
            (SELECT a.decided_at FROM layer.approvals a WHERE a.request_id=r.id AND a.step_key='approve_chro' AND a.decision='APPROVED' ORDER BY a.decided_at DESC LIMIT 1) AS chro_approved_at,
            (SELECT pp.display_name FROM layer.approvals a JOIN hcm.persons pp ON pp.id=a.approver_person_id WHERE a.request_id=r.id AND a.step_key='approve_chro' AND a.decision='APPROVED' ORDER BY a.decided_at DESC LIMIT 1) AS chro_approver,
            (SELECT a.created_at FROM layer.approvals a WHERE a.request_id=r.id AND a.decision='PENDING' ORDER BY a.created_at DESC LIMIT 1) AS waiting_since,
            (SELECT a.reason FROM layer.approvals a WHERE a.request_id=r.id AND a.decision='REJECTED' ORDER BY a.decided_at DESC LIMIT 1) AS returned_reason,
            (SELECT pp.display_name FROM layer.approvals a JOIN hcm.persons pp ON pp.id=a.approver_person_id WHERE a.request_id=r.id AND a.decision='REJECTED' ORDER BY a.decided_at DESC LIMIT 1) AS returned_by
       FROM layer.pay_runs pr LEFT JOIN layer.requests r ON r.id=pr.request_id LEFT JOIN hcm.persons w ON w.id=r.waiting_on_person_id
      WHERE pr.period_name=$1 AND pr.kind='REGULAR' ORDER BY pr.id DESC LIMIT 1`, [per.period_name])).rows[0];
  if (!run) return null;
  // design/walkthrough-addendum.md items 3 and 4: once Tasama HR operations has delivered it, the run is with the client's chain.
  const state = run.case_status === 'REJECTED' ? 'RETURNED' : run.state === 'VALIDATED' && run.delivered_at ? 'DELIVERED' : run.state;
  const chain = (client().contract.approvalChain ?? ['PAYROLL']).map((role) => ({ role, label: role === 'CHRO' ? 'CHRO' : 'HR operations',
    who: role === 'CHRO' ? run.chro_approver : run.hr_approver, at: role === 'CHRO' ? run.chro_approved_at : run.hr_approved_at,
    current: state === 'DELIVERED' && (role === 'CHRO' ? run.current_step === 'approve_chro' : run.current_step === 'approve') }));
  return { ...run, state, deliverer: run.delivered_at ? 'Lama Al Dossary' : null, chain };
}

/** The frozen rows of a run, in the shape of the draft's rows. */
export async function frozenRows(c: Q, runId: number) {
  return (await c.query(`SELECT row FROM layer.pay_lines WHERE run_id=$1 ORDER BY id`, [runId])).rows.map((r: any) => r.row);
}

export async function check(c: PoolClient, requestId: number) {
  const d = (await draftRun(c))!;
  const rv = await runChecks(c, d);
  await c.query(`INSERT INTO layer.pay_runs (period_name, request_id, state, totals, people) VALUES ($1,$2,'DRAFT',$3,$4)`, [d.period.name, requestId, JSON.stringify(d.totals), d.rows.length]);
  return { d, blocks: rv.checks.filter((x) => x.severity === 'BLOCK').length, asks: rv.checks.filter((x) => x.severity === 'ASK').length };
}

export async function freeze(c: PoolClient, requestId: number, preparer: string) {
  const d = (await draftRun(c))!;
  const run = (await c.query(`SELECT id FROM layer.pay_runs WHERE request_id=$1`, [requestId])).rows[0];
  await c.query(`DELETE FROM layer.pay_lines WHERE run_id=$1`, [run.id]);
  for (const row of d.rows) await c.query(`INSERT INTO layer.pay_lines (run_id, person_id, row) VALUES ($1,$2,$3)`, [run.id, row.person_id, JSON.stringify(row)]);
  await c.query(`UPDATE layer.pay_runs SET state='PREPARED', preparer=$2, prepared_at=$5, totals=$3, people=$4 WHERE id=$1`, [run.id, preparer, JSON.stringify(d.totals), d.rows.length, now()]);
  return { d, runId: run.id };
}

export async function explainRun(c: PoolClient, requestId: number, validator: string) {
  const d = (await draftRun(c))!;
  const x = await explain(c, d.period);
  await c.query(`UPDATE layer.pay_runs SET state='VALIDATED', validator=$2, validated_at=$4, differences=$3 WHERE request_id=$1`, [requestId, validator, JSON.stringify(x), now()]);
  return { x, d };
}

/** The approved run becomes the month's payroll results and provisions in the master. */
export async function writeRun(c: PoolClient, requestId: number, approver: string) {
  const run = (await c.query(`SELECT * FROM layer.pay_runs WHERE request_id=$1`, [requestId])).rows[0];
  const per = (await c.query(`SELECT * FROM hcm.payroll_periods WHERE period_name=$1`, [run.period_name])).rows[0];
  const rows = await frozenRows(c, run.id);
  await c.query(`DELETE FROM hcm.payroll_results WHERE period_id=$1`, [per.id]);
  await c.query(`DELETE FROM hcm.payroll_provisions WHERE period_id=$1`, [per.id]);
  for (const r of rows) {
    const lines = r.lines.map((l: any) => ({ code: HCM_OF[l.code] ?? String(l.code).toUpperCase(), name: l.label, amount: l.amount, kind: l.kind === 'EMPLOYER' ? 'EMPLOYER_CONTRIBUTION' : l.kind, rule: l.rule }));
    const er = r.lines.filter((l: any) => l.kind === 'EMPLOYER').reduce((n: number, l: any) => n + l.amount, 0);
    await c.query(`INSERT INTO hcm.payroll_results (period_id, person_id, days_paid, gross, deductions, employer_contributions, net, lines, wps_status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'PENDING')`,
      [per.id, r.person_id, r.pay_days, r.gross, r.deductions, r2(er), r.net, JSON.stringify(lines)]);
    await c.query(`INSERT INTO hcm.payroll_provisions (period_id, person_id, eos_wage, eos_accrued, eos_month, leave_days, leave_accrued, leave_month, rules) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [per.id, r.person_id, r2(r.eos.wage), r2(r.eos.accrued), r2(r.eos.month), Math.round(r.leave.balanceDays * 1000) / 1000, r2(r.leave.accrued), r2(r.leave.monthCost), JSON.stringify({ eos: r.eos.rule, leave: r.leave.rule })]);
  }
  await c.query(`UPDATE layer.pay_runs SET state='APPROVED', approver=$2, approved_at=$3, written_at=$3 WHERE id=$1`, [run.id, approver, now()]);
  return { rows: rows.length, period: run.period_name, net: rows.reduce((s: number, r: any) => s + r.net, 0) };
}

export async function issuePayslips(c: PoolClient, requestId: number) {
  const run = (await c.query(`SELECT * FROM layer.pay_runs WHERE request_id=$1`, [requestId])).rows[0];
  const rows = await frozenRows(c, run.id);
  const month = new Date(`${run.period_name}-01T00:00:00Z`).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  for (const r of rows) await c.query(`INSERT INTO layer.notifications (person_id, title, title_ar, body, link) VALUES ($1,$2,$3,$4,NULL)`,
    [r.person_id, `Your payslip for ${month} is ready`, 'قسيمة راتبك جاهزة', `Net pay SAR ${Number(r.net).toLocaleString('en-US', { minimumFractionDigits: 2 })}. Open My HR › Pay to see every line and the rule behind it.`]);
  await c.query(`UPDATE layer.pay_runs SET payslips=$2 WHERE id=$1`, [run.id, rows.length]);
  return rows.length;
}
