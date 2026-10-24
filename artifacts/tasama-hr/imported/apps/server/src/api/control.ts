/** Agent Control: agents, workflows, connector, evidence, policies, value, scenarios, reset. */
import { Router } from 'express';
import { pool } from '../db.js';
import { personaOf, TASAMA_STAFF } from './session.js';
import { AGENTS } from '../domain/agents.js';
import { SCENARIOS, runScenario, getRun, clearRuns } from '../scenarios.js';
import { TASAMA_SCENARIOS, runTasamaScenario, getTasamaRun, clearTasamaRuns } from '../tasama/scenarios.js';
import { reseed } from '../seed/index.js';
import { resetPersonas } from './session.js';
import { resetPeople } from '../engine/handlers.js';

import { dropOnboardedSchemas } from '../onboarding/golive.js';
export const control = Router();

control.get('/agents', async (_req, res) => {
  const agents = (await pool.query(`SELECT a.*, COALESCE(p.display_name, CASE a.id WHEN 'nizam' THEN 'Sharifa AlMousa, Tasama' ELSE 'Tasama payroll team' END) AS owner_name, COALESCE(p.display_name_ar, CASE a.id WHEN 'nizam' THEN 'شريفة الموسى، تسامى' ELSE 'فريق الرواتب في تسامى' END) AS owner_name_ar FROM layer.agents a LEFT JOIN hcm.persons p ON p.id=a.owner_person_id ORDER BY a.sort`)).rows;
  const stats = (await pool.query(`SELECT actor_id, act, COUNT(*)::int n FROM layer.trail WHERE actor_type='AGENT' GROUP BY 1,2`)).rows;
  const steps = (await pool.query(`SELECT actor_id, COUNT(*)::int n, COUNT(DISTINCT request_id)::int cases FROM layer.run_steps WHERE actor_type='AGENT' AND status IN ('DONE','REFUSED') GROUP BY 1`)).rows;
  const overrides = (await pool.query(`SELECT s.actor_id, COUNT(*)::int n FROM layer.trail t JOIN layer.run_steps s ON s.request_id=t.request_id AND s.actor_type='AGENT' WHERE t.act='OVERRIDE' GROUP BY 1`)).rows;
  const answers = (await pool.query(`SELECT agent_id, COUNT(*)::int n FROM layer.messages WHERE role='assistant' GROUP BY 1`)).rows;
  // A Tasama-owned agent has no owner on the client's HRMS: name the Tasama person from the agent's definition (design/hr-ops-addendum.md 4b).
  const tasamaOwner = (id: string) => TASAMA_STAFF.find((x) => x.key === AGENTS.find((d) => d.id === id)?.owner);
  res.json(agents.map((a: any) => ({
    ...a,
    ...(a.owner_person_id ? {} : tasamaOwner(a.id) ? { owner_name: `${tasamaOwner(a.id)!.display_name}, Tasama`, owner_name_ar: `${tasamaOwner(a.id)!.display_name_ar}، تسامى` } : {}),
    stats: {
      actions: steps.find((s: any) => s.actor_id === a.id)?.n ?? 0,
      cases: steps.find((s: any) => s.actor_id === a.id)?.cases ?? 0,
      refusals: stats.find((s: any) => s.actor_id === a.id && s.act === 'REFUSE')?.n ?? 0,
      escalations: stats.find((s: any) => s.actor_id === a.id && s.act === 'ESCALATE')?.n ?? 0,
      overridden: overrides.find((o: any) => o.actor_id === a.id)?.n ?? 0,
      answers: answers.find((x: any) => x.agent_id === a.id)?.n ?? 0,
    },
  })));
});

control.get('/agents/:id/trail', async (req, res) => {
  res.json((await pool.query(`SELECT t.*, r.ref, r.title FROM layer.trail t LEFT JOIN layer.requests r ON r.id=t.request_id WHERE t.actor_id=$1 ORDER BY t.at DESC LIMIT 25`, [req.params.id])).rows);
});

