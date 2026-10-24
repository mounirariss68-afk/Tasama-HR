/**
 * The Demo Director bar, docked at the bottom of the display: the step's
 * narration, the trigger, what the server did and what changed, with
 * Back / Step / Play-Pause / Stop. Adapted from the Jahiz Demo Director.
 */
import { useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, EyeOff, Loader2, Pause, Play, Square, Zap } from 'lucide-react';
import { useLang } from '../lib/i18n';
import { AUTO_STEP_MS, useApp } from './state';
import { AGENT_NAMES, Btn, Chip, StatusChip } from './ui';
import { plain } from './decision';

const PERSONA_LABEL: Record<string, [string, string]> = {
  tasama: ['Tasama HR Operations Manager', 'مدير عمليات الموارد البشرية في تسامى'], employee: ['Employee', 'موظف'], manager: ['Line manager', 'مدير مباشر'],
  hrbp: ['HR business partner', 'شريك أعمال الموارد البشرية'], ta: ['Talent acquisition', 'استقطاب المواهب'], payroll: ['Client HR operations', 'عمليات الموارد البشرية لدى العميل'], 'tasama-hrops': ['HR operations, Tasama', 'عمليات الموارد البشرية، تسامى'], finance: ['Finance controller', 'المراقب المالي'], 'tasama-lead': ['Payroll lead, Tasama', 'قائدة الرواتب، تسامى'], 'tasama-specialist': ['Payroll specialist, Tasama', 'أخصائي الرواتب، تسامى'],
  chro: ['CHRO', 'الرئيس التنفيذي للموارد البشرية'], joiner: ['New joiner', 'موظف جديد'],
};

