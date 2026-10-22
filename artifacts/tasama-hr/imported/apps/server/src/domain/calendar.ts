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
