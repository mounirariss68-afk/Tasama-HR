/**
 * The bank registry and the file formats, as data (design/payroll-addendum.md §20, PAY-01 to PAY-03).
 * The codes are the published ones and are to be confirmed with each bank; the account numbers
 * in every IBAN the seed makes are synthetic.
 */
import { createHash } from 'node:crypto';

export type Bank = { code: string; name: string; name_ar: string; sarie: string; ibanCode: string; channel: string; aliases?: string[] };

export const BANKS: Bank[] = [
  { code: 'SNB', name: 'Saudi National Bank', name_ar: 'البنك الأهلي السعودي', sarie: 'NCBKSAJE', ibanCode: '10', channel: 'Corporate portal (AlAhli eCorp)' },
  { code: 'RJHI', name: 'Al Rajhi Bank', name_ar: 'مصرف الراجحي', sarie: 'RJHISARI', ibanCode: '80', channel: 'Corporate portal (Al Rajhi Business)' },
  { code: 'RIBL', name: 'Riyad Bank', name_ar: 'بنك الرياض', sarie: 'RIBLSARI', ibanCode: '20', channel: 'Corporate portal (Riyad Online Business)' },
  { code: 'SAB', name: 'Saudi Awwal Bank', name_ar: 'البنك السعودي الأول', sarie: 'SABBSARI', ibanCode: '45', channel: 'Corporate portal', aliases: ['SAB'] },
  { code: 'BSF', name: 'Banque Saudi Fransi', name_ar: 'البنك السعودي الفرنسي', sarie: 'BSFRSARI', ibanCode: '55', channel: 'Corporate portal' },
  { code: 'ANB', name: 'Arab National Bank', name_ar: 'البنك العربي الوطني', sarie: 'ARNBSARI', ibanCode: '30', channel: 'Corporate portal' },
  { code: 'INMA', name: 'Alinma Bank', name_ar: 'مصرف الإنماء', sarie: 'INMASARI', ibanCode: '05', channel: 'Corporate portal' },
  { code: 'ALBI', name: 'Bank Albilad', name_ar: 'بنك البلاد', sarie: 'ALBISARI', ibanCode: '15', channel: 'Corporate portal' },
  { code: 'BJAZ', name: 'Bank AlJazira', name_ar: 'بنك الجزيرة', sarie: 'BJAZSAJE', ibanCode: '60', channel: 'Corporate portal' },
  { code: 'SIBC', name: 'Saudi Investment Bank', name_ar: 'البنك السعودي للاستثمار', sarie: 'SIBCSARI', ibanCode: '65', channel: 'Corporate portal' },
  { code: 'GULF', name: 'Gulf International Bank Saudi Arabia', name_ar: 'بنك الخليج الدولي - السعودية', sarie: 'GULFSARI', ibanCode: '90', channel: 'Corporate portal' },
];

const norm = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z]/g, '');
/** The registry entry for a bank name as it appears in a master or a file. */
export function bankByName(name: string | null | undefined): Bank | null {
  if (!name) return null;
  const n = norm(name);
  return BANKS.find((b) => norm(b.name) === n || (b.aliases ?? []).some((a) => norm(a) === n)) ?? BANKS.find((b) => n.includes(norm(b.name)) || norm(b.name).includes(n)) ?? null;
}
export const bankByIban = (iban: string) => BANKS.find((b) => b.ibanCode === iban.replace(/\s/g, '').slice(4, 6)) ?? null;
export const bankByCode = (code: string) => BANKS.find((b) => b.code === code) ?? null;

