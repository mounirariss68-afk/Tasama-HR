/**
 * Scenarios: the demo's remote control. Six cases, each a different SHAPE:
 * happy path, exception, refusal, escalation, end-to-end hire, involuntary exit.
 *
 * A scenario runs the real engine. Where the shape needs a human decision
 * that is not the point of the demo (a manager's routine support), the
 * scenario takes it and the trail says "(simulated by the scenario)". Where
 * the human decision IS the point, the scenario stops and tells the presenter
 * which persona to switch to.
 */
import { pool, tx } from './db.js';
import { startCase, decide } from './engine/core.js';
import { letterName } from './engine/handlers.js';
import { iso, addDays, advanceMax, advanceMaxTerm, client } from './domain/rules.js';

export type Beat = { at: string; text: string; text_ar: string };
export type Run = { key: string; status: 'running' | 'waiting' | 'done' | 'failed'; beats: Beat[]; cases: string[]; next?: { persona: string; text: string; text_ar: string; ref: string }; error?: string };

export const SCENARIOS = [
  { key: 'certificate', shape: 'Happy path', shape_ar: 'المسار المعتاد', title: 'Salary certificate through chat', title_ar: 'شهادة راتب عبر المحادثة', persona: 'employee',
    summary: 'The employee asks Rafeeq for a salary certificate for their bank. Wathiqa validates it against the client\'s HRMS and issues it. No one in HR touches it.',
    summary_ar: 'يطلب الموظف من رفيق شهادة راتب لبنكه؛ يتحقق وثيقة من نظام الموارد البشرية لدى العميل ويصدرها دون تدخل الموارد البشرية.' },
  { key: 'advance-exception', shape: 'Exception', shape_ar: 'استثناء', title: 'Salary advance above policy', title_ar: 'سلفة راتب تتجاوز السياسة', persona: 'chro',
    summary: 'An employee asks for an advance one and a half times the handbook limit. Ajaza finds it above policy, Hisab schedules recovery inside the Art. 92 and 93 caps, and the case goes to the CHRO as an exception.',
    summary_ar: 'يطلب موظف سلفة تعادل مرة ونصف الحد المسموح في الدليل؛ تتجاوز السياسة فتُحال كاستثناء إلى الرئيس التنفيذي للموارد البشرية.' },
  { key: 'screening-refusal', shape: 'Refusal', shape_ar: 'رفض', title: 'Discriminatory screening instruction', title_ar: 'تعليمة فرز تمييزية', persona: 'ta',
    summary: 'A hiring manager tells Hessa to shortlist only candidates under 35. Hessa refuses, cites the clause, tells the HRBP, and screens on the stated criteria only.',
    summary_ar: 'يطلب مدير توظيف من حصة اختيار من هم دون 35 عاماً فقط؛ ترفض وتستشهد بالسياسة وتبلغ شريك الأعمال وتفرز على المعايير المعلنة.' },
  { key: 'payroll-escalation', shape: 'Escalation', shape_ar: 'تصعيد', title: 'Payroll pre-run finds blockers', title_ar: 'فحص الرواتب يكشف موانع', persona: 'payroll',
    summary: 'Before the Mudad upload, Hisab checks this month\'s draft payroll: a promotion missing from element entries, a leaver still paid, deductions above the 50% cap, a missing GOSI line. Release is held for Payroll.',
    summary_ar: 'قبل رفع الرواتب إلى مدد يفحص حساب مسودة رواتب الشهر فيجد ترقية غير مسجلة وموظفاً مغادراً ما زال يتقاضى وخصماً يتجاوز 50% ونقصاً في اشتراك التأمينات؛ يوقف الاعتماد لفريق الرواتب.' },
  { key: 'hire-to-onboard', shape: 'End to end', shape_ar: 'من البداية إلى النهاية', title: 'Offer accepted to pre-boarding', title_ar: 'من قبول العرض إلى ما قبل الالتحاق', persona: 'payroll',
    summary: 'An offer for an open role is approved and accepted; the HRMS creates a pending worker; the new-hire event starts Dalil\'s pre-boarding (Qiwa, GOSI, Muqeem, CCHI), which finds the medical test blocked.',
    summary_ar: 'يُعتمد عرض لوظيفة شاغرة ويُقبل، فينشئ النظام سجل موظف مرتقب، ويبدأ دليل رحلة ما قبل الالتحاق (قوى، التأمينات، مقيم، التأمين الصحي) ويكتشف تعثر الفحص الطبي.' },
  { key: 'termination-stop', shape: 'Stop and escalate', shape_ar: 'إيقاف وتصعيد', title: 'Termination without an improvement plan', title_ar: 'إنهاء خدمة دون خطة تحسين', persona: 'hrbp',
    summary: 'A manager asks to terminate a low performer. Sanad checks the file against Saudi Labor Law and the handbook, finds no improvement plan, and stops the case for the HRBP and Legal. No exit step runs.',
    summary_ar: 'يطلب مدير إنهاء خدمة موظف ضعيف الأداء؛ يتحقق سند من الملف وفق نظام العمل السعودي والدليل ولا يجد خطة تحسين فيوقف الحالة لشريك الأعمال والقانونية.' },
];

