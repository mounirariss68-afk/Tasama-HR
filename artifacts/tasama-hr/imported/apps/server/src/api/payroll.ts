/**
 * The Payroll lens: Tasama's payroll team, across every client
 * (design/payroll-addendum.md §3). Each route reads every client's schemas in
 * turn; a record opens in its own client.
 */
import { Router } from 'express';
import { pool, withClient, tx } from '../db.js';
import { CLIENTS, clientByKey } from '../domain/clients.js';
import { DIMENSIONS } from '../domain/payroll-policy.js';
import { startCase } from '../engine/core.js';
import { activeVersion, rulesOf } from '../payroll/policy.js';
import { draftRun, provisionHistory } from '../payroll/run.js';
import { deviceExport, proposeMap, headersOf, ingest, justify } from '../attendance/service.js';
import { PENALTY_TABLE, FINE_CAP_DAYS } from '../domain/attendance.js';
import { personaOf, isPayrollTeam, isTasama, type Persona } from './session.js';

export const payroll = Router();
const allowed = (p: Persona) => isPayrollTeam(p) || isTasama(p);
const forEachClient = <T>(fn: (key: string) => Promise<T>) => Promise.all(CLIENTS.map((c) => withClient(c.key, () => fn(c.key))));

/** Where every client's month stands: cut-off, approval, pay day. */
payroll.get('/payroll/months', async (req, res) => {
  const p = await personaOf(req);
  if (!allowed(p)) return res.status(403).json({ error: 'The payroll months are visible to Tasama only.' });
  const today = new Date().toISOString().slice(0, 10);
  const rows = await forEachClient(async (key) => {
    const c = clientByKey(key)!;
    const per = (await pool.query(`SELECT * FROM hcm.payroll_periods WHERE status='OPEN' ORDER BY start_date DESC LIMIT 1`)).rows[0];
    const people = (await pool.query(`SELECT COUNT(*)::int n FROM hcm.work_relationships WHERE worker_type='E' AND (end_date IS NULL OR end_date >= $1)`, [today])).rows[0].n;
    const waiting = (await pool.query(`SELECT COUNT(*)::int n FROM layer.requests WHERE status IN ('WAITING','ESCALATED') AND waiting_on_role IN ('TASAMA_PAYROLL','TASAMA_PAYROLL_LEAD')`)).rows[0].n;
    const v = await activeVersion(pool);
    const stage = !per ? 'NONE' : today <= per.cutoff_date ? 'INPUTS' : today <= per.pay_date ? 'RUN' : 'PAID';
    return {
      key, short: c.short, name_ar: c.name_ar, hrms: c.hrms, employees: people, period: per?.period_name, start: per?.start_date, end: per?.end_date,
      cutoff: per?.cutoff_date, pay: per?.pay_date, approval: per ? new Date(new Date(`${per.pay_date}T00:00:00Z`).getTime() - 4 * 86_400_000).toISOString().slice(0, 10) : null,
      stage, waiting, policy: v ? { version: v.version, since: v.effective_from } : null,
    };
  });
  res.json({ today, clients: rows });
});

/** The cases waiting on Tasama's payroll team, across clients. */
payroll.get('/payroll/inbox', async (req, res) => {
  const p = await personaOf(req);
  if (!allowed(p)) return res.status(403).json({ error: 'Tasama only.' });
  const roles = p.roles.includes('TASAMA_PAYROLL_LEAD') ? ['TASAMA_PAYROLL_LEAD', 'TASAMA_PAYROLL'] : ['TASAMA_PAYROLL'];
  const rows = (await forEachClient(async (key) => {
    const r = (await pool.query(
      `SELECT r.id, r.ref, r.workflow_id, r.title, r.title_ar, r.status, r.sla_due, r.created_at, r.waiting_on_role, r.current_step,
              s.display_name AS subject_name, s.display_name_ar AS subject_name_ar, q.display_name AS requester_name
         FROM layer.requests r JOIN hcm.persons s ON s.id=r.subject_person_id JOIN hcm.persons q ON q.id=r.requester_person_id
        WHERE r.status IN ('WAITING','ESCALATED') AND r.waiting_on_role = ANY($1) ORDER BY r.created_at`, [roles])).rows;
    const c = clientByKey(key)!;
    return r.map((x: any) => ({ ...x, client: key, client_short: c.short, client_ar: c.name_ar, mine: x.waiting_on_role === (p.roles.includes('TASAMA_PAYROLL_LEAD') ? 'TASAMA_PAYROLL_LEAD' : 'TASAMA_PAYROLL') }));
  })).flat();
  res.json({ rows });
});

