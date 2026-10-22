/**
 * The Stage — how a scenario is shown in Present mode (design/stage-addendum.md;
 * canon stage 5). Ported from QIB Jahiz.
 *
 * Three panes on one screen, so the room never follows a navigation:
 *   01 the request         the channel of whoever started the work: the
 *                          employee in Rafeeq, the hiring manager's message,
 *                          the payroll calendar, Raqeeb's reminder
 *   02 the agents          the step's narration, "Your move" when the room
 *                          can act, and what the agents did, in plain words
 *   03 the system          the record as the client's HRMS (or Tasama) holds
 *                          it, fields an agent wrote flashing, and under it
 *                          one idea: the decision, the pattern, the invoice,
 *                          the letter, the service levels, the refusal
 * Above them, the journey: every step of the scenario, the current one lit.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Bot, Check, ExternalLink, Hand, MessagesSquare, Server, Zap } from 'lucide-react';
import { api } from '../lib/api';
import { useLang } from '../lib/i18n';
import { letterDocument } from '../lib/documents';
import { useApp, type DirectorResult, type StageLine, type StageRecord } from './state';
import { usePresent } from './present';
import { CaseView } from './case';
import { plain } from './decision';
import { DocumentPreview } from './document-preview';
import { AGENT_NAMES, Chip, Empty } from './ui';
import { Bullet, Columns as BarColumns, Slope, Waterfall } from './viz';

const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
const sar = (n: number) => `SAR ${Math.round(n).toLocaleString('en-US')}`;
const PERSONA: Record<string, string> = { tasama: 'Tasama HR Operations Manager', employee: 'Employee', manager: 'Line manager', hrbp: 'HR business partner', ta: 'Talent acquisition', payroll: 'HR operations', chro: 'CHRO', joiner: 'New joiner', finance: 'Finance controller', 'tasama-lead': 'Payroll lead, Tasama', 'tasama-specialist': 'Payroll specialist, Tasama' };

export function Stage() {
  const { director, stepScenario } = useApp();
  const { t } = useLang();
  const results = useMemo(() => (director ? Object.entries(director.results).map(([i, r]) => ({ i: Number(i), r })).filter((x) => x.i <= director.index).sort((a, b) => a.i - b.i) : []), [director]);
  const r = director?.results[director.index];
  // The room acts: when the next step is a decision and the case leaves the state it was in when this step was reached, the story moves on.
  const nextRef = r?.next?.kind === 'decide' ? r.next.ref : null;
  // The room acts: when the next step is a decision and its case leaves the state the server left it in at the end of this step, the story moves on.
  // Polled here (not through useApi) so a read from the previous step can never count as the room acting.
  const [nextCase, setNextCase] = useState<any>(null);
  const moved = useRef<string | null>(null);
  const stepKey = director ? `${director.run}:${director.index}` : '';
  const baseline = r?.next?.state;
  const busy = !!director?.busy;
  // Only on the newest step: stepping back to an earlier one shows it again and never moves on by itself.
  const latest = !!director && Math.max(-1, ...Object.keys(director.results).map(Number)) === director.index;
  useEffect(() => {
    setNextCase(null);
    if (!nextRef || !baseline || busy || !latest) return;
    let stop = false;
    const tick = async () => {
      try {
        const k = await api<any>(`/requests/${nextRef}`);
        if (stop) return;
        setNextCase(k);
        if (`${k.status}:${k.waiting_on_person_id ?? ''}` !== baseline && moved.current !== stepKey) { moved.current = stepKey; stepScenario(1, { hand: true }); }
      } catch { /* out of this persona's scope, or the next tick */ }
    };
    tick();
    const tm = window.setInterval(tick, 2000);
    return () => { stop = true; window.clearInterval(tm); };
  }, [nextRef, baseline, busy, latest, stepKey]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!director) return <div className="glass-l2 rounded-2xl px-4 py-3 text-sm text-muted-foreground">{t('Starting the scenario…')}</div>;
  const yourMove = !!nextCase?.canDecide && nextCase.ref === nextRef;
  return (
    <div className="space-y-3">
      <Journey />
      <div className="grid gap-3 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1fr)_minmax(0,1.3fr)]">
        <Pane n="01" title={t('The request')} sub={lastVia(results.map((x) => x.r))} icon={<MessagesSquare size={14} />}>
          <Channel results={results.map((x) => x.r)} current={director.index} />
        </Pane>
        <Pane n="02" title={t('The agents')} sub={t('what is happening, live')} icon={<Bot size={14} />}>
          <Narration yourMove={yourMove} />
          <Log results={results.map((x) => x.r)} />
        </Pane>
        <Pane n="03" title={r?.record?.system ?? t('The system')} sub={t('the record, and the person deciding')} icon={<Server size={14} />}>
          {r?.record ? <RecordCard rec={r.record} prev={director.results[director.index - 1]?.record ?? null} stepKey={`${director.run}:${director.index}`} /> : null}
          {r ? <Focus r={r} onDecided={() => { if (nextRef && moved.current !== stepKey) { moved.current = stepKey; stepScenario(1, { hand: true }); } }} /> : <p className="text-[12px] text-muted-foreground">{t('Running the step…')}</p>}
        </Pane>
      </div>
    </div>
  );
}

