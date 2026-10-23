/**
 * Writes Soudah Development's shared folder (design/payroll-addendum.md §13, §19):
 *   demo-files/soudah/   what the presenter drops on Add a payroll client
 *   tools/new-client/expected.json   the truth the files were written from, for the checks
 *
 * Run: npx tsx tools/new-client/make.ts
 * The same seed writes the same people, pay and plants every time. The generator refuses to write
 * anything unless section 19's counts hold.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import JSZip from 'jszip';
import { buildSoudah, SOUDAH, registerSoudah, ibanValid, type Person } from './soudah.js';
import { runPayroll, eosAccrued, type EngineEmployee, type EmployeeResult } from '../../apps/server/src/domain/payroll/engine.js';
import { termsFromRules } from '../../apps/server/src/domain/payroll/terms.js';
import { truthRules } from '../../apps/server/src/domain/payroll-policy.js';
import { policiesFor } from '../../apps/server/src/domain/policies.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'demo-files', 'soudah');
const FIXED = new Date('2026-10-20T09:00:00Z');
const MONTHS = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];
const r2 = (n: number) => Math.round(n * 100) / 100;
const monthEnd = (m: string) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10);
const longDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const sar = (n: number) => `SAR ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

registerSoudah();
const { people, leaver, plants } = buildSoudah();
const POLICY_NAME = 'Soudah HR Policy Manual v3';
const terms = termsFromRules(POLICY_NAME, truthRules(SOUDAH));
const byNo = new Map(people.map((p) => [p.no, p]));
const P = (no: string) => byNo.get(no) ?? leaver;

/* ------------------------------------------------------------------ pay, true and as paid */

const basicOn = (p: Person, m: string) => (p.promotion && `${m}-01` < p.promotion.date ? p.promotion.oldBasic : p.basic);
function employee(p: Person, m: string, asPaid: boolean): EngineEmployee {
  const basic = basicOn(p, m);
  const housing = Math.round(basic * SOUDAH.policy.housingPct / 100), transport = Math.round(basic * SOUDAH.policy.transportPct / 100);
  const el = { basic, housing: asPaid && p.no === plants.mayJoiner && ['2026-05', '2026-06'].includes(m) ? 0 : housing, transport };
  const monthIdx = Number(m.slice(5, 7));
  return {
    ref: p.no, isSaudi: p.isSaudi, hire: p.hire,
    gosiFirstRegistered: asPaid && p.no === plants.gosiLow ? '2015-01-01' : p.gosiFirst ?? p.hire,
    lastDay: asPaid && p.no === plants.leaver && m === '2026-08' ? null : p.lastDay,
    elements: el, unpaidLeaveDays: p.unpaid[m] ?? 0,
    leave: { entitlementDays: p.leave.entitlement, carryoverDays: p.leave.carry, usedDaysYtd: Math.round(p.leave.taken * Math.min(1, monthIdx / 9)) },
  };
}
const inMonth = (p: Person, m: string, asPaid: boolean) => p.hire <= monthEnd(m) && (!p.lastDay || p.lastDay >= `${m}-01` || (asPaid && p.no === plants.leaver && m === '2026-08'));
function month(m: string, asPaid: boolean) {
  const staff = [...people, leaver].filter((p) => inMonth(p, m, asPaid));
  return runPayroll({ start: `${m}-01`, end: monthEnd(m) }, terms, staff.map((p) => employee(p, m, asPaid)));
}
const paid = Object.fromEntries(MONTHS.map((m) => [m, month(m, true)]));
const truth = Object.fromEntries(MONTHS.map((m) => [m, month(m, false)]));

// The history's differences: every person and month where what was paid differs from the engine under the policy.
const differences: { month: string; no: string; name: string; paid: number; due: number; difference: number }[] = [];
for (const m of MONTHS) {
  const due = new Map(truth[m].employees.map((e) => [e.ref, e]));
  for (const e of paid[m].employees) {
    const d = due.get(e.ref)?.net ?? 0;
    if (Math.abs(e.net - d) >= 0.01) differences.push({ month: m, no: e.ref, name: P(e.ref).en, paid: e.net, due: d, difference: r2(e.net - d) });
  }
}

