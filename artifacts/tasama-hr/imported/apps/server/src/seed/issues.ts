/**
 * Six months of issue history for Basira's pattern watch, per client.
 *
 * Most streams run at a steady rate with ordinary week-to-week variation.
 * Three things are planted, so the demo has something real to find:
 *   1. Riyadh Air: leave requests escalating because the approver is away
 *      with no delegate, rising over the last four weeks and concentrated on
 *      one manager (the Riyadh Air manager persona, on leave since late September).
 *   2. ROSHN, Red Sea Global and SEVEN: payroll findings "salary change not in
 *      element entries" rising in the same three weeks; most of the recent
 *      changes reached payroll after the cut-off. Several clients at once
 *      points at Tasama's own process, not one client.
 *   3. SEVEN: one week with a burst of advance rejections, then back to
 *      normal. Basira should look at it and not flag it.
 * Volumes (cases per week) are synthetic and sized to each client.
 */
import type { PoolClient } from 'pg';
import { rng } from '../domain/rng.js';
import { addDays, iso } from '../domain/rules.js';
import { CLIENTS, type ClientConfig } from '../domain/clients.js';
import { STAFF } from './tasama.js';
import { reconcileBalances } from './history.js';

export const WEEKS = 26;
const DAY = 86_400_000;

type Stream = {
  category: 'ESCALATION' | 'REJECTION' | 'RETURNED' | 'PAYROLL_FINDING'; workflow: string; reason: string; rate: number;
  /** Planted rate per 100 cases for window k (0 = the last seven days), or undefined for the steady rate. */
  plant?: (k: number) => number | undefined;
  summary: (a: any) => string;
  attrs: (k: number, planted: boolean) => any;
};

/** Cases per week, per workflow, as a share of headcount. */
const VOLUME: Record<string, number> = { 'WF-15': 0.065, 'WF-14': 0.055, 'WF-16': 0.012, 'WF-13': 0.035 };

