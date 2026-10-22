/**
 * The payroll engine (design/payroll-addendum.md §5): pure arithmetic over a
 * client's approved terms and one period's confirmed inputs. No I/O, no clock,
 * no Claude. Every line carries the rule that produced it.
 *
 * Phase 2, session 1: gross to net, proration, overtime, GOSI by first
 * registration, the deduction caps, and the end-of-service and leave
 * provisions. Back pay, off-cycle and final settlement follow in later sessions.
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
  /** The company pays the employee's GOSI share (dimension 13). */
  gosiAbsorbed?: boolean;
};

export type Money = { code: string; label: string; amount: number };

export type EngineEmployee = {
  ref: string;
  isSaudi: boolean;
  hire: string;
  /** First registration with GOSI, from gosi_registrations; the hire date when unknown. */
  gosiFirstRegistered?: string;
  lastDay?: string | null;
  /** Monthly contractual amounts by element code: basic, housing, transport, mobile, … */
  elements: Record<string, number>;
  absenceDays?: number;
  unpaidLeaveDays?: number;
  overtimeHours?: number;
  earnings?: Money[];
  deductions?: (Money & { kind?: 'ADVANCE' | 'OTHER' })[];
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
const LABEL: Record<string, string> = { basic: 'Basic', housing: 'Housing', transport: 'Transport', mobile: 'Mobile' };
const label = (c: string) => LABEL[c] ?? c.charAt(0).toUpperCase() + c.slice(1);
const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Art. 84: half a month's wage a year for five years, a month a year after. */
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
      lines.push({ kind: 'EARNING', code: 'overtime', label: 'Overtime', amount: r2(e.overtimeHours * rate), rule: terms.overtime === 'LAW' ? `${e.overtimeHours} h at the hourly wage plus 50% of the basic hourly wage (Art. 107)` : `${e.overtimeHours} h at 1.5 × the full hourly wage (the client's policy, above Art. 107)` });
    }
    for (const x of e.earnings ?? []) lines.push({ kind: 'EARNING', code: x.code, label: x.label, amount: r2(x.amount), rule: 'Confirmed input for the month' });

    // GOSI on the registered wage, by first registration and the period's last day.
    const g = gosiContribution(sum(e.elements, terms.gosiElements), e.isSaudi, e.gosiFirstRegistered ?? e.hire, period.end);
    const gRule = `${(g.eeRate * 100).toFixed(2)}% employee, ${(g.erRate * 100).toFixed(2)}% employer on ${fmt(g.wage)} (${terms.gosiElements.join(' + ')}, capped at 45,000)`;
    if (g.employee) {
      if (terms.gosiAbsorbed) lines.push({ kind: 'EMPLOYER', code: 'gosi_ee_absorbed', label: 'GOSI, employee share paid by the company', amount: g.employee, rule: gRule });
      else lines.push({ kind: 'DEDUCTION', code: 'gosi', label: 'GOSI', amount: g.employee, rule: gRule });
    }
    lines.push({ kind: 'EMPLOYER', code: 'gosi_er', label: 'GOSI, employer', amount: g.employer, rule: gRule });

    // Other deductions and the caps: an advance instalment ≤ 10% of the wage (Art. 92); all together ≤ 50% (Art. 93).
    let capped = 0;
    for (const d of e.deductions ?? []) {
      lines.push({ kind: 'DEDUCTION', code: d.code, label: d.label, amount: r2(d.amount), rule: d.kind === 'ADVANCE' ? 'Advance instalment (Art. 92)' : 'Confirmed deduction' });
      capped += d.amount;
      if (d.kind === 'ADVANCE' && d.amount > 0.1 * contractual + 0.005) flags.push({ code: 'ADVANCE_CAP', severity: 'BLOCK', text: `The instalment of ${fmt(d.amount)} is above 10% of the wage (${fmt(0.1 * contractual)}, Art. 92)` });
    }
    if (capped > 0.5 * contractual + 0.005) flags.push({ code: 'DEDUCTION_CAP', severity: 'BLOCK', text: `Deductions of ${fmt(capped)} are above half the wage (${fmt(0.5 * contractual)}, Art. 93)` });

    const gross = r2(lines.filter((l) => l.kind === 'EARNING').reduce((s, l) => s + l.amount, 0));
    const deductions = r2(lines.filter((l) => l.kind === 'DEDUCTION').reduce((s, l) => s + l.amount, 0));

    // End of service: the accrued award at the period's end; the month's charge is its change.
    const eWage = sum(e.elements, terms.eosElements);
    const excluded = e.eosExcludedDays ?? 0;
    const serviceDays = Math.max(0, daysIncl(e.hire, to) - excluded);
    const prevDays = Math.max(0, daysIncl(e.hire, prevEnd) - excluded);
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
        eos: { wage: eWage, serviceDays, accrued, month, catchUp, rule: `${years.toFixed(3)} years of service × ${years > 5 ? 'half a month for five years and a month after' : 'half a month a year'} on ${fmt(eWage)} (Art. 84)${excluded ? `; ${excluded} days of unpaid leave beyond 20 excluded (Art. 116)` : ''}` },
        leave: { balanceDays, dayCost, accrued: balanceDays * dayCost, monthCost: monthly * dayCost, rule: `${balanceDays.toFixed(3)} days (carried ${e.leave.carryoverDays} + ${monthly.toFixed(3)} a month × ${monthIndex} − ${e.leave.usedDaysYtd} taken) × ${fmt(dayCost)} a day (the month ÷ ${divisor})` },
      },
      flags,
    };
  }
}
