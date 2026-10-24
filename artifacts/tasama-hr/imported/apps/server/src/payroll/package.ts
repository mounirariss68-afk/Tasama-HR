/**
 * The payroll package (design/payroll-ops-addendum.md 2.9, 2.11): what the client approves, as a PDF
 * summary with the three sign-offs and an Excel detail of every line. Built from the run's frozen lines,
 * or from the live draft before it is sent for validation; filed with the month's documents.
 */
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { client } from '../domain/rules.js';
import { currentRun, frozenRows } from './runs.js';
import { draftRun } from './run.js';
import type { PoolClient } from 'pg';

type Q = PoolClient | { query: PoolClient['query'] };
const fmt = (n: number) => Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (d: any) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '');

export async function packageData(c: Q) {
  const d = await draftRun(c);
  if (!d) return null;
  const run = await currentRun(c);
  const rows: any[] = run && run.state !== 'DRAFT' ? await frozenRows(c, run.id) : d.rows;
  const month = new Date(`${d.period.name}-01T00:00:00Z`).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const sum = (k: string) => rows.reduce((s, r) => s + Number(r[k] ?? 0), 0);
  const employer = rows.reduce((s, r) => s + (r.lines ?? []).filter((l: any) => l.kind === 'EMPLOYER').reduce((a: number, l: any) => a + l.amount, 0), 0);
  return {
    client: client(), period: d.period, month, rows, run,
    totals: { people: rows.length, gross: sum('gross'), deductions: sum('deductions'), net: sum('net'), employer, cost: sum('gross') + employer },
    differences: run?.differences ?? null,
    signoffs: [
      ['Prepared', run?.preparer ?? null, run?.prepared_at ?? null, 'Payroll specialist, Tasama'],
      ['Validated', run?.validator ?? null, run?.validated_at ?? null, 'Payroll lead, Tasama'],
      ['Approved', run?.approver ?? null, run?.approved_at ?? null, `HR operations, ${client().short}`],
    ] as [string, string | null, any, string][],
    fileBase: `${client().code}_Payroll_${d.period.name.replace('-', '')}`,
  };
}

export async function packagePdf(c: Q): Promise<{ name: string; buf: Buffer } | null> {
  const x = await packageData(c);
  if (!x) return null;
  const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `${x.client.short} payroll, ${x.month}`, Author: 'Tasama HR Services' } });
  const chunks: Buffer[] = [];
  doc.on('data', (b: Buffer) => chunks.push(b));
  const done = new Promise<void>((r) => doc.on('end', () => r()));
  doc.font('Helvetica-Bold').fontSize(18).text(`${x.client.name}: payroll for ${x.month}`);
  doc.moveDown(0.3).font('Helvetica').fontSize(10).fillColor('#555').text(`Prepared by Tasama HR Services. Period ${day(x.period.start)} to ${day(x.period.end)}; pay date ${day(x.period.pay)}.`);
  doc.moveDown(1).fillColor('#000').font('Helvetica-Bold').fontSize(12).text('What is paid');
  const line = (k: string, v: string, bold = false) => { const y = doc.y; doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).text(k, 50, y, { width: 300 }); doc.text(v, 350, y, { width: 195, align: 'right' }); doc.moveDown(0.35); };
  doc.moveDown(0.4);
  line('Employees', String(x.totals.people));
  line('Gross pay (SAR)', fmt(x.totals.gross));
  line('Deductions (SAR)', fmt(x.totals.deductions));
  line('Net pay (SAR)', fmt(x.totals.net), true);
  line('Employer contributions (SAR)', fmt(x.totals.employer));
  line('Cost to the company (SAR)', fmt(x.totals.cost), true);
  if (x.differences) {
    doc.moveDown(0.8).font('Helvetica-Bold').fontSize(12).text('Why net pay moved from last month');
    doc.moveDown(0.4);
    line('Last month, net (SAR)', fmt(x.differences.lastNet));
    for (const s of x.differences.steps ?? []) line(s.label, `${s.amount >= 0 ? '+' : '-'}${fmt(Math.abs(s.amount))}`);
    line(`${x.month}, net (SAR)`, fmt(x.differences.thisNet), true);
  }
  doc.moveDown(0.8).font('Helvetica-Bold').fontSize(12).text('Sign-offs');
  doc.moveDown(0.4);
  for (const [k, who, at, role] of x.signoffs) line(`${k}: ${role}`, who ? `${who}, ${day(at)}` : 'Waiting');
  doc.moveDown(1).font('Helvetica').fontSize(8).fillColor('#777').text(`The detail of every line is in ${x.fileBase}.xlsx. Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC. Synthetic data.`);
  doc.end();
  await done;
  return { name: `${x.fileBase}.pdf`, buf: Buffer.concat(chunks) };
}

