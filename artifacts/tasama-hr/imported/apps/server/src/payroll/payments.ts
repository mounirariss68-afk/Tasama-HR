/**
 * Tahweel: an approved run becomes the paying bank's file and a WPS file, checked before release and
 * followed until the bank, WPS and Mudad accept it (design/payroll-addendum.md §20, PAY-05 to PAY-13).
 */
import type { PoolClient } from 'pg';
import { pool } from '../db.js';
import { client } from '../domain/rules.js';
import { now } from '../clock.js';
import {
  BANKS, CLIENT_BANKS, FORMATS, bankByCode, bankByIban, bankByName, buildFile, formatByKey, ibanValid, readFile, syntheticIban,
  type Format, type FileCtx,
} from '../domain/banks.js';

type Q = PoolClient | { query: PoolClient['query'] };
const r2 = (n: number) => Math.round(n * 100) / 100;
const DAY = 86_400_000;
const d10 = (d: Date) => d.toISOString().slice(0, 10);

/** The client's paying bank and format for a month: the latest setting from that month or before (PAY-04). */
export async function payingBank(period: string, key = client().key) {
  const row = (await pool.query(`SELECT * FROM tasama.client_banks WHERE client_key=$1 AND from_period <= $2 ORDER BY from_period DESC LIMIT 1`, [key, period]).catch(() => ({ rows: [] as any[] }))).rows[0];
  if (row) return { bank: bankByCode(row.bank_code)!, format: formatByKey(row.format_key), debitIban: row.debit_iban as string };
  return defaultBank(key);
}
export function defaultBank(key = client().key) {
  const set = CLIENT_BANKS[key];
  const bank = set ? bankByCode(set.bank)! : bankByName(client().bank?.[0]) ?? BANKS[0];
  return { bank, format: formatByKey(set?.format ?? 'WPS'), debitIban: syntheticIban(`${key}:payroll-account`, bank.name, '0001') };
}

/** A pay day on a Friday or Saturday is paid on the Thursday before. */
export function valueDateFor(payDate: string) {
  const d = new Date(`${payDate}T00:00:00Z`);
  const dow = d.getUTCDay();
  const back = dow === 5 ? 1 : dow === 6 ? 2 : 0;
  return { valueDate: d10(new Date(d.getTime() - back * DAY)), moved: back > 0, weekday: d.toLocaleString('en-GB', { weekday: 'long', timeZone: 'UTC' }) };
}

/** Each person's line for a month, from the results written to the master. */
export async function resultLines(c: Q, period: string) {
  const rows = (await c.query(
    `SELECT pr.person_id, pr.net, pr.lines, p.person_number, p.display_name, p.display_name_ar, p.iban, p.bank_name, p.national_id, p.is_saudi
       FROM hcm.payroll_results pr JOIN hcm.payroll_periods per ON per.id=pr.period_id JOIN hcm.persons p ON p.id=pr.person_id
      WHERE per.period_name=$1 AND pr.net > 0 ORDER BY p.person_number`, [period])).rows;
  return rows.map((r: any) => {
    const ls = (r.lines ?? []) as any[];
    const sum = (codes: string[]) => r2(ls.filter((l) => codes.includes(l.code)).reduce((s, l) => s + Number(l.amount), 0));
    const basic = sum(['BASIC']), housing = sum(['HOUSING']);
    const earnings = r2(ls.filter((l) => l.kind === 'EARNING').reduce((s, l) => s + Number(l.amount), 0));
    const deductions = r2(ls.filter((l) => l.kind === 'DEDUCTION').reduce((s, l) => s + Number(l.amount), 0));
    const iban = String(r.iban ?? '').replace(/\s/g, '');
    const bank = bankByIban(iban) ?? bankByName(r.bank_name);
    return {
      person_id: r.person_id, employee_no: r.person_number, name: r.display_name, name_ar: r.display_name_ar, iban, bank_code: bank?.code ?? null,
      national_id: r.national_id ?? '', is_saudi: r.is_saudi, basic, housing, other: r2(earnings - basic - housing), deductions, amount: r2(Number(r.net)),
    };
  });
}
type Line = Awaited<ReturnType<typeof resultLines>>[number];

