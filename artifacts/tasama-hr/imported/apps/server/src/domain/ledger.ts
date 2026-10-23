/**
 * The illustrative chart of accounts, the default account map and the two ledger file layouts
 * (design/payroll-addendum.md §21, FIN-01 to FIN-05, FIN-12). Tasama has not shared its clients'
 * charts: every client gets this chart, labelled illustrative on the screen.
 */

export type Account = { code: string; name: string; name_ar: string; type: 'EXPENSE' | 'LIABILITY' | 'ASSET' | 'PROVISION'; byCostCentre: boolean; keywords?: string[] };

export const CHART: Account[] = [
  { code: '110100', name: 'Bank, payroll account', name_ar: 'البنك، حساب الرواتب', type: 'ASSET', byCostCentre: false },
  { code: '130500', name: 'Employee advances receivable', name_ar: 'سلف الموظفين المدينة', type: 'ASSET', byCostCentre: false, keywords: ['advance', 'loan'] },
  { code: '130600', name: 'Amounts due from employees', name_ar: 'مبالغ مستحقة على الموظفين', type: 'ASSET', byCostCentre: false },
  { code: '220100', name: 'Salaries payable', name_ar: 'رواتب مستحقة الدفع', type: 'LIABILITY', byCostCentre: false },
  { code: '220200', name: 'GOSI payable', name_ar: 'اشتراكات التأمينات المستحقة', type: 'LIABILITY', byCostCentre: false, keywords: ['gosi'] },
  { code: '220300', name: 'Other payroll deductions payable', name_ar: 'استقطاعات رواتب أخرى مستحقة', type: 'LIABILITY', byCostCentre: false, keywords: ['fine', 'deduction'] },
  { code: '250100', name: 'End-of-service provision', name_ar: 'مخصص مكافأة نهاية الخدمة', type: 'PROVISION', byCostCentre: false, keywords: ['gratuity', 'end of service'] },
  { code: '250200', name: 'Annual leave provision', name_ar: 'مخصص الإجازات السنوية', type: 'PROVISION', byCostCentre: false, keywords: ['leave'] },
  { code: '610100', name: 'Basic salaries', name_ar: 'الرواتب الأساسية', type: 'EXPENSE', byCostCentre: true, keywords: ['basic', 'salary'] },
  { code: '610200', name: 'Housing allowance', name_ar: 'بدل السكن', type: 'EXPENSE', byCostCentre: true, keywords: ['housing'] },
  { code: '610300', name: 'Transport allowance', name_ar: 'بدل النقل', type: 'EXPENSE', byCostCentre: true, keywords: ['transport'] },
  { code: '610400', name: 'Other allowances', name_ar: 'بدلات أخرى', type: 'EXPENSE', byCostCentre: true, keywords: ['other', 'allowance'] },
  { code: '610450', name: 'Site and field allowances', name_ar: 'بدلات المواقع والميدان', type: 'EXPENSE', byCostCentre: true, keywords: ['site', 'field', 'remote', 'project allowance'] },
  { code: '610500', name: 'Overtime', name_ar: 'العمل الإضافي', type: 'EXPENSE', byCostCentre: true, keywords: ['overtime'] },
  { code: '610600', name: 'Back pay and adjustments', name_ar: 'الفروقات والتسويات', type: 'EXPENSE', byCostCentre: true, keywords: ['back pay', 'arrears'] },
  { code: '610650', name: 'Notice pay', name_ar: 'بدل الإنذار', type: 'EXPENSE', byCostCentre: true, keywords: ['notice'] },
  { code: '610700', name: 'GOSI, employer contribution', name_ar: 'اشتراكات التأمينات، حصة صاحب العمل', type: 'EXPENSE', byCostCentre: true, keywords: ['gosi', 'employer'] },
  { code: '611000', name: 'End-of-service expense', name_ar: 'مصروف مكافأة نهاية الخدمة', type: 'EXPENSE', byCostCentre: true },
  { code: '611100', name: 'Annual leave expense', name_ar: 'مصروف الإجازات السنوية', type: 'EXPENSE', byCostCentre: true },
];
export const accountOf = (code: string) => CHART.find((a) => a.code === code) ?? null;

/**
 * The map every seeded client starts with, as approved by its finance team at go-live: pay element or
 * provision → account. The provision codes are the platform's own (EOS_*, LEAVE_*).
 */
