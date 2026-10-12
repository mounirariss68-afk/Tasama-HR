/** Cases: create, read, decide; the inbox; the lifecycle board. */
import { Router } from 'express';
import { pool, tx, currentClient } from '../db.js';
import { startCase, decide, type StartIn } from '../engine/core.js';
import { recordIssue } from '../tasama/basira.js';
import { REJECT_REASONS } from '../domain/reasons.js';
import { letterName } from '../engine/handlers.js';
import { caseScope, personaOf, has, type Persona } from './session.js';
import { TASAMA_KEY } from './session.js';
import { WORKFLOWS } from '../domain/workflows.js';
import { iso, addDays, daysBetween } from '../domain/rules.js';

export const cases = Router();

const LETTERS = ['SALARY_CERTIFICATE', 'EMPLOYMENT_CERTIFICATE', 'SALARY_TRANSFER', 'NOC_TRAVEL', 'NOC_DRIVING', 'EXPERIENCE'];

/** Map a request type from a form or the assistant onto its workflow. Validates what the persona may start. */
export async function buildCase(p: Persona, body: any, channel: StartIn['channel']): Promise<StartIn> {
  const type = String(body.type);
  const subject = Number(body.subject_person_id ?? p.person_id);
  if (subject !== p.person_id) {
    const allowed = has(p, 'LINE_MANAGER') || has(p, 'HRBP') || has(p, 'CHRO') || has(p, 'PAYROLL') || has(p, 'TA');
    if (!allowed) throw new Error('You can only raise requests for yourself.');
  }
  if (LETTERS.includes(type)) return { workflowId: 'WF-14', type, title: letterName(type), title_ar: letterName(type, true), requester: p.person_id, subject, channel, payload: { letter_type: type, addressee: body.addressee ?? '', language: body.language ?? 'en', purpose: body.purpose ?? null } };
  if (type === 'LEAVE') {
    const days = Number(body.days ?? daysBetween(body.start, body.end) + 1);
    const tc = body.type_code ?? 'ANNUAL';
    const nm: Record<string, [string, string]> = { ANNUAL: ['Annual leave', 'إجازة سنوية'], SICK: ['Sick leave', 'إجازة مرضية'], UNPAID: ['Unpaid leave', 'إجازة بدون راتب'], PARENTAL: ['Parental leave', 'إجازة والدية'], BEREAVEMENT: ['Bereavement leave', 'إجازة حداد'], STUDY: ['Study leave', 'إجازة دراسية'] };
    const [en, ar] = nm[tc] ?? [tc, tc];
    return { workflowId: 'WF-15', type: 'LEAVE', title: `${en}, ${days} day${days === 1 ? '' : 's'}`, title_ar: `${ar}، ${days} أيام`, requester: p.person_id, subject, channel, payload: { type_code: tc, start: body.start, end: body.end, days, reason: body.reason ?? null } };
  }
  if (type === 'ADVANCE') return { workflowId: 'WF-16', type: 'ADVANCE', title: `Salary advance SAR ${Number(body.amount).toLocaleString('en-US')}`, title_ar: `سلفة راتب ${Number(body.amount).toLocaleString('en-US')} ريال`, requester: p.person_id, subject, channel, payload: { amount: Number(body.amount), months: Number(body.months ?? 6), reason: body.reason ?? null } };
  if (type === 'RESIGNATION') {
    const n = (await pool.query('SELECT display_name, display_name_ar FROM hcm.persons WHERE id=$1', [subject])).rows[0];
    return { workflowId: 'WF-19', type: 'RESIGNATION', title: `Resignation: ${n.display_name}`, title_ar: `استقالة: ${n.display_name_ar}`, requester: p.person_id, subject, channel, payload: { person_id: subject, notice_date: body.notice_date ?? iso(new Date()), reason: body.reason ?? null } };
  }
  if (type === 'POSITION') {
    if (!has(p, 'LINE_MANAGER') && !has(p, 'CHRO')) throw new Error('Only a line manager can request a position.');
    const d = (await pool.query(`SELECT d.id, d.division FROM hcm.assignments a JOIN hcm.departments d ON d.id=a.department_id WHERE a.person_id=$1 AND a.effective_end='4712-12-31'`, [p.person_id])).rows[0];
    return { workflowId: 'WF-01', type: 'POSITION', title: `New position: ${body.job_title}`, title_ar: `وظيفة جديدة: ${body.job_title_ar ?? body.job_title}`, requester: p.person_id, subject: p.person_id, channel, doneAtStart: ['intake'], payload: { department_id: Number(body.department_id ?? d.id), job_title: body.job_title, job_title_ar: body.job_title_ar ?? body.job_title, grade_rank: Number(body.grade_rank ?? 8), budgeted: body.budgeted !== false, reason: body.reason ?? '', division: d.division } };
  }
  if (type === 'PROMOTION') {
    const n = (await pool.query('SELECT display_name, display_name_ar FROM hcm.persons WHERE id=$1', [subject])).rows[0];
    return { workflowId: 'WF-12', type: 'PROMOTION', title: `Promotion: ${n.display_name} to G${String(body.to_rank).padStart(2, '0')}`, title_ar: `ترقية: ${n.display_name_ar}`, requester: p.person_id, subject, channel, payload: { person_id: subject, to_rank: Number(body.to_rank) } };
  }
  if (type === 'INVOLUNTARY') {
    const n = (await pool.query('SELECT display_name, display_name_ar FROM hcm.persons WHERE id=$1', [subject])).rows[0];
    return { workflowId: 'WF-20', type: 'INVOLUNTARY', title: `Termination request: ${n.display_name}`, title_ar: `طلب إنهاء خدمة: ${n.display_name_ar}`, requester: p.person_id, subject, channel, doneAtStart: ['intake'], priority: 'HIGH', payload: { person_id: subject, grounds: body.grounds ?? 'PERFORMANCE', details: body.details ?? '' } };
  }
  if (type === 'PRECHECK') {
    if (!has(p, 'PAYROLL') && !has(p, 'CHRO')) throw new Error('Only Payroll can start the pre-run check.');
    const per = (await pool.query(`SELECT period_name FROM hcm.payroll_periods WHERE status='OPEN' ORDER BY start_date LIMIT 1`)).rows[0];
    return { workflowId: 'WF-13', type: 'PRECHECK', title: `Payroll pre-run check: ${per.period_name}`, title_ar: `فحص ما قبل تشغيل الرواتب: ${per.period_name}`, requester: p.person_id, subject: p.person_id, channel, priority: 'HIGH', payload: { period: per.period_name } };
  }
  throw new Error(`Unknown request type ${type}`);
}

