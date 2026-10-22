/**
 * A client's HR policy as the payroll engine reads it: itemised rules on 27
 * dimensions (design/payroll-addendum.md §4, design/payroll-requirements.md,
 * "Client HR policy becomes 27 rule sets").
 *
 * Three things live here, side by side, so they cannot drift apart:
 *   1. PAYROLL_POLICY: the payroll terms of each synthetic client, beyond the
 *      handbook terms already in clients.ts (FICTIONAL, like the rest).
 *   2. payrollClauses(): the handbook clauses that state those terms, which
 *      policies.ts puts into each client's handbook.
 *   3. readRules(): Nizam's offline reading of a handbook back into rules, and
 *      legalCheck(), the law's floor for each rule. Claude may do the reading
 *      when it is connected; the legal checks are always this code.
 *
 * truthRules() is what the handbook was generated from. The check script
 * asserts that Nizam's reading of every handbook equals it, except where the
 * handbook is planted with a clause the law refuses or that is unclear.
 */
import type { ClientConfig } from './clients.js';
import type { Clause, Policy } from './policies.js';

/* ------------------------------------------------------------------ the 27 dimensions */

export type Dimension = { n: number; key: string; name: string; name_ar: string; floor: string; drives: string };
export const DIMENSIONS: Dimension[] = [
  { n: 1, key: 'week', name: 'Working week', name_ar: 'أسبوع العمل', floor: 'At most 48 hours a week and 8 a day; 6 a day in Ramadan for Muslims (Art. 98)', drives: 'Hourly rate, overtime threshold, lateness' },
  { n: 2, key: 'lateness', name: 'Attendance and lateness', name_ar: 'الحضور والتأخير', floor: 'A fine is at most 5 days\' wage for one violation and 5 days\' wage a month (Art. 70)', drives: 'Attendance deductions' },
  { n: 3, key: 'overtime', name: 'Overtime', name_ar: 'العمل الإضافي', floor: 'Hourly wage plus 50% of the basic hourly wage (Art. 107)', drives: 'Overtime pay' },
  { n: 4, key: 'dayrate', name: 'Day rate', name_ar: 'أجر اليوم', floor: 'None set', drives: 'Proration, deductions, leave encashment' },
  { n: 5, key: 'elements', name: 'Pay elements', name_ar: 'عناصر الأجر', floor: 'GOSI wage = basic + housing', drives: 'Gross pay, GOSI wage, end-of-service wage' },
  { n: 6, key: 'housingadvance', name: 'Housing paid in advance', name_ar: 'بدل السكن المقدم', floor: 'Deduction limits (Art. 92, 93)', drives: 'The advance-housing deduction' },
  { n: 7, key: 'probation', name: 'Probation', name_ar: 'فترة التجربة', floor: 'At most 180 days by written agreement (Art. 53)', drives: 'Alerts, exit terms' },
  { n: 8, key: 'annual', name: 'Annual leave', name_ar: 'الإجازة السنوية', floor: '21 days, 30 after five years; unused leave paid on leaving (Art. 109, 111)', drives: 'Leave balance, leave provision, final settlement' },
  { n: 9, key: 'sick', name: 'Sick leave', name_ar: 'الإجازة المرضية', floor: '30 days full, 60 at 75%, 30 unpaid in a year (Art. 117)', drives: 'Pay during sickness' },
  { n: 10, key: 'otherleave', name: 'Other leave', name_ar: 'الإجازات الأخرى', floor: 'Marriage 5, bereavement 5, paternity 3, Hajj 10 to 15 once, maternity 12 weeks', drives: 'Paid or unpaid days' },
  { n: 11, key: 'holidays', name: 'Holidays', name_ar: 'العطلات', floor: 'Holiday work is overtime (Art. 107)', drives: 'Overtime' },
  { n: 12, key: 'advances', name: 'Salary advances and loans', name_ar: 'السلف والقروض', floor: 'Instalment at most 10% of wage (Art. 92)', drives: 'Deductions' },
  { n: 13, key: 'education', name: 'Education allowance', name_ar: 'بدل التعليم', floor: 'None', drives: 'Allowance or recovery schedule' },
  { n: 14, key: 'tickets', name: 'Air tickets', name_ar: 'تذاكر السفر', floor: 'None', drives: 'Ticket accrual, provision, payment' },
  { n: 15, key: 'trips', name: 'Business trips', name_ar: 'رحلات العمل', floor: 'None', drives: 'Off-cycle payments' },
  { n: 16, key: 'bonus', name: 'Bonus', name_ar: 'المكافأة', floor: 'None', drives: 'Bonus run' },
  { n: 17, key: 'merit', name: 'Performance and increments', name_ar: 'الأداء والزيادات', floor: 'None', drives: 'Salary changes, back pay' },
  { n: 18, key: 'grades', name: 'Grades', name_ar: 'الدرجات', floor: 'None', drives: 'Entitlements change with the grade' },
  { n: 19, key: 'promotion', name: 'Promotions', name_ar: 'الترقيات', floor: 'None', drives: 'Mid-month salary change' },
  { n: 20, key: 'eoswage', name: 'End-of-service wage', name_ar: 'أجر نهاية الخدمة', floor: 'The last actual wage: basic plus regular allowances (Art. 2, 84); only commissions and variable pay may be left out (Art. 86)', drives: 'End-of-service award and provision' },
  { n: 21, key: 'notice', name: 'Notice', name_ar: 'الإشعار', floor: '60 days employer, 30 employee for indefinite contracts (Art. 75)', drives: 'Final settlement' },
  { n: 22, key: 'discipline', name: 'Discipline', name_ar: 'الجزاءات', floor: 'HRSD table of violations; fines capped (Art. 66, 70)', drives: 'Fines as deductions' },
  { n: 23, key: 'calendar', name: 'Payroll calendar', name_ar: 'تقويم الرواتب', floor: 'Wages paid monthly (Art. 90)', drives: 'Reminders, chasing, run dates' },
  { n: 24, key: 'approvals', name: 'Approval matrix', name_ar: 'مصفوفة الاعتماد', floor: 'None', drives: 'Workflows, the delegated approver' },
  { n: 25, key: 'gosi', name: 'GOSI handling', name_ar: 'التأمينات الاجتماعية', floor: 'Rates by insured group', drives: 'Net pay' },
  { n: 26, key: 'medical', name: 'Medical insurance', name_ar: 'التأمين الطبي', floor: 'CCHI cover', drives: 'Deduction if the employee pays' },
  { n: 27, key: 'finalpay', name: 'Final pay timing', name_ar: 'موعد التسوية النهائية', floor: '1 week after termination, 2 after resignation (Art. 88)', drives: 'Settlement deadline' },
];

