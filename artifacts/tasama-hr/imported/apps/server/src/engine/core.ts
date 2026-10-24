/**
 * The workflow engine.
 *
 * A case (layer.requests) runs through its workflow's steps in order. AGENT
 * and SYSTEM steps execute immediately through their handler; a HUMAN step
 * parks the case in one person's inbox with an SLA and an approval row. A
 * decision resumes it. Nothing writes to the HRMS except SYSTEM steps, and
 * those only run after every human step before them has approved.
 *
 * The engine never trusts its own agents with a decision the workflow gives
 * to a person: the only way past a HUMAN step is decide().
 */
import type { PoolClient } from 'pg';
import { now } from '../clock.js';
import { client } from '../domain/rules.js';
import { wf, type StepDef, type WorkflowDef } from '../domain/workflows.js';
import { AGENTS } from '../domain/agents.js';
import type { Ctx } from '../hcm/connector.js';
import { HANDLERS, WHO } from './handlers.js';
import { TEAM_NOTIFY } from '../domain/staff.js';

export type Req = {
  id: number; ref: string; workflow_id: string; type: string; title: string; title_ar: string;
  requester_person_id: number; subject_person_id: number; status: string; priority: string; channel: string;
  current_step: string | null; waiting_on_role: string | null; waiting_on_person_id: number | null;
  payload: Record<string, any>; result: Record<string, any>; scenario_key: string | null; created_at: string;
};
export type StepRow = { id: number; request_id: number; seq: number; step_key: string; actor_type: string; actor_id: string; label: string; status: string; outputs: any; decision: string | null };

export type StepOutcome = {
  status?: 'DONE' | 'SKIPPED' | 'REFUSED' | 'FAILED';
  decision?: string;
  outputs?: Record<string, any>;
  /** End the case here. */
  stop?: 'COMPLETED' | 'REJECTED' | 'ESCALATED';
  /** Steps to skip later in this workflow. */
  skip?: string[];
  /** For the next human step: what the agent recommends, shown in the reader and used to detect overrides. */
  recommend?: { verdict: 'APPROVE' | 'DECLINE' | 'REVIEW'; summary: string; summary_ar?: string };
};

export type HCtx = {
  c: PoolClient; req: Req; step: StepRow; def: StepDef; wf: WorkflowDef; at: Date;
  conn: Ctx;
  trail: (t: TrailIn) => Promise<void>;
  patch: (p: Record<string, any>) => Promise<void>;
  setResult: (p: Record<string, any>) => Promise<void>;
  notify: (personId: number, title: string, title_ar: string, body: string) => Promise<void>;
};
export type TrailIn = { act: string; summary: string; summary_ar?: string; actor_id?: string; actor_type?: 'AGENT' | 'HUMAN' | 'SYSTEM'; actor_name?: string; autonomy?: string | null; citation?: string; override_reason?: string };

const agentName = (id: string) => AGENTS.find((a) => a.id === id)?.name ?? id;
const agentAutonomy = (id: string) => AGENTS.find((a) => a.id === id)?.autonomy ?? null;

