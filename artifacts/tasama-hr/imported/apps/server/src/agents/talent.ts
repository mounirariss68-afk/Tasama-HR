/**
 * Saeed, Hessa, Tamkeen, Mezan and Tarqiya: the agents that prepare
 * decisions about positions and people. None of them decides. Each returns
 * evidence and flags that a person reads before acting.
 */
import { read, type Ctx } from '../hcm/connector.js';
import { client, eosWage, round2 } from '../domain/rules.js';

// ------------------------------------------------------------------ Saeed

export async function positionCheck(ctx: Ctx, departmentId: number, gradeRank: number, jobTitle: string, budgeted: boolean, asOf: string) {
  const dept = await read(ctx, 'departments', `q=DepartmentId=${departmentId}`, 'Department and headcount', async () =>
    (await ctx.c.query(`SELECT d.*, (SELECT COUNT(*) FROM hcm.positions p WHERE p.department_id=d.id AND p.status='ACTIVE')::int AS positions,
                               (SELECT COUNT(*) FROM hcm.positions p WHERE p.department_id=d.id AND p.hiring_status='FILLED')::int AS filled,
                               (SELECT COALESCE(SUM(annual_budget),0) FROM hcm.positions p WHERE p.department_id=d.id) AS budget
                          FROM hcm.departments d WHERE d.id=$1`, [departmentId])).rows[0]);
  const grade = (await ctx.c.query(`SELECT * FROM hcm.grades WHERE rank=$1`, [gradeRank])).rows[0];
  // Saudization for Nitaqat: Saudi share of all active employees. is_saudi is used only for this ratio.
  const sa = await read(ctx, 'workers', `q=LegalEmployer=${client().code}&fields=Nationality`, 'Saudization ratio', async () =>
    (await ctx.c.query(`SELECT COUNT(*) FILTER (WHERE p.is_saudi)::int AS saudi, COUNT(*)::int AS total
                          FROM hcm.persons p JOIN hcm.work_relationships wr ON wr.person_id=p.id
                         WHERE wr.worker_type='E' AND (wr.end_date IS NULL OR wr.end_date >= $1)`, [asOf])).rows[0]);
  const annual = round2(eosWage(grade.mid_basic) * 12); // basic, housing and transport at the grade midpoint, SAR
  const ratio = sa.total ? sa.saudi / sa.total : 0;
  const nq = client().nitaqat;
  return {
    department: dept.name, positions: dept.positions, filled: dept.filled, vacant: dept.positions - dept.filled,
    budgeted, annual_cost_mid: annual, grade: grade.code, grade_range: [grade.min_basic, grade.max_basic],
    saudization: { current: round2(ratio * 100), ifSaudi: round2((sa.saudi + 1) / (sa.total + 1) * 100), ifNot: round2(sa.saudi / (sa.total + 1) * 100), target: round2(nq.requiredPct * 100), band: nq.band },
    needsChro: gradeRank >= 11 || !budgeted,
    jd: {
      en: `${jobTitle}, ${dept.name}, ${client().short}. Grade ${grade.code}. Purpose: deliver the department's plan for the year to the agreed quality and control standards. Accountabilities: own a defined portfolio of work; meet service and control standards; work with Compliance and Legal where the role requires it; develop colleagues. Requirements: as set in the requisition criteria.`,
      ar: `${jobTitle}، ${dept.name_ar}، ${client().name_ar}. الدرجة ${grade.code}. الغرض: تنفيذ خطة الإدارة للعام وفق معايير الجودة والرقابة المتفق عليها. المسؤوليات: إدارة نطاق عمل محدد، والالتزام بمعايير الخدمة والرقابة، والعمل مع الامتثال والشؤون القانونية حيث يتطلب الدور ذلك، وتطوير الزملاء. المتطلبات: وفق معايير طلب التوظيف.`,
    },
  };
}

// ------------------------------------------------------------------ Hessa

const hash = (s: string) => { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return Math.abs(h); };

/**
 * Evidence against stated criteria. Deliberately blind to protected
 * attributes: nationality, gender and age are not inputs. (Saudization priority
 * under Nitaqat is applied by the RECRUITER, per HR-02 §2.3, not by this
 * function; is_saudi is read only for Saudization reporting.)
 */
