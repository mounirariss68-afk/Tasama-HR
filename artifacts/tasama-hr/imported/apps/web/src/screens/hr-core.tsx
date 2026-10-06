/** HR Workspace core: inbox, the lifecycle board, the workforce and person 360. */
import { useEffect, useMemo, useState } from 'react';
import { HeroFeature, PageColumns, Panel, PanelAction, StatRow, StatTile, StatusRow } from '@cognirise/atelier/layout';
import { OutputCard, WorkItemCard, WorkspaceLane, WorkspaceLanes, ProvenanceChip } from '@cognirise/atelier/archetypes';
import { ArrowLeft, Building2, Flag, Inbox, LogIn, Search, Send, Users } from 'lucide-react';
import { useApi } from '../lib/api';
import { useLang } from '../lib/i18n';
import { aed, ago, date, num, until } from '../lib/format';
import { useApp } from '../app/state';
import { AgentTag, Bar, Btn, Chip, Empty, Hero, Kv, Person, Ref, Screen, SourceStamp, StatusChip, Table } from '../app/ui';
import { DecisionInbox } from './team';
import { LifecycleRing, STAGES, stageCounts } from '../app/ring';
import { roleName } from '../app/case';

export function HrInbox() {
  const { t, bi } = useLang();
  const { persona } = useApp();
  const { data: life } = useApi<any>('/lifecycle');
  const { data: inbox } = useApi<any[]>('/requests?view=inbox');
  const inflight = life?.inflight ?? [];
  return (
    <Screen hero={<Hero eyebrow="HR Workspace" title="Inbox" lede={`${t('Cases waiting on you as')} ${bi(persona?.label, persona?.label_ar)}. ${t('The agents have done the checking; what is left is the decision.')}`}
      media={<LifecycleRing counts={stageCounts(inflight)} center={inflight.length} centerLabel={t('cases in flight in your scope')} />} />}>
      <DecisionInbox scope="all" />
    </Screen>
  );
}

export function Lifecycle() {
  const { t, bi, lang } = useLang();
  const { openCase } = useApp();
  const { data } = useApi<any>('/lifecycle', { poll: 8000 });
  const [stage, setStage] = useState<string>('all');
  const filt = (rows: any[]) => (stage === 'all' ? rows : rows.filter((r) => STAGES.find((s) => s.key === stage)?.wfs.includes(r.workflow_id)));
  const ch: Record<string, [string, string]> = { CHAT: ['Chat', 'المحادثة'], FORM: ['Form', 'نموذج'], EVENT: ['HRMS event', 'حدث في النظام'], SCHEDULE: ['Schedule', 'جدول'], SCENARIO: ['Scenario', 'سيناريو'] };
  if (!data) return null;
  return (
    <Screen hero={<Hero tone="surface" eyebrow="HR Workspace" title="Lifecycle" lede="One board for hire to retire. What arrived and from where, what is in flight and who holds it, what came out and where it went." media={<LifecycleRing counts={stageCounts(data.inflight)} center={data.inflight.length} centerLabel={t('in flight')} />} />}>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => setStage('all')} className={`mono-chip ${stage === 'all' ? 'is-primary' : ''}`}>{t('All stages')}</button>
        {STAGES.map((s) => <button key={s.key} type="button" onClick={() => setStage(s.key)} className={`mono-chip ${stage === s.key ? 'is-primary' : ''}`}>{bi(s.en, s.ar)}</button>)}
      </div>
      <WorkspaceLanes>
        <WorkspaceLane icon={<LogIn size={16} />} title={t('Intake')} count={filt(data.intake).length} caption={t('Arrived in the last three days')}>
          {filt(data.intake).map((r: any) => <WorkItemCard key={r.ref} reference={<Ref>{r.ref}</Ref>} title={bi(r.title, r.title_ar)} state={<Chip>{bi(...(ch[r.channel] ?? [r.channel, r.channel]))}</Chip>} meta={<span className="text-xs text-muted-foreground">{bi(r.subject_name, r.subject_name_ar)} · {ago(r.created_at, lang)}</span>} onOpen={() => openCase(r.ref)} />)}
        </WorkspaceLane>
        <WorkspaceLane icon={<Inbox size={16} />} title={t('In flight')} count={filt(data.inflight).length} caption={t('Every item shows who holds it')} tone="accent">
          {filt(data.inflight).map((r: any) => <WorkItemCard key={r.ref} reference={<Ref>{r.ref}</Ref>} title={bi(r.title, r.title_ar)} state={<StatusChip status={r.status} />}
            handler={<span className="text-xs">{r.waiting_on_name ? <>{t('With')} <span className="font-medium">{bi(r.waiting_on_name, r.waiting_on_name_ar)}</span> · {roleName(r.waiting_on_role, bi)}</> : r.last_agent ? <AgentTag id={r.last_agent} showChip={false} /> : '—'}</span>}
            meta={<span className="text-xs text-muted-foreground">{until(r.sla_due, lang)}</span>} onOpen={() => openCase(r.ref)} />)}
        </WorkspaceLane>
        <WorkspaceLane icon={<Send size={16} />} title={t('Output')} count={filt(data.output).length} caption={t('Closed in the last seven days, with its destination')}>
          {filt(data.output).map((r: any) => <OutputCard key={r.ref} title={bi(r.title, r.title_ar)} format={<Ref>{r.ref}</Ref>} destination={r.destination} provenance={<ProvenanceChip kind="synthetic" />} meta={<span className="text-xs text-muted-foreground">{ago(r.closed_at, lang)}</span>} onOpen={() => openCase(r.ref)} />)}
        </WorkspaceLane>
      </WorkspaceLanes>
    </Screen>
  );
}

