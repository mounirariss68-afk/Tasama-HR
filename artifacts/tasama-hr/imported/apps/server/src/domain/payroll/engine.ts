/**
 * The payroll engine (design/payroll-addendum.md §5): pure arithmetic over a
 * client's approved terms and one period's confirmed inputs. No I/O, no clock,
 * no Claude. Every line carries the rule that produced it.
 *
 * Gross to net, proration, overtime and its cap, GOSI by first registration,
 * the deduction caps, the end-of-service and leave provisions, back pay for
 * closed months, off-cycle payments and the final settlement.
 */
import { gosiContribution } from './gosi.js';

export type DayRate = 'CALENDAR' | 'CAL30';
export type Overtime = 'LAW' | 'GROSS_1_5';

/** The parts of a client's approved policy the engine reads. */
export type EngineTerms = {
  name: string;
  /** Dimension 4: a day's pay is the monthly amount ÷ the month's calendar days, or ÷ 30. */
  dayRate: DayRate;
  /** Elements in the GOSI contribution wage (the law: basic and housing). */
  gosiElements: string[];
  /** Elements in the end-of-service wage; never fewer than basic plus regular allowances (Art. 2, 84). */
  eosElements: string[];
  /** Days in a year of service for the award (365). */
  eosYearDays: number;
  /**
   * Elements in the leave provision's daily wage, and what a day is: the month ÷ 30,
   * or the month ÷ the person's annual entitlement (the Tasama template's method).
   */
  leaveElements: string[];
  leaveDayDivisor: number | 'ENTITLEMENT';
  /** Round the year-to-date leave entitlement to this many decimals (the template rounds to 3). */
  leaveDaysPlaces?: number;
  /** Art. 107 or the client's higher rate. */
  overtime: Overtime;
  hoursPerDay: number;
  /** Dimension 3: hours a month the client pays without a further approval; hours beyond are held. */
  overtimeCapHours?: number | null;
  /** Where the overtime rule comes from, for the line's citation ("policy 2.0, clause 5.5"). */
  overtimeSource?: string;
  /** The company pays the employee's GOSI share (dimension 13). */
  gosiAbsorbed?: boolean;
  /** GOSI × pay days ÷ month days in a partial month, as Tasama's sheet does for some clients (walkthrough addendum R21). */
  gosiProrate?: boolean;
  /** The leave month cost nets the days taken in the month (walkthrough addendum R27). */
  leaveNetMonth?: boolean;
};

export type Money = { code: string; label: string; amount: number };

export type EngineEmployee = {
  ref: string;
  isSaudi: boolean;
  hire: string;
  /** First registration with GOSI, from gosi_registrations; the hire date when unknown. */
  gosiFirstRegistered?: string;
  /** False when the person is not yet registered with GOSI: no contribution is calculated, and the run is flagged. */
  gosiRegistered?: boolean;
  /** The company pays this person's GOSI share (a handbook limited to some grades); overrides the terms. */
  gosiAbsorbed?: boolean;
  /** Age at the period's end and the contributory wage a year ago: GOSI accepts at most 10% a year of increase over 50 (walkthrough addendum R22). */
  age?: number;
  gosiWageLastYear?: number;
  /** Annual leave days taken inside this month, for the netted month cost. */
  leaveUsedThisMonth?: number;
  lastDay?: string | null;
  /** Monthly contractual amounts by element code: basic, housing, transport, mobile, … */
  elements: Record<string, number>;
  absenceDays?: number;
  unpaidLeaveDays?: number;
  overtimeHours?: number;
  earnings?: Money[];
  deductions?: (Money & { kind?: 'ADVANCE' | 'FINE' | 'OTHER' })[];
  leave: { entitlementDays: number; carryoverDays: number; usedDaysYtd: number };
  /** Unpaid leave days beyond 20 in a year, excluded from service (Art. 116). */
  eosExcludedDays?: number;
  /** End-of-service balance carried from the previous month, when the ledger has one. */
  eosOpening?: number;
};

