/** How it works: the agents, the workflows, the rules, the audit trail and integration log, the value; plus the Demo control's scenarios and settings screens. */
import { useEffect, useMemo, useState } from 'react';
import { HeroFeature, PageColumns, Panel, PanelAction, StatTile, StatusRow, ThemeModeToggle } from '@cognirise/atelier/layout';
import { AgentAutonomyChip, AgentCard, AgentDirectory, AgentProfile, PersonaSwitcher, ProvenanceNote, ScenarioCard, ScenarioRunner, SettingsGroup, SettingsRow, WorkflowCard, WorkflowCatalog, WorkflowStep, WorkflowWalkthrough, type AgentAutonomy } from '@cognirise/atelier/archetypes';
import { Activity, ArrowRightLeft, BookOpen, Bot, Database, FileText, GitBranch, Languages, LineChart, Network, Play, RotateCcw, Scale, Server, ShieldCheck, Users, Zap } from 'lucide-react';
import { api, bump, post, useApi } from '../lib/api';
import { LanguageToggle, useLang } from '../lib/i18n';
import { ago, date, dateTime, month, num, time } from '../lib/format';
import { usePresent, StorylineEditor } from '../app/present';
import { useApp } from '../app/state';
import { AgentTag, AUTONOMY, Bar, Btn, Chip, Empty, Hero, Ref, RouteTabs, Screen, StatusChip, Table, StatRow } from '../app/ui';
import { TrailList, roleName } from '../app/case';

// ------------------------------------------------------------------ Agents

export function AgentsScreen() {
  const { t, bi } = useLang();
  const { data } = useApi<any[]>('/agents');
  const [sel, setSel] = useState<string | null>(null);
  const a = data?.find((x) => x.id === sel);
  const trail = useApi<any[]>(sel ? `/agents/${sel}/trail` : null);
  const ladder = useMemo(() => ['A0', 'A1', 'A2', 'A3', 'A4'].map((l) => ({ l, n: (data ?? []).filter((x) => x.autonomy === l).length })), [data]);
  if (!data) return null;
  const toAgent = (x: any) => ({ id: x.id, name: bi(x.name, x.name_ar), role: bi(x.title, x.title_ar), purpose: bi(x.purpose, x.purpose_ar), initials: bi(x.name, x.name_ar).slice(0, 2), autonomy: AUTONOMY[x.autonomy] as AgentAutonomy });
  return (
    <Screen hero={<Hero eyebrow="How it works" title={`${t('None of the')} ${data.length} ${t('agents decides on its own')}`} lede={t('An agent reads, checks, prepares and recommends; a person decides, and going against a recommendation needs a reason, kept as an override. Nothing reaches a client\'s HRMS until a person approves it.')} />}>
      <Panel icon={<ShieldCheck size={16} />} title="The autonomy ladder">
        <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(11rem,1fr))]">
          {ladder.map(({ l, n }) => <div key={l} className="rounded-xl glass-l3 px-4 py-3"><AgentAutonomyChip level={AUTONOMY[l]} /><p className="mt-2 text-2xl font-bold tabular-nums">{n}</p><p className="text-xs text-muted-foreground">{data.filter((x) => x.autonomy === l).map((x) => bi(x.name, x.name_ar)).join(', ') || t('none')}</p></div>)}
        </div>
      </Panel>
      {a ? (
        <PageColumns aside={<Panel icon={<Activity size={16} />} title="Recent activity"><TrailList rows={trail.data ?? []} compact /></Panel>}>
          <AgentProfile agent={toAgent(a)} onClose={() => setSel(null)} functions={a.functions} superpower={a.superpower} impact={a.impact}
            stats={[{ label: t('Steps taken'), value: num(a.stats.actions) }, { label: t('Cases'), value: num(a.stats.cases) }, { label: t('Refusals'), value: num(a.stats.refusals) }, { label: t('Escalations'), value: num(a.stats.escalations) }, { label: t('Overridden by people'), value: num(a.stats.overridden) }, ...(a.stats.answers ? [{ label: t('Answers'), value: num(a.stats.answers) }] : [])]} />
          <Panel icon={<Database size={16} />} title="Remit and access">
            <dl className="grid gap-4 sm:grid-cols-2">
              <div><dt className="eyebrow mb-1">{t('Owner')}</dt><dd className="text-sm">{bi(a.owner_name, a.owner_name_ar)}</dd></div>
              <div><dt className="eyebrow mb-1">{t('Who decides')}</dt><dd className="text-sm">{a.decides}</dd></div>
              <div><dt className="eyebrow mb-1">{t('Tools')}</dt><dd className="flex flex-wrap gap-1">{a.tools.map((x: string) => <Chip key={x}>{x}</Chip>)}</dd></div>
              <div><dt className="eyebrow mb-1">{t('HRMS resources read')}</dt><dd className="flex flex-wrap gap-1">{a.hcm_reads.map((x: string) => <Chip key={x} tone="primary">{x}</Chip>)}</dd></div>
              <div><dt className="eyebrow mb-1">{t('HRMS resources written (after approval)')}</dt><dd className="flex flex-wrap gap-1">{a.hcm_writes.length ? a.hcm_writes.map((x: string) => <Chip key={x} tone="warn">{x}</Chip>) : <span className="text-sm text-muted-foreground">{t('none: read-only')}</span>}</dd></div>
              <div><dt className="eyebrow mb-1">{t('Stage')}</dt><dd className="text-sm">{a.stage}</dd></div>
            </dl>
          </Panel>
        </PageColumns>
      ) : null}
      <AgentDirectory>
        {data.map((x) => <AgentCard key={x.id} agent={toAgent(x)} onOpen={() => setSel(x.id)} footer={<span className="text-xs text-muted-foreground">{num(x.stats.cases)} {t('cases')} · {num(x.stats.overridden)} {t('overrides')} · {t('owner')} {bi(x.owner_name, x.owner_name_ar)}</span>} />)}
      </AgentDirectory>
    </Screen>
  );
}