const lastVia = (rs: DirectorResult[]) => { for (let i = rs.length - 1; i >= 0; i--) { const l = (rs[i].chat ?? []).slice(-1)[0]; if (l) return l.via ?? l.who; } return ''; };

function Pane({ n, title, sub, icon, children }: { n: string; title: string; sub?: ReactNode; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="glass-l2 flex min-h-0 flex-col rounded-2xl">
      <header className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5"><span className="font-mono text-[11px] text-primary">{n}</span><span className="text-sm font-semibold">{title}</span><span className="flex min-w-0 items-center gap-1.5 truncate text-[11px] text-muted-foreground">{icon}{sub}</span></header>
      <div className="stage-pane-body scroll-thin space-y-3 overflow-y-auto p-3">{children}</div>
    </section>
  );
}

/** The scenario's steps across the top; the current one lit, the past ones ticked. */
function Journey() {
  const { director } = useApp();
  const { bi } = useLang();
  if (!director) return null;
  return (
    <ol className="glass-l2 scroll-thin flex items-stretch gap-1 overflow-x-auto rounded-2xl px-3 py-2">
      {director.steps.map((s, i) => {
        const state = i < director.index ? 'done' : i === director.index ? 'now' : 'next';
        return (
          <li key={s.id} title={s.trigger} className={cn('flex min-w-[130px] flex-1 items-start gap-2 rounded-xl px-2.5 py-1.5', state === 'now' && 'bg-primary/10 ring-1 ring-primary/40')}>
            <span className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border font-mono text-[10px]', state === 'done' ? 'border-success/60 bg-success/15 text-success' : state === 'now' ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground')}>{state === 'done' ? <Check className="h-3 w-3" /> : i + 1}</span>
            <span className="min-w-0"><span className={cn('block truncate text-[12px] leading-tight', state === 'now' ? 'font-semibold' : state === 'done' ? 'text-foreground/80' : 'text-muted-foreground')}>{bi(s.title, s.title_ar)}</span><span className="block truncate text-[10px] text-muted-foreground">{PERSONA[s.persona] ?? s.persona}</span></span>
          </li>
        );
      })}
    </ol>
  );
}

// ------------------------------------------------------------------ 01 the person asking
function Channel({ results, current }: { results: DirectorResult[]; current: number }) {
  const { t } = useLang();
  const end = useRef<HTMLDivElement>(null);
  const lines = results.flatMap((r) => (r.chat ?? []).map((l, j) => ({ l, key: `${r.index}-${j}`, now: r.index === current })));
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [lines.length]);
  if (!lines.length) return <Empty>{t('Nobody has asked anything yet in this scenario.')}</Empty>;
  return (
    <div className="space-y-2.5">
      {lines.map(({ l, key, now }) => <Bubble key={key} l={l} now={now} />)}
      <div ref={end} />
    </div>
  );
}

