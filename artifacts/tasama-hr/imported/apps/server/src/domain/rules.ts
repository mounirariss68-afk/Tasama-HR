/**
 * Saudi private-sector rules used by the agents, in one place so every screen,
 * agent and settlement uses the same arithmetic.
 *
 * Sources: Saudi Labor Law (Royal Decree M/51, as amended 2025) Arts. 53, 75,
 * 84, 85, 88, 92, 93, 98, 109, 117; GOSI contribution rules (2026). Company
 * figures (leave above the minimum, advance limits, notice for senior grades)
 * come from the current client's handbook terms in clients.ts. Illustrative.
 */
import { currentClient } from '../db.js';
import { clientByKey, CLIENTS, type ClientConfig, type PolicyParams } from './clients.js';

export const client = (): ClientConfig => clientByKey(currentClient() ?? '') ?? CLIENTS[0];
export const pol = (): PolicyParams => client().policy;
export const DAY = 86_400_000;
export const iso = (d: Date) => d.toISOString().slice(0, 10);
export const parse = (s: string | Date) => (s instanceof Date ? s : new Date(`${String(s).slice(0, 10)}T00:00:00Z`));
export const addDays = (d: Date | string, n: number) => new Date(parse(d).getTime() + n * DAY);
export const daysBetween = (a: Date | string, b: Date | string) => Math.round((parse(b).getTime() - parse(a).getTime()) / DAY);
export const yearsBetween = (a: Date | string, b: Date | string) => daysBetween(a, b) / 365.25;
export const addMonths = (d: Date | string, n: number) => {
  const x = parse(d);
  return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + n, Math.min(x.getUTCDate(), 28)));
};
export const monthStart = (d: Date | string, n = 0) => {
  const x = parse(d);
  return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + n, 1));
};
export const monthEnd = (d: Date | string, n = 0) => {
  const x = parse(d);
  return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + n + 1, 0));
};
export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Annual leave a year (Art. 109 minimum 21 / 30 after five years; the client's handbook may give more). */
export function annualEntitlement(hireDate: string | Date, asOf: string | Date) {
  const p = pol();
  return yearsBetween(hireDate, asOf) >= 5 ? p.annualLeaveAfter5 : p.annualLeave;
}

/** Monthly wage used for the end-of-service award: basic plus housing and transport. */
export const eosWage = (basic: number) => round2(basic * (1 + (pol().housingPct + pol().transportPct) / 100));

/**
 * Art. 84: half a month's wage for each of the first five years, a full month for each year after.
 * Art. 85: on resignation, none under 2 years, one third for 2-5, two thirds for 5-10, full at 10+.
 */
export function gratuity(basic: number, hireDate: string | Date, lastDay: string | Date, unpaidDays = 0, kind: 'TERMINATION' | 'RESIGNATION' = 'TERMINATION') {
  const years = Math.max(0, (daysBetween(hireDate, lastDay) - unpaidDays) / 365);
  const wage = eosWage(basic);
  const full = Math.min(years, 5) * 0.5 * wage + Math.max(0, years - 5) * wage;
  let factor = 1, why = '';
  if (kind === 'RESIGNATION') {
    factor = years < 2 ? 0 : years < 5 ? 1 / 3 : years < 10 ? 2 / 3 : 1;
    why = years < 2 ? ' Resignation under two years: no award (Art. 85).' : factor < 1 ? ` Resignation: ${factor === 1 / 3 ? 'one third' : 'two thirds'} of the award (Art. 85).` : '';
  }
  const amount = round2(full * factor);
  return {
    years: round2(years), amount, full: round2(full), factor,
    rule: `${Math.min(years, 5).toFixed(2)} years x half a month${years > 5 ? ` + ${(years - 5).toFixed(2)} years x one month` : ''} at a monthly wage of SAR ${wage.toLocaleString('en-US')} (basic, housing and transport) (Art. 84).${why}`,
  };
}

/**
 * GOSI 2026. Saudis registered before 3 Jul 2024: employer 11.75%, employee 9.75% (annuities + SANED).
 * Registered from 3 Jul 2024 (new system): 12.25 / 10.25 Jan-Jun 2026, 12.75 / 10.75 from Jul 2026.
 * Non-Saudis: employer 2% (occupational hazards) only. Contribution wage = basic + housing, capped at SAR 45,000.
 */
export function gosi(basicPlusHousing: number, registeredFrom: string | Date, isSaudi = true, asOf: string | Date = new Date()) {
  const contributionSalary = Math.min(basicPlusHousing, 45_000);
  let ee = 0, er = 0.02;
  if (isSaudi) {
    const isNew = parse(registeredFrom) >= parse('2024-07-03');
    const h2 = parse(asOf) >= parse('2026-07-01');
    ee = isNew ? (h2 ? 0.1075 : 0.1025) : 0.0975;
    er = isNew ? (h2 ? 0.1275 : 0.1225) : 0.1175;
  }
  return { contributionSalary, employee: round2(contributionSalary * ee), employer: round2(contributionSalary * er), eeRate: ee, erRate: er };
}

/** HR-12 §12.1: notice the EMPLOYEE gives (30 days, Art. 75) or the contractual period for G11+. */
export const noticeDaysForGrade = (rank: number) => (rank >= 11 ? pol().seniorNoticeDays : 30);
/** Notice the EMPLOYER gives (60 days, Art. 75), or longer for G11+ by contract. */
export const employerNoticeDays = (rank: number) => (rank >= 11 ? Math.max(60, pol().seniorNoticeDays) : 60);

/** HR-07: advance limit from the client's handbook; Art. 92 instalment <= 10% of wage; Art. 93 all deductions <= 50%. */
export const advanceMax = (basic: number, gross: number) => round2(pol().advanceMultiple * (pol().advanceBasis === 'basic' ? basic : gross));
export const advanceMaxTerm = () => pol().advanceMaxTerm;
export const INSTALMENT_CAP = 0.1;
export const DEDUCTION_CAP = 0.5;

/** Art. 88: final settlement within 7 days of termination by the employer, 14 days when the employee resigns. */
export const settlementDeadlineDays = (kind: 'RESIGNATION' | 'TERMINATION') => (kind === 'RESIGNATION' ? 14 : 7);

export const money = (n: number) => `SAR ${Math.round(n).toLocaleString('en-US')}`;
