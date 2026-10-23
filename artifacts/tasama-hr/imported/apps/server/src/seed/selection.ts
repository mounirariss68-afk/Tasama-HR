/**
 * Interviews for the applicants who reached them (design/hiring-addendum.md). Runs after the base
 * seed and before the case history, so the Leasing Manager offer the history opens has its
 * selection. It uses its own seeded random numbers: nothing else in the seed moves.
 */
import type { PoolClient } from 'pg';
import { addDays, iso } from '../domain/rules.js';
import { evidence } from '../agents/talent.js';
import type { BaseResult } from './base.js';

const hash = (s: string) => { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
function rng(seed: number) { let t = seed; return () => { t = (t + 0x6d2b79f5) | 0; let r = Math.imul(t ^ (t >>> 15), 1 | t); r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r; return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }

const SCREEN = ['Motivation for the role', 'Communication'];
const PANEL = ['Technical depth', 'Problem solving', 'Stakeholder management', 'Team fit'];

export async function seedSelection(c: PoolClient, base: BaseResult, clientKey: string) {
  const R = rng(hash(`selection:${clientKey}`));
  const A = base.anchor;
  const job = async (code: string) => (await c.query(`SELECT r.* FROM hcm.requisitions r JOIN hcm.positions p ON p.id=r.position_id JOIN hcm.jobs j ON j.id=p.job_id WHERE j.code=$1`, [code])).rows[0];
  const chosen = new Map<number, number>();   // application id -> how strong (1 strongest)
  // The Leasing Manager finalists: the first four by number, at the assessment centre; the second is the one offered (seed/history).
  const cor = await job('COR-RM');
  if (cor) {
    const ids = (await c.query(`SELECT id FROM hcm.applications WHERE requisition_id=$1 ORDER BY id LIMIT 4`, [cor.id])).rows.map((r: any) => r.id);
    await c.query(`UPDATE hcm.applications SET phase='ASSESSMENT' WHERE id = ANY($1)`, [ids]);
    if (ids[1]) chosen.set(ids[1], 1);
  }
  // Security Analyst (D4): the two lowest-numbered open applicants have had their panel.
  const sec = await job('SEC-AN');
  if (sec) {
    const ids = (await c.query(`SELECT id FROM hcm.applications WHERE requisition_id=$1 AND phase NOT IN ('HIRED','NOT_SELECTED') ORDER BY id LIMIT 2`, [sec.id])).rows.map((r: any) => r.id);
    await c.query(`UPDATE hcm.applications SET phase='INTERVIEW' WHERE id = ANY($1)`, [ids]);
    ids.forEach((id: number, k: number) => chosen.set(id, k + 1));
  }
  const apps = (await c.query(`SELECT a.id, a.phase, a.applied_at, a.requisition_id, r.hiring_manager_id, r.recruiter_id, r.criteria, c.candidate_number, c.years_experience, c.education, c.certifications, c.current_employer
      FROM hcm.applications a JOIN hcm.requisitions r ON r.id=a.requisition_id JOIN hcm.candidates c ON c.id=a.candidate_id
      WHERE a.phase IN ('INTERVIEW','ASSESSMENT','OFFER','HIRED') ORDER BY a.id`)).rows;
  const names = new Map((await c.query(`SELECT id, display_name, display_name_ar FROM hcm.persons`)).rows.map((p: any) => [p.id, p]));
  const who = (id: number, role: string) => { const p: any = names.get(id); return p ? { person_id: id, name: p.display_name, name_ar: p.display_name_ar, role } : null; };
  // A chosen candidate's years meet the requisition's stated minimum: the panel would not have put them forward otherwise.
  for (const a of apps) if (chosen.has(a.id)) {
    const need = Math.max(0, ...((a.criteria ?? []) as any[]).map((cr) => Number(/(\d+)\+/.exec(cr.label)?.[1] ?? 0)));
    if (a.years_experience < need + 1) { a.years_experience = need + 1 + Math.floor(R() * 4); await c.query(`UPDATE hcm.candidates SET years_experience=$2 WHERE candidate_number=$1`, [a.candidate_number, a.years_experience]); }
  }
  // A finalist applied early enough for a screen and a panel before the assessment centre (six days ago).
  for (const a of apps) {
    const latest = addDays(A, a.phase === 'INTERVIEW' && !chosen.has(a.id) ? -12 : -25);
    if (new Date(a.applied_at) > latest) { a.applied_at = addDays(latest, -Math.floor(R() * 10)); await c.query(`UPDATE hcm.applications SET applied_at=$2 WHERE id=$1`, [a.id, a.applied_at]); }
  }
  const rows: any[] = [];
  const score = (q: number) => Math.max(1, Math.min(5, Math.round(q + (R() - 0.5) * 1.6)));
  for (const a of apps) {
    const ev = evidence({ candidate_number: a.candidate_number, years_experience: a.years_experience, education: a.education, certifications: a.certifications ?? [], current_employer: a.current_employer }, a.criteria ?? []);
    const shown = ev.filter((e) => e.status === 'evident').length / Math.max(1, ev.length);
    const rank = chosen.get(a.id);
    const q = rank === 1 ? 4.3 : rank === 2 ? 3.8 : 2.6 + shown * 1.1;
    const applied = new Date(a.applied_at);
    const screenAt = new Date(Math.max(addDays(applied, 1).getTime(), Math.min(addDays(applied, 3 + Math.floor(R() * 4)).getTime(), addDays(A, -14).getTime())));
    const recruiter = who(a.recruiter_id, 'Recruiter');
    const panel = [who(a.hiring_manager_id, 'Hiring manager'), who(base.persona.hrbp, 'HR business partner'), recruiter].filter(Boolean) as any[];
    rows.push({ application_id: a.id, stage: 'Recruiter screen', scheduled_at: screenAt, panel: JSON.stringify(recruiter ? [recruiter] : []), status: 'COMPLETED',
      scores: JSON.stringify(SCREEN.map((k) => ({ assessor: recruiter?.name ?? 'Recruiter', competency: k, score: score(q + 0.2) }))), recommendation: q >= 3 ? 'PROCEED' : 'HOLD' });
    const panelDone = a.phase !== 'INTERVIEW' || rank !== undefined;
    const panelAt = panelDone ? new Date(Math.max(addDays(screenAt, 1).getTime(), Math.min(addDays(screenAt, 3 + Math.floor(R() * 3)).getTime(), addDays(A, -8).getTime()))) : addDays(A, 2 + Math.floor(R() * 5));
    rows.push({ application_id: a.id, stage: 'Panel', scheduled_at: panelAt, panel: JSON.stringify(panel), status: panelDone ? 'COMPLETED' : 'SCHEDULED',
      scores: panelDone ? JSON.stringify(panel.flatMap((m) => PANEL.map((k) => ({ assessor: m.name, competency: k, score: score(q + (k === 'Stakeholder management' && rank === 1 ? 0.5 : 0)) })))) : null,
      recommendation: panelDone ? (q >= 3.5 ? 'HIRE' : q >= 3 ? 'CONSIDER' : 'DO_NOT_HIRE') : null });
  }
  for (const r of rows) await c.query(`INSERT INTO hcm.interviews (application_id, stage, scheduled_at, panel, status, scores, recommendation) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [r.application_id, r.stage, r.scheduled_at, r.panel, r.status, r.scores, r.recommendation]);
  void iso;
  return { interviews: rows.length, chosen: [...chosen.keys()] };
}