/** Every client's active policy: rules, flags, a draft waiting. */
payroll.get('/payroll/policies', async (req, res) => {
  const p = await personaOf(req);
  if (!allowed(p)) return res.status(403).json({ error: 'Tasama only.' });
  const rows = await forEachClient(async (key) => {
    const c = clientByKey(key)!;
    const v = await activeVersion(pool);
    const rules = v ? await rulesOf(pool, v.id) : [];
    const draft = (await pool.query(`SELECT v.*, r.ref, r.status AS case_status, r.current_step FROM layer.policy_versions v LEFT JOIN layer.requests r ON r.id=v.request_id WHERE v.status='DRAFT' ORDER BY v.id DESC LIMIT 1`)).rows[0] ?? null;
    return { key, short: c.short, name_ar: c.name_ar, version: v?.version ?? null, since: v?.effective_from ?? null, activated_by: v?.activated_by ?? null, rules: rules.length,
      dims: new Set(rules.map((r: any) => r.dim)).size, flags: rules.filter((r: any) => r.flag).map((r: any) => ({ key: r.key, label: r.label, flag: r.flag, resolution: r.resolution })), draft };
  });
  res.json({ clients: rows, dimensions: DIMENSIONS });
});

/** One client's policy: the rules of a version by dimension, the versions, the handbook. */
payroll.get('/payroll/policies/:client', async (req, res) => {
  const p = await personaOf(req);
  if (!allowed(p) && !p.roles.includes('CHRO')) return res.status(403).json({ error: 'Not visible to this persona.' });
  const key = req.params.client;
  const c = clientByKey(key);
  if (!c) return res.status(404).json({ error: 'No such client' });
  const out = await withClient(key, async () => {
    const versions = (await pool.query(`SELECT v.*, r.ref FROM layer.policy_versions v LEFT JOIN layer.requests r ON r.id=v.request_id ORDER BY v.id DESC`)).rows;
    const pick = versions.find((v: any) => String(v.id) === String(req.query.version)) ?? versions.find((v: any) => v.status === 'DRAFT') ?? versions.find((v: any) => v.status === 'ACTIVE');
    const rules = pick ? await rulesOf(pool, pick.id) : [];
    const active = versions.find((v: any) => v.status === 'ACTIVE');
    const activeRules = active && pick && active.id !== pick.id ? await rulesOf(pool, active.id) : null;
    const changed = activeRules ? rules.filter((r: any) => { const a = activeRules.find((x: any) => x.key === r.key); return !a || a.value !== r.value || (a.flag ?? null) !== (r.flag ?? null); }).map((r: any) => r.key) : [];
    const clauses = (await pool.query(`SELECT c.id, c.policy_id, c.clause_ref, c.heading, c.heading_ar, c.text_en, c.text_ar FROM layer.policy_clauses c ORDER BY c.policy_id, c.id`)).rows;
    return { versions, version: pick ?? null, rules, changed, clauses };
  });
  res.json({ client: { key, short: c.short, name_ar: c.name_ar, hrms: c.hrms }, dimensions: DIMENSIONS, ...out });
});