export async function addTrail(c: PoolClient, requestId: number | null, t: TrailIn & { actor_id: string; actor_type: 'AGENT' | 'HUMAN' | 'SYSTEM'; actor_name: string }) {
  await c.query(
    `INSERT INTO layer.trail (request_id, at, actor_type, actor_id, actor_name, act, autonomy, summary, summary_ar, override_reason, citation)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [requestId, now(), t.actor_type, t.actor_id, t.actor_name, t.act, t.autonomy ?? null, t.summary, t.summary_ar ?? t.summary, t.override_reason ?? null, t.citation ?? null],
  );
}

async function loadReq(c: PoolClient, id: number): Promise<Req> {
  const r = await c.query('SELECT * FROM layer.requests WHERE id = $1 FOR UPDATE', [id]);
  if (!r.rows[0]) throw new Error(`case ${id} not found`);
  return r.rows[0];
}

export type StartIn = {
  workflowId: string; type: string; title: string; title_ar: string; requester: number; subject: number;
  channel: 'CHAT' | 'FORM' | 'EVENT' | 'SCHEDULE' | 'SCENARIO'; payload?: Record<string, any>; priority?: string; scenario?: string | null;
  /** Steps already done by the requester when the case is opened (e.g. the manager's own intake). */
  doneAtStart?: string[];
};

export async function startCase(c: PoolClient, s: StartIn): Promise<Req> {
  const def = wf(s.workflowId);
  const seq = (await c.query(`SELECT nextval('layer.case_seq') AS n`)).rows[0].n as number;
  const yy = String(now().getUTCFullYear()).slice(2);
  const ref = `${client().code}-CASE-${yy}-${String(seq).padStart(5, "0")}`;
  const at = now();
  const req = (await c.query(
    `INSERT INTO layer.requests (ref, workflow_id, type, title, title_ar, requester_person_id, subject_person_id, status, priority, channel, payload, result, scenario_key, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'RUNNING',$8,$9,$10,'{}',$11,$12,$12) RETURNING *`,
    [ref, def.id, s.type, s.title, s.title_ar, s.requester, s.subject, s.priority ?? 'NORMAL', s.channel, JSON.stringify(s.payload ?? {}), s.scenario ?? null, at],
  )).rows[0] as Req;
  for (const [i, st] of def.steps.entries()) {
    const done = s.doneAtStart?.includes(st.key);
    await c.query(
      `INSERT INTO layer.run_steps (request_id, seq, step_key, actor_type, actor_id, label, label_ar, status, started_at, ended_at, decision)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10)`,
      [req.id, i + 1, st.key, st.actor_type, st.actor, st.label, st.label_ar, done ? 'DONE' : 'PENDING', done ? at : null, done ? 'Submitted by requester' : null],
    );
  }
  const requester = (await c.query('SELECT display_name FROM hcm.persons WHERE id=$1', [s.requester])).rows[0]?.display_name ?? 'Requester';
  await addTrail(c, req.id, { actor_type: 'HUMAN', actor_id: String(s.requester), actor_name: requester, act: 'SUBMIT', summary: `Opened the case: ${s.title}`, summary_ar: `فتح الحالة: ${s.title_ar}` });
  await advance(c, req.id);
  return (await c.query('SELECT * FROM layer.requests WHERE id=$1', [req.id])).rows[0];
}

const SLA_HOURS: Record<string, number> = { LINE_MANAGER: 48, HRBP: 48, TA: 24, PAYROLL: 24, CHRO: 72, EMPLOYEE: 72 };

/** Run steps until the case needs a person, ends, or runs out of steps. */
export async function advance(c: PoolClient, requestId: number) {
  for (let guard = 0; guard < 30; guard++) {
    const req = await loadReq(c, requestId);
    if (!['RUNNING'].includes(req.status)) return;
    const def = wf(req.workflow_id);
    const step = (await c.query(`SELECT * FROM layer.run_steps WHERE request_id=$1 AND status='PENDING' ORDER BY seq LIMIT 1`, [requestId])).rows[0] as StepRow | undefined;
    if (!step) {
      await c.query(`UPDATE layer.requests SET status='COMPLETED', current_step=NULL, waiting_on_role=NULL, waiting_on_person_id=NULL, closed_at=$2, updated_at=$2 WHERE id=$1`, [requestId, now()]);
      return;
    }
    const sdef = def.steps.find((x) => x.key === step.step_key)!;
    const at = now();
    await c.query(`UPDATE layer.run_steps SET status='RUNNING', started_at=$2 WHERE id=$1`, [step.id, at]);
    await c.query(`UPDATE layer.requests SET current_step=$2, updated_at=$3 WHERE id=$1`, [requestId, step.step_key, at]);

    if (sdef.actor_type === 'HUMAN') {
      const who = await (WHO[`${def.id}:${sdef.key}`] ?? WHO[sdef.actor] ?? (async () => null))(c, req, sdef);
      if (!who) {
        await c.query(`UPDATE layer.run_steps SET status='SKIPPED', ended_at=$2, decision='Not required' WHERE id=$1`, [step.id, at]);
        continue;
      }
      await c.query(`INSERT INTO layer.approvals (request_id, step_key, approver_role, approver_person_id, decision, created_at) VALUES ($1,$2,$3,$4,'PENDING',$5)`, [requestId, sdef.key, who.role, who.personId, at]);
      await c.query(`UPDATE layer.run_steps SET status='WAITING' WHERE id=$1`, [step.id]);
      // A case waiting on a Tasama team notifies its people (design/payroll-ops-addendum.md §3).
      for (const nid of TEAM_NOTIFY[who.role] ?? []) {
        await c.query(`INSERT INTO layer.notifications (person_id, title, title_ar, body, link, created_at) VALUES ($1,$2,$3,$4,$5,$6)`, [nid, req.title, req.title_ar ?? req.title, sdef.label, `case:${req.ref}`, at]);
      }
      await c.query(
        `UPDATE layer.requests SET status='WAITING', waiting_on_role=$2, waiting_on_person_id=$3, sla_due=$4, updated_at=$5 WHERE id=$1`,
        [requestId, who.role, who.personId, req.payload?.due ? new Date(req.payload.due) : new Date(at.getTime() + (SLA_HOURS[who.role] ?? 48) * 3600_000), at],
      );
      return;
    }

    const handler = HANDLERS[`${def.id}:${sdef.key}`];
    const conn: Ctx = { c, requestId, actor: sdef.actor };
    const h: HCtx = {
      c, req, step, def: sdef, wf: def, at, conn,
      trail: (t) => addTrail(c, requestId, { actor_type: t.actor_type ?? (sdef.actor_type as any), actor_id: t.actor_id ?? sdef.actor, actor_name: t.actor_name ?? (sdef.actor_type === 'SYSTEM' ? 'Connector' : agentName(sdef.actor)), autonomy: t.autonomy === undefined ? (sdef.actor_type === 'AGENT' ? agentAutonomy(sdef.actor) : null) : t.autonomy, ...t }),
      patch: async (p) => { await c.query(`UPDATE layer.requests SET payload = payload || $2::jsonb WHERE id=$1`, [requestId, JSON.stringify(p)]); Object.assign(req.payload, p); },
      setResult: async (p) => { await c.query(`UPDATE layer.requests SET result = result || $2::jsonb WHERE id=$1`, [requestId, JSON.stringify(p)]); Object.assign(req.result, p); },
      notify: async (personId, title, title_ar, body) => { await c.query(`INSERT INTO layer.notifications (person_id, title, title_ar, body, link, created_at) VALUES ($1,$2,$3,$4,$5,$6)`, [personId, title, title_ar, body, `case:${req.ref}`, now()]); },
    };
    let out: StepOutcome;
    await c.query('SAVEPOINT step_sp');
    try {
      out = handler ? await handler(h) : { status: 'DONE', decision: 'No handler: recorded as done (designed step)' };
      await c.query('RELEASE SAVEPOINT step_sp');
    } catch (e: any) {
      await c.query('ROLLBACK TO SAVEPOINT step_sp');
      console.error(`[engine] ${req.ref} ${def.id}:${sdef.key} failed:`, e.message);
      out = { status: 'FAILED', decision: `Error: ${e.message}` };
      await h.trail({ act: 'ESCALATE', summary: `Step failed and was escalated to HR Operations: ${e.message}` });
      await c.query(`UPDATE layer.requests SET status='ESCALATED', waiting_on_role='PAYROLL', updated_at=$2 WHERE id=$1`, [requestId, now()]);
    }
    await c.query(`UPDATE layer.run_steps SET status=$2, decision=$3, outputs=$4, ended_at=$5 WHERE id=$1`, [step.id, out.status ?? 'DONE', out.decision ?? null, JSON.stringify(out.outputs ?? {}), now()]);
    if (out.recommend) await h.setResult({ recommendation: out.recommend });
    if (out.skip?.length) await c.query(`UPDATE layer.run_steps SET status='SKIPPED', decision='Not required', ended_at=$3 WHERE request_id=$1 AND step_key = ANY($2) AND status='PENDING'`, [requestId, out.skip, now()]);
    if (out.status === 'FAILED') return;
    if (out.stop) {
      const status = out.stop;
      await c.query(`UPDATE layer.run_steps SET status='SKIPPED', decision=$3, ended_at=$4 WHERE request_id=$1 AND status='PENDING' AND seq > $2`, [requestId, step.seq, status === 'ESCALATED' ? 'Stopped: escalated to a person' : 'Stopped', now()]);
      if (status === 'ESCALATED') {
        await c.query(`UPDATE layer.requests SET status='ESCALATED', updated_at=$2 WHERE id=$1`, [requestId, now()]);
      } else {
        await c.query(`UPDATE layer.requests SET status=$2, current_step=NULL, waiting_on_role=NULL, waiting_on_person_id=NULL, closed_at=$3, updated_at=$3 WHERE id=$1`, [requestId, status, now()]);
      }
      return;
    }
  }
}

export type DecideIn = { actorName?: string; requestId: number; personId: number; decision: 'APPROVED' | 'REJECTED' | 'RETURNED'; reason?: string; edits?: Record<string, any> };

export async function decide(c: PoolClient, d: DecideIn) {
  const req = await loadReq(c, d.requestId);
  if (!['WAITING', 'ESCALATED'].includes(req.status)) throw new Error(`${req.ref} is not waiting for a decision (${req.status})`);
  const appr = (await c.query(`SELECT * FROM layer.approvals WHERE request_id=$1 AND decision='PENDING' ORDER BY id DESC LIMIT 1`, [req.id])).rows[0];
  const person = d.actorName ?? (await c.query('SELECT display_name FROM hcm.persons WHERE id=$1', [d.personId])).rows[0]?.display_name ?? 'Approver';
  const at = now();
  const rec = req.result?.recommendation as StepOutcome['recommend'] | undefined;
  const overrides = rec && ((rec.verdict === 'DECLINE' && d.decision === 'APPROVED') || (rec.verdict === 'APPROVE' && d.decision === 'REJECTED'));
  if (overrides && !d.reason) throw new Error('A reason is required when the decision differs from the agent\'s recommendation.');
  if (d.edits) await c.query(`UPDATE layer.requests SET payload = payload || $2::jsonb WHERE id=$1`, [req.id, JSON.stringify(d.edits)]);

  if (req.status === 'ESCALATED' && !appr) {
    // An escalated case resumed or closed by a person.
    await addTrail(c, req.id, { actor_type: 'HUMAN', actor_id: String(d.personId), actor_name: person, act: d.decision === 'APPROVED' ? 'APPROVE' : 'REJECT', summary: d.reason ?? (d.decision === 'APPROVED' ? 'Resolved the escalation and resumed the case' : 'Closed the escalated case') });
    if (d.decision === 'APPROVED') {
      await c.query(`UPDATE layer.requests SET status='RUNNING', updated_at=$2 WHERE id=$1`, [req.id, at]);
      await c.query(`UPDATE layer.run_steps SET status='PENDING', decision=NULL WHERE request_id=$1 AND status='SKIPPED' AND decision LIKE 'Stopped%'`, [req.id]);
      await advance(c, req.id);
    } else {
      await c.query(`UPDATE layer.requests SET status='REJECTED', closed_at=$2, updated_at=$2, waiting_on_role=NULL, waiting_on_person_id=NULL WHERE id=$1`, [req.id, at]);
    }
    return;
  }
  if (!appr) throw new Error('No pending approval');
  await c.query(`UPDATE layer.approvals SET decision=$2, reason=$3, decided_at=$4, approver_person_id=$5 WHERE id=$1`, [appr.id, d.decision, d.reason ?? null, at, d.personId]);
  const stepLabel = wf(req.workflow_id).steps.find((s) => s.key === appr.step_key)!;
  await addTrail(c, req.id, {
    actor_type: 'HUMAN', actor_id: String(d.personId), actor_name: person,
    act: overrides ? 'OVERRIDE' : d.decision === 'APPROVED' ? 'APPROVE' : d.decision === 'RETURNED' ? 'RETURN' : 'REJECT',
    summary: `${d.decision === 'APPROVED' ? 'Approved' : d.decision === 'RETURNED' ? 'Returned' : 'Declined'}: ${stepLabel.label}${d.reason ? ` — ${d.reason}` : ''}`,
    summary_ar: `${d.decision === 'APPROVED' ? 'اعتمد' : d.decision === 'RETURNED' ? 'أعاد' : 'رفض'}: ${stepLabel.label_ar}${d.reason ? ` — ${d.reason}` : ''}`,
    override_reason: overrides ? d.reason : undefined,
  });
  await c.query(`UPDATE layer.run_steps SET status=$3, decision=$4, ended_at=$5 WHERE request_id=$1 AND step_key=$2`, [req.id, appr.step_key, d.decision === 'APPROVED' ? 'DONE' : 'DONE', `${d.decision === 'APPROVED' ? 'Approved' : d.decision === 'RETURNED' ? 'Returned' : 'Declined'} by ${person}`, at]);
  if (d.decision === 'APPROVED') {
    await c.query(`UPDATE layer.requests SET status='RUNNING', waiting_on_role=NULL, waiting_on_person_id=NULL, sla_due=NULL, updated_at=$2 WHERE id=$1`, [req.id, at]);
    await advance(c, req.id);
  } else {
    await c.query(`UPDATE layer.run_steps SET status='SKIPPED', decision='Case closed', ended_at=$2 WHERE request_id=$1 AND status='PENDING'`, [req.id, at]);
    await c.query(`UPDATE layer.requests SET status='REJECTED', waiting_on_role=NULL, waiting_on_person_id=NULL, sla_due=NULL, closed_at=$2, updated_at=$2 WHERE id=$1`, [req.id, at]);
    await c.query(`INSERT INTO layer.notifications (person_id, title, title_ar, body, link, created_at) VALUES ($1,$2,$3,$4,$5,$6)`,
      [req.subject_person_id, `${req.title}: declined`, `${req.title_ar}: مرفوض`, d.reason ?? 'Your request was declined.', `case:${req.ref}`, at]);
  }
}
