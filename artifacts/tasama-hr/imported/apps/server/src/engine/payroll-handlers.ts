/**
 * Step handlers for the payroll workflows (design/payroll-addendum.md §7),
 * merged into HANDLERS and WHO in handlers.ts.
 *
 * WF-26 Client policy: Nizam reads the handbook into a draft version; Tasama's
 * payroll lead recommends a reading for every unclear rule; the client's CHRO
 * activates; the platform makes the version active.
 */
import type { PoolClient } from 'pg';
import type { HCtx, Req, StepOutcome } from './core.js';
import type { StepDef } from '../domain/workflows.js';
import { client, iso } from '../domain/rules.js';
import { policiesFor } from '../domain/policies.js';
import { now } from '../clock.js';
import { readHandbook, dimensionName } from '../agents/nizam.js';
import { saveVersion, nextVersion, activeVersion, READINGS, RECOMMENDED } from '../payroll/policy.js';
import { readUpload, confirmMonth } from '../attendance/service.js';
import { applyAnswer } from '../payroll/checks.js';
import { prefill, applyMonth, priceLateChange, openPeriod, monthWord, nextPeriod } from '../payroll/inputs.js';
import { gosiContribution } from '../domain/payroll/gosi.js';
import { draftRun } from '../payroll/run.js';
import { external } from '../hcm/connector.js';
import { addDays, pol } from '../domain/rules.js';

type H = (h: HCtx) => Promise<StepOutcome>;
type Who = (c: PoolClient, req: Req, def: StepDef) => Promise<{ role: string; personId: number } | null>;

/** Tasama's payroll team is not on any client's HRMS: the case waits on the role, and the Payroll lens shows it. */
export const PAYROLL_WHO: Record<string, Who> = {
  TASAMA_PAYROLL_LEAD: async () => ({ role: 'TASAMA_PAYROLL_LEAD', personId: null as unknown as number }),
  TASAMA_PAYROLL: async () => ({ role: 'TASAMA_PAYROLL', personId: null as unknown as number }),
};

const flagWord = (f: string) => (f === 'BELOW_LAW' ? 'below the law' : f === 'UNCLEAR' ? 'unclear' : 'not in the handbook');