control.get('/workflows', async (_req, res) => {
  const defs = (await pool.query(`SELECT * FROM layer.workflow_defs ORDER BY num`)).rows;
  const counts = (await pool.query(`SELECT workflow_id, status, COUNT(*)::int n FROM layer.requests GROUP BY 1,2`)).rows;
  const cycle = (await pool.query(`SELECT workflow_id, PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM closed_at - created_at)) AS median_s FROM layer.requests WHERE closed_at IS NOT NULL GROUP BY 1`)).rows;
  res.json(defs.map((d: any) => ({ ...d, counts: Object.fromEntries(counts.filter((c: any) => c.workflow_id === d.id).map((c: any) => [c.status, c.n])), median_s: cycle.find((c: any) => c.workflow_id === d.id)?.median_s ?? null })));
});

control.get('/connector', async (req, res) => {
  const system = req.query.system ? String(req.query.system) : null;
  const writes = req.query.writes === '1';
  const params: unknown[] = [];
  const where: string[] = [];
  if (system) { params.push(system); where.push(`l.system = $${params.length}`); }
  if (writes) where.push(`(l.method <> 'GET' AND l.resource NOT LIKE '%/search_read')`);
  const logs = (await pool.query(`SELECT l.*, r.ref FROM layer.integration_log l LEFT JOIN layer.requests r ON r.id=l.request_id ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY l.at DESC, l.id DESC LIMIT 150`, params)).rows;
  const stats = (await pool.query(`SELECT system, COUNT(*)::int calls, COUNT(*) FILTER (WHERE (method <> 'GET' AND resource NOT LIKE '%/search_read'))::int writes, ROUND(AVG(latency_ms))::int avg_ms, COUNT(*) FILTER (WHERE status_code >= 400)::int errors, MAX(at) AS last FROM layer.integration_log GROUP BY 1 ORDER BY 2 DESC`)).rows;
  const resources = (await pool.query(`SELECT split_part(regexp_replace(regexp_replace(regexp_replace(resource, '^/hcmRestApi/resources/11\\.13\\.18\\.05/', ''), '^/json/2/', ''), '^/api/v1/', ''), '?', 1) AS resource, method, COUNT(*)::int n FROM layer.integration_log WHERE system IN ('ORACLE_HCM','ODOO','TASAMA_HR') GROUP BY 1,2 ORDER BY 3 DESC LIMIT 20`)).rows;
  const events = (await pool.query(`SELECT * FROM hcm.atom_events ORDER BY published_at DESC LIMIT 30`)).rows;
  res.json({ logs, stats, resources, events });
});

control.get('/evidence', async (req, res) => {
  const params: unknown[] = [];
  const where: string[] = [];
  if (req.query.act) { params.push(String(req.query.act).split(',')); where.push(`t.act = ANY($${params.length})`); }
  if (req.query.actor) { params.push(String(req.query.actor)); where.push(`t.actor_id = $${params.length}`); }
  if (req.query.q) { params.push(`%${req.query.q}%`); where.push(`(t.summary ILIKE $${params.length} OR r.ref ILIKE $${params.length} OR t.actor_name ILIKE $${params.length})`); }
  const rows = (await pool.query(`SELECT t.*, r.ref, r.title, r.title_ar, r.workflow_id FROM layer.trail t LEFT JOIN layer.requests r ON r.id=t.request_id ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY t.at DESC, t.id DESC LIMIT 300`, params)).rows;
  const counts = (await pool.query(`SELECT act, COUNT(*)::int n FROM layer.trail GROUP BY 1`)).rows;
  res.json({ rows, counts });
});

control.get('/policies', async (_req, res) => {
  const pol = (await pool.query(`SELECT * FROM layer.policies ORDER BY id`)).rows;
  const cl = (await pool.query(`SELECT id, policy_id, clause_ref, heading, heading_ar, text_en, text_ar, legal_ref, tags FROM layer.policy_clauses ORDER BY policy_id, string_to_array(clause_ref, '.')::int[]`)).rows;
  const cited = (await pool.query(`SELECT citation, COUNT(*)::int n FROM layer.trail WHERE citation IS NOT NULL GROUP BY 1`)).rows;
  res.json(pol.map((p: any) => ({ ...p, clauses: cl.filter((c: any) => c.policy_id === p.id).map((c: any) => ({ ...c, cited: cited.filter((x: any) => x.citation.includes(`${p.id} §${c.clause_ref}`) || x.citation.includes(`${p.id} §${c.clause_ref.split('.')[0]}.`)).reduce((s: number, x: any) => s + x.n, 0) })) })));
});

