/**
 * Hisab — Payroll Run Analyst. The pre-run check.
 *
 * Builds the draft results for the open period from the HRMS's own element
 * entries (what payroll WOULD pay), then tests them against the other HRMS
 * records that should agree with them: salary records, work relationships,
 * approved absences, the 10% advance instalment limit (Art. 92), the 50%
 * deduction cap (Art. 93), GOSI contributions and the bank details the Mudad
 * wage file needs. Every finding names the record behind it. Hisab recommends;
 * a payroll specialist releases.
 */
import { read, type Ctx } from '../hcm/connector.js';
import { daysBetween, gosi, round2, money, DEDUCTION_CAP, INSTALMENT_CAP } from '../domain/rules.js';

export type Finding = {
  id: string; code: string; severity: 'BLOCKER' | 'HIGH' | 'MEDIUM' | 'INFO';
  person_id: number; person_number: string; name: string; name_ar: string; department: string;
  title: string; title_ar: string; detail: string; fix: string; amount: number; rule: string; resolved?: boolean;
};

export async function precheck(ctx: Ctx, periodName?: string) {
  const period = await read(ctx, 'payrollPeriods', 'q=Status=OPEN', 'Open payroll period', async () =>
    (await ctx.c.query(periodName ? `SELECT * FROM hcm.payroll_periods WHERE period_name=$1` : `SELECT * FROM hcm.payroll_periods WHERE status IN ('OPEN','RELEASED') ORDER BY start_date DESC LIMIT 1`, periodName ? [periodName] : [])).rows[0]);
  const prev = (await ctx.c.query(`SELECT * FROM hcm.payroll_periods WHERE end_date < $1 ORDER BY end_date DESC LIMIT 1`, [period.start_date])).rows[0];
  const entries = await read(ctx, 'elementEntries', `q=EffectiveDate=${period.start_date}`, 'Element entries for the open period', async () =>
    (await ctx.c.query(`SELECT e.*, t.classification, t.name AS element_name FROM hcm.element_entries e JOIN hcm.element_types t ON t.code=e.element_code
                         WHERE e.effective_start <= $2 AND e.effective_end >= $1`, [period.start_date, period.end_date])).rows);
  const people = await read(ctx, 'workers', 'expand=workRelationships,salaries', 'Workers on the payroll', async () =>
    (await ctx.c.query(`SELECT p.id, p.person_number, p.display_name, p.display_name_ar, p.is_saudi, p.iban_masked, p.bank_name,
                               wr.start_date, wr.end_date, wr.worker_type, d.name AS department,
                               s.basic, s.housing, s.transport, s.other_allowance, s.date_from AS salary_from, s.action_code AS salary_action
                          FROM hcm.persons p JOIN hcm.work_relationships wr ON wr.person_id=p.id
                          JOIN LATERAL (SELECT * FROM hcm.assignments a WHERE a.person_id=p.id ORDER BY effective_start DESC LIMIT 1) a ON true
                          JOIN hcm.departments d ON d.id=a.department_id
                          LEFT JOIN LATERAL (SELECT * FROM hcm.salaries s WHERE s.person_id=p.id AND s.date_from <= $1 ORDER BY date_from DESC LIMIT 1) s ON true
                         WHERE wr.worker_type='E' AND wr.start_date <= $1`, [period.end_date])).rows);
  const unpaid = await read(ctx, 'absences', `q=AbsenceType=UNPAID;StartDate>=${period.start_date}`, 'Approved unpaid leave this period', async () =>
    (await ctx.c.query(`SELECT * FROM hcm.absences WHERE type_code='UNPAID' AND status IN ('APPROVED','COMPLETED') AND start_date <= $2 AND end_date >= $1`, [period.start_date, period.end_date])).rows);
  const last = prev ? (await ctx.c.query(`SELECT person_id, gross FROM hcm.payroll_results WHERE period_id=$1`, [prev.id])).rows : [];
  const lastGross = new Map(last.map((r: any) => [r.person_id, r.gross]));

  const findings: Finding[] = [];
  let fid = 1;
  const add = (p: any, f: Omit<Finding, 'id' | 'person_id' | 'person_number' | 'name' | 'name_ar' | 'department'>) =>
    findings.push({ id: `F${String(fid++).padStart(2, '0')}`, person_id: p.id, person_number: p.person_number, name: p.display_name, name_ar: p.display_name_ar, department: p.department, ...f });

  let gross = 0, ded = 0, er = 0, headcount = 0, sifLines = 0;
  const byPerson = new Map<number, any[]>();
  for (const e of entries) { if (!byPerson.has(e.person_id)) byPerson.set(e.person_id, []); byPerson.get(e.person_id)!.push(e); }

  for (const p of people) {
    const es = byPerson.get(p.id) ?? [];
    const terminatedBefore = p.end_date && p.end_date < period.start_date;
    if (terminatedBefore && !es.length) continue;
    if (!es.length) continue;
    const days = terminatedBefore ? 30 : Math.min(30, daysBetween(p.start_date > period.start_date ? p.start_date : period.start_date, p.end_date && p.end_date < period.end_date ? p.end_date : period.end_date) + 1);
    const g = es.filter((e) => e.classification === 'EARNING').reduce((s, e) => s + (e.element_code === 'OVERTIME' ? e.amount : e.amount * days / 30), 0);
    const d = es.filter((e) => e.classification === 'DEDUCTION').reduce((s, e) => s + e.amount, 0);
    const c2 = es.filter((e) => e.classification === 'EMPLOYER_CONTRIBUTION').reduce((s, e) => s + e.amount, 0);
    gross += g; ded += d; er += c2; headcount++; sifLines++;
    const has = (code: string) => es.some((e) => e.element_code === code);
    const basicEntry = es.find((e) => e.element_code === 'BASIC');

    if (terminatedBefore) {
      add(p, { code: 'LEAVER_STILL_PAID', severity: 'BLOCKER', title: 'Leaver still on the payroll', title_ar: 'موظف مغادر ما زال على كشف الرواتب',
        detail: `Work relationship ended ${p.end_date}; ${es.length} recurring entries have no end date, so the draft pays a full month.`,
        fix: 'End-date the recurring entries at the last working day; pay the final settlement through WF-19.', amount: round2(g), rule: 'HR-10 §10.2' });
      continue;
    }
    if (basicEntry && p.basic && Math.abs(basicEntry.amount - p.basic) > 1) {
      const months = Math.max(0, Math.round(daysBetween(p.salary_from, period.start_date) / 30.4));
      const diffMonthly = (p.basic + p.housing + p.transport + p.other_allowance) - es.filter((e) => ['BASIC', 'HOUSING', 'TRANSPORT', 'OTHER_ALW'].includes(e.element_code)).reduce((s, e) => s + e.amount, 0);
      add(p, { code: 'SALARY_ENTRY_MISMATCH', severity: 'BLOCKER', title: 'Salary change not in element entries', title_ar: 'تغيير الراتب غير مسجل في عناصر الرواتب',
        detail: `Salary record from ${p.salary_from} (${p.salary_action}) has basic ${money(p.basic)}; the BASIC entry still pays ${money(basicEntry.amount)}. ${months} closed period${months === 1 ? '' : 's'} underpaid.`,
        fix: `Update recurring entries from ${p.salary_from}; add a retro payment of ${money(diffMonthly * months)}.`, amount: round2(diffMonthly * (months + 1)), rule: 'HR-06 §6.1' });
    }
    if (!has('HOUSING') && p.housing) add(p, { code: 'MISSING_ELEMENT', severity: 'HIGH', title: 'Housing allowance missing', title_ar: 'بدل السكن غير مسجل',
      detail: `Joined ${p.start_date}. Salary record includes housing of ${money(p.housing)}; no HOUSING entry exists.`, fix: 'Add the HOUSING recurring entry from the hire date.', amount: round2(p.housing * days / 30), rule: 'HR-06 §6.1' });
    const missEr = !has('GOSI_ER'), missEe = p.is_saudi && !has('GOSI_EE');
    if (missEr || missEe) {
      const gp = gosi((p.basic ?? 0) + (p.housing ?? 0), p.start_date, p.is_saudi, period.end_date);
      const pct = (r: number) => `${round2(r * 100)}%`;
      const missing = [missEe ? `GOSI_EE ${money(gp.employee)}` : '', missEr ? `GOSI_ER ${money(gp.employer)}` : ''].filter(Boolean);
      add(p, { code: 'GOSI_MISSING', severity: 'HIGH', title: p.is_saudi ? 'GOSI contributions missing for a Saudi national' : 'GOSI occupational hazards contribution missing', title_ar: p.is_saudi ? 'اشتراكات التأمينات الاجتماعية غير مسجلة لموظف سعودي' : 'اشتراك الأخطار المهنية في التأمينات الاجتماعية غير مسجل',
        detail: `${p.is_saudi ? 'Saudi national' : 'Non-Saudi employee'} joined ${p.start_date}; no ${[missEe ? 'GOSI_EE' : '', missEr ? 'GOSI_ER' : ''].filter(Boolean).join(' or ')} entry. Contribution wage ${money(gp.contributionSalary)} (basic + housing, capped at SAR 45,000); rates: employee ${pct(gp.eeRate)}, employer ${pct(gp.erRate)}.`,
        fix: `Add ${missing.join(' and ')} and register the employee with GOSI.${p.is_saudi ? ' The hire does not count toward Saudization (Nitaqat) until registered with GOSI.' : ''}`,
        amount: round2((missEe ? gp.employee : 0) + (missEr ? gp.employer : 0)), rule: 'HR-10 §10.4' });
    }
    const up = unpaid.filter((a: any) => a.person_id === p.id);
    if (up.length && !has('UNPAID_LEAVE')) {
      const daysU = up.reduce((s: number, a: any) => s + Number(a.days), 0);
      const amt = round2(((p.basic ?? 0) + (p.housing ?? 0) + (p.transport ?? 0) + (p.other_allowance ?? 0)) / 30 * daysU);
      add(p, { code: 'UNPAID_LEAVE_NOT_DEDUCTED', severity: 'MEDIUM', title: 'Unpaid leave not deducted', title_ar: 'إجازة بدون راتب لم تُخصم',
        detail: `${daysU} days of approved unpaid leave (${up.map((a: any) => a.absence_number).join(', ')}); no deduction entry.`, fix: `Add UNPAID_LEAVE deduction of ${money(amt)}.`, amount: amt, rule: 'HR-04 §4.9' });
    }
    const advRec = es.find((e) => e.element_code === 'ADVANCE_REC');
    const wage = (p.basic ?? 0) + (p.housing ?? 0) + (p.transport ?? 0) + (p.other_allowance ?? 0) || g;
    if (advRec && wage > 0 && advRec.amount > wage * INSTALMENT_CAP) add(p, { code: 'ADVANCE_INSTALMENT', severity: 'HIGH', title: 'Advance instalment above 10% of wage', title_ar: 'قسط السلفة يتجاوز 10% من الأجر',
      detail: `ADVANCE_REC deducts ${money(advRec.amount)}, ${Math.round(advRec.amount / wage * 100)}% of the monthly wage of ${money(wage)}. An instalment may not exceed 10% of the wage.`,
      fix: `Reduce the instalment to at most ${money(Math.floor(wage * INSTALMENT_CAP))} a month and extend the recovery term.`, amount: round2(advRec.amount - wage * INSTALMENT_CAP), rule: 'Saudi Labor Law Art. 92; HR-07 §7.3' });
    if (g > 0 && d / g > DEDUCTION_CAP) add(p, { code: 'DEDUCTION_CAP', severity: 'BLOCKER', title: 'Deductions above 50% of wage', title_ar: 'الخصومات تتجاوز 50% من الأجر',
      detail: `Deductions ${money(d)} are ${Math.round(d / g * 100)}% of gross ${money(g)}. All deductions together may not exceed half of the wage.`, fix: `Reschedule recovery to at most ${money(Math.floor(g * DEDUCTION_CAP - (d - (advRec?.amount ?? 0))))} a month and extend the term.`, amount: round2(d - g * DEDUCTION_CAP), rule: 'Saudi Labor Law Art. 93; HR-07 §7.3' });
    if (/PENDING/.test(p.iban_masked)) add(p, { code: 'MUDAD_IBAN', severity: 'HIGH', title: 'IBAN not verified for the Mudad wage file', title_ar: 'رقم الآيبان غير موثق لملف الأجور في مدد',
      detail: `Bank changed to ${p.bank_name}; the IBAN is pending verification. Mudad will reject the wage file line: IBAN not verified.`, fix: 'Verify the IBAN with the employee\'s bank letter before the wage file is generated.', amount: round2(g - d), rule: 'HR-10 §10.1' });
    const lg = lastGross.get(p.id);
    const ot = es.find((e) => e.element_code === 'OVERTIME');
    if (lg && Math.abs(g - lg) / lg > 0.15 && !findings.some((f) => f.person_id === p.id)) add(p, { code: 'VARIANCE', severity: ot?.reference ? 'INFO' : 'MEDIUM', title: `Gross pay ${g > lg ? 'up' : 'down'} ${Math.round(Math.abs(g - lg) / lg * 100)}% on last month`, title_ar: 'تغير كبير في إجمالي الأجر مقارنة بالشهر السابق',
      detail: `${money(lg)} last month, ${money(g)} in the draft.${ot?.reference ? ` Explained: ${ot.reference}.` : ''}`, fix: ot?.reference ? 'None: explained by approved overtime.' : 'Confirm the change with the line manager.', amount: round2(g - lg), rule: 'HR-10 §10.2' });
    if (p.start_date >= period.start_date) add(p, { code: 'JOINER', severity: 'INFO', title: 'New joiner, prorated', title_ar: 'موظف جديد بأجر نسبي', detail: `Joined ${p.start_date}; ${days} days paid.`, fix: 'None.', amount: round2(g), rule: 'HR-10 §10.1' });
  }
  const order = { BLOCKER: 0, HIGH: 1, MEDIUM: 2, INFO: 3 } as const;
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  const lastTotals = prev ? (await ctx.c.query(`SELECT COUNT(*)::int AS n, SUM(gross) AS gross, SUM(net) AS net FROM hcm.payroll_results WHERE period_id=$1`, [prev.id])).rows[0] : null;
  return {
    period, prev,
    totals: { headcount, gross: round2(gross), deductions: round2(ded), employer: round2(er), net: round2(gross - ded), sifLines },
    last: lastTotals,
    findings,
    blocked: findings.some((f) => f.severity === 'BLOCKER' || f.severity === 'HIGH'),
  };
}
