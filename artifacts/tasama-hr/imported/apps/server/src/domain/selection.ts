/**
 * The selection behind an offer (design/hiring-addendum.md): who the candidate is, how they meet the
 * requisition's criteria, what each interview found, and why the hiring manager chose them.
 * Read from the HRMS records; the interviews' findings are worked out from their scores, in English
 * and Arabic, so nothing here is free text that would need translating.
 */
import type { Q } from '../db.js';
import { evidence } from '../agents/talent.js';

export const COMPETENCY_AR: Record<string, string> = {
  'Motivation for the role': 'الدافع للوظيفة', Communication: 'التواصل', 'Technical depth': 'العمق الفني', 'Problem solving': 'حل المشكلات',
  'Stakeholder management': 'إدارة أصحاب المصلحة', 'Team fit': 'الانسجام مع الفريق', 'Client focus': 'التركيز على العميل', 'Commercial judgement': 'الحس التجاري', Integrity: 'النزاهة',
};
export const STAGE_AR: Record<string, string> = { 'Recruiter screen': 'المقابلة الأولية', Panel: 'لجنة المقابلة', 'Assessment centre': 'مركز التقييم' };
const VERDICTS: [number, string, string][] = [[4, 'Strong yes', 'نعم بقوة'], [3.5, 'Yes', 'نعم'], [3, 'Mixed', 'متباين'], [0, 'No', 'لا']];
export const verdictOf = (avg: number) => VERDICTS.find(([min]) => avg >= min)!;
const NUM_AR: Record<number, string> = { 2: 'الاثنين', 3: 'الثلاثة', 4: 'الأربعة', 5: 'الخمسة', 6: 'الستة', 7: 'السبعة', 8: 'الثمانية' };
export const yearsAr = (n: number) => (n === 1 ? 'سنة واحدة' : n === 2 ? 'سنتان' : n <= 10 ? `${n} سنوات` : `${n} سنة`);
const NUM_EN: Record<number, string> = { 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six' };
const r2 = (n: number) => Math.round(n * 100) / 100;

export type Stage = { stage: string; stage_ar: string; date: string; panel: string[]; panel_ar: string[]; avg: number; verdict: string; verdict_ar: string; finding: string; finding_ar: string; top: string };
export type Selection = {
  candidate: { name: string; name_ar: string; first: string; first_ar: string; gender: string; title: string; employer: string | null; years: number; source: string };
  manager: { name: string; name_ar: string; first: string; first_ar: string; gender: string };
  criteria: { label: string; kind: string; status: 'evident' | 'partial' | 'not_evident' }[];
  stages: Stage[];
  finalists: number;
  /** Where the candidate's last stage puts them among the finalists (1 = strongest). */
  rank: number;
  reason: string; reason_ar: string;
};

function finding(scores: { competency: string; score: number }[]): { avg: number; top: string; en: string; ar: string } {
  const by = new Map<string, number[]>();
  for (const s of scores) by.set(s.competency, [...(by.get(s.competency) ?? []), Number(s.score)]);
  const means = [...by.entries()].map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length] as [string, number]).sort((a, b) => b[1] - a[1]);
  const avg = r2(means.reduce((a, [, m]) => a + m, 0) / Math.max(1, means.length));
  const [top] = means[0];
  const low = means[means.length - 1];
  const probe = low && low[1] < 3 && low[0] !== top ? low[0] : null;
  return { avg, top, en: `strongest on ${top.toLowerCase()}${probe ? `; probe ${probe.toLowerCase()}` : ''}`, ar: `الأقوى في ${COMPETENCY_AR[top] ?? top}${probe ? `؛ يُتحقق من ${COMPETENCY_AR[probe] ?? probe}` : ''}` };
}

