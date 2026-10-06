/**
 * Tasama-level scenarios: the service provider's side of the demo.
 *   sla-rescue        Raqeeb sees a Riyadh Air request about to miss its SLA, reminds the approver,
 *                     and puts it in front of the Tasama HR Operations Manager.
 *   month-end-invoice Fatoora prepares Red Sea Global's invoice from the month's volumes and
 *                     service levels, applies any contract credit, and waits for approval.
 * Both run the real code; the beats narrate what it did.
 */
import { pool, withClient, tx } from '../db.js';
import { clientByKey } from '../domain/clients.js';
import { monthStart, iso, addDays } from '../domain/rules.js';
import { setClock, now } from '../clock.js';
import { startCase } from '../engine/core.js';
import { raqeebScan, nudge, prepareInvoice, slaFor, monthLabel } from './service.js';
import type { Run } from '../scenarios.js';

export const TASAMA_SCENARIOS = [
  { key: 'sla-rescue', level: 'tasama', shape: 'Service level at risk', shape_ar: 'مستوى خدمة معرض للتجاوز', title: 'Raqeeb catches a request before it breaches', title_ar: 'رقيب يلتقط طلباً قبل تجاوز مستوى الخدمة', persona: 'tasama',
    summary: 'A leave request at Riyadh Air has been waiting on the manager for almost two days. Raqeeb flags it with hours to spare, reminds the manager, and puts it in the Tasama HR Operations Manager\'s escalations.',
    summary_ar: 'طلب إجازة في طيران الرياض ينتظر المدير منذ يومين تقريباً؛ يرصده رقيب قبل التجاوز ويذكّر المدير ويحيله إلى مدير العمليات في تسامى.' },
  { key: 'month-end-invoice', level: 'tasama', shape: 'Month end', shape_ar: 'نهاية الشهر', title: 'Fatoora prepares a client invoice', title_ar: 'فاتورة تُعد فاتورة العميل', persona: 'tasama',
    summary: 'Fatoora prepares Red Sea Global\'s invoice for last month from the payroll headcount and the month\'s service levels, applies any credit the contract requires, and waits for approval.',
    summary_ar: 'تُعد فاتورة فاتورة البحر الأحمر الدولية للشهر الماضي من عدد الموظفين ومستويات الخدمة، وتطبق أي خصم تعاقدي، ثم تنتظر الاعتماد.' },
];

