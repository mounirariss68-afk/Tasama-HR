/** HR Workspace: payroll and rewards, exits and relations, compliance. */
import { useState, type ReactNode } from 'react';
import { HeroFeature, PageColumns, Panel, PanelAction, StatTile, StatusRow } from '@cognirise/atelier/layout';
import { ProvenanceNote } from '@cognirise/atelier/archetypes';
import { AlertTriangle, Banknote, CalendarClock, CalendarDays, DoorOpen, FileWarning, Landmark, Play, RefreshCw, ShieldCheck, Wallet } from 'lucide-react';
import { bump, downloadFile, post, useApi } from '../lib/api';
import { useLang } from '../lib/i18n';
import { aed, aedShort, ago, date, dateShort, daysUntil, month, num } from '../lib/format';
import { useApp } from '../app/state';
import { OverviewTabs } from './hr-core';
import { AgentTag, Bar, Btn, Chip, Empty, Hero, Person, Screen, StatusChip, Table, StatRow, TabStrip } from '../app/ui';
import { InputRows, InputsBar } from '../app/inputs';
import { roleName } from '../app/case';
import { plain } from '../app/decision';
import { ChangeWaterfall, ClockBar, Columns, SegmentBar } from '../app/viz';
import { DepartmentSummary } from './costs';

/**
 * HR Workspace › Payroll for the client's HR operations and CHRO (design/payroll-addendum.md §3, §17).
 * This month: the changes the client has to send before the cut-off. Pre-run check: Hisab's
 * findings, until phase 5 moves them to Tasama's Runs and adds Approval and Reports.
 */
export function HrPayroll() {
  const [tab, setTab] = useState('month');
  const tabs = <TabStrip items={[{ id: 'month', label: 'This month' }, { id: 'approval', label: 'Approval' }, { id: 'calendar', label: 'Calendar' }, { id: 'reports', label: 'Reports' }]} value={tab} onChange={setTab} />;
  return tab === 'month' ? <PayrollThisMonth tabs={tabs} /> : tab === 'approval' ? <PayrollApproval tabs={tabs} /> : tab === 'calendar' ? <PayrollCalendar tabs={tabs} /> : <PayrollReports tabs={tabs} />;
}

