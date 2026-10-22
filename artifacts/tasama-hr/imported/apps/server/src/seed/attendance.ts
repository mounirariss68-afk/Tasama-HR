/**
 * Work schedules for every client, and Saudi Coffee's month of fingerprints for scenario D3
 * (design/payroll-addendum.md §8, edges 6 and 7). The punches themselves are not stored here:
 * they come from the device export (attendance/export.ts), generated from what is planted below,
 * so the demo uploads a file as a client would.
 *
 * Planted for the attendance month (the month before the open payroll month):
 *  - 37 late arrivals: one barista late 15 times, so his fines would pass five days' wage (edge 7);
 *    the employee persona late once, by 52 minutes, which she will explain; 21 more spread over ten people;
 *  - 10 scheduled days with no punch: 6 are approved annual leave (two people, three days each),
 *    4 are absences (the barista once, three others once).
 */
import type { PoolClient } from 'pg';
import { insertMany } from '../db.js';
import { rng } from '../domain/rng.js';
import { payrollPolicy } from '../domain/payroll-policy.js';
import type { ClientConfig } from '../domain/clients.js';
import { iso, monthStart, monthEnd } from '../domain/rules.js';
import { monthDays } from '../domain/attendance.js';
import type { BaseResult } from './base.js';

const SHIFT_DEPTS = /Coffee|Roastery|Farmer|Retail|Supply|Quality|Operations|Destination|Venue|Guest|Crew|Ground|Community|Sales Centre/i;
const isoWeekday = (d: string) => { const w = new Date(`${d}T00:00:00Z`).getUTCDay(); return w === 0 ? 7 : w; };

