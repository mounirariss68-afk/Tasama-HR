/**
 * The engine gate (design/payroll-addendum.md §5): the engine must reproduce
 * Tasama's July 2025 template run line by line, to the halala, except lines the
 * fixture lists with a legal reason. Run: npm run check:golden
 */
import { readFileSync } from 'node:fs';
import { runPayroll, backPay, offCycle, finalSettlement, type EngineEmployee, type EngineTerms } from '../../apps/server/src/domain/payroll/engine.ts';
import { gosiContribution } from '../../apps/server/src/domain/payroll/gosi.ts';

const f = JSON.parse(readFileSync(new URL('./july-2025.json', import.meta.url), 'utf8'));
const run = runPayroll(f.period, f.terms as EngineTerms, f.employees as EngineEmployee[]);
const exceptions: Record<string, string> = Object.fromEntries((f.source.exceptions ?? []).map((x: any) => [`${x.employee}:${x.field}`, x.reason]));

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
let pass = 0, fail = 0, excused = 0, rulePass = 0, ruleFail = 0;
const rows: string[] = [];
const check = (who: string, field: string, want: number, got: number, places = 2) => {
  const g = places === 3 ? r3(got) : r2(got);
  const ok = Math.abs(g - want) < (places === 3 ? 0.0005 : 0.005);
  const key = `${who}:${field}`;
  if (who === 'RULE') { if (ok) rulePass++; else ruleFail++; } else if (ok) pass++; else if (exceptions[key]) excused++; else fail++;
  rows.push(`${ok ? 'PASS' : exceptions[key] ? 'EXCUSED' : 'FAIL'}  ${who.padEnd(6)} ${field.padEnd(17)} template ${String(want).padStart(10)}  engine ${String(g).padStart(10)}${!ok && exceptions[key] ? `  (${exceptions[key]})` : ''}`);
};

for (const e of run.employees) {
  const x = f.expected[e.ref];
  const line = (code: string) => e.lines.find((l) => l.code === code)?.amount ?? 0;
  check(e.ref, 'payDays', x.payDays, e.payDays);
  for (const c of ['basic', 'housing', 'transport', 'mobile']) check(e.ref, c, x[c], line(c));
  check(e.ref, 'gross', x.gross, e.gross);
  check(e.ref, 'gosiWage', x.gosiWage, e.gosi.wage);
  check(e.ref, 'gosiEmployee', x.gosiEmployee, e.gosi.employee);
  check(e.ref, 'gosiEmployer', x.gosiEmployer, e.gosi.employer);
  check(e.ref, 'deductions', x.deductions, e.deductions);
  check(e.ref, 'net', x.net, e.net);
  check(e.ref, 'eosMonth', x.eosMonth, e.provisions.eos.month);
  check(e.ref, 'eosAccrued', x.eosAccrued, e.provisions.eos.accrued);
  check(e.ref, 'leaveBalanceDays', x.leaveBalanceDays, e.provisions.leave.balanceDays, 3);
  check(e.ref, 'leaveMonthCost', x.leaveMonthCost, e.provisions.leave.monthCost);
  check(e.ref, 'leaveAccrued', x.leaveAccrued, e.provisions.leave.accrued);
}
// The template's totals add the unrounded amounts.
const T = f.expected.totals, sumOf = (fn: (e: any) => number) => run.employees.reduce((s, e) => s + fn(e), 0);
check('TOTAL', 'gross', T.gross, run.totals.gross);
check('TOTAL', 'gosiWage', T.gosiWage, run.totals.gosiWage);
check('TOTAL', 'gosiEmployee', T.gosiEmployee, run.totals.gosiEmployee);
check('TOTAL', 'gosiEmployer', T.gosiEmployer, run.totals.gosiEmployer);
check('TOTAL', 'deductions', T.deductions, run.totals.deductions);
check('TOTAL', 'net', T.net, run.totals.net);
check('TOTAL', 'eosMonth', T.eosMonth, sumOf((e) => e.provisions.eos.month));
check('TOTAL', 'eosAccrued', T.eosAccrued, sumOf((e) => e.provisions.eos.accrued));
check('TOTAL', 'leaveMonthCost', T.leaveMonthCost, sumOf((e) => e.provisions.leave.monthCost));
check('TOTAL', 'leaveAccrued', T.leaveAccrued, sumOf((e) => e.provisions.leave.accrued));
check('TOTAL', 'bankOtherEarnings', T.bankOtherEarnings, (run.totals['EARNING:transport'] ?? 0) + (run.totals['EARNING:mobile'] ?? 0));

