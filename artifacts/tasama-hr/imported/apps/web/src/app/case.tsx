/**
 * The case reader, used by every inbox and the case drawer.
 *
 * A decision card (meta line, headline, up to four facts, one recommendation
 * line), the one or two actions, and one collapsed disclosure, "How this was
 * checked", holding the evidence, the steps, the trail, the rules cited and the
 * HRMS calls. Nothing from the disclosure is visible without a click.
 */
import { useEffect, useState } from 'react';
import { AgentAvatar, DecisionBar, DecisionTrail, InboxItem, InboxReader, ReaderSection, TrailEntry, type TrailKind } from '@cognirise/atelier/archetypes';
import { Sheet, SheetContent, SheetTitle } from '@cognirise/atelier/components/ui/sheet';
import { AlertTriangle, CheckCircle2, CircleDashed, Clock, Loader2, Server, XCircle } from 'lucide-react';
import { bump, post, useApi } from '../lib/api';
import { useLang } from '../lib/i18n';
import { aed, ago, date, dateTime, until } from '../lib/format';
import { useApp } from './state';
import { AGENT_NAMES, AgentTag, Btn, Chip, Empty, Kv, Person, StatusChip, Table } from './ui';
import { DocumentPreview } from './document-preview';
import { DocumentDownload } from './document-download';
import { letterDocument } from '../lib/documents';
import { caseCard, plain, Provenance, recommender, rowParts, splitRec, type Fact } from './decision';
import { initials } from '../lib/format';
import { ClockBar } from './viz';

export const KIND: Record<string, TrailKind> = {
  READ: 'observed', CHECK: 'observed', RECOMMEND: 'proposed', PREPARE: 'proposed', WRITE: 'acted', NOTIFY: 'acted', ANSWER: 'acted',
  APPROVE: 'approved', SUBMIT: 'approved', REJECT: 'rejected', REFUSE: 'rejected', RETURN: 'rejected', REMIND: 'acted', DECIDE: 'approved', OVERRIDE: 'overridden', ESCALATE: 'escalated',
};

export function TrailList({ rows, compact }: { rows: any[]; compact?: boolean }) {
  const { lang, bi, t } = useLang();
  if (!rows.length) return <Empty>{t('No activity yet.')}</Empty>;
  return (
    <DecisionTrail>
      {rows.map((e) => (
        <TrailEntry key={e.id} kind={KIND[e.act] ?? 'observed'}
          actor={e.actor_type === 'AGENT' ? <AgentTag id={e.actor_id} showChip={false} /> : <span className="text-sm font-medium">{e.actor_name}</span>}
          autonomy={e.autonomy ? <Chip>{e.autonomy}</Chip> : null}
          at={compact ? ago(e.at, lang) : dateTime(e.at, lang)}
          summary={bi(e.summary, e.summary_ar)}
          detail={e.citation ? <span className="font-mono text-[11px]">{t('Cites')} {e.citation}{e.ref && compact ? ` · ${e.ref}` : ''}</span> : e.ref && compact ? <span className="font-mono text-[11px]">{e.ref}</span> : undefined}
          override={e.act === 'OVERRIDE' ? { from: t('Agent recommendation'), to: t('Human decision'), reason: e.override_reason } : undefined} />
      ))}
    </DecisionTrail>
  );
}

function StepIcon({ s }: { s: string }) {
  if (s === 'DONE') return <CheckCircle2 className="h-4 w-4 text-success" />;
  if (s === 'WAITING') return <Clock className="h-4 w-4 text-warn" />;
  if (s === 'REFUSED' || s === 'FAILED') return <XCircle className="h-4 w-4 text-danger" />;
  if (s === 'RUNNING') return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
  return <CircleDashed className="h-4 w-4 text-muted-foreground" />;
}

const ROLE: Record<string, [string, string]> = { LINE_MANAGER: ['Line manager', 'المدير المباشر'], HRBP: ['HR business partner', 'شريك أعمال الموارد البشرية'], TA: ['Talent acquisition', 'استقطاب المواهب'], PAYROLL: ['HR operations', 'عمليات الموارد البشرية'], TASAMA_PAYROLL: ['Tasama payroll', 'رواتب تسامى'], TASAMA_PAYROLL_LEAD: ['Tasama payroll lead', 'قائدة الرواتب في تسامى'], CHRO: ['CHRO', 'الرئيس التنفيذي لرأس المال البشري'], EMPLOYEE: ['Employee', 'الموظف'] };
export const roleName = (r: string | null, bi: (a: string, b: string) => string) => (r && ROLE[r] ? bi(ROLE[r][0], ROLE[r][1]) : r ?? '');