export function evidence(cand: { candidate_number: string; years_experience: number; education: string; certifications: string[]; current_employer: string | null }, criteria: { key: string; label: string; kind: string }[]) {
  return criteria.map((cr) => {
    const h = hash(cand.candidate_number + cr.key) % 100;
    const yrs = Number(/(\d+)\+/.exec(cr.label)?.[1] ?? 0);
    let status: 'evident' | 'partial' | 'not_evident';
    let note: string;
    if (yrs) {
      status = cand.years_experience >= yrs ? 'evident' : cand.years_experience >= yrs - 1 ? 'partial' : 'not_evident';
      note = `${cand.years_experience} years stated${cand.current_employer ? `, currently at ${cand.current_employer}` : ''}.`;
    } else if (/CFA|CAMS|FRM|CISSP|OSCP|CCXP|certification/i.test(cr.label)) {
      const has = cand.certifications.find((x) => new RegExp(cr.label.split(' ')[0].replace(/[()]/g, ''), 'i').test(x) || /certification/i.test(cr.label));
      status = has ? 'evident' : h < 25 ? 'partial' : 'not_evident';
      note = has ? `Holds ${has}.` : status === 'partial' ? 'Studying towards it (stated in CV).' : 'Not mentioned in the application.';
    } else if (/degree/i.test(cr.label)) {
      status = /Bachelor|Master/.test(cand.education) ? 'evident' : 'not_evident';
      note = `${cand.education}.`;
    } else {
      status = h < 60 ? 'evident' : h < 80 ? 'partial' : 'not_evident';
      note = status === 'evident' ? 'Described with examples in the CV.' : status === 'partial' ? 'Mentioned without detail; worth probing at screen.' : 'Not mentioned in the application.';
    }
    return { key: cr.key, label: cr.label, kind: cr.kind, status, note };
  });
}

// ------------------------------------------------------------------ Tamkeen

export async function assessmentSpread(ctx: Ctx, centreId: number) {
  const rows = await read(ctx, 'assessmentResults', `q=CentreId=${centreId}`, 'Assessment-centre scores', async () =>
    (await ctx.c.query(`SELECT * FROM hcm.assessment_results WHERE centre_id=$1`, [centreId])).rows);
  const key = (r: any) => `${r.participant}|${r.competency}`;
  const groups = new Map<string, any[]>();
  for (const r of rows) { if (!groups.has(key(r))) groups.set(key(r), []); groups.get(key(r))!.push(r); }
  const flags: any[] = [];
  const summary = new Map<string, { name: string; scores: number[] }>();
  for (const [k, rs] of groups) {
    const scores = rs.map((r) => r.score);
    const [participant, competency] = k.split('|');
    if (!summary.has(participant)) summary.set(participant, { name: rs[0].participant_name, scores: [] });
    summary.get(participant)!.scores.push(...scores);
    const byAssessor = new Map<string, number[]>();
    for (const r of rs) { if (!byAssessor.has(r.assessor)) byAssessor.set(r.assessor, []); byAssessor.get(r.assessor)!.push(r.score); }
    const means = [...byAssessor].map(([a, s]) => [a, s.reduce((x, y) => x + y, 0) / s.length] as const);
    const hi = means.reduce((m, x) => (x[1] > m[1] ? x : m)), lo = means.reduce((m, x) => (x[1] < m[1] ? x : m));
    if (hi[1] - lo[1] >= 2) flags.push({ participant, name: rs[0].participant_name, competency, high: { assessor: hi[0], score: round2(hi[1]) }, low: { assessor: lo[0], score: round2(lo[1]) } });
  }
  return {
    participants: [...summary].map(([p, v]) => ({ participant: p, name: v.name, mean: round2(v.scores.reduce((a, b) => a + b, 0) / v.scores.length) })),
    flags,
  };
}

// ------------------------------------------------------------------ Mezan

