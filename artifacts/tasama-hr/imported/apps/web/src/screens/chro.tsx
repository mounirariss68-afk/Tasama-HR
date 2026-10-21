/**
 * The CHRO's Overview: the state of the workforce and the few things that
 * need the CHRO. Facts and comparisons, not a case board: the cases live in
 * the inbox and in each item of the lens.
 */
import { PageColumns, Panel, PanelAction, StatTile, StatusRow } from '@cognirise/atelier/layout';
import { AlertTriangle, Building2 } from 'lucide-react';
import { useApi } from '../lib/api';
import { useLang } from '../lib/i18n';
import { aedShort, date, month, num } from '../lib/format';
import { useApp } from '../app/state';
import { Btn, Chip, Hero, Screen, StatRow, StatusChip, Table } from '../app/ui';
import { asManager } from './team';
import { OverviewTabs } from './hr-core';

const DAY = 864e5;

export function ChroOverview() {
  const { t, bi, lang } = useLang();
  const { go, openCase } = useApp();
  const { data: org } = useApi<any>('/org');
  const { data: people } = useApi<any[]>('/workforce');
  const { data: pay } = useApi<any>('/payroll');
  const { data: hiring } = useApi<any>('/hiring');
  const { data: exits } = useApi<any>('/exits');
  const { data: perf } = useApi<any>('/performance');
  const { data: comp } = useApi<any>('/compliance');
  const { data: inbox } = useApi<any[]>('/requests?view=inbox', { poll: 8000 });
  if (!org || !people) return null;

  // Where the people are, by division.
  const byDiv = new Map<string, any>();
  for (const d of org.departments) { const x = byDiv.get(d.division) ?? { division: d.division, division_ar: d.division_ar, headcount: 0, saudi: 0, women: 0, vacancies: 0 }; x.headcount += d.headcount; x.saudi += d.saudi; x.women += d.women; x.vacancies += d.vacancies; byDiv.set(d.division, x); }
  const divisions = [...byDiv.values()].sort((a, b) => b.headcount - a.headcount);
  const total = divisions.reduce((s, d) => s + d.headcount, 0);
  const sa = org.saudization;

  // Movement over twelve months.
  const yearAgo = Date.now() - 365 * DAY;
  const hires = people.filter((p) => new Date(p.original_hire_date).getTime() >= yearAgo).length;
  const leavers = org.turnover12m ?? 0;
  const turnover = total ? Math.round((leavers / total) * 1000) / 10 : 0;
  const openReqs = (hiring?.requisitions ?? []).filter((r: any) => r.status === 'OPEN');
  const oldest = openReqs.reduce((m: number, r: any) => Math.max(m, Math.round((Date.now() - new Date(r.opened_date).getTime()) / DAY)), 0);

  // People cost.
  const closed = (pay?.periods ?? []).filter((p: any) => p.status === 'CLOSED');
  const lastRun = closed[closed.length - 1], prevRun = closed[closed.length - 2];
  const pc = pay?.precheck;
  const blockers = pc ? pc.findings.filter((f: any) => f.severity === 'BLOCKER').length : 0;

  // Talent and risk.
  const critical = (perf?.succession ?? []).filter((s: any) => s.impact_of_loss === 'HIGH');
  const covered = critical.filter((s: any) => (s.bench ?? []).some((b: any) => b.readiness === 'READY_NOW'));
  const uncovered = critical.filter((s: any) => !covered.includes(s));
  const urgent = (comp?.alerts ?? []).filter((a: any) => a.status === 'OPEN' && a.severity === 'URGENT');
  const exitsOpen = (exits?.cases ?? []).filter((c: any) => ['WAITING', 'RUNNING', 'ESCALATED'].includes(c.status));
  const mine = (inbox ?? []).filter((r) => !asManager(r)).length;

  const lede = [
    sa ? `${t('Saudization')} ${Math.round(Number(sa.ratio))}% ${t('against a target of')} ${sa.target}% (${sa.band}).` : '',
    pc ? (pc.blocked ? `${month(pc.period.period_name, lang).split(' ')[0]} ${t('payroll is held by')} ${blockers} ${t(blockers === 1 ? 'blocker' : 'blockers')}.` : `${month(pc.period.period_name, lang)} ${t('payroll is clear to release')}.`) : '',
  ].filter(Boolean).join(' ');

  return (
    <Screen hero={<Hero tone="surface" eyebrow="HR Workspace" title={`${num(total)} ${t('people')}; ${uncovered.length ? `${uncovered.length} ${t(uncovered.length === 1 ? 'critical role has no ready successor' : 'critical roles have no ready successor')}` : t('every critical role has a ready successor')}`} lede={lede}
      actions={mine ? <Btn kind="primary" onClick={() => go('hr-inbox')}>{`${mine} ${t(mine === 1 ? 'decision waits on you' : 'decisions wait on you')}`}</Btn> : undefined} />}>
      <OverviewTabs />
      <StatRow>
        <StatTile label="Hired in 12 months" value={num(hires)} />
        <StatTile label="Left in 12 months" value={num(leavers)} trend={{ direction: 'flat', label: `${turnover}% ${t('turnover')}` }} />
        <StatTile label="Open positions" value={num(openReqs.length)} trend={{ direction: 'flat', label: openReqs.length ? `${t('oldest open')} ${oldest} ${t('days')}` : t('none open') }} />
        <StatTile label="Payroll last month" value={lastRun ? aedShort(lastRun.gross, lang) : '—'} trend={lastRun && prevRun ? { direction: lastRun.gross >= prevRun.gross ? 'up' : 'down', label: `${lastRun.gross >= prevRun.gross ? '+' : ''}${Math.round(((lastRun.gross - prevRun.gross) / prevRun.gross) * 1000) / 10}% ${t('on the month before')}` } : undefined} />
      </StatRow>
      <PageColumns aside={
        <Panel icon={<AlertTriangle size={16} />} title={`${uncovered.length + urgent.length + exitsOpen.length} ${t('things to watch')}`}>
          <div className="space-y-4">
            <section>
              <div className="mb-1 flex items-center justify-between"><h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{`${covered.length} ${t('of')} ${critical.length} ${t('critical roles have a ready successor')}`}</h3><button type="button" onClick={() => go('hr-performance')} className="text-xs text-primary hover:underline">{t('Succession')}</button></div>
              {uncovered.length ? uncovered.slice(0, 4).map((s: any) => <StatusRow key={s.id} name={s.position} detail={s.incumbent} status={<StatusChip status={s.risk_of_loss} />} />) : <p className="text-sm text-muted-foreground">{t('Every critical role has someone ready now.')}</p>}
            </section>
            <section>
              <div className="mb-1 flex items-center justify-between"><h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{`${urgent.length} ${t(urgent.length === 1 ? 'urgent compliance alert' : 'urgent compliance alerts')}`}</h3><button type="button" onClick={() => go('hr-compliance')} className="text-xs text-primary hover:underline">{t('Compliance')}</button></div>
              {urgent.length ? urgent.slice(0, 4).map((a: any) => <StatusRow key={a.id} name={bi(a.title, a.title_ar)} detail={`${bi(a.display_name, a.display_name_ar)} · ${date(a.due_date, lang)}`} status={<Chip tone="danger">{t('urgent')}</Chip>} />) : <p className="text-sm text-muted-foreground">{t('Nothing urgent.')}</p>}
            </section>
            <section>
              <div className="mb-1 flex items-center justify-between"><h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{`${exitsOpen.length} ${t(exitsOpen.length === 1 ? 'exit in progress' : 'exits in progress')}`}</h3><button type="button" onClick={() => go('hr-exits')} className="text-xs text-primary hover:underline">{t('Exits')}</button></div>
              {exitsOpen.length ? exitsOpen.slice(0, 3).map((c: any) => <button key={c.ref} type="button" onClick={() => openCase(c.ref)} className="flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-start hover:bg-primary/5"><span className="min-w-0 flex-1 truncate text-sm">{bi(c.title, c.title_ar)}</span><StatusChip status={c.status} /></button>) : <p className="text-sm text-muted-foreground">{t('No exits in progress.')}</p>}
            </section>
          </div>
        </Panel>}>
        <Panel icon={<Building2 size={16} />} title={`${t('The largest division is')} ${bi(divisions[0]?.division, divisions[0]?.division_ar)}, ${t('with')} ${divisions[0]?.headcount} ${t('people')}`} action={<PanelAction onClick={() => go('hr-workforce')}>{t('Workforce')}</PanelAction>}>
          <Table><thead><tr><th>{t('Division')}</th><th className="w-[40%]">{t('Headcount')}</th><th className="text-end">{t('Saudi')}</th><th className="text-end">{t('Women')}</th><th className="text-end">{t('Vacant')}</th></tr></thead>
            <tbody>{divisions.map((d) => (
              <tr key={d.division}>
                <td className="text-sm">{bi(d.division, d.division_ar)}</td>
                <td><div className="flex items-center gap-2"><div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width] duration-700" style={{ width: `${(d.headcount / Math.max(1, divisions[0].headcount)) * 100}%` }} /></div><span className="w-8 text-end font-mono text-xs tabular-nums">{d.headcount}</span></div></td>
                <td className="text-end text-sm tabular-nums">{d.headcount ? Math.round((d.saudi / d.headcount) * 100) : 0}%</td>
                <td className="text-end text-sm tabular-nums">{d.headcount ? Math.round((d.women / d.headcount) * 100) : 0}%</td>
                <td className="text-end text-sm tabular-nums">{d.vacancies || '—'}</td>
              </tr>
            ))}</tbody></Table>
        </Panel>
      </PageColumns>
    </Screen>
  );
}
