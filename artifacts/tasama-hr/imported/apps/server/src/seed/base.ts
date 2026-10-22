/**
 * Base HRMS data: one client's synthetic workforce as its system of
 * record holds it. Deterministic from SEED and relative to the ANCHOR date
 * (the day the seed runs), so dates stay coherent whenever the demo is reset.
 *
 * Planted on purpose, so the agents have something real to find:
 *  - payroll pre-run anomalies (missed promotion entry, leaver still paid,
 *    unrecorded unpaid leave, joiner missing housing and GOSI, deduction cap,
 *    unverified IBAN, overtime spike);
 *  - calibration issues in Commercial (lenient manager, too many 5s, a rating
 *    that contradicts goal progress, a gender gap in one department);
 *  - expiring iqamas and national IDs, probation dates, contract renewals.
 */
import type { PoolClient } from 'pg';
import { periodDates } from '../domain/calendar.js';
import { insertMany } from '../db.js';
import { rng, type Rng } from '../domain/rng.js';
import { GRADES, ELEMENT_TYPES, ABSENCE_TYPES, orgFor, type DeptSpec } from '../domain/org.js';
import { CLIENTS, type ClientConfig } from '../domain/clients.js';
import * as N from '../domain/names.js';
import { addDays, addMonths, iso, monthStart, monthEnd, parse, daysBetween, gosi, yearsBetween, noticeDaysForGrade, annualEntitlement, round2 } from '../domain/rules.js';
import { NEW_SYSTEM_FROM } from '../domain/payroll/gosi.js';
import { runPayroll, type EngineEmployee } from '../domain/payroll/engine.js';
import { ELEMENT_OF, HCM_OF, termsFromRules, gosiAbsorbedGrades } from '../domain/payroll/terms.js';
import { readRules } from '../domain/payroll-policy.js';
import { policiesFor } from '../domain/policies.js';

export const SEED = 20261002;

export type SeedPerson = {
  id: number; person_number: string; first: [string, string]; last: [string, string]; gender: 'M' | 'F'; nat: string;
  dept: string; role: string; grade: number; hire: Date; positionCode: string; managerKey?: string;
};

export type BaseResult = {
  anchor: Date;
  persona: Record<string, number>;          // persona key -> person id
  personByNumber: Map<string, number>;
  planted: Record<string, number>;          // named people the scenarios and history rely on
  deptHead: Map<string, number>;            // dept code -> head person id
  hrbpForDivision: Map<string, number>;
  managerOf: Map<number, number | null>;
  active: number[];
};

const r50 = (n: number) => Math.round(n / 50) * 50;

function nameFor(R: Rng, nat: string, gender: 'M' | 'F'): { first: N.NamePart; last: N.NamePart } {
  if (nat === 'SA') return { first: R.pick(gender === 'M' ? N.SAUDI_MALE : N.SAUDI_FEMALE), last: R.pick(N.SAUDI_FAMILY) };
  if (N.ARAB_FAMILY[nat]) return { first: R.pick(gender === 'M' ? N.ARAB_MALE : N.ARAB_FEMALE), last: R.pick(N.ARAB_FAMILY[nat]) };
  if (N.SOUTH_ASIAN_FAMILY[nat]) return { first: R.pick(gender === 'M' ? N.SOUTH_ASIAN_MALE : N.SOUTH_ASIAN_FEMALE), last: R.pick(N.SOUTH_ASIAN_FAMILY[nat]) };
  const o = N.OTHER[nat];
  return { first: R.pick(gender === 'M' ? o.male : o.female), last: R.pick(o.family) };
}

/** Fixed people: the personas and the cases the demo depends on. Names here are a template; each client gets its own (fixedFor). */
const FIXED_TEMPLATE: Record<string, { role: string; idx: number; first: N.NamePart; last: N.NamePart; gender: 'M' | 'F'; nat: string; yearsAgo?: number; daysAgo?: number; startInDays?: number }> = {
  chro:    { role: 'HUC-CHRO', idx: 0, first: ['Amna', 'آمنة'], last: ['Al Shamsi', 'الشامسي'], gender: 'F', nat: 'SA', yearsAgo: 9.2 },
  hrbp:    { role: 'HUC-BP', idx: 0, first: ['Noura', 'نورة'], last: ['Al Marzooqi', 'المرزوقي'], gender: 'F', nat: 'SA', yearsAgo: 6.4 },
  ta:      { role: 'HUC-TA', idx: 0, first: ['Rania', 'رانيا'], last: ['Haddad', 'حداد'], gender: 'F', nat: 'LB', yearsAgo: 4.1 },
  payroll: { role: 'HUC-PAY', idx: 0, first: ['Sanjay', 'سانجاي'], last: ['Pillai', 'بيلاي'], gender: 'M', nat: 'IN', yearsAgo: 8.6 },
  manager: { role: 'CXP-HD', idx: 0, first: ['Khalid', 'خالد'], last: ['Al Suwaidi', 'السويدي'], gender: 'M', nat: 'SA', yearsAgo: 7.9 },
  employee:{ role: 'CXP-SR', idx: 0, first: ['Mariam', 'مريم'], last: ['Al Hammadi', 'الحمادي'], gender: 'F', nat: 'SA', yearsAgo: 7.6 },
  joiner:  { role: 'INV-AN', idx: 4, first: ['Arjun', 'أرجون'], last: ['Menon', 'مينون'], gender: 'M', nat: 'IN', startInDays: 17 },
  // cases
  probationer: { role: 'CXP-OF', idx: 0, first: ['Omar', 'عمر'], last: ['Al Ketbi', 'الكتبي'], gender: 'M', nat: 'SA', daysAgo: 158 },
  teamA:   { role: 'CXP-SR', idx: 1, first: ['Priya', 'بريا'], last: ['Nair', 'ناير'], gender: 'F', nat: 'IN', yearsAgo: 3.2 },
  teamB:   { role: 'CXP-OF', idx: 1, first: ['Hassan', 'حسن'], last: ['Fahmy', 'فهمي'], gender: 'M', nat: 'EG', yearsAgo: 2.4 },
  teamC:   { role: 'CXP-MGR', idx: 0, first: ['Lina', 'لينا'], last: ['Khoury', 'خوري'], gender: 'F', nat: 'JO', yearsAgo: 5.3 },
  advanceEx: { role: 'CCN-OF', idx: 0, first: ['Grace', 'جريس'], last: ['Santos', 'سانتوس'], gender: 'F', nat: 'PH', yearsAgo: 3.7 },
  resigner: { role: 'RSL-SR', idx: 0, first: ['Kashif', 'كاشف'], last: ['Qureshi', 'قريشي'], gender: 'M', nat: 'PK', yearsAgo: 6.3 },
  terminee: { role: 'RSL-RO', idx: 0, first: ['Fadi', 'فادي'], last: ['Aoun', 'عون'], gender: 'M', nat: 'LB', yearsAgo: 2.8 },
  promotee: { role: 'COR-AN', idx: 0, first: ['Reem', 'ريم'], last: ['Al Falasi', 'الفلاسي'], gender: 'F', nat: 'SA', yearsAgo: 4.0 },
  // payroll anomalies
  payPromo:   { role: 'FIN-SA', idx: 0, first: ['Rohan', 'روهان'], last: ['Kapoor', 'كابور'], gender: 'M', nat: 'IN', yearsAgo: 4.6 },
  payLeaver:  { role: 'OPS-OF', idx: 0, first: ['Mark', 'مارك'], last: ['Reyes', 'رييس'], gender: 'M', nat: 'PH', yearsAgo: 3.1 },
  payUnpaid:  { role: 'TEC-SUP', idx: 0, first: ['Nikhil', 'نيخيل'], last: ['Sharma', 'شارما'], gender: 'M', nat: 'IN', yearsAgo: 2.2 },
  payJoiner:  { role: 'CMP-OF', idx: 0, first: ['Shamma', 'شمّة'], last: ['Al Nuaimi', 'النعيمي'], gender: 'F', nat: 'SA', daysAgo: 12 },
  payCap:     { role: 'CCN-OF', idx: 1, first: ['Joy', 'جوي'], last: ['Cruz', 'كروز'], gender: 'F', nat: 'PH', yearsAgo: 4.4 },
  payIban:    { role: 'MKT-CO', idx: 0, first: ['Tarek', 'طارق'], last: ['Saab', 'صعب'], gender: 'M', nat: 'LB', yearsAgo: 1.9 },
  payOT:      { role: 'TEC-ENG', idx: 0, first: ['Bilal', 'بلال'], last: ['Malik', 'مالك'], gender: 'M', nat: 'PK', yearsAgo: 2.9 },
  // calibration
  lenientMgr: { role: 'RSL-MGR', idx: 0, first: ['Sultan', 'سلطان'], last: ['Al Mheiri', 'المهيري'], gender: 'M', nat: 'SA', yearsAgo: 6.8 },
};

/** The fixed people for one client: same roles and timings, names drawn for this client so no two companies share them. */
function fixedFor(ci: number) {
  const R = rng(SEED + 7919 * (ci + 1));
  const used = new Set<string>();
  const out: typeof FIXED_TEMPLATE = {};
  for (const [k, f] of Object.entries(FIXED_TEMPLATE)) {
    let nm = nameFor(R, f.nat, f.gender), guard = 0;
    while ((used.has(nm.first[0]) || used.has(nm.last[0] + nm.first[0])) && guard++ < 40) nm = nameFor(R, f.nat, f.gender);
    used.add(nm.first[0]); used.add(nm.last[0] + nm.first[0]);
    out[k] = { ...f, first: nm.first, last: nm.last };
  }
  return out;
}

