/**
 * Persona "sign-in". The prototype has no login: the presenter switches
 * client and persona from the title bar. Every request carries `x-client` and
 * `x-persona`, and the server — not the browser — decides what that persona
 * may see and approve. Eight personas exist inside each client; four Tasama
 * people (the HR Operations Manager, the HR operations specialist, and the
 * payroll manager and specialist) work across all clients.
 */
import type { Request } from 'express';
import { pool, currentClient } from '../db.js';

export type Persona = {
  key: string; person_id: number; label: string; label_ar: string; role_title: string; role_title_ar: string;
  lenses: string[]; roles: string[]; scope: { data: string; divisions?: string[] }; approval_limits: any[];
  display_name: string; display_name_ar: string; person_number: string; photo_seed: number;
};

export const TASAMA_KEY = 'tasama';
/** Tasama's own HR Operations Manager. Not an employee of any client; acts across all of them. Synthetic person. */
export const TASAMA_PERSONA: Persona = {
  key: TASAMA_KEY, person_id: 0, label: 'Tasama HR Operations Manager', label_ar: 'مدير عمليات الموارد البشرية في تسامى',
  role_title: 'HR Operations Manager, Tasama HR Services', role_title_ar: 'مدير عمليات الموارد البشرية، خدمات الموارد البشرية في تسامى',
  lenses: ['tasama', 'hrops', 'hr', 'control'], roles: ['TASAMA', 'TASAMA_HR_OPS', 'HRBP', 'TA', 'PAYROLL', 'HR_OPS', 'CHRO'], scope: { data: 'all' },
  approval_limits: [
    { what: 'Client invoices before issue', what_ar: 'فواتير العملاء قبل إصدارها' },
    { what: 'SLA escalations across all clients', what_ar: 'تصعيدات مستوى الخدمة لجميع العملاء' },
    { what: 'Delivery staffing and reassignment', what_ar: 'توزيع فريق التشغيل وإعادة الإسناد' },
    { what: 'Client decisions on behalf of the approver, with a reason on record', what_ar: 'قرارات العميل نيابة عن المعتمد مع تسجيل السبب' },
  ],
  display_name: 'Faisal Al Harbi', display_name_ar: 'فيصل الحربي', person_number: 'TASAMA-0007', photo_seed: 77,
};

/**
 * Tasama's payroll team (design/payroll-addendum.md §2). Real names of the Tasama payroll managers who met
 * Cognirise on 22 October 2026, used at the prototype owner's request; everything they do in the demo is synthetic.
 * Not employees of any client: a case waiting on them carries waiting_on_role TASAMA_PAYROLL or TASAMA_PAYROLL_LEAD.
 */
export const PAYROLL_SPECIALIST_KEY = 'tasama-specialist';
export const PAYROLL_LEAD_KEY = 'tasama-lead';
export const PAYROLL_SPECIALIST: Persona = {
  key: PAYROLL_SPECIALIST_KEY, person_id: 0, label: 'Payroll specialist, Tasama', label_ar: 'أخصائي الرواتب، تسامى',
  role_title: 'Payroll Specialist, Tasama HR Services', role_title_ar: 'أخصائي الرواتب، خدمات الموارد البشرية في تسامى',
  lenses: ['payroll'], roles: ['TASAMA_STAFF', 'TASAMA_PAYROLL'], scope: { data: 'all' },
  approval_limits: [
    { what: 'Prepares payroll runs, back pay and off-cycle runs', what_ar: 'يُعد مسيرات الرواتب والفروقات والمسيرات الاستثنائية' },
    { what: 'Never validates a run', what_ar: 'لا يعتمد أي مسير' },
  ],
  display_name: 'Nasser AlFarraj', display_name_ar: 'ناصر الفراج', person_number: 'TASAMA-0021', photo_seed: 121,
};
export const PAYROLL_LEAD: Persona = {
  key: PAYROLL_LEAD_KEY, person_id: 0, label: 'Payroll manager, Tasama', label_ar: 'مديرة الرواتب، تسامى',
  role_title: 'Payroll Manager, Tasama HR Services', role_title_ar: 'مديرة الرواتب، خدمات الموارد البشرية في تسامى',
  lenses: ['payroll'], roles: ['TASAMA_STAFF', 'TASAMA_PAYROLL', 'TASAMA_PAYROLL_LEAD'], scope: { data: 'all' },
  approval_limits: [
    { what: 'Validates runs she did not prepare', what_ar: 'تعتمد المسيرات التي لم تُعدّها' },
    { what: 'Initiates the bank file; approves journals for posting', what_ar: 'تبدأ ملف البنك وتعتمد القيود للترحيل' },
    { what: 'Recommends how a client\'s policy is read', what_ar: 'توصي بقراءة سياسة العميل' },
  ],
  display_name: 'Sharifa AlMousa', display_name_ar: 'شريفة الموسى', person_number: 'TASAMA-0014', photo_seed: 114,
};
/**
 * Tasama's HR Operations team (design/hr-ops-addendum.md R1): the month's intake, the Master File and, for
 * the clients whose contract includes HR operations, the HR administration. Lama is fictional, from the
 * delivery team; she plays the team, as Nasser plays the payroll specialists. A case waiting on the team
 * carries waiting_on_role TASAMA_HR_OPS.
 */
