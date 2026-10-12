/**
 * The assistant's tools. Each runs on the server, under the signed-in
 * persona's scope, and reads the HRMS through the connector. Exactly one tool
 * can lead to a write — propose_request — and it never writes: it returns a
 * proposal the person must confirm on screen (Atelier agent safety model).
 */
import { pool } from '../db.js';
import type { Persona } from '../api/session.js';
import { has, isHR, isTasama, personScope, caseScope } from '../api/session.js';
import { worker, team, balances, WORKER_SQL, ACTIVE } from '../hcm/queries.js';
import { read, type Ctx } from '../hcm/connector.js';
import { precheck } from '../agents/hisab.js';
import { calibration } from '../agents/talent.js';
import { buildCase } from '../api/cases.js';
import { gratuity, iso, round2, advanceMax, advanceMaxTerm, client } from '../domain/rules.js';

const today = () => iso(new Date());

export const SCREENS = ['my-home', 'my-requests', 'my-leave', 'my-pay', 'my-growth', 'my-onboarding', 'team', 'team-approvals', 'team-hiring', 'team-performance',
  'hr-inbox', 'hr-lifecycle', 'hr-workforce', 'hr-hiring', 'hr-onboarding', 'hr-performance', 'hr-payroll', 'hr-exits', 'hr-compliance',
  'agents', 'workflows', 'scenarios', 'connector', 'evidence', 'policies', 'value', 'settings'];

export type Tool = { name: string; description: string; input_schema: any; roles?: (p: Persona) => boolean };

