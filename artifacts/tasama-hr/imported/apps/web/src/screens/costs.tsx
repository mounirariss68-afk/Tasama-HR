/**
 * Payroll costs, the client's finance controller (design/payroll-addendum.md §3, §21). Read only:
 * what payroll cost by month, what the company owes in end of service and leave, and what reached the ledger.
 */
import { useEffect, useState } from 'react';
import { HeroFeature, Panel } from '@cognirise/atelier/layout';
import { BookOpenCheck, Download, Landmark, PiggyBank, Wallet } from 'lucide-react';
import { bump, downloadFile, post, useApi } from '../lib/api';
import { useLang } from '../lib/i18n';
import { aed, date, num } from '../lib/format';
import { Btn, Chip, Empty, Hero, Screen, Table } from '../app/ui';

const sarM = (n: number, lang: string) => { const v = Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : `${Math.round(n / 1e3)}K`; return lang === 'ar' ? `${v} ريال` : `SAR ${v}`; };
const mon = (pn: string, lang: string, long = false) => new Date(`${pn}-01T00:00:00Z`).toLocaleString(lang === 'ar' ? 'ar' : 'en-GB', { month: long ? 'long' : 'short', timeZone: 'UTC' });
const useCosts = () => useApi<any>('/costs', { poll: 30000 });

