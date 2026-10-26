/**
 * Qaid: a paid month becomes four journals in the client's ledger (design/payroll-addendum.md §21, FIN-02 to FIN-05).
 * Every line takes its account from the client's account map; a line with no account, or a journal that does
 * not balance, is never posted. Qaid proposes an account for what is unmapped; the payroll manager approves it.
 */
import type { PoolClient } from 'pg';
import JSZip from 'jszip';
import { client } from '../domain/rules.js';
import { now } from '../clock.js';
import { CHART, DEFAULT_MAP, accountOf, ccSegment, combination, entityOf, oracleCsv, odooCsv, propose, ORACLE_HEADER, type JLine } from '../domain/ledger.js';

type Q = PoolClient | { query: PoolClient['query'] };
const r2 = (n: number) => Math.round(n * 100) / 100;
const sar = (n: number) => `SAR ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const KINDS = ['ACCRUAL', 'PROVISIONS', 'PAYMENT', 'PROVISION_USE'] as const;
export type Kind = (typeof KINDS)[number];
export const KIND_NAME: Record<Kind, [string, string]> = { ACCRUAL: ['Payroll accrual', 'استحقاق الرواتب'], PROVISIONS: ['Provisions', 'المخصصات'], PAYMENT: ['Payment', 'الدفع'], PROVISION_USE: ['Provision use', 'استخدام المخصصات'] };
const SETTLED = new Set(['GRATUITY', 'LEAVE_ENCASH']);

/** The chart and the go-live map, written once per client. */
export async function seedLedger(c: Q) {
  for (const a of CHART) await c.query(`INSERT INTO layer.gl_accounts (code, name, name_ar, type, by_cost_centre) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (code) DO NOTHING`, [a.code, a.name, a.name_ar, a.type, a.byCostCentre]);
  const n = Number((await c.query(`SELECT count(*) n FROM layer.account_map`)).rows[0].n);
  if (!n) for (const [code, account] of Object.entries(DEFAULT_MAP)) await c.query(`INSERT INTO layer.account_map (code, account, status, proposed_by, approved_by, approved_at) VALUES ($1,$2,'APPROVED','Client finance, at go-live','Client finance, at go-live',$3)`, [code, account, now()]);
}

async function mapOf(c: Q) {
  const rows = (await c.query(`SELECT code, cost_centre, account FROM layer.account_map WHERE status='APPROVED'`)).rows;
  return (code: string, cc: string | null) => rows.find((r: any) => r.code === code && r.cost_centre === cc)?.account ?? rows.find((r: any) => r.code === code && !r.cost_centre)?.account ?? null;
}

/** Builds the month's journals from what was paid. Nothing is written for a journal already posted. */
export async function buildJournals(c: PoolClient, period: string, requestId: number | null = null) {
  const map = await mapOf(c);
  const ent = entityOf(client().key);
  const people = (await c.query(
    `SELECT pr.person_id, pr.net, pr.lines, d.cost_center, pv.eos_month, pv.leave_month
       FROM hcm.payroll_results pr JOIN hcm.payroll_periods per ON per.id=pr.period_id
       LEFT JOIN LATERAL (SELECT department_id FROM hcm.assignments a WHERE a.person_id=pr.person_id ORDER BY a.effective_start DESC LIMIT 1) a ON true
       LEFT JOIN hcm.departments d ON d.id=a.department_id
       LEFT JOIN hcm.payroll_provisions pv ON pv.person_id=pr.person_id AND pv.period_id=pr.period_id
      WHERE per.period_name=$1`, [period])).rows;
  const names = new Map((await c.query(`SELECT code, name FROM hcm.element_types`)).rows.map((r: any) => [r.code, r.name]));

  type Acc = Map<string, JLine>;
  const add = (m: Acc, account: string, cc: string, debit: number, credit: number, description: string) => {
    const a = accountOf(account);
    const seg = a?.byCostCentre ? cc : '0000';
    const k = `${account}|${seg}`;
    const l = m.get(k) ?? { account, cc: seg, combination: combination(ent, seg, account), debit: 0, credit: 0, description: a ? `${a.name}${seg !== '0000' ? `, cost centre ${seg}` : ''}` : description };
    l.debit = r2(l.debit + debit); l.credit = r2(l.credit + credit);
    m.set(k, l);
  };
  const J: Record<Kind, { lines: Acc; unmapped: Map<string, { code: string; name: string; amount: number; kind: string }> }> = Object.fromEntries(KINDS.map((k) => [k, { lines: new Map(), unmapped: new Map() }])) as any;
  const miss = (k: Kind, code: string, kind: string, amount: number, name?: string) => { const u = J[k].unmapped.get(code) ?? { code, name: name ?? names.get(code) ?? code, amount: 0, kind }; u.amount = r2(u.amount + amount); J[k].unmapped.set(code, u); };

  for (const p of people) {
    const cc = ccSegment(p.cost_center);
    let settled = 0;
    for (const l of (p.lines ?? []) as any[]) {
      const amt = Number(l.amount); if (!amt) continue;
      if (l.kind === 'EARNING' && SETTLED.has(l.code)) {
        settled += amt;
        const acc = map(l.code, null); if (acc) add(J.PROVISION_USE.lines, acc, cc, amt, 0, l.name); else miss('PROVISION_USE', l.code, 'EARNING', amt, l.name);
        continue;
      }
      const acc = map(l.code, cc);
      if (l.kind === 'EARNING') { if (acc) add(J.ACCRUAL.lines, acc, cc, amt, 0, l.name); else miss('ACCRUAL', l.code, 'EARNING', amt, l.name); }
      else if (l.kind === 'EMPLOYER_CONTRIBUTION') {
        if (acc) add(J.ACCRUAL.lines, acc, cc, amt, 0, l.name); else miss('ACCRUAL', l.code, 'EMPLOYER', amt, l.name);
        add(J.ACCRUAL.lines, map('GOSI_PAYABLE', null)!, cc, 0, amt, 'GOSI payable');
      } else if (l.kind === 'DEDUCTION') { if (acc) add(J.ACCRUAL.lines, acc, cc, 0, amt, l.name); else miss('ACCRUAL', l.code, 'DEDUCTION', amt, l.name); }
    }
    // A negative net is owed by the employee, not paid by the bank: it is a receivable, not less payable.
    const owed = r2(Number(p.net) - settled);
    if (owed >= 0) add(J.ACCRUAL.lines, map('NET_PAY', null)!, cc, 0, owed, 'Salaries payable');
    else add(J.ACCRUAL.lines, map('DUE_FROM_EMPLOYEE', null)!, cc, -owed, 0, 'Amounts due from employees');
    if (settled) add(J.PROVISION_USE.lines, map('NET_PAY', null)!, cc, 0, r2(settled), 'Salaries payable');
    for (const [amt, exp, prov] of [[Number(p.eos_month ?? 0), 'EOS_EXPENSE', 'EOS_PROVISION'], [Number(p.leave_month ?? 0), 'LEAVE_EXPENSE', 'LEAVE_PROVISION']] as [number, string, string][]) {
      if (!amt) continue;
      if (amt > 0) { add(J.PROVISIONS.lines, map(exp, cc)!, cc, amt, 0, exp); add(J.PROVISIONS.lines, map(prov, null)!, cc, 0, amt, prov); }
      else { add(J.PROVISIONS.lines, map(exp, cc)!, cc, 0, -amt, exp); add(J.PROVISIONS.lines, map(prov, null)!, cc, -amt, 0, prov); }
    }
  }
  const paid = Number((await c.query(`SELECT COALESCE(sum(l.amount),0) s FROM layer.payment_lines l JOIN layer.payments p ON p.id=l.payment_id WHERE p.period_name=$1 AND l.status='PAID'`, [period])).rows[0].s);
  if (paid) { add(J.PAYMENT.lines, map('NET_PAY', null)!, '0000', paid, 0, 'Salaries payable'); add(J.PAYMENT.lines, map('BANK', null)!, '0000', 0, paid, 'Bank'); }

  const out: { kind: Kind; debit: number; credit: number; unmapped: any[]; lines: JLine[]; state: string }[] = [];
  for (const kind of KINDS) {
    const lines = [...J[kind].lines.values()].sort((a, b) => a.account.localeCompare(b.account) || a.cc.localeCompare(b.cc));
    if (!lines.length && kind === 'PROVISION_USE') continue;
    const debit = r2(lines.reduce((s, l) => s + l.debit, 0)), credit = r2(lines.reduce((s, l) => s + l.credit, 0));
    const unmapped = [...J[kind].unmapped.values()];
    const state = unmapped.length || Math.abs(debit - credit) > 0.005 ? 'BLOCKED' : 'BUILT';
    const done = (await c.query(`SELECT state FROM layer.journals WHERE period_name=$1 AND kind=$2`, [period, kind])).rows[0];
    if (done?.state === 'POSTED') { out.push({ kind, debit, credit, unmapped, lines, state: 'POSTED' }); continue; }
    await c.query(`INSERT INTO layer.journals (period_name, kind, request_id, lines, debit, credit, unmapped, state) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (period_name, kind) DO UPDATE SET request_id=COALESCE(EXCLUDED.request_id, layer.journals.request_id), lines=EXCLUDED.lines, debit=EXCLUDED.debit, credit=EXCLUDED.credit, unmapped=EXCLUDED.unmapped, state=EXCLUDED.state`,
      [period, kind, requestId, JSON.stringify(lines), debit, credit, JSON.stringify(unmapped), state]);
    out.push({ kind, debit, credit, unmapped, lines, state });
  }
  return out;
}

/** Qaid proposes an account for each unmapped line, by matching its name against the chart (§21: no past mapping spreadsheet). */
export async function proposeAccounts(c: PoolClient, period: string) {
  const js = (await c.query(`SELECT unmapped FROM layer.journals WHERE period_name=$1`, [period])).rows.flatMap((r: any) => r.unmapped as any[]);
  const out: { code: string; name: string; amount: number; account: string; account_name: string; account_name_ar: string; why: string }[] = [];
  for (const u of js) {
    const had = (await c.query(`SELECT account FROM layer.account_map WHERE code=$1 AND status='PROPOSED'`, [u.code])).rows[0];
    const pr = had ? { account: accountOf(had.account)!, why: '' } : propose(u.name, u.kind === 'DEDUCTION' ? 'DEDUCTION' : u.kind === 'EMPLOYER' ? 'EMPLOYER' : 'EARNING');
    if (!pr) continue;
    const reason = `"${u.name}" matches the chart's "${pr.account.name}"${pr.why ? ` (${pr.why})` : ''}. ${client().short}'s finance has no account for it yet.`;
    if (!had) await c.query(`INSERT INTO layer.account_map (code, account, status, proposed_by, proposed_at, reason) VALUES ($1,$2,'PROPOSED','Qaid',$3,$4)`, [u.code, pr.account.code, now(), reason]);
    out.push({ code: u.code, name: u.name, amount: u.amount, account: pr.account.code, account_name: pr.account.name, account_name_ar: pr.account.name_ar, why: reason });
  }
  return out;
}

/** The payroll manager approves Qaid's proposals and the journals; they are rebuilt with the approved accounts. */
export async function approveJournals(c: PoolClient, period: string, by: string, requestId: number | null = null, at = now()) {
  await c.query(`UPDATE layer.account_map SET status='APPROVED', approved_by=$1, approved_at=$2 WHERE status='PROPOSED'`, [by, at]);
  const js = await buildJournals(c, period, requestId);
  const bad = js.filter((j) => j.state === 'BLOCKED');
  if (bad.length) throw new Error(`${bad.length} ${bad.length === 1 ? 'journal does' : 'journals do'} not balance yet.`);
  await c.query(`UPDATE layer.journals SET state='APPROVED', approved_by=$2, approved_at=$3 WHERE period_name=$1 AND state='BUILT'`, [period, by, at]);
  return js;
}

/** The ledger file for a month: Oracle's GL_INTERFACE CSV in a zip, or the Odoo journal-entry CSV. */
export async function journalFile(c: Q, period: string) {
  const rows = (await c.query(`SELECT * FROM layer.journals WHERE period_name=$1 ORDER BY id`, [period])).rows;
  const cl = client();
  const date = (await c.query(`SELECT to_char(end_date,'YYYY-MM-DD') d FROM hcm.payroll_periods WHERE period_name=$1`, [period])).rows[0]?.d ?? `${period}-28`;
  const js = rows.map((j: any) => ({ name: `${cl.short} ${KIND_NAME[j.kind as Kind][0]} ${period}`, category: 'Payroll', lines: j.lines as JLine[] }));
  if (cl.finance === 'ORACLE_FIN') {
    const csv = oracleCsv({ ledger: `${entityOf(cl.key)}0`, date, groupId: Number(period.replace('-', '')), batch: `${cl.code} Payroll ${period}`, journals: js });
    const zip = new JSZip(); zip.file('GlInterface.csv', csv, { date: new Date('2026-01-01T00:00:00Z') });
    return { name: `${cl.code} GlInterface ${period}.zip`, type: 'application/zip', body: await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }), preview: `${ORACLE_HEADER}\n${csv.split('\r\n').slice(0, 6).join('\n')}`, rows: csv.split('\r\n').filter(Boolean).length, layout: 'Oracle journal import file', illustrative: false };
  }
  const csv = odooCsv({ date, journals: js });
  return { name: `${cl.code} Odoo journal entries ${period}.csv`, type: 'text/csv', body: Buffer.from(csv, 'utf8'), preview: csv.split('\r\n').slice(0, 7).join('\n'), rows: csv.split('\r\n').filter(Boolean).length - 1, layout: 'Odoo journal entries (CSV import)', illustrative: true };
}

/** Posts the approved journals: the file goes to the ledger, and the import status is read back. */
export async function postJournals(c: PoolClient, period: string, at = now()) {
  const f = await journalFile(c, period);
  const lines = Number((await c.query(`SELECT COALESCE(sum(jsonb_array_length(lines)),0) n FROM layer.journals WHERE period_name=$1 AND state='APPROVED'`, [period])).rows[0].n);
  const ref = `${client().finance === 'ORACLE_FIN' ? 'GL' : 'ODOO'}-${client().code}-${period.replace('-', '')}`;
  const status = client().finance === 'ORACLE_FIN' ? `Imported: ${lines} lines, 0 rejected (Import Journals)` : `Imported: ${lines} lines`;
  await c.query(`UPDATE layer.journals SET state='POSTED', posted_at=$2, import_ref=$3, import_status=$4 WHERE period_name=$1 AND state='APPROVED'`, [period, at, ref, status]);
  return { file: f.name, lines, ref, status };
}

/** Opens the month's journal case once its payment is paid (WF-34). */
export async function startJournals(c: PoolClient, period: string, requester: number) {
  const open = (await c.query(`SELECT 1 FROM layer.requests WHERE workflow_id='WF-34' AND payload->>'period'=$1 AND status IN ('WAITING','RUNNING','ESCALATED')`, [period])).rows.length;
  const posted = (await c.query(`SELECT 1 FROM layer.journals WHERE period_name=$1 AND state='POSTED'`, [period])).rows.length;
  if (open || posted) return null;
  // Nothing reaches the ledger before the bank's report reconciles with the payroll (walkthrough addendum R37).
  const rec = (await c.query(`SELECT reconciliation FROM layer.payments WHERE period_name=$1 AND kind='REGULAR' ORDER BY id DESC LIMIT 1`, [period])).rows[0]?.reconciliation;
  if (rec && !rec.reconciled) return null;
  const { startCase } = await import('../engine/core.js');
  const month = new Date(`${period}-01T00:00:00Z`).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const monthAr = new Date(`${period}-01T00:00:00Z`).toLocaleString('ar', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return startCase(c, { workflowId: 'WF-34', type: 'JOURNALS', title: `${client().short} journals, ${month}`, title_ar: `قيود ${client().name_ar}، ${monthAr}`, requester, subject: requester, channel: 'EVENT', payload: { period } });
}

/** Every closed month's journals were posted when it was paid, except where `leaveOpen` says (§21, history). */
export async function seedJournalHistory(c: PoolClient, leaveOpen: string | null) {
  await seedLedger(c);
  const pers = (await c.query(`SELECT p.period_name, to_char(p.end_date,'YYYY-MM-DD') e FROM hcm.payroll_periods p WHERE p.status='CLOSED' AND EXISTS (SELECT 1 FROM layer.payments x WHERE x.period_name=p.period_name AND x.state='PAID') ORDER BY p.start_date`)).rows;
  for (const per of pers) {
    if (per.period_name === leaveOpen) continue;
    const at = new Date(Date.parse(`${per.e}T00:00:00Z`) + 5 * 864e5 + 10 * 3600e3);
    await buildJournals(c, per.period_name);
    await approveJournals(c, per.period_name, 'Sharifa AlMousa', null, at);
    await postJournals(c, per.period_name, new Date(at.getTime() + 3600e3));
  }
}
export { sar };