export const TOOLS: Tool[] = [
  { name: 'search_policy', description: 'Search the HR policy handbook of the company the signed-in person works for (a Tasama client; Saudi Labor Law applies). ALWAYS use this before answering any question about rules, entitlements or process. Returns clauses with their id (e.g. "HR-04 §4.1"), version and legal reference.', input_schema: { type: 'object', properties: { query: { type: 'string', description: 'Keywords in English, e.g. "annual leave carry forward"' } }, required: ['query'] } },
  { name: 'my_profile', description: 'The signed-in person\'s record in their company\'s HRMS: job, grade, department, manager, hire date, probation, contract, end-of-service basis.', input_schema: { type: 'object', properties: {} } },
  { name: 'my_leave', description: 'The signed-in person\'s leave balances, recent and upcoming absences, and open leave requests.', input_schema: { type: 'object', properties: {} } },
  { name: 'my_pay', description: 'The signed-in person\'s pay (SAR): salary components, last three payslips, next pay date (paid through Mudad), end-of-service award position, salary advances and advance limit.', input_schema: { type: 'object', properties: {} } },
  { name: 'my_requests', description: 'The signed-in person\'s open and recent HR requests with status and who they are waiting on.', input_schema: { type: 'object', properties: {} } },
  { name: 'my_team', description: 'Line managers only: direct reports with leave, probation, review status and open cases.', input_schema: { type: 'object', properties: {} }, roles: (p) => has(p, 'LINE_MANAGER') },
  { name: 'my_inbox', description: 'Cases waiting on the signed-in person\'s decision.', input_schema: { type: 'object', properties: {} } },
  { name: 'find_people', description: 'HR only: search workers within the user\'s data scope by name, job, department or person number.', input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }, roles: isHR },
  { name: 'person_summary', description: 'HR, or a manager for a direct report: one worker\'s summary (job, grade, tenure, salary band position, leave, ratings, open cases).', input_schema: { type: 'object', properties: { person_number: { type: 'string' } }, required: ['person_number'] }, roles: (p) => isHR(p) || has(p, 'LINE_MANAGER') },
  { name: 'workforce_stats', description: 'HR only: headcount by division, Saudization ratio (Nitaqat), nationalities, gender, turnover, open requisitions and vacancies.', input_schema: { type: 'object', properties: {} }, roles: isHR },
  { name: 'payroll_precheck', description: 'Payroll or CHRO: Hisab\'s pre-run check of the open payroll period before the Mudad upload (pay, GOSI, deductions), with findings.', input_schema: { type: 'object', properties: {} }, roles: (p) => has(p, 'PAYROLL') || has(p, 'CHRO') },
  { name: 'calibration_summary', description: 'HRBP or CHRO: Mezan\'s calibration check for a division: distribution and flags.', input_schema: { type: 'object', properties: { division: { type: 'string', description: 'e.g. Commercial' } } }, roles: (p) => has(p, 'HRBP') || has(p, 'CHRO') },
  { name: 'compliance_alerts', description: 'HR only: Amin\'s compliance flags for this company: iqama, national ID and passport expiries, probation end dates, fixed-term contract renewals, the Mudad pay date and the Saudization (Nitaqat) position. Each flag has a reference (DEMO-ALR-…), the person, the due date, days left, severity, owner and the action to take. Amin flags iqama, national ID, probation and contract dates 60 days ahead (30 for probation and contracts) and passports 180 days ahead; it does not see further than that.', input_schema: { type: 'object', properties: { kinds: { type: 'array', items: { type: 'string', enum: ['IQAMA_EXPIRY', 'NATIONAL_ID_EXPIRY', 'PASSPORT_EXPIRY', 'PROBATION_DUE', 'CONTRACT_RENEWAL', 'MUDAD_DUE', 'SAUDIZATION'] }, description: 'Leave out for all kinds' }, within_days: { type: 'number', description: 'Only flags due within this many days from today' }, include_resolved: { type: 'boolean' } } }, roles: isHR },
  { name: 'search_cases', description: 'HR only: search the HR cases (requests and workflow cases) this person may see, with their references (e.g. RSN-CASE-26-04318). Filter by status, workflow, type, overdue against the service level, who it is waiting on, age, or free text (reference, title or employee name). Use it for any question that asks for a list of cases, issues, approvals or overdue items.', input_schema: { type: 'object', properties: { status: { type: 'string', enum: ['open', 'waiting', 'escalated', 'completed', 'rejected', 'any'], description: 'open = waiting, running or escalated (default)' }, workflow: { type: 'string', description: 'Workflow id, e.g. WF-15' }, type: { type: 'string', description: 'Case type, e.g. LEAVE, ADVANCE, SALARY_CERTIFICATE, RESIGNATION, PROMOTION' }, overdue: { type: 'boolean', description: 'Only cases past their service-level due time' }, waiting_on: { type: 'string', description: 'Name or role of the person the case waits on' }, text: { type: 'string' }, created_within_days: { type: 'number' }, limit: { type: 'number' } } }, roles: isHR },
  { name: 'tasama_escalations', description: 'Tasama HR Operations Manager only: Raqeeb\'s service-level escalations across all Tasama clients, with the escalation id, client, case reference, service level, state (AT_RISK or BREACHED), who it waits on, due time and status.', input_schema: { type: 'object', properties: { client: { type: 'string', description: 'Client key or name, e.g. riyadhair or Riyadh Air' }, kind: { type: 'string', enum: ['AT_RISK', 'BREACHED'] }, include_resolved: { type: 'boolean' } } }, roles: isTasama },
  { name: 'propose_request', description: 'Prepare an HR request for the person to CONFIRM ON SCREEN. Nothing is submitted until they press confirm. Types: SALARY_CERTIFICATE, EMPLOYMENT_CERTIFICATE, SALARY_TRANSFER (needs addressee bank), NOC_TRAVEL, NOC_DRIVING, EXPERIENCE, LEAVE (type_code ANNUAL|SICK|UNPAID|PARENTAL|BEREAVEMENT|STUDY, start, end as YYYY-MM-DD), ADVANCE (amount, months), RESIGNATION (notice_date, reason).', input_schema: { type: 'object', properties: { type: { type: 'string' }, addressee: { type: 'string' }, language: { type: 'string', enum: ['en', 'ar'] }, type_code: { type: 'string' }, start: { type: 'string' }, end: { type: 'string' }, amount: { type: 'number' }, months: { type: 'number' }, reason: { type: 'string' }, notice_date: { type: 'string' } }, required: ['type'] } },
  { name: 'open_screen', description: `Navigate the app to a screen. One of: ${SCREENS.join(', ')}.`, input_schema: { type: 'object', properties: { screen: { type: 'string', enum: SCREENS } }, required: ['screen'] } },
];