export function DirectorBar() {
  const { t, bi } = useLang();
  const { director: d, stepScenario, stopScenario, setAuto, openCase, session } = useApp();
  const [open, setOpen] = useState(true);
  // Firat's review (design/payroll-ops-addendum.md §1): the bar can be hidden so the page under it can be read.
  const [hidden, setHidden] = useState(false);
  if (!d) return null;
  const r = d.results[d.index];
  const st = d.steps[Math.max(0, d.index)];
  const clientName = session?.clients.find((c) => c.key === (r?.client ?? d.client));
  const atEnd = d.index >= d.steps.length - 1;
  const happened = r ? [
    ...r.changes.trail.map((x: any) => ({ key: `t${x.id}`, who: x.actor_type === 'AGENT' ? bi(...(AGENT_NAMES[x.actor_id] ?? [x.actor_name, x.actor_name])) : x.actor_name, agent: x.actor_type === 'AGENT', autonomy: x.autonomy, text: x.summary, ref: x.ref })),
    ...r.changes.tasama.map((x: any) => ({ key: `s${x.id}`, who: x.actor_type === 'AGENT' ? bi(...(AGENT_NAMES[x.actor_id] ?? [x.actor_name, x.actor_name])) : x.actor_name, agent: x.actor_type === 'AGENT', autonomy: x.autonomy, text: x.summary, ref: x.ref?.includes('-CASE-') ? x.ref : null })),
  ] : [];
  if (hidden) return (
    <div className="pointer-events-none fixed bottom-3 end-3 z-[60]" role="region" aria-label={t('Demo Director')}>
      <div className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-primary/40 bg-background/95 py-1.5 ps-3 pe-1.5 shadow-2xl backdrop-blur-xl">
        <span className="text-[11px] text-muted-foreground">{t('Step')} {d.index + 1} / {d.steps.length}</span>
        <Btn small kind="primary" onClick={() => stepScenario(1)} disabled={d.busy || atEnd}>{d.busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronRight className="h-3.5 w-3.5" />} {t('Step')}</Btn>
        <Btn small onClick={() => setHidden(false)}><ChevronUp className="h-3.5 w-3.5" /> {t('Show')}</Btn>
      </div>
    </div>
  );
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] px-3 pb-3 sm:px-6" role="region" aria-label={t('Demo Director')}>
      <div className="pointer-events-auto mx-auto max-w-[1400px] rounded-2xl border border-primary/40 bg-background/95 p-3 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex items-center gap-1.5">
            <Btn small onClick={() => stepScenario(-1)} disabled={d.busy || d.index <= 0}><ChevronLeft className="h-3.5 w-3.5" /><span className="sr-only">{t('Back')}</span></Btn>
            <Btn small kind="primary" onClick={() => stepScenario(1)} disabled={d.busy || atEnd}>{d.busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronRight className="h-3.5 w-3.5" />} {t('Step')}</Btn>
            <Btn small onClick={() => setAuto(!d.auto)} disabled={atEnd}>{d.auto ? <><Pause className="h-3.5 w-3.5" /> {t('Pause')}</> : <><Play className="h-3.5 w-3.5" /> {t('Play')}</>}</Btn>
            <Btn small onClick={stopScenario}><Square className="h-3.5 w-3.5" /> {t('Stop')}</Btn>
          </div>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span className="font-mono uppercase tracking-wider text-primary">{bi(d.title, d.title_ar)}</span>
              <span>{t('Step')} {d.index + 1} / {d.steps.length}</span>
              <Chip>{bi(...(PERSONA_LABEL[r?.persona ?? st.persona] ?? [st.persona, st.persona]))}</Chip>
              {clientName ? <Chip tone="primary">{bi(clientName.short, clientName.name_ar)}</Chip> : null}
              {d.auto ? <Chip tone="success">{t('Playing')} · {Math.round(AUTO_STEP_MS / 1000)} s {t('per step')}</Chip> : null}
              {d.status === 'done' && atEnd ? <Chip tone="success">{t('Scenario complete')}</Chip> : null}
              <button type="button" onClick={() => setOpen(!open)} className="ms-auto inline-flex items-center gap-1 hover:text-foreground">{open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}{open ? t('Less') : t('More')}</button>
              <button type="button" onClick={() => setHidden(true)} className="inline-flex items-center gap-1 hover:text-foreground"><EyeOff className="h-3.5 w-3.5" />{t('Hide')}</button>
            </p>
            <p className="mt-0.5 text-sm font-semibold">{bi(st.title, st.title_ar)}</p>
            {open ? <p className="mt-0.5 text-[13px] leading-relaxed text-foreground/90">{d.busy && !r ? t('Running the step…') : plain(r?.narration)}</p> : null}
            {open && d.status === 'done' && atEnd ? <p className="mt-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-[12.5px] leading-relaxed">{t('What you saw: the agents read, checked and prepared; a person made every decision, and a decision against an agent needs a reason. Nothing reached the client\'s HRMS before a person approved it. Every step is on the Audit trail, every system call on the Integration log.')}</p> : null}
            <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
              <Zap className="h-3 w-3 text-primary" /><span className="text-muted-foreground">{t('Trigger')}:</span> <span className="font-medium">{st.trigger}</span>
              {r && r.step.kind !== 'show' ? <><span className="text-muted-foreground">· {t('Result')}:</span> <span>{plain(r.result)}</span></> : null}
              {r?.caseRef ? <button type="button" className="text-primary underline underline-offset-2" onClick={() => openCase(r.caseRef)}>{t('Open the case')}</button> : null}
              {d.error || r?.error ? <span className="text-danger">{t('Error')}: {d.error ?? r?.error}</span> : null}
            </p>
          </div>
          {open ? (
            <div className="w-full lg:w-[400px]">
              <p className="eyebrow">{t('What happened')}</p>
              {happened.length ? (
                <ul className="mt-1 max-h-32 space-y-1 overflow-auto text-[12px]">
                  {happened.slice(0, 16).map((h) => (
                    <li key={h.key} className="leading-snug">
                      <span className={h.agent ? 'font-semibold text-primary' : 'font-semibold'}>{h.who}</span>
: {plain(h.text)}
                      {h.ref ? <button type="button" className="ms-1 text-[11px] text-primary underline underline-offset-2" onClick={() => openCase(h.ref)}>{t('open')}</button> : null}
                    </li>
                  ))}
                  {r?.changes.cases.length ? <li className="flex flex-wrap gap-1 pt-1">{r.changes.cases.slice(0, 6).map((c: any) => <button key={c.ref} type="button" onClick={() => openCase(c.ref)} className="inline-flex items-center gap-1"><span className="text-[11px] text-primary">{c.title}</span><StatusChip status={c.status} /></button>)}</li> : null}
                </ul>
              ) : <p className="mt-1 text-[12px] text-muted-foreground">{d.busy ? t('Running the step…') : r?.step.kind === 'show' ? t('Nothing ran: this step shows what is already there.') : t('Nothing changed.')}</p>}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
