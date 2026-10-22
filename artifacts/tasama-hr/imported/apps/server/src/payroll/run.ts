/**
 * The open month's draft run for a client held in Tasama HR
 * (design/payroll-addendum.md §3, Runs): the engine over the employee master,
 * the confirmed entries, unpaid leave and the client's ACTIVE policy version.
 * Read-only: the draft is recalculated each time; nothing is written until a
 * run is approved (phase 5).
 */
import type { PoolClient } from 'pg';
import { runPayroll, type EngineEmployee, type RunResult } from '../domain/payroll/engine.js';
import { ELEMENT_OF, termsFromRules, gosiAbsorbedGrades } from '../domain/payroll/terms.js';
import { activeVersion, rulesOf } from './policy.js';

type Q = PoolClient | { query: PoolClient['query'] };
const d10 = (v: any) => (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10);

export type DraftRow = {
  person_id: number; person_number: string; name: string; name_ar: string; department: string; grade: string;
  gross: number; deductions: number; net: number; prev_net: number | null; change: number | null; pay_days: number;
  lines: any[]; flags: any[]; eos: any; leave: any;
};

export async function draftRun(c: Q) {
  const period = (await c.query(`SELECT * FROM hcm.payroll_periods WHERE status='OPEN' ORDER BY start_date DESC LIMIT 1`)).rows[0];
  if (!period) return null;
  const ps = d10(period.start_date), pe = d10(period.end_date);
  const version = await activeVersion(c);
  const rules = version ? (await rulesOf(c, version.id)).map((r: any) => ({ key: r.key, dim: r.dim, value: r.value, num: r.num == null ? null : Number(r.num), flag: r.flag, clause: r.clause, resolution: r.resolution })) : [];
  const terms = termsFromRules(version ? `policy ${version.version}` : 'the law', rules);
  const absorbed = new Set(gosiAbsorbedGrades(rules));
  const people = (await c.query(
    `SELECT p.id, p.person_number, p.display_name, p.display_name_ar, p.is_saudi, wr.start_date, wr.end_date, d.name AS department, g.code AS grade,
            gr.first_registered,
            (SELECT entitlement FROM hcm.absence_balances b WHERE b.person_id=p.id AND b.type_code='ANNUAL' ORDER BY year DESC LIMIT 1) ent,
            (SELECT carried_over FROM hcm.absence_balances b WHERE b.person_id=p.id AND b.type_code='ANNUAL' ORDER BY year DESC LIMIT 1) carried
       FROM hcm.persons p JOIN hcm.work_relationships wr ON wr.person_id=p.id
       LEFT JOIN hcm.assignments a ON a.person_id=p.id AND a.effective_end='4712-12-31'
       LEFT JOIN hcm.departments d ON d.id=a.department_id LEFT JOIN hcm.grades g ON g.id=a.grade_id
       LEFT JOIN hcm.gosi_registrations gr ON gr.person_id=p.id
      WHERE wr.worker_type='E' AND wr.start_date <= $2 AND (wr.end_date IS NULL OR wr.end_date >= $1)`, [ps, pe])).rows;
  const entries = (await c.query(`SELECT * FROM hcm.element_entries WHERE effective_start <= $2 AND effective_end >= $1`, [ps, pe])).rows;
  const absences = (await c.query(`SELECT person_id, type_code, start_date, end_date, days, status FROM hcm.absences WHERE status IN ('APPROVED','COMPLETED') AND start_date <= $1`, [pe])).rows;
  const prev = new Map((await c.query(`SELECT r.person_id, r.net FROM hcm.payroll_results r JOIN hcm.payroll_periods pp ON pp.id=r.period_id WHERE pp.end_date < $1 AND pp.end_date >= $1::date - 31`, [ps])).rows.map((r: any) => [r.person_id, Number(r.net)]));
  const opening = new Map((await c.query(`SELECT v.person_id, v.eos_accrued FROM hcm.payroll_provisions v JOIN hcm.payroll_periods pp ON pp.id=v.period_id WHERE pp.end_date < $1 AND pp.end_date >= $1::date - 31`, [ps])).rows.map((r: any) => [r.person_id, Number(r.eos_accrued)]));

  const input: EngineEmployee[] = [];
  const meta = new Map<number, any>();
  for (const p of people) {
    const es = entries.filter((e: any) => e.person_id === p.id);
    const elements: Record<string, number> = {};
    for (const e of es) if (ELEMENT_OF[e.element_code]) elements[ELEMENT_OF[e.element_code]] = (elements[ELEMENT_OF[e.element_code]] ?? 0) + Number(e.amount);
    if (!Object.keys(elements).length) continue;
    const year = pe.slice(0, 4);
    const used = absences.filter((a: any) => a.person_id === p.id && a.type_code === 'ANNUAL' && a.status === 'COMPLETED' && d10(a.end_date) <= pe && d10(a.start_date) >= `${year}-01-01`).reduce((n: number, a: any) => n + Number(a.days), 0);
    const unpaid = absences.filter((a: any) => a.person_id === p.id && a.type_code === 'UNPAID' && d10(a.end_date) >= ps).reduce((n: number, a: any) => n + Number(a.days), 0);
    input.push({
      ref: String(p.id), isSaudi: p.is_saudi, hire: d10(p.start_date), lastDay: p.end_date ? d10(p.end_date) : null,
      gosiFirstRegistered: p.first_registered ? d10(p.first_registered) : d10(p.start_date),
      gosiRegistered: es.some((e: any) => e.element_code === 'GOSI_ER'),
      gosiAbsorbed: absorbed.has(p.grade) || undefined,
      elements, unpaidLeaveDays: unpaid || undefined,
      overtimeHours: es.filter((e: any) => e.element_code === 'OT_HOURS').reduce((n: number, e: any) => n + Number(e.amount), 0) || undefined,
      earnings: es.filter((e: any) => e.element_code === 'OVERTIME').map((e: any) => ({ code: 'overtime', label: 'Overtime', amount: Number(e.amount) })),
      deductions: [
        ...es.filter((e: any) => e.element_code === 'ADVANCE_REC').map((e: any) => ({ code: 'advance', label: 'Advance recovery', amount: Number(e.amount), kind: 'ADVANCE' as const })),
        ...es.filter((e: any) => e.element_code === 'LATE_FINE').map((e: any) => ({ code: 'late_fine', label: 'Lateness fine', amount: Number(e.amount), kind: 'FINE' as const })),
      ],
      absenceDays: es.filter((e: any) => e.element_code === 'ABSENT_DAYS').reduce((n: number, e: any) => n + Number(e.amount), 0) || undefined,
      leave: { entitlementDays: Number(p.ent ?? 21), carryoverDays: Number(p.carried ?? 0), usedDaysYtd: used },
      eosOpening: opening.get(p.id),
    });
    meta.set(p.id, p);
  }
  const run: RunResult = runPayroll({ start: ps, end: pe }, terms, input);
  const rows: DraftRow[] = run.employees.map((r) => {
    const p = meta.get(Number(r.ref));
    const pn = prev.get(p.id) ?? null;
    return {
      person_id: p.id, person_number: p.person_number, name: p.display_name, name_ar: p.display_name_ar, department: p.department, grade: p.grade,
      gross: r.gross, deductions: r.deductions, net: r.net, prev_net: pn, change: pn == null ? null : Math.round((r.net - pn) * 100) / 100, pay_days: r.payDays,
      lines: r.lines, flags: r.flags, eos: r.provisions.eos, leave: r.provisions.leave,
    };
  });
  return { period: { name: period.period_name, start: ps, end: pe, cutoff: d10(period.cutoff_date), pay: d10(period.pay_date) }, terms, version: version?.version ?? null, totals: run.totals, rows };
}

/** Each closed month's provisions, summed, for the trend. */
export async function provisionHistory(c: Q) {
  return (await c.query(
    `SELECT pp.period_name, SUM(v.eos_accrued)::float eos, SUM(v.leave_accrued)::float leave, SUM(v.eos_month)::float eos_month, SUM(v.leave_month)::float leave_month, COUNT(*)::int people
       FROM hcm.payroll_provisions v JOIN hcm.payroll_periods pp ON pp.id=v.period_id GROUP BY pp.period_name ORDER BY pp.period_name`)).rows;
}