/** ISO 13616 check: move the first four characters to the end, letters to numbers, mod 97 = 1. */
export function ibanValid(iban: string | null | undefined): boolean {
  const s = String(iban ?? '').replace(/\s/g, '').toUpperCase();
  if (!/^SA\d{22}$/.test(s)) return false;
  return mod97(s.slice(4) + s.slice(0, 4)) === 1;
}
function mod97(s: string) {
  const digits = s.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));
  let r = 0;
  for (const d of digits) r = (r * 10 + Number(d)) % 97;
  return r;
}
const digitsOf = (seed: string, n: number) => {
  let out = '';
  for (let i = 0; out.length < n; i++) out += BigInt('0x' + createHash('sha256').update(`${seed}:${i}`).digest('hex').slice(0, 15)).toString().slice(1);
  return out.slice(0, n);
};

/** A synthetic Saudi IBAN: the bank's two digits, an account derived from the seed, ending in `last4`, with valid check digits. */
export function syntheticIban(seed: string, bankName: string, last4: string): string {
  const bank = bankByName(bankName) ?? BANKS[0];
  const bban = bank.ibanCode + digitsOf(seed, 14) + last4.padStart(4, '0').slice(-4);
  const check = String(98 - mod97(bban + 'SA00')).padStart(2, '0');
  return `SA${check}${bban}`;
}
/** A synthetic ID number: 1 for a Saudi, 2 for an iqama, ten digits, ending as the masked form shows. */
export const syntheticNationalId = (seed: string, saudi: boolean, last3: string) => `${saudi ? '1' : '2'}${digitsOf(seed, 6)}${last3.padStart(3, '0').slice(-3)}`;
export const maskIban = (iban: string) => { const s = iban.replace(/\s/g, ''); return `${s.slice(0, 4)} •••• •••• •••• ${s.slice(-4)}`; };

/* ------------------------------------------------------------------ formats */

/** One field of a header, line or footer: where its value comes from and how it is written. */
export type Field = { name: string; label: string; source: string; width?: number; pad?: 'left' | 'right'; fill?: string; fmt?: 'amount' | 'amount-cents' | 'date' | 'date-compact' | 'int' | 'text' };
export type Format = {
  key: string; name: string; name_ar: string; basis: string; illustrative: boolean;
  type: 'TSV' | 'CSV' | 'FIXED'; encoding: 'UTF-8'; extension: string;
  header: Field[]; line: Field[]; footer: Field[]; headerRow?: boolean;
};

