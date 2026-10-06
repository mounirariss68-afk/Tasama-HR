/**
 * Tasama Services lens: the HR Operations Manager's view of the business —
 * the client portfolio, one client account, service levels, escalations,
 * finance, the delivery team, and every client's HR handbook.
 * Every figure comes from the server, computed from the clients' own records.
 */
import { Fragment, useState } from 'react';
import { HeroFeature, PageColumns, Panel, PanelAction, StatRow, StatTile, StatusRow } from '@cognirise/atelier/layout';
import { ProvenanceNote } from '@cognirise/atelier/archetypes';
import { AlertTriangle, Banknote, BookOpen, Building2, CalendarClock, ClipboardList, Gauge, Network, Receipt, Scale, Users, Workflow } from 'lucide-react';
import { bump, post, useApi } from '../lib/api';
import { useLang } from '../lib/i18n';
import { aed, aedShort, ago, date, dateTime, month, num } from '../lib/format';
import { useApp } from '../app/state';
import { AgentTag, Bar, Btn, Chip, Empty, Hero, Kv, Ref, Screen, StatusChip, Table } from '../app/ui';

const EYEBROW = 'Tasama HR Services';
const pctTone = (att: number | null, target: number) => (att === null ? undefined : att >= target ? 'success' : att >= target - 2 ? 'warn' : 'danger');

function HrmsChip({ hrms }: { hrms: string }) {
  return <span className={`mono-chip ${hrms === 'ODOO' ? 'is-warn' : 'is-primary'}`}>{hrms === 'ODOO' ? 'Odoo' : 'Oracle HCM'}</span>;
}