/* ------------------------------------------------------------------ workbooks */

const HEAD = { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5B4636' } } } as const;
function book() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Soudah Development HR'; wb.lastModifiedBy = 'Soudah Development HR'; wb.created = FIXED; wb.modified = FIXED;
  return wb;
}
function sheet(wb: ExcelJS.Workbook, name: string, cols: [string, number, string?][], rows: (string | number | null)[][], total?: (string | number | null)[]) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = cols.map(([header, width, numFmt]) => ({ header, width, style: numFmt ? { numFmt } : {} }));
  ws.getRow(1).eachCell((c) => { c.font = HEAD.font; c.fill = HEAD.fill as any; });
  for (const r of rows) ws.addRow(r);
  if (total) { const t = ws.addRow(total); t.font = { bold: true }; }
  return ws;
}
/** Writes a workbook with fixed dates inside the zip, so the same seed writes the same bytes. */
async function save(wb: ExcelJS.Workbook, name: string) {
  const zip = await JSZip.loadAsync(Buffer.from(await wb.xlsx.writeBuffer()));
  const out = new JSZip();
  for (const f of Object.values(zip.files).sort((a, b) => a.name.localeCompare(b.name))) if (!f.dir) out.file(f.name, await f.async('nodebuffer'), { date: FIXED, createFolders: false });
  writeFileSync(join(OUT, name), await out.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } }));
}
const MONEY = '#,##0.00', DATE = 'yyyy-mm-dd';
const xdate = (d: string | null) => (d ? new Date(`${d}T00:00:00Z`) : null);

async function masterData() {
  const wb = book();
  const cols: [string, number, string?][] = [
    ['Employee No', 12], ['Employee Name (English)', 26], ['Employee Name (Arabic)', 24], ['National ID / Iqama', 14], ['Nationality', 13], ['Saudi / Expat', 10], ['Gender', 8],
    ['Marital Status', 11], ['Dependants', 10], ['Date of Birth', 12, DATE], ['Passport No', 13], ['Mobile', 12], ['Email', 30],
    ['Organisation', 30], ['Location', 10], ['Position', 30], ['Grade', 7], ['Line Manager No', 13], ['Hire Date', 12, DATE], ['Probation End', 12, DATE],
    ['Contract Type', 12], ['Contract Start', 12, DATE], ['Contract End', 12, DATE],
    ['Basic Salary', 12, MONEY], ['Housing Allowance', 12, MONEY], ['Transport Allowance', 12, MONEY], ['Other Allowance', 11, MONEY],
    ['Bank', 20], ['IBAN', 32], ['GOSI First Registration', 14, DATE], ['Annual Leave Entitlement', 12], ['Education', 16], ['Project', 22],
  ];
  const nat = (n: string) => ({ SA: 'Saudi', IN: 'Indian', PK: 'Pakistani', EG: 'Egyptian', JO: 'Jordanian', LB: 'Lebanese', SY: 'Syrian', PH: 'Filipino', GB: 'British', SD: 'Sudanese', YE: 'Yemeni', BD: 'Bangladeshi' } as Record<string, string>)[n] ?? n;
  const edu = (p: Person) => (p.grade >= 'G11' ? "Master's degree" : p.grade >= 'G07' ? "Bachelor's degree" : 'Diploma');
  const project = (p: Person) => (p.dept.location === 'Soudah' ? 'Soudah Peaks' : 'Head office');
  const rows = people.map((p) => {
    const probEnd = new Date(Date.parse(p.hire) + 89 * 86_400_000).toISOString().slice(0, 10);
    return [p.masterNo, p.en, p.ar, p.nationalId, nat(p.nat), p.isSaudi ? 'Saudi' : 'Expat', p.gender, p.marital, p.dependants, xdate(p.birth), p.passport, p.mobile, p.email,
      p.dept.name, p.dept.location, p.title, p.grade, p.managerNo, xdate(p.hire), xdate(probEnd), p.contract.type, xdate(p.contract.start), xdate(p.contract.end),
      p.basic, p.masterHousing, p.transport, 0, p.bank, p.masterIban, xdate(p.masterGosi), p.leave.entitlement, edu(p), project(p)];
  });
  sheet(wb, 'Master Data', cols, rows as any);
  await save(wb, 'Soudah - Master Data.xlsx');
}

