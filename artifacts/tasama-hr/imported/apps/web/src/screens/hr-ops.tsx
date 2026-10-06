/** HR Workspace: payroll and rewards, exits and relations, compliance. */
import { useState } from 'react';
import { HeroFeature, PageColumns, Panel, PanelAction, StatRow, StatTile, StatusRow } from '@cognirise/atelier/layout';
import { ProvenanceNote } from '@cognirise/atelier/archetypes';
import { AlertTriangle, Banknote, CalendarClock, DoorOpen, FileWarning, Landmark, Play, RefreshCw, ShieldCheck, Wallet } from 'lucide-react';
import { bump, post, useApi } from '../lib/api';
import { useLang } from '../lib/i18n';
import { aed, aedShort, ago, date, daysUntil, month, num } from '../lib/format';
import { useApp } from '../app/state';
import { AgentTag, Bar, Btn, Chip, Empty, Hero, Person, Ref, Screen, SourceStamp, StatusChip, Table } from '../app/ui';

export function HrPayroll() {
  const { t, bi, lang } = useLang();
  const { openCase, has } = useApp();
  const { data } = useApi<any>('/payroll');
  const [busy, setBusy] = useState(false);
  if (!data) return null;
  const pc = data.precheck;
  const blockers = pc.findings.filter((f: any) => f.severity === 'BLOCKER').length;
  const high = pc.findings.filter((f: any) => f.severity === 'HIGH').length;
  const closed = data.periods.filter((p: any) => p.status === 'CLOSED');
  const maxG = Math.max(...closed.map((p: any) => p.gross ?? 0), 1);
  const caseOpen = data.openCase && ['WAITING', 'ESCALATED', 'RUNNING'].includes(data.openCase.status);
  const start = async () => { setBusy(true); try { const r = await post('/requests', { type: 'PRECHECK' }); bump(); openCase(r.ref); } finally { setBusy(false); } };
  return (
    <Screen hero={<Hero tone="surface" eyebrow="HR Workspace" title="Payroll and rewards" lede={`${month(pc.period.period_name, lang)} · ${t('cut-off')} ${date(pc.period.cutoff_date, lang)} · ${t('pay date')} ${date(pc.period.pay_date, lang)}. ${t('Hisab reads every line of the draft payroll before it is paid and holds release until each finding is fixed or explained.')}`}
      actions={has('PAYROLL') ? (caseOpen ? <Btn kind="primary" onClick={() => openCase(data.openCase.ref)}>{t('Open the pre-run case')}</Btn> : <Btn kind="primary" onClick={start} disabled={busy}><Play className="h-4 w-4" />{t('Start the pre-run check')}</Btn>) : undefined}
      feature={<HeroFeature label="Release" value={pc.blocked ? t('Held') : t('Clear')} support={<Chip tone={pc.blocked ? 'danger' : 'success'}>{blockers} {t('blockers')} · {high} {t('high')}</Chip>} />} />}>
      <StatRow>
        <StatTile label="Employees on the run" value={num(pc.totals.headcount)} trend={{ direction: 'flat', label: `${pc.last?.n ?? '—'} ${t('last month')}` }} />
        <StatTile label="Draft gross" value={aedShort(pc.totals.gross, lang)} trend={{ direction: pc.totals.gross >= (pc.last?.gross ?? 0) ? 'up' : 'down', label: `${aed(pc.totals.gross - (pc.last?.gross ?? 0), lang)} ${t('on last month')}` }} />
        <StatTile label="Draft net" value={aedShort(pc.totals.net, lang)} />
        <StatTile label="Employer contributions" value={aedShort(pc.totals.employer, lang)} trend={{ direction: 'flat', label: t('GOSI and end-of-service provision') }} />
      </StatRow>
      <Panel icon={<AlertTriangle size={16} />} title="Hisab's pre-run findings (live preview)" action={<AgentTag id="hisab" autonomy="A1" />}>
        <Table><thead><tr><th>{t('Severity')}</th><th>{t('Finding')}</th><th>{t('Employee')}</th><th>{t('Detail')}</th><th className="text-end">{t('At stake')}</th><th>{t('Rule')}</th></tr></thead>
          <tbody>{pc.findings.map((f: any) => <tr key={f.id}><td><StatusChip status={f.severity} /></td><td className="text-sm font-medium">{bi(f.title, f.title_ar)}</td><td className="whitespace-nowrap text-sm">{bi(f.name, f.name_ar)}<span className="block font-mono text-[10px] text-muted-foreground">{f.person_number}</span></td><td className="max-w-[360px] text-xs">{f.detail}<span className="block text-muted-foreground">{t('Fix')}: {f.fix}</span></td><td className="text-end tabular-nums">{aed(f.amount, lang)}</td><td className="font-mono text-[10px]">{f.rule}</td></tr>)}</tbody></Table>
        <ProvenanceNote>{t('Planted in the synthetic data on purpose: a promotion missing from element entries, a leaver still paid, a deduction above 50%, a joiner without housing or GOSI, unrecorded unpaid leave, an advance instalment above 10% of wage, an IBAN not verified for Mudad.')}</ProvenanceNote>
      </Panel>
      <PageColumns aside={<>
        <Panel icon={<Landmark size={16} />} title="End-of-service position">
          {data.eos.map((e: any) => <StatusRow key={e.basis} name={t('End-of-service award (Art. 84)')} detail={`${t('liability today')} ${aed(data.gratuityLiability, lang)}`} status={<span className="font-mono text-xs">{e.n}</span>} />)}
          <p className="mt-2 text-xs text-muted-foreground">{t('Liability on the termination basis: half a month of the last wage for each of the first five years, a full month for each year after. Saudi employees are also covered by GOSI annuities and SANED, paid separately.')}</p>
        </Panel>
        <Panel icon={<Wallet size={16} />} title="Salary advances book">
          {data.advances.slice(0, 8).map((a: any) => <StatusRow key={a.advance_number} name={`${a.display_name} · ${aed(a.amount, lang)}`} detail={`${a.advance_number} · ${aed(a.monthly_recovery, lang)} × ${a.months} · ${t('outstanding')} ${aed(a.outstanding, lang)}`} status={<StatusChip status={a.status} />} />)}
        </Panel>
      </>}>
        <Panel icon={<Banknote size={16} />} title="Payroll runs" action={<SourceStamp resource="payrollResults" />}>
          <div className="space-y-1.5">{closed.map((p: any) => <div key={p.id} className="flex items-center gap-3 text-sm"><span className="w-20 shrink-0">{month(p.period_name, lang)}</span><Bar value={p.gross} max={maxG} /><span className="w-32 shrink-0 text-end font-mono text-xs tabular-nums">{aed(p.gross, lang)}</span><Chip>{p.lines}</Chip><Chip tone="success">{t('Paid through Mudad')}</Chip></div>)}</div>
        </Panel>
        <Panel icon={<RefreshCw size={16} />} title="Element entries written by Rafeeq" action={<PanelAction>{t('through the connector')}</PanelAction>}>
          <Table><thead><tr><th>{t('Entry')}</th><th>{t('Employee')}</th><th>{t('Element')}</th><th className="text-end">{t('Amount')}</th><th>{t('From')}</th><th>{t('Reference')}</th></tr></thead>
            <tbody>{data.changes.slice(0, 15).map((e: any) => <tr key={e.id}><td><Ref>{e.entry_number}</Ref></td><td className="text-sm">{e.display_name}</td><td className="text-sm">{e.element}</td><td className="text-end tabular-nums">{aed(e.amount, lang)}</td><td>{date(e.effective_start, lang)}</td><td className="font-mono text-[10px]">{e.reference}</td></tr>)}</tbody></Table>
        </Panel>
      </PageColumns>
    </Screen>
  );
}

