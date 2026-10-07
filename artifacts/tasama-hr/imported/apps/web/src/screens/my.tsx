/** My HR: the employee's own screens. Every figure comes from the HRMS through the connector. */
import { useEffect, useState } from 'react';
import { FeedCard, HeroFeature, PageColumns, Panel, PanelAction, RecordCard, StatRow, StatTile, StatusRow } from '@cognirise/atelier/layout';
import { Dialog, DialogContent, DialogTitle } from '@cognirise/atelier/components/ui/dialog';
import { InboxItem, InboxLayout, InboxList, InboxReader, ProvenanceNote } from '@cognirise/atelier/archetypes';
import { Award, Bell, BookOpen, CalendarDays, CheckCircle2, ClipboardCheck, FileText, Landmark, Plane, Plus, Sprout, Target, Wallet } from 'lucide-react';
import { api, bump, post, useApi } from '../lib/api';
import { useLang } from '../lib/i18n';
import { aed, ago, date, dateShort, daysUntil, month, num } from '../lib/format';
import { useApp } from '../app/state';
import { Bar, Btn, Chip, Empty, Field, Hero, Kv, Ref, Screen, SourceStamp, StatusChip, Table, useClientName } from '../app/ui';
import { CaseBody } from '../app/case';
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
  { type: 'ADVANCE', en: 'Salary advance', ar: 'سلفة راتب', group: 'Pay', note: 'Interest-free, within the policy limit; each instalment is at most 10% of your wage (Art. 92).', auto: false },
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
                {c.auto ? <Chip tone="success" className="mt-2">{t('No HR touch')}</Chip> : null}
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
                    <p className="font-medium">{t('Ajaza')}: {check.days} {t('days')} · {t('balance')} {check.balance} → {check.after}</p>
                    {[...check.issues, ...check.notes].map((x: string) => <p key={x} className="mt-0.5 text-xs">{x}</p>)}
                  </div>
                ) : null}
              </>
            ) : null}
            {type === 'ADVANCE' ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('Amount (SAR)')}><input className="input" type="number" value={f.amount ?? ''} onChange={(e) => setF({ ...f, amount: Number(e.target.value) })} /></Field>
                <Field label={t('Repay over (months)')}><input className="input" type="number" min={1} max={me?.advanceMaxTerm ?? 12} value={f.months ?? 6} onChange={(e) => setF({ ...f, months: Number(e.target.value) })} /></Field>
                {me ? <p className="col-span-2 text-xs text-muted-foreground">{t('Limit today')}: {aed(me.advanceMax, lang)} · {t('repaid over up to')} {me.advanceMaxTerm} {t('months')} · {t('each instalment at most 10% of your wage (Art. 92)')}</p> : null}
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
  const goals = me.goals.filter((g: any) => g.progress > 0);
  const gp = goals.length ? Math.round(goals.reduce((s: number, g: any) => s + g.progress * g.weight, 0) / goals.reduce((s: number, g: any) => s + g.weight, 0)) : null;
  const pending = w.worker_type === 'P';
  const first = bi(w.first_name, w.display_name_ar.split(' ')[0]);
  return (
    <Screen hero={
      <Hero tone="surface" eyebrow={bi(persona?.label, persona?.label_ar)} title={`${t('Hello')}${lang === 'ar' ? '، ' : ', '}${first}`}
        lede={pending ? `${t('You start on')} ${date(w.start_date, lang)}. ${t('Dalil has your pre-boarding checklist.')}` : `${bi(w.job_name, w.job_name_ar)} · ${bi(w.department_name, w.department_name_ar)} · ${t('since')} ${date(w.original_hire_date, lang)}`}
        actions={<><Btn kind="primary" onClick={() => setNr('')}><Plus className="h-4 w-4" />{t('New request')}</Btn><Btn onClick={() => go(pending ? 'my-onboarding' : 'my-leave')}>{pending ? t('Pre-boarding') : t('Book leave')}</Btn></>}
        media={<LifecycleRing counts={stageCounts(open)} center={open.length} centerLabel={t('of your requests in progress')} />}
      />}>
      <StatRow>
        <StatTile label="Annual leave" value={num(annual?.balance ?? 0, 1)} state={<Chip>{t('days')}</Chip>} trend={{ direction: 'flat', label: `${num(annual?.taken ?? 0, 1)} ${t('taken')} · ${num(annual?.booked ?? 0, 1)} ${t('booked')}` }} />
        <StatTile label="Next pay date" value={me.nextPay ? dateShort(me.nextPay.pay_date, lang) : '—'} state={<Chip>{me.nextPay?.period_name}</Chip>} trend={{ direction: 'flat', label: t('through Mudad') }} />
        <StatTile label="Open requests" value={open.length} trend={{ direction: 'flat', label: `${(reqs ?? []).filter((r) => r.status === 'COMPLETED').length} ${t('completed')}` }} />
        <StatTile label="Goals progress" value={gp !== null ? `${gp}%` : '—'} trend={{ direction: 'up', label: t('weighted, this performance year'), sentiment: 'good' }} />
      </StatRow>
      <PageColumns aside={<>
        <Panel icon={<ClipboardCheck size={16} />} title="My open requests" action={<PanelAction onClick={() => go('my-requests')}>{t('All')}</PanelAction>}>
          <div className="space-y-2">
            {open.length ? open.slice(0, 4).map((r) => <RecordCard key={r.ref} reference={<Ref>{r.ref}</Ref>} state={<StatusChip status={r.status} />} title={bi(r.title, r.title_ar)} meta={<span className="text-xs text-muted-foreground">{r.waiting_on_name ? `${t('With')} ${bi(r.waiting_on_name, r.waiting_on_name_ar)}` : ''}</span>} onOpen={() => openCase(r.ref)} />) : <Empty>{t('Nothing open. Ask Rafeeq or start a request.')}</Empty>}
          </div>
        </Panel>
        <Panel icon={<Wallet size={16} />} title="End of service">
          <EosSummary eos={me.eos} />
        </Panel>
      </>}>
        <Panel icon={<Bell size={16} />} title="What changed" action={<PanelAction>{t('Last 30 days')}</PanelAction>}>
          <div className="space-y-2">
            {me.notifications.length ? me.notifications.slice(0, 5).map((n: any) => (
              <FeedCard key={n.id} tags={<Chip tone="primary">{t('Update')}</Chip>} timestamp={ago(n.created_at, lang)} headline={bi(n.title, n.title_ar)} consequence={n.body} onOpen={n.link?.startsWith('case:') ? () => openCase(n.link.slice(5)) : undefined} />
            )) : me.payslips.slice(0, 2).map((p: any) => (
              <FeedCard key={p.id} tags={<Chip tone="success">{t('Payslip')}</Chip>} timestamp={date(p.pay_date, lang)} headline={`${month(p.period_name, lang)}: ${aed(p.net, lang)} ${t('net')}`} consequence={t('Paid through Mudad. Open Pay and documents for the lines.')} onOpen={() => go('my-pay')} />
            ))}
          </div>
        </Panel>
        <Panel icon={<FileText size={16} />} title="Quick requests">
          <div className="grid gap-2 sm:grid-cols-2">
            {CATALOG.slice(0, 6).map((c) => (
              <button key={c.type} type="button" onClick={() => setNr(c.type)} className="rounded-xl glass-l3 px-4 py-3 text-start transition-colors hover:border-primary/50">
                <p className="text-sm font-semibold">{bi(c.en, c.ar)}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{t(c.note)}</p>
              </button>
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
      <dl className="grid grid-cols-2 gap-3"><Kv k={t('Award if the company ends the contract')} v={aed(eos.accrued, lang)} /><Kv k={t('Service')} v={`${eos.years} ${t('years')}`} /></dl>
      <p className="font-mono text-[11px] text-muted-foreground">{eos.rule}</p>
      <dl className="grid grid-cols-2 gap-3"><Kv k={t('If you resigned today')} v={aed(eos.ifResigned, lang)} /><Kv k={t('Share of the full award')} v={eos.ifResignedFactor === 1 ? t('Full') : eos.ifResignedFactor === 0 ? t('None') : `${Math.round((eos.ifResignedFactor ?? 0) * 100)}%`} /></dl>
      <p className="text-xs text-muted-foreground">{eos.ifResignedRule}</p>
      {g ? (
        <>
          <dl className="grid grid-cols-2 gap-3"><Kv k={t('Your GOSI contribution')} v={`${aed(g.monthlyEmployee, lang)} / ${t('month')}`} /><Kv k={t('Employer GOSI contribution')} v={`${aed(g.monthlyEmployer, lang)} / ${t('month')}`} /></dl>
          <p className="text-xs text-muted-foreground">{t('Contribution salary')} {aed(g.contributionSalary, lang)}{Array.isArray(g.rates) ? ` · ${(g.rates[0] * 100).toFixed(2).replace(/\.?0+$/, '')}% / ${(g.rates[1] * 100).toFixed(2).replace(/\.?0+$/, '')}%` : ''}</p>
          <p className="font-mono text-[11px] text-muted-foreground">{g.rule}</p>
        </>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ Requests

export function MyRequests() {
  const { t, bi, lang } = useLang();
  const { data } = useApi<any[]>('/requests?view=mine', { poll: 8000 });
  const [sel, setSel] = useState<string | null>(null);
  const [nr, setNr] = useState(false);
  const rows = data ?? [];
  useEffect(() => { if (!sel && rows[0]) setSel(rows[0].ref); }, [rows, sel]);
  return (
    <Screen hero={<Hero tone="surface" eyebrow="My HR" title="Requests" lede="Everything you have asked HR for, with who has it now and every step taken." actions={<Btn kind="primary" onClick={() => setNr(true)}><Plus className="h-4 w-4" />{t('New request')}</Btn>} />}>
      <InboxLayout
        list={<InboxList label={t('My requests')} count={rows.length}>
          {rows.map((r) => <InboxItem key={r.ref} selected={sel === r.ref} onSelect={() => setSel(r.ref)} reference={<Ref>{r.ref}</Ref>} state={<StatusChip status={r.status} />} title={bi(r.title, r.title_ar)} preview={r.waiting_on_name ? `${t('With')} ${bi(r.waiting_on_name, r.waiting_on_name_ar)}` : bi(r.workflow_name, r.workflow_name_ar)} meta={ago(r.updated_at, lang)} />)}
        </InboxList>}
        reader={<InboxReader empty={t('Choose a request to see where it is.')}>{sel ? <CaseBody caseRef={sel} /> : null}</InboxReader>}
      />
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
    <Screen hero={<Hero tone="surface" eyebrow="My HR" title="Leave" lede="Balances from the HRMS absence plans. Ajaza checks a request against your balance, the law and your team's cover before your manager sees it." actions={<Btn kind="primary" onClick={() => setNr(true)}><Plane className="h-4 w-4" />{t('Request leave')}</Btn>} feature={<HeroFeature label="Annual leave balance" value={num(annual?.balance ?? 0, 1)} support={<Chip>{t('days')}</Chip>} />} />}>
      <StatRow>
        {me.balances.map((b: any) => <StatTile key={b.type_code} label={bi(b.name, b.name_ar)} value={num(b.balance, 1)} state={<Chip>{t('days left')}</Chip>} trend={{ direction: 'flat', label: `${num(b.entitlement, 0)} ${t('entitlement')}${b.carried_over ? ` + ${num(b.carried_over, 0)} ${t('carried')}` : ''} · ${num(b.taken, 1)} ${t('taken')}` }} />)}
      </StatRow>
      <PageColumns aside={<Panel icon={<BookOpen size={16} />} title="The rules that apply">
        <ul className="space-y-2 text-sm">
          <li>{t('At least 21 days a year, 30 days after five years of service (Art. 109); your contract may give more.')} <span className="font-mono text-[11px] text-muted-foreground">HR-04 §4.1</span></li>
          <li>{t('Up to 10 days carry into next year, used by 31 March.')} <span className="font-mono text-[11px] text-muted-foreground">§4.2</span></li>
          <li>{t('Sick leave: 30 days full pay, 60 days at 75%, 30 days unpaid in a year (Art. 117); medical certificate required.')} <span className="font-mono text-[11px] text-muted-foreground">§4.5</span></li>
          <li>{t('Paternity leave: 3 days paid (Art. 113). Maternity leave: 12 weeks paid (Art. 151).')} <span className="font-mono text-[11px] text-muted-foreground">§4.6</span></li>
        </ul>
      </Panel>}>
        <Panel icon={<CalendarDays size={16} />} title="Absence records" action={<SourceStamp resource="absences" />}>
          <Table><thead><tr><th>{t('Reference')}</th><th>{t('Type')}</th><th>{t('From')}</th><th>{t('To')}</th><th className="text-end">{t('Days')}</th><th>{t('Status')}</th></tr></thead>
            <tbody>{me.absences.map((a: any) => <tr key={a.absence_number}><td><Ref>{a.absence_number}</Ref></td><td>{bi(a.name, a.name_ar)}</td><td>{date(a.start_date, lang)}</td><td>{date(a.end_date, lang)}</td><td className="text-end tabular-nums">{num(a.days, 1)}</td><td><StatusChip status={a.status} /></td></tr>)}</tbody></Table>
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
    <Screen hero={<Hero tone="surface" eyebrow="My HR" title="Pay and documents" lede="Your salary record, payslips, end-of-service position and every letter issued to you."
      actions={<><Btn kind="primary" onClick={() => setNr('SALARY_CERTIFICATE')}>{t('Salary certificate')}</Btn><Btn onClick={() => setNr('ADVANCE')}>{t('Salary advance')}</Btn></>}
      feature={<HeroFeature label="Monthly gross" value={aed(total, lang)} support={<Chip>{w.grade_code}</Chip>} />} />}>
      <StatRow>
        <StatTile label="Basic" value={aed(w.basic, lang)} trend={{ direction: 'flat', label: `${t('grade range')} ${aed(w.grade_min, lang)}–${aed(w.grade_max, lang)}` }} />
        <StatTile label="Housing" value={aed(w.housing, lang)} />
        <StatTile label="Transport and other" value={aed(w.transport + w.other_allowance, lang)} />
        <StatTile label="Last net pay" value={aed(me.payslips[0]?.net, lang)} state={<Chip>{me.payslips[0]?.period_name}</Chip>} />
      </StatRow>
      <PageColumns aside={<>
        <Panel icon={<Landmark size={16} />} title="End of service"><EosSummary eos={me.eos} /></Panel>
        <Panel icon={<Wallet size={16} />} title="Salary advances" action={<PanelAction onClick={() => setNr('ADVANCE')}>{t('Request')}</PanelAction>}>
          {me.advances.length ? me.advances.map((a: any) => <StatusRow key={a.advance_number} name={`${a.advance_number} · ${aed(a.amount, lang)}`} detail={`${aed(a.monthly_recovery, lang)} × ${a.months} · ${t('outstanding')} ${aed(a.outstanding, lang)}`} status={<StatusChip status={a.status} />} />) : <p className="text-sm text-muted-foreground">{t('No advances. Limit today')}: {aed(me.advanceMax, lang)}.</p>}
        </Panel>
      </>}>
        <Panel icon={<Wallet size={16} />} title="Payslips" action={<SourceStamp resource="payrollResults" />}>
          <Table><thead><tr><th>{t('Period')}</th><th>{t('Paid')}</th><th className="text-end">{t('Gross')}</th><th className="text-end">{t('Deductions')}</th><th className="text-end">{t('Net')}</th></tr></thead>
            <tbody>{me.payslips.map((p: any) => <tr key={p.id} className="clickable" onClick={() => setSlip(p)}><td>{month(p.period_name, lang)}</td><td>{date(p.pay_date, lang)}</td><td className="text-end tabular-nums">{aed(p.gross, lang)}</td><td className="text-end tabular-nums">{aed(p.deductions, lang)}</td><td className="text-end font-semibold tabular-nums">{aed(p.net, lang)}</td></tr>)}</tbody></Table>
        </Panel>
        <Panel icon={<FileText size={16} />} title="Letters issued" action={<SourceStamp resource="documentRecords" />}>
          {me.documents.length ? <div className="space-y-2">{me.documents.map((d: any) => <RecordCard key={d.document_number} reference={<Ref>{d.document_number}</Ref>} state={<StatusChip status={d.status} />} title={t(({ SALARY_CERTIFICATE: 'Salary certificate', EMPLOYMENT_CERTIFICATE: 'Employment certificate', SALARY_TRANSFER: 'Salary transfer letter', NOC_TRAVEL: 'No-objection letter for travel', NOC_DRIVING: 'Introduction letter (to whom it may concern)', EXPERIENCE: 'Experience letter' } as any)[d.type] ?? d.type)} meta={<span className="text-xs text-muted-foreground">{d.addressee || t('To whom it may concern')} · {date(d.issued_at, lang)} · {d.language.toUpperCase()}</span>} onOpen={() => setDoc(d)} />)}</div> : <Empty>{t('No letters yet.')}</Empty>}
        </Panel>
      </PageColumns>
      <Dialog open={!!slip} onOpenChange={(o) => !o && setSlip(null)}>
        <DialogContent className="max-w-lg"><DialogTitle>{t('Payslip')} · {slip ? month(slip.period_name, lang) : ''}</DialogTitle>
          {slip ? <Table><tbody>{slip.lines.map((l: any) => <tr key={l.code}><td>{l.name}</td><td className="text-end tabular-nums">{l.kind === 'DEDUCTION' ? '−' : ''}{aed(l.amount, lang)}</td></tr>)}<tr><td className="font-semibold">{t('Net')}</td><td className="text-end font-semibold tabular-nums">{aed(slip.net, lang)}</td></tr></tbody></Table> : null}
          <ProvenanceNote>{t('Synthetic payroll result. Employer contributions are shown but not paid to you.')}</ProvenanceNote>
          {slip ? <DocumentDownload document={payslipDocument(slip, bi(w.display_name, w.display_name_ar), lang)} /> : null}
        </DialogContent>
      </Dialog>
      <Dialog open={!!doc} onOpenChange={(o) => !o && setDoc(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] min-w-0 max-w-3xl max-h-[90vh] overflow-x-hidden overflow-y-auto"><DialogTitle>{doc?.document_number}</DialogTitle>
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
  return (
    <Screen hero={<Hero tone="surface" eyebrow="My HR" title="Growth" lede={`${t('Goals, reviews, learning and openings inside')} ${cname}. ${t('Mezan prepares your check-ins; your manager rates.')}`} />}>
      <PageColumns aside={<>
        <Panel icon={<Award size={16} />} title="Reviews" action={<SourceStamp resource="performanceDocuments" />}>
          {me.performance.map((p: any) => <StatusRow key={p.review_period} name={p.review_period} detail={p.calibrated_rating ? `${t('Rating')} ${p.calibrated_rating} / 5` : p.manager_rating ? `${t('Manager rating')} ${p.manager_rating}` : t('In progress')} status={<StatusChip status={p.status} />} />)}
        </Panel>
        <Panel icon={<Sprout size={16} />} title="Internal openings" action={<PanelAction>{t('Apply internally first')}</PanelAction>}>
          <div className="space-y-2">{(hiring?.requisitions ?? []).filter((r: any) => r.status === 'OPEN').slice(0, 5).map((r: any) => <RecordCard key={r.req_number} reference={<Ref>{r.req_number}</Ref>} state={<Chip>{r.grade}</Chip>} title={bi(r.title, r.title_ar)} meta={<span className="text-xs text-muted-foreground">{r.department}</span>} />)}</div>
        </Panel>
      </>}>
        <Panel icon={<Target size={16} />} title={`${t('Goals')} · FY${cur}`}>
          <div className="space-y-3">{me.goals.filter((g: any) => g.year === cur).map((g: any) => (
            <div key={g.id} className="rounded-xl glass-l3 px-4 py-3">
              <div className="flex items-center gap-2"><span className="text-sm font-semibold">{bi(g.title, g.title_ar)}</span><StatusChip status={g.status} className="ms-auto" /></div>
              <div className="mt-2 flex items-center gap-3"><Bar value={g.progress} tone={g.status === 'AT_RISK' ? 'warn' : 'primary'} /><span className="w-12 text-end font-mono text-xs">{g.progress}%</span></div>
              <p className="mt-1 text-xs text-muted-foreground">{t('Weight')} {g.weight}%</p>
            </div>
          ))}</div>
        </Panel>
        <Panel icon={<BookOpen size={16} />} title="Learning">
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
          <ProvenanceNote>{t('Illustrative day-one plan prepared by Dalil.')}</ProvenanceNote>
        </Panel>
        <Panel icon={<BookOpen size={16} />} title="Before you start">
          <p className="text-sm">{t('Probation is set in your contract and cannot exceed 180 days in total (Art. 53). The working week is Sunday to Thursday. Ask Rafeeq anything.')}</p>
        </Panel>
      </>}>
        <Panel icon={<ClipboardCheck size={16} />} title={j ? `${t('Checklist')} · ${j.journey_number}` : t('Checklist')} action={<SourceStamp resource="journeys" />}>
          <div className="mb-3 flex items-center gap-3"><Bar value={done} max={tasks.length || 1} tone="success" /><span className="font-mono text-xs">{done}/{tasks.length}</span></div>
          <div className="space-y-2">{tasks.map((x: any) => (
            <div key={x.id} className="flex items-start gap-3 rounded-xl glass-l3 px-4 py-3">
              <StatusChip status={x.status} />
              <div className="min-w-0 flex-1"><p className="text-sm font-medium">{bi(x.title, x.title_ar)}</p><p className="text-xs text-muted-foreground">{t('Owner')}: {x.owner}{x.external_system ? ` · ${x.external_system}` : ''} · {t('due')} {date(x.due_date, lang)}</p>{x.note ? <p className="mt-1 text-xs text-danger">{x.note}</p> : null}</div>
            </div>
          ))}</div>
        </Panel>
      </PageColumns>
    </Screen>
  );
}
void api; void Kv;
