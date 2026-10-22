/**
 * Step handlers: what each agent and each connector step actually does.
 * Keyed `WF-xx:stepKey`. Human steps are resolved to a person by WHO.
 */
import type { PoolClient } from 'pg';
import type { HCtx, Req, StepOutcome } from './core.js';
import type { StepDef } from '../domain/workflows.js';
import { atom, external, read, write } from '../hcm/connector.js';
import { worker, team, balances } from '../hcm/queries.js';
import { addDays, addMonths, daysBetween, iso, monthEnd, monthStart, money, round2, noticeDaysForGrade, settlementDeadlineDays, advanceMax, advanceMaxTerm, INSTALMENT_CAP, DEDUCTION_CAP, gosi, client, pol } from '../domain/rules.js';
import { positionCheck, evidence, calibration, promotionCase, assessmentSpread } from '../agents/talent.js';
import { precheck } from '../agents/hisab.js';
import { settlement, involuntaryCheck } from '../agents/exit.js';
import { now } from '../clock.js';
import { PAYROLL_HANDLERS, PAYROLL_WHO } from './payroll-handlers.js';

type H = (h: HCtx) => Promise<StepOutcome>;
type Who = (c: PoolClient, req: Req, def: StepDef) => Promise<{ role: string; personId: number } | null>;

// ------------------------------------------------------------------ people map

// Cached per client: each client's personas and HRBPs are different people.
const PEOPLE = new Map<string, { persona: Record<string, number>; hrbp: Record<string, number> }>();
export const resetPeople = () => { PEOPLE.clear(); };
export async function people(c: PoolClient | { query: PoolClient['query'] }) {
  const k = client().key;
  if (!PEOPLE.has(k)) PEOPLE.set(k, (await c.query(`SELECT value FROM layer.meta WHERE key='people'`)).rows[0].value);
  return PEOPLE.get(k)!;
}
const asOf = () => iso(now());
/** Government and bank systems the connector logs calls to (Saudi: Qiwa, GOSI, Muqeem, Mudad, Jadarat). */
const ext = (h: HCtx, system: string, method: string, resource: string, summary: string) => external(h.conn, system as any, method, resource, summary);
const sar = (n: number) => Math.round(n).toLocaleString('en-US');
/** Saudization line for the position check (Nitaqat band from the client record). */
const saudization = (chk: any) => {
  const z = chk.saudization, n = client().nitaqat;
  return z ? `Saudization ${z.current}% today (${z.ifSaudi}% with a Saudi hire); Nitaqat ${n.band}, ${Math.round(n.requiredPct * 100)}% required. ` : `Nitaqat ${n.band}, ${Math.round(n.requiredPct * 100)}% Saudization required. `;
};
/** Monthly allowances as the seed builds them: housing and transport from the client's handbook, other 5% of basic, rounded to 50. */
const allowances = (basic: number) => {
  const r50 = (n: number) => Math.round(n / 50) * 50;
  return { housing: r50(basic * pol().housingPct / 100), transport: r50(basic * pol().transportPct / 100), other: r50(basic * 0.05) };
};
/** The real date, not the replay clock: used to decide whether a replayed leave has already been taken. */
const realToday = () => iso(new Date());
async function divisionOf(c: PoolClient, personId: number) {
  return (await c.query(`SELECT d.division FROM hcm.assignments a JOIN hcm.departments d ON d.id=a.department_id WHERE a.person_id=$1 ORDER BY a.effective_start DESC LIMIT 1`, [personId])).rows[0]?.division as string;
}
async function managerOf(c: PoolClient, personId: number) {
  return (await c.query(`SELECT manager_person_id FROM hcm.assignments WHERE person_id=$1 ORDER BY effective_start DESC LIMIT 1`, [personId])).rows[0]?.manager_person_id as number | null;
}

export const WHO: Record<string, Who> = {
  ...PAYROLL_WHO,
  LINE_MANAGER: async (c, req) => { const id = req.payload.hiring_manager_id ?? (await managerOf(c, req.subject_person_id)); return id ? { role: 'LINE_MANAGER', personId: id } : null; },
  HRBP: async (c, req) => { const p = await people(c); const div = req.payload.division ?? (await divisionOf(c, req.subject_person_id)); return { role: 'HRBP', personId: p.hrbp[div] ?? p.persona.hrbp }; },
  TA: async (c, req) => ({ role: 'TA', personId: req.payload.recruiter_id ?? (await people(c)).persona.ta }),
  PAYROLL: async (c) => ({ role: 'PAYROLL', personId: (await people(c)).persona.payroll }),
  CHRO: async (c) => ({ role: 'CHRO', personId: (await people(c)).persona.chro }),
  'WF-01:chro': async (c, req) => (req.payload.needs_chro ? { role: 'CHRO', personId: (await people(c)).persona.chro } : null),
  'WF-05:approve': async (c, req) => { const p = await people(c); return req.payload.approver === 'CHRO' ? { role: 'CHRO', personId: p.persona.chro } : WHO.HRBP(c, req, null as any); },
  'WF-12:approve': async (c, req) => { const p = await people(c); return req.payload.approver === 'CHRO' ? { role: 'CHRO', personId: p.persona.chro } : WHO.HRBP(c, req, null as any); },
  'WF-16:approve': async (c, req) => { const p = await people(c); return req.payload.exception ? { role: 'CHRO', personId: p.persona.chro } : { role: 'PAYROLL', personId: p.persona.payroll }; },
  'WF-19:approve': async (c, req) => { const p = await people(c); return (req.result.settlement?.total ?? 0) > 200_000 ? { role: 'CHRO', personId: p.persona.chro } : { role: 'PAYROLL', personId: p.persona.payroll }; },
  'WF-06:blockers': async (c, req) => (req.payload.blocked ? { role: 'PAYROLL', personId: (await people(c)).persona.payroll } : null),
  'WF-10:rate': async () => null, // ratings are already in when the calibration case opens
  'WF-07:confirm': async (c, req) => WHO.LINE_MANAGER(c, req, null as any),
  'WF-21:assign': async () => null,
};

// ------------------------------------------------------------------ letters

const LETTER: Record<string, [string, string]> = {
  SALARY_CERTIFICATE: ['Salary certificate', 'شهادة راتب'], EMPLOYMENT_CERTIFICATE: ['Employment certificate', 'شهادة عمل'],
  SALARY_TRANSFER: ['Salary transfer letter', 'خطاب تحويل راتب'], NOC_TRAVEL: ['No-objection letter for travel (visa application)', 'خطاب عدم ممانعة للسفر (طلب تأشيرة)'],
  NOC_DRIVING: ['Introduction letter (to whom it may concern)', 'خطاب تعريف (إلى من يهمه الأمر)'], EXPERIENCE: ['Experience letter', 'شهادة خبرة'],
};
export const letterName = (t: string, ar = false) => (LETTER[t] ?? [t, t])[ar ? 1 : 0];

function letterBody(type: string, w: any, addressee: string, lang: string, ref: string, date: string) {
  const total = w.basic + w.housing + w.transport + w.other_allowance;
  const co = client();
  const female = w.gender === 'F';
  if (lang === 'ar') {
    const to = addressee || 'إلى من يهمه الأمر';
    const head = `التاريخ: ${date}\nالمرجع: ${ref}\n\n${to}\n\n`;
    const id = w.is_saudi ? `${female ? 'سعودية' : 'سعودي'} الجنسية، بموجب السجل المدني رقم ${w.national_id_masked}` : `بموجب هوية مقيم (إقامة) رقم ${w.national_id_masked}`;
    const who = `تشهد ${co.name_ar} بأن ${w.display_name_ar}، ${id}، رقم الموظف ${w.person_number}، يعمل لديها بوظيفة ${w.job_name_ar} في ${w.department_name_ar} منذ ${w.original_hire_date}`;
    const sign = `\n\nالموارد البشرية — ${co.name_ar} (وثيقة تجريبية)`;
    if (type === 'SALARY_CERTIFICATE') return `${head}${who}، ويتقاضى راتباً شهرياً إجمالياً قدره ${sar(total)} ريال، منها راتب أساسي ${sar(w.basic)} ريال.\n\nصدرت هذه الشهادة بناءً على طلبه دون أدنى مسؤولية على الشركة.${sign}`;
    if (type === 'SALARY_TRANSFER') return `${head}${who}. وتتعهد الشركة بتحويل راتبه الشهري البالغ ${sar(total)} ريال ومكافأة نهاية الخدمة إلى حسابه لدى ${addressee} عبر نظام مدد ما لم يصلها إشعار خطي من البنك بإخلاء الطرف.${sign}`;
    if (type === 'EMPLOYMENT_CERTIFICATE' || type === 'EXPERIENCE') return `${head}${who}${type === 'EXPERIENCE' && w.end_date ? ` حتى ${w.end_date}` : ' ولا يزال على رأس العمل'}. الدرجة ${w.grade_code}.${sign}`;
    if (type === 'NOC_TRAVEL') return `${head}${who}، ولا مانع لدى الشركة من سفره خلال إجازته المعتمدة، ووظيفته محفوظة لحين عودته. صدر هذا الخطاب لتقديمه مع طلب التأشيرة.${sign}`;
    if (type === 'NOC_DRIVING') return `${head}${who}، ولا يزال على رأس العمل. صدر هذا الخطاب بناءً على طلبه لتقديمه إلى من يهمه الأمر دون أدنى مسؤولية على الشركة.${sign}`;
    return `${head}${who}.${sign}`;
  }
  const to = addressee || 'To whom it may concern';
  const head = `Date: ${date}\nRef: ${ref}\n\n${to}\n\n`;
  const id = w.is_saudi ? `a Saudi national holding national ID number ${w.national_id_masked}` : `holder of iqama number ${w.national_id_masked}`;
  const who = `This is to certify that ${w.display_name}, ${id}, employee number ${w.person_number}, has been employed by ${co.name} as ${w.job_name} in ${w.department_name} since ${w.original_hire_date}`;
  const sign = `\n\nHuman Resources, ${co.name} (DEMO document)`;
  const his = female ? 'her' : 'his', him = female ? 'her' : 'him';
  if (type === 'SALARY_CERTIFICATE') return `${head}${who}. ${female ? 'Her' : 'His'} gross monthly salary is ${money(total)}, of which basic salary is ${money(w.basic)}.\n\nThis certificate is issued at the employee's request without liability to the company.${sign}`;
  if (type === 'SALARY_TRANSFER') return `${head}${who}. ${co.name} undertakes to transfer ${his} monthly salary of ${money(total)} through Mudad, and ${his} end-of-service award, to ${his} account with ${addressee} until we receive written release from the bank.${sign}`;
  if (type === 'EMPLOYMENT_CERTIFICATE' || type === 'EXPERIENCE') return `${head}${who}${type === 'EXPERIENCE' && w.end_date ? ` until ${w.end_date}` : ' and remains in employment'}. Grade ${w.grade_code}.${sign}`;
  if (type === 'NOC_TRAVEL') return `${head}${who}. ${co.name} has no objection to ${him} travelling during ${his} approved leave, and ${his} position is held for ${his} return. This letter is issued in support of ${his} visa application.${sign}`;
  if (type === 'NOC_DRIVING') return `${head}${who} and remains in employment. This letter is issued at the employee's request, to whom it may concern, without liability to the company.${sign}`;
  return `${head}${who}.${sign}`;
}

// ------------------------------------------------------------------ handlers

const intake: H = async (h) => {
  await h.trail({ act: 'PREPARE', summary: `Took the request ${h.req.channel === 'FORM' ? 'from the request form' : h.req.channel === 'EVENT' ? 'from an HRMS event' : 'in chat'} and confirmed the details with the requester.`, summary_ar: 'استلم الطلب وأكده مع مقدم الطلب.' });
  return { status: 'DONE', decision: 'Request captured' };
};

