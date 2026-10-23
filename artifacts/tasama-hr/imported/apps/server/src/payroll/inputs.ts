/**
 * The month's changes per client, as Wared lists them (design/payroll-addendum.md §17, WF-27).
 *
 *  - What came through approved cases and HR events arrives confirmed: joiners, leavers,
 *    salary changes, unpaid leave, advances, approved overtime.
 *  - What only the client can send stays expected until its HR operations confirms it,
 *    with last month's figure as Wared's suggestion: overtime hours from the shift teams,
 *    and at Saudi Coffee the attendance month.
 *  - A change entered after the cut-off moves to next month as back pay. An approved run
 *    never reopens.
 */
import type { PoolClient } from 'pg';
import { client } from '../domain/rules.js';

type Q = PoolClient | { query: PoolClient['query'] };
const d10 = (v: any) => (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10);
const fmt = (n: number) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
const day = (d: any) => new Date(`${d10(d)}T00:00:00Z`).toLocaleString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
export const monthWord = (period: string) => new Date(`${period}-01T00:00:00Z`).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
export const nextPeriod = (period: string) => { const d = new Date(`${period}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 7); };

export async function openPeriod(c: Q) {
  const p = (await c.query(`SELECT * FROM hcm.payroll_periods WHERE status='OPEN' ORDER BY start_date DESC LIMIT 1`)).rows[0];
  if (!p) return null;
  return { id: p.id, name: p.period_name as string, start: d10(p.start_date), end: d10(p.end_date), cutoff: d10(p.cutoff_date), pay: d10(p.pay_date) };
}

type Line = { person_id: number | null; kind: string; label: string; amount?: number | null; quantity?: number | null; suggested?: number | null; effective?: string | null; source: string; state: string; ref?: string | null; note?: string | null };

/** Everything that already reached the master for the month, confirmed at the source. */
export async function fromMaster(c: Q, per: { start: string; end: string }): Promise<Line[]> {
  const out: Line[] = [];
  const [ps, pe] = [per.start, per.end];
  for (const r of (await c.query(`SELECT person_id, worker_type, start_date FROM hcm.work_relationships WHERE start_date BETWEEN $1 AND $2`, [ps, pe])).rows)
    out.push({ person_id: r.person_id, kind: 'JOINER', label: `Joins on ${day(r.start_date)}${r.worker_type === 'P' ? ': contract not yet signed' : ''}`, effective: d10(r.start_date), source: 'HIRING', state: r.worker_type === 'P' ? 'EXPECTED' : 'CONFIRMED' });
  for (const r of (await c.query(`SELECT person_id, COALESCE(last_working_day, end_date) AS last FROM hcm.work_relationships WHERE COALESCE(last_working_day, end_date) BETWEEN $1 AND $2`, [ps, pe])).rows)
    out.push({ person_id: r.person_id, kind: 'LEAVER', label: `Last working day ${day(r.last)}`, effective: d10(r.last), source: 'HRMS_EVENT', state: 'CONFIRMED' });
  for (const r of (await c.query(`SELECT s.person_id, s.date_from, s.basic, s.action_code, (SELECT p.basic FROM hcm.salaries p WHERE p.person_id=s.person_id AND p.date_from < s.date_from ORDER BY p.date_from DESC LIMIT 1) AS before
      FROM hcm.salaries s WHERE s.date_from BETWEEN $1 AND $2 AND s.action_code <> 'HIRE'`, [ps, pe])).rows)
    out.push({ person_id: r.person_id, kind: 'SALARY_CHANGE', label: `Basic ${r.before ? `SAR ${fmt(r.before)} → ` : ''}SAR ${fmt(r.basic)} from ${day(r.date_from)}`, amount: r.before ? Number(r.basic) - Number(r.before) : null, effective: d10(r.date_from), source: 'HRMS_EVENT', state: 'CONFIRMED' });
  for (const r of (await c.query(`SELECT person_id, absence_number, GREATEST(start_date,$1::date) s, LEAST(end_date,$2::date) e FROM hcm.absences WHERE type_code='UNPAID' AND status IN ('APPROVED','COMPLETED') AND start_date <= $2 AND end_date >= $1`, [ps, pe])).rows) {
    const n = Math.round((Date.parse(d10(r.e)) - Date.parse(d10(r.s))) / 864e5) + 1;
    out.push({ person_id: r.person_id, kind: 'UNPAID_LEAVE', label: `${n} ${n === 1 ? 'day' : 'days'} of unpaid leave`, quantity: n, effective: d10(r.s), source: 'LEAVE', state: 'CONFIRMED', ref: r.absence_number });
  }
  for (const r of (await c.query(`SELECT person_id, element_code, amount, effective_start, entry_number, reference FROM hcm.element_entries WHERE element_code IN ('ADVANCE_REC','OVERTIME','OT_HOURS') AND effective_start BETWEEN $1 AND $2 AND source <> 'TASAMA'`, [ps, pe])).rows) {
    const n = Number(r.amount);
    if (r.element_code === 'ADVANCE_REC') out.push({ person_id: r.person_id, kind: 'ADVANCE', label: `Advance recovery SAR ${fmt(n)} a month`, amount: n, effective: d10(r.effective_start), source: 'ADVANCE', state: 'CONFIRMED', ref: r.reference ?? r.entry_number });
    else if (r.element_code === 'OVERTIME') out.push({ person_id: r.person_id, kind: 'OVERTIME', label: `Approved overtime SAR ${fmt(n)}`, amount: n, effective: d10(r.effective_start), source: 'HRMS_EVENT', state: 'CONFIRMED', ref: r.reference ?? r.entry_number });
    else out.push({ person_id: r.person_id, kind: 'OT_HOURS', label: `${fmt(n)} overtime hours`, quantity: n, effective: d10(r.effective_start), source: 'HRMS_EVENT', state: 'CONFIRMED', ref: r.entry_number });
  }
  return out;
}

/** WF-27 prefill: the month's lines, written once per month. */
export async function prefill(c: PoolClient, requestId: number) {
  const per = (await openPeriod(c))!;
  const have = (await c.query(`SELECT count(*)::int n FROM layer.pay_inputs WHERE period_name=$1 AND source <> 'LATE_CHANGE'`, [per.name])).rows[0].n;
  if (!have) {
    const lines = await fromMaster(c, per);
    const meta = (await c.query(`SELECT value FROM layer.meta WHERE key='inputs'`)).rows[0]?.value ?? { expected: [] };
    for (const e of meta.expected ?? []) lines.push({ person_id: e.person_id, kind: 'OT_HOURS', label: 'Overtime hours for the month', suggested: e.hours, effective: per.start, source: 'PREFILLED', state: 'EXPECTED', note: `Last month: ${e.hours} h` });
    if (client().key === 'saudicoffee') {
      const ops = (await c.query(`SELECT value FROM layer.meta WHERE key='people'`)).rows[0].value.persona.payroll;
      lines.push({ person_id: null, kind: 'ATTENDANCE', label: 'The attendance month: unpaid days and lateness fines', effective: per.start, source: 'ATTENDANCE', state: 'EXPECTED', note: `${ops}` });
    }
    for (const l of lines) await c.query(`INSERT INTO layer.pay_inputs (period_name, person_id, kind, label, amount, quantity, suggested, effective, source, state, request_id, ref, note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [per.name, l.person_id, l.kind, l.label, l.amount ?? null, l.quantity ?? null, l.suggested ?? null, l.effective ?? null, l.source, l.state, requestId, l.ref ?? null, l.kind === 'ATTENDANCE' ? null : l.note ?? null]);
  } else await c.query(`UPDATE layer.pay_inputs SET request_id=$2 WHERE period_name=$1 AND request_id IS NULL AND source <> 'LATE_CHANGE'`, [per.name, requestId]);
  const rows = (await c.query(`SELECT state, kind FROM layer.pay_inputs WHERE period_name=$1 AND source <> 'LATE_CHANGE'`, [per.name])).rows;
  return { per, confirmed: rows.filter((r: any) => r.state === 'CONFIRMED').length, expected: rows.filter((r: any) => r.state === 'EXPECTED').length, expectedOt: rows.filter((r: any) => r.state === 'EXPECTED' && r.kind === 'OT_HOURS').length };
}