// ------------------------------------------------------------------ Workflows

export function WorkflowsScreen() {
  const { t, bi } = useLang();
  const { data } = useApi<any[]>('/workflows');
  const [sel, setSel] = useState<string>('WF-16');
  if (!data) return null;
  const w = data.find((x) => x.id === sel) ?? data[0];
  const cov = { implemented: data.filter((x) => x.coverage === 'implemented').length, partial: data.filter((x) => x.coverage === 'partial').length, designed: data.filter((x) => x.coverage === 'designed').length };
  const actor = (s: any) => (s.actor_type === 'AGENT' ? <AgentTag id={s.actor} showChip={false} /> : s.actor_type === 'HUMAN' ? roleName(s.actor, bi) : t('Connector (writes to the HRMS)'));
  return (
    <Screen hero={<Hero tone="surface" eyebrow="How it works" title={`${cov.implemented} ${t('of')} ${data.length} ${t('workflows run end to end')}`} lede={t('From hire to retire, plus Tasama\'s own service workflows. Every step names its actor, inputs, outputs and the decision it makes.')} />}>
      <PageColumns aside={<Panel icon={<GitBranch size={16} />} title={`${w.id} · ${bi(w.name, w.name_ar)}`} action={<PanelAction>{Object.values(w.counts ?? {}).reduce((a: number, b: any) => a + b, 0) as number} {t('cases')}</PanelAction>}>
        <p className="mb-3 text-sm text-muted-foreground">{t('Trigger')}: {w.trigger_en} · {t('Decision by')}: {w.decision_by}{w.median_s ? ` · ${t('median cycle')} ${Math.round(w.median_s / 3600)} h` : ''}</p>
        <WorkflowWalkthrough>
          {w.steps.map((s: any, i: number) => <WorkflowStep key={s.key} index={i + 1} title={bi(s.label, s.label_ar)} actor={actor(s)} inputs={[s.inputs]} outputs={[s.outputs]} decision={s.decision} autonomy={s.actor_type === 'HUMAN' ? <Chip>{t('Person')}</Chip> : s.actor_type === 'SYSTEM' ? <Chip tone="warn">{t('HRMS write')}</Chip> : undefined} coverage={w.coverage === 'partial' && s.actor_type === 'AGENT' && i > 0 ? 'partial' : 'implemented'} />)}
        </WorkflowWalkthrough>
      </Panel>}>
        <WorkflowCatalog>
          {data.map((x) => <WorkflowCard key={x.id} name={`${x.id} · ${bi(x.name, x.name_ar)}`} purpose={x.trigger_en} trigger={x.stage} outcome={x.decision_by} coverage={x.coverage} agents={<span className="flex flex-wrap gap-1.5">{x.agents.map((a: string) => <AgentTag key={a} id={a} showChip={false} />)}</span>} stepCount={x.steps.length} onOpen={() => setSel(x.id)} className={x.id === sel ? 'ring-1 ring-primary' : ''} />)}
        </WorkflowCatalog>
      </PageColumns>
    </Screen>
  );
}

