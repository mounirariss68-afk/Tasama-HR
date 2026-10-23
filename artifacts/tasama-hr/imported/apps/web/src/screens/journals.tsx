/**
 * Payroll › Journals (design/payroll-addendum.md §3, §21): each paid month becomes four balanced journals
 * in the client's ledger, every line from the client's account map.
 */
import { Fragment, useEffect, useState } from 'react';
import { HeroFeature, Panel } from '@cognirise/atelier/layout';
import { BookOpenCheck, Download, FileSpreadsheet } from 'lucide-react';
import { useApi } from '../lib/api';
import { useLang } from '../lib/i18n';
import { aed, date, num } from '../lib/format';
import { useApp } from '../app/state';
import { Btn, Chip, Empty, Hero, Screen, TabStrip, Table } from '../app/ui';

const KIND: Record<string, string> = { ACCRUAL: 'Payroll accrual', PROVISIONS: 'Provisions', PAYMENT: 'Payment', PROVISION_USE: 'Provision use' };
const sarK = (n: number) => (Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : Math.abs(n) >= 1e4 ? `${Math.round(n / 1e3)}K` : num(n));
const mon = (pn: string, lang: string) => new Date(`${pn}-01T00:00:00Z`).toLocaleString(lang === 'ar' ? 'ar' : 'en-GB', { month: 'short', timeZone: 'UTC' });