export async function seedAttendance(c: PoolClient, base: BaseResult, client: ClientConfig) {
  const q = payrollPolicy(client.key);
  const six = /six days/i.test(q.weekDays);
  const ids = await insertMany(c, 'layer.work_schedules', [
    { code: 'SHIFT', name: six ? 'Site shift, Saturday to Thursday, 07:00 to 15:00' : 'Shift, Sunday to Thursday, 07:00 to 15:00', name_ar: six ? 'مناوبة الموقع، من السبت إلى الخميس، 07:00 إلى 15:00' : 'مناوبة، من الأحد إلى الخميس، 07:00 إلى 15:00', days: six ? [6, 7, 1, 2, 3, 4] : [7, 1, 2, 3, 4], start_time: '07:00', end_time: '15:00', grace_min: q.graceMin },
    { code: 'OFFICE', name: 'Office, Sunday to Thursday, 08:00 to 16:00', name_ar: 'المكتب، من الأحد إلى الخميس، 08:00 إلى 16:00', days: [7, 1, 2, 3, 4], start_time: '08:00', end_time: '16:00', grace_min: q.graceMin },
  ], 'id, code');
  const sid = (code: string) => ids.find((x: any) => x.code === code).id;
  const people = (await c.query(
    `SELECT wr.person_id, wr.start_date, wr.end_date, d.name AS dept FROM hcm.work_relationships wr
       JOIN hcm.assignments a ON a.person_id = wr.person_id AND a.effective_end = '4712-12-31'
       JOIN hcm.departments d ON d.id = a.department_id
      WHERE wr.worker_type = 'E' AND wr.end_date IS NULL`)).rows;
  await insertMany(c, 'layer.schedule_members', people.map((p: any) => ({ person_id: p.person_id, schedule_id: sid(SHIFT_DEPTS.test(p.dept) ? 'SHIFT' : 'OFFICE') })));
  if (client.key !== 'saudicoffee') return;

  // ------------------------------------------------------------ Saudi Coffee's planted month
  const R = rng(20261017);
  const from = iso(monthStart(base.anchor, -1)), to = iso(monthEnd(base.anchor, -1));
  const whole = people.filter((p: any) => iso(new Date(p.start_date)) < from);
  // Days already on approved leave in the seed are not used for planted lates or absences.
  const onLeave = (await c.query(`SELECT person_id, to_char(start_date,'YYYY-MM-DD') s, to_char(end_date,'YYYY-MM-DD') e FROM hcm.absences WHERE status IN ('APPROVED','COMPLETED') AND start_date <= $2 AND end_date >= $1`, [from, to])).rows;
  const shiftDays = (pid: number) => {
    const sch = SHIFT_DEPTS.test(people.find((p: any) => p.person_id === pid)?.dept ?? '') ? [6, 7, 1, 2, 3, 4] : [7, 1, 2, 3, 4];
    return monthDays(from, to).filter((d) => sch.includes(isoWeekday(d)) && !onLeave.some((l: any) => l.person_id === pid && l.s <= d && l.e >= d));
  };
  const taken = new Set<number>([...Object.values(base.persona), ...Object.values(base.planted)]);
  const pool = R.shuffle(whole.map((p: any) => p.person_id as number).filter((id: number) => !taken.has(id)));
  const barista = whole.find((p: any) => /Coffee Houses/i.test(p.dept) && !taken.has(p.person_id))?.person_id ?? pool[0];
  const others = pool.filter((id: number) => id !== barista);
  const justifier = base.persona.employee;
  const lates: Record<string, { day: string; minutes: number }[]> = {};
  // The barista: 15 late arrivals, 8 to 40 minutes.
  const bDays = shiftDays(barista);
  lates[barista] = R.shuffle(bDays.slice(0, -2)).slice(0, 15).sort().map((day) => ({ day, minutes: R.int(8, 40) }));
  // The employee persona: one late arrival of 52 minutes, which she explains.
  const jDay = shiftDays(justifier).find((d) => d > `${from.slice(0, 8)}08`) ?? shiftDays(justifier)[5];
  lates[justifier] = [{ day: jDay, minutes: 52 }];
  // 21 more: nine people late twice, one person late three times.
  const spread = others.slice(0, 10);
  spread.forEach((pid, i) => { lates[pid] = R.shuffle(shiftDays(pid)).slice(0, i === 0 ? 3 : 2).sort().map((day) => ({ day, minutes: R.int(7, 35) })); });
  // Absences: the barista once (not on a late day), three others once.
  const absent: { personId: number; day: string }[] = [{ personId: barista, day: bDays.find((d) => !lates[barista].some((l) => l.day === d))! }];
  for (const pid of others.slice(10, 13)) absent.push({ personId: pid, day: R.pick(shiftDays(pid)) });
  // Approved leave: two people, three consecutive working days each, with no punches.
  const leave: { personId: number; start: string; end: string; ref: string }[] = [];
  const absRows: any[] = [];
  let n = 1;
  for (const pid of others.slice(13, 15)) {
    const ds = shiftDays(pid); const k = R.int(4, ds.length - 4);
    const span = ds.slice(k, k + 3);
    const ref = `DEMO-ABS-ATT-${n++}`;
    leave.push({ personId: pid, start: span[0], end: span[2], ref });
    absRows.push({ absence_number: ref, person_id: pid, type_code: 'ANNUAL', start_date: span[0], end_date: span[2], days: 3, status: 'COMPLETED', approver_person_id: base.managerOf.get(pid) ?? null, submitted_at: new Date(`${span[0]}T08:00:00Z`), comments: null, source: 'HRMS' });
  }
  await insertMany(c, 'hcm.absences', absRows);
  for (const l of leave) await c.query(`UPDATE hcm.absence_balances SET taken = taken + 3 WHERE person_id=$1 AND type_code='ANNUAL'`, [l.personId]);
  const meta = { from, to, barista, justifier, justifierDay: jDay, lates, absent, leave, device: 'SCC-RIY-07' };
  await c.query(`INSERT INTO layer.meta (key, value) VALUES ('attendance', $1)`, [JSON.stringify(meta)]);
}
