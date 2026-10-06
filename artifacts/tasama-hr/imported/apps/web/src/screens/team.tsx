/** My Team: the line manager's screens. Agents prepare; the manager decides. */
import { useEffect, useMemo, useState } from 'react';
import { HeroFeature, PageColumns, Panel, PanelAction, RecordCard, StatRow, StatTile } from '@cognirise/atelier/layout';
import { InboxItem, InboxLayout, InboxList, InboxReader, InboxTabs } from '@cognirise/atelier/archetypes';
import { Dialog, DialogContent, DialogTitle } from '@cognirise/atelier/components/ui/dialog';
import { Briefcase, CalendarDays, ClipboardCheck, Plus, Target, TrendingUp, Users } from 'lucide-react';
import { bump, post, useApi } from '../lib/api';
import { useLang } from '../lib/i18n';
import { ago, date, dateShort, daysUntil, until } from '../lib/format';
import { useApp } from '../app/state';
import { Bar, Btn, Chip, Empty, Field, Hero, Person, Ref, Screen, StatusChip, Table } from '../app/ui';
import { CaseBody } from '../app/case';
import { LifecycleRing, stageCounts } from '../app/ring';

export function TeamScreen() {
  const { t, bi, lang } = useLang();
  const { go, openCase } = useApp();
  const { data } = useApi<any[]>('/team');
  const { data: inbox } = useApi<any[]>('/requests?view=inbox');
  const [pos, setPos] = useState(false);
  const team = data ?? [];
  const away = team.filter((m) => m.away.some((a: any) => a.start_date <= new Date().toISOString().slice(0, 10)));
  const probation = team.filter((m) => m.probation_status === 'IN_PROBATION');
  const reviews = team.filter((m) => m.review && !['COMPLETED', 'SHARED'].includes(m.review.status));
  return (
    <Screen hero={<Hero tone="surface" eyebrow="My Team" title="Your team today" lede="Who is away, who is in probation, what is waiting on you. Every decision arrives prepared, with the evidence and the rule."
      actions={<><Btn kind="primary" onClick={() => go('team-approvals')}>{t('Open approvals')}</Btn><Btn onClick={() => setPos(true)}><Plus className="h-4 w-4" />{t('Request a position')}</Btn></>}
      media={<LifecycleRing counts={stageCounts(inbox ?? [])} center={(inbox ?? []).length} centerLabel={t('decisions waiting on you')} />} />}>
      <StatRow>
        <StatTile label="Direct reports" value={team.length} />
        <StatTile label="Away now" value={away.length} trend={{ direction: 'flat', label: away.map((a) => a.first_name).join(', ') || t('everyone in') }} />
        <StatTile label="In probation" value={probation.length} trend={{ direction: 'flat', label: probation[0] ? `${probation[0].first_name}: ${t('ends')} ${dateShort(probation[0].probation_end_date, lang)}` : t('none') }} />
        <StatTile label="Reviews to complete" value={reviews.length} />
      </StatRow>
      <PageColumns aside={<Panel icon={<ClipboardCheck size={16} />} title="Waiting on you" action={<PanelAction onClick={() => go('team-approvals')}>{t('All')}</PanelAction>}>
        <div className="space-y-2">{(inbox ?? []).slice(0, 6).map((r) => <RecordCard key={r.ref} reference={<Ref>{r.ref}</Ref>} state={<StatusChip status={r.status} />} title={bi(r.title, r.title_ar)} meta={<span className="text-xs text-muted-foreground">{bi(r.subject_name, r.subject_name_ar)} · {until(r.sla_due, lang)}</span>} onOpen={() => openCase(r.ref)} />)}
          {!(inbox ?? []).length ? <Empty>{t('Nothing waiting.')}</Empty> : null}</div>
      </Panel>}>
        <Panel icon={<Users size={16} />} title="Team" action={<PanelAction>{team.length} {t('people')}</PanelAction>}>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(15rem,1fr))]">
            {team.map((m) => (
              <div key={m.person_id} className="rounded-xl glass-l3 p-4">
                <Person name={bi(m.display_name, m.display_name_ar)} sub={`${bi(m.job_name, m.job_name_ar)} · ${m.grade_code}`} />
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {m.probation_status === 'IN_PROBATION' ? <Chip tone="warn">{t('Probation ends')} {dateShort(m.probation_end_date, lang)}</Chip> : null}
                  {m.away.slice(0, 1).map((a: any) => <Chip key={a.start_date} tone="primary">{t('Away')} {dateShort(a.start_date, lang)}–{dateShort(a.end_date, lang)}</Chip>)}
                  {m.open.length ? <Chip tone="warn">{m.open.length} {t('open case')}</Chip> : null}
                  {m.talent?.flight_risk === 'HIGH' ? <Chip tone="danger">{t('Flight risk')}</Chip> : null}
                </div>
                {m.goals !== null ? <div className="mt-3 flex items-center gap-2"><Bar value={m.goals} /><span className="font-mono text-[11px]">{m.goals}%</span></div> : null}
                <p className="mt-1 text-[11px] text-muted-foreground">{t('Review')}: {m.review ? <StatusChip status={m.review.status} /> : '—'}</p>
              </div>
            ))}
          </div>
        </Panel>
      </PageColumns>
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
        <p className="text-sm text-muted-foreground">{t('Saeed checks it against your headcount budget, the grade structure and Saudization (Nitaqat), and drafts the job description. HRBP and Finance approve; the CHRO also approves G11 and above or anything unbudgeted.')}</p>
        <div className="space-y-3">
          <Field label={t('Job title')}><input className="input" value={f.job_title ?? ''} onChange={(e) => setF({ ...f, job_title: e.target.value })} placeholder="Customer Experience Analyst" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('Grade')}><select className="input" value={f.grade_rank} onChange={(e) => setF({ ...f, grade_rank: Number(e.target.value) })}>{[4, 5, 6, 7, 8, 9, 10, 11, 12].map((g) => <option key={g} value={g}>G{String(g).padStart(2, '0')}</option>)}</select></Field>
            <Field label={t('Budget')}><select className="input" value={f.budgeted ? '1' : '0'} onChange={(e) => setF({ ...f, budgeted: e.target.value === '1' })}><option value="1">{t('Budgeted')}</option><option value="0">{t('Unbudgeted')}</option></select></Field>
          </div>
          <Field label={t('Why it is needed')}><textarea className="input" value={f.reason ?? ''} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
          {err ? <p className="text-sm text-danger">{err}</p> : null}
          <div className="flex justify-end"><Btn kind="primary" disabled={!f.job_title} onClick={async () => { try { const r = await post('/requests', { type: 'POSITION', ...f }); bump(); onClose(); openCase(r.ref); } catch (e: any) { setErr(e.message); } }}>{t('Submit to Saeed')}</Btn></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The manager's (and anyone's) decision inbox. */