export const PAYROLL_HANDLERS: Record<string, H> = {
  'WF-26:read': async (h) => {
    const c = client();
    const reading = await readHandbook(c, { revised: Boolean(h.req.payload.revised), source: h.req.payload.source, useClaude: true });
    const version = await nextVersion(h.c);
    const id = await saveVersion(h.c, reading, { version, status: 'DRAFT', effective: h.req.payload.effective ?? iso(now()), requestId: h.req.id });
    await h.patch({ version_id: id, version });
    for (const r of reading.flagged) {
      await h.trail({ act: r.flag === 'BELOW_LAW' ? 'REFUSE' : 'CHECK', summary: `${r.label} (${dimensionName(r.dim).toLowerCase()}) is ${flagWord(r.flag!)}: ${r.flag_note}`, citation: r.clause ?? undefined });
    }
    const unclear = reading.flagged.filter((r) => r.flag === 'UNCLEAR');
    const below = reading.flagged.filter((r) => r.flag === 'BELOW_LAW');
    await h.trail({ act: 'CHECK', summary: `Read ${reading.clauses} clauses into ${reading.rules.length} rules on all ${reading.dims} dimensions: ${unclear.length} unclear, ${below.length} below the law, ${reading.flagged.length - unclear.length - below.length} not covered.` });
    await h.setResult({ reading: { version, rules: reading.rules.length, dims: reading.dims, clauses: reading.clauses, flagged: reading.flagged.map((r) => ({ key: r.key, dim: r.dim, label: r.label, label_ar: r.label_ar, flag: r.flag, note: r.flag_note, quote: r.quote, clause: r.clause, readings: READINGS[r.key] ?? null, recommended: RECOMMENDED[r.key] ?? null })), by: reading.by } });
    const rec = unclear[0] ? RECOMMENDED[unclear[0].key] : null;
    const choice = rec ? READINGS[unclear[0].key]?.find((x) => x.code === rec.code) : null;
    return {
      status: 'DONE', decision: `Draft version ${version}: ${reading.rules.length} rules`, outputs: { version, rules: reading.rules.length, flagged: reading.flagged.length },
      recommend: unclear.length && choice
        ? { verdict: 'REVIEW', summary: `read the ${unclear[0].label.toLowerCase()} as ${choice.label.toLowerCase()}: ${rec!.why}`, summary_ar: `قراءة ${unclear[0].label_ar} على أنها ${choice.label_ar}: ${rec!.why_ar}` }
        : { verdict: 'APPROVE', summary: 'every rule is clear; send it to the client for activation' },
    };
  },

  'WF-26:propose': async (h) => {
    const readings: Record<string, string> = h.req.payload.readings ?? {};
    const flagged: any[] = h.req.result.reading?.flagged ?? [];
    const lines: string[] = [];
    for (const f of flagged) {
      if (f.flag === 'UNCLEAR') {
        const code = readings[f.key] ?? RECOMMENDED[f.key]?.code;
        const ch = READINGS[f.key]?.find((x) => x.code === code);
        if (!ch) continue;
        await h.c.query(`UPDATE layer.policy_rules SET value=$3, num=$4, resolution=$5 WHERE version_id=$1 AND key=$2`, [h.req.payload.version_id, f.key, ch.value, ch.num, `Read as ${ch.label.toLowerCase()}`]);
        lines.push(`${f.label} read as ${ch.label.toLowerCase()}`);
      } else if (f.flag === 'BELOW_LAW') {
        await h.c.query(`UPDATE layer.policy_rules SET resolution=$3 WHERE version_id=$1 AND key=$2`, [h.req.payload.version_id, f.key, 'Refused: the law applies']);
        lines.push(`${f.label} refused; the law applies`);
      } else {
        await h.c.query(`UPDATE layer.policy_rules SET resolution=$3 WHERE version_id=$1 AND key=$2`, [h.req.payload.version_id, f.key, 'Ask the client before it is paid']);
      }
    }
    await h.patch({ readings_applied: lines });
    await h.trail({ act: 'PREPARE', summary: `Prepared version ${h.req.payload.version} for the client's decision${lines.length ? `: ${lines.join('; ')}` : ''}.` });
    return { status: 'DONE', recommend: { verdict: 'APPROVE', summary: `activate version ${h.req.payload.version}${lines.length ? `, with ${lines.join('; ')}, as Tasama's payroll lead recommends` : ''}` } };
  },

  'WF-29:read': async (h) => {
    const { summary } = await readUpload(h.c, h.req.payload.upload_id);
    await h.c.query(`UPDATE layer.attendance_uploads SET request_id=$2 WHERE id=$1`, [h.req.payload.upload_id, h.req.id]);
    const capped = summary.capped.length;
    await h.trail({ act: 'CHECK', summary: `Read ${Number(h.req.payload.rows).toLocaleString('en-US')} attendance records for ${summary.people} people: ${summary.lates} late arrivals and ${summary.noPunch} scheduled days with no attendance recorded, ${summary.leaveCovered} of them approved leave, so ${summary.absences} absences.` });
    if (capped) await h.trail({ act: 'CHECK', summary: `${capped === 1 ? 'One person\'s' : `${capped} people's`} lateness fines would pass five days' wage; they stop at the cap (Art. 70). Unpaid absence is kept apart: it is not a fine and has no cap.` });
    await h.setResult({ attendance: summary });
    return { status: 'DONE', decision: `${summary.fined} fines, ${summary.unpaidDays} unpaid days proposed`, outputs: summary,
      recommend: { verdict: 'APPROVE', summary: `confirm ${summary.fined} fines totalling SAR ${Math.round(summary.fines).toLocaleString('en-US')} and ${summary.unpaidDays} unpaid days, after reading each employee's explanation` } };
  },

  // ---------------------------------------------------------- WF-27 monthly inputs and cut-off (§17)
  'WF-27:prefill': async (h) => {
    const per = (await openPeriod(h.c))!;
    const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });
    const dayOf = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });
    if (h.req.type === 'LATE_CHANGE') {
      const p = h.req.payload;
      const v = await priceLateChange(h.c, p.person_id, p.effective, per);
      const next = nextPeriod(per.name);
      await h.c.query(`INSERT INTO layer.pay_inputs (period_name, person_id, kind, label, amount, effective, source, state, request_id, note) VALUES ($1,$2,'SALARY_CHANGE',$3,$4,$5,'LATE_CHANGE','NEXT_MONTH',$6,$7)`,
        [per.name, p.person_id, `${p.what}: SAR ${fmt(v.monthly)} a month more from ${dayOf(p.effective)}`, v.backPay, p.effective, h.req.id, `Entered ${dayOf(p.entered_on)}, after the cut-off on ${dayOf(per.cutoff)}`]);
      await h.patch({ ...v, period: per.name, next, cutoff: per.cutoff });
      await h.trail({ act: 'CHECK', summary: `${p.person_name}'s ${p.what.toLowerCase()} was entered on ${dayOf(p.entered_on)}, after ${monthWord(per.name)}'s cut-off on ${dayOf(per.cutoff)}. ${monthWord(per.name)}'s run stays as approved. The ${v.days} days of ${monthWord(per.name).split(' ')[0]} at the new pay are worth SAR ${fmt(v.backPay)}, paid as back pay with ${monthWord(next)}.` });
      return { status: 'DONE', decision: `SAR ${fmt(v.backPay)} back pay with ${monthWord(next)}`, outputs: v,
        recommend: { verdict: 'APPROVE', summary: `pay the SAR ${fmt(v.backPay)} with ${monthWord(next)}; nothing in ${monthWord(per.name).split(' ')[0]}'s approved run reopens` } };
    }
    const r = await prefill(h.c, h.req.id);
    await h.patch({ period: per.name, cutoff: per.cutoff, due: `${per.cutoff}T21:00:00Z` });
    await h.setResult({ month: { confirmed: r.confirmed, expected: r.expected } });
    await h.trail({ act: 'PREPARE', summary: `Listed ${r.confirmed + r.expected} changes for ${monthWord(per.name)}: ${r.confirmed} already confirmed through approved cases and HR events, ${r.expected} expected from HR operations before the cut-off on ${dayOf(per.cutoff)}.` });
    return { status: 'DONE', decision: `${r.expected} expected from the client`, outputs: r,
      recommend: { verdict: 'APPROVE', summary: r.expected ? `confirm the ${r.expected} expected ${r.expected === 1 ? 'line' : 'lines'} before the cut-off; ${r.expectedOt ? 'the overtime figures are last month\'s, to change if they differ' : 'nothing else is missing'}` : 'nothing is missing; confirm the month' } };
  },
  'WF-27:apply': async (h) => {
    const who = (await h.c.query(`SELECT pp.display_name n FROM layer.approvals a JOIN hcm.persons pp ON pp.id=a.approver_person_id WHERE a.request_id=$1 AND a.decision='APPROVED' ORDER BY a.decided_at DESC LIMIT 1`, [h.req.id])).rows[0]?.n ?? 'HR operations';
    const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (h.req.type === 'LATE_CHANGE') {
      const p = h.req.payload;
      await h.c.query(`INSERT INTO layer.pay_inputs (period_name, person_id, kind, label, amount, effective, source, state, request_id, confirmed_by, confirmed_at) VALUES ($1,$2,'BACK_PAY',$3,$4,$5,'LATE_CHANGE','CONFIRMED',$6,$7,now())`,
        [p.next, p.person_id, `Back pay for ${p.days} days of ${monthWord(p.period).split(' ')[0]}`, p.backPay, p.effective, h.req.id, who]);
      await h.c.query(`UPDATE layer.pay_inputs SET confirmed_by=$2, confirmed_at=now() WHERE request_id=$1 AND state='NEXT_MONTH'`, [h.req.id, who]);
      await h.trail({ act: 'WRITE', summary: `Booked SAR ${fmt(p.backPay)} of back pay for ${p.person_name} in ${monthWord(p.next)}, as ${who} agreed.`, actor_type: 'SYSTEM', actor_name: 'Tasama HR', autonomy: null });
      await h.setResult({ booked: { amount: p.backPay, period: p.next } });
      return { status: 'DONE', decision: `Back pay in ${monthWord(p.next)}` };
    }
    const r = await applyMonth(h.c, h.req.id, who, { values: h.req.payload.values, drop: h.req.payload.drop });
    await h.trail({ act: 'WRITE', summary: `Entered ${r.confirmed} confirmed overtime ${r.confirmed === 1 ? 'line' : 'lines'} (${fmt(r.hours)} hours) in ${monthWord(r.per.name)}${r.dropped ? `; ${r.dropped} dropped by ${who}` : ''}.`, actor_type: 'SYSTEM', actor_name: 'Tasama HR', autonomy: null });
    await h.setResult({ applied: { confirmed: r.confirmed, dropped: r.dropped, hours: r.hours } });
    return { status: 'DONE', decision: `${r.confirmed} confirmed` };
  },

  // ---------------------------------------------------------- WF-28 offer to contract to payroll (§17)
  'WF-28:draft': async (h) => {
    const p = h.req.payload;
    const po = pol();
    const person = (await h.c.query(`SELECT * FROM hcm.persons WHERE id=$1`, [p.person_id])).rows[0];
    const fixed = !person.is_saudi;
    const end = fixed ? addDays(new Date(`${p.start_date}T00:00:00Z`), 730 - 1).toISOString().slice(0, 10) : null;
    const leave = Math.max(21, po.annualLeave);
    const fields = {
      employer: client().name, employee: person.display_name, nationality: person.nationality, job: p.title, grade: p.grade, start_date: p.start_date, end_date: end,
      basic: Number(p.basic), housing: Number(p.housing), transport: Number(p.transport), other: Number(p.other_allowance ?? 0),
      probation_days: po.probationDays, weekly_hours: po.weeklyHours, annual_leave: leave, notice_days: 30, contract_type: fixed ? 'FIXED_TERM' : 'INDEFINITE',
    };
    const wage = fields.basic + fields.housing + fields.transport + fields.other;
    const sar = (n: number) => `SAR ${n.toLocaleString('en-US')}`;
    const body = [
      `Employment contract between ${fields.employer} (the employer) and ${fields.employee} (the employee).`,
      `1. Position. ${fields.job}, grade ${fields.grade}, from ${fields.start_date}.`,
      `2. Term. ${fixed ? `A fixed term of two years, to ${end}, as the law requires for a non-Saudi employee (Art. 37).` : 'An indefinite term (Art. 55).'}`,
      `3. Pay. A monthly wage of ${sar(wage)}: basic ${sar(fields.basic)}, housing ${sar(fields.housing)}, transport ${sar(fields.transport)}${fields.other ? `, other ${sar(fields.other)}` : ''}, paid through the wage protection system.`,
      `4. Probation. ${fields.probation_days} days (Art. 53).`,
      `5. Hours. ${fields.weekly_hours} hours a week; overtime under the employer's policy and Art. 107.`,
      `6. Leave. ${fields.annual_leave} days of paid annual leave a year (Art. 109).`,
      `7. Notice. ${fields.notice_days} days, by either party, in writing (Art. 75).`,
      '8. Social insurance. The employee is registered with GOSI from the start date.',
      '9. Governing law. The Saudi Labor Law. The contract is documented on Qiwa.',
    ].join('\n');
    const num = `DEMO-CTR-${new Date().getUTCFullYear()}-${String((await h.c.query(`SELECT nextval('hcm.misc_seq') n`)).rows[0].n).padStart(4, '0')}`;
    await h.c.query(`INSERT INTO layer.contracts (contract_number, person_id, offer_number, request_id, contract_type, fields, body, status) VALUES ($1,$2,$3,$4,$5,$6,$7,'DRAFTED')`, [num, p.person_id, p.offer_number, h.req.id, fields.contract_type, JSON.stringify(fields), body]);
    await h.patch({ contract_number: num, contract: fields, body, wage });
    await h.trail({ act: 'PREPARE', summary: `Drafted ${num} from the accepted offer: ${sar(wage)} a month from ${fields.start_date}, ${fixed ? 'a two-year fixed term (Art. 37)' : 'indefinite (Art. 55)'}, ${fields.probation_days} days' probation, ${fields.annual_leave} days' leave. Every pay term is the offer's.` });
    return { status: 'DONE', decision: num, outputs: fields, recommend: { verdict: 'APPROVE', summary: 'send it for signature: every pay term is the accepted offer\'s, and the rest follows the policy and the law' } };
  },
  'WF-28:sign': async (h) => {
    const p = h.req.payload;
    if (p.start_date_new && p.start_date_new !== p.start_date) await h.patch({ start_date: p.start_date_new });
    await external(h.conn, 'QIWA', 'POST', '/qiwa/contracts', `Send ${p.contract_number} to the employee to accept`);
    await h.c.query(`UPDATE layer.contracts SET status='SIGNED', sent_at=now(), signed_at=now() WHERE contract_number=$1`, [p.contract_number]);
    await h.trail({ act: 'WRITE', summary: `${p.contract.employee} accepted ${p.contract_number} on Qiwa.`, actor_type: 'SYSTEM', actor_name: 'Qiwa', autonomy: null });
    return { status: 'DONE', decision: 'Signed' };
  },
  'WF-28:hire': async (h) => {
    const p = h.req.payload;
    const start = p.start_date;
    await h.c.query(`UPDATE hcm.work_relationships SET worker_type='E', start_date=$2, original_hire_date=$2 WHERE person_id=$1`, [p.person_id, start]);
    await h.c.query(`UPDATE hcm.assignments SET effective_start=$2 WHERE person_id=$1 AND action_code='HIRE'`, [p.person_id, start]);
    await h.c.query(`UPDATE hcm.salaries SET date_from=$2 WHERE person_id=$1 AND action_code='HIRE'`, [p.person_id, start]);
    const k = p.contract;
    const n = (await h.c.query(`SELECT count(*)::int n FROM hcm.element_entries WHERE person_id=$1`, [p.person_id])).rows[0].n;
    let i = n;
    for (const [code, amount] of [['BASIC', k.basic], ['HOUSING', k.housing], ['TRANSPORT', k.transport], ['OTHER_ALW', k.other]] as [string, number][]) {
      if (!amount) continue;
      await h.c.query(`INSERT INTO hcm.element_entries (entry_number, person_id, element_code, amount, effective_start, source, reference) VALUES ($1,$2,$3,$4,$5,'RAFEEQ',$6)`, [`${p.contract_number}-${++i}`, p.person_id, code, amount, start, p.contract_number]);
    }
    const per = (await openPeriod(h.c))!;
    const startWords = new Date(`${start}T00:00:00Z`).toLocaleString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    const upd = await h.c.query(`UPDATE layer.pay_inputs SET state='CONFIRMED', label=$2, confirmed_by='Contract signed', confirmed_at=now(), ref=$3 WHERE person_id=$1 AND kind='JOINER' AND period_name=$4`, [p.person_id, `Joins on ${startWords}: contract signed`, p.contract_number, per.name]);
    if (!upd.rowCount && start >= per.start && start <= per.end) await h.c.query(`INSERT INTO layer.pay_inputs (period_name, person_id, kind, label, effective, source, state, ref, confirmed_by, confirmed_at) VALUES ($1,$2,'JOINER',$3,$4,'HIRING','CONFIRMED',$5,'Contract signed',now())`, [per.name, p.person_id, `Joins on ${startWords}: contract signed`, start, p.contract_number]);
    await h.trail({ act: 'WRITE', summary: `${k.employee}'s pending record became the employee record from ${start}, with the pay from ${p.contract_number}. Nothing was entered again.`, actor_type: 'SYSTEM', actor_name: 'Tasama HR', autonomy: null });
    return { status: 'DONE', decision: 'Employee from the start date' };
  },
  'WF-28:gosi': async (h) => {
    const p = h.req.payload;
    const person = (await h.c.query(`SELECT * FROM hcm.persons WHERE id=$1`, [p.person_id])).rows[0];
    const per = (await openPeriod(h.c))!;
    const prior = (await h.c.query(`SELECT first_registered FROM hcm.gosi_registrations WHERE person_id=$1`, [p.person_id])).rows[0];
    const first = prior ? String(prior.first_registered instanceof Date ? prior.first_registered.toISOString() : prior.first_registered).slice(0, 10) : p.start_date;
    if (!prior) await h.c.query(`INSERT INTO hcm.gosi_registrations (person_id, first_registered, system, source) VALUES ($1,$2,$3,'THIS_EMPLOYER')`, [p.person_id, first, first >= '2024-07-03' ? 'NEW' : 'LEGACY']);
    const g = gosiContribution(p.contract.basic + p.contract.housing, person.is_saudi, first, per.end);
    const n = (await h.c.query(`SELECT count(*)::int n FROM hcm.element_entries WHERE person_id=$1`, [p.person_id])).rows[0].n;
    if (g.employee > 0) await h.c.query(`INSERT INTO hcm.element_entries (entry_number, person_id, element_code, amount, effective_start, source, reference) VALUES ($1,$2,'GOSI_EE',$3,$4,'RAFEEQ','GOSI registration')`, [`GOSI-${p.person_id}-${n + 1}`, p.person_id, g.employee, p.start_date]);
    await h.c.query(`INSERT INTO hcm.element_entries (entry_number, person_id, element_code, amount, effective_start, source, reference) VALUES ($1,$2,'GOSI_ER',$3,$4,'RAFEEQ','GOSI registration')`, [`GOSI-${p.person_id}-${n + 2}`, p.person_id, g.employer, p.start_date]);
    await external(h.conn, 'GOSI', 'POST', '/gosi/employer/registrations', `Register ${person.display_name} from ${p.start_date}`);
    const pct = (x: number) => `${Math.round(x * 10000) / 100}%`;
    const group = person.is_saudi ? (prior ? `first registered ${first}, so the rate of a registration before July 2024` : 'a first registration from July 2024, so the new-system rate') : 'a non-Saudi, so occupational hazards only';
    await h.trail({ act: 'WRITE', summary: `Registered ${person.display_name} with GOSI from ${p.start_date}: ${group}, ${pct(g.eeRate)} employee and ${pct(g.erRate)} employer on SAR ${g.wage.toLocaleString('en-US')}.` });
    const d = await draftRun(h.c);
    const row = d?.rows.find((r) => r.person_id === p.person_id);
    if (row) await h.setResult({ first_pay: { period: per.name, days: row.pay_days, gross: row.gross, net: row.net, flags: row.flags.length } });
    return { status: 'DONE', decision: row ? `${row.pay_days} days paid in ${monthWord(per.name)}` : 'Registered', outputs: { rate: g.eeRate, employer: g.erRate } };
  },

  // WF-36: the client's answer to a check on the draft run becomes entries in the open month (§16).
  'WF-36:apply': async (h) => {
    const who = (await h.c.query(`SELECT pp.display_name n FROM layer.approvals a JOIN hcm.persons pp ON pp.id=a.approver_person_id WHERE a.request_id=$1 AND a.decision='APPROVED' ORDER BY a.decided_at DESC LIMIT 1`, [h.req.id])).rows[0]?.n ?? 'HR operations';
    const summary = await applyAnswer(h.c, h.req as any, who);
    await h.trail({ act: 'WRITE', summary: `${summary} The draft run recalculates.`, actor_type: 'SYSTEM', actor_name: 'Tasama HR', autonomy: null });
    await h.setResult({ answered: summary });
    return { status: 'DONE', decision: summary };
  },

  'WF-29:apply': async (h) => {
    const pl = h.req.payload;
    const r = await confirmMonth(h.c, pl.upload_id, 'HR operations', { reject: pl.reject ?? [], waive: pl.waive ?? [], excuseAbsence: pl.excuse_absence ?? [] });
    // Name the person who confirmed, not only the role.
    const who = (await h.c.query(`SELECT pp.display_name n FROM layer.approvals a JOIN hcm.persons pp ON pp.id=a.approver_person_id WHERE a.request_id=$1 AND a.decision='APPROVED' ORDER BY a.decided_at DESC LIMIT 1`, [h.req.id])).rows[0]?.n ?? 'HR operations';
    const names = async (ids: number[]) => (await h.c.query(`SELECT string_agg(display_name, ', ') n FROM hcm.persons WHERE id = ANY($1::int[])`, [ids])).rows[0].n;
    await h.c.query(`UPDATE layer.pay_inputs SET state='CONFIRMED', confirmed_by=$1, confirmed_at=now(), label='The attendance month: unpaid days and lateness fines, confirmed', ref=$2 WHERE kind='ATTENDANCE' AND state='EXPECTED'`, [who, h.req.ref]);
    if (pl.waive?.length) await h.trail({ act: 'DECIDE', summary: `${who} waived the lateness fine for ${await names(pl.waive)}.`, actor_type: 'HUMAN', actor_name: `${who}, HR operations`, autonomy: null });
    if (pl.excuse_absence?.length) await h.trail({ act: 'DECIDE', summary: `${who} excused the absence of ${await names(pl.excuse_absence)}.`, actor_type: 'HUMAN', actor_name: `${who}, HR operations`, autonomy: null });
    if (pl.reject?.length) await h.trail({ act: 'DECIDE', summary: `${who} did not accept ${pl.reject.length} explanation${pl.reject.length === 1 ? '' : 's'}; the fine stands for those days.`, actor_type: 'HUMAN', actor_name: `${who}, HR operations`, autonomy: null });
    await h.trail({ act: 'WRITE', summary: `Entered ${r.summary.unpaidDays} unpaid days and SAR ${Math.round(r.summary.fines).toLocaleString('en-US')} of fines for ${r.entries} people in the ${r.period} payroll month; ${r.summary.excused} day${r.summary.excused === 1 ? '' : 's'} excused.`, actor_type: 'SYSTEM', actor_name: 'Tasama HR', autonomy: null });
    const prior = h.req.result.attendance ?? {};
    await h.setResult({ attendance: { ...prior, ...r.summary, explained: prior.explained ?? r.summary.excused, explanations: prior.explanations ?? [] }, applied: r.period });
    return { status: 'DONE', decision: `Entered in ${r.period}` };
  },

  'WF-26:apply': async (h) => {
    const prev = await activeVersion(h.c);
    if (prev) await h.c.query(`UPDATE layer.policy_versions SET status='SUPERSEDED' WHERE id=$1`, [prev.id]);
    const chro = (await h.c.query(`SELECT a.approver_person_id, p.display_name FROM layer.approvals a LEFT JOIN hcm.persons p ON p.id=a.approver_person_id WHERE a.request_id=$1 AND a.step_key='activate' ORDER BY a.id DESC LIMIT 1`, [h.req.id])).rows[0];
    await h.c.query(`UPDATE layer.policy_versions SET status='ACTIVE', activated_by=$2, activated_at=$3 WHERE id=$1`, [h.req.payload.version_id, chro?.display_name ?? 'Client CHRO', now()]);
    if (h.req.payload.revised) {
      // The assistants answer from the revised handbook from now on.
      for (const p of policiesFor(client(), true)) for (const k of p.clauses) await h.c.query(`UPDATE layer.policy_clauses SET text_en=$2, text_ar=$3 WHERE id=$1`, [`${p.id} §${k.ref}`, k.en, k.ar]);
    }
    await h.trail({ act: 'WRITE', summary: `Version ${h.req.payload.version} is active for payroll and the assistants${prev ? `; version ${prev.version} is kept for the record` : ''}.`, actor_type: 'SYSTEM', actor_name: 'Tasama HR', autonomy: null });
    await h.setResult({ active_version: h.req.payload.version });
    return { status: 'DONE', decision: `Version ${h.req.payload.version} active` };
  },
};