function SlaCell({ s }: { s: any }) {
  const { t } = useLang();
  if (!s || s.attainment === null) return <span className="text-xs text-muted-foreground">{t('no cases')}</span>;
  return <span title={`${s.met} / ${s.total}`}><Chip tone={pctTone(s.attainment, s.target)}>{s.attainment}%</Chip></span>;
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
  const months = data.clients[0]?.series?.map((m: any) => m.period) ?? [];
  const maxRev = Math.max(1, ...data.clients.flatMap((c: any) => c.series.map((m: any) => m.revenue)));
  return (
    <Screen hero={<Hero eyebrow={EYEBROW} title="Client portfolio" lede={`${num(T.clients)} ${t('client accounts')} · ${num(T.employees)} ${t('employees served')} · ${t('each on its own HRMS: Oracle HCM or Odoo. One agentic layer runs HR for all of them; the service levels, invoices and workload below are computed from their own records.')}`}
      feature={<HeroFeature label="Service levels met last month" value={`${T.slaMet}/${T.slaScored}`} support={<Chip tone={T.breached ? 'danger' : 'success'}>{T.escalationsOpen} {t('open escalations')}</Chip>} />} />}>
      <StatRow>
        <StatTile label="Employees served" value={num(T.employees)} trend={{ direction: 'flat', label: `${num(T.cases30d)} ${t('cases in 30 days')}` }} />
        <StatTile label="Revenue last month" value={aedShort(T.revenueLastMonth, lang)} trend={{ direction: 'flat', label: `${t('margin')} ${T.revenueLastMonth ? Math.round((T.marginLastMonth / T.revenueLastMonth) * 100) : 0}%` }} />
        <StatTile label="Closed with no HR touch" value={T.cases30d ? `${Math.round((T.noTouch30d / T.cases30d) * 100)}%` : '—'} trend={{ direction: 'flat', label: t('last 30 days, all clients') }} />
        <StatTile label="Overdue receivables" value={aedShort(T.overdue, lang)} state={T.overdue ? <Chip tone="danger">{t('overdue')}</Chip> : undefined} />
      </StatRow>

      <Panel icon={<Building2 size={16} />} title="Client accounts" action={<PanelAction>{t('Open an account, or enter its HR workspace')}</PanelAction>}>
        <Table><thead><tr>
          <th>{t('Client')}</th><th>{t('HRMS')}</th><th>{t('Service')}</th><th className="text-end">{t('Employees')}</th><th className="text-end">{t('Open cases')}</th>
          <th>{t('SLAs last month')}</th><th>{t('Escalations')}</th><th>{t('Payroll pre-check')}</th><th className="text-end">{t('Satisfaction')}</th><th className="text-end">{t('Revenue')}</th><th className="text-end">{t('Margin')}</th><th />
        </tr></thead>
          <tbody>{data.clients.map((c: any) => (
            <tr key={c.key} className="clickable" onClick={() => go('tasama-account', c.key)}>
              <td><span className="block text-sm font-semibold">{bi(c.name, c.name_ar)}</span><span className="block text-xs text-muted-foreground">{bi(c.sector, c.sector_ar)}</span></td>
              <td><HrmsChip hrms={c.hrms} /></td>
              <td className="max-w-[180px] text-xs">{bi(c.model, c.model_ar)}</td>
              <td className="text-end tabular-nums">{num(c.headcount)}</td>
              <td className="text-end tabular-nums">{num(c.open_cases)}</td>
              <td><Chip tone={c.sla.lastMet === c.sla.lastScored ? 'success' : 'warn'}>{c.sla.lastMet}/{c.sla.lastScored}</Chip></td>
              <td>{c.escalations.breached ? <Chip tone="danger">{c.escalations.breached} {t('breached')}</Chip> : null} {c.escalations.atRisk ? <Chip tone="warn">{c.escalations.atRisk} {t('at risk')}</Chip> : null}{!c.escalations.breached && !c.escalations.atRisk ? <span className="text-xs text-muted-foreground">—</span> : null}</td>
              <td>{c.payroll ? <Chip tone={c.payroll.blockers ? 'danger' : 'success'}>{c.payroll.blockers} {t('blockers')}</Chip> : '—'}</td>
              <td className="text-end tabular-nums">{c.csat ?? '—'}</td>
              <td className="text-end tabular-nums">{c.lastMonth ? aed(c.lastMonth.revenue, lang) : '—'}</td>
              <td className="text-end tabular-nums">{c.lastMonth ? `${Math.round(c.lastMonth.marginPct)}%` : '—'}</td>
              <td onClick={(e) => e.stopPropagation()}><Btn small onClick={() => switchClient(c.key, 'hr-inbox')}>{t('Enter')}</Btn></td>
            </tr>
          ))}</tbody></Table>
        <ProvenanceNote>{t('Client names are real PIF portfolio companies, used for this demo only. Every employee, salary, policy, contract, fee and service level is fictional.')}</ProvenanceNote>
      </Panel>

      <PageColumns aside={<>
        <Panel icon={<Workflow size={16} />} title="Tasama agents">
          <StatusRow name="Raqeeb" detail={t('Watches every open case in every client against the contract SLA; reminds and escalates.')} status={<AgentTag id="raqeeb" autonomy="A1" showChip />} />
          <StatusRow name="Fatoora" detail={t('Prepares each monthly invoice from headcount, hires and service credits; a person approves.')} status={<AgentTag id="fatoora" autonomy="A1" showChip />} />
          <StatusRow name="Tawzee" detail={t('Balances delivery staff across clients by skill and capacity.')} status={<AgentTag id="tawzee" autonomy="A3" showChip />} />
          <StatusRow name="Intiqal" detail={t('Maps a new client\'s HRMS data and validates payroll master data before the first run.')} status={<AgentTag id="intiqal" autonomy="A1" showChip />} />
        </Panel>
        <Panel icon={<ClipboardList size={16} />} title="Recent activity">
          {data.trail.map((e: any) => <StatusRow key={e.id} name={e.actor_name} detail={bi(e.summary, e.summary_ar)} status={<span className="text-[11px] text-muted-foreground">{ago(e.at, lang)}</span>} />)}
        </Panel>
      </>}>
        <Panel icon={<CalendarClock size={16} />} title="Payroll calendar, this month">
          <Table><thead><tr><th>{t('Client')}</th><th>{t('Cut-off')}</th><th>{t('Pay date (Mudad)')}</th><th>{t('Findings')}</th></tr></thead>
            <tbody>{data.clients.map((c: any) => <tr key={c.key}><td className="text-sm font-medium">{bi(c.short, c.name_ar)}</td><td>{c.period ? date(c.period.cutoff_date, lang) : '—'}</td><td>{c.period ? date(c.period.pay_date, lang) : '—'}</td>
              <td>{c.payroll ? <span className="flex gap-1"><Chip tone={c.payroll.blockers ? 'danger' : 'success'}>{c.payroll.blockers} {t('blockers')}</Chip><Chip tone={c.payroll.high ? 'warn' : undefined}>{c.payroll.high} {t('high')}</Chip></span> : '—'}</td></tr>)}</tbody></Table>
        </Panel>
        <Panel icon={<Banknote size={16} />} title="Revenue by month (excl. VAT)">
          <div className="space-y-3">
            {months.map((m: string) => (
              <div key={m} className="flex items-center gap-3 text-sm">
                <span className="w-16 shrink-0 text-xs text-muted-foreground">{month(m, lang)}</span>
                <div className="flex flex-1 flex-col gap-0.5">
                  {data.clients.map((c: any) => { const r = c.series.find((s: any) => s.period === m); return r ? <div key={c.key} className="flex items-center gap-2"><span className="w-24 shrink-0 truncate text-[11px]">{bi(c.short, c.name_ar)}</span><Bar value={r.revenue} max={maxRev} /><span className="w-24 shrink-0 text-end font-mono text-[11px] tabular-nums">{aedShort(r.revenue, lang)}</span></div> : null; })}
                </div>
              </div>
            ))}
          </div>
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
  if (!data) return null;
  const c = data.client;
  const slaKeys = c.slas.map((s: any) => s.key);
  const last = data.slaHistory[data.slaHistory.length - 2];
  const met = last ? last.results.filter((r: any) => r.ok).length : 0;
  const scored = last ? last.results.filter((r: any) => r.ok !== null).length : 0;
  const maxCsat = 5;
  const enter = (screen: string, ref?: string) => { switchClient(c.key, screen); if (ref) setTimeout(() => openCase(ref), 300); };
  return (
    <Screen hero={<Hero eyebrow={EYEBROW} title={bi(c.name, c.name_ar)} lede={`${bi(c.sector, c.sector_ar)} · ${bi(c.city, c.city_ar)} · ${bi(c.model, c.model_ar)} · ${t('HRMS')}: ${c.hrms_label}. ${t('Account manager')}: ${bi(c.account_manager, c.account_manager_ar)}.`}
      actions={<><Btn kind="primary" onClick={() => enter('hr-inbox')}>{t('Enter the HR workspace')}</Btn><Btn onClick={() => enter('connector')}>{t('HRMS connector')}</Btn></>}
      feature={<HeroFeature label="SLAs met last month" value={`${met}/${scored}`} support={<StatusChip status={c.phase} />} />} />}>
      <ClientPicker value={c.key} onChange={(k) => go('tasama-account', k)} />
      <StatRow>
        <StatTile label="Employees served" value={num(data.headcount.n)} trend={{ direction: 'flat', label: `${Math.round((data.headcount.saudi / Math.max(1, data.headcount.n)) * 100)}% ${t('Saudi')} · ${t('Nitaqat')} ${c.nitaqat.band}` }} />
        <StatTile label="Fee per employee per month" value={aed(c.pepm, lang)} trend={{ direction: 'flat', label: c.per_hire ? `${aed(c.per_hire, lang)} ${t('per hire')}` : t('no recruitment fee') }} />
        <StatTile label="Contract" value={`${date(c.contract_start, lang)}`} trend={{ direction: 'flat', label: `${t('to')} ${date(c.contract_end, lang)}` }} />
        <StatTile label="Monthly cost to serve" value={aedShort(data.finance.monthlyCost, lang)} trend={{ direction: 'flat', label: t('delivery team share and platform') }} />
      </StatRow>

      <Panel icon={<Gauge size={16} />} title="Service levels by month" action={<AgentTag id="raqeeb" autonomy="A1" />}>
        <div className="overflow-x-auto"><Table><thead><tr><th>{t('Service level')}</th><th className="text-end">{t('Target')}</th>{data.slaHistory.map((m: any) => <th key={m.period} className="text-center">{m.period.includes('(') ? t('This month') : month(m.period, lang)}</th>)}</tr></thead>
          <tbody>{slaKeys.map((k: string) => { const d = c.slas.find((s: any) => s.key === k); return (
            <tr key={k}><td className="text-sm font-medium">{bi(d.label, d.label_ar)}</td><td className="text-end tabular-nums">{d.target}%</td>
              {data.slaHistory.map((m: any) => <td key={m.period} className="text-center"><SlaCell s={m.results.find((r: any) => r.key === k)} /></td>)}</tr>); })}</tbody></Table></div>
        <ProvenanceNote>{t('Computed from this client\'s own cases and payroll record: letters against the handbook turnaround, requests against three working days, settlements against the Art. 88 deadline from the last working day, payroll against post-release corrections and the Mudad pay date.')}</ProvenanceNote>
      </Panel>

      <PageColumns aside={<>
        <Panel icon={<Scale size={16} />} title="Services in the contract">
          <div className="flex flex-wrap gap-1.5">{c.services.map((s: any) => <Chip key={s.key}>{bi(s.label, s.label_ar)}</Chip>)}</div>
          <dl className="mt-3 grid grid-cols-2 gap-3"><Kv k={t('Service credits capped at')} v={`${c.credit_cap_pct}% ${t('of the monthly fee')}`} /><Kv k={t('Phase')} v={<StatusChip status={c.phase} />} /></dl>
        </Panel>
        <Panel icon={<Users size={16} />} title="Delivery team on this account" action={<AgentTag id="tawzee" autonomy="A3" showChip={false} />}>
          {data.team.map((s: any) => <StatusRow key={s.id} name={bi(s.name, s.name_ar)} detail={bi(s.role, s.role_ar)} status={<Chip>{Math.round(s.fte * 100)}%</Chip>} />)}
        </Panel>
        <Panel icon={<Network size={16} />} title="HRMS connector, last 7 days">
          {data.hrms.map((h: any) => <StatusRow key={h.system} name={h.system} detail={`${num(h.calls)} ${t('calls')} · ${h.avg_ms} ms`} status={<Chip tone={h.errors ? 'danger' : 'success'}>{h.errors ? `${h.errors} ${t('errors')}` : t('healthy')}</Chip>} />)}
        </Panel>
        <Panel icon={<BookOpen size={16} />} title="Satisfaction survey">
          <div className="space-y-1.5">{data.csat.map((x: any) => <div key={x.period} className="flex items-center gap-3 text-sm"><span className="w-16 shrink-0 text-xs text-muted-foreground">{month(x.period, lang)}</span><Bar value={x.score} max={maxCsat} tone={x.score < 4 ? 'warn' : 'primary'} /><span className="w-10 shrink-0 text-end font-mono text-xs">{x.score}</span></div>)}</div>
        </Panel>
      </>}>
        <Panel icon={<AlertTriangle size={16} />} title="Waiting in the client workflow" action={<PanelAction>{t('Oldest due first')}</PanelAction>}>
          {data.waiting.length ? <Table><thead><tr><th>{t('Case')}</th><th>{t('Title')}</th><th>{t('Waiting on')}</th><th>{t('Due')}</th></tr></thead>
            <tbody>{data.waiting.map((w: any) => <tr key={w.ref} className="clickable" onClick={() => enter('hr-inbox', w.ref)}><td><Ref>{w.ref}</Ref></td><td className="text-sm">{bi(w.title, w.title_ar)}</td><td className="text-xs">{w.waiting_on ?? w.waiting_on_role}</td><td className="text-xs">{w.sla_due ? dateTime(w.sla_due, lang) : '—'}</td></tr>)}</tbody></Table> : <Empty>{t('Nothing waiting.')}</Empty>}
        </Panel>
        <Panel icon={<ClipboardList size={16} />} title="Volumes, last 90 days">
          <Table><thead><tr><th>{t('Workflow')}</th><th className="text-end">{t('Cases')}</th><th className="text-end">{t('No HR touch')}</th></tr></thead>
            <tbody>{data.volumes.map((v: any) => <tr key={v.workflow_id}><td className="text-sm"><span className="font-mono text-[10px] text-muted-foreground">{v.workflow_id}</span> {bi(v.name, v.name_ar)}</td><td className="text-end tabular-nums">{v.n}</td><td className="text-end tabular-nums">{v.no_touch}</td></tr>)}</tbody></Table>
        </Panel>
        <Panel icon={<Receipt size={16} />} title="Invoices and margin">
          <Table><thead><tr><th>{t('Month')}</th><th>{t('Invoice')}</th><th className="text-end">{t('Revenue')}</th><th className="text-end">{t('Credits')}</th><th className="text-end">{t('Cost')}</th><th className="text-end">{t('Margin')}</th><th>{t('Status')}</th></tr></thead>
            <tbody>{data.finance.months.map((m: any) => <tr key={m.number}><td>{month(m.period, lang)}</td><td><Ref>{m.number}</Ref></td><td className="text-end tabular-nums">{aed(m.revenue, lang)}</td><td className="text-end tabular-nums">{m.credits ? aed(-m.credits, lang) : '—'}</td><td className="text-end tabular-nums">{aed(m.cost, lang)}</td><td className="text-end tabular-nums">{Math.round(m.marginPct)}%</td><td><StatusChip status={m.status} /></td></tr>)}</tbody></Table>
        </Panel>
        <Panel icon={<Banknote size={16} />} title="Payroll runs">
          <Table><thead><tr><th>{t('Month')}</th><th className="text-end">{t('Employees')}</th><th className="text-end">{t('Caught before release')}</th><th className="text-end">{t('Corrected after')}</th><th>{t('Pay date')}</th><th>{t('Paid')}</th></tr></thead>
            <tbody>{data.payrollRuns.map((r: any) => <tr key={r.period}><td>{month(r.period, lang)}</td><td className="text-end tabular-nums">{r.employees}</td><td className="text-end tabular-nums">{r.findings_before}</td><td className="text-end tabular-nums">{r.errors_after ? <Chip tone="danger">{r.errors_after}</Chip> : 0}</td><td>{date(r.pay_date_due, lang)}</td><td>{r.paid_on > r.pay_date_due ? <Chip tone="danger">{date(r.paid_on, lang)}</Chip> : <Chip tone="success">{t('on time')}</Chip>}</td></tr>)}</tbody></Table>
        </Panel>
      </PageColumns>
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
    <Screen hero={<Hero tone="surface" eyebrow={EYEBROW} title="Service levels" lede={t('Each client\'s contract sets its own targets. Results are computed from the client\'s cases and payroll record; a missed target becomes a service credit on that month\'s invoice.')}
      feature={<HeroFeature label={`${t('Met in')} ${month(data.lastMonth, lang)}`} value={`${scored.filter((s: any) => s.ok).length}/${scored.length}`} support={<Chip tone="warn">{data.escalations.filter((e: any) => e.status !== 'RESOLVED').length} {t('open escalations')}</Chip>} />} />}>
      <Panel icon={<Gauge size={16} />} title={`${t('Last month')} · ${month(data.lastMonth, lang)}`}>
        <div className="overflow-x-auto"><Table><thead><tr><th>{t('Client')}</th>{keys.map((k) => <th key={k.key} className="text-center">{bi(k.label, k.label_ar)}</th>)}</tr></thead>
          <tbody>{data.clients.map((c: any) => <tr key={c.key} className="clickable" onClick={() => go('tasama-account', c.key)}><td className="text-sm font-semibold">{bi(c.short, c.name_ar)} <HrmsChip hrms={c.hrms} /></td>
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
    <Screen hero={<Hero eyebrow={EYEBROW} title="Escalations" lede={t('Raqeeb watches every waiting case in every client against the contract SLA. It reminds the approver first; what is left comes here. You can assign it to the delivery team, or open the case and decide on behalf of the client approver, with a reason on record.')}
      actions={<Btn kind="primary" onClick={scan} disabled={busy === 'scan'}>{busy === 'scan' ? t('Scanning…') : t('Run Raqeeb\'s scan now')}</Btn>}
      feature={<HeroFeature label="Open" value={open.length} support={<Chip tone="danger">{open.filter((e) => e.kind === 'BREACHED').length} {t('breached')}</Chip>} />} />}>
      <Panel icon={<AlertTriangle size={16} />} title="Open escalations" action={<AgentTag id="raqeeb" autonomy="A1" />}>
        {open.length ? <Table><thead><tr><th>{t('Client')}</th><th>{t('Case')}</th><th>{t('Service level')}</th><th>{t('Waiting on')}</th><th>{t('Due')}</th><th>{t('State')}</th><th>{t('Action')}</th></tr></thead>
          <tbody>{open.map((e) => (
            <tr key={e.id}>
              <td className="text-sm font-semibold">{bi(e.short, e.client_ar)}</td>
              <td><Ref>{e.case_ref}</Ref><span className="block text-xs">{bi(e.title, e.title_ar)}</span></td>
              <td><StatusChip status={e.kind} /><span className="block text-[11px] text-muted-foreground">{e.sla_key}</span></td>
              <td className="text-xs">{e.waiting_on ?? e.waiting_on_role}</td>
              <td className="text-xs">{e.due_at ? dateTime(e.due_at, lang) : '—'}</td>
              <td><StatusChip status={e.status} />{e.action ? <span className="block text-[11px] text-muted-foreground">{e.action}</span> : null}</td>
              <td><div className="flex flex-wrap gap-1">
                <Btn small onClick={() => openIn(e)}>{t('Open case')}</Btn>
                {e.status === 'OPEN' ? <Btn small onClick={() => act(e.id, 'nudge')} disabled={!!busy}>{t('Remind')}</Btn> : null}
                <select className="input h-7 text-xs" value="" onChange={(ev) => ev.target.value && act(e.id, 'assign', { staff_id: Number(ev.target.value) })}>
                  <option value="">{t('Assign to…')}</option>
                  {(dl?.staff ?? []).filter((s: any) => s.allocations.some((a: any) => a.client === e.client_key)).map((s: any) => <option key={s.id} value={s.id}>{s.name} ({s.utilization}%)</option>)}
                </select>
                <Btn small onClick={() => act(e.id, 'resolve', { note: 'Closed by Tasama HR Operations' })} disabled={!!busy}>{t('Close')}</Btn>
              </div></td>
            </tr>))}</tbody></Table> : <Empty>{t('Nothing at risk across the portfolio.')}</Empty>}
      </Panel>
      <Panel icon={<ClipboardList size={16} />} title="Resolved">
        {data.filter((e) => e.status === 'RESOLVED').slice(0, 12).map((e) => <StatusRow key={e.id} name={`${bi(e.short, e.client_ar)} · ${e.case_ref}`} detail={`${bi(e.title, e.title_ar)} · ${e.note ?? ''}`} status={<span className="text-[11px] text-muted-foreground">{e.resolved_at ? ago(e.resolved_at, lang) : ''}</span>} />)}
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
    <Screen hero={<Hero tone="surface" eyebrow={EYEBROW} title="Finance" lede={t('Fatoora prepares every invoice from the payroll headcount, completed hires and the service credits the contract requires for missed SLAs. Nothing is issued to a client until a person approves it.')}
      feature={<HeroFeature label="Waiting for approval" value={pending.length} support={<AgentTag id="fatoora" autonomy="A1" showChip />} />} />}>
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
        <Table><thead><tr><th>{t('Invoice')}</th><th>{t('Client')}</th><th>{t('Month')}</th><th className="text-end">{t('Employees')}</th><th className="text-end">{t('Base fee')}</th><th className="text-end">{t('Hires')}</th><th className="text-end">{t('Credits')}</th><th className="text-end">{t('Total incl. VAT')}</th><th>{t('Status')}</th><th /></tr></thead>
          <tbody>{data.invoices.map((i: any) => (
            <Fragment key={i.id}>
              <tr className="clickable" onClick={() => setOpen(open === i.id ? null : i.id)}>
                <td><Ref>{i.number}</Ref></td><td className="text-sm">{bi(i.short, i.name_ar)}</td><td>{month(i.period, lang)}</td>
                <td className="text-end tabular-nums">{i.headcount}</td><td className="text-end tabular-nums">{aed(i.base_fee, lang)}</td><td className="text-end tabular-nums">{i.hires ? `${i.hires} · ${aed(i.hire_fees, lang)}` : '—'}</td>
                <td className="text-end tabular-nums">{Number(i.credits) ? <Chip tone="warn">{aed(-i.credits, lang)}</Chip> : '—'}</td><td className="text-end tabular-nums font-semibold">{aed(i.total, lang)}</td>
                <td><StatusChip status={i.status} /></td>
                <td onClick={(e) => e.stopPropagation()}>{i.status === 'PREPARED' ? <div className="flex gap-1"><Btn small kind="primary" onClick={() => act(i.id, 'approve')} disabled={!!busy}>{t('Approve and issue')}</Btn><Btn small onClick={() => { const r = prompt(t('Reason for returning it to Fatoora')); if (r) act(i.id, 'return', { reason: r }); }}>{t('Return')}</Btn></div> : i.status === 'OVERDUE' || i.status === 'ISSUED' ? <Btn small onClick={() => act(i.id, 'paid')}>{t('Mark paid')}</Btn> : null}</td>
              </tr>
              {open === i.id ? <tr><td colSpan={10} className="bg-muted/30"><ul className="list-disc space-y-0.5 ps-5 text-xs">{(i.notes ?? []).map((n: string, k: number) => <li key={k}>{n}</li>)}</ul></td></tr> : null}
            </Fragment>))}</tbody></Table>
      </Panel>
      <Panel icon={<Banknote size={16} />} title="Margin by client and month">
        <div className="overflow-x-auto"><Table><thead><tr><th>{t('Client')}</th><th className="text-end">{t('Fee per employee')}</th>{data.clients[0]?.months.slice(-6).map((m: any) => <th key={m.period} className="text-end">{month(m.period, lang)}</th>)}</tr></thead>
          <tbody>{data.clients.map((c: any) => <tr key={c.key}><td className="text-sm font-semibold">{bi(c.short, c.name_ar)}<span className="block text-[11px] font-normal text-muted-foreground">{c.model}</span></td><td className="text-end tabular-nums">{aed(c.pepm, lang)}</td>
            {data.clients[0].months.slice(-6).map((h: any) => { const m = c.months.find((x: any) => x.period === h.period); return <td key={h.period} className="text-end text-xs tabular-nums">{m ? <><span className="block">{aedShort(m.revenue, lang)}</span><span className={m.marginPct < 20 ? 'text-destructive' : 'text-muted-foreground'}>{Math.round(m.marginPct)}%</span></> : '—'}</td>; })}</tr>)}</tbody></Table></div>
        <ProvenanceNote>{t('Cost to serve is each delivery team member\'s share on the account at their fully loaded monthly cost, plus platform running cost per employee. Fees, costs and contracts are illustrative.')}</ProvenanceNote>
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
    <Screen hero={<Hero tone="surface" eyebrow={EYEBROW} title="Delivery team" lede={t('Tawzee estimates each person\'s monthly load from the work their clients generated in the last 30 days, after the agents\' share, and compares it with their allocated capacity on these accounts.')}
      feature={<HeroFeature label="Over capacity" value={over.length} support={<AgentTag id="tawzee" autonomy="A3" showChip />} />} />}>
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
        <ProvenanceNote>{t('Hours per case type and fixed monthly effort per service are illustrative estimates, shown so the calculation can be challenged.')}</ProvenanceNote>
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
    <Screen hero={<Hero tone="surface" eyebrow={EYEBROW} title="HR policies" lede={t('Each client has its own HR handbook, loaded in its account. Rafeeq answers each employee only from their own company\'s handbook and cites the clause. Fictional handbooks written for this demo on Saudi Labor Law (as amended 2025).')}
      feature={<HeroFeature label="Handbooks loaded" value={session?.clients.length ?? 0} support={<Chip>{t('13 policies each')}</Chip>} />} />}>
      <Panel icon={<Scale size={16} />} title="Compare one rule across clients">
        <div className="mb-3 flex flex-wrap gap-1.5">{COMPARE.map(([r, l]) => <button key={r} type="button" onClick={() => setRef(r)} className={`mono-chip ${ref === r ? 'is-primary' : ''}`}>{r} · {t(l)}</button>)}</div>
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
