/**
 * A client's approved policy rules → the terms the payroll engine reads
 * (design/payroll-addendum.md §5). A rule Nizam refused (BELOW_LAW) never
 * reaches the engine: the law's floor applies in its place.
 */
import type { EngineTerms } from './engine.js';

export type RuleRow = { key: string; dim: number; value: string; num?: number | null; flag?: string | null; clause?: string | null; resolution?: string | null };

/** The element codes the HRMS stores, and the engine's names for them. */
export const ELEMENT_OF: Record<string, string> = { BASIC: 'basic', HOUSING: 'housing', TRANSPORT: 'transport', OTHER_ALW: 'other' };
export const HCM_OF: Record<string, string> = { basic: 'BASIC', housing: 'HOUSING', transport: 'TRANSPORT', other: 'OTHER_ALW', overtime: 'OVERTIME', gosi: 'GOSI_EE', gosi_er: 'GOSI_ER', gosi_ee_absorbed: 'GOSI_EE_CO', advance: 'ADVANCE_REC', late_fine: 'LATE_FINE', back_pay: 'BACK_PAY', remote_site: 'REMOTE_SITE', gosi_arrears: 'GOSI_ARREARS', leave_encashment: 'LEAVE_ENCASH', eos_award: 'GRATUITY', advance_balance: 'ADVANCE_RECOVERY', notice: 'NOTICE_PAY' };

export function termsFromRules(name: string, rules: RuleRow[]): EngineTerms {
  const get = (k: string) => rules.find((r) => r.key === k);
  const day = get('dayrate')?.value ?? '';
  const ot = get('overtime.rate');
  return {
    name,
    dayRate: /calendar/i.test(day) ? 'CALENDAR' : 'CAL30',
    gosiElements: ['basic', 'housing'],
    // Art. 2, 84: basic plus the regular allowances. A narrower handbook wage is refused, so it is never read here.
    eosElements: ['basic', 'housing', 'transport', 'other'],
    eosYearDays: 365,
    leaveElements: ['basic', 'housing', 'transport', 'other'],
    leaveDayDivisor: 30,
    // An unclear rule counts once a reading was chosen for it (WF-26); a refused rule never does.
    overtime: ot && (!ot.flag || (ot.flag === 'UNCLEAR' && ot.resolution)) && /full hourly|gross/i.test(ot.value) ? 'GROSS_1_5' : 'LAW',
    overtimeCapHours: get('overtime.cap')?.num ?? null,
    overtimeSource: `${name}${ot?.clause ? `, clause ${ot.clause}` : ''}`,
    hoursPerDay: 8,
    gosiAbsorbed: /paid by the company/i.test(get('gosi.absorb')?.value ?? '') && !/grades?/i.test(get('gosi.absorb')?.value ?? ''),
  };
}

/** Grades for which the company pays the employee's GOSI share, when the handbook limits it ("grades G04 to G06"). */
export function gosiAbsorbedGrades(rules: RuleRow[]): string[] {
  const v = rules.find((r) => r.key === 'gosi.absorb')?.value ?? '';
  if (!/paid by the company/i.test(v)) return [];
  const m = v.match(/G(\d+)\s*to\s*G(\d+)/i);
  if (!m) return [];
  const out: string[] = [];
  for (let g = Number(m[1]); g <= Number(m[2]); g++) out.push(`G${String(g).padStart(2, '0')}`);
  return out;
}
