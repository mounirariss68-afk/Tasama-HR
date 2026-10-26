/**
 * The checks on a draft run, each with what it means, who settles it and what they can do
 * (design/payroll-addendum.md §16).
 *
 *  - A check that stops the run is either Tasama's to fix (the law decides the answer: an
 *    advance instalment above 10% of the wage is rescheduled) or the client's (only the
 *    employer can register a person with GOSI or approve overtime above its cap). A client's
 *    check becomes a question in the client's HR operations inbox (WF-36), which Tasama can
 *    follow and remind.
 *  - Lines the client already confirmed (unpaid days, a fine cut at the five-day cap) are not
 *    checks: they carry who confirmed them, and nobody has to act.
 */
import type { PoolClient } from 'pg';
import { startCase } from '../engine/core.js';
import { gosiContribution } from '../domain/payroll/gosi.js';
import type { DraftRow } from './run.js';
import { client } from '../domain/rules.js';

type Q = PoolClient | { query: PoolClient['query'] };
const d10 = (v: any) => (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10);
const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const r2 = (n: number) => Math.round(n * 100) / 100;
const addMonths = (d: string, n: number) => { const x = new Date(`${d.slice(0, 7)}-01T00:00:00Z`); x.setUTCMonth(x.getUTCMonth() + n); return x.toISOString().slice(0, 10); };
const monthEnd = (d: string) => { const x = new Date(`${addMonths(d, 1)}T00:00:00Z`); x.setUTCDate(0); return x.toISOString().slice(0, 10); };
const day = (d: any) => new Date(`${d10(d)}T00:00:00Z`).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const monthName = (d: string) => new Date(`${d.slice(0, 7)}-01T00:00:00Z`).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export type Owner = { side: 'TASAMA' | 'CLIENT' | 'HR_OPS'; role: string; role_ar: string; name: string | null };
export type RunCheck = {
  person_id: number; name: string; name_ar: string; department: string;
  severity: 'BLOCK' | 'ASK';
  codes: string[];
  title: string;
  found: string;
  look: string;
  owner: Owner;
  status: string | null;
  case_ref: string | null;
  actions: { id: 'reschedule' | 'ask' | 'raise'; label: string }[];
};
export type Settled = { person_id: number; text: string; case_ref: string | null };

async function people(c: Q) { return (await c.query(`SELECT value FROM layer.meta WHERE key='people'`)).rows[0].value; }

/** The schedule an advance moves to: 10% of the wage a month until the balance is recovered (Art. 92). */
async function advancePlan(c: Q, personId: number, periodStart: string, wage: number) {
  const e = (await c.query(`SELECT * FROM hcm.element_entries WHERE person_id=$1 AND element_code='ADVANCE_REC' AND effective_end >= $2 ORDER BY effective_start LIMIT 1`, [personId, periodStart])).rows[0];
  if (!e) return null;
  const from = d10(e.effective_start) > periodStart ? d10(e.effective_start) : periodStart;
  const months = Math.round((Date.parse(`${d10(e.effective_end).slice(0, 7)}-01`) - Date.parse(`${from.slice(0, 7)}-01`)) / (30.44 * 864e5)) + 1;
  const balance = r2(Number(e.amount) * months);
  const limit = Math.floor(wage * 0.1 * 100) / 100;
  const full = Math.floor(balance / limit);
  const last = r2(balance - full * limit);
  return { entry: e, from, balance, limit, months: full + (last > 0 ? 1 : 0), full, last, instalment: Number(e.amount) };
}

/** The open WF-36 question for a person and a check this month, or the last answer. */
async function question(c: Q, period: string, personId: number, kind: string) {
  return (await c.query(
    `SELECT r.ref, r.status, r.updated_at, r.payload, COALESCE(w.display_name, CASE r.waiting_on_role WHEN 'TASAMA_HR_OPS' THEN 'Tasama HR operations' END) AS waiting_on,
            (SELECT a.reason FROM layer.approvals a WHERE a.request_id=r.id AND a.decision='REJECTED' ORDER BY a.decided_at DESC LIMIT 1) AS reason
       FROM layer.requests r LEFT JOIN hcm.persons w ON w.id=r.waiting_on_person_id
      WHERE r.workflow_id='WF-36' AND r.payload->>'period'=$1 AND (r.payload->>'person_id')::int=$2 AND r.payload->>'kind'=$3
      ORDER BY r.id DESC LIMIT 1`, [period, personId, kind])).rows[0] ?? null;
}

