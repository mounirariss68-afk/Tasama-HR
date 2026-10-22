/**
 * The Payroll lens: Tasama's payroll team across every client
 * (design/payroll-addendum.md §3). Months is the lead's landing, Inbox the
 * specialist's; Client policies is shared with Tasama Services.
 */
import { useEffect, useMemo, useState } from 'react';
import { HeroFeature, Panel, PanelAction, StatTile } from '@cognirise/atelier/layout';
import { InboxLayout, InboxList, InboxReader } from '@cognirise/atelier/archetypes';
import { BookOpen, CalendarRange, FileText, Scale } from 'lucide-react';
import { bump, getClient, post, setClientKey, useApi } from '../lib/api';
import { useLang } from '../lib/i18n';
import { date, num } from '../lib/format';
import { useApp } from '../app/state';
import { Btn, Chip, Empty, Hero, Screen, StatRow, TabStrip, Table } from '../app/ui';
import { CaseRow, CaseView } from '../app/case';

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

export function PayrollRuns() {
  const { t, bi, lang } = useLang();
  const { route, session, go } = useApp();
  const { data: all } = useApi<any>('/payroll/runs', { poll: 20000 });
  const platform = (all?.clients ?? []).filter((c: any) => c.draft);
  const [key, setKey] = useState<string | null>(route.param);
  useEffect(() => { setKey(route.param ?? (session?.client.hrms === 'PLATFORM' ? session.client.key : null)); }, [route.param, session?.client.key]);
  const current = key ?? platform[0]?.key ?? null;
  const { data } = useApi<any>(current ? `/payroll/runs/${current}` : null, { poll: 20000 });
  const [tab, setTab] = useState('draft');
  const [showAll, setShowAll] = useState(false);
  const d = data?.draft;
  const rows: any[] = d?.rows ?? [];
  const checks = rows.flatMap((r) => r.flags.map((f: any) => ({ ...f, r })));
  const blocks = checks.filter((c) => c.severity === 'BLOCK');
  const changed = rows.filter((r) => r.change != null && Math.abs(r.change) >= 1).sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  const joiners = rows.filter((r) => r.prev_net == null);
  const prevNet = rows.reduce((s, r) => s + (r.prev_net ?? 0), 0);
  const monthWord = d ? new Date(`${d.period.start}T00:00:00Z`).toLocaleString(lang === 'ar' ? 'ar' : 'en-GB', { month: 'long', timeZone: 'UTC' }) : '';
  const name = data ? bi(data.client.short, data.client.name_ar) : '';
  const listed = showAll ? rows : rows.filter((r) => r.flags.length || (r.change != null && Math.abs(r.change) >= 1) || r.prev_net == null);
  const hist: any[] = data?.history ?? [];
  const mon = (pn: string) => new Date(`${pn}-01T00:00:00Z`).toLocaleString(lang === 'ar' ? 'ar' : 'en-GB', { month: 'short', timeZone: 'UTC' });
  const points = [...hist.map((h) => ({ label: mon(h.period_name), eos: h.eos, leave: h.leave })), ...(d ? [{ label: mon(d.period.name), eos: rows.reduce((s, r) => s + r.eos.accrued, 0), leave: rows.reduce((s, r) => s + r.leave.accrued, 0), draft: true }] : [])];
  return (
    <Screen hero={<Hero tone="surface" eyebrow="Payroll"
      title={d ? `${name}'s ${monthWord} ${t('run pays')} SAR ${sarK(d.totals.net)} ${t('to')} ${rows.length} ${t('people')}${blocks.length ? `; ${blocks.length} ${t(blocks.length === 1 ? 'check stops it' : 'checks stop it')}` : `; ${t('nothing stops it')}`}` : t('Runs')}
      lede={t('The draft is the engine\'s calculation from the employee master, the month\'s confirmed changes and the client\'s active policy. Every line names the rule behind it. Nothing is paid until the client approves.')}
      feature={d ? <HeroFeature label="Net pay against last month" value={`${d.totals.net - prevNet >= 0 ? '+' : '−'}SAR ${sarK(Math.abs(d.totals.net - prevNet))}`} support={<span className="text-xs text-muted-foreground">{changed.length} {t('people paid differently')} · {joiners.length} {t('new')}</span>} /> : undefined} />}>
      <div className="flex flex-wrap gap-2">
        {(all?.clients ?? []).map((c: any) => (
          <button key={c.key} type="button" disabled={!c.draft} onClick={() => { setKey(c.key); setShowAll(false); }}
            className={`min-w-[9.5rem] rounded-xl border px-3 py-2 text-start transition-colors ${current === c.key ? 'border-primary bg-primary/5' : 'border-border/60 hover:border-primary/40'} disabled:cursor-default disabled:opacity-60 disabled:hover:border-border/60`}>
            <p className="text-sm font-semibold">{bi(c.short, c.name_ar)}</p>
            <p className="text-[11px] text-muted-foreground">{c.draft ? `${c.draft.people} ${t('people')} · ${c.draft.blocks ? `${c.draft.blocks} ${t('stop the run')}` : t('ready to check')}` : t('Runs in Oracle HCM')}</p>
          </button>
        ))}
      </div>
      {d ? (
        <>
          <StatRow>
            <StatTile label="Gross pay" value={`SAR ${sarK(d.totals.gross)}`} trend={{ direction: 'flat', label: `${t('policy')} v${d.version ?? '—'}` }} />
            <StatTile label="Deductions" value={`SAR ${sarK(d.totals.deductions)}`} trend={{ direction: 'flat', label: `GOSI SAR ${sarK(d.totals.gosiEmployee ?? 0)}` }} />
            <StatTile label="Net pay" value={`SAR ${sarK(d.totals.net)}`} trend={{ direction: d.totals.net >= prevNet ? 'up' : 'down', label: `${t('last month')} SAR ${sarK(prevNet)}` }} />
            <StatTile label="Cut-off · pay day" value={`${date(d.period.cutoff, lang).split(' ').slice(0, 2).join(' ')} · ${date(d.period.pay, lang).split(' ').slice(0, 2).join(' ')}`} />
          </StatRow>
          <Panel icon={<FileText size={16} />} title={tab === 'checks' ? (blocks.length ? `${blocks.length} ${t(blocks.length === 1 ? 'check stops the run until it is fixed' : 'checks stop the run until they are fixed')}` : t('No check stops the run')) : tab === 'provisions' ? `${t('End of service owed reaches')} SAR ${sarK(points.at(-1)?.eos ?? 0)} ${t('at the end of')} ${monthWord}` : changed.length ? `${changed.length} ${t('people are paid differently from last month')}` : t('Everyone is paid as last month')}>
            <TabStrip items={[{ id: 'draft', label: 'Draft' }, { id: 'checks', label: 'Checks' }, { id: 'provisions', label: 'Provisions' }]} value={tab} onChange={setTab} />
            <div className="mt-4">
              {tab === 'draft' ? (
                <div className="space-y-5">
                  {changed.length ? <ChangeBars rows={changed.slice(0, 10)} /> : null}
                  <Table><thead><tr><th>{t('Person')}</th><th>{t('Department')}</th><th className="text-end">{t('Days')}</th><th className="text-end">{t('Gross')}</th><th className="text-end">{t('Deductions')}</th><th className="text-end">{t('Net')}</th><th className="text-end">{t('Last month')}</th></tr></thead>
                    <tbody>{listed.map((r) => (
                      <tr key={r.person_id} className="align-top">
                        <td><span className="font-medium">{bi(r.name, r.name_ar)}</span>{r.flags.length ? <span className="ms-2"><Chip tone={r.flags.some((f: any) => f.severity === 'BLOCK') ? 'danger' : 'warn'}>{t(r.flags.some((f: any) => f.severity === 'BLOCK') ? 'Stops the run' : 'Check')}</Chip></span> : r.prev_net == null ? <span className="ms-2"><Chip tone="primary">{t('New')}</Chip></span> : null}<PersonLines r={r} /></td>
                        <td>{r.department}</td>
                        <td className="text-end tabular-nums">{r.pay_days}</td>
                        <td className="text-end tabular-nums">{num(r.gross, 2)}</td>
                        <td className="text-end tabular-nums">{num(r.deductions, 2)}</td>
                        <td className="text-end font-medium tabular-nums">{num(r.net, 2)}</td>
                        <td className="text-end tabular-nums text-muted-foreground">{r.prev_net == null ? '—' : num(r.prev_net, 2)}</td>
                      </tr>))}</tbody></Table>
                  {!showAll && listed.length < rows.length ? <Btn small onClick={() => setShowAll(true)}>{t('Show everyone')} ({rows.length})</Btn> : null}
                </div>
              ) : tab === 'checks' ? (
                checks.length ? (
                  <div className="grid gap-3 md:grid-cols-2">{checks.map((c, i) => (
                    <div key={i} className="rounded-xl glass-l3 p-3">
                      <div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold">{bi(c.r.name, c.r.name_ar)}</p><Chip tone={c.severity === 'BLOCK' ? 'danger' : 'warn'}>{t(c.severity === 'BLOCK' ? 'Stops the run' : 'Check')}</Chip></div>
                      <p className="mt-1 text-sm">{c.text}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">{c.r.department} · {t('net')} {num(c.r.net, 2)}</p>
                    </div>))}</div>
                ) : <Empty icon={<Scale size={18} />}>{t('Every line is within the law and the client\'s policy.')}</Empty>
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