export async function packageXlsx(c: Q): Promise<{ name: string; buf: Buffer } | null> {
  const x = await packageData(c);
  if (!x) return null;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Tasama HR Services';
  const sum = wb.addWorksheet('Summary');
  sum.columns = [{ header: 'Item', key: 'k', width: 34 }, { header: 'Value', key: 'v', width: 28 }];
  sum.addRows([
    { k: 'Client', v: x.client.name }, { k: 'Month', v: x.month }, { k: 'Employees', v: x.totals.people },
    { k: 'Gross pay (SAR)', v: Number(x.totals.gross.toFixed(2)) }, { k: 'Deductions (SAR)', v: Number(x.totals.deductions.toFixed(2)) },
    { k: 'Net pay (SAR)', v: Number(x.totals.net.toFixed(2)) }, { k: 'Employer contributions (SAR)', v: Number(x.totals.employer.toFixed(2)) },
    ...x.signoffs.map(([k, who, at, role]) => ({ k: `${k} (${role})`, v: who ? `${who}, ${day(at)}` : 'Waiting' })),
  ]);
  sum.getRow(1).font = { bold: true };
  const earn = [...new Set(x.rows.flatMap((r) => (r.lines ?? []).filter((l: any) => l.kind === 'EARNING').map((l: any) => l.label)))] as string[];
  const ded = [...new Set(x.rows.flatMap((r) => (r.lines ?? []).filter((l: any) => l.kind === 'DEDUCTION').map((l: any) => l.label)))] as string[];
  const ws = wb.addWorksheet('Payroll');
  ws.columns = [
    { header: 'Employee no', key: 'no', width: 14 }, { header: 'Name', key: 'name', width: 28 }, { header: 'Department', key: 'dept', width: 22 }, { header: 'Grade', key: 'grade', width: 8 }, { header: 'Pay days', key: 'days', width: 9 },
    ...earn.map((l, i) => ({ header: l, key: `e${i}`, width: 14 })), { header: 'Gross', key: 'gross', width: 14 },
    ...ded.map((l, i) => ({ header: l, key: `d${i}`, width: 14 })), { header: 'Deductions', key: 'ded', width: 14 }, { header: 'Net', key: 'net', width: 14 },
  ];
  for (const r of x.rows) {
    const row: Record<string, any> = { no: r.person_number, name: r.name, dept: r.department, grade: r.grade, days: r.pay_days, gross: r.gross, ded: r.deductions, net: r.net };
    earn.forEach((l, i) => { row[`e${i}`] = (r.lines ?? []).filter((y: any) => y.kind === 'EARNING' && y.label === l).reduce((s: number, y: any) => s + y.amount, 0) || null; });
    ded.forEach((l, i) => { row[`d${i}`] = (r.lines ?? []).filter((y: any) => y.kind === 'DEDUCTION' && y.label === l).reduce((s: number, y: any) => s + y.amount, 0) || null; });
    ws.addRow(row);
  }
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 1 }];
  ws.eachRow((row, i) => { if (i > 1) row.eachCell((cell) => { if (typeof cell.value === 'number') cell.numFmt = '#,##0.00'; }); });
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  return { name: `${x.fileBase}.xlsx`, buf };
}

/** Payroll reports for the client's finance (3.9): each month's cost, as Excel. */
export async function reportsXlsx(months: any[], clientName: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Payroll costs');
  ws.columns = [{ header: 'Month', key: 'm', width: 12 }, { header: 'Employees', key: 'p', width: 11 }, { header: 'Gross', key: 'g', width: 16 }, { header: 'Net pay', key: 'n', width: 16 },
    { header: 'Employer contributions', key: 'e', width: 22 }, { header: 'Cost to the company', key: 'c', width: 20 }, { header: 'End of service owed', key: 'eos', width: 20 }, { header: 'Leave owed', key: 'lv', width: 16 }];
  for (const m of months) ws.addRow({ m: m.period_name, p: m.people, g: m.gross, n: m.net, e: m.employer, c: m.gross + m.employer, eos: m.eos, lv: m.leave });
  ws.getRow(1).font = { bold: true };
  ws.eachRow((row, i) => { if (i > 1) row.eachCell((cell, col) => { if (col > 2) cell.numFmt = '#,##0.00'; }); });
  wb.creator = `Tasama HR Services for ${clientName}`;
  return Buffer.from(await wb.xlsx.writeBuffer());
}
