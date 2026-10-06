/**
 * Persona "sign-in". The prototype has no login: the presenter switches
 * client and persona from the title bar. Every request carries `x-client` and
 * `x-persona`, and the server — not the browser — decides what that persona
 * may see and approve. Seven personas exist inside each client; the eighth,
 * the Tasama HR Operations Manager, works across all clients.
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
  lenses: ['tasama', 'hr', 'control'], roles: ['TASAMA', 'HRBP', 'TA', 'PAYROLL', 'HR_OPS', 'CHRO'], scope: { data: 'all' },
  approval_limits: [
    { what: 'Client invoices before issue', what_ar: 'فواتير العملاء قبل إصدارها' },
    { what: 'SLA escalations across all clients', what_ar: 'تصعيدات مستوى الخدمة لجميع العملاء' },
    { what: 'Delivery staffing and reassignment', what_ar: 'توزيع فريق التشغيل وإعادة الإسناد' },
    { what: 'Client decisions on behalf of the approver, with a reason on record', what_ar: 'قرارات العميل نيابة عن المعتمد مع تسجيل السبب' },
  ],
  display_name: 'Faisal Al Harbi', display_name_ar: 'فيصل الحربي', person_number: 'TASAMA-0007', photo_seed: 77,
};

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
  if (key === TASAMA_KEY) return TASAMA_PERSONA;
  const all = await personas();
  return all.find((p) => p.key === key) ?? all[0];
}
export const isTasama = (p: Persona) => p.key === TASAMA_KEY;
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
  if (p.roles.includes('CHRO') || p.roles.includes('PAYROLL')) return ['true', []];
  if (p.roles.includes('TA')) return [`(r.workflow_id IN ('WF-01','WF-02','WF-03','WF-04','WF-05','WF-06') OR r.requester_person_id = $${idx} OR r.subject_person_id = $${idx} OR r.waiting_on_person_id = $${idx})`, [p.person_id]];
  if (p.roles.includes('HRBP')) return [`(r.waiting_on_person_id = $${idx} OR r.requester_person_id = $${idx} OR r.subject_person_id = $${idx} OR EXISTS (SELECT 1 FROM hcm.assignments a JOIN hcm.departments d ON d.id=a.department_id WHERE a.person_id = r.subject_person_id AND a.effective_end='4712-12-31' AND d.division = ANY($${idx + 1})))`, [p.person_id, p.scope.divisions ?? []]];
  if (p.roles.includes('LINE_MANAGER')) return [`(r.requester_person_id = $${idx} OR r.subject_person_id = $${idx} OR r.waiting_on_person_id = $${idx} OR r.subject_person_id IN (SELECT person_id FROM hcm.assignments WHERE manager_person_id = $${idx} AND effective_end='4712-12-31'))`, [p.person_id]];
  return [`(r.requester_person_id = $${idx} OR r.subject_person_id = $${idx})`, [p.person_id]];
}
