/**
 * The Payroll lens: Tasama's payroll team across every client
 * (design/payroll-addendum.md §3). Months is the lead's landing, Inbox the
 * specialist's; Client policies is shared with Tasama Services.
 */
import { useEffect, useMemo, useState } from 'react';
import { HeroFeature, Panel, PanelAction, StatTile } from '@cognirise/atelier/layout';
import { InboxLayout, InboxList, InboxReader } from '@cognirise/atelier/archetypes';
import { BookOpen, CalendarRange, FileText, Inbox as InboxIcon, Scale } from 'lucide-react';
import { bump, getClient, post, setClientKey, useApi } from '../lib/api';
import { useLang } from '../lib/i18n';
import { date, num } from '../lib/format';
import { useApp } from '../app/state';
import { Btn, Chip, Empty, Hero, Screen, StatRow, TabStrip, Table } from '../app/ui';
import { CaseRow, CaseView } from '../app/case';
import { InputRows, InputsBar, cutoffWords } from '../app/inputs';
import { ChangeWaterfall, ClockBar, Progress } from '../app/viz';

const DAY = 86_400_000;
const d0 = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00Z`).getTime();
const STAGE: Record<string, [string, string, 'primary' | 'warn' | 'success']> = {
  INPUTS: ['Inputs open', 'المدخلات مفتوحة', 'primary'], RUN: ['Run and approval', 'التشغيل والاعتماد', 'warn'], PAID: ['Paid', 'مدفوع', 'success'], NONE: ['No open month', 'لا يوجد شهر مفتوح', 'primary'],
};
const FLAG: Record<string, [string, string, 'danger' | 'warn' | undefined]> = {
  BELOW_LAW: ['Below the law', 'أقل من النظام', 'danger'], UNCLEAR: ['Unclear', 'غير واضح', 'warn'], MISSING: ['Not in the handbook', 'غير مذكور في الدليل', undefined],
};

/* ------------------------------------------------------------------ Months */

/** One row per client across the month: inputs until the cut-off, then the run and approval, then pay day; today marked. */
function MonthStrip({ rows, today }: { rows: any[]; today: string }) {
  const { t, bi, lang } = useLang();
  const start = Math.min(...rows.map((r) => d0(r.start))), end = Math.max(...rows.map((r) => d0(r.pay) + DAY), ...rows.map((r) => d0(r.end) + DAY));
  const x = (s: string | number) => `${((typeof s === 'number' ? s : d0(s)) - start) / (end - start) * 100}%`;
  const w = (a: string, b: string) => `${(d0(b) - d0(a)) / (end - start) * 100}%`;
  const days = Math.round((end - start) / DAY);
  return (
    <div className="space-y-1">
      <div className="relative ms-[9.5rem] h-5 text-[10px] text-muted-foreground">
        {Array.from({ length: days }, (_, i) => i).filter((i) => i % 5 === 0).map((i) => <span key={i} className="absolute -translate-x-1/2" style={{ left: x(start + i * DAY) }}>{date(new Date(start + i * DAY).toISOString(), lang).split(' ').slice(0, 2).join(' ')}</span>)}
      </div>
      <div className="relative space-y-1">
        <div className="pointer-events-none absolute inset-y-0 end-0 start-[9.5rem] z-10"><div className="absolute inset-y-0 w-0.5 bg-danger" style={{ left: x(today) }} /></div>
      {rows.map((r) => (
        <div key={r.key} className="flex items-center gap-3">
          <div className="w-[8.75rem] shrink-0">
            <p className="truncate text-sm font-semibold">{bi(r.short, r.name_ar)}</p>
            <p className="text-[11px] text-muted-foreground">{bi(...STAGE[r.stage].slice(0, 2) as [string, string])}</p>
          </div>
          <div className="relative h-9 flex-1 rounded-lg bg-muted/40">
            <div className="absolute inset-y-1.5 rounded-s-md bg-primary/25" style={{ left: x(r.start), width: w(r.start, r.cutoff) }} title={t('Inputs open')} />
            <div className="absolute inset-y-1.5 bg-warn/30" style={{ left: x(r.cutoff), width: w(r.cutoff, r.approval) }} title={t('Run and checks')} />
            <div className="absolute inset-y-1.5 rounded-e-md bg-success/30" style={{ left: x(r.approval), width: w(r.approval, r.pay) }} title={t('Client approval and payment')} />
            {[['cutoff', t('Cut-off')], ['approval', t('Approval')], ['pay', t('Pay day')]].map(([k, l]) => (
              <span key={k} className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border-2 border-background bg-foreground/70" style={{ left: x(r[k]) }} title={`${l} ${date(r[k], lang)}`} />
            ))}
          </div>
        </div>
      ))}
      </div>
      <div className="ms-[9.5rem] flex flex-wrap gap-4 pt-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-primary/25" />{t('Inputs open')}</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-warn/30" />{t('Run and checks')}</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-success/30" />{t('Client approval and payment')}</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-0.5 bg-danger" />{t('Today')}</span>
      </div>
    </div>
  );
}

export function PayrollMonths() {
  const { t, bi, lang } = useLang();
  const { go } = useApp();
  const { data } = useApi<any>('/payroll/months', { poll: 15000 });
  if (!data) return null;
  const rows: any[] = data.clients;
  const passed = rows.filter((r) => r.stage !== 'INPUTS').length;
  const next = rows.filter((r) => r.stage === 'INPUTS').sort((a, b) => d0(a.cutoff) - d0(b.cutoff))[0];
  const waiting = rows.reduce((s, r) => s + r.waiting, 0);
  return (
    <Screen hero={<Hero tone="surface" landing eyebrow="Payroll"
      title={`${passed} ${t('of')} ${rows.length} ${t('clients are past their cut-off this month')}${next ? `; ${bi(next.short, next.name_ar)} ${t('closes')} ${date(next.cutoff, lang)}` : ''}`}
      lede={t('Every client\'s month on one calendar: when its inputs close, when the run is checked and approved, and when its people are paid.')}
      feature={<HeroFeature label="Waiting on the payroll team" value={num(waiting)} support={<Btn small onClick={() => go('payroll-inbox')}>{t('Open the inbox')}</Btn>} />} />}>
      <Panel icon={<CalendarRange size={16} />} title="This month, client by client">
        <MonthStrip rows={rows} today={data.today} />
      </Panel>
      <Panel icon={<FileText size={16} />} title="The clients">
        <Table><thead><tr><th>{t('Client')}</th><th>{t('Employee master')}</th><th className="text-end">{t('Employees')}</th><th>{t('Cut-off')}</th><th>{t('Pay day')}</th><th>{t('Policy')}</th><th>{t('Stage')}</th><th></th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.key}>
              <td className="font-medium">{bi(r.short, r.name_ar)}</td>
              <td>{r.hrms === 'PLATFORM' ? t('Tasama HR') : r.hrms === 'ODOO' ? 'Odoo' : 'Oracle HCM'}</td>
              <td className="tabular-nums text-end">{num(r.employees)}</td>
              <td>{date(r.cutoff, lang)}</td><td>{date(r.pay, lang)}</td>
              <td>{r.policy ? `v${r.policy.version}` : '—'}</td>
              <td><Chip tone={STAGE[r.stage][2]}>{bi(STAGE[r.stage][0], STAGE[r.stage][1])}</Chip></td>
              <td><Btn small onClick={() => go('payroll-policies', r.key)}>{t('Policy')}</Btn></td>
            </tr>))}</tbody></Table>
      </Panel>
    </Screen>
  );
}

/* ------------------------------------------------------------------ Inbox */

export function PayrollInbox() {
  const { t, bi } = useLang();
  const { persona } = useApp();
  const { data } = useApi<any>('/payroll/inbox', { poll: 6000 });
  const rows: any[] = data?.rows ?? [];
  const [sel, setSel] = useState<{ ref: string; client: string } | null>(null);
  useEffect(() => { if (!rows.find((r) => r.ref === sel?.ref)) { const r = rows[0]; setSel(r ? { ref: r.ref, client: r.client } : null); } }, [rows, sel?.ref]);
  // The reader reads a case in its own client's account.
  const pick = (r: any) => setSel({ ref: r.ref, client: r.client });
  useEffect(() => { if (sel && getClient() !== sel.client) setClientKey(sel.client); }, [sel?.client]);
  return (
    <Screen hero={<Hero tone="surface" eyebrow="Payroll" title={rows.length ? `${rows.length} ${t(rows.length === 1 ? 'decision waits on you' : 'decisions wait on you')}` : t('Nothing waits on you')}
      lede={`${t('Every client\'s cases that wait on')} ${bi(persona?.display_name, persona?.display_name_ar)}, ${t('oldest first.')}`} />}>
      <InboxLayout
        list={<InboxList label={t('Oldest first')} emptyState={<Empty>{t('Nothing waits on you.')}</Empty>}>
          {rows.map((r) => <CaseRow key={`${r.client}:${r.ref}`} r={{ ...r, subject_name: bi(r.client_short, r.client_ar), subject_name_ar: r.client_ar }} selected={sel?.ref === r.ref} onSelect={() => pick(r)} unread />)}
        </InboxList>}
        reader={sel && getClient() === sel.client ? <CaseView caseRef={sel.ref} /> : <InboxReader empty={t('Choose a case.')} />}
      />
    </Screen>
  );
}

/* ------------------------------------------------------------------ Client policies */

/** The 27 dimensions as tiles: the value that matters, and a mark where the law refuses a rule or the words are unclear. */
function RuleTiles({ dims, rules, changed, selected, onSelect }: { dims: any[]; rules: any[]; changed: string[]; selected: number | null; onSelect: (n: number) => void }) {
  const { bi, t } = useLang();
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(12.5rem,1fr))] gap-2">
      {dims.map((d) => {
        const rs = rules.filter((r) => r.dim === d.n);
        const flag = rs.find((r) => r.flag === 'BELOW_LAW') ?? rs.find((r) => r.flag === 'UNCLEAR') ?? rs.find((r) => r.flag === 'MISSING');
        const tone = flag?.flag === 'BELOW_LAW' ? 'border-danger/60 bg-danger/5' : flag?.flag === 'UNCLEAR' ? 'border-warn/70 bg-warn/5' : flag?.flag === 'MISSING' ? 'border-dashed border-border' : 'border-border/60';
        const isNew = rs.some((r) => changed.includes(r.key));
        return (
          <button key={d.n} type="button" onClick={() => onSelect(d.n)}
            className={`rounded-xl border p-3 text-start transition-all hover:-translate-y-0.5 hover:shadow-sm active:scale-[0.99] ${tone} ${selected === d.n ? 'ring-2 ring-primary' : ''}`}>
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><span className="tabular-nums">{d.n}</span><span className="truncate">{bi(d.name, d.name_ar)}</span>{isNew ? <span className="ms-auto rounded bg-primary/15 px-1 text-[10px] font-semibold text-primary">{t('changed')}</span> : null}</p>
            <p className="mt-1.5 line-clamp-2 text-sm font-semibold leading-snug">{rs[0] ? <>{rs.length > 1 ? <span className="font-normal text-muted-foreground">{bi(rs[0].label, rs[0].label_ar)}: </span> : null}{bi(rs[0].value, rs[0].value_ar ?? rs[0].value)}</> : '—'}</p>
            {flag ? <p className={`mt-1.5 text-[11px] font-medium ${flag.flag === 'BELOW_LAW' ? 'text-danger' : flag.flag === 'UNCLEAR' ? 'text-warn' : 'text-muted-foreground'}`}>{bi(...(FLAG[flag.flag].slice(0, 2) as [string, string]))}{flag.resolution ? ` · ${t('decided')}` : ''}</p> : <p className="mt-1.5 text-[11px] text-muted-foreground">{rs.length > 1 ? `${rs.length} ${t('rules')}` : rs[0]?.basis === 'LAW' ? t('The law applies') : rs[0]?.clause ?? ''}</p>}
          </button>
        );
      })}
    </div>
  );
}

function Dimension({ d, rules }: { d: any; rules: any[] }) {
  const { bi, t } = useLang();
  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-4">
      <p className="text-sm font-semibold">{d.n} · {bi(d.name, d.name_ar)}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{t('The law')}: {t(d.floor)} · {t('Drives')}: {t(d.drives).toLowerCase()}</p>
      <div className="mt-3 space-y-3">
        {rules.map((r) => (
          <div key={r.key} className="border-t border-border/50 pt-3 first:border-0 first:pt-0">
            <div className="flex flex-wrap items-baseline gap-2"><span className="text-sm text-muted-foreground">{bi(r.label, r.label_ar)}</span><span className="text-sm font-semibold">{bi(r.value, r.value_ar ?? r.value)}</span>{r.flag ? <Chip tone={FLAG[r.flag][2]}>{bi(FLAG[r.flag][0], FLAG[r.flag][1])}</Chip> : null}</div>
            {r.flag_note ? <p className="mt-1 text-sm">{r.flag_note}</p> : null}
            {r.resolution ? <p className="mt-1 text-sm text-success">{t('Decided')}: {r.resolution}</p> : null}
            {r.quote ? <details className="mt-1.5 text-xs text-muted-foreground"><summary className="cursor-pointer">{t('Where it comes from')}: {r.clause}</summary><p className="mt-1 italic">“{r.quote}”</p></details> : r.clause ? <p className="mt-1 text-xs text-muted-foreground">{r.clause}</p> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ClientPolicies() {
  const { t, bi, lang } = useLang();
  const { persona, route, openCase, session } = useApp();
  const { data: all } = useApi<any>('/payroll/policies', { poll: 8000 });
  const [key, setKey] = useState<string | null>(route.param);
  // The client in view: the one named in the address, else the account the app is in (the Director sets it).
  useEffect(() => { setKey(route.param ?? session?.client.key ?? null); }, [route.param, session?.client.key]);
  const { data } = useApi<any>(key ? `/payroll/policies/${key}` : null, { poll: 8000 });
  const [tab, setTab] = useState('rules');
  const [dim, setDim] = useState<number | null>(null);
  const [cmpDim, setCmpDim] = useState(3);
  const { data: cmp } = useApi<any>(tab === 'compare' ? `/payroll/policies-compare?dim=${cmpDim}` : null);
  const [busy, setBusy] = useState(false);
  const clients: any[] = all?.clients ?? [];
  const drafts = clients.filter((c) => c.draft);
  const flagsOpen = clients.reduce((s, c) => s + c.flags.filter((f: any) => !f.resolution).length, 0);
  const eyebrow = route.screen === 'tasama-policies' ? 'Tasama Services' : 'Payroll';
  const v = data?.version;
  const rulesBy = useMemo(() => (data?.rules ?? []) as any[], [data]);
  const upload = async () => { if (!key) return; setBusy(true); try { await post(`/payroll/policies/${key}/handbook`, {}); bump(); } finally { setBusy(false); } };
  return (
    <Screen hero={<Hero tone="surface" eyebrow={eyebrow}
      title={drafts.length ? `${drafts.length} ${t(drafts.length === 1 ? 'client\'s new policy waits for a decision' : 'clients\' new policies wait for a decision')}` : `${t('All')} ${clients.length} ${t('clients run on an approved policy')}`}
      lede={t('Each client\'s handbook, read into the rules payroll runs on: 27 dimensions, each rule with the clause it came from. A rule the law refuses never reaches a payslip.')}
      feature={<HeroFeature label="Rules waiting for a client's decision" value={num(flagsOpen + drafts.length)} />} />}>
      <div className="flex flex-wrap gap-2">
        {clients.map((c) => (
          <button key={c.key} type="button" onClick={() => { setKey(c.key); setDim(null); }}
            className={`min-w-[9.5rem] rounded-xl border px-3 py-2 text-start transition-colors ${key === c.key ? 'border-primary bg-primary/5' : 'border-border/60 hover:border-primary/40'}`}>
            <p className="text-sm font-semibold">{bi(c.short, c.name_ar)}</p>
            <p className="text-[11px] text-muted-foreground">{c.version ? `v${c.version} · ${c.rules} ${t('rules')}` : t('No policy yet')}{c.draft ? ` · ${t('new version waiting')}` : ''}</p>
          </button>
        ))}
      </div>
      {data && v ? (
        <Panel icon={<Scale size={16} />} title={`${bi(data.client.short, data.client.name_ar)}: ${t('version')} ${v.version} ${v.status === 'DRAFT' ? t('waits for a decision') : t('is active')}`}
          action={<PanelAction>{v.status === 'DRAFT' && v.ref ? <Btn small kind="primary" onClick={() => openCase(v.ref, key!)}>{t('Open the decision')}</Btn> : persona?.roles.includes('TASAMA_PAYROLL') ? <Btn small onClick={upload} disabled={busy}>{t('Read a revised handbook')}</Btn> : null}</PanelAction>}>
          <p className="mb-3 text-sm text-muted-foreground">{v.status === 'ACTIVE' ? `${t('Activated by')} ${v.activated_by} ${t('on')} ${date(v.activated_at ?? v.effective_from, lang)} · ${t('read by')} ${v.read_by}` : `${t('Read by')} ${v.read_by} ${t('from')} ${v.source}`}</p>
          <TabStrip items={[{ id: 'rules', label: 'Rules' }, { id: 'versions', label: 'Versions' }, { id: 'handbook', label: 'Handbook' }, { id: 'compare', label: 'Compare clients' }]} value={tab} onChange={setTab} />
          <div className="mt-4">
            {tab === 'rules' ? (
              <div className="space-y-4">
                <RuleTiles dims={data.dimensions} rules={rulesBy} changed={data.changed ?? []} selected={dim} onSelect={(n) => setDim(dim === n ? null : n)} />
                {dim ? <Dimension d={data.dimensions.find((x: any) => x.n === dim)} rules={rulesBy.filter((r) => r.dim === dim)} /> : <p className="text-xs text-muted-foreground">{t('Choose a dimension to see its rules, the clause behind each and the law\'s floor.')}</p>}
              </div>
            ) : tab === 'versions' ? (
              <Table><thead><tr><th>{t('Version')}</th><th>{t('Status')}</th><th>{t('From')}</th><th>{t('Activated by')}</th><th>{t('Read by')}</th><th></th></tr></thead>
                <tbody>{data.versions.map((x: any) => (
                  <tr key={x.id}><td className="font-medium">v{x.version}</td><td><Chip tone={x.status === 'ACTIVE' ? 'success' : x.status === 'DRAFT' ? 'warn' : undefined}>{t(x.status === 'ACTIVE' ? 'Active' : x.status === 'DRAFT' ? 'Waiting' : 'Superseded')}</Chip></td>
                    <td>{date(x.effective_from, lang)}</td><td>{x.activated_by ?? '—'}</td><td>{x.read_by}</td>
                    <td>{x.ref ? <Btn small onClick={() => openCase(x.ref, key!)}>{t('Open')}</Btn> : null}</td></tr>))}</tbody></Table>
            ) : tab === 'handbook' ? (
              <div className="space-y-2">{data.clauses.map((c: any) => (
                <div key={c.id} className="rounded-lg border border-border/60 p-3">
                  <p className="text-xs font-semibold">{c.id} · {bi(c.heading, c.heading_ar)}</p>
                  <p className="mt-1 text-sm">{lang === 'ar' ? c.text_ar : c.text_en}</p>
                </div>))}</div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-1.5">{data.dimensions.map((d: any) => <button key={d.n} type="button" onClick={() => setCmpDim(d.n)} className={`mono-chip ${cmpDim === d.n ? 'is-primary' : ''}`}>{d.n} {bi(d.name, d.name_ar)}</button>)}</div>
                {cmp ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">{cmp.rows.map((r: any) => (
                  <div key={r.key} className="rounded-xl glass-l3 p-3">
                    <p className="text-sm font-semibold">{bi(r.short, r.name_ar)}</p>
                    {r.rules.map((x: any) => <div key={x.key} className="mt-2"><p className="text-[11px] text-muted-foreground">{bi(x.label, x.label_ar)}</p><p className="text-sm font-medium">{bi(x.value, x.value_ar ?? x.value)}</p>{x.flag ? <Chip tone={FLAG[x.flag][2]}>{bi(FLAG[x.flag][0], FLAG[x.flag][1])}</Chip> : null}</div>)}
                  </div>))}</div> : null}
              </div>
            )}
          </div>
        </Panel>
      ) : <Empty icon={<BookOpen size={18} />}>{t('Choose a client.')}</Empty>}
    </Screen>
  );
}

/* ------------------------------------------------------------------ Runs */

const sarK = (n: number) => (Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : Math.abs(n) >= 1e4 ? `${Math.round(n / 1e3)}K` : num(n));

/** The largest changes from last month's net pay, person by person: up to the right, down to the left. */
function ChangeBars({ rows }: { rows: any[] }) {
  const { t } = useLang();
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.change)));
  return (
    <div className="space-y-1.5">
      {rows.map((r) => {
        const w = `${Math.abs(r.change) / max * 50}%`;
        return (
          <div key={r.person_id} className="grid grid-cols-[11rem_1fr_6.5rem] items-center gap-3 text-sm" title={`${r.name}: ${num(r.prev_net, 2)} → ${num(r.net, 2)}`}>
            <span className="truncate">{r.name}</span>
            <div className="relative h-3">
              <div className="absolute inset-y-0 start-1/2 w-px bg-border" />
              <div className={`absolute inset-y-0 rounded-sm ${r.change >= 0 ? 'start-1/2 bg-primary' : 'end-1/2 bg-warn'}`} style={{ width: w }} />
            </div>
            <span className="text-end font-mono text-xs tabular-nums">{r.change >= 0 ? '+' : '−'}{num(Math.abs(r.change), 2)}</span>
          </div>
        );
      })}
      <div className="grid grid-cols-[11rem_1fr_6.5rem] gap-3 text-[11px] text-muted-foreground"><span /><div className="flex justify-between"><span>{t('Paid less than last month')}</span><span>{t('Paid more')}</span></div><span /></div>
    </div>
  );
}

/** End-of-service and leave balances at each month's end, with this month's draft. */
function ProvisionTrend({ points }: { points: { label: string; eos: number; leave: number; draft?: boolean }[] }) {
  const { t } = useLang();
  const W = 720, H = 200, L = 56, R = 16, T = 12, B = 28;
  const max = Math.max(...points.map((p) => p.eos), 1) * 1.08;
  const x = (i: number) => L + (points.length === 1 ? 0 : i / (points.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const path = (k: 'eos' | 'leave') => points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p[k])}`).join(' ');
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const series: [('eos' | 'leave'), string, string][] = [['eos', 'End of service', 'var(--color-chart-1)'], ['leave', 'Leave', 'var(--color-chart-2)']];
  return (
    <div>
      <div className="mb-2 flex gap-4 text-xs">{series.map(([k, l, c]) => <span key={k} className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: c }} />{t(l)}</span>)}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={t('End-of-service and leave balances by month')}>
        {ticks.map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--color-border)" strokeWidth="1" /><text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize="10" fill="var(--color-muted-foreground)">{sarK(v)}</text></g>)}
        {points.map((p, i) => <text key={p.label} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--color-muted-foreground)">{p.label}</text>)}
        {series.map(([k, , c]) => <path key={k} d={path(k)} fill="none" stroke={c} strokeWidth="2" />)}
        {series.map(([k, l, c]) => points.map((p, i) => <circle key={`${k}${i}`} cx={x(i)} cy={y(p[k])} r={p.draft ? 5 : 4} fill={p.draft ? 'var(--color-card)' : c} stroke={c} strokeWidth="2"><title>{`${t(l)} · ${p.label}${p.draft ? ` (${t('draft')})` : ''}: SAR ${num(p[k])}`}</title></circle>))}
      </svg>
    </div>
  );
}