export async function runChecks(c: Q, draft: { period: { name: string; start: string; end: string }; rows: DraftRow[] }) {
  const pp = await people(c);
  const ops = (await c.query(`SELECT display_name FROM hcm.persons WHERE id=$1`, [pp.persona.payroll])).rows[0]?.display_name ?? null;
  const clientOps: Owner = { side: 'CLIENT', role: 'HR operations', role_ar: 'عمليات الموارد البشرية', name: ops };
  const tasama: Owner = { side: 'TASAMA', role: 'Tasama payroll', role_ar: 'رواتب تسامى', name: null };
  // design/payroll-ops-addendum.md 1.11: questions can go through Tasama HR operations; at clients whose contract
  // includes HR operations, Tasama HR operations registers GOSI and answers first.
  const hrOps = client().contract.services.includes('HR_OPS');
  const tasamaOps: Owner = { side: 'HR_OPS', role: 'Tasama HR operations', role_ar: 'عمليات الموارد البشرية في تسامى', name: 'Lama Al Dossary' };
  const askOrRaise = (askLabel: string) => (hrOps ? [{ id: 'raise' as const, label: 'Raise to Tasama HR Ops' }, { id: 'ask' as const, label: askLabel }] : [{ id: 'ask' as const, label: askLabel }, { id: 'raise' as const, label: 'Raise to Tasama HR Ops' }]);
  const checks: RunCheck[] = [];
  const settled: Settled[] = [];
  const att = (await c.query(`SELECT r.ref, r.closed_at, (SELECT pp2.display_name FROM layer.approvals a JOIN hcm.persons pp2 ON pp2.id=a.approver_person_id WHERE a.request_id=r.id AND a.decision='APPROVED' ORDER BY a.decided_at DESC LIMIT 1) AS by
      FROM layer.requests r WHERE r.workflow_id='WF-29' AND r.status='COMPLETED' ORDER BY r.id DESC LIMIT 1`)).rows[0];
  const log = (await c.query(`SELECT * FROM layer.run_check_log WHERE period_name=$1 ORDER BY at`, [draft.period.name])).rows;

  for (const r of draft.rows) {
    const codes = r.flags.map((f: any) => f.code);
    const base = { person_id: r.person_id, name: r.name, name_ar: r.name_ar, department: r.department };
    const wage = (r.lines as any[]).filter((l) => l.kind === 'EARNING' && ['basic', 'housing', 'transport', 'other'].includes(l.code)).reduce((s, l) => s + l.amount, 0);
    if (codes.includes('ADVANCE_CAP')) {
      const plan = await advancePlan(c, r.person_id, draft.period.start, wage);
      const f = r.flags.find((x: any) => x.code === 'ADVANCE_CAP');
      checks.push({
        ...base, severity: 'BLOCK', codes: codes.filter((x: string) => x === 'ADVANCE_CAP' || x === 'DEDUCTION_CAP'),
        title: plan ? `${r.name}'s advance is recovered at SAR ${fmt(plan.instalment)} a month, above the legal limit of SAR ${fmt(plan.limit)}` : `${r.name}'s advance instalment is above the legal limit`,
        found: `${f.text}.${codes.includes('DEDUCTION_CAP') ? ' With GOSI, the month\'s deductions are also above half the wage (Art. 93).' : ''}`,
        look: plan ? `SAR ${fmt(plan.balance)} is still owed. The law allows at most 10% of the wage a month, so the balance is recovered over ${plan.months} months instead of ${Math.round(plan.balance / plan.instalment)}. Nothing is lost; it takes longer.` : 'The instalment has to come down to 10% of the wage.',
        owner: tasama, status: null, case_ref: null,
        actions: plan ? [{ id: 'reschedule', label: `Recover SAR ${fmt(plan.limit)} a month from ${monthName(plan.from)}` }] : [],
      });
    } else if (codes.includes('DEDUCTION_CAP')) {
      checks.push({ ...base, severity: 'BLOCK', codes: ['DEDUCTION_CAP'], title: `${r.name}'s deductions are above half the wage`, found: r.flags.find((x: any) => x.code === 'DEDUCTION_CAP').text,
        look: 'One of the month\'s deductions has to move to next month so that at most half the wage is deducted (Art. 93).', owner: tasama, status: null, case_ref: null, actions: [] });
    }
    if (codes.includes('GOSI_NOT_REGISTERED')) {
      const f = r.flags.find((x: any) => x.code === 'GOSI_NOT_REGISTERED');
      const amount = Number(String(f.text).match(/([\d,]+\.\d{2})/)?.[1]?.replace(/,/g, '') ?? 0);
      const hire = (await c.query(`SELECT start_date FROM hcm.work_relationships WHERE person_id=$1 ORDER BY start_date DESC LIMIT 1`, [r.person_id])).rows[0]?.start_date;
      const q = await question(c, draft.period.name, r.person_id, 'GOSI_REGISTRATION');
      const open = q && ['WAITING', 'ESCALATED', 'RUNNING'].includes(q.status);
      checks.push({
        ...base, severity: 'BLOCK', codes: ['GOSI_NOT_REGISTERED'],
        title: `${r.name} is not registered with GOSI, so SAR ${fmt(amount)} a month is not being paid in`,
        found: `${r.name} joined on ${hire ? day(hire) : 'a date not on record'} and has no GOSI registration on the record. Without it, no contribution can be calculated for this month.`,
        look: hrOps ? `Tasama HR operations registers ${client().short}'s people with GOSI, in the client's GOSI account. Once it gives the registration date, the run calculates the contribution and the check clears.`
          : 'Only the employer can register a person with GOSI, in its own GOSI account. Once the client gives the registration date, the run calculates the contribution and the check clears.',
        owner: hrOps ? tasamaOps : clientOps,
        status: open ? `Asked on ${day(q.payload.asked_on ?? q.updated_at)}; waiting on ${q.waiting_on ?? ops}` : q?.status === 'REJECTED' ? `${ops} answered: not registered yet${q.reason ? ` (“${q.reason}”)` : ''}` : null,
        case_ref: q?.ref ?? null,
        actions: open ? [] : askOrRaise(q ? `Ask ${ops} again` : `Ask ${ops} to register ${r.name.split(' ')[0]}`),
      });
    }
    if (codes.includes('OVERTIME_CAP')) {
      const f = r.flags.find((x: any) => x.code === 'OVERTIME_CAP');
      const q = await question(c, draft.period.name, r.person_id, 'OVERTIME_HELD');
      const open = q && ['WAITING', 'ESCALATED', 'RUNNING'].includes(q.status);
      checks.push({
        ...base, severity: 'ASK', codes: ['OVERTIME_CAP'],
        title: `Overtime above the policy's monthly cap is held for ${r.name}`,
        found: `${f.text}.`,
        look: 'The client\'s policy caps overtime. Hours above the cap are paid only if the client approves them; otherwise they are not paid this month.',
        owner: clientOps,
        status: open ? `Asked on ${day(q.payload.asked_on ?? q.updated_at)}; waiting on ${q.waiting_on ?? ops}` : null,
        case_ref: q?.ref ?? null,
        actions: open ? [] : askOrRaise(`Ask ${ops} whether to pay them`),
      });
    }
    // Walkthrough addendum R22: GOSI accepts at most a 10% rise a year over 50; the wage is held and HR operations confirms it.
    if (codes.includes('GOSI_WAGE_CAP')) {
      const f = r.flags.find((x: any) => x.code === 'GOSI_WAGE_CAP');
      const g = r.lines.find((l: any) => l.code === 'gosi');
      checks.push({
        ...base, severity: 'ASK', codes: ['GOSI_WAGE_CAP'],
        title: `${r.name}'s raise is above the 10% a year GOSI accepts over 50, so the contributory wage is held`,
        found: `${f.text}.`,
        look: `GOSI contributes on the held wage${g ? ` (SAR ${fmt(g.amount)} employee share this month)` : ''}; the salary itself is paid in full. ${hrOps ? 'Tasama HR operations' : `${client().short}'s HR operations`} records the wage GOSI accepted; the rest counts from next year.`,
        owner: hrOps ? tasamaOps : clientOps, status: null, case_ref: null, actions: [],
      });
    }
    // Already settled by the client: who confirmed, and where.
    if ((codes.includes('ABSENCE') || codes.includes('FINE_CAP')) && att) {
      settled.push({ person_id: r.person_id, text: `Attendance confirmed by ${att.by ?? 'HR operations'} on ${d10(att.closed_at)}`, case_ref: att.ref });
    }
  }
  const fixed = log.map((l: any) => ({ person_id: l.person_id, code: l.code, action: l.action, by: l.by_name, summary: l.summary, at: l.at, name: draft.rows.find((r) => r.person_id === l.person_id)?.name ?? null }));
  return { checks, settled, fixed };
}

