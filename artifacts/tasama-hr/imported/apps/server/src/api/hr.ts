/** HR Workspace read models. Scope-limited per persona; HRMS reads via the connector. */
import { Router } from 'express';
import { pool } from '../db.js';
import { personaOf, personScope, isHR, has } from './session.js';
import { read, type Ctx } from '../hcm/connector.js';
import { WORKER_SQL, ACTIVE, worker, balances } from '../hcm/queries.js';
import { precheck } from '../agents/hisab.js';
import { calibration, assessmentSpread, evidence } from '../agents/talent.js';
import { gratuity, iso, round2, yearsBetween, addDays, client } from '../domain/rules.js';

export const hr = Router();
const today = () => iso(new Date());
const ctxOf = (actor: string): Ctx => ({ c: pool, actor });

hr.get('/workforce', async (req, res) => {
  const p = await personaOf(req);
  const [scope, sp] = personScope(p, 2);
  const q = String(req.query.q ?? '').trim();
  const params: unknown[] = [today(), ...sp];
  let where = `${ACTIVE} AND ${scope}`;
  if (q) { params.push(`%${q}%`); where += ` AND (p.display_name ILIKE $${params.length} OR p.display_name_ar ILIKE $${params.length} OR p.person_number ILIKE $${params.length} OR j.name ILIKE $${params.length} OR d.name ILIKE $${params.length})`; }
  const rows = await read(ctxOf('murshid'), 'workers', q ? `q=${encodeURIComponent(q)}` : 'limit=500', 'Workforce directory', async () => (await pool.query(`${WORKER_SQL(where)} ORDER BY d.division, d.name, g.rank DESC LIMIT 500`, params)).rows);
  res.json(rows);
});

hr.get('/people/:id', async (req, res) => {
  const p = await personaOf(req);
  const id = Number(req.params.id);
  const [scope, sp] = personScope(p, 2);
  const ok = (await pool.query(`SELECT 1 FROM hcm.persons p JOIN LATERAL (SELECT * FROM hcm.assignments a WHERE a.person_id=p.id ORDER BY effective_start DESC LIMIT 1) a ON true JOIN hcm.departments d ON d.id=a.department_id WHERE p.id=$1 AND ${scope}`, [id, ...sp])).rows.length;
  if (!ok) return res.status(403).json({ error: 'Outside your data scope (HR-13 §13.1, Saudi Personal Data Protection Law).' });
  const ctx = ctxOf('murshid');
  const w = await worker(ctx, id, today());
  const [history, salaries, bal, perf, talent, docs, cases, entries, journeys] = await Promise.all([
    read(ctx, `workers/${id}/child/workRelationships/assignments`, '', 'Assignment history', async () => (await pool.query(`SELECT a.effective_start, a.effective_end, a.action_code, a.action_reason, g.code AS grade, j.name AS job, d.name AS department FROM hcm.assignments a JOIN hcm.grades g ON g.id=a.grade_id JOIN hcm.jobs j ON j.id=a.job_id JOIN hcm.departments d ON d.id=a.department_id WHERE a.person_id=$1 ORDER BY a.effective_start DESC`, [id])).rows),
    isHR(p) || p.person_id === id ? read(ctx, 'salaries', `q=PersonId=${id}`, 'Salary history', async () => (await pool.query(`SELECT * FROM hcm.salaries WHERE person_id=$1 ORDER BY date_from DESC`, [id])).rows) : Promise.resolve([]),
    balances(ctx, id, Number(today().slice(0, 4))),
    pool.query(`SELECT review_period, status, self_rating, manager_rating, calibrated_rating, calibration_note FROM hcm.performance_documents WHERE person_id=$1 ORDER BY review_period DESC`, [id]).then((r) => r.rows),
    pool.query(`SELECT * FROM hcm.talent_profiles WHERE person_id=$1`, [id]).then((r) => r.rows[0] ?? null),
    pool.query(`SELECT document_number, type, addressee, issued_at FROM hcm.document_records WHERE person_id=$1 ORDER BY issued_at DESC LIMIT 10`, [id]).then((r) => r.rows),
    pool.query(`SELECT ref, title, title_ar, status, workflow_id, created_at FROM layer.requests WHERE subject_person_id=$1 ORDER BY created_at DESC LIMIT 15`, [id]).then((r) => r.rows),
    isHR(p) ? pool.query(`SELECT e.element_code, t.name, e.amount, e.effective_start, e.effective_end, e.source, e.reference FROM hcm.element_entries e JOIN hcm.element_types t ON t.code=e.element_code WHERE e.person_id=$1 AND e.effective_end >= $2 ORDER BY e.effective_start DESC`, [id, today()]).then((r) => r.rows) : Promise.resolve([]),
    pool.query(`SELECT journey_number, template, status, started_at, target_date FROM hcm.journeys WHERE person_id=$1`, [id]).then((r) => r.rows),
  ]);
  res.json({ worker: w, history, salaries, balances: bal, performance: perf, talent, documents: docs, cases, entries, journeys, gratuity: w && w.eos_basis === 'GRATUITY' ? gratuity(w.basic, w.original_hire_date, today()) : null });
});

