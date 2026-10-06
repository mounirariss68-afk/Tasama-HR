/** The agentic layer's reference data: personas, agents, policies, workflows. */
import type { PoolClient } from 'pg';
import { insertMany } from '../db.js';
import { AGENTS } from '../domain/agents.js';
import { policiesFor } from '../domain/policies.js';
import type { ClientConfig } from '../domain/clients.js';
import { WORKFLOWS } from '../domain/workflows.js';
import type { BaseResult } from './base.js';

/** The seven client personas. Titles follow the client's own role names. */
export const personasFor = (c: ClientConfig) => [
  { key: 'employee', label: 'Employee', label_ar: 'موظف', role_title: c.roleRename['CXP-SR']?.[0] ?? 'Senior Customer Experience Officer', role_title_ar: c.roleRename['CXP-SR']?.[1] ?? 'مسؤول تجربة عملاء أول', lenses: ['my'], roles: ['EMPLOYEE'], scope: { data: 'self' },
    approval_limits: [{ what: 'Own requests only', what_ar: 'طلباته الشخصية فقط' }], sort: 1 },
  { key: 'joiner', label: 'New joiner', label_ar: 'موظف جديد', role_title: `${c.roleRename['INV-AN']?.[0] ?? 'Analyst'} (starting soon)`, role_title_ar: `${c.roleRename['INV-AN']?.[1] ?? 'محلل'} (يلتحق قريباً)`, lenses: ['my'], roles: ['EMPLOYEE', 'JOINER'], scope: { data: 'self' },
    approval_limits: [{ what: 'Nothing to approve', what_ar: 'لا توجد صلاحيات اعتماد' }], sort: 2 },
  { key: 'manager', label: 'Line manager', label_ar: 'مدير مباشر', role_title: c.roleRename['CXP-HD']?.[0] ?? 'Head of Customer Experience', role_title_ar: c.roleRename['CXP-HD']?.[1] ?? 'رئيس تجربة العملاء', lenses: ['my', 'team'], roles: ['EMPLOYEE', 'LINE_MANAGER'], scope: { data: 'team' },
    approval_limits: [{ what: 'Team leave', what_ar: 'إجازات الفريق' }, { what: 'Support for salary advances', what_ar: 'تأييد سلف الرواتب' }, { what: 'Probation outcome, with the HRBP', what_ar: 'نتيجة فترة التجربة بالتنسيق مع شريك الأعمال' }, { what: 'Shortlists and interview scores for own vacancies', what_ar: 'القوائم المختصرة وتقييم المقابلات لوظائفه الشاغرة' }], sort: 3 },
  { key: 'hrbp', label: 'HR business partner', label_ar: 'شريك أعمال الموارد البشرية', role_title: 'HR Business Partner, Commercial', role_title_ar: 'شريك أعمال الموارد البشرية، القطاع التجاري', lenses: ['my', 'hr', 'control'], roles: ['EMPLOYEE', 'HRBP'], scope: { data: 'divisions', divisions: ['Commercial', 'Executive Office', 'Human Resources'] },
    approval_limits: [{ what: 'Offers up to the grade midpoint', what_ar: 'العروض حتى منتصف الدرجة' }, { what: 'One-grade promotions within band', what_ar: 'الترقيات بدرجة واحدة ضمن النطاق' }, { what: 'Positions below G11 (with Finance)', what_ar: 'الوظائف دون G11 (مع المالية)' }, { what: 'Calibration panel chair', what_ar: 'رئاسة لجنة المعايرة' }], sort: 4 },
  { key: 'ta', label: 'Talent acquisition', label_ar: 'استقطاب المواهب', role_title: 'Talent Acquisition Lead', role_title_ar: 'قائد استقطاب المواهب', lenses: ['my', 'hr'], roles: ['EMPLOYEE', 'TA'], scope: { data: 'recruiting' },
    approval_limits: [{ what: 'Requisition posting', what_ar: 'نشر طلبات التوظيف' }, { what: 'Shortlists, with the hiring manager', what_ar: 'القوائم المختصرة مع المدير المعني' }], sort: 5 },
  { key: 'payroll', label: 'Payroll and HR operations', label_ar: 'الرواتب وعمليات الموارد البشرية', role_title: 'Payroll and HR Operations Lead', role_title_ar: 'قائد الرواتب وعمليات الموارد البشرية', lenses: ['my', 'hr'], roles: ['EMPLOYEE', 'PAYROLL', 'HR_OPS'], scope: { data: 'all' },
    approval_limits: [{ what: 'Payroll release', what_ar: 'اعتماد الرواتب' }, { what: 'Salary transfer letters', what_ar: 'خطابات تحويل الراتب' }, { what: 'Settlements up to SAR 200,000', what_ar: 'التسويات حتى 200,000 ريال' }, { what: 'Salary advances within policy', what_ar: 'السلف ضمن السياسة' }], sort: 6 },
  { key: 'chro', label: 'CHRO', label_ar: 'الرئيس التنفيذي للموارد البشرية', role_title: 'Chief Human Resources Officer', role_title_ar: 'الرئيس التنفيذي للموارد البشرية', lenses: ['my', 'team', 'hr', 'control'], roles: ['EMPLOYEE', 'LINE_MANAGER', 'HRBP', 'CHRO'], scope: { data: 'all' },
    approval_limits: [{ what: 'Exceptions to policy', what_ar: 'الاستثناءات من السياسة' }, { what: 'Offers above midpoint; two-grade promotions', what_ar: 'العروض فوق منتصف الدرجة والترقيات بدرجتين' }, { what: 'Positions at G11 and above; unbudgeted positions', what_ar: 'الوظائف G11 فما فوق وغير المدرجة في الميزانية' }, { what: 'Involuntary exits, with Legal', what_ar: 'إنهاء الخدمة من قبل الشركة مع القانونية' }], sort: 7 },
];