export function Workforce() {
  const { t, bi, lang } = useLang();
  const { route, go } = useApp();
  const [q, setQ] = useState(route.screen === 'hr-workforce' && route.param ? route.param : '');
  const [debounced, setDebounced] = useState(q);
  useEffect(() => { const h = setTimeout(() => setDebounced(q), 250); return () => clearTimeout(h); }, [q]);
  const { data: people } = useApi<any[]>(`/workforce${debounced ? `?q=${encodeURIComponent(debounced)}` : ''}`);
  const { data: org } = useApi<any>('/org');
  const divisions = useMemo(() => {
    const m = new Map<string, any>();
    for (const d of org?.departments ?? []) { const x = m.get(d.division) ?? { division: d.division, division_ar: d.division_ar, headcount: 0, saudi: 0, women: 0, vacancies: 0, depts: 0 }; x.headcount += d.headcount; x.saudi += d.saudi; x.women += d.women; x.vacancies += d.vacancies; x.depts++; m.set(d.division, x); }
    return [...m.values()].sort((a, b) => b.headcount - a.headcount);
  }, [org]);
  const total = divisions.reduce((s, d) => s + d.headcount, 0);
  const e = org?.saudization;
  return (
    <Screen hero={<Hero tone="surface" eyebrow="HR Workspace" title="Workforce" lede="The HRMS record of every worker in your data scope, read through the connector. Open a person for their full record."
      feature={e ? <HeroFeature label="Saudization (Nitaqat)" value={`${e.ratio}%`} support={<Chip tone={e.ratio >= e.target ? 'success' : 'warn'}>{t('target')} {e.target}% · {e.band}</Chip>} /> : undefined} />}>
      <StatRow>
        <StatTile label="Headcount" value={num(total)} trend={{ direction: 'flat', label: `${org?.turnover12m ?? 0} ${t('leavers in 12 months')}` }} />
        <StatTile label="Saudi nationals" value={e ? num(e.saudi) : '—'} trend={{ direction: 'flat', label: e ? `${e.saudi} ${t('of')} ${e.total} ${t('employees')}${e.band ? ` · ${e.band}` : ''}` : '' }} />
        <StatTile label="Women" value={num(divisions.reduce((s, d) => s + d.women, 0))} trend={{ direction: 'flat', label: total ? `${Math.round(divisions.reduce((s, d) => s + d.women, 0) / total * 100)}%` : '' }} />
        <StatTile label="Vacant positions" value={num(divisions.reduce((s, d) => s + d.vacancies, 0))} />
      </StatRow>
      <PageColumns aside={<>
        <Panel icon={<Building2 size={16} />} title="By division" action={<SourceStamp resource="organizations" />}>
          {divisions.map((d) => <div key={d.division} className="py-2"><div className="flex items-center justify-between text-sm"><span>{bi(d.division, d.division_ar)}</span><span className="font-mono text-xs">{d.headcount}</span></div><Bar value={d.headcount} max={divisions[0]?.headcount} className="mt-1.5" /><p className="mt-1 text-[11px] text-muted-foreground">{d.saudi} {t('Saudi nationals')} · {d.women} {t('women')} · {d.vacancies} {t('vacant')}</p></div>)}
        </Panel>
        <Panel icon={<Flag size={16} />} title="Nationalities">
          {(org?.nationalities ?? []).map((n: any) => <StatusRow key={n.nationality} name={n.nationality} status={<span className="font-mono text-xs">{n.n}</span>} />)}
        </Panel>
      </>}>
        <Panel icon={<Users size={16} />} title="Directory" action={<div className="flex items-center gap-2 rounded-lg border border-border bg-background/40 px-2"><Search className="h-3.5 w-3.5 text-muted-foreground" /><input className="h-8 w-48 bg-transparent text-sm focus:outline-none" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Name, job, department')} /></div>}>
          <Table><thead><tr><th>{t('Person')}</th><th>{t('Department')}</th><th>{t('Grade')}</th><th>{t('Joined')}</th><th>{t('Status')}</th></tr></thead>
            <tbody>{(people ?? []).slice(0, 120).map((p) => <tr key={p.person_id} className="clickable" onClick={() => go('person', String(p.person_id))}><td><Person name={bi(p.display_name, p.display_name_ar)} sub={`${p.person_number} · ${bi(p.job_name, p.job_name_ar)}`} size={26} /></td><td className="text-sm">{bi(p.department_name, p.department_name_ar)}</td><td><Chip>{p.grade_code}</Chip></td><td className="whitespace-nowrap text-sm">{date(p.original_hire_date, lang)}</td><td>{p.probation_status === 'IN_PROBATION' ? <StatusChip status="IN_PROBATION" /> : p.is_saudi ? <Chip tone="success">{t('Saudi national')}</Chip> : null}</td></tr>)}</tbody></Table>
          {(people ?? []).length > 120 ? <p className="mt-2 text-xs text-muted-foreground">{t('Showing 120. Search to narrow.')}</p> : null}
        </Panel>
      </PageColumns>
    </Screen>
  );
}

export function PersonScreen() {
  const { t, bi, lang } = useLang();
  const { route, go, openCase, has } = useApp();
  const { data, error } = useApi<any>(route.param ? `/people/${route.param}` : null);
  if (error) return <Empty>{error}</Empty>;
  if (!data?.worker) return null;
  const w = data.worker;
  const annual = data.balances.find((b: any) => b.type_code === 'ANNUAL');
  return (
    <Screen hero={<Hero eyebrow={w.person_number} title={bi(w.display_name, w.display_name_ar)} lede={`${bi(w.job_name, w.job_name_ar)} · ${bi(w.department_name, w.department_name_ar)} · ${w.grade_code} · ${t('since')} ${date(w.original_hire_date, lang)}`}
      actions={<Btn onClick={() => go('hr-workforce')}><ArrowLeft className="h-4 w-4 rtl:rotate-180" />{t('Workforce')}</Btn>}
      feature={<HeroFeature label="Compa-ratio" value={w.basic ? (w.basic / w.grade_mid).toFixed(2) : '—'} support={<Chip>{w.grade_code}</Chip>} />} />}>
      <StatRow>
        <StatTile label="Basic salary" value={has('PAYROLL') || has('HRBP') || has('CHRO') ? aed(w.basic, lang) : '—'} trend={{ direction: 'flat', label: `${aed(w.grade_min, lang)}–${aed(w.grade_max, lang)}` }} />
        <StatTile label="Annual leave" value={num(annual?.balance, 1)} state={<Chip>{t('days')}</Chip>} />
        <StatTile label="Last rating" value={data.performance.find((p: any) => p.calibrated_rating)?.calibrated_rating ?? '—'} trend={{ direction: 'flat', label: data.performance.find((p: any) => p.calibrated_rating)?.review_period ?? '' }} />
        <StatTile label="End of service" value={aed(data.gratuity?.amount, lang)} trend={{ direction: 'flat', label: t('end-of-service award accrued (Art. 84)') }} />
      </StatRow>
      <PageColumns aside={<>
        <Panel icon={<Users size={16} />} title="Record" action={<SourceStamp resource="workers" />}>
          <dl className="grid grid-cols-2 gap-3">
            <Kv k={t('Manager')} v={bi(w.manager_name, w.manager_name_ar)} /><Kv k={t('Location')} v={bi(w.location_name, w.location_name_ar)} />
            <Kv k={t('Nationality')} v={w.nationality} /><Kv k={t('Contract ends')} v={date(w.contract_end_date, lang)} />
            <Kv k={t('Probation')} v={w.probation_status === 'IN_PROBATION' ? `${t('ends')} ${date(w.probation_end_date, lang)}` : t('Confirmed')} /><Kv k={t('Notice period')} v={`${w.notice_period_days} ${t('days')}`} />
            <Kv k={t(w.is_saudi ? 'National ID expires' : 'Iqama (ID) expires')} v={date(w.national_id_expiry, lang)} /><Kv k={t('Iqama expires')} v={w.iqama_expiry ? date(w.iqama_expiry, lang) : '—'} />
            <Kv k={t(w.is_saudi ? 'National ID' : 'Iqama number')} v={w.national_id_masked} mono /><Kv k={t('Bank')} v={`${w.bank_name}`} />
          </dl>
          <p className="mt-3 text-[11px] text-muted-foreground">{t('Identifiers are masked by role (Saudi PDPL; HR-13 §13.1).')}</p>
        </Panel>
        <Panel icon={<Inbox size={16} />} title="Cases">
          <div className="space-y-1">{data.cases.map((c: any) => <button key={c.ref} type="button" onClick={() => openCase(c.ref)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start hover:bg-primary/5"><Ref>{c.ref}</Ref><span className="min-w-0 flex-1 truncate text-sm">{bi(c.title, c.title_ar)}</span><StatusChip status={c.status} /></button>)}{!data.cases.length ? <Empty>{t('No cases.')}</Empty> : null}</div>
        </Panel>
      </>}>
        <Panel icon={<Building2 size={16} />} title="Assignment history" action={<SourceStamp resource="workers/assignments" />}>
          <Table><thead><tr><th>{t('From')}</th><th>{t('To')}</th><th>{t('Action')}</th><th>{t('Job')}</th><th>{t('Grade')}</th></tr></thead>
            <tbody>{data.history.map((h: any, i: number) => <tr key={i}><td className="whitespace-nowrap">{date(h.effective_start, lang)}</td><td className="whitespace-nowrap">{h.effective_end === '4712-12-31' ? t('current') : date(h.effective_end, lang)}</td><td><Chip>{h.action_code}</Chip></td><td>{h.job}</td><td>{h.grade}</td></tr>)}</tbody></Table>
        </Panel>
        {data.salaries.length ? <Panel icon={<Building2 size={16} />} title="Salary history" action={<SourceStamp resource="salaries" />}>
          <Table><thead><tr><th>{t('From')}</th><th>{t('Reason')}</th><th className="text-end">{t('Basic')}</th><th className="text-end">{t('Total')}</th></tr></thead>
            <tbody>{data.salaries.map((s: any) => <tr key={s.id}><td>{date(s.date_from, lang)}</td><td className="text-sm">{s.reason}</td><td className="text-end tabular-nums">{aed(s.basic, lang)}</td><td className="text-end tabular-nums">{aed(s.basic + s.housing + s.transport + s.other_allowance, lang)}</td></tr>)}</tbody></Table>
        </Panel> : null}
        {data.entries.length ? <Panel icon={<Building2 size={16} />} title="Current element entries" action={<SourceStamp resource="elementEntries" />}>
          <Table><thead><tr><th>{t('Element')}</th><th className="text-end">{t('Amount')}</th><th>{t('From')}</th><th>{t('Source')}</th></tr></thead>
            <tbody>{data.entries.map((e: any, i: number) => <tr key={i}><td>{e.name}</td><td className="text-end tabular-nums">{aed(e.amount, lang)}</td><td>{date(e.effective_start, lang)}</td><td><Chip tone={e.source === 'RAFEEQ' ? 'primary' : undefined}>{e.source}</Chip></td></tr>)}</tbody></Table>
        </Panel> : null}
        <Panel icon={<Building2 size={16} />} title="Reviews">
          <Table><thead><tr><th>{t('Period')}</th><th>{t('Status')}</th><th>{t('Self')}</th><th>{t('Manager')}</th><th>{t('Calibrated')}</th></tr></thead>
            <tbody>{data.performance.map((p: any) => <tr key={p.review_period}><td>{p.review_period}</td><td><StatusChip status={p.status} /></td><td>{p.self_rating ?? '—'}</td><td>{p.manager_rating ?? '—'}</td><td>{p.calibrated_rating ?? '—'}{p.calibration_note ? <span className="block text-xs text-muted-foreground">{p.calibration_note}</span> : null}</td></tr>)}</tbody></Table>
        </Panel>
      </PageColumns>
    </Screen>
  );
}
