/**
 * Nizam reads a new client's handbook (design/payroll-addendum.md §13, §19).
 *
 * The PDF's text is split back into policies and clauses. The client's terms are read from the
 * clauses in the standard wordings Tasama's clause library uses, as Claude would learn a real
 * handbook's. The reading is then checked by writing the handbook again from the terms read: every
 * clause that does not come back word for word is shown, so nothing is read silently wrong.
 * The 27 dimensions and the law's floor are readRules() and legalCheck(), as for every client.
 */
import type { ClientConfig, PolicyParams } from '../domain/clients.js';
import type { Clause, Policy } from '../domain/policies.js';
import { policiesFor } from '../domain/policies.js';
import { PAYROLL_POLICY, readRules, type PayrollPolicy, type Rule } from '../domain/payroll-policy.js';

/** Terms a handbook does not state fall back to Tasama's standard template (the law where it sets one). */
export const TEMPLATE_PARAMS: PolicyParams = {
  annualLeave: 21, annualLeaveAfter5: 30, carryForwardMax: 0, probationDays: 90, housingPct: 25, transportPct: 10, weeklyHours: 48, remoteDays: 0,
  advanceMultiple: 1, advanceBasis: 'basic', advanceMinServiceMonths: 6, advanceMaxTerm: 12, letterHours: 24, ticket: 'none', educationAllowance: 0, educationChildren: 0,
  medicalClass: 'B', sickTopUpDays: 0, seniorNoticeDays: 60, bonusTargetPct: 0, payDay: 27, cutoffDay: 20,
};
export const TEMPLATE_PAY: PayrollPolicy = {
  weekDays: 'Sunday to Thursday', weekDays_ar: 'من الأحد إلى الخميس', shifts: '', shifts_ar: '',
  graceMin: 0, latenessMethod: 'TABLE', roundMin: 0, overtimeWho: 'all employees', overtimeWho_ar: 'جميع الموظفين', overtimeCap: 0, holidayMultiple: 0, timeOffInstead: false,
  dayRate: 'D30', extra: [], housingAdvance: 'MONTHLY', educationSchedule: 'NONE', bonusTiming: 'paid in March', bonusTiming_ar: 'تُصرف في مارس',
  merit: [0, 0, 3, 5, 7], eos: 'FIXED', gosiAbsorb: null, finalPay: 'LEGAL',
};

/** The handbook PDF's pages back into policies and clauses. The cover page is skipped. */
export function handbookFromPages(pages: string[]): { title: string; version: string; effective: string | null; owner: string; policies: Policy[] } {
  const cover = pages[0]?.split('\n').map((l) => l.trim()).filter(Boolean) ?? [];
  const title = cover.find((l) => /policy manual|handbook/i.test(l)) ?? 'HR Policy Manual';
  const verLine = cover.find((l) => /^Version\s/i.test(l)) ?? '';
  const version = verLine.match(/^Version\s+([\d.]+)/i)?.[1] ?? '1';
  const eff = verLine.match(/effective\s+(\d{1,2} \w+ \d{4})/i)?.[1];
  const policies: Policy[] = [];
  let cur: Policy | null = null, clause: Clause | null = null;
  for (const page of pages.slice(1)) {
    const lines = page.split('\n').map((l) => l.trim()).filter(Boolean);
    lines.forEach((line, i) => {
      const sec = i === 0 ? line.match(/^(HR-(\d{2}))\s+(.+)$/) : null;
      if (sec) { cur = { id: sec[1], title: sec[3], title_ar: '', version: '', effective: '', owner: '', summary: '', clauses: [] }; policies.push(cur); clause = null; return; }
      if (!cur) return;
      const own = line.match(/^Policy owner:\s*(.+?)\s*·\s*Version\s*([\d.]+)/);
      if (own) { cur.owner = own[1]; cur.version = own[2]; return; }
      const head = line.match(/^(\d{1,2})\.(\d{1,2})\s+(.+)$/);
      if (head && Number(head[1]) === Number(cur.id.slice(3))) { clause = { ref: `${head[1]}.${head[2]}`, heading: head[3], heading_ar: '', en: '', ar: '', tags: [] }; cur.clauses.push(clause); return; }
      if (clause) clause.en = clause.en ? `${clause.en} ${line}` : line;
    });
  }
  return { title, version, effective: eff ? new Date(Date.parse(`${eff} UTC`)).toISOString().slice(0, 10) : null, owner: '', policies };
}