/** The manager's reason, in their voice, from the strongest stage and the finalists. */
export function reasonFor(s: Omit<Selection, 'reason' | 'reason_ar'>): { en: string; ar: string } {
  const last = s.stages.find((x) => x.stage === 'Assessment centre') ?? s.stages.find((x) => x.stage === 'Panel') ?? s.stages[s.stages.length - 1];
  const must = s.criteria.filter((c) => c.kind === 'must');
  const shown = must.filter((c) => c.status === 'evident').length;
  const he = s.candidate.gender === 'F' ? 'her' : 'his';
  const n = s.finalists;
  const ac = last?.stage === 'Assessment centre';
  const where = ac ? 'at the assessment centre' : 'at the panel';
  const whereAr = ac ? 'في مركز التقييم' : 'في لجنة المقابلة';
  const top = last?.top ?? 'Communication';
  const lead = n > 1
    ? (s.rank === 1 ? `came out ${n === 2 ? 'the stronger of our two finalists' : `strongest of our ${NUM_EN[n] ?? n} finalists`} ${where}, best on ${top.toLowerCase()}` : `was one of our ${NUM_EN[n] ?? n} finalists ${where}, best on ${top.toLowerCase()}`)
    : `was strongest ${where} on ${top.toLowerCase()}`;
  const leadAr = n > 1
    ? (s.rank === 1 ? `${n === 2 ? 'الأقوى بين المرشحَين النهائيين' : `الأقوى بين المرشحين ${NUM_AR[n] ?? n}`} ${whereAr}، وأفضل ما ${s.candidate.gender === 'F' ? 'لديها' : 'لديه'} ${COMPETENCY_AR[top] ?? top}` : `من المرشحين ${NUM_AR[n] ?? n} ${whereAr}، وأفضل ما ${s.candidate.gender === 'F' ? 'لديها' : 'لديه'} ${COMPETENCY_AR[top] ?? top}`)
    : `الأقوى ${whereAr} في ${COMPETENCY_AR[top] ?? top}`;
  const en = `${s.candidate.first} ${lead}, and ${he} experience shows ${shown === must.length ? (must.length === 1 ? 'our must-have' : must.length === 2 ? 'both our must-haves' : `all ${must.length} of our must-haves`) : `${shown} of our ${must.length} must-haves`}.`;
  const ar = `${s.candidate.first_ar} ${s.candidate.gender === 'F' ? 'كانت' : 'كان'} ${leadAr}، و${s.candidate.gender === 'F' ? 'خبرتها' : 'خبرته'} ${shown === must.length ? 'تغطي كل متطلباتنا الأساسية' : `تغطي ${shown} من ${must.length} من متطلباتنا الأساسية`}.`;
  return { en, ar };
}

