/** Tasama HR Services: portfolio, client accounts, service levels, finance, delivery, escalations, policies. */
import { Router } from 'express';
import { pool, withClient } from '../db.js';
import { CLIENTS, allClients, clientByKey, slasFor, SERVICE_LABELS, type ClientConfig } from '../domain/clients.js';
import { addDays, iso, monthStart, round2 } from '../domain/rules.js';
import { now } from '../clock.js';
import { personaOf, isTasama } from './session.js';
import { slaFor, closedMonths, workload, raqeebScan, nudge, prepareInvoice, tasamaTrail, monthLabel } from '../tasama/service.js';
import { precheck } from '../agents/hisab.js';
import { basiraScan, patterns, patternIssues, assignPattern, closePattern } from '../tasama/basira.js';

export const tasama = Router();

// Only the Tasama persona sees the provider's business data.
tasama.use('/tasama', async (req, res, next) => {
  const p = await personaOf(req);
  if (!isTasama(p)) return res.status(403).json({ error: 'Tasama HR Services data is visible to the Tasama HR Operations Manager only.' });
  next();
});

const inClient = <T>(cl: ClientConfig, fn: () => Promise<T>) => withClient(cl.key, fn);
const svc = (cl: ClientConfig) => cl.contract.services.map((s) => ({ key: s, label: SERVICE_LABELS[s][0], label_ar: SERVICE_LABELS[s][1] }));

/** Month-to-date service levels for the current month, plus the last closed month. */
async function slaSnapshot(cl: ClientConfig) {
  const cur = await slaFor(cl, monthStart(now()));
  const last = await slaFor(cl, monthStart(now(), -1));
  const scored = last.filter((s) => s.ok !== null);
  return { current: cur, last, lastMet: scored.filter((s) => s.ok).length, lastScored: scored.length };
}

async function money(cl: ClientConfig) {
  const inv = (await pool.query(`SELECT * FROM tasama.invoices WHERE client_key=$1 ORDER BY period`, [cl.key])).rows;
  const cost = (await pool.query(`SELECT COALESCE(SUM(s.monthly_cost * a.fte),0) c FROM tasama.allocations a JOIN tasama.staff s ON s.id=a.staff_id WHERE a.client_key=$1`, [cl.key])).rows[0].c as number;
  const platform = round2(cl.size * 18);   // platform, AI and connector run cost per employee served (illustrative)
  const months = inv.map((i: any) => {
    const revenue = round2(Number(i.total) - Number(i.vat));
    const costToServe = round2(Number(cost) + platform);
    return { period: monthLabel(i.period), revenue, cost: costToServe, margin: round2(revenue - costToServe), marginPct: revenue ? round2(((revenue - costToServe) / revenue) * 100) : 0, credits: Number(i.credits), status: i.status, number: i.number };
  });
  return { invoices: inv, months, monthlyCost: round2(Number(cost) + platform) };
}