export async function calibration(ctx: Ctx, period: string, division?: string) {
  const rows = await read(ctx, 'performanceDocuments', `q=ReviewPeriod=${period}${division ? `;Division=${division}` : ''}`, 'Ratings for calibration', async () =>
    (await ctx.c.query(`SELECT pd.*, p.display_name, p.display_name_ar, p.gender, p.person_number, d.name AS department, d.division, m.display_name AS manager_name, m.display_name_ar AS manager_name_ar,
                               (SELECT ROUND(AVG(progress)) FROM hcm.goals g WHERE g.person_id=pd.person_id AND g.year = $2) AS goal_progress
                          FROM hcm.performance_documents pd JOIN hcm.persons p ON p.id=pd.person_id
                          JOIN LATERAL (SELECT * FROM hcm.assignments a WHERE a.person_id=p.id ORDER BY effective_start DESC LIMIT 1) a ON true
                          JOIN hcm.departments d ON d.id=a.department_id
                          LEFT JOIN hcm.persons m ON m.id=pd.manager_id
                         WHERE pd.review_period=$1 AND pd.manager_rating IS NOT NULL ${division ? 'AND d.division=$3' : ''}
                         ORDER BY d.name, p.display_name`, division ? [period, Number(period.slice(2)), division] : [period, Number(period.slice(2))])).rows);
  const n = rows.length;
  const dist = [1, 2, 3, 4, 5].map((r) => ({ rating: r, count: rows.filter((x: any) => (x.calibrated_rating ?? x.manager_rating) === r).length }));
  const avg = n ? rows.reduce((s: number, r: any) => s + r.manager_rating, 0) / n : 0;
  const flags: any[] = [];
  const share5 = n ? dist[4].count / n : 0;
  if (share5 > 0.15) flags.push({ kind: 'DISTRIBUTION', severity: 'HIGH', text: `${Math.round(share5 * 100)}% rated 5 against a guide of no more than 15% (HR-09 §9.3).`, text_ar: `حصل ${Math.round(share5 * 100)}% على تقييم 5 مقابل حد إرشادي لا يتجاوز 15%.` });
  const byMgr = new Map<string, { ar: string; rs: number[] }>();
  for (const r of rows) { if (!r.manager_name) continue; if (!byMgr.has(r.manager_name)) byMgr.set(r.manager_name, { ar: r.manager_name_ar, rs: [] }); byMgr.get(r.manager_name)!.rs.push(r.manager_rating); }
  for (const [m, { ar, rs }] of byMgr) {
    const ma = rs.reduce((a, b) => a + b, 0) / rs.length;
    if (rs.length >= 3 && ma - avg >= 0.8) flags.push({ kind: 'LENIENCY', severity: 'HIGH', manager: m, text: `${m} rates ${rs.length} people at an average of ${ma.toFixed(1)} against ${avg.toFixed(1)} for the division.`, text_ar: `يمنح ${ar} متوسط تقييم ${ma.toFixed(1)} لعدد ${rs.length} موظفين مقابل ${avg.toFixed(1)} للقطاع.` });
  }
  for (const r of rows) {
    if (r.manager_rating <= 2 && r.goal_progress >= 94) flags.push({ kind: 'RATING_VS_GOALS', severity: 'MEDIUM', person_id: r.person_id, text: `${r.display_name} rated ${r.manager_rating} with goals ${r.goal_progress}% complete.`, text_ar: `${r.display_name_ar}: تقييم ${r.manager_rating} مع إنجاز ${r.goal_progress}% من الأهداف.` });
    if (r.manager_rating === 5 && r.goal_progress < 50) flags.push({ kind: 'RATING_VS_GOALS', severity: 'MEDIUM', person_id: r.person_id, text: `${r.display_name} rated 5 with goals ${r.goal_progress}% complete.`, text_ar: `${r.display_name_ar}: تقييم 5 مع إنجاز ${r.goal_progress}% فقط من الأهداف.` });
  }
  const byDept = new Map<string, any[]>();
  for (const r of rows) { if (!byDept.has(r.department)) byDept.set(r.department, []); byDept.get(r.department)!.push(r); }
  for (const [d, rs] of byDept) {
    const f = rs.filter((x) => x.gender === 'F'), m = rs.filter((x) => x.gender === 'M');
    if (f.length >= 3 && m.length >= 3) {
      const fa = f.reduce((s, x) => s + x.manager_rating, 0) / f.length, mav = m.reduce((s, x) => s + x.manager_rating, 0) / m.length;
      if (Math.abs(fa - mav) >= 0.7) flags.push({ kind: 'GENDER_GAP', severity: 'HIGH', text: `${d}: women average ${fa.toFixed(1)}, men ${mav.toFixed(1)} (HR-01 §1.4).`, text_ar: `${d}: متوسط تقييم النساء ${fa.toFixed(1)} والرجال ${mav.toFixed(1)}.` });
    }
  }
  return { period, division: division ?? 'All', n, average: round2(avg), distribution: dist, guide: [{ rating: 5, max: 0.15 }, { rating: 3, target: 0.6 }], flags, rows };
}