/** The run as the client approves it: why net pay moved, who prepared and validated it (§18). */
function PayrollApproval({ tabs }: { tabs: ReactNode }) {
  const { t, lang } = useLang();
  const { openCase, has } = useApp();
  const { data } = useApi<any>('/payroll/approval', { poll: 8000 });
  if (!data?.period) return null;
  const run = data.run, dx = data.differences;
  const monthName = new Date(`${data.period.name}-01T00:00:00Z`).toLocaleString(lang === 'ar' ? 'ar' : 'en-GB', { month: 'long', timeZone: 'UTC' });
  const mine = run?.state === 'VALIDATED' && has('PAYROLL');
  const sar = (v: number) => `SAR ${Math.round(v).toLocaleString('en-US')}`;
  const title = !run ? `${monthName}${t('’s run is prepared after the cut-off on')} ${date(data.period.cutoff, lang)}`
    : run.state === 'APPROVED' ? `${monthName}${t('’s payroll was approved by')} ${run.approver} ${t('on')} ${date(run.approved_at, lang)}`
    : run.state === 'VALIDATED' ? `${monthName}${t('’s payroll waits for approval:')} ${sar(run.totals.net)} ${t('net to')} ${run.people} ${t('people')}`
    : run.state === 'RETURNED' ? `${monthName}${t('’s run was returned to Tasama')}` : `${monthName}${t('’s run is with Tasama payroll')}`;
  return (
    <Screen hero={<Hero tone="surface" eyebrow="HR Workspace" title={title}
      lede={t('Tasama prepares and validates the run; Mutabaqa explains every difference from last month; your HR operations approves it before anything is paid.')}
      actions={run && ['VALIDATED', 'APPROVED'].includes(run.state) ? <Btn kind={mine ? 'primary' : undefined} onClick={() => openCase(run.ref)}>{t(mine ? 'Review and approve' : 'Open the run')}</Btn> : undefined} />}>
      {tabs}
      {dx ? (
        <Panel icon={<Banknote size={16} />} title={`${dx.people.length} ${t('people are paid differently from last month, and why')}`} action={<AgentTag id="mutabaqa" />}>
          <ChangeWaterfall from={dx.lastNet} to={dx.thisNet} fromLabel={`${t('Last month')}, ${t('net')}`} toLabel={`${monthName}, ${t('net')}`} steps={dx.steps.map((x: any) => ({ label: t(x.label), amount: x.amount }))} format={(v) => `SAR ${Math.round(v).toLocaleString('en-US')}`} />
        </Panel>
      ) : <Panel icon={<Banknote size={16} />} title={t('The explanation comes once Tasama has validated the run')}><Empty>{t('Nothing to approve yet.')}</Empty></Panel>}
      {run ? (() => {
        const chain: any[] = run.chain ?? [];
        const links = [['Prepared', run.preparer, run.prepared_at, 'Tasama payroll specialist'], ['Validated', run.validator, run.validated_at, 'Tasama payroll manager'], ['Delivered', run.deliverer, run.delivered_at, 'Tasama HR operations'],
          ...chain.map((l) => [l.role === 'CHRO' ? 'Approved by the CHRO' : 'Approved', l.who, l.at, l.role === 'CHRO' ? 'Your CHRO' : 'Your HR operations', l.current])];
        const done = links.filter((l) => l[1]).length;
        const title = run.state === 'APPROVED' ? `${links.length} ${t('people signed the run, in order: Tasama prepared, validated and delivered it; your side approved it')}`
          : run.state === 'DELIVERED' ? `${t('Three people at Tasama signed the run; it is with')} ${chain.find((l) => l.current)?.label === 'CHRO' ? t('your CHRO') : t('your HR operations')}`
          : `${done} ${t(done === 1 ? 'person at Tasama has signed the run so far' : 'people at Tasama have signed the run so far')}`;
        return (
        <Panel icon={<ShieldCheck size={16} />} title={title}
          action={<PanelAction onClick={() => downloadFile('/api/payroll/package/pdf').catch(() => undefined)}>{t('Download the payroll package')}</PanelAction>}>
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">{links.map(([k, who, at, role, current]: any) => (
            <div key={k} className={`rounded-xl p-3 ${current ? 'border border-primary bg-primary/5' : 'glass-l3'}`}><p className="text-xs text-muted-foreground">{t(k)}</p><p className="mt-0.5 text-sm font-semibold">{who ?? (current ? t('Waiting since') + ' ' + date(run.waiting_since, lang) : t('Waiting'))}</p><p className="text-xs text-muted-foreground">{t(role)}{at ? ` · ${date(at, lang)}` : ''}</p></div>))}</div>
          {chain.length > 1 ? <p className="mt-3 text-xs text-muted-foreground">{t('Your contract names two approvers: HR operations first, then the CHRO. Nothing is paid before both have signed.')}</p> : null}
        </Panel>);
      })() : null}
    </Screen>
  );
}

