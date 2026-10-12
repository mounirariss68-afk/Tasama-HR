/** The Demo Director's routes. */
import { Router } from 'express';
import { currentClient } from '../db.js';
import { listScripts, startScenario, runStep, stopScenario } from '../director.js';

export const director = Router();
director.get('/director/scenarios', (_req, res) => res.json(listScripts()));
director.post('/director/:key/start', async (req, res) => {
  try { res.json(await startScenario(req.params.key, currentClient() ?? '')); } catch (e: any) { res.status(400).json({ error: e.message }); }
});
director.post('/director/runs/:id/step', async (req, res) => {
  try { res.json(await runStep(Number(req.params.id), Number(req.body.index ?? 0))); } catch (e: any) { res.status(400).json({ error: e.message }); }
});
director.post('/director/stop', async (_req, res) => { await stopScenario(); res.json({ ok: true }); });