export const HANDLERS: Record<string, H> = {
  ...PAYROLL_HANDLERS,
  // ---------------------------------------------------------- WF-14 letters
  'WF-14:intake': intake,
  'WF-14:validate': async (h) => {
    const w = await worker(h.conn, h.req.subject_person_id, asOf());
    const type = h.req.payload.letter_type as string;
    if (!w || w.worker_type !== 'E' || (w.end_date && w.end_date < asOf() && type !== 'EXPERIENCE')) {
      await h.trail({ act: 'REFUSE', summary: 'No active employment on the HRMS record, so the letter cannot certify current employment.', citation: 'HR-08 §8.1' });
      return { status: 'REFUSED', decision: 'Not in active employment', stop: 'REJECTED' };
    }
    const ref = `${client().code}-DOC-${String(now().getUTCFullYear()).slice(2)}-${String((await h.c.query(`SELECT nextval('hcm.doc_seq') n`)).rows[0].n).padStart(5, '0')}`;
    const body = letterBody(type, w, h.req.payload.addressee ?? '', h.req.payload.language ?? 'en', ref, asOf());
    await h.patch({ document_number: ref, body });
    if (type === 'SALARY_TRANSFER') {
      await h.trail({ act: 'CHECK', summary: `Salary transfer letter to ${h.req.payload.addressee}: commits salary and end-of-service to one bank, so it goes to HR Operations.`, summary_ar: 'خطاب تحويل الراتب يلزم بتحويل الراتب ومستحقات نهاية الخدمة، لذلك يُحال إلى عمليات الموارد البشرية.', citation: 'HR-08 §8.2' });
      const other = (await h.c.query(`SELECT document_number, addressee FROM hcm.document_records WHERE person_id=$1 AND type='SALARY_TRANSFER' AND status='ISSUED' ORDER BY issued_at DESC LIMIT 1`, [h.req.subject_person_id])).rows[0];
      return { status: 'DONE', decision: 'Needs HR Operations approval', outputs: { preview: body, existing: other ?? null },
        recommend: other && other.addressee !== h.req.payload.addressee
          ? { verdict: 'REVIEW', summary: `An earlier salary transfer letter (${other.document_number}) names ${other.addressee}. Policy allows one bank at a time: confirm that bank has released it.`, summary_ar: 'يوجد خطاب تحويل سابق لبنك آخر؛ يجب التأكد من إخلاء الطرف.' }
          : { verdict: 'APPROVE', summary: `Salary and grade verified against the HRMS (${money(w.basic + w.housing + w.transport + w.other_allowance)} a month). No other salary transfer letter is active.`, summary_ar: 'تم التحقق من الراتب والدرجة، ولا يوجد خطاب تحويل آخر نشط.' } };
    }
    const reentry = type === 'NOC_TRAVEL' && !w.is_saudi;
    await h.trail({ act: 'CHECK', summary: `${letterName(type)}: standard letter; employment and salary verified against the HRMS.${reentry ? ' The employee is an expatriate: travel also needs an exit/re-entry visa, which HR Operations issues through Muqeem.' : ''}`, summary_ar: `${letterName(type, true)}: خطاب قياسي؛ تم التحقق من التوظيف والراتب.${reentry ? ' الموظف مقيم: يلزم أيضاً إصدار تأشيرة خروج وعودة عبر منصة مقيم من قبل عمليات الموارد البشرية.' : ''}`, citation: 'HR-08 §8.1' });
    return { status: 'DONE', decision: 'Standard letter: no approval needed', outputs: { preview: body }, skip: ['approve'] };
  },
  'WF-14:issue': async (h) => {
    const p = h.req.payload;
    await write(h.conn, 'POST', 'documentRecords/action/generateDraftLetter', `Generate ${letterName(p.letter_type)} for ${h.req.subject_person_id}`, async () => null, 200);
    await write(h.conn, 'POST', 'documentRecords', `Record ${p.document_number}`, async () =>
      h.c.query(`INSERT INTO hcm.document_records (document_number, person_id, type, addressee, purpose, language, status, issued_at, body, issued_by) VALUES ($1,$2,$3,$4,$5,$6,'ISSUED',$7,$8,'wathiqa')`,
        [p.document_number, h.req.subject_person_id, p.letter_type, p.addressee ?? null, p.purpose ?? null, p.language ?? 'en', now(), p.body]));
    await h.trail({ act: 'WRITE', summary: `Issued ${p.document_number} and recorded it in the HRMS document records.`, summary_ar: `أصدر ${p.document_number} وسجله في النظام.`, autonomy: 'A3', actor_type: 'SYSTEM', actor_name: 'Connector' });
    const expat = p.letter_type === 'NOC_TRAVEL' && !(await h.c.query(`SELECT is_saudi FROM hcm.persons WHERE id=$1`, [h.req.subject_person_id])).rows[0]?.is_saudi;
    await h.notify(h.req.subject_person_id, `${letterName(p.letter_type)} ready`, `${letterName(p.letter_type, true)} جاهز`, `${p.document_number} is in Pay and documents.${expat ? ' For travel you also need an exit/re-entry visa: HR Operations issues it through Muqeem.' : ''}`);
    await h.setResult({ document_number: p.document_number });
    return { status: 'DONE', decision: `Issued ${p.document_number}` };
  },

  // ---------------------------------------------------------- WF-15 leave
  'WF-15:intake': intake,
  'WF-15:validate': async (h) => {
    const p = h.req.payload;
    const w = (await worker(h.conn, h.req.subject_person_id, asOf()))!;
    const yr = Number(p.start.slice(0, 4));
    const bal = await balances(h.conn, h.req.subject_person_id, yr);
    const annual = bal.find((b: any) => b.type_code === 'ANNUAL');
    const issues: string[] = [], notes: string[] = [];
    let citation = 'HR-04 §4.1';
    if (p.type_code === 'ANNUAL') {
      if (!annual || annual.balance < p.days) issues.push(`Balance is ${annual?.balance ?? 0} days; ${p.days} requested.`);
      const lead = daysBetween(asOf(), p.start);
      if (lead < 14 && !p.emergency) notes.push(`Requested ${lead} days ahead; policy asks for 10 working days.`);
    }
    if (p.type_code === 'SICK') { citation = 'HR-04 §4.5 (Art. 117)'; if (w.probation_status === 'IN_PROBATION') notes.push('In probation: sick-leave days do not count toward the probation period (Art. 53).'); notes.push('Medical certificate (Seha) required within 3 working days.'); }
    if (p.type_code === 'UNPAID') { citation = 'HR-04 §4.9'; notes.push('Unpaid days will be deducted in payroll.'); }
    const mates = w.manager_person_id ? await team(h.conn, w.manager_person_id, asOf()) : [];
    const away = (await h.c.query(`SELECT p.display_name, a.start_date, a.end_date FROM hcm.absences a JOIN hcm.persons p ON p.id=a.person_id
                                    WHERE a.person_id = ANY($1) AND a.person_id <> $2 AND a.status IN ('APPROVED','SUBMITTED') AND a.start_date <= $4 AND a.end_date >= $3`,
      [mates.map((m) => m.person_id), h.req.subject_person_id, p.start, p.end])).rows;
    if (away.length >= 2) issues.push(`${away.length} of ${mates.length} team members already away: ${away.map((a: any) => a.display_name).join(', ')}.`);
    else if (away.length === 1) notes.push(`${away[0].display_name} is also away ${away[0].start_date} to ${away[0].end_date}.`);
    const ok = issues.length === 0;
    await h.trail({ act: 'CHECK', summary: `${p.days} days ${p.type_code.toLowerCase()} leave ${p.start} to ${p.end}: ${ok ? 'within policy' : 'needs attention'}. ${[...issues, ...notes].join(' ')}`.trim(), summary_ar: `${p.days} أيام إجازة من ${p.start} إلى ${p.end}: ${ok ? 'ضمن السياسة' : 'تحتاج إلى مراجعة'}.`, citation });
    return { status: 'DONE', decision: ok ? 'Within policy' : 'Needs attention', outputs: { balance: annual?.balance ?? null, issues, notes, away },
      recommend: ok ? { verdict: 'APPROVE', summary: `Balance ${annual?.balance ?? '-'} days; ${notes.length ? notes.join(' ') : 'team cover is fine.'}` } : { verdict: 'DECLINE', summary: issues.join(' ') + ' Suggest alternative dates.' } };
  },
  'WF-15:post': async (h) => {
    const p = h.req.payload;
    const num = `DEMO-ABS-${String((await h.c.query(`SELECT nextval('hcm.misc_seq') n`)).rows[0].n).padStart(5, '0')}`;
    const mgr = await managerOf(h.c, h.req.subject_person_id);
    await write(h.conn, 'POST', 'absences', `Record ${num}: ${p.type_code} ${p.start}..${p.end}`, async () => {
      const past = p.end < realToday();
      await h.c.query(`INSERT INTO hcm.absences (absence_number, person_id, type_code, start_date, end_date, days, status, approver_person_id, submitted_at, comments, source) VALUES ($1,$2,$3,$4,$5,$6,$10,$7,$8,$9,'RAFEEQ')`,
        [num, h.req.subject_person_id, p.type_code, p.start, p.end, p.days, mgr, h.req.created_at, p.reason ?? null, past ? 'COMPLETED' : 'APPROVED']);
      if (['ANNUAL', 'SICK'].includes(p.type_code)) await h.c.query(`UPDATE hcm.absence_balances SET ${past ? 'taken = taken' : 'booked = booked'} + $3 WHERE person_id=$1 AND year=$2 AND type_code=$4`, [h.req.subject_person_id, Number(p.start.slice(0, 4)), p.days, p.type_code]);
    });
    await h.trail({ act: 'WRITE', summary: `Recorded ${num} in the HRMS and updated the balance.`, summary_ar: `سجل ${num} في النظام وحدّث الرصيد.`, actor_type: 'SYSTEM', actor_name: 'Connector', autonomy: null });
    await h.notify(h.req.subject_person_id, 'Leave approved', 'تمت الموافقة على الإجازة', `${p.start} to ${p.end} (${num}).`);
    await h.setResult({ absence_number: num });
    return { status: 'DONE', decision: `Recorded ${num}` };
  },

  // ---------------------------------------------------------- WF-16 salary advance
  'WF-16:intake': intake,
  'WF-16:eligibility': async (h) => {
    const p = h.req.payload;
    const w = (await worker(h.conn, h.req.subject_person_id, asOf()))!;
    const outstanding = await read(h.conn, 'elementEntries', `q=PersonId=${w.person_id};ElementName=ADVANCE_REC`, 'Outstanding advances', async () =>
      (await h.c.query(`SELECT * FROM hcm.advances WHERE person_id=$1 AND status='ACTIVE'`, [w.person_id])).rows);
    const gross = w.basic + w.housing + w.transport + w.other_allowance;
    const max = advanceMax(w.basic, gross);
    const term = advanceMaxTerm();
    const minService = pol().advanceMinServiceMonths;
    const serviceMonths = Math.floor(daysBetween(w.original_hire_date, asOf()) / 30.44);
    const basisLabel = pol().advanceBasis === 'basic' ? 'basic salary' : 'gross salary';
    const mult = pol().advanceMultiple;
    const limitLabel = `${mult === 0.5 ? "half a month's" : mult === 1 ? "one month's" : mult === 1.5 ? "one and a half months'" : `${mult} months'`} ${basisLabel}`;
    const problems: string[] = [];
    if (w.probation_status === 'IN_PROBATION' || serviceMonths < minService) problems.push(`${serviceMonths} months of service; the minimum is ${minService} months and probation must be complete (HR-07 §7.1)`);
    if (outstanding.length) problems.push(`advance ${outstanding[0].advance_number} still outstanding (${money(outstanding[0].outstanding)}); one advance at a time (HR-07 §7.1)`);
    if (p.amount > max) problems.push(`${money(Number(p.amount))} is above ${limitLabel}, ${money(max)} (HR-07 §7.2)`);
    if (p.months > term) problems.push(`${p.months} months is longer than the ${term}-month maximum term (HR-07 §7.2)`);
    const exception = problems.length > 0;
    await h.patch({ exception, max_amount: max, basic: w.basic });
    await h.trail({ act: exception ? 'RECOMMEND' : 'CHECK', summary: exception
      ? `Outside policy: ${problems.join('; ')}. Within policy the most is ${money(max)} over up to ${term} months. Routed as an exception to the CHRO.`
      : `Eligible: ${serviceMonths} months of service (minimum ${minService}), probation complete, no advance outstanding, ${money(Number(p.amount))} is within ${limitLabel} (${money(max)}).`, summary_ar: exception ? 'خارج السياسة؛ أُحيل كاستثناء إلى الرئيس التنفيذي للموارد البشرية.' : 'مؤهل ضمن السياسة.', citation: 'HR-07 §7.1–7.2' });
    return { status: 'DONE', decision: exception ? 'Exception: outside policy' : 'Eligible', outputs: { max, problems } };
  },
  'WF-16:recovery': async (h) => {
    const p = h.req.payload;
    const w = (await worker(h.conn, h.req.subject_person_id, asOf()))!;
    const gross = w.basic + w.housing + w.transport + w.other_allowance;
    const recurring = (await h.c.query(`SELECT COALESCE(SUM(e.amount),0) s FROM hcm.element_entries e JOIN hcm.element_types t ON t.code=e.element_code WHERE e.person_id=$1 AND t.classification='DEDUCTION' AND e.effective_end >= $2`, [w.person_id, asOf()])).rows[0].s;
    const amount = Number(p.amount);
    const term = advanceMaxTerm();
    const cap = round2(gross * INSTALMENT_CAP);
    const requested = Math.max(1, Math.min(Number(p.months), term));
    const asked = round2(amount / requested);
    // Art. 92: a single instalment may not exceed 10% of the monthly wage.
    const minTerm = Math.ceil(amount / cap);
    const over10 = asked > cap;
    let months = over10 ? Math.max(requested, minTerm) : requested;
    let monthly = round2(amount / months);
    // Art. 93: all deductions together may not exceed 50% of the wage.
    const capOk = (recurring + monthly) <= gross * DEDUCTION_CAP;
    while (!((recurring + monthly) <= gross * DEDUCTION_CAP) && months < 24) { months++; monthly = round2(amount / months); }
    const beyondTerm = months > term;
    const fitsAmount = Math.floor(Math.min(cap * term, Number(p.max_amount ?? Infinity)) / 100) * 100;
    const tenNote = !over10 ? ''
      : minTerm <= term
        ? ` ${requested} months would mean ${money(asked)} a month, above the 10% instalment limit of ${money(cap)} (Art. 92); the minimum compliant term is ${minTerm} months.`
        : ` ${requested} months would mean ${money(asked)} a month, above the 10% instalment limit of ${money(cap)} (Art. 92). Even over the ${term}-month maximum term the instalment stays above 10%: the most that fits is ${money(fitsAmount)} over ${term} months.`;
    await h.patch({ recovery_months: months, monthly });
    await h.trail({ act: 'CHECK', summary: `Recovery ${money(monthly)} a month over ${months} months from ${iso(monthStart(asOf(), 1)).slice(0, 7)}: ${Math.round(monthly / gross * 100)}% of wage against the 10% instalment limit; all deductions ${(Math.round((recurring + monthly) / gross * 100))}% of wage against the 50% limit${capOk ? '' : '; term lengthened to stay inside it'}.${tenNote}`, summary_ar: `الاسترداد ${sar(monthly)} ريال شهرياً على ${months} شهراً؛ القسط ضمن 10% من الأجر والخصومات ضمن حد 50%.`, citation: 'Saudi Labor Law Arts. 92–93; HR-07 §7.2–7.3' });
    return { status: 'DONE', decision: `SAR ${monthly} x ${months}`, outputs: { monthly, months, deductionShare: round2((recurring + monthly) / gross) },
      recommend: p.exception || beyondTerm
        ? { verdict: 'REVIEW', summary: `${p.exception ? `Exception requested. Within policy the most is ${money(p.max_amount)}. ` : ''}Recovery of ${money(monthly)} x ${months} keeps each instalment within 10% of wage and all deductions inside 50%.${tenNote}${beyondTerm ? ` That is longer than the ${term}-month maximum term (HR-07 §7.2); approve a lower amount (${money(fitsAmount)} or less) or treat it as an exception.` : ''}` }
        : { verdict: 'APPROVE', summary: `Within policy. Recovery ${money(monthly)} x ${months}; each instalment within 10% of wage and all deductions inside 50%.${tenNote}` } };
  },
  'WF-16:post': async (h) => {
    const p = h.req.payload;
    const amount = Number(p.approved_amount ?? p.amount);
    const months = Number(p.approved_months ?? p.recovery_months);
    const monthly = round2(amount / months);
    const num = `DEMO-ADV-${now().getUTCFullYear()}-${String((await h.c.query(`SELECT nextval('hcm.misc_seq') n`)).rows[0].n).padStart(4, '0')}`;
    const start = iso(monthStart(asOf(), 1));
    await write(h.conn, 'POST', 'elementEntries', `ADVANCE_PAY ${amount} and ADVANCE_REC ${monthly} x ${months} for ${h.req.subject_person_id}`, async () => {
      const elapsed = Math.max(0, Math.floor(daysBetween(start, realToday()) / 30.4) + (start <= realToday() ? 1 : 0));
      const outstanding = Math.max(0, round2(amount - monthly * Math.min(elapsed, months)));
      await h.c.query(`INSERT INTO hcm.advances (advance_number, person_id, amount, monthly_recovery, months, start_period, outstanding, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [num, h.req.subject_person_id, amount, monthly, months, start.slice(0, 7), outstanding, outstanding > 0 ? 'ACTIVE' : 'SETTLED']);
      await h.c.query(`INSERT INTO hcm.element_entries (entry_number, person_id, element_code, amount, effective_start, effective_end, source, reference) VALUES ($1,$2,'ADVANCE_PAY',$3,$4,$5,'RAFEEQ',$6)`, [`${num}-P`, h.req.subject_person_id, amount, iso(monthStart(asOf())), iso(monthEnd(asOf())), num]);
      await h.c.query(`INSERT INTO hcm.element_entries (entry_number, person_id, element_code, amount, effective_start, effective_end, source, reference) VALUES ($1,$2,'ADVANCE_REC',$3,$4,$5,'RAFEEQ',$6)`, [`${num}-R`, h.req.subject_person_id, monthly, start, iso(monthEnd(start, months - 1)), num]);
    });
    await h.trail({ act: 'WRITE', summary: `Posted ${num}: ${money(amount)} paid with this month's salary; recovery ${money(monthly)} x ${months} from ${start.slice(0, 7)}.`, summary_ar: `سجل السلفة ${num}.`, actor_type: 'SYSTEM', actor_name: 'Connector', autonomy: null });
    await atom(h.conn, 'payupdate', String(h.req.subject_person_id), `Element entries added (${num})`, { advance: num });
    await h.notify(h.req.subject_person_id, 'Salary advance approved', 'تمت الموافقة على السلفة', `${num}: ${money(amount)}, repaid ${money(monthly)} a month.`);
    await h.setResult({ advance_number: num, amount, monthly, months });
    return { status: 'DONE', decision: `Posted ${num}` };
  },

  // ---------------------------------------------------------- WF-01 position
  'WF-01:check': async (h) => {
    const p = h.req.payload;
    const chk = await positionCheck(h.conn, p.department_id, p.grade_rank, p.job_title, p.budgeted !== false, asOf());
    await h.patch({ needs_chro: chk.needsChro, division: p.division ?? (await h.c.query('SELECT division FROM hcm.departments WHERE id=$1', [p.department_id])).rows[0].division, jd_en: chk.jd.en, jd_ar: chk.jd.ar });
    await h.trail({ act: 'CHECK', summary: `${chk.department}: ${chk.filled} of ${chk.positions} positions filled. ${p.budgeted !== false ? 'Budgeted line.' : 'Not in the budget.'} Grade ${chk.grade} range SAR ${sar(chk.grade_range[0])}–${sar(chk.grade_range[1])}; annual cost at midpoint ${money(chk.annual_cost_mid)}. ${saudization(chk)}${chk.needsChro ? 'CHRO approval required.' : ''}`.trim(), summary_ar: 'تحقق من الميزانية والدرجة والتوطين وأعد الوصف الوظيفي.', citation: 'HR-02 §2.1' });
    return { status: 'DONE', decision: chk.needsChro ? 'Needs CHRO' : 'HRBP only', outputs: chk, skip: chk.needsChro ? [] : ['chro'],
      recommend: { verdict: p.budgeted === false ? 'REVIEW' : 'APPROVE', summary: p.budgeted === false ? 'Unbudgeted: Finance must confirm the funding source.' : `Budgeted; grade fits the job; job description drafted in English and Arabic.` } };
  },
  'WF-01:post': async (h) => {
    const p = h.req.payload;
    const g = (await h.c.query('SELECT * FROM hcm.grades WHERE rank=$1', [p.grade_rank])).rows[0];
    const job = (await h.c.query(`SELECT j.id FROM hcm.jobs j JOIN hcm.positions pp ON pp.job_id=j.id WHERE pp.department_id=$1 ORDER BY ABS((SELECT rank FROM hcm.grades WHERE id=pp.grade_id) - $2) LIMIT 1`, [p.department_id, p.grade_rank])).rows[0];
    const code = `DEMO-POS-${String((await h.c.query(`SELECT nextval('hcm.misc_seq') n`)).rows[0].n).padStart(4, '0')}`;
    const [pos] = await write(h.conn, 'POST', 'positions', `Create ${code} ${p.job_title}`, async () =>
      (await h.c.query(`INSERT INTO hcm.positions (code, name, name_ar, job_id, department_id, location_id, grade_id, budget_status, status, hiring_status, annual_budget, effective_start)
                        VALUES ($1,$2,$3,$4,$5,(SELECT id FROM hcm.locations WHERE code='HO'),$6,$7,'ACTIVE','APPROVED',$8,$9) RETURNING id`,
        [code, p.job_title, p.job_title_ar ?? p.job_title, job.id, p.department_id, g.id, p.budgeted === false ? 'UNBUDGETED' : 'BUDGETED', Math.round(g.mid_basic * 1.65 * 12), asOf()])).rows);
    await h.trail({ act: 'WRITE', summary: `Created position ${code} in the HRMS.`, summary_ar: `أنشأ الوظيفة ${code}.`, actor_type: 'SYSTEM', actor_name: 'Connector', autonomy: null });
    await h.setResult({ position_code: code, position_id: pos.id });
    if (!h.req.payload.no_followon) {
      const { startCase } = await import('./core.js');
      const r2 = await startCase(h.c, { workflowId: 'WF-02', type: 'REQUISITION', title: `Requisition: ${p.job_title}`, title_ar: `طلب توظيف: ${p.job_title_ar ?? p.job_title}`, requester: h.req.requester_person_id, subject: h.req.requester_person_id, channel: 'EVENT', payload: { position_id: pos.id, hiring_manager_id: h.req.requester_person_id, division: p.division }, scenario: h.req.scenario_key });
      await h.setResult({ followon: r2.ref });
    }
    return { status: 'DONE', decision: `Created ${code}` };
  },

  // ---------------------------------------------------------- WF-02 requisition
  'WF-02:draft': async (h) => {
    const pos = (await h.c.query(`SELECT p.*, d.name AS dept, d.name_ar AS dept_ar, g.code AS grade FROM hcm.positions p JOIN hcm.departments d ON d.id=p.department_id JOIN hcm.grades g ON g.id=p.grade_id WHERE p.id=$1`, [h.req.payload.position_id])).rows[0];
    const criteria = [
      { key: 'exp', label: `${pos.grade >= 'G10' ? 6 : 3}+ years relevant experience`, kind: 'must' },
      { key: 'lang', label: 'Arabic and English', kind: 'must' },
      { key: 'fin', label: `${client().sector} experience`, kind: 'nice' },
    ];
    const ad = { en: `${client().name} is hiring a ${pos.name} in ${pos.dept}, ${client().city}. You will ${pos.name.toLowerCase().includes('manager') ? 'lead a team and ' : ''}deliver the department's plan with colleagues across ${client().short}. Grade ${pos.grade}. Saudi nationals are encouraged to apply; the vacancy is also posted on Jadarat.`, ar: `تعلن ${client().name_ar} عن حاجتها إلى ${pos.name_ar} في ${pos.dept_ar}، ${client().city_ar}. نشجع المواطنين السعوديين على التقديم، والوظيفة منشورة أيضاً على منصة جدارات.` };
    await h.patch({ criteria, ad, title: pos.name, title_ar: pos.name_ar });
    await h.trail({ act: 'PREPARE', summary: `Drafted the requisition for ${pos.name}, ${criteria.length} criteria (2 must-have) and a bilingual ad. Criteria describe the job only.`, summary_ar: 'صاغ طلب التوظيف والمعايير والإعلان باللغتين.', citation: 'HR-01 §1.2' });
    return { status: 'DONE', decision: 'Draft ready', outputs: { criteria, ad } };
  },
  'WF-02:internal': async (h) => {
    const pos = (await h.c.query(`SELECT p.*, g.rank, j.family FROM hcm.positions p JOIN hcm.grades g ON g.id=p.grade_id JOIN hcm.jobs j ON j.id=p.job_id WHERE p.id=$1`, [h.req.payload.position_id])).rows[0];
    const matches = await read(h.conn, 'talentProfiles', `q=JobFamily=${pos.family};Potential=HIGH`, 'Internal talent search', async () =>
      (await h.c.query(`SELECT p.id, p.display_name, j.name AS job, g.code AS grade FROM hcm.talent_profiles t JOIN hcm.persons p ON p.id=t.person_id
                          JOIN LATERAL (SELECT * FROM hcm.assignments a WHERE a.person_id=p.id ORDER BY effective_start DESC LIMIT 1) a ON true
                          JOIN hcm.jobs j ON j.id=a.job_id JOIN hcm.grades g ON g.id=a.grade_id JOIN hcm.work_relationships wr ON wr.person_id=p.id
                         WHERE t.potential='HIGH' AND j.family=$1 AND g.rank BETWEEN $2-2 AND $2-1 AND wr.end_date IS NULL AND t.mobility='OPEN' LIMIT 4`, [pos.family, pos.rank])).rows);
    await ext(h, 'JADARAT', 'POST', '/jadarat/api/vacancies', `Draft vacancy for ${h.req.payload.title}`);
    await h.patch({ internal: matches });
    await h.trail({ act: 'RECOMMEND', summary: matches.length ? `${matches.length} internal colleagues match and are open to moves: ${matches.map((m: any) => m.display_name).join(', ')}. Suggest inviting them before external posting.` : 'No internal match with high potential in the job family. Draft vacancy prepared on Jadarat for Saudi candidates.', summary_ar: 'بحث في المواهب الداخلية وجدارات.', citation: 'HR-02 §2.3' });
    return { status: 'DONE', decision: `${matches.length} internal matches`, outputs: { matches }, recommend: { verdict: 'APPROVE', summary: `Requisition and bilingual ad ready. ${matches.length} internal match${matches.length === 1 ? '' : 'es'} to invite first.` } };
  },
  'WF-02:post': async (h) => {
    const p = h.req.payload;
    const num = `DEMO-REQ-${now().getUTCFullYear()}-${String((await h.c.query(`SELECT nextval('hcm.misc_seq') n`)).rows[0].n).padStart(3, '0')}`;
    const pp = await people(h.c);
    await write(h.conn, 'POST', 'recruitingJobRequisitions', `Open ${num}`, async () => {
      await h.c.query(`INSERT INTO hcm.requisitions (req_number, position_id, title, title_ar, hiring_manager_id, recruiter_id, status, openings, opened_date, target_start_date, saudi_priority, summary, criteria) VALUES ($1,$2,$3,$4,$5,$6,'OPEN',1,$7,$8,true,$9,$10)`,
        [num, p.position_id, p.title, p.title_ar, p.hiring_manager_id, pp.persona.ta, asOf(), iso(addDays(asOf(), 60)), p.ad?.en ?? '', JSON.stringify(p.criteria)]);
      await h.c.query(`UPDATE hcm.positions SET hiring_status='IN_RECRUITMENT' WHERE id=$1`, [p.position_id]);
    });
    await ext(h, 'JADARAT', 'POST', '/jadarat/api/vacancies/publish', `Publish ${num} on Jadarat`);
    await h.trail({ act: 'WRITE', summary: `Opened ${num} and published it on the career site and Jadarat.`, summary_ar: `فتح ${num} ونشره.`, actor_type: 'SYSTEM', actor_name: 'Connector', autonomy: null });
    await h.setResult({ req_number: num });
    return { status: 'DONE', decision: `Opened ${num}` };
  },

  // ---------------------------------------------------------- WF-03 screening
  'WF-03:evidence': async (h) => {
    const p = h.req.payload;
    const req = (await h.c.query(`SELECT * FROM hcm.requisitions WHERE id=$1`, [p.requisition_id])).rows[0];
    let refused: string | null = null;
    if (p.instruction && /\b(age|under \d+|over \d+|younger|older|men only|women only|male|female|nationality|married|single|pregnan|religio)/i.test(p.instruction)) {
      refused = p.instruction;
      await h.trail({ act: 'REFUSE', summary: `Refused the instruction "${p.instruction}". Selecting on age, sex, nationality, religion or marital status is discrimination; criteria must relate to the job. Screening continues on the requisition's stated criteria only, and the HRBP has been told.`, summary_ar: `رفض التعليمة "${p.instruction}" لأنها تمييز؛ يستمر الفرز على المعايير المعلنة فقط.`, citation: 'HR-01 §1.2 (Art. 3); HR-02 §2.5' });
      const pp = await people(h.c);
      await h.notify(pp.persona.hrbp, 'Screening instruction refused', 'رُفضت تعليمة فرز', `${h.req.ref}: "${p.instruction}" on ${req.req_number}.`);
    }
    const apps = await read(h.conn, 'recruitingCandidateApplications', `q=RequisitionNumber=${req.req_number}`, 'Applications to screen', async () =>
      (await h.c.query(`SELECT a.*, c.candidate_number, c.years_experience, c.education, c.certifications, c.current_employer, c.first_name, c.last_name FROM hcm.applications a JOIN hcm.candidates c ON c.id=a.candidate_id WHERE a.requisition_id=$1 AND a.phase IN ('NEW','SCREENING')`, [p.requisition_id])).rows);
    let allMust = 0;
    for (const a of apps) {
      const ev = evidence(a, req.criteria);
      if (ev.filter((e) => e.kind === 'must').every((e) => e.status === 'evident')) allMust++;
      await h.c.query(`UPDATE hcm.applications SET evidence=$2, phase='SCREENING', updated_at=$3 WHERE id=$1`, [a.id, JSON.stringify(ev), now()]);
    }
    await h.trail({ act: 'PREPARE', summary: `Extracted evidence for ${apps.length} applications against ${req.criteria.length} criteria. ${allMust} show every must-have criterion. No score, no ranking, no rejection.`, summary_ar: `استخرج الأدلة لـ${apps.length} طلباً دون تقييم أو ترتيب أو رفض.`, citation: 'HR-02 §2.5' });
    return { status: refused ? 'REFUSED' : 'DONE', decision: refused ? 'Refused a discriminatory instruction; screened on stated criteria' : `${apps.length} screened`, outputs: { screened: apps.length, allMust, refused },
      recommend: { verdict: 'REVIEW', summary: `${allMust} of ${apps.length} applicants show every must-have criterion. The recruiter decides the shortlist.` } };
  },
  'WF-03:update': async (h) => {
    const ids: number[] = h.req.payload.shortlist ?? (await h.c.query(`SELECT id FROM hcm.applications WHERE requisition_id=$1 AND phase='SCREENING' AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(evidence) e WHERE e->>'kind'='must' AND e->>'status'<>'evident')`, [h.req.payload.requisition_id])).rows.map((r: any) => r.id);
    await write(h.conn, 'PATCH', 'recruitingCandidateApplications', `Shortlist ${ids.length}`, async () =>
      h.c.query(`UPDATE hcm.applications SET phase='SHORTLISTED', recruiter_decision='SHORTLIST', updated_at=$2 WHERE id = ANY($1)`, [ids, now()]));
    await h.trail({ act: 'WRITE', summary: `${ids.length} candidates moved to Shortlisted in the HRMS.`, summary_ar: `نقل ${ids.length} مرشحين إلى القائمة المختصرة.`, actor_type: 'SYSTEM', actor_name: 'Connector', autonomy: null });
    return { status: 'DONE', decision: `${ids.length} shortlisted` };
  },

  // ---------------------------------------------------------- WF-04 interviews (partial)
  'WF-04:schedule': async (h) => {
    await external(h.conn, 'M365', 'POST', '/v1.0/me/events', 'Panel invitations from free/busy');
    await h.trail({ act: 'PREPARE', summary: 'Scheduled panels from Microsoft 365 free/busy.', summary_ar: 'جدول المقابلات.' });
    return { status: 'DONE' };
  },
  'WF-04:integrate': async (h) => {
    const ac = (await h.c.query(`SELECT id, code FROM hcm.assessment_centres WHERE purpose='SELECTION' ORDER BY centre_date DESC LIMIT 1`)).rows[0];
    const out = ac ? await assessmentSpread(h.conn, ac.id) : { flags: [], participants: [] };
    await h.trail({ act: 'RECOMMEND', summary: `${out.flags.length} competencies where assessors differ by 2 or more points; integration report drafted.`, summary_ar: 'رصد تباين المقيمين.' });
    return { status: 'DONE', outputs: out };
  },

  // ---------------------------------------------------------- WF-05 offer
  'WF-05:propose': async (h) => {
    const p = h.req.payload;
    const pos = (await h.c.query(`SELECT p.*, g.min_basic, g.mid_basic, g.max_basic, g.code AS grade, g.rank FROM hcm.positions p JOIN hcm.grades g ON g.id=p.grade_id WHERE p.id=$1`, [p.position_id])).rows[0];
    const peers = (await h.c.query(`SELECT s.basic FROM hcm.salaries s JOIN LATERAL (SELECT * FROM hcm.assignments a WHERE a.person_id=s.person_id ORDER BY effective_start DESC LIMIT 1) a ON true WHERE a.grade_id=$1 AND s.date_to='4712-12-31' AND a.effective_end='4712-12-31'`, [pos.grade_id])).rows.map((r: any) => r.basic).sort((a: number, b: number) => a - b);
    const median = peers.length ? peers[Math.floor(peers.length / 2)] : pos.mid_basic;
    const basic = Math.round(Math.min(pos.max_basic, Math.max(pos.min_basic, Number(p.expected_basic ?? median))) / 50) * 50;
    const approver = basic > pos.mid_basic ? 'CHRO' : 'HRBP';
    const alw = allowances(basic);
    await h.patch({ basic, housing: alw.housing, transport: alw.transport, other_allowance: alw.other, approver, grade: pos.grade, grade_id: pos.grade_id });
    await h.trail({ act: 'RECOMMEND', summary: `Proposed basic ${money(basic)} in ${pos.grade} (range SAR ${sar(pos.min_basic)}–${sar(pos.max_basic)}, compa-ratio ${(basic / pos.mid_basic).toFixed(2)}). Peer median in grade ${money(median)} across ${peers.length}. ${approver === 'CHRO' ? 'Above midpoint: CHRO approves.' : 'Within midpoint: HRBP approves.'}`, summary_ar: 'اقترح الراتب ضمن الدرجة مع مقارنة الأقران.', citation: 'HR-02 §2.7' });
    return { status: 'DONE', decision: `SAR ${basic} basic`, outputs: { basic, median, peers: peers.length, compa: round2(basic / pos.mid_basic), range: [pos.min_basic, pos.mid_basic, pos.max_basic] },
      recommend: { verdict: 'APPROVE', summary: `Basic ${money(basic)}, compa-ratio ${(basic / pos.mid_basic).toFixed(2)}; ${basic > median ? 'above' : 'at or below'} the peer median of ${money(median)}.` } };
  },
  'WF-05:letter': async (h) => {
    const p = h.req.payload;
    await h.patch({ offer_letter: `Offer of employment with ${client().name} (DEMO). Position ${p.title}, grade ${p.grade}. Basic ${money(p.basic)}, housing ${money(p.housing)}, transport ${money(p.transport)}${p.other_allowance ? `, other ${money(p.other_allowance)}` : ''} a month. Start date ${p.start_date}. Probation ${pol().probationDays} days (Art. 53). Medical insurance CCHI class ${pol().medicalClass}. Employment contract documented on Qiwa.` });
    await h.trail({ act: 'PREPARE', summary: 'Prepared the offer letter in English and Arabic.', summary_ar: 'أعد خطاب العرض باللغتين.' });
    return { status: 'DONE' };
  },
  'WF-05:extend': async (h) => {
    const p = h.req.payload;
    const num = `DEMO-OFF-${now().getUTCFullYear()}-${String((await h.c.query(`SELECT nextval('hcm.misc_seq') n`)).rows[0].n).padStart(4, '0')}`;
    await write(h.conn, 'POST', 'recruitingJobOffers', `Extend ${num}`, async () =>
      h.c.query(`INSERT INTO hcm.offers (offer_number, application_id, position_id, grade_id, basic, housing, transport, other_allowance, start_date, status, extended_at, responded_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [num, p.application_id, p.position_id, p.grade_id, p.basic, p.housing, p.transport, p.other_allowance, p.start_date, p.accept ? 'ACCEPTED' : 'EXTENDED', now(), p.accept ? now() : null]));
    await h.c.query(`UPDATE hcm.applications SET phase='OFFER', updated_at=$2 WHERE id=$1`, [p.application_id, now()]);
    await h.trail({ act: 'WRITE', summary: `Extended ${num}${p.accept ? '; the candidate accepted' : ''}.`, summary_ar: `أرسل العرض ${num}.`, actor_type: 'SYSTEM', actor_name: 'Connector', autonomy: null });
    await h.setResult({ offer_number: num });
    if (p.accept) {
      const cand = (await h.c.query(`SELECT c.* FROM hcm.candidates c JOIN hcm.applications a ON a.candidate_id=c.id WHERE a.id=$1`, [p.application_id])).rows[0];
      const pos = (await h.c.query(`SELECT * FROM hcm.positions WHERE id=$1`, [p.position_id])).rows[0];
      const pnum = `DEMO-${String((await h.c.query(`SELECT nextval('hcm.misc_seq') n`)).rows[0].n + 200000)}`;
      const pid = await write(h.conn, 'POST', 'workers', `Create pending worker ${pnum}`, async () => {
        const per = (await h.c.query(`INSERT INTO hcm.persons (person_number, first_name, last_name, first_name_ar, last_name_ar, display_name, display_name_ar, gender, date_of_birth, nationality, is_saudi, marital_status, work_email, mobile, national_id_masked, national_id_expiry, passport_masked, passport_expiry, iqama_expiry, bank_name, iban_masked, photo_seed)
          VALUES ($1,$2,$3,$4,$4,$5,$4,$6,$7,$8,$9,'Single',$10,'+966 50 000 0000','pending','2030-01-01','XXXXX','2032-01-01',NULL,'To be provided','To be provided',7) RETURNING id`,
          [pnum, cand.first_name, cand.last_name, cand.display_name_ar, `${cand.first_name} ${cand.last_name}`, cand.gender, '1994-05-01', cand.nationality, cand.is_saudi, `${cand.first_name.toLowerCase()}.${pnum.slice(5)}@demo.${client().key}.example`])).rows[0].id;
        const wr = (await h.c.query(`INSERT INTO hcm.work_relationships (period_of_service_id, person_id, legal_employer_id, worker_type, start_date, original_hire_date) VALUES ($1,$2,1,'P',$3,$3) RETURNING id`, [Date.now(), per, p.start_date])).rows[0].id;
        await h.c.query(`INSERT INTO hcm.assignments (assignment_number, person_id, work_relationship_id, effective_start, action_code, position_id, job_id, department_id, grade_id, location_id, manager_person_id, probation_end_date, probation_status, contract_end_date, notice_period_days)
          VALUES ($1,$2,$3,$4,'HIRE',$5,$6,$7,$8,$9,$10,$11,'IN_PROBATION',$12,$13)`, [`E${pnum.slice(5)}`, per, wr, p.start_date, pos.id, pos.job_id, pos.department_id, pos.grade_id, pos.location_id, p.hiring_manager_id, iso(addDays(p.start_date, pol().probationDays - 1)), iso(addMonths(p.start_date, 24)), 30]);
        await h.c.query(`INSERT INTO hcm.salaries (person_id, assignment_number, date_from, basic, housing, transport, other_allowance, action_code, reason) VALUES ($1,$2,$3,$4,$5,$6,$7,'HIRE',$8)`, [per, `E${pnum.slice(5)}`, p.start_date, p.basic, p.housing, p.transport, p.other_allowance, num]);
        await h.c.query(`UPDATE hcm.candidates SET internal_person_id=$1 WHERE id=$2`, [per, cand.id]);
        await h.c.query(`UPDATE hcm.applications SET phase='HIRED', updated_at=$2 WHERE id=$1`, [p.application_id, now()]);
        return per as number;
      });
      await h.trail({ act: 'WRITE', summary: `Created pending worker ${pnum} starting ${p.start_date}.`, summary_ar: `أنشأ سجل الموظف المرتقب ${pnum}.`, actor_type: 'SYSTEM', actor_name: 'Connector', autonomy: null });
      await atom(h.conn, 'newhire', pnum, `Pending worker ${pnum} created (start ${p.start_date})`, { personNumber: pnum, startDate: p.start_date });
      const { startCase } = await import('./core.js');
      const r2 = await startCase(h.c, { workflowId: 'WF-06', type: 'PREBOARDING', title: `Pre-boarding: ${cand.first_name} ${cand.last_name}`, title_ar: `ما قبل الالتحاق: ${cand.display_name_ar}`, requester: p.hiring_manager_id, subject: pid, channel: 'EVENT', payload: { person_id: pid, start_date: p.start_date, blocked: !!p.block_medical, hiring_manager_id: p.hiring_manager_id }, scenario: h.req.scenario_key });
      await h.setResult({ person_number: pnum, followon: r2.ref });
    }
    return { status: 'DONE', decision: `Extended ${num}` };
  },

  // ---------------------------------------------------------- WF-06 pre-boarding
  'WF-06:journey': async (h) => {
    const w = (await worker(h.conn, h.req.subject_person_id, asOf()))!;
    const start = h.req.payload.start_date ?? w.start_date;
    const expat = !w.is_saudi;
    const T = (k: string, t: string, ta: string, owner: string, sys: string | null, offset: number) => ({ k, t, ta, owner, sys, due: iso(addDays(start, offset)) });
    const cls = pol().medicalClass;
    const tasks = [
      T('docs', 'Upload passport, photo, certificates', 'رفع جواز السفر والصورة والشهادات', 'EMPLOYEE', null, -28),
      ...(expat ? [
        T('work_visa', 'Work permit and work visa issued (Qiwa)', 'إصدار رخصة العمل وتأشيرة العمل (قوى)', 'HR_OPS', 'QIWA', -21),
        T('medical', 'Medical examination at an approved centre', 'الفحص الطبي في مركز معتمد', 'CLINIC', null, -7),
        T('insurance', `CCHI medical insurance enrolment (class ${cls})`, `التسجيل في التأمين الطبي (الفئة ${cls})`, 'INSURER', null, -7),
        T('contract', 'Employment contract documented on Qiwa and accepted by the employee', 'توثيق عقد العمل في منصة قوى وقبوله من الموظف', 'HR_OPS', 'QIWA', 5),
        T('gosi', 'GOSI registration (occupational hazards)', 'التسجيل في التأمينات الاجتماعية (الأخطار المهنية)', 'HR_OPS', 'GOSI', 0),
        T('iqama', 'Iqama issued through Muqeem', 'إصدار الإقامة عبر منصة مقيم', 'HR_OPS', 'MUQEEM', 20),
      ] : [
        T('insurance', `CCHI medical insurance enrolment (class ${cls})`, `التسجيل في التأمين الطبي (الفئة ${cls})`, 'INSURER', null, -3),
        T('contract', 'Employment contract documented on Qiwa and accepted by the employee', 'توثيق عقد العمل في منصة قوى وقبوله من الموظف', 'HR_OPS', 'QIWA', 0),
        T('gosi', 'GOSI registration (annuities and SANED)', 'التسجيل في التأمينات الاجتماعية (المعاشات وساند)', 'HR_OPS', 'GOSI', 0),
      ]),
      T('it', 'Laptop, accounts and access ready', 'تجهيز الحاسوب والحسابات والصلاحيات', 'IT', 'M365', -2),
      T('mudad', 'Bank account and IBAN for salary payment through Mudad', 'الحساب البنكي والآيبان لصرف الراتب عبر مدد', 'EMPLOYEE', 'MUDAD', 7),
      T('day1', 'Day-one plan, buddy and introductions', 'خطة اليوم الأول والزميل المرشد والتعارف', 'DALIL', 'M365', -1),
    ];
    const jnum = `DEMO-JRN-${String((await h.c.query(`SELECT nextval('hcm.misc_seq') n`)).rows[0].n).padStart(5, '0')}`;
    await write(h.conn, 'POST', 'journeys', `Allocate PREBOARDING journey ${jnum}`, async () => {
      const j = (await h.c.query(`INSERT INTO hcm.journeys (journey_number, person_id, template, status, started_at, target_date) VALUES ($1,$2,'PREBOARDING','IN_PROGRESS',$3,$4) RETURNING id`, [jnum, h.req.subject_person_id, asOf(), start])).rows[0].id;
      const lead = daysBetween(asOf(), start);
      for (const [i, t] of tasks.entries()) {
        const daysToDue = daysBetween(asOf(), t.due);
        const status = h.req.payload.blocked && t.k === 'medical' ? 'BLOCKED' : daysToDue < -2 ? 'DONE' : daysToDue < 5 && lead < 25 ? 'IN_PROGRESS' : 'NOT_STARTED';
        await h.c.query(`INSERT INTO hcm.journey_tasks (journey_id, seq, task_key, title, title_ar, owner, external_system, status, due_date, completed_at, note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [j, i + 1, t.k, t.t, t.ta, t.owner, t.sys, status, t.due, status === 'DONE' ? t.due : null, status === 'BLOCKED' ? 'Clinic slot cancelled; no new slot before the planned arrival date' : null]);
      }
    });
    await h.patch({ journey_number: jnum, expat });
    await h.trail({ act: 'PREPARE', summary: `Opened ${jnum}: ${tasks.length} tasks${expat ? ', including the work visa, medical examination and Muqeem iqama' : ', including GOSI registration (annuities and SANED)'}. Start date ${start}.`, summary_ar: `فتح رحلة ما قبل الالتحاق ${jnum}.`, autonomy: 'A3' });
    return { status: 'DONE', decision: `${tasks.length} tasks`, outputs: { journey: jnum, tasks: tasks.length } };
  },
  'WF-06:immigration': async (h) => {
    if (h.req.payload.expat) {
      await ext(h, 'QIWA', 'POST', '/qiwa/work-permits/new', 'Submit work permit and work visa request');
      await ext(h, 'GOSI', 'POST', '/gosi/employer/registrations', 'Register expatriate with GOSI (occupational hazards)');
    } else {
      await ext(h, 'QIWA', 'POST', '/qiwa/contracts', 'Create the employment contract for the employee to accept');
      await ext(h, 'GOSI', 'POST', '/gosi/employer/registrations', 'Register Saudi employee with GOSI (annuities and SANED)');
    }
    await h.trail({ act: 'WRITE', summary: h.req.payload.expat ? 'Submitted the Qiwa work permit and work visa request and the GOSI registration (occupational hazards).' : 'Created the Qiwa contract and registered the employee with GOSI (annuities and SANED).', summary_ar: h.req.payload.expat ? 'قدم طلب رخصة العمل والتأشيرة عبر قوى وسجل الموظف في التأمينات الاجتماعية.' : 'أنشأ العقد في قوى وسجل الموظف في التأمينات الاجتماعية.', actor_type: 'SYSTEM', actor_name: 'Connector', autonomy: null });
    if (h.req.payload.blocked) {
      await h.trail({ act: 'ESCALATE', actor_type: 'AGENT', actor_id: 'dalil', actor_name: 'Dalil', autonomy: 'A3', summary: 'Medical examination is blocked: the clinic cancelled the slot and the next one is after the planned arrival date. Start date at risk; escalated to HR Operations.', summary_ar: 'الفحص الطبي متوقف؛ تاريخ الالتحاق في خطر وأُحيل إلى عمليات الموارد البشرية.' });
      return { status: 'DONE', recommend: { verdict: 'REVIEW', summary: 'Book a priority slot at an approved medical centre or move the start date by one week.' } };
    }
    return { status: 'DONE' };
  },
  'WF-06:ready': async (h) => {
    const t = (await h.c.query(`SELECT jt.status, COUNT(*)::int n FROM hcm.journey_tasks jt JOIN hcm.journeys j ON j.id=jt.journey_id WHERE j.journey_number=$1 GROUP BY jt.status`, [h.req.payload.journey_number])).rows;
    const done = t.find((x: any) => x.status === 'DONE')?.n ?? 0, total = t.reduce((s: number, x: any) => s + x.n, 0);
    await h.c.query(`UPDATE hcm.journey_tasks SET status='IN_PROGRESS', note='Priority slot booked by HR Ops' WHERE status='BLOCKED' AND journey_id=(SELECT id FROM hcm.journeys WHERE journey_number=$1)`, [h.req.payload.journey_number]);
    await external(h.conn, 'M365', 'POST', '/v1.0/me/events', 'Day-one invitations: welcome, IT, buddy coffee, team lunch');
    await h.trail({ act: 'NOTIFY', summary: `${done} of ${total} tasks done; the rest are on track for the start date. Day-one invitations sent.`, summary_ar: 'تأكيد الجاهزية وإرسال دعوات اليوم الأول.', autonomy: 'A3' });
    await h.notify(h.req.subject_person_id, `Welcome to ${client().short}`, `مرحباً بك في ${client().name_ar}`, 'Dalil has your pre-boarding checklist and day-one plan.');
    return { status: 'DONE', decision: 'On track' };
  },

  // ---------------------------------------------------------- WF-07 (partial)
  'WF-07:day1': async (h) => { await h.trail({ act: 'NOTIFY', summary: 'Day-one plan delivered.', autonomy: 'A3' }); return { status: 'DONE' }; },
  'WF-07:checkins': async (h) => { await h.trail({ act: 'CHECK', summary: '30-day pulse: positive; no concerns.', autonomy: 'A3' }); return { status: 'DONE', recommend: { verdict: 'APPROVE', summary: 'No concerns raised at 30 days.' } }; },

  // ---------------------------------------------------------- WF-08 probation
  'WF-08:flag': async (h) => {
    const w = (await worker(h.conn, h.req.subject_person_id, asOf()))!;
    await h.patch({ probation_end: w.probation_end_date });
    const pd = pol().probationDays;
    const reviewBy = iso(addDays(w.start_date, pd - 15));
    await h.trail({ act: 'CHECK', summary: `${w.display_name}'s probation (${pd} days) ends ${w.probation_end_date} (${daysBetween(asOf(), w.probation_end_date!)} days from now). The review is due by ${reviewBy} (day ${pd - 15}). Probation may not exceed 180 days in total.`, summary_ar: `فترة التجربة ${pd} يوماً وتنتهي ${w.probation_end_date}؛ تستحق المراجعة قبل ${reviewBy}.`, citation: 'HR-03 §3.4 (Art. 53)' });
    return { status: 'DONE' };
  },
  'WF-08:evidence': async (h) => {
    const pid = h.req.subject_person_id;
    const goals = (await h.c.query(`SELECT ROUND(AVG(progress))::int p FROM hcm.goals WHERE person_id=$1 AND progress>0`, [pid])).rows[0].p ?? 70;
    const ci = (await h.c.query(`SELECT sentiment, check_in_date FROM hcm.check_ins WHERE person_id=$1 ORDER BY check_in_date DESC`, [pid])).rows;
    const sick = (await h.c.query(`SELECT COALESCE(SUM(days),0) d FROM hcm.absences WHERE person_id=$1 AND type_code='SICK'`, [pid])).rows[0].d;
    const lrn = (await h.c.query(`SELECT COUNT(*) FILTER (WHERE status='COMPLETED')::int done, COUNT(*)::int total FROM hcm.learning_enrollments WHERE person_id=$1`, [pid])).rows[0];
    const concern = ci.some((x: any) => x.sentiment === 'CONCERN');
    await h.trail({ act: 'PREPARE', summary: `Evidence: onboarding goals ${goals}% on average; ${ci.length} check-ins${concern ? ', one recording a concern' : ', all positive or neutral'}; ${sick} sick days; ${lrn.done}/${lrn.total} mandatory learning complete.`, summary_ar: 'أعد أدلة مراجعة التجربة.' });
    return { status: 'DONE', outputs: { goals, checkins: ci.length, concern, sick, learning: lrn },
      recommend: concern ? { verdict: 'REVIEW', summary: 'One check-in recorded a concern; discuss before confirming.' } : { verdict: 'APPROVE', summary: `Goals ${goals}% on average, positive check-ins, mandatory learning ${lrn.done}/${lrn.total}. Recommend confirmation.` } };
  },
  'WF-08:post': async (h) => {
    const pid = h.req.subject_person_id;
    await write(h.conn, 'POST', `workers/${pid}/child/workRelationships/assignments`, 'Assignment change PROBATION_CONFIRM', async () => {
      const cur = (await h.c.query(`SELECT * FROM hcm.assignments WHERE person_id=$1 AND effective_end='4712-12-31' ORDER BY effective_start DESC LIMIT 1`, [pid])).rows[0];
      if (cur.effective_start === asOf()) await h.c.query(`UPDATE hcm.assignments SET probation_status='CONFIRMED', action_code='PROBATION_CONFIRM' WHERE id=$1`, [cur.id]);
      else {
        await h.c.query(`UPDATE hcm.assignments SET effective_end=$2 WHERE id=$1`, [cur.id, iso(addDays(asOf(), -1))]);
        const { id, ...rest } = cur;
        await h.c.query(`INSERT INTO hcm.assignments (${Object.keys(rest).join(',')}) VALUES (${Object.keys(rest).map((_, i) => `$${i + 1}`).join(',')})`, Object.values({ ...rest, effective_start: asOf(), effective_end: '4712-12-31', action_code: 'PROBATION_CONFIRM', action_reason: 'Probation completed', probation_status: 'CONFIRMED' }));
      }
    });
    await atom(h.conn, 'empassignment', String(pid), 'Probation confirmed', { personId: pid });
    await h.trail({ act: 'WRITE', summary: 'Probation confirmation recorded on the assignment.', summary_ar: 'سجل تثبيت التعيين.', actor_type: 'SYSTEM', actor_name: 'Connector', autonomy: null });
    await h.notify(pid, 'Probation confirmed', 'تم تثبيتك في الوظيفة', 'Congratulations: your employment is confirmed.');
    return { status: 'DONE' };
  },

  // ---------------------------------------------------------- WF-09 (partial)
  'WF-09:cascade': async (h) => { await h.trail({ act: 'PREPARE', summary: 'Suggested three goals from the division plan.' }); return { status: 'DONE' }; },
  'WF-09:prep': async (h) => { await h.trail({ act: 'PREPARE', summary: 'Check-in talking points prepared.' }); return { status: 'DONE' }; },

  // ---------------------------------------------------------- WF-10 calibration
  'WF-10:draft': async (h) => {
    const n = (await h.c.query(`SELECT COUNT(*)::int n FROM hcm.performance_documents pd JOIN LATERAL (SELECT * FROM hcm.assignments a WHERE a.person_id=pd.person_id ORDER BY effective_start DESC LIMIT 1) a ON true JOIN hcm.departments d ON d.id=a.department_id WHERE pd.review_period=$1 AND d.division=$2`, [h.req.payload.period, h.req.payload.division])).rows[0].n;
    await h.trail({ act: 'PREPARE', summary: `Review evidence prepared for ${n} people from goals and check-ins.`, summary_ar: `أعد أدلة المراجعة لـ${n} موظفاً.` });
    return { status: 'DONE', outputs: { n } };
  },
  'WF-10:check': async (h) => {
    const cal = await calibration(h.conn, h.req.payload.period, h.req.payload.division);
    await h.setResult({ calibration: { n: cal.n, average: cal.average, distribution: cal.distribution, flags: cal.flags } });
    await h.trail({ act: 'RECOMMEND', summary: `${cal.n} ratings checked. ${cal.flags.length} flags for the panel: ${cal.flags.map((f: any) => f.kind.toLowerCase().replace('_', ' ')).filter((v: string, i: number, a: string[]) => a.indexOf(v) === i).join(', ')}. Mezan changes no rating.`, summary_ar: `فحص ${cal.n} تقييماً ورصد ${cal.flags.length} ملاحظات.`, citation: 'HR-09 §9.3–9.4' });
    return { status: 'DONE', outputs: { flags: cal.flags.length }, recommend: { verdict: 'REVIEW', summary: `${cal.flags.length} flags to resolve before ratings are shared.` } };
  },
  'WF-10:post': async (h) => {
    const changes: { doc_id?: number; person_id?: number; rating: number; reason: string; name?: string; from?: number }[] = h.req.payload.changes ?? [];
    await write(h.conn, 'PATCH', 'performanceDocuments', `Calibrated ratings for ${h.req.payload.division}`, async () => {
      await h.c.query(`UPDATE hcm.performance_documents pd SET calibrated_rating = manager_rating, status='SHARED', updated_at=$3
                         FROM hcm.assignments a, hcm.departments d WHERE a.person_id=pd.person_id AND a.effective_end='4712-12-31' AND d.id=a.department_id
                          AND pd.review_period=$1 AND d.division=$2 AND pd.status='CALIBRATION'`, [h.req.payload.period, h.req.payload.division, now()]);
      for (const ch of changes) await h.c.query(`UPDATE hcm.performance_documents SET calibrated_rating=$2, calibration_note=$3 WHERE (id=$1 OR person_id=$4) AND review_period=$5`, [ch.doc_id ?? 0, ch.rating, ch.reason, (ch as any).person_id ?? 0, h.req.payload.period]);
    });
    for (const ch of changes) await h.trail({ act: 'OVERRIDE', actor_type: 'HUMAN', actor_id: 'panel', actor_name: 'Calibration panel', autonomy: null, summary: `${ch.name ?? `Person ${ch.person_id}`}: manager rating ${ch.from ?? '?'} changed to ${ch.rating}.`, summary_ar: `تعديل التقييم إلى ${ch.rating}.`, override_reason: ch.reason });
    await h.trail({ act: 'WRITE', summary: `Calibrated ratings written to the HRMS (${changes.length} changed by the panel).`, summary_ar: 'سجل التقييمات المعايرة.', actor_type: 'SYSTEM', actor_name: 'Connector', autonomy: null });
    return { status: 'DONE' };
  },

  // ---------------------------------------------------------- WF-11 (partial)
  'WF-11:grid': async (h) => { await h.trail({ act: 'PREPARE', summary: 'Placed everyone on the 9-box from calibrated rating and potential.' }); return { status: 'DONE' }; },
  'WF-11:bench': async (h) => { await h.trail({ act: 'PREPARE', summary: 'Succession bench updated for critical roles.' }); return { status: 'DONE' }; },

  // ---------------------------------------------------------- WF-12 promotion
  'WF-12:case': async (h) => {
    const p = h.req.payload;
    const pc = await promotionCase(h.conn, h.req.subject_person_id, p.to_rank, asOf());
    await h.patch({ approver: pc.approver, proposed: pc.proposed, division: await divisionOf(h.c, h.req.subject_person_id) });
    await h.setResult({ case: pc });
    await h.trail({ act: 'RECOMMEND', summary: `${pc.person.name}: ${pc.monthsInGrade} months in ${pc.from.grade}; last ratings ${pc.ratings.slice(0, 2).map((r: any) => r.rating).join(', ')}. Proposed ${pc.to.grade} at ${money(pc.proposed)} (+${pc.increasePct}%, compa-ratio ${pc.compaRatio}); peer median in ${pc.to.grade} ${money(pc.peerMedian)}. ${pc.eligible ? 'Eligible.' : 'Not yet eligible.'} Approver: ${pc.approver}.`, summary_ar: 'أعد ملف الترقية.', citation: 'HR-06 §6.3–6.4' });
    return { status: 'DONE', outputs: pc, recommend: pc.eligible ? { verdict: 'APPROVE', summary: `Eligible. Policy minimum is ${money(pc.proposed)} (compa-ratio ${pc.compaRatio}).${pc.equity ? ` That is ${pc.equity.below}% below the median of ${pc.peers} peers in ${pc.to.grade}; consider ${money(pc.equity.suggest)} to keep pay equity.` : ''}` } : { verdict: 'DECLINE', summary: 'Not eligible: under 12 months in grade or last rating below 3.' } };
  },
  'WF-12:post': async (h) => {
    const pid = h.req.subject_person_id;
    const p = h.req.payload;
    const eff = p.effective ?? iso(monthStart(asOf(), 1));
    const g = (await h.c.query(`SELECT * FROM hcm.grades WHERE rank=$1`, [p.to_rank])).rows[0];
    const basic = Number(p.approved_basic ?? p.proposed);
    await write(h.conn, 'POST', `workers/${pid}/child/workRelationships/assignments`, `Assignment change PROMOTION to ${g.code} from ${eff}`, async () => {
      const cur = (await h.c.query(`SELECT * FROM hcm.assignments WHERE person_id=$1 AND effective_end='4712-12-31'`, [pid])).rows[0];
      await h.c.query(`UPDATE hcm.assignments SET effective_end=$2 WHERE id=$1`, [cur.id, iso(addDays(eff, -1))]);
      const { id, ...rest } = cur;
      await h.c.query(`INSERT INTO hcm.assignments (${Object.keys(rest).join(',')}) VALUES (${Object.keys(rest).map((_, i) => `$${i + 1}`).join(',')})`, Object.values({ ...rest, effective_start: eff, effective_end: '4712-12-31', action_code: 'PROMOTION', action_reason: `Promotion ${h.req.ref}`, grade_id: g.id, notice_period_days: noticeDaysForGrade(g.rank) }));
    });
    await write(h.conn, 'POST', 'salaries', `New salary SAR ${basic} from ${eff}`, async () => {
      const cur = (await h.c.query(`SELECT * FROM hcm.salaries WHERE person_id=$1 AND date_to='4712-12-31'`, [pid])).rows[0];
      await h.c.query(`UPDATE hcm.salaries SET date_to=$2 WHERE id=$1`, [cur.id, iso(addDays(eff, -1))]);
      await h.c.query(`INSERT INTO hcm.salaries (person_id, assignment_number, date_from, basic, housing, transport, other_allowance, action_code, reason) VALUES ($1,$2,$3,$4,$5,$6,$7,'PROMOTION',$8)`, [pid, cur.assignment_number, eff, basic, allowances(basic).housing, allowances(basic).transport, allowances(basic).other, h.req.ref]);
    });
    await write(h.conn, 'POST', 'elementEntries', 'End-date and replace recurring pay entries', async () => {
      await h.c.query(`UPDATE hcm.element_entries SET effective_end=$2 WHERE person_id=$1 AND element_code IN ('BASIC','HOUSING','TRANSPORT','OTHER_ALW','GOSI_EE','GOSI_ER') AND effective_end='4712-12-31'`, [pid, iso(addDays(eff, -1))]);
      const s = { basic, ...allowances(basic) };
      const per = (await h.c.query(`SELECT is_saudi, COALESCE((SELECT first_registered FROM hcm.gosi_registrations WHERE person_id=$1), (SELECT start_date FROM hcm.work_relationships WHERE person_id=$1)) s FROM hcm.persons WHERE id=$1`, [pid])).rows[0];
      const rows: [string, number][] = [['BASIC', s.basic], ['HOUSING', s.housing], ['TRANSPORT', s.transport], ['OTHER_ALW', s.other]];
      const gs = gosi(s.basic + s.housing, per.s, per.is_saudi, eff);
      if (per.is_saudi) rows.push(['GOSI_EE', gs.employee]);
      rows.push(['GOSI_ER', gs.employer]);
      for (const [code, amt] of rows) await h.c.query(`INSERT INTO hcm.element_entries (entry_number, person_id, element_code, amount, effective_start, source, reference) VALUES ($1,$2,$3,$4,$5,'RAFEEQ',$6)`, [`DEMO-EE-P${(await h.c.query(`SELECT nextval('hcm.misc_seq') n`)).rows[0].n}`, pid, code, amt, eff, h.req.ref]);
    });
    await atom(h.conn, 'empassignment', String(pid), `Promotion to ${g.code}`, { effective: eff });
    await atom(h.conn, 'payupdate', String(pid), `Salary change SAR ${basic}`, { effective: eff });
    await h.trail({ act: 'WRITE', summary: `Promotion to ${g.code} posted from ${eff}: assignment, salary and the matching element entries, so payroll and HR agree.`, summary_ar: `سجل الترقية إلى ${g.code}.`, actor_type: 'SYSTEM', actor_name: 'Connector', autonomy: null });
    await h.notify(pid, `Promotion to ${g.code}`, `ترقية إلى ${g.code}`, `Effective ${eff}.`);
    return { status: 'DONE' };
  },

  // ---------------------------------------------------------- WF-13 payroll pre-run
  'WF-13:check': async (h) => {
    const pc = await precheck(h.conn, h.req.payload.period);
    await h.setResult({ precheck: { totals: pc.totals, last: pc.last, findings: pc.findings, blocked: pc.blocked, period: pc.period.period_name } });
    const b = pc.findings.filter((f) => f.severity === 'BLOCKER').length, hi = pc.findings.filter((f) => f.severity === 'HIGH').length;
    await h.trail({ act: pc.blocked ? 'ESCALATE' : 'CHECK', summary: `${pc.period.period_name} pre-run: ${pc.totals.headcount} employees, gross ${money(pc.totals.gross)}. ${pc.findings.length} findings: ${b} blockers, ${hi} high. ${pc.blocked ? 'Release held until they are resolved.' : 'Clear to release.'}`, summary_ar: `فحص ما قبل تشغيل ${pc.period.period_name}: ${pc.findings.length} ملاحظات.`, citation: 'HR-10 §10.2' });
    return { status: 'DONE', decision: pc.blocked ? 'Release held' : 'Clear', outputs: { findings: pc.findings.length, blockers: b, high: hi },
      recommend: pc.blocked ? { verdict: 'REVIEW', summary: `${b + hi} findings must be fixed or explained before release.` } : { verdict: 'APPROVE', summary: 'No blocking findings.' } };
  },
  'WF-13:release': async (h) => {
    const fixes: string[] = h.req.payload.apply_fixes ?? [];
    const findings = (h.req.result.precheck?.findings ?? []) as any[];
    const per = (await h.c.query(`SELECT * FROM hcm.payroll_periods WHERE period_name=$1`, [h.req.result.precheck.period])).rows[0];
    let applied = 0;
    for (const f of findings.filter((x) => fixes.includes(x.id))) {
      applied++;
      if (f.code === 'LEAVER_STILL_PAID') await write(h.conn, 'PATCH', 'elementEntries', `End-date entries for leaver ${f.person_number}`, async () => h.c.query(`UPDATE hcm.element_entries SET effective_end=(SELECT end_date FROM hcm.work_relationships WHERE person_id=$1) WHERE person_id=$1 AND effective_end='4712-12-31'`, [f.person_id]));
      if (f.code === 'SALARY_ENTRY_MISMATCH') await write(h.conn, 'POST', 'elementEntries', `Correct recurring entries and add retro for ${f.person_number}`, async () => {
        const s = (await h.c.query(`SELECT * FROM hcm.salaries WHERE person_id=$1 AND date_to='4712-12-31'`, [f.person_id])).rows[0];
        await h.c.query(`UPDATE hcm.element_entries SET effective_end=$2 WHERE person_id=$1 AND element_code IN ('BASIC','HOUSING','TRANSPORT','OTHER_ALW') AND effective_end='4712-12-31'`, [f.person_id, iso(addDays(s.date_from, -1))]);
        for (const [code, amt] of [['BASIC', s.basic], ['HOUSING', s.housing], ['TRANSPORT', s.transport], ['OTHER_ALW', s.other_allowance]] as const) await h.c.query(`INSERT INTO hcm.element_entries (entry_number, person_id, element_code, amount, effective_start, source, reference) VALUES ($1,$2,$3,$4,$5,'RAFEEQ',$6)`, [`DEMO-EE-F${(await h.c.query(`SELECT nextval('hcm.misc_seq') n`)).rows[0].n}`, f.person_id, code, amt, s.date_from, h.req.ref]);
      });
      if (f.code === 'MISSING_ELEMENT' || f.code === 'GOSI_MISSING') await write(h.conn, 'POST', 'elementEntries', `Add missing ${f.code === 'GOSI_MISSING' ? 'GOSI' : 'HOUSING'} for ${f.person_number}`, async () => {
        const s = (await h.c.query(`SELECT s.*, wr.start_date, COALESCE((SELECT g.first_registered FROM hcm.gosi_registrations g WHERE g.person_id=s.person_id), wr.start_date) AS gosi_from, p.is_saudi FROM hcm.salaries s JOIN hcm.work_relationships wr ON wr.person_id=s.person_id JOIN hcm.persons p ON p.id=s.person_id WHERE s.person_id=$1 AND s.date_to='4712-12-31'`, [f.person_id])).rows[0];
        const rows: [string, number][] = f.code === 'GOSI_MISSING' ? (() => { const gs = gosi(s.basic + s.housing, s.gosi_from, s.is_saudi, asOf()); return (s.is_saudi ? [['GOSI_EE', gs.employee], ['GOSI_ER', gs.employer]] : [['GOSI_ER', gs.employer]]) as [string, number][]; })() : [['HOUSING', s.housing]];
        for (const [code, amt] of rows) await h.c.query(`INSERT INTO hcm.element_entries (entry_number, person_id, element_code, amount, effective_start, source, reference) VALUES ($1,$2,$3,$4,$5,'RAFEEQ',$6) ON CONFLICT DO NOTHING`, [`DEMO-EE-F${(await h.c.query(`SELECT nextval('hcm.misc_seq') n`)).rows[0].n}`, f.person_id, code, amt, s.start_date, h.req.ref]);
        if (f.code === 'GOSI_MISSING') await ext(h, 'GOSI', 'POST', '/gosi/employer/registrations', `Register ${f.person_number}`);
      });
      if (f.code === 'UNPAID_LEAVE_NOT_DEDUCTED') await write(h.conn, 'POST', 'elementEntries', `Unpaid leave deduction for ${f.person_number}`, async () => h.c.query(`INSERT INTO hcm.element_entries (entry_number, person_id, element_code, amount, effective_start, effective_end, source, reference) VALUES ($1,$2,'UNPAID_LEAVE',$3,$4,$5,'RAFEEQ',$6)`, [`DEMO-EE-F${(await h.c.query(`SELECT nextval('hcm.misc_seq') n`)).rows[0].n}`, f.person_id, f.amount, per.start_date, per.end_date, h.req.ref]));
      if (f.code === 'DEDUCTION_CAP') await write(h.conn, 'PATCH', 'elementEntries', `Reschedule advance recovery for ${f.person_number}`, async () => h.c.query(`UPDATE hcm.element_entries SET amount = amount - $2, effective_end = (effective_end + interval '3 months')::date WHERE person_id=$1 AND element_code='ADVANCE_REC' AND effective_end >= $3`, [f.person_id, Math.ceil(f.amount / 50) * 50, per.start_date]));
      if (f.code === 'MUDAD_IBAN') await h.c.query(`UPDATE hcm.persons SET iban_masked='SA03 •••• •••• •••• •••• 2210', bank_name=$2 WHERE id=$1`, [f.person_id, client().bank[0]]);
    }
    const unresolved = findings.filter((x) => ['BLOCKER', 'HIGH'].includes(x.severity) && !fixes.includes(x.id) && !(h.req.payload.accepted ?? {})[x.id]);
    if (unresolved.length) {
      await h.trail({ act: 'REFUSE', actor_type: 'AGENT', actor_id: 'hisab', actor_name: 'Hisab', autonomy: 'A1', summary: `${unresolved.length} blocking findings neither fixed nor explained; release not sent.`, summary_ar: 'لم يُرسل الاعتماد لوجود ملاحظات غير معالجة.' });
      return { status: 'DONE', stop: 'ESCALATED' };
    }
    await write(h.conn, 'POST', 'payrollFlows/action/submitPayroll', `Release ${per.period_name}`, async () => h.c.query(`UPDATE hcm.payroll_periods SET status='RELEASED' WHERE id=$1`, [per.id]));
    await ext(h, 'MUDAD', 'POST', '/mudad/payroll/upload', `Mudad salary file for ${per.period_name}: ${h.req.result.precheck.totals.sifLines} lines, net ${money(h.req.result.precheck.totals.net)}`);
    await ext(h, 'GOSI', 'POST', '/gosi/employer/contributions', `Contributions for ${per.period_name}`);
    await h.trail({ act: 'WRITE', summary: `${applied} fixes applied through the connector; ${per.period_name} released and the salary file submitted through Mudad.`, summary_ar: `طبق ${applied} تصحيحات واعتمد الرواتب وأرسل ملف الرواتب عبر مدد.`, actor_type: 'SYSTEM', actor_name: 'Connector', autonomy: null });
    return { status: 'DONE', decision: `Released with ${applied} fixes` };
  },

  // ---------------------------------------------------------- WF-19 resignation
  'WF-19:intake': async (h) => {
    const w = (await worker(h.conn, h.req.subject_person_id, asOf()))!;
    const notified = h.req.payload.notice_date ?? asOf();
    const lastDay = h.req.payload.last_day ?? iso(addDays(notified, w.notice_period_days - 1));
    await h.patch({ last_day: lastDay, notice_days: w.notice_period_days, division: w.division });
    await h.trail({ act: 'PREPARE', summary: `Resignation received ${notified}. Contract notice ${w.notice_period_days} days (grade ${w.grade_code}), so the proposed last working day is ${lastDay}.`, summary_ar: `استلم الاستقالة؛ آخر يوم عمل مقترح ${lastDay}.`, citation: 'HR-12 §12.1 (Art. 75)' });
    return { status: 'DONE', outputs: { lastDay, notice: w.notice_period_days }, recommend: { verdict: 'APPROVE', summary: `Last working day ${lastDay}. On resignation the end-of-service award follows Art. 85: none under two years, one third for 2-5 years, two thirds for 5-10, in full from 10 years (HR-11 §11.2).` } };
  },
  'WF-19:settlement': async (h) => {
    const st = await settlement(h.conn, h.req.subject_person_id, h.req.payload.last_day);
    await h.setResult({ settlement: st });
    await h.trail({ act: 'PREPARE', summary: `Final settlement ${money(st.total)}: ${st.lines.map((l) => `${l.label} ${money(l.amount)}`).join('; ')}. Pay by ${st.payBy}.`, summary_ar: `التسوية النهائية ${money(st.total)}.`, citation: 'HR-11 §11.1–11.5' });
    return { status: 'DONE', outputs: { total: st.total }, recommend: { verdict: 'APPROVE', summary: `${money(st.total)}; every line traced to its rule and HRMS record. Pay by ${st.payBy}.` } };
  },
  'WF-19:terminate': async (h) => terminate(h, 'RESIGNATION'),

  // ---------------------------------------------------------- WF-20 involuntary
  'WF-20:check': async (h) => {
    const chk = await involuntaryCheck(h.conn, h.req.subject_person_id, h.req.payload.grounds, asOf());
    await h.setResult({ check: chk });
    if (!chk.complete) {
      await h.trail({ act: 'ESCALATE', summary: `Stopped. ${chk.missing.map((m) => `${m.label}: ${m.detail}`).join(' ')} Without it the termination does not meet HR-12 §12.4. Case sent to the HRBP and Legal; no exit step will run.`, summary_ar: 'توقف: خطوة مطلوبة غير موثقة؛ أحيلت الحالة إلى شريك الأعمال والقانونية.', citation: 'HR-12 §12.4; HR-09 §9.6' });
      const pp = await people(h.c);
      await h.c.query(`UPDATE layer.requests SET waiting_on_role='HRBP', waiting_on_person_id=$2 WHERE id=$1`, [h.req.id, pp.hrbp[await divisionOf(h.c, h.req.subject_person_id)] ?? pp.persona.hrbp]);
      return { status: 'DONE', decision: `Stopped: ${chk.missing.length} required step(s) missing`, outputs: chk, stop: 'ESCALATED' };
    }
    await h.trail({ act: 'CHECK', summary: 'Documentation, legal grounds and protections checked: complete.', citation: 'HR-12 §12.4–12.5' });
    return { status: 'DONE', outputs: chk, recommend: { verdict: 'REVIEW', summary: 'Case file complete. The decision remains with the CHRO and Legal.' } };
  },
  'WF-20:settlement': async (h) => {
    const last = h.req.payload.last_day ?? iso(addDays(asOf(), 30));
    await h.patch({ last_day: last });
    const st = await settlement(h.conn, h.req.subject_person_id, last);
    await h.setResult({ settlement: st });
    await h.trail({ act: 'PREPARE', summary: `Final settlement ${money(st.total)}.`, citation: 'HR-11 §11.5' });
    return { status: 'DONE' };
  },
  'WF-20:terminate': async (h) => terminate(h, 'TERMINATION'),

  // ---------------------------------------------------------- WF-18 (partial)
  'WF-18:triage': async (h) => { await h.trail({ act: 'PREPARE', summary: 'Chronology built from HRMS records; severity medium.' }); return { status: 'DONE', recommend: { verdict: 'REVIEW', summary: 'Investigate within 10 working days.' } }; },

  'WF-21:scan': async (h) => { const { scan } = await import('../agents/amin.js'); const n = await scan(h.c, asOf()); return { status: 'DONE', decision: `${n} alerts` }; },
};

async function terminate(h: HCtx, action: string): Promise<StepOutcome> {
  const pid = h.req.subject_person_id;
  const last = h.req.payload.last_day;
  const st = h.req.result.settlement;
  await write(h.conn, 'PATCH', `workers/${pid}/child/workRelationships`, `Terminate: ${action} effective ${last}`, async () => {
    await h.c.query(`UPDATE hcm.work_relationships SET end_date=$2, last_working_day=$2, notified_termination_date=$3, termination_action=$4, termination_reason=$5, rehire_eligible=$6 WHERE person_id=$1`, [pid, last, h.req.payload.notice_date ?? asOf(), action, h.req.payload.reason ?? null, action === 'RESIGNATION']);
    await h.c.query(`UPDATE hcm.assignments SET effective_end=$2 WHERE person_id=$1 AND effective_end='4712-12-31'`, [pid, last]);
    await h.c.query(`UPDATE hcm.element_entries SET effective_end=$2 WHERE person_id=$1 AND effective_end > $2`, [pid, last]);
    if (st) for (const l of st.lines.filter((x: any) => ['LEAVE_ENCASH', 'GRATUITY', 'GRATUITY_PRE'].includes(x.code)))
      await h.c.query(`INSERT INTO hcm.element_entries (entry_number, person_id, element_code, amount, effective_start, effective_end, source, reference) VALUES ($1,$2,$3,$4,$5,$5,'RAFEEQ',$6)`, [`DEMO-EE-T${(await h.c.query(`SELECT nextval('hcm.misc_seq') n`)).rows[0].n}`, pid, l.code === 'LEAVE_ENCASH' ? 'LEAVE_ENCASH' : 'GRATUITY', l.amount, last, h.req.ref]);
  });
  await atom(h.conn, 'termination', String(pid), `${action} effective ${last}`, { personId: pid, lastWorkingDay: last });
  const isSaudi = !!(await h.c.query(`SELECT is_saudi FROM hcm.persons WHERE id=$1`, [pid])).rows[0]?.is_saudi;
  const kind = action === 'RESIGNATION' ? 'RESIGNATION' : 'TERMINATION';
  const payDays = settlementDeadlineDays(kind);
  await ext(h, 'QIWA', 'POST', '/qiwa/contracts/terminate', `Contract closure for ${pid} effective ${last}`);
  await ext(h, 'GOSI', 'POST', '/gosi/employer/exclusions', `GOSI deregistration for ${pid} from ${last}`);
  if (!isSaudi) await ext(h, 'MUQEEM', 'POST', '/muqeem/final-exit', `Final exit visa request for ${pid}`);
  const jnum = `DEMO-JRN-${String((await h.c.query(`SELECT nextval('hcm.misc_seq') n`)).rows[0].n).padStart(5, '0')}`;
  await write(h.conn, 'POST', 'journeys', `Allocate OFFBOARDING journey ${jnum}`, async () => {
    const j = (await h.c.query(`INSERT INTO hcm.journeys (journey_number, person_id, template, status, started_at, target_date) VALUES ($1,$2,'OFFBOARDING','IN_PROGRESS',$3,$4) RETURNING id`, [jnum, pid, asOf(), last])).rows[0].id;
    const tasks: [string, string, string, string, number][] = [
      ['handover', 'Handover plan agreed', 'الاتفاق على خطة التسليم', 'MANAGER', -10], ['assets', 'Laptop, card and assets returned', 'إعادة الحاسوب والبطاقة والأصول', 'EMPLOYEE', 0],
      ['access', 'System access removed on last day', 'إيقاف الصلاحيات في آخر يوم', 'IT', 0], ['exit_interview', 'Exit interview', 'مقابلة الخروج', 'WADAA', -3],
      ['settlement', `Final settlement paid (within ${payDays} days, Art. 88)`, `دفع التسوية النهائية خلال ${payDays} أيام (المادة 88)`, 'HR_OPS', payDays], ['qiwa', 'Contract closed on Qiwa', 'إنهاء العقد في منصة قوى', 'HR_OPS', 0],
      ['gosi', 'GOSI deregistration', 'استبعاد الموظف من التأمينات الاجتماعية', 'HR_OPS', 1],
      ...(isSaudi ? [] : [['final_exit', 'Final exit visa issued through Muqeem', 'إصدار تأشيرة الخروج النهائي عبر منصة مقيم', 'HR_OPS', 0] as [string, string, string, string, number]]),
      ['experience', 'Experience letter issued', 'إصدار شهادة الخبرة', 'HR_OPS', 1],
    ];
    for (const [i, [k, t, ta, o, off]] of tasks.entries()) await h.c.query(`INSERT INTO hcm.journey_tasks (journey_id, seq, task_key, title, title_ar, owner, status, due_date) VALUES ($1,$2,$3,$4,$5,$6,'NOT_STARTED',$7)`, [j, i + 1, k, t, ta, o, iso(addDays(last, off))]);
  });
  await h.trail({ act: 'WRITE', summary: `Termination posted (last day ${last}); recurring pay ends that day; final pay entries added; clearance journey ${jnum} opened; Qiwa contract closure and GOSI deregistration started${isSaudi ? '' : '; final exit visa requested through Muqeem'}.`, summary_ar: 'سجل إنهاء الخدمة وفتح رحلة إخلاء الطرف.', actor_type: 'SYSTEM', actor_name: 'Connector', autonomy: null });
  return { status: 'DONE' };
}