export type Line = { kind: 'EARNING' | 'DEDUCTION' | 'EMPLOYER'; code: string; label: string; amount: number; rule: string };
export type Flag = { code: string; severity: 'BLOCK' | 'WARN'; text: string };

export type EmployeeResult = {
  ref: string;
  payDays: number;
  monthDays: number;
  contractual: number;
  lines: Line[];
  gross: number;
  deductions: number;
  net: number;
  gosi: { wage: number; employee: number; employer: number; eeRate: number; erRate: number; group: string };
  provisions: {
    eos: { wage: number; serviceDays: number; accrued: number; month: number; catchUp: number; rule: string };
    leave: { balanceDays: number; dayCost: number; accrued: number; monthCost: number; rule: string };
  };
  flags: Flag[];
};

export type RunResult = { period: { start: string; end: string; days: number }; terms: string; employees: EmployeeResult[]; totals: Record<string, number> };

const DAY = 86_400_000;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const t = (s: string) => Date.parse(`${s.slice(0, 10)}T00:00:00Z`);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
/** Days from a to b, both counted. */
const daysIncl = (a: string, b: string) => Math.max(0, Math.round((t(b) - t(a)) / DAY) + 1);
const sum = (els: Record<string, number>, codes: string[]) => codes.reduce((s, c) => s + (els[c] ?? 0), 0);
const LABEL: Record<string, string> = { basic: 'Basic', housing: 'Housing', transport: 'Transport', mobile: 'Mobile', other: 'Other allowance' };
const label = (c: string) => LABEL[c] ?? c.charAt(0).toUpperCase() + c.slice(1);
const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Art. 84: half a month's wage a year for five years, a month a year after. */
/** Days between two dates on the 30/360 convention (each month 30 days), for clients whose EOS runs at 360. */
export function days360(a: string, b: string) {
  const A = new Date(`${a.slice(0, 10)}T00:00:00Z`), B = new Date(`${b.slice(0, 10)}T00:00:00Z`);
  const d1 = Math.min(A.getUTCDate(), 30), d2 = Math.min(B.getUTCDate(), 30);
  return Math.max(0, (B.getUTCFullYear() - A.getUTCFullYear()) * 360 + (B.getUTCMonth() - A.getUTCMonth()) * 30 + (d2 - d1) + 1);
}
export function eosAccrued(wage: number, serviceDays: number, yearDays = 365) {
  const years = serviceDays / yearDays;
  return wage * (Math.min(years, 5) * 0.5 + Math.max(0, years - 5));
}