export async function seedIssues(c: PoolClient, client: ClientConfig, anchor: Date) {
  const ci = CLIENTS.findIndex((x) => x.key === client.key);
  const R = rng(9907 + 41 * ci);
  const poisson = (l: number) => { let n = 0, p = Math.exp(-l), s = p; const u = R.next(); while (u > s && n < 60) { n++; p *= l / n; s += p; } return n; };
  const meta = (await c.query(`SELECT value FROM layer.meta WHERE key='people'`)).rows[0].value;
  const managers = (await c.query(`SELECT DISTINCT p.id, p.display_name FROM hcm.assignments a JOIN hcm.persons p ON p.id=a.manager_person_id WHERE a.effective_end='4712-12-31' ORDER BY p.id`)).rows as { id: number; display_name: string }[];
  const mgrPersona = (await c.query(`SELECT id, display_name FROM hcm.persons WHERE id=$1`, [meta.persona.manager])).rows[0];
  const payrollStaff = STAFF.filter(([, , , , skills, , al]) => skills.includes('PAYROLL') && al.some(([k]) => k === client.key)).map(([n]) => n);
  const enterers = [...payrollStaff, 'Client HR (self-service upload)'];
  const slow = client.slowness;
  const crossClient = ['roshn', 'redsea', 'seven'].includes(client.key);

  const streams: Stream[] = [
    { category: 'ESCALATION', workflow: 'WF-15', reason: 'APPROVER_UNAVAILABLE', rate: 3 * slow,
      plant: client.key === 'riyadhair' ? (k) => [48, 40, 30, 22][k] : undefined,
      summary: (a) => `Leave request waited ${a.days_waiting} working days on ${a.approver}${a.approver_away ? ' (away, no delegate set)' : ''}`,
      attrs: (k, planted) => {
        const others = managers.filter((x) => x.id !== mgrPersona.id);
        const m = planted && client.key === 'riyadhair' ? (R.chance(0.8) ? mgrPersona : R.pick(others)) : R.pick(R.chance(0.9) && others.length ? others : managers);
        return { approver: m.display_name, approver_id: m.id, approver_away: planted && m.id === mgrPersona.id ? true : R.chance(0.6), step: 'Manager approval', days_waiting: R.int(3, 7) };
      } },
    { category: 'ESCALATION', workflow: 'WF-15', reason: 'APPROVER_SLOW', rate: 4 * slow,
      summary: (a) => `Leave request waited ${a.days_waiting} working days on ${a.approver}`,
      attrs: () => { const m = R.pick(managers); return { approver: m.display_name, approver_id: m.id, approver_away: false, step: 'Manager approval', days_waiting: R.int(3, 6) }; } },
    { category: 'ESCALATION', workflow: 'WF-14', reason: 'MISSING_DOCUMENT', rate: 2,
      summary: () => 'Letter request waited for a supporting document from the employee',
      attrs: () => ({ step: 'Validate', approver: 'Employee' }) },
    { category: 'ESCALATION', workflow: 'WF-16', reason: 'CLIENT_DELAY', rate: 5 * slow,
      summary: () => 'Advance waited on the client\'s HR for the exception sign-off',
      attrs: () => ({ step: 'HR Ops approval', approver: 'Client HR' }) },
    { category: 'REJECTION', workflow: 'WF-15', reason: 'TEAM_COVER', rate: 5,
      summary: (a) => `Leave declined by ${a.decided_by}: two colleagues already away`,
      attrs: () => { const m = R.pick(managers); return { decided_by: m.display_name, step: 'Manager approval' }; } },
    { category: 'REJECTION', workflow: 'WF-16', reason: 'OUTSIDE_POLICY', rate: 8,
      plant: client.key === 'seven' ? (k) => (k === 1 ? 260 : undefined) : undefined,
      summary: (a) => `Advance declined by ${a.decided_by}: above the handbook limit`,
      attrs: (k, planted) => ({ decided_by: planted ? 'Client HR (year-end budget freeze)' : R.pick(['Client HR', 'CHRO']), step: 'HR Ops approval' }) },
    { category: 'RETURNED', workflow: 'WF-14', reason: 'DATA_WRONG_IN_HRMS', rate: 2,
      summary: () => 'Letter returned: job title in the HRMS did not match the contract',
      attrs: () => ({ entered_by: R.pick(enterers), step: 'Validate' }) },
    { category: 'PAYROLL_FINDING', workflow: 'WF-13', reason: 'ELEMENT_ENTRY_MISSING', rate: 4,
      plant: crossClient ? (k) => [65, 55, 40][k] : undefined,
      summary: (a) => `${a.change_type === 'PROMOTION' ? 'Promotion' : a.change_type === 'ALLOWANCE' ? 'Allowance change' : 'Salary change'} not in element entries (entered by ${a.entered_by}${a.after_cutoff ? ', after the cut-off' : ''})`,
      attrs: (k, planted) => ({ entered_by: R.pick(enterers), change_type: R.weighted([['SALARY_CHANGE', 5], ['PROMOTION', 3], ['ALLOWANCE', 2]] as const), after_cutoff: R.chance(planted ? 0.86 : 0.15) }) },
    { category: 'PAYROLL_FINDING', workflow: 'WF-13', reason: 'LEAVER_STILL_PAID', rate: 1,
      summary: () => 'Leaver still on the draft payroll', attrs: () => ({ entered_by: R.pick(enterers), after_cutoff: R.chance(0.3) }) },
    { category: 'PAYROLL_FINDING', workflow: 'WF-13', reason: 'DEDUCTION_CAP', rate: 1.5,
      summary: () => 'Deductions above 50% of the wage (Art. 93)', attrs: () => ({ entered_by: R.pick(enterers), after_cutoff: R.chance(0.15) }) },
  ];

  // Weekly volume per workflow.
  const vol: Record<string, number[]> = {};
  for (const wf of Object.keys(VOLUME)) vol[wf] = Array.from({ length: WEEKS }, () => Math.max(1, Math.round(client.size * VOLUME[wf] * (0.85 + R.next() * 0.3))));
  const winStart = (k: number) => new Date(anchor.getTime() - (7 * (k + 1) - 1) * DAY);
  const vRows: any[] = [];
  for (const wf of Object.keys(VOLUME)) for (let k = 0; k < WEEKS; k++) vRows.push([iso(winStart(k)), wf, vol[wf][k]]);
  for (const r of vRows) await c.query(`INSERT INTO layer.weekly_volume (week, workflow_id, cases) VALUES ($1,$2,$3)`, r);

  let seq = 1;
  const rows: any[] = [];
  for (const s of streams) {
    for (let k = WEEKS - 1; k >= 0; k--) {
      const planted = s.plant?.(k);
      const n = planted !== undefined ? Math.round((planted * vol[s.workflow][k]) / 100) : poisson((s.rate * vol[s.workflow][k]) / 100);
      for (let i = 0; i < n; i++) {
        const at = new Date(winStart(k).getTime() + R.int(0, 6) * DAY + R.int(7, 17) * 3600_000 + R.int(0, 59) * 60_000);
        if (at.getTime() > Date.now()) continue;
        const a = s.attrs(k, planted !== undefined);
        rows.push({ at, s, a });
      }
    }
  }
  rows.sort((x, y) => x.at.getTime() - y.at.getTime());
  const yy = String(anchor.getUTCFullYear()).slice(2);
  for (const r of rows) {
    await c.query(`INSERT INTO layer.issues (ref, occurred_at, category, workflow_id, reason_code, case_ref, summary, attrs) VALUES ($1,$2,$3,$4,$5,NULL,$6,$7)`,
      [`${client.code}-ISS-${yy}-${String(seq++).padStart(5, '0')}`, r.at, r.s.category, r.s.workflow, r.s.reason, r.s.summary(r.a), JSON.stringify(r.a)]);
  }

  // The Riyadh Air manager has been on leave since late September with no delegate set in the HRMS.
  if (client.key === 'riyadhair') {
    const st = iso(addDays(anchor, -26)), en = iso(addDays(anchor, 3));
    await c.query(`INSERT INTO hcm.absences (absence_number, person_id, type_code, start_date, end_date, days, status, approver_person_id, submitted_at, comments, source)
                   VALUES ('DEMO-ABS-P0001',$1,'ANNUAL',$2,$3,20,'APPROVED',NULL,$4,'Extended leave; no approval delegate recorded','HRMS')`, [mgrPersona.id, st, en, addDays(anchor, -40)]);
    await reconcileBalances(c);
  }
  return rows.length;
}