/** WF-27 apply for the month: the client's confirmed lines become entries in the open month. */
export async function applyMonth(c: PoolClient, requestId: number, by: string, edits: { values?: Record<string, number>; drop?: number[] }) {
  const per = (await openPeriod(c))!;
  const rows = (await c.query(`SELECT * FROM layer.pay_inputs WHERE request_id=$1 AND state='EXPECTED' AND kind='OT_HOURS'`, [requestId])).rows;
  let confirmed = 0, dropped = 0, hours = 0;
  for (const r of rows) {
    if ((edits.drop ?? []).map(Number).includes(Number(r.id))) { await c.query(`UPDATE layer.pay_inputs SET state='DROPPED', confirmed_by=$2, confirmed_at=now() WHERE id=$1`, [r.id, by]); dropped++; continue; }
    const q = Number(edits.values?.[r.id] ?? r.suggested ?? 0);
    const n = (await c.query(`SELECT count(*)::int n FROM hcm.element_entries WHERE person_id=$1`, [r.person_id])).rows[0].n;
    const num = `OTH-${per.name}-${r.person_id}-${n + 1}`;
    await c.query(`INSERT INTO hcm.element_entries (entry_number, person_id, element_code, amount, effective_start, effective_end, source, reference) VALUES ($1,$2,'OT_HOURS',$3,$4,$5,'RAFEEQ',$6)`, [num, r.person_id, q, per.start, per.end, `Confirmed by ${by}`]);
    await c.query(`UPDATE layer.pay_inputs SET state='CONFIRMED', quantity=$2, label=$3, confirmed_by=$4, confirmed_at=now(), ref=$5 WHERE id=$1`, [r.id, q, `${fmt(q)} overtime hours`, by, num]);
    confirmed++; hours += q;
  }
  return { confirmed, dropped, hours, per };
}