// ------------------------------------------------------------------ Scenarios

export function ScenariosScreen() {
  const { t, bi } = useLang();
  const { session, director } = useApp();
  const { play: playOnStage } = usePresent();
  const { data } = useApi<any[]>('/director/scenarios');
  const [resetting, setResetting] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);
  const reset = async () => { setResetting(true); try { await post('/reset'); bump(); } finally { setResetting(false); } };
  const play = (key: string) => { setStarting(key); playOnStage(key); };
  return (
    <Screen hero={<Hero eyebrow="Demo control" title={`${(data ?? []).length} ${t('scenarios, each played step by step')}`} lede="Six inside a client account, three at Tasama level. Press play and the scenario runs on the Stage: the person asking on the left, the agents in the middle, the client's system on the right. → steps, ← goes back, Esc leaves." actions={<Btn onClick={reset} disabled={resetting}><RotateCcw className="h-4 w-4" />{resetting ? t('Rebuilding…') : t('Reset the demo')}</Btn>} />}>
      <ScenarioRunner onReset={reset}>
        {(data ?? []).map((s, i, all) => {
          const state = director && director.key === s.key ? (director.status === 'done' && director.index >= director.steps.length - 1 ? 'complete' : 'running') : starting === s.key ? 'running' : 'idle';
          return (
            <div key={s.key} className="space-y-2">
              {i === 0 || all[i - 1].level !== s.level ? <p className="eyebrow pt-2">{s.level === 'tasama' ? t('Tasama level, across all clients') : `${t('Inside the client account')}: ${bi(session?.client.short, session?.client.name_ar)}`}</p> : null}
              <ScenarioCard name={`${bi(s.shape, s.shape_ar)} · ${bi(s.title, s.title_ar)}`} premise={`${bi(s.summary, s.summary_ar)} ${s.steps.length} ${t('steps')}.`} state={state as any} onRun={() => play(s.key)} />
            </div>
          );
        })}
      </ScenarioRunner>
      <ProvenanceNote>{t('Scenarios inject simulated events into synthetic data. Where a step takes a person\'s decision, the trail says it was decided by the scenario. Reset rebuilds every client account and the Tasama data from the seed in about twenty seconds.')}</ProvenanceNote>
    </Screen>
  );
}

// ------------------------------------------------------------------ Connector

