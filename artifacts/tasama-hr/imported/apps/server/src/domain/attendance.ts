/**
 * Hudoor's arithmetic (design/payroll-addendum.md §5 and §8, edges 6 and 7): a month of
 * punches against each person's schedule and approved leave becomes, day by day, on time,
 * late, absent, on leave or off; then two separate amounts per person:
 *
 *  - unpaid absence: a scheduled day with no punch and no approved leave is not paid.
 *    That is not a fine and has no cap.
 *  - the fine: late arrivals under the client's approved penalty table, only after the
 *    employee has been heard (Art. 71), and never more than five days' wage in a month
 *    (Art. 70).
 *
 * Pure: no I/O, no clock. Claude never calculates.
 */

export type Schedule = { code: string; days: number[]; start: string; end: string; graceMin: number };
export type Punch = { personId: number; at: string; direction: 'IN' | 'OUT' };
export type LeaveSpan = { personId: number; start: string; end: string; ref: string };

/** One step of a penalty table: from the nth late arrival in the month, this share of a day's wage. */
export type PenaltyStep = { from: number; share: number; label: string };

/**
 * The penalty table in the client's approved work regulation for late arrivals beyond the
 * grace period, counted within the calendar month. Synthetic, for the demo client.
 */
export const PENALTY_TABLE: PenaltyStep[] = [
  { from: 1, share: 0, label: 'Written warning' },
  { from: 3, share: 0.25, label: '25% of a day\'s wage' },
  { from: 6, share: 0.5, label: '50% of a day\'s wage' },
];
export const FINE_CAP_DAYS = 5;

export type DayResult = { personId: number; day: string; scheduled: boolean; firstIn: string | null; lastOut: string | null; minutesLate: number; status: 'ON_TIME' | 'LATE' | 'ABSENT' | 'LEAVE' | 'OFF'; leaveRef: string | null };
export type PersonResult = {
  personId: number; lates: number; absences: number; leaveDays: number; dailyWage: number;
  fines: { day: string; minutes: number; share: number; amount: number; label: string; excused: boolean }[];
  fineBeforeCap: number; fine: number; capped: boolean; cap: number;
  unpaidDays: number; unpaidAmount: number;
};

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const t = (d: string) => Date.parse(`${d}T00:00:00Z`);
const minutes = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const isoWeekday = (d: string) => { const w = new Date(t(d)).getUTCDay(); return w === 0 ? 7 : w; };
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function monthDays(start: string, end: string) {
  const out: string[] = [];
  for (let x = t(start); x <= t(end); x += 86_400_000) out.push(iso(x));
  return out;
}

/** Each scheduled day: first in against the start time and the grace period; no punch = absent unless leave covers it. */
export function evaluateDays(o: { start: string; end: string; people: { personId: number; schedule: Schedule; from?: string; to?: string | null }[]; punches: Punch[]; leave: LeaveSpan[] }): DayResult[] {
  const byPerson = new Map<number, Punch[]>();
  for (const p of o.punches) { const a = byPerson.get(p.personId) ?? []; a.push(p); byPerson.set(p.personId, a); }
  const out: DayResult[] = [];
  for (const m of o.people) {
    const ps = byPerson.get(m.personId) ?? [];
    for (const day of monthDays(o.start, o.end)) {
      if ((m.from && day < m.from) || (m.to && day > m.to)) continue;
      const scheduled = m.schedule.days.includes(isoWeekday(day));
      const today = ps.filter((p) => p.at.slice(0, 10) === day).sort((a, b) => a.at.localeCompare(b.at));
      const ins = today.filter((p) => p.direction === 'IN'), outs = today.filter((p) => p.direction === 'OUT');
      const firstIn = ins[0]?.at.slice(11, 16) ?? null, lastOut = outs.at(-1)?.at.slice(11, 16) ?? null;
      const lv = o.leave.find((l) => l.personId === m.personId && l.start <= day && l.end >= day);
      let status: DayResult['status'] = 'OFF', late = 0;
      if (!scheduled) status = 'OFF';
      else if (lv) status = 'LEAVE';
      else if (!firstIn) status = 'ABSENT';
      else { late = Math.max(0, minutes(firstIn) - minutes(m.schedule.start) - m.schedule.graceMin); status = late > 0 ? 'LATE' : 'ON_TIME'; }
      out.push({ personId: m.personId, day, scheduled, firstIn, lastOut, minutesLate: late, status, leaveRef: lv?.ref ?? null });
    }
  }
  return out;
}

