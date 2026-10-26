/**
 * Each client's payroll calendar for the year (design/walkthrough-addendum.md item 5): Wared proposed it in the
 * first week of January and the client's HR operations approved it within the week. Saudi Coffee's still waits on
 * its HR operations: the scenario "The year's calendar, approved once" approves it on the demo day.
 */
import type { PoolClient } from 'pg';
import type { ClientConfig } from '../domain/clients.js';
import type { BaseResult } from './base.js';
import { startCase, decide } from '../engine/core.js';
import { setClock } from '../clock.js';
import { calendarReminders } from '../payroll/calendar.js';

const DAY = 86_400_000;

export async function seedCalendar(c: PoolClient, base: BaseResult, cl: ClientConfig, anchor: Date) {
  const year = anchor.getUTCFullYear();
  const jan = Date.UTC(year, 0, 4, 9, 0, 0);
  const waits = cl.key === 'saudicoffee';
  setClock(new Date(waits ? anchor.getTime() - 3 * DAY + 9 * 3600e3 : jan));
  const k = await startCase(c, { workflowId: 'WF-38', type: 'PAYROLL_CALENDAR', title: `${cl.short}'s payroll calendar for ${year}`, title_ar: `تقويم رواتب ${cl.name_ar} لعام ${year}`,
    requester: base.persona.payroll, subject: base.persona.payroll, channel: 'SCHEDULE', payload: { year, client: cl.short } });
  if (!waits) {
    setClock(new Date(jan + 2 * DAY + 5 * 3600e3));
    await decide(c, { requestId: k.id, personId: base.persona.payroll, decision: 'APPROVED', reason: 'The dates work for us' });
  }
  setClock(null);
  await calendarReminders(c);
  return k;
}