async function payrollSheet(m: string) {
  const wb = book();
  const run = paid[m];
  const cols: [string, number, string?][] = [['Employee No', 12], ['Employee Name', 26], ['Organisation', 30], ['Grade', 7], ['Days Paid', 9], ['Unpaid Days', 9],
    ['Basic', 12, MONEY], ['Housing', 12, MONEY], ['Transport', 12, MONEY], ['Gross Salary', 13, MONEY], ['GOSI Employee', 12, MONEY], ['Total Deductions', 13, MONEY], ['Net Salary', 13, MONEY], ['GOSI Employer', 12, MONEY], ['Bank', 20], ['IBAN', 32]];
  const amt = (e: EmployeeResult, code: string) => e.lines.find((l) => l.code === code && l.kind === 'EARNING')?.amount ?? 0;
  const rows = run.employees.map((e) => {
    const p = P(e.ref);
    return [p === leaver ? p.no : p.masterNo, p.en, p.dept.name, p.promotion && `${m}-01` < p.promotion.date ? p.promotion.oldGrade : p.grade, e.payDays, p.unpaid[m] ?? 0,
      amt(e, 'basic'), amt(e, 'housing'), amt(e, 'transport'), e.gross, e.gosi.employee, e.deductions, e.net, e.gosi.employer, p.bank, p.masterIban];
  });
  const sum = (i: number) => r2(rows.reduce((s, r) => s + Number(r[i]), 0));
  const ws = sheet(wb, `Payroll ${m}`, cols, rows as any, ['Total', `${rows.length} employees`, null, null, null, null, sum(6), sum(7), sum(8), sum(9), sum(10), sum(11), sum(12), sum(13), null, null]);
  ws.headerFooter.oddHeader = `&LSoudah Development&CPayroll calculation, ${monthName(m)}&RPaid on ${SOUDAH.policy.payDay} ${monthName(m)}`;
  await save(wb, `Soudah - Payroll ${m}.xlsx`);
}

