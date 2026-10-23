/** Add a payroll client: Tasama's people drop a client's files and Intiqal reads them into seven lanes (design/payroll-addendum.md §13, §19). */
import express, { Router } from 'express';
import { personaOf, isTasamaStaff } from './session.js';
import * as O from '../onboarding/store.js';
import { FIELDS } from '../onboarding/lanes.js';

export const onboarding = Router();

onboarding.use('/onboarding', async (req, res, next) => {
  const p = await personaOf(req);
  if (!isTasamaStaff(p)) return res.status(403).json({ error: 'Taking on a client is done by Tasama.' });
  (req as any).persona = p;
  next();
});

/** The demo folder as one zip, for the presenter to drag from the laptop. */
onboarding.get('/onboarding/demo-files.zip', async (_req, res) => {
  res.type('application/zip').setHeader('Content-Disposition', 'attachment; filename="Soudah Development.zip"');
  res.send(await O.demoZip());
});
onboarding.get('/onboarding/fields', (_req, res) => res.json(FIELDS.map((f) => ({ field: f.field, label: f.label }))));
/** The client being taken on now, if there is one. */
onboarding.get('/onboarding/current', async (_req, res) => { const id = await O.latest(); res.json(id ? await O.get(id) : null); });
onboarding.post('/onboarding', async (req, res) => res.json({ id: await O.create((req as any).persona.name) }));
onboarding.get('/onboarding/:id', async (req, res) => { const o = await O.get(Number(req.params.id)); o ? res.json(o) : res.status(404).json({ error: 'Not found' }); });

/** One dropped file, posted as it is; the path keeps its folder ("Contracts/…"). */
onboarding.post('/onboarding/:id/files', express.raw({ type: () => true, limit: '20mb' }), async (req, res) => {
  const path = String(req.query.path ?? '');
  if (!path || !Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'A file and its path are needed.' });
  await O.addFile(Number(req.params.id), path, req.body);
  res.json({ ok: true });
});
onboarding.post('/onboarding/:id/demo-files', async (req, res) => res.json({ files: await O.addDemoFiles(Number(req.params.id)) }));

/** Read the files into the lanes. `wait` answers when every lane is done; otherwise the screen polls. */
onboarding.post('/onboarding/:id/read', async (req, res) => {
  const id = Number(req.params.id);
  const job = O.read(id, Number(req.body?.pace ?? 0), req.body?.columnMap);
  if (req.body?.wait) await job;
  res.json(await O.get(id));
});
onboarding.delete('/onboarding/:id', async (req, res) => { await O.remove(Number(req.params.id)); res.json({ ok: true }); });
