/**
 * The case reader, used by every inbox and the case drawer.
 *
 * Top to bottom: what the case is, what the agent recommends, the evidence
 * behind it, the steps (actor, decision), the decision trail, the HRMS calls
 * it made — and, when the case waits on the signed-in person, a decision bar
 * naming the actual decision. Reversible options sit left of irreversible.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { DecisionBar, DecisionTrail, ReaderSection, TrailEntry, ProvenanceNote, type TrailKind } from '@cognirise/atelier/archetypes';
import { Sheet, SheetContent, SheetTitle } from '@cognirise/atelier/components/ui/sheet';
import { AlertTriangle, CheckCircle2, CircleDashed, Clock, ExternalLink, Loader2, Server, XCircle } from 'lucide-react';
import { api, bump, post, useApi } from '../lib/api';
import { useLang } from '../lib/i18n';
import { aed, ago, date, dateTime, until } from '../lib/format';
import { useApp } from './state';
import { AgentTag, Bar, Btn, Chip, Empty, Kv, Ref, StatusChip, Table, AGENT_NAMES } from './ui';
import { DocumentPreview } from './document-preview';
import { DocumentDownload } from './document-download';
import { caseDocument, letterDocument } from '../lib/documents';

export const KIND: Record<string, TrailKind> = {
  READ: 'observed', CHECK: 'observed', RECOMMEND: 'proposed', PREPARE: 'proposed', WRITE: 'acted', NOTIFY: 'acted', ANSWER: 'acted',
  APPROVE: 'approved', SUBMIT: 'approved', REJECT: 'rejected', REFUSE: 'rejected', RETURN: 'rejected', OVERRIDE: 'overridden', ESCALATE: 'escalated',
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

const ROLE: Record<string, [string, string]> = { LINE_MANAGER: ['Line manager', 'المدير المباشر'], HRBP: ['HR business partner', 'شريك أعمال الموارد البشرية'], TA: ['Talent acquisition', 'استقطاب المواهب'], PAYROLL: ['Payroll and HR operations', 'الرواتب وعمليات الموارد البشرية'], CHRO: ['CHRO', 'الرئيس التنفيذي لرأس المال البشري'], EMPLOYEE: ['Employee', 'الموظف'] };
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
          {p.ad ? <DocumentDownload document={{ title: t('Job advertisement'), reference: c.ref, body: bi(p.ad.en, p.ad.ar), language: lang, status: c.status }} /> : null}
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
              <DocumentDownload document={{
                title: t('Final settlement'), reference: c.ref, language: lang, status: c.status,
                body: [
                  `${t('Employee')}: ${bi(c.subject_name, c.subject_name_ar)}`,
                  `${t('Last working day')}: ${date(st.lastDay, lang)}`,
                  ...st.lines.map((l: any) => `${bi(l.label, l.label_ar)}: ${aed(l.amount, lang)} (${l.rule})`),
                  `${t('Total')}: ${aed(st.total, lang)}`, `${t('Pay by')}: ${date(st.payBy, lang)}`,
                  `${st.years} ${t('years of service')}`, st.note, st.visa,
                ].filter(Boolean).join('\n'),
              }} />
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
    else setEdits({});
  }, [c?.ref, c?.status]);
  return [edits, setEdits] as const;
}

function Editor({ c, edits, setEdits }: { c: any; edits: any; setEdits: (e: any) => void }) {
  const { t, lang, bi } = useLang();
  const shortlist = useApi(c.workflow_id === 'WF-03' && c.current_step === 'shortlist' ? `/hiring/requisitions/${c.payload.requisition_id}` : null);
  if (c.workflow_id === 'WF-13' && c.result?.precheck) {
    const pc = c.result.precheck;
    const toggle = (id: string) => setEdits({ ...edits, apply_fixes: edits.apply_fixes?.includes(id) ? edits.apply_fixes.filter((x: string) => x !== id) : [...(edits.apply_fixes ?? []), id] });
    return (
      <ReaderSection label={`${t('Findings')} · ${pc.period}`}>
        <p className="mb-3 text-sm text-muted-foreground">{t('Tick a finding to have the connector apply Hisab\'s fix. Untick it and give a reason to accept it as it is. Blockers must be one or the other.')}</p>
        <div className="space-y-2">
          {pc.findings.map((f: any) => {
            const on = edits.apply_fixes?.includes(f.id);
            return (
              <div key={f.id} className="rounded-lg border border-border/60 bg-card/50 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip status={f.severity} /><span className="text-sm font-semibold">{bi(f.title, f.title_ar)}</span><span className="text-sm text-muted-foreground">· {bi(f.name, f.name_ar)}</span>
                  <span className="ms-auto font-mono text-xs tabular-nums">{aed(f.amount, lang)}</span>
                </div>
                <p className="mt-1 text-sm">{f.detail}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t('Fix')}: {f.fix} · <span className="font-mono">{f.rule}</span></p>
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
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4"><Kv k={t('Employees')} v={pc.totals.headcount} /><Kv k={t('Gross')} v={aed(pc.totals.gross, lang)} /><Kv k={t('Net')} v={aed(pc.totals.net, lang)} /><Kv k={t('Last month gross')} v={aed(pc.last?.gross, lang)} /></dl>
      </ReaderSection>
    );
  }
  if (c.workflow_id === 'WF-16' && c.payload?.exception) return (
    <ReaderSection label={t('Your decision on the exception')}>
      <div className="grid grid-cols-2 gap-3">
        <label className="field"><span>{t('Approved amount (SAR)')}</span><input className="input" type="number" value={edits.approved_amount ?? ''} onChange={(e) => setEdits({ ...edits, approved_amount: Number(e.target.value) })} /></label>
        <label className="field"><span>{t('Recovery months')}</span><input className="input" type="number" min={1} max={24} value={edits.approved_months ?? ''} onChange={(e) => setEdits({ ...edits, approved_months: Number(e.target.value) })} /></label>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{t('Pre-filled with the within-policy amount. Change it to approve the exception as requested.')}</p>
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
        <p className="mb-2 text-sm text-muted-foreground">{t('Ratings stand as the managers gave them unless the panel changes one here, with a reason. Every change is written to the trail.')}</p>
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
        <p className="mb-2 text-sm text-muted-foreground">{t('Hessa shows evidence only. You choose the shortlist.')}</p>
        <Table><thead><tr><th></th><th>{t('Candidate')}</th>{(shortlist.data.requisition.criteria ?? []).map((cr: any) => <th key={cr.key}>{cr.label}</th>)}<th>{t('Source')}</th></tr></thead>
          <tbody>{apps.map((a: any) => (
            <tr key={a.id}>
              <td><input type="checkbox" checked={sel.includes(a.id)} onChange={() => setEdits({ ...edits, shortlist: sel.includes(a.id) ? sel.filter((x) => x !== a.id) : [...sel, a.id] })} /></td>
              <td className="whitespace-nowrap">{a.first_name} {a.last_name}<span className="block font-mono text-[10px] text-muted-foreground">{a.candidate_number}</span></td>
              {a.evidence.map((e: any) => <td key={e.key} title={e.note}><span className={e.status === 'evident' ? 'text-success' : e.status === 'partial' ? 'text-warn' : 'text-muted-foreground'}>{e.status === 'evident' ? '●' : e.status === 'partial' ? '◐' : '○'}</span> <span className="text-xs text-muted-foreground">{e.note}</span></td>)}
              <td className="text-xs">{a.source}</td>
            </tr>
          ))}</tbody></Table>
      </ReaderSection>
    );
  }
  return null;
}

export function CaseBody({ caseRef, onDone }: { caseRef: string; onDone?: () => void }) {
  const { t, bi, lang } = useLang();
  const { data: c, error, reload } = useApi<any>(`/requests/${caseRef}`, { poll: 4000 });
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [edits, setEdits] = useEditor(c);
  useEffect(() => { setReason(''); setErr(null); }, [caseRef]);
  const waitingStep = useMemo(() => c?.steps?.find((s: any) => s.status === 'WAITING'), [c]);
  if (error) return <Empty>{error}</Empty>;
  if (!c) return <div className="p-6 text-sm text-muted-foreground">{t('Loading…')}</div>;
  const rec = c.result?.recommendation;
  const decide = async (decision: 'APPROVED' | 'REJECTED' | 'RETURNED') => {
    setBusy(true); setErr(null);
    try {
      const e = { ...edits };
      if (c.workflow_id === 'WF-03' && e.shortlist === undefined) delete e.shortlist;
      await post(`/requests/${c.ref}/decide`, { decision, reason: reason || undefined, edits: Object.keys(e).length ? e : undefined });
      bump(); await reload(); onDone?.();
    } catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  };
  const decisionLabel = waitingStep?.def?.decision ?? t('Approve');
  const escalated = c.status === 'ESCALATED';
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2"><Ref>{c.ref}</Ref><StatusChip status={c.status} />{c.priority !== 'NORMAL' ? <StatusChip status={c.priority} /> : null}<Chip>{c.workflow_id} · {bi(c.workflow_name, c.workflow_name_ar)}</Chip></div>
        <h2 className="text-xl font-semibold leading-snug">{bi(c.title, c.title_ar)}</h2>
        <DocumentDownload small document={caseDocument(c, lang)} />
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kv k={t('About')} v={bi(c.subject_name, c.subject_name_ar)} />
          <Kv k={t('Raised by')} v={c.requester_name} />
          <Kv k={t('Opened')} v={dateTime(c.created_at, lang)} />
          <Kv k={c.status === 'WAITING' || escalated ? t('Waiting on') : t('Closed')} v={c.status === 'WAITING' || escalated ? `${c.waiting_on_name ?? roleName(c.waiting_on_role, bi)}${c.sla_due ? ` · ${until(c.sla_due, lang)}` : ''}` : date(c.closed_at, lang)} />
        </dl>
      </div>
      {rec ? (
        <div className={`rounded-xl border px-4 py-3 ${rec.verdict === 'APPROVE' ? 'border-success/40 bg-success/10' : rec.verdict === 'DECLINE' ? 'border-danger/40 bg-danger/10' : 'border-warn/40 bg-warn/10'}`}>
          <p className="font-mono text-[11px] uppercase tracking-wider">{t('Agent recommendation')}: {t(rec.verdict === 'APPROVE' ? 'Approve' : rec.verdict === 'DECLINE' ? 'Decline' : 'Review')}</p>
          <p className="mt-1 text-sm">{bi(rec.summary, rec.summary_ar)}</p>
          <ProvenanceNote>{t('The agent recommends; the decision is yours. A decision against the recommendation needs a reason, and the trail records it as an override.')}</ProvenanceNote>
        </div>
      ) : null}
      <Details c={c} />
      {c.canDecide ? <Editor c={c} edits={edits} setEdits={setEdits} /> : null}
      <ReaderSection label={t('Steps')}><Steps steps={c.steps} /></ReaderSection>
      <ReaderSection label={t('Decision trail')}><TrailList rows={c.trail} /></ReaderSection>
      {c.logs?.length ? (
        <ReaderSection label={t('HRMS and system calls')}>
          <ul className="space-y-1">{c.logs.map((l: any) => <li key={l.id} className="flex items-start gap-2 font-mono text-[11px]"><Server className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" /><span className="text-muted-foreground">{l.system}</span><span className="font-semibold">{l.method}</span><span className="min-w-0 flex-1 break-all">{l.resource.replace('/hcmRestApi/resources/11.13.18.05', '')}</span><span className="text-muted-foreground">{l.status_code} · {l.latency_ms}ms</span></li>)}</ul>
        </ReaderSection>
      ) : null}
      {c.canDecide ? (
        <div className="sticky bottom-0 -mx-1 space-y-2 rounded-xl glass-chrome p-3">
          <textarea className="input w-full" rows={2} placeholder={t('Reason (required if you go against the recommendation)')} value={reason} onChange={(e) => setReason(e.target.value)} />
          {err ? <p className="text-sm text-danger">{err}</p> : null}
          <DecisionBar prompt={<span>{t('Your decision as')} {roleName(c.waiting_on_role, bi)}: <span className="font-medium text-foreground">{escalated ? t('Resolve the escalation') : decisionLabel}</span></span>}>
            {!escalated ? <Btn onClick={() => decide('RETURNED')} disabled={busy}>{t('Return')}</Btn> : null}
            <Btn kind="danger" onClick={() => decide('REJECTED')} disabled={busy}>{escalated ? t('Close the case') : t('Decline')}</Btn>
            <Btn kind="primary" onClick={() => decide('APPROVED')} disabled={busy}>{busy ? t('Working…') : escalated ? t('Resume the case') : c.workflow_id === 'WF-13' ? t('Apply fixes and release') : t('Approve')}</Btn>
          </DecisionBar>
        </div>
      ) : null}
    </div>
  );
}

export function CaseDrawer() {
  const { caseRef, openCase } = useApp();
  const { dir, t } = useLang();
  return (
    <Sheet open={!!caseRef} onOpenChange={(o) => !o && openCase(null)}>
      <SheetContent side={dir === 'rtl' ? 'left' : 'right'} className="w-full overflow-y-auto p-6 sm:max-w-[780px]">
        <SheetTitle className="sr-only">{t('Case')}</SheetTitle>
        {caseRef ? <CaseBody caseRef={caseRef} /> : null}
      </SheetContent>
    </Sheet>
  );
}
void AGENT_NAMES; void Bar; void ExternalLink; void api;
