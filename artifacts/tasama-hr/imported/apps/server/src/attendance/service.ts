/**
 * The attendance month (WF-29, design/payroll-addendum.md §7): the device export, read by Hudoor
 * into days and proposed deductions; the employee's explanation; the client's confirmation;
 * then the unpaid days and the capped fines become entries in the open payroll month.
 */
import type { PoolClient } from 'pg';
import { rng } from '../domain/rng.js';
import { evaluateDays, assess, proposeColumnMap, monthDays, PENALTY_TABLE, FINE_CAP_DAYS, type Punch, type Schedule } from '../domain/attendance.js';

type Q = PoolClient | { query: PoolClient['query'] };
const d10 = (v: any) => (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10);
const isoWeekday = (d: string) => { const w = new Date(`${d}T00:00:00Z`).getUTCDay(); return w === 0 ? 7 : w; };
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const mins = (t: string) => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m; };
const dmy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const ymd = (s: string) => { const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : s.trim().slice(0, 10); };

async function schedules(c: Q) {
  const rows = (await c.query(`SELECT m.person_id, s.code, s.days, to_char(s.start_time,'HH24:MI') st, to_char(s.end_time,'HH24:MI') en, s.grace_min FROM layer.schedule_members m JOIN layer.work_schedules s ON s.id=m.schedule_id`)).rows;
  return new Map<number, Schedule>(rows.map((r: any) => [r.person_id, { code: r.code, days: r.days, start: r.st, end: r.en, graceMin: r.grace_min }]));
}

/** The client's device export for the attendance month, as the device writes it: its own headers and formats. */
export async function deviceExport(c: Q) {
  const meta = (await c.query(`SELECT value FROM layer.meta WHERE key='attendance'`)).rows[0]?.value;
  if (!meta) return null;
  const sch = await schedules(c);
  const people = (await c.query(`SELECT p.id, p.person_number, wr.start_date, wr.end_date FROM hcm.persons p JOIN hcm.work_relationships wr ON wr.person_id=p.id WHERE wr.worker_type='E' AND wr.start_date <= $2 AND (wr.end_date IS NULL OR wr.end_date >= $1) ORDER BY p.person_number`, [meta.from, meta.to])).rows;
  const R = rng(20261018);
  const away = (await c.query(`SELECT person_id, to_char(start_date,'YYYY-MM-DD') s, to_char(end_date,'YYYY-MM-DD') e FROM hcm.absences WHERE status IN ('APPROVED','COMPLETED') AND start_date <= $2 AND end_date >= $1`, [meta.from, meta.to])).rows;
  const lines = ['Emp No.,Att. Date,Att. Time,In/Out,Terminal'];
  for (const p of people) {
    const s = sch.get(p.id); if (!s) continue;
    for (const day of monthDays(meta.from, meta.to)) {
      if (day < d10(p.start_date) || (p.end_date && day > d10(p.end_date)) || !s.days.includes(isoWeekday(day))) continue;
      // Nobody punches on a day of approved leave (or of unpaid leave: Hudoor finds no leave to cover it, so it reads as absent unless recorded).
      if (away.some((l: any) => l.person_id === p.id && l.s <= day && l.e >= day)) continue;
      if ((meta.absent as any[]).some((a) => a.personId === p.id && a.day === day)) continue;
      const late = (meta.lates[p.id] as any[] | undefined)?.find((l) => l.day === day);
      const inAt = mins(s.start) + (late ? s.graceMin + late.minutes : -R.int(1, 18));
      const outAt = mins(s.end) + R.int(0, 25);
      lines.push(`${p.person_number},${dmy(day)},${hhmm(inAt)},C/In,${meta.device}`);
      lines.push(`${p.person_number},${dmy(day)},${hhmm(outAt)},C/Out,${meta.device}`);
    }
  }
  const month = new Date(`${meta.from}T00:00:00Z`).toLocaleString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }).replace(' ', '-');
  return { fileName: `SCC_Attendance_${month}.csv`, csv: lines.join('\n') + '\n', rows: lines.length - 1, from: meta.from, to: meta.to };
}