tasama.get('/tasama/portfolio', async (_req, res) => {
  const out: any[] = [];
  // A client taken on from its files is listed from go-live; its first service month has not run yet.
  for (const cl of allClients()) {
    const got = await Promise.all([
      inClient(cl, async () => (await pool.query(`SELECT
          (SELECT COUNT(*)::int FROM hcm.work_relationships WHERE worker_type='E' AND end_date IS NULL) AS headcount,
          (SELECT COUNT(*)::int FROM layer.requests WHERE status IN ('WAITING','RUNNING','ESCALATED')) AS open_cases,
          (SELECT COUNT(*)::int FROM layer.requests WHERE status='ESCALATED') AS escalated,
          (SELECT COUNT(*)::int FROM layer.requests WHERE created_at >= now() - interval '30 days') AS cases_30d,
          (SELECT COUNT(*)::int FROM layer.requests r WHERE r.created_at >= now() - interval '30 days' AND r.status='COMPLETED' AND NOT EXISTS (SELECT 1 FROM layer.approvals a WHERE a.request_id=r.id)) AS no_touch_30d,
          (SELECT COUNT(*)::int FROM layer.integration_log WHERE at >= now() - interval '7 days') AS hrms_calls_7d,
          (SELECT COUNT(*)::int FROM layer.integration_log WHERE at >= now() - interval '7 days' AND status_code >= 400) AS hrms_errors_7d,
          (SELECT row_to_json(pp) FROM hcm.payroll_periods pp WHERE status='OPEN' LIMIT 1) AS period`)).rows[0]),
      inClient(cl, async () => { try { const pc: any = await precheck({ c: pool, quiet: true } as any); return { blockers: pc.findings.filter((f: any) => f.severity === 'BLOCKER').length, high: pc.findings.filter((f: any) => f.severity === 'HIGH').length, findings: pc.findings.length }; } catch { return null; } }),
      slaSnapshot(cl),
      money(cl),
    ]).catch((e) => { console.error('[portfolio]', cl.key, e?.message); return null; });
    if (!got) continue;
    const [counts, pay, sla, fin] = got;
    const esc = (await pool.query(`SELECT kind, COUNT(*)::int n FROM tasama.escalations WHERE client_key=$1 AND status <> 'RESOLVED' GROUP BY 1`, [cl.key])).rows;
    const csat = (await pool.query(`SELECT score FROM tasama.csat WHERE client_key=$1 ORDER BY period DESC LIMIT 1`, [cl.key])).rows[0]?.score ?? null;
    const overdue = fin.invoices.filter((i: any) => i.status === 'OVERDUE').reduce((a: number, i: any) => a + Number(i.total), 0);
    const lastFin = fin.months[fin.months.length - 1];
    out.push({
      key: cl.key, code: cl.code, name: cl.name, name_ar: cl.name_ar, short: cl.short, sector: cl.sector, sector_ar: cl.sector_ar, hrms: cl.hrms, hrmsLabel: cl.hrmsLabel,
      model: cl.contract.model, model_ar: cl.contract.model_ar, phase: cl.contract.phase, services: svc(cl), pepm: cl.contract.pepm,
      ...counts, payroll: pay, sla: { lastMet: sla.lastMet, lastScored: sla.lastScored, last: sla.last, current: sla.current },
      escalations: { atRisk: esc.find((e: any) => e.kind === 'AT_RISK')?.n ?? 0, breached: esc.find((e: any) => e.kind === 'BREACHED')?.n ?? 0 },
      csat, overdue: round2(overdue), lastMonth: lastFin ?? null, series: fin.months.slice(-6),
    });
  }
  const sum = (f: (x: any) => number) => round2(out.reduce((a, x) => a + (f(x) || 0), 0));
  const totals = {
    clients: out.length, employees: sum((x) => x.headcount), openCases: sum((x) => x.open_cases), cases30d: sum((x) => x.cases_30d), noTouch30d: sum((x) => x.no_touch_30d),
    revenueLastMonth: sum((x) => x.lastMonth?.revenue ?? 0), marginLastMonth: sum((x) => x.lastMonth?.margin ?? 0), overdue: sum((x) => x.overdue),
    slaMet: sum((x) => x.sla.lastMet), slaScored: sum((x) => x.sla.lastScored),
    escalationsOpen: sum((x) => x.escalations.atRisk + x.escalations.breached), breached: sum((x) => x.escalations.breached),
  };
  const trail = (await pool.query(`SELECT * FROM tasama.trail ORDER BY at DESC, id DESC LIMIT 12`)).rows;
  res.json({ clients: out, totals, trail, asOf: now() });
});

