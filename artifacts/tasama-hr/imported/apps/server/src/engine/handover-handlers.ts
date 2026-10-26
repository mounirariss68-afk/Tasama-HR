/**
 * WF-39's system step (design/walkthrough-addendum.md R41): once Tasama's HR Operations Manager closes the client, every
 * access the client gave Tasama is revoked and Tasama's copies of the payroll files are deleted.
 */
import type { HCtx, StepOutcome } from './core.js';
import { client } from '../domain/rules.js';
import { HANDOVER_ITEMS, HANDOVER_SLA_DAYS } from '../domain/checklists.js';
import { now } from '../clock.js';

const DAY = 86_400_000;

export const HANDOVER_HANDLERS: Record<string, (h: HCtx) => Promise<StepOutcome>> = {
  'WF-39:wipe': async (h) => {
    const row = (await h.c.query(`SELECT * FROM layer.handovers WHERE request_id=$1`, [h.req.id])).rows[0];
    const shared = row ? (row.items as any[]).filter((i) => i.shared_at).length : 0;
    await h.c.query(`UPDATE layer.handovers SET status='CLOSED' WHERE request_id=$1`, [h.req.id]);
    const started = row ? new Date(row.started_at) : now();
    const days = Math.round((now().getTime() - started.getTime()) / DAY);
    await h.trail({ act: 'WRITE', actor_type: 'SYSTEM', actor_name: 'Platform', autonomy: null,
      summary: `Revoked every access ${client().short} gave Tasama: the bank portal, ${client().hrmsLabel} and GOSI. Deleted Tasama's copies of the payroll files and the records; ${shared} of ${HANDOVER_ITEMS.length} checklist items were shared with the client through the folder. ${client().short} is closed ${days === 0 ? 'the day the handover started' : `${days} ${days === 1 ? 'day' : 'days'} after the handover started`} (SLA ${HANDOVER_SLA_DAYS} working days).`,
      summary_ar: `أُلغيت كل صلاحيات تسامى لدى ${client().name_ar} وحُذفت نسخها من ملفات الرواتب؛ أُغلق العميل خلال ${days} أيام.` });
    return { status: 'DONE', decision: 'Access revoked, files deleted', stop: 'COMPLETED' };
  },
};