export function HrExits() {
  const { t, bi, lang } = useLang();
  const { openCase, go } = useApp();
  const { data } = useApi<any>('/exits', { poll: 8000 });
  if (!data) return null;
  const openCases = data.cases.filter((c: any) => ['WAITING', 'ESCALATED', 'RUNNING'].includes(c.status));
  return (
    <Screen hero={<Hero tone="surface" eyebrow="HR Workspace" title="Exits and relations" lede="Wadaa works out notice, the final settlement and clearance. Sanad checks every involuntary exit against the documentation, the law and protected situations, and stops a case that would not stand."
      feature={<HeroFeature label="Open exit cases" value={openCases.length} support={<Chip>{data.leavers.length} {t('leavers on record')}</Chip>} />} />}>
      <Panel icon={<DoorOpen size={16} />} title="Cases">
        <Table><thead><tr><th>{t('Case')}</th><th>{t('Employee')}</th><th>{t('Type')}</th><th>{t('Status')}</th><th>{t('With')}</th><th>{t('Settlement')}</th><th>{t('Opened')}</th></tr></thead>
          <tbody>{data.cases.map((c: any) => <tr key={c.ref} className="clickable" onClick={() => openCase(c.ref)}><td><Ref>{c.ref}</Ref></td><td className="text-sm">{bi(c.subject_name, c.subject_name_ar)}</td><td><Chip>{t(c.workflow_id === 'WF-19' ? 'Resignation' : c.workflow_id === 'WF-20' ? 'Involuntary' : 'ER case')}</Chip></td><td><StatusChip status={c.status} /></td><td className="text-sm">{c.waiting_on_name ?? '—'}</td><td className="tabular-nums">{c.result?.settlement ? aed(c.result.settlement.total, lang) : '—'}</td><td>{date(c.created_at, lang)}</td></tr>)}</tbody></Table>
        {!data.cases.length ? <Empty>{t('No exit cases. Run the involuntary-exit scenario to see Sanad stop one.')}</Empty> : null}
      </Panel>
      <PageColumns aside={<Panel icon={<FileWarning size={16} />} title="Why people left (12 months)">
        {data.reasons.map((r: any) => <div key={r.reason} className="py-1.5"><div className="flex justify-between text-sm"><span>{r.reason}</span><span className="font-mono text-xs">{r.n}</span></div><Bar value={r.n} max={data.reasons[0]?.n} className="mt-1" tone="accent" /></div>)}
      </Panel>}>
        <Panel icon={<CalendarClock size={16} />} title="Clearance journeys">
          {data.journeys.length ? data.journeys.map((j: any) => { const done = j.tasks.filter((x: any) => x.status === 'DONE').length; return (
            <div key={j.id} className="mb-3 rounded-xl glass-l3 p-3"><div className="flex items-center gap-2"><span className="text-sm font-medium">{j.display_name}</span><Ref>{j.journey_number}</Ref><Chip className="ms-auto">{t('last day')} {date(j.target_date, lang)}</Chip></div>
              <div className="mt-2 flex flex-wrap gap-1.5">{j.tasks.map((x: any) => <span key={x.id} className={`mono-chip ${x.status === 'DONE' ? 'is-success' : ''}`}>{bi(x.title, x.title_ar)}</span>)}</div><p className="mt-1 text-[11px] text-muted-foreground">{done}/{j.tasks.length}</p></div>
          ); }) : <Empty>{t('No clearance journeys open.')}</Empty>}
        </Panel>
        <Panel icon={<DoorOpen size={16} />} title="Leavers on record" action={<SourceStamp resource="workers/workRelationships" />}>
          <Table><thead><tr><th>{t('Person')}</th><th>{t('Department')}</th><th>{t('Last day')}</th><th>{t('Action')}</th><th>{t('Reason')}</th></tr></thead>
            <tbody>{data.leavers.map((l: any) => <tr key={l.id} className="clickable" onClick={() => go('person', String(l.id))}><td className="text-sm">{l.display_name}</td><td className="text-sm">{l.department}</td><td>{date(l.last_working_day, lang)}</td><td><Chip>{l.termination_action}</Chip></td><td className="text-xs">{l.termination_reason}</td></tr>)}</tbody></Table>
        </Panel>
      </PageColumns>
    </Screen>
  );
}

