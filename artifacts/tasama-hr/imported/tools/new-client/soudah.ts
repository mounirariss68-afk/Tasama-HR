/**
 * Soudah Development: the client Tasama takes on in scenario D10 (design/payroll-addendum.md §13, §19).
 *
 * EVERYTHING HERE IS FICTIONAL: the staff, their pay, the policy, the contract with Tasama and the
 * fact that the payroll is kept in Excel. This module is the truth the files are written from. The
 * server never imports it; it learns Soudah only from the files the presenter drops.
 */
import { rng, type Rng } from '../../apps/server/src/domain/rng.js';
import * as N from '../../apps/server/src/domain/names.js';
import type { ClientConfig } from '../../apps/server/src/domain/clients.js';
import { PAYROLL_POLICY, type PayrollPolicy } from '../../apps/server/src/domain/payroll-policy.js';

export const SOUDAH: ClientConfig = {
  key: 'soudah', code: 'SDH', name: 'Soudah Development', name_ar: 'شركة السودة للتطوير', short: 'Soudah',
  sector: 'Tourism and destination development', sector_ar: 'السياحة وتطوير الوجهات', city: 'Abha and Riyadh', city_ar: 'أبها والرياض',
  hrms: 'PLATFORM', hrmsLabel: 'Tasama HR employee master', finance: 'ODOO_ACC', size: 64, saudiShare: 0.72,
  nitaqat: { activity: 'Real estate development', band: 'Medium Green', requiredPct: 0.3 }, slowness: 1.1,
  policy: { annualLeave: 21, annualLeaveAfter5: 30, carryForwardMax: 5, probationDays: 200, housingPct: 25, transportPct: 10, weeklyHours: 48, remoteDays: 0,
    advanceMultiple: 1, advanceBasis: 'basic', advanceMinServiceMonths: 6, advanceMaxTerm: 10, letterHours: 24, ticket: 'biennial', educationAllowance: 0, educationChildren: 0,
    medicalClass: 'B', sickTopUpDays: 0, seniorNoticeDays: 60, bonusTargetPct: 10, payDay: 27, cutoffDay: 18 },
  contract: { model: 'Payroll managed service', model_ar: 'خدمة الرواتب المُدارة', services: ['PAYROLL'],
    pepm: 110, perHire: 0, start: '2026-11-01', term: 24, phase: 'BUILD', creditCapPct: 8 },
  orgRename: {}, roleRename: {},
  bank: ['Saudi National Bank', 'البنك الأهلي السعودي'],
};

/** Soudah's payroll terms, written in the standard clause wordings (§19). */
export const SOUDAH_PAY: PayrollPolicy = {
  weekDays: 'Sunday to Thursday', weekDays_ar: 'من الأحد إلى الخميس', shifts: 'Site, heritage and guest staff at Soudah work published rosters.', shifts_ar: 'يعمل موظفو الموقع والتراث والضيافة في السودة وفق جداول مناوبات معلنة.',
  graceMin: 10, latenessMethod: 'TABLE', roundMin: 0,
  overtimeWho: 'site and guest staff', overtimeWho_ar: 'موظفو الموقع والضيافة', overtimeCap: 30, holidayMultiple: 0, timeOffInstead: false,
  dayRate: 'D30', extra: [],
  housingAdvance: 'MONTHLY', educationSchedule: 'NONE', bonusTiming: 'paid in April', bonusTiming_ar: 'تُصرف في أبريل',
  merit: [0, 0, 3, 5, 7], eos: 'FIXED', gosiAbsorb: null, finalPay: 'LEGAL',
};
/** The generator's run-time registration; after go-live the client registry does the same from tasama.clients. */
export const registerSoudah = () => { PAYROLL_POLICY.soudah = SOUDAH_PAY; };

/* ------------------------------------------------------------------ organisation */

type Role = { title: string; title_ar: string; grade: string; count: number };
type Dept = { code: string; name: string; name_ar: string; location: 'Riyadh' | 'Soudah'; roles: Role[] };
const role = (title: string, title_ar: string, grade: string, count = 1): Role => ({ title, title_ar, grade, count });