function Steps({ steps }: { steps: any[] }) {
  const { bi, t } = useLang();
  return (
    <ol className="space-y-1.5">
      {steps.map((s) => (
        <li key={s.id} className="flex items-start gap-3 rounded-lg px-2 py-1.5">
          <span className="mt-0.5"><StepIcon s={s.status} /></span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{bi(s.label, s.label_ar)}</span>
              {s.actor_type === 'AGENT' ? <AgentTag id={s.actor_id} showChip={false} /> : s.actor_type === 'HUMAN' ? <Chip>{roleName(s.actor_id, bi)}</Chip> : <Chip tone="primary">{t('Connector')}</Chip>}
              <StatusChip status={s.status} />
            </div>
            {s.decision ? <p className="mt-0.5 text-xs text-muted-foreground">{s.decision}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** What each workflow shows as its evidence. Read-only. */
function Details({ c }: { c: any }) {
  const { t, lang, bi } = useLang();
  const p = c.payload ?? {}, r = c.result ?? {};
  const out = (key: string) => c.steps.find((s: any) => s.step_key === key)?.outputs ?? {};
  switch (c.workflow_id) {
    case 'WF-14': return p.body ? <ReaderSection label={t('Letter')}><DocumentPreview document={letterDocument({
      ...p, type: p.letter_type, document_number: r.document_number ?? p.document_number ?? c.ref,
      status: r.document_number ? 'ISSUED' : 'DRAFT',
    })} /></ReaderSection> : null;
    case 'WF-15': {
      const o = out('validate');
      return (
        <ReaderSection label={t('Leave check')}>
          <dl className="grid grid-cols-3 gap-3"><Kv k={t('Dates')} v={`${date(p.start, lang)} – ${date(p.end, lang)}`} /><Kv k={t('Days')} v={p.days} /><Kv k={t('Balance before')} v={o.balance ?? '—'} /></dl>
          {(o.issues ?? []).map((x: string) => <p key={x} className="mt-2 flex gap-2 text-sm text-danger"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{x}</p>)}
          {(o.notes ?? []).map((x: string) => <p key={x} className="mt-2 text-sm text-muted-foreground">{x}</p>)}
        </ReaderSection>
      );
    }
    case 'WF-16': {
      const e = out('eligibility'), rc = out('recovery');
      return (
        <ReaderSection label={t('Advance check')}>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Kv k={t('Requested')} v={aed(p.amount, lang)} /><Kv k={t('Policy limit')} v={aed(e.max, lang)} /><Kv k={t('Recovery')} v={rc.monthly ? `${aed(rc.monthly, lang)} × ${rc.months}` : '—'} /><Kv k={t('Deductions after')} v={rc.deductionShare ? `${Math.round(rc.deductionShare * 100)}%` : '—'} /></dl>
          {(e.problems ?? []).length ? <ul className="mt-3 space-y-1 text-sm text-danger">{e.problems.map((x: string) => <li key={x}>• {x}</li>)}</ul> : null}
          {p.reason ? <p className="mt-2 text-sm text-muted-foreground">{t('Reason')}: {p.reason}</p> : null}
        </ReaderSection>
      );
    }
    case 'WF-01': {
      const o = out('check');
      return o.department ? (
        <ReaderSection label={t('Position check')}>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Kv k={t('Department')} v={o.department} /><Kv k={t('Filled')} v={`${o.filled} / ${o.positions}`} /><Kv k={t('Grade range')} v={`${o.grade} · ${aed(o.grade_range?.[0], lang)}–${aed(o.grade_range?.[1], lang)}`} /><Kv k={t('Annual cost at midpoint')} v={aed(o.annual_cost_mid, lang)} /></dl>
          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4"><Kv k={t('Saudization today')} v={`${o.saudization?.current}%${o.saudization?.band ? ` · ${o.saudization.band}` : ''}`} /><Kv k={t('With a Saudi hire')} v={`${o.saudization?.ifSaudi}%`} /><Kv k={t('With a non-Saudi hire')} v={`${o.saudization?.ifNot}%`} /><Kv k={t('Nitaqat target')} v={`${o.saudization?.target}%`} /></dl>
          <dl className="mt-3 grid grid-cols-3 gap-3"><Kv k={t('Budget')} v={o.budgeted ? t('Budgeted') : t('Unbudgeted')} /></dl>
          <p className="mt-3 text-xs text-muted-foreground">{t('Draft job description')}</p>
          <p dir="auto" className="mt-1 text-sm">{bi(p.jd_en, p.jd_ar)}</p>
          {p.reason ? <p className="mt-2 text-sm text-muted-foreground">{t('Reason')}: {p.reason}</p> : null}
        </ReaderSection>
      ) : null;
    }
    case 'WF-02': return (
      <ReaderSection label={t('Requisition draft')}>
        <ul className="space-y-1 text-sm">{(p.criteria ?? []).map((cr: any) => <li key={cr.key}><Chip tone={cr.kind === 'must' ? 'primary' : undefined}>{cr.kind === 'must' ? t('Must') : t('Nice')}</Chip> {cr.label}</li>)}</ul>
        {p.ad ? <p dir="auto" className="mt-3 text-sm">{bi(p.ad.en, p.ad.ar)}</p> : null}
        {(p.internal ?? []).length ? <p className="mt-3 text-sm"><span className="text-muted-foreground">{t('Internal matches')}:</span> {p.internal.map((m: any) => `${m.display_name} (${m.grade})`).join(', ')}</p> : null}
      </ReaderSection>
    );
    case 'WF-05': {
      const o = out('propose');
      return o.basic ? (
        <ReaderSection label={t('Offer proposal')}>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Kv k={t('Basic')} v={aed(o.basic, lang)} /><Kv k={t('Grade range')} v={`${aed(o.range?.[0], lang)} – ${aed(o.range?.[2], lang)}`} /><Kv k={t('Compa-ratio')} v={o.compa} /><Kv k={t('Peer median')} v={`${aed(o.median, lang)} (${o.peers})`} /></dl>
          <p className="mt-2 text-sm text-muted-foreground">{t('Package')}: {aed(p.basic, lang)} + {t('housing')} {aed(p.housing, lang)} + {t('transport')} {aed(p.transport, lang)} + {t('other')} {aed(p.other_allowance, lang)} · {t('Start')} {date(p.start_date, lang)}</p>
          {p.offer_letter ? <DocumentPreview document={{ title: lang === 'ar' ? 'عرض توظيف' : 'Offer of employment', reference: r.offer_number ?? c.ref, body: p.offer_letter, language: 'en', status: r.offer_number ? 'ISSUED' : 'DRAFT' }} /> : null}
        </ReaderSection>
      ) : null;
    }
    case 'WF-08': {
      const o = out('evidence');
      return o.goals !== undefined ? (
        <ReaderSection label={t('Probation evidence')}>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Kv k={t('Probation ends')} v={date(p.probation_end, lang)} /><Kv k={t('Goals progress')} v={`${o.goals}%`} /><Kv k={t('Check-ins')} v={`${o.checkins}${o.concern ? ` · ${t('one concern')}` : ''}`} /><Kv k={t('Mandatory learning')} v={`${o.learning?.done}/${o.learning?.total}`} /></dl>
        </ReaderSection>
      ) : null;
    }
    case 'WF-12': {
      const k = r.case;
      return k ? (
        <ReaderSection label={t('Promotion case')}>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Kv k={t('From')} v={`${k.from.grade} · ${aed(k.from.basic, lang)}`} /><Kv k={t('To')} v={`${k.to.grade} · ${aed(k.proposed, lang)}`} /><Kv k={t('Increase')} v={`+${k.increasePct}%`} /><Kv k={t('Compa-ratio')} v={k.compaRatio} /></dl>
          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4"><Kv k={t('Months in grade')} v={k.monthsInGrade} /><Kv k={t('Ratings')} v={k.ratings.slice(0, 3).map((x: any) => x.rating).join(' · ')} /><Kv k={t('Peer median')} v={`${aed(k.peerMedian, lang)} (${k.peers})`} /><Kv k={t('Approver')} v={k.approver} /></dl>
          {k.equity ? <p className="mt-3 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm">{t('Pay equity')}: {k.equity.below}% {t('below the peer median. Suggested')} {aed(k.equity.suggest, lang)}.</p> : null}
        </ReaderSection>
      ) : null;
    }
    case 'WF-19': case 'WF-20': {
      const st = r.settlement, chk = r.check;
      return (
        <>
          {chk ? (
            <ReaderSection label={t('Case file check')}>
              <ul className="space-y-2">{chk.checks.map((x: any) => (
                <li key={x.key} className="flex gap-2 text-sm">{x.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />}<span><span className="font-medium">{bi(x.label, x.label_ar)}</span><span className="block text-muted-foreground">{x.detail} · <span className="font-mono text-[11px]">{x.rule}</span></span></span></li>
              ))}</ul>
            </ReaderSection>
          ) : null}
          {st ? (
            <ReaderSection label={t('Final settlement')}>
              <Table><tbody>{st.lines.map((l: any) => <tr key={l.code}><td>{bi(l.label, l.label_ar)}<span className="block font-mono text-[11px] text-muted-foreground">{l.rule}</span></td><td className="text-end tabular-nums">{aed(l.amount, lang)}</td></tr>)}
                <tr><td className="font-semibold">{t('Total')} · {t('Pay by')} {date(st.payBy, lang)}{st.deadlineDays ? ` (${t('Art. 88')}: ${st.deadlineDays} ${t('days')})` : ''}</td><td className="text-end font-semibold tabular-nums">{aed(st.total, lang)}</td></tr></tbody></Table>
              {st.note ? <p className="mt-2 text-sm text-muted-foreground">{st.note}</p> : null}
              <p className="mt-2 text-sm text-muted-foreground">{t('Last working day')}: {date(st.lastDay, lang)} · {st.years} {t('years of service')} · {t(st.kind === 'RESIGNATION' ? 'Resignation' : 'Ended by the employer')}</p>
              {st.visa ? <p className="mt-1 text-sm text-muted-foreground">{st.visa}</p> : null}
            </ReaderSection>
          ) : p.last_day ? <ReaderSection label={t('Notice')}><p className="text-sm">{t('Last working day')}: {date(p.last_day, lang)} ({p.notice_days} {t('days notice')})</p></ReaderSection> : null}
        </>
      );
    }
    case 'WF-10': {
      const cal = r.calibration;
      return cal ? (
        <ReaderSection label={t('Calibration check')}>
          <div className="flex items-end gap-2">{cal.distribution.map((d: any) => <div key={d.rating} className="flex-1 text-center"><div className="mx-auto w-full rounded-t bg-primary/70" style={{ height: `${Math.max(4, d.count / Math.max(1, cal.n) * 160)}px` }} /><p className="mt-1 font-mono text-xs">{d.rating}</p><p className="text-[11px] text-muted-foreground">{d.count}</p></div>)}</div>
          <ul className="mt-3 space-y-1.5">{cal.flags.map((f: any, i: number) => <li key={i} className="flex gap-2 text-sm"><StatusChip status={f.severity} /><span>{bi(f.text, f.text_ar)}</span></li>)}</ul>
        </ReaderSection>
      ) : null;
    }
    case 'WF-13': return null; // the decision editor shows the findings
    case 'WF-03': return out('evidence').refused ? <ReaderSection label={t('Refused instruction')}><p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm">"{out('evidence').refused}"</p></ReaderSection> : null;
    default: return null;
  }
}

/** Workflow-specific decision inputs. Return edits to send with the decision. */
function useEditor(c: any) {
  const [edits, setEdits] = useState<Record<string, any>>({});
  useEffect(() => {
    if (c?.workflow_id === 'WF-13' && c.result?.precheck) setEdits({ apply_fixes: c.result.precheck.findings.filter((f: any) => ['BLOCKER', 'HIGH', 'MEDIUM'].includes(f.severity)).map((f: any) => f.id), accepted: {} });
    else if (c?.workflow_id === 'WF-16' && c.payload?.exception) setEdits({ approved_amount: Math.min(c.payload.amount, c.payload.max_amount ?? c.payload.amount), approved_months: c.payload.recovery_months ?? c.payload.months });
    else if (c?.workflow_id === 'WF-12' && c.result?.case) setEdits({ approved_basic: c.result.case.equity?.suggest ?? c.result.case.proposed });
    else if (c?.workflow_id === 'WF-26' && c.current_step === 'review' && c.result?.reading) setEdits({ readings: Object.fromEntries(c.result.reading.flagged.filter((f: any) => f.flag === 'UNCLEAR' && f.recommended).map((f: any) => [f.key, f.recommended.code])) });
    else if (c?.workflow_id === 'WF-27' && c.type === 'MONTH') setEdits({ values: {}, drop: [] });
    else if (c?.workflow_id === 'WF-28' && c.current_step === 'send') setEdits({ start_date_new: c.payload?.start_date });
    else if (c?.workflow_id === 'WF-36') setEdits(c.payload?.kind === 'OVERTIME_HELD' ? { pay_held: true } : c.payload?.kind === 'PAYMENT_RETURNED' ? { new_iban: '' } : { registered_on: '' });
    else setEdits({});
  }, [c?.ref, c?.status]);
  return [edits, setEdits] as const;
}

function Editor({ c, edits, setEdits }: { c: any; edits: any; setEdits: (e: any) => void }) {
  const { t, lang, bi } = useLang();
  const shortlist = useApi(c.workflow_id === 'WF-03' && c.current_step === 'shortlist' ? `/hiring/requisitions/${c.payload.requisition_id}` : null);
  const month = useApi<any>(c.workflow_id === 'WF-27' && c.type === 'MONTH' && c.current_step === 'confirm' ? '/payroll/this-month' : null);
  const att = useApi<any>(c.workflow_id === 'WF-29' && c.current_step === 'confirm' && c.client ? `/payroll/attendance/${c.client}` : null);
  if (c.workflow_id === 'WF-27' && c.type === 'MONTH' && c.current_step === 'confirm' && month.data?.rows) {
    // HR operations sends what only the client knows: each expected line, with Wared's suggestion to keep or change.
    const exp = month.data.rows.filter((r: any) => r.state === 'EXPECTED' && r.request_id === c.id);
    const ot = exp.filter((r: any) => r.kind === 'OT_HOURS');
    const other = exp.filter((r: any) => r.kind !== 'OT_HOURS');
    const set = (id: number, v: number) => setEdits({ ...edits, values: { ...(edits.values ?? {}), [id]: v } });
    const drop = (id: number, on: boolean) => setEdits({ ...edits, drop: on ? [...(edits.drop ?? []), id] : (edits.drop ?? []).filter((x: number) => x !== id) });
    return (
      <ReaderSection label={`${t('Only you can send these')} · ${exp.length}`}>
        <div className="space-y-2">{ot.map((r: any) => {
          const dropped = (edits.drop ?? []).includes(r.id);
          return (
            <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 px-3 py-2">
              <span className="min-w-[12rem] flex-1 text-sm"><span className="font-medium">{bi(r.name, r.name_ar)}</span><span className="block text-xs text-muted-foreground">{t('Overtime hours this month')} · {r.note}</span></span>
              <label className="flex items-center gap-2 text-sm"><input type="number" min={0} max={100} disabled={dropped} className="input h-9 w-20 text-end text-sm" value={edits.values?.[r.id] ?? r.suggested ?? 0} onChange={(e) => set(r.id, Number(e.target.value))} />{t('hours')}</label>
              <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={dropped} onChange={(e) => drop(r.id, e.target.checked)} />{t('None this month')}</label>
            </div>);
        })}
        {other.map((r: any) => <p key={r.id} className="text-sm text-muted-foreground">{r.label}: {t('confirmed in its own case')}</p>)}</div>
      </ReaderSection>
    );
  }
  if (c.workflow_id === 'WF-28' && c.current_step === 'send' && c.payload?.body) {
    return (
      <ReaderSection label={t('The contract')}>
        <DocumentPreview document={{ title: lang === 'ar' ? 'عقد عمل' : 'Employment contract', reference: c.payload.contract_number, body: c.payload.body, language: 'en', status: 'DRAFT' }} />
        <label className="mt-3 block text-sm"><span className="text-muted-foreground">{t('Start date')}</span>
          <input type="date" className="input mt-1 h-10 w-56 text-sm" value={edits.start_date_new ?? c.payload.start_date} onChange={(e) => setEdits({ ...edits, start_date_new: e.target.value })} /></label>
      </ReaderSection>
    );
  }
  if (c.workflow_id === 'WF-36' && c.current_step === 'answer') {
    if (c.payload?.kind === 'PAYMENT_RETURNED') return (
      <ReaderSection label={t('Your answer')}>
        <label className="block text-sm">
          <span className="text-muted-foreground">{t('The employee’s new IBAN')}</span>
          <input dir="ltr" className="input mt-1 h-10 w-full max-w-sm font-mono text-sm" placeholder="SA00 0000 0000 0000 0000 0000" value={edits.new_iban ?? ''} onChange={(e) => setEdits({ ...edits, new_iban: e.target.value })} />
        </label>
        <p className="mt-2 text-xs text-muted-foreground">{t('Tahweel checks the check digits and the bank before the follow-up file is built.')}</p>
      </ReaderSection>
    );
    return c.payload?.kind === 'GOSI_REGISTRATION' ? (
      <ReaderSection label={t('Your answer')}>
        <label className="block text-sm">
          <span className="text-muted-foreground">{t('Date registered with GOSI')}</span>
          <input type="date" className="input mt-1 h-10 w-56 text-sm" value={edits.registered_on ?? ''} onChange={(e) => setEdits({ ...edits, registered_on: e.target.value })} />
        </label>
        <p className="mt-2 text-xs text-muted-foreground">{t('If the person was registered by an earlier employer, that first registration still decides the contribution rate.')}</p>
      </ReaderSection>
    ) : (
      <ReaderSection label={t('Your answer')}>
        <div className="space-y-2 text-sm">
          <label className="flex items-center gap-2"><input type="radio" checked={edits.pay_held === true} onChange={() => setEdits({ ...edits, pay_held: true })} />{t('Pay the held hours this month')}</label>
          <label className="flex items-center gap-2"><input type="radio" checked={edits.pay_held === false} onChange={() => setEdits({ ...edits, pay_held: false })} />{t('Do not pay them')}</label>
        </div>
      </ReaderSection>
    );
  }
  if (c.workflow_id === 'WF-29' && c.current_step === 'confirm' && att.data?.people) {
    // HR operations sees every person a deduction would reach, with their days and explanation, and can change any of them.
    const rows = att.data.people.filter((p: any) => p.fine_before > 0 || p.unpaid_days > 0 || p.explained.length);
    const has = (k: string, v: any) => (edits[k] ?? []).includes(v);
    const flip = (k: string, v: any) => setEdits({ ...edits, [k]: has(k, v) ? edits[k].filter((x: any) => x !== v) : [...(edits[k] ?? []), v] });
    const days = (p: any, s2: string) => p.strip.filter((x: any) => x.s === s2).map((x: any) => `${Number(x.day.slice(8))}${s2 === 'LATE' ? ` (${x.m}′)` : ''}`).join(', ');
    return (
      <ReaderSection label={`${t('Who is deducted')} · ${rows.length}`}>
        <p className="mb-3 text-sm text-muted-foreground">{t('Each line goes into this month\'s payroll as shown unless you change it here.')}</p>
        <div className="space-y-2">{rows.map((p: any) => {
          const waived = has('waive', p.person_id), excusedAbs = has('excuse_absence', p.person_id);
          return (
            <div key={p.person_id} className="rounded-lg border border-border/60 bg-card/50 p-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p><span className="font-semibold">{bi(p.name, p.name_ar)}</span> <span className="text-muted-foreground">· {p.dept}</span></p>
                <p className="font-mono text-xs">{t('Deducted')}: {aed((waived ? 0 : p.fine) + (excusedAbs ? 0 : p.unpaid_days * p.daily), lang)}</p>
              </div>
              {p.lates ? <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2"><span className={waived ? 'text-muted-foreground line-through' : ''}>{p.lates} {t(p.lates === 1 ? 'late arrival' : 'late arrivals')}: {t('days')} {days(p, 'LATE')} · {p.fine ? `${t('fine')} ${aed(p.fine, lang)}${p.fine_before > p.cap ? ` (${t('capped at five days\' wage')})` : ''}` : t('written warnings only')}</span>
                {p.fine ? <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={waived} onChange={() => flip('waive', p.person_id)} />{t('Waive the fine')}</label> : null}</div> : null}
              {p.absences ? <div className="mt-1 flex flex-wrap items-center justify-between gap-2"><span className={excusedAbs ? 'text-muted-foreground line-through' : ''}>{t('Absent without leave')}: {t('day')} {days(p, 'ABSENT')} · {t('unpaid')} {aed(p.unpaid_days * p.daily, lang)}</span>
                <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={excusedAbs} onChange={() => flip('excuse_absence', p.person_id)} />{t('Excuse the absence')}</label></div> : null}
              {p.explained.map((x: any) => (
                <div key={x.day} className="mt-2 rounded-md bg-muted/50 p-2">
                  <p className="text-xs text-muted-foreground">{t('Explanation for')} {date(x.day, lang)}</p>
                  <p>“{x.text}”</p>
                  <label className="mt-1 flex items-center gap-1.5 text-xs"><input type="checkbox" checked={!has('reject', `${p.person_id}:${x.day}`)} onChange={() => flip('reject', `${p.person_id}:${x.day}`)} />{t('Accept the explanation: no fine for this day')}</label>
                </div>))}
            </div>
          );
        })}</div>
      </ReaderSection>
    );
  }
  if (c.workflow_id === 'WF-13' && c.result?.precheck) {
    const pc = c.result.precheck;
    const toggle = (id: string) => setEdits({ ...edits, apply_fixes: edits.apply_fixes?.includes(id) ? edits.apply_fixes.filter((x: string) => x !== id) : [...(edits.apply_fixes ?? []), id] });
    return (
      <ReaderSection label={t('Findings')}>
        <p className="mb-3 text-sm text-muted-foreground">{t('Tick to apply the fix; untick and give a reason to accept it as it is.')}</p>
        <div className="space-y-2">
          {pc.findings.map((f: any) => {
            const on = edits.apply_fixes?.includes(f.id);
            return (
              <div key={f.id} className="rounded-lg border border-border/60 bg-card/50 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip status={f.severity} /><span className="text-sm font-semibold">{bi(f.title, f.title_ar)}</span><span className="text-sm text-muted-foreground">{bi(f.name, f.name_ar)}</span>
                  <span className="ms-auto font-mono text-xs tabular-nums">{aed(f.amount, lang)}</span>
                </div>
                <p className="mt-1 text-sm">{plain(f.detail)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t('Fix')}: {plain(f.fix)}</p>
                {f.severity !== 'INFO' ? (
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!on} onChange={() => toggle(f.id)} /> {t('Apply the fix')}</label>
                    {!on ? <input className="input h-8 flex-1 text-sm" placeholder={t('Reason for accepting as is')} value={edits.accepted?.[f.id] ?? ''} onChange={(e) => setEdits({ ...edits, accepted: { ...(edits.accepted ?? {}), [f.id]: e.target.value } })} /> : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </ReaderSection>
    );
  }
  if (c.workflow_id === 'WF-26' && c.current_step === 'review' && c.result?.reading) {
    const unclear = c.result.reading.flagged.filter((f: any) => f.flag === 'UNCLEAR' && f.readings);
    if (!unclear.length) return null;
    return (
      <ReaderSection label={t('How to read it')}>
        {unclear.map((f: any) => (
          <div key={f.key} className="space-y-2">
            <p className="text-sm font-medium">{bi(f.label, f.label_ar)}</p>
            {f.readings.map((o: any) => (
              <label key={o.code} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm ${edits.readings?.[f.key] === o.code ? 'border-primary bg-primary/5' : 'border-border/60'}`}>
                <input type="radio" className="mt-0.5" name={f.key} checked={edits.readings?.[f.key] === o.code} onChange={() => setEdits({ ...edits, readings: { ...(edits.readings ?? {}), [f.key]: o.code } })} />
                <span>{bi(o.label, o.label_ar)}{f.recommended?.code === o.code ? <span className="ms-2 text-xs text-muted-foreground">{t('recommended')}</span> : null}</span>
              </label>
            ))}
          </div>
        ))}
      </ReaderSection>
    );
  }
  if (c.workflow_id === 'WF-16' && c.payload?.exception) return (
    <ReaderSection label={t('Your decision on the exception')}>
      <div className="grid grid-cols-2 gap-3">
        <label className="field"><span>{t('Approved amount (SAR)')}</span><input className="input" type="number" value={edits.approved_amount ?? ''} onChange={(e) => setEdits({ ...edits, approved_amount: Number(e.target.value) })} /></label>
        <label className="field"><span>{t('Recovery months')}</span><input className="input" type="number" min={1} max={24} value={edits.approved_months ?? ''} onChange={(e) => setEdits({ ...edits, approved_months: Number(e.target.value) })} /></label>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{t('Pre-filled with the most the policy allows.')}</p>
    </ReaderSection>
  );
  if (c.workflow_id === 'WF-12' && c.result?.case) return (
    <ReaderSection label={t('Approved salary')}>
      <label className="field max-w-xs"><span>{t('New basic salary (SAR)')}</span><input className="input" type="number" value={edits.approved_basic ?? ''} onChange={(e) => setEdits({ ...edits, approved_basic: Number(e.target.value) })} /></label>
    </ReaderSection>
  );
  if (c.workflow_id === 'WF-10' && c.result?.calibration) {
    const changes = edits.changes ?? [];
    const flagged = (c.result.calibration.flags ?? []).filter((f: any) => f.person_id);
    return (
      <ReaderSection label={t('Panel changes')}>
        <p className="mb-2 text-sm text-muted-foreground">{t('Ratings stand as the managers gave them unless you change one here, with a reason.')}</p>
        {flagged.map((f: any) => {
          const ch = changes.find((x: any) => x.person_id === f.person_id);
          return (
            <div key={f.person_id} className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-border/60 p-2">
              <span className="min-w-0 flex-1 text-sm">{bi(f.text, f.text_ar)}</span>
              <select className="input h-8 w-24" value={ch?.rating ?? ''} onChange={(e) => { const rest = changes.filter((x: any) => x.person_id !== f.person_id); setEdits({ ...edits, changes: e.target.value ? [...rest, { person_id: f.person_id, rating: Number(e.target.value), reason: ch?.reason ?? '', name: f.text.split(' rated')[0], from: Number(/rated (\d)/.exec(f.text)?.[1]) }] : rest }); }}>
                <option value="">{t('Keep')}</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              {ch ? <input className="input h-8 flex-1 text-sm" placeholder={t('Reason')} value={ch.reason} onChange={(e) => setEdits({ ...edits, changes: changes.map((x: any) => (x.person_id === f.person_id ? { ...x, reason: e.target.value } : x)) })} /> : null}
            </div>
          );
        })}
      </ReaderSection>
    );
  }
  if (c.workflow_id === 'WF-03' && c.current_step === 'shortlist' && shortlist.data) {
    const apps = shortlist.data.applications.filter((a: any) => a.phase === 'SCREENING');
    const sel: number[] = edits.shortlist ?? apps.filter((a: any) => a.evidence.filter((e: any) => e.kind === 'must').every((e: any) => e.status === 'evident')).map((a: any) => a.id);
    return (
      <ReaderSection label={`${t('Evidence against the stated criteria')} · ${apps.length}`}>
        <Table><thead><tr><th></th><th>{t('Candidate')}</th>{(shortlist.data.requisition.criteria ?? []).map((cr: any) => <th key={cr.key}>{cr.label}</th>)}<th>{t('Source')}</th></tr></thead>
          <tbody>{apps.map((a: any) => (
            <tr key={a.id}>
              <td><input type="checkbox" checked={sel.includes(a.id)} onChange={() => setEdits({ ...edits, shortlist: sel.includes(a.id) ? sel.filter((x) => x !== a.id) : [...sel, a.id] })} /></td>
              <td className="whitespace-nowrap">{a.first_name} {a.last_name}</td>
              {a.evidence.map((e: any) => <td key={e.key} title={e.note}><span className={e.status === 'evident' ? 'text-success' : e.status === 'partial' ? 'text-warn' : 'text-muted-foreground'}>{e.status === 'evident' ? '●' : e.status === 'partial' ? '◐' : '○'}</span> <span className="text-xs text-muted-foreground">{e.note}</span></td>)}
              <td className="text-xs">{a.source}</td>
            </tr>
          ))}</tbody></Table>
      </ReaderSection>
    );
  }
  return null;
}

const REJECT_REASONS: [string, string, string][] = [
  ['OUTSIDE_POLICY', 'Outside policy', 'خارج السياسة'], ['TEAM_COVER', 'Team cover', 'تغطية الفريق'],
  ['DOCUMENT_MISSING', 'Supporting document missing', 'المستند الداعم غير مرفق'], ['DUPLICATE', 'Duplicate request', 'طلب مكرر'],
];

/** Rules the agents cited on this case, from the trail. */
function RulesCited({ trail }: { trail: any[] }) {
  const { t } = useLang();
  const { go, openCase } = useApp();
  const ids = [...new Set(trail.flatMap((e) => String(e.citation ?? '').split(/;\s*/)).map((x) => x.trim()).filter(Boolean))];
  if (!ids.length) return null;
  return <ReaderSection label={t('Rules cited')}><div className="flex flex-wrap gap-1.5">{ids.map((id) => <button key={id} type="button" className="mono-chip is-primary" onClick={() => { const m = /HR-\d+\s*§[\d.]+/.exec(id); if (m) { openCase(null); go('policies', m[0].replace(/\s+/g, ' ')); } }}>{id}</button>)}</div></ReaderSection>;
}

/** The facts, each once: a tiled grid so values never wrap into a column of words. */
export function FactGrid({ facts }: { facts: Fact[] }) {
  if (!facts.length) return null;
  const twoCols = facts.length > 1 && !(facts.length === 3 && !facts.some((f) => f.viz || f.wide));
  const cols = facts.length === 1 ? 'grid-cols-1' : twoCols ? 'grid-cols-2' : 'grid-cols-3';
  const narrow = facts.filter((f) => !f.wide);
  const lastNarrow = narrow.length % 2 === 1 ? narrow[narrow.length - 1] : null;
  return (
    <dl className={`grid gap-px overflow-hidden rounded-xl border border-border/60 bg-border/60 ${cols}`}>
      {facts.map((f) => (
        <div key={f.k} className={`min-w-0 bg-card px-4 py-3 ${twoCols && (f.wide || f === lastNarrow) ? 'col-span-2' : ''}`}>
          <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">{f.k}{f.tone === 'danger' ? <AlertTriangle className="h-3.5 w-3.5 text-danger" /> : f.tone === 'warn' ? <AlertTriangle className="h-3.5 w-3.5 text-warn" /> : null}</dt>
          <dd className="mt-1 break-words text-sm font-semibold leading-snug">{f.v}</dd>
          {f.viz ? <div className="mt-2.5">{f.viz}</div> : null}
          {f.note ? <p className="mt-0.5 text-xs text-muted-foreground">{f.note}</p> : null}
        </div>
      ))}
    </dl>
  );
}

/** The recommendation, attributed to the agent that made it, with its reason and exception in one line. */
export function Recommendation({ rec, agent }: { rec: { verdict: string; line: string; line_ar?: string }; agent: string | null }) {
  const { bi, t } = useLang();
  const [en, reason] = splitRec(bi(rec.line, rec.line_ar));
  const lead = en ? t(en) : en;
  const tone = rec.verdict === 'APPROVE' ? 'success' : rec.verdict === 'DECLINE' ? 'danger' : 'warn';
  const name = agent && AGENT_NAMES[agent] ? bi(...AGENT_NAMES[agent]) : t('The agents');
  return (
    <div className={`flex gap-3 rounded-xl border border-border/60 bg-card/60 p-4 border-s-[3px] ${tone === 'success' ? 'border-s-success' : tone === 'danger' ? 'border-s-danger' : 'border-s-warn'}`}>
      {agent && AGENT_NAMES[agent] ? <AgentAvatar agent={{ id: agent, name: AGENT_NAMES[agent][0], role: '', initials: name.slice(0, 2) }} size={32} showActivity={false} /> : null}
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm"><span className="font-semibold">{name} {t('recommends')}</span>{lead ? <Chip tone={tone}>{lead}</Chip> : null}</p>
        <p className="mt-1 text-sm leading-relaxed text-foreground/85">{reason}</p>
      </div>
    </div>
  );
}

/** Loads a case and lays it out as header · body · pinned actions, in the inbox reader or the drawer. */
/** frame 'stage': the decision card on the Stage, without the disclosure and the editor (canon stage 5, rule 3). */
/**
 * Where a case sits, for Tasama staff looking at a case someone else holds, and the
 * reminder they can send (design/payroll-addendum.md §15). Raqeeb drafts the email;
 * the sender edits and sends. The email is a mock: it reaches the person's Tasama HR
 * notifications and the case trail, nothing else.
 */
function Remind({ c, reload }: { c: any; reload: () => void }) {
  const { t, lang, bi } = useLang();
  const [draft, setDraft] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const step = c.steps?.find((s: any) => s.status === 'WAITING');
  const last = c.reminders?.[c.reminders.length - 1];
  const open = async () => {
    setBusy(true); setErr(null); setSent(null);
    try { setDraft(await post(`/requests/${c.ref}/reminder/draft`)); } catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  };
  const send = async () => {
    setBusy(true); setErr(null);
    try { const r: any = await post(`/requests/${c.ref}/reminder`, { subject: draft.subject, body: draft.body }); setSent(r.to); setDraft(null); bump(); reload(); }
    catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-3">
      {/* Where it is stuck: the step, and since when. The person is named in the header. */}
      <p className="text-sm"><span className="text-muted-foreground">{t('Stuck at')}</span> <span className="font-medium">{step ? bi(step.label, step.label_ar) : t('a decision')}</span><span className="text-muted-foreground">{step?.started_at ? ` · ${t('since')} ${date(step.started_at, lang)}` : ''}</span></p>
      {sent ? <p className="text-sm text-success">{t('Reminder sent to')} {sent}.</p> : last ? <p className="text-xs text-muted-foreground">{t('Last reminder')} {ago(last.at, lang)} · {last.by}</p> : null}
      {draft ? (
        <div className="space-y-2 rounded-xl border border-border/70 p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><AgentTag id="raqeeb" showChip={false} />{t('drafted this from the case. Edit it before you send.')}</div>
          <p className="text-sm"><span className="text-muted-foreground">{t('To')}:</span> {draft.to.name}, {t(draft.to.role)} &lt;{draft.to.email}&gt;</p>
          <input className="input h-10 w-full text-sm" aria-label={t('Subject')} value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
          <textarea className="input w-full py-2 text-sm leading-relaxed" style={{ height: "17rem" }} dir="auto" aria-label={t('Message')} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
          <p className="text-[11px] text-muted-foreground">{t('No email leaves the prototype: the reminder appears in their Tasama HR notifications and on the case.')}</p>
        </div>
      ) : null}
      {err ? <p className="text-sm text-danger">{err}</p> : null}
      <DecisionBar>
        {draft ? <Btn onClick={() => setDraft(null)} disabled={busy}>{t('Cancel')}</Btn> : null}
        {draft ? <Btn kind="primary" onClick={send} disabled={busy}>{busy ? t('Sending…') : t('Send the reminder')}</Btn>
          : <Btn kind="primary" onClick={open} disabled={busy}>{busy ? t('Drafting…') : t('Send a reminder')}</Btn>}
      </DecisionBar>
    </div>
  );
}

export function CaseView({ caseRef, frame = 'inbox', onDone }: { caseRef: string; frame?: 'inbox' | 'drawer' | 'stage'; onDone?: () => void }) {
  const { t, bi, lang } = useLang();
  const { persona } = useApp();
  const { data: c, error, reload } = useApi<any>(`/requests/${caseRef}`, { poll: 4000 });
  const [reason, setReason] = useState('');
  const [reasonCode, setReasonCode] = useState('');
  const [asking, setAsking] = useState<null | 'APPROVED' | 'REJECTED'>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [edits, setEdits] = useEditor(c);
  useEffect(() => { setReason(''); setReasonCode(''); setErr(null); setAsking(null); }, [caseRef, c?.status]);
  if (error) return <Empty>{error}</Empty>;
  if (!c) return <div className="p-6 text-sm text-muted-foreground">{t('Loading…')}</div>;
  const escalated = c.status === 'ESCALATED';
  const open = ['WAITING', 'ESCALATED'].includes(c.status);
  const mine = !['WF-36', 'WF-30', 'WF-27'].includes(c.workflow_id) && !!persona && (c.requester_person_id === persona.person_id || c.subject_person_id === persona.person_id) && !c.canDecide;
  const isHR = !!persona?.roles.some((r) => ['HRBP', 'TA', 'PAYROLL', 'CHRO', 'TASAMA', 'HR_OPS'].includes(r));
  const onBehalf = persona?.key === 'tasama';
  const card = caseCard(c, { t, bi, lang, mine });
  const rec = card.rec;
  const waitingStep = c.steps?.find((s: any) => s.status === 'WAITING');
  const question = ['WF-36', 'WF-27', 'WF-28', 'WF-30', 'WF-35'].includes(c.workflow_id);
  const late = c.workflow_id === 'WF-27' && c.type === 'LATE_CHANGE';
  const nextMonthName = c.payload?.next ? new Date(`${c.payload.next}-01T00:00:00Z`).toLocaleString(lang === 'ar' ? 'ar' : 'en-GB', { month: 'long', timeZone: 'UTC' }) : '';
  const approveLabel = escalated ? t('Resume the case') : c.workflow_id === 'WF-30' ? t(c.current_step === 'prepare' ? 'Send for validation' : c.current_step === 'validate' ? 'Validate' : 'Approve the run') : late ? `${t('Pay it with')} ${nextMonthName}` : c.workflow_id === 'WF-27' ? t('Confirm the changes') : c.workflow_id === 'WF-28' ? t('Send for signature') : question ? t(c.payload?.kind === 'GOSI_REGISTRATION' ? 'Record the registration' : c.payload?.kind === 'PAYMENT_RETURNED' ? 'Send the new IBAN' : 'Send the answer') : c.workflow_id === 'WF-13' ? t('Apply the fixes and release') : t(waitingStep?.def?.decision && waitingStep.def.decision.split(' ').length <= 5 ? waitingStep.def.decision : 'Approve');
  const declineLabel = escalated ? t('Close the case') : c.workflow_id === 'WF-30' ? t('Return to Tasama') : late ? t('Ask Tasama for an off-cycle payment') : c.workflow_id === 'WF-28' ? t('Return to Tasama') : c.workflow_id === 'WF-33' ? t('Hold the file') : question && c.payload?.kind === 'GOSI_REGISTRATION' ? t('Not registered yet') : question && c.payload?.kind === 'PAYMENT_RETURNED' ? t('No new IBAN yet') : t('Decline');
  const needsReason = (d: 'APPROVED' | 'REJECTED') => onBehalf || (d === 'APPROVED' && rec?.verdict === 'DECLINE') || (d === 'REJECTED' && (rec?.verdict === 'APPROVE' || !escalated));
  const decide = async (decision: 'APPROVED' | 'REJECTED') => {
    if (needsReason(decision) && asking !== decision) { setAsking(decision); setErr(null); return; }
    if (decision === 'REJECTED' && !escalated && !question && !reasonCode) { setErr(t('Choose a reason.')); return; }
    if (decision === 'APPROVED' && question && c.payload?.kind === 'GOSI_REGISTRATION' && !edits.registered_on) { setErr(t('Give the registration date.')); return; }
    if (decision === 'APPROVED' && question && c.payload?.kind === 'PAYMENT_RETURNED' && !String(edits.new_iban ?? '').trim()) { setErr(t('Give the new IBAN.')); return; }
    const text = reason.trim() || (decision === 'REJECTED' ? bi(...((REJECT_REASONS.find((r) => r[0] === reasonCode) ?? ['', '', '']).slice(1) as [string, string])) : '');
    if (needsReason(decision) && !text && !question) { setErr(t('Give a reason.')); return; }
    if (decision === 'REJECTED' && c.workflow_id === 'WF-30' && !text) { setErr(t('Say what Tasama should change.')); return; }
    setBusy(true); setErr(null);
    try {
      const e = { ...edits };
      if (c.workflow_id === 'WF-03' && e.shortlist === undefined) delete e.shortlist;
      await post(`/requests/${c.ref}/decide`, { decision, reason: text || undefined, reason_code: decision === 'REJECTED' ? reasonCode || undefined : undefined, edits: Object.keys(e).length ? e : undefined });
      bump(); await reload(); onDone?.();
    } catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  };
  const letterReady = c.workflow_id === 'WF-14' && c.status === 'COMPLETED' && c.payload?.body;
  const letter = letterReady ? letterDocument({ ...c.payload, type: c.payload.letter_type, document_number: c.result?.document_number ?? c.ref, status: 'ISSUED' }) : null;
  const overdue = c.sla_due && new Date(c.sla_due).getTime() < Date.now();
  // Name the person and their role, so whoever is looking knows whose decision it is.
  const holder = c.canDecide ? t('you') : [bi(c.waiting_on_name, c.waiting_on_name_ar), roleName(c.waiting_on_role, bi)].filter(Boolean).join(', ') + (c.waiting_on_role === 'PAYROLL' || c.waiting_on_role === 'CHRO' ? ` ${t('at')} ${bi(c.client_short, c.client_ar)}` : '');

  const header = (
    <div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{card.kind}</span>
        {/* The clock is the decider's; the person who asked sees where the request is, not HR's deadline. */}
        <span className="ms-auto">{open && c.sla_due && !mine ? <Chip tone={overdue ? 'danger' : 'warn'}>{until(c.sla_due, lang)}</Chip> : <StatusChip status={c.status} />}</span>
      </div>
      <h2 className="mt-1.5 text-lg font-semibold leading-snug">{card.headline}</h2>
      {<p className="mt-1.5 text-sm text-muted-foreground">{`${mine ? t('You asked on') : c.workflow_id === 'WF-36' ? `${t('Asked by')} ${c.payload?.asked_by === 'Tahweel' ? bi('Tahweel', 'تحويل') : c.payload?.asked_by ?? ''}${t(', Tasama,')} ${t('on')}` : ['WF-27', 'WF-28', 'WF-30', 'WF-33'].includes(c.workflow_id) ? t('Opened on') : c.requester_person_id !== c.subject_person_id ? `${t('Raised by')} ${c.requester_name} ${t('on')}` : t('Asked on')} ${date(c.created_at, lang)}${open ? ` · ${c.canDecide ? t('now with you') : `${t('now with')} ${holder}`}` : c.closed_at ? ` · ${t(c.status === 'COMPLETED' ? 'completed' : 'closed')} ${date(c.closed_at, lang)}` : ''}`}</p>}
    </div>
  );

  const body = (
    <div className="space-y-5">
      <FactGrid facts={card.facts} />
      {rec && (c.canDecide || (isHR && !mine && open)) ? <Recommendation rec={rec} agent={recommender(c)} /> : null}
      {letter && mine ? <div className="space-y-2"><DocumentPreview document={letter} /><DocumentDownload small document={letter} /></div> : null}
      {c.canDecide && frame !== 'stage' ? <Editor c={c} edits={edits} setEdits={setEdits} /> : null}
      {frame === 'stage' ? null : <Provenance label={t('How this was checked')}>
        {letter && mine ? null : <Details c={c} />}
        <ReaderSection label={t('Steps')}><Steps steps={c.steps} /></ReaderSection>
        <ReaderSection label={t('Decision trail')}><TrailList rows={c.trail} /></ReaderSection>
        <RulesCited trail={c.trail} />
        {c.logs?.length ? (
          <ReaderSection label={t('HRMS calls')}>
            <ul className="space-y-1">{c.logs.map((l: any) => <li key={l.id} className="flex items-start gap-2 font-mono text-[11px]"><Server className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" /><span className="text-muted-foreground">{l.system}</span><span className="font-semibold">{l.method}</span><span className="min-w-0 flex-1 break-all">{l.resource.replace('/hcmRestApi/resources/11.13.18.05', '')}</span><span className="text-muted-foreground">{l.status_code} · {l.latency_ms}ms</span></li>)}</ul>
          </ReaderSection>
        ) : null}
      </Provenance>}
    </div>
  );

  const actions = c.canDecide ? (
    <div className="space-y-2.5">
      {asking ? (
        <div className="grid gap-2 sm:grid-cols-[13rem_1fr]">
          {asking === 'REJECTED' && !escalated && !question ? (
            <select className="input h-10 text-sm" value={reasonCode} onChange={(e) => setReasonCode(e.target.value)} aria-label={t('Why you are declining')}>
              <option value="">{t('Why you are declining')}…</option>
              {REJECT_REASONS.map(([k, en, ar]) => <option key={k} value={k}>{bi(en, ar)}</option>)}
            </select>
          ) : null}
          <input className={`input h-10 text-sm ${asking === 'REJECTED' && !escalated && !question ? '' : 'sm:col-span-2'}`} autoFocus placeholder={asking === 'REJECTED' ? t(question ? (c.workflow_id === 'WF-36' ? 'When it will be done, for Tasama (optional)' : c.workflow_id === 'WF-30' ? 'What Tasama should change' : 'A note for Tasama (optional)') : 'A note for the requester (optional)') : t('Your reason')} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      ) : null}
      {err ? <p className="text-sm text-danger">{err}</p> : null}
      <DecisionBar prompt={asking ? (asking === 'REJECTED' ? t(question ? (c.workflow_id === 'WF-36' ? 'Tell Tasama when it will be done, then confirm.' : 'Add a note for Tasama if you want, then confirm.') : 'Declining: choose a reason, then confirm.') : t('This goes against the recommendation: give your reason.')) : undefined}>
        {asking ? <Btn onClick={() => { setAsking(null); setErr(null); }} disabled={busy}>{t('Cancel')}</Btn> : null}
        {asking !== 'APPROVED' && !(c.workflow_id === 'WF-27' && c.type === 'MONTH') && !(c.workflow_id === 'WF-30' && c.current_step !== 'approve') ? <Btn kind="danger" onClick={() => decide('REJECTED')} disabled={busy}>{asking === 'REJECTED' ? t(question ? 'Confirm' : 'Confirm the decline') : declineLabel}</Btn> : null}
        {asking !== 'REJECTED' ? <Btn kind="primary" onClick={() => decide('APPROVED')} disabled={busy}>{busy ? t('Working…') : approveLabel}</Btn> : null}
      </DecisionBar>
    </div>
  ) : c.canRemind && frame !== 'stage' ? <Remind c={c} reload={reload} /> : null;

  if (frame === 'stage') return (
    <div className="space-y-4">
      {header}
      {body}
      {actions}
    </div>
  );
  if (frame === 'drawer') return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-border/60 pb-4 pe-14 ps-6 pt-6">{header}</header>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{body}</div>
      {actions ? <footer className="shrink-0 border-t border-border/60 bg-background/80 px-6 py-3 backdrop-blur">{actions}</footer> : null}
    </div>
  );
  return <InboxReader header={header} actions={actions} className="lg:sticky lg:top-3 lg:h-[calc(100dvh-20rem)] lg:min-h-[34rem] lg:self-start">{body}</InboxReader>;
}

/** One inbox row: initials, who, what, and one status. */
export function CaseRow({ r, selected, onSelect, unread, mine }: { r: any; selected?: boolean; onSelect?: () => void; unread?: boolean; mine?: boolean }) {
  const { bi, t, lang } = useLang();
  const { who, what, kind } = rowParts(r, bi, t);
  const open = ['WAITING', 'ESCALATED'].includes(r.status);
  const overdue = r.sla_due && new Date(r.sla_due).getTime() < Date.now();
  const state = open && r.sla_due && !mine ? <Chip tone={overdue ? 'danger' : 'warn'}>{until(r.sla_due, lang)}</Chip> : <StatusChip status={r.status} />;
  return (
    <InboxItem selected={selected} onSelect={onSelect} unread={unread}
      thumbnail={mine ? undefined : <span className="flex h-full w-full items-center justify-center bg-primary/10 text-sm font-semibold text-primary">{initials(who)}</span>}
      reference={<span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{kind}</span>}
      meta={open && r.sla_due && !mine ? <ClockBar compact start={r.created_at} due={r.sla_due} /> : undefined}
      state={state} title={mine ? what : who} preview={mine ? (open ? `${t('With')} ${bi(r.waiting_on_name, r.waiting_on_name_ar) || roleName(r.waiting_on_role, bi)}` : date(r.closed_at ?? r.updated_at, lang)) : what.toLowerCase() === kind.toLowerCase() ? `${t('Asked')} ${date(r.created_at, lang)}` : what} />
  );
}

/** Kept for callers that only want the body inside their own frame. */
export function CaseBody({ caseRef, onDone }: { caseRef: string; onDone?: () => void }) {
  return <CaseView caseRef={caseRef} frame="drawer" onDone={onDone} />;
}

export function CaseDrawer() {
  const { caseRef, openCase, director } = useApp();
  const { dir, t } = useLang();
  // While the Demo Director plays, the drawer is not modal so the Director bar stays usable.
  return (
    <Sheet open={!!caseRef} onOpenChange={(o) => !o && openCase(null)} modal={!director}>
      <SheetContent side={dir === 'rtl' ? 'left' : 'right'} className={`w-full p-0 sm:max-w-[720px] ${director ? 'pb-56 shadow-2xl' : ''}`} onInteractOutside={(e) => { if (director) e.preventDefault(); }}>
        <SheetTitle className="sr-only">{t('Case')}</SheetTitle>
        {caseRef ? <CaseView caseRef={caseRef} frame="drawer" /> : null}
      </SheetContent>
    </Sheet>
  );
}