export async function seedLayer(c: PoolClient, base: BaseResult, client: ClientConfig) {
  const POLICIES = policiesFor(client);
  await insertMany(c, 'layer.personas', personasFor(client).map((p) => ({ ...p, person_id: base.persona[p.key], scope: p.scope, approval_limits: p.approval_limits })));
  await insertMany(c, 'layer.agents', AGENTS.map((a, i) => ({
    id: a.id, name: a.name, name_ar: a.name_ar, title: a.title, title_ar: a.title_ar, stage: a.stage, purpose: a.purpose, purpose_ar: a.purpose_ar,
    autonomy: a.autonomy, owner_person_id: base.persona[a.owner], functions: JSON.stringify(a.functions), superpower: a.superpower, impact: a.impact,
    tools: a.tools, hcm_reads: a.reads, hcm_writes: a.writes, decides: a.decides, sort: i,
  })));
  await insertMany(c, 'layer.policies', POLICIES.map((p) => ({ id: p.id, title: p.title, title_ar: p.title_ar, version: p.version, effective_date: p.effective, owner: p.owner, summary: p.summary })));
  for (const p of POLICIES) for (const cl of p.clauses) {
    await c.query(`INSERT INTO layer.policy_clauses (id, policy_id, clause_ref, heading, heading_ar, text_en, text_ar, legal_ref, tags, search)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, setweight(to_tsvector('english', $4 || ' ' || array_to_string($9::text[], ' ')), 'A') || setweight(to_tsvector('english', $6), 'B'))`,
      [`${p.id} §${cl.ref}`, p.id, cl.ref, cl.heading, cl.heading_ar, cl.en, cl.ar, cl.legal ?? null, cl.tags]);
  }
  await insertMany(c, 'layer.workflow_defs', WORKFLOWS.map((w) => ({ id: w.id, num: w.num, name: w.name, name_ar: w.name_ar, stage: w.stage, coverage: w.coverage, trigger_en: w.trigger, agents: w.agents, decision_by: w.decision_by, steps: w.steps })));
  const hrbp: Record<string, number> = {};
  for (const [k, v] of base.hrbpForDivision) hrbp[k] = v;
  await c.query(`INSERT INTO layer.meta (key, value) VALUES ('people', $1), ('anchor', $2), ('planted', $3)`, [JSON.stringify({ persona: base.persona, hrbp }), JSON.stringify(base.anchor.toISOString()), JSON.stringify(base.planted)]);
}