export const DEPTS: Dept[] = [
  { code: 'EXE', name: 'Executive Office', name_ar: 'المكتب التنفيذي', location: 'Riyadh', roles: [role('Chief Executive Officer', 'الرئيس التنفيذي', 'G15'), role('Executive Assistant', 'مساعد تنفيذي', 'G07')] },
  { code: 'HRA', name: 'Human Resources', name_ar: 'الموارد البشرية', location: 'Riyadh', roles: [role('Head of Human Resources', 'رئيس الموارد البشرية', 'G12'), role('Payroll Officer', 'مسؤول رواتب', 'G08'), role('HR Officer', 'مسؤول موارد بشرية', 'G07', 2)] },
  { code: 'FIN', name: 'Finance', name_ar: 'المالية', location: 'Riyadh', roles: [role('Finance Controller', 'المراقب المالي', 'G12'), role('Accountant', 'محاسب', 'G08', 2)] },
  { code: 'DEV', name: 'Destination Development', name_ar: 'تطوير الوجهة', location: 'Riyadh', roles: [role('Director of Destination Development', 'مدير تطوير الوجهة', 'G13'), role('Development Manager', 'مدير تطوير', 'G11', 2), role('Master Planner', 'مخطط عمراني', 'G09', 3)] },
  { code: 'PRJ', name: 'Projects and Construction', name_ar: 'المشاريع والإنشاءات', location: 'Soudah', roles: [role('Director of Projects', 'مدير المشاريع', 'G13'), role('Project Manager', 'مدير مشروع', 'G11', 3), role('Site Engineer', 'مهندس موقع', 'G09', 5), role('Site Supervisor', 'مشرف موقع', 'G07', 4)] },
  { code: 'HER', name: 'Heritage and Culture', name_ar: 'التراث والثقافة', location: 'Soudah', roles: [role('Head of Heritage', 'رئيس التراث', 'G11'), role('Heritage Specialist', 'أخصائي تراث', 'G09', 2), role('Cultural Guide', 'مرشد ثقافي', 'G06', 4)] },
  { code: 'HOS', name: 'Hospitality and Guest Experience', name_ar: 'الضيافة وتجربة الزوار', location: 'Soudah', roles: [role('Head of Guest Experience', 'رئيس تجربة الزوار', 'G11'), role('Guest Experience Supervisor', 'مشرف تجربة الزوار', 'G08', 2), role('Guest Experience Officer', 'مسؤول تجربة الزوار', 'G06', 8)] },
  { code: 'MKT', name: 'Marketing and Communications', name_ar: 'التسويق والاتصال', location: 'Riyadh', roles: [role('Head of Marketing', 'رئيس التسويق', 'G11'), role('Marketing Specialist', 'أخصائي تسويق', 'G08', 2), role('Content Creator', 'صانع محتوى', 'G07')] },
  { code: 'ITD', name: 'Information Technology', name_ar: 'تقنية المعلومات', location: 'Riyadh', roles: [role('IT Manager', 'مدير تقنية المعلومات', 'G10'), role('IT Specialist', 'أخصائي تقنية معلومات', 'G08', 2)] },
  { code: 'OPS', name: 'Site Operations and Safety', name_ar: 'تشغيل الموقع والسلامة', location: 'Soudah', roles: [role('Operations Manager', 'مدير التشغيل', 'G10'), role('Safety Officer', 'مسؤول سلامة', 'G07', 3), role('Facilities Technician', 'فني مرافق', 'G05', 4), role('Driver', 'سائق', 'G04', 2)] },
  { code: 'GOV', name: 'Government Relations', name_ar: 'العلاقات الحكومية', location: 'Riyadh', roles: [role('Government Relations Officer', 'مسؤول علاقات حكومية', 'G07')] },
];
const GRADE_PAY: Record<string, [number, number]> = {
  G04: [4500, 6000], G05: [6000, 8000], G06: [7500, 10000], G07: [9500, 13000], G08: [12000, 16000], G09: [15000, 20000],
  G10: [18500, 25000], G11: [23000, 31000], G12: [29000, 38000], G13: [37000, 48000], G15: [62000, 75000],
};