// Rules the July sample does not exercise: each with the figure worked by hand.
const base = { ...f.terms, leaveDayDivisor: 30, leaveDaysPlaces: undefined } as EngineTerms;
const emp = (o: Partial<EngineEmployee>): EngineEmployee => ({ ref: 'X', isSaudi: true, hire: '2020-01-01', elements: { basic: 10000, housing: 2500, transport: 1000, mobile: 500 }, leave: { entitlementDays: 30, carryoverDays: 0, usedDaysYtd: 0 }, ...o });
const one = (o: Partial<EngineEmployee>, t: Partial<EngineTerms> = {}, p = f.period) => runPayroll(p, { ...base, ...t }, [emp(o)]).employees[0];
const amt = (r: any, code: string) => r.lines.find((l: any) => l.code === code)?.amount ?? 0;
check('RULE', 'gosiNewJun25', 1218.75, gosiContribution(12500, true, '2024-09-01', '2025-06-30').employee);
check('RULE', 'gosiNewJul25', 1281.25, gosiContribution(12500, true, '2024-09-01', '2025-07-31').employee);
check('RULE', 'gosiNewJul26', 1343.75, gosiContribution(12500, true, '2024-09-01', '2026-07-31').employee);
check('RULE', 'gosiLegacy2026', 1218.75, gosiContribution(12500, true, '2019-03-01', '2026-07-31').employee);
check('RULE', 'gosiCap', 4387.5, gosiContribution(60000, true, '2019-03-01', '2025-07-31').employee);
check('RULE', 'joiner16th', 5161.29, // 16 of 31 days
   amt(one({ hire: '2025-07-16' }), 'basic'));
check('RULE', 'cal30FullMonth', 10000, amt(one({}, { dayRate: 'CAL30' }), 'basic'));
check('RULE', 'cal30Absent2', 9333.33, amt(one({ absenceDays: 2 }, { dayRate: 'CAL30' }), 'basic'));
check('RULE', 'overtimeLaw10h', 791.67, amt(one({ overtimeHours: 10 }), 'overtime'));
check('RULE', 'overtime15x10h', 875, amt(one({ overtimeHours: 10 }, { overtime: 'GROSS_1_5' }), 'overtime'));
check('RULE', 'advanceCapBlocks', 1, one({ deductions: [{ code: 'adv', label: 'Advance', amount: 1500, kind: 'ADVANCE' }] }).flags.filter((x) => x.code === 'ADVANCE_CAP').length);
check('RULE', 'advanceAtCapOk', 0, one({ deductions: [{ code: 'adv', label: 'Advance', amount: 1400, kind: 'ADVANCE' }] }).flags.length);
check('RULE', 'eosAfter5Years', 49076.71, // 2,192 days ÷ 365 = 6.0055 years: 5 × 7,000 + 1.0055 × 14,000
   one({ hire: '2019-08-01' }).provisions.eos.accrued);
check('RULE', 'eosUnpaidBeyond20', 14000 * 0.5 * (daysTo('2024-08-01', '2025-07-31') - 5) / 365, one({ hire: '2024-08-01', eosExcludedDays: 5 }).provisions.eos.accrued);
check('RULE', 'overtimeCap40of48', 3166.67, amt(one({ overtimeHours: 48 }, { overtimeCapHours: 40 }), 'overtime'));
check('RULE', 'overtimeCapHolds8', 1, one({ overtimeHours: 48 }, { overtimeCapHours: 40 }).flags.filter((x) => x.code === 'OVERTIME_CAP').length);
check('RULE', 'backPay2Months', 2000, backPay([{ start: '2025-07-01', end: '2025-07-31' }, { start: '2025-08-01', end: '2025-08-31' }], base, emp({}), emp({ elements: { basic: 11000, housing: 2500, transport: 1000, mobile: 500 } })).total);
check('RULE', 'offCycleNoDeductions', 5000, offCycle([{ code: 'bonus', label: 'Bonus', amount: 5000 }]).total);
const fs = finalSettlement(f.period, base, emp({ hire: '2022-08-01', lastDay: '2025-07-15', leave: { entitlementDays: 30, carryoverDays: 0, usedDaysYtd: 0 } }), { leaving: 'RESIGNATION', advanceOutstanding: 2000 });
check('RULE', 'settlementResign3y', 21844.98, fs.gross); // 15/31 of the month 6,774.20 + 17.5 leave days 8,166.67 + a third of 2.96 years' award 6,904.11
check('RULE', 'settlementAdvanceLine', 2000, fs.lines.find((l) => l.code === 'advance_balance')?.amount ?? 0);
check('RULE', 'settlementArt80NoAward', 0, finalSettlement(f.period, base, emp({ hire: '2022-08-01', lastDay: '2025-07-15' }), { leaving: 'ART_80' }).lines.filter((l) => l.code === 'eos_award').length);
check('RULE', 'fineCapFiveDays', 2333.33, amt(one({ deductions: [{ code: 'late_fine', label: 'Lateness fine', amount: 5000, kind: 'FINE' }] }), 'late_fine')); // 5 × 14,000 ÷ 30 (Art. 70)
function daysTo(a: string, b: string) { return Math.round((Date.parse(b) - Date.parse(a)) / 864e5) + 1; }

console.log(rows.join('\n'));
console.log(`\nJuly 2025 template run: ${pass} figures match, ${excused} excused with a legal reason, ${fail} differ.`);
console.log(`Rules the sample does not exercise: ${rulePass} of ${rulePass + ruleFail} hand-worked cases match.`);
process.exit(fail || ruleFail ? 1 : 0);