export const DEFAULT_MAP: Record<string, string> = {
  BASIC: '610100', HOUSING: '610200', TRANSPORT: '610300', OTHER_ALW: '610400', OVERTIME: '610500', BACK_PAY: '610600', NOTICE_PAY: '610650',
  GOSI_ER: '610700', GOSI_EE_CO: '610700', GOSI_EE: '220200', GOSI_ARREARS: '220200', GOSI_PAYABLE: '220200',
  ADVANCE_REC: '130500', ADVANCE_RECOVERY: '130500', LATE_FINE: '220300', OTHER_DEDUCTION: '220300',
  NET_PAY: '220100', BANK: '110100', DUE_FROM_EMPLOYEE: '130600',
  EOS_EXPENSE: '611000', EOS_PROVISION: '250100', LEAVE_EXPENSE: '611100', LEAVE_PROVISION: '250200',
  GRATUITY: '250100', LEAVE_ENCASH: '250200',
};

/** The entity segment of each client's ledger. */
export const ENTITY: Record<string, string> = { roshn: '110', riyadhair: '210', redsea: '310', seven: '410', saudicoffee: '510' };
export const entityOf = (key: string) => ENTITY[key] ?? '610';
/** The cost-centre segment from a department's cost centre ("CC-COM-104" → "0104"). */
export const ccSegment = (cc: string | null | undefined) => { const m = String(cc ?? '').match(/(\d+)\s*$/); return m ? m[1].padStart(4, '0').slice(-4) : '0000'; };
export const combination = (entity: string, cc: string, account: string) => `${entity}.${cc}.${account}.0000`;

/** Qaid's proposal for an unmapped line: the chart account whose name and keywords best match the line's own name. */
export function propose(name: string, kind: 'EARNING' | 'DEDUCTION' | 'EMPLOYER'): { account: Account; score: number; why: string } | null {
  const words = name.toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter((w) => w.length > 2);
  const pool = CHART.filter((a) => (kind === 'DEDUCTION' ? a.type !== 'EXPENSE' : a.type === 'EXPENSE'));
  let best: { account: Account; score: number; why: string } | null = null;
  for (const a of pool) {
    const hay = `${a.name} ${(a.keywords ?? []).join(' ')}`.toLowerCase();
    const hits = words.filter((w) => hay.includes(w));
    const score = hits.length + (a.keywords ?? []).filter((k) => name.toLowerCase().includes(k)).length;
    if (score > (best?.score ?? 0)) best = { account: a, score, why: hits.join(', ') };
  }
  return best;
}

/* ------------------------------------------------------------------ ledger files */

export type JLine = { account: string; cc: string; combination: string; debit: number; credit: number; description: string };

/** Oracle's GL_INTERFACE layout, as File-Based Data Import loads it (FIN-05): one CSV row per journal line. */
export function oracleCsv(x: { ledger: string; date: string; groupId: number; batch: string; journals: { name: string; category: string; lines: JLine[] }[] }): string {
  const rows: string[] = [];
  for (const j of x.journals) for (const l of j.lines) {
    const [s1, s2, s3, s4] = l.combination.split('.');
    rows.push(['NEW', x.ledger, x.date, 'Tasama Payroll', j.category, 'SAR', x.date, 'A', s1, s2, s3, s4, l.debit ? l.debit.toFixed(2) : '', l.credit ? l.credit.toFixed(2) : '', x.batch, j.name, `"${l.description.replace(/"/g, '""')}"`, String(x.groupId)].join(','));
  }
  return rows.join('\r\n') + '\r\n';
}
export const ORACLE_HEADER = 'Status Code,Ledger ID,Effective Date of Transaction,Journal Source,Journal Category,Currency Code,Journal Entry Creation Date,Actual Flag,Segment1,Segment2,Segment3,Segment4,Entered Debit Amount,Entered Credit Amount,REFERENCE1 (Batch Name),REFERENCE4 (Journal Entry Name),REFERENCE10 (Journal Entry Line Description),Interface Group Identifier';

/** Odoo's journal-entry import, one row per line (FIN-12, illustrative until Tasama confirms the ledgers). */
export function odooCsv(x: { date: string; journals: { name: string; lines: JLine[] }[] }): string {
  const out = ['Journal,Date,Reference,Line/Account,Line/Label,Line/Analytic,Line/Debit,Line/Credit'];
  for (const j of x.journals) j.lines.forEach((l, i) => out.push([i ? '' : 'Payroll', i ? '' : x.date, i ? '' : `"${j.name}"`, l.account, `"${l.description.replace(/"/g, '""')}"`, l.cc === '0000' ? '' : l.cc, l.debit.toFixed(2), l.credit.toFixed(2)].join(',')));
  return out.join('\r\n') + '\r\n';
}
