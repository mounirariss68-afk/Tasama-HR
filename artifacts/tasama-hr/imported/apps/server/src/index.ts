/**
 * Tasama HR platform server: the agentic HR layer's API for every client
 * account, Tasama's own service-management API, the simulated client HRMSs
 * (Oracle HCM and Odoo) behind the connector, and the built web app.
 * One process, one port.
 */
import { aiConfigured, aiStatus } from './ai.js';
import express from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { pool, withClient } from './db.js';
import { clientByKey, DEFAULT_CLIENT } from './domain/clients.js';
import { tasama } from './api/tasama.js';
import { reseed, isSeeded, restoreCalendar } from './seed/index.js';
import { cases } from './api/cases.js';
import { me } from './api/me.js';
import { hr } from './api/hr.js';
import { control } from './api/control.js';
import { assistant } from './assistant/index.js';
import { director } from './api/director.js';
import { payroll } from './api/payroll.js';

const here = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(here, '../../web/dist');
const PORT = Number(process.env.PORT ?? 5000);

const app = express();
app.use(express.json({ limit: '1mb' }));
// Every request runs in the context of one client account (x-client header); all hcm/layer queries go to that client's schemas.
app.use('/api', (req, _res, next) => {
  const key = String(req.header('x-client') ?? req.query.client ?? DEFAULT_CLIENT);
  withClient(clientByKey(key) ? key : DEFAULT_CLIENT, () => next());
});
app.get('/api/health', async (_req, res) => {
  const ok = await pool.query('SELECT 1').then(() => true).catch(() => false);
  res.json({ ok, ai: aiStatus().mode, seeding });
});
// While the demo data is being built, everything but /health answers 503 and the web app waits.
let seeding = false;
app.use('/api', (req, res, next) => (seeding && req.path !== '/health' ? res.status(503).json({ error: 'The demo data is being prepared. This takes about a minute.', seeding: true }) : next()));
app.use('/api', me, cases, hr, control, assistant, tasama, director, payroll);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[api]', err);
  res.status(500).json({ error: err?.message ?? 'Server error' });
});

if (existsSync(WEB)) {
  app.use(express.static(WEB, { index: false, maxAge: '1h' }));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(resolve(WEB, 'index.html')));
} else {
  app.get('/', (_req, res) => res.type('text').send('Tasama HR API is running. Build the web app with `npm run build` to serve the interface here.'));
}

async function main() {
  // Open the port first: a hosting platform that waits for the port must not time out while the data is built.
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Tasama HR platform is running on port ${PORT}. AI: ${aiConfigured() ? 'Claude via Replit AI Integrations' : 'offline (Replit AI Integrations not connected)'}`);
  });
  if (!(await isSeeded())) {
    seeding = true;
    console.log('Building the synthetic Tasama client accounts (about a minute); the app answers once this is done...');
    try { await reseed(); } finally { seeding = false; }
  } else await restoreCalendar();
}
main().catch((e) => { console.error(e); process.exit(1); });

// Express 5 forwards async errors to the error handler; anything else is logged.
process.on('unhandledRejection', (e) => console.error('[unhandled]', e));