/** A change entered after the cut-off: what it is worth for the days of the closed month, paid next month. */
export async function priceLateChange(c: Q, personId: number, effective: string, per: { name: string; start: string; end: string }) {
  const rows = (await c.query(`SELECT * FROM hcm.salaries WHERE person_id=$1 ORDER BY date_from DESC LIMIT 2`, [personId])).rows;
  const [now_, before] = rows;
  const wage = (s: any) => Number(s.basic) + Number(s.housing) + Number(s.transport) + Number(s.other_allowance);
  const monthly = before ? wage(now_) - wage(before) : 0;
  const from = effective > per.start ? effective : per.start;
  const daysInMonth = Math.round((Date.parse(per.end) - Date.parse(per.start)) / 864e5) + 1;
  const days = Math.round((Date.parse(per.end) - Date.parse(from)) / 864e5) + 1;
  const backPay = Math.round(monthly * days / daysInMonth * 100) / 100;
  return { monthly, days, daysInMonth, backPay, before: before ? { basic: Number(before.basic), wage: wage(before) } : null, after: { basic: Number(now_.basic), wage: wage(now_) } };
}

/** The client's month, for the Inputs screen and the client's This month tab. */
export async function monthView(c: Q) {
  const per = await openPeriod(c);
  if (!per) return null;
  const rows = (await c.query(
    `SELECT i.*, p.display_name AS name, p.display_name_ar AS name_ar, r.ref AS case_ref, r.status AS case_status, r.type AS case_type
       FROM layer.pay_inputs i LEFT JOIN hcm.persons p ON p.id=i.person_id LEFT JOIN layer.requests r ON r.id=i.request_id
      WHERE i.period_name=$1 OR (i.source='LATE_CHANGE' AND i.period_name=$2) ORDER BY i.state, i.kind, i.id`, [per.name, nextPeriod(per.name)])).rows
    .map((r: any) => ({ ...r, amount: r.amount == null ? null : Number(r.amount), quantity: r.quantity == null ? null : Number(r.quantity), suggested: r.suggested == null ? null : Number(r.suggested) }));
  const month = (await c.query(`SELECT r.ref, r.status, r.waiting_on_person_id, w.display_name AS waiting_on, r.closed_at, r.created_at,
      (SELECT pp.display_name FROM layer.approvals a JOIN hcm.persons pp ON pp.id=a.approver_person_id WHERE a.request_id=r.id AND a.decision='APPROVED' ORDER BY a.decided_at DESC LIMIT 1) AS confirmed_by,
      (SELECT count(*)::int FROM layer.trail t WHERE t.request_id=r.id AND t.actor_id='wared' AND t.act='NOTIFY') AS reminders
      FROM layer.requests r LEFT JOIN hcm.persons w ON w.id=r.waiting_on_person_id WHERE r.workflow_id='WF-27' AND r.type='MONTH' AND r.payload->>'period'=$1 ORDER BY r.id DESC LIMIT 1`, [per.name])).rows[0] ?? null;
  const late = rows.filter((r: any) => r.source === 'LATE_CHANGE');
  const own = rows.filter((r: any) => r.source !== 'LATE_CHANGE');
  const count = (s: string) => own.filter((r: any) => r.state === s).length;
  return {
    period: per, month,
    counts: { confirmed: count('CONFIRMED'), expected: count('EXPECTED'), dropped: count('DROPPED'), next: late.filter((r: any) => r.period_name === per.name).length },
    rows: own, late: late.filter((r: any) => r.period_name === per.name),
  };
}