hr.get('/org', async (_req, res) => {
  const ctx = ctxOf('murshid');
  const depts = await read(ctx, 'organizations', 'q=ClassificationCode=DEPARTMENT', 'Departments and headcount', async () => (await pool.query(`
    SELECT d.id, d.code, d.name, d.name_ar, d.division, d.division_ar, d.parent_id, m.display_name AS head,
           COUNT(*) FILTER (WHERE wr.worker_type='E' AND wr.end_date IS NULL)::int AS headcount,
           COUNT(*) FILTER (WHERE wr.worker_type='E' AND wr.end_date IS NULL AND p.is_saudi)::int AS saudi,
           COUNT(*) FILTER (WHERE wr.worker_type='E' AND wr.end_date IS NULL AND p.gender='F')::int AS women,
           (SELECT COUNT(*) FROM hcm.positions pp WHERE pp.department_id=d.id AND pp.hiring_status <> 'FILLED')::int AS vacancies
      FROM hcm.departments d LEFT JOIN hcm.persons m ON m.id=d.manager_person_id
      LEFT JOIN LATERAL (SELECT DISTINCT ON (person_id) person_id, department_id FROM hcm.assignments ORDER BY person_id, effective_start DESC) a ON a.department_id=d.id
      LEFT JOIN hcm.persons p ON p.id=a.person_id LEFT JOIN hcm.work_relationships wr ON wr.person_id=p.id
     GROUP BY d.id, m.display_name ORDER BY d.id`)).rows);
  // Saudization (Nitaqat): Saudi share of ALL active employees.
  const sa = (await pool.query(`SELECT COUNT(*) FILTER (WHERE p.is_saudi)::int AS saudi, COUNT(*)::int AS total
     FROM hcm.persons p JOIN hcm.work_relationships wr ON wr.person_id=p.id
    WHERE wr.worker_type='E' AND wr.end_date IS NULL`)).rows[0];
  const nq = client().nitaqat;
  const nat = (await pool.query(`SELECT p.nationality, COUNT(*)::int n FROM hcm.persons p JOIN hcm.work_relationships wr ON wr.person_id=p.id WHERE wr.worker_type='E' AND wr.end_date IS NULL GROUP BY 1 ORDER BY 2 DESC`)).rows;
  const turnover = (await pool.query(`SELECT COUNT(*)::int n FROM hcm.work_relationships WHERE end_date BETWEEN $1::date - 365 AND $1::date`, [today()])).rows[0].n;
  res.json({ departments: depts, saudization: { ...sa, ratio: sa.total ? round2(sa.saudi / sa.total * 100) : 0, target: round2(nq.requiredPct * 100), band: nq.band, activity: nq.activity }, nationalities: nat, turnover12m: turnover });
});