/** The year's payroll calendar as the client agreed it (design/walkthrough-addendum.md item 5). */
function PayrollCalendar({ tabs }: { tabs: ReactNode }) {
  const { t, lang } = useLang();
  const { openCase, has } = useApp();
  const { data, reload } = useApi<any>('/payroll/calendar', { poll: 8000 });
  const [busy, setBusy] = useState(false);
  if (!data) return null;
  const months: any[] = data.months;
  const open = months.find((m) => m.open) ?? months[0];
  const next = open.stages.find((s: any) => s.state !== 'DONE');
  const title = data.status === 'APPROVED' ? `${data.year}${t('’s payroll calendar was approved by')} ${data.approved_by} ${t('on')} ${date(data.approved_at, lang)}`
    : data.status === 'PROPOSED' ? `${data.year}${t('’s payroll calendar waits for your approval')}` : `${t('No calendar is agreed for')} ${data.year}`;
  const approve = async () => { setBusy(true); try { await post('/payroll/calendar/approve', { year: data.year }); bump(); reload(); } finally { setBusy(false); } };
  const STAGE: Record<string, [string, string]> = { cutoff: ['Cut-off: your changes are in', 'Cut-off'], calculation: ['Payroll calculated', 'Calculated'], review: ['Reviewed by the payroll manager', 'Reviewed'], delivery: ['Delivered to you', 'Delivered'], approval: ['Approved by you', 'Approved'], bank: ['Uploaded to the bank', 'Bank'], pay: ['Payment date', 'Paid'] };
  const owner = (o: string) => t(o === 'CLIENT' ? 'You' : o === 'CLIENT_FINANCE' ? 'Your finance' : o === 'TASAMA_HR_OPS' ? 'Tasama HR operations' : o === 'TASAMA_PAYROLL' ? 'Tasama payroll specialist' : 'Tasama payroll manager');
  return (
    <Screen hero={<Hero tone="surface" eyebrow="HR Workspace" title={title}
      lede={t('Agreed once a year: your cut-off, Tasama’s calculation, review and delivery, your approval, the bank upload and the payment date, every month, off weekends and holidays. Wared reminds you the day before your cut-off and your approval date.')}
      actions={data.canApprove && has('PAYROLL') ? <span className="inline-flex gap-2"><Btn kind="primary" onClick={approve} disabled={busy}>{t('Approve the calendar')}</Btn>{data.ref ? <Btn onClick={() => openCase(data.ref)}>{t('Ask for a date to move')}</Btn> : null}</span> : data.ref ? <Btn onClick={() => openCase(data.ref)}>{t('How it was agreed')}</Btn> : undefined}
      feature={next ? <HeroFeature label={next.state === 'TODAY' ? 'Today' : 'Next on the calendar'} value={dateShort(next.date, lang)} support={<span className="text-xs text-muted-foreground">{t(STAGE[next.key][0])} · {owner(next.owner)}</span>} /> : undefined} />}>
      {tabs}
      <Panel icon={<CalendarClock size={16} />} title={`${month(open.period, lang)}: ${open.stages.filter((s: any) => s.state === 'DONE').length} ${t('of')} ${open.stages.length} ${t('stages done')}`} action={<AgentTag id="wared" />}>
        <ol className="grid gap-2 md:grid-cols-7">{open.stages.map((s: any) => (
          <li key={s.key} className={`rounded-xl p-3 ${s.state === 'TODAY' ? 'border border-primary bg-primary/5' : s.state === 'DONE' ? 'glass-l3 opacity-70' : 'glass-l3'}`}>
            <p className="text-lg font-semibold tabular-nums">{dateShort(s.date, lang)}</p>
            <p className="mt-0.5 text-xs font-medium">{t(STAGE[s.key][0])}</p>
            <p className="text-[11px] text-muted-foreground">{owner(s.owner)}{s.moved ? ` · ${t('moved')}` : ''}</p>
          </li>))}</ol>
      </Panel>
      <Panel icon={<CalendarDays size={16} />} title={`${t('The twelve months of')} ${data.year}`}>
        <Table><thead><tr><th>{t('Month')}</th>{open.stages.map((s: any) => <th key={s.key}>{t(STAGE[s.key][1])}</th>)}</tr></thead>
          <tbody>{months.map((m) => (
            <tr key={m.period} className={m.open ? 'bg-primary/5 font-semibold' : m.stages[6].state === 'DONE' ? 'text-muted-foreground' : ''}>
              <td>{month(m.period, lang).split(' ')[0]}</td>
              {m.stages.map((s: any) => <td key={s.key} className="whitespace-nowrap tabular-nums">{dateShort(s.date, lang)}{s.moved ? <> <span className="text-[10px] text-muted-foreground">{t('moved')}</span></> : null}</td>)}
            </tr>))}</tbody></Table>
        <p className="mt-2 text-xs text-muted-foreground">{t('A date marked “moved” left a weekend or a public holiday: the payment date to the working day before, the stages between the cut-off and it to the working day after. The cut-off stays on its day.')}</p>
      </Panel>
    </Screen>
  );
}

