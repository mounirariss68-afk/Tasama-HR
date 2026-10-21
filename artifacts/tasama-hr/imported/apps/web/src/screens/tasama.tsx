/**
 * Tasama Services lens: the HR Operations Manager's view of the business —
 * the client portfolio, one client account, service levels, escalations,
 * finance, the delivery team, and every client's HR handbook.
 * Every figure comes from the server, computed from the clients' own records.
 */
import { Fragment, useEffect, useState } from 'react';
import { HeroFeature, PageColumns, Panel, PanelAction, StatTile, StatusRow } from '@cognirise/atelier/layout';
import { ProvenanceNote } from '@cognirise/atelier/archetypes';
import { AlertTriangle, ArrowLeft, Banknote, BookOpen, Building2, CalendarClock, ClipboardList, Gauge, Network, Receipt, Scale, Users, Workflow } from 'lucide-react';
import { bump, post, useApi } from '../lib/api';
import { useLang } from '../lib/i18n';
import { aed, aedShort, ago, date, dateTime, month, num } from '../lib/format';
import { useApp } from '../app/state';
import { AgentTag, Bar, Btn, Chip, Empty, Hero, Kv, Ref, RouteTabs, Screen, StatusChip, Table, StatRow, TabStrip } from '../app/ui';
import { plain } from '../app/decision';
import { Bullet, ClockBar, Progress } from '../app/viz';

