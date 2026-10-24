/**
 * Amin — Compliance Sentinel (A0: observes and alerts, never acts).
 */
import type { PoolClient } from 'pg';
import { read, type Ctx } from '../hcm/connector.js';
import { addDays, client, daysBetween, iso, pol } from '../domain/rules.js';
import { now } from '../clock.js';

export async function scan(c: PoolClient, asOf: string) {
  const ctx: Ctx = { c, actor: 'amin' };
  const horizon = iso(addDays(asOf, 60));
  const people = await read(ctx, 'workers', 'expand=assignments&fields=NationalIdExpiry,IqamaExpiry,PassportExpiry', 'Daily compliance scan', async () =>
    (await c.query(`SELECT p.id, p.person_number, p.display_name, p.display_name_ar, p.is_saudi, p.national_id_expiry, p.iqama_expiry, p.passport_expiry,
                           a.probation_end_date, a.probation_status, a.contract_end_date
                      FROM hcm.persons p JOIN hcm.work_relationships wr ON wr.person_id=p.id
                      JOIN LATERAL (SELECT * FROM hcm.assignments a WHERE a.person_id=p.id ORDER BY effective_start DESC LIMIT 1) a ON true
                     WHERE wr.worker_type='E' AND (wr.end_date IS NULL OR wr.end_date >= $1)`, [asOf])).rows);
  const alerts: any[] = [];
  let n = 1;
  const push = (a: any) => alerts.push({ ref: `DEMO-ALR-${String(n++).padStart(4, '0')}`, created_at: now(), status: 'OPEN', ...a });
  // Renewals are Tasama HR operations' work where the client's contract includes HR operations (design/hr-ops-addendum.md, pass 3).
  const hrOwner = client().contract.services.includes('HR_OPS') ? 'TASAMA_HR_OPS' : 'PAYROLL';
  for (const p of people) {
    const sev = (d: string) => { const left = daysBetween(asOf, d); return left <= 14 ? 'URGENT' : left <= 30 ? 'ACTION' : 'WATCH'; };
    // Expatriates: the iqama (iqama_expiry, falling back to the ID on file). Saudis: the national ID.
    const iqama = p.is_saudi ? null : (p.iqama_expiry ?? p.national_id_expiry);
    if (iqama && iqama <= horizon) push({ kind: 'IQAMA_EXPIRY', severity: sev(iqama), person_id: p.id, title: `Iqama expires ${iqama}`, title_ar: `تنتهي الإقامة ${iqama}`, detail: `${p.display_name}: renew through Muqeem at least 30 days ahead (CCHI medical cover active, work permit and iqama fees paid). An expired iqama blocks salary payment through Mudad and exit/re-entry visas.`, due_date: iqama, owner_role: hrOwner });
    if (p.is_saudi && p.national_id_expiry && p.national_id_expiry <= horizon) push({ kind: 'NATIONAL_ID_EXPIRY', severity: sev(p.national_id_expiry), person_id: p.id, title: `National ID expires ${p.national_id_expiry}`, title_ar: `تنتهي بطاقة الهوية الوطنية ${p.national_id_expiry}`, detail: `${p.display_name}: ask the employee to renew through Absher and update the HRMS record.`, due_date: p.national_id_expiry, owner_role: hrOwner });
    if (p.passport_expiry && p.passport_expiry <= iso(addDays(asOf, 180))) push({ kind: 'PASSPORT_EXPIRY', severity: daysBetween(asOf, p.passport_expiry) <= 60 ? 'ACTION' : 'WATCH', person_id: p.id, title: `Passport expires ${p.passport_expiry}`, title_ar: `ينتهي جواز السفر ${p.passport_expiry}`, detail: p.is_saudi ? `${p.display_name}: renew before any business travel.` : `${p.display_name}: a passport with less than 6 months validity blocks iqama renewal and exit/re-entry visas.`, due_date: p.passport_expiry, owner_role: hrOwner });
    if (p.probation_status === 'IN_PROBATION' && p.probation_end_date <= iso(addDays(asOf, 30))) push({ kind: 'PROBATION_DUE', severity: sev(p.probation_end_date), person_id: p.id, title: `Probation ends ${p.probation_end_date}`, title_ar: `تنتهي فترة التجربة ${p.probation_end_date}`, detail: `${p.display_name}: the manager must confirm or end employment before this date. Probation is ${pol().probationDays} days; it can be extended only by written agreement and never beyond 180 days in total (Art. 53).`, due_date: p.probation_end_date, owner_role: 'HRBP' });
    if (p.contract_end_date && p.contract_end_date <= iso(addDays(asOf, 30))) push({ kind: 'CONTRACT_RENEWAL', severity: sev(p.contract_end_date), person_id: p.id, title: `Fixed-term contract ends ${p.contract_end_date}`, title_ar: `ينتهي العقد محدد المدة ${p.contract_end_date}`, detail: `${p.display_name}: renew or end the contract on Qiwa before the end date.`, due_date: p.contract_end_date, owner_role: hrOwner });
  }
  // Nitaqat counts every employee of the establishment, not only skilled roles.
  const sa = (await c.query(`SELECT COUNT(*) FILTER (WHERE p.is_saudi)::int AS saudi, COUNT(*)::int AS total
                                FROM hcm.persons p JOIN hcm.work_relationships wr ON wr.person_id=p.id
                               WHERE wr.worker_type='E' AND (wr.end_date IS NULL OR wr.end_date >= $1)`, [asOf])).rows[0];
  const cl = client(), nq = cl.nitaqat;
  const yr = asOf.slice(0, 4);
  const pct = sa.total ? (sa.saudi / sa.total) * 100 : 0;
  const reqPct = nq.requiredPct * 100;
  const met = pct >= reqPct;
  push({ kind: 'SAUDIZATION', severity: met ? 'INFO' : 'ACTION', person_id: null, title: `Saudization ${pct.toFixed(1)}% of all employees; Nitaqat requires ${reqPct.toFixed(0)}% (band: ${nq.band})`, title_ar: `نسبة التوطين ${pct.toFixed(1)}% من جميع الموظفين؛ يتطلب نطاقات ${reqPct.toFixed(0)}% (النطاق: ${nq.band})`, detail: `${sa.saudi} Saudi nationals among ${sa.total} employees (${nq.activity}). ${met ? 'Requirement met' : 'Below the requirement'}; a Saudi hire counts only once registered with GOSI and paid through Mudad.`, due_date: `${yr}-12-31`, owner_role: 'CHRO' });
  const open = (await c.query(`SELECT * FROM hcm.payroll_periods WHERE status='OPEN' ORDER BY start_date LIMIT 1`)).rows[0];
  // Payments (design/payroll-addendum.md §20): a returned salary not yet paid again, and a paid month Mudad has not acknowledged.
  const pays = (await c.query(`SELECT p.period_name, p.mudad_state, p.state, to_char(p.value_date,'YYYY-MM-DD') vd,
      (SELECT count(*)::int FROM layer.payment_lines l WHERE l.payment_id=p.id AND l.status='FAILED') failed FROM layer.payments p WHERE p.kind='REGULAR' AND p.state IN ('PAID','PART_FAILED')`).catch(() => ({ rows: [] as any[] }))).rows;
  for (const p of pays) {
    if (p.failed) push({ kind: 'PAYMENT_RETURNED', severity: 'ACTION', person_id: null, title: `${p.failed} ${p.period_name} ${p.failed === 1 ? 'salary was' : 'salaries were'} returned by the bank and not paid again yet`, title_ar: `${p.failed} من رواتب ${p.period_name} أعادها البنك ولم تُصرف بعد`, detail: 'Tasama HR operations enters the new IBAN from the bank letter; Tahweel pays it in a follow-up file.', due_date: p.vd, owner_role: 'TASAMA_HR_OPS' });
    if (p.mudad_state !== 'ACKNOWLEDGED') push({ kind: 'MUDAD_PENDING', severity: 'WATCH', person_id: null, title: `${p.period_name} WPS file is paid but not yet acknowledged by Mudad`, title_ar: `ملف حماية الأجور لشهر ${p.period_name} صُرف ولم تؤكده مدد بعد`, detail: 'Tahweel uploads the bank\'s signed WPS file to Mudad and keeps the acknowledgement.', due_date: p.vd, owner_role: 'TASAMA_PAYROLL' });
  }
  const acked = open ? (await c.query(`SELECT 1 FROM layer.payments WHERE period_name=$1 AND kind='REGULAR' AND mudad_state='ACKNOWLEDGED'`, [open.period_name]).catch(() => ({ rows: [] as any[] }))).rows.length : 0;
  if (open && !acked) push({ kind: 'MUDAD_DUE', severity: 'WATCH', person_id: null, title: `${open.period_name} salaries due through Mudad by ${open.pay_date}`, title_ar: `رواتب ${open.period_name} مستحقة عبر منصة مدد بحلول ${open.pay_date}`, detail: `Cut-off ${open.cutoff_date}. Upload the wage file to Mudad (wage protection) and pay by the due date; Mudad reports late or unmatched payments for ${cl.short} to MHRSD.`, due_date: open.pay_date, owner_role: 'TASAMA_PAYROLL' });
  await c.query(`DELETE FROM layer.alerts WHERE status='OPEN'`);
  for (const a of alerts) {
    await c.query(`INSERT INTO layer.alerts (ref, kind, severity, person_id, title, title_ar, detail, due_date, owner_role, status, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (ref) DO NOTHING`,
      [a.ref, a.kind, a.severity, a.person_id, a.title, a.title_ar, a.detail, a.due_date, a.owner_role, a.status, a.created_at]);
  }
  await c.query(`INSERT INTO layer.trail (request_id, at, actor_type, actor_id, actor_name, act, autonomy, summary, summary_ar) VALUES (NULL,$1,'AGENT','amin','Amin','CHECK','A0',$2,$3)`,
    [now(), `Daily scan: ${people.length} workers checked, ${alerts.length} alerts raised.`, `الفحص اليومي: ${people.length} موظفاً، ${alerts.length} تنبيهاً.`]);
  return alerts.length;
}
