/**
 * Handing a client back (design/walkthrough-addendum.md R41, WF-39): Tasama HR operations shares the payroll files and the
 * records on the 20-item checklist through a shared folder, the client's HR operations signs the handover, Tasama's HR
 * Operations Manager closes the client, and the platform revokes Tasama's access and deletes its copies. SLA 7 working
 * days. Runs inside the client's schema.
 */
import type { PoolClient } from 'pg';
import { client } from '../domain/rules.js';
import { HANDOVER_ITEMS, HANDOVER_SLA_DAYS } from '../domain/checklists.js';
import { workingDayAfter } from '../domain/calendar.js';
import { startCase } from '../engine/core.js';
import { now } from '../clock.js';

type Q = Pick<PoolClient, 'query'>;
const DAY = 86_400_000;
const d10 = (d: Date) => d.toISOString().slice(0, 10);

/** N working days after a date (Friday and Saturday off). */
export function workingDaysAfter(from: Date, n: number) {
  let d = new Date(from); let left = n;
  while (left > 0) { d = workingDayAfter(new Date(d.getTime() + DAY), []); left--; }
  return d;
}

/** The handover in progress, or the last one, with the case behind it. */
export async function currentHandover(c: Q) {
  const h = (await c.query(`SELECT h.*, r.ref, r.status AS case_status, r.current_step, r.waiting_on_role FROM layer.handovers h LEFT JOIN layer.requests r ON r.id=h.request_id ORDER BY h.id DESC LIMIT 1`)).rows[0];
  if (!h) return null;
  const steps = h.request_id ? (await c.query(`SELECT a.step_key, a.decision, a.decided_at, a.reason, p.display_name AS who FROM layer.approvals a LEFT JOIN hcm.persons p ON p.id=a.approver_person_id WHERE a.request_id=$1 AND a.decision='APPROVED' ORDER BY a.id`, [h.request_id])).rows : [];
  // Tasama's people decide by name, not by a person record: their names come from the trail, in the order of the decisions.
  const names = h.request_id ? (await c.query(`SELECT actor_name FROM layer.trail WHERE request_id=$1 AND actor_type='HUMAN' AND act IN ('APPROVE','OVERRIDE') ORDER BY id`, [h.request_id])).rows.map((r: any) => String(r.actor_name).replace(/,? Tasama$/, '')) : [];
  steps.forEach((st: any, i: number) => { if (!st.who) st.who = names[i] ?? null; });
  const at = (k: string) => steps.find((s: any) => s.step_key === k);
  const status = h.status === 'CANCELLED' ? 'CANCELLED' : h.case_status === 'COMPLETED' ? 'CLOSED' : h.current_step === 'signoff' ? 'SIGNING' : h.current_step === 'close' ? 'CLOSING' : 'SHARING';
  const items = (h.items as any[]).map((i) => ({ ...i, ...HANDOVER_ITEMS.find((x) => x.n === i.n) }));
  const shared = items.filter((i) => i.shared_at).length;
  const today = d10(now());
  return { id: h.id, ref: h.ref, status, items, shared, total: items.length, started_at: h.started_at, started_by: h.started_by, due_on: d10(new Date(h.due_on)), overdue: status !== 'CLOSED' && status !== 'CANCELLED' && d10(new Date(h.due_on)) < today,
    shared_by: at('prepare')?.who ?? null, shared_at: at('prepare')?.decided_at ?? null, signed_by: at('signoff')?.who ?? null, signed_at: at('signoff')?.decided_at ?? null, closed_by: at('close')?.who ?? null, closed_at: at('close')?.decided_at ?? null,
    waiting_on_role: h.waiting_on_role, sla_days: HANDOVER_SLA_DAYS };
}

/** Tasama's HR Operations Manager starts the handover: the checklist opens and the case goes to Tasama HR operations. */
export async function startHandover(c: PoolClient, by: string, opts: { scenario?: string | null } = {}) {
  const open = await currentHandover(c);
  if (open && !['CLOSED', 'CANCELLED'].includes(open.status)) throw new Error(`A handover is already in progress (${open.ref}).`);
  const people = (await c.query(`SELECT value FROM layer.meta WHERE key='people'`)).rows[0].value;
  const ops = people.persona.payroll as number;
  const at = now();
  const dueOn = d10(workingDaysAfter(at, HANDOVER_SLA_DAYS));
  const k = await startCase(c, { workflowId: 'WF-39', type: 'CLIENT_HANDOVER', title: `Handing ${client().short} back: payroll files, records and access`, title_ar: `تسليم ${client().name_ar}: ملفات الرواتب والسجلات والصلاحيات`,
    requester: ops, subject: ops, channel: 'FORM', scenario: opts.scenario ?? null, payload: { client: client().short, started_by: by, items: HANDOVER_ITEMS.length, sla_days: HANDOVER_SLA_DAYS, due_on: dueOn, due: `${dueOn}T15:00:00Z` } });
  await c.query(`INSERT INTO layer.handovers (request_id, status, items, started_at, due_on, started_by) VALUES ($1,'SHARING',$2,$3,$4,$5)`,
    [k.id, JSON.stringify(HANDOVER_ITEMS.map((i) => ({ n: i.n, shared_at: null }))), at, dueOn, by]);
  return k;
}

/** Tasama HR operations ticks an item as shared through the folder (or all of them). */
export async function shareItems(c: Q, ns: number[] | 'all', by: string) {
  const h = (await c.query(`SELECT * FROM layer.handovers ORDER BY id DESC LIMIT 1`)).rows[0];
  if (!h) throw new Error('No handover in progress.');
  const at = now().toISOString();
  const items = (h.items as any[]).map((i) => (ns === 'all' || ns.includes(i.n) ? { ...i, shared_at: i.shared_at ?? at, shared_by: i.shared_by ?? by } : i));
  await c.query(`UPDATE layer.handovers SET items=$2 WHERE id=$1`, [h.id, JSON.stringify(items)]);
  return items.filter((i) => i.shared_at).length;
}

/** Cancel the handover in progress (the scenario starts afresh). */
export async function cancelHandover(c: Q) {
  const h = (await c.query(`SELECT id, request_id FROM layer.handovers WHERE status <> 'CANCELLED' ORDER BY id DESC LIMIT 1`)).rows[0];
  if (!h) return;
  await c.query(`UPDATE layer.handovers SET status='CANCELLED' WHERE id=$1`, [h.id]);
  if (h.request_id) await c.query(`UPDATE layer.requests SET status='CANCELLED', waiting_on_role=NULL, waiting_on_person_id=NULL, closed_at=now() WHERE id=$1 AND status NOT IN ('COMPLETED','CANCELLED')`, [h.request_id]);
}