/** Tasama's fix for an advance above 10% of the wage: the same balance, recovered at the legal limit. */
export async function reschedule(c: PoolClient, draft: { period: { name: string; start: string }; rows: DraftRow[] }, personId: number, by: string) {
  const r = draft.rows.find((x) => x.person_id === personId);
  if (!r || !r.flags.some((f: any) => f.code === 'ADVANCE_CAP')) throw new Error('This advance is already within the limit.');
  const wage = (r.lines as any[]).filter((l) => l.kind === 'EARNING' && ['basic', 'housing', 'transport', 'other'].includes(l.code)).reduce((s, l) => s + l.amount, 0);
  const plan = await advancePlan(c, personId, draft.period.start, wage);
  if (!plan) throw new Error('No advance on the record for this person.');
  const ref = plan.entry.reference ?? null;
  const n = (await c.query(`SELECT count(*)::int n FROM hcm.element_entries WHERE reference=$1`, [ref])).rows[0].n;
  // Close the old schedule before this month; the new one starts this month.
  if (d10(plan.entry.effective_start) < plan.from) await c.query(`UPDATE hcm.element_entries SET effective_end=$2 WHERE id=$1`, [plan.entry.id, d10(new Date(Date.parse(plan.from) - 864e5))]);
  else await c.query(`DELETE FROM hcm.element_entries WHERE id=$1`, [plan.entry.id]);
  const lastFull = monthEnd(addMonths(plan.from, plan.full - 1));
  await c.query(`INSERT INTO hcm.element_entries (entry_number, person_id, element_code, amount, effective_start, effective_end, source, reference) VALUES ($1,$2,'ADVANCE_REC',$3,$4,$5,'TASAMA',$6)`,
    [`${ref ?? 'ADV'}-R${n + 1}`, personId, plan.limit, plan.from, lastFull, ref]);
  if (plan.last > 0) {
    const m = addMonths(plan.from, plan.full);
    await c.query(`INSERT INTO hcm.element_entries (entry_number, person_id, element_code, amount, effective_start, effective_end, source, reference) VALUES ($1,$2,'ADVANCE_REC',$3,$4,$5,'TASAMA',$6)`,
      [`${ref ?? 'ADV'}-R${n + 2}`, personId, plan.last, m, monthEnd(m), ref]);
  }
  const summary = `${by} rescheduled ${r.name}'s advance: SAR ${fmt(plan.balance)} recovered at SAR ${fmt(plan.limit)} a month over ${plan.months} months, from ${monthName(plan.from)} (Art. 92).`;
  await c.query(`INSERT INTO layer.run_check_log (period_name, person_id, code, action, by_name, summary) VALUES ($1,$2,'ADVANCE_CAP','RESCHEDULED',$3,$4)`, [draft.period.name, personId, by, summary]);
  const pp = await people(c);
  await c.query(`INSERT INTO layer.notifications (person_id, title, title_ar, body, link) VALUES ($1,$2,$3,$4,NULL)`,
    [pp.persona.payroll, `${r.name}'s advance recovery changed to SAR ${fmt(plan.limit)} a month`, `تغيّر استرداد سلفة ${r.name_ar}`, `Tasama payroll: ${summary} The previous instalment of SAR ${fmt(plan.instalment)} was above the legal limit.`]);
  return { summary, plan };
}