/** Net pay and the employer's contributions stacked by month: the cost of payroll to the company. */
function StackedMonths({ months }: { months: any[] }) {
  const { t, lang } = useLang();
  const max = Math.max(1, ...months.map((m) => m.net + m.employer + (m.gross - m.net)));
  const chg = (m: any) => { const i = months.indexOf(m); if (!i) return null; const a = months[i - 1].gross + months[i - 1].employer; return ((m.gross + m.employer - a) / a) * 100; };
  return (
    <div>
      <div className="flex h-56 items-end gap-3">
        {months.map((m) => {
          const ded = m.gross - m.net, tot = m.gross + m.employer;
          return (
            <div key={m.period_name} className="flex h-full flex-1 flex-col justify-end" title={`${mon(m.period_name, lang)}: ${aed(tot, lang)}`}>
              <span className="text-center text-[11px] font-medium tabular-nums">{sarM(tot, lang)}</span>
              <span className={`mb-1 text-center text-[10px] tabular-nums ${chg(m) == null ? 'text-transparent' : chg(m)! > 0.5 ? 'text-warn' : 'text-muted-foreground'}`}>{chg(m) == null ? '·' : `${chg(m)! >= 0 ? '+' : '−'}${Math.abs(chg(m)!).toFixed(1)}%`}</span>
              <div className="flex flex-col overflow-hidden rounded-t-md transition-[height] duration-700" style={{ height: `${(tot / max) * 100}%` }}>
                <div className="bg-chart-3/70" style={{ flex: m.employer }} />
                <div className="bg-primary/40" style={{ flex: ded }} />
                <div className={m.status === 'OPEN' ? 'bg-primary/60' : 'bg-primary'} style={{ flex: m.net }} />
              </div>
              <span className="mt-1 text-center text-[11px] text-muted-foreground">{mon(m.period_name, lang)}{m.status === 'OPEN' ? ` · ${t('approved, not yet paid')}` : ''}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-primary" />{t('Net pay')}</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-primary/40" />{t('Deductions (GOSI, advances)')}</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-chart-3/70" />{t('Employer contributions')}</span>
      </div>
    </div>
  );
}

export function CostsReports() {
  const { t, bi, lang } = useLang();
  const { data } = useCosts();
  const months: any[] = (data?.months ?? []).filter((m: any) => m.status === 'CLOSED' || m.people);
  const last = [...months].reverse().find((m) => m.status === 'CLOSED');
  const prev = last ? months[months.indexOf(last) - 1] : null;
  const cost = (m: any) => m.gross + m.employer;
  const change = last && prev ? ((cost(last) - cost(prev)) / cost(prev)) * 100 : 0;
  return (
    <Screen hero={<Hero tone="surface" eyebrow="Payroll costs"
      title={last ? `${bi(data.client.short, data.client.name_ar)}${t('’s')} ${mon(last.period_name, lang, true)} ${t('payroll cost')} ${sarM(cost(last), lang)}, ${change >= 0 ? t('up') : t('down')} ${Math.abs(change).toFixed(1)}% ${t('on the month before')}` : t('Payroll costs')}
      lede={t('Gross pay plus the employer\'s GOSI contributions, as approved by your HR operations and paid. Figures are the approved runs, not estimates.')}
      feature={last ? <HeroFeature label="Employees paid" value={num(last.people)} support={<span className="text-xs text-muted-foreground">{t('net')} {sarM(last.net, lang)}</span>} /> : undefined} />}>
      {months.length ? (
        <>
          <Panel icon={<Wallet size={16} />} title={`${t('Employer contributions add')} ${last ? ((last.employer / last.gross) * 100).toFixed(1) : '—'}% ${t('to gross pay each month')}`}><StackedMonths months={months} /></Panel>
          <Panel icon={<Wallet size={16} />} title={`${months.filter((m) => m.status === 'CLOSED').length} ${t('months approved and paid')}`}
            action={<Btn small onClick={() => downloadFile('/api/costs/reports.xlsx').catch(() => undefined)}><Download size={13} /> {t('Download as Excel')}</Btn>}>
            <Table><thead><tr><th>{t('Month')}</th><th className="text-end">{t('Employees')}</th><th className="text-end">{t('Gross')}</th><th className="text-end">{t('Net pay')}</th><th className="text-end">{t('Employer contributions')}</th><th className="text-end">{t('Cost to the company')}</th></tr></thead>
              <tbody>{[...months].reverse().map((m) => (
                <tr key={m.period_name}><td className="text-sm">{mon(m.period_name, lang, true)} {m.period_name.slice(0, 4)}{m.status === 'OPEN' ? <span className="ms-2"><Chip tone="primary">{t('Approved, not yet paid')}</Chip></span> : null}</td>
                  <td className="text-end tabular-nums">{num(m.people)}</td><td className="text-end tabular-nums">{num(m.gross, 2)}</td><td className="text-end tabular-nums">{num(m.net, 2)}</td>
                  <td className="text-end tabular-nums">{num(m.employer, 2)}</td><td className="text-end font-medium tabular-nums">{num(cost(m), 2)}</td></tr>))}</tbody></Table>
          </Panel>
        </>
      ) : <Empty>{t('No approved run yet.')}</Empty>}
    </Screen>
  );
}

/** Each balance across the months, with the first and last labelled: the slope finance books against. */
function BalanceSlopes({ months }: { months: any[] }) {
  const { t, lang } = useLang();
  const W = 640, H = 220, pad = 56;
  const series = [{ key: 'eos', label: t('End of service owed'), cls: 'stroke-primary', dot: 'fill-primary' }, { key: 'leave', label: t('Leave owed'), cls: 'stroke-chart-3', dot: 'fill-chart-3' }];
  const max = Math.max(1, ...months.flatMap((m) => [m.eos, m.leave])) * 1.08;
  const x = (i: number) => pad + (i * (W - 2 * pad)) / Math.max(1, months.length - 1);
  const y = (v: number) => H - 24 - (v / max) * (H - 48);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-64 w-full" role="img" aria-label={t('End of service and leave owed by month')}>
      {months.map((m, i) => <text key={m.period_name} x={x(i)} y={H - 6} textAnchor="middle" className="fill-muted-foreground text-[11px]">{mon(m.period_name, lang)}</text>)}
      {series.map((s) => {
        const pts = months.map((m, i) => `${x(i)},${y(m[s.key])}`).join(' ');
        const a = months[0], b = months.at(-1);
        return (
          <g key={s.key}>
            <polyline points={pts} fill="none" className={`${s.cls} opacity-30`} strokeWidth={1.5} strokeDasharray="3 4" />
            <line x1={x(0)} y1={y(a[s.key])} x2={x(months.length - 1)} y2={y(b[s.key])} className={s.cls} strokeWidth={3} strokeLinecap="round" />
            {months.map((m, i) => <circle key={i} cx={x(i)} cy={y(m[s.key])} r={i === 0 || i === months.length - 1 ? 5 : 2.5} className={s.dot} />)}
            <text x={x(0) - 8} y={y(a[s.key]) + 4} textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">{sarM(a[s.key], lang)}</text>
            <text x={x(months.length - 1) + 8} y={y(b[s.key]) + 4} className="fill-foreground text-[12px] font-semibold tabular-nums">{sarM(b[s.key], lang)}</text>
          </g>
        );
      })}
      {series.map((s, i) => <g key={s.key} transform={`translate(${pad + i * 170}, 12)`}><rect width="10" height="10" rx="2" className={s.dot} /><text x="16" y="9" className="fill-muted-foreground text-[11px]">{s.label}</text></g>)}
    </svg>
  );
}

export function CostsProvisions() {
  const { t, lang } = useLang();
  const { data } = useCosts();
  const months: any[] = (data?.months ?? []).filter((m: any) => m.status === 'CLOSED');
  const a = months[0], b = months.at(-1);
  return (
    <Screen hero={<Hero tone="surface" eyebrow="Payroll costs"
      title={b ? `${t('End of service owed reaches')} ${sarM(b.eos, lang)} ${t('at the end of')} ${mon(b.period_name, lang, true)}, ${t('up')} ${sarM(b.eos - a.eos, lang)} ${t('in')} ${months.length - 1} ${t('months')}` : t('Provisions')}
      lede={t('What the company owes its employees today if everyone left: end of service under Art. 84, and unused leave at a day\'s wage. Each month\'s charge is the change in the balance, booked in the provisions journal.')}
      feature={b ? <HeroFeature label="Leave owed" value={sarM(b.leave, lang)} support={<span className="text-xs text-muted-foreground">{t('this month')} {b.leave_month >= 0 ? '+' : '−'}{sarM(Math.abs(b.leave_month), lang)}</span>} /> : undefined} />}>
      {months.length > 1 ? (
        <>
          <Panel icon={<PiggyBank size={16} />} title={`${t('End of service grows by about')} ${sarM((b.eos - a.eos) / (months.length - 1), lang)} ${t('a month; leave owed moves with the leave taken')}`}><BalanceSlopes months={months} /></Panel>
          <Panel icon={<PiggyBank size={16} />} title={`${t('This month\'s charge is')} ${sarM(b.eos_month + b.leave_month, lang)}`}>
            <Table><thead><tr><th>{t('Month')}</th><th className="text-end">{t('End of service owed')}</th><th className="text-end">{t('Charge')}</th><th className="text-end">{t('Leave owed')}</th><th className="text-end">{t('Charge')}</th></tr></thead>
              <tbody>{[...months].reverse().map((m) => <tr key={m.period_name}><td className="text-sm">{mon(m.period_name, lang, true)} {m.period_name.slice(0, 4)}</td><td className="text-end tabular-nums">{num(m.eos, 2)}</td><td className="text-end tabular-nums text-muted-foreground">{num(m.eos_month, 2)}</td><td className="text-end tabular-nums">{num(m.leave, 2)}</td><td className="text-end tabular-nums text-muted-foreground">{num(m.leave_month, 2)}</td></tr>)}</tbody></Table>
          </Panel>
        </>
      ) : <Empty>{t('Provisions start with the first paid month.')}</Empty>}
    </Screen>
  );
}

const KIND: Record<string, string> = { ACCRUAL: 'Payroll accrual', PROVISIONS: 'Provisions', PAYMENT: 'Payment', PROVISION_USE: 'Provision use' };

export function CostsJournals() {
  const { t, bi, lang } = useLang();
  const { data } = useCosts();
  const months: any[] = data?.journals ?? [];
  const posted = months.filter((m) => m.journals.every((j: any) => j.state === 'POSTED'));
  const waiting = months.filter((m) => !m.journals.every((j: any) => j.state === 'POSTED'));
  const ledger = data?.client.ledger === 'ORACLE_FIN' ? 'Oracle Finance' : 'Odoo Accounting';
  const max = Math.max(1, ...months.flatMap((m) => m.journals.map((j: any) => j.amount)));
  const download = async (pn: string) => {
    const r = await fetch(`/api/costs/journals/${pn}/file`, { headers: { 'x-persona': localStorage.getItem('tasama-persona') ?? '', 'x-client': localStorage.getItem('tasama-client') ?? '' } });
    const name = (r.headers.get('content-disposition') ?? '').match(/filename="([^"]+)"/)?.[1] ?? 'journals';
    const url = URL.createObjectURL(await r.blob()); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
  };
  return (
    <Screen hero={<Hero tone="surface" eyebrow="Payroll costs"
      title={waiting.length ? `${mon(waiting[0].period, lang, true)}${t('’s journals are with Tasama for approval; the other')} ${posted.length} ${t('months are in')} ${t(ledger)}` : `${t('Every paid month is in')} ${t(ledger)}: ${posted.length} ${t('months, every journal balanced')}`}
      lede={t('Tasama posts four journals for each paid month from your account map. A new pay element gets an account once, approved by Tasama\'s payroll lead, and is mapped from then on.')}
      feature={<HeroFeature label="Posted" value={num(posted.length)} support={<span className="text-xs text-muted-foreground">{t('months')} · {t(ledger)}</span>} />} />}>
      {months.length ? (
        <Panel icon={<BookOpenCheck size={16} />} title={t('The accrual is the month\'s full cost; the payment is what the bank paid out')}>
          <div className="space-y-3">{[...months].reverse().map((m) => {
            const done = m.journals.every((j: any) => j.state === 'POSTED');
            return (
              <div key={m.period} className="grid items-center gap-3 rounded-xl border border-border/50 px-3 py-2.5 md:grid-cols-[9rem_minmax(0,1fr)_12rem]">
                <div><p className="text-sm font-semibold">{mon(m.period, lang, true)} {m.period.slice(0, 4)}</p><p className="text-xs text-muted-foreground">{done ? `${t('Posted')} ${date(m.journals[0].posted, lang)}` : t('With Tasama for approval')}</p></div>
                <div className="space-y-1">{m.journals.map((j: any) => (
                  <div key={j.kind} className="flex items-center gap-2 text-xs">
                    <span className="w-28 shrink-0 text-muted-foreground">{t(KIND[j.kind])}</span>
                    <span className="h-2 flex-1 rounded-full bg-muted/60"><span className={`block h-full rounded-full ${j.state === 'POSTED' ? 'bg-success/70' : j.state === 'BLOCKED' ? 'bg-warn' : 'bg-primary'}`} style={{ width: `${(j.amount / max) * 100}%` }} /></span>
                    <span className="w-24 shrink-0 text-end tabular-nums">{sarM(j.amount, lang)}</span>
                  </div>))}</div>
                <div className="flex items-center justify-end gap-2">{done ? <Btn small onClick={() => download(m.period)}><Download size={13} /> {t('Import file')}</Btn> : <Chip tone="warn">{t('Not posted yet')}</Chip>}</div>
              </div>
            );
          })}</div>
          <p className="mt-3 text-xs text-muted-foreground">{bi(data.client.short, data.client.name_ar)} · {t('illustrative chart of accounts until Tasama has your own')}</p>
        </Panel>
      ) : <Empty>{t('Journals are posted once a month is paid.')}</Empty>}
    </Screen>
  );
}

/**
 * Payroll costs › Payments (design/payroll-ops-addendum.md §2): no bank is connected, so the finance
 * controller approves Tasama's file in the bank portal and records that approval here, with the value date.
 */
export function CostsPayments() {
  const { t, bi, lang } = useLang();
  const { data, reload } = useApi<any>('/costs/payments', { poll: 15000 });
  const [vd, setVd] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const w = data?.waiting?.[0] ?? null;
  useEffect(() => { if (w) setVd(w.value_date); }, [w?.id]);
  const recent: any[] = data?.recent ?? [];
  const approve = async () => {
    setBusy(true); setErr(null);
    try { await post(`/costs/payments/${w.id}/approved`, { value_date: vd }); bump(); reload(); }
    catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  };
  const days = w ? Math.ceil((Date.parse(`${w.value_date}T00:00:00Z`) - Date.now()) / 864e5) : 0;
  const steps: [string, string, boolean, boolean][] = w ? [
    [t('Tasama uploaded it to the portal'), `${w.sent_by ?? ''}${w.sent_at ? ` · ${date(w.sent_at, lang)}` : ''}`, true, false],
    [t('You approve it in the bank'), `${bi(w.bank, w.bank_ar)} · ${t('value date')} ${date(w.value_date, lang)}`, false, true],
    [t('Tasama confirms what was paid'), t('From the bank’s return file and the signed WPS file'), false, false],
  ] : [];
  return (
    <Screen hero={<Hero tone="surface" eyebrow="Payroll costs"
      title={w ? `${mon(w.period, lang, true)}${t('’s payroll file waits for your approval in')} ${bi(w.bank, w.bank_ar)}: ${aed(w.total, lang)} ${t('to')} ${num(w.lines)} ${t('employees')}` : data ? t('Every payroll file Tasama uploaded is approved in the bank') : t('Payments')}
      lede={t('Tasama uploads each approved run to your bank portal. You give the bank approvals and set the value date there, then record it here so Tasama can confirm what was paid.')}
      feature={w ? <HeroFeature label="Value date" value={days <= 0 ? t('Today') : `${days} ${t(days === 1 ? 'day' : 'days')}`} support={<span className="text-xs text-muted-foreground">{date(w.value_date, lang)}</span>} /> : undefined} />}>
      {w ? (
        <Panel icon={<Landmark size={16} />} title={`${t('The file passes all')} ${w.checks} ${t('release checks; Tasama uploaded it, and only your approval in the bank pays it')}`}>
          <ol className="grid gap-3 md:grid-cols-3">{steps.map(([k, sub, done, now]) => (
            <li key={k} className={`rounded-xl border p-3 ${now ? 'border-primary bg-primary/5' : 'border-border/60'}`}>
              <span className={`block h-1.5 rounded-full ${done ? 'bg-success' : now ? 'bg-primary' : 'bg-muted'}`} />
              <p className="mt-2 text-sm font-semibold">{k}</p>
              <p className="text-xs text-muted-foreground">{sub}</p>
            </li>))}</ol>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="text-sm"><span className="block text-xs text-muted-foreground">{t('Value date you set in the bank')}</span>
              <input type="date" className="input mt-1 h-10 w-48 text-sm" value={vd} onChange={(e) => setVd(e.target.value)} /></label>
            <Btn kind="primary" onClick={approve} disabled={busy}>{busy ? t('Working…') : t('Approved in the bank')}</Btn>
            <span className="text-xs text-muted-foreground">{w.file}</span>
          </div>
          {err ? <p className="mt-2 text-sm text-danger">{err}</p> : null}
        </Panel>
      ) : null}
      <Panel icon={<Landmark size={16} />} title={recent.length ? `${recent.filter((r) => r.paid).length} ${t('of the last')} ${recent.length} ${t('files are paid and confirmed by the bank')}` : t('No file approved yet')}>
        {recent.length ? (
          <Table><thead><tr><th>{t('Month')}</th><th className="text-end">{t('Amount')}</th><th>{t('Approved in the bank')}</th><th>{t('Value date')}</th><th>{t('Paid')}</th><th>WPS</th><th>Mudad</th></tr></thead>
            <tbody>{recent.map((r) => (
              <tr key={r.id}>
                <td className="text-sm">{mon(r.period, lang, true)} {r.period.slice(0, 4)}{r.kind === 'FOLLOW_UP' ? <span className="ms-2"><Chip>{t('Follow-up')}</Chip></span> : null}</td>
                <td className="text-end tabular-nums">{num(r.total, 2)}</td>
                <td className="text-sm">{r.approved_by ?? '—'}</td>
                <td className="text-sm">{date(r.value_date, lang)}</td>
                <td>{r.paid ? <Chip tone={r.failed ? 'warn' : 'success'}>{r.failed ? `${r.failed} ${t('returned')}` : t('Paid')}</Chip> : <Chip>{t('Waiting for the bank')}</Chip>}</td>
                <td>{r.wps === 'ACCEPTED' ? <Chip tone="success">{t('Matches')}</Chip> : <Chip>{t('Not yet')}</Chip>}</td>
                <td>{r.mudad === 'ACKNOWLEDGED' ? <Chip tone="success">{t('Acknowledged')}</Chip> : r.mudad === 'UPLOADED' ? <Chip tone="primary">{t('Uploaded')}</Chip> : <Chip>{t('Not yet')}</Chip>}</td>
              </tr>))}</tbody></Table>
        ) : <Empty>{t('Nothing approved yet.')}</Empty>}
      </Panel>
    </Screen>
  );
}