export function HrCompliance() {
  const { t, bi, lang } = useLang();
  const { go } = useApp();
  const { data, reload } = useApi<any>('/compliance');
  const [kind, setKind] = useState('all');
  if (!data) return null;
  const kinds = [...new Set(data.alerts.map((a: any) => a.kind))] as string[];
  const rows = data.alerts.filter((a: any) => kind === 'all' || a.kind === kind);
  const K: Record<string, string> = { IQAMA_EXPIRY: 'Iqama expiry', NATIONAL_ID_EXPIRY: 'National ID expiry', PASSPORT_EXPIRY: 'Passport expiry', PROBATION_DUE: 'Probation due', CONTRACT_RENEWAL: 'Contract renewal', SAUDIZATION: 'Saudization (Nitaqat)', MUDAD_DUE: 'Mudad due date' };
  const sa = data.alerts.find((a: any) => a.kind === 'SAUDIZATION');
  return (
    <Screen hero={<Hero tone="surface" eyebrow="HR Workspace" title="Compliance" lede="Amin watches every date and ratio a regulator would check. It observes and alerts; it never acts."
      actions={<Btn onClick={async () => { await post('/compliance/scan'); bump(); reload(); }}><RefreshCw className="h-4 w-4" />{t('Run the scan now')}</Btn>}
      feature={<HeroFeature label="Open alerts" value={data.alerts.filter((a: any) => a.status === 'OPEN').length} support={<Chip tone="danger">{data.alerts.filter((a: any) => a.severity === 'URGENT').length} {t('urgent')}</Chip>} />} />}>
      {sa ? <Panel icon={<ShieldCheck size={16} />} title="Saudization (Nitaqat)" tone="accent"><p className="text-sm font-medium">{bi(sa.title, sa.title_ar)}</p><p className="mt-1 text-sm text-muted-foreground">{sa.detail}</p></Panel> : null}
      <div className="flex flex-wrap gap-1.5"><button type="button" onClick={() => setKind('all')} className={`mono-chip ${kind === 'all' ? 'is-primary' : ''}`}>{t('All')} · {data.alerts.length}</button>{kinds.map((k) => <button key={k} type="button" onClick={() => setKind(k)} className={`mono-chip ${kind === k ? 'is-primary' : ''}`}>{t(K[k] ?? k)} · {data.alerts.filter((a: any) => a.kind === k).length}</button>)}</div>
      <Panel icon={<AlertTriangle size={16} />} title="Alerts" action={<AgentTag id="amin" autonomy="A0" />}>
        <Table><thead><tr><th>{t('Severity')}</th><th>{t('Alert')}</th><th>{t('Person')}</th><th>{t('Due')}</th><th>{t('Owner')}</th><th></th></tr></thead>
          <tbody>{rows.map((a: any) => <tr key={a.ref}><td><StatusChip status={a.severity} /></td><td className="text-sm"><span className="font-medium">{bi(a.title, a.title_ar)}</span><span className="block text-xs text-muted-foreground">{a.detail}</span></td><td>{a.person_id ? <button type="button" onClick={() => go('person', String(a.person_id))}><Person name={bi(a.display_name, a.display_name_ar)} size={22} /></button> : '—'}</td><td className="whitespace-nowrap">{date(a.due_date, lang)}{a.due_date ? <span className="block text-[11px] text-muted-foreground">{daysUntil(a.due_date)} {t('days')}</span> : null}</td><td><Chip>{a.owner_role}</Chip></td><td>{a.status === 'OPEN' ? <Btn small onClick={async () => { await post(`/compliance/${a.ref}/resolve`); reload(); }}>{t('Resolve')}</Btn> : <StatusChip status={a.status} />}</td></tr>)}</tbody></Table>
      </Panel>
    </Screen>
  );
}
void ago;