/* ------------------------------------------------------------------ people */

export type Person = {
  no: string;                // the employee's true number
  masterNo: string;          // the number in the master data (differs for the duplicate)
  en: string; ar: string; first: string;
  gender: 'M' | 'F'; nat: string; isSaudi: boolean; marital: 'Single' | 'Married'; dependants: number;
  birth: string; nationalId: string; passport: string | null; mobile: string; email: string;
  dept: Dept; title: string; title_ar: string; grade: string; managerNo: string | null;
  hire: string; lastDay: string | null;
  basic: number; housing: number; transport: number;
  /** Basic before a promotion: the contract's figure and the payroll's until the letter's date. */
  promotion: { date: string; oldBasic: number; oldGrade: string; oldTitle: string } | null;
  contractBasic: number;     // the figure in the contract PDF
  masterHousing: number;     // the figure in the master data (differs for the housing slip)
  bankCode: string; bank: string; iban: string; masterIban: string;
  gosiFirst: string | null; masterGosi: string | null;
  contract: { type: 'Indefinite' | 'Fixed-term'; start: string; end: string | null; file: boolean };
  leave: { entitlement: number; carry: number; taken: number };
  unpaid: Record<string, number>;   // YYYY-MM -> unpaid days
};

const BANKS: [code: string, name: string][] = [['10', 'Saudi National Bank'], ['80', 'Al Rajhi Bank'], ['20', 'Riyad Bank'], ['05', 'Alinma Bank'], ['15', 'Bank Albilad'], ['55', 'Banque Saudi Fransi'], ['45', 'Saudi Awwal Bank']];

/** ISO 13616 check digits for a Saudi IBAN. */
export function ibanCheck(bban: string) {
  const digits = (bban + 'SA00').replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));
  let r = 0;
  for (const d of digits) r = (r * 10 + Number(d)) % 97;
  return String(98 - r).padStart(2, '0');
}
export const ibanValid = (iban: string) => {
  const s = iban.replace(/\s/g, '');
  if (!/^SA\d{22}$/.test(s)) return false;
  const digits = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));
  let r = 0;
  for (const d of digits) r = (r * 10 + Number(d)) % 97;
  return r === 1;
};
const spaced = (s: string) => s.replace(/(.{4})/g, '$1 ').trim();

const d10 = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const DAY = 86_400_000;
const between = (R: Rng, a: string, b: string) => d10(Date.parse(a) + Math.floor(R.next() * (Date.parse(b) - Date.parse(a)) / DAY) * DAY);
const round50 = (n: number) => Math.round(n / 50) * 50;

function nameFor(R: Rng, nat: string, gender: 'M' | 'F'): [N.NamePart, N.NamePart] {
  if (nat === 'SA') return [R.pick(gender === 'M' ? N.SAUDI_MALE : N.SAUDI_FEMALE), R.pick(N.SAUDI_FAMILY)];
  if (N.ARAB_FAMILY[nat]) return [R.pick(gender === 'M' ? N.ARAB_MALE : N.ARAB_FEMALE), R.pick(N.ARAB_FAMILY[nat])];
  if (N.SOUTH_ASIAN_FAMILY[nat]) return [R.pick(gender === 'M' ? N.SOUTH_ASIAN_MALE : N.SOUTH_ASIAN_FEMALE), R.pick(N.SOUTH_ASIAN_FAMILY[nat])];
  const o = N.OTHER[nat] ?? N.OTHER.GB;
  return [R.pick(gender === 'M' ? o.male : o.female), R.pick(o.family)];
}

/** The planted people, by role in the story (§19's table). */
export type Plants = {
  duplicate: [string, string];   // [owner of the number, the person entered under it]
  badIban: string[]; noGosi: string; housingSlip: string; mayJoiner: string; gosiLow: string; leaver: string;
  negativeLeave: string; promoted: string[]; unexplained: string; noContract: string[]; expired: string; chro: string; finance: string;
};