export function ConnectorScreen() {
  const { t, lang } = useLang();
  const { openCase, session } = useApp();
  const [system, setSystem] = useState('');
  const [writes, setWrites] = useState(false);
  const { data } = useApi<any>(`/connector?${system ? `system=${system}&` : ''}${writes ? 'writes=1' : ''}`, { poll: 3000 });
  if (!data) return null;
  const hrmsKey = session?.client.hrms === 'ODOO' ? 'ODOO' : 'ORACLE_HCM';
  const oracle = data.stats.find((s: any) => s.system === hrmsKey);
  const NAMES: Record<string, string> = { ORACLE_HCM: 'Oracle Fusion HCM (simulated)', ODOO: 'Odoo 19 (simulated)', ATOM: 'Oracle Atom feeds', ODOO_WEBHOOK: 'Odoo webhooks', QIWA: 'Qiwa', GOSI: 'GOSI', MUQEEM: 'Muqeem', MUDAD: 'Mudad', JADARAT: 'Jadarat', ABSHER: 'Absher', CCHI: 'CCHI insurance', M365: 'Microsoft 365', ANTHROPIC: 'Claude (Replit AI Integrations)', BGCHECK: 'Background check vendor', ASSESSMENT: 'Assessment vendor' };
  const odoo = hrmsKey === 'ODOO';
  return (
    <Screen hero={<Hero eyebrow="How it works" title={`${t('Every call to')} ${odoo ? 'Odoo' : 'Oracle HCM'} ${t('goes through one logged connector')}: ${num(oracle?.calls ?? 0)} ${t('calls')}, ${num(oracle?.writes ?? 0)} ${t('writes')}`} lede={odoo ? `${t('The only path from the agentic layer to this client\'s system of record,')} ${session?.client.hrmsLabel}. ${t('Calls use Odoo\'s external JSON-2 API (POST /json/2/<model>/<method>); changes arrive as webhooks from Odoo automation rules. The same agents run on Oracle clients through Oracle\'s REST resources: only this connector differs.')}` : `${t('The only path from the agentic layer to this client\'s system of record,')} ${session?.client.hrmsLabel}. ${t('Reads and writes use Oracle\'s REST resource names; HRMS changes arrive as Atom feed events. The same agents run on Odoo clients through Odoo\'s JSON-2 API: only this connector differs.')}`}
      />}>
      <AuditTabs />
      <StatRow>
        {data.stats.slice(0, 4).map((s: any) => <StatTile key={s.system} label={t(NAMES[s.system] ?? s.system)} value={num(s.calls)} trend={{ direction: s.errors ? 'down' : 'flat', label: `${s.errors ? `${s.errors} ${t('errors')}` : t('healthy')} · ${s.avg_ms} ms ${t('average')} · ${ago(s.last, lang)}` }} />)}
      </StatRow>
      <PageColumns aside={<>
        <Panel icon={<Server size={16} />} title="Systems">
          {data.stats.map((s: any) => <StatusRow key={s.system} name={t(NAMES[s.system] ?? s.system)} detail={`${num(s.calls)} ${t('calls')} · ${num(s.writes)} ${t('writes')} · ${s.avg_ms} ms`} status={<button type="button" onClick={() => setSystem(system === s.system ? '' : s.system)} className={`mono-chip ${system === s.system ? 'is-primary' : s.system === 'ORACLE_HCM' || s.system === 'ATOM' ? 'is-success' : 'is-warn'}`}>{s.system === 'ORACLE_HCM' || s.system === 'ATOM' ? t('simulated') : t('stub')}</button>} />)}
        </Panel>
        <Panel icon={<Database size={16} />} title={odoo ? 'Odoo models used' : 'Oracle REST resources used'}>
          {data.resources.map((r: any, i: number) => <div key={i} className="flex items-center gap-2 py-1 font-mono text-[11px]"><span className={r.method === 'GET' ? 'text-muted-foreground' : 'text-warn'}>{r.method}</span><span className="min-w-0 flex-1 truncate">{r.resource}</span><span>{r.n}</span></div>)}
        </Panel>
        <Panel icon={<Zap size={16} />} title="Atom feed events">
          {data.events.map((e: any) => <StatusRow key={e.id} name={e.summary} detail={`${e.collection} · ${dateTime(e.published_at, lang)}`} status={<Chip>{e.collection}</Chip>} />)}
        </Panel>
      </>}>
        <Panel icon={<Network size={16} />} title="Live call log" action={<span className="flex gap-1.5"><button type="button" onClick={() => setWrites(!writes)} className={`mono-chip ${writes ? 'is-primary' : ''}`}>{t('Writes only')}</button>{system ? <button type="button" onClick={() => setSystem('')} className="mono-chip is-primary">{system} ×</button> : null}</span>}>
          <div className="space-y-0.5 font-mono text-[11px]">
            {data.logs.map((l: any) => (
              <div key={l.id} className="flex items-start gap-2 rounded px-1.5 py-1 hover:bg-primary/5">
                <span className="w-16 shrink-0 text-muted-foreground">{time(l.at, lang)}</span>
                <span className="w-20 shrink-0 truncate">{l.system}</span>
                <span className={`w-12 shrink-0 font-semibold ${l.method === 'GET' ? 'text-muted-foreground' : l.method === 'FEED' ? 'text-primary' : 'text-warn'}`}>{l.method}</span>
                <span className="min-w-0 flex-1 break-all">{l.resource.replace('/hcmRestApi/resources/11.13.18.05', '')}<span className="block font-sans text-muted-foreground">{l.summary}{l.actor_id ? ` · ${l.actor_id}` : ''}</span></span>
                <span className={`shrink-0 ${l.status_code >= 400 ? 'text-danger' : 'text-success'}`}>{l.status_code}</span>
                <span className="w-14 shrink-0 text-end text-muted-foreground">{l.latency_ms}ms</span>
                {l.ref ? <button type="button" onClick={() => openCase(l.ref)} className="shrink-0 text-primary underline">{l.ref.slice(-5)}</button> : <span className="w-8" />}
              </div>
            ))}
          </div>
        </Panel>
      </PageColumns>
    </Screen>
  );
}

