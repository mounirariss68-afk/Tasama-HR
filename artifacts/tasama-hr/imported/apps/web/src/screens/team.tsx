/** My Team: the line manager's screens. Agents prepare; the manager decides. */
import { useEffect, useMemo, useState } from 'react';
import { HeroFeature, PageColumns, Panel, PanelAction, RecordCard } from '@cognirise/atelier/layout';
import { InboxItem, InboxLayout, InboxList, InboxReader, InboxTabs } from '@cognirise/atelier/archetypes';
import { Dialog, DialogContent, DialogTitle } from '@cognirise/atelier/components/ui/dialog';
import { Briefcase, CalendarDays, ClipboardCheck, Plus, Target, TrendingUp, Users } from 'lucide-react';
import { bump, post, useApi } from '../lib/api';
import { useLang } from '../lib/i18n';
import { ago, date, dateShort, daysUntil, until } from '../lib/format';
import { useApp } from '../app/state';
import { Bar, Btn, Chip, Empty, Field, Hero, Person, Ref, Screen, StatusChip, Table } from '../app/ui';
import { CaseRow, CaseView } from '../app/case';
import { CoverStrip } from '../app/viz';
import { rowTitle } from '../app/decision';
import { LifecycleRing, stageCounts } from '../app/ring';

/** Requests about the person themselves (leave, pay, letters, probation, promotion, exit), not work they run (a calibration, a payroll check). */
const PERSONAL = new Set(['WF-08', 'WF-12', 'WF-14', 'WF-15', 'WF-16', 'WF-19', 'WF-20']);