/** Net pay and employer cost by month. */
function PayrollReports({ tabs }: { tabs: ReactNode }) {
  const { t, lang } = useLang();
  const { data } = useApi<any>('/payroll/reports');
  if (!data) return null;
  const m: any[] = data.months;
  const last = m.at(-1), first = m[0];
  return (
    <Screen hero={<Hero tone="surface" eyebrow="HR Workspace" title={last && first ? `${t('Net pay moved from')} ${aedShort(first.net, lang)} ${t('to')} ${aedShort(last.net, lang)} ${t('over')} ${m.length} ${t('months')}` : t('Payroll reports')}
      lede={t('Every approved month, as written to the employee master: what people were paid, and what the company paid on top.')} />}>
      {tabs}
      <Panel icon={<Banknote size={16} />} title={t('Net pay by month')}>
        <Columns values={m.map((x) => x.net)} labels={m.map((x) => month(x.period_name, lang).split(' ')[0])} format={(v) => aedShort(v, lang)} markLast height={96} />
      </Panel>
      <Panel icon={<Landmark size={16} />} title={t('Each month')}>
        <Table><thead><tr><th>{t('Month')}</th><th className="text-end">{t('People')}</th><th className="text-end">{t('Gross')}</th><th className="text-end">{t('Net')}</th><th className="text-end">{t('Employer cost on top')}</th></tr></thead>
          <tbody>{[...m].reverse().map((x) => <tr key={x.period_name}><td>{month(x.period_name, lang)}</td><td className="text-end tabular-nums">{x.people}</td><td className="text-end tabular-nums">{aed(x.gross, lang)}</td><td className="text-end tabular-nums">{aed(x.net, lang)}</td><td className="text-end tabular-nums">{aed(x.employer, lang)}</td></tr>)}</tbody></Table>
      </Panel>
      <DepartmentSummary d={data.departments} />
    </Screen>
  );
}

