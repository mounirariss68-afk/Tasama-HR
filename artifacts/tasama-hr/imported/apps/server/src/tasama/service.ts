/**
 * Tasama HR Services: the provider's view across its client accounts.
 *
 * Nothing about service performance is typed in. Service levels are computed
 * from each client's own cases (closed_at against created_at, last working day
 * against the Art. 88 deadline) and from the payroll run record; invoices are
 * computed from headcount served, completed hires and the service credits the
 * contract attaches to missed SLAs. The agents here:
 *   Raqeeb  (A1)  watches open cases against the contract SLA and escalates.
 *   Fatoora (A1)  prepares the monthly invoice; a person approves before issue.
 *   Tawzee  (A3)  balances delivery staff across clients by skill and capacity.
 */
import { pool, withClient, type Q } from '../db.js';
import { CLIENTS, clientByKey, slasFor, type ClientConfig } from '../domain/clients.js';
import { addDays, iso, monthStart, monthEnd, round2, parse } from '../domain/rules.js';
import { now } from '../clock.js';

export const VAT = 0.15;
const H = 3600_000;

export type SlaResult = { key: string; label: string; label_ar: string; target: number; met: number; total: number; attainment: number | null; ok: boolean | null };

/** Which contract SLA a workflow's cases count against. */
export const SLA_OF_WORKFLOW: Record<string, string> = { 'WF-14': 'LETTERS', 'WF-15': 'REQUESTS', 'WF-16': 'REQUESTS', 'WF-19': 'SETTLEMENT', 'WF-20': 'SETTLEMENT', 'WF-06': 'ONBOARD', 'WF-13': 'PAY_ONTIME' };

