/** My HR: the employee's own screens. Every figure comes from the HRMS through the connector. */
import { useEffect, useState } from 'react';
import { FeedCard, HeroFeature, PageColumns, Panel, PanelAction, RecordCard, StatTile, StatusRow } from '@cognirise/atelier/layout';
import { Dialog, DialogContent, DialogTitle } from '@cognirise/atelier/components/ui/dialog';
import { InboxItem, InboxLayout, InboxList, InboxReader, ProvenanceNote } from '@cognirise/atelier/archetypes';
import { Award, Bell, BookOpen, CalendarDays, CheckCircle2, ClipboardCheck, FileText, Landmark, Plane, Plus, Sprout, Target, Wallet } from 'lucide-react';
import { api, bump, post, useApi } from '../lib/api';
import { useLang } from '../lib/i18n';
import { aed, ago, date, dateShort, daysUntil, month, num } from '../lib/format';
import { useApp } from '../app/state';
import { Bar, Btn, Chip, Empty, Field, Hero, Kv, Ref, Screen, SourceStamp, StatusChip, Table, useClientName, StatRow } from '../app/ui';
import { CaseRow, CaseView } from '../app/case';
import { owner, plain, rowParts } from '../app/decision';
import { Columns, SegmentBar, YearHeatmap } from '../app/viz';

/** The annual leave balance as one bar: taken, booked, left. */
export function LeaveBar({ b, legend = true }: { b: any; legend?: boolean }) {
  const { t } = useLang();
  if (!b) return null;
  return <SegmentBar legend={legend} total={(b.entitlement ?? 0) + (b.carried_over ?? 0)} segments={[{ label: t('Taken'), value: Math.round(b.taken ?? 0), tone: 'muted' }, { label: t('Booked'), value: Math.round(b.booked ?? 0), tone: 'chart2' }, { label: t('Left'), value: Math.round(b.balance ?? 0), tone: 'primary' }]} />;
}
import { LifecycleRing, stageCounts } from '../app/ring';
import { DocumentDownload } from '../app/document-download';
import { DocumentPreview } from '../app/document-preview';
import { letterDocument, payslipDocument } from '../lib/documents';

// ------------------------------------------------------------------ the request catalog

export const CATALOG: { type: string; en: string; ar: string; group: string; note: string; auto: boolean }[] = [
  { type: 'SALARY_CERTIFICATE', en: 'Salary certificate', ar: 'شهادة راتب', group: 'Letters', note: 'Issued from HRMS data, usually in under a minute.', auto: true },
  { type: 'EMPLOYMENT_CERTIFICATE', en: 'Employment certificate', ar: 'شهادة عمل', group: 'Letters', note: 'Issued from HRMS data.', auto: true },
  { type: 'NOC_TRAVEL', en: 'No-objection letter for travel', ar: 'خطاب عدم ممانعة للسفر', group: 'Letters', note: 'For a visa application during approved leave.', auto: true },
  { type: 'NOC_DRIVING', en: 'Introduction letter (to whom it may concern)', ar: 'خطاب تعريف (لمن يهمه الأمر)', group: 'Letters', note: 'Confirms your employment for a third party.', auto: true },
  { type: 'SALARY_TRANSFER', en: 'Salary transfer letter', ar: 'خطاب تحويل راتب', group: 'Letters', note: 'Needs HR Operations: it commits salary and end-of-service to one bank.', auto: false },
  { type: 'LEAVE', en: 'Leave', ar: 'إجازة', group: 'Time off', note: 'Checked against your balance and team cover; your manager approves.', auto: false },
  { type: 'ADVANCE', en: 'Salary advance', ar: 'سلفة راتب', group: 'Pay', note: 'Interest-free, within the policy limit; each instalment is at most 10% of your wage.', auto: false },
  { type: 'RESIGNATION', en: 'Resignation', ar: 'استقالة', group: 'Leaving', note: 'Starts notice, settlement and clearance.', auto: false },
];

