/**
 * WF-38, the year's payroll calendar (design/walkthrough-addendum.md item 5): Wared lays the year out from the
 * client's cut-off and pay days, off weekends and holidays; the client's HR operations approves it; the reminders
 * follow the approved dates.
 */
import type { HCtx, StepOutcome } from './core.js';
import { client, pol } from '../domain/rules.js';
import { STAGES, yearPlan } from '../domain/calendar.js';
import { calendarReminders } from '../payroll/calendar.js';
import { now } from '../clock.js';

type H = (h: HCtx) => Promise<StepOutcome>;
const ord = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][n % 10 > 3 || [11, 12, 13].includes(n) ? 0 : n % 10]}`;
const long = (s: string) => new Date(`${s}T00:00:00Z`).toLocaleString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });

export const CALENDAR_HANDLERS: Record<string, H> = {
  'WF-38:propose': async (h) => {
    const year = Number(h.req.payload.year ?? now().getUTCFullYear());
    const months = yearPlan(client().key, year, pol());
    const moved = months.reduce((n, m) => n + m.moved.length, 0);
    await h.c.query(`INSERT INTO layer.payroll_calendar (year, status, months, request_id, created_at) VALUES ($1,'PROPOSED',$2,$3,$4)
      ON CONFLICT (year) DO UPDATE SET status='PROPOSED', months=EXCLUDED.months, request_id=EXCLUDED.request_id, approved_by=NULL, approved_at=NULL`, [year, JSON.stringify(months), h.req.id, now()]);
    await h.setResult({ year, moved, first: months[0].stages });
    await h.trail({ act: 'PROPOSE', summary: `Laid out ${client().short}'s ${year}: the cut-off on the ${ord(pol().cutoffDay)}, payment on the ${ord(pol().payDay)}, and ${STAGES.length - 2} stages between them each month. ${moved} ${moved === 1 ? 'date falls' : 'dates fall'} on a weekend or a holiday and ${moved === 1 ? 'moves' : 'move'} to a working day: the payment date earlier, the stages between the cut-off and it later. January: cut-off ${long(months[0].stages.cutoff)}, approval ${long(months[0].stages.approval)}, payment ${long(months[0].stages.pay)}.`,
      summary_ar: `أعدّ تقويم ${year}: ${moved} تواريخ نُقلت إلى أيام عمل`, citation: 'The client\'s policy: cut-off and pay days. Weekends and the public holidays of the year.' });
    return { status: 'DONE', decision: `${year} laid out`, outputs: { year, moved },
      recommend: { verdict: 'APPROVE', summary: `approve the calendar: it follows ${client().short}'s cut-off and pay days, and ${moved ? `${moved} dates moved off weekends and holidays` : 'no date lands on a weekend or a holiday'}`, summary_ar: 'اعتماد التقويم: يتبع موعدي الإقفال والصرف' } };
  },
  'WF-38:apply': async (h) => {
    const year = Number(h.req.payload.year ?? now().getUTCFullYear());
    const a = (await h.c.query(`SELECT a.decided_at, p.display_name FROM layer.approvals a LEFT JOIN hcm.persons p ON p.id=a.approver_person_id WHERE a.request_id=$1 AND a.step_key='approve' AND a.decision='APPROVED' ORDER BY a.id DESC LIMIT 1`, [h.req.id])).rows[0];
    const by = a?.display_name ?? h.req.payload.approved_by_name ?? 'The client\'s HR operations';
    await h.c.query(`UPDATE layer.payroll_calendar SET status='APPROVED', approved_by=$2, approved_at=$3 WHERE year=$1`, [year, by, a?.decided_at ?? now()]);
    const { sent } = await calendarReminders(h.c);
    await h.trail({ act: 'APPLY', summary: `${year}'s calendar is in force, approved by ${by}. Wared reminds ${client().short}'s HR operations the day before each cut-off and each approval date, and the Tasama team the day before each stage it owns.${sent ? ` ${sent} ${sent === 1 ? 'reminder' : 'reminders'} went out for tomorrow.` : ''}`,
      summary_ar: `تقويم ${year} ساري المفعول والتذكيرات مضبوطة` });
    return { status: 'DONE', decision: 'Reminders set', stop: 'COMPLETED' };
  },
};