// ------------------------------------------------------------------ Audit trail

/** The audit trail and the integration log: two tabs of one item. */
function AuditTabs() {
  return <RouteTabs items={[{ id: 'evidence', label: 'Audit trail' }, { id: 'connector', label: 'Integration log' }]} />;
}

export function EvidenceScreen() {
  const { t } = useLang();
  const [act, setAct] = useState('');
  const [q, setQ] = useState('');
  const { data } = useApi<any>(`/evidence?${act ? `act=${act}&` : ''}${q ? `q=${encodeURIComponent(q)}` : ''}`);
  if (!data) return null;
  const c = (k: string) => data.counts.find((x: any) => x.act === k)?.n ?? 0;
  const FILTERS: [string, string][] = [['', 'All'], ['OVERRIDE', 'Human overrides'], ['REFUSE', 'Refusals'], ['ESCALATE', 'Escalations'], ['WRITE', 'HRMS writes'], ['APPROVE,REJECT', 'Human decisions'], ['ANSWER', 'Assistant answers']];
  return (
    <Screen hero={<Hero eyebrow="How it works" title={`${t('People overrode an agent')} ${c('OVERRIDE')} ${t(c('OVERRIDE') === 1 ? 'time' : 'times')}; ${t('every override carries its reason')}`} lede="The decision trail across every case: who acted, at what autonomy, citing which clause, and where a person disagreed with an agent and why. The overrides are the most valuable rows."
      feature={<HeroFeature label="Human overrides" value={c('OVERRIDE')} support={<Chip tone="warn">{c('REFUSE')} {t('refusals')}</Chip>} />} />}>
      <AuditTabs />
      <StatRow>
        <StatTile label="Agent checks" value={num(c('CHECK') + c('PREPARE') + c('RECOMMEND'))} />
        <StatTile label="Human decisions" value={num(c('APPROVE') + c('REJECT') + c('OVERRIDE'))} />
        <StatTile label="HRMS writes" value={num(c('WRITE'))} />
        <StatTile label="Escalations" value={num(c('ESCALATE'))} />
      </StatRow>
      <div className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map(([k, l]) => <button key={k} type="button" onClick={() => setAct(k)} className={`mono-chip ${act === k ? 'is-primary' : ''}`}>{t(l)}</button>)}
        <input className="input ms-auto h-8 w-60 text-sm" placeholder={t('Search the trail')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <Panel icon={<Scale size={16} />} title="Decision trail" action={<PanelAction>{data.rows.length} {t('entries')}</PanelAction>}>
        <TrailList rows={data.rows} compact />
      </Panel>
    </Screen>
  );
}

// ------------------------------------------------------------------ Policies

export function PoliciesScreen() {
  const { t, bi } = useLang();
  const { route, session } = useApp();
  const { data } = useApi<any[]>('/policies');
  const [q, setQ] = useState('');
  const focus = route.screen === 'policies' ? route.param : null;
  useEffect(() => { if (focus && data) setTimeout(() => document.getElementById(focus)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 200); }, [focus, data]);
  if (!data) return null;
  const match = (c: any) => !q || `${c.heading} ${c.text_en} ${c.tags.join(' ')} ${c.heading_ar} ${c.text_ar}`.toLowerCase().includes(q.toLowerCase());
  return (
    <Screen hero={<Hero tone="surface" eyebrow="How it works" title={`${t('The handbook the agents cite')}: ${data.length} ${t('policies')}`} lede={t('An answer that cannot be traced to a clause here is not given; the assistant routes the question to a person instead.')}
      actions={<input className="input w-64" placeholder={t('Search clauses')} value={q} onChange={(e) => setQ(e.target.value)} />} />}>
      {data.map((p) => {
        const cl = p.clauses.filter(match);
        if (!cl.length) return null;
        return (
          <Panel key={p.id} icon={<BookOpen size={16} />} title={`${p.id} · ${bi(p.title, p.title_ar)}`} action={<PanelAction>v{p.version} · {p.owner}</PanelAction>}>
            <div className="space-y-2">{cl.map((c: any) => (
              <div key={c.id} id={c.id} className={`rounded-xl glass-l3 px-4 py-3 ${focus === c.id ? 'ring-2 ring-primary' : ''}`}>
                <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs text-primary">§{c.clause_ref}</span><span className="text-sm font-semibold">{bi(c.heading, c.heading_ar)}</span>{c.legal_ref ? <Chip>{c.legal_ref}</Chip> : null}{c.cited ? <Chip tone="primary" className="ms-auto">{c.cited} {t('citations')}</Chip> : null}</div>
                <p dir="auto" className="mt-1.5 text-sm leading-relaxed">{bi(c.text_en, c.text_ar)}</p>
              </div>
            ))}</div>
          </Panel>
        );
      })}
    </Screen>
  );
}

