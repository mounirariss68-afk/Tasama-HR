/** Cases: create, read, decide; the inbox; the lifecycle board. */
import { Router } from 'express';
import { ibanValid, bankByIban } from '../domain/banks.js';
import { pool, tx, currentClient } from '../db.js';
import { startCase, decide, type StartIn } from '../engine/core.js';
import { recordIssue } from '../tasama/basira.js';
import { REJECT_REASONS } from '../domain/reasons.js';
import { letterName } from '../engine/handlers.js';
import { caseScope, personaOf, has, type Persona } from './session.js';
import { TASAMA_KEY, isTasamaStaff } from './session.js';
import { aiConfigured, createMessage } from '../ai.js';
import { tasamaTrail } from '../tasama/service.js';
import { draftRun } from '../payroll/run.js';
import { runChecks } from '../payroll/checks.js';
import { client } from '../domain/rules.js';
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
         q.display_name AS requester_name,
         COALESCE(w.display_name, CASE r.waiting_on_role WHEN 'TASAMA_PAYROLL_LEAD' THEN 'Sharifa AlMousa' WHEN 'TASAMA_PAYROLL' THEN 'Nasser AlFarraj' END) AS waiting_on_name,
         COALESCE(w.display_name_ar, CASE r.waiting_on_role WHEN 'TASAMA_PAYROLL_LEAD' THEN 'شريفة الموسى' WHEN 'TASAMA_PAYROLL' THEN 'ناصر الفراج' END) AS waiting_on_name_ar,
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
  const reminders = trail.rows.filter((x: any) => x.act === 'REMIND').map((x: any) => ({ at: x.at, by: x.actor_name }));
  const canRemind = isTasamaStaff(p) && ['WAITING', 'ESCALATED'].includes(r.status) && r.waiting_on_person_id !== null && r.waiting_on_person_id !== p.person_id;
  res.json({ ...r, reminders, canRemind, client: client().key, client_short: client().short, client_ar: client().name_ar, steps: steps.rows.map((s: any) => ({ ...s, def: def.steps.find((d) => d.key === s.step_key) })), approvals: approvals.rows, trail: trail.rows, logs: logs.rows, canDecide: ['WAITING', 'ESCALATED'].includes(r.status) && (r.waiting_on_person_id === p.person_id || (r.waiting_on_person_id === null && p.roles.includes(r.waiting_on_role))) });
});