// ------------------------------------------------------------------ Tarqiya

export async function promotionCase(ctx: Ctx, personId: number, toRank: number, asOf: string) {
  const w = await read(ctx, 'workers', `q=PersonId=${personId}&expand=salaries,assignments`, 'Promotion case: worker', async () =>
    (await ctx.c.query(`SELECT p.*, s.basic, s.housing, s.transport, s.other_allowance, g.rank, g.code AS grade, a.effective_start AS in_grade_since, d.name AS department, j.name AS job
                          FROM hcm.persons p
                          JOIN LATERAL (SELECT * FROM hcm.assignments a WHERE a.person_id=p.id AND a.effective_start <= $2 ORDER BY effective_start DESC LIMIT 1) a ON true
                          JOIN hcm.grades g ON g.id=a.grade_id JOIN hcm.departments d ON d.id=a.department_id JOIN hcm.jobs j ON j.id=a.job_id
                          LEFT JOIN LATERAL (SELECT * FROM hcm.salaries s WHERE s.person_id=p.id AND s.date_from <= $2 ORDER BY date_from DESC LIMIT 1) s ON true
                         WHERE p.id=$1`, [personId, asOf])).rows[0]);
  // time in grade: first assignment row at the current grade
  const since = (await ctx.c.query(`SELECT MIN(effective_start) AS d FROM hcm.assignments a JOIN hcm.grades g ON g.id=a.grade_id WHERE a.person_id=$1 AND g.rank=$2`, [personId, w.rank])).rows[0].d;
  const ratings = (await ctx.c.query(`SELECT review_period, COALESCE(calibrated_rating, manager_rating) AS rating FROM hcm.performance_documents WHERE person_id=$1 AND COALESCE(calibrated_rating, manager_rating) IS NOT NULL ORDER BY review_period DESC`, [personId])).rows;
  const tg = (await ctx.c.query(`SELECT * FROM hcm.grades WHERE rank=$1`, [toRank])).rows[0];
  const months = Math.round((new Date(asOf).getTime() - new Date(since).getTime()) / (30.4 * 86400000));
  const proposed = Math.round(Math.max(tg.min_basic, w.basic * 1.08) / 50) * 50;
  const peers = (await ctx.c.query(`SELECT s.basic FROM hcm.salaries s JOIN LATERAL (SELECT * FROM hcm.assignments a WHERE a.person_id=s.person_id ORDER BY effective_start DESC LIMIT 1) a ON true
                                     JOIN hcm.grades g ON g.id=a.grade_id WHERE g.rank=$1 AND s.date_to='4712-12-31'`, [toRank])).rows.map((r: any) => r.basic);
  const pm = peers.length ? peers.reduce((a: number, b: number) => a + b, 0) / peers.length : tg.mid_basic;
  const eligible = months >= 12 && (ratings[0]?.rating ?? 0) >= 3;
  return {
    person: { id: w.id, name: w.display_name, name_ar: w.display_name_ar, job: w.job, department: w.department },
    from: { grade: w.grade, basic: w.basic }, to: { grade: tg.code, min: tg.min_basic, mid: tg.mid_basic, max: tg.max_basic },
    monthsInGrade: months, ratings, eligible,
    proposed, increasePct: round2((proposed / w.basic - 1) * 100), compaRatio: round2(proposed / tg.mid_basic), peerMedian: Math.round(pm), peers: peers.length,
    approver: toRank - w.rank >= 2 || proposed > tg.mid_basic ? 'CHRO' : 'HRBP',
    equity: proposed < pm * 0.9 ? { below: round2((1 - proposed / pm) * 100), suggest: Math.round(pm * 0.9 / 50) * 50 } : null,
  };
}
