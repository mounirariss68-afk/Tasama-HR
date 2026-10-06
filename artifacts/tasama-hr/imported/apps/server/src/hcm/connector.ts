/**
 * THE CONNECTOR — the only code in the platform that speaks to a client's HRMS.
 *
 * Each Tasama client runs its own system of record. Some run Oracle Fusion
 * Cloud HCM, some run Odoo. The layer above this file asks for the same
 * things either way (a worker, an absence, a salary, a document record); this
 * file turns each request into the client's own dialect and logs it:
 *
 *   Oracle   REST resources under /hcmRestApi/resources/11.13.18.05/ and
 *            Atom feed collections for change events.
 *   Odoo 19  External JSON-2 API: POST /json/2/<model>/<method> (search_read,
 *            create, write) with a bearer API key, and webhooks from Odoo
 *            automation rules for change events.
 *
 * In the demo both are simulated by the client's hcm_<key> schema. Replace the
 * bodies of read/write/atom with real HTTP calls per vendor and nothing above
 * this file changes. Every call is written to the client's integration log,
 * which the HRMS Connector screen shows live.
 */
import type { PoolClient } from 'pg';
import { now } from '../clock.js';
import { client } from '../domain/rules.js';

export const BASE = '/hcmRestApi/resources/11.13.18.05';

export type Ctx = { c: PoolClient | { query: PoolClient['query'] }; requestId?: number | null; actor?: string; quiet?: boolean };

let seq = 0;
const jitter = (lo: number, hi: number) => { seq = (seq * 1103515245 + 12345) % 2147483648; return lo + (seq % (hi - lo)); };

export async function log(ctx: Ctx, system: string, direction: 'OUT' | 'IN', method: string, resource: string, status: number, summary: string, latency?: number) {
  await ctx.c.query(
    `INSERT INTO layer.integration_log (at, system, direction, method, resource, status_code, latency_ms, request_id, actor_id, summary)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [now(), system, direction, method, resource, status, latency ?? (method === 'GET' ? jitter(90, 400) : jitter(600, 2400)), ctx.requestId ?? null, ctx.actor ?? null, summary],
  );
}

/** Oracle resource (first path segment) -> Odoo 19 model. */
const ODOO_MODEL: [RegExp, string][] = [
  [/^(workers|emps|publicWorkers|persons)/i, 'hr.employee'],
  [/^absences/i, 'hr.leave'],
  [/^(planBalances|absenceBalances|absenceTypes)/i, 'hr.leave.allocation'],
  [/^(salaries|salary)/i, 'hr.version'],
  [/^(elementEntries|payroll|payslips|payrollRelationships)/i, 'hr.payslip'],
  [/^(documentRecords|documents)/i, 'ir.attachment'],
  [/^(jobRequisitions|requisitions)/i, 'hr.job'],
  [/^(recruitingCandidates|recruitingJobApplications|candidates|applications|offers)/i, 'hr.applicant'],
  [/^(performanceDocuments|goals|checkIns|talent)/i, 'hr.appraisal'],
  [/^(positions|jobs|grades)/i, 'hr.job'],
  [/^(departments|organizations)/i, 'hr.department'],
  [/^(journeys|journeyTasks|onboarding)/i, 'mail.activity'],
  [/^(learning)/i, 'slide.channel.partner'],
  [/^(advances|loans)/i, 'hr.salary.attachment'],
];
const odooModel = (resource: string) => ODOO_MODEL.find(([re]) => re.test(resource))?.[1] ?? 'hr.employee';
const odooMethod = (method: string) => (method === 'GET' ? 'search_read' : method === 'POST' ? 'create' : method === 'DELETE' ? 'unlink' : 'write');

/** The HRMS label and the call as this client's system would receive it. */
export function hrmsCall(method: string, resource: string, query = '') {
  if (client().hrms === 'ODOO') return { system: 'ODOO', method: 'POST', path: `/json/2/${odooModel(resource)}/${odooMethod(method)}` };
  return { system: 'ORACLE_HCM', method, path: `${BASE}/${resource}${query ? `?${query}` : ''}` };
}

/** A read against the client's HRMS. `fn` runs the query that stands in for the API call. */
export async function read<T>(ctx: Ctx, resource: string, query: string, summary: string, fn: () => Promise<T>): Promise<T> {
  const out = await fn();
  if (!ctx.quiet) { const k = hrmsCall('GET', resource, query); await log(ctx, k.system, 'OUT', k.method, k.path, 200, summary); }
  return out;
}

/** A transaction against the client's HRMS. */
export async function write<T>(ctx: Ctx, method: 'POST' | 'PATCH' | 'DELETE', resource: string, summary: string, fn: () => Promise<T>, status = method === 'POST' ? 201 : 200): Promise<T> {
  const out = await fn();
  const k = hrmsCall(method, resource);
  await log(ctx, k.system, 'OUT', k.method, k.path, client().hrms === 'ODOO' ? 200 : status, summary);
  return out;
}

/** A change event from the HRMS: an Oracle Atom feed entry, or an Odoo automation-rule webhook. */
export async function atom(ctx: Ctx, collection: string, entityKey: string, summary: string, payload: Record<string, unknown>) {
  await ctx.c.query(`INSERT INTO hcm.atom_events (collection, entity_key, summary, payload, published_at) VALUES ($1,$2,$3,$4,$5)`,
    [collection, entityKey, summary, JSON.stringify(payload), now()]);
  if (client().hrms === 'ODOO') await log(ctx, 'ODOO_WEBHOOK', 'IN', 'POST', `/hooks/odoo/${odooModel(collection)}`, 200, summary, jitter(20, 80));
  else await log(ctx, 'ATOM', 'IN', 'FEED', `/hcmRestApi/atomservlet/employee/${collection}`, 200, summary, jitter(20, 80));
}

/** Saudi government and third-party systems the HR process depends on. All simulated. */
export type ExternalSystem = 'QIWA' | 'GOSI' | 'MUQEEM' | 'MUDAD' | 'JADARAT' | 'ABSHER' | 'CCHI' | 'M365' | 'BGCHECK' | 'ASSESSMENT';
export async function external(ctx: Ctx, system: ExternalSystem, method: string, resource: string, summary: string, status = 200) {
  await log(ctx, system, 'OUT', method, resource, status, summary, jitter(300, 1800));
}