cases.post('/requests', async (req, res) => {
  const p = await personaOf(req);
  try {
    const s = await buildCase(p, req.body, req.body.channel === 'CHAT' ? 'CHAT' : 'FORM');
    const r = await tx((c) => startCase(c, s));
    res.json(r);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

const LIST_SQL = `
  SELECT r.*, wd.name AS workflow_name, wd.name_ar AS workflow_name_ar, wd.stage,
         s.display_name AS subject_name, s.display_name_ar AS subject_name_ar, s.person_number AS subject_number,
         q.display_name AS requester_name, w.display_name AS waiting_on_name, w.display_name_ar AS waiting_on_name_ar,
         (SELECT agent_step.actor_id FROM layer.run_steps agent_step WHERE agent_step.request_id=r.id AND agent_step.actor_type='AGENT' ORDER BY agent_step.seq DESC LIMIT 1) AS last_agent
    FROM layer.requests r
    JOIN layer.workflow_defs wd ON wd.id = r.workflow_id
    JOIN hcm.persons s ON s.id = r.subject_person_id
    JOIN hcm.persons q ON q.id = r.requester_person_id
    LEFT JOIN hcm.persons w ON w.id = r.waiting_on_person_id`;

cases.get('/requests', async (req, res) => {
  const p = await personaOf(req);
  const view = String(req.query.view ?? 'mine');
  const where: string[] = [];
  const params: unknown[] = [];
  if (view === 'mine') { params.push(p.person_id); where.push(`(r.requester_person_id = $1 OR r.subject_person_id = $1)`); }
  else if (view === 'inbox') {
    params.push(p.person_id);
    where.push(`(r.waiting_on_person_id = $1 AND r.status IN ('WAITING','ESCALATED'))`);
  } else {
    const [sql, ps] = caseScope(p, 1); params.push(...ps); where.push(sql);
  }
  if (req.query.status) { params.push(String(req.query.status).split(',')); where.push(`r.status = ANY($${params.length})`); }
  if (req.query.workflow) { params.push(String(req.query.workflow).split(',')); where.push(`r.workflow_id = ANY($${params.length})`); }
  const limit = Math.min(500, Number(req.query.limit ?? 200));
  const rows = (await pool.query(`${LIST_SQL} WHERE ${where.join(' AND ') || 'true'} ORDER BY (r.status IN ('WAITING','ESCALATED')) DESC, r.updated_at DESC LIMIT ${limit}`, params)).rows;
  res.json(rows);
});

cases.get('/requests/:ref', async (req, res) => {
  const p = await personaOf(req);
  const [sql, ps] = caseScope(p, 2);
  const r = (await pool.query(`${LIST_SQL} WHERE r.ref = $1 AND ${sql}`, [req.params.ref, ...ps])).rows[0];
  if (!r) return res.status(404).json({ error: 'Not found, or outside your scope' });
  const [steps, approvals, trail, logs] = await Promise.all([
    pool.query(`SELECT * FROM layer.run_steps WHERE request_id=$1 ORDER BY seq`, [r.id]),
    pool.query(`SELECT a.*, pp.display_name AS approver_name FROM layer.approvals a LEFT JOIN hcm.persons pp ON pp.id=a.approver_person_id WHERE request_id=$1 ORDER BY id`, [r.id]),
    pool.query(`SELECT * FROM layer.trail WHERE request_id=$1 ORDER BY at, id`, [r.id]),
    pool.query(`SELECT * FROM layer.integration_log WHERE request_id=$1 ORDER BY at, id`, [r.id]),
  ]);
  const def = WORKFLOWS.find((w) => w.id === r.workflow_id)!;
  res.json({ ...r, steps: steps.rows.map((s: any) => ({ ...s, def: def.steps.find((d) => d.key === s.step_key) })), approvals: approvals.rows, trail: trail.rows, logs: logs.rows, canDecide: ['WAITING', 'ESCALATED'].includes(r.status) && r.waiting_on_person_id === p.person_id });
});

cases.post('/requests/:ref/decide', async (req, res) => {
  const p = await personaOf(req);
  const r = (await pool.query(`SELECT * FROM layer.requests WHERE ref=$1`, [req.params.ref])).rows[0];
  if (!r) return res.status(404).json({ error: 'Not found' });
  // Tasama HR Operations may act on any case of a client it serves, on behalf of the approver, with a reason on the record.
  const onBehalf = p.key === TASAMA_KEY;
  if (!onBehalf && r.waiting_on_person_id !== p.person_id) return res.status(403).json({ error: `This decision belongs to ${r.waiting_on_role}, not to ${p.label}.` });
  if (onBehalf && !String(req.body.reason ?? '').trim()) return res.status(400).json({ error: 'Tasama HR Operations decides on behalf of the client approver only with a reason on the record.' });
  const behalfName = onBehalf ? (await pool.query('SELECT display_name FROM hcm.persons WHERE id=$1', [r.waiting_on_person_id])).rows[0]?.display_name ?? r.waiting_on_role : '';
  try {
    await tx((c) => decide(c, { requestId: r.id, personId: onBehalf ? (r.waiting_on_person_id ?? 0) : p.person_id, decision: req.body.decision, reason: req.body.reason, edits: req.body.edits, actorName: onBehalf ? `${p.display_name} (Tasama HR Operations, on behalf of ${behalfName})` : undefined }));
    // A rejection is an issue for Basira's pattern watch, with the reason the decider picked.
    if (req.body.decision === 'REJECTED') {
      const code = REJECT_REASONS.includes(req.body.reason_code) ? req.body.reason_code : 'NOT_RECORDED';
      await recordIssue(currentClient()!, { category: 'REJECTION', workflow_id: r.workflow_id, reason_code: code, case_ref: r.ref, summary: `${r.title} declined by ${onBehalf ? `${p.display_name} on behalf of ${behalfName}` : p.display_name}${req.body.reason ? `: ${String(req.body.reason).slice(0, 140)}` : ''}`, attrs: { decided_by: onBehalf ? behalfName : p.display_name, step: r.current_step } });
    }
    res.json((await pool.query(`SELECT * FROM layer.requests WHERE id=$1`, [r.id])).rows[0]);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

cases.post('/requests/:ref/withdraw', async (req, res) => {
  const p = await personaOf(req);
  const r = (await pool.query(`SELECT * FROM layer.requests WHERE ref=$1 AND requester_person_id=$2 AND status IN ('WAITING','RUNNING')`, [req.params.ref, p.person_id])).rows[0];
  if (!r) return res.status(404).json({ error: 'Not found or not yours to withdraw' });
  await pool.query(`UPDATE layer.requests SET status='CANCELLED', waiting_on_role=NULL, waiting_on_person_id=NULL, closed_at=now(), updated_at=now() WHERE id=$1`, [r.id]);
  await pool.query(`UPDATE layer.approvals SET decision='RETURNED', reason='Withdrawn by requester', decided_at=now() WHERE request_id=$1 AND decision='PENDING'`, [r.id]);
  await pool.query(`INSERT INTO layer.trail (request_id, actor_type, actor_id, actor_name, act, summary, summary_ar) VALUES ($1,'HUMAN',$2,$3,'REJECT','Withdrawn by the requester','سحبه مقدم الطلب')`, [r.id, String(p.person_id), p.display_name]);
  res.json({ ok: true });
});

/** The lifecycle board: Intake, In flight, Output, across every workflow in the persona's scope. */
cases.get('/lifecycle', async (req, res) => {
  const p = await personaOf(req);
  const [sql, ps] = caseScope(p, 1);
  const rows = (await pool.query(`${LIST_SQL} WHERE ${sql} AND (r.status IN ('RUNNING','WAITING','ESCALATED') OR r.closed_at > now() - interval '7 days' OR r.created_at > now() - interval '2 days') ORDER BY r.updated_at DESC LIMIT 300`, ps)).rows;
  const dest = (r: any) => r.result?.document_number ? `HRMS documentRecords · ${r.result.document_number}` : r.result?.absence_number ? `HRMS absences · ${r.result.absence_number}` : r.result?.advance_number ? `HRMS elementEntries · ${r.result.advance_number}` : r.result?.position_code ? `HRMS positions · ${r.result.position_code}` : r.result?.req_number ? `HRMS requisitions · ${r.result.req_number}` : r.result?.offer_number ? `HRMS offers · ${r.result.offer_number}` : r.workflow_id === 'WF-10' ? 'HRMS performanceDocuments' : r.workflow_id === 'WF-13' ? 'Mudad wage file → bank' : r.workflow_id === 'WF-19' || r.workflow_id === 'WF-20' ? 'HRMS workers (termination) · Qiwa' : r.workflow_id === 'WF-08' ? 'HRMS assignments' : r.workflow_id === 'WF-12' ? 'HRMS assignments, salaries, element entries' : 'HRMS';
  res.json({
    // Intake = what ARRIVED in the last three days, and from where (chat, form, HRMS event, schedule).
    intake: rows.filter((r: any) => new Date(r.created_at).getTime() > Date.now() - 3 * 86400000).slice(0, 40),
    inflight: rows.filter((r: any) => ['WAITING', 'ESCALATED'].includes(r.status)),
    output: rows.filter((r: any) => ['COMPLETED', 'REJECTED'].includes(r.status) && r.closed_at > new Date(Date.now() - 7 * 86400000)).slice(0, 40).map((r: any) => ({ ...r, destination: r.status === 'REJECTED' ? 'Declined: requester notified' : dest(r) })),
  });
});
void addDays;
