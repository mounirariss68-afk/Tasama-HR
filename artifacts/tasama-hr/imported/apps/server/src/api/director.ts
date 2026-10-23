/** The Demo Director's routes, and what Present mode reads: the live numbers for its cards and the storylines. */
import { Router } from 'express';
import { currentClient, pool, withClient } from '../db.js';
import { listScripts, startScenario, runStep, stopScenario } from '../director.js';
import { CLIENTS } from '../domain/clients.js';
import { monthStart, iso } from '../domain/rules.js';
import { now } from '../clock.js';
import { slaFor } from '../tasama/service.js';

export const director = Router();
director.get('/director/scenarios', (_req, res) => res.json(listScripts()));
director.post('/director/:key/start', async (req, res) => {
  try { res.json(await startScenario(req.params.key, currentClient() ?? '')); } catch (e: any) { res.status(400).json({ error: e.message }); }
});
director.post('/director/runs/:id/step', async (req, res) => {
  try { res.json(await runStep(Number(req.params.id), Number(req.body.index ?? 0), req.body.hand === true)); } catch (e: any) { res.status(400).json({ error: e.message }); }
});
director.post('/director/stop', async (_req, res) => { await stopScenario(); res.json({ ok: true }); });

/** The numbers a Present card may quote, across the five client accounts. Any persona: the presenter's rig, not a work surface. */
director.get('/director/numbers', async (_req, res) => {
  try {
    let employees = 0, openCases = 0, cases30d = 0, noTouch30d = 0, slaMet = 0, slaScored = 0;
    for (const cl of CLIENTS) {
      const r = await withClient(cl.key, async () => (await pool.query(`SELECT
          (SELECT COUNT(*)::int FROM hcm.work_relationships WHERE worker_type='E' AND end_date IS NULL) AS headcount,
          (SELECT COUNT(*)::int FROM layer.requests WHERE status IN ('WAITING','RUNNING','ESCALATED')) AS open_cases,
          (SELECT COUNT(*)::int FROM layer.requests WHERE created_at >= now() - interval '30 days') AS cases_30d,
          (SELECT COUNT(*)::int FROM layer.requests r WHERE r.created_at >= now() - interval '30 days' AND r.status='COMPLETED' AND NOT EXISTS (SELECT 1 FROM layer.approvals a WHERE a.request_id=r.id)) AS no_touch_30d`)).rows[0]);
      employees += r.headcount; openCases += r.open_cases; cases30d += r.cases_30d; noTouch30d += r.no_touch_30d;
      const sla = (await slaFor(cl, monthStart(now(), -1))).filter((s) => s.ok !== null);
      slaMet += sla.filter((s) => s.ok).length; slaScored += sla.length;
    }
    // The payroll storylines quote last paid month across the five clients, and what the platform has done since each client's history starts.
    const last = (await pool.query(`SELECT COALESCE(SUM(employees),0)::int AS paid, COALESCE(SUM(gross),0)::float AS gross, MAX(period) AS period
      FROM tasama.payroll_runs WHERE period = (SELECT MAX(period) FROM tasama.payroll_runs) AND client_key = ANY($1)`, [CLIENTS.map((c) => c.key)])).rows[0];
    const monthsPaid = Number((await pool.query(`SELECT COUNT(*)::int AS n FROM tasama.payroll_runs WHERE client_key = ANY($1)`, [CLIENTS.map((c) => c.key)])).rows[0].n);
    let journalsPosted = 0, bankFiles = 0, rules = 0;
    for (const cl of CLIENTS) {
      const r = await withClient(cl.key, async () => (await pool.query(`SELECT
          (SELECT COUNT(*)::int FROM layer.journals WHERE state='POSTED') AS journals,
          (SELECT COUNT(*)::int FROM layer.payments) AS files,
          (SELECT COUNT(*)::int FROM layer.policy_rules r JOIN layer.policy_versions v ON v.id = r.version_id WHERE v.status='ACTIVE') AS rules`)).rows[0]);
      journalsPosted += r.journals; bankFiles += r.files; rules += r.rules;
    }
    const oracle = CLIENTS.filter((c) => c.hrms === 'ORACLE').length;
    res.json({ clients: CLIENTS.length, employees, openCases, cases30d, noTouch30d, noTouchPct: cases30d ? Math.round((100 * noTouch30d) / cases30d) : 0, slaMet, slaScored, today: iso(now()),
      payrollPaid: last.paid, payrollGross: last.gross, payrollMonth: last.period ? iso(new Date(last.period)) : null, monthsPaid, journalsPosted, bankFiles, payrollRules: rules, oracleClients: oracle, platformClients: CLIENTS.length - oracle });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/** Storylines edited in Settings › Demo. The shipped ones live in the web app and are merged with these. */
director.get('/director/storylines', async (_req, res) => {
  const r = (await pool.query(`SELECT value FROM tasama.meta WHERE key='storylines'`)).rows[0];
  res.json(r?.value ?? []);
});
director.put('/director/storylines', async (req, res) => {
  if (!Array.isArray(req.body)) return res.status(400).json({ error: 'A list of storylines is expected.' });
  await pool.query(`INSERT INTO tasama.meta (key, value) VALUES ('storylines', $1::jsonb) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`, [JSON.stringify(req.body)]);
  res.json({ ok: true });
});
