/**
 * Case history, REPLAYED through the live engine with the clock set into the
 * past, then the open cases that fill each persona's inbox today.
 *
 * Because history runs through the same handlers, every historical case has
 * real trail rows, real HRMS writes (letters in document records, leave in
 * absences, advances in element entries) and real connector log entries.
 */
import { selectionOf } from '../domain/selection.js';
import type { PoolClient } from 'pg';
import { setClock } from '../clock.js';
import { startCase, decide, type Req } from '../engine/core.js';
import { rng } from '../domain/rng.js';
import { addDays, iso, parse, daysBetween } from '../domain/rules.js';
import type { BaseResult } from './base.js';
import { letterName } from '../engine/handlers.js';
import { CLIENTS, type ClientConfig } from '../domain/clients.js';
import { BANKS } from '../domain/names.js';
import { advanceMax, advanceMaxTerm } from '../domain/rules.js';

const H = 3600_000;

export async function seedHistory(c: PoolClient, base: BaseResult, client: ClientConfig) {
  const ci = CLIENTS.findIndex((x) => x.key === client.key);
  const R = rng(7331 + 31 * ci);
  const slow = client.slowness;
  const scale = client.size / 267;
  const n = (k: number) => Math.max(4, Math.round(k * scale));
  // Approver delay in hours: typical spread, slower at clients whose approvers are slower, with an occasional long tail.
  const delay = (lo: number, hi: number) => Math.round((R.int(lo, hi) + (R.chance(0.08 * slow) ? R.int(24, 70) : 0)) * slow);
  const nm = async (id: number) => (await c.query(`SELECT display_name AS en, display_name_ar AS ar FROM hcm.persons WHERE id=$1`, [id])).rows[0] as { en: string; ar: string };
  const A = base.anchor;
  const P = base.persona, T = base.planted;
  const mgrOf = (id: number) => base.managerOf.get(id) ?? null;
  const at = (d: Date) => setClock(d);
  // Saudi working week: Sunday to Thursday (weekend Friday and Saturday); Riyadh is UTC+3.
  const workday = (d: Date, hour: number) => { const x = new Date(d); x.setUTCHours(hour - 3, R.int(0, 59), 0, 0); const wd = x.getUTCDay(); if (wd === 5) x.setUTCDate(x.getUTCDate() + 2); if (wd === 6) x.setUTCDate(x.getUTCDate() + 1); return x; };
  const approvers = async (req: Req) => (await c.query(`SELECT * FROM layer.requests WHERE id=$1`, [req.id])).rows[0];
  const decideAs = async (req: Req, when: Date, decision: 'APPROVED' | 'REJECTED' = 'APPROVED', reason?: string) => {
    const r = await approvers(req);
    if (r.status !== 'WAITING') return r;
    at(when);
    await decide(c, { requestId: req.id, personId: r.waiting_on_person_id, decision, reason });
    return (await c.query(`SELECT * FROM layer.requests WHERE id=$1`, [req.id])).rows[0];
  };
  const pool = base.active.filter((id) => id !== P.joiner);

  // ---------------------------------------------------------------- letters
  const types: [string, number][] = [['SALARY_CERTIFICATE', 45], ['EMPLOYMENT_CERTIFICATE', 20], ['NOC_TRAVEL', 15], ['SALARY_TRANSFER', 8], ['NOC_DRIVING', 6], ['EMBASSY', 0]];
  const banks = [client.bank[0], client.bank[0], ...BANKS.slice(0, 4)];
  for (let i = 0; i < n(150); i++) {
    const day = addDays(A, -R.int(2, 270));
    const who = i === 0 ? P.employee : R.pick(pool);
    const type = i === 0 ? 'SALARY_CERTIFICATE' : R.weighted(types);
    at(workday(day, R.int(8, 20)));
    const addressee = type === 'SALARY_TRANSFER' || type === 'SALARY_CERTIFICATE' ? R.pick(banks) : type === 'NOC_TRAVEL' ? 'Embassy of the United Kingdom' : '';
    const req = await startCase(c, { workflowId: 'WF-14', type, title: letterName(type), title_ar: letterName(type, true), requester: who, subject: who, channel: R.chance(0.62) ? 'CHAT' : 'FORM', payload: { letter_type: type, addressee, language: R.chance(0.2) ? 'ar' : 'en', purpose: type === 'SALARY_CERTIFICATE' ? 'Bank account' : null } });
    if (req.status === 'WAITING') await decideAs(req, new Date(workday(day, 11).getTime() + delay(2, 20) * H));
  }

  // ---------------------------------------------------------------- leave
  for (let i = 0; i < n(70); i++) {
    const who = R.pick(pool);
    const st = addDays(A, -R.int(10, 240));
    const len = R.pick([1, 2, 3, 5, 5, 7]);
    const sub = addDays(st, -R.int(5, 25));
    at(workday(sub, R.int(8, 18)));
    const type = R.chance(0.82) ? 'ANNUAL' : 'SICK';
    const req = await startCase(c, { workflowId: 'WF-15', type: 'LEAVE', title: `${type === 'ANNUAL' ? 'Annual' : 'Sick'} leave, ${len} days`, title_ar: `${type === 'ANNUAL' ? 'إجازة سنوية' : 'إجازة مرضية'}، ${len} أيام`, requester: who, subject: who, channel: R.chance(0.5) ? 'CHAT' : 'FORM', payload: { type_code: type, start: iso(st), end: iso(addDays(st, len - 1)), days: len } });
    const r = await approvers(req);
    const rec = r.result?.recommendation?.verdict;
    const when = new Date(workday(sub, 10).getTime() + delay(3, 40) * H);
    if (rec === 'DECLINE' && R.chance(0.5)) await decideAs(req, when, 'APPROVED', R.pick(['Cover arranged with the Jeddah team for those days.', 'Family emergency; I will cover the desk myself.', 'Balance carried from last year was approved by HR in January.']));
    else if (rec === 'DECLINE') await decideAs(req, when, 'REJECTED', 'Please move by one week; two colleagues are already away.');
    else { const no = R.chance(0.04); await decideAs(req, when, no ? 'REJECTED' : 'APPROVED', no ? 'Quarter-end close; please pick dates after the 5th.' : undefined); }
  }

  // ---------------------------------------------------------------- salary advances
  const advPeople = R.shuffle(pool.filter((id) => ![P.manager, P.chro, P.hrbp, P.payroll, T.payCap, T.advanceEx, T.teamA, T.probationer].includes(id))).slice(0, n(16));
  for (const who of advPeople) {
    const day = addDays(A, -R.int(30, 250));
    at(workday(day, R.int(9, 17)));
    const sal = (await c.query(`SELECT basic, housing, transport, other_allowance FROM hcm.salaries WHERE person_id=$1 AND date_to='4712-12-31'`, [who])).rows[0] ?? { basic: 10000, housing: 2500, transport: 1000, other_allowance: 500 };
    const gross = sal.basic + sal.housing + sal.transport + sal.other_allowance;
    const amount = Math.max(1000, Math.floor(advanceMax(sal.basic, gross) * R.pick([0.4, 0.6, 0.8, 1]) / 500) * 500);
    const months = Math.min(advanceMaxTerm(), Math.max(Math.ceil(amount / (gross * 0.1)), R.pick([3, 6, 10])));
    const req = await startCase(c, { workflowId: 'WF-16', type: 'ADVANCE', title: `Salary advance SAR ${amount.toLocaleString('en-US')}`, title_ar: `سلفة راتب ${amount.toLocaleString('en-US')} ريال`, requester: who, subject: who, channel: 'CHAT', payload: { amount, months, reason: R.pick(['School fees', 'Family medical costs', 'Car repair', 'Rent deposit', 'Wedding']) } });
    const r1 = await decideAs(req, new Date(workday(day, 12).getTime() + delay(2, 20) * H));
    if (r1.status === 'WAITING') await decideAs(req, new Date(workday(day, 15).getTime() + (delay(2, 20) + delay(10, 30)) * H));
  }

  // ---------------------------------------------------------------- probation confirmations and promotions
  const confirmed = (await c.query(`SELECT a.person_id, a.probation_end_date FROM hcm.assignments a WHERE a.action_code='HIRE' AND a.probation_end_date BETWEEN $1 AND $2 AND a.effective_end='4712-12-31' LIMIT 6`, [iso(addDays(A, -200)), iso(addDays(A, -10))])).rows;
  for (const p of confirmed) {
    const day = addDays(p.probation_end_date, -28);
    at(workday(day, 9));
    const req = await startCase(c, { workflowId: 'WF-08', type: 'PROBATION', title: 'Probation review', title_ar: 'مراجعة فترة التجربة', requester: p.person_id, subject: p.person_id, channel: 'SCHEDULE', payload: { person_id: p.person_id } });
    await decideAs(req, workday(addDays(day, 6), 11));
    await decideAs(req, workday(addDays(day, 8), 14));
  }

  // ---------------------------------------------------------------- completed resignations (settlement deadline history)
  const resigners = R.shuffle(pool.filter((id) => !Object.values(P).includes(id) && !Object.values(T).includes(id))).slice(0, Math.max(2, Math.round(3 * scale)));
  for (const who of resigners) {
    const notice = addDays(A, -R.int(75, 230));
    at(workday(notice, 10));
    const w = await nm(who);
    const req = await startCase(c, { workflowId: 'WF-19', type: 'RESIGNATION', title: `Resignation: ${w.en}`, title_ar: `استقالة: ${w.ar}`, requester: who, subject: who, channel: 'FORM', payload: { person_id: who, notice_date: iso(notice), reason: R.pick(['Career move to another employer', 'Relocation', 'Further study']) } });
    await decideAs(req, workday(addDays(notice, 1), 12));
    const r2 = await approvers(req);
    const lwd = r2.result?.last_working_day ?? iso(addDays(notice, 30));
    if (r2.status === 'WAITING') await decideAs(req, workday(addDays(lwd, Math.round(R.int(2, 9) * slow)), 11));
  }
  // These leavers have gone: their clearance is finished. Each task is done on its due date; the settlement on the day the case closed.
  for (const who of resigners) {
    const done = (await c.query(`SELECT closed_at FROM layer.requests WHERE subject_person_id=$1 AND workflow_id='WF-19' AND status='COMPLETED' ORDER BY id DESC LIMIT 1`, [who])).rows[0];
    if (!done) continue;
    const j = (await c.query(`SELECT id FROM hcm.journeys WHERE person_id=$1 AND template='OFFBOARDING' ORDER BY id DESC LIMIT 1`, [who])).rows[0];
    if (!j) continue;
    await c.query(`UPDATE hcm.journey_tasks SET status='DONE', completed_at = CASE WHEN task_key='settlement' THEN $2::date ELSE due_date END WHERE journey_id=$1`, [j.id, done.closed_at]);
    await c.query(`UPDATE hcm.journeys SET status='COMPLETED' WHERE id=$1`, [j.id]);
  }

  // ---------------------------------------------------------------- open cases (today)
  const live = (hoursAgo: number) => at(new Date(Date.now() - hoursAgo * slow * H));
  const results: Record<string, string> = {};
  const nextMonth = (d: number) => iso(addDays(A, d));

  // The employee persona: a leave request waiting on the manager persona.
  live(20);
  results.mariamLeave = (await startCase(c, { workflowId: 'WF-15', type: 'LEAVE', title: 'Annual leave, 4 days', title_ar: 'إجازة سنوية، 4 أيام', requester: P.employee, subject: P.employee, channel: 'CHAT', payload: { type_code: 'ANNUAL', start: nextMonth(38), end: nextMonth(41), days: 4, reason: 'Family visit' } })).ref;
  // Team member C is already away part of the week team member B asks for; Team member A has approved leave (base). Two away -> Ajaza recommends declining.
  await c.query(`INSERT INTO hcm.absences (absence_number, person_id, type_code, start_date, end_date, days, status, approver_person_id, submitted_at, source) VALUES ('DEMO-ABS-L0001',$1,'ANNUAL',$2,$3,3,'APPROVED',$4,now() - interval '9 days','HRMS')`, [T.teamC, nextMonth(13), nextMonth(15), P.manager]);
  live(6);
  results.hassanLeave = (await startCase(c, { workflowId: 'WF-15', type: 'LEAVE', title: 'Annual leave, 5 days', title_ar: 'إجازة سنوية، 5 أيام', requester: T.teamB, subject: T.teamB, channel: 'FORM', payload: { type_code: 'ANNUAL', start: nextMonth(12), end: nextMonth(16), days: 5 } })).ref;
  // Team member A: advance within policy, waiting on the manager persona's support.
  live(30);
  {
    const sal = (await c.query(`SELECT basic, housing, transport, other_allowance FROM hcm.salaries WHERE person_id=$1 AND date_to='4712-12-31'`, [T.teamA])).rows[0];
    const gross = sal.basic + sal.housing + sal.transport + sal.other_allowance;
    const amount = Math.floor(advanceMax(sal.basic, gross) * 0.8 / 500) * 500;
    const months = Math.min(advanceMaxTerm(), Math.ceil(amount / (gross * 0.1)) + 1);
    results.priyaAdvance = (await startCase(c, { workflowId: 'WF-16', type: 'ADVANCE', title: `Salary advance SAR ${amount.toLocaleString('en-US')}`, title_ar: `سلفة راتب ${amount.toLocaleString('en-US')} ريال`, requester: T.teamA, subject: T.teamA, channel: 'CHAT', payload: { amount, months, reason: 'School fees' } })).ref;
  }
  // The probationer: probation review waiting on the manager persona.
  live(48);
  const pb = await nm(T.probationer);
  results.omarProbation = (await startCase(c, { workflowId: 'WF-08', type: 'PROBATION', title: `Probation review: ${pb.en}`, title_ar: `مراجعة فترة التجربة: ${pb.ar}`, requester: T.probationer, subject: T.probationer, channel: 'SCHEDULE', payload: { person_id: T.probationer } })).ref;

  // CX Manager vacancy: screened, recruiter shortlisted, waiting on the manager persona to agree.
  const cxReq = (await c.query(`SELECT r.* FROM hcm.requisitions r JOIN hcm.positions p ON p.id=r.position_id JOIN hcm.jobs j ON j.id=p.job_id WHERE j.code='CXP-MGR'`)).rows[0];
  live(70);
  const shortlist = await startCase(c, { workflowId: 'WF-03', type: 'SCREENING', title: `Shortlist: ${cxReq.title}`, title_ar: `القائمة المختصرة: ${cxReq.title_ar}`, requester: P.manager, subject: P.manager, channel: 'EVENT', payload: { requisition_id: cxReq.id, hiring_manager_id: P.manager, recruiter_id: P.ta, division: 'Commercial' } });
  await decideAs(shortlist, new Date(Date.now() - 26 * H));
  results.cxShortlist = shortlist.ref;

  // Retail Relationship Officer: 28 applicants screened, waiting on the TA persona.
  const roReq = (await c.query(`SELECT r.* FROM hcm.requisitions r JOIN hcm.positions p ON p.id=r.position_id JOIN hcm.jobs j ON j.id=p.job_id WHERE j.code='RSL-RO'`)).rows[0];
  live(9);
  results.roScreen = (await startCase(c, { workflowId: 'WF-03', type: 'SCREENING', title: `Shortlist: ${roReq.title}`, title_ar: `القائمة المختصرة: ${roReq.title_ar}`, requester: roReq.hiring_manager_id, subject: roReq.hiring_manager_id, channel: 'EVENT', payload: { requisition_id: roReq.id, hiring_manager_id: roReq.hiring_manager_id, recruiter_id: P.ta, division: 'Commercial' } })).ref;

  // Approved Senior Accountant position: requisition drafted by Hessa, waiting on the TA persona to post.
  const finPos = (await c.query(`SELECT p.* FROM hcm.positions p JOIN hcm.jobs j ON j.id=p.job_id WHERE j.code='FIN-SA' AND p.hiring_status='APPROVED' LIMIT 1`)).rows[0];
  live(14);
  if (finPos) results.finReq = (await startCase(c, { workflowId: 'WF-02', type: 'REQUISITION', title: `Requisition: ${finPos.name}`, title_ar: `طلب توظيف: ${finPos.name_ar}`, requester: base.deptHead.get('FIN')!, subject: base.deptHead.get('FIN')!, channel: 'EVENT', payload: { position_id: finPos.id, hiring_manager_id: base.deptHead.get('FIN'), division: 'Finance' } })).ref;

  // Corporate RM offer after the assessment centre: waiting on the HRBP persona (within midpoint).
  const corReq = (await c.query(`SELECT r.* FROM hcm.requisitions r JOIN hcm.positions p ON p.id=r.position_id JOIN hcm.jobs j ON j.id=p.job_id WHERE j.code='COR-RM'`)).rows[0];
  const corApp = (await c.query(`SELECT a.* FROM hcm.applications a WHERE a.requisition_id=$1 ORDER BY a.id LIMIT 1 OFFSET 1`, [corReq.id])).rows[0];
  await c.query(`UPDATE hcm.applications SET phase='ASSESSMENT' WHERE requisition_id=$1 AND id IN (SELECT id FROM hcm.applications WHERE requisition_id=$1 ORDER BY id LIMIT 4)`, [corReq.id]);
  live(22);
  const corSel = await selectionOf(c, corApp.id);
  results.corOffer = (await startCase(c, { workflowId: 'WF-05', type: 'OFFER', title: `Offer: ${corReq.title}`, title_ar: `عرض عمل: ${corReq.title_ar}`, requester: corReq.hiring_manager_id, subject: corReq.hiring_manager_id, channel: 'EVENT', payload: { application_id: corApp.id, position_id: corReq.position_id, requisition_id: corReq.id, title: corReq.title, hiring_manager_id: corReq.hiring_manager_id, start_date: nextMonth(45), expected_basic: 21500, division: 'Commercial', selection_reason: corSel?.reason, selection_reason_ar: corSel?.reason_ar } })).ref;

  // The promotee: promotion G07 -> G08, waiting on the HRBP persona.
  live(40);
  const pm = await nm(T.promotee);
  results.reemPromotion = (await startCase(c, { workflowId: 'WF-12', type: 'PROMOTION', title: `Promotion: ${pm.en} to G08`, title_ar: `ترقية: ${pm.ar} إلى G08`, requester: base.deptHead.get('COR')!, subject: T.promotee, channel: 'FORM', payload: { person_id: T.promotee, to_rank: 8 } })).ref;

  // Commercial calibration: waiting on the HRBP persona.
  const fyRow = (await c.query(`SELECT review_period FROM hcm.performance_documents WHERE status='CALIBRATION' LIMIT 1`)).rows[0];
  live(3);
  if (fyRow) results.calibration = (await startCase(c, { workflowId: 'WF-10', type: 'CALIBRATION', title: `Calibration: Commercial, ${fyRow.review_period}`, title_ar: `المعايرة: القطاع التجاري، ${fyRow.review_period}`, requester: P.hrbp, subject: P.hrbp, channel: 'SCHEDULE', payload: { division: 'Commercial', period: fyRow.review_period } })).ref;

  // The resigner resigned 20 days ago; the manager accepted; settlement waiting on the payroll persona.
  at(workday(addDays(A, -20), 10));
  const rs = await nm(T.resigner);
  const kashif = await startCase(c, { workflowId: 'WF-19', type: 'RESIGNATION', title: `Resignation: ${rs.en}`, title_ar: `استقالة: ${rs.ar}`, requester: T.resigner, subject: T.resigner, channel: 'FORM', payload: { person_id: T.resigner, notice_date: iso(addDays(A, -20)), reason: 'Moving to a role in another company' } });
  await decideAs(kashif, workday(addDays(A, -19), 12));
  results.kashifSettlement = kashif.ref;

  // A salary transfer letter waiting on the payroll persona.
  live(5);
  const stWho = R.pick(pool.filter((id) => id !== P.employee));
  results.salaryTransfer = (await startCase(c, { workflowId: 'WF-14', type: 'SALARY_TRANSFER', title: letterName('SALARY_TRANSFER'), title_ar: letterName('SALARY_TRANSFER', true), requester: stWho, subject: stWho, channel: 'CHAT', payload: { letter_type: 'SALARY_TRANSFER', addressee: client.bank[0], language: 'en' } })).ref;

  // A second-advance exception, manager supported, waiting on the CHRO.
  const outstanding = (await c.query(`SELECT person_id FROM hcm.advances WHERE status='ACTIVE' LIMIT 1`)).rows[0];
  if (outstanding) {
    live(52);
    const ex = await startCase(c, { workflowId: 'WF-16', type: 'ADVANCE', title: 'Salary advance SAR 4,000 (second advance)', title_ar: 'سلفة راتب 4,000 ريال (سلفة ثانية)', requester: outstanding.person_id, subject: outstanding.person_id, channel: 'CHAT', payload: { amount: 4000, months: 6, reason: 'Hospital bill for a parent' } });
    await decideAs(ex, new Date(Date.now() - 30 * H));
    results.secondAdvance = ex.ref;
  }

  // Head of Data (G12), unbudgeted: HRBP approved, waiting on the CHRO.
  const dig = (await c.query(`SELECT id, division FROM hcm.departments WHERE code='DEMO-DIG'`)).rows[0];
  live(28);
  const posReq = await startCase(c, { workflowId: 'WF-01', type: 'POSITION', title: 'New position: Head of Data and AI', title_ar: 'وظيفة جديدة: رئيس البيانات والذكاء الاصطناعي', requester: base.deptHead.get('DIG')!, subject: base.deptHead.get('DIG')!, channel: 'FORM', payload: { department_id: dig.id, job_title: 'Head of Data and AI', job_title_ar: 'رئيس البيانات والذكاء الاصطناعي', grade_rank: 12, budgeted: false, reason: 'Data platform and AI programme approved by the board for 2027.', division: dig.division }, doneAtStart: ['intake'] });
  await decideAs(posReq, new Date(Date.now() - 4 * H));
  results.headOfData = posReq.ref;

  // The joiner: pre-boarding journey opened when his offer was accepted.
  at(workday(addDays(A, -20), 9));
  const jn = await nm(P.joiner);
  results.arjun = (await startCase(c, { workflowId: 'WF-06', type: 'PREBOARDING', title: `Pre-boarding: ${jn.en}`, title_ar: `ما قبل الالتحاق: ${jn.ar}`, requester: base.deptHead.get('INV')!, subject: P.joiner, channel: 'EVENT', payload: { person_id: P.joiner, start_date: iso(addDays(A, 17)), hiring_manager_id: base.deptHead.get('INV') } })).ref;

  // Onboarding journeys for people who joined in the last 90 days.
  const recent = (await c.query(`SELECT wr.person_id, wr.start_date FROM hcm.work_relationships wr WHERE wr.worker_type='E' AND wr.start_date > $1 AND wr.end_date IS NULL`, [iso(addDays(A, -90))])).rows;
  for (const p of recent) {
    const j = (await c.query(`INSERT INTO hcm.journeys (journey_number, person_id, template, status, started_at, target_date) VALUES ($1,$2,'ONBOARDING','IN_PROGRESS',$3,$4) RETURNING id`, [`DEMO-JRN-O${p.person_id}`, p.person_id, p.start_date, iso(addDays(p.start_date, 90))])).rows[0].id;
    const tasks: [string, string, string, number][] = [['day1', 'Day one: welcome, IT, buddy', 'اليوم الأول: الترحيب والتقنية والزميل المرشد', 0], ['policies', 'Code of conduct and PDPL training', 'مدونة السلوك وتدريب حماية البيانات الشخصية', 7], ['d30', '30-day check-in', 'متابعة اليوم 30', 30], ['d60', '60-day check-in', 'متابعة اليوم 60', 60], ['d90', '90-day check-in and goals agreed', 'متابعة اليوم 90 واعتماد الأهداف', 90]];
    for (const [i, [k, t, ta, off]] of tasks.entries()) {
      const due = iso(addDays(p.start_date, off));
      await c.query(`INSERT INTO hcm.journey_tasks (journey_id, seq, task_key, title, title_ar, owner, status, due_date, completed_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [j, i + 1, k, t, ta, k.startsWith('d') ? 'DALIL' : 'EMPLOYEE', due < iso(A) ? 'DONE' : 'NOT_STARTED', due, due < iso(A) ? due : null]);
    }
  }
  setClock(null);
  await reconcileBalances(c);
  await c.query(`INSERT INTO layer.meta (key, value) VALUES ('open_cases', $1)`, [JSON.stringify(results)]);
  return results;
}

/** Balances agree with the absence records: taken = completed leave this year, booked = approved leave not yet taken. */
export async function reconcileBalances(c: PoolClient) {
  await c.query(`UPDATE hcm.absence_balances b SET
      taken  = COALESCE((SELECT SUM(a.days) FROM hcm.absences a WHERE a.person_id=b.person_id AND a.type_code=b.type_code AND EXTRACT(YEAR FROM a.start_date)=b.year AND a.status='COMPLETED'), 0),
      booked = COALESCE((SELECT SUM(a.days) FROM hcm.absences a WHERE a.person_id=b.person_id AND a.type_code=b.type_code AND EXTRACT(YEAR FROM a.start_date)=b.year AND a.status='APPROVED'), 0)`);
  // Where a manager approved leave beyond the balance (overriding Ajaza: "carry-over approved by HR"), record that carry-over so no balance is negative.
  await c.query(`UPDATE hcm.absence_balances SET carried_over = taken + booked - entitlement WHERE entitlement + carried_over - taken - booked < 0`);
}