/** What the layer did, computed from the synthetic runs. Labelled synthetic on screen. */
control.get('/value', async (_req, res) => {
  const byWf = (await pool.query(`SELECT r.workflow_id, wd.name, wd.name_ar, COUNT(*)::int total, COUNT(*) FILTER (WHERE r.status='COMPLETED')::int completed,
       COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM layer.approvals a WHERE a.request_id=r.id))::int no_touch,
       PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM r.closed_at - r.created_at)) FILTER (WHERE r.closed_at IS NOT NULL) AS median_s
     FROM layer.requests r JOIN layer.workflow_defs wd ON wd.id=r.workflow_id GROUP BY 1,2,3 ORDER BY total DESC`)).rows;
  const monthly = (await pool.query(`SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month, COUNT(*)::int cases,
       COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM layer.approvals a WHERE a.request_id=r.id))::int no_touch FROM layer.requests r GROUP BY 1 ORDER BY 1`)).rows;
  const acts = (await pool.query(`SELECT act, COUNT(*)::int n FROM layer.trail GROUP BY 1`)).rows;
  const answers = (await pool.query(`SELECT COUNT(*)::int n FROM layer.messages WHERE role='assistant'`)).rows[0].n;
  const writes = (await pool.query(`SELECT COUNT(*)::int n FROM layer.integration_log WHERE system IN ('ORACLE_HCM','ODOO','TASAMA_HR') AND (method <> 'GET' AND resource NOT LIKE '%/search_read')`)).rows[0].n;
  // Minutes of HR effort per case type without the layer: ILLUSTRATIVE assumptions, shown on screen.
  const minutes: Record<string, number> = { 'WF-14': 20, 'WF-15': 10, 'WF-16': 45, 'WF-08': 60, 'WF-03': 240, 'WF-10': 480, 'WF-13': 360, 'WF-19': 180, 'WF-05': 90, 'WF-12': 120, 'WF-01': 120, 'WF-02': 90, 'WF-06': 240, 'WF-20': 240 };
  const hours = Math.round(byWf.reduce((s: number, w: any) => s + w.completed * (minutes[w.workflow_id] ?? 30) * 0.6, 0) / 60);
  res.json({ byWorkflow: byWf, monthly, acts, answers, writes, hoursReturned: hours, assumptions: minutes });
});

control.get('/scenarios', (_req, res) => res.json([...SCENARIOS.map((s) => ({ ...s, level: 'client' })), ...TASAMA_SCENARIOS]));
control.post('/scenarios/:key/run', (req, res) => res.json({ id: TASAMA_SCENARIOS.some((s) => s.key === req.params.key) ? runTasamaScenario(req.params.key) : runScenario(req.params.key) }));
control.get('/scenarios/runs/:id', (req, res) => res.json(getRun(req.params.id) ?? getTasamaRun(req.params.id) ?? { status: 'unknown', beats: [], cases: [] }));
control.post('/reset', async (_req, res) => {
  try {
    // The presenter's storylines are not demo data: they survive a reset.
    const kept = (await pool.query(`SELECT value FROM tasama.meta WHERE key='storylines'`).catch(() => ({ rows: [] as any[] }))).rows[0]?.value;
    // Clients taken on from their files go with the demo data (design/payroll-addendum.md §13).
    clearRuns(); clearTasamaRuns(); await dropOnboardedSchemas(); await reseed(() => {}); resetPersonas(); resetPeople();
    if (kept) await pool.query(`INSERT INTO tasama.meta (key, value) VALUES ('storylines', $1::jsonb) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`, [JSON.stringify(kept)]);
    res.json({ ok: true });
  }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});
void personaOf;