export function TeamScreen() {
  const { t, bi, lang } = useLang();
  const { go, openCase } = useApp();
  const { data } = useApi<any[]>('/team');
  const { data: all } = useApi<any[]>('/requests?view=inbox');
  const inbox = (all ?? []).filter(asManager);
  const [pos, setPos] = useState(false);
  const team = data ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const away = team.filter((m) => m.away.some((a: any) => a.start_date <= new Date().toISOString().slice(0, 10)));
  const probation = team.filter((m) => m.probation_status === 'IN_PROBATION');
  const horizon = new Date(Date.now() + 21 * 864e5).toISOString().slice(0, 10);
  const awaySoon = team.filter((m) => m.away.some((a: any) => String(a.start_date).slice(0, 10) <= horizon && String(a.end_date).slice(0, 10) >= today) || (inbox ?? []).some((r) => r.workflow_id === 'WF-15' && r.subject_person_id === m.person_id && String(r.payload?.start ?? '') <= horizon && String(r.payload?.end ?? '') >= today));
  const reviews = team.filter((m) => m.review && !['COMPLETED', 'SHARED'].includes(m.review.status));
  return (
    <Screen hero={<Hero tone="surface" eyebrow="My Team" title={awaySoon.length ? `${awaySoon.length} ${t('of your')} ${team.length} ${t(awaySoon.length === 1 ? 'people is away in the next three weeks' : 'people are away in the next three weeks')}` : t('Everyone in your team is in for the next three weeks')} lede={`${team.length} ${t(team.length === 1 ? 'direct report' : 'direct reports')}. ${away.length ? `${t('Away today')}: ${away.map((a) => a.first_name).join(', ')}.` : t('Everyone is in today.')} ${probation.length ? `${probation.length} ${t('in probation')}${probation[0] ? `; ${probation[0].first_name} ${t('ends')} ${dateShort(probation[0].probation_end_date, lang)}` : ''}.` : t('Nobody is in probation.')}`}
      feature={reviews.length ? <HeroFeature label="Reviews to complete" value={reviews.length} support={<span className="text-xs text-muted-foreground">{t('of')} {team.length} {t('this cycle')}</span>} /> : undefined}
      actions={<><Btn kind="primary" onClick={() => go('team-approvals')}>{inbox.length ? `${t('Open approvals')} · ${inbox.length}` : t('Open approvals')}</Btn><Btn onClick={() => setPos(true)}><Plus className="h-4 w-4" />{t('Request a position')}</Btn></>} />}>
      <div className="space-y-4">
        <Panel icon={<CalendarDays size={16} />} title={`${t('Who is away in the next three weeks')}`} action={<PanelAction>{t('Today first')}</PanelAction>}>
          <CoverStrip size="lg" from={today} days={21} today={today} rows={team.map((m) => ({ name: bi(m.first_name, m.display_name_ar?.split(' ')[0]), ranges: [
            ...m.away.map((a: any) => ({ start: String(a.start_date).slice(0, 10), end: String(a.end_date).slice(0, 10) })),
            ...(inbox ?? []).filter((r) => r.workflow_id === 'WF-15' && r.subject_person_id === m.person_id).map((r) => ({ start: r.payload.start, end: r.payload.end, pending: true })),
          ] }))} />
          <div className="mt-3 flex gap-4 text-[11px] text-muted-foreground"><span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-warn" />{t('Approved leave')}</span><span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-primary/35 ring-1 ring-inset ring-primary" />{t('Waiting on you')}</span></div>
        </Panel>
        <Panel icon={<Users size={16} />} title="Team" action={<PanelAction>{team.length} {t('people')}</PanelAction>}>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(15rem,1fr))]">
            {team.map((m) => (
              <div key={m.person_id} className="rounded-xl glass-l3 p-4">
                <Person name={bi(m.display_name, m.display_name_ar)} sub={`${bi(m.job_name, m.job_name_ar)} · ${m.grade_code}`} />
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {m.probation_status === 'IN_PROBATION' ? <Chip tone="warn">{t('Probation ends')} {dateShort(m.probation_end_date, lang)}</Chip> : null}
                  {m.away.slice(0, 1).map((a: any) => <Chip key={a.start_date} tone="primary">{t('Away')} {dateShort(a.start_date, lang)}–{dateShort(a.end_date, lang)}</Chip>)}
                  {m.open.filter((c: any) => PERSONAL.has(c.workflow_id)).slice(0, 2).map((c: any) => <button key={c.ref} type="button" onClick={() => openCase(c.ref)} className="mono-chip is-warn hover:opacity-80">{bi(c.title, c.title_ar)}</button>)}
                  {m.talent?.flight_risk === 'HIGH' ? <Chip tone="danger">{t('Flight risk')}</Chip> : null}
                </div>
                {m.goals !== null ? <div className="mt-3 flex items-center gap-2"><Bar value={m.goals} /><span className="font-mono text-[11px]">{m.goals}%</span></div> : null}
                <p className="mt-1 text-[11px] text-muted-foreground">{t('Review')}: {m.review ? <StatusChip status={m.review.status} /> : '—'}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <PositionRequest open={pos} onClose={() => setPos(false)} />
    </Screen>
  );
}

function PositionRequest({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useLang();
  const { openCase } = useApp();
  const [f, setF] = useState<any>({ grade_rank: 8, budgeted: true });
  const [err, setErr] = useState('');
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg"><DialogTitle>{t('Request a position')}</DialogTitle>
        <p className="text-sm text-muted-foreground">{t('Your HR business partner and Finance approve it; the CHRO too for G11 and above or anything unbudgeted.')}</p>
        <div className="space-y-3">
          <Field label={t('Job title')}><input className="input" value={f.job_title ?? ''} onChange={(e) => setF({ ...f, job_title: e.target.value })} placeholder="Customer Experience Analyst" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('Grade')}><select className="input" value={f.grade_rank} onChange={(e) => setF({ ...f, grade_rank: Number(e.target.value) })}>{[4, 5, 6, 7, 8, 9, 10, 11, 12].map((g) => <option key={g} value={g}>G{String(g).padStart(2, '0')}</option>)}</select></Field>
            <Field label={t('Budget')}><select className="input" value={f.budgeted ? '1' : '0'} onChange={(e) => setF({ ...f, budgeted: e.target.value === '1' })}><option value="1">{t('Budgeted')}</option><option value="0">{t('Unbudgeted')}</option></select></Field>
          </div>
          <Field label={t('Why it is needed')}><textarea className="input" value={f.reason ?? ''} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
          {err ? <p className="text-sm text-danger">{err}</p> : null}
          <div className="flex justify-end"><Btn kind="primary" disabled={!f.job_title} onClick={async () => { try { const r = await post('/requests', { type: 'POSITION', ...f }); bump(); onClose(); openCase(r.ref); } catch (e: any) { setErr(e.message); } }}>{t('Submit')}</Btn></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The manager's (and anyone's) decision inbox. */
export function DecisionInbox({ scope = 'inbox', only }: { scope?: 'inbox' | 'all'; only?: (r: any) => boolean }) {
  const { t, bi, lang } = useLang();
  const [tab, setTab] = useState('waiting');
  const { data: allWaiting } = useApi<any[]>('/requests?view=inbox', { poll: 6000 });
  const waiting = only ? (allWaiting ?? []).filter(only) : allWaiting;
  const { data: all } = useApi<any[]>(`/requests?view=${scope === 'all' ? 'all' : 'all'}&limit=150`);
  const [sel, setSel] = useState<string | null>(null);
  const rows = useMemo(() => {
    if (tab === 'waiting') return waiting ?? [];
    if (tab === 'escalated') return (all ?? []).filter((r) => r.status === 'ESCALATED');
    return all ?? [];
  }, [tab, waiting, all]);
  useEffect(() => { if (!rows.find((r) => r.ref === sel)) setSel(rows[0]?.ref ?? null); }, [rows, sel]);
  return (
    <InboxLayout
      tabs={<InboxTabs value={tab} onChange={setTab} items={[{ id: 'waiting', label: t('Needs my decision'), tone: 'attention' }, { id: 'escalated', label: t('Escalated') }, { id: 'all', label: t('All in my scope') }]} />}
      list={<InboxList label={tab === 'all' ? t('Most recent first') : t('Oldest due first')} emptyState={<Empty>{t('Nothing here.')}</Empty>}>
        {rows.map((r) => (
          <CaseRow key={r.ref} r={r} selected={sel === r.ref} onSelect={() => setSel(r.ref)} unread={r.status === 'WAITING' && tab === 'waiting'} />
        ))}
      </InboxList>}
      reader={sel ? <CaseView caseRef={sel} /> : <InboxReader empty={t('Choose a case.')} />}
    />
  );
}

/** A decision the person takes as a line manager. The CHRO's HR decisions stay in the HR Workspace inbox, so no row is in both. */
export const asManager = (r: any) => r.waiting_on_role === 'LINE_MANAGER';

export function TeamApprovals() {
  const { t } = useLang();
  const { data } = useApi<any[]>('/requests?view=inbox', { poll: 6000 });
  const n = (data ?? []).filter(asManager).length;
  return (
    <Screen hero={<Hero tone="surface" eyebrow="My Team" title={n ? `${n} ${t(n === 1 ? 'decision waits on you' : 'decisions wait on you')}` : t('Nothing waits on you')} lede={t('Leave, advances, probation and hiring decisions for your team.')} />}>
      <DecisionInbox only={asManager} />
    </Screen>
  );
}

export function TeamHiring() {
  const { t, bi, lang } = useLang();
  const { persona, openCase } = useApp();
  const { data } = useApi<any>('/hiring');
  const mine = (data?.requisitions ?? []).filter((r: any) => r.hiring_manager === persona?.display_name);
  const list = mine.length ? mine : (data?.requisitions ?? []).filter((r: any) => r.division === 'Commercial');
  return (
    <Screen hero={<Hero tone="surface" eyebrow="My Team" title={(() => { const o = list.filter((r: any) => r.status === 'OPEN').length, d = list.filter((r: any) => r.open_case).length; return `${o} ${t(o === 1 ? 'vacancy is open' : 'vacancies are open')}${d ? `; ${d} ${t(d === 1 ? 'shortlist needs your decision' : 'shortlists need your decision')}` : ''}`; })()} lede={t('Your vacancies, the evidence for each applicant and the shortlists waiting for you.')} />}>
      <Panel icon={<Briefcase size={16} />} title={mine.length ? 'My requisitions' : 'Requisitions in my division'}>
        <Table><thead><tr><th>{t('Role')}</th><th>{t('Opened')}</th><th>{t('Applicants')}</th><th>{t('Shortlisted')}</th><th>{t('Saudi applicants')}</th><th>{t('Status')}</th><th></th></tr></thead>
          <tbody>{list.map((r: any) => {
            const f = r.funnel ?? {};
            const n = Object.values(f).reduce((a: number, b: any) => a + Number(b), 0) as number;
            return <tr key={r.id}><td>{bi(r.title, r.title_ar)}<span className="block text-xs text-muted-foreground">{r.department} · {r.grade}</span></td><td>{date(r.opened_date, lang)}</td><td className="tabular-nums">{n}</td><td className="tabular-nums">{(f.SHORTLISTED ?? 0) + (f.INTERVIEW ?? 0) + (f.ASSESSMENT ?? 0)}</td><td className="tabular-nums">{r.saudi_applicants}</td><td><StatusChip status={r.status} /></td><td>{r.open_case ? <Btn small kind="primary" onClick={() => openCase(r.open_case)}>{t('Decide')}</Btn> : null}</td></tr>;
          })}</tbody></Table>
      </Panel>
    </Screen>
  );
}

export function TeamPerformance() {
  const { t, bi, lang } = useLang();
  const { data } = useApi<any[]>('/team');
  const team = data ?? [];
  return (
    <Screen hero={<Hero tone="surface" eyebrow="My Team" title={(() => { const w = team.filter((m) => m.review && !m.review.manager_rating && !['COMPLETED', 'SHARED'].includes(m.review.status)).length; const cal = team.filter((m) => m.review?.status === 'CALIBRATION').length; return w ? `${w} ${t(w === 1 ? 'review waits for your rating' : 'reviews wait for your rating')}` : cal ? `${t('All rated; HR is calibrating')} ${cal} ${t(cal === 1 ? 'review' : 'reviews')}` : t('Every review in your team is rated'); })()} lede={t('Goal progress and review status for each person in your team.')} />}>
      <Panel icon={<TrendingUp size={16} />} title="Review cycle">
        <Table><thead><tr><th>{t('Person')}</th><th>{t('Goals')}</th><th>{t('Review status')}</th><th>{t('Self')}</th><th>{t('Your rating')}</th><th>{t('Probation')}</th></tr></thead>
          <tbody>{team.map((m) => <tr key={m.person_id}><td><Person name={bi(m.display_name, m.display_name_ar)} sub={bi(m.job_name, m.job_name_ar)} size={24} /></td><td className="min-w-[140px]"><div className="flex items-center gap-2"><Bar value={m.goals ?? 0} /><span className="font-mono text-[11px]">{m.goals ?? '—'}%</span></div></td><td><StatusChip status={m.review?.status} /></td><td className="tabular-nums">{m.review?.self_rating ?? '—'}</td><td className="tabular-nums">{m.review?.manager_rating ?? '—'}</td><td>{m.probation_status === 'IN_PROBATION' ? <Chip tone={daysUntil(m.probation_end_date) < 30 ? 'warn' : undefined}>{date(m.probation_end_date, lang)}</Chip> : <span className="text-xs text-muted-foreground">{t('Confirmed')}</span>}</td></tr>)}</tbody></Table>
      </Panel>
      <Panel icon={<Target size={16} />} title="How ratings work">
        <p className="text-sm">{t('Ratings run 1 to 5. As a guide no more than 15% of a division is rated 5 and about 60% sits at 3. Ratings are calibrated by division before they are shared, and the panel records a reason for every change.')}</p>
      </Panel>
    </Screen>
  );
}
void CalendarDays;