export async function seedBase(c: PoolClient, anchor: Date, client: ClientConfig): Promise<BaseResult> {
  const ci = CLIENTS.findIndex((x) => x.key === client.key);
  const R = rng(SEED + 1009 * ci);
  const FIXED = fixedFor(ci);
  const ORG = orgFor(client);
  const DEPARTMENTS: DeptSpec[] = ORG.departments;
  const P = client.policy;
  const pct = (b: number, p: number) => r50(b * p / 100);
  const OTHER_PCT = 5;
  const A = anchor;
  const year = A.getUTCFullYear();

  // ------------------------------------------------------------ structures
  const [le] = await insertMany(c, 'hcm.legal_employers', [ORG.legal], 'id');
  const locs = await insertMany(c, 'hcm.locations', ORG.locations.map((l) => ({ ...l })), 'id, code');
  const branchLocs = ORG.locations.slice(1).map((l) => l.code);
  const locId = (code: string) => locs.find((l: any) => l.code === code)!.id as number;
  const grades = await insertMany(c, 'hcm.grades', GRADES.map((g) => ({ code: g.code, rank: g.rank, min_basic: g.min, mid_basic: round2((g.min + g.max) / 2), max_basic: g.max, notice_days: g.notice })), 'id, code, rank, min_basic, mid_basic, max_basic');
  const gradeByRank = (rk: number) => grades.find((g: any) => g.rank === rk)!;

  const deptIds = new Map<string, number>();
  for (const d of DEPARTMENTS) {
    const [row] = await insertMany(c, 'hcm.departments', [{ code: `DEMO-${d.code}`, name: d.name, name_ar: d.name_ar, division: d.division, division_ar: d.division_ar, parent_id: d.parent ? deptIds.get(d.parent) ?? null : null, cost_center: `CC-${d.code}-${100 + deptIds.size}` }], 'id');
    deptIds.set(d.code, row.id);
  }
  const jobRows: any[] = [];
  for (const d of DEPARTMENTS) for (const [code, title, ar] of d.roles) {
    const head = /HD|CEO|CCO|CIO|CFO|CRO|CTO|COO|CHRO|CISO|GC$/.test(code);
    jobRows.push({ code, name: title, name_ar: ar, family: d.family, family_ar: d.family_ar, level: head ? 'Executive' : /MGR|PM|FC|RM|BP|TA$|PAY|MLRO|AM|PO/.test(code) ? 'Manager' : 'Professional', skilled: !/ASC|ADM|CC$|SUP/.test(code) });
  }
  const jobs = await insertMany(c, 'hcm.jobs', jobRows, 'id, code');
  const jobId = (code: string) => jobs.find((j: any) => j.code === code)!.id as number;

  // ------------------------------------------------------------ positions
  type Pos = { code: string; role: string; dept: string; grade: number; idx: number; id?: number; title: string; title_ar: string; loc: string; head: boolean; filled: boolean; hiring: string };
  const positions: Pos[] = [];
  let pn = 1;
  for (const d of DEPARTMENTS) for (const [code, title, ar, g, count] of d.roles) {
    for (let i = 0; i < count; i++) {
      const rank = Number(g.slice(1));
      const head = i === 0 && (rank >= 12 || code === d.roles[0][0]);
      const loc = ['CCN', 'OPS', 'INV', 'REA'].includes(d.code) ? branchLocs[i % branchLocs.length] : 'HO';
      positions.push({ code: `DEMO-POS-${String(pn++).padStart(4, '0')}`, role: code, dept: d.code, grade: rank, idx: i, title, title_ar: ar, loc, head: code === d.roles[0][0] && i === 0, filled: true, hiring: 'FILLED' });
    }
  }
  // Vacancies: chosen non-head roles. Ten with open requisitions, two approved, two just vacated.
  const vacancyRoles: [string, number, string][] = [
    ['CXP-MGR', 1, 'IN_RECRUITMENT'], ['COR-RM', 4, 'IN_RECRUITMENT'], ['RSL-RO', 17, 'IN_RECRUITMENT'], ['TEC-SE', 5, 'IN_RECRUITMENT'],
    ['DIG-DA', 3, 'IN_RECRUITMENT'], ['CMP-OF', 5, 'IN_RECRUITMENT'], ['RSK-AN', 4, 'IN_RECRUITMENT'], ['MKT-DM', 3, 'IN_RECRUITMENT'],
    ['INV-AN', 4, 'IN_RECRUITMENT'], ['SEC-AN', 4, 'IN_RECRUITMENT'], ['FIN-SA', 4, 'APPROVED'], ['OPS-SR', 5, 'APPROVED'],
    ['CXP-CC', 9, 'VACANT'], ['CCN-OF', 11, 'VACANT'],
  ];
  // Nominal indexes come from the template; a smaller client has fewer seats, so use the last seat when needed.
  const seats = (role: string) => positions.filter((x) => x.role === role).length;
  const vIdx = (role: string, nominal: number) => (role === 'INV-AN' ? 4 : Math.max(Math.min(nominal, seats(role) - 1), role === 'CCN-OF' ? 2 : 1));
  for (const [role, nominal, status] of vacancyRoles) {
    const idx = vIdx(role, nominal);
    const p = positions.find((x) => x.role === role && x.idx === idx);
    if (p) { p.filled = role === 'INV-AN'; p.hiring = status; }   // INV-AN #4 is Arjun, a pending worker
  }
  const posRows = await insertMany(c, 'hcm.positions', positions.map((p) => ({
    code: p.code, name: p.title, name_ar: p.title_ar, job_id: jobId(p.role), department_id: deptIds.get(p.dept)!, location_id: locId(p.loc), grade_id: gradeByRank(p.grade).id,
    fte: 1, headcount: 1, budget_status: 'BUDGETED', status: 'ACTIVE', hiring_status: p.hiring, annual_budget: Math.round(gradeByRank(p.grade).mid_basic * 1.65 * 12),
    effective_start: '2018-01-01',
  })), 'id, code');
  posRows.forEach((r: any, i: number) => { positions[i].id = r.id; });

  // ------------------------------------------------------------ people
  const persons: SeedPerson[] = [];
  const fixedByRole = new Map<string, string>();
  for (const [k, f] of Object.entries(FIXED)) fixedByRole.set(`${f.role}#${f.idx}`, k);
  const persona: Record<string, number> = {};
  const planted: Record<string, number> = {};
  let num = 100120;

  // Saudi share by role family: higher in leadership and customer-facing roles (Saudization), lower in specialist technical roles.
  const expat = () => R.weighted(N.EXPAT_MIX);
  const natFor = (role: string) => {
    const s = client.saudiShare;
    if (/CCN|CXP-CC|CXP-OF|HUC/.test(role)) return R.chance(Math.min(0.95, s + 0.18)) ? 'SA' : expat();
    if (/HD|CEO|CCO|CIO|CFO|CRO|COO|CTO|CHRO|GC/.test(role)) return R.chance(Math.min(0.92, s + 0.12)) ? 'SA' : R.pick(['GB', 'JO', 'LB', 'EG']);
    if (/TEC|DIG|SEC|REA-AM|INV-PM/.test(role)) return R.chance(Math.max(0.25, s - 0.2)) ? 'SA' : R.weighted([['IN', 35], ['EG', 20], ['PK', 15], ['JO', 10], ['GB', 10], ['LB', 10]] as const);
    return R.chance(s) ? 'SA' : expat();
  };

  const posOfPerson = new Map<number, Pos>();
  for (const p of positions) {
    if (!p.filled) continue;
    const fk = fixedByRole.get(`${p.role}#${p.idx}`);
    const f = fk ? FIXED[fk] : undefined;
    const nat = f?.nat ?? natFor(p.role);
    const gender = f?.gender ?? (R.chance(0.45) ? 'F' : 'M');
    const nm = f ? { first: f.first, last: f.last } : nameFor(R, nat, gender);
    const tenureYears = f?.yearsAgo ?? (f?.daysAgo ? f.daysAgo / 365.25 : Math.max(0.15, (p.grade >= 12 ? R.normal(8, 3) : p.grade >= 9 ? R.normal(5.5, 2.5) : R.normal(3.5, 2.2))));
    const hire = f?.startInDays !== undefined ? addDays(A, f.startInDays) : addDays(A, -Math.round(Math.max(0.12, Math.min(16, tenureYears)) * 365.25));
    const sp: SeedPerson = { id: 0, person_number: `DEMO-${num++}`, first: nm.first, last: nm.last, gender, nat, dept: p.dept, role: p.role, grade: p.grade, hire, positionCode: p.code };
    persons.push(sp);
    if (fk) (['employee', 'joiner', 'manager', 'hrbp', 'ta', 'payroll', 'chro'].includes(fk) ? persona : planted)[fk] = -persons.length; // temp index
  }
  // A few recent joiners (last 90 days) for onboarding; and the leaver/vacated pair handled below.
  let recent = 0;
  const fixedCodes = new Set(positions.filter((p) => fixedByRole.has(`${p.role}#${p.idx}`)).map((p) => p.code));
  for (const sp of persons) if (!fixedCodes.has(sp.positionCode) && sp.grade <= 8 && recent < 5 && R.chance(0.04)) { sp.hire = addDays(A, -R.int(20, 85)); recent++; }

  const dob = (sp: SeedPerson) => {
    const tenure = yearsBetween(sp.hire, A);
    const minAge = 22 + Math.max(0, sp.grade - 5) * 1.6 + tenure;
    return addDays(A, -Math.round((minAge + R.next() * 8) * 365.25));
  };
  const personRows = persons.map((sp, i) => {
    const isSA = sp.nat === 'SA';
    const eidExpiry = i % 37 === 3 ? addDays(A, R.int(10, 55)) : addDays(A, R.int(120, 1000));
    const visaExpiry = isSA ? null : i % 29 === 5 ? addDays(A, R.int(8, 58)) : addDays(A, R.int(90, 720));
    const display = `${sp.first[0]} ${sp.last[0]}`;
    return {
      person_number: sp.person_number, first_name: sp.first[0], last_name: sp.last[0], first_name_ar: sp.first[1], last_name_ar: sp.last[1],
      display_name: display, display_name_ar: `${sp.first[1]} ${sp.last[1]}`, gender: sp.gender, date_of_birth: iso(dob(sp)), nationality: sp.nat, is_saudi: isSA,
      marital_status: R.pick(['Single', 'Married', 'Married', 'Married']),
      work_email: `${sp.first[0].toLowerCase()}.${sp.last[0].toLowerCase().replace(/[^a-z]/g, '')}${i}@demo.${client.key}.example`,
      mobile: `+966 5${R.int(0, 9)} ${R.int(100, 999)} ${R.int(1000, 9999)}`,
      national_id_masked: `${isSA ? '1' : '2'}XXXXXX${String(R.int(100, 999))}`, national_id_expiry: iso(eidExpiry),
      passport_masked: `${isSA ? 'X' : sp.nat[0]}XXXX${R.int(100, 999)}`, passport_expiry: iso(i % 41 === 7 ? addDays(A, R.int(30, 170)) : addDays(A, R.int(400, 3000))),
      iqama_expiry: visaExpiry ? iso(visaExpiry) : null,
      bank_name: R.pick(N.BANKS), iban_masked: `SA${R.int(10, 99)} •••• •••• •••• ${R.int(1000, 9999)}`, photo_seed: R.int(1, 9999),
    };
  });
  const personIds = await insertMany(c, 'hcm.persons', personRows, 'id');
  persons.forEach((sp, i) => { sp.id = personIds[i].id; });
  for (const k of Object.keys(persona)) persona[k] = persons[-persona[k] - 1].id;
  // The finance controller persona (view only, design/payroll-addendum.md §2): whoever holds the Financial Controller role.
  persona.finance = (persons.find((x) => x.role === 'FIN-FC') ?? persons.find((x) => x.role === 'FIN-MGR'))!.id;
  for (const k of Object.keys(planted)) planted[k] = persons[-planted[k] - 1].id;

  // ------------------------------------------------------------ reporting lines
  const byPos = new Map(persons.map((sp) => [sp.positionCode, sp]));
  const headOf = new Map<string, SeedPerson>();
  for (const d of DEPARTMENTS) {
    const headPos = positions.find((p) => p.dept === d.code && p.role === d.roles[0][0] && p.idx === 0)!;
    const h = byPos.get(headPos.code);
    if (h) headOf.set(d.code, h);
  }
  const ceo = headOf.get('CEO')!;
  const managerOf = new Map<number, number | null>();
  for (const sp of persons) {
    const d = DEPARTMENTS.find((x) => x.code === sp.dept)!;
    const head = headOf.get(sp.dept)!;
    let mgr: SeedPerson | undefined;
    if (head === sp) mgr = d.parent ? headOf.get(d.parent) : undefined;
    else {
      // managers in the department report to the head; others to a manager-level role if one exists
      const isMgr = /MGR|PM|FC|RM$|BP|TA$|PAY|MLRO|AM|PO|SC|GC/.test(sp.role) || sp.grade >= 10;
      if (isMgr) mgr = head;
      else {
        const mgrs = persons.filter((x) => x.dept === sp.dept && x !== head && (/MGR/.test(x.role) || (x.grade >= 10 && x.grade < head.grade)));
        mgr = mgrs.length ? mgrs[persons.indexOf(sp) % mgrs.length] : head;
      }
    }
    if (sp.dept === 'CEO' && sp === head) mgr = undefined;
    managerOf.set(sp.id, mgr ? mgr.id : null);
  }
  // The employee persona, the probationer and the team cases report directly to the manager persona (Head of CX).
  for (const k of ['employee', 'probationer', 'teamA', 'teamB', 'teamC']) managerOf.set(k === 'employee' ? persona.employee : planted[k], persona.manager);
  managerOf.set(persona.joiner, headOf.get('INV')!.id);
  for (const d of DEPARTMENTS) {
    const h = headOf.get(d.code);
    if (h) await c.query('UPDATE hcm.departments SET manager_person_id = $1 WHERE id = $2', [h.id, deptIds.get(d.code)]);
  }

  // HRBPs by division: the HRBP persona covers Commercial, the Executive Office and Human Resources.
  const bps = persons.filter((x) => x.role === 'HUC-BP' && x.id !== persona.hrbp);
  const hrbpForDivision = new Map<string, number>();
  const coreDivision = DEPARTMENTS.find((d) => d.code === 'INV')!.division;
  for (const d of DEPARTMENTS) {
    const bp = ['Commercial', 'Executive Office', 'Human Resources'].includes(d.division) ? persona.hrbp
      : [coreDivision, 'Finance', 'Risk and Compliance'].includes(d.division) ? bps[0].id : bps[bps.length - 1].id;
    hrbpForDivision.set(d.division, bp);
  }

  // ------------------------------------------------------------ employment, assignments, salaries
  const wrRows: any[] = [], asgRows: any[] = [], salRows: any[] = [];
  const currentBasic = new Map<number, number>();
  const lastSalaryFrom = new Map<number, string>();
  let pos_id = 300000000001;
  for (const sp of persons) {
    const pos = positions.find((p) => p.code === sp.positionCode)!;
    const pending = sp.id === persona.joiner;
    wrRows.push({ period_of_service_id: pos_id++, person_id: sp.id, legal_employer_id: le.id, worker_type: pending ? 'P' : 'E', start_date: iso(sp.hire), original_hire_date: iso(sp.hire), end_date: null, notified_termination_date: null, last_working_day: null, termination_action: null, termination_reason: null, rehire_eligible: null });
  }
  const wrIds = await insertMany(c, 'hcm.work_relationships', wrRows, 'id, person_id');
  const wrOf = new Map(wrIds.map((w: any) => [w.person_id, w.id]));

  for (const sp of persons) {
    const pos = positions.find((p) => p.code === sp.positionCode)!;
    const g = gradeByRank(sp.grade);
    const tenure = yearsBetween(sp.hire, A);
    // promotions: one grade every ~3.5 years, back from today
    const promos = sp.grade >= 6 ? Math.min(Math.floor(Math.max(0, tenure - 1) / 3.5), sp.grade - 4, 3) : 0;
    const steps: { from: Date; grade: number; action: string }[] = [{ from: sp.hire, grade: sp.grade - promos, action: 'HIRE' }];
    for (let k = 1; k <= promos; k++) steps.push({ from: monthStart(addDays(A, -Math.round((promos - k + 0.4 + R.next() * 0.5) * 3.5 * 365.25 / Math.max(1, promos) * 0.9))), grade: sp.grade - promos + k, action: 'PROMOTION' });
    steps.sort((a, b) => a.from.getTime() - b.from.getTime());
    for (let k = 1; k < steps.length; k++) if (steps[k].from <= steps[k - 1].from) steps[k].from = addDays(steps[k - 1].from, 200);
    const probationEnd = addDays(sp.hire, P.probationDays);
    const confirmed = probationEnd <= A;
    const contractYears = 2;
    let contractEnd = addMonths(sp.hire, 12 * contractYears);
    while (contractEnd < A) contractEnd = addMonths(contractEnd, 12 * contractYears);
    let basic = 0;
    steps.forEach((st, k) => {
      const sg = gradeByRank(Math.max(4, st.grade));
      const end = k < steps.length - 1 ? iso(addDays(steps[k + 1].from, -1)) : '4712-12-31';
      asgRows.push({
        assignment_number: `E${sp.person_number.slice(5)}`, person_id: sp.id, work_relationship_id: wrOf.get(sp.id), effective_start: iso(st.from), effective_end: end, effective_sequence: 1,
        action_code: st.action, action_reason: st.action === 'PROMOTION' ? 'Promotion following annual review' : 'New hire',
        position_id: k === steps.length - 1 ? pos.id : null, job_id: jobId(sp.role), department_id: deptIds.get(sp.dept), grade_id: sg.id, location_id: locId(pos.loc),
        manager_person_id: managerOf.get(sp.id) ?? null, assignment_status: 'ACTIVE',
        probation_end_date: iso(probationEnd), probation_status: k === 0 && !confirmed ? 'IN_PROBATION' : 'CONFIRMED',
        contract_type: 'FIXED_TERM', contract_end_date: iso(sp.id % 23 === 4 && confirmed ? addDays(A, R.int(15, 55)) : contractEnd), notice_period_days: noticeDaysForGrade(sp.grade), working_hours: P.weeklyHours,
      });
      const min = sg.min_basic, max = sg.max_basic;
      if (k === 0) basic = r50(min + (max - min) * Math.max(0.02, Math.min(0.9, R.normal(0.25, 0.15))));
      else basic = r50(Math.max(min, basic * 1.10));
      // annual increments up to today, capped at max
      const yrsInStep = Math.max(0, Math.floor(yearsBetween(st.from, k < steps.length - 1 ? steps[k + 1].from : A)));
      const startBasic = basic;
      salRows.push({ person_id: sp.id, assignment_number: `E${sp.person_number.slice(5)}`, date_from: iso(st.from), date_to: '4712-12-31', basic: startBasic, housing: pct(startBasic, P.housingPct), transport: pct(startBasic, P.transportPct), other_allowance: pct(startBasic, OTHER_PCT), action_code: st.action, reason: st.action === 'HIRE' ? 'Offer' : 'Promotion' });
      for (let y = 1; y <= yrsInStep; y++) {
        basic = r50(Math.min(max, basic * (1 + 0.025 + R.next() * 0.02)));
        const from = iso(new Date(Date.UTC(st.from.getUTCFullYear() + y, 0, 1)));
        if (parse(from) > A) break;
        salRows.push({ person_id: sp.id, assignment_number: `E${sp.person_number.slice(5)}`, date_from: from, date_to: '4712-12-31', basic, housing: pct(basic, P.housingPct), transport: pct(basic, P.transportPct), other_allowance: pct(basic, OTHER_PCT), action_code: 'SALARY_CHANGE', reason: 'Annual increment' });
      }
    });
    currentBasic.set(sp.id, basic);
  }
  // close salary date_to ranges
  salRows.sort((a, b) => a.person_id - b.person_id || a.date_from.localeCompare(b.date_from));
  for (let i = 0; i < salRows.length - 1; i++) if (salRows[i].person_id === salRows[i + 1].person_id) salRows[i].date_to = iso(addDays(salRows[i + 1].date_from, -1));
  for (const s of salRows) lastSalaryFrom.set(s.person_id, s.date_from);

  // Planted: payPromo was promoted on the 1st of LAST month. The salary record says so; the BASIC element entry was never updated.
  const promoFrom = iso(monthStart(A, -1));
  {
    const sp = persons.find((x) => x.id === planted.payPromo)!;
    const cur = salRows.filter((s) => s.person_id === sp.id).pop()!;
    cur.date_to = iso(addDays(promoFrom, -1));
    const g = gradeByRank(sp.grade + 1);
    const nb = r50(Math.max(g.min_basic, cur.basic * 1.12));
    salRows.push({ person_id: sp.id, assignment_number: cur.assignment_number, date_from: promoFrom, date_to: '4712-12-31', basic: nb, housing: pct(nb, P.housingPct), transport: pct(nb, P.transportPct), other_allowance: pct(nb, OTHER_PCT), action_code: 'PROMOTION', reason: 'Promotion to Finance Manager track (G09)' });
    const lastAsg = asgRows.filter((a) => a.person_id === sp.id).pop()!;
    lastAsg.effective_end = iso(addDays(promoFrom, -1));
    asgRows.push({ ...lastAsg, effective_start: promoFrom, effective_end: '4712-12-31', action_code: 'PROMOTION', action_reason: 'Promotion following annual review', grade_id: g.id });
    currentBasic.set(sp.id, nb);
  }
  await insertMany(c, 'hcm.assignments', asgRows);
  await insertMany(c, 'hcm.salaries', salRows);

  // Planted: payLeaver's last working day was in the middle of last month; termination is recorded, element entries were not end-dated.
  const leaverLwd = iso(addDays(monthStart(A, -1), 13));
  await c.query(`UPDATE hcm.work_relationships SET end_date=$1, last_working_day=$1, notified_termination_date=$2, termination_action='RESIGNATION', termination_reason='Relocation outside Saudi Arabia', rehire_eligible=true WHERE person_id=$3`, [leaverLwd, iso(addDays(leaverLwd, -30)), planted.payLeaver]);
  await c.query(`UPDATE hcm.assignments SET effective_end=$1 WHERE person_id=$2 AND effective_end='4712-12-31'`, [leaverLwd, planted.payLeaver]);
  await c.query(`UPDATE hcm.positions SET hiring_status='VACANT' WHERE id=(SELECT position_id FROM hcm.assignments WHERE person_id=$1 AND position_id IS NOT NULL ORDER BY effective_start DESC LIMIT 1)`, [planted.payLeaver]);
  // A handful of earlier 2026 leavers, properly closed, for turnover figures.
  const earlyLeavers = R.shuffle(persons.filter((x) => x.grade <= 9 && !Object.values(planted).includes(x.id) && !Object.values(persona).includes(x.id) && x.hire < addDays(A, -500))).slice(0, 9);
  const leftIds = new Set<number>([planted.payLeaver]);
  for (const sp of earlyLeavers) {
    const lwd = iso(addDays(A, -R.int(40, 250)));
    leftIds.add(sp.id);
    await c.query(`UPDATE hcm.work_relationships SET end_date=$1, last_working_day=$1, notified_termination_date=$2, termination_action=$3, termination_reason=$4, rehire_eligible=$5 WHERE person_id=$6`,
      [lwd, iso(addDays(lwd, -R.pick([30, 60]))), R.chance(0.8) ? 'RESIGNATION' : 'END_OF_CONTRACT', R.pick(['Career move to another employer', 'Relocation', 'Further study', 'Family reasons', 'Better compensation offer']), true, sp.id]);
    await c.query(`UPDATE hcm.assignments SET effective_end=$1 WHERE person_id=$2 AND effective_end='4712-12-31'`, [lwd, sp.id]);
  }
  // Their positions were refilled (backfills) — keep the org whole: hire a replacement into the same position.
  // (Simplification: replacements are new synthetic people hired after the leaver's date.)
  for (const sp of earlyLeavers) {
    const lwd = (await c.query('SELECT last_working_day FROM hcm.work_relationships WHERE person_id=$1', [sp.id])).rows[0].last_working_day as string;
    const nat = natFor(sp.role), gender: 'M' | 'F' = R.chance(0.45) ? 'F' : 'M';
    const nm = nameFor(R, nat, gender);
    const hire = addDays(lwd, R.int(25, 70));
    if (hire > addDays(A, -5)) continue;
    const [p] = await insertMany(c, 'hcm.persons', [{ ...personRows[0], person_number: `DEMO-${num++}`, first_name: nm.first[0], last_name: nm.last[0], first_name_ar: nm.first[1], last_name_ar: nm.last[1], display_name: `${nm.first[0]} ${nm.last[0]}`, display_name_ar: `${nm.first[1]} ${nm.last[1]}`, gender, nationality: nat, is_saudi: nat === 'SA', date_of_birth: iso(addDays(A, -R.int(25, 40) * 365)), work_email: `${nm.first[0].toLowerCase()}.${num}@demo.${client.key}.example`, iqama_expiry: nat === 'SA' ? null : iso(addDays(A, R.int(300, 720))), photo_seed: R.int(1, 9999) }], 'id');
    const np: SeedPerson = { ...sp, id: p.id, person_number: `DEMO-${num - 1}`, first: nm.first, last: nm.last, gender, nat, hire };
    persons.push(np);
    managerOf.set(np.id, managerOf.get(sp.id) ?? null);
    const [w] = await insertMany(c, 'hcm.work_relationships', [{ period_of_service_id: pos_id++, person_id: np.id, legal_employer_id: le.id, worker_type: 'E', start_date: iso(hire), original_hire_date: iso(hire), end_date: null, notified_termination_date: null, last_working_day: null, termination_action: null, termination_reason: null, rehire_eligible: null }], 'id');
    const old = (await c.query(`SELECT * FROM hcm.assignments WHERE person_id=$1 ORDER BY effective_start DESC LIMIT 1`, [sp.id])).rows[0];
    const probEnd = addDays(hire, P.probationDays);
    await insertMany(c, 'hcm.assignments', [{ assignment_number: `E${np.person_number.slice(5)}`, person_id: np.id, work_relationship_id: w.id, effective_start: iso(hire), effective_end: '4712-12-31', effective_sequence: 1, action_code: 'HIRE', action_reason: 'Backfill', position_id: old.position_id, job_id: old.job_id, department_id: old.department_id, grade_id: old.grade_id, location_id: old.location_id, manager_person_id: old.manager_person_id, assignment_status: 'ACTIVE', probation_end_date: iso(probEnd), probation_status: probEnd <= A ? 'CONFIRMED' : 'IN_PROBATION', contract_type: 'FIXED_TERM', contract_end_date: iso(addMonths(hire, 24)), notice_period_days: noticeDaysForGrade(sp.grade), working_hours: P.weeklyHours }]);
    const g = gradeByRank(sp.grade);
    const b = r50(g.min_basic + (g.max_basic - g.min_basic) * 0.2);
    await insertMany(c, 'hcm.salaries', [{ person_id: np.id, assignment_number: `E${np.person_number.slice(5)}`, date_from: iso(hire), date_to: '4712-12-31', basic: b, housing: pct(b, P.housingPct), transport: pct(b, P.transportPct), other_allowance: pct(b, OTHER_PCT), action_code: 'HIRE', reason: 'Offer' }]);
    currentBasic.set(np.id, b);
    lastSalaryFrom.set(np.id, iso(hire));
  }

  const active = persons.filter((sp) => !leftIds.has(sp.id) && sp.id !== persona.joiner).map((sp) => sp.id);

  // ------------------------------------------------------------ end of service basis
  // Saudi Labor Law Arts. 84-85: every employee accrues an end-of-service award; Saudis are also covered by GOSI.
  const eosRows = persons.filter((sp) => sp.id !== persona.joiner).map((sp) => ({ person_id: sp.id, basis: 'GRATUITY', enrolled_date: iso(sp.hire), fund_name: null, contributions_to_date: null }));
  await insertMany(c, 'hcm.end_of_service', eosRows);

  // ------------------------------------------------------------ GOSI registrations (design/payroll-addendum.md §5)
  // Most people were first registered when they joined; about half of the Saudis hired since 3 Jul 2024 had
  // registered with an earlier employer, so they stay on the legacy rates. A separate random stream keeps the
  // rest of the seed unchanged.
  const RG = rng(SEED + 31337 * (ci + 1));
  const regOf = new Map<number, string>();
  {
    const regs: any[] = [];
    for (const sp of persons) {
      const hire = iso(sp.hire);
      const prior = sp.nat === 'SA' && hire >= NEW_SYSTEM_FROM && RG.chance(0.5);
      const first = prior ? iso(addDays(sp.hire, -RG.int(400, 2500))) : hire;
      regOf.set(sp.id, first);
      regs.push({ person_id: sp.id, first_registered: first, system: sp.nat === 'SA' && first >= NEW_SYSTEM_FROM ? 'NEW' : 'LEGACY', source: prior ? 'PRIOR_EMPLOYER' : 'THIS_EMPLOYER' });
    }
    await insertMany(c, 'hcm.gosi_registrations', regs);
  }

  // ------------------------------------------------------------ elements & entries
  await insertMany(c, 'hcm.element_types', ELEMENT_TYPES.map(([code, name, name_ar, classification, recurring]) => ({ code, name, name_ar, classification, recurring })));
  const ee: any[] = [];
  let en = 1;
  const entry = (person_id: number, element_code: string, amount: number, start: string, end = '4712-12-31', reference: string | null = null) =>
    ee.push({ entry_number: `DEMO-EE-${String(en++).padStart(6, '0')}`, person_id, element_code, amount: round2(amount), effective_start: start, effective_end: end, source: 'HRMS', reference });
  const curSal = new Map<number, any>();
  for (const s of (await c.query(`SELECT DISTINCT ON (person_id) * FROM hcm.salaries ORDER BY person_id, date_from DESC`)).rows) curSal.set(s.person_id, s);
  const prevSal = new Map<number, any>();
  for (const s of (await c.query(`SELECT DISTINCT ON (person_id) * FROM hcm.salaries WHERE date_from < $1 ORDER BY person_id, date_from DESC`, [promoFrom])).rows) prevSal.set(s.person_id, s);
  for (const sp of persons) {
    if (sp.id === persona.joiner) continue;
    const s = sp.id === planted.payPromo ? prevSal.get(sp.id) : curSal.get(sp.id);
    if (!s) continue;
    const start = s.date_from > iso(addMonths(A, -10)) ? s.date_from : iso(monthStart(A, -10));
    const end = leftIds.has(sp.id) && sp.id !== planted.payLeaver
      ? (await c.query('SELECT last_working_day FROM hcm.work_relationships WHERE person_id=$1', [sp.id])).rows[0].last_working_day
      : '4712-12-31';
    entry(sp.id, 'BASIC', s.basic, start, end);
    if (sp.id !== planted.payJoiner) entry(sp.id, 'HOUSING', s.housing, start, end);
    entry(sp.id, 'TRANSPORT', s.transport, start, end);
    entry(sp.id, 'OTHER_ALW', s.other_allowance, start, end);
    if (sp.id !== planted.payJoiner) {
      const gp = gosi(s.basic + s.housing, regOf.get(sp.id) ?? sp.hire, sp.nat === 'SA', A);
      if (gp.employee > 0) entry(sp.id, 'GOSI_EE', gp.employee, start, end);
      entry(sp.id, 'GOSI_ER', gp.employer, start, end);
    }
  }
  // Planted: deduction cap — an advance recovery booked at an amount that pushes deductions past 50%.
  {
    const s = curSal.get(planted.payCap)!;
    const gross = s.basic + s.housing + s.transport + s.other_allowance;
    entry(planted.payCap, 'ADVANCE_REC', r50(gross * 0.54), iso(monthStart(A, 0)), iso(monthEnd(A, 3)), 'DEMO-ADV-2026-0091');
  }
  // Planted: overtime spike, approved.
  entry(planted.payOT, 'OVERTIME', 4200, iso(monthStart(A, 0)), iso(monthEnd(A, 0)), 'Approved overtime: system go-live weekend');
  await insertMany(c, 'hcm.element_entries', ee);
  await c.query(`UPDATE hcm.persons SET iban_masked = 'SA•• PENDING VERIFICATION', bank_name = 'Saudi Awwal Bank (changed)' WHERE id = $1`, [planted.payIban]);

  // ------------------------------------------------------------ payroll periods & results (closed months)
  const periods: any[] = [];
  for (let k = -9; k <= 0; k++) {
    const st = monthStart(A, k), en2 = monthEnd(A, k);
    const dt = periodDates(client.key, A, st, k === 0);
    periods.push({ period_name: iso(st).slice(0, 7), start_date: iso(st), end_date: iso(en2), cutoff_date: iso(dt.cutoff), pay_date: iso(dt.pay), status: k < 0 ? 'CLOSED' : 'OPEN' });
  }
  const periodIds = await insertMany(c, 'hcm.payroll_periods', periods, 'id, period_name, start_date, end_date');
  const allEntries = (await c.query(`SELECT e.*, t.classification, t.name FROM hcm.element_entries e JOIN hcm.element_types t ON t.code = e.element_code`)).rows;
  const wrAll = new Map((await c.query('SELECT person_id, start_date, end_date FROM hcm.work_relationships')).rows.map((w: any) => [w.person_id, w]));
  const results: any[] = [];
  // Clients on Oracle: the HRMS's own results, as before. Clients held in Tasama HR: the payroll engine, after the leave data below.
  if (client.hrms !== 'PLATFORM') for (const p of periodIds.slice(0, -1)) {
    for (const [pid, w] of wrAll) {
      if (pid === persona.joiner) continue;
      if (w.start_date > p.end_date || (w.end_date && w.end_date < p.start_date)) continue;
      const start = w.start_date > p.start_date ? w.start_date : p.start_date;
      const end = w.end_date && w.end_date < p.end_date ? w.end_date : p.end_date;
      const days = Math.min(30, daysBetween(start, end) + 1);
      // for the payroll results of the planted promotee/leaver last month, use what was actually paid: old entries
      const lines = allEntries.filter((e: any) => e.person_id === pid && e.effective_start <= p.end_date && e.effective_end >= p.start_date && !['ADVANCE_REC', 'OVERTIME'].includes(e.element_code));
      let gross = 0, ded = 0, er = 0;
      const out = lines.map((e: any) => {
        const amt = e.classification === 'EARNING' ? round2(e.amount * days / 30) : e.amount;
        if (e.classification === 'EARNING') gross += amt; else if (e.classification === 'DEDUCTION') ded += amt; else er += amt;
        return { code: e.element_code, name: e.name, amount: amt, kind: e.classification };
      });
      if (!out.length) continue;
      results.push({ period_id: p.id, person_id: pid, days_paid: days, gross: round2(gross), deductions: round2(ded), employer_contributions: round2(er), net: round2(gross - ded), lines: out, wps_status: 'PAID' });
    }
  }
  await insertMany(c, 'hcm.payroll_results', results);

  // ------------------------------------------------------------ absence
  await insertMany(c, 'hcm.absence_types', ABSENCE_TYPES.map((t) => ({ code: t.code, name: t.name, name_ar: t.name_ar, plan: t.plan, annual_entitlement: t.ent, paid_rule: t.paid, requires_certificate: t.cert, legal_ref: t.legal })));
  const balRows: any[] = [], absRows: any[] = [];
  let an = 1;
  for (const pid of active) {
    const sp = persons.find((x) => x.id === pid)!;
    const ent = annualEntitlement(sp.hire, A);
    const carried = sp.hire < addDays(A, -400) ? R.int(0, P.carryForwardMax) : 0;
    const ytdFrac = daysBetween(new Date(Date.UTC(year, 0, 1)), A) / 365;
    let taken = 0;
    const nTrips = R.int(1, 3);
    for (let t = 0; t < nTrips; t++) {
      const len = R.pick([3, 5, 5, 7, 10, 14]);
      const st = addDays(new Date(Date.UTC(year, 0, 1)), R.int(10, Math.max(11, Math.floor(ytdFrac * 365) - 20)));
      if (taken + len > ent + carried - 4) break;
      taken += len;
      absRows.push({ absence_number: `DEMO-ABS-${String(an++).padStart(5, '0')}`, person_id: pid, type_code: 'ANNUAL', start_date: iso(st), end_date: iso(addDays(st, len - 1)), days: len, status: 'COMPLETED', approver_person_id: managerOf.get(pid) ?? null, submitted_at: addDays(st, -14), comments: null, source: 'HRMS' });
    }
    let sick = 0;
    if (R.chance(0.45)) { sick = R.int(1, 4); const st = addDays(A, -R.int(15, 200)); absRows.push({ absence_number: `DEMO-ABS-${String(an++).padStart(5, '0')}`, person_id: pid, type_code: 'SICK', start_date: iso(st), end_date: iso(addDays(st, sick - 1)), days: sick, status: 'COMPLETED', approver_person_id: managerOf.get(pid) ?? null, submitted_at: st, comments: 'Medical certificate received', source: 'HRMS' }); }
    // upcoming approved leave in the next 3 weeks for some (team cover conflicts)
    let booked = 0;
    if (R.chance(0.09) || pid === planted.teamA) {
      const st = pid === planted.teamA ? addDays(A, 12) : addDays(A, R.int(2, 20));
      const len = pid === planted.teamA ? 7 : R.pick([3, 5]);
      booked = len;
      absRows.push({ absence_number: `DEMO-ABS-${String(an++).padStart(5, '0')}`, person_id: pid, type_code: 'ANNUAL', start_date: iso(st), end_date: iso(addDays(st, len - 1)), days: len, status: 'APPROVED', approver_person_id: managerOf.get(pid) ?? null, submitted_at: addDays(A, -10), comments: null, source: 'HRMS' });
    }
    balRows.push({ person_id: pid, year, type_code: 'ANNUAL', entitlement: ent, carried_over: pid === persona.employee ? 2 : carried, taken, booked });
    balRows.push({ person_id: pid, year, type_code: 'SICK', entitlement: 120, carried_over: 0, taken: sick, booked: 0 });
  }
  // Planted: unpaid leave approved this month, never sent to payroll as a deduction.
  absRows.push({ absence_number: `DEMO-ABS-${String(an++).padStart(5, '0')}`, person_id: planted.payUnpaid, type_code: 'UNPAID', start_date: iso(addDays(monthStart(A, 0), 0)), end_date: iso(addDays(monthStart(A, 0), 2)), days: 3, status: 'APPROVED', approver_person_id: managerOf.get(planted.payUnpaid) ?? null, submitted_at: addDays(monthStart(A, 0), -9), comments: 'Family matter', source: 'HRMS' });
  await insertMany(c, 'hcm.absence_balances', balRows);
  await insertMany(c, 'hcm.absences', absRows);

  // ------------------------------------------------------------ closed months from the payroll engine (Tasama HR clients)
  if (client.hrms === 'PLATFORM') {
    const rules = readRules(client, policiesFor(client)).map((r) => ({ key: r.key, dim: r.dim, value: r.value, num: r.num, flag: r.flag }));
    const terms = termsFromRules(`${client.short} policy 1.0`, rules);
    const absorbedGrades = new Set(gosiAbsorbedGrades(rules));
    const gradeOf = new Map(persons.map((x) => [x.id, `G${String(x.grade).padStart(2, '0')}`]));
    const balOf = new Map(balRows.filter((b) => b.type_code === 'ANNUAL').map((b) => [b.person_id, b]));
    const taken = absRows.filter((a) => a.type_code === 'ANNUAL' && a.status === 'COMPLETED');
    const unpaidAbs = absRows.filter((a) => a.type_code === 'UNPAID' && a.status !== 'REJECTED');
    const results2: any[] = [], provisions: any[] = [];
    for (const p of periodIds.slice(0, -1)) {
      const ps = iso(parse(p.start_date)), pe = iso(parse(p.end_date));
      const people: EngineEmployee[] = [];
      for (const [pid, w] of wrAll) {
        if (pid === persona.joiner) continue;
        const ws = iso(parse(w.start_date)), we = w.end_date ? iso(parse(w.end_date)) : null;
        if (ws > pe || (we && we < ps)) continue;
        const es = allEntries.filter((e: any) => e.person_id === pid && iso(parse(e.effective_start)) <= pe && iso(parse(e.effective_end)) >= ps);
        const elements: Record<string, number> = {};
        for (const e of es) if (ELEMENT_OF[e.element_code]) elements[ELEMENT_OF[e.element_code]] = Number(e.amount);
        if (!Object.keys(elements).length) continue;
        const sp = persons.find((x) => x.id === pid);
        const bal = balOf.get(pid);
        const used = taken.filter((a) => a.person_id === pid && a.end_date <= pe).reduce((n, a) => n + a.days, 0);
        const unpaidDays = unpaidAbs.filter((a) => a.person_id === pid && a.start_date <= pe && a.end_date >= ps).reduce((n, a) => n + a.days, 0);
        people.push({
          ref: String(pid), isSaudi: sp?.nat === 'SA', hire: ws, lastDay: we, gosiFirstRegistered: regOf.get(pid) ?? ws,
          gosiRegistered: es.some((e: any) => e.element_code === 'GOSI_ER'), gosiAbsorbed: absorbedGrades.has(gradeOf.get(pid) ?? '') || undefined,
          elements, unpaidLeaveDays: unpaidDays || undefined,
          earnings: es.filter((e: any) => e.element_code === 'OVERTIME').map((e: any) => ({ code: 'overtime', label: 'Overtime', amount: Number(e.amount) })),
          deductions: es.filter((e: any) => e.element_code === 'ADVANCE_REC').map((e: any) => ({ code: 'advance', label: 'Advance recovery', amount: Number(e.amount), kind: 'ADVANCE' as const })),
          leave: { entitlementDays: bal?.entitlement ?? annualEntitlement(ws, A), carryoverDays: bal?.carried_over ?? 0, usedDaysYtd: used },
        });
      }
      const run = runPayroll({ start: ps, end: pe }, terms, people);
      for (const r of run.employees) {
        const lines = r.lines.map((l) => ({ code: HCM_OF[l.code] ?? l.code.toUpperCase(), name: l.label, amount: l.amount, kind: l.kind === 'EMPLOYER' ? 'EMPLOYER_CONTRIBUTION' : l.kind, rule: l.rule }));
        const er = r.lines.filter((l) => l.kind === 'EMPLOYER').reduce((n, l) => n + l.amount, 0);
        results2.push({ period_id: p.id, person_id: Number(r.ref), days_paid: r.payDays, gross: r.gross, deductions: r.deductions, employer_contributions: round2(er), net: r.net, lines, wps_status: 'PAID' });
        const pv = r.provisions;
        provisions.push({ period_id: p.id, person_id: Number(r.ref), eos_wage: round2(pv.eos.wage), eos_accrued: round2(pv.eos.accrued), eos_month: round2(pv.eos.month), leave_days: Math.round(pv.leave.balanceDays * 1000) / 1000, leave_accrued: round2(pv.leave.accrued), leave_month: round2(pv.leave.monthCost), rules: { eos: pv.eos.rule, leave: pv.leave.rule, terms: run.terms } });
      }
    }
    await insertMany(c, 'hcm.payroll_results', results2);
    await insertMany(c, 'hcm.payroll_provisions', provisions);
  }

  // ------------------------------------------------------------ talent: goals, check-ins, reviews, profiles
  const fy = (y: number) => `FY${y}`;              // performance year label; the cycle closing now
  const curFY = A.getUTCMonth() >= 9 ? year : year - 1; // the year that just closed if we are in Oct-Dec
  const goalTitles: [string, string][] = [
    ['Deliver my unit annual plan milestones', 'تحقيق مراحل الخطة السنوية لوحدتي'], ['Improve customer satisfaction score', 'تحسين مؤشر رضا العملاء'],
    ['Deliver the digital self-service release', 'إطلاق خدمة الخدمة الذاتية الرقمية'], ['Reduce process cycle time by 15%', 'تقليص زمن دورة العمليات بنسبة 15%'],
    ['Complete the annual compliance training', 'إتمام التدريب السنوي على الامتثال'], ['Close audit findings on time', 'إغلاق ملاحظات التدقيق في موعدها'],
    ['Meet the Saudization plan for my department', 'تحقيق خطة التوطين في إدارتي'], ['Develop one successor in my team', 'تطوير خليفة واحد في فريقي'],
  ];
  const goals: any[] = [], checkins: any[] = [], docs: any[] = [], profiles: any[] = [];
  let dn = 1;
  const commercial = new Set(DEPARTMENTS.filter((d) => d.division === 'Commercial').map((d) => d.code));
  for (const pid of active) {
    const sp = persons.find((x) => x.id === pid)!;
    const mgr = managerOf.get(pid) ?? null;
    const perf = Math.max(1, Math.min(5, Math.round(R.normal(3.15, 0.75))));
    const tp = (rk: number) => Math.max(10, Math.min(100, Math.round(R.normal(55 + rk * 9, 12))));
    const prog = tp(perf);
    for (let gi = 0; gi < 3; gi++) {
      const [t, ta] = goalTitles[(pid + gi * 3) % goalTitles.length];
      goals.push({ person_id: pid, year: curFY, title: t, title_ar: ta, weight: [40, 35, 25][gi], progress: Math.max(5, Math.min(100, prog + R.int(-12, 12))), status: prog >= 90 ? 'COMPLETED' : prog < 50 ? 'AT_RISK' : 'ON_TRACK' });
      goals.push({ person_id: pid, year: curFY + 1, title: t, title_ar: ta, weight: [40, 35, 25][gi], progress: 0, status: 'NOT_STARTED' });
    }
    if (mgr) for (let k = 1; k <= 3; k++) checkins.push({ person_id: pid, manager_id: mgr, check_in_date: iso(addDays(A, -k * 85 - R.int(0, 20))), topics: R.pick(['Goal progress and blockers', 'Customer feedback and service quality', 'Development plan and training', 'Workload and priorities']), sentiment: perf <= 2 && k === 1 ? 'CONCERN' : R.pick(['POSITIVE', 'POSITIVE', 'NEUTRAL']) });
    for (const y of [curFY - 2, curFY - 1]) {
      if (sp.hire > parse(`${y}-07-01`)) continue;
      const rr = Math.max(1, Math.min(5, Math.round(R.normal(perf, 0.6))));
      docs.push({ doc_number: `DEMO-PD-${y}-${String(dn++).padStart(4, '0')}`, person_id: pid, manager_id: mgr, review_period: fy(y), status: 'COMPLETED', self_rating: Math.min(5, rr + R.int(0, 1)), manager_rating: rr, calibrated_rating: rr, manager_comment: null, calibration_note: null, updated_at: parse(`${y}-11-20`) });
    }
    if (sp.hire < parse(`${curFY}-07-01`)) {
      // current cycle: Commercial is at calibration; elsewhere self / manager evaluation in progress
      const inComm = commercial.has(sp.dept);
      let mr: number | null = inComm || R.chance(0.3) ? perf : null;
      if (mgr === planted.lenientMgr) mr = R.chance(0.6) ? 5 : 4;   // planted leniency
      const status = inComm ? 'CALIBRATION' : mr ? 'MANAGER_EVALUATION' : R.chance(0.5) ? 'SELF_EVALUATION' : 'NOT_STARTED';
      docs.push({ doc_number: `DEMO-PD-${curFY}-${String(dn++).padStart(4, '0')}`, person_id: pid, manager_id: mgr, review_period: fy(curFY), status, self_rating: status === 'NOT_STARTED' ? null : Math.min(5, perf + R.int(0, 1)), manager_rating: mr, calibrated_rating: null, manager_comment: mr ? R.pick(['Consistent delivery against goals.', 'Strong customer focus; needs to delegate more.', 'Exceeded targets in the second half.', 'Good progress; development needed in stakeholder management.']) : null, calibration_note: null, updated_at: addDays(A, -R.int(0, 6)) });
    }
    profiles.push({ person_id: pid, potential: R.weighted([['LOW', 20], ['MEDIUM', 55], ['HIGH', 25]] as const), flight_risk: R.weighted([['LOW', 65], ['MEDIUM', 25], ['HIGH', 10]] as const), readiness: sp.grade >= 8 ? R.pick(['READY_NOW', 'READY_1_2', 'READY_1_2', 'READY_3_PLUS']) : null, key_skills: [], mobility: R.pick(['OPEN', 'OPEN', 'LOCAL_ONLY']) });
  }
  await insertMany(c, 'hcm.goals', goals);
  await insertMany(c, 'hcm.check_ins', checkins);
  await insertMany(c, 'hcm.performance_documents', docs);
  await insertMany(c, 'hcm.talent_profiles', profiles);
  // Planted calibration contradictions in Commercial
  const commDocs = (await c.query(`SELECT pd.id, pd.person_id FROM hcm.performance_documents pd WHERE pd.review_period=$1 AND pd.status='CALIBRATION' ORDER BY pd.id`, [fy(curFY)])).rows;
  if (commDocs.length > 10) {
    await c.query(`UPDATE hcm.performance_documents SET manager_rating=2 WHERE id=$1`, [commDocs[3].id]);
    await c.query(`UPDATE hcm.goals SET progress=96, status='COMPLETED' WHERE person_id=$1 AND year=$2`, [commDocs[3].person_id, curFY]);
    await c.query(`UPDATE hcm.performance_documents SET manager_rating=5 WHERE id=$1`, [commDocs[7].id]);
    await c.query(`UPDATE hcm.goals SET progress=38, status='AT_RISK' WHERE person_id=$1 AND year=$2`, [commDocs[7].person_id, curFY]);
  }
  // Planted gender gap: women in the B2B / partnerships department rated a point lower on average.
  await c.query(`UPDATE hcm.performance_documents pd SET manager_rating = GREATEST(2, manager_rating - 1)
                   FROM hcm.persons p, hcm.assignments a
                  WHERE pd.person_id = p.id AND a.person_id = p.id AND a.effective_end = '4712-12-31' AND p.gender = 'F'
                    AND a.department_id = $1 AND pd.review_period = $2`, [deptIds.get('COR'), fy(curFY)]);
  // The promotee has two strong years.
  await c.query(`UPDATE hcm.performance_documents SET manager_rating=4, calibrated_rating=4 WHERE person_id=$1 AND status='COMPLETED'`, [planted.promotee]);
  await c.query(`UPDATE hcm.performance_documents SET manager_rating=4 WHERE person_id=$1 AND status<>'COMPLETED'`, [planted.promotee]);
  await c.query(`UPDATE hcm.talent_profiles SET potential='HIGH', readiness='READY_NOW', flight_risk='MEDIUM' WHERE person_id=$1`, [planted.promotee]);
  // The termination case: two weak ratings, a concern check-in, and NO improvement plan on file.
  await c.query(`UPDATE hcm.performance_documents SET manager_rating=2, calibrated_rating=2 WHERE person_id=$1 AND status='COMPLETED'`, [planted.terminee]);
  await c.query(`UPDATE hcm.performance_documents SET manager_rating=1 WHERE person_id=$1 AND status<>'COMPLETED'`, [planted.terminee]);

  // Succession plans for the executive and head roles
  const crit = positions.filter((p) => p.head && p.grade >= 12 && byPos.get(p.code));
  for (const p of crit.slice(0, 12)) {
    const inc = byPos.get(p.code)!;
    const [sp] = await insertMany(c, 'hcm.succession_plans', [{ position_id: p.id, incumbent_id: inc.id, risk_of_loss: R.pick(['LOW', 'MEDIUM', 'HIGH']), impact_of_loss: p.grade >= 14 ? 'HIGH' : 'MEDIUM' }], 'id');
    const cands = persons.filter((x) => x.dept === p.dept && x.grade >= p.grade - 3 && x.grade < p.grade && active.includes(x.id)).slice(0, 3);
    if (cands.length) await insertMany(c, 'hcm.succession_candidates', cands.map((x, i) => ({ plan_id: sp.id, person_id: x.id, readiness: ['READY_NOW', 'READY_1_2', 'READY_3_PLUS'][i] ?? 'READY_3_PLUS' })));
  }

  // Learning
  const items = await insertMany(c, 'hcm.learning_items', [
    { code: 'LRN-CODE-26', title: 'Code of conduct and anti-corruption annual certification', title_ar: 'الشهادة السنوية لمدونة السلوك ومكافحة الفساد', kind: 'COMPLIANCE', hours: 2 },
    { code: 'LRN-PDPL-01', title: 'Personal Data Protection Law essentials', title_ar: 'أساسيات نظام حماية البيانات الشخصية', kind: 'COURSE', hours: 3 },
    { code: 'LRN-CX-03', title: 'Customer conversations that build trust', title_ar: 'محادثات العملاء التي تبني الثقة', kind: 'COURSE', hours: 4 },
    { code: 'LRN-INFOSEC', title: 'Cybersecurity awareness (NCA controls)', title_ar: 'التوعية بالأمن السيبراني (ضوابط الهيئة الوطنية للأمن السيبراني)', kind: 'COMPLIANCE', hours: 1 },
    { code: 'LRN-LEAD-2', title: `Leading teams at ${client.short}`, title_ar: `قيادة الفرق في ${client.name_ar}`, kind: 'COURSE', hours: 12 },
    { code: 'LRN-PMP', title: 'Project Management Professional (PMP)', title_ar: 'شهادة إدارة المشاريع الاحترافية', kind: 'CERTIFICATION', hours: 40 },
  ], 'id, code');
  const enr: any[] = [];
  for (const pid of active) {
    const due = iso(addDays(A, R.int(-20, 60)));
    const st = R.weighted([['COMPLETED', 70], ['IN_PROGRESS', 15], ['ASSIGNED', 10], ['OVERDUE', 5]] as const);
    enr.push({ person_id: pid, item_id: items[0].id, status: st, due_date: due, completed_date: st === 'COMPLETED' ? iso(addDays(A, -R.int(5, 120))) : null });
    enr.push({ person_id: pid, item_id: items[3].id, status: 'COMPLETED', due_date: iso(addDays(A, -90)), completed_date: iso(addDays(A, -R.int(95, 200))) });
    if (R.chance(0.3)) enr.push({ person_id: pid, item_id: items[R.int(1, 2)].id, status: R.pick(['IN_PROGRESS', 'COMPLETED']), due_date: iso(addDays(A, 45)), completed_date: null });
  }
  await insertMany(c, 'hcm.learning_enrollments', enr);

  // ------------------------------------------------------------ recruiting
  const reqSpecs: { role: string; idx: number; criteria: { key: string; label: string; kind: 'must' | 'nice' }[]; saudiFirst?: boolean }[] = [
    { role: 'CXP-MGR', idx: 1, saudiFirst: true, criteria: [{ key: 'exp', label: '6+ years in customer service, 2+ leading a team', kind: 'must' }, { key: 'arabic', label: 'Fluent Arabic and English', kind: 'must' }, { key: 'fin', label: `${client.sector} experience`, kind: 'nice' }, { key: 'cx', label: 'CX certification (e.g. CCXP)', kind: 'nice' }] },
    { role: 'COR-RM', idx: 4, criteria: [{ key: 'exp', label: '7+ years in B2B account management', kind: 'must' }, { key: 'eos', label: 'Experience with Saudi corporate clients', kind: 'must' }, { key: 'book', label: 'Existing corporate client network', kind: 'nice' }] },
    { role: 'RSL-RO', idx: 17, saudiFirst: true, criteria: [{ key: 'exp', label: '2+ years in sales', kind: 'must' }, { key: 'arabic', label: 'Arabic and English', kind: 'must' }, { key: 'lic', label: 'Saudi driving licence', kind: 'nice' }] },
    { role: 'TEC-SE', idx: 5, criteria: [{ key: 'exp', label: '5+ years software engineering', kind: 'must' }, { key: 'stack', label: 'TypeScript and cloud services', kind: 'must' }, { key: 'fin', label: 'ERP or payments integration', kind: 'nice' }] },
    { role: 'DIG-DA', idx: 3, criteria: [{ key: 'sql', label: 'Advanced SQL and a BI tool', kind: 'must' }, { key: 'exp', label: '3+ years analytics', kind: 'must' }, { key: 'py', label: 'Python', kind: 'nice' }] },
    { role: 'CMP-OF', idx: 5, saudiFirst: true, criteria: [{ key: 'aml', label: 'Corporate compliance experience', kind: 'must' }, { key: 'cert', label: 'A compliance certification', kind: 'nice' }, { key: 'reg', label: 'Saudi regulatory exposure', kind: 'nice' }] },
    { role: 'RSK-AN', idx: 4, criteria: [{ key: 'exp', label: '3+ years in risk analysis', kind: 'must' }, { key: 'quant', label: 'Degree in finance, economics or a quantitative field', kind: 'must' }, { key: 'frm', label: 'FRM or progress towards it', kind: 'nice' }] },
    { role: 'MKT-DM', idx: 3, criteria: [{ key: 'exp', label: '4+ years digital marketing', kind: 'must' }, { key: 'ar', label: 'Arabic copywriting', kind: 'nice' }] },
    { role: 'SEC-AN', idx: 4, criteria: [{ key: 'exp', label: '3+ years security operations', kind: 'must' }, { key: 'cert', label: 'Security certification (e.g. CISSP, OSCP)', kind: 'nice' }] },
    { role: 'INV-AN', idx: 4, criteria: [{ key: 'cfa', label: 'Relevant degree and professional licence', kind: 'must' }, { key: 'exp', label: '2+ years in a similar role', kind: 'must' }, { key: 'sukuk', label: `${client.sector} experience`, kind: 'nice' }] },
  ];
  for (const rs of reqSpecs) rs.idx = vIdx(rs.role, rs.idx);
  // A small client may not have a second seat for some roles: drop those requisitions.
  for (let i = reqSpecs.length - 1; i >= 0; i--) if (!positions.some((p) => p.role === reqSpecs[i].role && p.idx === reqSpecs[i].idx)) reqSpecs.splice(i, 1);
  const reqRows: any[] = [];
  reqSpecs.forEach((rs, i) => {
    const p = positions.find((x) => x.role === rs.role && x.idx === rs.idx)!;
    const hm = headOf.get(p.dept)!;
    const filled = rs.role === 'INV-AN';
    reqRows.push({ req_number: `DEMO-REQ-${year}-${String(31 + i).padStart(3, '0')}`, position_id: p.id, title: p.title, title_ar: p.title_ar, hiring_manager_id: rs.role === 'CXP-MGR' ? persona.manager : hm.id, recruiter_id: i % 3 === 0 ? persona.ta : (persons.filter((x) => x.role === 'HUC-TAS')[i % 2] ?? persons.find((x) => x.role === 'HUC-TAS'))?.id ?? persona.ta, status: filled ? 'FILLED' : 'OPEN', openings: 1, opened_date: iso(addDays(A, -R.int(12, 60))), target_start_date: iso(addDays(A, R.int(40, 90))), saudi_priority: !!rs.saudiFirst, summary: `${p.title} in ${DEPARTMENTS.find((d) => d.code === p.dept)!.name}.`, criteria: rs.criteria });
  });
  const reqIds = await insertMany(c, 'hcm.requisitions', reqRows, 'id, req_number');
  const cands: any[] = [], apps: any[] = [];
  let cn = 40100;
  const srcs = ['Career site', 'LinkedIn', 'Referral', 'Agency', 'Jadarat', 'Career site', 'LinkedIn'];
  reqSpecs.forEach((rs, i) => {
    const n = rs.role === 'RSL-RO' ? 28 : R.int(9, 18);
    for (let k = 0; k < n; k++) {
      const nat = rs.saudiFirst && R.chance(0.45) ? 'SA' : R.weighted(N.nationalityMix(client.saudiShare));
      const gender: 'M' | 'F' = R.chance(0.45) ? 'F' : 'M';
      const nm = nameFor(R, nat, gender);
      const yrs = Math.max(0, Math.round(R.normal(6, 3)));
      cands.push({ candidate_number: `DEMO-CAN-${cn++}`, first_name: nm.first[0], last_name: nm.last[0], display_name_ar: `${nm.first[1]} ${nm.last[1]}`, gender, nationality: nat, is_saudi: nat === 'SA', email: `${nm.first[0].toLowerCase()}.${cn}@candidate.example`, current_employer: R.pick(['stc', 'SABIC', 'Almarai', 'Al Rajhi Bank', 'Elm', 'Saudia', 'Dar Al Arkan', 'A regional developer', 'A Big Four firm', 'A Riyadh start-up']), current_title: rs.role, years_experience: yrs, education: R.pick(["Bachelor's degree", "Bachelor's degree", "Master's degree", 'Diploma']), certifications: R.chance(0.3) ? [R.pick(['CFA Level II', 'CAMS', 'CCXP', 'CISSP', 'FRM Part I', 'PMP'])] : [], skills: [], source: nat === 'SA' && R.chance(0.5) ? 'Jadarat' : R.pick(srcs), internal_person_id: null });
      const phase = R.weighted([['NEW', 30], ['SCREENING', 25], ['SHORTLISTED', 15], ['INTERVIEW', 12], ['ASSESSMENT', 5], ['NOT_SELECTED', 13]] as const);
      apps.push({ application_number: `DEMO-APP-${cn}`, requisition_id: reqIds[i].id, candidate_id: 0, phase: rs.role === 'INV-AN' ? (k === 0 ? 'HIRED' : 'NOT_SELECTED') : phase, applied_at: addDays(A, -R.int(2, 40)), evidence: null, recruiter_decision: null, decision_reason: null, updated_at: addDays(A, -R.int(0, 5)) });
    }
  });
  const candIds = await insertMany(c, 'hcm.candidates', cands, 'id');
  apps.forEach((a, i) => { a.candidate_id = candIds[i].id; });
  // The joiner persona as the hired candidate of INV-AN
  const invIdx = reqSpecs.findIndex((x) => x.role === 'INV-AN');
  const arjunApp = apps.find((a) => a.requisition_id === reqIds[invIdx].id && a.phase === 'HIRED');
  const J = FIXED.joiner;
  if (arjunApp) await c.query(`UPDATE hcm.candidates SET first_name=$3, last_name=$4, display_name_ar=$5, nationality=$6, is_saudi=$7, gender=$8, internal_person_id=$1, certifications='{PMP}', years_experience=4 WHERE id=$2`, [persona.joiner, arjunApp.candidate_id, J.first[0], J.last[0], `${J.first[1]} ${J.last[1]}`, J.nat, J.nat === 'SA', J.gender]);
  await insertMany(c, 'hcm.applications', apps);
  if (arjunApp) {
    const appId = (await c.query('SELECT id FROM hcm.applications WHERE application_number=$1', [arjunApp.application_number])).rows[0].id;
    const g = gradeByRank(8);
    const jb = 14250, jh = pct(jb, P.housingPct), jt = pct(jb, P.transportPct), jo = pct(jb, OTHER_PCT);
    await insertMany(c, 'hcm.offers', [{ offer_number: `DEMO-OFF-${year}-0117`, application_id: appId, position_id: positions.find((p) => p.role === 'INV-AN' && p.idx === 4)!.id, grade_id: g.id, basic: jb, housing: jh, transport: jt, other_allowance: jo, start_date: iso(addDays(A, 17)), status: 'ACCEPTED', extended_at: addDays(A, -24), responded_at: addDays(A, -21) }]);
    await insertMany(c, 'hcm.salaries', [{ person_id: persona.joiner, assignment_number: `E${persons.find((x) => x.id === persona.joiner)!.person_number.slice(5)}`, date_from: iso(addDays(A, 17)), date_to: '4712-12-31', basic: jb, housing: jh, transport: jt, other_allowance: jo, action_code: 'HIRE', reason: 'Offer DEMO-OFF accepted' }]);
  }

  // Assessment centres
  const [acSel] = await insertMany(c, 'hcm.assessment_centres', [
    { code: `DEMO-AC-${year}-07`, name: `${DEPARTMENTS.find((d) => d.code === 'COR')!.name}: manager selection centre`, name_ar: undefined, purpose: 'SELECTION', centre_date: iso(addDays(A, -6)), exercises: JSON.stringify(['Client role-play', 'Case analysis', 'Competency interview']), competencies: JSON.stringify(['Client focus', 'Commercial judgement', 'Communication', 'Integrity']), status: 'INTEGRATION_PENDING' },
  ].map(({ name_ar, ...r }) => r), 'id');
  const [acDev] = await insertMany(c, 'hcm.assessment_centres', [{ code: `DEMO-AC-${year}-08`, name: 'Emerging leaders development centre', purpose: 'DEVELOPMENT', centre_date: iso(addDays(A, 21)), exercises: JSON.stringify(['Strategic presentation', 'Group exercise', 'In-tray']), competencies: JSON.stringify(['Leading others', 'Strategic thinking', 'Resilience', 'Collaboration']), status: 'SCHEDULED' }], 'id');
  const acRows: any[] = [];
  const corReqIdx = reqSpecs.findIndex((x) => x.role === 'COR-RM');
  const corApps = apps.filter((a) => a.requisition_id === reqIds[corReqIdx].id).slice(0, 4);
  const assessors = ['Head of Department', 'HR Business Partner', 'Senior Manager'];
  corApps.forEach((a, k) => {
    const cand = cands[apps.indexOf(a)];
    for (const ex of ['Client role-play', 'Case analysis', 'Competency interview']) for (const comp of ['Client focus', 'Commercial judgement', 'Communication', 'Integrity']) for (const as of assessors) {
      let score = Math.max(1, Math.min(5, Math.round(R.normal(3.2 + (k === 1 ? 0.6 : 0), 0.6))));
      if (k === 2 && comp === 'Commercial judgement' && as === 'HR Business Partner') score = 1;  // planted spread
      if (k === 2 && comp === 'Commercial judgement' && as === 'Head of Department') score = 4;
      acRows.push({ centre_id: acSel.id, participant: cand.candidate_number, participant_name: `${cand.first_name} ${cand.last_name}`, assessor: as, exercise: ex, competency: comp, score });
    }
  });
  await insertMany(c, 'hcm.assessment_results', acRows);
  void acDev;

  const deptHead = new Map<string, number>();
  for (const [k, v] of headOf) deptHead.set(k, v.id);
  const personByNumber = new Map(persons.map((p) => [p.person_number, p.id]));
  return { anchor: A, persona, personByNumber, planted, deptHead, hrbpForDivision, managerOf, active };
}
