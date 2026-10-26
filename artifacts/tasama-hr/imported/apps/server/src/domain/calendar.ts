/**
 * The payroll calendar around the day of the demo (design/payroll-addendum.md §8).
 *
 * The app runs on real time and the seed's anchor is the day it runs, so a
 * fixed day-of-month cut-off would put each client in a different state on
 * every rehearsal. Instead each client's cut-off sits at a fixed distance from
 * the anchor, which gives the five clients five different stages of the month
 * whatever the date. The policy's cut-off and pay days are the days of the
 * month that fall there, so the handbook, the calendar and the screens agree.
 */
import { CLIENTS } from './clients.js';

const DAY = 86_400_000;
/** Days from the anchor to the cut-off, and from the cut-off to pay day. */
export const CALENDAR: Record<string, { cutoff: number; pay: number }> = {
  riyadhair: { cutoff: -2, pay: 10 },
  redsea: { cutoff: -1, pay: 10 },
  roshn: { cutoff: 1, pay: 9 },
  seven: { cutoff: 1, pay: 9 },
  saudicoffee: { cutoff: 3, pay: 8 },
};
const DEFAULT = { cutoff: 5, pay: 10 };

const at = (anchor: Date, days: number) => new Date(anchor.getTime() + days * DAY);

/** The open month's cut-off and pay dates for a client. */
export function openMonth(key: string, anchor: Date) {
  const o = CALENDAR[key] ?? DEFAULT;
  const cutoff = at(anchor, o.cutoff);
  return { cutoff, pay: at(cutoff, o.pay) };
}

/** Writes each client's cut-off and pay days into its policy, from the anchor. Called before seeding and at start-up. */
export function applyCalendar(anchor: Date) {
  for (const c of CLIENTS) {
    const { cutoff, pay } = openMonth(c.key, anchor);
    c.policy.cutoffDay = cutoff.getUTCDate();
    c.policy.payDay = pay.getUTCDate();
  }
}

/** Cut-off and pay date for a period: exact for the open month, the policy's days of the month for the others. */
export function periodDates(key: string, anchor: Date, monthStart: Date, open: boolean) {
  if (open) return openMonth(key, anchor);
  const o = CALENDAR[key] ?? DEFAULT;
  const ref = openMonth(key, anchor).cutoff;
  const last = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0)).getUTCDate();
  const cutoff = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), Math.min(ref.getUTCDate(), last)));
  return { cutoff, pay: at(cutoff, o.pay) };
}

/* ------------------------------------------------------------------ the year's stages (design/walkthrough-addendum.md item 5) */

export type StageKey = 'cutoff' | 'calculation' | 'review' | 'delivery' | 'approval' | 'bank' | 'pay';
export type Stage = { key: StageKey; label: string; label_ar: string; owner: 'CLIENT' | 'TASAMA_HR_OPS' | 'TASAMA_PAYROLL' | 'TASAMA_PAYROLL_LEAD' | 'CLIENT_FINANCE'; offset: number };
/** Each stage as days after the cut-off; the pay date is the client's own. */
export const STAGES: Stage[] = [
  { key: 'cutoff', label: 'Cut-off: the client\'s changes are in', label_ar: 'موعد الإقفال: تغييرات العميل مكتملة', owner: 'CLIENT', offset: 0 },
  { key: 'calculation', label: 'Payroll calculated', label_ar: 'احتساب الرواتب', owner: 'TASAMA_PAYROLL', offset: 1 },
  { key: 'review', label: 'Reviewed by the payroll manager', label_ar: 'مراجعة مديرة الرواتب', owner: 'TASAMA_PAYROLL_LEAD', offset: 2 },
  { key: 'delivery', label: 'Delivered to the client', label_ar: 'التسليم إلى العميل', owner: 'TASAMA_HR_OPS', offset: 2 },
  { key: 'approval', label: 'Approved by the client', label_ar: 'اعتماد العميل', owner: 'CLIENT', offset: 4 },
  { key: 'bank', label: 'Uploaded to the bank', label_ar: 'الرفع إلى البنك', owner: 'TASAMA_PAYROLL_LEAD', offset: 6 },
  { key: 'pay', label: 'Payment date', label_ar: 'تاريخ الصرف', owner: 'CLIENT_FINANCE', offset: 9 },
];
/** Saudi public holidays that touch a payroll date in 2026 (Eid al-Fitr, Eid al-Adha, National Day, Founding Day). */
export const HOLIDAYS_2026 = ['2026-02-22', '2026-03-19', '2026-03-20', '2026-03-21', '2026-03-22', '2026-05-26', '2026-05-27', '2026-05-28', '2026-05-29', '2026-09-23'];
const d10 = (d: Date) => d.toISOString().slice(0, 10);
const isWeekend = (d: Date) => d.getUTCDay() === 5 || d.getUTCDay() === 6;
/** The payment date, when it lands on a weekend or a holiday moves to the working day before. */
export function workingDayBefore(d: Date, holidays = HOLIDAYS_2026) {
  let x = new Date(d);
  while (isWeekend(x) || holidays.includes(d10(x))) x = new Date(x.getTime() - DAY);
  return x;
}
/** A stage between them (calculation, review, delivery, approval, bank upload) that lands on a weekend or a holiday moves to the working day after. */
export function workingDayAfter(d: Date, holidays = HOLIDAYS_2026) {
  let x = new Date(d);
  while (isWeekend(x) || holidays.includes(d10(x))) x = new Date(x.getTime() + DAY);
  return x;
}
export type MonthPlan = { period: string; stages: Record<StageKey, string>; moved: StageKey[]; weekendDays: number };
/**
 * The twelve months of a year for a client. The cut-off is on the client's day of the month; the stages follow it
 * at their offsets; the payment date is the client's pay day in the month after. The cut-off stays on its day (it is
 * the client's deadline, weekend or not); the payment date moves to the working day before a weekend or a holiday,
 * the stages between them to the working day after, and no stage comes before the one ahead of it.
 */
export function yearPlan(key: string, year: number, policy: { cutoffDay: number; payDay: number }): MonthPlan[] {
  const out: MonthPlan[] = [];
  for (let m = 0; m < 12; m++) {
    const last = new Date(Date.UTC(year, m + 1, 0)).getUTCDate();
    const cutoff = new Date(Date.UTC(year, m, Math.min(policy.cutoffDay, last)));
    const nextLast = new Date(Date.UTC(year, m + 2, 0)).getUTCDate();
    const pay = policy.payDay > policy.cutoffDay ? new Date(Date.UTC(year, m, Math.min(policy.payDay, last))) : new Date(Date.UTC(year, m + 1, Math.min(policy.payDay, nextLast)));
    const stages = {} as Record<StageKey, string>;
    const moved: StageKey[] = [];
    let prev = 0;
    for (const s of STAGES) {
      const raw = s.key === 'pay' ? pay : s.key === 'cutoff' ? cutoff : new Date(cutoff.getTime() + s.offset * DAY);
      let fixed = s.key === 'cutoff' ? raw : s.key === 'pay' ? workingDayBefore(raw) : workingDayAfter(raw);
      if (fixed.getTime() < prev) fixed = new Date(prev);
      if (d10(fixed) !== d10(raw)) moved.push(s.key);
      stages[s.key] = d10(fixed);
      prev = fixed.getTime();
    }
    let weekendDays = 0;
    for (let d = 1; d <= last; d++) if (isWeekend(new Date(Date.UTC(year, m, d)))) weekendDays++;
    out.push({ period: `${year}-${String(m + 1).padStart(2, '0')}`, stages, moved, weekendDays });
  }
  return out;
}