const runs = new Map<string, Run>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const getRun = (id: string) => runs.get(id);
export const clearRuns = () => runs.clear();

async function people() {
  const meta = (await pool.query(`SELECT key, value FROM layer.meta WHERE key IN ('people','planted')`)).rows;
  return { persona: meta.find((m: any) => m.key === 'people').value.persona, planted: meta.find((m: any) => m.key === 'planted').value } as { persona: Record<string, number>; planted: Record<string, number> };
}

/** Names come from the current client's HRMS: each client has different people. */
async function nameOf(personId: number) {
  const r = (await pool.query(`SELECT display_name, display_name_ar FROM hcm.persons WHERE id=$1`, [personId])).rows[0];
  return { en: (r?.display_name as string) ?? 'The employee', ar: (r?.display_name_ar as string) ?? 'الموظف' };
}

async function jobOf(personId: number) {
  const r = (await pool.query(`SELECT j.name, j.name_ar FROM hcm.assignments a JOIN hcm.jobs j ON j.id=a.job_id WHERE a.person_id=$1 ORDER BY a.effective_start DESC LIMIT 1`, [personId])).rows[0];
  return { en: (r?.name as string) ?? '', ar: (r?.name_ar as string) ?? (r?.name as string) ?? '' };
}

async function divisionOf(personId: number) {
  return (await pool.query(`SELECT d.division FROM hcm.assignments a JOIN hcm.departments d ON d.id=a.department_id WHERE a.person_id=$1 ORDER BY a.effective_start DESC LIMIT 1`, [personId])).rows[0]?.division as string | undefined;
}

/** Narrate the trail of a case into beats, a few seconds apart, so the audience can follow. */
async function narrate(run: Run, ref: string, from = 0) {
  const r = (await pool.query(`SELECT id FROM layer.requests WHERE ref=$1`, [ref])).rows[0];
  const t = (await pool.query(`SELECT * FROM layer.trail WHERE request_id=$1 ORDER BY at, id`, [r.id])).rows;
  for (const e of t.slice(from)) {
    run.beats.push({ at: new Date().toISOString(), text: `${e.actor_name}${e.autonomy ? ` (${e.autonomy})` : ''}: ${e.summary}`, text_ar: `${e.actor_name}: ${e.summary_ar}` });
    await sleep(1100);
  }
  return t.length;
}

async function simulateDecision(ref: string, reason = 'Supported (simulated by the scenario)') {
  await tx(async (c) => {
    const r = (await c.query(`SELECT * FROM layer.requests WHERE ref=$1`, [ref])).rows[0];
    if (r.status === 'WAITING') await decide(c, { requestId: r.id, personId: r.waiting_on_person_id, decision: 'APPROVED', reason });
  });
}

