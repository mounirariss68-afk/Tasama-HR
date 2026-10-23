/**
 * Payroll › Payments (design/payroll-addendum.md §3, §20): every approved run leaves as the paying
 * bank's file and a WPS file, and each line is followed until the bank, WPS and Mudad accept it.
 */
import { useEffect, useState } from 'react';
import { HeroFeature, Panel } from '@cognirise/atelier/layout';
import { CheckCircle2, Download, FileText, Landmark, XCircle } from 'lucide-react';
import { useApi } from '../lib/api';
import { useLang } from '../lib/i18n';
import { aed, date, num } from '../lib/format';
import { useApp } from '../app/state';
import { Btn, Chip, Empty, Hero, Screen, TabStrip, Table } from '../app/ui';

const sarK = (n: number) => (Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : Math.abs(n) >= 1e4 ? `${Math.round(n / 1e3)}K` : num(n));
const STAGES = ['Approved run', 'Sent', 'Bank approval', 'Paid', 'Accepted in WPS'] as const;

/** How far a client's month has gone, as line counts per stage: the funnel. */
function stagesOf(c: any): number[] {
  const reg = (c.payments ?? []).filter((p: any) => p.kind === 'REGULAR');
  const lines = c.approved?.people ?? 0;
  const at = (ok: (p: any) => boolean) => reg.filter(ok).reduce((s: number, p: any) => s + p.lines, 0);
  const paid = (c.payments ?? []).reduce((s: number, p: any) => s + (p.paid ?? 0), 0);
  return [lines, at((p) => ['SENT', 'APPROVED', 'PAID', 'PART_FAILED'].includes(p.state)), at((p) => ['APPROVED', 'PAID', 'PART_FAILED'].includes(p.state)), paid, at((p) => p.wps === 'ACCEPTED')];
}