/** The September provisions as Soudah's sheet works them: half a month a year throughout (§19). */
const provisions = truth['2026-09'].employees.filter((e) => byNo.has(e.ref)).map((e) => {
  const p = P(e.ref);
  const wage = e.provisions.eos.wage, years = e.provisions.eos.serviceDays / 365;
  const balance = r2(p.leave.carry + p.leave.entitlement * 9 / 12 - p.leave.taken);
  return { no: p.no, masterNo: p.masterNo, name: p.en, hire: p.hire, wage, years: Math.round(years * 1000) / 1000, sheetEos: r2(wage * 0.5 * years), engineEos: r2(e.provisions.eos.accrued), balance, dayRate: r2(wage / 30), sheetLeave: r2(balance * wage / 30), engineLeave: r2(e.provisions.leave.accrued) };
});
async function provisionsSheet() {
  const wb = book();
  const cols: [string, number, string?][] = [['Employee No', 12], ['Employee Name', 26], ['Hire Date', 12, DATE], ['EOS Wage', 12, MONEY], ['Years of Service', 10, '0.000'], ['EOS Provision', 14, MONEY], ['Leave Balance (days)', 12, '0.00'], ['Leave Day Rate', 12, MONEY], ['Leave Provision', 14, MONEY]];
  const rows = provisions.map((x) => [x.masterNo, x.name, xdate(x.hire), x.wage, x.years, x.sheetEos, x.balance, x.dayRate, x.sheetLeave]);
  sheet(wb, 'Provisions 2026-09', cols, rows as any, ['Total', `${rows.length} employees`, null, r2(provisions.reduce((s, x) => s + x.wage, 0)), null, r2(provisions.reduce((s, x) => s + x.sheetEos, 0)), null, null, r2(provisions.reduce((s, x) => s + x.sheetLeave, 0))]);
  await save(wb, 'Soudah - EOSB and Leave Provisions 2026-09.xlsx');
}
async function leaveTracker() {
  const wb = book();
  const cols: [string, number, string?][] = [['Employee No', 12], ['Employee Name', 26], ['Entitlement 2026', 12], ['Carried from 2025', 12], ['Accrued to 30 Sep', 12, '0.00'], ['Taken 2026', 10], ['Balance', 10, '0.00']];
  const rows = people.map((p) => { const acc = r2(p.leave.entitlement * 9 / 12); return [p.masterNo, p.en, p.leave.entitlement, p.leave.carry, acc, p.leave.taken, r2(p.leave.carry + acc - p.leave.taken)]; });
  sheet(wb, 'Leave 2026', cols, rows as any);
  await save(wb, 'Soudah - Leave Tracker 2026.xlsx');
}

/* ------------------------------------------------------------------ PDFs */

function pdf(path: string, title: string, draw: (d: PDFKit.PDFDocument) => void) {
  return new Promise<void>((resolve) => {
    const d = new PDFDocument({ size: 'A4', margin: 56, info: { Title: title, Author: 'Soudah Development', Producer: 'Soudah Development HR', Creator: 'Soudah Development HR', CreationDate: FIXED, ModDate: FIXED } });
    const chunks: Buffer[] = [];
    d.on('data', (c: Buffer) => chunks.push(c));
    d.on('end', () => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, Buffer.concat(chunks)); resolve(); });
    draw(d);
    d.end();
  });
}
const letterhead = (d: PDFKit.PDFDocument) => {
  d.font('Helvetica-Bold').fontSize(14).fillColor('#5B4636').text('Soudah Development', { continued: false });
  d.font('Helvetica').fontSize(8).fillColor('#666').text('A PIF company · Soudah, Asir, and King Fahd Road, Riyadh · CR 1010000000 (fictional)').moveDown(1.5).fillColor('#000');
};
const field = (d: PDFKit.PDFDocument, k: string, v: string) => { d.font('Helvetica-Bold').fontSize(10).text(`${k}: `, { continued: true }).font('Helvetica').text(v); };

/** The handbook, from the clause library the other five clients' handbooks use, with Soudah's two planted rules. */
function handbook() {
  const policies = policiesFor(SOUDAH).filter((p) => p.id !== 'HR-13').map((p) => ({ ...p, clauses: p.clauses.map((k) => {
    if (k.ref === '3.4') return { ...k, en: k.en.replace(/^Probation at Soudah is 200 days[^.]*\./, 'Probation at Soudah is 200 days for every new employee.') };
    if (k.ref === '5.5') return { ...k, en: k.en.replace("fines in one month never exceed five days' wage.", "fines may be applied up to 10 days' wage a month.") };
    return k;
  }) }));
  return pdf(join(OUT, 'Soudah HR Policy Manual v3.pdf'), 'Soudah HR Policy Manual v3', (d) => {
    letterhead(d);
    d.moveDown(6).font('Helvetica-Bold').fontSize(26).text('HR Policy Manual', { align: 'center' }).moveDown(0.5);
    d.font('Helvetica').fontSize(13).text('Version 3 · approved by the Board HR Committee · effective 1 January 2026', { align: 'center' }).moveDown(3);
    d.fontSize(10).text('Contents', { align: 'left' }).moveDown(0.3);
    for (const p of policies) d.text(`${p.id}  ${p.title}`);
    for (const p of policies) {
      d.addPage();
      d.font('Helvetica-Bold').fontSize(15).fillColor('#5B4636').text(`${p.id}  ${p.title}`).fillColor('#000').moveDown(0.2);
      d.font('Helvetica').fontSize(8).fillColor('#666').text(`Policy owner: ${p.owner} · Version ${p.version}`).fillColor('#000').moveDown(0.8);
      for (const k of p.clauses) {
        d.font('Helvetica-Bold').fontSize(10).text(`${k.ref}  ${k.heading}`).moveDown(0.15);
        d.font('Helvetica').fontSize(9.5).text(k.en, { align: 'justify' }).moveDown(0.6);
      }
    }
  });
}

