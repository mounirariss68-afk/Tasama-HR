/**
 * Go-live (design/payroll-addendum.md §13, §19, WF-24): once the payroll lead approves, the staged client
 * becomes a Tasama HR client like the other five. Its schemas are created and the master is written from
 * what the lanes read. The client's issues become cases for its HR operations, and its first month opens.
 *
 * Every figure comes from the staging area: the roster, the six months as paid, the policy as read,
 * leave as tracked and the provisions as the platform calculates them. Reset removes the client again.
 */
import type { PoolClient } from 'pg';
import { pool, withClient, insertMany } from '../db.js';
import { registerClient, unregisterClient, clientByKey, isSeedClient, slasFor, type ClientConfig } from '../domain/clients.js';
import { PAYROLL_POLICY, type PayrollPolicy } from '../domain/payroll-policy.js';
import { GRADES, ELEMENT_TYPES, ABSENCE_TYPES } from '../domain/org.js';
import { NATIONALITY_NAME } from '../domain/names.js';
import { AGENTS } from '../domain/agents.js';
import { WORKFLOWS } from '../domain/workflows.js';
import { gosiContribution, NEW_SYSTEM_FROM } from '../domain/payroll/gosi.js';
import type { Policy } from '../domain/policies.js';
import { readHandbook } from '../agents/nizam.js';
import { saveVersion } from '../payroll/policy.js';
import { startCase } from '../engine/core.js';
import { personasFor } from '../seed/layer.js';
import { schemaFor } from '../seed/index.js';
import { resetPersonas } from '../api/session.js';
import type { Issue } from './lanes.js';

const DAY = 86_400_000;
const d10 = (d: Date) => d.toISOString().slice(0, 10);
const r2 = (n: number) => Math.round(n * 100) / 100;
const monthEnd = (m: string) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10);
const dayIn = (m: string, day: number) => `${m}-${String(Math.min(day, Number(monthEnd(m).slice(8)))).padStart(2, '0')}`;
const nextMonth = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 7);
const ISO_OF = Object.fromEntries(Object.entries(NATIONALITY_NAME).map(([k, [en]]) => [en.toLowerCase(), k]));
const mask = (iban: string, ok: boolean) => (ok ? `${iban.replace(/\s/g, '').slice(0, 4)} •••• •••• •••• ${iban.replace(/\s/g, '').slice(-4)}` : 'SA•• FAILS CHECK DIGITS');
const monthWord = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Drops a client that was taken on from its files: its schemas, its Tasama rows and its registration. */
export async function dropClient(key: string) {
  if (isSeedClient(key)) throw new Error('A seeded client is not removed this way.');
  await pool.query(`DROP SCHEMA IF EXISTS hcm_${key} CASCADE; DROP SCHEMA IF EXISTS layer_${key} CASCADE;`);
  for (const t of ['sla_defs', 'allocations', 'trail', 'escalations', 'invoices', 'payroll_runs', 'csat']) await pool.query(`DELETE FROM tasama.${t} WHERE client_key=$1`, [key]).catch(() => {});
  await pool.query(`DELETE FROM tasama.onboarding WHERE client_key=$1`, [key]).catch(() => {});
  await pool.query(`DELETE FROM tasama.clients WHERE key=$1`, [key]).catch(() => {});
  unregisterClient(key);
  delete PAYROLL_POLICY[key];
  resetPersonas();
}

/** Every client in schemas that the seed did not create: dropped by Reset before the seed runs again. */
export async function dropOnboardedSchemas() {
  const rows = (await pool.query(`SELECT nspname FROM pg_namespace WHERE nspname ~ '^(hcm|layer)_[a-z]+$'`)).rows as { nspname: string }[];
  for (const r of rows) { const key = r.nspname.replace(/^(hcm|layer)_/, ''); if (!isSeedClient(key)) await pool.query(`DROP SCHEMA IF EXISTS ${r.nspname} CASCADE`); }
  unregisterClient();
}

/** At start-up: the clients taken on before the server last stopped. */
export async function restoreOnboarded() {
  const rows = (await pool.query(`SELECT config FROM tasama.clients WHERE config IS NOT NULL`).catch(() => ({ rows: [] as any[] }))).rows;
  for (const r of rows) { registerClient(r.config.client); PAYROLL_POLICY[r.config.client.key] = r.config.pay; }
}