function PersonLines({ r }: { r: any }) {
  const { t } = useLang();
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-xs text-muted-foreground">{t('How this was calculated')}</summary>
      <table className="mt-2 w-full text-xs"><tbody>
        {r.lines.map((l: any, i: number) => <tr key={i} className="border-t border-border/40"><td className="py-1 pe-3">{t(l.label)}</td><td className="py-1 pe-3 text-end font-mono tabular-nums">{l.kind === 'DEDUCTION' ? '−' : ''}{num(l.amount, 2)}</td><td className="py-1 text-muted-foreground">{l.rule}{l.kind === 'EMPLOYER' ? ` · ${t('paid by the company, not on the payslip')}` : ''}</td></tr>)}
        <tr className="border-t border-border/40"><td className="py-1 pe-3">{t('End of service, accrued')}</td><td className="py-1 pe-3 text-end font-mono tabular-nums">{num(r.eos.accrued, 2)}</td><td className="py-1 text-muted-foreground">{r.eos.rule}</td></tr>
        <tr className="border-t border-border/40"><td className="py-1 pe-3">{t('Leave, accrued')}</td><td className="py-1 pe-3 text-end font-mono tabular-nums">{num(r.leave.accrued, 2)}</td><td className="py-1 text-muted-foreground">{r.leave.rule}</td></tr>
      </tbody></table>
    </details>
  );
}

