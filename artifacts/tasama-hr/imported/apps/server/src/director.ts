/**
 * The Demo Director. A scenario is a list of steps; the presenter plays it
 * with Play / Pause / Step / Back. Each step names its trigger, runs a REAL
 * action through the same engine a person's click or an HRMS event would use,
 * and tells the app which client account, which persona and which screen to
 * show. The server returns what the step changed (trail entries, cases,
 * Tasama records) so the app can list it. Nothing is faked: where a step
 * takes a person's decision, it calls the same decide() a click calls and the
 * trail says "(decided by the scenario)".
 *
 * Adapted from the Jahiz Demo Director (QIB): same step model, same bar.
 */
import { pool, tx, withClient } from './db.js';
import { startCase, decide } from './engine/core.js';
import { letterName } from './engine/handlers.js';
import { iso, addDays, advanceMax, advanceMaxTerm, monthStart } from './domain/rules.js';
import { CLIENTS, clientByKey, DEFAULT_CLIENT } from './domain/clients.js';
import { setClock, now } from './clock.js';
import { raqeebScan, nudge, prepareInvoice, slaFor, tasamaTrail, monthLabel } from './tasama/service.js';
import { basiraScan } from './tasama/basira.js';
import { precheck } from './agents/hisab.js';
import { reasonLabel } from './domain/reasons.js';
import { policiesFor } from './domain/policies.js';
import { readHandbook } from './agents/nizam.js';
import { saveVersion, nextVersion, READINGS } from './payroll/policy.js';
import { draftRun } from './payroll/run.js';
import { deviceExport, proposeMap, ingest, justify as justifyDay } from './attendance/service.js';

type Ctx = { key: string; client: string; refs: Record<string, string>; P: Record<string, number>; T: Record<string, number>; out: Record<string, any> };
type Text = string | ((c: Ctx) => Promise<string> | string);
type Action =
  | { kind: 'show' }
  | { kind: 'overtime_inputs' }
  | { kind: 'justify_late'; text: string }
  | { kind: 'start'; starter: keyof typeof STARTERS; as: string }
  | { kind: 'decide'; ref: string; decision: 'APPROVED' | 'REJECTED'; reason: string; onBehalf?: boolean; followon?: string; edits?: Record<string, any> }
  | { kind: 'raqeeb_scan' }
  | { kind: 'nudge'; ref: string }
  | { kind: 'basira_scan' }
  | { kind: 'assign_pattern'; pattern: 'riyadhair' | 'cross'; staff: string; action: Text; days: number }
  | { kind: 'prepare_invoice' }
  | { kind: 'approve_invoice' };
/** One line in pane 01 of the Stage: what the person asking said, or what reached them. */
export type Line = { by: 'person' | 'agent' | 'system'; who: string; via?: string; text: string };
/** A record as the client's HRMS (or Tasama's own system) holds it, for pane 03. A representative screen. */
export type Rec = { system: string; title: string; fields: [string, string][] };
/** The one idea under the record in pane 03. */
type Focus = 'invoice' | 'document' | 'sla' | 'refusal' | { fact: Text };
type Step = {
  id: string; title: string; title_ar: string; trigger: string; persona: string; screen: string;
  open?: string;            // 'case:<name>' (a case the scenario created) or 'pattern:<riyadhair|cross>'
  action: Action; say: Text; say_ar?: Text;
  chat?: (c: Ctx) => Promise<Line[]> | Line[];
  focus?: Focus;
};
type Scenario = { key: string; level: 'client' | 'tasama'; client?: string; shape: string; shape_ar: string; title: string; title_ar: string; summary: string; summary_ar: string; steps: Step[]; record?: (c: Ctx) => Promise<Rec | null> };

// ------------------------------------------------------------------ helpers

async function people() {
  const meta = (await pool.query(`SELECT key, value FROM layer.meta WHERE key IN ('people','planted')`)).rows;
  return { P: meta.find((m: any) => m.key === 'people').value.persona as Record<string, number>, T: meta.find((m: any) => m.key === 'planted').value as Record<string, number> };
}
const nameOf = async (id: number) => ((await pool.query(`SELECT display_name FROM hcm.persons WHERE id=$1`, [id])).rows[0]?.display_name as string) ?? 'the employee';
const caseOf = async (ref: string) => (await pool.query(`SELECT r.*, w.display_name AS waiting_name FROM layer.requests r LEFT JOIN hcm.persons w ON w.id=r.waiting_on_person_id WHERE r.ref=$1`, [ref])).rows[0];
const divisionOf = async (id: number) => (await pool.query(`SELECT d.division FROM hcm.assignments a JOIN hcm.departments d ON d.id=a.department_id WHERE a.person_id=$1 ORDER BY a.effective_start DESC LIMIT 1`, [id])).rows[0]?.division as string | undefined;
const sar = (n: number) => `SAR ${Math.round(n).toLocaleString('en-US')}`;
async function patternOf(which: 'riyadhair' | 'cross') {
  return (await pool.query(which === 'cross'
    ? `SELECT * FROM tasama.patterns WHERE scope='CROSS_CLIENT' AND status <> 'CLOSED' ORDER BY id DESC LIMIT 1`
    : `SELECT * FROM tasama.patterns WHERE scope='CLIENT' AND 'riyadhair' = ANY(client_keys) AND reason_code='APPROVER_UNAVAILABLE' AND status <> 'CLOSED' ORDER BY id DESC LIMIT 1`)).rows[0];
}

/** Who decided: the room (the case was decided on screen before → was pressed) or the scenario. */
const by = (c: Ctx, ref: string) => (c.out[`hand_${ref}`] ? 'decided in the room' : 'decided by the scenario');
const subjectOf = async (ref: string | undefined) => (ref ? ((await caseOf(ref))?.subject_person_id as number | undefined) : undefined);
const fmtDate = (d: string | Date | null | undefined) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

// ------------------------------------------------------------------ pane 03: the record as the system holds it

/** The worker as the client's HRMS holds it. Fields an agent writes (a letter, a pay element, a booked leave) change between steps. */
async function workerRecord(c: Ctx, personId: number | undefined): Promise<Rec | null> {
  if (!personId) return null;
  const w = (await pool.query(`SELECT p.person_number, p.display_name, wr.worker_type, wr.start_date, wr.end_date, j.name AS job, g.code AS grade, d.name AS dept, m.display_name AS manager, s.basic, s.housing
      FROM hcm.persons p JOIN hcm.work_relationships wr ON wr.person_id=p.id
      LEFT JOIN LATERAL (SELECT * FROM hcm.assignments a WHERE a.person_id=p.id ORDER BY a.effective_start DESC LIMIT 1) a ON true
      LEFT JOIN hcm.jobs j ON j.id=a.job_id LEFT JOIN hcm.grades g ON g.id=a.grade_id LEFT JOIN hcm.departments d ON d.id=a.department_id LEFT JOIN hcm.persons m ON m.id=a.manager_person_id
      LEFT JOIN LATERAL (SELECT * FROM hcm.salaries s2 WHERE s2.person_id=p.id ORDER BY s2.date_from DESC LIMIT 1) s ON true
     WHERE p.id=$1 ORDER BY wr.start_date DESC LIMIT 1`, [personId])).rows[0];
  if (!w) return null;
  const year = Number(iso(now()).slice(0, 4));
  const al = (await pool.query(`SELECT (entitlement + carried_over - taken - booked) AS balance, booked FROM hcm.absence_balances WHERE person_id=$1 AND year=$2 AND type_code='ANNUAL'`, [personId, year])).rows[0];
  const doc = (await pool.query(`SELECT document_number, type, addressee, issued_at FROM hcm.document_records WHERE person_id=$1 ORDER BY issued_at DESC NULLS LAST, id DESC LIMIT 1`, [personId])).rows[0];
  const el = (await pool.query(`SELECT COUNT(*)::int n, (array_agg(t.name || ' ' || to_char(e.amount, 'FM999,999') ORDER BY e.id DESC))[1] AS last FROM hcm.element_entries e JOIN hcm.element_types t ON t.code=e.element_code WHERE e.person_id=$1 AND e.source <> 'HRMS' AND e.effective_end >= CURRENT_DATE`, [personId])).rows[0];
  const jr = (await pool.query(`SELECT template, status FROM hcm.journeys WHERE person_id=$1 ORDER BY id DESC LIMIT 1`, [personId])).rows[0];
  const status = w.worker_type === 'P' ? 'Pending worker' : w.end_date ? `Leaves ${fmtDate(w.end_date)}` : 'Active';
  const letter = doc ? `${String(doc.type).replace(/_/g, ' ').toLowerCase().replace(/^./, (x: string) => x.toUpperCase())}${doc.addressee ? ` for ${doc.addressee}` : ''}, ${fmtDate(doc.issued_at)}` : '—';
  return { system: clientByKey(c.client)!.hrmsLabel, title: 'Worker record', fields: [
    ['Worker', `${w.person_number} · ${w.display_name}`], ['Status', status], ['Job', `${w.job ?? '—'}${w.grade ? ` · grade ${w.grade}` : ''}`],
    ['Department', w.dept ?? '—'], ['Manager', w.manager ?? '—'], ['Started', fmtDate(w.start_date)],
    ['Basic and housing', w.basic != null ? `SAR ${Math.round(Number(w.basic)).toLocaleString('en-US')} + ${Math.round(Number(w.housing ?? 0)).toLocaleString('en-US')}` : '—'],
    ['Annual leave', al ? `${Number(al.balance)} days left${Number(al.booked) ? `, ${Number(al.booked)} booked` : ''}` : '—'],
    ['Latest letter', letter], ['Pay elements from the platform', el?.n ? `${el.n} · latest ${el.last}` : 'None'],
    ...(jr ? [['Journey', `${String(jr.template).toLowerCase().replace(/^./, (x: string) => x.toUpperCase())} · ${String(jr.status).replace(/_/g, ' ').toLowerCase()}`] as [string, string]] : []),
  ] };
}

async function requisitionRecord(c: Ctx, jobCode: string): Promise<Rec | null> {
  const rq = (await pool.query(`SELECT r.*, hm.display_name AS hm FROM hcm.requisitions r JOIN hcm.positions p ON p.id=r.position_id JOIN hcm.jobs j ON j.id=p.job_id JOIN hcm.persons hm ON hm.id=r.hiring_manager_id WHERE j.code=$1`, [jobCode])).rows[0];
  if (!rq) return null;
  const ph = (await pool.query(`SELECT phase, COUNT(*)::int n FROM hcm.applications WHERE requisition_id=$1 GROUP BY 1`, [rq.id])).rows as { phase: string; n: number }[];
  const n = (p: string[]) => ph.filter((x) => p.includes(x.phase)).reduce((a, x) => a + x.n, 0);
  const crit = (rq.criteria as any[]).filter((x) => x.kind === 'must').map((x) => x.label);
  return { system: clientByKey(c.client)!.hrmsLabel, title: 'Requisition', fields: [
    ['Requisition', `${rq.req_number} · ${rq.title}`], ['Status', String(rq.status).replace(/_/g, ' ').toLowerCase()], ['Hiring manager', rq.hm],
    ['Applicants', String(ph.reduce((a, x) => a + x.n, 0))], ['New, not yet screened', String(n(['NEW']))], ['Screened against the criteria', String(n(['SCREENING', 'SHORTLISTED']))],
    ['Must-have criteria', crit.join('; ') || '—'], ['Saudi priority', rq.saudi_priority ? 'Yes' : 'No'],
  ] };
}