export function runPayroll(period: { start: string; end: string }, terms: EngineTerms, people: EngineEmployee[]): RunResult {
  const monthDays = daysIncl(period.start, period.end);
  const prevEnd = iso(t(period.start) - DAY);
  const monthIndex = new Date(t(period.end)).getUTCMonth() + 1;
  const employees = people.map((e) => one(e));
  const totals: Record<string, number> = {};
  const add = (k: string, v: number) => { totals[k] = r2((totals[k] ?? 0) + v); };
  for (const r of employees) {
    for (const l of r.lines) add(`${l.kind}:${l.code}`, l.amount);
    add('gross', r.gross); add('deductions', r.deductions); add('net', r.net); add('contractual', r.contractual);
    add('gosiWage', r.gosi.wage); add('gosiEmployee', r.gosi.employee); add('gosiEmployer', r.gosi.employer);
    add('eosAccrued', r.provisions.eos.accrued); add('eosMonth', r.provisions.eos.month);
    add('leaveAccrued', r.provisions.leave.accrued); add('leaveMonthCost', r.provisions.leave.monthCost);
  }
  return { period: { ...period, days: monthDays }, terms: terms.name, employees, totals };

  function one(e: EngineEmployee): EmployeeResult {
    const flags: Flag[] = [];
    const lines: Line[] = [];
    const from = e.hire > period.start ? e.hire.slice(0, 10) : period.start;
    const to = e.lastDay && e.lastDay < period.end ? e.lastDay.slice(0, 10) : period.end;
    const employed = from > to ? 0 : daysIncl(from, to);
    const unpaid = (e.absenceDays ?? 0) + (e.unpaidLeaveDays ?? 0);
    const contractual = r2(Object.values(e.elements).reduce((s, v) => s + v, 0));

    // Days paid and the share of the month they buy.
    let payDays: number, share: number, dayRule: string;
    if (terms.dayRate === 'CALENDAR') {
      payDays = Math.max(0, employed - unpaid);
      share = payDays / monthDays;
      dayRule = `${payDays} of ${monthDays} calendar days`;
    } else {
      const off = (monthDays - employed) + unpaid;
      payDays = off === 0 ? 30 : Math.max(0, Math.min(30, employed) - unpaid);
      share = payDays / 30;
      dayRule = `${payDays} of 30 days`;
    }
    for (const [code, amount] of Object.entries(e.elements)) {
      if (!amount) continue;
      lines.push({ kind: 'EARNING', code, label: label(code), amount: r2(amount * share), rule: `${fmt(amount)} a month for ${dayRule} (dimension 4)` });
    }
    if (e.absenceDays) flags.push({ code: 'ABSENCE', severity: 'WARN', text: `${e.absenceDays} days of unexcused absence are not paid; this is not a fine and has no cap` });

    // Overtime, Art. 107: the hourly wage plus 50% of the basic hourly wage, or the client's higher rate.
    if (e.overtimeHours) {
      const hours = 30 * terms.hoursPerDay;
      const hourly = contractual / hours, basicHourly = (e.elements.basic ?? 0) / hours;
      const rate = terms.overtime === 'LAW' ? hourly + 0.5 * basicHourly : 1.5 * hourly;
      const cap = terms.overtimeCapHours ?? null;
      const paidHours = cap != null ? Math.min(e.overtimeHours, cap) : e.overtimeHours;
      const src = terms.overtimeSource ? `; ${terms.overtimeSource}` : '';
      lines.push({ kind: 'EARNING', code: 'overtime', label: 'Overtime', amount: r2(paidHours * rate), rule: terms.overtime === 'LAW' ? `${paidHours} h × ${fmt(rate)}: the hourly wage (${fmt(hourly)}) plus 50% of the basic hourly wage (Art. 107${src})` : `${paidHours} h × ${fmt(rate)}: 1.5 × the full hourly wage of ${fmt(hourly)} (above Art. 107${src})` });
      if (paidHours < e.overtimeHours) flags.push({ code: 'OVERTIME_CAP', severity: 'WARN', text: `${e.overtimeHours - paidHours} h above the policy's ${cap}-hour monthly cap are held: worth ${fmt((e.overtimeHours - paidHours) * rate)}, paid only if the client approves them` });
    }
    for (const x of e.earnings ?? []) lines.push({ kind: 'EARNING', code: x.code, label: x.label, amount: r2(x.amount), rule: 'Confirmed input for the month' });

    // GOSI on the registered wage, by first registration and the period's last day.
    const registered = e.gosiRegistered !== false;
    let gosiWage = sum(e.elements, terms.gosiElements);
    // Over 50, GOSI accepts at most 10% a year of increase in the contributory wage: the rest is held, and HR operations is told.
    if (e.isSaudi && (e.age ?? 0) >= 50 && e.gosiWageLastYear && gosiWage > e.gosiWageLastYear * 1.1 + 0.005) {
      const held = r2(gosiWage - e.gosiWageLastYear * 1.1);
      gosiWage = r2(e.gosiWageLastYear * 1.1);
      flags.push({ code: 'GOSI_WAGE_CAP', severity: 'WARN', text: `Over 50: GOSI accepts at most a 10% rise a year in the contributory wage, so it is held at ${fmt(gosiWage)} (last year's ${fmt(e.gosiWageLastYear)} + 10%); ${fmt(held)} of the wage is outside GOSI. HR operations confirms the registered wage with GOSI` });
    }
    const g1 = gosiContribution(gosiWage, e.isSaudi, e.gosiFirstRegistered ?? e.hire, period.end);
    // Some clients prorate the month's contribution by the days worked (Tasama's sheet); GOSI itself charges the full month.
    const prorated = terms.gosiProrate && share < 1;
    const g0 = prorated ? { ...g1, employee: r2(g1.employee * share), employer: r2(g1.employer * share) } : g1;
    const g = registered ? g0 : { ...g0, employee: 0, employer: 0 };
    if (!registered) flags.push({ code: 'GOSI_NOT_REGISTERED', severity: 'BLOCK', text: `Not registered with GOSI: ${fmt(g0.employee + g0.employer)} a month is not being contributed` });
    const absorbed = e.gosiAbsorbed ?? terms.gosiAbsorbed;
    const gRule = `${(g.eeRate * 100).toFixed(2)}% employee, ${(g.erRate * 100).toFixed(2)}% employer on ${fmt(g.wage)} (${terms.gosiElements.join(' + ')}, capped at 45,000)${prorated ? `, × ${dayRule} (the client's policy prorates GOSI)` : ''}`;
    if (g.employee) {
      if (absorbed) lines.push({ kind: 'EMPLOYER', code: 'gosi_ee_absorbed', label: 'GOSI, employee share paid by the company', amount: g.employee, rule: gRule });
      else lines.push({ kind: 'DEDUCTION', code: 'gosi', label: 'GOSI', amount: g.employee, rule: gRule });
    }
    if (g.employer) lines.push({ kind: 'EMPLOYER', code: 'gosi_er', label: 'GOSI, employer', amount: g.employer, rule: gRule });

    // Other deductions and the caps: an advance instalment ≤ 10% of the wage (Art. 92); all together ≤ 50% (Art. 93).
    let capped = 0;
    const fineCap = r2(5 * contractual / 30);
    let fines = 0;
    for (const d of e.deductions ?? []) {
      let amount = d.amount, rule = d.kind === 'ADVANCE' ? 'Advance instalment (Art. 92)' : 'Confirmed deduction';
      if (d.kind === 'FINE') {
        // Art. 70: fines in a month never exceed five days' wage, whatever the inputs say.
        const room = Math.max(0, fineCap - fines);
        if (amount > room + 0.005) flags.push({ code: 'FINE_CAP', severity: 'WARN', text: `A fine of ${fmt(amount)} was cut to ${fmt(room)}: fines in a month stop at five days' wage (${fmt(fineCap)}, Art. 70)` });
        amount = Math.min(amount, room); fines += amount;
        rule = `Lateness under the client's penalty table, after the employee was heard (Art. 71); at most five days' wage a month (Art. 70)`;
      }
      lines.push({ kind: 'DEDUCTION', code: d.code, label: d.label, amount: r2(amount), rule });
      capped += amount;
      if (d.kind === 'ADVANCE' && d.amount > 0.1 * contractual + 0.005) flags.push({ code: 'ADVANCE_CAP', severity: 'BLOCK', text: `The instalment of ${fmt(d.amount)} is above 10% of the wage (${fmt(0.1 * contractual)}, Art. 92)` });
    }
    if (capped > 0.5 * contractual + 0.005) flags.push({ code: 'DEDUCTION_CAP', severity: 'BLOCK', text: `Deductions of ${fmt(capped)} are above half the wage (${fmt(0.5 * contractual)}, Art. 93)` });

    const gross = r2(lines.filter((l) => l.kind === 'EARNING').reduce((s, l) => s + l.amount, 0));
    const deductions = r2(lines.filter((l) => l.kind === 'DEDUCTION').reduce((s, l) => s + l.amount, 0));

    // End of service: the accrued award at the period's end; the month's charge is its change.
    const eWage = sum(e.elements, terms.eosElements);
    const excluded = e.eosExcludedDays ?? 0;
    const span = terms.eosYearDays === 360 ? days360 : daysIncl;
    const serviceDays = Math.max(0, span(e.hire, to) - excluded);
    const prevDays = Math.max(0, span(e.hire, prevEnd) - excluded);
    const accrued = eosAccrued(eWage, serviceDays, terms.eosYearDays);
    const accruedPrev = eosAccrued(eWage, prevDays, terms.eosYearDays);
    const month = accrued - accruedPrev;
    const catchUp = e.eosOpening == null ? 0 : accruedPrev - e.eosOpening;
    const years = serviceDays / terms.eosYearDays;

    // Leave: the balance in days, valued at a day's wage.
    const monthly = e.leave.entitlementDays / 12;
    const ytd = terms.leaveDaysPlaces == null ? monthly * monthIndex : Math.round(monthly * monthIndex * 10 ** terms.leaveDaysPlaces) / 10 ** terms.leaveDaysPlaces;
    const balanceDays = e.leave.carryoverDays + ytd - e.leave.usedDaysYtd;
    const divisor = terms.leaveDayDivisor === 'ENTITLEMENT' ? e.leave.entitlementDays : terms.leaveDayDivisor;
    const dayCost = sum(e.elements, terms.leaveElements) / divisor;

    return {
      ref: e.ref, payDays, monthDays, contractual, lines, gross, deductions, net: r2(gross - deductions),
      gosi: { wage: g.wage, employee: g.employee, employer: g.employer, eeRate: g.eeRate, erRate: g.erRate, group: g.group },
      provisions: {
        eos: { wage: eWage, serviceDays, accrued, month, catchUp, rule: `${years.toFixed(3)} years of service${terms.eosYearDays === 360 ? ' (30-day months, 360 a year)' : ''} × ${years > 5 ? 'half a month for five years and a month after' : 'half a month a year'} on ${fmt(eWage)} (Art. 84)${excluded ? `; ${excluded} days of unpaid leave beyond 20 excluded (Art. 116)` : ''}` },
        leave: { balanceDays, dayCost, accrued: balanceDays * dayCost, monthCost: (terms.leaveNetMonth ? monthly - (e.leaveUsedThisMonth ?? 0) : monthly) * dayCost, rule: `${balanceDays.toFixed(3)} days (carried ${e.leave.carryoverDays} + ${monthly.toFixed(3)} a month × ${monthIndex} − ${e.leave.usedDaysYtd} taken) × ${fmt(dayCost)} a day (the month ÷ ${divisor})${terms.leaveNetMonth && e.leaveUsedThisMonth ? `; the month's cost nets the ${e.leaveUsedThisMonth} days taken this month` : ''}` },
      },
      flags,
    };
  }
}

/** Back pay (REC): a late or backdated change recalculated for each closed month, paid in the open run. Closed months are never reopened. */
export function backPay(months: { start: string; end: string }[], terms: EngineTerms, before: EngineEmployee, after: EngineEmployee): { lines: Line[]; total: number } {
  const lines: Line[] = [];
  for (const m of months) {
    const a = runPayroll(m, terms, [before]).employees[0], b = runPayroll(m, terms, [after]).employees[0];
    const diff = r2(b.gross - a.gross);
    if (Math.abs(diff) < 0.005) continue;
    const label = new Date(t(m.start)).toLocaleString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
    lines.push({ kind: 'EARNING', code: `backpay_${m.start.slice(0, 7)}`, label: `Back pay, ${label}`, amount: diff, rule: `${label} recalculated: ${fmt(b.gross)} under the change against ${fmt(a.gross)} paid; the closed month is not reopened` });
  }
  return { lines, total: r2(lines.reduce((n, l) => n + l.amount, 0)) };
}

/** Off-cycle (CAL-19): bonus, tickets, trips, relocation, school fees. No GOSI, no loan deductions, no WPS file. */
export function offCycle(items: Money[]): { lines: Line[]; total: number } {
  const lines: Line[] = items.map((x) => ({ kind: 'EARNING', code: x.code, label: x.label, amount: r2(x.amount), rule: 'Off-cycle payment: outside the GOSI wage, no deductions, paid outside the WPS salary file (CAL-19)' }));
  return { lines, total: r2(lines.reduce((n, l) => n + l.amount, 0)) };
}

export type Leaving = 'RESIGNATION' | 'TERMINATION' | 'ART_80' | 'ART_87';

/**
 * Final settlement: salary to the last day, unused leave, the end-of-service award by the kind of leaving
 * (Art. 84, 85, 87; none under Art. 80), notice not worked, less the outstanding advance in full on its own line.
 */
export function finalSettlement(period: { start: string; end: string }, terms: EngineTerms, e: EngineEmployee, o: { leaving: Leaving; noticeDaysUnworked?: number; advanceOutstanding?: number }) {
  const run = runPayroll(period, terms, [{ ...e, deductions: [] }]).employees[0];
  const lines: Line[] = run.lines.filter((l) => l.kind === 'EARNING');
  const daily = sum(e.elements, terms.leaveElements) / 30;
  const leaveDays = run.provisions.leave.balanceDays;
  if (leaveDays > 0) lines.push({ kind: 'EARNING', code: 'leave_encashment', label: 'Unused leave', amount: r2(leaveDays * daily), rule: `${leaveDays.toFixed(2)} days × ${fmt(daily)} a day: unused leave is paid on leaving (Art. 111)` });
  const full = run.provisions.eos.accrued, years = run.provisions.eos.serviceDays / terms.eosYearDays;
  const factor = o.leaving === 'ART_80' ? 0 : o.leaving === 'RESIGNATION' ? (years < 2 ? 0 : years < 5 ? 1 / 3 : years < 10 ? 2 / 3 : 1) : 1;
  const why = o.leaving === 'ART_80' ? 'no award: dismissal under Art. 80' : o.leaving === 'RESIGNATION' ? (factor === 0 ? 'resignation under two years: no award (Art. 85)' : factor === 1 ? 'resignation after ten years: the full award (Art. 85)' : `resignation: ${factor === 1 / 3 ? 'one third' : 'two thirds'} of the award (Art. 85)`) : o.leaving === 'ART_87' ? 'the full award (Art. 87)' : 'the full award (Art. 84)';
  if (factor > 0) lines.push({ kind: 'EARNING', code: 'eos_award', label: 'End-of-service award', amount: r2(full * factor), rule: `${years.toFixed(2)} years on ${fmt(run.provisions.eos.wage)}: ${why}` });
  if (o.noticeDaysUnworked) lines.push({ kind: 'EARNING', code: 'notice', label: 'Notice not worked', amount: r2(o.noticeDaysUnworked * sum(e.elements, terms.eosElements) / 30), rule: `${o.noticeDaysUnworked} days of notice paid in lieu (Art. 75)` });
  if (o.advanceOutstanding) lines.push({ kind: 'DEDUCTION', code: 'advance_balance', label: 'Advance outstanding', amount: r2(o.advanceOutstanding), rule: 'The outstanding advance, recovered in full on its own line; whether the 50% cap applies to a final settlement is to be confirmed with Tasama\'s legal team' });
  if (run.gosi.employee && !terms.gosiAbsorbed) lines.push({ kind: 'DEDUCTION', code: 'gosi', label: 'GOSI', amount: run.gosi.employee, rule: 'GOSI on the final month\'s registered wage' });
  const gross = r2(lines.filter((l) => l.kind === 'EARNING').reduce((n, l) => n + l.amount, 0));
  const deductions = r2(lines.filter((l) => l.kind === 'DEDUCTION').reduce((n, l) => n + l.amount, 0));
  return { lines, gross, deductions, net: r2(gross - deductions), years, factor };
}