// ------------------------------------------------------------------ Value

export function ValueScreen() {
  const { t, bi, lang } = useLang();
  const { data } = useApi<any>('/value');
  if (!data) return null;
  const total = data.byWorkflow.reduce((s: number, w: any) => s + w.total, 0);
  const noTouch = data.byWorkflow.reduce((s: number, w: any) => s + w.no_touch, 0);
  const letters = data.byWorkflow.find((w: any) => w.workflow_id === 'WF-14');
  const maxM = Math.max(1, ...data.monthly.map((m: any) => m.cases));
  return (
    <Screen hero={<Hero tone="surface" eyebrow="How it works" title={`${total ? Math.round(noTouch / total * 100) : 0}% ${t('of cases closed with no HR touch')}`} lede={t('Volumes, cases closed with no HR touch, cycle times, and an estimate of HR hours returned.')}
      feature={<HeroFeature label="HR hours returned (estimate)" value={num(data.hoursReturned)} support={<Chip tone="warn">{t('illustrative')}</Chip>} />} />}>
      <StatRow>
        <StatTile label="Cases handled" value={num(total)} />
        <StatTile label="Letters issued without HR" value={letters ? `${Math.round(letters.no_touch / letters.total * 100)}%` : '—'} trend={{ direction: 'flat', label: `${letters?.no_touch ?? 0} ${t('of')} ${letters?.total ?? 0}` }} />
        <StatTile label="Assistant answers" value={num(data.answers)} />
        <StatTile label="Cases last month" value={num(data.monthly[data.monthly.length - 2]?.cases ?? 0)} />
      </StatRow>
      <PageColumns aside={<Panel icon={<LineChart size={16} />} title="Cases by month">
        <div className="flex h-40 items-end gap-1.5">{data.monthly.map((m: any) => <div key={m.month} className="flex h-full flex-1 flex-col items-center justify-end" title={`${m.cases} · ${m.no_touch} ${t('no HR touch')}`}>
          <div className="flex w-full flex-col-reverse overflow-hidden rounded-t" style={{ height: `${m.cases / maxM * 100}%` }}><div className="bg-[var(--color-chart-1)]" style={{ height: `${m.no_touch / Math.max(1, m.cases) * 100}%` }} /><div className="mb-[2px] flex-1 bg-[var(--color-chart-2)]" /></div>
          <span className="mt-1 text-[10px] text-muted-foreground">{month(m.month, lang).split(' ')[0]}</span></div>)}</div>
        <div className="mt-2 flex gap-3 text-[11px]"><span className="flex items-center gap-1"><span className="h-2 w-3 rounded-sm bg-[var(--color-chart-1)]" />{t('No HR touch')}</span><span className="flex items-center gap-1"><span className="h-2 w-3 rounded-sm bg-[var(--color-chart-2)]" />{t('A person decided')}</span></div>
      </Panel>}>
        <Panel icon={<GitBranch size={16} />} title="By workflow">
          <Table><thead><tr><th>{t('Workflow')}</th><th className="text-end">{t('Cases')}</th><th className="text-end">{t('Completed')}</th><th className="text-end">{t('No HR touch')}</th><th className="text-end">{t('Median cycle')}</th><th className="text-end">{t('Minutes saved per case (assumed)')}</th></tr></thead>
            <tbody>{data.byWorkflow.map((w: any) => <tr key={w.workflow_id}><td>{bi(w.name, w.name_ar)}</td><td className="text-end tabular-nums">{w.total}</td><td className="text-end tabular-nums">{w.completed}</td><td className="text-end tabular-nums">{w.no_touch}</td><td className="text-end tabular-nums">{w.median_s ? (w.median_s < 3600 ? `${Math.max(1, Math.round(w.median_s / 60))} min` : `${Math.round(w.median_s / 3600)} h`) : '—'}</td><td className="text-end tabular-nums">{Math.round((data.assumptions[w.workflow_id] ?? 30) * 0.6)}</td></tr>)}</tbody></Table>
          <ProvenanceNote>{t('Hours returned assume each case would otherwise take HR the minutes shown (60% of a typical manual effort). These are illustrative assumptions, not measurements. Vendor benchmarks for comparison: 60–70% ticket deflection (Leena AI), 88% autonomous resolution (Moveworks at Broadcom).')}</ProvenanceNote>
        </Panel>
      </PageColumns>
    </Screen>
  );
}

