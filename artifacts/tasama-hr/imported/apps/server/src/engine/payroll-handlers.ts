/**
 * Step handlers for the payroll workflows (design/payroll-addendum.md §7),
 * merged into HANDLERS and WHO in handlers.ts.
 *
 * WF-26 Client policy: Nizam reads the handbook into a draft version; Tasama's
 * payroll lead recommends a reading for every unclear rule; the client's CHRO
 * activates; the platform makes the version active.
 */
import type { PoolClient } from 'pg';
import type { HCtx, Req, StepOutcome } from './core.js';
import type { StepDef } from '../domain/workflows.js';
import { client, iso } from '../domain/rules.js';
import { policiesFor } from '../domain/policies.js';
import { now } from '../clock.js';
import { readHandbook, dimensionName } from '../agents/nizam.js';
import { saveVersion, nextVersion, activeVersion, READINGS, RECOMMENDED } from '../payroll/policy.js';
import { readUpload, confirmMonth } from '../attendance/service.js';
import { applyAnswer } from '../payroll/checks.js';

type H = (h: HCtx) => Promise<StepOutcome>;
type Who = (c: PoolClient, req: Req, def: StepDef) => Promise<{ role: string; personId: number } | null>;

/** Tasama's payroll team is not on any client's HRMS: the case waits on the role, and the Payroll lens shows it. */
export const PAYROLL_WHO: Record<string, Who> = {
  TASAMA_PAYROLL_LEAD: async () => ({ role: 'TASAMA_PAYROLL_LEAD', personId: null as unknown as number }),
  TASAMA_PAYROLL: async () => ({ role: 'TASAMA_PAYROLL', personId: null as unknown as number }),
};

const flagWord = (f: string) => (f === 'BELOW_LAW' ? 'below the law' : f === 'UNCLEAR' ? 'unclear' : 'not in the handbook');