export function DecisionInbox({ scope = 'inbox' }: { scope?: 'inbox' | 'all' }) {
  const { t, bi, lang } = useLang();
  const [tab, setTab] = useState('waiting');
  const { data: waiting } = useApi<any[]>('/requests?view=inbox', { poll: 6000 });
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
      tabs={<InboxTabs value={tab} onChange={setTab} items={[{ id: 'waiting', label: t('Needs my decision'), count: (waiting ?? []).length, tone: 'attention' }, { id: 'escalated', label: t('Escalated'), count: (all ?? []).filter((r) => r.status === 'ESCALATED').length }, { id: 'all', label: t('All in my scope'), count: (all ?? []).length }]} />}
      list={<InboxList label={tab === 'waiting' ? t('Waiting on you') : tab === 'escalated' ? t('Escalated') : t('All cases')} count={rows.length} emptyState={<Empty>{t('Nothing here.')}</Empty>}>
        {rows.map((r) => (
          <InboxItem key={r.ref} selected={sel === r.ref} onSelect={() => setSel(r.ref)} unread={r.status === 'WAITING' && tab === 'waiting'}
            reference={<Ref>{r.ref}</Ref>} state={<StatusChip status={r.status} />} title={bi(r.title, r.title_ar)}
            preview={r.result?.recommendation ? `${t('Agent')}: ${bi(r.result.recommendation.summary, r.result.recommendation.summary_ar)}` : bi(r.subject_name, r.subject_name_ar)}
            meta={r.sla_due && ['WAITING', 'ESCALATED'].includes(r.status) ? until(r.sla_due, lang) : ago(r.updated_at, lang)} />
        ))}
      </InboxList>}
      reader={<InboxReader empty={t('Choose a case. The reader ends in the decision it needs.')}>{sel ? <CaseBody caseRef={sel} /> : null}</InboxReader>}
    />
  );
}