// ------------------------------------------------------------------ Settings

export function SettingsScreen() {
  const { t, bi } = useLang();
  const { session, persona, switchPersona } = useApp();
  const [busy, setBusy] = useState(false);
  if (!session || !persona) return null;
  return (
    <Screen hero={<Hero tone="surface" eyebrow="Demo control" title="Who you are, and what you may approve" lede="Switching persona changes the menu, the inbox, what is approvable and what the assistant will do. The server decides all of it; the browser only says who is asking." />}>
      <SettingsGroup title={t('Persona')} description={t('One build shows the employee, the manager, HR and the CHRO their own screens.')}>
        <PersonaSwitcher value={persona.key} onChange={switchPersona} personas={session.personas.map((p) => ({ id: p.key, name: bi(p.label, p.label_ar), role: `${bi(p.display_name, p.display_name_ar)} · ${bi(p.role_title, p.role_title_ar)}`, initials: p.display_name.split(' ').map((w) => w[0]).slice(0, 2).join(''), authority: <ul className="space-y-0.5">{p.approval_limits.map((l) => <li key={l.what}>• {bi(l.what, l.what_ar)}</li>)}</ul>, remit: `${t('Lenses')}: ${p.lenses.map((l) => t(({ tasama: 'Tasama Services', my: 'My HR', team: 'My Team', hr: 'HR Workspace', control: 'How it works' } as any)[l])).join(', ')}` }))} />
      </SettingsGroup>
      <SettingsGroup title={t('Interface')}>
        <SettingsRow label={t('Theme')} hint={t('Demos run in the light theme.')} control={<ThemeModeToggle />} />
        <SettingsRow label={t('Language')} hint={t('Arabic switches the layout to right-to-left. Numbers stay in Western digits.')} control={<LanguageToggle />} />
        <SettingsRow label={t('AI assistant')} hint={session.ai.mode === 'claude' ? `${t('Claude is answering on the server through Replit AI Integrations')} (${session.ai.model}).` : t('Offline: Replit AI Integrations is not connected for this app.')} control={<Chip tone={session.ai.mode === 'claude' ? 'success' : 'warn'}>{session.ai.mode === 'claude' ? 'Claude' : t('Offline')}</Chip>} />
      </SettingsGroup>
      <SettingsGroup title={t('Present mode')} description={t('The storylines the presenter plays: cards with live numbers, scenarios on the Stage, and the close. Saved on the server; a reset keeps them.')}>
        <StorylineEditor />
      </SettingsGroup>
      <SettingsGroup title={t('Demo data')} description={t('All data is synthetic and generated relative to today, so dates stay current whenever the demo is reset.')}>
        <SettingsRow label={t('Reset the demo')} hint={t('Rebuilds the HRMS simulation, the case history and every inbox from the seed.')} control={<Btn onClick={async () => { setBusy(true); try { await post('/reset'); bump(); } finally { setBusy(false); } }} disabled={busy}><RotateCcw className="h-4 w-4" />{busy ? t('Rebuilding…') : t('Reset')}</Btn>} />
      </SettingsGroup>
    </Screen>
  );
}
void Bot; void FileText; void Languages; void Users; void Play; void Bar; void Empty; void Ref; void StatusChip; void date;