hr.get('/hiring', async (_req, res) => {
  const ctx = ctxOf('hessa');
  const reqs = await read(ctx, 'recruitingJobRequisitions', 'q=Status=OPEN', 'Open requisitions', async () => (await pool.query(`
    SELECT r.*, d.name AS department, d.division, g.code AS grade, hm.display_name AS hiring_manager, rc.display_name AS recruiter,
           (SELECT json_object_agg(phase, n) FROM (SELECT phase, COUNT(*)::int n FROM hcm.applications a WHERE a.requisition_id=r.id GROUP BY phase) x) AS funnel,
           (SELECT COUNT(*)::int FROM hcm.applications a JOIN hcm.candidates c ON c.id=a.candidate_id WHERE a.requisition_id=r.id AND c.is_saudi) AS saudi_applicants,
           (SELECT ref FROM layer.requests lr WHERE lr.payload->>'requisition_id' = r.id::text AND lr.status IN ('WAITING','ESCALATED') LIMIT 1) AS open_case,
           (SELECT type FROM layer.requests lr WHERE lr.payload->>'requisition_id' = r.id::text AND lr.status IN ('WAITING','ESCALATED') LIMIT 1) AS open_case_type
      FROM hcm.requisitions r JOIN hcm.positions pos ON pos.id=r.position_id JOIN hcm.departments d ON d.id=pos.department_id JOIN hcm.grades g ON g.id=pos.grade_id
      JOIN hcm.persons hm ON hm.id=r.hiring_manager_id JOIN hcm.persons rc ON rc.id=r.recruiter_id
     ORDER BY r.status = 'OPEN' DESC, r.opened_date DESC`)).rows);
  const positions = (await pool.query(`SELECT hiring_status, COUNT(*)::int n FROM hcm.positions GROUP BY 1`)).rows;
  const offers = (await pool.query(`SELECT o.*, c.first_name || ' ' || c.last_name AS candidate, pos.name AS position, g.code AS grade FROM hcm.offers o JOIN hcm.applications a ON a.id=o.application_id JOIN hcm.candidates c ON c.id=a.candidate_id JOIN hcm.positions pos ON pos.id=o.position_id JOIN hcm.grades g ON g.id=o.grade_id ORDER BY o.id DESC`)).rows;
  const centres = (await pool.query(`SELECT * FROM hcm.assessment_centres ORDER BY centre_date DESC`)).rows;
  const ac = centres.find((c: any) => c.purpose === 'SELECTION');
  res.json({ requisitions: reqs, positions, offers, centres, assessment: ac ? { centre: ac, ...(await assessmentSpread(ctxOf('tamkeen'), ac.id)) } : null });
});

hr.get('/hiring/requisitions/:id', async (req, res) => {
  const ctx = ctxOf('hessa');
  const r = (await pool.query(`SELECT * FROM hcm.requisitions WHERE id=$1`, [req.params.id])).rows[0];
  const apps = await read(ctx, 'recruitingCandidateApplications', `q=RequisitionId=${req.params.id}`, 'Applications', async () => (await pool.query(`SELECT a.*, c.candidate_number, c.first_name, c.last_name, c.display_name_ar, c.current_employer, c.years_experience, c.education, c.certifications, c.source, c.is_saudi FROM hcm.applications a JOIN hcm.candidates c ON c.id=a.candidate_id WHERE a.requisition_id=$1 ORDER BY a.applied_at`, [req.params.id])).rows);
  // Evidence is shown for every application, computed if Hessa has not run yet. Never a score.
  res.json({ requisition: r, applications: apps.map((a: any) => ({ ...a, evidence: a.evidence ?? evidence(a, r.criteria) })) });
});

hr.get('/onboarding', async (_req, res) => {
  const ctx = ctxOf('dalil');
  const journeys = await read(ctx, 'journeys', 'q=Template=PREBOARDING,ONBOARDING', 'Joiner journeys', async () => (await pool.query(`
    SELECT j.*, p.display_name, p.display_name_ar, p.nationality, p.is_saudi, wr.start_date, wr.worker_type, jb.name AS job, d.name AS department,
           COALESCE(json_agg(t ORDER BY t.seq) FILTER (WHERE t.id IS NOT NULL), '[]') AS tasks
      FROM hcm.journeys j JOIN hcm.persons p ON p.id=j.person_id JOIN hcm.work_relationships wr ON wr.person_id=p.id
      JOIN LATERAL (SELECT * FROM hcm.assignments a WHERE a.person_id=p.id ORDER BY effective_start DESC LIMIT 1) a ON true
      JOIN hcm.jobs jb ON jb.id=a.job_id JOIN hcm.departments d ON d.id=a.department_id LEFT JOIN hcm.journey_tasks t ON t.journey_id=j.id
     WHERE j.template IN ('PREBOARDING','ONBOARDING') GROUP BY j.id, p.id, wr.start_date, wr.worker_type, jb.name, d.name ORDER BY wr.start_date DESC`)).rows);
  const probation = (await pool.query(`SELECT p.id, p.display_name, p.display_name_ar, a.probation_end_date, d.name AS department, m.display_name AS manager,
       (SELECT ref FROM layer.requests r WHERE r.subject_person_id=p.id AND r.workflow_id='WF-08' ORDER BY id DESC LIMIT 1) AS case_ref,
       (SELECT status FROM layer.requests r WHERE r.subject_person_id=p.id AND r.workflow_id='WF-08' ORDER BY id DESC LIMIT 1) AS case_status
      FROM hcm.persons p JOIN LATERAL (SELECT * FROM hcm.assignments a WHERE a.person_id=p.id ORDER BY effective_start DESC LIMIT 1) a ON true
      JOIN hcm.departments d ON d.id=a.department_id LEFT JOIN hcm.persons m ON m.id=a.manager_person_id JOIN hcm.work_relationships wr ON wr.person_id=p.id
     WHERE a.probation_status='IN_PROBATION' AND wr.worker_type='E' ORDER BY a.probation_end_date`)).rows;
  res.json({ journeys, probation });
});