function contract(p: Person) {
  const basic = p.contractBasic;
  const grade = p.promotion ? p.promotion.oldGrade : p.grade;
  return pdf(join(OUT, 'Contracts', `${p.no} ${p.en}.pdf`), `Employment contract, ${p.en}`, (d) => {
    letterhead(d);
    d.font('Helvetica-Bold').fontSize(16).text('Employment Contract').moveDown(0.6);
    d.font('Helvetica').fontSize(10).text(`This contract is made between Soudah Development ("the Company") and the employee named below, under the Saudi Labor Law and its implementing regulations.`).moveDown(0.8);
    field(d, 'Employee number', p.no); field(d, 'Employee name', p.en); field(d, 'National ID / Iqama', p.nationalId);
    field(d, 'Position', p.promotion ? p.promotion.oldTitle : p.title); field(d, 'Grade', grade); field(d, 'Organisation', p.dept.name); field(d, 'Work location', p.dept.location === 'Soudah' ? 'Soudah, Asir' : 'Riyadh');
    d.moveDown(0.5);
    field(d, 'Contract type', p.contract.type); field(d, 'Start date', longDate(p.contract.start)); if (p.contract.end) field(d, 'End date', longDate(p.contract.end));
    field(d, 'Probation', '90 days from the start date');
    d.moveDown(0.5);
    field(d, 'Basic salary', `${sar(basic)} a month`);
    field(d, 'Housing allowance', `${sar(Math.round(basic * 0.25))} a month`);
    field(d, 'Transport allowance', `${sar(Math.round(basic * 0.1))} a month`);
    d.moveDown(0.8).font('Helvetica').fontSize(9.5).text('Working hours, leave, end-of-service benefits and all other terms follow the Company\'s HR Policy Manual in force and the Labor Law. Salary is paid monthly by bank transfer through the Wage Protection System.', { align: 'justify' });
    d.moveDown(3).text('For the Company ____________________          Employee ____________________');
  });
}