/**
 * One check on the draft run: what was found, what it means, who settles it, and the one
 * action that settles it (design/payroll-addendum.md §16). A client's check waits on a named
 * person; Tasama follows it and can send a reminder from the question itself.
 */
function CheckCard({ c, client, reload }: { c: any; client: string; reload: () => void }) {
  const { t, bi } = useLang();
  const { openCase } = useApp();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const act = async (id: string) => {
    setBusy(true); setErr(null);
    try { await post(`/payroll/runs/${client}/checks/${c.person_id}/${id}`); bump(); reload(); }
    catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  };
  const owner = c.owner.side === 'TASAMA' ? t('Tasama payroll: you') : `${c.owner.name}, ${bi(c.owner.role, c.owner.role_ar)}`;
  return (
    <div className="rounded-xl glass-l3 p-4">
      <div className="flex flex-wrap items-start gap-3">
        <Chip tone={c.severity === 'BLOCK' ? 'danger' : 'warn'}>{t(c.severity === 'BLOCK' ? 'Stops the run' : 'Needs the client')}</Chip>
        <p className="min-w-0 flex-1 text-sm font-semibold">{c.title}</p>
      </div>
      <dl className="mt-3 grid gap-3 text-sm md:grid-cols-[1fr_1fr_14rem]">
        <div><dt className="text-xs text-muted-foreground">{t('What we found')}</dt><dd className="mt-0.5">{c.found}</dd></div>
        <div><dt className="text-xs text-muted-foreground">{t('What it means')}</dt><dd className="mt-0.5">{c.look}</dd></div>
        <div><dt className="text-xs text-muted-foreground">{t('Who settles it')}</dt><dd className="mt-0.5 font-medium">{owner}</dd>
          {c.owner.side === 'CLIENT' ? <dd className="text-xs text-muted-foreground">{t('Only the employer can do this')}</dd> : <dd className="text-xs text-muted-foreground">{t('The law sets the answer; HR operations is told')}</dd>}</div>
      </dl>
      {c.status ? <p className="mt-3 text-sm text-muted-foreground">{c.status}</p> : null}
      {err ? <p className="mt-2 text-sm text-danger">{err}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {c.actions.map((a: any) => <Btn key={a.id} small kind="primary" disabled={busy} onClick={() => act(a.id)}>{busy ? t('Working…') : a.label}</Btn>)}
        {c.case_ref && c.status ? <Btn small onClick={() => openCase(c.case_ref)}>{c.actions.length ? t('Open the last answer') : t('Open the question and send a reminder')}</Btn> : null}
      </div>
    </div>
  );
}

export function PayrollRuns() {
  const { t, bi, lang } = useLang();
  const { route, session, go, openCase } = useApp();
  const { data: all } = useApi<any>('/payroll/runs', { poll: 20000 });
  const platform = (all?.clients ?? []).filter((c: any) => c.draft);
  const [key, setKey] = useState<string | null>(route.param);
  useEffect(() => { setKey(route.param ?? session?.client.key ?? null); }, [route.param, session?.client.key]);
  const current = key ?? platform[0]?.key ?? null;
  const { data, reload } = useApi<any>(current ? `/payroll/runs/${current}` : null, { poll: 20000 });
  const [tab, setTab] = useState('draft');
  const [showAll, setShowAll] = useState(false);
  const d = data?.draft;
  const rows: any[] = d?.rows ?? [];
  const review = data?.review ?? { checks: [], settled: [], fixed: [] };
  const checks: any[] = review.checks;
  const blocks = checks.filter((c) => c.severity === 'BLOCK');
  const checkOf = (id: number) => checks.filter((c) => c.person_id === id);
  const settledOf = (id: number) => review.settled.find((x: any) => x.person_id === id);
  const changed = rows.filter((r) => r.change != null && Math.abs(r.change) >= 1).sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  const joiners = rows.filter((r) => r.prev_net == null);
  const prevNet = rows.reduce((s, r) => s + (r.prev_net ?? 0), 0);
  const monthWord = d ? new Date(`${d.period.start}T00:00:00Z`).toLocaleString(lang === 'ar' ? 'ar' : 'en-GB', { month: 'long', timeZone: 'UTC' }) : '';
  const name = data ? bi(data.client.short, data.client.name_ar) : '';
  const listed = showAll ? rows : rows.filter((r) => checkOf(r.person_id).length || (r.change != null && Math.abs(r.change) >= 1) || r.prev_net == null);
  const hist: any[] = data?.history ?? [];
  const mon = (pn: string) => new Date(`${pn}-01T00:00:00Z`).toLocaleString(lang === 'ar' ? 'ar' : 'en-GB', { month: 'short', timeZone: 'UTC' });
  const run = data?.run;
  const dx = data?.differences;
  // One baseline everywhere: Mutabaqa's last month, which counts last month's leavers too.
  const base = dx ? { last: dx.lastNet, change: dx.thisNet - dx.lastNet, people: dx.people.length } : { last: prevNet, change: (d?.totals.net ?? 0) - prevNet, people: changed.length + joiners.length };
  const [busyRun, setBusyRun] = useState(false);
  const [runErr, setRunErr] = useState<string | null>(null);
  const cutPassed = d ? d.period.cutoff < new Date().toISOString().slice(0, 10) : false;
  const startRun = async () => { setBusyRun(true); try { const r: any = await post(`/payroll/runs/${current}/start`); bump(); reload(); openCase(r.ref, current!); } catch (e: any) { setRunErr(e.message); } finally { setBusyRun(false); } };
  const STATE: Record<string, [string, 'success' | 'warn' | 'primary' | 'danger' | undefined]> = { DRAFT: ['Being prepared', 'warn'], PREPARED: ['Waiting for validation', 'primary'], VALIDATED: ['With the client for approval', 'primary'], APPROVED: ['Approved and written', 'success'], RETURNED: ['Returned by the client', 'danger'] };
  const points = [...hist.filter((h) => !d || h.period_name !== d.period.name).map((h) => ({ label: mon(h.period_name), eos: h.eos, leave: h.leave })), ...(d ? [{ label: mon(d.period.name), eos: rows.reduce((s, r) => s + r.eos.accrued, 0), leave: rows.reduce((s, r) => s + r.leave.accrued, 0), draft: true }] : [])];
  return (
    <Screen hero={<Hero tone="surface" eyebrow="Payroll"
      title={d ? `${name}'s ${monthWord} ${t('run pays')} SAR ${sarK(d.totals.net)} ${t('to')} ${rows.length} ${t('people')}${run?.state === 'APPROVED' ? `; ${t('approved by')} ${run.approver}` : blocks.length ? `; ${blocks.length} ${t(blocks.length === 1 ? 'check stops it' : 'checks stop it')}` : `; ${t('nothing stops it')}`}` : t('Runs')}
      actions={d ? (run && run.state !== 'RETURNED' ? <Btn kind="primary" onClick={() => openCase(run.ref, current!)}>{t(STATE[run.state]?.[0] ?? run.state)} · {t('open the run')}</Btn> : cutPassed ? <span className="flex items-center gap-2"><Btn kind="primary" disabled={busyRun} onClick={startRun}>{t(run?.state === 'RETURNED' ? 'Prepare the run again' : 'Start the run')}</Btn>{runErr ? <span className="text-xs text-danger">{runErr}</span> : null}</span> : <Chip tone="primary">{t('Draft until the cut-off on')} {date(d.period.cutoff, lang)}</Chip>) : undefined}
      lede={t('The draft is the engine\'s calculation from the employee master, the month\'s confirmed changes and the client\'s active policy. Every line names the rule behind it. Nothing is paid until the client approves.')}
      feature={d ? <HeroFeature label="Net pay against last month" value={`${base.change >= 0 ? '+' : '−'}SAR ${sarK(Math.abs(base.change))}`} support={<span className="text-xs text-muted-foreground">{base.people} {t('people paid differently')}</span>} /> : undefined} />}>
      <div className="flex flex-wrap gap-2">
        {(all?.clients ?? []).map((c: any) => (
          <button key={c.key} type="button" disabled={!c.draft} onClick={() => { setKey(c.key); setShowAll(false); }}
            className={`min-w-[9.5rem] rounded-xl border px-3 py-2 text-start transition-colors ${current === c.key ? 'border-primary bg-primary/5' : 'border-border/60 hover:border-primary/40'} disabled:cursor-default disabled:opacity-60 disabled:hover:border-border/60`}>
            <p className="text-sm font-semibold">{bi(c.short, c.name_ar)}</p>
            <p className="text-[11px] text-muted-foreground">{c.draft ? `${c.draft.people} ${t('people')} · ${c.run?.state === 'APPROVED' ? t('approved') : c.run?.state === 'VALIDATED' ? t('with the client') : c.run?.state === 'PREPARED' ? t('to validate') : c.draft.blocks ? `${c.draft.blocks} ${t('stop the run')}` : t('ready to check')}` : '—'}</p>
          </button>
        ))}
      </div>
      {d ? (
        <>
          <StatRow>
            <StatTile label="Gross pay" value={`SAR ${sarK(d.totals.gross)}`} trend={{ direction: 'flat', label: `${t('policy')} v${d.version ?? '—'}` }} />
            <StatTile label="Deductions" value={`SAR ${sarK(d.totals.deductions)}`} trend={{ direction: 'flat', label: `GOSI SAR ${sarK(d.totals.gosiEmployee ?? 0)}` }} />
            <StatTile label="Net pay" value={`SAR ${sarK(d.totals.net)}`} trend={{ direction: base.change >= 0 ? 'up' : 'down', label: `${t('last month')} SAR ${sarK(base.last)}` }} />
            <StatTile label="Cut-off · pay day" value={`${date(d.period.cutoff, lang).split(' ').slice(0, 2).join(' ')} · ${date(d.period.pay, lang).split(' ').slice(0, 2).join(' ')}`} />
          </StatRow>
          <Panel icon={<FileText size={16} />} title={tab === 'differences' ? (dx ? `${dx.people.length} ${t('people are paid differently, and every difference is explained')}` : t('Differences')) : tab === 'approval' ? (run ? `${t(STATE[run.state]?.[0] ?? run.state)}` : t('The run has not started')) : tab === 'payslips' ? (run?.payslips ? `${run.payslips} ${t('payslips issued')}` : t('No payslips yet')) : tab === 'checks' ? (blocks.length ? `${blocks.length} ${t(blocks.length === 1 ? 'check stops the run until it is fixed' : 'checks stop the run until they are fixed')}` : t('No check stops the run')) : tab === 'provisions' ? `${t('End of service owed reaches')} SAR ${sarK(points.at(-1)?.eos ?? 0)} ${t('at the end of')} ${monthWord}` : changed.length ? `${changed.length} ${t('people are paid differently from last month')}` : t('Everyone is paid as last month')}>
            <TabStrip items={[{ id: 'draft', label: 'Draft' }, { id: 'checks', label: 'Checks' }, { id: 'differences', label: 'Differences' }, { id: 'approval', label: 'Approval' }, { id: 'payslips', label: 'Payslips' }, { id: 'provisions', label: 'Provisions' }]} value={tab} onChange={setTab} />
            <div className="mt-4">
              {tab === 'draft' ? (
                <div className="space-y-5">
                  {changed.length ? <ChangeBars rows={changed.slice(0, 10)} /> : null}
                  <Table><thead><tr><th>{t('Person')}</th><th>{t('Department')}</th><th className="text-end">{t('Days')}</th><th className="text-end">{t('Gross')}</th><th className="text-end">{t('Deductions')}</th><th className="text-end">{t('Net')}</th><th className="text-end">{t('Last month')}</th></tr></thead>
                    <tbody>{listed.map((r) => (
                      <tr key={r.person_id} className="align-top">
                        <td><span className="font-medium">{bi(r.name, r.name_ar)}</span>{checkOf(r.person_id).length ? <button type="button" className="ms-2" onClick={() => setTab('checks')}><Chip tone={checkOf(r.person_id).some((c) => c.severity === 'BLOCK') ? 'danger' : 'warn'}>{t(checkOf(r.person_id).some((c) => c.severity === 'BLOCK') ? 'Stops the run' : 'Needs the client')} ›</Chip></button> : r.prev_net == null ? <span className="ms-2"><Chip tone="primary">{t('New')}</Chip></span> : null}
                          {settledOf(r.person_id) ? <p className="mt-0.5 text-xs text-muted-foreground">{settledOf(r.person_id).text}</p> : null}<PersonLines r={r} /></td>
                        <td>{r.department}</td>
                        <td className="text-end tabular-nums">{r.pay_days}</td>
                        <td className="text-end tabular-nums">{num(r.gross, 2)}</td>
                        <td className="text-end tabular-nums">{num(r.deductions, 2)}</td>
                        <td className="text-end font-medium tabular-nums">{num(r.net, 2)}</td>
                        <td className="text-end tabular-nums text-muted-foreground">{r.prev_net == null ? '—' : num(r.prev_net, 2)}</td>
                      </tr>))}</tbody></Table>
                  {!showAll && listed.length < rows.length ? <Btn small onClick={() => setShowAll(true)}>{t('Show everyone')} ({rows.length})</Btn> : null}
                </div>
              ) : tab === 'differences' ? (
                dx ? (
                  <div className="space-y-5">
                    <ChangeWaterfall from={dx.lastNet} to={dx.thisNet} fromLabel={`${t('Last month')}, ${t('net')}`} toLabel={`${monthWord}, ${t('net')}`} steps={dx.steps.map((x: any) => ({ label: t(x.label), amount: x.amount }))} format={(v) => `SAR ${num(Math.round(v))}`} />
                    <Table><thead><tr><th>{t('Person')}</th><th className="text-end">{t('Last month')}</th><th className="text-end">{t('This month')}</th><th>{t('Why')}</th></tr></thead>
                      <tbody>{dx.people.slice(0, showAll ? 999 : 15).map((x: any) => <tr key={x.person_id}><td className="text-sm">{x.name}</td><td className="text-end tabular-nums text-muted-foreground">{num(x.from, 2)}</td><td className="text-end tabular-nums">{num(x.to, 2)}</td>
                        <td className="text-xs">{Object.entries(x.causes).map(([k, v]: any) => <span key={k} className="me-2 inline-block">{t(dx.steps.find((s: any) => s.key === k)?.label ?? k)} <span className={v >= 0 ? 'text-success' : 'text-danger'}>{v >= 0 ? '+' : '−'}{num(Math.abs(v), 2)}</span></span>)}</td></tr>)}</tbody></Table>
                    {!showAll && dx.people.length > 15 ? <Btn small onClick={() => setShowAll(true)}>{t('Show everyone')} ({dx.people.length})</Btn> : null}
                    <p className="text-xs text-muted-foreground">{t('Mutabaqa recalculates last month on the engine and replaces one input at a time with this month\'s, so each cause gets its exact share and the causes add up to the change.')}</p>
                  </div>
                ) : <Empty>{t('No last month to compare with.')}</Empty>
              ) : tab === 'approval' ? (
                run ? (
                  <div className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-3">{[
                      ['Prepared', run.preparer, run.prepared_at, 'Payroll specialist, Tasama'],
                      ['Validated', run.validator, run.validated_at, 'Payroll lead, Tasama'],
                      ['Approved', run.approver, run.approved_at, `CHRO, ${name}`],
                    ].map(([k, who, at, role]: any) => (
                      <div key={k} className="rounded-xl glass-l3 p-3">
                        <p className="text-xs text-muted-foreground">{t(k)}</p>
                        <p className="mt-0.5 text-sm font-semibold">{who ?? (run.state === 'RETURNED' ? '—' : `${t('Waiting')}${run.waiting_on && !who ? `: ${run.waiting_on}` : ''}`)}</p>
                        <p className="text-xs text-muted-foreground">{t(role)}{at ? ` · ${date(at, lang)}` : ''}</p>
                      </div>))}</div>
                    {run.state === 'RETURNED' ? <p className="text-sm text-danger">{t('Returned by')} {run.returned_by ?? t('the client')}: {run.returned_reason ?? '—'}</p> : null}
                    {run.state !== 'APPROVED' && d ? <div><p className="mb-1 text-xs text-muted-foreground">{t('Approval due')} {date(new Date(Date.parse(d.period.pay) - 4 * 864e5).toISOString(), lang)}</p><ClockBar start={run.created_at} due={new Date(Date.parse(d.period.pay) - 4 * 864e5 + 18 * 3600e3).toISOString()} /></div> : null}
                    <p className="text-xs text-muted-foreground">{t('The payroll lead never validates a run she prepared; the client\'s CHRO approves every run.')}</p>
                  </div>
                ) : <Empty>{cutPassed ? t('Start the run to prepare it for validation.') : `${t('The run starts after the cut-off on')} ${date(d.period.cutoff, lang)}.`}</Empty>
              ) : tab === 'payslips' ? (
                run?.state === 'APPROVED' ? (
                  <div className="space-y-2"><Progress done={run.payslips} total={run.people} /><p className="text-sm">{run.payslips} {t('of')} {run.people} {t('payslips issued; each employee was told and sees every line in My HR › Pay.')}</p></div>
                ) : <Empty>{t('Payslips are issued once the client has approved the run.')}</Empty>
              ) : tab === 'checks' ? (
                <div className="space-y-3">
                  {checks.length ? checks.map((c, i) => <CheckCard key={i} c={c} client={current!} reload={reload} />)
                    : <Empty icon={<Scale size={18} />}>{t('Every line is within the law and the client\'s policy.')}</Empty>}
                  {review.fixed.length ? (
                    <div className="pt-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('Done this month')}</p>
                      <ul className="mt-2 space-y-1.5 text-sm">{review.fixed.map((f: any, i: number) => <li key={i} className="flex gap-3"><span className="w-28 shrink-0 text-xs text-muted-foreground">{date(f.at, lang)}</span><span>{f.summary}</span></li>)}</ul>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-4">
                  <ProvisionTrend points={points} />
                  <p className="text-xs text-muted-foreground">{t('End of service: half a month\'s wage a year for five years, a month a year after (Art. 84), on basic plus the regular allowances. Leave: each person\'s unused days at a day\'s wage. The month\'s charge is the change in each balance.')}</p>
                  <Btn small onClick={() => go('payroll-policies', current!)}>{t('The policy behind these rules')}</Btn>
                </div>
              )}
            </div>
          </Panel>
        </>
      ) : <Empty icon={<FileText size={18} />}>{t('Choose a client whose payroll Tasama runs.')}</Empty>}
    </Screen>
  );
}

/* ------------------------------------------------------------------ Inputs (§17) */

/** Each client's changes for the month against its cut-off: what is in, what is still expected, what moved to next month. */
export function PayrollInputs() {
  const { t, bi, lang } = useLang();
  const { route, openCase } = useApp();
  const { data } = useApi<any>('/payroll/inputs', { poll: 15000 });
  const [key, setKey] = useState<string | null>(route.param);
  if (!data) return null;
  const rows: any[] = data.clients.filter((c: any) => c.period);
  const expected = rows.filter((c) => !c.passed).reduce((n, c) => n + c.counts.expected, 0);
  const waitingClients = rows.filter((c) => !c.passed && c.counts.expected > 0);
  const next = rows.reduce((n, c) => n + c.counts.next, 0);
  const sel = rows.find((c) => c.key === (key ?? waitingClients[0]?.key ?? rows[0]?.key));
  return (
    <Screen hero={<Hero tone="surface" eyebrow="Payroll"
      title={expected ? `${expected} ${t(expected === 1 ? 'change is still expected' : 'changes are still expected')} ${t('from')} ${waitingClients.length} ${t(waitingClients.length === 1 ? 'client before its cut-off' : 'clients before their cut-off')}` : t('Every client has sent its changes for the month')}
      lede={t('Wared lists each client\'s changes when the month opens: what came through approved cases is already in; what only the client can send waits for its HR operations, who Wared reminds before the cut-off. A change after the cut-off moves to next month as back pay.')}
      feature={<HeroFeature label="Moved to next month" value={num(next)} support={<span className="text-xs text-muted-foreground">{t('changes entered after a cut-off')}</span>} />} />}>
      <Panel icon={<InboxIcon size={16} />} title="Where each client's changes stand">
        <div className="space-y-2">{rows.map((c) => (
          <button key={c.key} type="button" onClick={() => setKey(c.key)}
            className={`grid w-full grid-cols-[10rem_1fr_15rem] items-center gap-4 rounded-xl border px-3 py-2.5 text-start transition-colors ${sel?.key === c.key ? 'border-primary bg-primary/5' : 'border-border/60 hover:border-primary/40'}`}>
            <span><span className="block text-sm font-semibold">{bi(c.short, c.name_ar)}</span><span className="block text-[11px] text-muted-foreground">{cutoffWords(c.period.cutoff, data.today, t)}</span></span>
            <InputsBar counts={c.counts} legend={false} />
            <span className="text-xs text-muted-foreground">{c.month?.status === 'COMPLETED' ? `${t('Confirmed by')} ${c.month.confirmed_by ?? '—'}${c.month.closed_at ? `, ${date(c.month.closed_at, lang)}` : ''}` : c.counts.expected ? `${c.counts.expected} ${t('expected from')} ${c.month?.waiting_on ?? t('HR operations')}` : t('All in')}{c.month?.reminders ? ` · ${c.month.reminders} ${t(c.month.reminders === 1 ? 'reminder' : 'reminders')}` : ''}</span>
          </button>))}</div>
        <div className="mt-4 border-t border-border/60 pt-3">
          <p className="mb-1.5 text-xs text-muted-foreground">{t('All five clients')}</p>
          <InputsBar counts={rows.reduce((a, c) => ({ confirmed: a.confirmed + c.counts.confirmed, expected: a.expected + c.counts.expected, next: a.next + c.counts.next, dropped: a.dropped + c.counts.dropped }), { confirmed: 0, expected: 0, next: 0, dropped: 0 })} />
        </div>
      </Panel>
      {sel ? (
        <Panel icon={<FileText size={16} />} title={`${bi(sel.short, sel.name_ar)}: ${sel.counts.confirmed} ${t('confirmed')}, ${sel.counts.expected} ${t('expected')}${sel.counts.next ? `, ${sel.counts.next} ${t('moved to next month')}` : ''}`}
          action={sel.month ? <PanelAction onClick={() => openCase(sel.month.ref, sel.key)}>{t(sel.month.status === 'COMPLETED' ? 'Open the month\'s case' : 'Open the case and send a reminder')}</PanelAction> : undefined}>
          <InputRows rows={[...sel.rows, ...sel.late]} />
        </Panel>
      ) : null}
    </Screen>
  );
}

/* ------------------------------------------------------------------ Attendance */

const CELL: Record<string, string> = { ON_TIME: 'bg-muted', LATE: 'bg-warn', ABSENT: 'bg-danger', LEAVE: 'bg-primary/35', OFF: 'bg-transparent border border-border/40' };

/** One row per person across the month: late days shaded by minutes, absences, approved leave. */
function HeatStrip({ people, from, to }: { people: any[]; from: string; to: string }) {
  const { t, bi } = useLang();
  const days: string[] = [];
  for (let x = d0(from); x <= d0(to); x += DAY) days.push(new Date(x).toISOString().slice(0, 10));
  return (
    <div className="space-y-1.5">
      <div className="grid items-center gap-3 text-[10px] text-muted-foreground" style={{ gridTemplateColumns: '11rem 1fr 15rem' }}>
        <span />
        <div className="grid" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0,1fr))` }}>{days.map((d) => <span key={d} className="text-center">{Number(d.slice(8)) % 5 === 0 || d.slice(8) === '01' ? Number(d.slice(8)) : ''}</span>)}</div>
        <span>{t('Fine against the five-day cap')}</span>
      </div>
      {people.map((p) => {
        const by = new Map(p.strip.map((x: any) => [x.day, x]));
        const share = p.cap ? Math.min(1, p.fine_before / p.cap) : 0;
        return (
          <div key={p.person_id} className="grid items-center gap-3 text-sm" style={{ gridTemplateColumns: '11rem 1fr 15rem' }}>
            <span className="truncate" title={p.dept}>{bi(p.name, p.name_ar)}</span>
            <div className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0,1fr))` }}>
              {days.map((d) => {
                const x: any = by.get(d);
                const s = x?.s ?? 'OFF';
                return <span key={d} className={`h-4 rounded-[3px] ${CELL[s]}`} style={s === 'LATE' ? { opacity: 0.45 + Math.min(0.55, (x.m ?? 0) / 60) } : undefined} title={`${d}: ${t(s === 'ON_TIME' ? 'On time' : s === 'LATE' ? `${x.m} minutes late` : s === 'ABSENT' ? 'Absent, no leave' : s === 'LEAVE' ? 'Approved leave' : 'Day off')}${x?.f ? ` · SAR ${num(x.f, 2)}` : ''}`} />;
              })}
            </div>
            <div>
              {p.fine_before ? <div className="relative mb-1 h-2.5 rounded-full bg-muted">
                <div className={`absolute inset-y-0 start-0 rounded-full ${p.fine_before > p.cap ? 'bg-danger' : 'bg-warn'}`} style={{ width: `${share * 100}%` }} />
              </div> : null}
              <p className="text-[11px] text-muted-foreground">{p.fine_before ? `SAR ${num(p.fine, 2)}${p.fine_before > p.cap ? ` ${t('(stopped at the cap; table gives')} ${num(p.fine_before, 2)})` : ` ${t('of')} ${num(p.cap, 0)}`}` : p.lates ? t('Written warning, no fine') : t('No fine')}{p.unpaid_days ? ` · ${p.unpaid_days} ${t(p.unpaid_days === 1 ? 'unpaid day' : 'unpaid days')}` : ''}{p.leave ? ` · ${p.leave} ${t('days of leave')}` : ''}</p>
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-4 pt-2 text-[11px] text-muted-foreground">{[['ON_TIME', 'On time'], ['LATE', 'Late'], ['ABSENT', 'Absent, no leave'], ['LEAVE', 'Approved leave'], ['OFF', 'Day off']].map(([k, l]) => <span key={k} className="flex items-center gap-1.5"><span className={`h-3 w-3 rounded-[3px] ${CELL[k]}`} />{t(l)}</span>)}</div>
    </div>
  );
}

