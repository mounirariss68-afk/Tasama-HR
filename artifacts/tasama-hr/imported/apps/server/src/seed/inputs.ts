/**
 * Each client's month of changes on the demo day (design/payroll-addendum.md §17).
 *
 *  - Three people in the shift teams have overtime hours the client still has to send; Wared
 *    suggests last month's figure, so last month's entry is written too.
 *  - WF-27 opens ten days before the cut-off. Wared reminds three days and one day before it.
 *    Where the cut-off has passed (Riyadh Air, Red Sea Global), HR operations confirmed the
 *    day before, after the reminders, and Tasama HR operations handed the month to payroll the same
 *    afternoon. Elsewhere the case waits on HR operations.
 *  - Riyadh Air: one person is set aside for D5, whose promotion is entered after the cut-off.
 */
import type { PoolClient } from 'pg';
import { rng } from '../domain/rng.js';
import type { ClientConfig } from '../domain/clients.js';
import type { BaseResult } from './base.js';
import { startCase, decide } from '../engine/core.js';
import { setClock } from '../clock.js';
import { openPeriod, remind } from '../payroll/inputs.js';

const SHIFT = /Coffee|Roastery|Farmer|Retail|Supply|Quality|Operations|Destination|Venue|Guest|Crew|Ground|Community|Sales Centre|Site|Construction|Hospitality/i;
const DAY = 86_400_000;

export async function seedInputs(c: PoolClient, base: BaseResult, cl: ClientConfig) {
  const per = await openPeriod(c);
  if (!per) return;
  const R = rng(20261023 + cl.key.length);
  const taken = new Set<number>([...Object.values(base.persona), ...Object.values(base.planted)]);
  const att = (await c.query(`SELECT value FROM layer.meta WHERE key='attendance'`)).rows[0]?.value;
  if (att) {
    for (const k of Object.keys(att.lates ?? {})) taken.add(Number(k));
    for (const a of att.absent ?? []) taken.add(a.personId);
    for (const l of att.leave ?? []) taken.add(l.personId);
  }
  const busy = new Set<number>((await c.query(`SELECT DISTINCT person_id FROM hcm.element_entries WHERE element_code IN ('OT_HOURS','OVERTIME','ADVANCE_REC')`)).rows.map((r: any) => r.person_id));
  const pool = (await c.query(
    `SELECT wr.person_id, d.name AS dept FROM hcm.work_relationships wr
       JOIN hcm.assignments a ON a.person_id=wr.person_id AND a.effective_end='4712-12-31' JOIN hcm.departments d ON d.id=a.department_id
      WHERE wr.worker_type='E' AND wr.end_date IS NULL AND wr.start_date < $1 ORDER BY wr.person_id`, [per.start])).rows
    .filter((r: any) => !taken.has(r.person_id) && !busy.has(r.person_id));
  const shift = pool.filter((r: any) => SHIFT.test(r.dept));
  const chosen = R.shuffle(shift.length >= 3 ? shift : pool).slice(0, 3);
  const expected = chosen.map((r: any) => ({ person_id: r.person_id as number, hours: R.pick([8, 10, 12, 14, 16]) }));
  // Last month's figure, so Wared's suggestion is a fact.
  const last = new Date(`${per.start}T00:00:00Z`); last.setUTCMonth(last.getUTCMonth() - 1);
  const ls = last.toISOString().slice(0, 10), le = new Date(Date.parse(per.start) - DAY).toISOString().slice(0, 10);
  for (const e of expected) await c.query(`INSERT INTO hcm.element_entries (entry_number, person_id, element_code, amount, effective_start, effective_end, source, reference) VALUES ($1,$2,'OT_HOURS',$3,$4,$5,'HRMS','Overtime sheet')`, [`OTH-${ls.slice(0, 7)}-${e.person_id}`, e.person_id, e.hours, ls, le]);
  const rest = pool.filter((r: any) => !expected.some((e) => e.person_id === r.person_id));
  const late = cl.key === 'riyadhair' ? rest[Math.floor(rest.length / 3)]?.person_id ?? null : null;
  // D9 at ROSHN (§18): a raise dated three months back, and a resignation after about seven years.
  let raise: number | null = null, resigner: number | null = null;
  if (cl.key === 'roshn') {
    raise = rest[Math.floor(rest.length / 2)]?.person_id ?? null;
    const seven = (await c.query(`SELECT person_id FROM hcm.work_relationships WHERE worker_type='E' AND end_date IS NULL AND start_date BETWEEN $1::date - 2900 AND $1::date - 2450 ORDER BY person_id`, [per.start])).rows.map((r: any) => r.person_id).filter((id: number) => rest.some((r: any) => r.person_id === id) && id !== raise);
    resigner = seven[0] ?? null;
  }
  await c.query(`INSERT INTO layer.meta (key, value) VALUES ('inputs', $1) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`, [JSON.stringify({ expected, late, raise, resigner })]);

  // WF-27: the month opens ten days before the cut-off.
  const ops = base.persona.payroll;
  const cutoff = new Date(`${per.cutoff}T00:00:00Z`).getTime();
  const today = Date.now();
  setClock(new Date(cutoff - 10 * DAY + 7 * 3600_000));
  const k = await startCase(c, { workflowId: 'WF-27', type: 'MONTH', title: `Payroll changes for ${new Date(`${per.start}T00:00:00Z`).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}`, title_ar: `تغييرات الرواتب لشهر ${new Date(`${per.start}T00:00:00Z`).toLocaleString('ar', { month: 'long', year: 'numeric', timeZone: 'UTC' })}`, requester: ops, subject: ops, channel: 'SCHEDULE', payload: { period: per.name } });
  for (const d of [3, 1]) {
    const at = cutoff - d * DAY + 8 * 3600_000;
    if (at > today) continue;
    setClock(new Date(at));
    await remind(c, k.id, d);
  }
  if (cutoff < today) {
    setClock(new Date(cutoff - DAY + 14 * 3600_000));
    await decide(c, { requestId: k.id, personId: ops, decision: 'APPROVED', reason: 'Overtime sheets checked with the team leaders' });
    // design/hr-ops-addendum.md: Tasama HR operations checks each change against its document and hands the month to payroll.
    setClock(new Date(cutoff - DAY + 16 * 3600_000));
    await decide(c, { requestId: k.id, personId: 0, decision: 'APPROVED', reason: 'Checked against the documents and handed to payroll', actorName: 'Lama Al Dossary, Tasama' });
  }
  setClock(null);
}