/** Per person: the fine under the penalty table, capped at five days' wage (Art. 70); unpaid absence apart, uncapped. */
export function assess(days: DayResult[], wages: Map<number, number>, excused: Set<string> = new Set(), table = PENALTY_TABLE): PersonResult[] {
  const ids = [...new Set(days.map((d) => d.personId))];
  return ids.map((personId) => {
    const mine = days.filter((d) => d.personId === personId);
    const dailyWage = (wages.get(personId) ?? 0) / 30;
    let n = 0;
    const fines = mine.filter((d) => d.status === 'LATE').map((d) => {
      const isExcused = excused.has(`${personId}:${d.day}`);
      if (isExcused) return { day: d.day, minutes: d.minutesLate, share: 0, amount: 0, label: 'Excused', excused: true };
      n += 1;
      const step = [...table].reverse().find((s) => n >= s.from) ?? table[0];
      return { day: d.day, minutes: d.minutesLate, share: step.share, amount: r2(step.share * dailyWage), label: step.label, excused: false };
    });
    const before = r2(fines.reduce((s, f) => s + f.amount, 0));
    const cap = r2(FINE_CAP_DAYS * dailyWage);
    const absent = mine.filter((d) => d.status === 'ABSENT' && !excused.has(`${personId}:${d.day}`)).length;
    return {
      personId, lates: mine.filter((d) => d.status === 'LATE').length, absences: mine.filter((d) => d.status === 'ABSENT').length, leaveDays: mine.filter((d) => d.status === 'LEAVE').length, dailyWage: r2(dailyWage),
      fines, fineBeforeCap: before, fine: Math.min(before, cap), capped: before > cap, cap,
      unpaidDays: absent, unpaidAmount: r2(absent * dailyWage),
    };
  });
}

/** The device file's headers → our fields. Hudoor proposes; a person confirms. */
const SYNONYMS: Record<string, RegExp> = {
  employee: /^(emp(loyee)?\s*(no\.?|number|code|id)|badge|staff\s*(no|id)|رقم الموظف)/i,
  date: /(punch\s*)?date|التاريخ/i,
  time: /(punch\s*)?time|الوقت/i,
  direction: /in\s*\/\s*out|direction|state|status|الحالة/i,
  device: /terminal|device|reader|الجهاز/i,
};
/** The client's approved summary (walkthrough addendum R8): one row per employee with the late minutes and the absent days, not the device's punches. */
const SUMMARY_SYNONYMS: Record<string, RegExp> = {
  employee: SYNONYMS.employee,
  late_minutes: /late\s*(minutes|mins)|minutes\s*late|دقائق التأخير/i,
  late_days: /late\s*(days|arrivals|count)|lates|أيام التأخير/i,
  absent_days: /absen(t|ce)\s*days|no[\s-]*show|unpaid\s*days|أيام الغياب/i,
  approved_by: /approved\s*by|approver|اعتمده/i,
};
export const isSummarySheet = (headers: string[]) => headers.some((h) => SUMMARY_SYNONYMS.absent_days.test(h.trim()) || SUMMARY_SYNONYMS.late_minutes.test(h.trim()) || SUMMARY_SYNONYMS.late_days.test(h.trim()));
export function proposeColumnMap(headers: string[]) {
  const map: Record<string, string | null> = {};
  const syn = isSummarySheet(headers) ? SUMMARY_SYNONYMS : SYNONYMS;
  for (const [field, re] of Object.entries(syn)) map[field] = headers.find((h) => re.test(h.trim())) ?? null;
  if (syn === SUMMARY_SYNONYMS) map.kind = 'SUMMARY';
  return map;
}