export const FORMATS: Format[] = [
  {
    key: 'WPS', name: 'WPS wages file', name_ar: 'ملف الأجور لنظام حماية الأجور', illustrative: false, type: 'TSV', encoding: 'UTF-8', extension: 'txt',
    basis: 'The Ministry of Human Resources WPS wages file specification: a header with the establishment and totals, one line per employee.',
    header: [
      { name: 'record', label: 'Record type', source: '"HDR"' }, { name: 'bank', label: 'Establishment bank (SARIE)', source: 'bankSarie' },
      { name: 'establishment', label: 'Establishment id', source: 'establishment' }, { name: 'account', label: 'Debit account', source: 'debitIban' },
      { name: 'currency', label: 'Currency', source: '"SAR"' }, { name: 'valueDate', label: 'Value date', source: 'valueDate', fmt: 'date-compact' },
      { name: 'total', label: 'Total amount', source: 'total', fmt: 'amount' }, { name: 'count', label: 'Number of records', source: 'count', fmt: 'int' },
      { name: 'ref', label: 'File reference', source: 'fileRef' }, { name: 'mol', label: 'Ministry establishment id', source: 'molId' },
    ],
    line: [
      { name: 'record', label: 'Record type', source: '"DTL"' }, { name: 'net', label: 'Net amount', source: 'net', fmt: 'amount' },
      { name: 'iban', label: 'Employee IBAN', source: 'iban' }, { name: 'name', label: 'Employee name', source: 'name' },
      { name: 'bank', label: 'Beneficiary bank (SARIE)', source: 'bankSarie' }, { name: 'basic', label: 'Basic salary', source: 'basic', fmt: 'amount' },
      { name: 'housing', label: 'Housing allowance', source: 'housing', fmt: 'amount' }, { name: 'other', label: 'Other earnings', source: 'other', fmt: 'amount' },
      { name: 'deductions', label: 'Deductions', source: 'deductions', fmt: 'amount' }, { name: 'idType', label: 'ID type', source: 'idType' },
      { name: 'id', label: 'ID number', source: 'nationalId' },
    ],
    footer: [],
  },
  {
    key: 'TASAMA_SHEET', name: 'Tasama bank sheet', name_ar: 'كشف البنك لدى تسامى', illustrative: false, type: 'CSV', encoding: 'UTF-8', extension: 'csv', headerRow: true,
    basis: 'The Bank File sheet of Tasama\'s July 2025 payroll template.',
    header: [],
    line: [
      { name: 'no', label: 'Employee No', source: 'employeeNo' }, { name: 'name', label: 'Employee Name', source: 'name' },
      { name: 'id', label: 'ID / Iqama', source: 'nationalId' }, { name: 'iban', label: 'IBAN', source: 'iban' }, { name: 'bank', label: 'Bank', source: 'bankName' },
      { name: 'basic', label: 'Basic', source: 'basic', fmt: 'amount' }, { name: 'housing', label: 'Housing', source: 'housing', fmt: 'amount' },
      { name: 'other', label: 'Other Earnings', source: 'other', fmt: 'amount' }, { name: 'deductions', label: 'Deductions', source: 'deductions', fmt: 'amount' },
      { name: 'net', label: 'Net Salary', source: 'net', fmt: 'amount' },
    ],
    footer: [{ name: 'label', label: '', source: '"TOTAL"' }, { name: 'gap', label: '', source: '""' }, { name: 'gap2', label: '', source: '""' }, { name: 'gap3', label: '', source: '""' }, { name: 'gap4', label: '', source: '""' },
      { name: 'basic', label: '', source: 'sumBasic', fmt: 'amount' }, { name: 'housing', label: '', source: 'sumHousing', fmt: 'amount' }, { name: 'other', label: '', source: 'sumOther', fmt: 'amount' },
      { name: 'deductions', label: '', source: 'sumDeductions', fmt: 'amount' }, { name: 'net', label: '', source: 'total', fmt: 'amount' }],
  },
  {
    key: 'SNB_FIXED', name: 'Saudi National Bank payroll upload', name_ar: 'ملف رواتب البنك الأهلي السعودي', illustrative: true, type: 'FIXED', encoding: 'UTF-8', extension: 'txt',
    basis: 'Illustrative fixed-width layout until Tasama supplies the bank\'s own template.',
    header: [
      { name: 'record', label: 'Record type', source: '"H"', width: 1 }, { name: 'account', label: 'Debit IBAN', source: 'debitIban', width: 24 },
      { name: 'valueDate', label: 'Value date', source: 'valueDate', fmt: 'date-compact', width: 8 }, { name: 'ref', label: 'File reference', source: 'fileRef', width: 16, pad: 'right' },
      { name: 'count', label: 'Records', source: 'count', fmt: 'int', width: 6, pad: 'left', fill: '0' }, { name: 'total', label: 'Total (halalas)', source: 'total', fmt: 'amount-cents', width: 15, pad: 'left', fill: '0' },
    ],
    line: [
      { name: 'record', label: 'Record type', source: '"D"', width: 1 }, { name: 'iban', label: 'Beneficiary IBAN', source: 'iban', width: 24 },
      { name: 'bank', label: 'Beneficiary bank', source: 'bankSarie', width: 8 }, { name: 'amount', label: 'Amount (halalas)', source: 'net', fmt: 'amount-cents', width: 15, pad: 'left', fill: '0' },
      { name: 'name', label: 'Beneficiary name', source: 'name', width: 35, pad: 'right' }, { name: 'id', label: 'ID number', source: 'nationalId', width: 10 },
      { name: 'ref', label: 'Employee reference', source: 'employeeNo', width: 12, pad: 'right' },
    ],
    footer: [{ name: 'record', label: 'Record type', source: '"T"', width: 1 }, { name: 'count', label: 'Records', source: 'count', fmt: 'int', width: 6, pad: 'left', fill: '0' }, { name: 'total', label: 'Total (halalas)', source: 'total', fmt: 'amount-cents', width: 15, pad: 'left', fill: '0' }],
  },
];
export const formatByKey = (k: string) => FORMATS.find((f) => f.key === k) ?? FORMATS[0];