const runs = new Map<string, Run>();
export const getTasamaRun = (id: string) => runs.get(id);
export const clearTasamaRuns = () => runs.clear();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function runTasamaScenario(key: string): string {
  const id = `${key}-${Date.now()}`;
  const run: Run = { key, status: 'running', beats: [], cases: [] };
  runs.set(id, run);
  const say = (text: string, text_ar: string) => run.beats.push({ at: new Date().toISOString(), text, text_ar });
  (async () => {
    if (key === 'sla-rescue') {
      const cl = clientByKey('riyadhair')!;
      const ref = await withClient(cl.key, async () => {
        const mgr = (await pool.query(`SELECT value FROM layer.meta WHERE key='people'`)).rows[0].value.persona.manager as number;
        const who = (await pool.query(`SELECT a.person_id, p.display_name, p.display_name_ar FROM hcm.assignments a JOIN hcm.persons p ON p.id=a.person_id JOIN hcm.work_relationships wr ON wr.person_id=a.person_id
                                         WHERE a.manager_person_id=$1 AND a.effective_end='4712-12-31' AND wr.end_date IS NULL ORDER BY a.person_id DESC LIMIT 1`, [mgr])).rows[0];
        say(`${cl.short}: ${who.display_name} asked for three days of annual leave 45 hours ago. It is waiting on the manager; the contract counts employee requests against a 3-working-day service level.`,
          `${cl.name_ar}: طلب ${who.display_name_ar} إجازة سنوية لثلاثة أيام قبل 45 ساعة، والطلب بانتظار المدير.`);
        setClock(new Date(Date.now() - 45 * 3600_000));
        const r = await tx((c) => startCase(c, { workflowId: 'WF-15', type: 'LEAVE', title: 'Annual leave, 3 days', title_ar: 'إجازة سنوية، 3 أيام', requester: who.person_id, subject: who.person_id, channel: 'SCENARIO', scenario: key,
          payload: { type_code: 'ANNUAL', start: iso(addDays(now(), 21)), end: iso(addDays(now(), 23)), days: 3, reason: 'Family visit' } }));
        setClock(null);
        return r.ref as string;
      });
      run.cases.push(ref);
      await sleep(1200);
      const found = await raqeebScan();
      const mine = found.find((f) => f.ref === ref);
      say(`Raqeeb (A1) scanned every open case across the five clients: ${found.length} new flag${found.length === 1 ? '' : 's'}. ${ref} has under 12 hours left: at risk.`,
        `رقيب (A1) فحص جميع الحالات المفتوحة لدى العملاء الخمسة؛ الحالة ${ref} متبقٍ لها أقل من 12 ساعة.`);
      await sleep(1200);
      const esc = (await pool.query(`SELECT id FROM tasama.escalations WHERE case_ref=$1`, [ref])).rows[0];
      if (esc) {
        await nudge(esc.id);
        say('Raqeeb sent the manager a reminder inside Riyadh Air\'s account. It does not decide the request; that stays with the manager.', 'أرسل رقيب تذكيراً للمدير داخل حساب طيران الرياض، ولا يتخذ القرار بنفسه.');
      }
      await sleep(1000);
      say(mine ? 'The case is now in the Tasama HR Operations Manager\'s escalations, with the time left and who holds it.' : 'The case is in the escalations list.', 'الحالة الآن ضمن تصعيدات مدير العمليات في تسامى.');
      run.next = { persona: 'tasama', ref, text: 'Switch to the Tasama HR Operations Manager and open Escalations: assign it to the Riyadh Air HR operations specialist, or open the case and decide on behalf of the manager with a reason on record.', text_ar: 'انتقل إلى مدير عمليات تسامى وافتح التصعيدات.' } as any;
      (run.next as any).screen = 'tasama-escalations';
      run.status = 'waiting';
    }
    if (key === 'month-end-invoice') {
      const cl = clientByKey('redsea')!;
      const m = monthStart(now(), -1);
      say(`Month end for ${cl.short}, ${monthLabel(m)}. Fatoora reads the payroll run: who was paid, at SAR ${cl.contract.pepm} per employee per month under the "${cl.contract.model}" contract.`, `نهاية الشهر لـ ${cl.name_ar}.`);
      await sleep(1200);
      const sla = await slaFor(cl, m);
      const missed = sla.filter((s) => s.ok === false);
      say(`Raqeeb's service-level results for the month: ${sla.filter((s) => s.ok !== null).map((s) => `${s.label} ${s.attainment}% (target ${s.target}%)`).join('; ')}.`, 'نتائج مستوى الخدمة للشهر من رقيب.');
      await sleep(1200);
      const inv = await prepareInvoice(cl, m);
      say(`Fatoora (A1) prepared ${inv.number}: ${inv.headcount} employees, base SAR ${Math.round(inv.base_fee).toLocaleString('en-US')}${missed.length ? `, service credit SAR ${Math.round(inv.credits).toLocaleString('en-US')} for ${missed.map((s) => s.label.toLowerCase()).join(', ')}` : ', no service credit due'}, VAT 15%: SAR ${Math.round(inv.total).toLocaleString('en-US')}.`,
        `أعدّت فاتورة ${inv.number} بمبلغ ${Math.round(inv.total).toLocaleString('en-US')} ريال.`);
      run.cases.push(inv.number);
      await sleep(800);
      run.next = { persona: 'tasama', ref: inv.number, text: 'Switch to the Tasama HR Operations Manager, open Finance and approve the invoice (or return it with a reason). Nothing is sent to the client until a person approves.', text_ar: 'انتقل إلى مدير عمليات تسامى وافتح المالية لاعتماد الفاتورة.' } as any;
      (run.next as any).screen = 'tasama-finance';
      run.status = 'waiting';
    }
  })().catch((e) => { run.status = 'failed'; run.error = e.message; console.error('[tasama scenario]', e); setClock(null); });
  return id;
}