function Funnel({ clients, selected, onSelect }: { clients: any[]; selected: string | null; onSelect: (k: string) => void }) {
  const { t, bi, lang } = useLang();
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-[11rem_repeat(5,minmax(0,1fr))_6.5rem] gap-1.5 px-2 text-[11px] uppercase tracking-wider text-muted-foreground">
        <span />{STAGES.map((s) => <span key={s} className="truncate">{t(s)}</span>)}<span className="text-end">{t('Last 6 months')}</span>
      </div>
      {clients.map((c) => {
        const st = stagesOf(c), max = Math.max(1, st[0]);
        const failed = (c.payments ?? []).reduce((s: number, p: any) => s + (p.failed ?? 0), 0);
        return (
          <button key={c.key} type="button" onClick={() => onSelect(c.key)}
            className={`grid w-full grid-cols-[11rem_repeat(5,minmax(0,1fr))_6.5rem] items-center gap-1.5 rounded-xl border px-2 py-2 text-start transition-colors ${selected === c.key ? 'border-primary bg-primary/5' : 'border-transparent hover:border-primary/30'}`}>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{bi(c.short, c.name_ar)}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{bi(c.bank.name, c.bank.name_ar)} · {t('pays')} {c.valueDate ? date(c.valueDate, lang).split(' ').slice(0, 2).join(' ') : '—'}</span>
            </span>
            {c.approved ? st.map((n, i) => (
              <span key={i} className="relative h-7 overflow-hidden rounded-md bg-muted/60">
                <span className={`absolute inset-y-0 start-0 rounded-md transition-[width] duration-700 ${i === 3 && failed ? 'bg-warn' : i === 0 ? 'bg-primary/35' : 'bg-primary'}`} style={{ width: `${(n / max) * 100}%` }} />
                <span className={`relative flex h-full items-center px-2 text-xs font-medium tabular-nums ${n / max > 0.45 && i > 0 ? 'text-primary-foreground' : ''}`}>{n ? num(n) : '—'}{i === 3 && failed ? ` · ${failed} ${t('failed')}` : ''}</span>
              </span>
            )) : <span className="col-span-5 text-xs text-muted-foreground">{c.run ? t(c.run.state === 'VALIDATED' ? 'With the client for approval' : c.run.state === 'PREPARED' ? 'Waiting for validation' : 'Run being prepared') : t('Run not started')} · {t('pay day')} {c.pay ? date(c.pay, lang).split(' ').slice(0, 2).join(' ') : '—'}</span>}
            <span className="flex justify-end gap-0.5" title={t('Paid, accepted in WPS and acknowledged by Mudad')}>
              {[...c.history].reverse().map((h: any) => <span key={h.period} className={`h-4 w-3 rounded-sm ${h.state === 'PAID' && h.wps === 'ACCEPTED' && h.mudad === 'ACKNOWLEDGED' ? 'bg-success/70' : h.state === 'PART_FAILED' ? 'bg-warn' : 'bg-muted'}`} />)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function FilePane({ f, href, client }: { f: any; href: string; client: string }) {
  const { t, bi } = useLang();
  const download = async () => {
    const r = await fetch(href, { headers: { 'x-persona': localStorage.getItem('tasama-persona') ?? '', 'x-client': client } });
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement('a'); a.href = url; a.download = f.name; a.click(); URL.revokeObjectURL(url);
  };
  return (
    <div className="min-w-0 rounded-xl glass-l3 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{bi(f.format, f.format_ar)}</p>
          <p className="text-xs text-muted-foreground">{num(f.lines)} {t('rows')}{f.illustrative ? ` · ` : ''}{f.illustrative ? <Chip tone="warn">{t('Illustrative layout')}</Chip> : null}</p>
        </div>
        <Btn small onClick={download}><Download size={13} /> {t('Download')}</Btn>
      </div>
      <pre dir="ltr" className="mt-2 max-h-40 overflow-auto rounded-lg bg-muted/50 p-2 font-mono text-[10.5px] leading-relaxed scroll-thin">{f.preview}</pre>
      <p className="mt-2 text-[11px] text-muted-foreground">{t(f.basis)}</p>
    </div>
  );
}

/** When each stage happened, as the bank, WPS and Mudad reported it. */
function Timeline({ p, counts, followUps }: { p: any; counts: any; followUps: any[] }) {
  const { t, lang } = useLang();
  const fu = followUps[0];
  const steps: [string, string | null, string, 'success' | 'warn' | 'muted'][] = [
    [t('Sent'), p.sent_at, t(p.sent_by ?? ''), p.sent_at ? 'success' : 'muted'],
    [t('Approved in the bank'), p.approved_at, t(p.approved_by ?? ''), p.approved_at ? 'success' : 'muted'],
    [t('Feedback file'), p.feedback_at, p.feedback_at ? `${num(counts?.paid ?? 0)} ${t('paid')}${(counts?.failed ?? 0) + (counts?.repaid ?? 0) ? `, ${(counts?.failed ?? 0) + (counts?.repaid ?? 0)} ${t('returned')}` : ''}` : '', p.feedback_at ? ((counts?.failed ?? 0) ? 'warn' : 'success') : 'muted'],
    ...(fu ? [[t('Follow-up'), fu.state === 'PAID' ? fu.valueDate : null, `${fu.lines} ${t('line')} · ${aed(fu.total, lang)} · ${t(fu.state === 'PAID' ? 'paid' : fu.state === 'BUILT' ? 'to send' : 'in the bank')}`, fu.state === 'PAID' ? 'success' : 'warn'] as [string, string | null, string, 'success' | 'warn' | 'muted']] : []),
    [t('Signed WPS file'), p.wps_at, p.wps_state === 'ACCEPTED' ? t('matches what was paid') : '', p.wps_at ? 'success' : 'muted'],
    [t('Mudad'), p.mudad_at, p.mudad_state === 'ACKNOWLEDGED' ? t('acknowledged') : '', p.mudad_state === 'ACKNOWLEDGED' ? 'success' : 'muted'],
  ];
  return (
    <ol className="mb-4 grid gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
      {steps.map(([k, at, who, tone], i) => (
        <li key={i} className="min-w-0">
          <span className={`block h-1.5 rounded-full ${tone === 'success' ? 'bg-success' : tone === 'warn' ? 'bg-warn' : 'bg-muted'}`} />
          <span className="mt-1.5 block truncate text-xs font-semibold">{k}</span>
          <span className="block truncate text-[11px] text-muted-foreground">{at ? date(at, lang).split(' ').slice(0, 2).join(' ') : t('Not yet')}{who ? ` · ${who}` : ''}</span>
        </li>))}
    </ol>
  );
}

export function PayrollPayments() {
  const { t, bi, lang } = useLang();
  const { route, openCase } = useApp();
  const { data: all } = useApi<any>('/payroll/payments', { poll: 15000 });
  const clients: any[] = all?.clients ?? [];
  const [key, setKey] = useState<string | null>(route.param);
  useEffect(() => { if (route.param) setKey(route.param); }, [route.param]);
  const withPay = clients.filter((c) => c.payments.length);
  const current = key ?? withPay[0]?.key ?? clients[0]?.key ?? null;
  const cl = clients.find((c) => c.key === current);
  const pay = cl ? [...cl.payments].filter((x: any) => x.kind === 'REGULAR').reverse()[0] ?? null : null;
  const { data } = useApi<any>(cl && pay ? `/payroll/payments/${cl.key}/${pay.id}` : null, { poll: 15000 });
  const [tab, setTab] = useState('checks');

  const toSend = clients.flatMap((c) => c.payments.filter((p: any) => p.step === 'send' && p.case_status === 'WAITING').map((p: any) => ({ c, p })));
  const unpaid = clients.reduce((s, c) => s + (c.approved ? c.approved.people - c.payments.reduce((n: number, p: any) => n + (p.paid ?? 0), 0) : 0), 0);
  const failed = clients.reduce((s, c) => s + c.payments.reduce((n: number, p: any) => n + (p.failed ?? 0), 0), 0);
  const first = toSend[0];
  const title = first?.p.kind === 'FOLLOW_UP'
    ? `${bi(first.c.short, first.c.name_ar)}${t('’s follow-up file is ready to send:')} ${aed(first.p.total, lang)} ${t(first.p.lines === 1 ? 'for one returned salary' : 'for the returned salaries')}`
    : first
    ? `${bi(first.c.short, first.c.name_ar)}${t('’s bank file is ready to send:')} ${lang === 'ar' ? `${sarK(first.p.total)} ريال` : `SAR ${sarK(first.p.total)}`} ${t('to')} ${num(first.p.lines)} ${t('employees on')} ${date(first.p.valueDate, lang).split(' ').slice(0, 2).join(' ')}`
    : failed ? `${failed} ${t(failed === 1 ? 'payment failed and waits for a corrected IBAN' : 'payments failed and wait for corrected IBANs')}`
    : unpaid ? `${num(unpaid)} ${t('employees in approved runs are not paid yet')}` : t('Every approved run is paid and accepted in WPS');
  const checks: any[] = data?.payment?.checks ?? [];
  const lines: any[] = data?.lines ?? [];
  const bad = checks.filter((k) => !k.ok);
  const p = data?.payment;
  const returnedN = (data?.counts?.failed ?? 0) + (data?.counts?.repaid ?? 0);
  const [allLines, setAllLines] = useState(false);
  // A month with a returned salary opens on its lines, the returned one first.
  useEffect(() => { if (returnedN) setTab('lines'); }, [returnedN, p?.id]);
  const STATE: Record<string, string> = { BUILT: 'Built, not sent', SENT: 'In the bank portal', APPROVED: 'Approved in the bank', PAID: 'Paid', PART_FAILED: 'Paid, some lines failed' };

  return (
    <Screen hero={<Hero tone="surface" eyebrow="Payroll" title={title}
      lede={t('Tahweel writes each approved run in the paying bank\'s format and as a WPS file, checks both before release, and follows every line. Tasama sends the file; the client\'s finance approves it in the bank.')}
      actions={first ? <Btn kind="primary" onClick={() => openCase(first.p.ref, first.c.key)}>{t('Review and send the file')}</Btn> : undefined}
      feature={<HeroFeature label="Not yet paid" value={num(unpaid)} support={<span className="text-xs text-muted-foreground">{t('employees in approved runs')}{failed ? ` · ${failed} ${t('failed')}` : ''}</span>} />} />}>
      <Panel icon={<Landmark size={16} />} title={withPay.length ? `${withPay.length} ${t(withPay.length === 1 ? 'client has a payment this month' : 'clients have a payment this month')}; ${clients.length - withPay.length} ${t('still before approval')}` : t('No run is approved yet this month')}>
        <Funnel clients={clients} selected={current} onSelect={(k) => { setKey(k); setTab('checks'); }} />
      </Panel>
      {cl && p ? (
        <Panel icon={<FileText size={16} />} title={tab === 'files' ? (data.match.ok ? `${t('The WPS file matches the bank file on all')} ${num(data.match.lines)} ${t('lines and in total')}` : `${data.match.differ.length} ${t('lines differ between the bank file and the WPS file')}`)
          : tab === 'lines' ? (lines.some((l) => l.status === 'FAILED') ? `${lines.filter((l) => l.status === 'FAILED').length} ${t('of')} ${num(lines.length)} ${t('salaries came back and wait for a new IBAN')}` : lines.some((l) => l.status === 'REPAID') ? `${t('All')} ${num(lines.length)} ${t('salaries are paid, one of them again in a follow-up file')}` : `${num(lines.length)} ${t('lines')}, ${t(STATE[p.state] ?? p.state).toLowerCase()}`)
          : tab === 'checks' && returnedN ? `${returnedN} ${t('of')} ${num(p.lines)} ${t(returnedN === 1 ? 'salaries came back from the bank; the rest are paid' : 'salaries came back from the bank; the rest are paid')}`
          : bad.length ? `${bi(cl.short, cl.name_ar)}${t('’s file is held:')} ${bad.length} ${t(bad.length === 1 ? 'release check fails' : 'release checks fail')}` : `${bi(cl.short, cl.name_ar)}${t('’s file passes all')} ${checks.length} ${t('release checks')}`}>
          <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
            <span><span className="text-muted-foreground">{t('Total')} </span><span className="font-semibold tabular-nums">{aed(p.total, lang)}</span></span>
            <span><span className="text-muted-foreground">{t('Value date')} </span><span className="font-semibold">{date(p.value_date, lang)}</span></span>
            <span><span className="text-muted-foreground">{t('Stage')} </span><Chip tone={p.state === 'PAID' ? 'success' : p.state === 'PART_FAILED' ? 'warn' : 'primary'}>{t(STATE[p.state] ?? p.state)}</Chip></span>
          </div>
          <Timeline p={p} counts={data.counts ?? {}} followUps={data.followUps ?? []} />
          <TabStrip items={[{ id: 'checks', label: 'Release checks' }, { id: 'files', label: 'Bank file and WPS file' }, { id: 'lines', label: 'Lines' }]} value={tab} onChange={setTab} />
          <div className="mt-4">
            {tab === 'checks' ? (
              <ul className="space-y-2">{checks.map((k) => (
                <li key={k.key} className="flex items-start gap-2.5 rounded-lg px-1 py-1">
                  {k.ok ? <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-success" /> : <XCircle size={17} className="mt-0.5 shrink-0 text-danger" />}
                  <span className="text-sm">{bi(k.text, k.text_ar)}</span>
                </li>))}</ul>
            ) : tab === 'files' ? (
              <div className="grid gap-3 lg:grid-cols-2">
                <FilePane f={data.bank} client={cl.key} href={`/api/payroll/payments/${cl.key}/${p.id}/file/bank`} />
                <FilePane f={data.wps} client={cl.key} href={`/api/payroll/payments/${cl.key}/${p.id}/file/wps`} />
              </div>
            ) : (
              <Table><thead><tr><th>{t('Employee')}</th><th>{t('Bank')}</th><th>IBAN</th><th className="text-end">{t('Amount')}</th><th>{t('Status')}</th></tr></thead>
                <tbody>{lines.slice(0, allLines ? 999 : 12).map((l) => (
                  <tr key={l.person_id}>
                    <td className="text-sm font-medium">{bi(l.name, l.name_ar)}</td>
                    <td className="text-sm">{bi(l.bank, l.bank_ar)}</td>
                    <td className="font-mono text-xs" dir="ltr">{l.iban}</td>
                    <td className="text-end tabular-nums">{num(l.amount, 2)}</td>
                    <td>{l.status === 'FAILED' ? <span><Chip tone="danger">{t('Failed')}</Chip> <span className="text-xs text-muted-foreground">{bi(l.reason, l.reason_ar)}</span></span> : <Chip tone={l.status === 'PAID' ? 'success' : undefined}>{t(l.status === 'PAID' ? 'Paid' : l.status === 'REPAID' ? 'Paid in the follow-up' : 'Waiting')}</Chip>}</td>
                  </tr>))}</tbody></Table>
            )}
            {tab === 'lines' && !allLines && lines.length > 12 ? <div className="mt-2"><Btn small onClick={() => setAllLines(true)}>{t('Show every line')} ({num(lines.length)})</Btn></div> : null}
          </div>
        </Panel>
      ) : cl ? <Empty icon={<Landmark size={18} />}>{`${bi(cl.short, cl.name_ar)}${t('’s bank file is written once the client approves the run.')}`}</Empty> : null}
    </Screen>
  );
}