export function TeamApprovals() {
  return (
    <Screen hero={<Hero tone="surface" eyebrow="My Team" title="Approvals" lede="Leave, advances, probation and hiring decisions for your team. Each arrives with the agent's check and the policy clause behind it." />}>
      <DecisionInbox />
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
    <Screen hero={<Hero tone="surface" eyebrow="My Team" title="Hiring" lede="Your vacancies, Hessa's evidence for each applicant and the shortlists waiting for you. Hessa never ranks or rejects anyone." />}>
      <Panel icon={<Briefcase size={16} />} title={mine.length ? 'My requisitions' : 'Requisitions in my division'}>
        <Table><thead><tr><th>{t('Requisition')}</th><th>{t('Role')}</th><th>{t('Opened')}</th><th>{t('Applicants')}</th><th>{t('Shortlisted')}</th><th>{t('Saudi applicants')}</th><th>{t('Status')}</th><th></th></tr></thead>
          <tbody>{list.map((r: any) => {
            const f = r.funnel ?? {};
            const n = Object.values(f).reduce((a: number, b: any) => a + Number(b), 0) as number;
            return <tr key={r.id}><td><Ref>{r.req_number}</Ref></td><td>{bi(r.title, r.title_ar)}<span className="block text-xs text-muted-foreground">{r.department} · {r.grade}</span></td><td>{date(r.opened_date, lang)}</td><td className="tabular-nums">{n}</td><td className="tabular-nums">{(f.SHORTLISTED ?? 0) + (f.INTERVIEW ?? 0) + (f.ASSESSMENT ?? 0)}</td><td className="tabular-nums">{r.saudi_applicants}</td><td><StatusChip status={r.status} /></td><td>{r.open_case ? <Btn small kind="primary" onClick={() => openCase(r.open_case)}>{t('Decide')}</Btn> : null}</td></tr>;
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
    <Screen hero={<Hero tone="surface" eyebrow="My Team" title="Performance" lede="Goal progress and review status for each person. Mezan prepares the evidence for check-ins and reviews; you rate." />}>
      <Panel icon={<TrendingUp size={16} />} title="Review cycle">
        <Table><thead><tr><th>{t('Person')}</th><th>{t('Goals')}</th><th>{t('Review status')}</th><th>{t('Self')}</th><th>{t('Your rating')}</th><th>{t('Probation')}</th></tr></thead>
          <tbody>{team.map((m) => <tr key={m.person_id}><td><Person name={bi(m.display_name, m.display_name_ar)} sub={bi(m.job_name, m.job_name_ar)} size={24} /></td><td className="min-w-[140px]"><div className="flex items-center gap-2"><Bar value={m.goals ?? 0} /><span className="font-mono text-[11px]">{m.goals ?? '—'}%</span></div></td><td><StatusChip status={m.review?.status} /></td><td className="tabular-nums">{m.review?.self_rating ?? '—'}</td><td className="tabular-nums">{m.review?.manager_rating ?? '—'}</td><td>{m.probation_status === 'IN_PROBATION' ? <Chip tone={daysUntil(m.probation_end_date) < 30 ? 'warn' : undefined}>{date(m.probation_end_date, lang)}</Chip> : <span className="text-xs text-muted-foreground">{t('Confirmed')}</span>}</td></tr>)}</tbody></Table>
      </Panel>
      <Panel icon={<Target size={16} />} title="How ratings work">
        <p className="text-sm">{t('Ratings run 1 to 5. As a guide no more than 15% of a division is rated 5 and about 60% sits at 3. Ratings are calibrated by division before they are shared, and the panel records a reason for every change.')} <span className="font-mono text-[11px] text-muted-foreground">HR-09 §9.3–9.4</span></p>
      </Panel>
    </Screen>
  );
}
void CalendarDays;
