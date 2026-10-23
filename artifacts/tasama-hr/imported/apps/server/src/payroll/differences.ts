/**
 * Mutabaqa: why each person is paid differently from last month (design/payroll-addendum.md §18).
 *
 * For each person the engine starts from last month's inputs and replaces one input at a time with
 * this month's, in a fixed order. The change in net pay at each step is that cause's share, so the
 * causes add up to the difference exactly. Arithmetic only; Claude never calculates.
 */
import type { PoolClient } from 'pg';
import { runPayroll, finalSettlement, type EngineEmployee, type EngineTerms } from '../domain/payroll/engine.js';
import { engineInputs } from './run.js';

type Q = PoolClient | { query: PoolClient['query'] };
const r2 = (n: number) => Math.round(n * 100) / 100;

export const CAUSES = [
  { key: 'month', label: 'Days in the month' },
  { key: 'joined', label: 'Joined' },
  { key: 'left', label: 'Left or leaving' },
  { key: 'pay', label: 'Pay change' },
  { key: 'unpaid', label: 'Unpaid days' },
  { key: 'overtime', label: 'Overtime' },
  { key: 'backpay', label: 'Back pay and other earnings' },
  { key: 'fines', label: 'Lateness fines' },
  { key: 'advance', label: 'Advances' },
  { key: 'gosi', label: 'GOSI' },
  { key: 'other', label: 'Not explained' },
] as const;
type Cause = (typeof CAUSES)[number]['key'];

const net = (p: { start: string; end: string }, t: EngineTerms, e: EngineEmployee) => runPayroll(p, t, [e]).employees[0]?.net ?? 0;
const LEAVING: Record<string, 'RESIGNATION' | 'TERMINATION' | 'ART_80'> = { RESIGNATION: 'RESIGNATION', TERMINATION: 'TERMINATION', END_OF_CONTRACT: 'TERMINATION', PROBATION_END: 'TERMINATION', ART_80: 'ART_80' };