const FIELDS: [string, string][] = [['employee', 'Employee number'], ['date', 'Date'], ['time', 'Time'], ['direction', 'In or out'], ['device', 'Device']];

/** Drop the device's file; Hudoor proposes which column is which; a person confirms before anything is read. */
function UploadAttendance({ client, onDone }: { client: string; onDone: () => void }) {
  const { t } = useLang();
  const [file, setFile] = useState<{ name: string; csv: string } | null>(null);
  const [m, setM] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const load = async (name: string, csv: string) => { setErr(null); setFile({ name, csv }); try { setM(await post<any>(`/payroll/attendance/${client}/map`, { csv })); } catch (e: any) { setErr(e.message); } };
  const fromFolder = async () => { setBusy(true); try { const r = await fetch(`/api/payroll/attendance/${client}/export`, { headers: { 'x-persona': localStorage.getItem('tasama-persona') ?? '', 'x-client': client } }); const name = (r.headers.get('content-disposition') ?? '').match(/filename="([^"]+)"/)?.[1] ?? 'attendance.csv'; await load(name, await r.text()); } finally { setBusy(false); } };
  const read = async () => { if (!file || !m) return; setBusy(true); try { await post(`/payroll/attendance/${client}/upload`, { fileName: file.name, csv: file.csv, map: m.map }); bump(); onDone(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  return (
    <div className="space-y-4">
      {!m ? (
        <div className="space-y-3">
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground hover:border-primary/50"
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) f.text().then((x) => load(f.name, x)); }}>
          <span className="font-medium text-foreground">{t('Drop the attendance file here')}</span>
          <span>{t('A CSV file, in whatever columns the device writes')}</span>
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) f.text().then((x) => load(f.name, x)); }} />
        </label>
        <Btn small onClick={fromFolder} disabled={busy}>{t('Take this month\'s export from the client\'s shared folder')}</Btn>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm"><span className="font-medium">{file?.name}</span> · {num(m.rows)} {t('attendance records')}. {t('Hudoor read the file\'s own headers; check which column is which before it reads the attendance.')}</p>
          <Table><thead><tr><th>{t('Needed')}</th><th>{t('Column in the file')}</th><th>{t('First rows')}</th></tr></thead>
            <tbody>{FIELDS.map(([f, l]) => (
              <tr key={f}><td>{t(l)}</td>
                <td><select className="input rounded-md border border-border bg-background px-2 py-1 text-sm" value={m.map[f] ?? ''} onChange={(e) => setM({ ...m, map: { ...m.map, [f]: e.target.value || null } })}>
                  <option value="">{t('Not in the file')}</option>{m.headers.map((h: string) => <option key={h} value={h}>{h}</option>)}</select></td>
                <td className="font-mono text-xs text-muted-foreground">{m.map[f] ? m.sample.map((r: string[]) => r[m.headers.indexOf(m.map[f])]).join(' · ') : '—'}</td></tr>))}</tbody></Table>
          <div className="flex gap-2"><Btn kind="primary" onClick={read} disabled={busy || !m.map.employee || !m.map.date || !m.map.time}>{t('Read the attendance')}</Btn><Btn onClick={() => { setM(null); setFile(null); }}>{t('Choose another file')}</Btn></div>
        </div>
      )}
      {err ? <p className="text-sm text-danger">{err}</p> : null}
    </div>
  );
}

