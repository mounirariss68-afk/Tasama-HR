/** HR Workspace: positions and hiring, onboarding and probation, performance and talent. */
import { Fragment, useState } from 'react';
import { HeroFeature, PageColumns, Panel, PanelAction, StatTile, StatusRow } from '@cognirise/atelier/layout';
import { ProvenanceNote } from '@cognirise/atelier/archetypes';
import { Award, Briefcase, ClipboardList, Grid3x3, Hourglass, Plane, Scale, ShieldAlert, UserPlus, Users } from 'lucide-react';
import { useApi } from '../lib/api';
import { useLang } from '../lib/i18n';
import { aed, date, daysUntil, num } from '../lib/format';
import { useApp } from '../app/state';
import { owner, plain } from '../app/decision';
import { ClockBar, Funnel, Progress } from '../app/viz';
import { AgentTag, Bar, Btn, Chip, Empty, Hero, Person, Ref, Screen, SourceStamp, StatusChip, Table, StatRow, TabStrip } from '../app/ui';

const PHASES = ['NEW', 'SCREENING', 'SHORTLISTED', 'INTERVIEW', 'ASSESSMENT', 'OFFER', 'HIRED'];

export function HrHiring() {
  const { t, bi, lang } = useLang();
  const { openCase } = useApp();
  const { data } = useApi<any>('/hiring');
  const [req, setReq] = useState<number | null>(null);
  const detail = useApi<any>(req ? `/hiring/requisitions/${req}` : null);
  if (!data) return null;
  const open = data.requisitions.filter((r: any) => r.status === 'OPEN');
  const pos = Object.fromEntries(data.positions.map((p: any) => [p.hiring_status, p.n]));
  const totals = PHASES.map((ph) => open.reduce((s: number, r: any) => s + Number(r.funnel?.[ph] ?? 0), 0));
  return (
    <Screen hero={<Hero tone="surface" eyebrow="HR Workspace" title={`${open.length} ${t('requisitions are open, with')} ${totals.reduce((a, b) => a + b, 0)} ${t('applicants')}`} lede={t('Positions, requisitions, applicants and offers in your scope. Internal talent is invited first.')} />}>
      <StatRow>
        <StatTile label="Filled positions" value={num(pos.FILLED ?? 0)} />
        <StatTile label="In recruitment" value={num(pos.IN_RECRUITMENT ?? 0)} />
        <StatTile label="Approved, not yet posted" value={num(pos.APPROVED ?? 0)} />
        <StatTile label="Vacant" value={num(pos.VACANT ?? 0)} trend={{ direction: 'flat', label: t('backfill needed'), sentiment: 'bad' }} />
      </StatRow>
      <Panel icon={<ClipboardList size={16} />} title={`${totals[totals.length - 1] + totals[totals.length - 2]} ${t('of')} ${totals.reduce((a, b) => a + b, 0)} ${t('applicants have reached an offer')}`} action={<PanelAction>{t('Open requisitions')}</PanelAction>}>
        <Funnel stages={PHASES.map((ph, i) => ({ label: t(({ NEW: 'Applied', SCREENING: 'Screening', SHORTLISTED: 'Shortlisted', INTERVIEW: 'Interview', ASSESSMENT: 'Assessment', OFFER: 'Offer', HIRED: 'Hired' } as any)[ph]), value: totals.slice(i).reduce((a, b) => a + b, 0) }))} />
      </Panel>
      <Panel icon={<Briefcase size={16} />} title="Requisitions">
        <Table><thead><tr><th>{t('Role')}</th><th>{t('Hiring manager')}</th><th>{t('Recruiter')}</th><th className="text-end">{t('Applicants')}</th><th className="text-end">{t('Saudi')}</th><th>{t('Saudi priority')}</th><th>{t('Status')}</th><th></th></tr></thead>
          <tbody>{data.requisitions.map((r: any) => {
            const n = Object.values(r.funnel ?? {}).reduce((a: number, b: any) => a + Number(b), 0) as number;
            return <tr key={r.id} className="clickable" onClick={() => setReq(r.id)}><td>{bi(r.title, r.title_ar)}<span className="block text-xs text-muted-foreground">{r.department} · {r.grade}</span></td><td className="text-sm">{r.hiring_manager}</td><td className="text-sm">{r.recruiter}</td><td className="text-end tabular-nums">{n}</td><td className="text-end tabular-nums">{r.saudi_applicants}</td><td>{r.saudi_priority ? <Chip tone="success">{t('Yes')}</Chip> : null}</td><td><StatusChip status={r.status} /></td><td>{r.open_case ? <Btn small kind="primary" onClick={() => openCase(r.open_case)}>{t('Open case')}</Btn> : null}</td></tr>;
          })}</tbody></Table>
      </Panel>
      {req && detail.data ? (
        <Panel icon={<Users size={16} />} title={`${t('Evidence')} · ${bi(detail.data.requisition.title, detail.data.requisition.title_ar)}`} action={<PanelAction onClick={() => setReq(null)}>{t('Close')}</PanelAction>}>
          <div className="mb-2 flex items-center gap-2"><AgentTag id="hessa" /><span className="text-xs text-muted-foreground">{t('● evident · ◐ partly · ○ not evident in the application')}</span></div>
          <Table><thead><tr><th>{t('Candidate')}</th>{detail.data.requisition.criteria.map((c: any) => <th key={c.key}>{c.label}<span className="block font-normal normal-case">{c.kind === 'must' ? t('must') : t('nice')}</span></th>)}<th>{t('Source')}</th><th>{t('Phase')}</th></tr></thead>
            <tbody>{detail.data.applications.map((a: any) => <tr key={a.id}><td className="whitespace-nowrap">{a.first_name} {a.last_name}<span className="block text-[11px] text-muted-foreground">{a.years_experience} {t('years of experience')}</span></td>{a.evidence.map((e: any) => <td key={e.key} title={e.note}><span className={e.status === 'evident' ? 'text-success' : e.status === 'partial' ? 'text-warn' : 'text-muted-foreground'}>{e.status === 'evident' ? '●' : e.status === 'partial' ? '◐' : '○'}</span></td>)}<td className="text-xs">{a.source}</td><td><StatusChip status={a.phase} /></td></tr>)}</tbody></Table>
        </Panel>
      ) : null}
      <PageColumns aside={<Panel icon={<Briefcase size={16} />} title="Offers">
        {data.offers.map((o: any) => <StatusRow key={o.offer_number} name={`${o.candidate} · ${o.position}`} detail={`${aed(o.basic, lang)} ${t('basic')} · ${o.grade} · ${t('start')} ${date(o.start_date, lang)}`} status={<StatusChip status={o.status} />} />)}
      </Panel>}>
        {data.assessment ? (
          <Panel icon={<Scale size={16} />} title={`${t('Assessment centre')} · ${data.assessment.centre.name}`} action={<AgentTag id="tamkeen" />}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>{data.assessment.participants.map((p: any) => <div key={p.participant} className="py-1.5"><div className="flex justify-between text-sm"><span>{p.name}</span><span className="font-mono text-xs">{p.mean.toFixed(2)}</span></div><Bar value={p.mean} max={5} className="mt-1" /></div>)}</div>
              <div className="space-y-2">{data.assessment.flags.length ? data.assessment.flags.map((f: any, i: number) => <div key={i} className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm"><p className="font-medium">{f.name}: {f.competency}</p><p className="text-xs text-muted-foreground">{f.high.assessor} {f.high.score} · {f.low.assessor} {f.low.score} — {t('discuss before integrating')}</p></div>) : <Empty>{t('No assessor disagreement of 2 points or more.')}</Empty>}</div>
            </div>
          </Panel>
        ) : null}
      </PageColumns>
    </Screen>
  );
}

export function HrOnboarding() {
  const { t, bi, lang } = useLang();
  const { openCase, go } = useApp();
  const { data } = useApi<any>('/onboarding', { poll: 8000 });
  if (!data) return null;
  const pre = data.journeys.filter((j: any) => j.template === 'PREBOARDING');
  const onb = data.journeys.filter((j: any) => j.template === 'ONBOARDING');
  const blocked = pre.flatMap((j: any) => j.tasks.filter((x: any) => x.status === 'BLOCKED').map((x: any) => ({ ...x, who: j.display_name })));
  return (
    <Screen hero={<Hero tone="surface" eyebrow="HR Workspace" title={`${pre.length} ${t(pre.length === 1 ? 'joiner is in pre-boarding' : 'joiners are in pre-boarding')}${blocked.length ? `; ${blocked.length} ${t(blocked.length === 1 ? 'step is blocked' : 'steps are blocked')}` : ''}`} lede={t('Each joiner\'s pre-boarding with the Qiwa, GOSI and Muqeem steps, the first 90 days, and every probation that ends soon.')} />}>
      {pre.map((j: any) => {
        const done = j.tasks.filter((x: any) => x.status === 'DONE').length;
        return (
          <Panel key={j.id} icon={<Plane size={16} />} title={`${bi(j.display_name, j.display_name_ar)} · ${j.job}`} action={<span className="flex w-64 items-center gap-2"><Progress done={done} total={j.tasks.length} /><span className="whitespace-nowrap text-xs tabular-nums">{done}/{j.tasks.length}</span><Chip>{t('starts')} {date(j.start_date, lang)}</Chip></span>}>
            <div className="mb-3 flex items-center gap-2"><span className="text-xs text-muted-foreground">{j.department} · {j.is_saudi ? t('Saudi national: GOSI registration, no visa or iqama') : t('Expatriate: Qiwa contract, work visa, Muqeem iqama and CCHI insurance')}</span></div>
            <div className="flex gap-1.5 overflow-x-auto pb-1 scroll-thin">
              {j.tasks.map((x: any) => (
                <div key={x.id} className={`min-w-[150px] rounded-lg border px-3 py-2 ${x.status === 'BLOCKED' ? 'border-danger/50 bg-danger/10' : x.status === 'DONE' ? 'border-success/40 bg-success/5' : 'border-border/60 bg-card/40'}`}>
                  <StatusChip status={x.status} />
                  <p className="mt-1.5 text-[12.5px] font-medium leading-snug">{bi(x.title, x.title_ar)}</p>
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">{owner(x.owner)}{x.external_system ? ` · ${x.external_system}` : ''} · {date(x.due_date, lang)}</p>
                  {x.note ? <p className="mt-1 text-[11px] text-danger">{x.note}</p> : null}
                </div>
              ))}
            </div>
          </Panel>
        );
      })}
      <PageColumns aside={<Panel icon={<UserPlus size={16} />} title="First 90 days">
        {onb.length ? onb.map((j: any) => { const done = j.tasks.filter((x: any) => x.status === 'DONE').length; return <div key={j.id} className="py-2"><div className="flex justify-between text-sm"><span>{bi(j.display_name, j.display_name_ar)}</span><span className="font-mono text-xs">{done}/{j.tasks.length}</span></div><Bar value={done} max={j.tasks.length} tone="success" className="mt-1" /><p className="mt-1 text-[11px] text-muted-foreground">{j.job} · {t('joined')} {date(j.start_date, lang)}</p></div>; }) : <Empty>{t('No joiners in their first 90 days.')}</Empty>}
      </Panel>}>
        <Panel icon={<Hourglass size={16} />} title="Probation">
          <Table><thead><tr><th>{t('Person')}</th><th>{t('Department')}</th><th>{t('Manager')}</th><th>{t('Ends')}</th><th>{t('Days left')}</th><th>{t('Case')}</th></tr></thead>
            <tbody>{data.probation.map((p: any) => { const d = daysUntil(p.probation_end_date); return <tr key={p.id}><td><button type="button" className="text-start" onClick={() => go('person', String(p.id))}><Person name={bi(p.display_name, p.display_name_ar)} size={24} /></button></td><td className="text-sm">{p.department}</td><td className="text-sm">{p.manager}</td><td>{date(p.probation_end_date, lang)}</td><td className="min-w-[7rem]"><span className="text-xs tabular-nums">{d} {t('days')}</span><ClockBar compact start={new Date(new Date(`${String(p.probation_end_date).slice(0, 10)}T00:00:00Z`).getTime() - 30 * 86400000).toISOString()} due={p.probation_end_date} /></td><td>{p.case_ref ? <button type="button" onClick={() => openCase(p.case_ref)}><StatusChip status={p.case_status} /></button> : <span className="text-xs text-muted-foreground">{d <= 30 ? t('Opens today') : '—'}</span>}</td></tr>; })}</tbody></Table>
        </Panel>
      </PageColumns>
    </Screen>
  );
}

export function HrPerformance() {
  const { t, bi } = useLang();
  const { openCase } = useApp();
  const [division, setDivision] = useState('Commercial');
  const [tab, setTab] = useState('ratings');
  const { data } = useApi<any>(`/performance?division=${encodeURIComponent(division)}`);
  const { data: cal } = useApi<any[]>('/requests?view=all&workflow=WF-10,WF-12');
  if (!data) return null;
  const c = data.calibration;
  const progress = data.progress.filter((p: any) => p.division === division);
  const totalDocs = progress.reduce((s: number, p: any) => s + p.n, 0);
  const grid = (perf: number, pot: string) => data.grid.filter((g: any) => (g.rating ? (g.rating <= 2 ? 1 : g.rating === 3 ? 2 : 3) : 0) === perf && g.potential === pot);
  const calCase = (cal ?? []).find((r: any) => r.workflow_id === 'WF-10' && ['WAITING', 'ESCALATED'].includes(r.status));
  return (
    <Screen hero={<Hero tone="surface" eyebrow="HR Workspace" title={`${c.flags.length} ${t(c.flags.length === 1 ? 'rating in' : 'ratings in')} ${t(division)} ${t('need a look before they are shared')}`} lede={`${c.n} ${t('of')} ${totalDocs} ${t('reviews rated by managers; average')} ${c.average.toFixed(2)}. ${t('Calibration, the 9-box and succession for critical roles.')}`}
      actions={calCase ? <Btn kind="primary" onClick={() => openCase(calCase.ref)}>{t('Open the calibration case')}</Btn> : undefined}
      />}>
      <div className="flex flex-wrap gap-1.5">{data.divisions.map((d: string) => <button key={d} type="button" onClick={() => setDivision(d)} className={`mono-chip ${division === d ? 'is-primary' : ''}`}>{t(d)}</button>)}</div>
      <TabStrip items={[{ id: 'ratings', label: 'Ratings' }, { id: 'succession', label: 'Succession and promotion' }]} value={tab} onChange={setTab} />
      {tab === 'ratings' ? <>
      <PageColumns aside={<Panel icon={<ShieldAlert size={16} />} title="Mezan's flags" action={<AgentTag id="mezan" showChip={false} />}>
        <div className="space-y-2">{c.flags.length ? c.flags.map((f: any, i: number) => <div key={i} className="rounded-lg border border-border/60 bg-card/50 px-3 py-2"><div className="flex items-center gap-2"><StatusChip status={f.severity} /><Chip>{t(({ DISTRIBUTION: 'Distribution', LENIENCY: 'Leniency', RATING_VS_GOALS: 'Rating vs goals', GENDER_GAP: 'Gender gap' } as any)[f.kind] ?? f.kind)}</Chip></div><p className="mt-1.5 text-sm">{bi(f.text, f.text_ar)}</p></div>) : <Empty>{t('No flags.')}</Empty>}</div>
      </Panel>}>
        <Panel icon={<Scale size={16} />} title="Rating distribution against the guide">
          <div className="flex h-48 items-end gap-3">
            {c.distribution.map((d: any) => {
              const share = c.n ? d.count / c.n : 0;
              return (
                <div key={d.rating} className="flex h-full flex-1 flex-col items-center justify-end">
                  <span className="mb-1 font-mono text-xs tabular-nums">{d.count} · {Math.round(share * 100)}%</span>
                  <div className={`w-full rounded-t-md ${d.rating === 5 && share > 0.15 ? 'bg-danger/80' : 'bg-primary/75'}`} style={{ height: `${Math.max(2, share * 100 * 1.6)}%` }} title={`${d.count}`} />
                  <span className="mt-1.5 text-sm font-semibold">{d.rating}</span>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{t('Guide: about 60% at 3, no more than 15% at 5. Red marks a band above its guide.')}</p>
        </Panel>
        <Panel icon={<Grid3x3 size={16} />} title="9-box: performance and potential">
          <div className="grid grid-cols-[auto_1fr_1fr_1fr] gap-1.5 text-xs">
            {['HIGH', 'MEDIUM', 'LOW'].map((pot) => (
              <Fragment key={pot}>
                <div className="flex items-center pe-2 font-mono text-[10px] uppercase text-muted-foreground">{t(pot === 'HIGH' ? 'High potential' : pot === 'MEDIUM' ? 'Medium' : 'Low')}</div>
                {[1, 2, 3].map((perf) => { const cell = grid(perf, pot); return <div key={`${pot}-${perf}`} className={`min-h-[64px] rounded-lg border p-2 ${perf === 3 && pot === 'HIGH' ? 'border-success/50 bg-success/10' : perf === 1 && pot === 'LOW' ? 'border-danger/40 bg-danger/5' : 'border-border/60 bg-card/40'}`}><p className="text-lg font-bold tabular-nums">{cell.length}</p><p className="truncate text-[11px] text-muted-foreground">{cell.slice(0, 3).map((g: any) => g.display_name.split(' ')[0]).join(', ')}</p></div>; })}
              </Fragment>
            ))}
            <div /><div className="text-center font-mono text-[10px] uppercase text-muted-foreground">{t('Below')}</div><div className="text-center font-mono text-[10px] uppercase text-muted-foreground">{t('Meets')}</div><div className="text-center font-mono text-[10px] uppercase text-muted-foreground">{t('Exceeds')}</div>
          </div>
        </Panel>
      </PageColumns>
      </> : <>
      <PageColumns aside={<Panel icon={<Award size={16} />} title="Promotion cases">
        {(cal ?? []).filter((r: any) => r.workflow_id === 'WF-12').map((r: any) => <StatusRow key={r.ref} name={bi(r.title, r.title_ar)} status={<button type="button" onClick={() => openCase(r.ref)}><StatusChip status={r.status} /></button>} />)}
      </Panel>}>
        <Panel icon={<Users size={16} />} title="Succession for critical roles" action={<AgentTag id="tarqiya" showChip={false} />}>
          <Table><thead><tr><th>{t('Position')}</th><th>{t('Incumbent')}</th><th>{t('Risk of loss')}</th><th>{t('Bench')}</th></tr></thead>
            <tbody>{data.succession.map((s: any) => <tr key={s.id}><td className="text-sm">{s.position}</td><td className="text-sm">{s.incumbent}</td><td><StatusChip status={s.risk_of_loss} /></td><td className="text-xs">{(s.bench ?? []).map((b: any) => `${b.name} (${t(b.readiness === 'READY_NOW' ? 'ready now' : b.readiness === 'READY_1_2' ? '1–2 yrs' : '3+ yrs')})`).join(', ') || <Chip tone="danger">{t('No successor')}</Chip>}</td></tr>)}</tbody></Table>
        </Panel>
      </PageColumns>
      </>}
    </Screen>
  );
}