export async function goLive(id: number, approver: string) {
  const o = (await pool.query(`SELECT * FROM tasama.onboarding WHERE id=$1`, [id])).rows[0];
  if (!o || o.state !== 'STAGED') throw new Error('Only a client that has been read and not yet taken on can go live.');
  const st = { ...o.staged, issues: o.issues };
  const key: string = st.client.key;
  if (clientByKey(key)) throw new Error(`${st.client.name} is already a Tasama client.`);
  const anchor = new Date(`${d10(new Date())}T00:00:00Z`);
  const open = nextMonth(anchor);
  const params = { ...st.policy.params, probationDays: Math.min(180, st.policy.params.probationDays) };
  const cfg: ClientConfig = {
    ...st.config, policy: params, size: st.roster.length,
    contract: { model: 'Payroll managed service', model_ar: 'خدمة الرواتب المُدارة', services: ['PAYROLL'], pepm: 110, perHire: 0, start: `${open}-01`, term: 24, phase: 'BUILD', creditCapPct: 8 },
    bank: [st.client.bank, st.client.bank],
  };
  const pay: PayrollPolicy = st.policy.pay;
  registerClient(cfg);
  PAYROLL_POLICY[key] = pay;
  try {
    await pool.query(schemaFor(key));
    const out = await withClient(key, async () => {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const r = await writeMaster(c, cfg, st, anchor, open, approver);
        await c.query('COMMIT');
        return r;
      } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); }
    });
    await pool.query(`INSERT INTO tasama.clients (key, code, name, name_ar, short, sector, sector_ar, city, city_ar, hrms, hrms_label, model, model_ar, services, pepm, per_hire, contract_start, contract_end, phase, credit_cap_pct, nitaqat, sort, config, onboarded_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23, now())`,
      [cfg.key, cfg.code, cfg.name, cfg.name_ar, cfg.short, cfg.sector, cfg.sector_ar, cfg.city, cfg.city_ar, cfg.hrms, cfg.hrmsLabel, cfg.contract.model, cfg.contract.model_ar, cfg.contract.services, cfg.contract.pepm, 0,
        cfg.contract.start, d10(new Date(Date.UTC(Number(open.slice(0, 4)) + 2, Number(open.slice(5, 7)) - 1, 0))), cfg.contract.phase, cfg.contract.creditCapPct, JSON.stringify(cfg.nitaqat), 10, JSON.stringify({ client: cfg, pay })]);
    await insertMany(pool, 'tasama.sla_defs', slasFor(cfg).map((s) => ({ client_key: cfg.key, key: s.key, label: s.label, label_ar: s.label_ar, target: s.target, credit_pct: s.creditPct })));
    await pool.query(`INSERT INTO tasama.trail (client_key, actor_type, actor_id, actor_name, act, autonomy, summary, summary_ar, ref) VALUES ($1,'HUMAN','tasama-lead',$2,'DECIDE',NULL,$3,$4,NULL), ($1,'SYSTEM','tasama-hr','Tasama HR','WRITE',NULL,$5,$6,NULL)`,
      [key, `${approver}, Tasama`, `${approver} took ${cfg.name} on from ${monthWord(open)}.`, `اعتمدت ${approver} انتقال ${cfg.name_ar} اعتباراً من ${monthWord(open)}.`,
        `${cfg.name}'s master written to Tasama HR: ${out.people} employees, ${out.months} months as paid, the policy read by Nizam; ${out.cases} issues sent to its HR operations; ${monthWord(open)} opened.`,
        `كُتبت بيانات ${cfg.name_ar} في Tasama HR وفُتح شهر ${monthWord(open)}.`]);
    await pool.query(`UPDATE tasama.onboarding SET state='LIVE', live_at=now() WHERE id=$1`, [id]);
    resetPersonas();
    return { key, ...out, month: open };
  } catch (e) {
    await pool.query(`DROP SCHEMA IF EXISTS hcm_${key} CASCADE; DROP SCHEMA IF EXISTS layer_${key} CASCADE;`).catch(() => {});
    unregisterClient(key); delete PAYROLL_POLICY[key];
    throw e;
  }
}