export const PAYROLL_HANDLERS: Record<string, H> = {
  'WF-26:read': async (h) => {
    const c = client();
    const reading = await readHandbook(c, { revised: Boolean(h.req.payload.revised), source: h.req.payload.source, useClaude: true });
    const version = await nextVersion(h.c);
    const id = await saveVersion(h.c, reading, { version, status: 'DRAFT', effective: h.req.payload.effective ?? iso(now()), requestId: h.req.id });
    await h.patch({ version_id: id, version });
    for (const r of reading.flagged) {
      await h.trail({ act: r.flag === 'BELOW_LAW' ? 'REFUSE' : 'CHECK', summary: `${r.label} (${dimensionName(r.dim).toLowerCase()}) is ${flagWord(r.flag!)}: ${r.flag_note}`, citation: r.clause ?? undefined });
    }
    const unclear = reading.flagged.filter((r) => r.flag === 'UNCLEAR');
    const below = reading.flagged.filter((r) => r.flag === 'BELOW_LAW');
    await h.trail({ act: 'CHECK', summary: `Read ${reading.clauses} clauses into ${reading.rules.length} rules on all ${reading.dims} dimensions: ${unclear.length} unclear, ${below.length} below the law, ${reading.flagged.length - unclear.length - below.length} not covered.` });
    await h.setResult({ reading: { version, rules: reading.rules.length, dims: reading.dims, clauses: reading.clauses, flagged: reading.flagged.map((r) => ({ key: r.key, dim: r.dim, label: r.label, label_ar: r.label_ar, flag: r.flag, note: r.flag_note, quote: r.quote, clause: r.clause, readings: READINGS[r.key] ?? null, recommended: RECOMMENDED[r.key] ?? null })), by: reading.by } });
    const rec = unclear[0] ? RECOMMENDED[unclear[0].key] : null;
    const choice = rec ? READINGS[unclear[0].key]?.find((x) => x.code === rec.code) : null;
    return {
      status: 'DONE', decision: `Draft version ${version}: ${reading.rules.length} rules`, outputs: { version, rules: reading.rules.length, flagged: reading.flagged.length },
      recommend: unclear.length && choice
        ? { verdict: 'REVIEW', summary: `read the ${unclear[0].label.toLowerCase()} as ${choice.label.toLowerCase()}: ${rec!.why}`, summary_ar: `قراءة ${unclear[0].label_ar} على أنها ${choice.label_ar}: ${rec!.why_ar}` }
        : { verdict: 'APPROVE', summary: 'every rule is clear; send it to the client for activation' },
    };
  },

  'WF-26:propose': async (h) => {
    const readings: Record<string, string> = h.req.payload.readings ?? {};
    const flagged: any[] = h.req.result.reading?.flagged ?? [];
    const lines: string[] = [];
    for (const f of flagged) {
      if (f.flag === 'UNCLEAR') {
        const code = readings[f.key] ?? RECOMMENDED[f.key]?.code;
        const ch = READINGS[f.key]?.find((x) => x.code === code);
        if (!ch) continue;
        await h.c.query(`UPDATE layer.policy_rules SET value=$3, num=$4, resolution=$5 WHERE version_id=$1 AND key=$2`, [h.req.payload.version_id, f.key, ch.value, ch.num, `Read as ${ch.label.toLowerCase()}`]);
        lines.push(`${f.label} read as ${ch.label.toLowerCase()}`);
      } else if (f.flag === 'BELOW_LAW') {
        await h.c.query(`UPDATE layer.policy_rules SET resolution=$3 WHERE version_id=$1 AND key=$2`, [h.req.payload.version_id, f.key, 'Refused: the law applies']);
        lines.push(`${f.label} refused; the law applies`);
      } else {
        await h.c.query(`UPDATE layer.policy_rules SET resolution=$3 WHERE version_id=$1 AND key=$2`, [h.req.payload.version_id, f.key, 'Ask the client before it is paid']);
      }
    }
    await h.patch({ readings_applied: lines });
    await h.trail({ act: 'PREPARE', summary: `Prepared version ${h.req.payload.version} for the client's decision${lines.length ? `: ${lines.join('; ')}` : ''}.` });
    return { status: 'DONE', recommend: { verdict: 'APPROVE', summary: `activate version ${h.req.payload.version}${lines.length ? `, with ${lines.join('; ')}, as Tasama's payroll lead recommends` : ''}` } };
  },

  'WF-29:read': async (h) => {
    const { summary } = await readUpload(h.c, h.req.payload.upload_id);
    await h.c.query(`UPDATE layer.attendance_uploads SET request_id=$2 WHERE id=$1`, [h.req.payload.upload_id, h.req.id]);
    const capped = summary.capped.length;
    await h.trail({ act: 'CHECK', summary: `Read ${Number(h.req.payload.rows).toLocaleString('en-US')} attendance records for ${summary.people} people: ${summary.lates} late arrivals and ${summary.noPunch} scheduled days with no attendance recorded, ${summary.leaveCovered} of them approved leave, so ${summary.absences} absences.` });
    if (capped) await h.trail({ act: 'CHECK', summary: `${capped === 1 ? 'One person\'s' : `${capped} people's`} lateness fines would pass five days' wage; they stop at the cap (Art. 70). Unpaid absence is kept apart: it is not a fine and has no cap.` });
    await h.setResult({ attendance: summary });
    return { status: 'DONE', decision: `${summary.fined} fines, ${summary.unpaidDays} unpaid days proposed`, outputs: summary,
      recommend: { verdict: 'APPROVE', summary: `confirm ${summary.fined} fines totalling SAR ${Math.round(summary.fines).toLocaleString('en-US')} and ${summary.unpaidDays} unpaid days, after reading each employee's explanation` } };
  },

  // WF-30: the client's answer to a check on the draft run becomes entries in the open month (§16).
  'WF-30:apply': async (h) => {
    const who = (await h.c.query(`SELECT pp.display_name n FROM layer.approvals a JOIN hcm.persons pp ON pp.id=a.approver_person_id WHERE a.request_id=$1 AND a.decision='APPROVED' ORDER BY a.decided_at DESC LIMIT 1`, [h.req.id])).rows[0]?.n ?? 'HR operations';
    const summary = await applyAnswer(h.c, h.req as any, who);
    await h.trail({ act: 'WRITE', summary: `${summary} The draft run recalculates.`, actor_type: 'SYSTEM', actor_name: 'Tasama HR', autonomy: null });
    await h.setResult({ answered: summary });
    return { status: 'DONE', decision: summary };
  },

  'WF-29:apply': async (h) => {
    const pl = h.req.payload;
    const r = await confirmMonth(h.c, pl.upload_id, 'HR operations', { reject: pl.reject ?? [], waive: pl.waive ?? [], excuseAbsence: pl.excuse_absence ?? [] });
    // Name the person who confirmed, not only the role.
    const who = (await h.c.query(`SELECT pp.display_name n FROM layer.approvals a JOIN hcm.persons pp ON pp.id=a.approver_person_id WHERE a.request_id=$1 AND a.decision='APPROVED' ORDER BY a.decided_at DESC LIMIT 1`, [h.req.id])).rows[0]?.n ?? 'HR operations';
    const names = async (ids: number[]) => (await h.c.query(`SELECT string_agg(display_name, ', ') n FROM hcm.persons WHERE id = ANY($1::int[])`, [ids])).rows[0].n;
    if (pl.waive?.length) await h.trail({ act: 'DECIDE', summary: `${who} waived the lateness fine for ${await names(pl.waive)}.`, actor_type: 'HUMAN', actor_name: `${who}, HR operations`, autonomy: null });
    if (pl.excuse_absence?.length) await h.trail({ act: 'DECIDE', summary: `${who} excused the absence of ${await names(pl.excuse_absence)}.`, actor_type: 'HUMAN', actor_name: `${who}, HR operations`, autonomy: null });
    if (pl.reject?.length) await h.trail({ act: 'DECIDE', summary: `${who} did not accept ${pl.reject.length} explanation${pl.reject.length === 1 ? '' : 's'}; the fine stands for those days.`, actor_type: 'HUMAN', actor_name: `${who}, HR operations`, autonomy: null });
    await h.trail({ act: 'WRITE', summary: `Entered ${r.summary.unpaidDays} unpaid days and SAR ${Math.round(r.summary.fines).toLocaleString('en-US')} of fines for ${r.entries} people in the ${r.period} payroll month; ${r.summary.excused} day${r.summary.excused === 1 ? '' : 's'} excused.`, actor_type: 'SYSTEM', actor_name: 'Tasama HR', autonomy: null });
    const prior = h.req.result.attendance ?? {};
    await h.setResult({ attendance: { ...prior, ...r.summary, explained: prior.explained ?? r.summary.excused, explanations: prior.explanations ?? [] }, applied: r.period });
    return { status: 'DONE', decision: `Entered in ${r.period}` };
  },

  'WF-26:apply': async (h) => {
    const prev = await activeVersion(h.c);
    if (prev) await h.c.query(`UPDATE layer.policy_versions SET status='SUPERSEDED' WHERE id=$1`, [prev.id]);
    const chro = (await h.c.query(`SELECT a.approver_person_id, p.display_name FROM layer.approvals a LEFT JOIN hcm.persons p ON p.id=a.approver_person_id WHERE a.request_id=$1 AND a.step_key='activate' ORDER BY a.id DESC LIMIT 1`, [h.req.id])).rows[0];
    await h.c.query(`UPDATE layer.policy_versions SET status='ACTIVE', activated_by=$2, activated_at=$3 WHERE id=$1`, [h.req.payload.version_id, chro?.display_name ?? 'Client CHRO', now()]);
    if (h.req.payload.revised) {
      // The assistants answer from the revised handbook from now on.
      for (const p of policiesFor(client(), true)) for (const k of p.clauses) await h.c.query(`UPDATE layer.policy_clauses SET text_en=$2, text_ar=$3 WHERE id=$1`, [`${p.id} §${k.ref}`, k.en, k.ar]);
    }
    await h.trail({ act: 'WRITE', summary: `Version ${h.req.payload.version} is active for payroll and the assistants${prev ? `; version ${prev.version} is kept for the record` : ''}.`, actor_type: 'SYSTEM', actor_name: 'Tasama HR', autonomy: null });
    await h.setResult({ active_version: h.req.payload.version });
    return { status: 'DONE', decision: `Version ${h.req.payload.version} active` };
  },
};