tasama.get('/tasama/clients/:key', async (req, res) => {
  const cl = clientByKey(req.params.key);
  if (!cl) return res.status(404).json({ error: 'No such client' });
  const row = (await pool.query(`SELECT c.*, s.name AS account_manager, s.name_ar AS account_manager_ar FROM tasama.clients c LEFT JOIN tasama.staff s ON s.id=c.account_manager_id WHERE c.key=$1`, [cl.key])).rows[0];
  const months = closedMonths(cl, 6);
  const slaHistory = [] as any[];
  for (const m of months) slaHistory.push({ period: monthLabel(m), results: await slaFor(cl, m) });
  slaHistory.push({ period: `${monthLabel(monthStart(now()))} (to date)`, results: await slaFor(cl, monthStart(now())) });
  const fin = await money(cl);
  const team = (await pool.query(`SELECT s.*, a.fte FROM tasama.allocations a JOIN tasama.staff s ON s.id=a.staff_id WHERE a.client_key=$1 ORDER BY a.fte DESC`, [cl.key])).rows;
  const csat = (await pool.query(`SELECT * FROM tasama.csat WHERE client_key=$1 ORDER BY period`, [cl.key])).rows;
  const esc = (await pool.query(`SELECT * FROM tasama.escalations WHERE client_key=$1 ORDER BY status='RESOLVED', due_at`, [cl.key])).rows;
  const runs = (await pool.query(`SELECT * FROM tasama.payroll_runs WHERE client_key=$1 ORDER BY period`, [cl.key])).rows;
  const ops = await inClient(cl, async () => ({
    volumes: (await pool.query(`SELECT r.workflow_id, w.name, w.name_ar, COUNT(*)::int n,
        COUNT(*) FILTER (WHERE r.status='COMPLETED' AND NOT EXISTS (SELECT 1 FROM layer.approvals a WHERE a.request_id=r.id))::int no_touch
        FROM layer.requests r JOIN layer.workflow_defs w ON w.id=r.workflow_id WHERE r.created_at >= now() - interval '90 days' GROUP BY 1,2,3 ORDER BY 4 DESC`)).rows,
    hrms: (await pool.query(`SELECT system, COUNT(*)::int calls, COUNT(*) FILTER (WHERE status_code >= 400)::int errors, ROUND(AVG(latency_ms))::int avg_ms, MAX(at) last
        FROM layer.integration_log WHERE at >= now() - interval '7 days' GROUP BY 1 ORDER BY 2 DESC`)).rows,
    period: (await pool.query(`SELECT * FROM hcm.payroll_periods WHERE status='OPEN' LIMIT 1`)).rows[0],
    headcount: (await pool.query(`SELECT COUNT(*)::int n, COUNT(*) FILTER (WHERE p.is_saudi)::int saudi FROM hcm.work_relationships wr JOIN hcm.persons p ON p.id=wr.person_id WHERE wr.worker_type='E' AND wr.end_date IS NULL`)).rows[0],
    waiting: (await pool.query(`SELECT r.ref, r.title, r.title_ar, r.workflow_id, r.waiting_on_role, r.sla_due, p.display_name AS waiting_on FROM layer.requests r LEFT JOIN hcm.persons p ON p.id=r.waiting_on_person_id WHERE r.status IN ('WAITING','ESCALATED') ORDER BY r.sla_due NULLS LAST LIMIT 20`)).rows,
  }));
  res.json({ client: { ...row, services: svc(cl), policy: cl.policy, nitaqat: cl.nitaqat, slas: slasFor(cl) }, slaHistory, finance: fin, team, csat, escalations: esc, payrollRuns: runs, ...ops });
});

tasama.get('/tasama/sla', async (_req, res) => {
  const rows: any[] = [];
  for (const cl of CLIENTS) {
    const s = await slaSnapshot(cl);
    rows.push({ key: cl.key, short: cl.short, name_ar: cl.name_ar, hrms: cl.hrms, last: s.last, current: s.current });
  }
  const esc = (await pool.query(`SELECT e.*, s.name AS owner FROM tasama.escalations e LEFT JOIN tasama.staff s ON s.id=e.owner_staff_id ORDER BY e.status='RESOLVED', e.kind='AT_RISK', e.due_at`)).rows;
  res.json({ clients: rows, escalations: esc, lastMonth: monthLabel(monthStart(now(), -1)), thisMonth: monthLabel(monthStart(now())) });
});

tasama.get('/tasama/finance', async (_req, res) => {
  const per: any[] = [];
  for (const cl of CLIENTS) { const f = await money(cl); per.push({ key: cl.key, short: cl.short, name_ar: cl.name_ar, pepm: cl.contract.pepm, model: cl.contract.model, months: f.months, monthlyCost: f.monthlyCost }); }
  const invoices = (await pool.query(`SELECT i.*, c.short, c.name_ar FROM tasama.invoices i JOIN tasama.clients c ON c.key=i.client_key ORDER BY i.period DESC, c.sort`)).rows;
  const pending = CLIENTS.filter((cl) => !invoices.some((i: any) => i.client_key === cl.key && i.period === iso(monthStart(now(), -1))) && monthStart(now(), -1) >= monthStart(cl.contract.start))
    .map((cl) => ({ key: cl.key, short: cl.short, period: monthLabel(monthStart(now(), -1)) }));
  res.json({ clients: per, invoices, notPrepared: pending });
});