function PayrollThisMonth({ tabs }: { tabs: ReactNode }) {
  const { t, lang } = useLang();
  const { openCase, has } = useApp();
  const { data } = useApi<any>('/payroll/this-month', { poll: 8000 });
  if (!data?.period) return null;
  const m = data.month, rows: any[] = data.rows;
  const expected = rows.filter((r) => r.state === 'EXPECTED');
  const done = rows.filter((r) => r.state !== 'EXPECTED');
  const monthName = new Date(`${data.period.name}-01T00:00:00Z`).toLocaleString(lang === 'ar' ? 'ar' : 'en-GB', { month: 'long', timeZone: 'UTC' });
  const left = Math.round((Date.parse(data.period.cutoff) - Date.parse(data.today)) / 864e5);
  const open = m && ['WAITING', 'ESCALATED'].includes(m.status);
  const title = open && expected.length ? `${expected.length} ${t(expected.length === 1 ? 'change waits for you before the cut-off on' : 'changes wait for you before the cut-off on')} ${date(data.period.cutoff, lang)}`
    : m?.status === 'COMPLETED' ? `${monthName}${t('’s changes were confirmed on')} ${date(m.closed_at, lang)}, ${t('before the cut-off')}` : `${monthName}${t('’s changes are all in')}`;
  return (
    <Screen hero={<Hero tone="surface" eyebrow="HR Workspace" title={title}
      lede={t('Wared lists the month\'s changes as soon as it opens. What came through approved cases is already in; what only you can send waits here, with last month\'s figure as a suggestion. After the cut-off, a change moves to next month as back pay.')}
      actions={open && has('PAYROLL') ? <Btn kind="primary" onClick={() => openCase(m.ref)}>{t('Confirm the changes')}</Btn> : undefined}
      feature={<HeroFeature label={left >= 0 ? 'Time to the cut-off' : 'Cut-off passed'} value={left > 0 ? `${left} ${t(left === 1 ? 'day' : 'days')}` : left === 0 ? t('Today') : `${-left} ${t(left === -1 ? 'day ago' : 'days ago')}`} support={m ? <div className="w-64"><ClockBar start={m.created_at} due={`${data.period.cutoff}T21:00:00Z`} /></div> : undefined} />} />}>
      {tabs}
      <Panel icon={<CalendarClock size={16} />} title={expected.length ? `${expected.length} ${t(expected.length === 1 ? 'change only you can send' : 'changes only you can send')}` : t('Nothing is waiting for you')} action={<AgentTag id="wared" />}>
        {expected.length ? <InputRows rows={expected} client /> : <Empty>{t('Every change for the month is in.')}</Empty>}
      </Panel>
      {data.late.length ? (
        <Panel icon={<RefreshCw size={16} />} title={`${data.late.length} ${t(data.late.length === 1 ? 'change arrived after the cut-off and is paid next month' : 'changes arrived after the cut-off and are paid next month')}`}>
          <InputRows rows={data.late} client />
        </Panel>
      ) : null}
      <Panel icon={<Banknote size={16} />} title={`${done.length} ${t(done.length === 1 ? 'change is in' : 'changes are in')} ${monthName}${t('’s payroll')}`}>
        <InputsBar counts={data.counts} />
        <div className="mt-3"><InputRows rows={done} client /></div>
      </Panel>
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
    <Screen hero={<Hero tone="surface" eyebrow="HR Workspace" title={`${openCases.length} ${t(openCases.length === 1 ? 'exit case is open' : 'exit cases are open')}`} lede={t('Notice, the final settlement and clearance for every leaver, and a check of every involuntary exit against the documentation and the law.')} />}>
      <Panel icon={<DoorOpen size={16} />} title="Cases">
        <Table><thead><tr><th>{t('Employee')}</th><th>{t('Type')}</th><th>{t('Status')}</th><th>{t('With')}</th><th>{t('Settlement')}</th><th>{t('Opened')}</th></tr></thead>
          <tbody>{data.cases.map((c: any) => <tr key={c.ref} className="clickable" onClick={() => openCase(c.ref)}><td className="text-sm">{bi(c.subject_name, c.subject_name_ar)}</td><td><Chip>{t(c.workflow_id === 'WF-19' ? 'Resignation' : c.workflow_id === 'WF-20' ? 'Involuntary' : 'ER case')}</Chip></td><td><StatusChip status={c.status} /></td><td className="text-sm">{c.waiting_on_name ?? '—'}</td><td className="min-w-[10rem]">{c.result?.settlement ? <div className="space-y-1"><span className="block text-sm tabular-nums">{aed(c.result.settlement.total, lang)}</span>{['WAITING', 'RUNNING', 'ESCALATED'].includes(c.status) ? <ClockBar compact start={c.result.settlement.lastDay} due={c.result.settlement.payBy} /> : null}</div> : '—'}</td><td>{date(c.created_at, lang)}</td></tr>)}</tbody></Table>
        {!data.cases.length ? <Empty>{t('No exit cases are open.')}</Empty> : null}
      </Panel>
      <PageColumns aside={<Panel icon={<FileWarning size={16} />} title="Why people left (12 months)">
        {data.reasons.map((r: any) => <div key={t(r.reason)} className="py-1.5"><div className="flex justify-between text-sm"><span>{t(r.reason)}</span><span className="font-mono text-xs">{r.n}</span></div><Bar value={r.n} max={data.reasons[0]?.n} className="mt-1" tone="accent" /></div>)}
      </Panel>}>
        <Panel icon={<CalendarClock size={16} />} title="Clearance journeys">
          {data.journeys.length ? data.journeys.map((j: any) => { const done = j.tasks.filter((x: any) => x.status === 'DONE').length; return (
            <div key={j.id} className="mb-3 rounded-xl glass-l3 p-3"><div className="flex items-center gap-2"><span className="text-sm font-medium">{j.display_name}</span><Chip className="ms-auto">{t('last day')} {date(j.target_date, lang)}</Chip></div>
              <div className="mt-2 flex flex-wrap gap-1.5">{j.tasks.map((x: any) => <span key={x.id} className={`mono-chip ${x.status === 'DONE' ? 'is-success' : ''}`}>{bi(x.title, x.title_ar)}</span>)}</div><p className="mt-1 text-[11px] text-muted-foreground">{done}/{j.tasks.length}</p></div>
          ); }) : <Empty>{t('No clearance journeys open.')}</Empty>}
        </Panel>
        <Panel icon={<DoorOpen size={16} />} title="Leavers on record">
          <Table><thead><tr><th>{t('Person')}</th><th>{t('Department')}</th><th>{t('Last day')}</th><th>{t('Action')}</th><th>{t('Reason')}</th></tr></thead>
            <tbody>{data.leavers.map((l: any) => <tr key={l.id} className="clickable" onClick={() => go('person', String(l.id))}><td className="text-sm">{l.display_name}</td><td className="text-sm">{t(l.department)}</td><td>{date(l.last_working_day, lang)}</td><td><Chip>{t(String(l.termination_action ?? '').replace(/_/g, ' ').toLowerCase().replace(/^./, (x: string) => x.toUpperCase()))}</Chip></td><td className="text-xs">{l.termination_reason}</td></tr>)}</tbody></Table>
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
    <Screen hero={<Hero tone="surface" eyebrow="HR Workspace" title={`${data.alerts.filter((a: any) => a.status === 'OPEN').length} ${t('compliance alerts are open')}; ${data.alerts.filter((a: any) => a.severity === 'URGENT').length} ${t('urgent')}`} lede={t('Every date and ratio a regulator would check: iqamas, IDs, passports, probation, contracts, Mudad and Saudization.')}
      actions={<Btn onClick={async () => { await post('/compliance/scan'); bump(); reload(); }}><RefreshCw className="h-4 w-4" />{t('Run the scan now')}</Btn>}
      />}>
      <OverviewTabs />
      {sa ? <Panel icon={<ShieldCheck size={16} />} title="Saudization (Nitaqat)" tone="accent"><p className="text-sm font-medium">{bi(sa.title, sa.title_ar)}</p><p className="mt-1 text-sm text-muted-foreground">{t(sa.detail)}</p></Panel> : null}
      <div className="flex flex-wrap gap-1.5"><button type="button" onClick={() => setKind('all')} className={`mono-chip ${kind === 'all' ? 'is-primary' : ''}`}>{t('All')} · {data.alerts.length}</button>{kinds.map((k) => <button key={k} type="button" onClick={() => setKind(k)} className={`mono-chip ${kind === k ? 'is-primary' : ''}`}>{t(K[k] ?? k)} · {data.alerts.filter((a: any) => a.kind === k).length}</button>)}</div>
      <Panel icon={<AlertTriangle size={16} />} title="Alerts" action={<AgentTag id="amin" />}>
        <Table><thead><tr><th>{t('Severity')}</th><th>{t('Alert')}</th><th>{t('Person')}</th><th>{t('Due')}</th><th>{t('Owner')}</th><th></th></tr></thead>
          <tbody>{rows.map((a: any) => <tr key={a.ref}><td><StatusChip status={a.severity} /></td><td className="min-w-[18rem] text-sm"><span className="font-medium">{bi(a.title, a.title_ar)}</span><span className="block text-xs text-muted-foreground">{t(a.detail)}</span></td><td>{a.person_id ? <button type="button" onClick={() => go('person', String(a.person_id))}><Person name={bi(a.display_name, a.display_name_ar)} size={22} /></button> : '—'}</td><td className="min-w-[8rem] whitespace-nowrap">{date(a.due_date, lang)}{a.due_date ? <><span className="block text-[11px] text-muted-foreground">{daysUntil(a.due_date)} {t('days')}</span><ClockBar compact start={new Date(new Date(`${String(a.due_date).slice(0, 10)}T00:00:00Z`).getTime() - 30 * 86400000).toISOString()} due={a.due_date} /></> : null}</td><td className="text-xs text-muted-foreground">{roleName(a.owner_role, bi)}</td><td>{a.status === 'OPEN' ? <Btn small onClick={async () => { await post(`/compliance/${a.ref}/resolve`); reload(); }}>{t('Resolve')}</Btn> : <StatusChip status={a.status} />}</td></tr>)}</tbody></Table>
      </Panel>
    </Screen>
  );
}
void ago;