export function runScenario(key: string): string {
  const id = `${key}-${Date.now()}`;
  const run: Run = { key, status: 'running', beats: [], cases: [] };
  runs.set(id, run);
  (async () => {
    const { persona: P, planted: T } = await people();
    const today = iso(new Date());
    const say = (text: string, text_ar: string) => run.beats.push({ at: new Date().toISOString(), text, text_ar });
    if (key === 'certificate') {
      const who = await nameOf(P.employee);
      const [bank, bankAr] = client().bank;
      say(`${who.en}, in chat: "I need a salary certificate for ${bank}."`, `${who.ar} في المحادثة: "أحتاج شهادة راتب لـ${bankAr}."`);
      await sleep(900);
      const r = await tx((c) => startCase(c, { workflowId: 'WF-14', type: 'SALARY_CERTIFICATE', title: letterName('SALARY_CERTIFICATE'), title_ar: letterName('SALARY_CERTIFICATE', true), requester: P.employee, subject: P.employee, channel: 'SCENARIO', scenario: key, payload: { letter_type: 'SALARY_CERTIFICATE', addressee: bank, language: 'en', purpose: 'Personal finance application' } }));
      run.cases.push(r.ref);
      await narrate(run, r.ref);
      say(`Done. ${r.ref} closed with no HR touch. Switch to the Employee persona and open Pay and documents to see the letter.`, `اكتملت الحالة ${r.ref} دون تدخل الموارد البشرية.`);
      run.status = 'done';
    }
    if (key === 'advance-exception') {
      const sal = (await pool.query(`SELECT basic, housing, transport, other_allowance FROM hcm.salaries WHERE person_id=$1 AND date_to='4712-12-31'`, [T.advanceEx])).rows[0];
      const basic = Number(sal.basic);
      const gross = basic + Number(sal.housing ?? 0) + Number(sal.transport ?? 0) + Number(sal.other_allowance ?? 0);
      const amount = Math.ceil(advanceMax(basic, gross) * 1.5 / 500) * 500;
      const months = advanceMaxTerm();
      const who = await nameOf(T.advanceEx);
      const job = await jobOf(T.advanceEx);
      say(`${who.en}${job.en ? `, ${job.en},` : ''} asks for SAR ${amount.toLocaleString('en-US')} over ${months} months for a family emergency.`, `${who.ar}${job.ar ? `، ${job.ar}،` : ''} يطلب ${amount.toLocaleString('en-US')} ريال على ${months} شهراً.`);
      await sleep(900);
      const r = await tx((c) => startCase(c, { workflowId: 'WF-16', type: 'ADVANCE', title: `Salary advance SAR ${amount.toLocaleString('en-US')}`, title_ar: `سلفة راتب ${amount.toLocaleString('en-US')} ريال`, requester: T.advanceEx, subject: T.advanceEx, channel: 'SCENARIO', scenario: key, payload: { amount, months, reason: 'Family emergency' } }));
      run.cases.push(r.ref);
      const n = await narrate(run, r.ref);
      await simulateDecision(r.ref);
      await narrate(run, r.ref, n);
      run.next = { persona: 'chro', ref: r.ref, text: 'Switch to the CHRO persona: the exception is in the CHRO\'s inbox with Ajaza\'s within-policy alternative. Approve, approve with changes, or decline.', text_ar: 'انتقل إلى شخصية الرئيس التنفيذي للموارد البشرية: الاستثناء في صندوق الوارد مع البديل ضمن السياسة.' };
      run.status = 'waiting';
    }
    if (key === 'screening-refusal') {
      const rq = (await pool.query(`SELECT r.* FROM hcm.requisitions r JOIN hcm.positions p ON p.id=r.position_id JOIN hcm.jobs j ON j.id=p.job_id WHERE j.code='MKT-DM'`)).rows[0];
      await pool.query(`UPDATE hcm.applications SET phase='NEW', evidence=NULL WHERE requisition_id=$1 AND phase IN ('SCREENING','SHORTLISTED')`, [rq.id]);
      say(`Hiring manager for ${rq.title}, to Hessa: "Only shortlist candidates under 35, we want a young team."`, `المدير المعني إلى حصة: "اختاري فقط المرشحين دون 35 عاماً."`);
      await sleep(900);
      const r = await tx(async (c) => startCase(c, { workflowId: 'WF-03', type: 'SCREENING', title: `Shortlist: ${rq.title}`, title_ar: `القائمة المختصرة: ${rq.title_ar}`, requester: rq.hiring_manager_id, subject: rq.hiring_manager_id, channel: 'SCENARIO', scenario: key, payload: { requisition_id: rq.id, hiring_manager_id: rq.hiring_manager_id, recruiter_id: P.ta, division: (await divisionOf(rq.hiring_manager_id)) ?? 'Commercial', instruction: 'Only shortlist candidates under 35, we want a young team' } }));
      run.cases.push(r.ref);
      await narrate(run, r.ref);
      run.next = { persona: 'ta', ref: r.ref, text: 'Switch to Talent acquisition: the shortlist is waiting with evidence against the stated criteria only. Agents/Evidence show the refusal.', text_ar: 'انتقل إلى استقطاب المواهب: القائمة بانتظارك مع الأدلة على المعايير المعلنة فقط.' };
      run.status = 'waiting';
    }
    if (key === 'payroll-escalation') {
      say('Five working days before cut-off and the Mudad upload, the schedule starts Hisab\'s pre-run check.', 'قبل خمسة أيام عمل من الإقفال والرفع إلى مدد يبدأ فحص حساب.');
      await sleep(900);
      const per = (await pool.query(`SELECT period_name FROM hcm.payroll_periods WHERE status='OPEN' ORDER BY start_date LIMIT 1`)).rows[0];
      const r = await tx((c) => startCase(c, { workflowId: 'WF-13', type: 'PRECHECK', title: `Payroll pre-run check: ${per.period_name}`, title_ar: `فحص ما قبل تشغيل الرواتب: ${per.period_name}`, requester: P.payroll, subject: P.payroll, channel: 'SCENARIO', priority: 'HIGH', scenario: key, payload: { period: per.period_name } }));
      run.cases.push(r.ref);
      await narrate(run, r.ref);
      run.next = { persona: 'payroll', ref: r.ref, text: 'Switch to Payroll: open the case or Payroll and rewards. Apply Hisab\'s fixes finding by finding, then release.', text_ar: 'انتقل إلى الرواتب: طبّق التصحيحات ثم اعتمد التشغيل.' };
      run.status = 'waiting';
    }
    if (key === 'hire-to-onboard') {
      const rq = (await pool.query(`SELECT r.* FROM hcm.requisitions r JOIN hcm.positions p ON p.id=r.position_id JOIN hcm.jobs j ON j.id=p.job_id WHERE j.code='SEC-AN'`)).rows[0];
      const app = (await pool.query(`SELECT a.* FROM hcm.applications a WHERE a.requisition_id=$1 AND a.phase NOT IN ('HIRED','NOT_SELECTED') ORDER BY a.id LIMIT 1`, [rq.id])).rows[0];
      say(`The panel selected a candidate for ${rq.title}. Tarqiya proposes pay within the grade.`, `اختارت اللجنة مرشحاً لوظيفة ${rq.title_ar}.`);
      await sleep(900);
      const start = iso(addDays(today, 30));
      const r = await tx(async (c) => startCase(c, { workflowId: 'WF-05', type: 'OFFER', title: `Offer: ${rq.title}`, title_ar: `عرض عمل: ${rq.title_ar}`, requester: rq.hiring_manager_id, subject: rq.hiring_manager_id, channel: 'SCENARIO', scenario: key, payload: { application_id: app.id, position_id: rq.position_id, requisition_id: rq.id, title: rq.title, hiring_manager_id: rq.hiring_manager_id, start_date: start, expected_basic: 16500, accept: true, block_medical: true, division: (await divisionOf(rq.hiring_manager_id)) ?? 'Technology and Digital' } }));
      run.cases.push(r.ref);
      const n = await narrate(run, r.ref);
      await simulateDecision(r.ref, 'Approved within midpoint (simulated by the scenario)');
      await narrate(run, r.ref, n);
      const follow = (await pool.query(`SELECT result->>'followon' AS f FROM layer.requests WHERE ref=$1`, [r.ref])).rows[0].f;
      if (follow) { run.cases.push(follow); await narrate(run, follow); }
      run.next = { persona: 'payroll', ref: follow ?? r.ref, text: 'Switch to Payroll and HR operations: Dalil has escalated the blocked medical test. Clear it to resume pre-boarding.', text_ar: 'انتقل إلى عمليات الموارد البشرية: صعّد دليل تعثر الفحص الطبي.' };
      run.status = 'waiting';
    }
    if (key === 'termination-stop') {
      const mgr = (await pool.query(`SELECT manager_person_id FROM hcm.assignments WHERE person_id=$1 ORDER BY effective_start DESC LIMIT 1`, [T.terminee])).rows[0].manager_person_id;
      const who = await nameOf(T.terminee);
      say(`${who.en}'s manager asks to end the employment for poor performance.`, `يطلب مدير ${who.ar} إنهاء خدمته بسبب ضعف الأداء.`);
      await sleep(900);
      const r = await tx((c) => startCase(c, { workflowId: 'WF-20', type: 'INVOLUNTARY', title: `Termination request: ${who.en}`, title_ar: `طلب إنهاء خدمة: ${who.ar}`, requester: mgr, subject: T.terminee, channel: 'SCENARIO', scenario: key, priority: 'HIGH', doneAtStart: ['intake'], payload: { person_id: T.terminee, grounds: 'PERFORMANCE', details: 'Targets missed for two years.' } }));
      run.cases.push(r.ref);
      await narrate(run, r.ref);
      run.next = { persona: 'hrbp', ref: r.ref, text: 'Switch to the HRBP: the escalated case shows exactly what is missing. The next step is an improvement plan, not an exit.', text_ar: 'انتقل إلى شريك الأعمال: الحالة المصعدة توضح ما ينقص الملف.' };
      run.status = 'waiting';
    }
  })().catch((e) => { run.status = 'failed'; run.error = e.message; console.error('[scenario]', e); });
  return id;
}