export function PayrollAttendance() {
  const { t, bi, lang } = useLang();
  const { route, session, openCase, persona } = useApp();
  const { data: all } = useApi<any>('/payroll/attendance', { poll: 15000 });
  const expected = (all?.clients ?? []).filter((c: any) => c.expected);
  const [key, setKey] = useState<string | null>(route.param);
  useEffect(() => { setKey(route.param ?? null); }, [route.param]);
  const current = key ?? expected[0]?.key ?? (session?.client.hrms === 'PLATFORM' ? session.client.key : null);
  const { data, reload } = useApi<any>(current ? `/payroll/attendance/${current}` : null, { poll: 10000 });
  const up = data?.upload;
  const tot = data?.totals;
  const name = data ? bi(data.client.short, data.client.name_ar) : '';
  const monthName = up ? new Date(`${up.from}T00:00:00Z`).toLocaleString(lang === 'ar' ? 'ar' : 'en-GB', { month: 'long', timeZone: 'UTC' }) : '';
  const waiting = up && up.status === 'READ' ? data.people.filter((p: any) => p.fine || p.unpaid_days).length : 0;
  const title = !data ? t('Attendance') : !up ? `${name}: ${t('the month\'s attendance file has not arrived yet')}`
    : up.status === 'READ' ? `${name}${t('’s')} ${monthName} ${t('attendance')}: ${data.people.filter((p: any) => p.fine).length} ${t('fines and')} ${tot.unpaid_days} ${t('unpaid days wait for HR operations')}`
    : `${name}${t('’s')} ${monthName} ${t('deductions are in this month\'s run')}`;
  return (
    <Screen hero={<Hero tone="surface" eyebrow="Payroll" title={title}
      lede={t('Hudoor reads the client\'s attendance file against each person\'s schedule and approved leave. Unpaid absence and lateness fines are kept apart: a fine comes only after the employee is heard, and stops at five days\' wage a month.')}
      feature={<HeroFeature label="Deductions waiting for confirmation" value={num(waiting)} support={up?.ref ? <Btn small onClick={() => openCase(up.ref, current!)}>{t(up.status === 'READ' ? 'Open the decision' : 'Open the record')}</Btn> : undefined} />} />}>
      <div className="flex flex-wrap gap-2">
        {(all?.clients ?? []).map((c: any) => (
          <button key={c.key} type="button" disabled={!c.expected} onClick={() => setKey(c.key)}
            className={`min-w-[9.5rem] rounded-xl border px-3 py-2 text-start transition-colors ${current === c.key ? 'border-primary bg-primary/5' : 'border-border/60 hover:border-primary/40'} disabled:cursor-default disabled:opacity-60`}>
            <p className="text-sm font-semibold">{bi(c.short, c.name_ar)}</p>
            <p className="text-[11px] text-muted-foreground">{c.hrms !== 'PLATFORM' ? t('Attendance in Oracle HCM') : !c.expected ? t('No devices connected') : !c.upload ? t('Export expected') : c.upload.status === 'READ' ? t('Waiting for confirmation') : t('Confirmed')}</p>
          </button>
        ))}
      </div>
      {data && !up ? (
        <Panel icon={<FileText size={16} />} title={t('Upload the month\'s attendance')}>
          {persona?.roles.includes('TASAMA_PAYROLL') ? <UploadAttendance client={current!} onDone={reload} /> : <Empty>{t('Tasama\'s payroll team uploads the attendance file.')}</Empty>}
        </Panel>
      ) : null}
      {up && tot ? (
        <>
          <StatRow>
            <StatTile label="Late arrivals" value={num(tot.lates)} trend={{ direction: 'flat', label: `${data.people.filter((p: any) => p.fine).length} ${t('fined')}` }} />
            <StatTile label="Absent, no leave" value={num(tot.absences)} trend={{ direction: 'flat', label: `${num(tot.leave)} ${t('leave days excluded')}` }} />
            <StatTile label="Fines" value={`SAR ${num(tot.fines, 0)}`} trend={{ direction: 'flat', label: tot.capped ? `${tot.capped} ${t('stopped at the cap')}` : t('none at the cap') }} />
            <StatTile label="Explained by employees" value={num(tot.explained)} />
          </StatRow>
          <Panel icon={<CalendarRange size={16} />} title={`${data.people.filter((p: any) => p.lates || p.absences).length} ${t('people were late or absent in')} ${monthName}`}>
            <HeatStrip people={data.people.filter((p: any) => p.lates || p.absences).slice(0, 16)} from={up.from} to={up.to} />
            <details className="mt-4 border-t border-border/60 pt-3">
              <summary className="cursor-pointer text-sm font-medium">{t('How this was read')}</summary>
              <div className="mt-2 space-y-2 text-sm text-muted-foreground">
                <p>{up.file} · {num(up.rows)} {t('attendance records from')} {up.device} · {t('uploaded by')} {up.by}. {t('Columns')}: {Object.entries(up.map).filter(([, v]) => v).map(([k, v]) => `${v} → ${t(FIELDS.find((f) => f[0] === k)?.[1] ?? k)}`).join(', ')}.</p>
                <p>{t('Penalty table in the client\'s work regulation, counted within the month')}: {data.table.map((s: any) => `${t('from the')} ${s.from}${s.from === 1 ? t('st') : s.from === 3 ? t('rd') : t('th')} ${t('late arrival')}, ${t(s.label)}`).join('; ')}. {t('Fines in a month stop at')} {data.capDays} {t('days\' wage (Art. 70), after the employee is heard (Art. 71). A day absent without leave is not paid; that is not a fine and has no cap.')}</p>
              </div>
            </details>
          </Panel>
        </>
      ) : null}
    </Screen>
  );
}