function Bubble({ l, now }: { l: StageLine; now: boolean }) {
  const name = AGENT_NAMES[l.who.toLowerCase()]?.[0] ?? l.who;
  if (l.by === 'system') return (
    <div className={cn('present-enter mx-auto max-w-[92%] rounded-lg border border-dashed border-border/80 bg-muted/40 px-3 py-2 text-center text-[12px] text-muted-foreground', now && 'flash')}>
      <span className="font-semibold text-foreground/80">{name}</span>{l.via ? <span> · {l.via}</span> : null}<span className="block" dir="auto">{l.text}</span>
    </div>
  );
  const mine = l.by === 'person';
  return (
    <div className={cn('present-enter flex gap-2', mine ? 'flex-row-reverse' : '')}>
      <span className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold', mine ? 'bg-muted text-foreground' : 'bg-primary text-primary-foreground')}>{name.slice(0, 1)}</span>
      <div className={cn('max-w-[85%] rounded-2xl px-3 py-2 text-[13px] leading-snug', mine ? 'rounded-tr-sm bg-primary/12 text-foreground' : 'rounded-tl-sm border border-border/60 bg-card', now && 'flash')}>
        <p className="mb-0.5 text-[10.5px] text-muted-foreground"><span className="font-semibold text-foreground/80">{name}</span>{l.via ? ` · ${l.via}` : ''}</p>
        <p dir="auto">{l.text}</p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ 02 the agents
function Narration({ yourMove }: { yourMove: boolean }) {
  const { director, go, stepScenario } = useApp();
  const { setView } = usePresent();
  const { t, bi } = useLang();
  if (!director) return null;
  const st = director.steps[Math.max(0, director.index)];
  const r = director.results[director.index];
  const atEnd = director.index >= director.steps.length - 1;
  return (
    <div className="rounded-xl border border-primary/30 bg-background/70 p-3">
      <p className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground"><span className="font-mono uppercase tracking-wider text-primary">{t('step')} {director.index + 1} {t('of')} {director.steps.length}</span>{st ? <Chip tone="primary">{t('as')} {t(PERSONA[st.persona] ?? st.persona)}</Chip> : null}{atEnd && !director.busy ? <Chip tone="success">{t('Scenario complete')}</Chip> : null}</p>
      <p className="mt-1 text-base font-semibold leading-tight">{st ? bi(st.title, st.title_ar) : ''}</p>
      <p dir="auto" className="mt-1 text-[13px] leading-relaxed text-foreground/90">{director.busy && !r ? t('Running the step…') : plain(r?.narration)}</p>
      {yourMove && !director.busy ? (
        <div className="mt-2 flex items-start gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-[13px]">
          <Hand className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1"><span className="font-semibold text-primary">{t('Your move.')} </span>{t('Decide in the system pane, or press → and the scenario decides as scripted.')}</span>
          <button type="button" onClick={() => stepScenario(1)} className="shrink-0 rounded-full border border-primary/50 px-2.5 py-1 text-[11px] font-medium text-primary hover:bg-primary/10">{t('Let the scenario decide')}</button>
        </div>
      ) : null}
      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]"><Zap className="h-3 w-3 text-primary" /><span className="text-muted-foreground">{t('Trigger')}</span> <span className="font-medium">{st?.trigger.replace(/\s*\(WF-\d+\)/, '')}</span>{director.busy ? <><span className="text-muted-foreground">· {t('Result')}</span> <span>{t('working…')}</span></> : r && r.step.kind !== 'show' ? <><span className="text-muted-foreground">· {t('Result')}</span> <span>{plain(r.result)}</span></> : null}{director.error || r?.error ? <span className="text-danger">{t('Error')}: {director.error ?? r?.error}</span> : null}</p>
      {atEnd && !director.busy ? <p className="mt-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-[12.5px] leading-relaxed">{t('What you saw: the agents read, checked and prepared; a person made every decision, and a decision against an agent needs a reason. Nothing reached the client\'s HRMS before a person approved it. Every step is on the Audit trail, every system call on the Integration log.')}</p> : null}
      <p className="mt-2"><button type="button" className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline" onClick={() => { setView('app'); if (r) go(r.screen, r.pattern); }}><ExternalLink className="h-3 w-3" />{t('Open this step in the app')}</button></p>
    </div>
  );
}

/** What the agents did, in plain words: one line per event, oldest first, only what this scenario did. */
function Log({ results }: { results: DirectorResult[] }) {
  const { t, bi } = useLang();
  const rows = useMemo(() => {
    const out: { key: string; at: string; who: string; kind: 'agent' | 'person' | 'system'; text: string; raw: string }[] = [];
    for (const r of results) {
      for (const x of [...r.changes.trail, ...r.changes.tasama] as any[]) {
        if (x.actor_type === 'HUMAN' && x.act === 'SUBMIT') continue; // the request itself is in pane 01
        const who = x.actor_type === 'AGENT' ? bi(...(AGENT_NAMES[x.actor_id] ?? [x.actor_name, x.actor_name])) : x.actor_type === 'SYSTEM' ? (x.actor_name === 'Tasama HR' ? x.actor_name : t('HRMS')) : String(x.actor_name ?? '').replace(/\s*\((?:decided|simulated) by the scenario\)/, '');
        const text = plain(x.summary);
        const prev = out[out.length - 1];
        if (prev && prev.who === who && prev.text === text) continue;
        out.push({ key: `${r.index}-${x.actor_type}-${x.id}`, at: r.at ?? '', who, kind: x.actor_type === 'AGENT' ? 'agent' : x.actor_type === 'HUMAN' ? 'person' : 'system', text, raw: `${x.actor_name}: ${x.act}${x.citation ? ` · ${x.citation}` : ''}` });
      }
    }
    return out;
  }, [results, bi, t]);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [rows.length]);
  const tone = { agent: 'text-primary', person: 'text-sky-600 dark:text-sky-300', system: 'text-muted-foreground' };
  return (
    <div className="rounded-xl border border-border/60 bg-card/60">
      <p className="flex items-center justify-between border-b border-border/60 px-3 py-1.5 text-[11px]"><span className="font-semibold">{t('What the agents did')}</span><span className="text-muted-foreground">{rows.length} {t(rows.length === 1 ? 'entry' : 'entries')}</span></p>
      <ol className="scroll-thin max-h-[44dvh] min-h-[140px] space-y-1.5 overflow-y-auto px-3 py-2 text-[13px] leading-snug">
        {rows.map((r) => (
          <li key={r.key} title={r.raw} className="present-enter grid grid-cols-[42px_minmax(0,1fr)] gap-x-2">
            <span className="pt-0.5 font-mono text-[10px] text-muted-foreground">{r.at}</span>
            <span className="min-w-0"><span className={cn('font-semibold', tone[r.kind])}>{r.who}:</span> <span dir="auto">{r.text}</span></span>
          </li>
        ))}
        {!rows.length ? <li className="text-muted-foreground">{t('Waiting for the first step…')}</li> : null}
        <div ref={end} />
      </ol>
    </div>
  );
}

