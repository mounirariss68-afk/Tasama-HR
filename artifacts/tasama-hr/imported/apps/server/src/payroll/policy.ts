/**
 * The client's policy versions in the layer store (layer.policy_versions,
 * layer.policy_rules). Written by Nizam's reading (WF-26) and by the seed.
 */
import type { PoolClient } from 'pg';
import { now } from '../clock.js';
import type { Rule } from '../domain/payroll-policy.js';
import type { Reading } from '../agents/nizam.js';

type Q = PoolClient | { query: PoolClient['query'] };

/** The readings a person may choose for an unclear rule. */
export const READINGS: Record<string, { code: string; label: string; label_ar: string; value: string; num: number | null }[]> = {
  'overtime.rate': [
    { code: 'GROSS_1_5', label: '1.5 × the full hourly wage (basic and allowances)', label_ar: '1.5 × أجر الساعة الكامل (الأساسي والبدلات)', value: '1.5 × the full hourly wage', num: 1.5 },
    { code: 'LEGAL', label: 'The law\'s formula: hourly wage + 50% of the basic hourly wage', label_ar: 'صيغة النظام: أجر الساعة + 50% من أجر الساعة الأساسي', value: 'Hourly wage + 50% of basic hourly', num: 1.5 },
  ],
};
/** What Tasama's payroll lead recommends for each unclear rule, and why. */
export const RECOMMENDED: Record<string, { code: string; why: string; why_ar: string }> = {
  'overtime.rate': { code: 'GROSS_1_5', why: 'the words favour the employee, and a term more generous than the law binds the company (Art. 8)', why_ar: 'النص في صالح الموظف، والشرط الأفضل من النظام ملزم للشركة (المادة 8)' },
};

export async function nextVersion(c: Q) {
  const n = (await c.query(`SELECT COUNT(*)::int n FROM layer.policy_versions`)).rows[0].n as number;
  return `${n + 1}.0`;
}

export async function saveVersion(c: Q, reading: Reading, o: { version: string; status: 'DRAFT' | 'ACTIVE'; effective: string; activatedBy?: string; at?: Date; requestId?: number | null; resolutions?: Record<string, string> }) {
  const at = o.at ?? now();
  const v = (await c.query(
    `INSERT INTO layer.policy_versions (version, status, source, read_by, effective_from, created_at, activated_by, activated_at, request_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [o.version, o.status, reading.source, reading.by, o.effective, at, o.activatedBy ?? null, o.status === 'ACTIVE' ? at : null, o.requestId ?? null],
  )).rows[0].id as number;
  for (const r of reading.rules) await insertRule(c, v, r, o.resolutions?.[r.key] ?? null);
  return v;
}

async function insertRule(c: Q, versionId: number, r: Rule, resolution: string | null) {
  await c.query(
    `INSERT INTO layer.policy_rules (version_id, dim, key, label, label_ar, value, value_ar, num, basis, clause, quote, flag, flag_note, resolution) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [versionId, r.dim, r.key, r.label, r.label_ar, r.value, r.value_ar ?? null, r.num ?? null, r.basis, r.clause, r.quote ?? null, r.flag ?? null, r.flag_note ?? null, resolution],
  );
}

export const activeVersion = async (c: Q) => (await c.query(`SELECT * FROM layer.policy_versions WHERE status='ACTIVE' ORDER BY id DESC LIMIT 1`)).rows[0] ?? null;
export const rulesOf = async (c: Q, versionId: number) => (await c.query(`SELECT * FROM layer.policy_rules WHERE version_id=$1 ORDER BY dim, id`, [versionId])).rows;