/** Wared's reminder before the cut-off: on the case, and in the person's notifications (A3, inside the contact rules). */
export async function remind(c: PoolClient, requestId: number, daysLeft: number) {
  const r = (await c.query(`SELECT r.*, (SELECT count(*)::int FROM layer.pay_inputs i WHERE i.request_id=r.id AND i.state='EXPECTED') AS expected FROM layer.requests r WHERE r.id=$1`, [requestId])).rows[0];
  if (!r || !['WAITING', 'ESCALATED'].includes(r.status) || !r.expected) return false;
  const who = (await c.query(`SELECT display_name FROM hcm.persons WHERE id=$1`, [r.waiting_on_person_id])).rows[0]?.display_name ?? 'HR operations';
  const when = daysLeft === 1 ? 'tomorrow' : `in ${daysLeft} days`;
  const text = `Reminded ${who}: ${r.expected} ${r.expected === 1 ? 'change is' : 'changes are'} still expected for ${monthWord(r.payload.period)}, and the cut-off is ${when}.`;
  const { now } = await import('../clock.js');
  await c.query(`INSERT INTO layer.trail (request_id, at, actor_type, actor_id, actor_name, act, autonomy, summary, summary_ar) VALUES ($1,$2,'AGENT','wared','Wared','NOTIFY','A3',$3,$4)`, [requestId, now(), text, 'تذكير قبل موعد الإقفال']);
  await c.query(`INSERT INTO layer.notifications (person_id, title, title_ar, body, link, created_at) VALUES ($1,$2,$3,$4,$5,$6)`,
    [r.waiting_on_person_id, `${r.expected} payroll ${r.expected === 1 ? 'change' : 'changes'} to confirm; cut-off ${when}`, 'تغييرات الرواتب بانتظار التأكيد', `Wared: ${monthWord(r.payload.period)}'s changes are listed on the case, with last month's figures as suggestions.`, `case:${r.ref}`, now()]);
  return true;
}
