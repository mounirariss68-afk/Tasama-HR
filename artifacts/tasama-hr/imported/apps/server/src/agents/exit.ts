/**
 * Wadaa (settlement) and Sanad (case check): the exit agents.
 */
import { read, type Ctx } from '../hcm/connector.js';
import { addDays, daysBetween, employerNoticeDays, gratuity, iso, money, monthStart, round2, settlementDeadlineDays, yearsBetween } from '../domain/rules.js';
import { worker } from '../hcm/queries.js';
import { engineInputs } from '../payroll/run.js';
import { finalSettlement } from '../domain/payroll/engine.js';

/** The engine's line codes, under the HRMS element names the termination writes. */
const SETTLEMENT_CODE: Record<string, string> = { basic: 'FINAL_BASIC', housing: 'FINAL_HOUSING', transport: 'FINAL_TRANSPORT', other: 'FINAL_OTHER', leave_encashment: 'LEAVE_ENCASH', eos_award: 'GRATUITY', notice: 'NOTICE_PAY', advance_balance: 'ADVANCE_RECOVERY', gosi: 'GOSI_EE' };

export type SettlementLine = { code: string; label: string; label_ar: string; amount: number; rule: string };

export type ExitKind = 'RESIGNATION' | 'TERMINATION';

/** Resignation or termination: explicit, else the open exit case for the person (WF-19 resignation, WF-20 termination). */
async function exitKind(ctx: Ctx, personId: number, kind?: ExitKind): Promise<ExitKind> {
  if (kind) return kind;
  const r = (await ctx.c.query(`SELECT workflow_id FROM layer.requests WHERE subject_person_id=$1 AND workflow_id IN ('WF-19','WF-20') ORDER BY (status IN ('RUNNING','WAITING','ESCALATED')) DESC, id DESC LIMIT 1`, [personId])).rows[0];
  if (r) return r.workflow_id === 'WF-19' ? 'RESIGNATION' : 'TERMINATION';
  const wr = (await ctx.c.query(`SELECT termination_action FROM hcm.work_relationships WHERE person_id=$1`, [personId])).rows[0];
  return wr?.termination_action === 'RESIGNATION' ? 'RESIGNATION' : 'TERMINATION';
}