tasama.post('/tasama/invoices/prepare', async (req, res) => {
  const cl = clientByKey(String(req.body.client));
  if (!cl) return res.status(400).json({ error: 'Unknown client' });
  const inv = await prepareInvoice(cl, req.body.period ? new Date(`${req.body.period}-01T00:00:00Z`) : monthStart(now(), -1));
  res.json(inv);
});

tasama.post('/tasama/invoices/:id/:action', async (req, res) => {
  const inv = (await pool.query(`SELECT * FROM tasama.invoices WHERE id=$1`, [req.params.id])).rows[0];
  if (!inv) return res.status(404).json({ error: 'No such invoice' });
  const p = await personaOf(req);
  if (req.params.action === 'approve') {
    if (inv.status !== 'PREPARED') return res.status(400).json({ error: `${inv.number} is ${inv.status}, not waiting for approval.` });
    const issued = iso(now());
    await pool.query(`UPDATE tasama.invoices SET status='ISSUED', issued_at=$2, due_at=$3 WHERE id=$1`, [inv.id, issued, iso(addDays(issued, 30))]);
    await tasamaTrail(pool, { client_key: inv.client_key, actor_type: 'HUMAN', actor_id: 'tasama', actor_name: p.display_name, act: 'APPROVE', ref: inv.number, summary: `Approved and issued ${inv.number}${req.body.reason ? ` — ${req.body.reason}` : ''}.`, summary_ar: `اعتمد وأصدر الفاتورة ${inv.number}.` });
  } else if (req.params.action === 'return') {
    if (!String(req.body.reason ?? '').trim()) return res.status(400).json({ error: 'Give a reason for returning the invoice.' });
    await pool.query(`UPDATE tasama.invoices SET notes = notes || $2::jsonb WHERE id=$1`, [inv.id, JSON.stringify([`Returned by ${p.display_name}: ${req.body.reason}`])]);
    await tasamaTrail(pool, { client_key: inv.client_key, actor_type: 'HUMAN', actor_id: 'tasama', actor_name: p.display_name, act: 'RETURN', ref: inv.number, summary: `Returned ${inv.number} to Fatoora: ${req.body.reason}`, summary_ar: `أعاد الفاتورة ${inv.number}: ${req.body.reason}` });
  } else if (req.params.action === 'paid') {
    await pool.query(`UPDATE tasama.invoices SET status='PAID', paid_at=$2 WHERE id=$1`, [inv.id, iso(now())]);
  } else return res.status(400).json({ error: 'Unknown action' });
  res.json((await pool.query(`SELECT * FROM tasama.invoices WHERE id=$1`, [inv.id])).rows[0]);
});

tasama.get('/tasama/delivery', async (_req, res) => {
  const staff = await workload();
  const clients = (await pool.query(`SELECT key, short, name_ar FROM tasama.clients ORDER BY sort`)).rows;
  // Tawzee's suggestion: move capacity from the least to the most loaded colleague with the same skill.
  const suggestions: any[] = [];
  for (const skill of ['PAYROLL', 'HR_OPS', 'RECRUITMENT']) {
    const pool2 = staff.filter((s: any) => s.skills.includes(skill));
    const hi = [...pool2].sort((a: any, b: any) => b.utilization - a.utilization)[0];
    const lo = [...pool2].sort((a: any, b: any) => a.utilization - b.utilization)[0];
    if (hi && lo && hi.id !== lo.id && hi.utilization > 100 && lo.utilization < 90) {
      const c = hi.allocations.sort((a: any, b: any) => b.hours - a.hours)[0];
      suggestions.push({ skill, from: hi.name, to: lo.name, client: c?.client, hours: Math.round((hi.load_hours - hi.capacity) * 0.8), text: `Route about ${Math.round((hi.load_hours - hi.capacity) * 0.8)} hours a month of ${skill === 'HR_OPS' ? 'HR operations' : skill.toLowerCase()} work for ${CLIENTS.find((x) => x.key === c?.client)?.short ?? c?.client} from ${hi.name} (${hi.utilization}%) to ${lo.name} (${lo.utilization}%).` });
    }
  }
  res.json({ staff, clients, suggestions });
});