/** One bullet per client and month: the debit bar against the credit tick, coloured by where the month stands. */
function Bullets({ clients, sel, onSelect }: { clients: any[]; sel: { key: string; period: string } | null; onSelect: (k: string, p: string) => void }) {
  const { t, bi, lang } = useLang();
  const max = Math.max(1, ...clients.flatMap((c) => c.months.map((m: any) => Math.max(m.debit, m.credit))));
  return (
    <div className="space-y-1.5">
      {clients.map((c) => (
        <div key={c.key} className="grid grid-cols-[10rem_minmax(0,1fr)] items-center gap-3">
          <span className="min-w-0"><span className="block truncate text-sm font-semibold">{bi(c.short, c.name_ar)}</span><span className="block text-[11px] text-muted-foreground">{t(c.ledger === 'ORACLE_FIN' ? 'Oracle Finance' : 'Odoo Accounting')}</span></span>
          <div className="grid grid-cols-6 gap-1.5">
            {c.months.map((m: any) => {
              const on = sel?.key === c.key && sel?.period === m.period;
              const tone = m.state === 'POSTED' ? 'bg-success/70' : m.state === 'BLOCKED' ? 'bg-warn' : 'bg-primary';
              return (
                <button key={m.period} type="button" onClick={() => onSelect(c.key, m.period)} title={`${aed(m.debit, lang)} / ${aed(m.credit, lang)}`}
                  className={`rounded-lg border px-2 py-1.5 text-start transition-colors ${on ? 'border-primary bg-primary/5' : 'border-border/50 hover:border-primary/40'}`}>
                  <span className="flex items-baseline justify-between text-[11px]"><span className="font-medium">{mon(m.period, lang)}</span><span className={m.mapped < 1 ? 'text-warn' : 'text-muted-foreground'}>{Math.floor(m.mapped * 100)}% {t('mapped')}</span></span>
                  <span className="relative mt-1 block h-2.5 rounded-full bg-muted/70">
                    <span className={`absolute inset-y-0 start-0 rounded-full transition-[width] duration-700 ${tone}`} style={{ width: `${(m.debit / max) * 100}%` }} />
                    <span className="absolute -inset-y-0.5 w-0.5 rounded bg-foreground/80" style={{ insetInlineStart: `${(m.credit / max) * 100}%` }} />
                  </span>
                  <span className="mt-0.5 block text-[10px] text-muted-foreground">{t(m.state === 'POSTED' ? 'Posted' : m.state === 'BLOCKED' ? 'Does not balance' : 'To post')}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <p className="pt-1 text-[11px] text-muted-foreground">{t('Bar: debit. Tick: credit. A month posts only when they meet and every line has an account.')}</p>
    </div>
  );
}

export function PayrollJournals() {
  const { t, bi, lang } = useLang();
  const { openCase } = useApp();
  const { data: all } = useApi<any>('/payroll/journals', { poll: 15000 });
  const clients: any[] = (all?.clients ?? []).filter((c: any) => c.months.length);
  const waiting = clients.flatMap((c) => c.months.filter((m: any) => m.state !== 'POSTED').map((m: any) => ({ c, m })));
  const [sel, setSel] = useState<{ key: string; period: string } | null>(null);
  const first = waiting[0];
  useEffect(() => { if (!sel && clients.length) setSel(first ? { key: first.c.key, period: first.m.period } : { key: clients[0].key, period: clients[0].months.at(-1).period }); }, [clients.length, first?.m.period]);
  const { data } = useApi<any>(sel ? `/payroll/journals/${sel.key}/${sel.period}` : null, { poll: 15000 });
  const [tab, setTab] = useState('ACCRUAL');
  const j = data?.journals?.find((x: any) => x.kind === tab) ?? data?.journals?.[0];
  const month = (pn: string) => new Date(`${pn}-01T00:00:00Z`).toLocaleString(lang === 'ar' ? 'ar' : 'en-GB', { month: 'long', timeZone: 'UTC' });
  const blockedFirst = first && first.m.state === 'BLOCKED';
  const title = first
    ? (blockedFirst ? `${bi(first.c.short, first.c.name_ar)}${t('’s')} ${month(first.m.period)} ${t('accrual waits for one account before it balances')}` : `${waiting.length} ${t(waiting.length === 1 ? 'paid month waits to post to its ledger' : 'paid months wait to post to their ledgers')}`)
    : t('Every paid month is posted to its client\'s ledger');
  const download = async () => {
    if (!sel || !data) return;
    const r = await fetch(`/api/payroll/journals/${sel.key}/${sel.period}/file`, { headers: { 'x-persona': localStorage.getItem('tasama-persona') ?? '', 'x-client': sel.key } });
    const url = URL.createObjectURL(await r.blob()); const a = document.createElement('a'); a.href = url; a.download = data.file.name; a.click(); URL.revokeObjectURL(url);
  };
  const unmapped: any[] = j?.unmapped ?? [];
  const [open, setOpen] = useState<string | null>(null);
  // One row per account; the cost centres open under it.
  const groups = Object.values(((j?.lines ?? []) as any[]).reduce((m: Record<string, any>, l: any) => {
    const g = (m[l.account] ??= { account: l.account, name: l.name, name_ar: l.name_ar, debit: 0, credit: 0, lines: [] as any[] });
    g.debit += l.debit; g.credit += l.credit; g.lines.push(l); return m;
  }, {})) as any[];
  return (
    <Screen hero={<Hero tone="surface" eyebrow="Payroll" title={title}
      lede={t('Qaid builds four journals from each paid month, accrual, provisions, payment and provision use, from the client\'s own account map, and proposes an account for anything new. Nothing is posted until the payroll lead approves.')}
      actions={first?.m.case ? <Btn kind="primary" onClick={() => openCase(first.m.case, first.c.key)}>{t(blockedFirst ? 'Review the account and post' : 'Review and post')}</Btn> : undefined}
      feature={<HeroFeature label="Months to approve" value={num(waiting.length)} support={<span className="text-xs text-muted-foreground">{t(waiting.length === 1 ? 'month' : 'months')}{blockedFirst ? ` · ${t('1 does not balance')}` : ''}</span>} />} />}>
      <Panel icon={<BookOpenCheck size={16} />} title={`${clients.reduce((s, c) => s + c.months.filter((m: any) => m.state === 'POSTED').length, 0)} ${t('months posted in the last six; every posted journal balanced to the halala')}`}>
        <Bullets clients={clients} sel={sel} onSelect={(k, p) => { setSel({ key: k, period: p }); setTab('ACCRUAL'); }} />
      </Panel>
      {data && j ? (
        <Panel icon={<FileSpreadsheet size={16} />} title={unmapped.length ? `${t('The')} ${t(KIND[j.kind]).toLowerCase()} ${t('is short by')} ${aed(Math.abs(j.debit - j.credit), lang)}: ${unmapped.map((u) => t(u.name)).join(', ')} ${t('has no account')}`
          : `${bi(data.client.short, data.client.name_ar)}${t('’s')} ${month(data.period)} ${t(KIND[j.kind]).toLowerCase()}: ${aed(j.debit, lang)} ${t('debit and credit')}`}>
          <TabStrip items={data.journals.map((x: any) => ({ id: x.kind, label: KIND[x.kind] }))} value={j.kind} onChange={setTab} />
          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="min-w-0">
              {unmapped.length ? (
                <div className="mb-3 space-y-1.5">{unmapped.map((u: any) => {
                  const pr = data.proposals.find((x: any) => x.code === u.code);
                  return <div key={u.code} className="rounded-xl border border-warn/50 bg-warn/5 px-3 py-2 text-sm">
                    <span className="font-medium">{t(u.name)}</span> · {aed(u.amount, lang)} · <span className="text-muted-foreground">{t('no account in the map')}</span>
                    {pr ? <span className="block text-xs">{t('Qaid proposes')} <span className="font-mono">{pr.account}</span> {bi(pr.account_name, pr.account_name_ar)}</span> : null}
                  </div>;
                })}</div>
              ) : null}
              <Table><thead><tr><th>{t('Account')}</th><th>{t('Cost centres')}</th><th className="text-end">{t('Debit')}</th><th className="text-end">{t('Credit')}</th></tr></thead>
                <tbody>{groups.map((g) => (
                  <Fragment key={g.account}>
                    <tr className={g.lines.length > 1 ? 'cursor-pointer hover:bg-primary/5' : ''} onClick={() => g.lines.length > 1 && setOpen(open === g.account ? null : g.account)}>
                      <td className="text-sm"><span className="me-1.5 font-mono text-xs text-muted-foreground" dir="ltr">{g.account}</span>{bi(g.name, g.name_ar)}</td>
                      <td className="text-sm text-muted-foreground">{g.lines.length > 1 ? `${g.lines.length} ${t('cost centres')} ${open === g.account ? '▴' : '▾'}` : <span className="font-mono text-xs" dir="ltr">{g.lines[0].combination}</span>}</td>
                      <td className="text-end tabular-nums">{g.debit ? num(g.debit, 2) : ''}</td><td className="text-end tabular-nums">{g.credit ? num(g.credit, 2) : ''}</td></tr>
                    {open === g.account ? g.lines.map((l: any) => <tr key={l.combination} className="bg-muted/30 text-xs"><td className="ps-8">{t('cost centre')} {l.cc}</td><td className="font-mono" dir="ltr">{l.combination}</td><td className="text-end tabular-nums">{l.debit ? num(l.debit, 2) : ''}</td><td className="text-end tabular-nums">{l.credit ? num(l.credit, 2) : ''}</td></tr>) : null}
                  </Fragment>))}
                  <tr className="font-semibold"><td colSpan={2}>{t('Total')}</td><td className="text-end tabular-nums">{num(j.debit, 2)}</td><td className={`text-end tabular-nums ${Math.abs(j.debit - j.credit) > 0.005 ? 'text-danger' : ''}`}>{num(j.credit, 2)}</td></tr></tbody></Table>
            </div>
            <div className="space-y-3">
              <div className="rounded-xl glass-l3 p-3">
                <p className="text-xs text-muted-foreground">{t('Status')}</p>
                <p className="mt-0.5 text-sm font-semibold">{t(j.state === 'POSTED' ? 'Posted' : j.state === 'BLOCKED' ? 'Does not balance' : j.state === 'APPROVED' ? 'Approved' : 'To post')}</p>
                <p className="text-xs text-muted-foreground">{j.state === 'POSTED' ? `${date(j.posted_at, lang)} · ${j.import_status ?? ''}` : j.approved_by ? `${t('Approved by')} ${j.approved_by}` : t('Waiting on the payroll lead')}</p>
              </div>
              <div className="rounded-xl glass-l3 p-3">
                <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="text-sm font-semibold">{t(data.file.layout)}</p><p className="text-xs text-muted-foreground">{num(data.file.rows)} {t('rows')} {data.file.illustrative ? <Chip tone="warn">{t('Illustrative layout')}</Chip> : null}</p></div>
                  <Btn small onClick={download}><Download size={13} /> {t('Download')}</Btn></div>
                <pre dir="ltr" className="mt-2 max-h-36 overflow-auto rounded-lg bg-muted/50 p-2 font-mono text-[10px] leading-relaxed scroll-thin">{data.file.preview}</pre>
                <p className="mt-2 text-[11px] text-muted-foreground">{t('Illustrative chart of accounts until Tasama shares the client\'s own.')}</p>
              </div>
            </div>
          </div>
        </Panel>
      ) : <Empty icon={<BookOpenCheck size={18} />}>{t('Journals are built once a month\'s payment is paid.')}</Empty>}
    </Screen>
  );
}