export function NewRequest({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: string }) {
  const { t, bi, lang } = useLang();
  const { openCase } = useApp();
  const { data: me } = useMe();
  const [type, setType] = useState(initial ?? '');
  const [f, setF] = useState<Record<string, any>>({});
  const [check, setCheck] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { if (open) { setType(initial ?? ''); setF({ language: lang, type_code: 'ANNUAL', months: 6 }); setErr(''); setCheck(null); } }, [open, initial, lang]);
  useEffect(() => {
    if (type !== 'LEAVE' || !f.start || !f.end) { setCheck(null); return; }
    const h = setTimeout(() => post('/leave/check', { start: f.start, end: f.end, type_code: f.type_code }).then(setCheck).catch(() => {}), 250);
    return () => clearTimeout(h);
  }, [type, f.start, f.end, f.type_code]);
  const item = CATALOG.find((c) => c.type === type);
  const submit = async () => {
    setBusy(true); setErr('');
    try { const r = await post('/requests', { type, ...f }); bump(); onClose(); openCase(r.ref); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogTitle>{item ? bi(item.en, item.ar) : t('New request')}</DialogTitle>
        {!item ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {CATALOG.map((c) => (
              <button key={c.type} type="button" onClick={() => setType(c.type)} className="rounded-xl border border-border/70 p-3 text-start transition-colors hover:border-primary">
                <p className="text-sm font-semibold">{bi(c.en, c.ar)}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{t(c.note)}</p>
                {c.auto ? <Chip tone="success" className="mt-2">{t('Issued straight away')}</Chip> : null}
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t(item.note)}</p>
            {['SALARY_CERTIFICATE', 'SALARY_TRANSFER', 'NOC_TRAVEL', 'EMPLOYMENT_CERTIFICATE', 'NOC_DRIVING'].includes(type) ? (
              <>
                <Field label={type === 'SALARY_TRANSFER' ? t('Bank') : t('Addressed to')}><input className="input" value={f.addressee ?? ''} onChange={(e) => setF({ ...f, addressee: e.target.value })} placeholder={type === 'SALARY_TRANSFER' ? 'Al Rajhi Bank' : t('To whom it may concern')} /></Field>
                <Field label={t('Language')}><select className="input" value={f.language} onChange={(e) => setF({ ...f, language: e.target.value })}><option value="en">English</option><option value="ar">العربية</option></select></Field>
              </>
            ) : null}
            {type === 'LEAVE' ? (
              <>
                <Field label={t('Type')}><select className="input" value={f.type_code} onChange={(e) => setF({ ...f, type_code: e.target.value })}>{[['ANNUAL', 'Annual leave', 'إجازة سنوية'], ['SICK', 'Sick leave', 'إجازة مرضية'], ['UNPAID', 'Unpaid leave', 'إجازة بدون راتب'], ['PARENTAL', 'Parental leave', 'إجازة والدية'], ['BEREAVEMENT', 'Bereavement leave', 'إجازة حداد'], ['STUDY', 'Study leave', 'إجازة دراسية']].map(([v, en, ar]) => <option key={v} value={v}>{bi(en, ar)}</option>)}</select></Field>
                <div className="grid grid-cols-2 gap-3"><Field label={t('From')}><input className="input" type="date" value={f.start ?? ''} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field><Field label={t('To')}><input className="input" type="date" value={f.end ?? ''} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field></div>
                {check ? (
                  <div className={`rounded-lg border px-3 py-2 text-sm ${check.ok ? 'border-success/40 bg-success/10' : 'border-danger/40 bg-danger/10'}`}>
                    <p className="font-medium">{check.days} {t('days')} · {t('balance after')} {check.after}</p>
                    {[...check.issues, ...check.notes].map((x: string) => <p key={x} className="mt-0.5 text-xs">{plain(x)}</p>)}
                  </div>
                ) : null}
              </>
            ) : null}
            {type === 'ADVANCE' ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('Amount (SAR)')}><input className="input" type="number" value={f.amount ?? ''} onChange={(e) => setF({ ...f, amount: Number(e.target.value) })} /></Field>
                <Field label={t('Repay over (months)')}><input className="input" type="number" min={1} max={me?.advanceMaxTerm ?? 12} value={f.months ?? 6} onChange={(e) => setF({ ...f, months: Number(e.target.value) })} /></Field>
                {me ? <p className="col-span-2 text-xs text-muted-foreground">{t('Limit today')}: {aed(me.advanceMax, lang)} · {t('repaid over up to')} {me.advanceMaxTerm} {t('months')} · {t('each instalment at most 10% of your wage')}</p> : null}
                <div className="col-span-2"><Field label={t('Reason')}><input className="input" value={f.reason ?? ''} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field></div>
              </div>
            ) : null}
            {type === 'RESIGNATION' ? (
              <>
                <Field label={t('Notice date')}><input className="input" type="date" value={f.notice_date ?? ''} onChange={(e) => setF({ ...f, notice_date: e.target.value })} /></Field>
                <Field label={t('Reason (optional)')}><input className="input" value={f.reason ?? ''} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
              </>
            ) : null}
            {err ? <p className="text-sm text-danger">{err}</p> : null}
            <div className="flex justify-between gap-2 pt-1">
              <Btn onClick={() => setType('')}>{t('Back')}</Btn>
              <Btn kind="primary" onClick={submit} disabled={busy}>{busy ? t('Submitting…') : t('Submit request')}</Btn>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function useMe() { return useApi<any>('/me'); }

// ------------------------------------------------------------------ Home

/** A late arrival or absence from the month's attendance, to explain before any fine (Art. 71). Shown only when there is one. */
function ExplainAttendance() {
  const { t, lang } = useLang();
  const { data } = useApi<any>('/attendance/mine');
  const [text, setText] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const rows: any[] = (data?.rows ?? []).filter((r: any) => !r.decision);
  if (!rows.length) return null;
  const send = async (day: string) => { setBusy(true); try { await post('/attendance/mine/justify', { day, text: text[day] ?? '' }); bump(); } finally { setBusy(false); } };
  return (
    <Panel icon={<CalendarDays size={16} />} title={rows.some((r) => !r.justification) ? t('A day from last month needs your explanation') : t('Your explanation is with HR operations')}>
      <div className="space-y-3">{rows.map((r) => (
        <div key={r.day} className="rounded-lg border border-border/60 p-3">
          <p className="text-sm font-medium">{date(r.day, lang)}: {r.status === 'LATE' ? `${t('arrived at')} ${r.first_in}, ${r.minutes_late} ${t('minutes late')}` : t('no attendance recorded')}</p>
          {r.justification ? <p className="mt-1 text-sm text-muted-foreground">“{r.justification}”</p> : (
            <div className="mt-2 flex gap-2">
              <input className="input flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm" placeholder={t('Why were you late? HR operations reads this before deciding.')} value={text[r.day] ?? ''} onChange={(e) => setText({ ...text, [r.day]: e.target.value })} />
              <Btn small kind="primary" disabled={busy || !(text[r.day] ?? '').trim()} onClick={() => send(r.day)}>{t('Send')}</Btn>
            </div>
          )}
        </div>))}</div>
    </Panel>
  );
}

export function MyHome() {
  const { t, bi, lang } = useLang();
  const { persona, openCase, go } = useApp();
  const { data: me } = useMe();
  const { data: reqs } = useApi<any[]>('/requests?view=mine');
  const [nr, setNr] = useState<string | null>(null);
  if (!me) return null;
  const w = me.worker;
  const annual = me.balances.find((b: any) => b.type_code === 'ANNUAL');
  const open = (reqs ?? []).filter((r) => ['WAITING', 'RUNNING', 'ESCALATED'].includes(r.status));
  const pending = w.worker_type === 'P';
  const first = bi(w.first_name, w.display_name_ar.split(' ')[0]);
  return (
    <Screen hero={
      <Hero tone="surface" eyebrow={`${t('Hello')}${lang === 'ar' ? '، ' : ', '}${first}`} title={open.length ? `${open.length} ${t(open.length === 1 ? 'request in progress' : 'requests in progress')}` : t('Nothing is waiting on HR')}
        lede={pending ? `${t('You start on')} ${date(w.start_date, lang)}. ${t('Dalil has your pre-boarding checklist.')}` : `${bi(w.job_name, w.job_name_ar)} · ${bi(w.department_name, w.department_name_ar)}.${me.nextPay ? ` ${t('Next pay')}: ${dateShort(me.nextPay.pay_date, lang)}.` : ''}`}
        actions={<><Btn kind="primary" onClick={() => setNr('')}><Plus className="h-4 w-4" />{t('New request')}</Btn><Btn onClick={() => go(pending ? 'my-onboarding' : 'my-leave')}>{pending ? t('Pre-boarding') : t('Book leave')}</Btn></>}
        feature={<HeroFeature label="Annual leave left" value={`${num(annual?.balance ?? 0, 0)} ${t('days')}`} support={<div className="w-56"><LeaveBar b={annual} /></div>} />}
      />}>
      <PageColumns aside={<>
        <Panel icon={<ClipboardCheck size={16} />} title="My open requests" action={<PanelAction onClick={() => go('my-requests')}>{t('All')}</PanelAction>}>
          <div className="space-y-2">
            {open.length ? open.slice(0, 4).map((r) => <CaseRow key={r.ref} r={r} mine onSelect={() => openCase(r.ref)} />) : <Empty>{t('Nothing open. Ask Rafeeq or start a request.')}</Empty>}
          </div>
        </Panel>
      </>}>
        <ExplainAttendance />
        <Panel icon={<Bell size={16} />} title="What changed" action={<PanelAction>{t('Last 30 days')}</PanelAction>}>
          <div className="space-y-2">
            {me.notifications.length ? me.notifications.filter((n: any, i: number, all: any[]) => all.findIndex((m: any) => m.title === n.title && m.body === n.body) === i).slice(0, 5).map((n: any) => (
              <FeedCard key={n.id} tags={<Chip tone="primary">{t('Update')}</Chip>} timestamp={ago(n.created_at, lang)} headline={plain(bi(n.title, n.title_ar))} consequence={plain(n.body)} onOpen={n.link?.startsWith('case:') ? () => openCase(n.link.slice(5)) : undefined} />
            )) : me.payslips.slice(0, 2).map((p: any) => (
              <FeedCard key={p.id} tags={<Chip tone="success">{t('Payslip')}</Chip>} timestamp={date(p.pay_date, lang)} headline={`${month(p.period_name, lang)}: ${aed(p.net, lang)} ${t('net')}`} consequence={t('Paid through Mudad. Open Pay and documents for the lines.')} onOpen={() => go('my-pay')} />
            ))}
          </div>
        </Panel>
      </PageColumns>
      <NewRequest open={nr !== null} initial={nr ?? undefined} onClose={() => setNr(null)} />
    </Screen>
  );
}

export function EosSummary({ eos }: { eos: any }) {
  const { t, lang } = useLang();
  if (!eos) return null;
  const g = eos.gosi;
  return (
    <div className="space-y-2 text-sm">
      <p className="text-xs text-muted-foreground">{eos.years} {t('years of service')}</p>
      {[[t('If the company ends the contract'), eos.accrued, 'bg-chart-1'], [t('If you resigned today'), eos.ifResigned, 'bg-chart-2']].map(([k, v, c]) => (
        <div key={k as string}><div className="flex justify-between text-xs"><span className="text-muted-foreground">{k}</span><span className="font-semibold tabular-nums">{aed(v as number, lang)}</span></div>
          <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${c}`} style={{ width: `${Math.max(2, ((v as number) / Math.max(1, eos.accrued)) * 100)}%` }} /></div></div>
      ))}
      <p className="text-xs text-muted-foreground">{plain(eos.ifResignedRule)}</p>
      {g ? (
        <>
          <dl className="grid grid-cols-2 gap-3"><Kv k={t('Your GOSI contribution')} v={`${aed(g.monthlyEmployee, lang)} / ${t('month')}`} /><Kv k={t('Employer GOSI contribution')} v={`${aed(g.monthlyEmployer, lang)} / ${t('month')}`} /></dl>
          <p className="text-xs text-muted-foreground">{t('Contribution salary')} {aed(g.contributionSalary, lang)}{Array.isArray(g.rates) ? ` · ${(g.rates[0] * 100).toFixed(2).replace(/\.?0+$/, '')}% / ${(g.rates[1] * 100).toFixed(2).replace(/\.?0+$/, '')}%` : ''}</p>
        </>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ Requests

export function MyRequests() {
  const { t, bi, lang } = useLang();
  const { data } = useApi<any[]>('/requests?view=mine', { poll: 8000 });
  const { openCase } = useApp();
  const [nr, setNr] = useState(false);
  const rows = data ?? [];
  const openRows = rows.filter((r) => ['WAITING', 'RUNNING', 'ESCALATED'].includes(r.status));
  const closed = rows.filter((r) => !['WAITING', 'RUNNING', 'ESCALATED'].includes(r.status));
  const openN = openRows.length;
  return (
    <Screen hero={<Hero tone="surface" eyebrow="My HR" title={openN ? `${openN} ${t(openN === 1 ? 'request is open' : 'requests are open')}` : t('Nothing you asked for is open')} lede={t('Everything you have asked HR for, and who has it now.')} actions={<Btn kind="primary" onClick={() => setNr(true)}><Plus className="h-4 w-4" />{t('New request')}</Btn>} />}>
      {/* One person's few requests: a list that opens each in the drawer, not a list and a reader showing the same request twice. */}
      <PageColumns aside={<Panel icon={<CheckCircle2 size={16} />} title="Closed">
        {closed.length ? <Table><tbody>{closed.slice(0, 12).map((r) => <tr key={r.ref} className="clickable" onClick={() => openCase(r.ref)}><td className="text-sm">{rowParts(r, bi, t).what}</td><td className="whitespace-nowrap text-xs text-muted-foreground">{date(r.closed_at ?? r.updated_at, lang)}</td><td><StatusChip status={r.status} /></td></tr>)}</tbody></Table> : <Empty>{t('Nothing closed yet.')}</Empty>}
      </Panel>}>
        <Panel icon={<ClipboardCheck size={16} />} title="Still with someone">
          <div className="space-y-2">{openRows.length ? openRows.map((r) => <CaseRow key={r.ref} r={r} mine onSelect={() => openCase(r.ref)} />) : <Empty>{t('Nothing open. Ask Rafeeq or start a request.')}</Empty>}</div>
        </Panel>
      </PageColumns>
      <NewRequest open={nr} onClose={() => setNr(false)} />
    </Screen>
  );
}

// ------------------------------------------------------------------ Leave

export function MyLeave() {
  const { t, bi, lang } = useLang();
  const { data: me } = useMe();
  const [nr, setNr] = useState(false);
  if (!me) return null;
  const annual = me.balances.find((b: any) => b.type_code === 'ANNUAL');
  return (
    <Screen hero={<Hero tone="surface" eyebrow="My HR" title={`${num(annual?.balance ?? 0, 0)} ${t('days of annual leave left')}`} lede={`${t('Your entitlement is')} ${num(annual?.entitlement ?? 0, 0)} ${t('days a year. Book here or ask Rafeeq; your manager approves.')}`} actions={<Btn kind="primary" onClick={() => setNr(true)}><Plane className="h-4 w-4" />{t('Request leave')}</Btn>} />}>
      <Panel icon={<CalendarDays size={16} />} title={`${t('This year')}: ${num((annual?.entitlement ?? 0) + (annual?.carried_over ?? 0), 0)} ${t('days, including')} ${num(annual?.carried_over ?? 0, 0)} ${t('carried over to use by 31 March')}`} action={<PanelAction>{t('Sick leave left')}: {num(me.balances.find((b: any) => b.type_code === 'SICK')?.balance ?? 0, 0)} {t('days')}</PanelAction>}>
        <LeaveBar b={annual} />
      </Panel>
      <PageColumns aside={<Panel icon={<BookOpen size={16} />} title="The rules that apply">
        <ul className="space-y-2 text-sm">
          <li>{t('At least 21 days a year, 30 days after five years of service; your contract may give more.')}</li>
          <li>{t('Up to 10 days carry into next year, used by 31 March.')}</li>
          <li>{t('Sick leave: 30 days full pay, 60 days at 75%, 30 days unpaid in a year; medical certificate required.')}</li>
          <li>{t('Paternity leave: 3 days paid. Maternity leave: 12 weeks paid.')}</li>
        </ul>
      </Panel>}>
        <Panel icon={<CalendarDays size={16} />} title={bi(`Your ${new Date().getUTCFullYear()} so far, and what is booked`, `عامك ${new Date().getUTCFullYear()} حتى الآن، وما هو محجوز`)} action={<PanelAction><span className="inline-flex items-center gap-3"><span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-primary" />{t('Taken')}</span><span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-chart-2" />{t('Booked')}</span></span></PanelAction>}>
          <div className="mb-4"><YearHeatmap year={new Date().getUTCFullYear()} today={new Date().toISOString().slice(0, 10)} ranges={me.absences.map((a: any) => ({ start: String(a.start_date).slice(0, 10), end: String(a.end_date).slice(0, 10), tone: String(a.end_date).slice(0, 10) < new Date().toISOString().slice(0, 10) ? 'taken' as const : 'booked' as const }))} /></div>
          <Table><thead><tr><th>{t('Type')}</th><th>{t('From')}</th><th>{t('To')}</th><th className="text-end">{t('Days')}</th><th>{t('Status')}</th></tr></thead>
            <tbody>{me.absences.map((a: any) => <tr key={a.absence_number}><td>{bi(a.name, a.name_ar)}</td><td>{date(a.start_date, lang)}</td><td>{date(a.end_date, lang)}</td><td className="text-end tabular-nums">{num(a.days, 1)}</td><td><StatusChip status={a.status} /></td></tr>)}</tbody></Table>
        </Panel>
      </PageColumns>
      <NewRequest open={nr} initial="LEAVE" onClose={() => setNr(false)} />
    </Screen>
  );
}

// ------------------------------------------------------------------ Pay and documents

export function MyPay() {
  const { t, bi, lang } = useLang();
  const { client, persona } = useApp();
  const { data: me } = useMe();
  const [slip, setSlip] = useState<any>(null);
  const [doc, setDoc] = useState<any>(null);
  const [nr, setNr] = useState<string | null>(null);
  useEffect(() => { setSlip(null); setDoc(null); }, [client?.key, persona?.key]);
  if (!me) return null;
  const w = me.worker;
  const total = w.basic + w.housing + w.transport + w.other_allowance;
  return (
    <Screen hero={<Hero tone="surface" eyebrow="My HR" title={`${aed(total, lang)} ${t('gross a month')}`} lede={`${t('Basic')} ${aed(w.basic, lang)} · ${t('housing')} ${aed(w.housing, lang)} · ${t('transport and other')} ${aed(w.transport + w.other_allowance, lang)}. ${t('Last net pay')} ${aed(me.payslips[0]?.net, lang)}.`}
      actions={<><Btn kind="primary" onClick={() => setNr('SALARY_CERTIFICATE')}>{t('Salary certificate')}</Btn><Btn onClick={() => setNr('ADVANCE')}>{t('Salary advance')}</Btn></>}
      />}>
      {/* End of service is shown at an exit, not on the employee's pay page: HR sees it on the person record and in the exit case. */}
      <PageColumns aside={<>
        <Panel icon={<FileText size={16} />} title="Letters issued">
          {me.documents.length ? <div className="space-y-2">{me.documents.map((d: any) => <RecordCard key={d.document_number} state={<StatusChip status={d.status} />} title={t(({ SALARY_CERTIFICATE: 'Salary certificate', EMPLOYMENT_CERTIFICATE: 'Employment certificate', SALARY_TRANSFER: 'Salary transfer letter', NOC_TRAVEL: 'No-objection letter for travel', NOC_DRIVING: 'Introduction letter (to whom it may concern)', EXPERIENCE: 'Experience letter' } as any)[d.type] ?? d.type)} meta={<span className="text-xs text-muted-foreground">{d.addressee || t('To whom it may concern')} · {date(d.issued_at, lang)}</span>} onOpen={() => setDoc(d)} />)}</div> : <Empty>{t('No letters yet.')}</Empty>}
        </Panel>
        <Panel icon={<Wallet size={16} />} title="Salary advances" action={<PanelAction onClick={() => setNr('ADVANCE')}>{t('Request')}</PanelAction>}>
          {me.advances.length ? me.advances.map((a: any) => <StatusRow key={a.advance_number} name={aed(a.amount, lang)} detail={`${aed(a.monthly_recovery, lang)} × ${a.months} · ${t('outstanding')} ${aed(a.outstanding, lang)}`} status={<StatusChip status={a.status} />} />) : <p className="text-sm text-muted-foreground">{t('No advances. Limit today')}: {aed(me.advanceMax, lang)}.</p>}
        </Panel>
      </>}>
        {me.payslips.length ? <Panel icon={<Wallet size={16} />} title="Payslips" action={<PanelAction>{t('Open a month for its lines')}</PanelAction>}>
          <Table><thead><tr><th>{t('Period')}</th><th>{t('Paid')}</th><th className="text-end">{t('Gross')}</th><th className="text-end">{t('Deductions')}</th><th className="text-end">{t('Net')}</th></tr></thead>
            <tbody>{me.payslips.map((p: any) => <tr key={p.id} className="clickable" onClick={() => setSlip(p)}><td>{month(p.period_name, lang)}</td><td>{date(p.pay_date, lang)}</td><td className="text-end tabular-nums">{aed(p.gross, lang)}</td><td className="text-end tabular-nums">{aed(p.deductions, lang)}</td><td className="text-end font-semibold tabular-nums">{aed(p.net, lang)}</td></tr>)}</tbody></Table>
        </Panel> : null}
      </PageColumns>
      <Dialog open={!!slip} onOpenChange={(o) => !o && setSlip(null)}>
        <DialogContent className="max-w-lg"><DialogTitle>{t('Payslip')} · {slip ? month(slip.period_name, lang) : ''}</DialogTitle>
          {slip ? <Table><tbody>{slip.lines.map((l: any) => <tr key={l.code}><td>{t(l.name)}</td><td className="text-end tabular-nums">{l.kind === 'DEDUCTION' ? '−' : ''}{aed(l.amount, lang)}</td></tr>)}<tr><td className="font-semibold">{t('Net')}</td><td className="text-end font-semibold tabular-nums">{aed(slip.net, lang)}</td></tr></tbody></Table> : null}
          {slip ? <p className="mt-2 text-xs text-muted-foreground">{t('Paid to')} {w.bank_name} · {w.iban_masked} · {t('payment date')} {date(slip.pay_date, lang)}</p> : null}
          {slip ? <DocumentDownload document={payslipDocument(slip, bi(w.display_name, w.display_name_ar), lang, { job: bi(w.job_name, w.job_name_ar), person_number: w.person_number, bank_name: w.bank_name, iban_masked: w.iban_masked, employer: client?.name })} /> : null}
        </DialogContent>
      </Dialog>
      <Dialog open={!!doc} onOpenChange={(o) => !o && setDoc(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] min-w-0 max-w-3xl max-h-[90vh] overflow-x-hidden overflow-y-auto"><DialogTitle>{t('Letter')}</DialogTitle>
          {doc ? <DocumentPreview document={letterDocument(doc)} /> : null}
        </DialogContent>
      </Dialog>
      <NewRequest open={nr !== null} initial={nr ?? undefined} onClose={() => setNr(null)} />
    </Screen>
  );
}

// ------------------------------------------------------------------ Growth

export function MyGrowth() {
  const { t, bi, lang } = useLang();
  const cname = useClientName();
  const { data: me } = useMe();
  const { data: hiring } = useApi<any>('/hiring');
  if (!me) return null;
  const years = [...new Set(me.goals.map((g: any) => g.year))].sort().reverse() as number[];
  const cur = years.find((y) => me.goals.some((g: any) => g.year === y && g.progress > 0)) ?? years[0];
  const gs = me.goals.filter((g: any) => g.year === cur);
  const gp = gs.length ? Math.round(gs.reduce((a: number, g: any) => a + g.progress * g.weight, 0) / Math.max(1, gs.reduce((a: number, g: any) => a + g.weight, 0))) : null;
  return (
    <Screen hero={<Hero tone="surface" eyebrow="My HR" title={gp !== null ? bi(`Your FY${cur} goals are ${gp}% complete`, `أهدافك للسنة المالية ${cur} منجزة بنسبة ${gp}%`) : bi(`Your goals for FY${cur}`, `أهدافك للسنة المالية ${cur}`)} lede={`${t('Goals, reviews, learning and openings inside')} ${cname}.`} />}>
      <PageColumns aside={<>
        {me.performance.length ? <Panel icon={<Award size={16} />} title="Reviews">
          {me.performance.map((p: any) => <StatusRow key={p.review_period} name={p.review_period} detail={p.calibrated_rating ? `${t('Rating')} ${p.calibrated_rating} / 5` : p.manager_rating ? `${t('Manager rating')} ${p.manager_rating}` : t('In progress')} status={<StatusChip status={p.status} />} />)}
        </Panel> : null}
        <Panel icon={<Sprout size={16} />} title="Internal openings" action={<PanelAction>{t('Apply internally first')}</PanelAction>}>
          <div className="space-y-2">{(hiring?.requisitions ?? []).filter((r: any) => r.status === 'OPEN').slice(0, 5).map((r: any) => <RecordCard key={r.req_number} state={<Chip>{r.grade}</Chip>} title={bi(r.title, r.title_ar)} meta={<span className="text-xs text-muted-foreground">{t(r.department)}</span>} />)}</div>
        </Panel>
      </>}>
        <Panel icon={<Target size={16} />} title="Goals and learning">
          {gs.length ? <div className="space-y-3">{me.goals.filter((g: any) => g.year === cur).map((g: any) => (
            <div key={g.id} className="rounded-xl glass-l3 px-4 py-3">
              <div className="flex items-center gap-2"><span className="text-sm font-semibold">{bi(g.title, g.title_ar)}</span><StatusChip status={g.status} className="ms-auto" /></div>
              <div className="mt-2 flex items-center gap-3"><Bar value={g.progress} tone={g.status === 'AT_RISK' ? 'warn' : 'primary'} /><span className="w-12 text-end font-mono text-xs">{g.progress}%</span></div>
              <p className="mt-1 text-xs text-muted-foreground">{t('Weight')} {g.weight}%</p>
            </div>
          ))}</div> : <Empty>{t('No goals set for this year yet.')}</Empty>}
          <h3 className="mt-5 mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('Learning')}</h3>
          <Table><thead><tr><th>{t('Course')}</th><th>{t('Kind')}</th><th>{t('Due')}</th><th>{t('Status')}</th></tr></thead>
            <tbody>{me.learning.map((l: any) => <tr key={l.item_id}><td>{bi(l.title, l.title_ar)}</td><td><Chip>{t(l.kind === 'COMPLIANCE' ? 'Compliance' : l.kind === 'COURSE' ? 'Course' : 'Certification')}</Chip></td><td>{date(l.due_date, lang)}</td><td><StatusChip status={l.status} /></td></tr>)}</tbody></Table>
        </Panel>
      </PageColumns>
    </Screen>
  );
}

// ------------------------------------------------------------------ Onboarding

export function MyOnboarding() {
  const { t, bi, lang } = useLang();
  const cname = useClientName();
  const { data: me } = useMe();
  if (!me) return null;
  const j = me.journeys.find((x: any) => x.template === 'PREBOARDING') ?? me.journeys.find((x: any) => x.template === 'ONBOARDING');
  const w = me.worker;
  const tasks = j?.tasks ?? [];
  const done = tasks.filter((x: any) => x.status === 'DONE').length;
  const left = daysUntil(w.start_date);
  return (
    <Screen hero={<Hero eyebrow={t('Dalil, your onboarding buddy')} title={left > 0 ? `${left} ${t('days to your first day')}` : `${t('Welcome to')} ${cname}`} lede={`${bi(w.job_name, w.job_name_ar)} · ${bi(w.department_name, w.department_name_ar)} · ${t('manager')} ${bi(w.manager_name, w.manager_name_ar)} · ${t('starts')} ${date(w.start_date, lang)}`}
      feature={<HeroFeature label="Checklist" value={`${done}/${tasks.length}`} support={<Chip>{t('tasks done')}</Chip>} />} />}>
      <PageColumns aside={<>
        <Panel icon={<CheckCircle2 size={16} />} title="Day one">
          <ul className="space-y-2 text-sm"><li>08:30 · {t('Welcome at head office')}</li><li>09:30 · {t('Laptop and accounts with IT')}</li><li>11:00 · {t('Coffee with your buddy')}</li><li>13:00 · {t('Team lunch with your manager')}</li><li>15:00 · {t('Code of conduct and data protection essentials')}</li></ul>
        </Panel>
        <Panel icon={<BookOpen size={16} />} title="Before you start">
          <p className="text-sm">{t('Probation is set in your contract and cannot exceed 180 days in total (Art. 53). The working week is Sunday to Thursday. Ask Rafeeq anything.')}</p>
        </Panel>
      </>}>
        <Panel icon={<ClipboardCheck size={16} />} title="Checklist">
          <div className="mb-3 flex items-center gap-3"><Bar value={done} max={tasks.length || 1} tone="success" /><span className="font-mono text-xs">{done}/{tasks.length}</span></div>
          <div className="space-y-2">{tasks.map((x: any) => (
            <div key={x.id} className="flex items-start gap-3 rounded-xl glass-l3 px-4 py-3">
              <StatusChip status={x.status} />
              <div className="min-w-0 flex-1"><p className="text-sm font-medium">{bi(x.title, x.title_ar)}</p><p className="text-xs text-muted-foreground">{t('Owner')}: {t(owner(x.owner))}{x.external_system ? ` · ${t(({ QIWA: 'Qiwa', MUQEEM: 'Muqeem', MUDAD: 'Mudad', GOSI: 'GOSI', ABSHER: 'Absher', JADARAT: 'Jadarat' } as Record<string, string>)[x.external_system] ?? x.external_system)}` : ''} · {t('due')} {date(x.due_date, lang)}</p>{x.note ? <p className="mt-1 text-xs text-danger">{t(x.note)}</p> : null}</div>
            </div>
          ))}</div>
        </Panel>
      </PageColumns>
    </Screen>
  );
}
void api; void Kv;