export const HR_OPS_SPECIALIST_KEY = 'tasama-hrops';
export const HR_OPS_SPECIALIST: Persona = {
  key: HR_OPS_SPECIALIST_KEY, person_id: 0, label: 'HR operations specialist, Tasama', label_ar: 'أخصائية عمليات الموارد البشرية، تسامى',
  role_title: 'HR Operations Specialist, Tasama HR Services', role_title_ar: 'أخصائية عمليات الموارد البشرية، خدمات الموارد البشرية في تسامى',
  lenses: ['hrops'], roles: ['TASAMA_STAFF', 'TASAMA_HR_OPS'], scope: { data: 'all' },
  approval_limits: [
    { what: 'Enters and checks each client\'s monthly changes, and hands them to payroll', what_ar: 'تُدخل تغييرات كل عميل الشهرية وتتحقق منها وتسلّمها للرواتب' },
    { what: 'Enters a new IBAN from the client\'s bank letter', what_ar: 'تُدخل رقم الآيبان الجديد من خطاب البنك المقدم من العميل' },
    { what: 'Works out end-of-service settlements for clients whose contract includes HR operations', what_ar: 'تحسب مكافآت نهاية الخدمة للعملاء الذين يشمل عقدهم عمليات الموارد البشرية' },
  ],
  display_name: 'Lama Al Dossary', display_name_ar: 'لمى الدوسري', person_number: 'TASAMA-0031', photo_seed: 131,
};
export const TASAMA_STAFF: Persona[] = [TASAMA_PERSONA, HR_OPS_SPECIALIST, PAYROLL_LEAD, PAYROLL_SPECIALIST];

const cache = new Map<string, Persona[]>();
export const resetPersonas = () => { cache.clear(); };
export async function personas(): Promise<Persona[]> {
  const k = currentClient() ?? '';
  if (!cache.has(k)) {
    cache.set(k, (await pool.query(`SELECT pe.*, p.display_name, p.display_name_ar, p.person_number, p.photo_seed FROM layer.personas pe JOIN hcm.persons p ON p.id = pe.person_id ORDER BY pe.sort`)).rows);
  }
  return cache.get(k)!;
}
export async function personaOf(req: Request): Promise<Persona> {
  const key = String(req.header('x-persona') ?? 'employee');
  const staff = TASAMA_STAFF.find((x) => x.key === key);
  if (staff) return staff;
  const all = await personas();
  return all.find((p) => p.key === key) ?? all[0];
}
export const isTasama = (p: Persona) => p.key === TASAMA_KEY;
/** Faisal, Lama, Sharifa or Nasser: Tasama people who act across every client. */
export const isTasamaStaff = (p: Persona) => TASAMA_STAFF.some((x) => x.key === p.key);
export const isPayrollTeam = (p: Persona) => p.roles.includes('TASAMA_PAYROLL');
export const isHrOpsTeam = (p: Persona) => p.roles.includes('TASAMA_HR_OPS');
export const has = (p: Persona, role: string) => p.roles.includes(role);
export const isHR = (p: Persona) => p.roles.some((r) => ['HRBP', 'TA', 'PAYROLL', 'HR_OPS', 'CHRO'].includes(r));

/**
 * SQL predicate restricting persons (by alias `p`/assignment `a`/department `d`) to the persona's scope.
 * Returns [sql, params] to be appended with the next parameter index.
 */
export function personScope(p: Persona, idx: number, personCol = 'p.id', divisionCol = 'd.division'): [string, unknown[]] {
  switch (p.scope.data) {
    case 'self': return [`${personCol} = $${idx}`, [p.person_id]];
    case 'team': return [`(${personCol} = $${idx} OR ${personCol} IN (SELECT person_id FROM hcm.assignments WHERE manager_person_id = $${idx} AND effective_end = '4712-12-31'))`, [p.person_id]];
    case 'divisions': return [`${divisionCol} = ANY($${idx})`, [p.scope.divisions ?? []]];
    default: return ['true', []];
  }
}

/** Which cases a persona may see. */
export function caseScope(p: Persona, idx: number): [string, unknown[]] {
  if (p.roles.includes('CHRO') || p.roles.includes('PAYROLL') || p.roles.includes('TASAMA_PAYROLL') || p.roles.includes('TASAMA_HR_OPS')) return ['true', []];
  if (p.roles.includes('TA')) return [`(r.workflow_id IN ('WF-01','WF-02','WF-03','WF-04','WF-05','WF-06') OR r.requester_person_id = $${idx} OR r.subject_person_id = $${idx} OR r.waiting_on_person_id = $${idx})`, [p.person_id]];
  if (p.roles.includes('HRBP')) return [`(r.waiting_on_person_id = $${idx} OR r.requester_person_id = $${idx} OR r.subject_person_id = $${idx} OR EXISTS (SELECT 1 FROM hcm.assignments a JOIN hcm.departments d ON d.id=a.department_id WHERE a.person_id = r.subject_person_id AND a.effective_end='4712-12-31' AND d.division = ANY($${idx + 1})))`, [p.person_id, p.scope.divisions ?? []]];
  if (p.roles.includes('LINE_MANAGER')) return [`(r.requester_person_id = $${idx} OR r.subject_person_id = $${idx} OR r.waiting_on_person_id = $${idx} OR r.subject_person_id IN (SELECT person_id FROM hcm.assignments WHERE manager_person_id = $${idx} AND effective_end='4712-12-31'))`, [p.person_id]];
  return [`(r.requester_person_id = $${idx} OR r.subject_person_id = $${idx})`, [p.person_id]];
}