type Letter = { p: Person; kind: 'Promotion letter' | 'Salary certificate' | 'Salary transfer letter' | 'Warning letter'; date: string };
function letter(l: Letter) {
  const { p } = l;
  const gross = p.basic + Math.round(p.basic * 0.25) + Math.round(p.basic * 0.1);
  return pdf(join(OUT, 'Letters', `${p.no} - ${l.kind} - ${l.date}.pdf`), `${l.kind}, ${p.en}`, (d) => {
    letterhead(d);
    d.font('Helvetica').fontSize(10).text(longDate(l.date), { align: 'right' }).moveDown(1);
    d.font('Helvetica-Bold').fontSize(14).text(l.kind).moveDown(0.8).font('Helvetica').fontSize(10.5);
    if (l.kind === 'Promotion letter') {
      d.text(`Dear ${p.first},`).moveDown(0.5);
      d.text(`We are pleased to confirm your promotion from grade ${p.promotion!.oldGrade} to grade ${p.grade} as ${p.title}, effective ${longDate(p.promotion!.date)}. Your basic salary rises from ${sar(p.promotion!.oldBasic)} to ${sar(p.basic)} a month from that date, with the housing and transport allowances recalculated on the new basic salary.`).moveDown(0.5);
      field(d, 'Employee number', p.no);
    } else if (l.kind === 'Salary certificate') {
      d.text('To whom it may concern,').moveDown(0.5);
      d.text(`This is to certify that ${p.en}, employee number ${p.no}, national ID / iqama ${p.nationalId}, has worked at Soudah Development since ${longDate(p.hire)} as ${p.title}. The monthly gross salary is ${sar(gross)}: basic ${sar(p.basic)}, housing ${sar(Math.round(p.basic * 0.25))} and transport ${sar(Math.round(p.basic * 0.1))}. This certificate is issued at the employee's request without any liability on the Company.`);
    } else if (l.kind === 'Salary transfer letter') {
      d.text(`The Manager, ${p.bank}`).moveDown(0.5);
      d.text(`We confirm that ${p.en}, employee number ${p.no}, is employed by Soudah Development with a monthly gross salary of ${sar(gross)}. We undertake to transfer the salary to account ${p.iban} at your bank each month, and not to change the account without your written release.`);
    } else {
      d.text(`Dear ${p.first},`).moveDown(0.5);
      d.text(`This letter records a first written warning for repeated late arrival in August 2026, after you were heard on ${longDate(l.date)}. No deduction is made. A further violation within 180 days is handled under the Company's penalty table.`).moveDown(0.5);
      field(d, 'Employee number', p.no);
    }
    d.moveDown(3).text('Head of Human Resources, Soudah Development');
  });
}

/* ------------------------------------------------------------------ the counts (§19) */

const issues = [
  { n: 1, key: 'DUPLICATE_NUMBER', lane: 'roster', client: true, people: plants.duplicate },
  ...plants.badIban.map((no, i) => ({ n: 2 + i, key: 'IBAN_CHECK', lane: 'roster', client: true, people: [no] })),
  ...plants.noContract.map((no, i) => ({ n: 4 + i, key: 'NO_CONTRACT', lane: 'contracts', client: true, people: [no] })),
  { n: 6, key: 'CONTRACT_EXPIRED', lane: 'contracts', client: true, people: [plants.expired] },
  { n: 7, key: 'SALARY_UNEXPLAINED', lane: 'contracts', client: true, people: [plants.unexplained] },
  { n: 8, key: 'GOSI_DATE_MISSING', lane: 'roster', client: false, people: [plants.noGosi] },
  { n: 9, key: 'HOUSING_NOT_POLICY', lane: 'roster', client: false, people: [plants.housingSlip] },
  { n: 10, key: 'PROBATION_ABOVE_LAW', lane: 'policy', client: false, people: [] },
  { n: 11, key: 'FINES_ABOVE_LAW', lane: 'policy', client: false, people: [] },
  { n: 12, key: 'HOUSING_NOT_PAID', lane: 'history', client: false, people: [plants.mayJoiner] },
  { n: 13, key: 'GOSI_RATE', lane: 'history', client: false, people: [plants.gosiLow] },
  { n: 14, key: 'PAID_AFTER_LEAVING', lane: 'history', client: false, people: [plants.leaver] },
  { n: 15, key: 'LEAVE_NEGATIVE', lane: 'leave', client: false, people: [plants.negativeLeave] },
];
function assert(ok: boolean, what: string) { if (!ok) { console.error(`✗ ${what}`); process.exit(1); } }