export function buildSoudah() {
  const R = rng(20261101);
  const people: Person[] = [];
  const used = new Set<string>();
  const mix = N.nationalityMix(SOUDAH.saudiShare);
  for (const dept of DEPTS) {
    for (const r of dept.roles) for (let i = 0; i < r.count; i++) {
      const nat = r.grade >= 'G12' || dept.code === 'GOV' || dept.code === 'HRA' ? 'SA' : R.weighted(mix);
      const isSaudi = nat === 'SA';
      const gender: 'M' | 'F' = dept.code === 'OPS' && r.grade <= 'G05' ? 'M' : R.chance(isSaudi ? 0.38 : 0.3) ? 'F' : 'M';
      let first: N.NamePart, last: N.NamePart, key: string;
      do { [first, last] = nameFor(R, nat, gender); key = `${first[0]} ${last[0]}`; } while (used.has(key));
      used.add(key);
      const senior = r.grade >= 'G11';
      const hire = senior ? between(R, '2021-02-01', '2024-06-30') : between(R, '2021-06-01', '2026-03-15');
      const [lo, hi] = GRADE_PAY[r.grade];
      const basic = round50(lo + R.next() * (hi - lo));
      const housing = Math.round(basic * SOUDAH.policy.housingPct / 100), transport = Math.round(basic * SOUDAH.policy.transportPct / 100);
      const age = senior ? R.int(36, 55) : R.int(23, 45);
      const [bankCode, bank] = R.weighted(BANKS.map((b, j) => [b, j === 0 ? 5 : j === 1 ? 4 : 1.5] as const));
      const acct = Array.from({ length: 18 }, () => R.int(0, 9)).join('');
      const bban = `${bankCode}${acct}`;
      const iban = `SA${ibanCheck(bban)}${bban}`;
      const years = (Date.parse('2026-10-31') - Date.parse(hire)) / (365.25 * DAY);
      const entitlement = years >= 5 ? SOUDAH.policy.annualLeaveAfter5 : SOUDAH.policy.annualLeave;
      people.push({
        no: '', masterNo: '', en: `${first[0]} ${last[0]}`, ar: `${first[1]} ${last[1]}`, first: first[0], gender, nat, isSaudi,
        marital: R.chance(age > 30 ? 0.75 : 0.35) ? 'Married' : 'Single', dependants: 0,
        birth: between(R, `${2026 - age - 1}-01-01`, `${2026 - age}-01-01`),
        nationalId: `${isSaudi ? 1 : 2}${Array.from({ length: 9 }, () => R.int(0, 9)).join('')}`,
        passport: isSaudi ? null : `${nat}${R.int(1000000, 9999999)}`,
        mobile: `05${R.int(0, 9)}${R.int(1000000, 9999999)}`, email: '',
        dept, title: r.title, title_ar: r.title_ar, grade: r.grade, managerNo: null,
        hire, lastDay: null, basic, housing, transport, promotion: null, contractBasic: basic, masterHousing: housing,
        bankCode, bank, iban: spaced(iban), masterIban: spaced(iban),
        gosiFirst: isSaudi ? hire : hire, masterGosi: hire,
        contract: { type: R.chance(isSaudi ? 0.15 : 0.5) && !senior ? 'Fixed-term' : 'Indefinite', start: hire, end: null, file: true },
        leave: { entitlement, carry: R.int(0, SOUDAH.policy.carryForwardMax), taken: 0 },
        unpaid: {},
      });
    }
  }
  // Fixed-term contracts run two years and are renewed until a date after the demo.
  for (const p of people) if (p.contract.type === 'Fixed-term') {
    let end = Date.parse(p.hire);
    while (d10(end) < '2026-12-31') end = Date.parse(`${new Date(end).getUTCFullYear() + 2}${d10(end).slice(4)}`);
    p.contract.end = d10(end - DAY);
    p.contract.start = d10(Date.parse(`${new Date(end).getUTCFullYear() - 2}${d10(end).slice(4)}`));
  }
  for (const p of people) p.dependants = p.marital === 'Married' ? R.int(0, 4) : 0;

  /* ---------- the plants ---------- */
  let byHire: Person[] = [];
  const pool = R.shuffle(people.filter((p) => !(p.dept.code === 'EXE' && p.grade === 'G15') && p.grade < 'G12' && p.dept.code !== 'HRA' && p.dept.code !== 'FIN'));
  const take = (f: (p: Person) => boolean) => { const i = pool.findIndex(f); if (i < 0) throw new Error('No one fits a plant'); return pool.splice(i, 1)[0]; };
  const expat = (p: Person) => !p.isSaudi, saudi = (p: Person) => p.isSaudi;

  // The May joiner, paid without housing in May and June.
  const mayJoiner = take((p) => p.grade <= 'G08');
  mayJoiner.hire = '2026-05-11'; mayJoiner.contract.start = mayJoiner.hire; mayJoiner.gosiFirst = mayJoiner.isSaudi ? mayJoiner.hire : mayJoiner.hire; mayJoiner.masterGosi = mayJoiner.hire;
  if (mayJoiner.contract.type === 'Fixed-term') mayJoiner.contract.end = '2028-05-10';
  // A Saudi first registered with GOSI in 2025, deducted at the old 9.75%.
  const gosiLow = take((p) => saudi(p) && p.grade <= 'G09');
  gosiLow.hire = '2025-03-02'; gosiLow.contract.start = gosiLow.hire; gosiLow.gosiFirst = gosiLow.hire; gosiLow.masterGosi = gosiLow.hire;
  if (gosiLow.contract.type === 'Fixed-term') gosiLow.contract.end = '2027-03-01';
  // Numbers follow the hire date, as a spreadsheet kept since the first hire would.
  byHire = [...people].sort((a, b) => a.hire.localeCompare(b.hire) || a.en.localeCompare(b.en));
  byHire.forEach((p, i) => { p.no = `SDH-${1001 + i}`; p.masterNo = p.no; p.email = `${p.first.toLowerCase()}.${p.en.split(' ').slice(1).join('').toLowerCase().replace(/[^a-z]/g, '')}@soudah.example`; });
  // Managers: the first role of each department reports to the CEO; the rest to it.
  const ceo = people.find((p) => p.dept.code === 'EXE' && p.grade === 'G15')!;
  for (const d of DEPTS) {
    const inDept = people.filter((p) => p.dept === d);
    const head = d.code === 'EXE' ? ceo : inDept[0];
    for (const p of inDept) p.managerNo = p === ceo ? null : p === head ? ceo.no : head.no;
  }

  // A Saudi with no GOSI registration date in the master data (registered long ago, on the old system).
  const noGosi = take((p) => saudi(p) && p.hire < '2023-06-01');
  noGosi.masterGosi = null;
  // Two IBANs that fail the check digits: two digits transposed, as a typist would.
  const badIban = [take(() => true), take(() => true)];
  for (const p of badIban) { const s = p.iban.replace(/\s/g, ''); const k = 10; p.masterIban = spaced(s.slice(0, k) + s[k + 1] + s[k] + s.slice(k + 2)); if (ibanValid(p.masterIban)) p.masterIban = spaced(s.slice(0, 6) + ((Number(s[6]) + 1) % 10) + s.slice(7)); }
  // One number used twice: the later hire was entered under an earlier colleague's number.
  const dupOwner = take((p) => p.hire < '2024-01-01');
  const dupOther = take((p) => p.hire > dupOwner.hire && p.hire < '2026-01-01');
  dupOther.masterNo = dupOwner.no;
  // Housing at 20% in the master data where the contract and the policy say 25%.
  const housingSlip = take(() => true);
  housingSlip.masterHousing = Math.round(housingSlip.basic * 0.2);
  // Two promotions on 1 June, explained by their letters; one difference nothing explains.
  const promoted = [take((p) => p.hire < '2025-06-01' && p.grade <= 'G09'), take((p) => p.hire < '2025-06-01' && p.grade <= 'G09')];
  for (const p of promoted) {
    const oldGrade = `G${String(Number(p.grade.slice(1)) - 1).padStart(2, '0')}`;
    const oldBasic = round50(p.basic / 1.12);
    p.promotion = { date: '2026-06-01', oldBasic, oldGrade, oldTitle: p.title };
    p.contractBasic = oldBasic;
  }
  const unexplained = take((p) => p.grade >= 'G07');
  unexplained.contractBasic = round50(unexplained.basic * 0.9);
  // Two employees with no contract in the folder; one fixed-term contract that ended on 31 August.
  const noContract = [take(() => true), take(() => true)];
  for (const p of noContract) p.contract.file = false;
  const expired = take((p) => p.hire < '2024-08-01' && p.hire > '2023-01-01');
  expired.contract = { type: 'Fixed-term', start: '2024-09-01', end: '2026-08-31', file: true };
  // One negative leave balance.
  const negativeLeave = take((p) => p.hire < '2025-01-01');

  // Leave taken this year; the negative one took more than it had.
  for (const p of people) {
    const accrued = p.leave.carry + p.leave.entitlement * 9 / 12;
    p.leave.taken = Math.min(Math.floor(accrued), R.int(0, Math.max(0, Math.floor(accrued * 0.8))));
  }
  negativeLeave.leave.taken = Math.ceil(negativeLeave.leave.carry + negativeLeave.leave.entitlement * 9 / 12 + 3);
  // A few unpaid days, as a spreadsheet records them.
  for (const p of R.shuffle(pool).slice(0, 3)) p.unpaid[R.pick(['2026-04', '2026-06', '2026-08'])] = R.int(1, 3);

  // The leaver: in the payroll from April to August, last day 31 July. Not in the master data.
  const [lf, ll] = nameFor(R, 'EG', 'M');
  const sup = DEPTS.find((d) => d.code === 'HOS')!;
  const lBasic = 9800;
  const leaver: Person = {
    no: `SDH-${1001 + people.length}`, masterNo: '', en: `${lf[0]} ${ll[0]}`, ar: `${lf[1]} ${ll[1]}`, first: lf[0], gender: 'M', nat: 'EG', isSaudi: false, marital: 'Married', dependants: 2,
    birth: '1988-03-14', nationalId: '2' + '418836027', passport: 'EG4471209', mobile: '0551840266', email: '', dept: sup, title: 'Guest Experience Officer', title_ar: 'مسؤول تجربة الزوار', grade: 'G06',
    managerNo: people.find((p) => p.dept === sup)!.no, hire: '2022-10-02', lastDay: '2026-07-31', basic: lBasic, housing: Math.round(lBasic * 0.25), transport: Math.round(lBasic * 0.1),
    promotion: null, contractBasic: lBasic, masterHousing: Math.round(lBasic * 0.25), bankCode: '80', bank: 'Al Rajhi Bank', iban: '', masterIban: '', gosiFirst: '2022-10-02', masterGosi: '2022-10-02',
    contract: { type: 'Indefinite', start: '2022-10-02', end: null, file: false }, leave: { entitlement: 21, carry: 2, taken: 12 }, unpaid: {},
  };
  { const bban = `80${'608010167519'}${'000123'}`; leaver.iban = spaced(`SA${ibanCheck(bban)}${bban}`); leaver.masterIban = leaver.iban; }

  const chro = people.find((p) => p.dept.code === 'HRA' && p.grade === 'G12')!;
  const finance = people.find((p) => p.dept.code === 'FIN' && p.grade === 'G12')!;
  const plants: Plants = {
    duplicate: [dupOwner.no, dupOther.no], badIban: badIban.map((p) => p.no), noGosi: noGosi.no, housingSlip: housingSlip.no, mayJoiner: mayJoiner.no,
    gosiLow: gosiLow.no, leaver: leaver.no, negativeLeave: negativeLeave.no, promoted: promoted.map((p) => p.no), unexplained: unexplained.no,
    noContract: noContract.map((p) => p.no), expired: expired.no, chro: chro.no, finance: finance.no,
  };
  return { people: byHire, leaver, plants };
}