tasama.get('/tasama/escalations', async (_req, res) => {
  res.json((await pool.query(`SELECT e.*, s.name AS owner, c.short, c.name_ar AS client_ar FROM tasama.escalations e JOIN tasama.clients c ON c.key=e.client_key LEFT JOIN tasama.staff s ON s.id=e.owner_staff_id ORDER BY e.status='RESOLVED', e.kind='AT_RISK', e.due_at`)).rows);
});
tasama.post('/tasama/escalations/scan', async (_req, res) => res.json({ found: await raqeebScan() }));
tasama.post('/tasama/escalations/:id/:action', async (req, res) => {
  const id = Number(req.params.id);
  const p = await personaOf(req);
  const e = (await pool.query(`SELECT * FROM tasama.escalations WHERE id=$1`, [id])).rows[0];
  if (!e) return res.status(404).json({ error: 'No such escalation' });
  if (req.params.action === 'nudge') await nudge(id, p.display_name);
  else if (req.params.action === 'assign') {
    const s = (await pool.query(`SELECT * FROM tasama.staff WHERE id=$1`, [req.body.staff_id])).rows[0];
    if (!s) return res.status(400).json({ error: 'Choose a delivery team member' });
    await pool.query(`UPDATE tasama.escalations SET status='ASSIGNED', owner_staff_id=$2, action=$3 WHERE id=$1`, [id, s.id, `Assigned to ${s.name}`]);
    await tasamaTrail(pool, { client_key: e.client_key, actor_type: 'HUMAN', actor_id: 'tasama', actor_name: p.display_name, act: 'ASSIGN', ref: e.case_ref, summary: `Assigned ${e.case_ref} to ${s.name}.`, summary_ar: `أسند ${e.case_ref} إلى ${s.name_ar}.` });
  } else if (req.params.action === 'resolve') {
    await pool.query(`UPDATE tasama.escalations SET status='RESOLVED', resolved_at=now(), note=$2 WHERE id=$1`, [id, req.body.note ?? 'Resolved']);
    await tasamaTrail(pool, { client_key: e.client_key, actor_type: 'HUMAN', actor_id: 'tasama', actor_name: p.display_name, act: 'RESOLVE', ref: e.case_ref, summary: `Closed the escalation on ${e.case_ref}${req.body.note ? `: ${req.body.note}` : ''}.`, summary_ar: `أغلق التصعيد على ${e.case_ref}.` });
  } else return res.status(400).json({ error: 'Unknown action' });
  res.json((await pool.query(`SELECT * FROM tasama.escalations WHERE id=$1`, [id])).rows[0]);
});

// Basira's pattern watch.
tasama.get('/tasama/patterns', async (_req, res) => res.json(await patterns()));
tasama.get('/tasama/patterns/:id/issues', async (req, res) => res.json(await patternIssues(Number(req.params.id))));
tasama.post('/tasama/patterns/scan', async (_req, res) => res.json(await basiraScan()));
tasama.post('/tasama/patterns/:id/assign', async (req, res) => {
  const p = await personaOf(req);
  try { await assignPattern(Number(req.params.id), p.display_name, req.body); res.json({ ok: true }); } catch (e: any) { res.status(400).json({ error: e.message }); }
});
tasama.post('/tasama/patterns/:id/close', async (req, res) => {
  const p = await personaOf(req);
  try { await closePattern(Number(req.params.id), p.display_name, String(req.body.outcome ?? '')); res.json({ ok: true }); } catch (e: any) { res.status(400).json({ error: e.message }); }
});

tasama.get('/tasama/trail', async (_req, res) => {
  res.json((await pool.query(`SELECT * FROM tasama.trail ORDER BY at DESC, id DESC LIMIT 200`)).rows);
});