export function headersOf(csv: string) { return csv.split(/\r?\n/)[0].split(',').map((h) => h.trim()); }
export const proposeMap = (csv: string) => proposeColumnMap(headersOf(csv));

/** Store the file's punches under a confirmed column map. */
export async function ingest(c: Q, o: { fileName: string; csv: string; map: Record<string, string | null>; by: string }) {
  const [head, ...rows] = o.csv.split(/\r?\n/).filter((l) => l.trim());
  const h = head.split(',').map((x) => x.trim());
  const col = (f: string) => (o.map[f] ? h.indexOf(o.map[f]!) : -1);
  const [ce, cd, ct, cdir, cdev] = ['employee', 'date', 'time', 'direction', 'device'].map(col);
  if (ce < 0 || cd < 0 || ct < 0) throw new Error('The column map needs the employee, the date and the time.');
  const byNumber = new Map((await c.query(`SELECT id, person_number FROM hcm.persons`)).rows.map((r: any) => [r.person_number, r.id]));
  const parsed = rows.map((l) => l.split(',')).map((x) => ({ code: x[ce].trim(), day: ymd(x[cd]), time: x[ct].trim().slice(0, 5), dir: cdir >= 0 && /out/i.test(x[cdir]) ? 'OUT' : 'IN', device: cdev >= 0 ? x[cdev].trim() : null }));
  const days = parsed.map((p) => p.day).sort();
  const up = (await c.query(`INSERT INTO layer.attendance_uploads (file_name, device, period_start, period_end, rows, column_map, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [o.fileName, parsed[0]?.device ?? null, `${days[0].slice(0, 7)}-01`, new Date(Date.UTC(Number(days[0].slice(0, 4)), Number(days[0].slice(5, 7)), 0)).toISOString().slice(0, 10), parsed.length, JSON.stringify(o.map), o.by])).rows[0].id as number;
  const unknown = new Set<string>();
  const vals: any[] = [];
  for (const p of parsed) { const pid = byNumber.get(p.code) ?? null; if (!pid) unknown.add(p.code); vals.push([up, pid, p.code, `${p.day} ${p.time}`, p.dir, p.device]); }
  for (let i = 0; i < vals.length; i += 500) {
    const chunk = vals.slice(i, i + 500);
    await c.query(`INSERT INTO layer.attendance_punches (upload_id, person_id, employee_code, at, direction, device) VALUES ${chunk.map((_, j) => `($${j * 6 + 1},$${j * 6 + 2},$${j * 6 + 3},$${j * 6 + 4},$${j * 6 + 5},$${j * 6 + 6})`).join(',')}`, chunk.flat());
  }
  return { uploadId: up, rows: parsed.length, people: new Set(parsed.map((p) => p.code)).size, unknown: [...unknown] };
}

async function wagesAndLeave(c: Q, from: string, to: string) {
  const wages = new Map<number, number>((await c.query(`SELECT person_id, SUM(amount)::float w FROM hcm.element_entries WHERE element_code IN ('BASIC','HOUSING','TRANSPORT','OTHER_ALW') AND effective_start <= $2 AND effective_end >= $1 GROUP BY 1`, [from, to])).rows.map((r: any) => [r.person_id, r.w]));
  const leave = (await c.query(`SELECT person_id, start_date, end_date, absence_number FROM hcm.absences WHERE status IN ('APPROVED','COMPLETED') AND type_code <> 'UNPAID' AND start_date <= $2 AND end_date >= $1`, [from, to])).rows
    .map((r: any) => ({ personId: r.person_id, start: d10(r.start_date), end: d10(r.end_date), ref: r.absence_number }));
  return { wages, leave };
}

/** Hudoor: the month, day by day, and each person's unpaid days and fine. Writes layer.attendance_days. */
export async function readUpload(c: Q, uploadId: number) {
  const up = (await c.query(`SELECT * FROM layer.attendance_uploads WHERE id=$1`, [uploadId])).rows[0];
  const from = d10(up.period_start), to = d10(up.period_end);
  const sch = await schedules(c);
  const people = (await c.query(`SELECT wr.person_id, wr.start_date, wr.end_date FROM hcm.work_relationships wr WHERE wr.worker_type='E' AND wr.start_date <= $2 AND (wr.end_date IS NULL OR wr.end_date >= $1)`, [from, to])).rows
    .filter((p: any) => sch.has(p.person_id)).map((p: any) => ({ personId: p.person_id, schedule: sch.get(p.person_id)!, from: d10(p.start_date), to: p.end_date ? d10(p.end_date) : null }));
  const punches: Punch[] = (await c.query(`SELECT person_id, to_char(at,'YYYY-MM-DD"T"HH24:MI') at, direction FROM layer.attendance_punches WHERE upload_id=$1 AND person_id IS NOT NULL`, [uploadId])).rows.map((r: any) => ({ personId: r.person_id, at: r.at, direction: r.direction }));
  const { wages, leave } = await wagesAndLeave(c, from, to);
  const days = evaluateDays({ start: from, end: to, people, punches, leave });
  const just = (await c.query(`SELECT person_id, day, justification, decision FROM layer.attendance_days WHERE upload_id=$1 AND justification IS NOT NULL`, [uploadId])).rows;
  const keep = new Map(just.map((j: any) => [`${j.person_id}:${d10(j.day)}`, j]));
  const excused = new Set(just.filter((j: any) => j.decision === 'EXCUSED').map((j: any) => `${j.person_id}:${d10(j.day)}`));
  const res = assess(days, wages, excused);
  await c.query(`DELETE FROM layer.attendance_days WHERE upload_id=$1`, [uploadId]);
  const fineOf = new Map(res.flatMap((r) => r.fines.map((f) => [`${r.personId}:${f.day}`, f.amount] as const)));
  const rows = days.filter((d) => d.scheduled || d.firstIn).map((d) => {
    const k = keep.get(`${d.personId}:${d.day}`) as any;
    return [uploadId, d.personId, d.day, d.scheduled, d.firstIn, d.lastOut, d.minutesLate, d.status, d.leaveRef, k?.justification ?? null, k?.decision ?? null, d.status === 'ABSENT' && !excused.has(`${d.personId}:${d.day}`) ? 1 : 0, fineOf.get(`${d.personId}:${d.day}`) ?? 0];
  });
  for (let i = 0; i < rows.length; i += 400) {
    const chunk = rows.slice(i, i + 400);
    await c.query(`INSERT INTO layer.attendance_days (upload_id, person_id, day, scheduled, first_in, last_out, minutes_late, status, leave_ref, justification, decision, unpaid_days, fine) VALUES ${chunk.map((_, j) => `(${Array.from({ length: 13 }, (__, k) => `$${j * 13 + k + 1}`).join(',')})`).join(',')}`, chunk.flat());
  }
  const noPunch = days.filter((d) => d.scheduled && !d.firstIn).length;
  const summary = {
    from, to, people: people.length,
    lates: days.filter((d) => d.status === 'LATE').length,
    noPunch, leaveCovered: days.filter((d) => d.status === 'LEAVE' && !d.firstIn).length, absences: days.filter((d) => d.status === 'ABSENT').length,
    fined: res.filter((r) => r.fine > 0).length, fines: Math.round(res.reduce((s, r) => s + r.fine, 0) * 100) / 100,
    unpaidDays: res.reduce((s, r) => s + r.unpaidDays, 0), unpaid: Math.round(res.reduce((s, r) => s + r.unpaidAmount, 0) * 100) / 100,
    capped: res.filter((r) => r.capped).map((r) => ({ personId: r.personId, before: r.fineBeforeCap, cap: r.cap })),
    excused: excused.size,
  };
  return { summary, people: res };
}

/** The employee's explanation for one day, heard before any fine (Art. 71). */
export async function justify(c: Q, personId: number, day: string, text: string) {
  const up = (await c.query(`SELECT id FROM layer.attendance_uploads WHERE status='READ' ORDER BY id DESC LIMIT 1`)).rows[0];
  if (!up) throw new Error('No attendance month is open for explanations.');
  const r = await c.query(`UPDATE layer.attendance_days SET justification=$4, justified_at=now() WHERE upload_id=$1 AND person_id=$2 AND day=$3 AND status IN ('LATE','ABSENT') RETURNING id`, [up.id, personId, day, text]);
  if (!r.rowCount) throw new Error('That day has nothing to explain.');
  // The case shows how many days have been explained, so HR operations sees it before confirming.
  const ex = (await c.query(`SELECT p.display_name AS name, to_char(d.day,'YYYY-MM-DD') AS day, d.minutes_late, d.status, d.justification AS text FROM layer.attendance_days d JOIN hcm.persons p ON p.id=d.person_id WHERE d.upload_id=$1 AND d.justification IS NOT NULL ORDER BY d.justified_at`, [up.id])).rows;
  await c.query(`UPDATE layer.requests SET result = jsonb_set(jsonb_set(result, '{attendance,explained}', to_jsonb($2::int)), '{attendance,explanations}', $3::jsonb) WHERE id = (SELECT request_id FROM layer.attendance_uploads WHERE id=$1) AND result ? 'attendance'`, [up.id, ex.length, JSON.stringify(ex)]);
  return { uploadId: up.id };
}

/**
 * The client's HR operations confirms: each explained day is excused unless it is named in `reject`;
 * the unpaid days and the fines (capped at five days' wage) are entered in the open payroll month.
 */
export async function confirmMonth(c: Q, uploadId: number, by: string, reject: string[] = []) {
  await c.query(`UPDATE layer.attendance_days SET decision = CASE WHEN (person_id::text || ':' || to_char(day,'YYYY-MM-DD')) = ANY($2::text[]) THEN 'DEDUCTED' ELSE 'EXCUSED' END WHERE upload_id=$1 AND justification IS NOT NULL`, [uploadId, reject]);
  const { summary, people } = await readUpload(c, uploadId);
  const per = (await c.query(`SELECT id, period_name, start_date, end_date FROM hcm.payroll_periods WHERE status='OPEN' ORDER BY start_date DESC LIMIT 1`)).rows[0];
  const ref = `Attendance ${summary.from.slice(0, 7)}`;
  await c.query(`DELETE FROM hcm.element_entries WHERE reference=$1`, [ref]);
  let n = 0;
  for (const p of people) {
    if (p.unpaidDays) await c.query(`INSERT INTO hcm.element_entries (entry_number, person_id, element_code, amount, effective_start, effective_end, source, reference) VALUES ($1,$2,'ABSENT_DAYS',$3,$4,$5,'TASAMA_HR',$6)`, [`DEMO-EE-ATT-${uploadId}-${p.personId}-A`, p.personId, p.unpaidDays, per.start_date, per.end_date, ref]);
    if (p.fine) await c.query(`INSERT INTO hcm.element_entries (entry_number, person_id, element_code, amount, effective_start, effective_end, source, reference) VALUES ($1,$2,'LATE_FINE',$3,$4,$5,'TASAMA_HR',$6)`, [`DEMO-EE-ATT-${uploadId}-${p.personId}-F`, p.personId, p.fine, per.start_date, per.end_date, ref]);
    if (p.unpaidDays || p.fine) n++;
  }
  await c.query(`UPDATE layer.attendance_uploads SET status='CONFIRMED' WHERE id=$1`, [uploadId]);
  return { summary, entries: n, period: per.period_name, by };
}

export const PENALTY = { table: PENALTY_TABLE, capDays: FINE_CAP_DAYS };