export type ToolOut = { result: any; citations?: { id: string; heading: string }[]; navigate?: string; pending?: any };

export async function runTool(p: Persona, name: string, input: any, lang: 'en' | 'ar', agent: string): Promise<ToolOut> {
  const ctx: Ctx = { c: pool, actor: agent };
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { result: { error: `Unknown tool ${name}` } };
  if (tool.roles && !tool.roles(p)) return { result: { error: `Not permitted for ${p.label}. Data scope rule HR-13 §13.1.` } };
  switch (name) {
    case 'search_policy': {
      const q = String(input.query ?? '').slice(0, 200);
      // Rank by how many of the question's words appear in a clause's heading or tags (strong), then full-text rank on any word.
      const STOP = new Set(['how', 'much', 'many', 'can', 'get', 'the', 'and', 'for', 'what', 'does', 'are', 'you', 'have', 'will', 'with', 'when', 'there', 'about', 'any', 'our', 'your', 'from', 'that', 'this', 'into', 'need', 'want', 'company', 'policy', 'rule', 'rules', 'allowed', 'entitled', 'get']);
      const words = [...new Set(q.toLowerCase().match(/[a-z]{3,}/g) ?? [])].filter((w) => !STOP.has(w)).slice(0, 8);
      let rows: any[] = [];
      if (words.length) {
        // Rarer words count for more: a word found in few clauses ("gosi", "ticket") outranks one found in many ("leave").
        const df = (await pool.query(`SELECT w, COUNT(c.id)::int n FROM unnest($1::text[]) w LEFT JOIN layer.policy_clauses c ON c.heading ILIKE '%' || w || '%' OR EXISTS (SELECT 1 FROM unnest(c.tags) t WHERE t ILIKE '%' || w || '%') GROUP BY w`, [words])).rows;
        const weight = words.map((w) => { const n = df.find((d: any) => d.w === w)?.n ?? 0; return n === 0 ? 0 : n <= 3 ? 6 : n <= 8 ? 3 : 1; });
        rows = (await pool.query(
          `SELECT * FROM (
             SELECT c.*, p.version, p.title AS policy_title,
                    (SELECT COALESCE(SUM(x.wt), 0) FROM unnest($1::text[], $3::int[]) AS x(w, wt) WHERE c.heading ILIKE '%' || x.w || '%' OR EXISTS (SELECT 1 FROM unnest(c.tags) t WHERE t ILIKE '%' || x.w || '%'))
                    + ts_rank(c.search, to_tsquery('english', $2)) AS rank
               FROM layer.policy_clauses c JOIN layer.policies p ON p.id = c.policy_id) x
            WHERE rank > 0 ORDER BY rank DESC LIMIT 4`, [words, words.join(' | '), weight])).rows;
      }
      return { result: rows.map((r: any) => ({ id: r.id, policy: r.policy_title, version: r.version, heading: lang === 'ar' ? r.heading_ar : r.heading, text: lang === 'ar' ? r.text_ar : r.text_en, legal: r.legal_ref })), citations: rows.map((r: any) => ({ id: r.id, heading: lang === 'ar' ? r.heading_ar : r.heading })) };
    }
    case 'my_profile': {
      const w = await worker(ctx, p.person_id, today());
      if (!w) return { result: null };
      return { result: { name: w.display_name, person_number: w.person_number, job: w.job_name, grade: w.grade_code, department: w.department_name, division: w.division, manager: w.manager_name, hire_date: w.original_hire_date, start_date: w.start_date, worker_type: w.worker_type === 'P' ? 'pending worker (not started yet)' : 'employee', probation_end: w.probation_end_date, probation_status: w.probation_status, contract_end: w.contract_end_date, notice_days: w.notice_period_days, end_of_service_basis: w.eos_basis, location: w.location_name } };
    }
    case 'my_leave': {
      const bal = await balances(ctx, p.person_id, Number(today().slice(0, 4)));
      const abs = (await pool.query(`SELECT absence_number, type_code, start_date, end_date, days, status FROM hcm.absences WHERE person_id=$1 ORDER BY start_date DESC LIMIT 8`, [p.person_id])).rows;
      const open = (await pool.query(`SELECT ref, title, status, waiting_on_role FROM layer.requests WHERE subject_person_id=$1 AND workflow_id='WF-15' AND status IN ('WAITING','RUNNING')`, [p.person_id])).rows;
      return { result: { balances: bal.map((b: any) => ({ type: b.type_code, entitlement: b.entitlement, carried_over: b.carried_over, taken: b.taken, booked: b.booked, balance: b.balance })), absences: abs, open_requests: open } };
    }
    case 'my_pay': {
      const w = (await worker(ctx, p.person_id, today()))!;
      const slips = (await pool.query(`SELECT pp.period_name, pp.pay_date, r.gross, r.deductions, r.net, r.lines FROM hcm.payroll_results r JOIN hcm.payroll_periods pp ON pp.id=r.period_id WHERE r.person_id=$1 ORDER BY pp.start_date DESC LIMIT 3`, [p.person_id])).rows;
      const next = (await pool.query(`SELECT period_name, pay_date, cutoff_date FROM hcm.payroll_periods WHERE status IN ('OPEN','RELEASED') ORDER BY start_date LIMIT 1`)).rows[0];
      const adv = (await pool.query(`SELECT advance_number, amount, monthly_recovery, outstanding, status FROM hcm.advances WHERE person_id=$1`, [p.person_id])).rows;
      const eos = gratuity(w.basic, w.original_hire_date, today());
      const eosResign = gratuity(w.basic, w.original_hire_date, today(), 0, 'RESIGNATION');
      const gross = w.basic + w.housing + w.transport + w.other_allowance;
      return { result: { monthly: { basic: w.basic, housing: w.housing, transport: w.transport, other: w.other_allowance, total: gross, currency: 'SAR' }, grade_range: [w.grade_min, w.grade_max], payslips: slips, next_pay: next, advances: adv, advance_limit: advanceMax(w.basic, gross), advance_max_months: advanceMaxTerm(), end_of_service: { basis: w.eos_basis ?? 'GRATUITY', gratuity_accrued_today: eos.amount, rule: eos.rule, if_resigning_today: eosResign.amount, resignation_rule: eosResign.rule } } };
    }
    case 'my_requests': {
      const rows = (await pool.query(`SELECT r.ref, r.title, r.status, r.waiting_on_role, w.display_name AS waiting_on, r.created_at, r.closed_at FROM layer.requests r LEFT JOIN hcm.persons w ON w.id=r.waiting_on_person_id WHERE r.subject_person_id=$1 OR r.requester_person_id=$1 ORDER BY r.created_at DESC LIMIT 10`, [p.person_id])).rows;
      return { result: rows };
    }
    case 'my_team': {
      const t = await team(ctx, p.person_id, today());
      const ids = t.map((x) => x.person_id);
      const away = (await pool.query(`SELECT person_id, start_date, end_date, type_code FROM hcm.absences WHERE person_id = ANY($1) AND end_date >= $2::date AND start_date <= $2::date + 21 AND status='APPROVED'`, [ids, today()])).rows;
      return { result: t.map((w) => ({ name: w.display_name, person_number: w.person_number, job: w.job_name, grade: w.grade_code, probation: w.probation_status === 'IN_PROBATION' ? `ends ${w.probation_end_date}` : 'confirmed', away: away.filter((a: any) => a.person_id === w.person_id) })) };
    }
    case 'my_inbox': {
      const rows = (await pool.query(`SELECT r.ref, r.title, r.status, r.sla_due, s.display_name AS about, r.result->'recommendation' AS recommendation FROM layer.requests r JOIN hcm.persons s ON s.id=r.subject_person_id WHERE r.waiting_on_person_id=$1 AND r.status IN ('WAITING','ESCALATED') ORDER BY r.sla_due`, [p.person_id])).rows;
      return { result: rows };
    }
    case 'find_people': {
      const [scope, sp] = personScope(p, 2);
      const rows = await read(ctx, 'workers', `q=${encodeURIComponent(input.query)}`, 'Assistant people search', async () => (await pool.query(`${WORKER_SQL(`${ACTIVE} AND ${scope} AND (p.display_name ILIKE $${sp.length + 2} OR j.name ILIKE $${sp.length + 2} OR d.name ILIKE $${sp.length + 2} OR p.person_number ILIKE $${sp.length + 2})`)} LIMIT 12`, [today(), ...sp, `%${input.query}%`])).rows);
      return { result: rows.map((w: any) => ({ name: w.display_name, person_number: w.person_number, job: w.job_name, grade: w.grade_code, department: w.department_name })) };
    }
    case 'person_summary': {
      const pid = (await pool.query(`SELECT id FROM hcm.persons WHERE person_number=$1`, [input.person_number])).rows[0]?.id;
      if (!pid) return { result: { error: 'No such person number' } };
      const [scope, sp] = personScope(p, 2);
      const ok = (await pool.query(`SELECT 1 FROM hcm.persons p JOIN LATERAL (SELECT * FROM hcm.assignments a WHERE a.person_id=p.id ORDER BY effective_start DESC LIMIT 1) a ON true JOIN hcm.departments d ON d.id=a.department_id WHERE p.id=$1 AND ${scope}`, [pid, ...sp])).rows.length;
      if (!ok) return { result: { error: 'Outside your data scope (HR-13 §13.1).' } };
      const w = (await worker(ctx, pid, today()))!;
      const ratings = (await pool.query(`SELECT review_period, COALESCE(calibrated_rating, manager_rating) AS rating, status FROM hcm.performance_documents WHERE person_id=$1 ORDER BY review_period DESC`, [pid])).rows;
      const bal = (await balances(ctx, pid, Number(today().slice(0, 4)))).find((b: any) => b.type_code === 'ANNUAL');
      const open = (await pool.query(`SELECT ref, title, status FROM layer.requests WHERE subject_person_id=$1 AND status IN ('WAITING','ESCALATED')`, [pid])).rows;
      return { result: { name: w.display_name, job: w.job_name, grade: w.grade_code, department: w.department_name, manager: w.manager_name, hire_date: w.original_hire_date, compa_ratio: isHR(p) ? round2(w.basic / w.grade_mid) : undefined, annual_leave_balance: bal?.balance, ratings, open_cases: open, probation: w.probation_status } };
    }
    case 'workforce_stats': {
      const div = (await pool.query(`SELECT d.division, COUNT(*)::int n, COUNT(*) FILTER (WHERE p.is_saudi)::int saudi, COUNT(*) FILTER (WHERE p.gender='F')::int women FROM hcm.persons p JOIN hcm.work_relationships wr ON wr.person_id=p.id JOIN LATERAL (SELECT * FROM hcm.assignments a WHERE a.person_id=p.id ORDER BY effective_start DESC LIMIT 1) a ON true JOIN hcm.departments d ON d.id=a.department_id WHERE wr.worker_type='E' AND wr.end_date IS NULL GROUP BY 1 ORDER BY 2 DESC`)).rows;
      const reqs = (await pool.query(`SELECT COUNT(*) FILTER (WHERE status='OPEN')::int open FROM hcm.requisitions`)).rows[0];
      const left = (await pool.query(`SELECT COUNT(*)::int n FROM hcm.work_relationships WHERE end_date BETWEEN $1::date - 365 AND $1::date`, [today()])).rows[0].n;
      const total = div.reduce((s: number, d: any) => s + d.n, 0);
      return { result: { headcount: total, by_division: div, saudi_nationals: div.reduce((s: number, d: any) => s + d.saudi, 0), nitaqat: client().nitaqat, women: div.reduce((s: number, d: any) => s + d.women, 0), leavers_last_12_months: left, open_requisitions: reqs.open, note: 'Synthetic data.' } };
    }
    case 'payroll_precheck': {
      const pc = await precheck(ctx);
      return { result: { period: pc.period.period_name, totals: pc.totals, last_month: pc.last, blocked: pc.blocked, findings: pc.findings.map((f) => ({ severity: f.severity, title: f.title, person: f.name, detail: f.detail, fix: f.fix, rule: f.rule })) } };
    }
    case 'calibration_summary': {
      const period = (await pool.query(`SELECT review_period FROM hcm.performance_documents WHERE status <> 'COMPLETED' ORDER BY review_period DESC LIMIT 1`)).rows[0]?.review_period;
      const cal = await calibration(ctx, period, input.division ?? 'Commercial');
      return { result: { period, division: cal.division, n: cal.n, average: cal.average, distribution: cal.distribution, flags: cal.flags.map((f: any) => lang === 'ar' ? f.text_ar : f.text) } };
    }
    case 'compliance_alerts': {
      const where = [`a.status <> 'RESOLVED' OR $1::boolean`];
      const params: unknown[] = [!!input.include_resolved];
      if (Array.isArray(input.kinds) && input.kinds.length) { params.push(input.kinds); where.push(`a.kind = ANY($${params.length})`); }
      if (Number(input.within_days) > 0) { params.push(Number(input.within_days)); where.push(`a.due_date <= CURRENT_DATE + $${params.length}::int`); }
      const rows = (await pool.query(
        `SELECT a.ref, a.kind, a.severity, a.status, a.due_date, (a.due_date - CURRENT_DATE) AS days_left, a.owner_role, a.title, a.detail, p.display_name AS person, p.person_number
           FROM layer.alerts a LEFT JOIN hcm.persons p ON p.id=a.person_id
          WHERE ${where.map((w) => `(${w})`).join(' AND ')}
          ORDER BY a.due_date NULLS LAST`, params)).rows;
      let later = 0;
      if (Number(input.within_days) > 0) {
        const lp: unknown[] = [!!input.include_resolved, Number(input.within_days)];
        if (Array.isArray(input.kinds) && input.kinds.length) lp.push(input.kinds);
        later = (await pool.query(`SELECT COUNT(*)::int n FROM layer.alerts a WHERE (a.status <> 'RESOLVED' OR $1::boolean) AND a.due_date > CURRENT_DATE + $2::int${lp.length > 2 ? ' AND a.kind = ANY($3)' : ''}`, lp)).rows[0].n;
      }
      return { result: { count: rows.length, flagged_later: later, horizon: 'Iqama and national ID: 60 days ahead. Passport: 180 days. Probation and contract end: 30 days.', flags: rows.map((r: any) => ({ ref: r.ref, kind: r.kind, person: r.person, person_number: r.person_number, due_date: r.due_date, days_left: r.days_left, severity: r.severity, status: r.status, owner: r.owner_role, action: r.detail })) } };
    }
    case 'search_cases': {
      const [scope, sp] = caseScope(p, 1);
      const params: unknown[] = [...sp];
      const where = [scope];
      const st = String(input.status ?? 'open');
      const S: Record<string, string[]> = { open: ['WAITING', 'RUNNING', 'ESCALATED'], waiting: ['WAITING'], escalated: ['ESCALATED'], completed: ['COMPLETED'], rejected: ['REJECTED'] };
      if (S[st]) { params.push(S[st]); where.push(`r.status = ANY($${params.length})`); }
      if (input.workflow) { params.push(String(input.workflow).toUpperCase()); where.push(`r.workflow_id = $${params.length}`); }
      if (input.type) { params.push(String(input.type).toUpperCase()); where.push(`r.type = $${params.length}`); }
      if (input.overdue) where.push(`r.sla_due < now() AND r.status IN ('WAITING','RUNNING','ESCALATED')`);
      if (input.waiting_on) { params.push(`%${input.waiting_on}%`); where.push(`(w.display_name ILIKE $${params.length} OR r.waiting_on_role ILIKE $${params.length})`); }
      if (input.text) { params.push(`%${input.text}%`); where.push(`(r.ref ILIKE $${params.length} OR r.title ILIKE $${params.length} OR s.display_name ILIKE $${params.length})`); }
      if (Number(input.created_within_days) > 0) { params.push(Number(input.created_within_days)); where.push(`r.created_at >= now() - make_interval(days => $${params.length}::int)`); }
      const lim = Math.min(Math.max(Number(input.limit) || 20, 1), 50);
      const sql = `FROM layer.requests r JOIN hcm.persons s ON s.id=r.subject_person_id LEFT JOIN hcm.persons w ON w.id=r.waiting_on_person_id WHERE ${where.map((x) => `(${x})`).join(' AND ')}`;
      const total = (await pool.query(`SELECT COUNT(*)::int n ${sql}`, params)).rows[0].n;
      const rows = (await pool.query(`SELECT r.ref, r.workflow_id, r.type, r.title, r.status, r.current_step, r.waiting_on_role, w.display_name AS waiting_on, s.display_name AS about, r.created_at, r.sla_due, (r.sla_due < now() AND r.status IN ('WAITING','RUNNING','ESCALATED')) AS overdue, r.closed_at ${sql} ORDER BY r.sla_due NULLS LAST, r.created_at DESC LIMIT ${lim}`, params)).rows;
      return { result: { total, shown: rows.length, cases: rows } };
    }
    case 'tasama_escalations': {
      const params: unknown[] = [!!input.include_resolved];
      const where = [`(e.status <> 'RESOLVED' OR $1::boolean)`];
      if (input.client) { params.push(`%${input.client}%`); where.push(`(e.client_key ILIKE $${params.length} OR c.name ILIKE $${params.length})`); }
      if (input.kind) { params.push(input.kind); where.push(`e.kind = $${params.length}`); }
      const rows = (await pool.query(`SELECT e.id, c.name AS client, e.case_ref, e.title, e.sla_key, e.kind, e.status, e.waiting_on, e.due_at, e.detected_at, e.action, s.name AS owner FROM tasama.escalations e JOIN tasama.clients c ON c.key=e.client_key LEFT JOIN tasama.staff s ON s.id=e.owner_staff_id WHERE ${where.join(' AND ')} ORDER BY e.due_at NULLS LAST`, params)).rows;
      return { result: { count: rows.length, escalations: rows.map((r: any) => ({ escalation: `ESC-${r.id}`, ...r })) } };
    }
    case 'propose_request': {
      try {
        const s = await buildCase(p, input, 'CHAT');
        return { result: { proposed: true, title: lang === 'ar' ? s.title_ar : s.title, note: 'Shown to the person with a Confirm button. Not submitted yet.' }, pending: { body: { ...input, channel: 'CHAT' }, title: s.title, title_ar: s.title_ar, workflow: s.workflowId, payload: s.payload } };
      } catch (e: any) { return { result: { error: e.message } }; }
    }
    case 'open_screen': return { result: { ok: SCREENS.includes(input.screen) }, navigate: SCREENS.includes(input.screen) ? input.screen : undefined };
  }
  return { result: null };
}