hr.get('/performance', async (req, res) => {
  const period = (await pool.query(`SELECT review_period FROM hcm.performance_documents WHERE status <> 'COMPLETED' ORDER BY review_period DESC LIMIT 1`)).rows[0]?.review_period;
  const division = String(req.query.division ?? 'Commercial');
  const progress = (await pool.query(`SELECT d.division, pd.status, COUNT(*)::int n FROM hcm.performance_documents pd JOIN LATERAL (SELECT * FROM hcm.assignments a WHERE a.person_id=pd.person_id ORDER BY effective_start DESC LIMIT 1) a ON true JOIN hcm.departments d ON d.id=a.department_id WHERE pd.review_period=$1 GROUP BY 1,2`, [period])).rows;
  const cal = await calibration(ctxOf('mezan'), period, division);
  const grid = (await pool.query(`SELECT p.id, p.display_name, t.potential, COALESCE(pd.calibrated_rating, pd.manager_rating, prev.calibrated_rating) AS rating, d.division
      FROM hcm.talent_profiles t JOIN hcm.persons p ON p.id=t.person_id
      JOIN LATERAL (SELECT * FROM hcm.assignments a WHERE a.person_id=p.id ORDER BY effective_start DESC LIMIT 1) a ON true JOIN hcm.departments d ON d.id=a.department_id
      LEFT JOIN hcm.performance_documents pd ON pd.person_id=p.id AND pd.review_period=$1
      LEFT JOIN LATERAL (SELECT calibrated_rating FROM hcm.performance_documents x WHERE x.person_id=p.id AND x.status='COMPLETED' ORDER BY review_period DESC LIMIT 1) prev ON true
     WHERE d.division = $2`, [period, division])).rows;
  const succession = (await pool.query(`SELECT sp.*, pos.name AS position, inc.display_name AS incumbent, (SELECT json_agg(json_build_object('name', p.display_name, 'readiness', sc.readiness)) FROM hcm.succession_candidates sc JOIN hcm.persons p ON p.id=sc.person_id WHERE sc.plan_id=sp.id) AS bench FROM hcm.succession_plans sp JOIN hcm.positions pos ON pos.id=sp.position_id LEFT JOIN hcm.persons inc ON inc.id=sp.incumbent_id`)).rows;
  const divisions = (await pool.query(`SELECT DISTINCT division FROM hcm.departments ORDER BY 1`)).rows.map((r: any) => r.division);
  res.json({ period, division, divisions, progress, calibration: cal, grid, succession });
});

hr.get('/payroll', async (_req, res) => {
  const ctx: Ctx = { c: pool, actor: 'hisab' };
  const pc = await precheck(ctx);
  const periods = (await pool.query(`SELECT pp.*, (SELECT COUNT(*)::int FROM hcm.payroll_results r WHERE r.period_id=pp.id) AS lines, (SELECT SUM(gross) FROM hcm.payroll_results r WHERE r.period_id=pp.id) AS gross, (SELECT SUM(net) FROM hcm.payroll_results r WHERE r.period_id=pp.id) AS net FROM hcm.payroll_periods pp ORDER BY start_date`)).rows;
  const changes = (await pool.query(`SELECT e.*, p.display_name, t.name AS element FROM hcm.element_entries e JOIN hcm.persons p ON p.id=e.person_id JOIN hcm.element_types t ON t.code=e.element_code WHERE e.source='RAFEEQ' ORDER BY e.id DESC LIMIT 40`)).rows;
  const advances = (await pool.query(`SELECT a.*, p.display_name FROM hcm.advances a JOIN hcm.persons p ON p.id=a.person_id ORDER BY a.status, a.id DESC`)).rows;
  const eos = (await pool.query(`SELECT basis, COUNT(*)::int n, SUM(contributions_to_date) AS fund FROM hcm.end_of_service eos JOIN hcm.work_relationships wr ON wr.person_id=eos.person_id WHERE wr.end_date IS NULL GROUP BY 1`)).rows;
  // End-of-service award liability today (Saudi Labor Law Art. 84, termination basis), SAR.
  const grat = (await pool.query(`SELECT s.basic, wr.original_hire_date FROM hcm.end_of_service eos JOIN hcm.work_relationships wr ON wr.person_id=eos.person_id JOIN hcm.salaries s ON s.person_id=eos.person_id AND s.date_to='4712-12-31' WHERE eos.basis='GRATUITY' AND wr.end_date IS NULL AND wr.worker_type='E'`)).rows;
  const liability = round2(grat.reduce((s: number, g: any) => s + gratuity(g.basic, g.original_hire_date, today()).amount, 0));
  const openCase = (await pool.query(`SELECT ref, status FROM layer.requests WHERE workflow_id='WF-13' ORDER BY id DESC LIMIT 1`)).rows[0] ?? null;
  res.json({ precheck: pc, periods, changes, advances, eos, gratuityLiability: liability, openCase });
});