export async function tasamaTrail(c: Q, e: { client_key?: string | null; actor_type: string; actor_id: string; actor_name: string; act: string; autonomy?: string | null; summary: string; summary_ar: string; ref?: string | null; at?: Date }) {
  await c.query(`INSERT INTO tasama.trail (at, client_key, actor_type, actor_id, actor_name, act, autonomy, summary, summary_ar, ref) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [e.at ?? now(), e.client_key ?? null, e.actor_type, e.actor_id, e.actor_name, e.act, e.autonomy ?? null, e.summary, e.summary_ar, e.ref ?? null]);
}

/** Service levels for one client and one month (YYYY-MM-01), computed from the client's own records. */
export async function slaFor(cl: ClientConfig, month: Date): Promise<SlaResult[]> {
  const from = iso(monthStart(month)), to = iso(addDays(monthEnd(month), 1));
  const letterLimit = cl.policy.letterHours <= 8 ? 24 : 48;   // working hours -> calendar hours
  return withClient(cl.key, async () => {
    const q = async (sql: string, p: unknown[]) => (await pool.query(sql, p)).rows[0] as { met: number; total: number };
    const letters = await q(`SELECT COUNT(*) FILTER (WHERE closed_at - created_at <= make_interval(hours => $3))::int met, COUNT(*)::int total
                               FROM layer.requests WHERE workflow_id='WF-14' AND status='COMPLETED' AND closed_at >= $1 AND closed_at < $2`, [from, to, letterLimit]);
    const reqs = await q(`SELECT COUNT(*) FILTER (WHERE closed_at - created_at <= interval '96 hours')::int met, COUNT(*)::int total
                            FROM layer.requests WHERE workflow_id IN ('WF-15','WF-16') AND status IN ('COMPLETED','REJECTED') AND closed_at >= $1 AND closed_at < $2`, [from, to]);
    const settle = await q(`SELECT COUNT(*) FILTER (WHERE r.closed_at::date <= wr.end_date + CASE WHEN r.workflow_id='WF-19' THEN 14 ELSE 7 END)::int met, COUNT(*)::int total
                              FROM layer.requests r JOIN hcm.work_relationships wr ON wr.person_id = r.subject_person_id
                             WHERE r.workflow_id IN ('WF-19','WF-20') AND r.status='COMPLETED' AND wr.end_date IS NOT NULL AND r.closed_at >= $1 AND r.closed_at < $2`, [from, to]);
    const onboard = await q(`SELECT COUNT(*) FILTER (WHERE t.completed_at IS NOT NULL AND t.completed_at <= wr.start_date)::int met, COUNT(*)::int total
                               FROM hcm.work_relationships wr JOIN hcm.journeys j ON j.person_id = wr.person_id AND j.template='ONBOARDING'
                               JOIN hcm.journey_tasks t ON t.journey_id = j.id AND t.task_key='day1'
                              WHERE wr.worker_type='E' AND wr.start_date >= $1 AND wr.start_date < $2`, [from, to]);
    const run = (await pool.query(`SELECT * FROM tasama.payroll_runs WHERE client_key=$1 AND period=$2`, [cl.key, from])).rows[0];
    const raw: Record<string, { met: number; total: number }> = {
      LETTERS: letters, REQUESTS: reqs, SETTLEMENT: settle, ONBOARD: onboard,
      PAY_ACCURACY: run ? { met: run.employees - run.errors_after, total: run.employees } : { met: 0, total: 0 },
      PAY_ONTIME: run ? { met: run.paid_on <= run.pay_date_due ? 1 : 0, total: 1 } : { met: 0, total: 0 },
    };
    return slasFor(cl).map((s) => {
      const r = raw[s.key] ?? { met: 0, total: 0 };
      const att = r.total ? round2((r.met / r.total) * 100) : null;
      return { key: s.key, label: s.label, label_ar: s.label_ar, target: s.target, met: r.met, total: r.total, attainment: att, ok: att === null ? null : att >= s.target };
    });
  });
}

/** Months to show: the last `n` closed months, oldest first, never before the contract started. */
export function closedMonths(cl: ClientConfig, n = 6, asOf = now()) {
  const out: Date[] = [];
  for (let k = n; k >= 1; k--) { const m = monthStart(asOf, -k); if (m >= monthStart(cl.contract.start)) out.push(m); }
  return out;
}

/** What Fatoora puts on an invoice for one client-month. */
export async function invoiceLines(cl: ClientConfig, month: Date) {
  const from = iso(monthStart(month)), to = iso(monthEnd(month));
  const run = (await pool.query(`SELECT employees FROM tasama.payroll_runs WHERE client_key=$1 AND period=$2`, [cl.key, from])).rows[0];
  const headcount = run?.employees ?? 0;
  const hires = cl.contract.services.includes('RECRUITMENT')
    ? await withClient(cl.key, async () => (await pool.query(`SELECT COUNT(*)::int n FROM hcm.work_relationships WHERE worker_type='E' AND start_date BETWEEN $1 AND $2`, [from, to])).rows[0].n as number)
    : 0;
  const base = round2(headcount * cl.contract.pepm);
  const hireFees = round2(hires * cl.contract.perHire);
  const sla = await slaFor(cl, month);
  const defs = slasFor(cl);
  const misses = sla.filter((s) => s.ok === false).map((s) => ({ key: s.key, label: s.label, label_ar: s.label_ar, attainment: s.attainment, target: s.target, pct: defs.find((d) => d.key === s.key)!.creditPct }));
  const rawCredit = misses.reduce((a, m) => a + base * m.pct / 100, 0);
  const credits = round2(Math.min(rawCredit, base * cl.contract.creditCapPct / 100));
  const net = base + hireFees - credits;
  return { headcount, base, hires, hireFees, credits, creditLines: misses, vat: round2(net * VAT), total: round2(net * (1 + VAT)), sla };
}

/** Raqeeb: scan every client's open cases against the contract SLA. At risk = under a quarter of the window left, or under 12 hours. */
export async function raqeebScan(at = now()) {
  const found: any[] = [];
  for (const cl of CLIENTS) {
    const inScope = new Set(slasFor(cl).map((s) => s.key));
    const open = await withClient(cl.key, async () => (await pool.query(
      `SELECT r.ref, r.title, r.title_ar, r.workflow_id, r.waiting_on_role, r.waiting_on_person_id, r.sla_due, r.updated_at, p.display_name AS waiting_name, r.result->'settlement'->>'payBy' AS pay_by
         FROM layer.requests r LEFT JOIN hcm.persons p ON p.id = r.waiting_on_person_id
        WHERE r.status='WAITING' AND r.sla_due IS NOT NULL`)).rows);
    const stillOpen = new Set<string>();
    for (const r of open) {
      const key = SLA_OF_WORKFLOW[r.workflow_id];
      if (!key || !inScope.has(key)) continue;
      // Settlements are measured against the legal deadline (Art. 88), not the approval step's clock.
      const legal = key === 'SETTLEMENT' ? r.pay_by : null;
      if (key === 'SETTLEMENT' && !legal) continue;
      const due = legal ? new Date(`${legal}T20:59:00Z`) : new Date(r.sla_due);
      const left = due.getTime() - at.getTime(), win = legal ? 14 * 24 * H : due.getTime() - new Date(r.updated_at).getTime();
      const kind = left < 0 ? 'BREACHED' : left < Math.max(12 * H, win * 0.25) ? 'AT_RISK' : null;
      if (!kind) continue;
      stillOpen.add(r.ref);
      const ins = await pool.query(
        `INSERT INTO tasama.escalations (client_key, case_ref, title, title_ar, sla_key, kind, waiting_on, waiting_on_role, due_at, detected_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (client_key, case_ref) DO UPDATE SET kind = EXCLUDED.kind, due_at = EXCLUDED.due_at
         RETURNING (xmax = 0) AS inserted, id`,
        [cl.key, r.ref, r.title, r.title_ar, key, kind, r.waiting_name, r.waiting_on_role, due, at]);
      if (ins.rows[0].inserted) {
        found.push({ client: cl.key, ref: r.ref, kind });
        await tasamaTrail(pool, { client_key: cl.key, actor_type: 'AGENT', actor_id: 'raqeeb', actor_name: 'Raqeeb', act: 'FLAG', autonomy: 'A1', ref: r.ref, at,
          summary: `${kind === 'BREACHED' ? 'SLA breached' : 'SLA at risk'}: ${r.title} at ${cl.short}, waiting on ${r.waiting_name ?? r.waiting_on_role}, due ${iso(due)}.`,
          summary_ar: `${kind === 'BREACHED' ? 'تجاوز مستوى الخدمة' : 'مستوى الخدمة معرض للتجاوز'}: ${r.title_ar} لدى ${cl.name_ar}.` });
      }
    }
    // Cases that are no longer waiting close their escalation.
    const esc = (await pool.query(`SELECT id, case_ref FROM tasama.escalations WHERE client_key=$1 AND status <> 'RESOLVED'`, [cl.key])).rows;
    for (const e of esc) if (!stillOpen.has(e.case_ref)) {
      const st = await withClient(cl.key, async () => (await pool.query(`SELECT status FROM layer.requests WHERE ref=$1`, [e.case_ref])).rows[0]?.status);
      if (st && st !== 'WAITING') await pool.query(`UPDATE tasama.escalations SET status='RESOLVED', resolved_at=$2, note=COALESCE(note, 'Case moved on in the client workflow.') WHERE id=$1`, [e.id, at]);
    }
  }
  return found;
}

/** Raqeeb's nudge: a reminder in the approver's notifications inside the client account. */
export async function nudge(escId: number, by = 'Raqeeb') {
  const e = (await pool.query(`SELECT * FROM tasama.escalations WHERE id=$1`, [escId])).rows[0];
  if (!e) throw new Error('No such escalation');
  const cl = clientByKey(e.client_key)!;
  await withClient(cl.key, async () => {
    const r = (await pool.query(`SELECT waiting_on_person_id FROM layer.requests WHERE ref=$1`, [e.case_ref])).rows[0];
    if (r?.waiting_on_person_id) await pool.query(`INSERT INTO layer.notifications (person_id, title, title_ar, body, link) VALUES ($1,$2,$3,$4,$5)`,
      [r.waiting_on_person_id, `Reminder: ${e.title} is due ${e.kind === 'BREACHED' ? 'and now overdue' : 'soon'}`, `تذكير: ${e.title_ar}`, `Tasama HR Services: this case is counted against the service level in your contract. Due ${iso(new Date(e.due_at))}.`, `case/${e.case_ref}`]);
  });
  await pool.query(`UPDATE tasama.escalations SET status='NUDGED', action=$2 WHERE id=$1`, [escId, `Reminder sent to ${e.waiting_on ?? e.waiting_on_role}`]);
  await tasamaTrail(pool, { client_key: cl.key, actor_type: by === 'Raqeeb' ? 'AGENT' : 'HUMAN', actor_id: by === 'Raqeeb' ? 'raqeeb' : 'tasama', actor_name: by, act: 'NUDGE', autonomy: by === 'Raqeeb' ? 'A1' : null, ref: e.case_ref,
    summary: `Reminded ${e.waiting_on ?? e.waiting_on_role} at ${cl.short} about ${e.case_ref}.`, summary_ar: `تذكير المعتمد لدى ${cl.name_ar} بالحالة ${e.case_ref}.` });
}

/** Tawzee: delivery load per staff member, from each client's HR operations volume over the last 30 days. */
const MIN_PER_CASE: Record<string, number> = { 'WF-14': 6, 'WF-15': 8, 'WF-16': 25, 'WF-19': 120, 'WF-20': 150, 'WF-13': 600, 'WF-06': 180, 'WF-08': 30, 'WF-03': 90, 'WF-02': 45, 'WF-05': 60, 'WF-12': 45, 'WF-10': 120, 'WF-01': 30 };
const SKILL_OF: Record<string, string> = { 'WF-13': 'PAYROLL', 'WF-16': 'PAYROLL', 'WF-19': 'PAYROLL', 'WF-20': 'HR_OPS', 'WF-14': 'HR_OPS', 'WF-15': 'HR_OPS', 'WF-06': 'HR_OPS', 'WF-08': 'HR_OPS', 'WF-12': 'HR_OPS', 'WF-10': 'HR_OPS', 'WF-02': 'RECRUITMENT', 'WF-03': 'RECRUITMENT', 'WF-05': 'RECRUITMENT', 'WF-01': 'RECRUITMENT' };

export async function workload(at = now()) {
  const staff = (await pool.query(`SELECT * FROM tasama.staff ORDER BY id`)).rows;
  const alloc = (await pool.query(`SELECT * FROM tasama.allocations`)).rows;
  const hours: Record<string, Record<string, number>> = {};   // client -> skill -> hours (30 days)
  for (const cl of CLIENTS) {
    const rows = await withClient(cl.key, async () => (await pool.query(`SELECT workflow_id, COUNT(*)::int n FROM layer.requests WHERE created_at >= $1 GROUP BY 1`, [addDays(at, -30)])).rows);
    hours[cl.key] = {};
    for (const r of rows) {
      const skill = SKILL_OF[r.workflow_id]; if (!skill) continue;
      // Agents do the checking; the minutes are what is left for a person (an illustrative estimate).
      hours[cl.key][skill] = (hours[cl.key][skill] ?? 0) + (r.n * (MIN_PER_CASE[r.workflow_id] ?? 20)) / 60;
    }
    // Fixed monthly effort per service in scope (payroll cycle, Mudad, GOSI, reporting).
    // Fixed monthly effort per service in scope, after the agents' share (illustrative): payroll cycle, Mudad and GOSI filings,
    // HR operations administration, recruitment coordination. Slower clients generate more chasing.
    hours[cl.key].PAYROLL = ((hours[cl.key].PAYROLL ?? 0) * 0.5 + 18 + cl.size * 0.11) * cl.slowness;
    hours[cl.key].HR_OPS = ((hours[cl.key].HR_OPS ?? 0) * 0.6 + (cl.contract.services.includes('HR_OPS') ? 14 + cl.size * 0.12 : 0)) * cl.slowness;
    hours[cl.key].RECRUITMENT = (hours[cl.key].RECRUITMENT ?? 0) + (cl.contract.services.includes('RECRUITMENT') ? 22 + cl.size * 0.04 : 0);
    hours[cl.key].ACCOUNT = 12 + cl.size * 0.06;
  }
  return staff.map((s: any) => {
    const mine = alloc.filter((a: any) => a.staff_id === s.id);
    let load = 0;
    const by: { client: string; fte: number; hours: number }[] = [];
    for (const a of mine) {
      const skill = s.skills.find((k: string) => hours[a.client_key]?.[k]) ?? s.skills[0];
      const sameSkill = alloc.filter((x: any) => x.client_key === a.client_key && staff.find((t: any) => t.id === x.staff_id)?.skills.includes(skill));
      const fteTotal = sameSkill.reduce((t: number, x: any) => t + Number(x.fte), 0) || 1;
      const h = (hours[a.client_key]?.[skill] ?? 0) * Number(a.fte) / fteTotal;
      load += h; by.push({ client: a.client_key, fte: Number(a.fte), hours: Math.round(h) });
    }
    const cap = Number(s.capacity_hours) * mine.reduce((t: number, a: any) => t + Number(a.fte), 0);
    return { ...s, allocations: by, load_hours: Math.round(load), capacity: Math.round(cap), utilization: cap ? Math.round((load / cap) * 100) : 0 };
  });
}

/** Fatoora: prepare (or refresh) one client-month invoice as PREPARED, for a person to approve. */
export async function prepareInvoice(cl: ClientConfig, month: Date, at = now()) {
  const l = await invoiceLines(cl, month);
  const period = iso(monthStart(month));
  const number = `TAS-${cl.code}-${period.slice(0, 7).replace('-', '')}`;
  const notes = [
    `${l.headcount} employees paid in the ${period.slice(0, 7)} run x SAR ${cl.contract.pepm} per employee per month.`,
    ...(l.hires ? [`${l.hires} completed hires x SAR ${cl.contract.perHire.toLocaleString('en-US')}.`] : []),
    ...(l.creditLines.length ? l.creditLines.map((m) => `Service credit ${m.pct}%: ${m.label} at ${m.attainment}% against ${m.target}%.`) : ['All service levels met; no credit.']),
  ];
  const r = await pool.query(
    `INSERT INTO tasama.invoices (number, client_key, period, headcount, base_fee, hires, hire_fees, credits, credit_lines, vat, total, status, prepared_at, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'PREPARED',$12,$13)
     ON CONFLICT (number) DO UPDATE SET headcount=EXCLUDED.headcount, base_fee=EXCLUDED.base_fee, hires=EXCLUDED.hires, hire_fees=EXCLUDED.hire_fees, credits=EXCLUDED.credits,
       credit_lines=EXCLUDED.credit_lines, vat=EXCLUDED.vat, total=EXCLUDED.total, status='PREPARED', prepared_at=EXCLUDED.prepared_at, notes=EXCLUDED.notes
     RETURNING *`,
    [number, cl.key, period, l.headcount, l.base, l.hires, l.hireFees, l.credits, JSON.stringify(l.creditLines), l.vat, l.total, at, JSON.stringify(notes)]);
  await tasamaTrail(pool, { client_key: cl.key, actor_type: 'AGENT', actor_id: 'fatoora', actor_name: 'Fatoora', act: 'PREPARE', autonomy: 'A1', ref: number, at,
    summary: `Prepared ${number} for ${cl.short}: SAR ${Math.round(l.total).toLocaleString('en-US')} incl. VAT${l.credits ? `, after SAR ${Math.round(l.credits).toLocaleString('en-US')} service credits` : ''}. Waiting for approval.`,
    summary_ar: `أعدّت فاتورة ${number} لـ ${cl.name_ar} بمبلغ ${Math.round(l.total).toLocaleString('en-US')} ريال شاملة الضريبة.` });
  return r.rows[0];
}

export const monthLabel = (d: Date | string) => iso(parse(typeof d === 'string' ? d : d)).slice(0, 7);
