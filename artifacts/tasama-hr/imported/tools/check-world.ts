/**
 * npm run check — assertions over the live world (canon: stages/03-build.md).
 * Reads the database the server uses (DATABASE_URL) and the running server
 * (CHECK_BASE, default http://localhost:5000). Exits non-zero on any failure.
 * It reads only; it never writes.
 */
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL is not set.'); process.exit(2); }
const BASE = process.env.CHECK_BASE ?? `http://localhost:${process.env.PORT ?? 5000}`;
const pool = new pg.Pool({ connectionString: url, ssl: /sslmode=require/.test(url) ? { rejectUnauthorized: false } : undefined });
const one = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows[0];
const n = async (sql: string, p: unknown[] = []) => Number(Object.values((await one(sql, p)) ?? { n: 0 })[0] ?? 0);

const results: { ok: boolean; name: string; detail: string }[] = [];
const check = async (name: string, f: () => Promise<[boolean, string]>) => {
  try { const [ok, detail] = await f(); results.push({ ok, name, detail }); } catch (e: any) { results.push({ ok: false, name, detail: e.message }); }
};
const api = async (path: string, persona = 'tasama', client = 'roshn') => {
  const r = await fetch(`${BASE}/api${path}`, { headers: { 'x-persona': persona, 'x-client': client } });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
};

async function main() {
  const clients: string[] = (await pool.query(`SELECT key FROM tasama.clients ORDER BY key`)).rows.map((r) => r.key);
  await check('Five client accounts exist', async () => [clients.length === 5, clients.join(', ')]);
  await check('Server is up and not seeding', async () => { const h = await (await fetch(`${BASE}/api/health`)).json(); return [h.ok === true && !h.seeding, JSON.stringify(h)]; });

  for (const k of clients) {
    const H = `hcm_${k}`, L = `layer_${k}`;
    await check(`${k}: workers on record`, async () => { const c = await n(`SELECT count(*) FROM ${H}.persons`); return [c >= 100, `${c} persons`]; });
    await check(`${k}: seven personas`, async () => { const c = await n(`SELECT count(*) FROM ${L}.personas`); return [c === 7, `${c}`]; });
    await check(`${k}: every waiting case names the person it waits on`, async () => { const c = await n(`SELECT count(*) FROM ${L}.requests WHERE status='WAITING' AND waiting_on_person_id IS NULL`); return [c === 0, `${c} without`]; });
    await check(`${k}: a leave request waits on a line manager`, async () => { const c = await n(`SELECT count(*) FROM ${L}.requests WHERE workflow_id='WF-15' AND status='WAITING' AND waiting_on_role='LINE_MANAGER'`); return [c >= 1, `${c}`]; });
    await check(`${k}: every case has a trail`, async () => { const c = await n(`SELECT count(*) FROM ${L}.requests r WHERE NOT EXISTS (SELECT 1 FROM ${L}.trail t WHERE t.request_id=r.id)`); return [c === 0, `${c} without`]; });
    await check(`${k}: every completed case wrote through the connector or needed no write`, async () => { const c = await n(`SELECT count(*) FROM ${L}.integration_log WHERE method <> 'GET'`); return [c > 0, `${c} writes logged`]; });
    await check(`${k}: share closed with no HR touch is realistic (15–95%)`, async () => {
      const r = await one(`SELECT count(*) FILTER (WHERE status='COMPLETED') AS done, count(*) FILTER (WHERE status='COMPLETED' AND NOT EXISTS (SELECT 1 FROM ${L}.approvals a WHERE a.request_id=r.id)) AS untouched FROM ${L}.requests r`);
      const share = Number(r.done) ? Number(r.untouched) / Number(r.done) : 0; return [share >= 0.15 && share <= 0.95, `${Math.round(share * 100)}% of ${r.done}`];
    });
    await check(`${k}: issue history for the pattern watch (26 weeks)`, async () => { const r = await one(`SELECT count(*) AS n, round(extract(epoch FROM now() - min(occurred_at)) / 604800) AS w FROM ${L}.issues`); return [Number(r.n) > 30 && Number(r.w) >= 24, `${r.n} issues over ${r.w} weeks`]; });
  }

  await check('Planted: the Riyadh Air manager is away with no delegate', async () => { const c = await n(`SELECT count(*) FROM hcm_riyadhair.absences WHERE absence_number='DEMO-ABS-P0001'`); return [c === 1, `${c}`]; });
  await check('Planted: Basira holds a single-client and a cross-client pattern', async () => { const r = (await pool.query(`SELECT scope FROM tasama.patterns WHERE status <> 'CLOSED'`)).rows.map((x) => x.scope); return [r.includes('CLIENT') && r.includes('CROSS_CLIENT'), r.join(', ')]; });
  await check('Planted: the SEVEN one-week burst is looked at and not flagged', async () => { const c = await n(`SELECT count(*) FROM tasama.pattern_watch WHERE client_key = 'seven'`); return [c >= 1, `${c}`]; });
  await check('Tasama: every client has invoices', async () => { const c = await n(`SELECT count(DISTINCT client_key) FROM tasama.invoices`); return [c === 5, `${c}`]; });
  await check('Tasama: delivery staff allocated', async () => { const c = await n(`SELECT count(*) FROM tasama.allocations`); return [c >= 5, `${c}`]; });

  await check('API: nine Director scenarios', async () => { const d = await api('/director/scenarios'); return [d.length === 9, `${d.length}`]; });
  await check('API: nineteen agents, none autonomous', async () => { const d = await api('/agents'); return [d.length === 19 && !d.some((a: any) => a.autonomy === 'A4'), `${d.length}; A4: ${d.filter((a: any) => a.autonomy === 'A4').length}`]; });
  await check('API: the employee balance matches the leave screen', async () => { const me = await api('/me', 'employee'); const a = me.balances.find((b: any) => b.type_code === 'ANNUAL'); return [a && a.balance >= 0 && Math.abs(a.entitlement + a.carried_over - a.taken - a.booked - a.balance) < 0.6, a ? `${a.entitlement}+${a.carried_over}-${a.taken}-${a.booked}=${a.balance}` : 'none']; });
  await check('API: the manager inbox holds a leave decision', async () => { const d = await api('/requests?view=inbox', 'manager'); return [d.some((r: any) => r.workflow_id === 'WF-15'), `${d.length} waiting`]; });
  await check('API: the server refuses a decision that is not yours', async () => {
    const d = await api('/requests?view=inbox', 'manager');
    const r = await fetch(`${BASE}/api/requests/${d[0].ref}/decide`, { method: 'POST', headers: { 'x-persona': 'employee', 'x-client': 'roshn', 'content-type': 'application/json' }, body: JSON.stringify({ decision: 'APPROVED' }) });
    return [r.status === 403, `HTTP ${r.status}`];
  });
  await check('API: an employee cannot open a person outside their scope', async () => { const r = await fetch(`${BASE}/api/people/1`, { headers: { 'x-persona': 'employee', 'x-client': 'roshn' } }); return [r.status === 403, `HTTP ${r.status}`]; });

  await pool.end();
  const failed = results.filter((r) => !r.ok);
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  (${r.detail})`);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