/** The release checks (PAY-06): each says what it found. */
export function releaseChecks(x: { lines: Line[]; total: number; runNet: number | null; fileRef: string; usedRefs: string[]; valueDate: string; payDate: string; moved: boolean; weekday: string; today: string }) {
  const sum = r2(x.lines.reduce((s, l) => s + l.amount, 0));
  const missing = x.lines.filter((l) => !l.iban);
  const badIban = x.lines.filter((l) => l.iban && !ibanValid(l.iban));
  const noBank = x.lines.filter((l) => ibanValid(l.iban) && !l.bank_code);
  const seen = new Map<string, number>(); for (const l of x.lines) seen.set(l.iban, (seen.get(l.iban) ?? 0) + 1);
  const dup = [...seen].filter(([, n]) => n > 1).map(([i]) => i);
  const dow = new Date(`${x.valueDate}T00:00:00Z`).getUTCDay();
  const sar = (n: number) => `SAR ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const names = (ls: Line[]) => ls.slice(0, 3).map((l) => l.name).join(', ') + (ls.length > 3 ? ` and ${ls.length - 3} more` : '');
  return [
    { key: 'total', ok: Math.abs(sum - x.total) < 0.005 && (x.runNet == null || Math.abs(sum - x.runNet) < 0.005),
      text: x.runNet == null || Math.abs(sum - x.runNet) < 0.005 ? `The file total, ${sar(sum)}, is the sum of its ${x.lines.length} lines and the approved run's net pay` : `The lines add up to ${sar(sum)} but the approved run's net pay is ${sar(x.runNet)}`,
      text_ar: `مجموع الملف ${sum.toLocaleString('en-US', { minimumFractionDigits: 2 })} ريال يساوي مجموع ${x.lines.length} سطرًا وصافي الرواتب المعتمدة` },
    { key: 'ref', ok: !x.usedRefs.includes(x.fileRef), text: x.usedRefs.includes(x.fileRef) ? `The file reference ${x.fileRef} was used before; the bank would reject the file` : `The file reference ${x.fileRef} has not been used before`,
      text_ar: `مرجع الملف ${x.fileRef} لم يُستخدم من قبل` },
    { key: 'iban', ok: !missing.length && !badIban.length && !noBank.length, text: missing.length ? `${missing.length} ${missing.length === 1 ? 'employee has' : 'employees have'} no IBAN yet: ${names(missing)}` : badIban.length ? `${badIban.length} IBAN${badIban.length === 1 ? ' fails' : 's fail'} the check digits: ${names(badIban)}` : noBank.length ? `${noBank.length} IBAN${noBank.length === 1 ? ' names' : 's name'} a bank not in the registry: ${names(noBank)}` : `All ${x.lines.length} IBANs pass their check digits and name a bank in the registry`,
      text_ar: badIban.length ? `${badIban.length} أرقام آيبان لا تجتاز خانات التحقق` : `جميع أرقام الآيبان (${x.lines.length}) صحيحة ولبنوك مسجلة` },
    { key: 'dup', ok: !dup.length, text: dup.length ? `${dup.length} IBAN${dup.length === 1 ? ' is' : 's are'} paid twice in the file` : 'No IBAN is paid twice', text_ar: dup.length ? 'رقم آيبان مكرر في الملف' : 'لا يتكرر أي رقم آيبان' },
    { key: 'date', ok: dow !== 5 && dow !== 6 && x.valueDate <= x.payDate && x.valueDate > x.today,
      text: x.moved ? `Pay day is a ${x.weekday}, so the value date is the Thursday before, ${longDate(x.valueDate)}` : `The value date, ${longDate(x.valueDate)}, is a working day on pay day`,
      text_ar: x.moved ? `يوم صرف الرواتب يوم عطلة، فتاريخ القيمة هو الخميس الذي يسبقه، ${x.valueDate}` : `تاريخ القيمة ${x.valueDate} يوم عمل في يوم صرف الرواتب` },
  ];
}
const longDate = (s: string) => new Date(`${s}T00:00:00Z`).toLocaleString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });

/** Builds the payment for a month's approved run: the lines, the checks, the file reference. */
export async function buildPayment(c: PoolClient, x: { period: string; runId?: number | null; requestId?: number | null; by: string; kind?: 'REGULAR' | 'FOLLOW_UP'; followUpOf?: number | null; only?: number[]; at?: Date }) {
  const per = (await c.query(`SELECT period_name, to_char(pay_date,'YYYY-MM-DD') pay FROM hcm.payroll_periods WHERE period_name=$1`, [x.period])).rows[0];
  const pb = await payingBank(x.period);
  let lines = await resultLines(c, x.period);
  if (x.only) lines = lines.filter((l) => x.only!.includes(l.person_id));
  const run = x.runId ? (await c.query(`SELECT totals FROM layer.pay_runs WHERE id=$1`, [x.runId])).rows[0] : null;
  const total = r2(lines.reduce((s, l) => s + l.amount, 0));
  const kind = x.kind ?? 'REGULAR';
  const n = Number((await c.query(`SELECT count(*) n FROM layer.payments WHERE period_name=$1`, [x.period])).rows[0].n);
  const fileRef = `${client().code}-${x.period.replace('-', '')}-${String(n + 1).padStart(2, '0')}`;
  const usedRefs = (await c.query(`SELECT file_ref FROM layer.payments`)).rows.map((r: any) => r.file_ref);
  const at = x.at ?? now();
  const vd = valueDateFor(per.pay);
  // A returned salary is paid again on the first working day after the original file's value date, or after today if that is later.
  const orig = x.followUpOf ? (await c.query(`SELECT to_char(value_date,'YYYY-MM-DD') vd FROM layer.payments WHERE id=$1`, [x.followUpOf])).rows[0]?.vd : null;
  const valueDate = kind === 'FOLLOW_UP' ? nextWorkingDay([d10(at), orig ?? ''].sort().at(-1)!) : vd.valueDate;
  const checks = releaseChecks({ lines, total, runNet: kind === 'REGULAR' && run ? Number(run.totals?.net) : null, fileRef, usedRefs, valueDate, payDate: kind === 'FOLLOW_UP' ? valueDate : per.pay, moved: kind === 'REGULAR' && vd.moved, weekday: vd.weekday, today: d10(at) });
  const fileName = `${client().code} ${pb.format.name} ${x.period}${kind === 'FOLLOW_UP' ? ' follow-up' : ''}.${pb.format.extension}`;
  const p = (await c.query(
    `INSERT INTO layer.payments (period_name, run_id, request_id, kind, follow_up_of, bank_code, format_key, debit_iban, file_ref, file_name, value_date, pay_date, lines, total, checks, built_by, built_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
    [x.period, x.runId ?? null, x.requestId ?? null, kind, x.followUpOf ?? null, pb.bank.code, pb.format.key, pb.debitIban, fileRef, fileName, valueDate, per.pay, lines.length, total, JSON.stringify(checks), x.by, at])).rows[0];
  for (const l of lines) await c.query(
    `INSERT INTO layer.payment_lines (payment_id, person_id, employee_no, name, iban, bank_code, national_id, basic, housing, other, deductions, amount) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [p.id, l.person_id, l.employee_no, l.name, l.iban, l.bank_code, l.national_id, l.basic, l.housing, l.other, l.deductions, l.amount]);
  return { id: p.id as number, fileRef, total, lines: lines.length, checks, valueDate, payDate: per.pay as string, moved: kind === 'REGULAR' && vd.moved, bank: pb.bank, format: pb.format, blocked: checks.filter((k) => !k.ok).length };
}
export function nextWorkingDay(day: string) {
  let d = new Date(`${day}T00:00:00Z`);
  do d = new Date(d.getTime() + DAY); while ([5, 6].includes(d.getUTCDay()));
  return d10(d);
}

/** The bank file and the WPS file for a payment, written from its lines by the format definitions. */
export async function paymentFiles(c: Q, id: number) {
  const p = (await c.query(`SELECT *, to_char(value_date,'YYYY-MM-DD') vd FROM layer.payments WHERE id=$1`, [id])).rows[0];
  if (!p) return null;
  const ls = (await c.query(`SELECT * FROM layer.payment_lines WHERE payment_id=$1 ORDER BY employee_no`, [id])).rows;
  const le = (await c.query(`SELECT mol_establishment_no, code FROM hcm.legal_employers ORDER BY id LIMIT 1`)).rows[0];
  const bank = bankByCode(p.bank_code)!;
  const sum = (k: string) => r2(ls.reduce((s: number, l: any) => s + Number(l[k]), 0));
  const head: FileCtx = { bankSarie: bank.sarie, establishment: le?.code ?? client().code, debitIban: p.debit_iban, valueDate: p.vd, total: Number(p.total), count: ls.length, fileRef: p.file_ref, molId: le?.mol_establishment_no ?? '',
    sumBasic: sum('basic'), sumHousing: sum('housing'), sumOther: sum('other'), sumDeductions: sum('deductions') };
  const lines: FileCtx[] = ls.map((l: any) => ({ net: Number(l.amount), iban: l.iban, name: l.name, bankSarie: bankByCode(l.bank_code)?.sarie ?? '', bankName: bankByCode(l.bank_code)?.name ?? '',
    basic: Number(l.basic), housing: Number(l.housing), other: Number(l.other), deductions: Number(l.deductions), idType: String(l.national_id ?? '').startsWith('1') ? '1' : '2', nationalId: l.national_id ?? '', employeeNo: l.employee_no }));
  const fmt = formatByKey(p.format_key), wps = formatByKey('WPS');
  const bankText = buildFile(fmt, head, lines), wpsText = buildFile(wps, head, lines);
  return { payment: p, bank: { name: p.file_name, format: fmt, text: bankText }, wps: { name: `${client().code} WPS wages file ${p.period_name}${p.kind === 'FOLLOW_UP' ? ' follow-up' : ''}.txt`, format: wps, text: wpsText }, match: compare(fmt, bankText, wps, wpsText) };
}

/** The WPS file against the bank file, per employee and in total (PAY-10). */
export function compare(a: Format, aText: string, b: Format, bText: string) {
  const amt = (f: Format, r: Record<string, string>) => { const fd = f.line.find((x) => x.source === 'net')!; const v = Number(r[fd.name]); return fd.fmt === 'amount-cents' ? v / 100 : v; };
  const A = new Map(readFile(a, aText).map((r) => [r.iban, amt(a, r)])), B = new Map(readFile(b, bText).map((r) => [r.iban, amt(b, r)]));
  const differ = [...new Set([...A.keys(), ...B.keys()])].filter((k) => Math.abs((A.get(k) ?? 0) - (B.get(k) ?? 0)) > 0.004);
  const ta = r2([...A.values()].reduce((s, v) => s + v, 0)), tb = r2([...B.values()].reduce((s, v) => s + v, 0));
  return { lines: A.size, differ, totalBank: ta, totalWps: tb, ok: !differ.length && Math.abs(ta - tb) < 0.005 };
}

/** Moves a payment through the bank's reports. The bank and Mudad are simulated (§20). */
export async function markSent(c: Q, id: number, by: string, at = now()) {
  await c.query(`UPDATE layer.payments SET state='SENT', sent_by=$2, sent_at=$3 WHERE id=$1`, [id, by, at]);
}
export async function markApproved(c: Q, id: number, by: string, at = now()) {
  await c.query(`UPDATE layer.payments SET state='APPROVED', approved_by=$2, approved_at=$3 WHERE id=$1`, [id, by, at]);
}
/** The bank's feedback file: every line paid unless it is listed as failed, with the bank's return code. */
export async function markFeedback(c: Q, id: number, failed: { person_id: number; code: string; reason: string; reason_ar: string }[] = [], at = now()) {
  await c.query(`UPDATE layer.payment_lines SET status='PAID' WHERE payment_id=$1`, [id]);
  for (const f of failed) await c.query(`UPDATE layer.payment_lines SET status='FAILED', return_code=$3, reason=$4, reason_ar=$5 WHERE payment_id=$1 AND person_id=$2`, [id, f.person_id, f.code, f.reason, f.reason_ar]);
  await c.query(`UPDATE layer.payments SET state=$2, feedback_at=$3 WHERE id=$1`, [id, failed.length ? 'PART_FAILED' : 'PAID', at]);
  const pm = (await c.query(`SELECT period_name, follow_up_of FROM layer.payments WHERE id=$1`, [id])).rows[0];
  const per = pm.period_name;
  // A follow-up pays the lines the earlier file returned: those lines are now paid (§20, edge 10).
  if (pm.follow_up_of) {
    await c.query(`UPDATE layer.payment_lines o SET status='REPAID' FROM layer.payment_lines n WHERE o.payment_id=$1 AND n.payment_id=$2 AND n.person_id=o.person_id AND n.status='PAID' AND o.status='FAILED'`, [pm.follow_up_of, id]);
    const left = Number((await c.query(`SELECT count(*) n FROM layer.payment_lines WHERE payment_id=$1 AND status='FAILED'`, [pm.follow_up_of])).rows[0].n);
    if (!left) await c.query(`UPDATE layer.payments SET state='PAID' WHERE id=$1`, [pm.follow_up_of]);
  }
  await c.query(`UPDATE hcm.payroll_results pr SET wps_status = CASE WHEN pl.status='PAID' THEN 'PAID' ELSE 'FAILED' END
                   FROM layer.payment_lines pl, hcm.payroll_periods per WHERE pl.payment_id=$1 AND pl.person_id=pr.person_id AND per.id=pr.period_id AND per.period_name=$2`, [id, per]);
}
/** The signed WPS file returned by the bank: accepted when it matches what was paid. */
export async function markWps(c: Q, id: number, at = now()) {
  const f = await paymentFiles(c, id);
  // The signed file lists each line as paid or returned; it is accepted when its paid lines are the lines the bank paid.
  const paid = (await c.query(`SELECT count(*) FILTER (WHERE status IN ('PAID','REPAID'))::int paid, count(*) FILTER (WHERE status='FAILED')::int failed, count(*)::int n FROM layer.payment_lines WHERE payment_id=$1`, [id])).rows[0];
  await c.query(`UPDATE layer.payments SET wps_state=$2, wps_at=$3 WHERE id=$1`, [id, f?.match.ok ? 'ACCEPTED' : 'DIFFERS', at]);
  return { ok: !!f?.match.ok, ...paid };
}

/* ------------------------------------------------------------------ the bank's reports (simulated, §20) */

const RETURN = { code: 'ACCOUNT_CLOSED', reason: 'The beneficiary bank returned it: the account is closed', reason_ar: 'أعاده بنك المستفيد: الحساب مغلق' };

/** The client's finance approves the file in the bank portal; the bank reports who approved. */
export async function bankApproved(c: PoolClient, id: number) {
  const who = await financeApprover(c);
  await markApproved(c, id, who);
  return who;
}

/** The line the bank returns in D7 (edge 10): an employee paid at another bank, chosen the same way every time. */
export async function returnedLine(c: Q, id: number) {
  const p = (await c.query(`SELECT bank_code FROM layer.payments WHERE id=$1`, [id])).rows[0];
  const ls = (await c.query(`SELECT person_id, name, amount, bank_code FROM layer.payment_lines WHERE payment_id=$1 AND bank_code IS DISTINCT FROM $2 ORDER BY employee_no`, [id, p.bank_code])).rows;
  return ls[Math.floor(ls.length / 3)] ?? null;
}

/**
 * The bank's feedback file. Every line is paid unless `fail` names it; a returned line becomes a question
 * to the client's HR operations for the employee's new IBAN, and its answer opens the follow-up payment.
 */
/** A bank report is dated no earlier than the day it can happen: the feedback file on the value date, the signed WPS file three days after. */
async function reportAt(c: Q, id: number, days: number) {
  const r = (await c.query(`SELECT to_char(GREATEST(p.value_date, COALESCE((SELECT max(f.value_date) FROM layer.payments f WHERE f.follow_up_of=p.id), p.value_date)),'YYYY-MM-DD') d FROM layer.payments p WHERE p.id=$1`, [id])).rows[0];
  const t = new Date(Date.parse(`${r.d}T10:00:00Z`) + days * DAY);
  return t > now() ? t : now();
}

export async function bankFeedback(c: PoolClient, id: number, fail: number[] = []) {
  await markFeedback(c, id, fail.map((person_id) => ({ person_id, ...RETURN })), await reportAt(c, id, 0));
  const pp = (await c.query(`SELECT value FROM layer.meta WHERE key='people'`)).rows[0]?.value?.persona ?? {};
  const pay = (await c.query(`SELECT * FROM layer.payments WHERE id=$1`, [id])).rows[0];
  const bank = bankByCode(pay.bank_code)!;
  const asked: string[] = [];
  const { startCase } = await import('../engine/core.js');
  for (const person_id of fail) {
    const l = (await c.query(`SELECT * FROM layer.payment_lines WHERE payment_id=$1 AND person_id=$2`, [id, person_id])).rows[0];
    const lb = bankByCode(l.bank_code);
    const amount = Number(l.amount);
    const k = await startCase(c, { workflowId: 'WF-36', type: 'PAYMENT_RETURNED', title: 'Salary returned by the bank', title_ar: 'راتب أعاده البنك', requester: pp.payroll, subject: person_id, channel: 'EVENT',
      payload: { kind: 'PAYMENT_RETURNED', period: pay.period_name, person_id, person_name: l.name, person_name_ar: (await c.query(`SELECT display_name_ar FROM hcm.persons WHERE id=$1`, [person_id])).rows[0]?.display_name_ar ?? l.name, amount, payment_id: id, return_code: RETURN.code,
        old_bank: lb?.name ?? '', old_bank_ar: lb?.name_ar ?? '', paying_bank: bank.name, asked_by: 'Tahweel', asked_on: d10(now()), client: client().short,
        finding: `${l.name}'s salary of SAR ${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} came back on ${bank.name}'s feedback file: the account at ${lb?.name ?? 'the beneficiary bank'} is closed.`,
        finding_ar: `أُعيد راتب ${l.name} على ملف الإفادة من ${bank.name_ar}: الحساب لدى ${lb?.name_ar ?? 'بنك المستفيد'} مغلق.` } });
    asked.push(k.ref);
  }
  return { paid: pay.lines - fail.length, failed: fail.length, asked };
}

/** The bank's signed WPS file comes back and the WPS file goes to Mudad, which acknowledges it. */
export async function wpsAndMudad(c: PoolClient, id: number) {
  const w = await markWps(c, id, await reportAt(c, id, 3));
  await markMudad(c, id, 'UPLOADED', await reportAt(c, id, 3));
  await markMudad(c, id, 'ACKNOWLEDGED', await reportAt(c, id, 4));
  return w;
}

/** HR operations' answer: the employee's new IBAN goes on the record and Tahweel opens the follow-up payment. */
export async function correctIban(c: PoolClient, p: { person_id: number; payment_id: number; period: string; new_iban: string }, by: string) {
  const iban = String(p.new_iban ?? '').replace(/\s/g, '').toUpperCase();
  if (!ibanValid(iban)) throw new Error('The new IBAN does not pass its check digits.');
  const bank = bankByIban(iban);
  if (!bank) throw new Error('The new IBAN names a bank that is not in the registry.');
  const old = (await c.query(`SELECT iban FROM hcm.persons WHERE id=$1`, [p.person_id])).rows[0]?.iban;
  if (old === iban) throw new Error('This is the IBAN the bank returned.');
  await c.query(`UPDATE hcm.persons SET iban=$2, iban_masked=$3, bank_name=$4 WHERE id=$1`, [p.person_id, iban, `${iban.slice(0, 4)} •••• •••• •••• ${iban.slice(-4)}`, bank.name]);
  await c.query(`UPDATE layer.payment_lines SET iban=$3, bank_code=$4 WHERE payment_id=$1 AND person_id=$2 AND status='FAILED'`, [p.payment_id, p.person_id, iban, bank.code]);
  const run = (await c.query(`SELECT run_id FROM layer.payments WHERE id=$1`, [p.payment_id])).rows[0];
  const k = await startPayment(c, p.period, run?.run_id ?? null, (await c.query(`SELECT value FROM layer.meta WHERE key='people'`)).rows[0]?.value?.persona?.payroll ?? 0,
    { kind: 'FOLLOW_UP', follow_up_of: p.payment_id, only: [p.person_id] });
  return { ref: k.ref as string, bank: bank.name, by };
}
export async function markMudad(c: Q, id: number, state: 'UPLOADED' | 'ACKNOWLEDGED', at = now()) {
  const ref = `MUDAD-${client().code}-${String(id).padStart(5, '0')}`;
  await c.query(`UPDATE layer.payments SET mudad_state=$2, mudad_at=$3, mudad_ref=$4 WHERE id=$1`, [id, state, at, ref]);
}

/** Every closed month was paid, accepted in WPS and acknowledged by Mudad (§20, history). */
export async function seedPaymentHistory(c: PoolClient) {
  const pers = (await c.query(`SELECT period_name, to_char(pay_date,'YYYY-MM-DD') pay FROM hcm.payroll_periods WHERE status='CLOSED' ORDER BY start_date`)).rows;
  const fin = await financeApprover(c);
  for (const per of pers) {
    const pay = Date.parse(`${valueDateFor(per.pay).valueDate}T00:00:00Z`);
    const built = new Date(pay - 4 * DAY + 9 * 3600e3);
    const p = await buildPayment(c, { period: per.period_name, by: 'Tahweel', at: built });
    await markSent(c, p.id, 'Sharifa AlMousa', new Date(built.getTime() + 2 * 3600e3));
    await markApproved(c, p.id, fin, new Date(pay - 2 * DAY + 11 * 3600e3));
    await markFeedback(c, p.id, [], new Date(pay + 10 * 3600e3));
    await markWps(c, p.id, new Date(pay + 5 * DAY));
    await markMudad(c, p.id, 'ACKNOWLEDGED', new Date(pay + 6 * DAY));
  }
}

/** Opens the payment case for a month's approved run: Tahweel builds it, the payroll lead sends it (WF-33). */
export async function startPayment(c: PoolClient, period: string, runId: number | null, requester: number, extra: Record<string, any> = {}) {
  const { startCase } = await import('../engine/core.js');
  const month = new Date(`${period}-01T00:00:00Z`).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const monthAr = new Date(`${period}-01T00:00:00Z`).toLocaleString('ar', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const follow = extra.kind === 'FOLLOW_UP';
  // A run approved again (a replayed scenario) replaces the file that was built and never sent.
  if (!follow) {
    const stale = (await c.query(`SELECT p.id, p.request_id FROM layer.payments p WHERE p.period_name=$1 AND p.kind='REGULAR' AND p.state='BUILT'`, [period])).rows;
    for (const x of stale) {
      if (x.request_id) await c.query(`UPDATE layer.requests SET status='COMPLETED', current_step=NULL, waiting_on_role=NULL, waiting_on_person_id=NULL, closed_at=now(), updated_at=now() WHERE id=$1 AND status IN ('WAITING','ESCALATED')`, [x.request_id]);
      await c.query(`DELETE FROM layer.payments WHERE id=$1`, [x.id]);
    }
  }
  return startCase(c, { workflowId: 'WF-33', type: follow ? 'FOLLOW_UP' : 'PAYMENT', title: `${client().short} ${follow ? 'follow-up payment' : 'bank file'}, ${month}`, title_ar: `${follow ? 'دفعة استكمالية' : 'ملف البنك'} ${client().name_ar}، ${monthAr}`,
    requester, subject: requester, channel: 'EVENT', payload: { period, run_id: runId, ...extra } });
}

/** Who approves the payment in the client's bank portal: its finance controller. */
export async function financeApprover(c: Q) {
  const people = (await c.query(`SELECT value FROM layer.meta WHERE key='people'`)).rows[0]?.value;
  const id = people?.persona?.finance;
  const n = id ? (await c.query(`SELECT display_name FROM hcm.persons WHERE id=$1`, [id])).rows[0]?.display_name : null;
  return n ?? 'Client finance';
}

/** Fills the full IBAN and ID number where the seed has not set them (a hire made on the platform). */
export async function fillBankDetails(c: Q) {
  const { syntheticNationalId } = await import('../domain/banks.js');
  const rows = (await c.query(`SELECT id, person_number, bank_name, iban_masked, national_id_masked, is_saudi FROM hcm.persons WHERE iban IS NULL OR national_id IS NULL`)).rows;
  for (const r of rows) {
    const last4 = (String(r.iban_masked).match(/(\d{4})\s*$/) ?? [, '0000'])[1]!;
    const iban = syntheticIban(`${client().key}:${r.person_number}`, r.bank_name, last4);
    const nid = syntheticNationalId(`${client().key}:${r.person_number}`, r.is_saudi, (String(r.national_id_masked).match(/(\d{3})\s*$/) ?? [, '000'])[1]!);
    await c.query(`UPDATE hcm.persons SET iban=COALESCE(iban,$2), national_id=COALESCE(national_id,$3), iban_masked=CASE WHEN iban IS NULL AND iban_masked ~ '^SA[0-9]{2} ' THEN $4 ELSE iban_masked END WHERE id=$1`,
      [r.id, iban, nid, `${iban.slice(0, 4)} •••• •••• •••• ${iban.slice(-4)}`]);
  }
}
export { FORMATS, BANKS };
