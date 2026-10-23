/**
 * Reading a new client's files (design/payroll-addendum.md §13, §19): workbooks with exceljs,
 * PDFs' text with unpdf. What each file is comes from its name and, failing that, its content.
 */
import ExcelJS from 'exceljs';
import { extractText, getDocumentProxy } from 'unpdf';

export type FileKind = 'MASTER' | 'PAYROLL' | 'PROVISIONS' | 'LEAVE' | 'POLICY' | 'CONTRACT' | 'LETTER' | 'OTHER';
export type Cell = string | number | null;
export type Sheet = { name: string; headers: string[]; rows: Record<string, Cell>[] };

/** What a dropped file is, from its path. */
export function kindOf(path: string): FileKind {
  const p = path.replace(/\\/g, '/'), base = p.split('/').pop() ?? p, low = base.toLowerCase();
  if (/\.xlsx?$/i.test(base)) {
    if (/master data/.test(low)) return 'MASTER';
    if (/payroll \d{4}-\d{2}/.test(low)) return 'PAYROLL';
    if (/provision/.test(low)) return 'PROVISIONS';
    if (/leave/.test(low)) return 'LEAVE';
    return 'OTHER';
  }
  if (/\.pdf$/i.test(base)) {
    if (/(^|\/)contracts\//i.test(p) || /contract/.test(low)) return 'CONTRACT';
    if (/(^|\/)letters\//i.test(p) || /letter|certificate/.test(low)) return 'LETTER';
    if (/policy|handbook|manual/.test(low)) return 'POLICY';
  }
  return 'OTHER';
}

const value = (v: ExcelJS.CellValue): Cell => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number' || typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'object') {
    if ('result' in v) return value((v as any).result);
    if ('richText' in v) return (v as any).richText.map((t: any) => t.text).join('');
    if ('text' in v) return String((v as any).text);
  }
  return String(v);
};

/** Every sheet of a workbook as rows keyed by the header row. A totals row ("Total") is dropped. */
export async function readWorkbook(buf: Buffer): Promise<Sheet[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);
  const out: Sheet[] = [];
  wb.eachSheet((ws) => {
    const headers: string[] = [];
    ws.getRow(1).eachCell({ includeEmpty: true }, (c, i) => { headers[i - 1] = String(value(c.value) ?? '').trim(); });
    const rows: Record<string, Cell>[] = [];
    ws.eachRow((row, n) => {
      if (n === 1) return;
      const r: Record<string, Cell> = {};
      headers.forEach((h, i) => { r[h] = value(row.getCell(i + 1).value); });
      if (Object.values(r).every((v) => v == null || v === '')) return;
      if (String(r[headers[0]] ?? '').trim() === 'Total') return;
      rows.push(r);
    });
    out.push({ name: ws.name, headers, rows });
  });
  return out;
}

/** A two-column sheet ("Legal name (English)" | "Soudah Development Company") as a lookup. */
export function pairs(sheet: Sheet): Record<string, string> {
  const out: Record<string, string> = {};
  const [k, v] = [sheet.headers[0], sheet.headers[1]];
  if (k && v) out[k] = v;
  for (const r of sheet.rows) if (r[k] != null) out[String(r[k])] = String(r[v] ?? '');
  return out;
}

/** A PDF's text, page by page, with its line breaks. */
export async function readPdf(buf: Buffer): Promise<string[]> {
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: false });
  return text as string[];
}

/** "Label: value" lines of a one-page document (a contract), by label. */
export function fields(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z][A-Za-z /]+):\s+(.+)$/);
    if (m) out[m[1].trim()] = m[2].trim();
  }
  return out;
}

export const money = (s: string | undefined | null) => {
  const m = String(s ?? '').match(/SAR\s*([\d,]+(?:\.\d+)?)/);
  return m ? Number(m[1].replace(/,/g, '')) : null;
};

/** "1 June 2026" → "2026-06-01". */
export function isoDate(s: string | undefined | null) {
  if (!s) return null;
  const t = Date.parse(`${s} UTC`);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

/** ISO 13616: a Saudi IBAN whose check digits are right. */
export function ibanValid(iban: string | null | undefined) {
  const s = String(iban ?? '').replace(/\s/g, '').toUpperCase();
  if (!/^SA\d{22}$/.test(s)) return false;
  const digits = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));
  let r = 0;
  for (const d of digits) r = (r * 10 + Number(d)) % 97;
  return r === 1;
}