cases.post('/requests/:ref/decide', async (req, res) => {
  const p = await personaOf(req);
  const r = (await pool.query(`SELECT * FROM layer.requests WHERE ref=$1`, [req.params.ref])).rows[0];
  if (!r) return res.status(404).json({ error: 'Not found' });
  // Tasama HR Operations may act on any case of a client it serves, on behalf of the approver, with a reason on the record.
  const onBehalf = p.key === TASAMA_KEY;
  // Tasama's payroll team decides the cases that wait on its role (design/payroll-addendum.md §2).
  const tasamaRole = r.waiting_on_person_id === null && p.roles.includes(r.waiting_on_role);
  if (!onBehalf && !tasamaRole && r.waiting_on_person_id !== p.person_id) return res.status(403).json({ error: `This decision belongs to ${r.waiting_on_role}, not to ${p.label}.` });
  if (onBehalf && !String(req.body.reason ?? '').trim()) return res.status(400).json({ error: 'Tasama HR Operations decides on behalf of the client approver only with a reason on the record.' });
  // WF-30 (§18): nothing goes for validation while a check stops it; the lead never validates a run she prepared.
  if (r.workflow_id === 'WF-30' && req.body.decision === 'APPROVED') {
    if (r.current_step === 'prepare') {
      const d = await draftRun(pool);
      const blocks = d ? (await runChecks(pool, d)).checks.filter((x) => x.severity === 'BLOCK').length : 0;
      if (blocks) return res.status(400).json({ error: `${blocks} ${blocks === 1 ? 'check stops' : 'checks stop'} the run. Clear ${blocks === 1 ? 'it' : 'them'} on Runs › Checks first.` });
      req.body.edits = { ...(req.body.edits ?? {}), prepared_by: p.key, prepared_by_name: p.display_name };
    }
    if (r.current_step === 'validate') {
      if (r.payload?.prepared_by === p.key) return res.status(403).json({ error: `${p.display_name} prepared this run, so someone else validates it.` });
      req.body.edits = { ...(req.body.edits ?? {}), validated_by_name: p.display_name };
    }
  }
  // WF-36, a returned salary (§20): the new IBAN must pass its check digits and differ from the one returned.
  if (r.workflow_id === 'WF-36' && r.payload?.kind === 'PAYMENT_RETURNED' && req.body.decision === 'APPROVED') {
    const iban = String(req.body.edits?.new_iban ?? '').replace(/\s/g, '').toUpperCase();
    if (!ibanValid(iban)) return res.status(400).json({ error: 'The new IBAN does not pass its check digits.' });
    if (!bankByIban(iban)) return res.status(400).json({ error: 'The new IBAN names a bank that is not in the registry.' });
    const old = (await pool.query(`SELECT iban FROM hcm.persons WHERE id=$1`, [r.payload.person_id])).rows[0]?.iban;
    if (old === iban) return res.status(400).json({ error: 'This is the IBAN the bank returned.' });
    req.body.edits = { ...(req.body.edits ?? {}), new_iban: iban };
  }
  // WF-33 (§20): a file with a failing release check is not sent; the sender is on the record.
  if (r.workflow_id === 'WF-33' && r.current_step === 'send' && req.body.decision === 'APPROVED') {
    const pay = (await pool.query(`SELECT checks FROM layer.payments WHERE id=$1`, [r.payload?.payment_id])).rows[0];
    const bad = (pay?.checks ?? []).filter((k: any) => !k.ok);
    if (bad.length) return res.status(400).json({ error: `${bad.length} release ${bad.length === 1 ? 'check fails' : 'checks fail'}: ${bad[0].text}.` });
    req.body.edits = { ...(req.body.edits ?? {}), sent_by_name: p.display_name };
  }
  const behalfName = onBehalf ? (await pool.query('SELECT display_name FROM hcm.persons WHERE id=$1', [r.waiting_on_person_id])).rows[0]?.display_name ?? r.waiting_on_role : '';
  try {
    await tx((c) => decide(c, { requestId: r.id, personId: onBehalf ? (r.waiting_on_person_id ?? 0) : p.person_id, decision: req.body.decision, reason: req.body.reason, edits: req.body.edits, actorName: onBehalf ? `${p.display_name} (Tasama HR Operations, on behalf of ${behalfName})` : tasamaRole ? `${p.display_name}, Tasama` : undefined }));
    // A rejection is an issue for Basira's pattern watch, with the reason the decider picked.
    if (req.body.decision === 'REJECTED') {
      const code = REJECT_REASONS.includes(req.body.reason_code) ? req.body.reason_code : 'NOT_RECORDED';
      await recordIssue(currentClient()!, { category: 'REJECTION', workflow_id: r.workflow_id, reason_code: code, case_ref: r.ref, summary: `${r.title} declined by ${onBehalf ? `${p.display_name} on behalf of ${behalfName}` : p.display_name}${req.body.reason ? `: ${String(req.body.reason).slice(0, 140)}` : ''}`, attrs: { decided_by: onBehalf ? behalfName : p.display_name, step: r.current_step } });
    }
    res.json((await pool.query(`SELECT * FROM layer.requests WHERE id=$1`, [r.id])).rows[0]);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

/**
 * Reminders (design/payroll-addendum.md §15). Tasama staff see who holds a case and can
 * nudge them. Raqeeb drafts the email; the sender edits it and sends. The email is a mock:
 * it lands as a notification in the person's Tasama HR inbox and on the case trail, and
 * nothing leaves the platform.
 */
async function reminderContext(ref: string) {
  const r = (await pool.query(`${LIST_SQL} WHERE r.ref = $1`, [ref])).rows[0];
  if (!r) return null;
  const who = r.waiting_on_person_id ? (await pool.query(`SELECT display_name, work_email FROM hcm.persons WHERE id=$1`, [r.waiting_on_person_id])).rows[0] : null;
  const step = (await pool.query(`SELECT label, started_at FROM layer.run_steps WHERE request_id=$1 AND status='WAITING' ORDER BY seq DESC LIMIT 1`, [r.id])).rows[0];
  const sent = (await pool.query(`SELECT count(*)::int n FROM layer.trail WHERE request_id=$1 AND act='REMIND'`, [r.id])).rows[0].n;
  return { r, who, step, sent };
}

const ROLE_WORDS: Record<string, string> = { LINE_MANAGER: 'line manager', HRBP: 'HR business partner', TA: 'talent acquisition', PAYROLL: 'HR operations', CHRO: 'CHRO' };

function templateDraft(x: NonNullable<Awaited<ReturnType<typeof reminderContext>>>, sender: string) {
  const { r, who, step, sent } = x;
  const first = String(who?.display_name ?? '').split(' ')[0] || 'there';
  const since = step?.started_at ?? r.updated_at;
  const days = Math.max(0, daysBetween(iso(new Date(since)), iso(new Date())));
  const due = r.sla_due ? new Date(r.sla_due) : null;
  const late = due && due.getTime() < Date.now();
  const extra = r.workflow_id === 'WF-29' ? ' It sets the attendance deductions for this month\'s payroll, so the run cannot close until it is confirmed.' : '';
  const subject = `${sent ? 'Second reminder' : 'Reminder'}: ${r.title} is waiting for you`;
  const body = [
    `Dear ${first},`,
    '',
    `${r.title} has been waiting for your decision ${days === 0 ? 'since today' : days === 1 ? 'for one day' : `for ${days} days`}${due ? `, and ${late ? 'was due on' : 'is due by'} ${due.toISOString().slice(0, 10)}` : ''}.${extra}`,
    '',
    `It is in your inbox in Tasama HR (${r.ref}). Everything you need to decide is on the case.`,
    '',
    'If someone else should take this, reply and we will route it to them.',
    '',
    'Kind regards,',
    `${sender}`,
    'Tasama HR Services',
  ].join('\n');
  return { subject, body };
}

cases.post('/requests/:ref/reminder/draft', async (req, res) => {
  const p = await personaOf(req);
  if (!isTasamaStaff(p)) return res.status(403).json({ error: 'Only Tasama staff send reminders.' });
  const x = await reminderContext(req.params.ref);
  if (!x || !x.who) return res.status(404).json({ error: 'This case is not waiting on a person.' });
  const fallback = templateDraft(x, p.display_name);
  let draft = fallback, mode: 'claude' | 'template' = 'template';
  if (aiConfigured()) {
    try {
      const { msg } = await createMessage({ max_tokens: 600, messages: [{ role: 'user', content:
        `You are Raqeeb, the agent at Tasama that watches deadlines. Rewrite this reminder email so it is short, warm and specific. Keep every fact, add none, no bullet points, sign as ${p.display_name}, Tasama HR Services. Answer with JSON only: {"subject": "...", "body": "..."}.\n\nSubject: ${fallback.subject}\n\n${fallback.body}` }] });
      const text = msg.content.map((b: any) => (b.type === 'text' ? b.text : '')).join('');
      const j = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
      if (j.subject && j.body) { draft = { subject: String(j.subject), body: String(j.body) }; mode = 'claude'; }
    } catch { /* the template stands */ }
  }
  res.json({ to: { name: x.who.display_name, email: x.who.work_email, role: ROLE_WORDS[x.r.waiting_on_role] ?? x.r.waiting_on_role }, ...draft, mode, drafted_by: 'raqeeb', sent_before: x.sent });
});

cases.post('/requests/:ref/reminder', async (req, res) => {
  const p = await personaOf(req);
  if (!isTasamaStaff(p)) return res.status(403).json({ error: 'Only Tasama staff send reminders.' });
  const x = await reminderContext(req.params.ref);
  if (!x || !x.who || !['WAITING', 'ESCALATED'].includes(x.r.status)) return res.status(404).json({ error: 'This case is not waiting on a person.' });
  const subject = String(req.body.subject ?? '').trim(), body = String(req.body.body ?? '').trim();
  if (!subject || !body) return res.status(400).json({ error: 'The email needs a subject and a message.' });
  await pool.query(`INSERT INTO layer.notifications (person_id, title, title_ar, body, link) VALUES ($1,$2,$3,$4,$5)`, [x.r.waiting_on_person_id, subject, `تذكير: ${x.r.title_ar ?? x.r.title}`, body, `case:${x.r.ref}`]);
  await pool.query(`INSERT INTO layer.trail (request_id, actor_type, actor_id, actor_name, act, summary, summary_ar) VALUES ($1,'HUMAN',$2,$3,'REMIND',$4,$5)`,
    [x.r.id, p.key, `${p.display_name}, Tasama`, `Reminder emailed to ${x.who.display_name} (${x.who.work_email}): "${subject}"`, `أُرسل تذكير بالبريد إلى ${x.who.display_name}`]);
  // The same reminder counts on Tasama's own board: an open escalation for this case is marked reminded.
  const cl = client();
  await pool.query(`UPDATE tasama.escalations SET status='NUDGED', action=$3 WHERE client_key=$1 AND case_ref=$2 AND status='OPEN'`, [cl.key, x.r.ref, `Reminder emailed to ${x.who.display_name}`]);
  await tasamaTrail(pool, { client_key: cl.key, actor_type: 'HUMAN', actor_id: p.key, actor_name: p.display_name, act: 'NUDGE', autonomy: null, ref: x.r.ref,
    summary: `Reminded ${x.who.display_name} at ${cl.short} about ${x.r.ref} by email.`, summary_ar: `تذكير ${x.who.display_name} لدى ${cl.name_ar} بالحالة ${x.r.ref}.` });
  res.json({ ok: true, to: x.who.work_email });
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