/* ------------------------------------------------------------------ each client's payroll terms */

export type PayrollPolicy = {
  weekDays: string; weekDays_ar: string; shifts: string; shifts_ar: string;
  graceMin: number; latenessMethod: 'TABLE' | 'MINUTES' | 'THREE_LATES'; roundMin: number;
  overtimeWho: string; overtimeWho_ar: string; overtimeCap: number; holidayMultiple: number; timeOffInstead: boolean;
  dayRate: 'D30' | 'CALENDAR';
  extra: { code: string; name: string; name_ar: string; pct?: number; amount?: number; inEos: boolean }[];
  housingAdvance: 'MONTHLY' | 'ANNUAL' | 'COMPANY';
  educationSchedule: 'MONTHLY' | 'UPFRONT' | 'TERM' | 'NONE';
  bonusTiming: string; bonusTiming_ar: string;
  merit: [number, number, number, number, number];   // increase % for ratings 1..5
  eos: 'FIXED' | 'FIXED_LESS_COMMISSION' | 'FIXED_PLUS_10Y' | 'BASIC_ONLY';
  gosiAbsorb: string | null;   // grades whose employee share the company pays
  finalPay: 'LAST_DAY' | 'LEGAL';
};

export const PAYROLL_POLICY: Record<string, PayrollPolicy> = {
  roshn: {
    weekDays: 'Sunday to Thursday', weekDays_ar: 'من الأحد إلى الخميس', shifts: 'Community and sales centre staff work published rosters.', shifts_ar: 'يعمل موظفو المجتمعات ومراكز المبيعات وفق جداول مناوبات معلنة.',
    graceMin: 10, latenessMethod: 'TABLE', roundMin: 0,
    overtimeWho: 'grades G04 to G08', overtimeWho_ar: 'الدرجات من G04 إلى G08', overtimeCap: 30, holidayMultiple: 0, timeOffInstead: false,
    dayRate: 'D30', extra: [{ code: 'MOBILE', name: 'Mobile allowance', name_ar: 'بدل الهاتف', amount: 300, inEos: true }],
    housingAdvance: 'ANNUAL', educationSchedule: 'MONTHLY', bonusTiming: 'paid in March', bonusTiming_ar: 'تُصرف في مارس',
    merit: [0, 0, 3, 5, 8], eos: 'FIXED_LESS_COMMISSION', gosiAbsorb: null, finalPay: 'LAST_DAY',
  },
  riyadhair: {
    weekDays: 'Sunday to Thursday for office staff', weekDays_ar: 'من الأحد إلى الخميس لموظفي المكاتب', shifts: 'Crew and ground staff work published rosters.', shifts_ar: 'يعمل طاقم الطيران والموظفون الأرضيون وفق جداول معلنة.',
    graceMin: 5, latenessMethod: 'MINUTES', roundMin: 1,
    overtimeWho: 'rostered staff', overtimeWho_ar: 'الموظفون العاملون بالمناوبات', overtimeCap: 0, holidayMultiple: 2, timeOffInstead: false,
    dayRate: 'CALENDAR', extra: [],
    housingAdvance: 'MONTHLY', educationSchedule: 'UPFRONT', bonusTiming: 'paid in March', bonusTiming_ar: 'تُصرف في مارس',
    merit: [0, 0, 3, 5, 7], eos: 'FIXED_PLUS_10Y', gosiAbsorb: null, finalPay: 'LEGAL',
  },
  redsea: {
    weekDays: 'six days a week on site', weekDays_ar: 'ستة أيام في الأسبوع في الموقع', shifts: 'Destination staff work site rotations.', shifts_ar: 'يعمل موظفو الوجهة وفق مناوبات الموقع.',
    graceMin: 15, latenessMethod: 'TABLE', roundMin: 0,
    overtimeWho: 'all site staff', overtimeWho_ar: 'جميع موظفي الموقع', overtimeCap: 0, holidayMultiple: 0, timeOffInstead: true,
    dayRate: 'D30', extra: [{ code: 'REMOTE_SITE', name: 'Remote-site allowance', name_ar: 'بدل الموقع النائي', pct: 15, inEos: true }],
    housingAdvance: 'COMPANY', educationSchedule: 'TERM', bonusTiming: 'paid in March, with a quarterly site bonus', bonusTiming_ar: 'تُصرف في مارس مع مكافأة موقع ربع سنوية',
    merit: [0, 0, 3, 4, 6], eos: 'FIXED', gosiAbsorb: null, finalPay: 'LAST_DAY',
  },
  seven: {
    weekDays: 'Sunday to Thursday', weekDays_ar: 'من الأحد إلى الخميس', shifts: 'Venue staff work event shifts, including weekends.', shifts_ar: 'يعمل موظفو المرافق وفق مناوبات الفعاليات بما فيها عطلات نهاية الأسبوع.',
    graceMin: 10, latenessMethod: 'THREE_LATES', roundMin: 0,
    overtimeWho: 'venue staff on event weekends', overtimeWho_ar: 'موظفو المرافق في عطلات الفعاليات', overtimeCap: 0, holidayMultiple: 0, timeOffInstead: false,
    dayRate: 'CALENDAR', extra: [],
    housingAdvance: 'MONTHLY', educationSchedule: 'NONE', bonusTiming: 'paid in two halves, March and September', bonusTiming_ar: 'تُصرف على دفعتين في مارس وسبتمبر',
    merit: [0, 0, 3, 5, 8], eos: 'BASIC_ONLY', gosiAbsorb: 'G04 to G06', finalPay: 'LEGAL',
  },
  saudicoffee: {
    weekDays: 'six days a week', weekDays_ar: 'ستة أيام في الأسبوع', shifts: 'Roastery, farm and coffee-house staff work shifts.', shifts_ar: 'يعمل موظفو المحمصة والمزارع والمقاهي وفق مناوبات.',
    graceMin: 5, latenessMethod: 'TABLE', roundMin: 0,
    overtimeWho: 'roastery, farm and coffee-house staff', overtimeWho_ar: 'موظفو المحمصة والمزارع والمقاهي', overtimeCap: 40, holidayMultiple: 0, timeOffInstead: false,
    dayRate: 'D30', extra: [{ code: 'SHIFT', name: 'Shift allowance', name_ar: 'بدل المناوبة', pct: 5, inEos: true }],
    housingAdvance: 'MONTHLY', educationSchedule: 'NONE', bonusTiming: 'a fixed half month\'s basic, paid before Ramadan', bonusTiming_ar: 'نصف شهر من الأساسي تُصرف قبل رمضان',
    merit: [0, 0, 2, 4, 6], eos: 'FIXED', gosiAbsorb: null, finalPay: 'LAST_DAY',
  },
};
export const payrollPolicy = (key: string): PayrollPolicy => PAYROLL_POLICY[key] ?? PAYROLL_POLICY.saudicoffee;