const num = (re: RegExp, s: string | undefined) => { const m = s?.match(re); return m ? Number(m[1].replace(/,/g, '')) : null; };
const WORDS: Record<string, number> = { "half a month's": 0.5, "one month's": 1, "two months'": 2 };

/** The client's terms, read from its clauses. Returns what was read and what fell back to the template. */
export function readTerms(policies: Policy[]) {
  const text = (ref: string) => { for (const p of policies) { const k = p.clauses.find((x) => x.ref === ref); if (k) return k.en; } return undefined; };
  const params: PolicyParams = { ...TEMPLATE_PARAMS };
  const pay: PayrollPolicy = { ...TEMPLATE_PAY, merit: [...TEMPLATE_PAY.merit] as PayrollPolicy['merit'], extra: [] };
  const fromTemplate: string[] = [];
  const set = <T,>(field: string, v: T | null | undefined, apply: (v: T) => void) => { if (v == null) fromTemplate.push(field); else apply(v); };

  const t51 = text('5.1');
  const short = t51?.match(/^The working week at (.+?) is \d+ hours/)?.[1] ?? null;
  set('weeklyHours', num(/is (\d+) hours/, t51), (v) => { params.weeklyHours = v; });
  set('weekDays', t51?.match(/is \d+ hours, ([^.]+)\./)?.[1], (v) => { pay.weekDays = v; });
  set('shifts', t51?.match(/is \d+ hours, [^.]+\. (.+?\.) No one is scheduled/)?.[1], (v) => { pay.shifts = v; });

  const t53 = text('5.3');
  set('overtimeWho', t53?.match(/Overtime is open to (.+?) and must be approved/)?.[1], (v) => { pay.overtimeWho = v; });
  pay.overtimeCap = num(/may not exceed (\d+) hours a month/, t53) ?? 0;
  pay.holidayMultiple = num(/public holiday is paid at (\d+) times/, t53) ?? 0;
  pay.timeOffInstead = /take time off instead of overtime pay/.test(t53 ?? '');

  const t55 = text('5.5');
  pay.graceMin = /No grace period/.test(t55 ?? '') ? 0 : num(/grace period of (\d+) minutes/, t55) ?? 0;
  pay.latenessMethod = /penalty table/.test(t55 ?? '') ? 'TABLE' : /Three late arrivals/.test(t55 ?? '') ? 'THREE_LATES' : /minute rate/.test(t55 ?? '') ? 'MINUTES' : 'TABLE';
  pay.roundMin = num(/rounded up to the next (\d+) minutes/, t55) ?? 0;

  const t56 = text('5.6');
  params.remoteDays = /may work remotely up to one day/.test(t56 ?? '') ? 1 : num(/may work remotely up to (\d+) days/, t56) ?? 0;

  const t61 = text('6.1');
  set('housingPct', num(/housing allowance of (\d+)%/, t61), (v) => { params.housingPct = v; });
  set('transportPct', num(/transport allowance of (\d+)%/, t61), (v) => { params.transportPct = v; });
  pay.housingAdvance = /a year's housing allowance in advance/.test(t61 ?? '') ? 'ANNUAL' : /company housing instead/.test(t61 ?? '') ? 'COMPANY' : 'MONTHLY';
  pay.dayRate = /divided by the number of calendar days/.test(text('6.2') ?? '') ? 'CALENDAR' : 'D30';
  const merit = text('6.8')?.match(/rating (\d), (\d+)%/g);
  if (merit?.length === 5) pay.merit = merit.map((m) => Number(m.match(/, (\d+)%/)![1])) as PayrollPolicy['merit'];

  set('probationDays', num(/Probation at .+? is (\d+) days/, text('3.4')), (v) => { params.probationDays = v; });
  set('annualLeave', num(/earn (\d+) working days/, text('4.1')), (v) => { params.annualLeave = v; });
  set('annualLeaveAfter5', num(/rising to (\d+) working days/, text('4.1')), (v) => { params.annualLeaveAfter5 = v; });
  params.carryForwardMax = num(/Up to (\d+) days of unused annual leave/, text('4.2')) ?? 0;
  const t44 = text('4.4') ?? '';
  params.ticket = /every year, for the employee, spouse/.test(t44) ? 'annual' : /after every two years/.test(t44) ? 'biennial' : /staff travel/.test(t44) ? 'staff-travel' : 'none';
  params.sickTopUpDays = num(/full pay for the first (\d+) days/, text('4.5')) ?? 0;
  const t65 = text('6.5');
  params.educationAllowance = num(/up to SAR ([\d,]+) per child/, t65) ?? 0;
  params.educationChildren = num(/for up to (\d+) children/, t65) ?? 0;
  set('medicalClass', text('6.6')?.match(/at class (\w+) for/)?.[1], (v) => { params.medicalClass = v; });
  set('bonusTargetPct', num(/is (\d+)% of annual basic salary/, text('6.7')), (v) => { params.bonusTargetPct = v; });
  set('advanceMinServiceMonths', num(/at least (\d+) months of service/, text('7.1')), (v) => { params.advanceMinServiceMonths = v; });
  const t72 = text('7.2');
  const mult = t72?.match(/up to (half a month's|one month's|two months'|[\d.]+ months')/)?.[1];
  set('advanceMultiple', mult ? WORDS[mult] ?? Number(mult.split(' ')[0]) : null, (v) => { params.advanceMultiple = v; });
  params.advanceBasis = /gross salary/.test(t72 ?? '') ? 'gross' : 'basic';
  set('advanceMaxTerm', num(/over up to (\d+) months/, t72), (v) => { params.advanceMaxTerm = v; });
  set('letterHours', num(/within (\d+) working hours/, text('8.1')), (v) => { params.letterHours = v; });
  const t101 = text('10.1');
  set('payDay', num(/paid in SAR on day (\d+)/, t101), (v) => { params.payDay = v; });
  set('cutoffDay', num(/inputs close on day (\d+)/, t101), (v) => { params.cutoffDay = v; });
  pay.gosiAbsorb = text('10.4')?.match(/For grades (G\d+ to G\d+), .+? pays the employee's share/)?.[1] ?? null;
  const t111 = text('11.1') ?? '';
  pay.eos = /basic salary only/.test(t111) ? 'BASIC_ONLY' : /commission is not counted/i.test(t111) ? 'FIXED_LESS_COMMISSION' : /After ten years/.test(t111) ? 'FIXED_PLUS_10Y' : 'FIXED';
  pay.finalPay = /on the employee's last working day/.test(text('11.5') ?? '') ? 'LAST_DAY' : 'LEGAL';
  set('seniorNoticeDays', num(/contract sets (\d+) days for both parties/, text('12.1')), (v) => { params.seniorNoticeDays = v; });
  return { short, params, pay, fromTemplate };
}

/**
 * The 27 dimensions for the client, and the clauses that did not come back word for word when the
 * handbook was written again from the terms read. `cfg` must carry the terms read; its payroll terms
 * are registered under its key first, as the client registry does after go-live.
 */
export function rulesFor(cfg: ClientConfig, pay: PayrollPolicy, policies: Policy[]) {
  PAYROLL_POLICY[cfg.key] = pay;
  const rules: Rule[] = readRules(cfg, policies);
  const again = new Map(policiesFor(cfg).flatMap((p) => p.clauses.map((k) => [k.ref, k.en] as const)));
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
  const differs = policies.flatMap((p) => p.clauses.filter((k) => again.has(k.ref) && norm(again.get(k.ref)!) !== norm(k.en)).map((k) => ({ policy: p.id, ref: k.ref, heading: k.heading, text: k.en })));
  return { rules, differs };
}