async function payrollRecord(c: Ctx): Promise<Rec | null> {
  const per = (await pool.query(`SELECT * FROM hcm.payroll_periods WHERE status='OPEN' ORDER BY start_date LIMIT 1`)).rows[0];
  if (!per) return null;
  const k = c.refs.pc ? await caseOf(c.refs.pc) : null;
  const paid = (await pool.query(`SELECT COUNT(*)::int n FROM hcm.work_relationships WHERE worker_type='E' AND (end_date IS NULL OR end_date >= $1)`, [per.start_date])).rows[0].n;
  return { system: clientByKey(c.client)!.hrmsLabel, title: 'Payroll period', fields: [
    ['Period', per.period_name], ['Status', String(per.status).toLowerCase()], ['Cut-off', fmtDate(per.cutoff_date)], ['Pay date', fmtDate(per.pay_date)],
    ['Employees on the run', String(paid)], ['Release to Mudad', k ? (['WAITING', 'ESCALATED'].includes(k.status) ? 'Held until the blockers are cleared' : 'Cleared') : 'Not checked yet'],
  ] };
}

async function invoiceRecord(c: Ctx): Promise<Rec | null> {
  const number = c.out.inv?.number;
  const inv = number ? (await pool.query(`SELECT * FROM tasama.invoices WHERE number=$1`, [number])).rows[0] : null;
  const cl = clientByKey(c.client)!;
  if (!inv) return { system: 'Tasama finance', title: 'Client invoice', fields: [['Client', cl.name], ['Period', monthLabel(monthStart(now(), -1))], ['Invoice', 'Not prepared yet'], ['Price per employee', `SAR ${cl.contract.pepm}`]] };
  return { system: 'Tasama finance', title: 'Client invoice', fields: [
    ['Invoice', inv.number], ['Client', cl.name], ['Period', monthLabel(inv.period)], ['Employees billed', String(inv.headcount)],
    ['Base fee', sar(Number(inv.base_fee))], ['Service credit', Number(inv.credits) ? sar(Number(inv.credits)) : 'None due'], ['Total with VAT', sar(Number(inv.total))],
    ['Status', String(inv.status).toLowerCase()], ['Due', inv.due_at ? fmtDate(inv.due_at) : '—'],
  ] };
}

async function patternRecord(which: 'riyadhair' | 'cross'): Promise<Rec | null> {
  const p = await patternOf(which);
  if (!p) return { system: 'Tasama · Basira', title: 'Pattern', fields: [['Pattern', 'None open'], ['Last scan', 'Not run in this scenario yet']] };
  const owner = p.owner_staff_id ? (await pool.query(`SELECT name FROM tasama.staff WHERE id=$1`, [p.owner_staff_id])).rows[0]?.name : null;
  return { system: 'Tasama · Basira', title: 'Pattern', fields: [
    ['Pattern', `${p.ref} · ${p.title}`], ['Clients', (p.client_keys as string[]).map((k) => clientByKey(k)!.short).join(', ')],
    ['Rate, last two weeks', `${Number(p.current_rate)} per 100`], ['Baseline', `${Number(p.baseline_rate)} per 100`],
    ['Status', String(p.status).toLowerCase()], ['Owner', owner ?? '—'], ['Measure again', p.recheck_on ? fmtDate(p.recheck_on) : '—'],
  ] };
}

/** The client's payroll policy as Tasama HR holds it (pane 03 of scenario D1). */
async function policyRecord(c: Ctx): Promise<Rec | null> {
  const cl = clientByKey(c.client)!;
  const v = (await pool.query(`SELECT * FROM layer.policy_versions ORDER BY id DESC LIMIT 1`)).rows[0];
  if (!v) return null;
  const rules = (await pool.query(`SELECT * FROM layer.policy_rules WHERE version_id=$1`, [v.id])).rows;
  const r = (k: string) => rules.find((x: any) => x.key === k);
  const ot = r('overtime.rate');
  return { system: 'Tasama HR · Client policies', title: `${cl.short} payroll policy`, fields: [
    ['Version', `${v.version} · ${String(v.status).toLowerCase()}`], ['Read by', v.read_by], ['Rules', `${rules.length} on ${new Set(rules.map((x: any) => x.dim)).size} dimensions`],
    ['Overtime rate', ot ? `${ot.value}${ot.flag === 'UNCLEAR' && !ot.resolution ? ' (unclear)' : ''}` : '—'], ['Business trips', r('trips')?.resolution ?? r('trips')?.value ?? '—'],
    ['Activated by', v.activated_by ?? 'Waiting for the client'],
  ] };
}

// ------------------------------------------------------------------ scenario D2: the same overtime priced by two clients' policies

const D2_REF = 'Scenario D2: overtime';
const D2_HOURS = 48;
const D2_CLIENTS = ['redsea', 'saudicoffee'] as const;

/** D2 starts where D1 ends: Red Sea Global on its revised policy, overtime read as 1.5 × the full hourly wage. */
async function ensureRedSeaRevised() {
  await withClient('redsea', async () => {
    const v = (await pool.query(`SELECT r.value FROM layer.policy_versions v JOIN layer.policy_rules r ON r.version_id=v.id AND r.key='overtime.rate' WHERE v.status='ACTIVE'`)).rows[0];
    if (v && /full hourly/i.test(v.value)) return;
    const c = clientByKey('redsea')!;
    const { P } = await people();
    const chro = await nameOf(P.chro);
    const reading = await readHandbook(c, { revised: true, useClaude: false });
    const ch = READINGS['overtime.rate'].find((r) => r.code === 'GROSS_1_5')!;
    await tx(async (x) => {
      const version = await nextVersion(x);
      await x.query(`UPDATE layer.policy_versions SET status='SUPERSEDED' WHERE status='ACTIVE'`);
      const id = await saveVersion(x, reading, { version, status: 'ACTIVE', effective: iso(now()), activatedBy: chro });
      await x.query(`UPDATE layer.policy_rules SET value=$2, num=$3, resolution=$4 WHERE version_id=$1 AND key='overtime.rate'`, [id, ch.value, ch.num, `Read as ${ch.label.toLowerCase()}`]);
      for (const p of policiesFor(c, true)) for (const k of p.clauses) await x.query(`UPDATE layer.policy_clauses SET text_en=$2, text_ar=$3 WHERE id=$1`, [`${p.id} §${k.ref}`, k.en, k.ar]);
    });
  });
}

/** One settled employee per client with a similar salary, not one of the people other scenarios use. */
async function d2Person(key: string) {
  return withClient(key, async () => {
    const { T } = await people();
    const planted = Object.values(T).filter((v) => typeof v === 'number');
    return (await pool.query(
      `SELECT p.id, p.display_name FROM hcm.element_entries e JOIN hcm.persons p ON p.id=e.person_id JOIN hcm.work_relationships wr ON wr.person_id=p.id
        WHERE e.element_code='BASIC' AND e.effective_end='4712-12-31' AND wr.end_date IS NULL AND wr.worker_type='E' AND wr.start_date < $1::date - 60
          AND EXISTS (SELECT 1 FROM hcm.element_entries g WHERE g.person_id=p.id AND g.element_code='GOSI_ER' AND g.effective_end >= $1)
          AND NOT EXISTS (SELECT 1 FROM hcm.element_entries a WHERE a.person_id=p.id AND a.element_code IN ('ADVANCE_REC','OVERTIME') AND a.effective_end >= $1)
          AND NOT (p.id = ANY($2::int[]))
        ORDER BY abs(e.amount - 12000), p.id LIMIT 1`, [iso(now()), planted])).rows[0] as { id: number; display_name: string };
  });
}

/** The person's overtime line in the client's draft run: amount, hours paid, the rule and what is held. */
async function d2Line(key: string, personId: number) {
  return withClient(key, async () => {
    const d = await draftRun(pool);
    const r = d?.rows.find((x) => x.person_id === personId);
    const l = r?.lines.find((x: any) => x.code === 'overtime');
    const held = r?.flags.find((f: any) => f.code === 'OVERTIME_CAP');
    return { name: r?.name ?? '', amount: l?.amount ?? 0, rule: l?.rule ?? '', held: held?.text ?? null, hours: l ? Number(String(l.rule).split(' h')[0]) : 0 };
  });
}

async function overtimeRecord(c: Ctx): Promise<Rec | null> {
  const who = c.out.d2 as Record<string, { id: number; name: string }> | undefined;
  if (!who) return null;
  const fields: [string, string][] = [];
  for (const key of D2_CLIENTS) {
    const l = await d2Line(key, who[key].id);
    fields.push([`${clientByKey(key)!.short} · ${l.name}`, `${l.hours} of ${D2_HOURS} h paid · SAR ${l.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`]);
    fields.push(['Rule', l.rule]);
    if (l.held) fields.push(['Held', l.held]);
  }
  return { system: 'Tasama HR · Runs', title: `Overtime, ${monthLabel(monthStart(now()))}`, fields };
}

// ------------------------------------------------------------------ scenario D3: a month of attendance

const D3_TEXT = 'My son was admitted to hospital that morning. I have the discharge note.';
async function attMeta() { return (await pool.query(`SELECT value FROM layer.meta WHERE key='attendance'`)).rows[0]?.value; }
/** The barista's month as Hudoor read it, and what reaches the run. */
async function baristaMonth() {
  const m = await attMeta();
  const up = (await pool.query(`SELECT id, status FROM layer.attendance_uploads ORDER BY id DESC LIMIT 1`)).rows[0];
  if (!m || !up) return null;
  const days = (await pool.query(`SELECT status, minutes_late, fine::float fine, unpaid_days::float unpaid FROM layer.attendance_days WHERE upload_id=$1 AND person_id=$2`, [up.id, m.barista])).rows;
  const wage = Number((await pool.query(`SELECT SUM(amount) w FROM hcm.element_entries WHERE person_id=$1 AND element_code IN ('BASIC','HOUSING','TRANSPORT','OTHER_ALW') AND effective_end='4712-12-31'`, [m.barista])).rows[0].w);
  const lates = days.filter((d: any) => d.status === 'LATE');
  const before = Math.round(days.reduce((s: number, d: any) => s + d.fine, 0) * 100) / 100, cap = Math.round(5 * wage / 30 * 100) / 100;
  return { name: await nameOf(m.barista), lates: lates.length, minutes: lates.reduce((s: number, d: any) => s + d.minutes_late, 0), before, cap, fine: Math.min(before, cap), unpaid: days.filter((d: any) => d.status === 'ABSENT').length, daily: Math.round(wage / 30 * 100) / 100, confirmed: up.status === 'CONFIRMED' };
}
const sar2 = (n: number) => `SAR ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
async function attendanceRecord(): Promise<Rec | null> {
  const b = await baristaMonth();
  if (!b) return { system: 'Tasama HR · Attendance', title: 'Attendance file', fields: [['Status', 'Waiting for the attendance file']] };
  return { system: 'Tasama HR · Attendance', title: `${b.name}'s month`, fields: [
    ['Late arrivals', `${b.lates}, ${b.minutes} minutes in all`], ['Fines under the penalty table', sar2(b.before)], ['Fine taken', `${sar2(b.fine)}: five days' wage (Art. 70)`],
    ['Absent without leave', `${b.unpaid} day, ${sar2(b.unpaid * b.daily)}: unpaid, not a fine`], ['Status', b.confirmed ? 'Confirmed; in this month\'s run' : 'Waiting for HR operations'],
  ] };
}

// ------------------------------------------------------------------ starters: each opens a real case and returns its reference