/** A client sends a revised handbook: Nizam reads it (WF-26). Used by the screen and by scenario D1. */
payroll.post('/payroll/policies/:client/handbook', async (req, res) => {
  const p = await personaOf(req);
  if (!allowed(p)) return res.status(403).json({ error: 'Tasama only.' });
  const key = req.params.client;
  const c = clientByKey(key);
  if (!c) return res.status(404).json({ error: 'No such client' });
  try {
    const r = await withClient(key, () => tx(async (db) => {
      const people = (await db.query(`SELECT value FROM layer.meta WHERE key='people'`)).rows[0].value;
      const chro = people.persona.chro as number;
      return startCase(db, { workflowId: 'WF-26', type: 'CLIENT_POLICY', title: `${c.short} handbook, revised`, title_ar: `دليل ${c.name_ar} المعدل`, requester: chro, subject: chro, channel: 'FORM',
        payload: { revised: true, source: `${c.short} HR handbook, revised`, effective: new Date().toISOString().slice(0, 10) }, scenario: req.body?.scenario ?? null });
    }));
    res.json(r);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

/** One dimension across every client (POL-07). */
payroll.get('/payroll/policies-compare', async (req, res) => {
  const p = await personaOf(req);
  if (!allowed(p)) return res.status(403).json({ error: 'Tasama only.' });
  const dim = Number(req.query.dim ?? 3);
  const rows = await forEachClient(async (key) => {
    const c = clientByKey(key)!;
    const v = await activeVersion(pool);
    const rules = v ? (await rulesOf(pool, v.id)).filter((r: any) => r.dim === dim) : [];
    return { key, short: c.short, name_ar: c.name_ar, version: v?.version ?? null, rules };
  });
  res.json({ dim: DIMENSIONS.find((d) => d.n === dim), rows });
});

/** Every client's open run: the draft for clients held in Tasama HR; clients on Oracle run their payroll there. */
payroll.get('/payroll/runs', async (req, res) => {
  const p = await personaOf(req);
  if (!allowed(p)) return res.status(403).json({ error: 'Tasama only.' });
  const rows = await forEachClient(async (key) => {
    const c = clientByKey(key)!;
    if (c.hrms !== 'PLATFORM') return { key, short: c.short, name_ar: c.name_ar, hrms: c.hrms, draft: null };
    const d = await draftRun(pool);
    if (!d) return { key, short: c.short, name_ar: c.name_ar, hrms: c.hrms, draft: null };
    const blocks = d.rows.reduce((n, r) => n + r.flags.filter((f: any) => f.severity === 'BLOCK').length, 0);
    const prevNet = d.rows.reduce((n, r) => n + (r.prev_net ?? 0), 0);
    return { key, short: c.short, name_ar: c.name_ar, hrms: c.hrms, draft: { period: d.period, people: d.rows.length, gross: d.totals.gross, net: d.totals.net, prev_net: Math.round(prevNet * 100) / 100, blocks, version: d.version } };
  });
  res.json({ clients: rows });
});

/** One client's draft run, its checks and its provisions. */
payroll.get('/payroll/runs/:client', async (req, res) => {
  const p = await personaOf(req);
  if (!allowed(p)) return res.status(403).json({ error: 'Tasama only.' });
  const c = clientByKey(req.params.client);
  if (!c) return res.status(404).json({ error: 'No such client' });
  if (c.hrms !== 'PLATFORM') return res.json({ client: { key: c.key, short: c.short, name_ar: c.name_ar, hrms: c.hrms }, draft: null });
  const out = await withClient(c.key, async () => ({ draft: await draftRun(pool), history: await provisionHistory(pool) }));
  res.json({ client: { key: c.key, short: c.short, name_ar: c.name_ar, hrms: c.hrms }, ...out });
});

/* ------------------------------------------------------------------ Attendance (WF-29) */

const d10 = (v: any) => (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10);

/** The month as Hudoor read it: per person, the day strip, the fine against the cap and the unpaid days. */
async function attendanceView() {
  const up = (await pool.query(`SELECT u.*, r.ref, r.status AS case_status, r.current_step FROM layer.attendance_uploads u LEFT JOIN layer.requests r ON r.id=u.request_id ORDER BY u.id DESC LIMIT 1`)).rows[0];
  if (!up) return null;
  const days = (await pool.query(`SELECT person_id, to_char(day,'YYYY-MM-DD') AS day, status, minutes_late, justification, decision, unpaid_days::float unpaid, fine::float fine, to_char(first_in,'HH24:MI') first_in FROM layer.attendance_days WHERE upload_id=$1 ORDER BY person_id, day`, [up.id])).rows;
  const ids = [...new Set(days.map((d: any) => d.person_id))];
  const ppl = new Map((await pool.query(`SELECT p.id, p.display_name, p.display_name_ar, d.name dept, (SELECT SUM(amount)::float FROM hcm.element_entries e WHERE e.person_id=p.id AND e.element_code IN ('BASIC','HOUSING','TRANSPORT','OTHER_ALW') AND e.effective_start <= $2 AND e.effective_end >= $2) wage
      FROM hcm.persons p LEFT JOIN hcm.assignments a ON a.person_id=p.id AND a.effective_end='4712-12-31' LEFT JOIN hcm.departments d ON d.id=a.department_id WHERE p.id = ANY($1)`, [ids, d10(up.period_end)])).rows.map((r: any) => [r.id, r]));
  const people = ids.map((id) => {
    const mine = days.filter((d: any) => d.person_id === id);
    const p: any = ppl.get(id) ?? {};
    const before = Math.round(mine.reduce((s: number, d: any) => s + d.fine, 0) * 100) / 100;
    const cap = Math.round(FINE_CAP_DAYS * (p.wage ?? 0) / 30 * 100) / 100;
    return { person_id: id, name: p.display_name, name_ar: p.display_name_ar, dept: p.dept, lates: mine.filter((d: any) => d.status === 'LATE').length, absences: mine.filter((d: any) => d.status === 'ABSENT').length,
      leave: mine.filter((d: any) => d.status === 'LEAVE').length, fine_before: before, cap, fine: Math.min(before, cap), unpaid_days: mine.reduce((s: number, d: any) => s + d.unpaid, 0), daily: Math.round((p.wage ?? 0) / 30 * 100) / 100,
      explained: mine.filter((d: any) => d.justification).map((d: any) => ({ day: d.day, text: d.justification, decision: d.decision })),
      strip: mine.map((d: any) => ({ day: d.day, s: d.status, m: d.minutes_late, f: d.fine })) };
  });
  const flagged = people.filter((p) => p.lates || p.absences || p.leave).sort((a, b) => (b.fine_before + b.unpaid_days * b.daily) - (a.fine_before + a.unpaid_days * a.daily));
  const sum = (k: string) => days.filter((d: any) => d.status === k).length;
  return {
    upload: { id: up.id, file: up.file_name, device: up.device, from: d10(up.period_start), to: d10(up.period_end), rows: up.rows, map: up.column_map, status: up.status, by: up.uploaded_by, ref: up.ref, case_status: up.case_status },
    totals: { people: ids.length, lates: sum('LATE'), absences: sum('ABSENT'), leave: sum('LEAVE'), fines: Math.round(people.reduce((s, p) => s + p.fine, 0) * 100) / 100, unpaid_days: people.reduce((s, p) => s + p.unpaid_days, 0), capped: people.filter((p) => p.fine_before > p.cap).length, explained: people.reduce((s, p) => s + p.explained.length, 0) },
    people: flagged, table: PENALTY_TABLE, capDays: FINE_CAP_DAYS,
  };
}

payroll.get('/payroll/attendance', async (req, res) => {
  const p = await personaOf(req);
  if (!allowed(p)) return res.status(403).json({ error: 'Tasama only.' });
  const rows = await forEachClient(async (key) => {
    const c = clientByKey(key)!;
    const up = (await pool.query(`SELECT u.status, u.period_start, r.status AS case_status FROM layer.attendance_uploads u LEFT JOIN layer.requests r ON r.id=u.request_id ORDER BY u.id DESC LIMIT 1`)).rows[0];
    const expected = c.hrms === 'PLATFORM' && (await pool.query(`SELECT 1 FROM layer.meta WHERE key='attendance'`)).rowCount;
    return { key, short: c.short, name_ar: c.name_ar, hrms: c.hrms, upload: up ? { status: up.status, case_status: up.case_status, month: d10(up.period_start).slice(0, 7) } : null, expected: Boolean(expected) };
  });
  res.json({ clients: rows });
});

payroll.get('/payroll/attendance/:client', async (req, res) => {
  const p = await personaOf(req);
  if (!allowed(p) && !p.roles.includes('PAYROLL')) return res.status(403).json({ error: 'Not visible to this persona.' });
  const c = clientByKey(req.params.client);
  if (!c) return res.status(404).json({ error: 'No such client' });
  const view = await withClient(c.key, async () => attendanceView());
  res.json({ client: { key: c.key, short: c.short, name_ar: c.name_ar, hrms: c.hrms }, ...(view ?? { upload: null }) });
});

/** The client's device export for the month, as a file (the demo stands in for the client's shared folder). */
payroll.get('/payroll/attendance/:client/export', async (req, res) => {
  const c = clientByKey(req.params.client);
  if (!c) return res.status(404).json({ error: 'No such client' });
  const f = await withClient(c.key, async () => deviceExport(pool));
  if (!f) return res.status(404).json({ error: 'No device export for this client this month.' });
  res.setHeader('content-type', 'text/csv; charset=utf-8');
  res.setHeader('content-disposition', `attachment; filename="${f.fileName}"`);
  res.send(f.csv);
});

/** Hudoor proposes how the file's own columns map to ours; a person confirms. */
payroll.post('/payroll/attendance/:client/map', async (req, res) => {
  const p = await personaOf(req);
  if (!allowed(p)) return res.status(403).json({ error: 'Tasama only.' });
  const csv = String(req.body?.csv ?? '');
  if (!csv.trim()) return res.status(400).json({ error: 'The file is empty.' });
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  res.json({ headers: headersOf(csv), map: proposeMap(csv), sample: lines.slice(1, 4).map((l) => l.split(',')), rows: lines.length - 1 });
});

/** Store the punches and open the attendance month (WF-29): Hudoor reads it at once. */
payroll.post('/payroll/attendance/:client/upload', async (req, res) => {
  const p = await personaOf(req);
  if (!allowed(p)) return res.status(403).json({ error: 'Tasama only.' });
  const c = clientByKey(req.params.client);
  if (!c) return res.status(404).json({ error: 'No such client' });
  try {
    const out = await withClient(c.key, () => tx(async (db) => {
      const csv = String(req.body?.csv ?? '');
      const map = req.body?.map ?? proposeMap(csv);
      const up = await ingest(db, { fileName: String(req.body?.fileName ?? 'attendance.csv'), csv, map, by: p.display_name });
      const people = (await db.query(`SELECT value FROM layer.meta WHERE key='people'`)).rows[0].value;
      const ops = people.persona.payroll as number;
      const k = await startCase(db, { workflowId: 'WF-29', type: 'ATTENDANCE_MONTH', title: `${c.short} attendance, ${req.body?.month ?? 'last month'}`, title_ar: `حضور ${c.name_ar}`, requester: ops, subject: ops, channel: 'FORM',
        payload: { upload_id: up.uploadId, rows: up.rows, file: req.body?.fileName ?? 'attendance.csv' }, scenario: req.body?.scenario ?? null });
      return { ...up, ref: k.ref };
    }));
    res.json(out);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

/** The employee's own late or absent days in the month being read, to explain before any fine (Art. 71). */
payroll.get('/attendance/mine', async (req, res) => {
  const p = await personaOf(req);
  const rows = (await pool.query(`SELECT to_char(d.day,'YYYY-MM-DD') AS day, d.status, d.minutes_late, to_char(d.first_in,'HH24:MI') first_in, d.justification, d.decision
      FROM layer.attendance_days d JOIN layer.attendance_uploads u ON u.id=d.upload_id WHERE u.status='READ' AND d.person_id=$1 AND d.status IN ('LATE','ABSENT') ORDER BY d.day`, [p.person_id])).rows;
  res.json({ rows });
});
payroll.post('/attendance/mine/justify', async (req, res) => {
  const p = await personaOf(req);
  try { res.json(await justify(pool, p.person_id, String(req.body?.day), String(req.body?.text ?? '').slice(0, 500))); } catch (e: any) { res.status(400).json({ error: e.message }); }
});
