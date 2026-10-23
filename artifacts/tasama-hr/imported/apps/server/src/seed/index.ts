/**
 * Build the database from scratch: for each Tasama client, its own simulated
 * HRMS (hcm_<key>) and agentic-layer store (layer_<key>) with a replayed case
 * history; then Tasama's own schema, derived from the client accounts.
 */
import { applyCalendar } from '../domain/calendar.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { pool, withClient } from '../db.js';
import { seedBase } from './base.js';
import { seedLayer } from './layer.js';
import { seedAttendance } from './attendance.js';
import { seedInputs } from './inputs.js';
import { seedRuns } from './runs.js';
import { fillBankDetails, seedPaymentHistory } from '../payroll/payments.js';
import { seedJournalHistory, startJournals } from '../payroll/journals.js';
import { seedHistory } from './history.js';
import { seedTasama } from './tasama.js';
import { seedIssues } from './issues.js';
import { basiraScan } from '../tasama/basira.js';

/** Bump when the data model or the planted demo data changes: a deployed app rebuilds its data on the next start. */
export const SEED_VERSION = 11;
import { scan } from '../agents/amin.js';
import { setClock } from '../clock.js';
import { resetPeople } from '../engine/handlers.js';
import { iso } from '../domain/rules.js';
import { CLIENTS } from '../domain/clients.js';

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA = resolve(here, '../../../../db/schema.sql');
const TASAMA = resolve(here, '../../../../db/tasama.sql');

/** The client schema script with hcm/layer renamed to this client's schemas. */
export const schemaFor = (key: string) => readFileSync(SCHEMA, 'utf8').replace(/\b(hcm|layer)\b(?=[.;\s(])/g, (_m, s) => `${s}_${key}`);

let running: Promise<unknown> | null = null;

export async function reseed(log: (s: string) => void = console.log) {
  if (running) return running;
  running = (async () => {
    const t0 = Date.now();
    try {
      resetPeople();
      const anchor = new Date(`${iso(new Date())}T00:00:00Z`);
      applyCalendar(anchor);
      for (const cl of CLIENTS) {
        await withClient(cl.key, async () => {
          const c = await pool.connect();
          try {
            await c.query(schemaFor(cl.key));
            await c.query('BEGIN');
            const base = await seedBase(c, anchor, cl);
            await fillBankDetails(c);
            await seedLayer(c, base, cl);
            await seedAttendance(c, base, cl);
            await c.query('COMMIT');
            await c.query('BEGIN');
            const open = await seedHistory(c, base, cl);
            setClock(null);
            await seedInputs(c, base, cl);
            await seedRuns(c, base, cl);
            await seedPaymentHistory(c);
            // Edge 11: ROSHN's last month is paid and its journals wait on the payroll lead (§21).
            const lastClosed = (await c.query(`SELECT period_name FROM hcm.payroll_periods WHERE status='CLOSED' ORDER BY start_date DESC LIMIT 1`)).rows[0]?.period_name ?? null;
            await seedJournalHistory(c, cl.key === 'roshn' ? lastClosed : null);
            if (cl.key === 'roshn' && lastClosed) await startJournals(c, lastClosed, base.persona.payroll);
            await seedIssues(c, cl, anchor);
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
      const pat = await basiraScan({ useClaude: false });
      await pool.query(`INSERT INTO tasama.meta (key, value) VALUES ('seed_version', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [JSON.stringify(SEED_VERSION)]);
      log(`Basira: ${pat.flagged.length} patterns flagged, ${pat.watched} rises looked at and not flagged`);
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
    const r = await pool.query(`SELECT key, value FROM tasama.meta WHERE key IN ('seeded_at','seed_version')`);
    return r.rows.some((x: any) => x.key === 'seeded_at') && Number(r.rows.find((x: any) => x.key === 'seed_version')?.value) === SEED_VERSION;
  } catch {
    return false;
  }
}

/** After a restart on an existing database: put the payroll calendar back around the anchor the data was seeded on. */
export async function restoreCalendar() {
  const r = await pool.query(`SELECT value FROM layer_roshn.meta WHERE key='anchor'`).catch(() => ({ rows: [] as any[] }));
  const a = r.rows[0]?.value;
  if (a) applyCalendar(new Date(typeof a === 'string' ? a : String(a)));
}
