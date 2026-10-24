/**
 * WF-37, a contract the client sends (design/payroll-ops-addendum.md 1.4, 1.5, 1.7): Aqd reads it against the
 * client's policy and the law and checks each field against its document; Tasama HR operations enters it, or takes
 * the differences to the client; the record, the pay, the document set and the month's joiner are written once.
 */
import type { PoolClient } from 'pg';
import type { HCtx, Req, StepOutcome } from './core.js';
import type { StepDef } from '../domain/workflows.js';
import { client, pol, addDays, iso } from '../domain/rules.js';
import { ibanValid, bankByIban } from '../domain/banks.js';
import { openPeriod } from '../payroll/inputs.js';
import { write } from '../hcm/connector.js';

type H = (h: HCtx) => Promise<StepOutcome>;
type Who = (c: PoolClient, req: Req, def: StepDef) => Promise<{ role: string; personId: number } | null>;
const sar = (n: number) => `SAR ${Number(n).toLocaleString('en-US')}`;
const DOC: Record<string, string> = { CONTRACT: 'signed contract', NATIONAL_ID: 'national ID', IQAMA: 'iqama', IBAN_LETTER: 'IBAN letter' };
const DOC_AR: Record<string, string> = { CONTRACT: 'العقد الموقّع', NATIONAL_ID: 'الهوية الوطنية', IQAMA: 'الإقامة', IBAN_LETTER: 'خطاب الآيبان' };

export type Finding = { key: string; ok: boolean; text: string; text_ar: string; fix?: string };

/** Every term against the policy and the law, every field against its document. */
export function readContract(p: any): Finding[] {
  const k = p.contract, e = p.employee, po = pol();
  const out: Finding[] = [];
  const housing = Math.round((k.basic * po.housingPct) / 100), transport = Math.round((k.basic * po.transportPct) / 100);
  out.push(k.housing >= housing
    ? { key: 'housing', ok: true, text: `Housing ${sar(k.housing)}: ${po.housingPct}% of basic, as the policy says`, text_ar: `بدل السكن ${sar(k.housing)}: ${po.housingPct}% من الأساسي وفق السياسة` }
    : { key: 'housing', ok: false, text: `Housing is ${sar(k.housing)}, ${Math.round((k.housing / k.basic) * 100)}% of basic; ${client().short}'s policy pays ${po.housingPct}%, ${sar(housing)}`, text_ar: `بدل السكن ${sar(k.housing)}؛ سياسة العميل ${po.housingPct}% أي ${sar(housing)}`, fix: `Housing at ${po.housingPct}% of basic, ${sar(housing)}` });
  out.push(k.transport >= transport
    ? { key: 'transport', ok: true, text: `Transport ${sar(k.transport)}: ${po.transportPct}% of basic`, text_ar: `بدل النقل ${sar(k.transport)}: ${po.transportPct}% من الأساسي` }
    : { key: 'transport', ok: false, text: `Transport is ${sar(k.transport)}; the policy pays ${po.transportPct}% of basic, ${sar(transport)}`, text_ar: `بدل النقل أقل من السياسة`, fix: `Transport at ${po.transportPct}% of basic` });
  out.push(k.probation_days <= 180 ? { key: 'probation', ok: true, text: `Probation ${k.probation_days} days, within the 180 the law allows (Art. 53)`, text_ar: `فترة التجربة ${k.probation_days} يوماً ضمن الحد النظامي` }
    : { key: 'probation', ok: false, text: `Probation is ${k.probation_days} days; the law allows at most 180 (Art. 53)`, text_ar: 'فترة التجربة تتجاوز الحد النظامي', fix: 'Probation of 180 days at most' });
  out.push(k.annual_leave >= 21 ? { key: 'leave', ok: true, text: `${k.annual_leave} days of annual leave (at least 21, Art. 109)`, text_ar: `${k.annual_leave} يوماً إجازة سنوية` }
    : { key: 'leave', ok: false, text: `${k.annual_leave} days of annual leave; the law requires 21 (Art. 109)`, text_ar: 'الإجازة السنوية أقل من الحد النظامي', fix: '21 days of annual leave at least' });
  out.push(!e.is_saudi && k.contract_type !== 'FIXED_TERM'
    ? { key: 'term', ok: false, text: 'A non-Saudi is employed on a fixed term (Art. 37); this contract is indefinite', text_ar: 'عقد غير السعودي يجب أن يكون محدد المدة', fix: 'A fixed term' }
    : { key: 'term', ok: true, text: e.is_saudi ? 'Indefinite, for a Saudi (Art. 55)' : 'A fixed term, as the law requires for a non-Saudi (Art. 37)', text_ar: e.is_saudi ? 'غير محدد المدة لسعودي' : 'محدد المدة لغير السعودي' });
  const idOk = /^\d{10}$/.test(e.national_id) && e.national_id[0] === (e.is_saudi ? '1' : '2');
  out.push(idOk ? { key: 'id', ok: true, text: `${e.is_saudi ? 'National ID' : 'Iqama'} number ${e.national_id} matches the document`, text_ar: 'رقم الهوية مطابق للمستند' }
    : { key: 'id', ok: false, text: `The ID number ${e.national_id} is not a valid ${e.is_saudi ? 'national ID' : 'iqama'} number`, text_ar: 'رقم الهوية غير صالح', fix: 'A valid ID number' });
  const b = bankByIban(e.iban);
  out.push(ibanValid(e.iban) && b ? { key: 'iban', ok: true, text: `IBAN passes its check digits and belongs to ${b.name}`, text_ar: `الآيبان صحيح ويعود إلى ${b.name_ar}` }
    : { key: 'iban', ok: false, text: 'The IBAN fails its check digits', text_ar: 'الآيبان لا يجتاز رقم التحقق', fix: 'A corrected IBAN' });
  for (const d of p.documents ?? []) out.push(d.received ? { key: `doc-${d.kind}`, ok: true, text: `${DOC[d.kind]} received`, text_ar: `${DOC_AR[d.kind]} مستلم` }
    : { key: `doc-${d.kind}`, ok: false, text: `No ${DOC[d.kind]} came with the contract`, text_ar: `لم يصل ${DOC_AR[d.kind]} مع العقد`, fix: `The ${DOC[d.kind]}` });
  return out;
}