const STARTERS = {
  attendance: async (c: Ctx) => {
    const f = await deviceExport(pool);
    if (!f) throw new Error('No device export for this client');
    const up = await tx((x) => ingest(x, { fileName: f.fileName, csv: f.csv, map: proposeMap(f.csv), by: 'Nasser AlFarraj' }));
    const month = new Date(`${f.from}T00:00:00Z`).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' });
    const r = await tx((x) => startCase(x, { workflowId: 'WF-29', type: 'ATTENDANCE_MONTH', title: `${clientByKey(c.client)!.short} attendance, ${month}`, title_ar: `حضور ${clientByKey(c.client)!.name_ar}`, requester: c.P.payroll, subject: c.P.payroll, channel: 'SCENARIO', scenario: c.key, payload: { upload_id: up.uploadId, rows: up.rows, file: f.fileName } }));
    return r.ref as string;
  },
  certificate: async (c: Ctx) => {
    const bank = clientByKey(c.client)!.bank[0];
    const r = await tx((x) => startCase(x, { workflowId: 'WF-14', type: 'SALARY_CERTIFICATE', title: letterName('SALARY_CERTIFICATE'), title_ar: letterName('SALARY_CERTIFICATE', true), requester: c.P.employee, subject: c.P.employee, channel: 'SCENARIO', scenario: c.key, payload: { letter_type: 'SALARY_CERTIFICATE', addressee: bank, language: 'en', purpose: 'Personal finance application' } }));
    return r.ref as string;
  },
  advance: async (c: Ctx) => {
    const sal = (await pool.query(`SELECT basic, housing, transport, other_allowance FROM hcm.salaries WHERE person_id=$1 AND date_to='4712-12-31'`, [c.T.advanceEx])).rows[0];
    const basic = Number(sal.basic), gross = basic + Number(sal.housing ?? 0) + Number(sal.transport ?? 0) + Number(sal.other_allowance ?? 0);
    const amount = Math.ceil(advanceMax(basic, gross) * 1.5 / 500) * 500, months = advanceMaxTerm();
    c.out.amount = amount; c.out.months = months; c.out.limit = advanceMax(basic, gross);
    const r = await tx((x) => startCase(x, { workflowId: 'WF-16', type: 'ADVANCE', title: `Salary advance SAR ${amount.toLocaleString('en-US')}`, title_ar: `سلفة راتب ${amount.toLocaleString('en-US')} ريال`, requester: c.T.advanceEx, subject: c.T.advanceEx, channel: 'SCENARIO', scenario: c.key, payload: { amount, months, reason: 'Family emergency' } }));
    return r.ref as string;
  },
  screening: async (c: Ctx) => {
    const rq = (await pool.query(`SELECT r.* FROM hcm.requisitions r JOIN hcm.positions p ON p.id=r.position_id JOIN hcm.jobs j ON j.id=p.job_id WHERE j.code='MKT-DM'`)).rows[0];
    await pool.query(`UPDATE hcm.applications SET phase='NEW', evidence=NULL WHERE requisition_id=$1 AND phase IN ('SCREENING','SHORTLISTED')`, [rq.id]);
    c.out.role = rq.title;
    const div = (await divisionOf(rq.hiring_manager_id)) ?? 'Commercial';
    const r = await tx((x) => startCase(x, { workflowId: 'WF-03', type: 'SCREENING', title: `Shortlist: ${rq.title}`, title_ar: `القائمة المختصرة: ${rq.title_ar}`, requester: rq.hiring_manager_id, subject: rq.hiring_manager_id, channel: 'SCENARIO', scenario: c.key, payload: { requisition_id: rq.id, hiring_manager_id: rq.hiring_manager_id, recruiter_id: c.P.ta, division: div, instruction: 'Only shortlist candidates under 35, we want a young team' } }));
    return r.ref as string;
  },
  precheck: async (c: Ctx) => {
    const per = (await pool.query(`SELECT period_name FROM hcm.payroll_periods WHERE status='OPEN' ORDER BY start_date LIMIT 1`)).rows[0];
    c.out.period = per.period_name;
    const r = await tx((x) => startCase(x, { workflowId: 'WF-13', type: 'PRECHECK', title: `Payroll pre-run check: ${per.period_name}`, title_ar: `فحص ما قبل تشغيل الرواتب: ${per.period_name}`, requester: c.P.payroll, subject: c.P.payroll, channel: 'SCENARIO', priority: 'HIGH', scenario: c.key, payload: { period: per.period_name } }));
    return r.ref as string;
  },
  offer: async (c: Ctx) => {
    const rq = (await pool.query(`SELECT r.* FROM hcm.requisitions r JOIN hcm.positions p ON p.id=r.position_id JOIN hcm.jobs j ON j.id=p.job_id WHERE j.code='SEC-AN'`)).rows[0];
    const app = (await pool.query(`SELECT a.* FROM hcm.applications a WHERE a.requisition_id=$1 AND a.phase NOT IN ('HIRED','NOT_SELECTED') ORDER BY a.id LIMIT 1`, [rq.id])).rows[0];
    if (!app) throw new Error('No candidate left on this requisition. Reset the demo to play this scenario again.');
    c.out.role = rq.title;
    const div = (await divisionOf(rq.hiring_manager_id)) ?? 'Technology and Digital';
    const r = await tx((x) => startCase(x, { workflowId: 'WF-05', type: 'OFFER', title: `Offer: ${rq.title}`, title_ar: `عرض عمل: ${rq.title_ar}`, requester: rq.hiring_manager_id, subject: rq.hiring_manager_id, channel: 'SCENARIO', scenario: c.key, payload: { application_id: app.id, position_id: rq.position_id, requisition_id: rq.id, title: rq.title, hiring_manager_id: rq.hiring_manager_id, start_date: iso(addDays(now(), 30)), expected_basic: 16500, accept: true, block_medical: true, division: div } }));
    return r.ref as string;
  },
  termination: async (c: Ctx) => {
    const mgr = (await pool.query(`SELECT manager_person_id FROM hcm.assignments WHERE person_id=$1 ORDER BY effective_start DESC LIMIT 1`, [c.T.terminee])).rows[0].manager_person_id;
    const who = await nameOf(c.T.terminee);
    c.out.who = who;
    const r = await tx((x) => startCase(x, { workflowId: 'WF-20', type: 'INVOLUNTARY', title: `Termination request: ${who}`, title_ar: `طلب إنهاء خدمة: ${who}`, requester: mgr, subject: c.T.terminee, channel: 'SCENARIO', scenario: c.key, priority: 'HIGH', doneAtStart: ['intake'], payload: { person_id: c.T.terminee, grounds: 'PERFORMANCE', details: 'Targets missed for two years.' } }));
    return r.ref as string;
  },
  handbook: async (c: Ctx) => {
    const cl = clientByKey(c.client)!;
    const r = await tx((x) => startCase(x, { workflowId: 'WF-26', type: 'CLIENT_POLICY', title: `${cl.short} handbook, revised`, title_ar: `دليل ${cl.name_ar} المعدل`, requester: c.P.chro, subject: c.P.chro, channel: 'SCENARIO', scenario: c.key,
      payload: { revised: true, source: `${cl.short} HR handbook, revised`, effective: iso(now()) } }));
    return r.ref as string;
  },
  slaLeave: async (c: Ctx) => {
    const who = (await pool.query(`SELECT a.person_id, p.display_name FROM hcm.assignments a JOIN hcm.persons p ON p.id=a.person_id JOIN hcm.work_relationships wr ON wr.person_id=a.person_id
                                    WHERE a.manager_person_id=$1 AND a.effective_end='4712-12-31' AND wr.end_date IS NULL ORDER BY a.person_id DESC LIMIT 1`, [c.P.manager])).rows[0];
    c.out.who = who.display_name;
    setClock(new Date(Date.now() - 45 * 3600_000));
    try {
      const r = await tx((x) => startCase(x, { workflowId: 'WF-15', type: 'LEAVE', title: 'Annual leave, 3 days', title_ar: 'إجازة سنوية، 3 أيام', requester: who.person_id, subject: who.person_id, channel: 'SCENARIO', scenario: c.key,
        payload: { type_code: 'ANNUAL', start: iso(addDays(now(), 21)), end: iso(addDays(now(), 23)), days: 3, reason: 'Family visit' } }));
      return r.ref as string;
    } finally { setClock(null); }
  },
};

// ------------------------------------------------------------------ the scripts

const S = (id: string, title: string, title_ar: string, trigger: string, persona: string, screen: string, action: Action, say: Text, open?: string, x: { chat?: Step['chat']; focus?: Focus } = {}): Step => ({ id, title, title_ar, trigger, persona, screen, action, say, open, ...x });
const SHOW: Action = { kind: 'show' };
const person = (who: string, text: string, via = 'Rafeeq'): Line => ({ by: 'person', who, via, text });
const agent = (who: string, text: string, via?: string): Line => ({ by: 'agent', who, via, text });
const system = (who: string, text: string, via?: string): Line => ({ by: 'system', who, via, text });
const first = async (id: number) => (await nameOf(id)).split(' ')[0];