hr.get('/exits', async (_req, res) => {
  const cases = (await pool.query(`SELECT r.*, p.display_name AS subject_name, p.display_name_ar AS subject_name_ar, w.display_name AS waiting_on_name FROM layer.requests r JOIN hcm.persons p ON p.id=r.subject_person_id LEFT JOIN hcm.persons w ON w.id=r.waiting_on_person_id WHERE r.workflow_id IN ('WF-19','WF-20','WF-18') ORDER BY r.created_at DESC`)).rows;
  const leavers = (await pool.query(`SELECT p.id, p.display_name, wr.last_working_day, wr.termination_action, wr.termination_reason, d.name AS department, (SELECT ROUND(AVG(1))) AS x FROM hcm.work_relationships wr JOIN hcm.persons p ON p.id=wr.person_id JOIN LATERAL (SELECT * FROM hcm.assignments a WHERE a.person_id=p.id ORDER BY effective_start DESC LIMIT 1) a ON true JOIN hcm.departments d ON d.id=a.department_id WHERE wr.end_date IS NOT NULL ORDER BY wr.last_working_day DESC`)).rows;
  const journeys = (await pool.query(`SELECT j.*, p.display_name, COALESCE(json_agg(t ORDER BY t.seq) FILTER (WHERE t.id IS NOT NULL), '[]') AS tasks FROM hcm.journeys j JOIN hcm.persons p ON p.id=j.person_id LEFT JOIN hcm.journey_tasks t ON t.journey_id=j.id WHERE j.template='OFFBOARDING' GROUP BY j.id, p.display_name`)).rows;
  const reasons = (await pool.query(`SELECT termination_reason AS reason, COUNT(*)::int n FROM hcm.work_relationships WHERE end_date IS NOT NULL GROUP BY 1 ORDER BY 2 DESC`)).rows;
  res.json({ cases, leavers, journeys, reasons });
});

hr.get('/compliance', async (_req, res) => {
  const alerts = (await pool.query(`SELECT a.*, p.display_name, p.display_name_ar, p.person_number FROM layer.alerts a LEFT JOIN hcm.persons p ON p.id=a.person_id ORDER BY CASE a.severity WHEN 'URGENT' THEN 0 WHEN 'ACTION' THEN 1 WHEN 'WATCH' THEN 2 ELSE 3 END, a.due_date`)).rows;
  res.json({ alerts });
});
hr.post('/compliance/:ref/resolve', async (req, res) => {
  const p = await personaOf(req);
  await pool.query(`UPDATE layer.alerts SET status='RESOLVED' WHERE ref=$1`, [req.params.ref]);
  await pool.query(`INSERT INTO layer.trail (request_id, actor_type, actor_id, actor_name, act, summary, summary_ar) VALUES (NULL,'HUMAN',$1,$2,'APPROVE',$3,$4)`, [String(p.person_id), p.display_name, `Resolved alert ${req.params.ref}`, `عالج التنبيه ${req.params.ref}`]);
  res.json({ ok: true });
});
hr.post('/compliance/scan', async (_req, res) => {
  const { scan } = await import('../agents/amin.js');
  const c = await pool.connect();
  try { res.json({ alerts: await scan(c, today()) }); } finally { c.release(); }
});
void has; void yearsBetween; void addDays;
