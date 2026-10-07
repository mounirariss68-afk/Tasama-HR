import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DOCUMENT_BRANDS, caseDocument, documentBrand, imagePagesPdf, invoiceDocument, letterDocument, payslipDocument } from '../src/lib/documents';
import type { ClientInfo } from '../src/app/state';

test('each client uses its own locally available original logo', () => {
  const expected = ['roshn', 'riyadhair', 'redsea', 'seven', 'saudicoffee', 'tasama'];
  assert.deepEqual(Object.keys(DOCUMENT_BRANDS).sort(), expected.sort());
  for (const key of expected) {
    const brand = documentBrand({ key, name: key } as ClientInfo);
    assert.ok(existsSync(fileURLToPath(new URL(`../public/brands/${brand.logo}`, import.meta.url))));
  }
  assert.throws(() => documentBrand({ key: 'unknown', name: 'Unknown' } as ClientInfo), /No document letterhead/);
});

test('letter export preserves stored Arabic content, dates, reference and status', () => {
  const record = {
    type: 'SALARY_CERTIFICATE', body: 'شهادة راتب\nالموظف: بيانات تجريبية\nMonthly gross: SAR 12,345.67',
    language: 'ar', document_number: 'TEST-DOC-0001', status: 'ISSUED', issued_at: '2026-10-07',
  };
  const spec = letterDocument(record);
  assert.equal(spec.title, 'شهادة راتب');
  assert.equal(spec.body, record.body);
  assert.equal(spec.reference, record.document_number);
  assert.equal(spec.date, record.issued_at);
  assert.equal(spec.status, record.status);
});

test('payslip export uses recorded payroll values, never recomputed wages', () => {
  const spec = payslipDocument({
    id: 42, period_name: '2026-09', pay_date: '2026-09-27', gross: 10000, deductions: 800, net: 9200,
    lines: [{ name: 'Basic', kind: 'EARNING', amount: 10000 }, { name: 'Deduction', kind: 'DEDUCTION', amount: 800 }],
  }, 'Demo employee', 'en');
  assert.equal(spec.reference, 'PAY-2026-09-42');
  assert.match(spec.body, /Net: SAR\s*9,200\.00/);
  assert.match(spec.body, /Deduction: −SAR\s*800\.00/);
  assert.match(spec.body, /Synthetic payroll result/);
});

test('invoice exports retain prepared state, total and non-tax-invoice disclaimer', () => {
  const spec = invoiceDocument({
    number: 'TEST-INV', status: 'PREPARED', short: 'Client', period: '2026-09', headcount: 10,
    base_fee: 5000, hire_fees: 1000, credits: 200, total: 6670, notes: ['Existing service credit'],
  }, 'en');
  assert.equal(spec.status, 'PREPARED');
  assert.match(spec.body, /6,670\.00/);
  assert.match(spec.body, /not a tax invoice/);
});

test('any workflow can export its authorised evidence without changing source records', () => {
  const record = {
    ref: 'TEST-CASE', title: 'Demo case', status: 'WAITING', workflow_id: 'WF-10', subject_name: 'Demo employee',
    payload: { note: 'Unchanged evidence' }, result: { calibration: { accepted: false, score: 0 } },
    steps: [{ label: 'Human approval', status: 'WAITING', outputs: { figures: [0, 12] } }],
    trail: [{ at: '2026-10-07', actor_name: 'HR', summary: 'Review requested' }],
  };
  const before = JSON.stringify(record);
  const spec = caseDocument(record, 'en');
  assert.equal(spec.status, 'WAITING');
  assert.match(spec.body, /accepted: false/);
  assert.match(spec.body, /score: 0/);
  assert.match(spec.body, /Review requested/);
  assert.equal(JSON.stringify(record), before);
});

test('PDF encoder writes correct byte offsets, lengths and page references', async () => {
  const images = [new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x80, 0xff, 0xd9]), new Uint8Array([0xff, 0xd8, 0x00, 0xff, 0xd9])];
  const pdf = imagePagesPdf(images);
  assert.equal(pdf.type, 'application/pdf');
  const data = new Uint8Array(await pdf.arrayBuffer());
  const raw = Buffer.from(data).toString('latin1');
  assert.ok(raw.startsWith('%PDF-1.4'));
  assert.match(raw, /\/Count 2 \/Kids \[3 0 R 6 0 R\]/);
  assert.match(raw, /\/MediaBox \[0 0 595\.28 841\.89\]/);
  const xref = Number(raw.match(/startxref\n(\d+)/)?.[1]);
  assert.equal(raw.slice(xref, xref + 4), 'xref');
  const entries = raw.slice(xref).split('\n').slice(3, 11);
  for (let i = 0; i < entries.length; i++) {
    const offset = Number(entries[i].slice(0, 10));
    assert.ok(raw.slice(offset).startsWith(`${i + 1} 0 obj`));
  }
  assert.match(raw, /\/DCTDecode \/Length 8/);
  assert.match(raw, /\/DCTDecode \/Length 5/);
  assert.throws(() => imagePagesPdf([]), /empty document/);
});