export async function settlement(ctx: Ctx, personId: number, lastDay: string, kindIn?: ExitKind, reason?: string | null) {
  const w = (await worker(ctx, personId, lastDay))!;
  const kind = await exitKind(ctx, personId, kindIn);
  // Walkthrough addendum R39 (Art. 87): a woman who resigns within six months of her marriage, or three of a birth, receives the full award.
  const art87 = kind === 'RESIGNATION' && /MARRIAGE|BIRTH/i.test(reason ?? '') && w.gender === 'F';
  const bal = await read(ctx, 'absences', `q=PersonId=${personId}&expand=entitlementSummary`, 'Leave balance for settlement', async () =>
    (await ctx.c.query(`SELECT (entitlement + carried_over - taken - booked) AS balance FROM hcm.absence_balances WHERE person_id=$1 AND type_code='ANNUAL' ORDER BY year DESC LIMIT 1`, [personId])).rows[0]);
  const adv = await read(ctx, 'elementEntries', `q=PersonId=${personId};ElementName=ADVANCE_REC`, 'Outstanding advances', async () =>
    (await ctx.c.query(`SELECT COALESCE(SUM(outstanding),0) AS outstanding FROM hcm.advances WHERE person_id=$1 AND status='ACTIVE'`, [personId])).rows[0]);
  // The final settlement is the payroll engine's (design/payroll-addendum.md §5, §18): the actual wage
  // the policy defines, never basic alone (Art. 2, 84); leave on the same wage (Art. 111); the award by Art. 84-87.
  const monthly = w.basic + w.housing + w.transport + w.other_allowance;
  const ms = iso(monthStart(lastDay));
  const me = iso(addDays(monthStart(lastDay, 1), -1));
  const x = await engineInputs(ctx.c, { start_date: ms, end_date: me });
  const emp = x.input.find((e) => Number(e.ref) === personId);
  const deadline = settlementDeadlineDays(kind);
  const payBy = iso(addDays(lastDay, deadline));
  const lines: SettlementLine[] = [];
  let g = { factor: 1, years: round2(yearsBetween(w.original_hire_date, lastDay)), full: 0 };
  if (emp) {
    const fs = finalSettlement({ start: ms, end: me }, x.terms, { ...emp, lastDay }, { leaving: art87 ? 'ART_87' : kind === 'RESIGNATION' ? 'RESIGNATION' : 'TERMINATION', advanceOutstanding: Number(adv?.outstanding ?? 0) || undefined });
    const award = fs.lines.find((l) => l.code === 'eos_award');
    g = { factor: fs.factor, years: round2(fs.years), full: award && fs.factor ? round2(award.amount / fs.factor) : 0 };
    for (const l of fs.lines) lines.push({ code: SETTLEMENT_CODE[l.code] ?? l.code.toUpperCase(), label: l.label, label_ar: l.label, amount: l.kind === 'DEDUCTION' ? -l.amount : l.amount, rule: l.rule });
  }
  void bal;
  const total = round2(lines.reduce((s, l) => s + l.amount, 0));
  const notes: string[] = [];
  if (art87) notes.push(`Resignation within six months of marriage: the full award of ${money(g.full)}, not the Art. 85 share (Saudi Labor Law Art. 87).`);
  if (kind === 'RESIGNATION' && g.factor < 1) notes.push(`Resignation: ${g.factor === 0 ? 'no award under two years of service' : `${g.factor === 1 / 3 ? 'one third' : 'two thirds'} of the full award of ${money(g.full)}`} (Saudi Labor Law Art. 85; HR-11 §11.2).`);
  if (w.is_saudi) notes.push('Saudi national: GOSI annuity and SANED (unemployment insurance) entitlements are handled by GOSI separately from this settlement; report the exit to GOSI (HR-11 §11.3).');
  notes.push(`Final settlement due within ${deadline} days of the last working day, by ${payBy} (Saudi Labor Law Art. 88; HR-11 §11.5).`);
  return {
    person: { id: w.person_id, name: w.display_name, name_ar: w.display_name_ar, number: w.person_number, job: w.job_name, grade: w.grade_code, nationality: w.nationality, saudi: w.is_saudi },
    hire: w.original_hire_date, lastDay, years: round2(yearsBetween(w.original_hire_date, lastDay)), basis: w.eos_basis, basic: w.basic, monthly,
    kind, reason: art87 ? 'MARRIAGE' : reason ?? null, lines, total, payBy, deadlineDays: deadline, note: notes.join(' '),
    visa: w.is_saudi ? null : 'End the contract on Qiwa, then issue the final exit visa through Muqeem and cancel CCHI medical cover (HR-12 §12.7).',
  };
}

