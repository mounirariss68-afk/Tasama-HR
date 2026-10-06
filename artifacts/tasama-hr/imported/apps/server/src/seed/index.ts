/**
 * Build the database from scratch: for each Tasama client, its own simulated
 * HRMS (hcm_<key>) and agentic-layer store (layer_<key>) with a replayed case
 * history; then Tasama's own schema, derived from the client accounts.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { pool, withClient } from '../db.js';
import { seedBase } from './base.js';
import { seedLayer } from './layer.js';
import { seedHistory } from './history.js';
import { seedTasama } from './tasama.js';
import { scan } from '../agents/amin.js';
import { setClock } from '../clock.js';
import { resetPeople } from '../engine/handlers.js';
import { iso } from '../domain/rules.js';
import { CLIENTS } from '../domain/clients.js';

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA = resolve(here, '../../../../db/schema.sql');
const TASAMA = resolve(here, '../../../../db/tasama.sql');

/** The client schema script with hcm/layer renamed to this client's schemas. */
const schemaFor = (key: string) => readFileSync(SCHEMA, 'utf8').replace(/\b(hcm|layer)\b(?=[.;\s(])/g, (_m, s) => `${s}_${key}`);

let running: Promise<unknown> | null = null;

export async function reseed(log: (s: string) => void = console.log) {
  if (running) return running;
  running = (async () => {
    const t0 = Date.now();
    try {
      resetPeople();
      const anchor = new Date(`${iso(new Date())}T00:00:00Z`);
      for (const cl of CLIENTS) {
        await withClient(cl.key, async () => {
          const c = await pool.connect();
          try {
            await c.query(schemaFor(cl.key));
            await c.query('BEGIN');
            const base = await seedBase(c, anchor, cl);
            await seedLayer(c, base, cl);
            await c.query('COMMIT');
            await c.query('BEGIN');
            const open = await seedHistory(c, base, cl);
            setClock(null);
            await scan(c, iso(new Date()));
            await c.query(`DELETE FROM layer.integration_log WHERE id NOT IN (SELECT id FROM layer.integration_log ORDER BY at DESC LIMIT 4000)`);
            await c.query('COMMIT');
            log(`${cl.short}: ${base.active.length} active workers on ${cl.hrmsLabel}; ${Object.keys(open).length} open cases`);
          } catch (e) {
            await c.query('ROLLBACK').catch(() => {});
            throw e;
          } finally {
            setClock(null);
            c.release();
          }
        });
      }
      await pool.query(readFileSync(TASAMA, 'utf8'));
      await seedTasama(log);
      log(`seeded in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    } finally {
      setClock(null);
      running = null;
    }
  })();
  return running;
}

export async function isSeeded() {
  try {
    const r = await pool.query(`SELECT value FROM tasama.meta WHERE key='seeded_at'`);
    return r.rows.length > 0;
  } catch {
    return false;
  }
}