/** Everything the offer card shows about the person it is for. Null when the application is not found. */
export async function selectionOf(q: Q, applicationId: number): Promise<Selection | null> {
  const a = (await q.query(`SELECT a.*, c.candidate_number, c.first_name, c.last_name, c.display_name_ar, c.gender, c.current_title, c.current_employer, c.years_experience, c.education, c.certifications, c.source,
      r.criteria, r.hiring_manager_id, m.display_name AS manager, m.display_name_ar AS manager_ar, m.gender AS manager_gender
    FROM hcm.applications a JOIN hcm.candidates c ON c.id=a.candidate_id JOIN hcm.requisitions r ON r.id=a.requisition_id JOIN hcm.persons m ON m.id=r.hiring_manager_id WHERE a.id=$1`, [applicationId])).rows[0];
  if (!a) return null;
  const interviews = (await q.query(`SELECT stage, to_char(scheduled_at,'YYYY-MM-DD') d, panel, scores FROM hcm.interviews WHERE application_id=$1 AND status='COMPLETED' ORDER BY scheduled_at`, [applicationId])).rows;
  const stages: Stage[] = interviews.map((i: any) => {
    const f = finding(i.scores ?? []);
    const [, v, vAr] = verdictOf(f.avg);
    return { stage: i.stage, stage_ar: STAGE_AR[i.stage] ?? i.stage, date: i.d, panel: (i.panel ?? []).map((p: any) => String(p.name).split(' ')[0]), panel_ar: (i.panel ?? []).map((p: any) => String(p.name_ar ?? p.name).split(' ')[0]), avg: f.avg, verdict: v, verdict_ar: vAr, finding: f.en, finding_ar: f.ar, top: f.top };
  });
  const ac = (await q.query(`SELECT c.centre_date::text d, r.competency, r.score, r.assessor FROM hcm.assessment_results r JOIN hcm.assessment_centres c ON c.id=r.centre_id WHERE r.participant=$1 AND c.purpose='SELECTION'`, [a.candidate_number])).rows;
  if (ac.length) {
    const f = finding(ac);
    const [, v, vAr] = verdictOf(f.avg);
    const assessors = [...new Set(ac.map((x: any) => x.assessor))] as string[];
    stages.push({ stage: 'Assessment centre', stage_ar: STAGE_AR['Assessment centre'], date: String(ac[0].d).slice(0, 10), panel: [`${assessors.length} assessors`], panel_ar: [`${assessors.length} مقيّمين`], avg: f.avg, verdict: v, verdict_ar: vAr, finding: f.en, finding_ar: f.ar, top: f.top });
    stages.sort((x, y) => x.date.localeCompare(y.date));
  }
  // The finalists: everyone on the requisition whose panel was held. The rank compares the same stage across them.
  const others = (await q.query(`SELECT i.application_id, i.scores, c.candidate_number FROM hcm.interviews i JOIN hcm.applications x ON x.id=i.application_id JOIN hcm.candidates c ON c.id=x.candidate_id WHERE x.requisition_id=$1 AND i.stage='Panel' AND i.status='COMPLETED'`, [a.requisition_id])).rows;
  const lastStage = stages.find((x) => x.stage === 'Assessment centre') ?? stages.find((x) => x.stage === 'Panel');
  let rank = 1;
  if (lastStage?.stage === 'Panel') rank = 1 + others.filter((o: any) => o.application_id !== applicationId && finding(o.scores ?? []).avg > lastStage.avg).length;
  let finalists = others.length || 1;
  if (lastStage?.stage === 'Assessment centre') {
    const all = (await q.query(`SELECT r.participant, AVG(r.score)::float m FROM hcm.assessment_results r JOIN hcm.assessment_centres c ON c.id=r.centre_id WHERE c.purpose='SELECTION' AND r.participant = ANY($1) GROUP BY 1`, [others.map((o: any) => o.candidate_number)])).rows;
    const mine = all.find((x: any) => x.participant === a.candidate_number)?.m ?? 0;
    rank = 1 + all.filter((x: any) => x.participant !== a.candidate_number && x.m > mine).length;
    finalists = Math.max(1, (await q.query(`SELECT COUNT(DISTINCT r.participant)::int n FROM hcm.assessment_results r JOIN hcm.assessment_centres c ON c.id=r.centre_id WHERE c.purpose='SELECTION'`)).rows[0].n);
  }
  const crit = (a.criteria ?? []) as { key: string; label: string; kind: string }[];
  const ev = evidence({ candidate_number: a.candidate_number, years_experience: a.years_experience, education: a.education, certifications: a.certifications ?? [], current_employer: a.current_employer }, crit);
  const [firstAr] = String(a.display_name_ar).split(' ');
  const base = {
    candidate: { name: `${a.first_name} ${a.last_name}`, name_ar: a.display_name_ar, first: a.first_name, first_ar: firstAr, gender: a.gender, title: a.current_title, employer: a.current_employer, years: a.years_experience, source: a.source },
    manager: { name: a.manager, name_ar: a.manager_ar, first: String(a.manager).split(' ')[0], first_ar: String(a.manager_ar).split(' ')[0], gender: a.manager_gender },
    criteria: ev.map((e) => ({ label: e.label, kind: e.kind, status: e.status })),
    stages, finalists, rank,
  };
  const r = reasonFor(base);
  return { ...base, reason: r.en, reason_ar: r.ar };
}