// ------------------------------------------------------------------ 03 the system
/** The record as the system holds it: a representative screen. Fields that changed since the last step flash "agent wrote". */
function RecordCard({ rec, prev, stepKey }: { rec: StageRecord; prev: StageRecord | null; stepKey: string }) {
  const { t } = useLang();
  const [changed, setChanged] = useState<Set<string>>(new Set());
  useEffect(() => {
    // Another record (a new worker, the next pattern) is not an agent writing: only the same record's fields are compared.
    if (!prev || prev.title !== rec.title || prev.fields[0]?.[1] !== rec.fields[0]?.[1]) { setChanged(new Set()); return; }
    const before = new Map(prev.fields);
    const diff = new Set(rec.fields.filter(([k, v]) => before.has(k) && before.get(k) !== v).map(([k]) => k));
    setChanged(diff);
    if (!diff.size) return;
    const tm = window.setTimeout(() => setChanged(new Set()), 8000);
    return () => window.clearTimeout(tm);
  }, [stepKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="rounded-xl border border-border/60 bg-card/60">
      <p className="flex flex-wrap items-center gap-2 border-b border-border/60 px-3 py-1.5 text-[11px]"><Server className="h-3.5 w-3.5 text-muted-foreground" /><span className="font-semibold">{rec.system} · {t(rec.title)}</span><span className="ms-auto rounded-full border border-border/70 px-2 py-0.5 text-[10px] text-muted-foreground" title={t('The fields the real system holds, read through the connector. Not the vendor\'s own screen.')}>{t('representative screen')}</span></p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 px-3 py-2 2xl:grid-cols-3">
        {rec.fields.map(([k, v]) => (
          <div key={k} className={cn('min-w-0 rounded-md px-1.5 py-0.5', changed.has(k) && 'flash bg-primary/10')}>
            <dt className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">{t(k)}{changed.has(k) ? <span className="rounded bg-primary px-1 text-[9px] normal-case tracking-normal text-primary-foreground">{t('agent wrote')}</span> : null}</dt>
            <dd className="text-[12.5px] font-medium leading-snug [overflow-wrap:anywhere]">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Box({ label, children }: { label: string; children: ReactNode }) {
  return <div className="rounded-xl border border-border/60 bg-card/40 p-3"><p className="eyebrow mb-2">{label}</p>{children}</div>;
}

/** One idea under the record: the decision when there is one, else the one record the step is about. */
function Focus({ r, onDecided }: { r: DirectorResult; onDecided: () => void }) {
  const { t, bi } = useLang();
  const f = r.focus;
  if (!f) return null;
  if (f.kind === 'case') return <Box label={t('The decision')}><CaseView key={f.ref} caseRef={f.ref} frame="stage" onDone={onDecided} /></Box>;
  if (f.kind === 'fact') return <Box label={t('The one fact')}><p className="text-[15px] font-medium leading-snug">{plain(f.text)}</p></Box>;
  if (f.kind === 'document') return <Box label={t('The letter in the HRMS')}><div className="max-h-[52dvh] overflow-y-auto"><DocumentPreview document={letterDocument(f.doc)} /></div></Box>;
  if (f.kind === 'refusal') return (
    <Box label={t('The refusal, on the record')}>
      <p className="text-[13px] text-muted-foreground line-through decoration-danger/70">“{f.instruction}”</p>
      <p className="mt-2 text-[14px] leading-snug"><span className="font-semibold text-primary">{f.who}:</span> {plain(f.text)}</p>
      {f.citation ? <p className="mt-2 flex flex-wrap gap-1">{String(f.citation).split(/;\s*/).map((c: string) => <span key={c} className="mono-chip is-primary">{c}</span>)}</p> : null}
    </Box>
  );
  if (f.kind === 'sla') return (
    <Box label={`${t('Service levels')} · ${f.month}`}>
      <ul className="space-y-2.5">{(f.rows as any[]).map((s) => (
        <li key={s.label} className="grid grid-cols-[minmax(0,1fr)_120px_52px] items-center gap-3 text-[13px]"><span className="truncate">{bi(s.label, s.label_ar)}</span><Bullet value={s.attainment} target={s.target} label={s.label} /><span className={cn('text-end font-semibold tabular-nums', s.ok ? 'text-success' : 'text-danger')}>{s.attainment}%</span></li>
      ))}</ul>
      <p className="mt-2 text-[11px] text-muted-foreground">{t('Bar: the month\'s result. Tick: the contract\'s target.')}</p>
    </Box>
  );
  if (f.kind === 'invoice') return (
    <Box label={`${t('The invoice')} · ${f.period}`}>
      <p className="flex flex-wrap items-baseline gap-2"><span className="text-2xl font-bold tabular-nums">{sar(f.total)}</span><span className="text-[12px] text-muted-foreground">{t('with VAT')} · {f.headcount} {t('employees at')} SAR {f.pepm}</span><Chip tone={f.status === 'ISSUED' ? 'success' : 'warn'}>{t(f.status === 'PREPARED' ? 'Waiting for approval' : f.status === 'ISSUED' ? 'Issued' : String(f.status).toLowerCase())}</Chip></p>
      <div className="mt-3"><Waterfall steps={[{ label: t('Base fee'), value: f.base_fee, tone: 'chart1' }, ...(f.hire_fees ? [{ label: t('Hires'), value: f.hire_fees, tone: 'chart2' as const }] : []), ...(f.credits ? [{ label: t('Service credit'), value: -Math.abs(f.credits), tone: 'danger' as const }] : []), { label: t('VAT'), value: f.vat, tone: 'chart3' }]} totalLabel={t('Total')} format={(v) => Math.round(v).toLocaleString('en-US')} height={96} /></div>
    </Box>
  );
  if (f.kind === 'pattern') return (
    <Box label={`${t('The pattern')} · ${f.clients.join(', ')}`}>
      <p className="text-[14px] font-semibold leading-snug">{bi(f.title, f.title_ar)}</p>
      <div className="mt-2 flex flex-wrap items-end gap-6">
        <Slope from={f.baseline} to={f.current} fromLabel={t('Baseline')} toLabel={t('Last two weeks')} format={(v) => `${v} ${t('per 100')}`} />
        {f.series?.length ? <div className="min-w-[180px] flex-1"><BarColumns values={f.series.slice(-12).map((x: any) => x.rate)} height={48} markLast tone="chart2" format={(v) => `${v} ${t('per 100')}`} /></div> : null}
      </div>
      {f.cause ? <p className="mt-3 text-[13px] leading-snug"><span className="font-semibold">{t('Likely cause')}:</span> {plain(f.cause)}</p> : null}
      {f.owner ? <p className="mt-1.5 text-[13px] leading-snug"><span className="font-semibold">{t('Owner')}:</span> {f.owner}{f.action ? ` · ${plain(f.action)}` : ''}</p> : <p className="mt-1.5 text-[12px] text-muted-foreground">{t('No owner yet.')}</p>}
    </Box>
  );
  return null;
}