export async function involuntaryCheck(ctx: Ctx, personId: number, grounds: 'PERFORMANCE' | 'MISCONDUCT' | 'REDUNDANCY', asOf: string) {
  const w = (await worker(ctx, personId, asOf))!;
  const docs = await read(ctx, 'documentRecords', `q=PersonId=${personId}`, 'Case file: documents', async () =>
    (await ctx.c.query(`SELECT type, document_number, issued_at FROM hcm.document_records WHERE person_id=$1 AND type IN ('WARNING','PIP')`, [personId])).rows);
  const ratings = await read(ctx, 'performanceDocuments', `q=PersonId=${personId}`, 'Case file: ratings', async () =>
    (await ctx.c.query(`SELECT review_period, COALESCE(calibrated_rating, manager_rating) AS rating FROM hcm.performance_documents WHERE person_id=$1 ORDER BY review_period DESC`, [personId])).rows);
  const leave = await read(ctx, 'absences', `q=PersonId=${personId};Status=APPROVED`, 'Case file: current leave', async () =>
    (await ctx.c.query(`SELECT type_code, start_date, end_date FROM hcm.absences WHERE person_id=$1 AND status IN ('APPROVED','COMPLETED') AND end_date >= $2::date - 300 AND type_code IN ('SICK','MATERNITY')`, [personId, asOf])).rows);
  const checks: { key: string; label: string; label_ar: string; ok: boolean; detail: string; rule: string }[] = [];
  const pip = docs.find((d: any) => d.type === 'PIP');
  const warnings = docs.filter((d: any) => d.type === 'WARNING');
  if (grounds === 'PERFORMANCE') {
    checks.push({ key: 'ratings', label: 'Documented low performance', label_ar: 'ضعف أداء موثق', ok: ratings.some((r: any) => r.rating <= 2), detail: ratings.map((r: any) => `${r.review_period}: ${r.rating ?? 'not rated'}`).join(' · '), rule: 'HR-09 §9.6' });
    checks.push({ key: 'pip', label: 'Completed improvement plan of at least 60 days', label_ar: 'خطة تحسين أداء مكتملة لا تقل عن 60 يوماً', ok: !!pip, detail: pip ? `${pip.document_number}` : 'No improvement plan on file in the HRMS.', rule: 'HR-09 §9.6; HR-12 §12.4' });
  }
  if (grounds === 'MISCONDUCT') checks.push({ key: 'investigation', label: 'Investigation and written warnings', label_ar: 'تحقيق وإنذارات كتابية', ok: warnings.length > 0, detail: warnings.length ? `${warnings.length} warning(s) on file` : 'No warning or investigation record.', rule: 'Saudi Labor Law Art. 80; HR-12 §12.4' });
  const sick = leave.filter((l: any) => l.type_code === 'SICK');
  const sickDays = sick.reduce((s: number, l: any) => s + daysBetween(l.start_date, l.end_date) + 1, 0);
  const maternity = leave.find((l: any) => l.type_code === 'MATERNITY');
  const onSick = sick.find((l: any) => l.end_date >= asOf);
  const protectedHit = maternity ? `MATERNITY leave ${maternity.start_date} to ${maternity.end_date}: no termination during maternity leave (Art. 155).`
    : onSick && sickDays <= 120 ? `SICK leave ${onSick.start_date} to ${onSick.end_date}, ${sickDays} days this year, within the Art. 117 entitlement: no termination during it.` : '';
  checks.push({ key: 'protected', label: 'No protected situation (maternity leave, sick leave within entitlement, recent complaint)', label_ar: 'لا توجد حالة محمية (إجازة وضع، إجازة مرضية ضمن الاستحقاق، شكوى حديثة)', ok: !protectedHit, detail: protectedHit || 'None found in HRMS absence records.', rule: 'Saudi Labor Law Arts. 117, 155; HR-12 §12.5' });
  const notice = employerNoticeDays(w.grade_rank);
  checks.push({ key: 'notice', label: `Employer notice: ${notice} days`, label_ar: `فترة إشعار صاحب العمل: ${notice} يوماً`, ok: true, detail: `Grade ${w.grade_code}. The employer gives ${notice} days' written notice or pays the wage for the period instead.`, rule: 'Saudi Labor Law Art. 75; HR-12 §12.1' });
  checks.push({ key: 'valid_reason', label: 'Valid reason documented', label_ar: 'سبب مشروع موثق', ok: true, detail: 'If the termination is found to be without a valid reason, the employee is owed compensation: 15 days\' wage per year of service for an indefinite contract (minimum two months\' wage), or the wage for the remaining term of a fixed-term contract.', rule: 'Saudi Labor Law Art. 77; HR-12 §12.4' });
  const missing = checks.filter((c) => !c.ok);
  return { person: { id: w.person_id, name: w.display_name, name_ar: w.display_name_ar, job: w.job_name, department: w.department_name }, grounds, checks, complete: missing.length === 0, missing };
}