/* ------------------------------------------------------------------ the handbook clauses for those terms */

const fmt = (n: number) => n.toLocaleString('en-US');
const latenessEn = (q: PayrollPolicy) =>
  q.latenessMethod === 'TABLE' ? 'Lateness beyond the grace period is handled under the penalty table of the approved internal work regulation, starting with a written warning.'
  : q.latenessMethod === 'THREE_LATES' ? 'Three late arrivals beyond the grace period in a calendar month are deducted as one day\'s wage.'
  : `Minutes late beyond the grace period are deducted at the minute rate of the wage${q.roundMin > 1 ? `, rounded up to the next ${q.roundMin} minutes` : ''}.`;
const latenessAr = (q: PayrollPolicy) =>
  q.latenessMethod === 'TABLE' ? 'يُعالج التأخير بعد فترة السماح وفق جدول الجزاءات في لائحة تنظيم العمل المعتمدة، ابتداءً بالإنذار الكتابي.'
  : q.latenessMethod === 'THREE_LATES' ? 'تُخصم ثلاث حالات تأخير بعد فترة السماح في الشهر الواحد بأجر يوم واحد.'
  : `تُخصم دقائق التأخير بعد فترة السماح بأجر الدقيقة${q.roundMin > 1 ? `، مع التقريب إلى أقرب ${q.roundMin} دقيقة أعلى` : ''}.`;

/**
 * The clauses that carry the payroll terms. `revised` is the Red Sea Global
 * handbook uploaded in scenario D1: its overtime clause says "time and a half"
 * without saying of which wage, which Nizam must mark unclear.
 */