async function main() {
  const contracts = people.filter((p) => p.contract.file);
  const letters: Letter[] = [
    ...plants.promoted.map((no) => ({ p: P(no), kind: 'Promotion letter' as const, date: '2026-05-20' })),
    { p: people.find((p) => p.dept.code === 'HOS' && !Object.values(plants).flat().includes(p.no) && p.grade === 'G06')!, kind: 'Warning letter', date: '2026-09-03' },
  ];
  const free = people.filter((p) => !Object.values(plants).flat().includes(p.no) && !letters.some((l) => l.p === p));
  const dates = ['2026-04-14', '2026-05-06', '2026-06-22', '2026-07-09', '2026-08-17', '2026-09-08', '2026-09-24', '2026-10-05'];
  free.slice(0, 8).forEach((p, i) => letters.push({ p, kind: 'Salary certificate', date: dates[i] }));
  free.slice(8, 15).forEach((p, i) => letters.push({ p, kind: 'Salary transfer letter', date: dates[(i + 3) % dates.length] }));

  // §13 and §19's counts.
  assert(people.length === 64, `64 rows in the master data (${people.length})`);
  assert(contracts.length === 62, `62 contracts (${contracts.length})`);
  assert(letters.length === 18, `18 letters (${letters.length})`);
  assert(issues.length === 15 && issues.filter((i) => i.client).length === 7, '15 issues, 7 for the client');
  assert(new Set(people.map((p) => p.masterNo)).size === 63, 'one number used twice');
  assert(people.filter((p) => !ibanValid(p.masterIban)).map((p) => p.no).sort().join() === [...plants.badIban].sort().join(), 'exactly the two planted IBANs fail');
  assert(people.filter((p) => p.contract.file && p.contractBasic !== p.basic).length === 3, 'three contract salaries differ from the master data');
  const held = new Set([plants.duplicate[1], ...plants.badIban]);
  assert(held.size === 3, 'three rows held');
  const who = new Set(differences.map((d) => d.no));
  assert(who.size === 3 && [plants.mayJoiner, plants.gosiLow, plants.leaver].every((n) => who.has(n)), `the history differs for the three planted people only (${[...who].join(', ')})`);
  assert(differences.filter((d) => d.no === plants.mayJoiner).length === 2 && differences.filter((d) => d.no === plants.gosiLow).length === 6 && differences.filter((d) => d.no === plants.leaver).length === 1, 'May and June, six months, and August');
  assert(people.filter((p) => p.leave.carry + p.leave.entitlement * 9 / 12 - p.leave.taken < 0).length === 1, 'one negative leave balance');

  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  await masterData();
  for (const m of MONTHS) await payrollSheet(m);
  await provisionsSheet();
  await leaveTracker();
  await handbook();
  for (const p of contracts) await contract(p);
  for (const l of letters) await letter(l);

  const expected = {
    client: { name: SOUDAH.name, employees: people.length, ready: people.length - held.size, held: [...held] },
    plants, issues,
    contracts: { matched: contracts.length, differences: 3, explained: plants.promoted.length, missing: plants.noContract, expired: plants.expired },
    letters: letters.map((l) => ({ no: l.p.no, kind: l.kind, date: l.date })),
    history: { months: MONTHS, differences, total: r2(differences.reduce((s, d) => s + d.difference, 0)), net: Object.fromEntries(MONTHS.map((m) => [m, paid[m].totals.net])) },
    provisions: { sheetEos: r2(provisions.reduce((s, x) => s + x.sheetEos, 0)), engineEos: r2(provisions.reduce((s, x) => s + x.engineEos, 0)), sheetLeave: r2(provisions.reduce((s, x) => s + x.sheetLeave, 0)), engineLeave: r2(provisions.reduce((s, x) => s + x.engineLeave, 0)), over5: provisions.filter((x) => x.years > 5).map((x) => x.no) },
    rules: { refused: ['probation', 'lateness.cap'] },
  };
  writeFileSync(join(ROOT, 'tools', 'new-client', 'expected.json'), JSON.stringify(expected, null, 2) + '\n');
  console.log(`✓ Soudah: ${people.length} employees, ${MONTHS.length} payroll months, ${contracts.length} contracts, ${letters.length} letters; ${issues.length} issues, ${issues.filter((i) => i.client).length} for the client`);
  console.log(`  History: ${differences.length} month lines over ${who.size} people, SAR ${expected.history.total} overpaid net; provisions ${expected.provisions.sheetEos} on the sheet against ${expected.provisions.engineEos}`);
}
main();