/** A client's check becomes a question in the client's HR operations inbox. */
export async function ask(c: PoolClient, draft: { period: { name: string; start: string; end: string }; rows: DraftRow[] }, personId: number, by: string, clientShort: string, via: 'CLIENT' | 'HR_OPS' = 'CLIENT') {
  const r = draft.rows.find((x) => x.person_id === personId);
  if (!r) throw new Error('No such person in this run.');
  const kind = r.flags.some((f: any) => f.code === 'GOSI_NOT_REGISTERED') ? 'GOSI_REGISTRATION' : r.flags.some((f: any) => f.code === 'OVERTIME_CAP') ? 'OVERTIME_HELD' : null;
  if (!kind) throw new Error('Nothing to ask the client about for this person.');
  const pp = await people(c);
  const f = r.flags.find((x: any) => x.code === (kind === 'GOSI_REGISTRATION' ? 'GOSI_NOT_REGISTERED' : 'OVERTIME_CAP'));
  const asked_on = new Date().toISOString().slice(0, 10);
  const payload: Record<string, any> = { kind, period: draft.period.name, person_id: personId, person_name: r.name, asked_by: by, asked_on, finding: f.text, client: clientShort, via };
  if (kind === 'OVERTIME_HELD') {
    const m = String(f.text).match(/^(\d+(?:\.\d+)?) h above the policy's (\d+)-hour .*worth ([\d,]+\.\d{2})/);
    if (m) Object.assign(payload, { held_hours: Number(m[1]), cap: Number(m[2]), held_amount: Number(m[3].replace(/,/g, '')) });
  }
  const title = kind === 'GOSI_REGISTRATION' ? 'GOSI registration' : 'Held overtime';
  const title_ar = kind === 'GOSI_REGISTRATION' ? 'التسجيل في التأمينات الاجتماعية' : 'ساعات العمل الإضافي المعلّقة';
  const k = await startCase(c, { workflowId: 'WF-36', type: kind, title, title_ar, requester: pp.persona.payroll, subject: personId, channel: 'FORM', payload });
  await c.query(`INSERT INTO layer.run_check_log (period_name, person_id, code, action, by_name, summary, request_id) VALUES ($1,$2,$3,'ASKED',$4,$5,$6)`,
    [draft.period.name, personId, f.code, by, `${by} ${via === 'HR_OPS' ? 'raised to Tasama HR operations' : 'asked HR operations'} ${kind === 'GOSI_REGISTRATION' ? `for ${r.name}'s GOSI registration` : `whether to pay ${r.name}'s held overtime`}.`, k.id]);
  return k;
}

/** WF-36 apply: the client's answer becomes entries in the open month. */
export async function applyAnswer(c: PoolClient, req: { id: number; payload: any }, approverName: string) {
  const p = req.payload;
  // An issue found when the client was taken on (design/payroll-addendum.md §19): the answer is recorded for Tasama.
  if (p.kind === 'ONBOARDING_ISSUE') {
    const note = (await c.query(`SELECT reason FROM layer.approvals WHERE request_id=$1 AND decision='APPROVED' ORDER BY decided_at DESC LIMIT 1`, [req.id])).rows[0]?.reason;
    return `${approverName} answered Tasama on ${p.person_name}${note ? `: ${note}` : '.'}`;
  }
  // A salary the bank returned (design/payroll-addendum.md §20): the new IBAN goes on the record and the line is paid again.
  if (p.kind === 'PAYMENT_RETURNED') {
    const { correctIban } = await import('./payments.js');
    const r = await correctIban(c, p, approverName);
    await c.query(`UPDATE layer.requests SET result = result || $2::jsonb WHERE id=$1`, [req.id, JSON.stringify({ followon: r.ref })]);
    return `${approverName} gave ${p.person_name}'s new IBAN at ${r.bank}; Tahweel opened the follow-up payment for SAR ${fmt(Number(p.amount))}.`;
  }
  const per = (await c.query(`SELECT * FROM hcm.payroll_periods WHERE status='OPEN' ORDER BY start_date DESC LIMIT 1`)).rows[0];
  const ps = d10(per.start_date);
  if (p.kind === 'GOSI_REGISTRATION') {
    const on = String(p.registered_on ?? ps).slice(0, 10);
    const person = (await c.query(`SELECT is_saudi FROM hcm.persons WHERE id=$1`, [p.person_id])).rows[0];
    const wage = (await c.query(`SELECT COALESCE(SUM(amount),0)::float s FROM hcm.element_entries WHERE person_id=$1 AND element_code IN ('BASIC','HOUSING') AND effective_start <= $2 AND effective_end >= $2`, [p.person_id, ps])).rows[0].s;
    // A first registration with an earlier employer stands: it decides the GOSI group, not this date.
    await c.query(`INSERT INTO hcm.gosi_registrations (person_id, first_registered, system, source) VALUES ($1,$2,$3,'THIS_EMPLOYER') ON CONFLICT (person_id) DO NOTHING`, [p.person_id, on, on >= '2024-07-03' ? 'NEW' : 'LEGACY']);
    const first = d10((await c.query(`SELECT first_registered FROM hcm.gosi_registrations WHERE person_id=$1`, [p.person_id])).rows[0].first_registered);
    const g = gosiContribution(wage, person.is_saudi, first, d10(per.end_date));
    const n = (await c.query(`SELECT count(*)::int n FROM hcm.element_entries WHERE person_id=$1`, [p.person_id])).rows[0].n;
    if (g.employee > 0) await c.query(`INSERT INTO hcm.element_entries (entry_number, person_id, element_code, amount, effective_start, source, reference) VALUES ($1,$2,'GOSI_EE',$3,$4,'TASAMA',$5)`, [`GOSI-${p.person_id}-${n + 1}`, p.person_id, g.employee, ps, `Registered ${on}`]);
    await c.query(`INSERT INTO hcm.element_entries (entry_number, person_id, element_code, amount, effective_start, source, reference) VALUES ($1,$2,'GOSI_ER',$3,$4,'TASAMA',$5)`, [`GOSI-${p.person_id}-${n + 2}`, p.person_id, g.employer, ps, `Registered ${on}`]);
    const summary = `${approverName} gave ${p.person_name}'s GOSI registration date, ${day(on)}; the run now calculates SAR ${fmt(g.employee + g.employer)} a month.`;
    await c.query(`INSERT INTO layer.run_check_log (period_name, person_id, code, action, by_name, summary, request_id) VALUES ($1,$2,'GOSI_NOT_REGISTERED','ANSWERED',$3,$4,$5)`, [p.period, p.person_id, approverName, summary, req.id]);
    return summary;
  }
  // OVERTIME_HELD: the held hours leave the capped figure; paid as their own earning if approved.
  const n = (await c.query(`SELECT count(*)::int n FROM hcm.element_entries WHERE person_id=$1`, [p.person_id])).rows[0].n;
  await c.query(`INSERT INTO hcm.element_entries (entry_number, person_id, element_code, amount, effective_start, effective_end, source, reference) VALUES ($1,$2,'OT_HOURS',$3,$4,$5,'TASAMA','Held hours settled')`, [`OTH-${p.person_id}-${n + 1}`, p.person_id, -Number(p.held_hours ?? 0), ps, d10(per.end_date)]);
  if (p.pay_held) await c.query(`INSERT INTO hcm.element_entries (entry_number, person_id, element_code, amount, effective_start, effective_end, source, reference) VALUES ($1,$2,'OVERTIME',$3,$4,$5,'TASAMA','Held overtime approved by the client')`, [`OTP-${p.person_id}-${n + 2}`, p.person_id, Number(p.held_amount ?? 0), ps, d10(per.end_date)]);
  const summary = `${approverName} ${p.pay_held ? `approved paying ${p.person_name}'s ${p.held_hours} held overtime hours (SAR ${fmt(Number(p.held_amount ?? 0))})` : `decided ${p.person_name}'s ${p.held_hours} held overtime hours are not paid`}.`;
  await c.query(`INSERT INTO layer.run_check_log (period_name, person_id, code, action, by_name, summary, request_id) VALUES ($1,$2,'OVERTIME_CAP','ANSWERED',$3,$4,$5)`, [p.period, p.person_id, approverName, summary, req.id]);
  return summary;
}