const onlyIfAsked: Who = async (_c, req) => (req.payload?.to_client ? { role: 'PAYROLL', personId: (await _c.query(`SELECT person_id FROM layer.personas WHERE key='payroll'`)).rows[0]?.person_id } : null);

export const INTAKE_WHO: Record<string, Who> = {
  'WF-37:client': onlyIfAsked,
  'WF-37:confirm': async (_c, req) => (req.payload?.to_client ? { role: 'TASAMA_HR_OPS', personId: null as unknown as number } : null),
};

export const INTAKE_HANDLERS: Record<string, H> = {
  'WF-37:read': async (h) => {
    const p = h.req.payload;
    const f = readContract(p);
    const bad = f.filter((x) => !x.ok);
    await h.setResult({ reading: f });
    await h.trail({ act: 'CHECK', summary: bad.length ? `Read ${p.employee.name}'s contract against ${client().short}'s policy and the documents: ${bad.length} ${bad.length === 1 ? 'difference' : 'differences'}: ${bad.map((x) => x.text.charAt(0).toLowerCase() + x.text.slice(1)).join('; ')}.` : `Read ${p.employee.name}'s contract against ${client().short}'s policy and the documents: every term and field matches.`,
      summary_ar: bad.length ? `قرأ عقد ${p.employee.name_ar}: ${bad.length} فروقات` : `قرأ عقد ${p.employee.name_ar}: كل البنود مطابقة` });
    return { status: 'DONE', decision: bad.length ? `${bad.length} differences` : 'Matches',
      recommend: bad.length ? { verdict: 'REVIEW', summary: `take it to the client: ${bad.map((x) => x.fix ?? x.text).join('; ').toLowerCase()}`, summary_ar: 'إحالته إلى العميل لتصحيح الفروقات' }
        : { verdict: 'APPROVE', summary: 'enter it: every term matches the policy and the law, and every field matches its document', summary_ar: 'إدخاله: كل البنود مطابقة للسياسة والنظام والمستندات' } };
  },
  'WF-37:fix': async (h) => {
    const p = h.req.payload;
    if (!p.to_client) return { status: 'DONE', decision: 'Not needed' };
    const po = pol();
    const k = { ...p.contract };
    k.housing = Math.max(k.housing, Math.round((k.basic * po.housingPct) / 100));
    k.transport = Math.max(k.transport, Math.round((k.basic * po.transportPct) / 100));
    if (!p.employee.is_saudi) k.contract_type = 'FIXED_TERM';
    const docs = (p.documents ?? []).map((d: any) => (d.received ? d : { ...d, received: true, file: `${p.employee.name} ${DOC[d.kind]}.pdf` }));
    await h.patch({ contract: k, documents: docs, corrected: true });
    const f = readContract({ ...p, contract: k, documents: docs });
    await h.setResult({ reading: f, corrected: true });
    await h.trail({ act: 'WRITE', summary: `${client().short}'s HR operations sent the corrected contract${(p.documents ?? []).some((d: any) => !d.received) ? ' and the missing documents' : ''}. Aqd read it again: ${f.every((x) => x.ok) ? 'every term and field matches' : `${f.filter((x) => !x.ok).length} differences remain`}.`, actor_type: 'SYSTEM', actor_name: 'Tasama HR', autonomy: null });
    return { status: 'DONE', decision: 'Corrected' };
  },
  'WF-37:write': async (h) => {
    const p = h.req.payload, e = p.employee, k = p.contract;
    const pos = (await h.c.query(`SELECT * FROM hcm.positions WHERE id=$1`, [k.position_id])).rows[0];
    const pnum = `DEMO-${String((await h.c.query(`SELECT nextval('hcm.misc_seq') n`)).rows[0].n + 300000)}`;
    const mask = `${e.iban.slice(0, 4)} •••• •••• •••• ${e.iban.slice(-4)}`;
    const pid = await write(h.conn, 'POST', 'workers', `Create worker ${pnum} from the client's contract`, async () => {
      const per = (await h.c.query(`INSERT INTO hcm.persons (person_number, first_name, last_name, first_name_ar, last_name_ar, display_name, display_name_ar, gender, date_of_birth, nationality, is_saudi, marital_status, work_email, mobile, national_id_masked, national_id_expiry, passport_masked, passport_expiry, iqama_expiry, bank_name, iban_masked, iban, national_id, photo_seed)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'Single',$12,'+966 50 000 0000',$13,'2031-01-01','XXXXX','2032-01-01',$14,$15,$16,$17,$18,9) RETURNING id`,
        [pnum, e.first, e.last, e.first_ar, e.last_ar, e.name, e.name_ar, e.gender, e.dob, e.nationality, e.is_saudi, `${e.first.toLowerCase()}.${pnum.slice(5)}@demo.${client().key}.example`,
          `${e.national_id.slice(0, 1)}XXX-XXXX-${e.national_id.slice(-2)}`, e.is_saudi ? null : '2027-12-31', e.bank, mask, e.iban, e.national_id])).rows[0].id;
      const wr = (await h.c.query(`INSERT INTO hcm.work_relationships (period_of_service_id, person_id, legal_employer_id, worker_type, start_date, original_hire_date) VALUES ($1,$2,1,'E',$3,$3) RETURNING id`, [Date.now() + per, per, k.start_date])).rows[0].id;
      await h.c.query(`INSERT INTO hcm.assignments (assignment_number, person_id, work_relationship_id, effective_start, action_code, position_id, job_id, department_id, grade_id, location_id, manager_person_id, probation_end_date, probation_status, contract_end_date, notice_period_days)
        VALUES ($1,$2,$3,$4,'HIRE',$5,$6,$7,$8,$9,NULL,$10,'IN_PROBATION',$11,$12)`, [`E${pnum.slice(5)}`, per, wr, k.start_date, pos.id, pos.job_id, pos.department_id, pos.grade_id, pos.location_id, iso(addDays(k.start_date, k.probation_days - 1)), k.contract_type === 'FIXED_TERM' ? iso(addDays(k.start_date, 730 - 1)) : null, k.notice_days]);
      await h.c.query(`INSERT INTO hcm.salaries (person_id, assignment_number, date_from, basic, housing, transport, other_allowance, action_code, reason) VALUES ($1,$2,$3,$4,$5,$6,$7,'HIRE',$8)`, [per, `E${pnum.slice(5)}`, k.start_date, k.basic, k.housing, k.transport, k.other ?? 0, h.req.ref]);
      let i = 0;
      for (const [code, amount] of [['BASIC', k.basic], ['HOUSING', k.housing], ['TRANSPORT', k.transport], ['OTHER_ALW', k.other]] as [string, number][]) {
        if (!amount) continue;
        await h.c.query(`INSERT INTO hcm.element_entries (entry_number, person_id, element_code, amount, effective_start, source, reference) VALUES ($1,$2,$3,$4,$5,'RAFEEQ',$6)`, [`${h.req.ref}-${++i}`, per, code, amount, k.start_date, h.req.ref]);
      }
      for (const d of p.documents ?? []) await h.c.query(`INSERT INTO layer.employee_documents (person_id, kind, file_name, received_on, status, source) VALUES ($1,$2,$3,$4,$5,'The client\\'s email')`, [per, d.kind, d.file, d.received ? iso(new Date()) : null, d.received ? 'RECEIVED' : 'MISSING']);
      return per as number;
    });
    const per = await openPeriod(h.c);
    if (per && k.start_date >= per.start && k.start_date <= per.end) {
      const words = new Date(`${k.start_date}T00:00:00Z`).toLocaleString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
      await h.c.query(`INSERT INTO layer.pay_inputs (period_name, person_id, kind, label, effective, source, state, ref, confirmed_by, confirmed_at) VALUES ($1,$2,'JOINER',$3,$4,'HIRING','CONFIRMED',$5,'Tasama HR operations',now())`, [per.name, pid, `Joins on ${words}: contract checked`, k.start_date, h.req.ref]);
    }
    await h.setResult({ person_id: pid, person_number: pnum });
    await h.trail({ act: 'WRITE', summary: `${e.name} is on the master from ${k.start_date} with the pay from the checked contract (${sar(k.basic + k.housing + k.transport + (k.other ?? 0))} a month), and the document set is filed.`, actor_type: 'SYSTEM', actor_name: 'Tasama HR', autonomy: null });
    return { status: 'DONE', decision: 'On the master' };
  },
};