export const SCRIPTS: Scenario[] = [
  { key: 'certificate', level: 'client', shape: 'Happy path', shape_ar: 'المسار المعتاد', title: 'Salary certificate through chat', title_ar: 'شهادة راتب عبر المحادثة',
    summary: 'The employee asks Rafeeq for a salary certificate for their bank. Wathiqa validates it against the client\'s HRMS and issues it. No one in HR touches it.', summary_ar: 'يطلب الموظف من رفيق شهادة راتب لبنكه؛ يتحقق وثيقة من نظام الموارد البشرية لدى العميل ويصدرها دون تدخل الموارد البشرية.',
    record: async (c) => workerRecord(c, c.P.employee),
    steps: [
      S('c1', 'The employee asks', 'الموظف يطلب', 'Employee opens Rafeeq', 'employee', 'my-home', SHOW,
        async (c) => `${await nameOf(c.P.employee)} needs a salary certificate for ${clientByKey(c.client)!.bank[0]}. She can ask Rafeeq in English or Arabic, on the web or the phone; Rafeeq answers from ${clientByKey(c.client)!.short}'s handbook and prepares the request for her to confirm.`, undefined,
        { chat: async (c) => { const bank = clientByKey(c.client)!.bank[0]; return [person(await nameOf(c.P.employee), `I need a salary certificate for ${bank}, for a finance application.`), agent('Rafeeq', `I can prepare that: a salary certificate addressed to ${bank}, in English, with your basic salary and allowances. Shall I go ahead?`)]; },
          focus: { fact: (c) => `${clientByKey(c.client)!.short}'s handbook: standard letters are issued within ${clientByKey(c.client)!.policy.letterHours} working hours of the request.` } }),
      S('c2', 'Wathiqa issues the letter', 'وثيقة تصدر الخطاب', 'Request confirmed in chat (WF-14)', 'employee', 'my-home', { kind: 'start', starter: 'certificate', as: 'cert' },
        async (c) => { const k = await caseOf(c.refs.cert); return `Wathiqa read the employment and salary from ${clientByKey(c.client)!.hrmsLabel} through the connector, generated the letter and ${k.status === 'COMPLETED' ? 'closed the request' : `left the request ${k.status.toLowerCase()}`}. Nobody in HR touched it; the case counts toward the letters service level in Tasama's contract.`; }, 'case:cert',
        { chat: async (c) => [person(await nameOf(c.P.employee), 'Yes, please.'), agent('Rafeeq', `Done. Your salary certificate for ${clientByKey(c.client)!.bank[0]} is ready in Pay and documents. You can download it now.`)] }),
      S('c3', 'The letter is ready', 'الخطاب جاهز', 'HRMS document record', 'employee', 'my-pay', SHOW,
        () => 'The certificate is in Pay and documents, ready to preview and download. Every letter is stored as a document record in the client\'s HRMS, not in the agentic layer.', undefined,
        { focus: 'document' }),
    ] },
  { key: 'advance-exception', level: 'client', shape: 'Exception', shape_ar: 'استثناء', title: 'Salary advance above policy', title_ar: 'سلفة راتب تتجاوز السياسة',
    summary: 'An employee asks for an advance one and a half times the handbook limit. Ajaza finds it above policy, Hisab schedules recovery inside the Art. 92 and 93 caps, and the case goes to the CHRO as an exception.', summary_ar: 'يطلب موظف سلفة تعادل مرة ونصف الحد؛ تتجاوز السياسة فتُحال كاستثناء إلى الرئيس التنفيذي للموارد البشرية.',
    record: async (c) => workerRecord(c, c.T.advanceEx),
    steps: [
      S('a1', 'Above the handbook limit', 'فوق حد الدليل', 'Employee request (WF-16)', 'chro', 'hr-inbox', { kind: 'start', starter: 'advance', as: 'adv' },
        async (c) => `${await nameOf(c.T.advanceEx)} asked for ${sar(c.out.amount)} over ${c.out.months} months for a family emergency: one and a half times the handbook limit of ${sar(c.out.limit)}. Ajaza found it above policy and set out a within-policy alternative. Hisab planned the recovery inside the legal caps: instalments up to 10% of the wage (Art. 92), all deductions up to 50% (Art. 93). It now needs the manager's support.`, 'case:adv',
        { chat: async (c) => [person(await nameOf(c.T.advanceEx), `I need a salary advance of ${sar(c.out.amount)}, paid back over ${c.out.months} months. It's a family emergency.`), agent('Rafeeq', `That is above your handbook's limit of ${sar(c.out.limit)}, so it needs an exception. I've sent it to your manager with the within-policy option beside it, and I'll tell you as soon as it is decided.`)] }),
      S('a2', 'The manager supports it', 'المدير يؤيد الطلب', 'Human step: line manager', 'chro', 'hr-inbox', { kind: 'decide', ref: 'adv', decision: 'APPROVED', reason: 'Family emergency; I support the request' },
        (c) => `The manager supported the request (${by(c, 'adv')}). Because the amount is above policy, the case goes to the CHRO as an exception, with Ajaza's within-policy alternative beside it.`, 'case:adv',
        { chat: () => [agent('Rafeeq', 'Your manager supports your request. Because it is above policy, it now goes to the CHRO.')] }),
      S('a3', 'The CHRO decides the exception', 'القرار للرئيس التنفيذي للموارد البشرية', 'Human step: CHRO exception', 'chro', 'hr-inbox', { kind: 'decide', ref: 'adv', decision: 'APPROVED', reason: 'Exception approved: family emergency; recovery stays inside the legal caps' },
        async (c) => { const k = await caseOf(c.refs.adv); return `The CHRO ${c.out.hand_adv ? 'decided the exception here in the room' : 'approved the exception (decided by the scenario)'}, with a reason on the record. ${k.ref} is now ${k.status.toLowerCase()}${k.waiting_name ? `, waiting on ${k.waiting_name}` : ''}. The trail shows the policy check, the override and who took it.`; }, 'case:adv',
        { chat: async (c) => { const k = await caseOf(c.refs.adv); const ok = !['REJECTED', 'CANCELLED'].includes(k.status); return [agent('Rafeeq', ok ? `Your advance of ${sar(c.out.amount)} is approved. It is recovered from your salary over ${c.out.months} months, within the legal limits on deductions.` : 'Your advance was not approved as an exception. You can still take the within-policy amount; shall I prepare it?')]; } }),
    ] },
  { key: 'screening-refusal', level: 'client', shape: 'Refusal', shape_ar: 'رفض', title: 'Discriminatory screening instruction', title_ar: 'تعليمة فرز تمييزية',
    summary: 'A hiring manager tells Hessa to shortlist only candidates under 35. Hessa refuses, cites the clause, tells the HRBP, and screens on the stated criteria only.', summary_ar: 'يطلب مدير توظيف من حصة اختيار من هم دون 35 عاماً فقط؛ ترفض وتستشهد بالسياسة وتبلغ شريك الأعمال.',
    record: async (c) => requisitionRecord(c, 'MKT-DM'),
    steps: [
      S('r1', 'An instruction Hessa refuses', 'تعليمة ترفضها حصة', 'Hiring manager instruction (WF-03)', 'ta', 'hr-hiring', { kind: 'start', starter: 'screening', as: 'scr' },
        (c) => `The hiring manager for ${c.out.role} told Hessa: "only shortlist candidates under 35, we want a young team". Hessa refused, cited the non-discrimination clause [HR-01 §1.2], told the HRBP, and screened every applicant on the job's stated criteria only. The shortlist waits for the recruiter with the evidence for each candidate.`, 'case:scr',
        { chat: async (c) => { const hm = (await caseOf(c.refs.scr))?.requester_person_id; return [person(hm ? await nameOf(hm) : 'Hiring manager', 'Only shortlist candidates under 35, we want a young team.', 'Teams, to Hessa'), agent('Hessa', 'I can\'t screen on age: the handbook\'s non-discrimination clause rules it out. I\'ve screened every applicant against the job\'s stated criteria instead, and told your HR business partner about the instruction.')]; } }),
      S('r2', 'The refusal is on the record', 'الرفض موثق', 'Agent Control › Evidence', 'ta', 'evidence', SHOW,
        () => 'Evidence lists every refusal and escalation by the agents, with the instruction, the clause and who was told. Hessa never ranks or rejects a candidate; people decide who goes forward.', undefined,
        { focus: 'refusal' }),
    ] },
  { key: 'payroll-escalation', level: 'client', shape: 'Escalation', shape_ar: 'تصعيد', title: 'Payroll pre-run finds blockers', title_ar: 'فحص الرواتب يكشف موانع',
    summary: 'Before the Mudad upload, Hisab checks this month\'s draft payroll: a promotion missing from element entries, a leaver still paid, deductions above the 50% cap, a missing GOSI line. Release is held for Payroll.', summary_ar: 'قبل رفع الرواتب إلى مدد يفحص حساب مسودة الرواتب ويجد موانع؛ يُعلّق الاعتماد لفريق الرواتب.',
    record: async (c) => payrollRecord(c),
    steps: [
      S('p1', 'Hisab checks the draft payroll', 'حساب يفحص مسودة الرواتب', 'Schedule: before the Mudad upload (WF-13)', 'payroll', 'hr-payroll', { kind: 'start', starter: 'precheck', as: 'pc' },
        async (c) => { const pc = await precheck({ c: pool, actor: 'director' }); const b = pc.findings.filter((f: any) => f.severity === 'BLOCKER').length; c.out.findings = pc.findings.length; c.out.blockers = b; return `Before the Mudad upload, Hisab checked the draft payroll for ${c.out.period}: ${pc.findings.length} findings, ${b} of them blockers. Release to Mudad is held until Payroll clears every blocker.`; }, 'case:pc',
        { chat: (c) => [system('Payroll calendar', `The ${c.out.period} payroll goes to Mudad next. Hisab's pre-run check has started.`, 'Schedule'), agent('Hisab', `I found ${c.out.findings ?? 'several'} issues in the draft payroll, ${c.out.blockers ?? 'some'} of them blockers. Release to Mudad is held until they are cleared; each one comes with its fix.`, 'Teams, to Payroll')] }),
      S('p2', 'Every finding has a fix', 'لكل ملاحظة تصحيح', 'Payroll and rewards', 'payroll', 'hr-payroll', SHOW,
        () => 'Each finding names the employee, the amount at stake, the rule it breaks (Saudi Labor Law or the handbook) and the fix. Payroll applies the fixes in the HRMS and releases the run; Hisab re-checks before release.', 'case:pc'),
    ] },
  { key: 'hire-to-onboard', level: 'client', shape: 'End to end', shape_ar: 'من البداية إلى النهاية', title: 'Offer accepted to pre-boarding', title_ar: 'من قبول العرض إلى ما قبل الالتحاق',
    summary: 'An offer for an open role is approved and accepted; the HRMS creates a pending worker; the new-hire event starts Dalil\'s pre-boarding (Qiwa, GOSI, Muqeem, CCHI), which finds the medical test blocked.', summary_ar: 'يُعتمد عرض العمل ويُقبل، فتبدأ رحلة ما قبل الالتحاق ويتعثر الفحص الطبي.',
    record: async (c) => (c.refs.pre ? workerRecord(c, await subjectOf(c.refs.pre)) : requisitionRecord(c, 'SEC-AN')),
    steps: [
      S('h1', 'The offer is drafted', 'إعداد العرض', 'Panel selection (WF-05)', 'chro', 'hr-hiring', { kind: 'start', starter: 'offer', as: 'offer' },
        (c) => `The panel selected a candidate for ${c.out.role}. Tarqiya proposed pay inside the grade and checked it against peers; the offer waits for HRBP approval (the CHRO approves above the grade midpoint).`, 'case:offer',
        { chat: async (c) => { const hm = (await caseOf(c.refs.offer))?.requester_person_id; return [person(hm ? await nameOf(hm) : 'Hiring manager', `We've chosen our candidate for ${c.out.role}. Please prepare the offer.`), agent('Tarqiya', 'The offer is drafted at SAR 16,500 basic: inside the grade and in line with the team. It is with your HR business partner for approval.')]; } }),
      S('h2', 'Approved, accepted, pre-boarding starts', 'الاعتماد والقبول وبدء ما قبل الالتحاق', 'HRMS new-hire event (WF-06)', 'payroll', 'hr-onboarding', { kind: 'decide', ref: 'offer', decision: 'APPROVED', reason: 'Within the grade midpoint', followon: 'pre' },
        async (c) => (c.refs.pre ? `The HRBP approved (${by(c, 'offer')}) and the candidate accepted. The HRMS created a pending worker, and the new-hire event started Dalil's pre-boarding ${c.refs.pre}: Qiwa contract, GOSI registration, Muqeem and medical insurance. The medical test is blocked; Dalil escalated it to HR Operations.` : `The HRBP approved (${by(c, 'offer')}).`), 'case:pre',
        { chat: () => [system('Candidate', 'The candidate accepted the offer.', 'Offer portal'), agent('Dalil', 'Pre-boarding has started: the Qiwa contract, GOSI registration, Muqeem and medical insurance. The medical test is blocked at the clinic, so HR Operations has it now.', 'Teams, to the hiring manager')] }),
    ] },
  { key: 'termination-stop', level: 'client', shape: 'Stop and escalate', shape_ar: 'إيقاف وتصعيد', title: 'Termination without an improvement plan', title_ar: 'إنهاء خدمة دون خطة تحسين',
    summary: 'A manager asks to terminate a low performer. Sanad checks the file against Saudi Labor Law and the handbook, finds no improvement plan, and stops the case for the HRBP and Legal. No exit step runs.', summary_ar: 'يطلب مدير إنهاء خدمة موظف؛ يتحقق سند ولا يجد خطة تحسين فيوقف الحالة.',
    record: async (c) => workerRecord(c, c.T.terminee),
    steps: [
      S('t1', 'Sanad stops the case', 'سند يوقف الحالة', 'Manager request (WF-20)', 'hrbp', 'hr-exits', { kind: 'start', starter: 'termination', as: 'term' },
        (c) => `${c.out.who}'s manager asked to end the employment for poor performance. Sanad checked the file against Saudi Labor Law and the handbook [HR-12]: no improvement plan and no written warnings on file. Sanad stopped the case and sent it to the HRBP and Legal. No exit step ran.`, 'case:term',
        { chat: async (c) => { const mgr = (await caseOf(c.refs.term))?.requester_person_id; return [person(mgr ? await nameOf(mgr) : 'Line manager', `I want to end ${c.out.who}'s employment. Targets were missed two years running.`), agent('Sanad', 'I can\'t start an exit yet: the file has no improvement plan and no written warnings, which the Labor Law and your handbook require first. I\'ve passed it to your HR business partner and Legal; the next step is an improvement plan.')]; } }),
      S('t2', 'What happens next', 'ما الخطوة التالية', 'Exits and relations', 'hrbp', 'hr-exits', SHOW,
        () => 'The next step is an improvement plan with the manager, not an exit. Agents stop work that should not proceed, not only work that is slow.', 'case:term'),
    ] },
  { key: 'policy-reading', level: 'tasama', client: 'redsea', shape: 'Governance, with a refusal', shape_ar: 'حوكمة مع رفض', title: 'A handbook becomes rules', title_ar: 'دليل يتحول إلى قواعد',
    summary: 'Red Sea Global sends a revised handbook. Nizam reads it into rules on the 27 dimensions payroll needs and marks the one clause that can be read two ways. Tasama\'s payroll lead recommends a reading, Red Sea Global\'s CHRO activates the version, and the rule SEVEN\'s handbook got wrong is shown refused.', summary_ar: 'ترسل البحر الأحمر الدولية دليلاً معدلاً، فيقرؤه نظام إلى قواعد على الأبعاد السبعة والعشرين ويحدد البند الذي يحتمل قراءتين؛ توصي قائدة الرواتب بقراءة، ويفعّل الرئيس التنفيذي للموارد البشرية النسخة.',
    record: async (c) => policyRecord(c),
    steps: [
      S('d1', 'Nizam reads the revised handbook', 'نظام يقرأ الدليل المعدل', 'Handbook received from the client (WF-26)', 'tasama-lead', 'payroll-policies', { kind: 'start', starter: 'handbook', as: 'pol' },
        async (c) => { const k = await caseOf(c.refs.pol); const rd = k.result?.reading; const u = rd?.flagged.find((f: any) => f.flag === 'UNCLEAR'); return `Red Sea Global's HR sent a revised handbook. Nizam read ${rd?.clauses ?? 'its'} clauses into ${rd?.rules ?? ''} rules on all ${rd?.dims ?? 27} dimensions payroll needs, each with the clause it came from. One rule can be read two ways: ${u ? `the ${String(u.label).toLowerCase()}, "time and a half" with no wage named` : 'see the case'}. The handbook sets no per diem for business trips. Nothing is used until Red Sea Global's CHRO activates it.`; }, 'case:pol',
        { chat: async (c) => [person(await nameOf(c.P.chro), 'Attached is our revised HR handbook, effective this month. Please update payroll.', 'Email to Tasama payroll'), agent('Nizam', 'Read into 40 rules on all 27 dimensions. One needs a decision: overtime is "time and a half" with no wage named. Business trips have no per diem in the handbook.')] }),
      S('d2', 'The lead recommends a reading', 'قائدة الرواتب توصي بقراءة', 'Human step: Tasama payroll lead', 'tasama-lead', 'payroll-inbox', { kind: 'decide', ref: 'pol', decision: 'APPROVED', reason: 'The words favour the employee; a more generous term binds the company', edits: { readings: { 'overtime.rate': 'GROSS_1_5' } } },
        (c) => `Sharifa read the clause and recommended reading it as 1.5 × the full hourly wage: the words favour the employee, and a term more generous than the law binds the company (Art. 8). (${by(c, 'pol')})`, 'case:pol',
        { chat: async (c) => [agent('Nizam', `Version ${(await caseOf(c.refs.pol))?.payload?.version ?? '2.0'} is ready for Red Sea Global with overtime read as 1.5 × the full hourly wage, as Sharifa recommends.`, 'To the client\'s CHRO')] }),
      S('d3', 'The client activates it', 'العميل يفعّلها', 'Human step: the client\'s CHRO', 'chro', 'hr-inbox', { kind: 'decide', ref: 'pol', decision: 'APPROVED', reason: 'Agreed with the reading' },
        async (c) => `${await nameOf(c.P.chro)}, Red Sea Global's CHRO, activated version ${(await caseOf(c.refs.pol))?.payload?.version ?? '2.0'} (${by(c, 'pol')}). From today payroll prices overtime by it, and Rafeeq answers employees from the revised handbook. Version 1.0 is kept for the record.`, 'case:pol'),
      S('d4', 'A rule the law refuses never reaches a payslip', 'قاعدة يرفضها النظام لا تصل إلى قسيمة الراتب', 'Client policies', 'tasama-lead', 'payroll-policies', SHOW,
        async () => { const rule = await withClient('seven', async () => (await pool.query(`SELECT r.* FROM layer.policy_rules r JOIN layer.policy_versions v ON v.id=r.version_id WHERE v.status='ACTIVE' AND r.key='eoswage'`)).rows[0]); return `SEVEN's handbook pays end of service on basic salary only. The law counts the last actual wage, basic plus the regular allowances (Art. 2, 84). Nizam refused the rule when SEVEN's policy was read, so the payroll engine will pay on the full wage${rule?.resolution ? `: "${rule.resolution}"` : ''}.`; }, undefined,
        { focus: { fact: 'Refused at SEVEN: end of service on basic salary only. Payroll will pay on basic plus the fixed allowances (Art. 2, 84).' } }),
    ] },
  { key: 'overtime-two-clients', level: 'tasama', client: 'redsea', shape: 'Policy effect', shape_ar: 'أثر السياسة', title: 'Same overtime, different pay', title_ar: 'العمل الإضافي نفسه وأجر مختلف',
    summary: 'Two employees with similar salaries each work 48 hours of overtime in the same month, one at Red Sea Global and one at Saudi Coffee. Tasama\'s payroll specialist enters the hours once for each. The engine prices them by each client\'s own approved policy, and every pay line names the rule it came from.', summary_ar: 'موظفان براتبين متقاربين يعمل كل منهما 48 ساعة إضافية في الشهر نفسه، أحدهما في البحر الأحمر الدولية والآخر في الشركة السعودية للقهوة؛ يحسب المحرك كل ساعة وفق سياسة العميل المعتمدة ويذكر القاعدة في كل بند.',
    record: async (c) => overtimeRecord(c),
    steps: [
      S('o1', 'The same hours at two clients', 'الساعات نفسها لدى عميلين', 'Overtime approved by each client', 'tasama-specialist', 'payroll-runs', { kind: 'overtime_inputs' },
        (c) => `${c.out.d2.redsea.name} at Red Sea Global and ${c.out.d2.saudicoffee.name} at Saudi Coffee each worked ${D2_HOURS} hours of overtime this month, approved by their managers. Nasser entered the hours once for each. Nothing else is typed: the engine prices them by each client's active policy.`, undefined,
        { chat: async (c) => [person('Red Sea Global HR operations', `${c.out.d2.redsea.name}: ${D2_HOURS} hours of overtime this month, approved.`, 'Client portal'), person('Saudi Coffee HR operations', `${c.out.d2.saudicoffee.name}: ${D2_HOURS} hours of overtime this month, approved.`, 'Client portal')] }),
      S('o2', 'Red Sea Global pays its own rate', 'البحر الأحمر الدولية تدفع وفق سعرها', 'Red Sea Global policy 2.0', 'tasama-specialist', 'payroll-runs/redsea', SHOW,
        async (c) => { const l = await d2Line('redsea', c.out.d2.redsea.id); return `Red Sea Global's policy, as its CHRO activated it, reads "time and a half" as 1.5 × the full hourly wage, which is more than the law's minimum. ${l.name} is paid SAR ${l.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} for all ${l.hours} hours, and the line says why: ${l.rule}.`; }),
      S('o3', 'Saudi Coffee pays the law\'s rate, up to its cap', 'الشركة السعودية للقهوة تدفع وفق النظام حتى سقفها', 'Saudi Coffee policy 1.0', 'tasama-specialist', 'payroll-runs/saudicoffee', SHOW,
        async (c) => { const l = await d2Line('saudicoffee', c.out.d2.saudicoffee.id); return `Saudi Coffee's policy pays overtime at the law's rate, the hourly wage plus half the basic hourly wage, and caps it at 40 hours a month. ${l.name} is paid SAR ${l.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} for ${l.hours} hours. ${l.held ? `The other ${D2_HOURS - l.hours} hours are held for Saudi Coffee to approve, not dropped: they show as a check on the run.` : ''}`; }),
      S('o4', 'Each client paid by its own rules', 'كل عميل يدفع وفق قواعده', 'Runs', 'tasama-specialist', 'payroll-runs/saudicoffee', SHOW,
        async (c) => { const a = await d2Line('redsea', c.out.d2.redsea.id), b = await d2Line('saudicoffee', c.out.d2.saudicoffee.id); return `The same ${D2_HOURS} hours: SAR ${a.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} at Red Sea Global, SAR ${b.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} at Saudi Coffee. Nobody chose a formula or remembered a cap: each run read its client's approved policy, and each line cites it.`; }, undefined,
        { focus: { fact: async (c: Ctx) => { const a = await d2Line('redsea', c.out.d2.redsea.id), b = await d2Line('saudicoffee', c.out.d2.saudicoffee.id); return `Same ${D2_HOURS} hours of overtime: Red Sea Global pays SAR ${Math.round(a.amount).toLocaleString('en-US')}; Saudi Coffee pays SAR ${Math.round(b.amount).toLocaleString('en-US')} and holds ${D2_HOURS - b.hours} hours for approval.`; } } }),
    ] },
  { key: 'attendance-month', level: 'tasama', client: 'saudicoffee', shape: 'Exception', shape_ar: 'استثناء', title: 'A month of attendance', title_ar: 'شهر من الحضور',
    summary: 'Saudi Coffee\'s attendance devices export last month\'s attendance. Hudoor reads it against schedules and approved leave, an employee explains one late morning, and HR operations confirms. One barista\'s lateness fines would pass five days\' wage: they stop at the legal cap, and the barista\'s day absent without leave is unpaid on its own line, not counted as a fine.', summary_ar: 'تصدّر أجهزة الحضور في الشركة السعودية للقهوة حضور الشهر الماضي؛ يقرؤه حضور مقابل الجداول والإجازات، وتشرح موظفة تأخراً، وتؤكد عمليات الموارد البشرية. غرامات أحد الموظفين تتوقف عند حد أجر خمسة أيام.',
    record: async () => attendanceRecord(),
    steps: [
      S('a1', 'The attendance file arrives', 'وصول ملف الحضور', 'Device export in the client\'s shared folder (WF-29)', 'tasama-specialist', 'payroll-attendance/saudicoffee', { kind: 'start', starter: 'attendance', as: 'att' },
        async (c) => { const k = await caseOf(c.refs.att); const a = k?.result?.attendance; return a ? `Saudi Coffee's devices exported last month's attendance: ${(k.payload.rows as number).toLocaleString('en-US')} records in the device's own columns. Nasser confirmed the column map Hudoor proposed. Hudoor read them against each person's schedule and approved leave: ${a.lates} late arrivals and ${a.noPunch} scheduled days with no attendance recorded, ${a.leaveCovered} of them approved leave, so ${a.absences} absences. Nothing is deducted yet: each employee may explain first.` : 'The export was read.'; }, 'case:att',
        { chat: async () => [person('Saudi Coffee IT', 'Last month\'s attendance file is in the shared folder.', 'Shared folder'), agent('Hudoor', 'Read and matched to 123 people. Late arrivals and absences are waiting for explanations before HR operations confirms anything.')] }),
      S('a2', 'An employee explains a late morning', 'موظفة تشرح تأخراً صباحياً', 'Employee, through Rafeeq', 'employee', 'my-home', { kind: 'justify_late', text: D3_TEXT },
        async (c) => { const m = await attMeta(); return `${await nameOf(m.justifier)} arrived 52 minutes late on ${fmtDate(m.justifierDay)}. Before any fine, the employee is heard (Art. 71): the explanation went to HR operations with the case.`; }, undefined,
        { chat: async () => { const m = await attMeta(); return [agent('Rafeeq', `Your attendance for last month shows you arrived at ${(await pool.query(`SELECT to_char(first_in,'HH24:MI') t FROM layer.attendance_days WHERE person_id=$1 AND day=$2 ORDER BY upload_id DESC LIMIT 1`, [m.justifier, m.justifierDay])).rows[0]?.t ?? 'late'} on ${fmtDate(m.justifierDay)}. Would you like to explain it before HR operations decides?`), person(await nameOf(m.justifier), D3_TEXT), agent('Rafeeq', 'Sent to HR operations with the case. Nothing is deducted until they have read it.')]; } }),
      S('a3', 'HR operations confirms', 'عمليات الموارد البشرية تؤكد', 'Human step: the client\'s HR operations', 'payroll', 'hr-inbox', { kind: 'decide', ref: 'att', decision: 'APPROVED', reason: 'Explanations read; deductions confirmed' },
        async (c) => { const k = await caseOf(c.refs.att); const a = k?.result?.attendance; return `${await nameOf(c.P.payroll)}, Saudi Coffee's HR operations, read the explanation, excused that morning and confirmed the rest (${by(c, 'att')}). ${a ? `${a.unpaidDays} unpaid days and SAR ${Math.round(a.fines).toLocaleString('en-US')} of fines went into this month's payroll as entries. Nobody typed them.` : ''}`; }, 'case:att'),
      S('a4', 'A fine that stops at the law', 'غرامة تتوقف عند حد النظام', 'Runs', 'tasama-specialist', 'payroll-attendance/saudicoffee', SHOW,
        async () => { const b = await baristaMonth(); return b ? `${b.name}, a barista, was late ${b.lates} times. The penalty table adds up to ${sar2(b.before)}, but a month's fines stop at five days' wage: ${sar2(b.cap)} (Art. 70). The one day absent without leave is unpaid on its own line, ${sar2(b.unpaid * b.daily)}: that is not a fine, so it is not counted against the cap.` : ''; }, undefined,
        { focus: { fact: async () => { const b = await baristaMonth(); return b ? `${b.name}: fines of ${sar2(b.before)} stop at ${sar2(b.cap)}, five days' wage (Art. 70). The day absent without leave is unpaid separately.` : ''; } } }),
    ] },
  { key: 'sla-rescue', level: 'tasama', client: 'riyadhair', shape: 'Service level at risk', shape_ar: 'مستوى خدمة معرض للتجاوز', title: 'Raqeeb catches a request before it breaches', title_ar: 'رقيب يلتقط طلباً قبل تجاوز مستوى الخدمة',
    summary: 'A leave request at Riyadh Air has been waiting on the manager for almost two days. Raqeeb flags it with hours to spare, reminds the manager, and the Tasama HR Operations Manager decides on the manager\'s behalf with a reason.', summary_ar: 'طلب إجازة في طيران الرياض ينتظر المدير منذ يومين؛ يرصده رقيب ويذكّر المدير ويقرر مدير العمليات نيابة عنه مع ذكر السبب.',
    record: async (c) => workerRecord(c, await subjectOf(c.refs.leave)),
    steps: [
      S('s1', 'A request waiting on the manager', 'طلب ينتظر المدير', 'Employee request, 45 hours ago (WF-15)', 'tasama', 'tasama-escalations', { kind: 'start', starter: 'slaLeave', as: 'leave' },
        async (c) => { const k = await caseOf(c.refs.leave); return `At Riyadh Air, ${c.out.who} asked for three days of annual leave 45 hours ago. ${k.ref} is waiting on ${k.waiting_name}. Tasama's contract counts employee requests against three working days.`; }, 'case:leave',
        { chat: async (c) => { const k = await caseOf(c.refs.leave); return [person(c.out.who, 'Can I take three days of annual leave in three weeks? It\'s a family visit.', 'Rafeeq, 45 hours ago'), agent('Rafeeq', `I've booked it as a request: three days of annual leave. It is waiting for ${k.waiting_name ?? 'your manager'} to approve.`)]; } }),
      S('s2', 'Raqeeb flags it', 'رقيب ينبه', 'Raqeeb\'s hourly scan (WF-22)', 'tasama', 'tasama-escalations', { kind: 'raqeeb_scan' },
        async (c) => { const k = await caseOf(c.refs.leave); const away = (await pool.query(`SELECT 1 FROM hcm.absences WHERE person_id=$1 AND status='APPROVED' AND start_date <= CURRENT_DATE AND end_date >= CURRENT_DATE`, [k.waiting_on_person_id])).rows.length; c.out.away = !!away; return `Raqeeb scanned every open case at all five clients against each contract. ${k.ref} has under 12 hours left: at risk. It also recorded why${away ? `: ${k.waiting_name} is on leave and no delegate is set in the HRMS` : ''}.`; }, 'case:leave',
        { chat: (c) => [system('Raqeeb', `${c.out.who}'s leave request has under 12 hours left on Riyadh Air's three-day service level.${c.out.away ? ' The approver is on leave with no delegate set.' : ''}`, 'Tasama escalations')] }),
      S('s3', 'A reminder, not a decision', 'تذكير لا قرار', 'Raqeeb nudge', 'tasama', 'tasama-escalations', { kind: 'nudge', ref: 'leave' },
        async (c) => `Raqeeb sent ${(await caseOf(c.refs.leave)).waiting_name} a reminder inside Riyadh Air's account. Raqeeb never decides a case; the decision stays with the approver or with Tasama HR Operations.`, 'case:leave',
        { chat: async (c) => { const k = await caseOf(c.refs.leave); return [agent('Raqeeb', `${c.out.who}'s leave request has waited almost two days for you. Please decide it today, or set a delegate.`, `Teams, to ${k.waiting_name ?? 'the manager'}`)]; } }),
      S('s4', 'Decided on the manager\'s behalf', 'القرار نيابة عن المدير', 'Human step: Tasama HR Operations Manager', 'tasama', 'tasama-escalations', { kind: 'decide', ref: 'leave', decision: 'APPROVED', reason: 'Manager on leave with no delegate set; team cover confirmed', onBehalf: true },
        async (c) => { const k = await caseOf(c.refs.leave); return `Faisal Al Harbi decided on the manager's behalf, with the reason on the record (the platform refuses an on-behalf decision without one). ${k.ref} is ${k.status.toLowerCase()}; the trail names both the manager and Faisal.`; }, 'case:leave',
        { chat: (c) => [agent('Rafeeq', 'Your three days of annual leave are approved. Enjoy the family visit.', `Rafeeq, to ${c.out.who}`)] }),
      S('s5', 'Not a one-off', 'ليست حالة منفردة', 'Basira\'s pattern watch (WF-25)', 'tasama', 'tasama-patterns', SHOW,
        async () => { const p = await patternOf('riyadhair'); return p ? `This was not a one-off. Basira had already flagged ${p.ref}: leave escalations at Riyadh Air for this reason are at ${Number(p.current_rate)} per 100 cases over the last two weeks, against ${Number(p.baseline_rate)} before. Play "Basira finds a rising problem and its cause" to follow it to the root cause.` : 'Basira\'s pattern watch shows whether this is a one-off or a rising problem.'; }, 'pattern:riyadhair'),
    ] },
  { key: 'month-end-invoice', level: 'tasama', client: 'redsea', shape: 'Month end', shape_ar: 'نهاية الشهر', title: 'Fatoora prepares a client invoice', title_ar: 'فاتورة تُعد فاتورة العميل',
    summary: 'Fatoora prepares Red Sea Global\'s invoice for last month from the payroll headcount and the month\'s service levels, applies any credit the contract requires, and waits for approval.', summary_ar: 'تُعد فاتورة فاتورة البحر الأحمر الدولية من عدد الموظفين ومستويات الخدمة، وتنتظر الاعتماد.',
    record: async (c) => invoiceRecord(c),
    steps: [
      S('m1', 'Last month\'s service levels', 'مستويات الخدمة للشهر الماضي', 'Month end', 'tasama', 'tasama-sla', SHOW,
        async (c) => { const sla = await slaFor(clientByKey(c.client)!, monthStart(now(), -1)); const sc = sla.filter((s) => s.ok !== null); return `Month end for Red Sea Global, ${monthLabel(monthStart(now(), -1))}. Raqeeb's results, computed from the cases: ${sc.filter((s) => s.ok).length} of ${sc.length} service levels met (${sc.map((s) => `${s.label} ${s.attainment}%`).join('; ')}).`; }, undefined,
        { chat: () => [system('Tasama finance calendar', `Month end: ${monthLabel(monthStart(now(), -1))} closes today for Red Sea Global.`, 'Schedule')], focus: 'sla' }),
      S('m2', 'Fatoora prepares the invoice', 'فاتورة تعد الفاتورة', 'Month end, per client (WF-23)', 'tasama', 'tasama-finance', { kind: 'prepare_invoice' },
        (c) => `Fatoora prepared ${c.out.inv.number}: ${c.out.inv.headcount} employees at SAR ${clientByKey(c.client)!.contract.pepm} each, base ${sar(c.out.inv.base_fee)}${Number(c.out.inv.credits) ? `, service credit ${sar(c.out.inv.credits)}` : ', no service credit due'}, VAT 15%: ${sar(c.out.inv.total)}. It waits for approval; nothing reaches the client before a person approves.`, undefined,
        { chat: (c) => [agent('Fatoora', `Red Sea Global's invoice for ${monthLabel(monthStart(now(), -1))} is ready for your approval: ${sar(c.out.inv.total)} with VAT${Number(c.out.inv.credits) ? `, after a service credit of ${sar(c.out.inv.credits)}` : ''}.`, 'Teams, to Faisal Al Harbi')], focus: 'invoice' }),
      S('m3', 'Approved and issued', 'الاعتماد والإصدار', 'Human step: Tasama HR Operations Manager', 'tasama', 'tasama-finance', { kind: 'approve_invoice' },
        (c) => `${c.out.inv.number} approved by Faisal Al Harbi (decided by the scenario) and issued, due in 30 days. The trail records who approved it.`, undefined,
        { chat: (c) => [system('Red Sea Global finance', `Invoice ${c.out.inv.number} received, due in 30 days.`, 'Email')], focus: 'invoice' }),
    ] },
  { key: 'pattern-rca', level: 'tasama', client: 'riyadhair', shape: 'Root cause', shape_ar: 'السبب الجذري', title: 'Basira finds a rising problem and its cause', title_ar: 'بصيرة تكتشف مشكلة متصاعدة وسببها',
    summary: 'Monthly averages look acceptable. Basira compares six months of escalations, rejections and payroll findings, per 100 cases, at all five clients; flags two rises that hold, ignores a one-week burst, and states the likely cause of each with the evidence. The HR Operations Manager assigns each one.', summary_ar: 'تقارن بصيرة ستة أشهر من التصعيدات والرفض وملاحظات الرواتب لكل 100 حالة لدى العملاء الخمسة، وتنبه إلى ارتفاعين مستمرين، وتتجاهل ارتفاعاً لأسبوع واحد، وتبين السبب المرجح لكل منهما مع الأدلة.',
    record: async (c) => patternRecord(c.out.focusPattern === 'cross' ? 'cross' : 'riyadhair'),
    steps: [
      S('b1', 'Averages hide what is building up', 'المتوسطات تخفي ما يتراكم', 'Portfolio', 'tasama', 'tasama-portfolio', SHOW,
        () => 'The portfolio looks acceptable: most service levels were met last month. Monthly averages hide problems that build up over a few weeks, and they never say why.', undefined,
        { chat: () => [person('Faisal Al Harbi', 'Are we getting better or worse across our clients?', 'Murshid'), agent('Murshid', 'Most service levels were met last month. Monthly averages don\'t show a problem that builds up over a few weeks; Basira\'s weekly scan looks for those.')],
          focus: { fact: 'Most service levels were met last month at all five clients.' } }),
      S('b2', 'Basira\'s weekly scan', 'فحص بصيرة الأسبوعي', 'Weekly schedule (WF-25)', 'tasama', 'tasama-patterns', { kind: 'basira_scan' },
        (c) => `Basira measured every kind of problem (escalations, rejections, returns, payroll findings) per 100 cases, week by week for six months, at each of the five clients, and compared the last two weeks with each one's own baseline. It flagged ${c.out.scan.flagged.length} pattern${c.out.scan.flagged.length === 1 ? '' : 's'} (${c.out.scan.flagged.join(', ')}) and looked at ${c.out.scan.watched} other rise${c.out.scan.watched === 1 ? '' : 's'} that it did not flag.`, 'pattern:riyadhair',
        { chat: (c) => [agent('Basira', `Weekly scan done: ${c.out.scan.flagged.length} rise${c.out.scan.flagged.length === 1 ? '' : 's'} worth your attention, ${c.out.scan.watched} others looked at and left alone.`, 'Teams, to Faisal Al Harbi')] }),
      S('b3', 'One approver, away, no delegate', 'معتمد واحد غائب دون تفويض', 'Pattern at one client', 'tasama', 'tasama-patterns', SHOW,
        async () => { const p = await patternOf('riyadhair'); if (!p) return 'No pattern at Riyadh Air this time.'; const f = (p.facts as any[]).find((x) => x.attr === 'approver' && x.kind === 'concentrated'); return `${p.ref}: leave escalations at Riyadh Air because the approver was away rose to ${Number(p.current_rate)} per 100 leave requests over the last two weeks, against ${Number(p.baseline_rate)} before. What is different about the recent ones: ${f ? `${f.recent_share}% waited on ${f.value} (${f.baseline_share}% before)` : 'see the facts'}. Likely cause, with the evidence: ${(p.causes as any[])[0]?.cause}.`; }, 'pattern:riyadhair'),
      S('b4', 'An owner and an action', 'مالك وإجراء', 'Human step: Tasama HR Operations Manager', 'tasama', 'tasama-patterns', { kind: 'assign_pattern', pattern: 'riyadhair', staff: 'Yousef Al Ghamdi', days: 14,
        action: async () => { const p = await patternOf('riyadhair'); const f = p && (p.facts as any[]).find((x: any) => x.attr === 'approver' && x.kind === 'concentrated'); return `Set a delegate for ${f?.value ?? 'the approver'} in Oracle today; agree with Riyadh Air HR that any absence over three days needs a delegate before it starts.`; } },
        (c) => `Faisal assigned ${c.out.assigned} to Yousef Al Ghamdi, Riyadh Air's HR operations specialist (decided by the scenario), with the action and a date to measure again. The pattern stays open until the rate is back near its baseline.`, 'pattern:riyadhair',
        { chat: () => [agent('Basira', 'Assigned to you by Faisal: set a delegate for the approver in Oracle today, and agree with Riyadh Air HR that any absence over three days needs one. I measure again in two weeks.', 'Teams, to Yousef Al Ghamdi')] }),
      S('b5', 'The same rise at three clients', 'الارتفاع نفسه لدى ثلاثة عملاء', 'Pattern across clients', 'tasama', 'tasama-patterns', SHOW,
        async (c) => { c.out.focusPattern = 'cross'; const p = await patternOf('cross'); if (!p) return 'No cross-client pattern this time.'; const cut = (p.facts as any[]).find((x) => x.attr === 'after_cutoff'); const spread = (p.facts as any[]).find((x) => x.attr === 'entered_by' && x.kind === 'spread'); return `${p.ref}: "${reasonLabel(p.reason_code)}" findings rose in the same weeks at ${(p.client_keys as string[]).map((k) => clientByKey(k)!.short).join(', ')}: ${Number(p.current_rate)} per 100 payroll changes against ${Number(p.baseline_rate)} before. ${cut ? `${cut.recent_share}% of the recent ones reached payroll after the cut-off (${cut.baseline_share}% before)` : ''}${spread ? `, and they are spread across ${spread.distinct} people` : ''}. Several clients at once, no single person: this points at Tasama's own process, not at one client.`; }, 'pattern:cross'),
      S('b6', 'Fix it once, for every client', 'إصلاح واحد لكل العملاء', 'Human step: Tasama HR Operations Manager', 'tasama', 'tasama-patterns', { kind: 'assign_pattern', pattern: 'cross', staff: 'Ahmed Al Zahrani', days: 21,
        action: 'Check when the payroll calendar\'s cut-off moved and whether client HR teams were told; add a late-change check to the calendar for all clients.' },
        (c) => `Assigned ${c.out.assigned} to Ahmed Al Zahrani, Senior Payroll Specialist (decided by the scenario). One fix in Tasama's payroll procedure covers all three clients; Basira measures again in three weeks.`, 'pattern:cross',
        { chat: () => [agent('Basira', 'Assigned to you by Faisal: check when the payroll cut-off moved and whether client HR teams were told, then add a late-change check for all clients. I measure again in three weeks.', 'Teams, to Ahmed Al Zahrani')] }),
      S('b7', 'What Basira did not flag', 'ما لم تنبه إليه بصيرة', 'Looked at, not flagged', 'tasama', 'tasama-patterns', SHOW,
        async (c) => { const w = (await pool.query(`SELECT * FROM tasama.pattern_watch WHERE client_key='seven' AND reason_code='OUTSIDE_POLICY' LIMIT 1`)).rows[0]; const n = (await pool.query(`SELECT COUNT(*)::int n FROM tasama.pattern_watch`)).rows[0].n; c.out.watchNote = w?.note ?? null; return w ? `SEVEN had a burst of advance rejections in one week, then went back to normal. Basira recorded it and did not flag it: "${w.note}" It looked at ${n} such rises in this scan. Requiring two weeks and enough cases keeps the list short enough to act on.` : 'Basira records rises it looked at and did not flag, with the reason.'; }, undefined,
        { focus: { fact: (c) => (c.out.watchNote ? `Not flagged at SEVEN: ${c.out.watchNote}` : 'Basira records every rise it looked at and did not flag, with the reason.') } }),
      S('b8', 'Ask in plain language', 'اسأل بلغة بسيطة', 'Murshid, the HR co-pilot', 'tasama', 'tasama-patterns', SHOW,
        () => 'The same information is available in chat: ask Murshid "what is rising and why?" and it answers from Basira\'s patterns, with the references.', undefined,
        { chat: async () => { const a = await patternOf('riyadhair'); const b = await patternOf('cross'); const parts = [a ? `at Riyadh Air, leave requests escalate because one approver is away with no delegate (${Number(a.current_rate)} per 100, from ${Number(a.baseline_rate)})` : null, b ? `at ${(b.client_keys as string[]).map((k) => clientByKey(k)!.short).join(', ')}, payroll changes arrive after the cut-off, which points at Tasama's own calendar` : null].filter(Boolean); return [person('Faisal Al Harbi', 'What is rising, and why?', 'Murshid'), agent('Murshid', parts.length ? `Two things: ${parts.join('; and ')}. Both have an owner and a date to measure again.` : 'Nothing is rising enough to flag this week.')]; },
          focus: { fact: 'Murshid answers from Basira\'s patterns, with the references.' } }),
    ] },
];

// ------------------------------------------------------------------ running

async function execute(a: Action, c: Ctx, hand = false): Promise<string> {
  switch (a.kind) {
    case 'show': return 'Showing';
    case 'justify_late': {
      const meta = (await pool.query(`SELECT value FROM layer.meta WHERE key='attendance'`)).rows[0].value;
      await justifyDay(pool, meta.justifier, meta.justifierDay, a.text);
      return 'Explanation sent to HR operations';
    }
    case 'overtime_inputs': {
      await ensureRedSeaRevised();
      const who: Record<string, { id: number; name: string }> = {};
      for (const key of D2_CLIENTS) {
        const p = await d2Person(key);
        who[key] = { id: p.id, name: p.display_name };
        await withClient(key, async () => {
          const per = (await pool.query(`SELECT start_date, end_date FROM hcm.payroll_periods WHERE status='OPEN' ORDER BY start_date DESC LIMIT 1`)).rows[0];
          await pool.query(`DELETE FROM hcm.element_entries WHERE reference=$1`, [D2_REF]);
          await pool.query(`INSERT INTO hcm.element_entries (entry_number, person_id, element_code, amount, effective_start, effective_end, source, reference) VALUES ($1,$2,'OT_HOURS',$3,$4,$5,'TASAMA_HR',$6)`, [`DEMO-EE-D2-${key}`, p.id, D2_HOURS, per.start_date, per.end_date, D2_REF]);
        });
      }
      c.out.d2 = who;
      for (const key of D2_CLIENTS) {
        const l = await d2Line(key, who[key].id);
        await tasamaTrail(pool, { client_key: key, actor_type: 'HUMAN', actor_id: 'tasama-specialist', actor_name: 'Nasser AlFarraj, Tasama', act: 'WRITE', summary: `Entered ${D2_HOURS} h of approved overtime for ${who[key].name} (${clientByKey(key)!.short}).`, summary_ar: `أدخل ${D2_HOURS} ساعة عمل إضافي معتمدة لـ ${who[key].name}.` });
        await tasamaTrail(pool, { client_key: key, actor_type: 'SYSTEM', actor_id: 'engine', actor_name: 'Tasama HR', act: 'CHECK', summary: `Priced ${l.hours} h at SAR ${l.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} for ${who[key].name}: ${l.rule}.${l.held ? ` ${l.held}.` : ''}`, summary_ar: `حُسبت ${l.hours} ساعة لـ ${who[key].name}.` });
      }
      return `${D2_HOURS} h entered for ${who.redsea.name} and ${who.saudicoffee.name}`;
    }
    case 'start': { const ref = await STARTERS[a.starter](c); c.refs[a.as] = ref; return `Opened ${ref}`; }
    case 'decide': {
      const k = await caseOf(c.refs[a.ref]);
      // Decided on screen before → was pressed: the room's decision stands and the story moves on.
      if (k && (hand || !['WAITING', 'ESCALATED'].includes(k.status))) { c.out[`hand_${a.ref}`] = true; if (a.followon) { const f = (await pool.query(`SELECT result->>'followon' AS f FROM layer.requests WHERE id=$1`, [k.id])).rows[0]?.f; if (f) c.refs[a.followon] = f; } return 'Decided in the room'; }
      if (!k || k.status !== 'WAITING') return `${c.refs[a.ref]} is not waiting on anyone`;
      const who = k.waiting_name ?? (k.waiting_on_role === 'TASAMA_PAYROLL_LEAD' ? 'Sharifa AlMousa' : k.waiting_on_role);
      const tasamaName = k.waiting_on_role === 'TASAMA_PAYROLL_LEAD' ? 'Sharifa AlMousa, Tasama' : k.waiting_on_role === 'TASAMA_PAYROLL' ? 'Nasser AlFarraj, Tasama' : null;
      await tx((x) => decide(x, { requestId: k.id, personId: k.waiting_on_person_id ?? 0, decision: a.decision, reason: `${a.reason} (decided by the scenario)`, edits: a.edits, actorName: a.onBehalf ? `Faisal Al Harbi (Tasama HR Operations, on behalf of ${who})` : tasamaName ?? undefined }));
      if (a.followon) { const f = (await pool.query(`SELECT result->>'followon' AS f FROM layer.requests WHERE id=$1`, [k.id])).rows[0]?.f; if (f) c.refs[a.followon] = f; }
      return `${a.decision === 'APPROVED' ? 'Approved' : 'Declined'} for ${who}`;
    }
    case 'raqeeb_scan': { const f = await raqeebScan(); return `${f.length} new flag${f.length === 1 ? '' : 's'}`; }
    case 'nudge': {
      const e = (await pool.query(`SELECT id FROM tasama.escalations WHERE client_key=$1 AND case_ref=$2`, [c.client, c.refs[a.ref]])).rows[0];
      if (!e) return 'No escalation for this case yet';
      await nudge(e.id); return 'Reminder sent';
    }
    case 'basira_scan': { const r = await basiraScan(); c.out.scan = r; return `${r.flagged.length} flagged, ${r.watched} not flagged`; }
    case 'assign_pattern': {
      const p = await patternOf(a.pattern); if (!p) return 'No such pattern';
      const s = (await pool.query(`SELECT id FROM tasama.staff WHERE name=$1`, [a.staff])).rows[0];
      const action = typeof a.action === 'function' ? await a.action(c) : a.action;
      const { assignPattern } = await import('./tasama/basira.js');
      await assignPattern(p.id, 'Faisal Al Harbi (decided by the scenario)', { staff_id: s.id, action, recheck_days: a.days });
      c.out.assigned = p.ref; return `${p.ref} assigned to ${a.staff}`;
    }
    case 'prepare_invoice': { const inv = await prepareInvoice(clientByKey(c.client)!, monthStart(now(), -1)); c.out.inv = inv; return `Prepared ${inv.number}`; }
    case 'approve_invoice': {
      const number = c.out.inv?.number ?? `TAS-${clientByKey(c.client)!.code}-${iso(monthStart(now(), -1)).slice(0, 7).replace('-', '')}`;
      const inv = (await pool.query(`SELECT * FROM tasama.invoices WHERE number=$1`, [number])).rows[0];
      c.out.inv = { ...(c.out.inv ?? {}), ...inv };
      if (!inv || inv.status !== 'PREPARED') return `${number} is ${inv?.status ?? 'missing'}, not waiting for approval`;
      const issued = iso(now());
      await pool.query(`UPDATE tasama.invoices SET status='ISSUED', issued_at=$2, due_at=$3 WHERE id=$1`, [inv.id, issued, iso(addDays(issued, 30))]);
      await tasamaTrail(pool, { client_key: inv.client_key, actor_type: 'HUMAN', actor_id: 'tasama', actor_name: 'Faisal Al Harbi (decided by the scenario)', act: 'APPROVE', ref: inv.number, summary: `Approved and issued ${inv.number}.`, summary_ar: `اعتمد وأصدر ${inv.number}.` });
      return `Issued ${inv.number}`;
    }
  }
}

const text = async (t: Text | undefined, c: Ctx) => (typeof t === 'function' ? await t(c) : t ?? '');

/** The one idea under the record in pane 03: the decision, the pattern, the invoice, the letter, the service levels, the refusal or one fact. */
async function focusOf(st: Step, c: Ctx, caseRef: string | null, pattern: string | null) {
  const f = st.focus;
  if (f && typeof f === 'object') return { kind: 'fact', text: await text(f.fact, c) };
  if (f === 'document') {
    const doc = (await pool.query(`SELECT document_number, type, addressee, purpose, language, status, issued_at, body FROM hcm.document_records WHERE person_id=$1 ORDER BY issued_at DESC NULLS LAST, id DESC LIMIT 1`, [c.P.employee])).rows[0];
    return doc ? { kind: 'document', doc } : null;
  }
  if (f === 'sla') {
    const month = monthStart(now(), -1);
    const rows = (await slaFor(clientByKey(c.client)!, month)).filter((s) => s.ok !== null).map((s) => ({ label: s.label, label_ar: s.label_ar, attainment: s.attainment, target: s.target, ok: s.ok }));
    return { kind: 'sla', month: monthLabel(month), rows };
  }
  if (f === 'invoice') {
    const inv = c.out.inv?.number ? (await pool.query(`SELECT * FROM tasama.invoices WHERE number=$1`, [c.out.inv.number])).rows[0] : null;
    return inv ? { kind: 'invoice', number: inv.number, client: clientByKey(c.client)!.name, period: monthLabel(inv.period), headcount: inv.headcount, pepm: clientByKey(c.client)!.contract.pepm, base_fee: Number(inv.base_fee), hire_fees: Number(inv.hire_fees), credits: Number(inv.credits), credit_lines: inv.credit_lines, vat: Number(inv.vat), total: Number(inv.total), status: inv.status } : null;
  }
  if (f === 'refusal') {
    const k = c.refs.scr ? await caseOf(c.refs.scr) : null;
    if (!k) return null;
    const rows = (await pool.query(`SELECT actor_name, act, summary, citation FROM layer.trail WHERE request_id=$1 AND actor_type='AGENT' ORDER BY at, id`, [k.id])).rows;
    const r = rows.find((x: any) => /refus|declin|cannot|will not/i.test(x.summary)) ?? rows.find((x: any) => x.citation) ?? rows[0];
    return r ? { kind: 'refusal', who: r.actor_name, text: r.summary, citation: r.citation, instruction: 'Only shortlist candidates under 35, we want a young team' } : null;
  }
  if (caseRef) return { kind: 'case', ref: caseRef };
  if (pattern) {
    const p = (await pool.query(`SELECT p.*, s.name AS owner FROM tasama.patterns p LEFT JOIN tasama.staff s ON s.id=p.owner_staff_id WHERE p.ref=$1`, [pattern])).rows[0];
    if (!p) return null;
    return { kind: 'pattern', ref: p.ref, title: p.title, title_ar: p.title_ar, clients: (p.client_keys as string[]).map((k) => clientByKey(k)!.short), current: Number(p.current_rate), baseline: Number(p.baseline_rate),
      series: (p.series as any[]).map((x) => ({ week: x.week, rate: Number(x.rate) })), cause: (p.causes as any[])[0]?.cause ?? null, evidence: (p.causes as any[])[0]?.evidence ?? null, status: p.status, owner: p.owner, action: p.action, recheck_on: p.recheck_on };
  }
  return null;
}

async function snapshot(client: string) {
  return {
    trail: await withClient(client, async () => (await pool.query(`SELECT COALESCE(MAX(id),0) n FROM layer.trail`)).rows[0].n as number),
    tasama: (await pool.query(`SELECT COALESCE(MAX(id),0) n FROM tasama.trail`)).rows[0].n as number,
    at: (await pool.query(`SELECT clock_timestamp() AS t`)).rows[0].t as Date,
  };
}
async function changes(client: string, s: Awaited<ReturnType<typeof snapshot>>) {
  return withClient(client, async () => ({
    trail: (await pool.query(`SELECT t.id, t.actor_type, t.actor_id, t.actor_name, t.act, t.autonomy, t.summary, t.citation, r.ref FROM layer.trail t LEFT JOIN layer.requests r ON r.id=t.request_id WHERE t.id > $1 ORDER BY t.id LIMIT 40`, [s.trail])).rows,
    cases: (await pool.query(`SELECT r.ref, r.title, r.status, w.display_name AS waiting_on FROM layer.requests r LEFT JOIN hcm.persons w ON w.id=r.waiting_on_person_id WHERE r.updated_at >= $1 AND r.updated_at <= clock_timestamp() ORDER BY r.updated_at DESC LIMIT 12`, [s.at])).rows,
    tasama: (await pool.query(`SELECT id, actor_type, actor_id, actor_name, act, autonomy, summary, ref FROM tasama.trail WHERE id > $1 ORDER BY id LIMIT 20`, [s.tasama])).rows,
  }));
}

const findScript = (key: string) => { const s = SCRIPTS.find((x) => x.key === key); if (!s) throw new Error(`Unknown scenario ${key}`); return s; };
const outline = (s: Scenario) => ({ key: s.key, level: s.level, client: s.client ?? null, shape: s.shape, shape_ar: s.shape_ar, title: s.title, title_ar: s.title_ar, summary: s.summary, summary_ar: s.summary_ar, steps: s.steps.map((st) => ({ id: st.id, title: st.title, title_ar: st.title_ar, trigger: st.trigger, persona: st.persona, screen: st.screen, kind: st.action.kind })) });
export const listScripts = () => SCRIPTS.map(outline);

export async function startScenario(key: string, clientKey: string) {
  const s = findScript(key);
  const client = s.client ?? (clientByKey(clientKey) ? clientKey : DEFAULT_CLIENT);
  await pool.query(`UPDATE tasama.director_runs SET status='ABANDONED', finished_at=now() WHERE status='RUNNING'`);
  // The pattern scenario starts from no open patterns, so the audience sees Basira find them.
  // D1 starts from the handbook as it was seeded: version 1.0 active, no revised version read yet.
  if (key === 'policy-reading') await withClient('redsea', async () => {
    await pool.query(`DELETE FROM layer.policy_versions WHERE version <> '1.0'`);
    await pool.query(`UPDATE layer.policy_versions SET status='ACTIVE' WHERE version='1.0'`);
    for (const p of policiesFor(clientByKey('redsea')!)) for (const k of p.clauses) await pool.query(`UPDATE layer.policy_clauses SET text_en=$2, text_ar=$3 WHERE id=$1`, [`${p.id} §${k.ref}`, k.en, k.ar]);
  });
  // D3 starts before the export arrives: no upload, no attendance entries.
  if (key === 'attendance-month') await withClient('saudicoffee', async () => { await pool.query(`DELETE FROM layer.attendance_uploads`); await pool.query(`DELETE FROM hcm.element_entries WHERE reference LIKE 'Attendance %'`); });
  // D2 starts with no overtime entered; its first step enters it.
  if (key === 'overtime-two-clients') for (const k of D2_CLIENTS) await withClient(k, async () => { await pool.query(`DELETE FROM hcm.element_entries WHERE reference=$1`, [D2_REF]); });
  if (key === 'pattern-rca') { await pool.query(`DELETE FROM tasama.patterns WHERE status <> 'CLOSED'`); await pool.query(`DELETE FROM tasama.pattern_watch`); }
  const run = (await pool.query(`INSERT INTO tasama.director_runs (key, client_key) VALUES ($1,$2) RETURNING *`, [key, client])).rows[0];
  return { run: run.id, client, scenario: outline(s) };
}

export async function runStep(runId: number, index: number, hand = false) {
  const run = (await pool.query(`SELECT * FROM tasama.director_runs WHERE id=$1`, [runId])).rows[0];
  if (!run) throw new Error('No such scenario run');
  const s = findScript(run.key);
  const st = s.steps[index];
  if (!st) throw new Error(`No step ${index + 1}`);
  const t0 = Date.now();
  return withClient(run.client_key, async () => {
    const { P, T } = await people();
    const c: Ctx = { key: s.key, client: run.client_key, refs: run.refs ?? {}, P, T, out: (run.log as any[]).reduce((o, l) => ({ ...o, ...(l.out ?? {}) }), {}) };
    const snap = await snapshot(c.client);
    let result = '', error: string | null = null;
    try { result = await execute(st.action, c, hand); } catch (e: any) { error = e.message; console.error('[director]', s.key, st.id, e); }
    let narration = '';
    try { narration = await text(st.say, c); } catch (e: any) { narration = ''; if (!error) error = e.message; }
    const ch = await changes(c.client, snap);
    // Where the app should look.
    let caseRef: string | null = null, pattern: string | null = null;
    if (st.open?.startsWith('case:')) caseRef = c.refs[st.open.slice(5)] ?? null;
    if (st.open?.startsWith('pattern:')) pattern = (await patternOf(st.open.slice(8) as any))?.ref ?? null;
    // The Stage: what the person asking saw, the record as the system holds it, and the one idea under it.
    let chat: Line[] = [], record: Rec | null = null, focus: any = null;
    try { chat = st.chat ? await st.chat(c) : []; } catch (e: any) { console.error('[director] chat', s.key, st.id, e); }
    try { record = s.record ? await s.record(c) : null; } catch (e: any) { console.error('[director] record', s.key, st.id, e); }
    try { focus = await focusOf(st, c, caseRef, pattern); } catch (e: any) { console.error('[director] focus', s.key, st.id, e); }
    // The next step, when it is a decision the room can take on screen.
    const nx = s.steps[index + 1];
    // The state the next decision's case is in now: the Stage moves on when the room changes it.
    let next: { kind: string; ref: string | null; state?: string } | null = nx ? { kind: nx.action.kind, ref: null } : null;
    if (nx && nx.action.kind === 'decide') { const ref = c.refs[nx.action.ref] ?? null; const k = ref ? await caseOf(ref) : null; next = { kind: 'decide', ref, state: k ? `${k.status}:${k.waiting_on_person_id ?? ''}` : undefined }; }
    const done = index >= s.steps.length - 1;
    const out = { ...c.out }; if (out.inv) out.inv = { number: out.inv.number, headcount: out.inv.headcount, base_fee: out.inv.base_fee, credits: out.inv.credits, total: out.inv.total };
    await pool.query(`UPDATE tasama.director_runs SET step_index=$2, refs=$3, log = log || $4::jsonb, status=$5, finished_at=$6 WHERE id=$1`,
      [run.id, index, JSON.stringify(c.refs), JSON.stringify([{ step: st.id, result, error, out, ms: Date.now() - t0, at: new Date() }]), done ? 'DONE' : 'RUNNING', done ? new Date() : null]);
    return { index, total: s.steps.length, step: { id: st.id, title: st.title, title_ar: st.title_ar, trigger: st.trigger, kind: st.action.kind }, narration, persona: st.persona, client: c.client, screen: st.screen, caseRef, pattern, result, error, changes: ch, chat, record, focus, next, ms: Date.now() - t0 };
  });
}

export async function stopScenario() {
  await pool.query(`UPDATE tasama.director_runs SET status='ABANDONED', finished_at=now() WHERE status='RUNNING'`);
}
void CLIENTS;