/** The portfolio in one picture: each client, its HRMS, and its service levels met last month. */
function ClientStrip({ clients }: { clients: any[] }) {
  const { bi, t } = useLang();
  return (
    <div className="flex h-full items-center pe-8 ps-4">
      <div className="grid w-full grid-cols-3 gap-2.5">
        {clients.map((c: any) => {
          const ok = c.sla.lastMet === c.sla.lastScored;
          return (
            <div key={c.key} className="rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-white backdrop-blur-sm">
              <div className="flex items-center justify-between gap-2"><span className="truncate text-[13px] font-semibold">{bi(c.short, c.name_ar)}</span><span className="text-[10px] uppercase tracking-wider text-white/70">{c.hrms === 'ODOO' ? 'Odoo' : 'Oracle'}</span></div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/20"><div className={`h-full rounded-full ${ok ? 'bg-success' : 'bg-warn'}`} style={{ width: `${(c.sla.lastMet / Math.max(1, c.sla.lastScored)) * 100}%` }} /></div>
              <div className="mt-1 flex justify-between text-[11px] text-white/75"><span>{c.sla.lastMet}/{c.sla.lastScored} {t('SLAs')}</span><span>{c.headcount} {t('staff')}</span></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@cognirise/atelier/components/ui/dropdown-menu';
import { MoreHorizontal } from 'lucide-react';

const EYEBROW = 'Tasama HR Services';
const pctTone = (att: number | null, target: number) => (att === null ? undefined : att >= target ? 'success' : att >= target - 2 ? 'warn' : 'danger');

function HrmsChip({ hrms }: { hrms: string }) {
  return <span className={`mono-chip ${hrms === 'ODOO' ? 'is-warn' : 'is-primary'}`}>{hrms === 'ODOO' ? 'Odoo' : 'Oracle HCM'}</span>;
}

function SlaCell({ s }: { s: any }) {
  const { t } = useLang();
  if (!s || s.attainment === null) return <span className="text-xs text-muted-foreground">{t('no cases')}</span>;
  const tone = pctTone(s.attainment, s.target);
  return <span title={`${s.met} / ${s.total}`} className={`inline-flex min-w-[3.6rem] justify-center rounded-md px-1.5 py-1 text-[11px] font-semibold tabular-nums ${tone === 'success' ? 'bg-success/15 text-success' : tone === 'warn' ? 'bg-warn/20 text-warn' : 'bg-danger/15 text-danger'}`}>{s.attainment}%</span>;
}

function ClientPicker({ value, onChange }: { value: string; onChange: (k: string) => void }) {
  const { session } = useApp();
  const { bi } = useLang();
  return (
    <div className="flex flex-wrap gap-1.5">
      {(session?.clients ?? []).map((c) => (
        <button key={c.key} type="button" onClick={() => onChange(c.key)} className={`mono-chip ${value === c.key ? 'is-primary' : ''}`}>{bi(c.short, c.name_ar)}</button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ Portfolio

export function TasamaPortfolio() {
  const { t, bi, lang } = useLang();
  const { go, switchClient } = useApp();
  const { data } = useApi<any>('/tasama/portfolio', { poll: 20000 });
  if (!data) return null;
  const T = data.totals;
  return (
    <Screen hero={<Hero landing eyebrow={EYEBROW} title={`${T.slaMet} ${t('of')} ${T.slaScored} ${t('service levels met last month')}`} lede={`${num(T.clients)} ${t('client accounts')} · ${num(T.employees)} ${t('employees served')}, ${t('each on its own HRMS: Oracle HCM or Odoo.')}`}
      media={<ClientStrip clients={data.clients} />} />}>
      <RouteTabs items={[{ id: 'tasama-portfolio', label: 'Portfolio' }, { id: 'tasama-sla', label: 'Service levels' }]} />
      <StatRow>
        <StatTile label="Employees served" value={num(T.employees)} trend={{ direction: 'flat', label: `${num(T.cases30d)} ${t('cases in 30 days')}` }} />
        <StatTile label="Revenue last month" value={aedShort(T.revenueLastMonth, lang)} trend={{ direction: 'flat', label: `${t('margin')} ${T.revenueLastMonth ? Math.round((T.marginLastMonth / T.revenueLastMonth) * 100) : 0}%` }} />
        <StatTile label="Closed with no HR touch" value={T.cases30d ? `${Math.round((T.noTouch30d / T.cases30d) * 100)}%` : '—'} trend={{ direction: 'flat', label: t('last 30 days, all clients') }} />
        <StatTile label="Overdue receivables" value={aedShort(T.overdue, lang)} state={T.overdue ? <Chip tone="danger">{t('overdue')}</Chip> : undefined} />
      </StatRow>

      <Panel icon={<Building2 size={16} />} title="Client accounts" action={<PanelAction>{t('Open an account for its record, or enter its HR')}</PanelAction>}>
        <Table><thead><tr>
          <th>{t('Client')}</th><th>{t('HRMS')}</th><th className="text-end">{t('Employees')}</th><th className="text-end">{t('Open cases')}</th>
          <th>{t('SLAs last month')}</th><th>{t('Escalations')}</th><th>{t('Payroll pre-check')}</th><th className="text-end">{t('Satisfaction')}</th><th className="text-end">{t('Revenue')}</th><th className="text-end">{t('Margin')}</th><th />
        </tr></thead>
          <tbody>{data.clients.map((c: any) => (
            <tr key={c.key} className="clickable" onClick={() => go('tasama-account', c.key)}>
              <td><span className="block text-sm font-semibold">{bi(c.name, c.name_ar)}</span><span className="block text-xs text-muted-foreground">{bi(c.sector, c.sector_ar)}</span></td>
              <td><HrmsChip hrms={c.hrms} /></td>
              <td className="text-end tabular-nums">{num(c.headcount)}</td>
              <td className="text-end tabular-nums">{num(c.open_cases)}</td>
              <td className="min-w-[7rem]"><div className="flex items-center gap-2"><div className="w-16"><Progress done={c.sla.lastMet} total={c.sla.lastScored} tone={c.sla.lastMet === c.sla.lastScored ? 'success' : 'warn'} /></div><span className="text-xs tabular-nums">{c.sla.lastMet}/{c.sla.lastScored}</span></div></td>
              <td>{c.escalations.breached ? <Chip tone="danger">{c.escalations.breached} {t('breached')}</Chip> : null} {c.escalations.atRisk ? <Chip tone="warn">{c.escalations.atRisk} {t('at risk')}</Chip> : null}{!c.escalations.breached && !c.escalations.atRisk ? <span className="text-xs text-muted-foreground">—</span> : null}</td>
              <td>{c.payroll ? <Chip tone={c.payroll.blockers ? 'danger' : 'success'}>{c.payroll.blockers} {t('blockers')}</Chip> : '—'}</td>
              <td className="text-end tabular-nums">{c.csat ?? '—'}</td>
              <td className="text-end tabular-nums">{c.lastMonth ? aed(c.lastMonth.revenue, lang) : '—'}</td>
              <td className="text-end tabular-nums">{c.lastMonth ? `${Math.round(c.lastMonth.marginPct)}%` : '—'}</td>
              <td onClick={(e) => e.stopPropagation()}><Btn small onClick={() => switchClient(c.key, 'hr-inbox')}>{t('Enter')}</Btn></td>
            </tr>
          ))}</tbody></Table>
      </Panel>

      <PageColumns aside={<>
        <Panel icon={<ClipboardList size={16} />} title="Recent activity">
          {data.trail.map((e: any) => <StatusRow key={e.id} name={e.actor_name} detail={plain(bi(e.summary, e.summary_ar))} status={<span className="text-[11px] text-muted-foreground">{ago(e.at, lang)}</span>} />)}
        </Panel>
      </>}>
        <Panel icon={<CalendarClock size={16} />} title="Payroll calendar, this month">
          <Table><thead><tr><th>{t('Client')}</th><th>{t('Cut-off')}</th><th>{t('Pay date (Mudad)')}</th><th>{t('Findings')}</th></tr></thead>
            <tbody>{data.clients.map((c: any) => <tr key={c.key}><td className="text-sm font-medium">{bi(c.short, c.name_ar)}</td><td>{c.period ? date(c.period.cutoff_date, lang) : '—'}</td><td>{c.period ? date(c.period.pay_date, lang) : '—'}</td>
              <td>{c.payroll ? <span className="flex gap-1"><Chip tone={c.payroll.blockers ? 'danger' : 'success'}>{c.payroll.blockers} {t('blockers')}</Chip><Chip tone={c.payroll.high ? 'warn' : undefined}>{c.payroll.high} {t('high')}</Chip></span> : '—'}</td></tr>)}</tbody></Table>
        </Panel>
      </PageColumns>
    </Screen>
  );
}

// ------------------------------------------------------------------ Client account

export function TasamaAccount() {
  const { t, bi, lang } = useLang();
  const { route, go, switchClient, openCase, session } = useApp();
  const key = route.param ?? session?.clients[0]?.key ?? 'roshn';
  const { data } = useApi<any>(`/tasama/clients/${key}`, { poll: 20000 });
  const [tab, setTab] = useState('sla');
  if (!data) return null;
  const c = data.client;
  const slaKeys = c.slas.map((s: any) => s.key);
  const last = data.slaHistory[data.slaHistory.length - 2];
  const met = last ? last.results.filter((r: any) => r.ok).length : 0;
  const scored = last ? last.results.filter((r: any) => r.ok !== null).length : 0;
  const maxCsat = 5;
  const enter = (screen: string, ref?: string) => { switchClient(c.key, screen); if (ref) setTimeout(() => openCase(ref), 300); };
  const ACCOUNT_TABS = [{ id: 'sla', label: 'Service levels' }, { id: 'waiting', label: 'Waiting cases' }, { id: 'team', label: 'Delivery team' }, { id: 'invoices', label: 'Invoices' }, { id: 'payroll', label: 'Payroll runs' }, { id: 'hrms', label: 'HRMS health' }];
  return (
    <Screen hero={<Hero eyebrow={EYEBROW} title={`${bi(c.short, c.name_ar)} ${t('met')} ${met} ${t('of')} ${scored} ${t('service levels last month')}`} lede={`${bi(c.sector, c.sector_ar)} · ${bi(c.city, c.city_ar)} · ${bi(c.model, c.model_ar)} · ${c.hrms_label}. ${t('Account manager')}: ${bi(c.account_manager, c.account_manager_ar)}.`}
      actions={<><Btn onClick={() => go('tasama-portfolio')}><ArrowLeft className="h-4 w-4 rtl:rotate-180" />{t('Overview')}</Btn><Btn kind="primary" onClick={() => enter('hr-inbox')}>{t('Enter its HR')}</Btn></>} />}>
      <ClientPicker value={c.key} onChange={(k) => go('tasama-account', k)} />
      <StatRow>
        <StatTile label="Employees served" value={num(data.headcount.n)} trend={{ direction: 'flat', label: `${Math.round((data.headcount.saudi / Math.max(1, data.headcount.n)) * 100)}% ${t('Saudi')} · ${t('Nitaqat')} ${c.nitaqat.band}` }} />
        <StatTile label="Fee per employee per month" value={aed(c.pepm, lang)} trend={{ direction: 'flat', label: c.per_hire ? `${aed(c.per_hire, lang)} ${t('per hire')}` : t('no recruitment fee') }} />
        <StatTile label="Contract" value={`${date(c.contract_start, lang)}`} trend={{ direction: 'flat', label: `${t('to')} ${date(c.contract_end, lang)}` }} />
        <StatTile label="Monthly cost to serve" value={aedShort(data.finance.monthlyCost, lang)} trend={{ direction: 'flat', label: t('delivery team share and platform') }} />
      </StatRow>

      <TabStrip items={ACCOUNT_TABS} value={tab} onChange={setTab} />
      {tab === 'sla' ? <PageColumns aside={<>
        <Panel icon={<Scale size={16} />} title={`${c.services.length} ${t('services in the contract; satisfaction last month')} ${data.csat[data.csat.length - 1]?.score ?? '—'} / 5`}>
          <div className="flex flex-wrap gap-1.5">{c.services.map((s: any) => <Chip key={s.key}>{bi(s.label, s.label_ar)}</Chip>)}</div>
          <dl className="mt-3 grid grid-cols-2 gap-3"><Kv k={t('Service credits capped at')} v={`${c.credit_cap_pct}% ${t('of the monthly fee')}`} /><Kv k={t('Phase')} v={<StatusChip status={c.phase} />} /></dl>
        <h3 className="mt-5 mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('Satisfaction survey')}</h3>
          {data.csat.length ? <p className="text-sm">{data.csat[data.csat.length - 1].score} / 5 {t('last month')} · {t('between')} {Math.min(...data.csat.map((x: any) => x.score))} {t('and')} {Math.max(...data.csat.map((x: any) => x.score))} {t('this year')}</p> : null}
        </Panel>
              </>}>
              <Panel icon={<Gauge size={16} />} title="Service levels by month" action={<AgentTag id="raqeeb" />}>
        <div className="overflow-x-auto"><Table><thead><tr><th>{t('Service level')}</th><th className="text-end">{t('Target')}</th>{data.slaHistory.map((m: any) => <th key={m.period} className="text-center">{m.period.includes('(') ? t('This month') : month(m.period, lang)}</th>)}</tr></thead>
          <tbody>{slaKeys.map((k: string) => { const d = c.slas.find((s: any) => s.key === k); return (
            <tr key={k}><td className="text-sm font-medium">{bi(d.label, d.label_ar)}</td><td className="text-end tabular-nums">{d.target}%</td>
              {data.slaHistory.map((m: any) => <td key={m.period} className="text-center"><SlaCell s={m.results.find((r: any) => r.key === k)} /></td>)}</tr>); })}</tbody></Table></div>
      </Panel>
      </PageColumns> : null}
      {tab === 'waiting' ? <PageColumns aside={<Panel icon={<ClipboardList size={16} />} title="Volumes, last 90 days">
          <Table><thead><tr><th>{t('Workflow')}</th><th className="text-end">{t('Cases')}</th><th className="text-end">{t('No HR touch')}</th></tr></thead>
            <tbody>{data.volumes.map((v: any) => <tr key={v.workflow_id}><td className="text-sm">{bi(v.name, v.name_ar)}</td><td className="text-end tabular-nums">{v.n}</td><td className="text-end tabular-nums">{v.no_touch}</td></tr>)}</tbody></Table>
        </Panel>}>
        <Panel icon={<AlertTriangle size={16} />} title="Waiting in the client workflow" action={<PanelAction>{t('Oldest due first')}</PanelAction>}>
          {data.waiting.length ? <Table><thead><tr><th>{t('Case')}</th><th>{t('Waiting on')}</th><th>{t('Due')}</th></tr></thead>
            <tbody>{data.waiting.map((w: any) => <tr key={w.ref} className="clickable" onClick={() => enter('hr-inbox', w.ref)}><td className="text-sm">{bi(w.title, w.title_ar)}</td><td className="text-xs">{w.waiting_on ?? w.waiting_on_role}</td><td className="text-xs">{w.sla_due ? dateTime(w.sla_due, lang) : '—'}</td></tr>)}</tbody></Table> : <Empty>{t('Nothing waiting.')}</Empty>}
        </Panel>
      </PageColumns> : null}
      {tab === 'team' ? <Panel icon={<Users size={16} />} title="Delivery team on this account" action={<AgentTag id="tawzee" showChip={false} />}>
          {data.team.map((s: any) => <StatusRow key={s.id} name={bi(s.name, s.name_ar)} detail={bi(s.role, s.role_ar)} status={<Chip>{Math.round(s.fte * 100)}%</Chip>} />)}
        </Panel> : null}
      {tab === 'invoices' ? <Panel icon={<Receipt size={16} />} title="Invoices and margin">
          <Table><thead><tr><th>{t('Month')}</th><th className="text-end">{t('Revenue')}</th><th className="text-end">{t('Credits')}</th><th className="text-end">{t('Cost')}</th><th className="text-end">{t('Margin')}</th><th>{t('Status')}</th></tr></thead>
            <tbody>{data.finance.months.map((m: any) => <tr key={m.number}><td>{month(m.period, lang)}</td><td className="text-end tabular-nums">{aed(m.revenue, lang)}</td><td className="text-end tabular-nums">{m.credits ? aed(-m.credits, lang) : '—'}</td><td className="text-end tabular-nums">{aed(m.cost, lang)}</td><td className="text-end tabular-nums">{Math.round(m.marginPct)}%</td><td><StatusChip status={m.status} /></td></tr>)}</tbody></Table>
        </Panel> : null}
      {tab === 'payroll' ? <Panel icon={<Banknote size={16} />} title="Payroll runs">
          <Table><thead><tr><th>{t('Month')}</th><th className="text-end">{t('Employees')}</th><th className="text-end">{t('Caught before release')}</th><th className="text-end">{t('Corrected after')}</th><th>{t('Pay date')}</th><th>{t('Paid')}</th></tr></thead>
            <tbody>{data.payrollRuns.map((r: any) => <tr key={r.period}><td>{month(r.period, lang)}</td><td className="text-end tabular-nums">{r.employees}</td><td className="text-end tabular-nums">{r.findings_before}</td><td className="text-end tabular-nums">{r.errors_after ? <Chip tone="danger">{r.errors_after}</Chip> : 0}</td><td>{date(r.pay_date_due, lang)}</td><td>{r.paid_on > r.pay_date_due ? <Chip tone="danger">{date(r.paid_on, lang)}</Chip> : <Chip tone="success">{t('on time')}</Chip>}</td></tr>)}</tbody></Table>
        </Panel> : null}
      {tab === 'hrms' ? <Panel icon={<Network size={16} />} title="HRMS connector, last 7 days">
          {data.hrms.map((h: any) => <StatusRow key={h.system} name={plain(h.system)} detail={`${num(h.calls)} ${t('calls')} · ${h.avg_ms} ms`} status={<Chip tone={h.errors ? 'danger' : 'success'}>{h.errors ? `${h.errors} ${t('errors')}` : t('healthy')}</Chip>} />)}
        </Panel> : null}
    </Screen>
  );
}

// ------------------------------------------------------------------ Service levels

export function TasamaSla() {
  const { t, bi, lang } = useLang();
  const { go } = useApp();
  const { data } = useApi<any>('/tasama/sla', { poll: 20000 });
  if (!data) return null;
  const keys: { key: string; label: string; label_ar: string }[] = [];
  for (const c of data.clients) for (const s of c.last) if (!keys.find((k) => k.key === s.key)) keys.push({ key: s.key, label: s.label, label_ar: s.label_ar });
  const scored = data.clients.flatMap((c: any) => c.last.filter((s: any) => s.ok !== null));
  return (
    <Screen hero={<Hero tone="surface" eyebrow={EYEBROW} title={`${scored.filter((s: any) => s.ok).length} ${t('of')} ${scored.length} ${t('service levels met in')} ${month(data.lastMonth, lang)}`} lede={t('Each client\'s contract sets its own targets. A missed target becomes a service credit on that month\'s invoice.')} />}>
      <RouteTabs items={[{ id: 'tasama-portfolio', label: 'Portfolio' }, { id: 'tasama-sla', label: 'Service levels' }]} />
      <Panel icon={<Gauge size={16} />} title={`${t('Last month')} · ${month(data.lastMonth, lang)}`}>
        <div className="overflow-x-auto"><Table><thead><tr><th>{t('Client')}</th>{keys.map((k) => <th key={k.key} className="text-center">{bi(k.label, k.label_ar)}</th>)}</tr></thead>
          <tbody>{data.clients.map((c: any) => <tr key={c.key} className="clickable" onClick={() => go('tasama-account', c.key)}><td className="whitespace-nowrap text-sm font-semibold">{bi(c.short, c.name_ar)}</td>
            {keys.map((k) => { const s = c.last.find((x: any) => x.key === k.key); return <td key={k.key} className="text-center">{s ? <><SlaCell s={s} /><span className="block text-[10px] text-muted-foreground">{t('target')} {s.target}%</span></> : <span className="text-[11px] text-muted-foreground">{t('not in contract')}</span>}</td>; })}</tr>)}</tbody></Table></div>
      </Panel>
      <Panel icon={<CalendarClock size={16} />} title={`${t('This month to date')} · ${month(data.thisMonth, lang)}`}>
        <div className="overflow-x-auto"><Table><thead><tr><th>{t('Client')}</th>{keys.map((k) => <th key={k.key} className="text-center">{bi(k.label, k.label_ar)}</th>)}</tr></thead>
          <tbody>{data.clients.map((c: any) => <tr key={c.key}><td className="text-sm font-semibold">{bi(c.short, c.name_ar)}</td>{keys.map((k) => { const s = c.current.find((x: any) => x.key === k.key); return <td key={k.key} className="text-center">{s ? <SlaCell s={s} /> : <span className="text-[11px] text-muted-foreground">—</span>}</td>; })}</tr>)}</tbody></Table></div>
      </Panel>
    </Screen>
  );
}

// ------------------------------------------------------------------ Escalations

export function TasamaEscalations() {
  const { t, bi, lang } = useLang();
  const { switchClient, openCase } = useApp();
  const { data } = useApi<any[]>('/tasama/escalations', { poll: 8000 });
  const { data: dl } = useApi<any>('/tasama/delivery');
  const [busy, setBusy] = useState<string | null>(null);
  if (!data) return null;
  const open = data.filter((e) => e.status !== 'RESOLVED');
  const act = async (id: number, action: string, body: any = {}) => { setBusy(`${id}${action}`); try { await post(`/tasama/escalations/${id}/${action}`, body); bump(); } finally { setBusy(null); } };
  const scan = async () => { setBusy('scan'); try { await post('/tasama/escalations/scan'); bump(); } finally { setBusy(null); } };
  const openIn = (e: any) => { switchClient(e.client_key, 'hr-inbox'); setTimeout(() => openCase(e.case_ref), 300); };
  return (
    <Screen hero={<Hero tone="surface" eyebrow={EYEBROW} title={`${open.length} ${t(open.length === 1 ? 'escalation is open' : 'escalations are open')}; ${open.filter((e) => e.kind === 'BREACHED').length} ${t('breached')}`} lede={t('Cases still waiting past their contract service level after the approver was reminded. Assign one to the delivery team, or open the case and decide on the approver\'s behalf.')}
      actions={<Btn kind="primary" onClick={scan} disabled={busy === 'scan'}>{busy === 'scan' ? t('Scanning…') : t('Run Raqeeb\'s scan now')}</Btn>}
      />}>
      <Panel icon={<AlertTriangle size={16} />} title="Open escalations" action={<AgentTag id="raqeeb" />}>
        {open.length ? <Table><thead><tr><th>{t('Case')}</th><th>{t('Service level')}</th><th>{t('Waiting on')}</th><th>{t('Due')}</th><th className="text-end">{t('Action')}</th></tr></thead>
          <tbody>{open.map((e) => (
            <tr key={e.id}>
              <td className="min-w-[14rem]"><span className="block text-sm font-semibold">{bi(e.short, e.client_ar)}</span><span className="block text-xs text-muted-foreground">{bi(e.title, e.title_ar)}</span></td>
              <td><StatusChip status={e.kind} />{e.status !== 'OPEN' ? <span className="mt-1 block text-[11px] text-muted-foreground">{plain(e.action) || t(e.status === 'NUDGED' ? 'Reminded' : 'Assigned')}</span> : null}</td>
              <td className="whitespace-nowrap text-xs">{e.waiting_on ?? e.waiting_on_role}</td>
              <td className="min-w-[8rem] whitespace-nowrap text-xs">{e.due_at ? <>{dateTime(e.due_at, lang)}<div className="mt-1"><ClockBar compact start={e.detected_at ?? e.due_at} due={e.due_at} /></div></> : '—'}</td>
              <td><div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                <Btn small onClick={() => openIn(e)}>{t('Open case')}</Btn>
                {e.status === 'OPEN' ? <Btn small onClick={() => act(e.id, 'nudge')} disabled={!!busy}>{t('Remind')}</Btn> : null}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><button type="button" className="pill-btn pill-btn-ghost px-2.5 py-1.5 text-xs" aria-label={t('More')}><MoreHorizontal className="h-4 w-4" /></button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    <DropdownMenuLabel>{t('Assign to')}</DropdownMenuLabel>
                    {(dl?.staff ?? []).filter((s: any) => s.allocations.some((a: any) => a.client === e.client_key)).map((s: any) => <DropdownMenuItem key={s.id} onSelect={() => act(e.id, 'assign', { staff_id: s.id })}><span className="flex-1">{s.name}</span><span className="text-xs text-muted-foreground">{s.utilization}%</span></DropdownMenuItem>)}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => act(e.id, 'resolve', { note: 'Closed by Tasama HR Operations' })}>{t('Close the escalation')}</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div></td>
            </tr>))}</tbody></Table> : <Empty>{t('Nothing at risk across the portfolio.')}</Empty>}
      </Panel>
      <Panel icon={<ClipboardList size={16} />} title="Resolved">
        {data.filter((e) => e.status === 'RESOLVED').slice(0, 12).map((e) => <StatusRow key={e.id} name={`${bi(e.short, e.client_ar)} · ${bi(e.title, e.title_ar)}`} detail={e.note ?? ''} status={<span className="text-[11px] text-muted-foreground">{e.resolved_at ? ago(e.resolved_at, lang) : ''}</span>} />)}
      </Panel>
    </Screen>
  );
}

// ------------------------------------------------------------------ Finance

export function TasamaFinance() {
  const { t, bi, lang } = useLang();
  const { data } = useApi<any>('/tasama/finance', { poll: 15000 });
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  if (!data) return null;
  const act = async (id: number, action: string, body: any = {}) => { setBusy(`${id}${action}`); try { await post(`/tasama/invoices/${id}/${action}`, body); bump(); } catch (e: any) { alert(e.message); } finally { setBusy(null); } };
  const prepare = async (client: string) => { setBusy(`p${client}`); try { await post('/tasama/invoices/prepare', { client }); bump(); } finally { setBusy(null); } };
  const latest = data.clients.map((c: any) => c.months[c.months.length - 1]).filter(Boolean);
  const rev = latest.reduce((a: number, m: any) => a + m.revenue, 0);
  const mar = latest.reduce((a: number, m: any) => a + m.margin, 0);
  const credits6 = data.invoices.slice(0, 30).reduce((a: number, i: any) => a + Number(i.credits), 0);
  const overdue = data.invoices.filter((i: any) => i.status === 'OVERDUE').reduce((a: number, i: any) => a + Number(i.total), 0);
  const pending = data.invoices.filter((i: any) => i.status === 'PREPARED');
  return (
    <Screen hero={<Hero tone="surface" eyebrow={EYEBROW} title={pending.length ? `${pending.length} ${t(pending.length === 1 ? 'invoice waits for your approval' : 'invoices wait for your approval')}` : t('No invoice waits for your approval')} lede={t('Each invoice is prepared from the payroll headcount, completed hires and the service credits for missed service levels.')} />}>
      <StatRow>
        <StatTile label="Revenue, latest month" value={aedShort(rev, lang)} trend={{ direction: 'flat', label: t('excl. VAT, all clients') }} />
        <StatTile label="Margin, latest month" value={rev ? `${Math.round((mar / rev) * 100)}%` : '—'} trend={{ direction: 'flat', label: aedShort(mar, lang) }} />
        <StatTile label="Service credits given" value={aedShort(credits6, lang)} trend={{ direction: 'flat', label: t('last invoices, all clients') }} />
        <StatTile label="Overdue" value={aedShort(overdue, lang)} state={overdue ? <Chip tone="danger">{t('chase')}</Chip> : undefined} />
      </StatRow>
      {data.notPrepared.length ? <Panel icon={<Receipt size={16} />} title="Not yet prepared">
        {data.notPrepared.map((n: any) => <StatusRow key={n.key} name={`${n.short} · ${month(n.period, lang)}`} detail={t('No invoice yet for last month.')} status={<Btn small kind="primary" onClick={() => prepare(n.key)} disabled={!!busy}>{busy === `p${n.key}` ? t('Preparing…') : t('Prepare with Fatoora')}</Btn>} />)}
      </Panel> : null}
      <Panel icon={<Receipt size={16} />} title="Invoices">
        <Table><thead><tr><th>{t('Client')}</th><th>{t('Month')}</th><th className="text-end">{t('Employees')}</th><th className="text-end">{t('Base fee')}</th><th className="text-end">{t('Hires')}</th><th className="text-end">{t('Credits')}</th><th className="text-end">{t('Total incl. VAT')}</th><th>{t('Status')}</th><th /></tr></thead>
          <tbody>{data.invoices.map((i: any) => (
            <Fragment key={i.id}>
              <tr className="clickable" onClick={() => setOpen(open === i.id ? null : i.id)}>
                <td className="text-sm">{bi(i.short, i.name_ar)}</td><td>{month(i.period, lang)}</td>
                <td className="text-end tabular-nums">{i.headcount}</td><td className="text-end tabular-nums">{aed(i.base_fee, lang)}</td><td className="text-end tabular-nums">{i.hires ? `${i.hires} · ${aed(i.hire_fees, lang)}` : '—'}</td>
                <td className="text-end tabular-nums">{Number(i.credits) ? <Chip tone="warn">{aed(-i.credits, lang)}</Chip> : '—'}</td><td className="text-end tabular-nums font-semibold">{aed(i.total, lang)}</td>
                <td><StatusChip status={i.status} /></td>
                <td onClick={(e) => e.stopPropagation()}>{i.status === 'PREPARED' ? <div className="flex gap-1"><Btn small kind="primary" onClick={() => act(i.id, 'approve')} disabled={!!busy}>{t('Approve and issue')}</Btn><Btn small onClick={() => { const r = prompt(t('Reason for returning it to Fatoora')); if (r) act(i.id, 'return', { reason: r }); }}>{t('Return')}</Btn></div> : i.status === 'OVERDUE' || i.status === 'ISSUED' ? <Btn small onClick={() => act(i.id, 'paid')}>{t('Mark paid')}</Btn> : null}</td>
              </tr>
              {open === i.id ? <tr><td colSpan={9} className="bg-muted/30"><p className="mb-1 text-xs text-muted-foreground">{i.number}</p>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <ul className="list-disc space-y-0.5 ps-5 text-xs">{(i.notes ?? []).map((n: string, k: number) => <li key={k}>{n}</li>)}</ul>
                </div>
              </td></tr> : null}
            </Fragment>))}</tbody></Table>
      </Panel>
      <Panel icon={<Banknote size={16} />} title="Margin by client and month">
        <div className="overflow-x-auto"><Table><thead><tr><th>{t('Client')}</th><th className="text-end">{t('Fee per employee')}</th><th className="w-40">{t('Latest margin')}</th>{data.clients[0]?.months.slice(-6).map((m: any) => <th key={m.period} className="text-end">{month(m.period, lang)}</th>)}</tr></thead>
          <tbody>{data.clients.map((c: any) => <tr key={c.key}><td className="text-sm font-semibold">{bi(c.short, c.name_ar)}<span className="block text-[11px] font-normal text-muted-foreground">{c.model}</span></td><td className="text-end tabular-nums">{aed(c.pepm, lang)}</td><td>{(() => { const m = c.months[c.months.length - 1]; return m ? <div className="flex items-center gap-2"><div className="w-24"><Bullet value={Math.round(m.marginPct)} target={20} max={70} label={t('Margin')} /></div><span className="text-xs tabular-nums">{Math.round(m.marginPct)}%</span></div> : '—'; })()}</td>
            {data.clients[0].months.slice(-6).map((h: any) => { const m = c.months.find((x: any) => x.period === h.period); return <td key={h.period} className="text-end text-xs tabular-nums">{m ? <><span className="block">{aedShort(m.revenue, lang)}</span><span className={m.marginPct < 20 ? 'text-destructive' : 'text-muted-foreground'}>{Math.round(m.marginPct)}%</span></> : '—'}</td>; })}</tr>)}</tbody></Table></div>
      </Panel>
    </Screen>
  );
}

// ------------------------------------------------------------------ Delivery team

export function TasamaDelivery() {
  const { t, bi } = useLang();
  const { data } = useApi<any>('/tasama/delivery', { poll: 20000 });
  if (!data) return null;
  const short = (k: string) => data.clients.find((c: any) => c.key === k);
  const over = data.staff.filter((s: any) => s.utilization > 100);
  return (
    <Screen hero={<Hero tone="surface" eyebrow={EYEBROW} title={over.length ? `${over.length} ${t(over.length === 1 ? 'person is over capacity' : 'people are over capacity')}` : t('Everyone is within capacity')} lede={t('Each person\'s load from the work their clients generated in the last 30 days, against their capacity on these accounts.')} />}>
      {data.suggestions.length ? <Panel icon={<Workflow size={16} />} title="Tawzee suggests">
        {data.suggestions.map((s: any, i: number) => <StatusRow key={i} name={s.skill === 'HR_OPS' ? t('HR operations') : s.skill === 'PAYROLL' ? t('Payroll') : t('Recruitment')} detail={s.text} status={<Chip tone="warn">{s.hours} h</Chip>} />)}
      </Panel> : null}
      <Panel icon={<Users size={16} />} title="People and load">
        <Table><thead><tr><th>{t('Name')}</th><th>{t('Role')}</th><th>{t('Accounts')}</th><th className="text-end">{t('Load (h/month)')}</th><th className="text-end">{t('Capacity')}</th><th className="w-[220px]">{t('Utilisation')}</th></tr></thead>
          <tbody>{data.staff.map((s: any) => <tr key={s.id}>
            <td className="text-sm font-medium">{bi(s.name, s.name_ar)}</td><td className="text-xs">{bi(s.role, s.role_ar)}</td>
            <td><div className="flex flex-wrap gap-1">{s.allocations.map((a: any) => <Chip key={a.client}>{bi(short(a.client)?.short, short(a.client)?.name_ar)} {Math.round(a.fte * 100)}%</Chip>)}</div></td>
            <td className="text-end tabular-nums">{s.load_hours}</td><td className="text-end tabular-nums">{s.capacity}</td>
            <td><div className="flex items-center gap-2"><Bar value={Math.min(150, s.utilization)} max={150} tone={s.utilization > 100 ? 'danger' : s.utilization > 85 ? 'warn' : 'primary'} /><span className="w-12 text-end font-mono text-xs">{s.utilization}%</span></div></td>
          </tr>)}</tbody></Table>
      </Panel>
    </Screen>
  );
}

// ------------------------------------------------------------------ HR policies of every client

const COMPARE: [string, string][] = [['4.1', 'Annual leave'], ['4.4', 'Air tickets'], ['5.6', 'Remote work'], ['6.5', 'Education allowance'], ['6.6', 'Medical insurance'], ['7.2', 'Salary advances'], ['3.4', 'Probation'], ['12.1', 'Notice periods'], ['5.1', 'Working hours'], ['4.2', 'Carry-forward']];

export function TasamaPolicies() {
  const { t, bi, lang } = useLang();
  const { session } = useApp();
  const [client, setClient] = useState<string>(session?.clients[0]?.key ?? 'roshn');
  const [ref, setRef] = useState('4.1');
  const [q, setQ] = useState('');
  const { data } = useApi<any>(`/tasama/policies?client=${client}`);
  const { data: cmp } = useApi<any>(`/tasama/policies/compare?ref=${ref}`);
  const ql = q.trim().toLowerCase();
  return (
    <Screen hero={<Hero tone="surface" eyebrow={EYEBROW} title={`${session?.clients.length ?? 0} ${t('clients, each with its own HR handbook')}`} lede={t('Compare one rule across clients, or read one client\'s handbook. Employees are answered only from their own company\'s handbook.')} />}>
      <Panel icon={<Scale size={16} />} title="Compare one rule across clients">
        <div className="mb-3 flex flex-wrap gap-1.5">{COMPARE.map(([r, l]) => <button key={r} type="button" onClick={() => setRef(r)} className={`mono-chip ${ref === r ? 'is-primary' : ''}`}>{t(l)}</button>)}</div>
        {cmp ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{cmp.rows.map((r: any) => (
          <div key={r.key} className="rounded-xl glass-l3 p-3">
            <p className="text-sm font-semibold">{bi(r.short, r.name_ar)}</p>
            {r.clause ? <><p className="mt-1 text-xs font-medium text-muted-foreground">{r.clause.id} · {bi(r.clause.heading, r.clause.heading_ar)}</p><p className="mt-1 text-sm">{lang === 'ar' ? r.clause.text_ar : r.clause.text_en}</p>{r.clause.legal_ref ? <p className="mt-1 font-mono text-[10px] text-muted-foreground">{r.clause.legal_ref}</p> : null}</> : <p className="text-xs text-muted-foreground">{t('No such clause.')}</p>}
          </div>))}</div> : null}
      </Panel>
      <Panel icon={<BookOpen size={16} />} title="Handbook" action={<input className="input h-8 w-56 text-sm" placeholder={t('Filter clauses')} value={q} onChange={(e) => setQ(e.target.value)} />}>
        <ClientPicker value={client} onChange={setClient} />
        {data ? <div className="mt-4 space-y-5">{data.policies.map((p: any) => {
          const cls = data.clauses.filter((c: any) => c.policy_id === p.id && (!ql || `${c.heading} ${c.text_en} ${c.tags?.join(' ')}`.toLowerCase().includes(ql)));
          if (!cls.length) return null;
          return (
            <section key={p.id}>
              <h3 className="text-sm font-semibold">{p.id} · {bi(p.title, p.title_ar)} <span className="font-normal text-muted-foreground">· v{p.version} · {date(p.effective_date, lang)}</span></h3>
              <div className="mt-2 space-y-2">{cls.map((c: any) => (
                <div key={c.id} className="rounded-lg border border-border/60 p-3">
                  <p className="text-xs font-semibold">§{c.clause_ref} {bi(c.heading, c.heading_ar)} {c.legal_ref ? <span className="ms-2 font-mono text-[10px] font-normal text-muted-foreground">{c.legal_ref}</span> : null}</p>
                  <p className="mt-1 text-sm">{lang === 'ar' ? c.text_ar : c.text_en}</p>
                </div>))}</div>
            </section>);
        })}</div> : null}
      </Panel>
    </Screen>
  );
}

// ------------------------------------------------------------------ Patterns (Basira)

/** Weekly rate per 100 cases against the baseline; the last two weeks are the ones judged. */
function RateChart({ series, baseline }: { series: { week: string; rate: number; issues: number }[]; baseline: number }) {
  const W = 420, H = 96, max = Math.max(baseline * 1.6, ...series.map((s) => s.rate), 1);
  const bw = W / series.length;
  const y = (v: number) => H - (v / max) * (H - 8);
  return (
    <svg viewBox={`0 0 ${W} ${H + 14}`} className="h-28 w-full" role="img" aria-label="Weekly rate per 100 cases against the baseline">
      {series.map((s, i) => {
        const recent = i >= series.length - 2;
        return (
          <g key={s.week}>
            <rect x={i * bw + 2} y={y(s.rate)} width={bw - 4} height={H - y(s.rate)} rx={2} className={recent ? 'fill-[var(--danger)]' : 'fill-[hsl(var(--primary))] opacity-50'}><title>{`${s.week}: ${s.rate} per 100 (${s.issues})`}</title></rect>
          </g>
        );
      })}
      <line x1={0} x2={W} y1={y(baseline)} y2={y(baseline)} strokeDasharray="4 3" className="stroke-[hsl(var(--foreground))] opacity-60" strokeWidth={1} />
      <text x={2} y={Math.max(10, y(baseline) - 4)} className="fill-[hsl(var(--muted-foreground))] text-[9px]">baseline {baseline}</text>
      <text x={0} y={H + 12} className="fill-[hsl(var(--muted-foreground))] text-[9px]">{series[0]?.week}</text>
      <text x={W} y={H + 12} textAnchor="end" className="fill-[hsl(var(--muted-foreground))] text-[9px]">{series[series.length - 1]?.week}</text>
    </svg>
  );
}

function PatternCard({ p, staff, focus }: { p: any; staff: any[]; focus: boolean }) {
  const { t, bi, lang } = useLang();
  const { switchClient, openCase } = useApp();
  const [showIssues, setShowIssues] = useState(false);
  const issues = useApi<any[]>(showIssues ? `/tasama/patterns/${p.id}/issues` : null);
  const [owner, setOwner] = useState('');
  const [action, setAction] = useState('');
  const [days, setDays] = useState('14');
  const [outcome, setOutcome] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const act = async (path: string, body: any) => { setBusy(true); setErr(null); try { await post(`/tasama/patterns/${p.id}/${path}`, body); bump(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const unit = p.workflow_id === 'WF-13' ? t('per 100 payroll changes') : p.workflow_id === 'WF-15' ? t('per 100 leave requests') : t('per 100 cases');
  return (
    <div id={`pattern-${p.ref}`} className={`rounded-2xl glass-l3 p-4 ${focus ? 'ring-2 ring-primary' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip status={p.status} />
        {p.client_names.map((n: string) => <Chip key={n}>{n}</Chip>)}
      </div>
      <h3 className="mt-2 text-lg font-semibold">{bi(p.title, p.title_ar)}</h3>
      <div className="mt-2 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <div>
          <p className="text-sm"><span className="text-2xl font-bold tabular-nums">{Number(p.current_rate)}</span> <span className="text-muted-foreground">{unit} {t('over the last two weeks, against')} <span className="font-semibold text-foreground">{Number(p.baseline_rate)}</span> {t('before')}</span></p>
          <RateChart series={p.series} baseline={Number(p.baseline_rate)} />
          <p className="eyebrow mt-2">{t('What is different about the recent cases')}</p>
          <ul className="mt-1 space-y-1 text-sm">
            {(p.facts as any[]).map((f, i) => (
              <li key={i}>{f.kind === 'concentrated'
                ? <><span className="font-medium">{t(f.label)}: {f.value === 'true' ? t('yes') : f.value}</span> — {f.recent_share}% {t('of the recent ones')}, {f.baseline_share}% {t('before')}</>
                : <><span className="font-medium">{t(f.label)}</span>: {t('spread across')} {f.distinct}, {t('none above')} {f.recent_share}%</>}</li>
            ))}
            {!p.facts.length ? <li className="text-muted-foreground">{t('Nothing stands out on the recorded attributes.')}</li> : null}
          </ul>
        </div>
        <div>
          <p className="eyebrow">{t('Likely causes, to be tested')}</p>
          <ol className="mt-1 space-y-2">
            {(p.causes as any[]).map((c, i) => (
              <li key={i} className="rounded-xl border border-border/60 p-3">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">{c.cause} <Chip tone={c.strength === 'strong' ? 'danger' : c.strength === 'moderate' ? 'warn' : undefined}>{t(c.strength)}</Chip></p>
                <p className="mt-1 text-[13px] text-muted-foreground">{t('Evidence')}: {c.evidence}</p>
                {c.next_step ? <p className="mt-1 text-[13px]">{t('Next step')}: {c.next_step}</p> : null}
              </li>
            ))}
          </ol>
        </div>
      </div>
      <div className="mt-3 border-t border-border/50 pt-3">
        {p.status === 'NEW' ? (
          <div className="grid gap-2 sm:grid-cols-[14rem_1fr_12rem_auto] sm:items-start">
            <select className="input h-9 text-sm" value={owner} onChange={(e) => setOwner(e.target.value)}><option value="">{t('Owner…')}</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.role}</option>)}</select>
            <textarea className="input text-sm" rows={2} placeholder={t('What will be done about the cause')} value={action} onChange={(e) => setAction(e.target.value)} />
            <select className="input h-9 text-sm" value={days} onChange={(e) => setDays(e.target.value)}>{['7', '14', '21', '28'].map((d) => <option key={d} value={d}>{t('Measure again in')} {d} {t('days')}</option>)}</select>
            <Btn kind="primary" onClick={() => act('assign', { staff_id: Number(owner), action, recheck_days: Number(days) })} disabled={busy}>{t('Assign')}</Btn>
          </div>
        ) : p.status !== 'CLOSED' ? (
          <div className="space-y-2">
            <p className="text-sm"><span className="font-medium">{bi(p.owner, p.owner_ar)}</span>: {p.action} <span className="text-muted-foreground">· {t('measure again on')} {date(p.recheck_on, lang)}</span></p>
            <div className="flex flex-wrap gap-2"><input className="input h-9 flex-1 text-sm" placeholder={t('Outcome, once the rate is back to its baseline')} value={outcome} onChange={(e) => setOutcome(e.target.value)} /><Btn onClick={() => act('close', { outcome })} disabled={busy}>{t('Close the pattern')}</Btn></div>
          </div>
        ) : <p className="text-sm"><span className="font-medium">{t('Closed')}:</span> {p.outcome}</p>}
        {err ? <p className="mt-1 text-sm text-danger">{err}</p> : null}
        <button type="button" className="mt-2 text-xs text-primary" onClick={() => setShowIssues(!showIssues)}>{showIssues ? t('Hide the issues') : `${t('Show the')} ${p.issue_refs.length} ${t('issues behind it')}`}</button>
        {showIssues && issues.data ? (
          <Table className="mt-2"><thead><tr><th>{t('Issue')}</th><th>{t('Client')}</th><th>{t('When')}</th><th>{t('What happened')}</th></tr></thead>
            <tbody>{issues.data.map((i) => (
              <tr key={i.ref}><td className="font-mono text-[11px]">{i.ref}{i.case_ref ? <button type="button" className="block text-primary" onClick={() => { switchClient(i.client_key, 'hr-inbox'); setTimeout(() => openCase(i.case_ref), 300); }}>{i.case_ref}</button> : null}</td><td className="text-xs">{i.client}</td><td className="text-xs">{date(i.occurred_at, lang)}</td><td className="text-xs">{i.summary}</td></tr>
            ))}</tbody></Table>
        ) : null}
      </div>
    </div>
  );
}

export function TasamaPatterns() {
  const { t, bi } = useLang();
  const { route } = useApp();
  const { data } = useApi<any>('/tasama/patterns');
  const [busy, setBusy] = useState(false);
  const scan = async () => { setBusy(true); try { await post('/tasama/patterns/scan'); bump(); } finally { setBusy(false); } };
  useEffect(() => {
    if (!route.param || !data) return;
    const el = document.getElementById(`pattern-${route.param}`);
    if (el) window.setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
  }, [route.param, data]);
  if (!data) return null;
  const open = data.patterns.filter((p: any) => p.status !== 'CLOSED');
  return (
    <Screen hero={<Hero tone="surface" eyebrow={EYEBROW} title={open.length ? `${open.length} ${t(open.length === 1 ? 'problem is rising' : 'problems are rising')}` : t('No problem is rising')} lede={t('Escalations, declines, returns and payroll findings per 100 cases each week, for each client and across clients, against their own baseline. A rise counts only when it holds for two weeks with enough cases.')}
      actions={<Btn kind="primary" onClick={scan} disabled={busy}>{busy ? t('Scanning…') : t('Run Basira\'s scan now')}</Btn>}
      />}>
      <div className="space-y-4">
        {data.patterns.map((p: any) => <PatternCard key={p.id} p={p} staff={data.staff} focus={route.param === p.ref} />)}
        {!data.patterns.length ? <Empty>{t('No rising problems in the last two weeks.')}</Empty> : null}
      </div>
      <Panel icon={<Scale size={16} />} title="Looked at, not flagged">
        {data.watch.length ? data.watch.map((w: any) => <StatusRow key={w.id} name={`${w.client_names[0]} · ${bi(w.reason, w.reason_ar)}`} detail={w.note} status={null} />) : <Empty>{t('Nothing else rose above its usual rate.')}</Empty>}
      </Panel>
    </Screen>
  );
}