/** Each seeded client's paying bank and format (PAY-04). A client taken on from Excel uses its main bank and the WPS file. */
export const CLIENT_BANKS: Record<string, { bank: string; format: string }> = {
  roshn: { bank: 'RJHI', format: 'TASAMA_SHEET' },
  riyadhair: { bank: 'SNB', format: 'SNB_FIXED' },
  redsea: { bank: 'RIBL', format: 'TASAMA_SHEET' },
  seven: { bank: 'INMA', format: 'WPS' },
  saudicoffee: { bank: 'ALBI', format: 'WPS' },
};

/* ------------------------------------------------------------------ the builder */

export type FileCtx = Record<string, string | number>;
export type FileLine = FileCtx;

function value(src: string, ctx: FileCtx) { return src.startsWith('"') ? src.slice(1, -1) : ctx[src] ?? ''; }
function fmt(v: string | number, f?: Field['fmt']): string {
  if (f === 'amount') return Number(v).toFixed(2);
  if (f === 'amount-cents') return String(Math.round(Number(v) * 100));
  if (f === 'int') return String(Math.round(Number(v)));
  if (f === 'date-compact') return String(v).replace(/-/g, '');
  return String(v);
}
function cell(fd: Field, ctx: FileCtx, type: Format['type']) {
  let s = fmt(value(fd.source, ctx), fd.fmt);
  if (type === 'FIXED' && fd.width) {
    s = s.length > fd.width ? s.slice(0, fd.width) : fd.pad === 'left' ? s.padStart(fd.width, fd.fill ?? ' ') : s.padEnd(fd.width, fd.fill ?? ' ');
  }
  if (type === 'CSV' && /[",\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  if (type === 'TSV') s = s.replace(/\t/g, ' ');
  return s;
}
function row(fields: Field[], ctx: FileCtx, type: Format['type']) { return fields.map((fd) => cell(fd, ctx, type)).join(type === 'TSV' ? '\t' : type === 'CSV' ? ',' : ''); }

/** Writes a file in a format from the header values and the lines. One builder for every format. */
export function buildFile(f: Format, head: FileCtx, lines: FileLine[]): string {
  const out: string[] = [];
  if (f.headerRow) out.push(f.line.map((x) => x.label).join(f.type === 'TSV' ? '\t' : ','));
  if (f.header.length) out.push(row(f.header, head, f.type));
  for (const l of lines) out.push(row(f.line, l, f.type));
  if (f.footer.length) out.push(row(f.footer, head, f.type));
  return out.join('\r\n') + '\r\n';
}

/** Reads a file back into its lines, so a file can be compared with another (PAY-10). */
export function readFile(f: Format, text: string): Record<string, string>[] {
  const rows = text.split(/\r?\n/).filter(Boolean);
  const body = rows.slice((f.headerRow ? 1 : 0) + (f.header.length ? 1 : 0), f.footer.length ? -1 : undefined);
  return body.map((r) => {
    const o: Record<string, string> = {};
    if (f.type === 'FIXED') { let i = 0; for (const fd of f.line) { o[fd.name] = r.slice(i, i + (fd.width ?? 0)).trim(); i += fd.width ?? 0; } }
    else { const parts = f.type === 'TSV' ? r.split('\t') : r.match(/("([^"]|"")*"|[^,]*)(,|$)/g)!.map((x) => x.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"')); f.line.forEach((fd, i) => { o[fd.name] = parts[i] ?? ''; }); }
    return o;
  });
}