async function writeMaster(c: PoolClient, cfg: ClientConfig, st: any, anchor: Date, open: string, approver: string) {
  const P = cfg.policy;
  const roster: any[] = st.roster, leavers: any[] = st.leavers;
  const letters: any[] = st.letters.filter((l: any) => l.kind === 'PROMOTION');
  const promoOf = (no: string) => letters.find((l: any) => l.no === no && l.effective && l.from != null);

  /* ----- structures ----- */
  const [le] = await insertMany(c, 'hcm.legal_employers', [{ code: cfg.code, name: st.client.legal, name_ar: st.client.legal_ar || cfg.name_ar, country: 'SA', mol_establishment_no: st.client.gosiEstablishment ?? 'Not given', payroll_statutory_unit: `${cfg.code}-PSU` }], 'id');
  const locNames = [...new Set([...roster.map((x) => x.location || 'Head office'), ...leavers.map(() => roster[0]?.location || 'Head office')])];
  const locs = await insertMany(c, 'hcm.locations', locNames.map((n, i) => ({ code: `${cfg.code}-L${i + 1}`, name: n, name_ar: n, region: n })), 'id, name');
  const locId = (n: string) => (locs.find((l: any) => l.name === n) ?? locs[0]).id as number;
  const grades = await insertMany(c, 'hcm.grades', GRADES.map((g) => ({ code: g.code, rank: g.rank, min_basic: g.min, mid_basic: r2((g.min + g.max) / 2), max_basic: g.max, annual_leave_days: P.annualLeave, notice_days: g.notice })), 'id, code');
  const gradeId = (code: string) => (grades.find((g: any) => g.code === code) ?? grades[0]).id as number;
  const deptNames = [...new Set([...roster.map((x) => x.dept), ...leavers.map((x) => x.dept)])].filter(Boolean);
  const depts = await insertMany(c, 'hcm.departments', deptNames.map((n, i) => ({ code: `${cfg.code}-D${String(i + 1).padStart(2, '0')}`, name: n, name_ar: n, division: n, division_ar: n, parent_id: null, cost_center: `CC-${cfg.code}-${100 + i}` })), 'id, name');
  const deptId = (n: string) => (depts.find((d: any) => d.name === n) ?? depts[0]).id as number;
  const titles = [...new Set([...roster.map((x) => `${x.dept}|${x.position}`), ...leavers.map((x) => `${x.dept}|${x.position}`)])];
  const rankOf = (g: string) => Number(String(g).slice(1)) || 6;
  const gradeOfTitle = new Map(titles.map((t) => [t, roster.find((x) => `${x.dept}|${x.position}` === t)?.grade ?? leavers.find((x) => `${x.dept}|${x.position}` === t)?.grade ?? 'G06']));
  const jobs = await insertMany(c, 'hcm.jobs', titles.map((t, i) => { const [d, p] = t.split('|'); const rk = rankOf(gradeOfTitle.get(t)); return { code: `${cfg.code}-J${String(i + 1).padStart(3, '0')}`, name: p, name_ar: p, family: d, family_ar: d, level: rk >= 12 ? 'Executive' : rk >= 10 ? 'Manager' : 'Professional', skilled: rk >= 5 }; }), 'id, code');
  const jobId = (dept: string, pos: string) => jobs[titles.indexOf(`${dept}|${pos}`)].id as number;

  /* ----- people ----- */
  const everyone = [...roster.map((x) => ({ ...x, left: null as string | null })),
    ...leavers.map((x) => ({ no: x.no, name: x.name, name_ar: x.name_ar, nationalId: x.nationalId, nationality: x.nationality, isSaudi: /^saudi$/i.test(x.nationality), gender: x.gender, marital: '', dependants: 0, birth: x.birth, idExpiry: null, passport: '', passportExpiry: null, mobile: '', email: '',
      dept: x.dept, location: roster[0]?.location ?? '', position: x.position, grade: x.grade, managerNo: '', hire: x.hire, probationEnd: null, contractType: 'Indefinite', contractStart: x.hire, contractEnd: null,
      basic: 0, housing: 0, transport: 0, other: 0, bank: '', iban: '', gosiFirst: x.hire, leaveEntitlement: P.annualLeave, education: '', project: '', held: null, left: x.lastDay, reason: x.reason }))];
  const posRows = await insertMany(c, 'hcm.positions', everyone.map((x, i) => ({ code: `${cfg.code}-POS-${String(i + 1).padStart(4, '0')}`, name: x.position, name_ar: x.position, job_id: jobId(x.dept, x.position), department_id: deptId(x.dept), location_id: locId(x.location), grade_id: gradeId(x.grade),
    fte: 1, headcount: 1, budget_status: 'BUDGETED', status: 'ACTIVE', hiring_status: x.left ? 'VACANT' : 'FILLED', annual_budget: null, effective_start: x.hire })), 'id');
  const split = (s: string) => { const i = s.indexOf(' '); return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)]; };
  const seed = (s: string) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 9973, 7);
  const personRows = everyone.map((x) => {
    const [f, l] = split(x.name), [fa, la] = split(x.name_ar || x.name);
    return {
      person_number: x.no, first_name: f, last_name: l, first_name_ar: fa, last_name_ar: la, display_name: x.name, display_name_ar: x.name_ar || x.name, gender: x.gender === 'F' ? 'F' : 'M',
      date_of_birth: x.birth ?? '1990-01-01', nationality: ISO_OF[String(x.nationality).toLowerCase()] ?? 'SA', is_saudi: x.isSaudi, marital_status: x.marital || 'Single',
      work_email: x.email || `${f.toLowerCase()}.${x.no.toLowerCase()}@${cfg.key}.example`, mobile: x.mobile || '—',
      national_id_masked: `${String(x.nationalId).slice(0, 1) || 'X'}XXXXXX${String(x.nationalId).slice(-3)}`, national_id_expiry: x.idExpiry ?? d10(new Date(anchor.getTime() + 730 * DAY)),
      passport_masked: x.passport ? `${String(x.passport).slice(0, 1)}XXXX${String(x.passport).slice(-3)}` : 'X', passport_expiry: x.passportExpiry ?? x.idExpiry ?? d10(new Date(anchor.getTime() + 1460 * DAY)),
      iqama_expiry: x.isSaudi ? null : x.idExpiry, bank_name: x.bank || '—', iban_masked: x.iban ? mask(x.iban, x.held !== 'IBAN_CHECK') : '—', photo_seed: seed(x.no),
    };
  });
  const ids = await insertMany(c, 'hcm.persons', personRows, 'id');
  const pid = new Map<string, number>(everyone.map((x, i) => [x.no, ids[i].id as number]));
  // The roster's line manager numbers are the master data's; a duplicated number points at its owner.
  const byMaster = new Map<string, number>(roster.filter((x) => x.no === x.masterNo).map((x) => [x.masterNo, pid.get(x.no)!]));
  const managerOf = (x: any) => (x.managerNo ? byMaster.get(x.managerNo) ?? pid.get(x.managerNo) ?? null : null);
  for (const d of deptNames) {
    const inD = roster.filter((x) => x.dept === d).sort((a, b) => rankOf(b.grade) - rankOf(a.grade));
    if (inD[0]) await c.query(`UPDATE hcm.departments SET manager_person_id=$1 WHERE id=$2`, [pid.get(inD[0].no), deptId(d)]);
  }

  /* ----- employment, assignments, salaries ----- */
  let pos = 500_000_000_001;
  const wr = await insertMany(c, 'hcm.work_relationships', everyone.map((x) => ({ period_of_service_id: pos++, person_id: pid.get(x.no), legal_employer_id: le.id, worker_type: 'E', start_date: x.hire, original_hire_date: x.hire,
    end_date: x.left, notified_termination_date: x.left ? d10(new Date(Date.parse(x.left) - 30 * DAY)) : null, last_working_day: x.left, termination_action: x.left ? 'RESIGNATION' : null, termination_reason: x.left ? x.reason ?? 'Resignation' : null, rehire_eligible: x.left ? true : null })), 'id, person_id');
  const wrOf = new Map(wr.map((w: any) => [w.person_id, w.id]));
  const asg: any[] = [], sal: any[] = [];
  const pctOf = (b: number, p: number) => Math.round(b * p / 100);
  everyone.forEach((x, i) => {
    const id = pid.get(x.no)!, n = `E${x.no.replace(/\D/g, '')}`;
    const pr = promoOf(x.no);
    const probEnd = x.probationEnd ?? d10(new Date(Date.parse(x.hire) + Math.min(180, P.probationDays) * DAY));
    const base = { assignment_number: n, person_id: id, work_relationship_id: wrOf.get(id), effective_sequence: 1, position_id: posRows[i].id, job_id: jobId(x.dept, x.position), department_id: deptId(x.dept), location_id: locId(x.location),
      manager_person_id: managerOf(x), assignment_status: 'ACTIVE', probation_end_date: probEnd, probation_status: probEnd <= d10(anchor) ? 'CONFIRMED' : 'IN_PROBATION',
      contract_type: /fixed/i.test(x.contractType) ? 'FIXED_TERM' : 'INDEFINITE', contract_end_date: x.contractEnd, notice_period_days: rankOf(x.grade) >= 11 ? P.seniorNoticeDays : 30, working_hours: P.weeklyHours };
    const end = x.left ?? '4712-12-31';
    if (pr) {
      const before = d10(new Date(Date.parse(pr.effective) - DAY));
      asg.push({ ...base, effective_start: x.hire, effective_end: before, action_code: 'HIRE', action_reason: 'Taken on from the client\'s files', grade_id: gradeId(pr.fromGrade ?? x.grade) });
      asg.push({ ...base, effective_start: pr.effective, effective_end: end, action_code: 'PROMOTION', action_reason: 'Promotion letter in the client\'s files', grade_id: gradeId(pr.toGrade ?? x.grade) });
      sal.push({ person_id: id, assignment_number: n, date_from: x.hire, date_to: before, basic: pr.from, housing: pctOf(pr.from, P.housingPct), transport: pctOf(pr.from, P.transportPct), other_allowance: 0, currency: 'SAR', action_code: 'HIRE', reason: 'Contract' });
      sal.push({ person_id: id, assignment_number: n, date_from: pr.effective, date_to: '4712-12-31', basic: x.basic, housing: x.housing, transport: x.transport, other_allowance: x.other, currency: 'SAR', action_code: 'PROMOTION', reason: 'Promotion letter' });
    } else {
      asg.push({ ...base, effective_start: x.hire, effective_end: end, action_code: 'HIRE', action_reason: 'Taken on from the client\'s files', grade_id: gradeId(x.grade) });
      if (!x.left) sal.push({ person_id: id, assignment_number: n, date_from: x.hire, date_to: '4712-12-31', basic: x.basic, housing: x.housing, transport: x.transport, other_allowance: x.other, currency: 'SAR', action_code: 'HIRE', reason: 'Master data' });
    }
  });
  await insertMany(c, 'hcm.assignments', asg);
  await insertMany(c, 'hcm.salaries', sal);
  await insertMany(c, 'hcm.end_of_service', everyone.map((x) => ({ person_id: pid.get(x.no), basis: 'GRATUITY', enrolled_date: x.hire, fund_name: null, contributions_to_date: null })));
  // GOSI: the date in the master data. A Saudi without one is not registered until the date is given.
  const regs = everyone.filter((x) => x.gosiFirst).map((x) => ({ person_id: pid.get(x.no), first_registered: x.gosiFirst, system: x.isSaudi && x.gosiFirst >= NEW_SYSTEM_FROM ? 'NEW' : 'LEGACY', source: 'THIS_EMPLOYER' }));
  await insertMany(c, 'hcm.gosi_registrations', regs);

  /* ----- elements: the pay as it stands, and what the history owes ----- */
  await insertMany(c, 'hcm.element_types', ELEMENT_TYPES.map(([code, name, name_ar, classification, recurring]) => ({ code, name, name_ar, classification, recurring })));
  const ee: any[] = [];
  let en = 1;
  const entry = (person: number, code: string, amount: number, from: string, to = '4712-12-31', reference: string | null = null) => ee.push({ entry_number: `${cfg.code}-EE-${String(en++).padStart(6, '0')}`, person_id: person, element_code: code, amount: r2(amount), effective_start: from, effective_end: to, source: 'HRMS', reference });
  const onDay = `${open}-01`;
  for (const x of roster) {
    const id = pid.get(x.no)!, pr = promoOf(x.no);
    const ranges: [string, string, number, number, number][] = pr
      ? [[x.hire, d10(new Date(Date.parse(pr.effective) - DAY)), pr.from, pctOf(pr.from, P.housingPct), pctOf(pr.from, P.transportPct)], [pr.effective, '4712-12-31', x.basic, x.housing, x.transport]]
      : [[x.hire, '4712-12-31', x.basic, x.housing, x.transport]];
    for (const [from, to, b, h, t] of ranges) {
      entry(id, 'BASIC', b, from, to); entry(id, 'HOUSING', h, from, to); entry(id, 'TRANSPORT', t, from, to);
      if (x.other) entry(id, 'OTHER_ALW', x.other, from, to);
      if (x.gosiFirst) { const g = gosiContribution(b + h, x.isSaudi, x.gosiFirst, monthEnd(open)); if (g.employee > 0) entry(id, 'GOSI_EE', g.employee, from, to); entry(id, 'GOSI_ER', g.employer, from, to); }
    }
  }
  // What Tasama settles in the first month: housing owed and GOSI under-deducted, from the history lane.
  const diffs: any[] = st.history.differences;
  const per = new Map<string, any[]>();
  for (const d of diffs) per.set(`${d.why}:${d.no}`, [...(per.get(`${d.why}:${d.no}`) ?? []), d]);
  const settled: string[] = [];
  for (const [k, ds] of per) {
    const no = k.split(':')[1], id = pid.get(no);
    if (!id) continue;
    const months = ds.map((d) => monthWord(d.month).split(' ')[0]).join(' and ');
    if (k.startsWith('HOUSING:')) { const amt = r2(ds.reduce((s, d) => s + d.housingDue - d.housingPaid, 0)); entry(id, 'BACK_PAY', amt, onDay, monthEnd(open), `Housing not paid in ${months}`); settled.push(`back pay of SAR ${amt.toLocaleString('en-US')} for ${ds[0].name}`); }
    if (k.startsWith('GOSI:')) { const amt = r2(ds.reduce((s, d) => s + d.gosiDue - d.gosiPaid, 0)); entry(id, 'GOSI_ARREARS', amt, onDay, monthEnd(open), `GOSI under-deducted, ${monthWord(ds[0].month).split(' ')[0]} to ${monthWord(ds[ds.length - 1].month).split(' ')[0]}`); settled.push(`GOSI arrears of SAR ${amt.toLocaleString('en-US')} for ${ds[0].name}`); }
  }
  await insertMany(c, 'hcm.element_entries', ee);

  /* ----- payroll periods: the months as paid, then the first month on the platform ----- */
  const closed: string[] = st.history.months.map((m: any) => m.month);
  const periods = await insertMany(c, 'hcm.payroll_periods', [
    ...closed.map((m) => ({ period_name: m, start_date: `${m}-01`, end_date: monthEnd(m), cutoff_date: dayIn(m, P.cutoffDay), pay_date: dayIn(m, P.payDay), status: 'CLOSED' })),
    { period_name: open, start_date: `${open}-01`, end_date: monthEnd(open), cutoff_date: dayIn(open, P.cutoffDay), pay_date: dayIn(open, P.payDay), status: 'OPEN' },
  ], 'id, period_name');
  const periodId = (m: string) => periods.find((p: any) => p.period_name === m)!.id as number;
  const lines = (r: any) => [
    { code: 'BASIC', name: 'Basic', amount: r.basic, kind: 'EARNING' }, { code: 'HOUSING', name: 'Housing', amount: r.housing, kind: 'EARNING' }, { code: 'TRANSPORT', name: 'Transport', amount: r.transport, kind: 'EARNING' },
    ...(r.gosi ? [{ code: 'GOSI_EE', name: 'GOSI', amount: r.gosi, kind: 'DEDUCTION' }] : []), { code: 'GOSI_ER', name: 'GOSI, employer', amount: r.gosiEr, kind: 'EMPLOYER_CONTRIBUTION' },
  ].filter((l) => l.amount).map((l) => ({ ...l, rule: 'As paid by the client before Tasama took the payroll on' }));
  await insertMany(c, 'hcm.payroll_results', st.history.rows.filter((r: any) => pid.has(r.no)).map((r: any) => ({ period_id: periodId(r.month), person_id: pid.get(r.no), days_paid: r.days, gross: r.gross, deductions: r.deductions, employer_contributions: r.gosiEr, net: r.net, lines: JSON.stringify(lines(r)), wps_status: 'PAID' })));
  const provMonth = st.provisions.month;
  if (provMonth) await insertMany(c, 'hcm.payroll_provisions', st.provisions.rows.filter((r: any) => pid.has(r.no)).map((r: any) => ({ period_id: periodId(provMonth), person_id: pid.get(r.no), eos_wage: r.eos_wage, eos_accrued: r.eos_accrued, eos_month: r.eos_month, leave_days: r.leave_days, leave_accrued: r.leave_accrued, leave_month: r.leave_month,
    rules: JSON.stringify({ eos: r.eos_rule, leave: r.leave_rule, terms: 'Opening provision at go-live, calculated by the platform' }) })));

  /* ----- leave ----- */
  await insertMany(c, 'hcm.absence_types', ABSENCE_TYPES.map((t) => ({ code: t.code, name: t.name, name_ar: t.name_ar, plan: t.plan, annual_entitlement: t.ent, paid_rule: t.paid, requires_certificate: t.cert, legal_ref: t.legal })));
  const year = Number(open.slice(0, 4));
  const leaveOf = (x: any) => st.leave.find((l: any) => l.no === x.masterNo && l.name === x.name) ?? st.leave.find((l: any) => l.name === x.name);
  await insertMany(c, 'hcm.absence_balances', roster.flatMap((x) => { const l = leaveOf(x); return [
    { person_id: pid.get(x.no), year, type_code: 'ANNUAL', entitlement: l?.entitlement ?? x.leaveEntitlement, carried_over: l?.carry ?? 0, taken: l?.taken ?? 0, booked: 0 },
    { person_id: pid.get(x.no), year, type_code: 'SICK', entitlement: 120, carried_over: 0, taken: 0, booked: 0 }]; }));

  /* ----- the agentic layer ----- */
  const pick = (re: RegExp, dept?: RegExp) => roster.find((x) => re.test(x.position) && (!dept || dept.test(x.dept)) && !x.held);
  const chro = pick(/head of (human resources|hr)/i) ?? roster.filter((x) => /human resources/i.test(x.dept)).sort((a, b) => rankOf(b.grade) - rankOf(a.grade))[0];
  const ops = pick(/payroll/i, /human resources/i) ?? pick(/hr officer/i) ?? chro;
  const finance = pick(/financ(e|ial) controller/i) ?? roster.filter((x) => /finance/i.test(x.dept)).sort((a, b) => rankOf(b.grade) - rankOf(a.grade))[0] ?? chro;
  const flagged = new Set<string>((o_issues(st) as Issue[]).flatMap((i) => i.people.map((p) => p.no)));
  const employee = roster.find((x) => !flagged.has(x.no) && !x.held && rankOf(x.grade) >= 6 && rankOf(x.grade) <= 8 && x.managerNo && /guest|hospitality/i.test(x.dept)) ?? roster.find((x) => !flagged.has(x.no) && x.managerNo)!;
  const manager = roster.find((x) => x.masterNo === employee.managerNo) ?? chro;
  const persona: Record<string, number> = { employee: pid.get(employee.no)!, manager: pid.get(manager.no)!, payroll: pid.get(ops.no)!, chro: pid.get(chro.no)!, finance: pid.get(finance.no)! };
  const who: Record<string, any> = { employee, manager, payroll: ops, chro, finance };
  // The personas' titles are the positions they hold in the client's master data.
  const all = personasFor(cfg).filter((p) => persona[p.key] != null).map((p) => ({ ...p, role_title: who[p.key].position, role_title_ar: who[p.key].position }));
  await insertMany(c, 'layer.personas', all.map((p) => ({ ...p, person_id: persona[p.key], scope: p.scope, approval_limits: p.approval_limits })));
  await insertMany(c, 'layer.agents', AGENTS.map((a, i) => ({ id: a.id, name: a.name, name_ar: a.name_ar, title: a.title, title_ar: a.title_ar, stage: a.stage, purpose: a.purpose, purpose_ar: a.purpose_ar, autonomy: a.autonomy, owner_person_id: persona[a.owner] ?? null,
    functions: JSON.stringify(a.functions), superpower: a.superpower, impact: a.impact, tools: a.tools, hcm_reads: a.reads, hcm_writes: a.writes, decides: a.decides, sort: i })));
  const policies: Policy[] = st.policy.policies;
  await insertMany(c, 'layer.policies', policies.map((p) => ({ id: p.id, title: p.title, title_ar: p.title_ar || p.title, version: p.version || st.policy.version, effective_date: st.policy.effective ?? `${open}-01`, owner: p.owner || 'Human Resources', summary: p.summary || p.title })));
  for (const p of policies) for (const k of p.clauses) {
    await c.query(`INSERT INTO layer.policy_clauses (id, policy_id, clause_ref, heading, heading_ar, text_en, text_ar, legal_ref, tags, search) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, setweight(to_tsvector('english', $4), 'A') || setweight(to_tsvector('english', $6), 'B'))`,
      [`${p.id} §${k.ref}`, p.id, k.ref, k.heading, k.heading_ar || k.heading, k.en, k.ar || '', k.legal ?? null, k.tags ?? []]);
  }
  const reading = await readHandbook(cfg, { policies, source: `${st.policy.title} v${st.policy.version}` });
  await saveVersion(c, reading, { version: st.policy.version, status: 'ACTIVE', effective: `${open}-01`, activatedBy: `${approver}, Tasama, at go-live`, at: anchor,
    resolutions: { probation: 'Refused: probation stops at 180 days (Art. 53)', 'lateness.cap': 'Refused: fines in a month stop at five days\' wage (Art. 70)', trips: 'No per diem is paid until the client sets one' } });
  await insertMany(c, 'layer.workflow_defs', WORKFLOWS.map((w) => ({ id: w.id, num: w.num, name: w.name, name_ar: w.name_ar, stage: w.stage, coverage: w.coverage, trigger_en: w.trigger, agents: w.agents, decision_by: w.decision_by, steps: w.steps })));
  await c.query(`INSERT INTO layer.meta (key, value) VALUES ('people', $1), ('anchor', $2), ('planted', '{}'), ('inputs', $3), ('onboarded', $4)`,
    [JSON.stringify({ persona, hrbp: {} }), JSON.stringify(anchor.toISOString()), JSON.stringify({ expected: [], late: null, raise: null, resigner: null }), JSON.stringify({ by: approver, month: open, settled })]);

  /* ----- the client's issues become questions for its HR operations; the month opens ----- */
  let cases = 0;
  for (const i of (o_issues(st) as Issue[]).filter((x) => x.who === 'CLIENT')) {
    const subject = pid.get(i.people[i.people.length - 1]?.no) ?? persona.payroll;
    await startCase(c, { workflowId: 'WF-36', type: 'ONBOARDING_ISSUE', title: i.title, title_ar: i.title_ar ?? i.title, requester: persona.payroll, subject, channel: 'FORM',
      payload: { kind: 'ONBOARDING_ISSUE', code: i.code, finding: i.title, finding_ar: i.title_ar, settle: i.settle, settle_ar: i.settle_ar, person_name: i.people.map((p) => p.name).join(' and '), asked_by: approver, asked_on: d10(anchor), period: open, due: `${dayIn(open, P.cutoffDay)}T21:00:00Z`, client: cfg.short } });
    cases++;
  }
  await startCase(c, { workflowId: 'WF-27', type: 'MONTH', title: `Payroll changes for ${monthWord(open)}`, title_ar: `تغييرات الرواتب لشهر ${new Date(`${open}-01T00:00:00Z`).toLocaleString('ar', { month: 'long', year: 'numeric', timeZone: 'UTC' })}`, requester: persona.payroll, subject: persona.payroll, channel: 'SCHEDULE', payload: { period: open } });
  return { people: roster.length, leavers: leavers.length, months: closed.length, cases, settled };
}

/** The issues travel in the onboarding row; the staged object carries them for go-live. */
const o_issues = (st: any) => st.issues ?? [];
