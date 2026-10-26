/**
 * The client's payroll calendar for the year (design/walkthrough-addendum.md item 5): read for the screens,
 * and the reminders Wared sends from it. Runs inside the client's schema.
 */
import type { PoolClient } from 'pg';
import { pool } from '../db.js';
import { client, pol } from '../domain/rules.js';
import { STAGES, yearPlan, type MonthPlan, type StageKey } from '../domain/calendar.js';
import { TEAM_NOTIFY } from '../domain/staff.js';
import { monthWord } from './inputs.js';
import { now } from '../clock.js';

type Q = Pick<PoolClient, 'query'>;
const DAY = 86_400_000;
const d10 = (d: Date) => d.toISOString().slice(0, 10);
const long = (s: string) => new Date(`${s}T00:00:00Z`).toLocaleString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });

export type CalendarRow = { id: number; year: number; status: 'PROPOSED' | 'APPROVED'; months: MonthPlan[]; request_id: number | null; approved_by: string | null; approved_at: string | null; ref?: string | null };

/** The calendar on file for a year, or the one Wared would propose if none is. */
export async function calendarFor(c: Q, year: number): Promise<CalendarRow & { onFile: boolean }> {
  const row = (await c.query(`SELECT k.*, r.ref FROM layer.payroll_calendar k LEFT JOIN layer.requests r ON r.id=k.request_id WHERE k.year=$1`, [year])).rows[0];
  if (row) return { ...row, onFile: true };
  return { id: 0, year, status: 'PROPOSED', months: yearPlan(client().key, year, pol()), request_id: null, approved_by: null, approved_at: null, ref: null, onFile: false };
}

/** Where a month stands: each stage, whether it is past, today or ahead. */
export function monthStages(m: MonthPlan, today: string) {
  return STAGES.map((s) => ({ key: s.key, label: s.label, label_ar: s.label_ar, owner: s.owner, date: m.stages[s.key], moved: m.moved.includes(s.key), state: m.stages[s.key] < today ? 'DONE' : m.stages[s.key] === today ? 'TODAY' : 'AHEAD' }));
}

/** The month the calendar is in on a day: the first whose pay date is on or after it. */
export function monthOn(months: MonthPlan[], today: string) {
  return months.find((m) => m.stages.pay >= today) ?? months[months.length - 1];
}

const OWNER_WORD: Record<string, string> = { TASAMA_HR_OPS: 'Tasama HR operations', TASAMA_PAYROLL: 'the payroll specialist', TASAMA_PAYROLL_LEAD: 'the payroll manager', CLIENT: 'the client', CLIENT_FINANCE: 'the client\'s finance' };

/**
 * Wared's reminders from an approved calendar: the day before the client's cut-off and its approval date, the
 * client's HR operations is reminded; the day before each stage Tasama owns, that team is told. Called at start-up
 * and by the day's tick; a reminder already sent for a stage is not sent again.
 */
export async function calendarReminders(c: Q, today = d10(now()), opts: { ahead?: boolean } = {}) {
  const year = Number(today.slice(0, 4));
  const k = (await c.query(`SELECT k.*, r.ref FROM layer.payroll_calendar k LEFT JOIN layer.requests r ON r.id=k.request_id WHERE k.year=$1 AND k.status='APPROVED'`, [year])).rows[0];
  if (!k) return { sent: 0, stages: [] as string[], period: null as string | null };
  const tomorrow = d10(new Date(Date.parse(`${today}T00:00:00Z`) + DAY));
  const sentStages: string[] = [];
  const m = monthOn(k.months, today);
  if (!m) return { sent: 0, stages: [] as string[], period: null as string | null };
  const payroll = (await c.query(`SELECT person_id FROM layer.personas WHERE key='payroll'`)).rows[0]?.person_id;
  let sent = 0;
  // With `ahead`, the next stage still to come is reminded as if it were tomorrow (the scenario shows the reminder on the demo day).
  const nextKey = opts.ahead ? STAGES.find((s) => m.stages[s.key] > today)?.key : null;
  for (const s of STAGES) {
    if (opts.ahead ? s.key !== nextKey : m.stages[s.key] !== tomorrow) continue;
    const link = `calendar:${m.period}:${s.key}`;
    const dup = (await c.query(`SELECT 1 FROM layer.notifications WHERE link=$1 LIMIT 1`, [link])).rows[0];
    if (dup) continue;
    const month = monthWord(m.period);
    if (s.owner === 'CLIENT' && payroll) {
      const title = s.key === 'cutoff' ? `${month}'s cut-off is ${long(m.stages[s.key])}: the changes are due` : `${month}'s payroll is due for your approval by ${long(m.stages[s.key])}`;
      const title_ar = s.key === 'cutoff' ? `موعد إقفال ${month} غداً` : `اعتماد رواتب ${month} غداً`;
      await c.query(`INSERT INTO layer.notifications (person_id, title, title_ar, body, link, created_at) VALUES ($1,$2,$3,$4,$5,$6)`,
        [payroll, title, title_ar, `Wared, for Tasama HR Operations: ${s.key === 'cutoff' ? `${month}'s changes are due by ${long(m.stages[s.key])}` : `${month}'s payroll is due for your approval by ${long(m.stages[s.key])}`}, on the calendar ${client().short} approved for ${year}.`, link, now()]);
      if (k.request_id) await c.query(`INSERT INTO layer.trail (request_id, at, actor_type, actor_id, actor_name, act, autonomy, summary, summary_ar) VALUES ($1,$2,'AGENT','wared','Wared','NOTIFY','A3',$3,$4)`,
        [k.request_id, now(), `Reminded ${client().short}'s HR operations: ${s.label.toLowerCase()} is on ${long(m.stages[s.key])}.`, 'تذكير قبل موعد التقويم']);
      sent++; sentStages.push(s.key);
    }
    for (const nid of TEAM_NOTIFY[s.owner] ?? []) {
      await c.query(`INSERT INTO layer.notifications (person_id, title, title_ar, body, link, created_at) VALUES ($1,$2,$3,$4,$5,$6)`,
        [nid, `${client().short}: ${s.label.toLowerCase()} on ${long(m.stages[s.key])}`, `${client().name_ar}: ${s.label_ar} في ${long(m.stages[s.key])}`, `Wared: ${long(m.stages[s.key])} on ${client().short}'s ${year} calendar, owned by ${OWNER_WORD[s.owner]}.`, link, now()]);
      sent++; if (!sentStages.includes(s.key)) sentStages.push(s.key);
    }
  }
  return { sent, stages: sentStages, period: m.period };
}

/** Every client's open month on its calendar, for Tasama's Months. */
export async function stagesForMonths(today: string) {
  const year = Number(today.slice(0, 4));
  const k = await calendarFor(pool, year);
  const m = monthOn(k.months, today);
  return { status: k.onFile ? k.status : 'NONE', period: m?.period ?? null, stages: m ? monthStages(m, today) : [], current: m ? (monthStages(m, today).find((s) => s.state !== 'DONE')?.key ?? 'pay') as StageKey : null };
}