/** Each person's change in net pay, split into causes; and the totals by cause for the waterfall. */
export async function explain(c: Q, open: { start: string; end: string }) {
  const prevPer = (await c.query(`SELECT * FROM hcm.payroll_periods WHERE end_date < $1 ORDER BY end_date DESC LIMIT 1`, [open.start])).rows[0];
  const cur = await engineInputs(c, { start_date: open.start, end_date: open.end });
  const prev = prevPer ? await engineInputs(c, prevPer) : null;
  const P0 = prev ? { start: prev.ps, end: prev.pe } : open, P1 = { start: cur.ps, end: cur.pe };
  const t = cur.terms;
  const before = new Map((prev?.input ?? []).map((e) => [e.ref, e]));
  const after = new Map(cur.input.map((e) => [e.ref, e]));
  const people: { person_id: number; name: string; from: number; to: number; causes: Partial<Record<Cause, number>> }[] = [];
  // What was actually paid last month: a change dated back into it after it was paid shows as a pay change.
  const paid = new Map((prevPer ? (await c.query(`SELECT person_id, net FROM hcm.payroll_results WHERE period_id=$1`, [prevPer.id])).rows : []).map((r: any) => [String(r.person_id), Number(r.net)]));
  const advances = new Map((await c.query(`SELECT person_id, SUM(outstanding)::float o FROM hcm.advances WHERE status='ACTIVE' GROUP BY person_id`)).rows.map((r: any) => [String(r.person_id), Number(r.o)]));
  /** This month's net as the run pays it: the final settlement for a leaver whose last day is in the month. */
  const paidNow = (ref: string, e: EngineEmployee) => {
    const m = cur.meta.get(Number(ref));
    const leaving = m?.termination_action && e.lastDay && e.lastDay >= P1.start && e.lastDay <= P1.end ? LEAVING[m.termination_action] : undefined;
    return leaving ? finalSettlement(P1, t, e, { leaving, advanceOutstanding: advances.get(ref) || undefined }).net : net(P1, t, e);
  };
  const name = (ref: string) => (cur.meta.get(Number(ref)) ?? prev?.meta.get(Number(ref)))?.display_name ?? ref;
  for (const ref of new Set([...before.keys(), ...after.keys()])) {
    const a = before.get(ref), b = after.get(ref);
    const causes: Partial<Record<Cause, number>> = {};
    const add = (k: Cause, v: number) => { if (Math.abs(v) >= 0.005) causes[k] = r2((causes[k] ?? 0) + v); };
    let from = 0, to = 0;
    if (!a && b) { to = paidNow(ref, b); add('joined', to); }
    else if (a && !b) { from = paid.get(ref) ?? net(P0, t, a); add('left', -from); }
    else if (a && b) {
      const recalculated = net(P0, t, a);
      from = paid.get(ref) ?? recalculated;
      add('pay', recalculated - from);
      let x: EngineEmployee = { ...a };
      let v = recalculated;
      const step = (k: Cause, p: { start: string; end: string }, next: EngineEmployee) => { const n = net(p, t, next); add(k, n - v); v = n; x = next; };
      const fines = (e: EngineEmployee) => (e.deductions ?? []).filter((d) => d.kind === 'FINE');
      const advances = (e: EngineEmployee) => (e.deductions ?? []).filter((d) => d.kind === 'ADVANCE');
      const others = (e: EngineEmployee) => (e.deductions ?? []).filter((d) => d.kind !== 'FINE' && d.kind !== 'ADVANCE');
      // A person who joined or left part-way through last month is paid a different number of days for that reason, not the calendar's.
      const partLast = a.hire > P0.start || (a.lastDay != null && a.lastDay < P0.end);
      step(partLast ? (a.hire > P0.start ? 'joined' : 'left') : 'month', P1, { ...x, eosOpening: b.eosOpening });
      step('left', P1, { ...x, hire: b.hire, lastDay: b.lastDay });
      step('pay', P1, { ...x, elements: b.elements, gosiAbsorbed: b.gosiAbsorbed });
      step('unpaid', P1, { ...x, unpaidLeaveDays: b.unpaidLeaveDays, absenceDays: b.absenceDays });
      step('overtime', P1, { ...x, overtimeHours: b.overtimeHours, earnings: [...(x.earnings ?? []).filter((e) => e.code !== 'overtime'), ...(b.earnings ?? []).filter((e) => e.code === 'overtime')] });
      step('backpay', P1, { ...x, earnings: b.earnings });
      step('fines', P1, { ...x, deductions: [...advances(x), ...others(x), ...fines(b)] });
      step('advance', P1, { ...x, deductions: [...advances(b), ...others(x), ...fines(b)] });
      step('gosi', P1, { ...b });
      // Anything the steps above do not cover (none expected) is shown, never hidden.
      add('other', net(P1, t, b) - v);
      // The final settlement on leaving: unused leave, the award, the advance recovered.
      const settled = paidNow(ref, b);
      add('left', settled - net(P1, t, b));
      to = settled;
    }
    if (Object.keys(causes).length) people.push({ person_id: Number(ref), name: name(ref), from: r2(from), to: r2(to), causes });
  }
  const totals: Record<string, number> = {};
  for (const p of people) for (const [k, v] of Object.entries(p.causes)) totals[k] = r2((totals[k] ?? 0) + (v as number));
  const lastNet = r2((prev?.input ?? []).reduce((s, e) => s + (paid.get(e.ref) ?? net(P0, t, e)), 0));
  const thisNet = r2(cur.input.reduce((s, e) => s + paidNow(e.ref, e), 0));
  return {
    period: { prev: prevPer?.period_name ?? null },
    lastNet, thisNet, totals,
    steps: CAUSES.filter((x) => Math.abs(totals[x.key] ?? 0) >= 0.5).map((x) => ({ key: x.key, label: x.label, amount: totals[x.key] })),
    people: people.sort((p, q) => Math.abs(q.to - q.from) - Math.abs(p.to - p.from)),
    unexplained: Math.abs(totals.other ?? 0) >= 0.5,
  };
}