export function payrollClauses(c: ClientConfig, revised = false): Record<string, Clause> {
  const q = payrollPolicy(c.key), p = c.policy, S = c.short, A = c.name_ar;
  const ambiguous = revised && c.key === 'redsea';
  const extras = q.extra.map((e) => `${e.name.toLowerCase()} of ${e.pct ? `${e.pct}% of basic` : `SAR ${fmt(e.amount!)} a month`}`);
  const extrasAr = q.extra.map((e) => `${e.name_ar} ${e.pct ? `بنسبة ${e.pct}% من الأساسي` : `قدره ${fmt(e.amount!)} ريال شهرياً`}`);
  const eosEn = q.eos === 'BASIC_ONLY'
    ? `The award is calculated on basic salary only.`
    : q.eos === 'FIXED_LESS_COMMISSION'
      ? `It is calculated on the last wage: basic plus the fixed monthly allowances. Sales commission is not counted.`
      : q.eos === 'FIXED_PLUS_10Y'
        ? `It is calculated on the last wage: basic plus the fixed monthly allowances. After ten years of service ${S} adds one further month's basic salary to the award.`
        : `It is calculated on the last wage: basic plus the fixed monthly allowances${q.extra.some((e) => e.inEos) ? `, including the ${q.extra.filter((e) => e.inEos).map((e) => e.name.toLowerCase()).join(' and ')}` : ''}.`;
  const eosAr = q.eos === 'BASIC_ONLY'
    ? 'وتُحتسب المكافأة على الراتب الأساسي فقط.'
    : q.eos === 'FIXED_LESS_COMMISSION'
      ? 'وتُحتسب على أساس آخر أجر: الأساسي مع البدلات الشهرية الثابتة، ولا تدخل فيها عمولات المبيعات.'
      : q.eos === 'FIXED_PLUS_10Y'
        ? `وتُحتسب على أساس آخر أجر: الأساسي مع البدلات الشهرية الثابتة. وبعد عشر سنوات من الخدمة تضيف ${A} أجر شهر أساسي إلى المكافأة.`
        : 'وتُحتسب على أساس آخر أجر: الأساسي مع البدلات الشهرية الثابتة.';
  return {
    '5.3': { ref: '5.3', heading: 'Overtime', heading_ar: 'العمل الإضافي', legal: 'Labor Law Art. 107',
      en: ambiguous
        ? `Overtime is open to ${q.overtimeWho} and must be approved in advance by the site supervisor. Overtime hours are paid at time and a half.${q.timeOffInstead ? ' By written agreement an employee may take time off instead of overtime pay.' : ''} Work on the weekly rest day or a public holiday is overtime.`
        : `Overtime is open to ${q.overtimeWho} and must be approved in advance by the line manager. Each overtime hour is paid at the hourly wage plus 50% of the basic hourly wage${q.holidayMultiple ? `; work on a public holiday is paid at ${q.holidayMultiple} times the hourly wage` : ''}.${q.overtimeCap ? ` Overtime may not exceed ${q.overtimeCap} hours a month.` : ''}${q.timeOffInstead ? ' By written agreement an employee may take time off instead of overtime pay.' : ''} Work on the weekly rest day or a public holiday is overtime.`,
      ar: ambiguous
        ? `يُتاح العمل الإضافي لـ${q.overtimeWho_ar} بعد اعتماد مشرف الموقع مسبقاً. وتُدفع ساعات العمل الإضافي بمعدل مرة ونصف.${q.timeOffInstead ? ' ويجوز للموظف باتفاق مكتوب أخذ وقت راحة بدلاً من أجر العمل الإضافي.' : ''} ويُعد العمل في يوم الراحة الأسبوعية أو العطلة الرسمية عملاً إضافياً.`
        : `يُتاح العمل الإضافي لـ${q.overtimeWho_ar} بعد اعتماد المدير المباشر مسبقاً. وتُدفع كل ساعة عمل إضافي بأجر الساعة مضافاً إليه 50% من أجر الساعة الأساسي${q.holidayMultiple ? `، ويُدفع العمل في العطلة الرسمية بـ${q.holidayMultiple === 2 ? 'ضعف' : `${q.holidayMultiple} أضعاف`} أجر الساعة` : ''}.${q.overtimeCap ? ` ولا يتجاوز العمل الإضافي ${q.overtimeCap} ساعة شهرياً.` : ''}${q.timeOffInstead ? ' ويجوز للموظف باتفاق مكتوب أخذ وقت راحة بدلاً من أجر العمل الإضافي.' : ''} ويُعد العمل في يوم الراحة الأسبوعية أو العطلة الرسمية عملاً إضافياً.`,
      tags: ['overtime', 'extra hours', 'holiday work', 'rest day', 'weekend work', '150%', 'time off'] },
    '5.5': { ref: '5.5', heading: 'Attendance and lateness', heading_ar: 'الحضور والتأخير', legal: 'Labor Law Arts. 66, 70, 71',
      en: `Attendance is recorded on the attendance devices at each site. ${q.graceMin ? `A grace period of ${q.graceMin} minutes applies to the start time.` : 'No grace period applies to the start time.'} ${latenessEn(q)} An absence without an accepted reason is unpaid. No fine is applied before the employee has been heard, and fines in one month never exceed five days' wage.`,
      ar: `يُسجل الحضور على أجهزة الحضور في كل موقع. ${q.graceMin ? `وتُمنح فترة سماح مدتها ${q.graceMin} دقائق من بداية الدوام.` : 'ولا تُمنح فترة سماح من بداية الدوام.'} ${latenessAr(q)} ولا يُدفع أجر الغياب دون عذر مقبول. ولا تُوقع أي غرامة قبل سماع أقوال الموظف، ولا تتجاوز الغرامات في الشهر الواحد أجر خمسة أيام.`,
      tags: ['attendance', 'lateness', 'late', 'fingerprint', 'grace period', 'absence', 'deduction', 'penalty'] },
    '5.1': { ref: '5.1', heading: 'Working hours', heading_ar: 'ساعات العمل', legal: 'Labor Law Art. 98',
      en: `The working week at ${S} is ${p.weeklyHours} hours, ${q.weekDays}. ${q.shifts} No one is scheduled for more than 8 hours a day or 48 hours a week, excluding breaks.`,
      ar: `أسبوع العمل في ${A} ${p.weeklyHours} ساعة، ${q.weekDays_ar}. ${q.shifts_ar} ولا يُجدول أي موظف لأكثر من 8 ساعات يومياً أو 48 ساعة أسبوعياً، دون احتساب فترات الراحة.`,
      tags: ['hours', 'working hours', 'schedule', 'week', 'shifts', 'roster', 'weekend', 'rest day', `${p.weeklyHours} hours`] },
    '6.1': { ref: '6.1', heading: 'Pay structure', heading_ar: 'هيكل الأجور',
      en: `Jobs at ${S} are graded G04 to G15. Monthly pay is basic salary plus a housing allowance of ${p.housingPct}% of basic and a transport allowance of ${p.transportPct}% of basic${extras.length ? `, and a ${extras.join(' and a ')}` : ''}. ${q.housingAdvance === 'ANNUAL' ? 'An employee may take a year\'s housing allowance in advance; it is recovered in twelve equal monthly deductions.' : q.housingAdvance === 'COMPANY' ? 'Employees on site may live in company housing instead of receiving the housing allowance.' : 'The housing allowance is paid monthly with salary.'} GOSI contributions are calculated on basic plus housing.`,
      ar: `تُصنف الوظائف في ${A} من الدرجة G04 إلى G15. ويتكون الأجر الشهري من الراتب الأساسي مضافاً إليه بدل سكن بنسبة ${p.housingPct}% من الأساسي وبدل نقل بنسبة ${p.transportPct}% من الأساسي${extrasAr.length ? `، و${extrasAr.join(' و')}` : ''}. ${q.housingAdvance === 'ANNUAL' ? 'ويجوز للموظف صرف بدل سكن سنة مقدماً، ويُسترد على اثني عشر قسطاً شهرياً متساوياً.' : q.housingAdvance === 'COMPANY' ? 'ويجوز لموظفي الموقع السكن في سكن الشركة بدلاً من بدل السكن.' : 'ويُصرف بدل السكن شهرياً مع الراتب.'} وتُحتسب اشتراكات التأمينات الاجتماعية على الأساسي مع بدل السكن.`,
      tags: ['salary', 'pay', 'basic', 'allowance', 'housing', 'housing allowance', 'transport', 'grade', 'package', ...q.extra.map((e) => e.name.toLowerCase())] },
    '6.2': { ref: '6.2', heading: 'Day rate and proration', heading_ar: 'أجر اليوم والاحتساب النسبي',
      en: q.dayRate === 'D30'
        ? `For joiners, leavers, unpaid days and leave pay, a day's wage at ${S} is the monthly wage divided by 30, whatever the length of the month.`
        : `For joiners, leavers, unpaid days and leave pay, a day's wage at ${S} is the monthly wage divided by the number of calendar days in that month.`,
      ar: q.dayRate === 'D30'
        ? `لأغراض المنضمين والمغادرين والأيام غير المدفوعة وأجر الإجازة، يُحتسب أجر اليوم في ${A} بقسمة الأجر الشهري على 30 أياً كان عدد أيام الشهر.`
        : `لأغراض المنضمين والمغادرين والأيام غير المدفوعة وأجر الإجازة، يُحتسب أجر اليوم في ${A} بقسمة الأجر الشهري على عدد الأيام الميلادية في ذلك الشهر.`,
      tags: ['day rate', 'daily wage', 'proration', 'prorated', 'joiner', 'leaver', 'unpaid days'] },
    '6.8': { ref: '6.8', heading: 'Annual increases', heading_ar: 'الزيادات السنوية',
      en: `Annual increases follow the merit matrix: ${q.merit.map((m, i) => `rating ${i + 1}, ${m}%`).join('; ')}. They take effect on 1 April, and an increase approved after that date is paid back to 1 April.`,
      ar: `تتبع الزيادات السنوية مصفوفة الجدارة: ${q.merit.map((m, i) => `التقييم ${i + 1}: ${m}%`).join('؛ ')}. وتسري من 1 أبريل، وتُصرف الزيادة المعتمدة بعد هذا التاريخ بأثر رجعي من 1 أبريل.`,
      tags: ['increase', 'merit', 'raise', 'annual increase', 'rating', 'back pay'] },
    '10.4': { ref: '10.4', heading: 'GOSI contributions', heading_ar: 'اشتراكات التأمينات الاجتماعية', legal: 'Social Insurance Law (Royal Decree M/273, 2024) and GOSI rules',
      en: `GOSI contributions follow the employee's insured group and the rates in force. The contribution wage is basic plus housing, capped at SAR 45,000 a month. ${q.gosiAbsorb ? `For grades ${q.gosiAbsorb}, ${S} pays the employee's share as well as its own.` : 'The employee\'s share is deducted from salary.'} For non-Saudi employees the employer pays 2% for occupational hazards.`,
      ar: `تُحتسب اشتراكات التأمينات الاجتماعية وفق فئة الموظف التأمينية والنسب السارية. ويتكون أجر الاشتراك من الأساسي وبدل السكن بحد أقصى 45,000 ريال شهرياً. ${q.gosiAbsorb ? `وبالنسبة للدرجات ${q.gosiAbsorb} تتحمل ${A} حصة الموظف إضافة إلى حصتها.` : 'وتُخصم حصة الموظف من الراتب.'} وبالنسبة لغير السعوديين يدفع صاحب العمل 2% للأخطار المهنية.`,
      tags: ['gosi', 'social insurance', 'pension', 'saned', 'contribution', 'deduction', 'saudi national', 'occupational hazards'] },
    '11.1': { ref: '11.1', heading: 'End-of-service award', heading_ar: 'مكافأة نهاية الخدمة', legal: 'Labor Law Art. 84',
      en: `When the contract ends, ${S} pays an end-of-service award of half a month's wage for each of the first five years of service and one month's wage for each year after that, pro rata for part years. ${eosEn}`,
      ar: `عند انتهاء العقد تدفع ${A} مكافأة نهاية خدمة تعادل أجر نصف شهر عن كل سنة من السنوات الخمس الأولى، وأجر شهر عن كل سنة بعدها، مع الاحتساب النسبي لجزء السنة. ${eosAr}`,
      tags: ['end of service', 'eosb', 'gratuity', 'end-of-service award', 'settlement', 'leaving', 'years of service'] },
    '11.5': { ref: '11.5', heading: 'Final settlement', heading_ar: 'التسوية النهائية', legal: 'Labor Law Art. 88',
      en: `The final settlement covers salary to the last working day, pay for unused annual leave, and the end-of-service award, less amounts owed such as an outstanding advance. ${q.finalPay === 'LAST_DAY' ? `${S} pays it on the employee's last working day.` : `${S} pays it within one week of the end of employment when ${S} ends the contract, and within two weeks when the employee resigns.`}`,
      ar: `تشمل التسوية النهائية الأجر حتى آخر يوم عمل، وبدل الإجازات السنوية غير المستخدمة، ومكافأة نهاية الخدمة، مخصوماً منها المبالغ المستحقة مثل السلفة القائمة. ${q.finalPay === 'LAST_DAY' ? `وتدفعها ${A} في آخر يوم عمل للموظف.` : `وتدفعها ${A} خلال أسبوع من انتهاء العلاقة إذا كانت الشركة هي التي أنهت العقد، وخلال أسبوعين إذا استقال الموظف.`}`,
      tags: ['settlement', 'final settlement', 'final pay', 'leaving', 'leave encashment', 'unused leave', 'one week', 'two weeks', 'last day'] },
  };
}

/* ------------------------------------------------------------------ rules */

export type RuleFlag = 'BELOW_LAW' | 'UNCLEAR' | 'MISSING';
export type Rule = {
  dim: number; key: string; label: string; label_ar: string;
  value: string; value_ar?: string; num?: number | null;
  basis: 'HANDBOOK' | 'LAW' | 'DEFAULT'; clause: string | null; quote?: string;
  flag?: RuleFlag | null; flag_note?: string;
};

const R = (dim: number, key: string, label: string, label_ar: string, value: string, num: number | null, clause: string | null, basis: Rule['basis'] = 'HANDBOOK', value_ar?: string): Rule =>
  ({ dim, key, label, label_ar, value, num, clause, basis, value_ar });

/** The rules the handbook was written from: the truth Nizam's reading is checked against. */
export function truthRules(c: ClientConfig): Rule[] {
  const p = c.policy, q = payrollPolicy(c.key);
  const eosValue = q.eos === 'BASIC_ONLY' ? 'Basic salary only' : q.eos === 'FIXED_LESS_COMMISSION' ? 'Basic + fixed allowances; commission excluded' : q.eos === 'FIXED_PLUS_10Y' ? 'Basic + fixed allowances; one extra month\'s basic after 10 years' : 'Basic + fixed allowances';
  return [
    R(1, 'week.hours', 'Hours a week', 'ساعات الأسبوع', `${p.weeklyHours} hours, ${q.weekDays}`, p.weeklyHours, 'HR-05 §5.1'),
    R(1, 'week.ramadan', 'Ramadan hours', 'ساعات رمضان', '6 a day, 36 a week', 6, 'HR-05 §5.2'),
    R(2, 'lateness.grace', 'Grace period', 'فترة السماح', q.graceMin ? `${q.graceMin} minutes` : 'None', q.graceMin, 'HR-05 §5.5'),
    R(2, 'lateness.method', 'Lateness', 'التأخير', q.latenessMethod === 'TABLE' ? 'Penalty table of the work regulation' : q.latenessMethod === 'THREE_LATES' ? 'Three lates = one day\'s deduction' : `Minute-based deduction${q.roundMin > 1 ? `, rounded to ${q.roundMin} minutes` : ''}`, null, 'HR-05 §5.5'),
    R(2, 'lateness.cap', 'Fines cap', 'سقف الغرامات', '5 days\' wage a month', 5, 'HR-05 §5.5'),
    R(3, 'overtime.rate', 'Overtime rate', 'أجر العمل الإضافي', 'Hourly wage + 50% of basic hourly', 1.5, 'HR-05 §5.3'),
    R(3, 'overtime.who', 'Who may work overtime', 'المؤهلون للعمل الإضافي', q.overtimeWho, null, 'HR-05 §5.3'),
    R(3, 'overtime.cap', 'Monthly cap', 'الحد الشهري', q.overtimeCap ? `${q.overtimeCap} hours` : 'None', q.overtimeCap || null, 'HR-05 §5.3'),
    ...(q.holidayMultiple ? [R(3, 'overtime.holiday', 'Public holiday work', 'العمل في العطل الرسمية', `${q.holidayMultiple}× the hourly wage`, q.holidayMultiple, 'HR-05 §5.3')] : []),
    R(3, 'overtime.timeoff', 'Time off instead', 'الراحة بدل الأجر', q.timeOffInstead ? 'Allowed by written agreement' : 'Not offered', null, 'HR-05 §5.3'),
    R(4, 'dayrate', 'Day rate', 'أجر اليوم', q.dayRate === 'D30' ? 'Monthly wage ÷ 30' : 'Monthly wage ÷ calendar days', null, 'HR-06 §6.2'),
    R(5, 'elements.housing', 'Housing allowance', 'بدل السكن', `${p.housingPct}% of basic`, p.housingPct, 'HR-06 §6.1'),
    R(5, 'elements.transport', 'Transport allowance', 'بدل النقل', `${p.transportPct}% of basic`, p.transportPct, 'HR-06 §6.1'),
    ...q.extra.map((e) => R(5, `elements.${e.code.toLowerCase()}`, e.name, e.name_ar, e.pct ? `${e.pct}% of basic` : `SAR ${fmt(e.amount!)} a month`, e.pct ?? e.amount!, 'HR-06 §6.1')),
    R(6, 'housingadvance', 'Housing in advance', 'بدل السكن المقدم', q.housingAdvance === 'ANNUAL' ? 'A year in advance, recovered over 12 months' : q.housingAdvance === 'COMPANY' ? 'Company housing on site instead' : 'Paid monthly', null, 'HR-06 §6.1'),
    R(7, 'probation', 'Probation', 'فترة التجربة', `${p.probationDays} days`, p.probationDays, 'HR-03 §3.4'),
    R(8, 'annual.days', 'Annual leave', 'الإجازة السنوية', `${p.annualLeave} days`, p.annualLeave, 'HR-04 §4.1'),
    R(8, 'annual.after5', 'After five years', 'بعد خمس سنوات', `${p.annualLeaveAfter5} days`, p.annualLeaveAfter5, 'HR-04 §4.1'),
    R(8, 'annual.carry', 'Carry-forward', 'الترحيل', p.carryForwardMax ? `Up to ${p.carryForwardMax} days` : 'None', p.carryForwardMax, 'HR-04 §4.2'),
    R(9, 'sick.topup', 'Top-up in the 75% band', 'التعويض في شريحة 75%', p.sickTopUpDays ? `${p.sickTopUpDays} days at full pay` : 'None', p.sickTopUpDays, 'HR-04 §4.5'),
    R(10, 'otherleave', 'Marriage, bereavement, paternity, Hajj, maternity', 'الزواج والوفاة والأبوة والحج والأمومة', 'As the law: 5, 5 (3 for a sibling), 3, 10 to 15 once, 12 weeks', null, 'HR-04 §4.6, §4.7'),
    R(11, 'holidays', 'Public holidays', 'العطلات الرسمية', 'Founding Day, Eid al-Fitr 4 days, Eid al-Adha 4 days, National Day', null, 'HR-05 §5.4'),
    R(12, 'advances.amount', 'Advance limit', 'حد السلفة', `${p.advanceMultiple === 0.5 ? 'Half a month' : p.advanceMultiple === 1 ? 'One month' : `${p.advanceMultiple} months`} of ${p.advanceBasis}`, p.advanceMultiple, 'HR-07 §7.2'),
    R(12, 'advances.term', 'Repayment term', 'مدة السداد', `Up to ${p.advanceMaxTerm} months`, p.advanceMaxTerm, 'HR-07 §7.2'),
    R(12, 'advances.service', 'Minimum service', 'الحد الأدنى للخدمة', `${p.advanceMinServiceMonths} months`, p.advanceMinServiceMonths, 'HR-07 §7.1'),
    R(13, 'education', 'Education allowance', 'بدل التعليم', p.educationAllowance ? `SAR ${fmt(p.educationAllowance)} a child a year, up to ${p.educationChildren} children` : 'None', p.educationAllowance, 'HR-06 §6.5'),
    R(14, 'tickets', 'Air tickets', 'تذاكر السفر', p.ticket === 'annual' ? 'Annual, economy, family' : p.ticket === 'biennial' ? 'Every two years, employee only' : p.ticket === 'staff-travel' ? 'Staff travel and one confirmed ticket a year' : 'None', null, 'HR-04 §4.4'),
    { ...R(15, 'trips', 'Business trip per diem', 'بدل رحلات العمل', 'No per diem set', null, null, 'DEFAULT'), flag: 'MISSING', flag_note: 'The handbook does not set a per diem; Tasama asks the client before a trip is paid.' },
    R(16, 'bonus', 'Bonus', 'المكافأة', `${p.bonusTargetPct}% of annual basic at rating 3, ${q.bonusTiming}`, p.bonusTargetPct, 'HR-06 §6.7'),
    R(17, 'merit', 'Merit matrix', 'مصفوفة الجدارة', q.merit.map((m, i) => `${i + 1}: ${m}%`).join(' · '), null, 'HR-06 §6.8'),
    R(18, 'grades', 'Grades', 'الدرجات', 'G04 to G15', null, 'HR-06 §6.1'),
    R(19, 'promotion', 'Promotion increase', 'زيادة الترقية', 'At least 8%, and at least the new grade minimum', 8, 'HR-06 §6.3'),
    R(20, 'eoswage', 'End-of-service wage', 'أجر نهاية الخدمة', eosValue, null, 'HR-11 §11.1'),
    R(21, 'notice', 'Notice for G11 and above', 'الإشعار للدرجة G11 فما فوق', `${p.seniorNoticeDays} days`, p.seniorNoticeDays, 'HR-12 §12.1'),
    { ...R(22, 'discipline', 'Penalty regulation', 'لائحة الجزاءات', 'HRSD standard table of violations', null, null, 'LAW'), flag_note: 'The handbook refers to the approved work regulation without its own table; the HRSD table applies.' },
    R(23, 'calendar.cutoff', 'Cut-off day', 'يوم إقفال المدخلات', `Day ${p.cutoffDay}`, p.cutoffDay, 'HR-10 §10.1'),
    R(23, 'calendar.payday', 'Pay day', 'يوم صرف الرواتب', `Day ${p.payDay}`, p.payDay, 'HR-10 §10.1'),
    R(24, 'approvals', 'Advances above policy', 'السلف خارج السياسة', 'Chief Human Resources Officer', null, 'HR-07 §7.4'),
    R(25, 'gosi.absorb', 'Employee share', 'حصة الموظف', q.gosiAbsorb ? `Paid by the company for grades ${q.gosiAbsorb}` : 'Deducted from salary', null, 'HR-10 §10.4'),
    R(26, 'medical', 'Medical insurance class', 'فئة التأمين الطبي', `Class ${p.medicalClass}`, null, 'HR-06 §6.6'),
    R(27, 'finalpay', 'Final settlement paid', 'صرف التسوية النهائية', q.finalPay === 'LAST_DAY' ? 'On the last working day' : 'Within the legal deadline', null, 'HR-11 §11.5'),
  ];
}

/** The law's floor for a rule: a flag and its reason, or nothing. */
export function legalCheck(r: Rule): { flag: RuleFlag; note: string } | null {
  if (r.key === 'probation' && (r.num ?? 0) > 180) return { flag: 'BELOW_LAW', note: `Probation of ${r.num} days is longer than the 180 days the law allows (Art. 53).` };
  if (r.key === 'annual.days' && (r.num ?? 99) < 21) return { flag: 'BELOW_LAW', note: 'Annual leave below the 21 days the law sets (Art. 109).' };
  if (r.key === 'annual.after5' && (r.num ?? 99) < 30) return { flag: 'BELOW_LAW', note: 'Annual leave after five years below the 30 days the law sets (Art. 109).' };
  if (r.key === 'week.hours' && (r.num ?? 0) > 48) return { flag: 'BELOW_LAW', note: 'More than 48 hours a week (Art. 98).' };
  if (r.key === 'lateness.cap' && (r.num ?? 0) > 5) return { flag: 'BELOW_LAW', note: `Fines of up to ${r.num} days' wage a month exceed the 5-day cap (Art. 70).` };
  if (r.key === 'eoswage' && /basic salary only/i.test(r.value)) return { flag: 'BELOW_LAW', note: 'The award is due on the last actual wage, basic plus regular allowances (Art. 2, 84). Payroll pays on the full wage, whatever the handbook says.' };
  if (r.key === 'overtime.rate' && r.num === null) return { flag: 'UNCLEAR', note: '"Time and a half" without saying of which wage: 1.5 × the gross hourly wage pays more than the law\'s hourly wage plus 50% of the basic hourly wage. A person decides which one the client meant.' };
  if (r.key === 'overtime.rate' && (r.num ?? 1.5) < 1.5) return { flag: 'BELOW_LAW', note: 'Below the hourly wage plus 50% of basic (Art. 107).' };
  return null;
}

/* ------------------------------------------------------------------ Nizam's offline reading */

const num = (re: RegExp, s: string) => { const m = s.match(re); return m ? Number(m[1].replace(/,/g, '')) : null; };

/**
 * Nizam's offline resolver: reads a handbook's clauses into rules on the 27
 * dimensions, without Claude. It knows the layout the synthetic handbooks are
 * written in, as Claude would learn a real one; every rule carries the clause
 * and the words it came from, and legalCheck() flags it.
 */
export function readRules(c: ClientConfig, policies: Policy[]): Rule[] {
  const clause = (ref: string) => { for (const p of policies) { const k = p.clauses.find((x) => x.ref === ref); if (k) return { id: `${p.id} §${ref}`, text: k.en }; } return null; };
  const truth = truthRules(c);
  const out: Rule[] = [];
  for (const t of truth) {
    const ref = t.clause?.match(/§([\d.]+)/)?.[1];
    const src = ref ? clause(ref) : null;
    if (!src) { out.push({ ...t }); continue; }
    const s = src.text;
    let r: Rule = { ...t, clause: src.id };
    switch (t.key) {
      case 'week.hours': r = { ...r, num: num(/is (\d+) hours/, s) }; break;
      case 'lateness.grace': r = { ...r, num: /No grace period/.test(s) ? 0 : num(/grace period of (\d+) minutes/, s) }; break;
      case 'lateness.cap': { const n = num(/up to (\d+) days' wage a month/, s) ?? (/never exceed five days' wage/.test(s) ? 5 : null); r = { ...r, num: n, value: n ? `${n} days' wage a month` : 'Not stated' }; break; }
      case 'overtime.rate': r = /plus 50% of the basic hourly wage/.test(s) ? { ...r, num: 1.5, value: 'Hourly wage + 50% of basic hourly' } : /time and a half/i.test(s) ? { ...r, num: null, value: '"Time and a half", wage not stated' } : { ...r, num: null }; break;
      case 'overtime.cap': r = { ...r, num: num(/exceed (\d+) hours a month/, s) }; break;
      case 'elements.housing': r = { ...r, num: num(/housing allowance of (\d+)%/, s) }; break;
      case 'elements.transport': r = { ...r, num: num(/transport allowance of (\d+)%/, s) }; break;
      case 'probation': { const n = num(/Probation at .+? is (\d+) days/, s); r = { ...r, num: n, value: `${n} days` }; break; }
      case 'annual.days': r = { ...r, num: num(/earn (\d+) working days/, s) }; break;
      case 'annual.after5': r = { ...r, num: num(/rising to (\d+) working days/, s) }; break;
      case 'eoswage': r = { ...r, value: /basic salary only/.test(s) ? 'Basic salary only' : t.value }; break;
      case 'calendar.cutoff': r = { ...r, num: num(/inputs close on day (\d+)/, s) }; break;
      case 'calendar.payday': r = { ...r, num: num(/paid in SAR on day (\d+)/, s) }; break;
      default: break;
    }
    r.quote = s.length > 220 ? `${s.slice(0, 217)}…` : s;
    const chk = legalCheck(r);
    if (chk) { r.flag = chk.flag; r.flag_note = chk.note; }
    out.push(r);
  }
  return out;
}
