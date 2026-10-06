/**
 * PostgreSQL access. On Replit the database is provisioned from the Database
 * tool and its URL arrives as DATABASE_URL; locally the same variable is used.
 */
import pg from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    '\nDATABASE_URL is not set.\n' +
      'On Replit: open the Database tool, create a PostgreSQL database, then press Run again.\n' +
      'Locally: export DATABASE_URL=postgres://user:pass@localhost:5432/rafeeq\n',
  );
  process.exit(1);
}

// Replit / Neon require TLS; a local server does not.
const needsSsl = /neon\.tech|replit|sslmode=require/.test(url);
export const pool = new pg.Pool({
  connectionString: url,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  max: 10,
});

/**
 * Multi-client routing. Each Tasama client has its own simulated HRMS schema
 * (hcm_<key>) and its own agentic-layer schema (layer_<key>). Code writes
 * `hcm.` and `layer.` as if there were one company; every query is rewritten
 * here to the schemas of the client in the current request (or seed step).
 * Tasama-level data lives in the `tasama` schema and is never rewritten.
 * A query that names hcm/layer with no client in context fails loudly.
 */
const tenant = new AsyncLocalStorage<{ client: string }>();
export const currentClient = () => tenant.getStore()?.client ?? null;
export function withClient<T>(client: string, fn: () => T): T { return tenant.run({ client }, fn); }
export function enterClient(client: string) { tenant.enterWith({ client }); }
const SCHEMA_RE = /\b(hcm|layer)\.(?=[a-z_"])/g;
export function routeSql(sql: string): string {
  const c = currentClient();
  if (!c) return sql;
  return sql.replace(SCHEMA_RE, (_m, s) => `${s}_${c}.`);
}
const origQuery = (pg.Client.prototype as any).query;
(pg.Client.prototype as any).query = function (config: any, ...rest: any[]) {
  if (typeof config === 'string') config = routeSql(config);
  else if (config && typeof config.text === 'string') config = { ...config, text: routeSql(config.text) };
  return origQuery.call(this, config, ...rest);
};
// Also at the pool, before a connection is acquired, so the client in context is the caller's.
const origPoolQuery = (pg.Pool.prototype as any).query;
(pg.Pool.prototype as any).query = function (config: any, ...rest: any[]) {
  if (typeof config === 'string') config = routeSql(config);
  else if (config && typeof config.text === 'string') config = { ...config, text: routeSql(config.text) };
  return origPoolQuery.call(this, config, ...rest);
};

// Dates come back as 'YYYY-MM-DD' strings, numerics as JS numbers.
pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));

export type Q = { query: <T = any>(sql: string, params?: unknown[]) => Promise<{ rows: T[]; rowCount: number | null }> };

export async function q<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  const r = await pool.query(sql, params);
  return r.rows as T[];
}
export async function one<T = any>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  const r = await pool.query(sql, params);
  return r.rows[0] as T | undefined;
}

export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const out = await fn(c);
    await c.query('COMMIT');
    return out;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

/** Bulk insert helper: rows of objects with identical keys. */
export async function insertMany(c: Q, table: string, rows: Record<string, unknown>[], returning = '') {
  if (!rows.length) return [] as any[];
  const cols = Object.keys(rows[0]);
  const out: any[] = [];
  const chunk = Math.max(1, Math.floor(30000 / cols.length));
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const params: unknown[] = [];
    const values = part
      .map((r) => `(${cols.map((k) => { const v = r[k]; params.push(v !== null && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v) ? JSON.stringify(v) : Array.isArray(v) && v.length && typeof v[0] === 'object' ? JSON.stringify(v) : v); return `$${params.length}`; }).join(',')})`)
      .join(',');
    const r = await c.query(`INSERT INTO ${table} (${cols.join(',')}) VALUES ${values} ${returning ? `RETURNING ${returning}` : ''}`, params);
    out.push(...r.rows);
  }
  return out;
}
