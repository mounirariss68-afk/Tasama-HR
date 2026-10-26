/**
 * Add a payroll client (design/payroll-addendum.md §13, §19): the team drops a client's folder and
 * seven lanes fill as Intiqal and the other agents read it. Nothing reaches a client master until
 * the payroll manager approves; that decision follows the lanes.
 */
import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { HeroFeature, Panel } from '@cognirise/atelier/layout';
import { BookOpen, Building2, CalendarClock, ClipboardCheck, FileSignature, FolderUp, History, Mail, Users } from 'lucide-react';
import { api, bump, post, useApi } from '../lib/api';
import { useLang } from '../lib/i18n';
import { date, num } from '../lib/format';
import { AgentTag, Btn, Chip, Hero, Screen } from '../app/ui';
import { useApp } from '../app/state';
import { onboardingCard } from '../app/decision';
import { FactGrid, Recommendation } from '../app/case';

type Lane = { key: string; state: 'WAITING' | 'READING' | 'DONE' | 'EMPTY'; files: number; headline: string; headline_ar?: string; stats: { label: string; label_ar?: string; value: string | number; value_ar?: string; tone?: 'ok' | 'warn' | 'bad' }[]; issues: number };
type Issue = { id: string; code: string; lane: string; who: 'CLIENT' | 'TASAMA'; title: string; title_ar?: string; settle: string; settle_ar?: string; people: { no: string; name: string }[] };

const LANE: Record<string, { label: string; agent: string; icon: ReactNode; expect: number }> = {
  client: { label: 'Client', agent: 'intiqal', icon: <Building2 size={16} />, expect: 2 },
  roster: { label: 'Roster', agent: 'intiqal', icon: <Users size={16} />, expect: 1 },
  policy: { label: 'Policy', agent: 'nizam', icon: <BookOpen size={16} />, expect: 1 },
  contracts: { label: 'Contracts', agent: 'aqd', icon: <FileSignature size={16} />, expect: 62 },
  letters: { label: 'Letters', agent: 'intiqal', icon: <Mail size={16} />, expect: 18 },
  history: { label: 'History', agent: 'hisab', icon: <History size={16} />, expect: 6 },
  leave: { label: 'Leave and provisions', agent: 'intiqal', icon: <CalendarClock size={16} />, expect: 2 },
};

/** Every file in a dropped folder, with its path inside the folder. */
async function filesOf(e: DragEvent): Promise<{ path: string; file: File }[]> {
  const out: { path: string; file: File }[] = [];
  const walk = async (entry: any, prefix: string): Promise<void> => {
    if (entry.isFile) { const file: File = await new Promise((res, rej) => entry.file(res, rej)); out.push({ path: prefix + file.name, file }); return; }
    const reader = entry.createReader();
    let batch: any[];
    do { batch = await new Promise((res, rej) => reader.readEntries(res, rej)); for (const x of batch) await walk(x, `${prefix}${entry.name}/`); } while (batch.length);
  };
  const entries = [...e.dataTransfer.items].map((i) => (i as any).webkitGetAsEntry?.()).filter(Boolean);
  if (entries.length) {
    // A single dropped folder is the client's folder: paths start inside it.
    if (entries.length === 1 && entries[0].isDirectory) { const reader = entries[0].createReader(); let batch: any[]; do { batch = await new Promise((res, rej) => reader.readEntries(res, rej)); for (const x of batch) await walk(x, ''); } while (batch.length); }
    else for (const x of entries) await walk(x, '');
  } else for (const f of [...e.dataTransfer.files]) out.push({ path: f.name, file: f });
  return out.filter((x) => !x.path.split('/').pop()!.startsWith('.'));
}

export function AddPayrollClient() {
  const { t, bi, lang } = useLang();
  const { persona, go } = useApp();
  const { data, reload } = useApi<any>('/onboarding/current', { poll: 900 });
  const [busy, setBusy] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [returning, setReturning] = useState(false);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const o = data;
  const lanes: Lane[] = o?.lanes ?? [];
  const issues: Issue[] = o?.issues ?? [];
  const reading = o?.state === 'READING' || !!busy;
  const fileCount = (o?.files ?? []).reduce((s: number, f: any) => s + f.n, 0);
  const lead = persona?.key === 'tasama-lead';

  const upload = async (files: { path: string; file: File }[]) => {
    if (!files.length) return;
    setBusy(`${t('Receiving')} 0 / ${files.length}`);
    try {
      const { id } = await post('/onboarding');
      let n = 0;
      for (const f of files) {
        await api(`/onboarding/${id}/files?path=${encodeURIComponent(f.path)}`, { method: 'POST', body: f.file, headers: { 'content-type': 'application/octet-stream' } });
        setBusy(`${t('Receiving')} ${++n} / ${files.length}`);
      }
      await post(`/onboarding/${id}/read`, { pace: 900 });
    } finally { setBusy(null); bump(); reload(); }
  };
  // A client already taken on stays; starting again opens a new drop.
  const startAgain = async () => { if (o && o.state !== 'LIVE') await api(`/onboarding/${o.id}`, { method: 'DELETE' }); else await post('/onboarding'); bump(); reload(); };
  const decide = async (decision: 'APPROVED' | 'RETURNED') => {
    if (decision === 'RETURNED' && !returning) { setReturning(true); return; }
    setBusy(t(decision === 'APPROVED' ? 'Taking the client on…' : 'Returning…')); setErr(null);
    try { await post(`/onboarding/${o.id}/decide`, { decision, reason: reason.trim() || undefined }); setReturning(false); setReason(''); }
    catch (e: any) { setErr(e.message); } finally { setBusy(null); bump(); reload(); }
  };

  const client = o?.client;
  const name = bi(client?.name, client?.name_ar);
  const month = o?.from ? new Date(`${o.from}-01T00:00:00Z`).toLocaleString(lang === 'ar' ? 'ar' : 'en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : '';
  const title = !o || !fileCount ? t('Drop a client\'s folder and its payroll moves onto the platform')
    : o.state === 'LIVE' ? `${name} ${t('is a Tasama client from')} ${month}`
    : o.state === 'RETURNED' ? `${name} ${t('was returned; nothing was written')}`
    : o.state === 'STAGED' ? `${name}: ${num(o.ready ?? 0)} ${t('of')} ${num(client?.headcount ?? 0)} ${t('employees are ready to take on')}`
    : `${t('Intiqal is reading')} ${num(fileCount)} ${t('files')}`;
  const card = o?.state === 'STAGED' ? onboardingCard(o, { t, bi, lang }) : null;

  return (
    <Screen hero={<Hero tone="surface" eyebrow="Add a payroll client" title={title}
      lede={o?.state === 'LIVE' ? `${t('Its master is in Tasama HR, its questions are with its HR operations, and')} ${month} ${t('is open for changes.')}`
        : o?.state === 'RETURNED' ? `${o.decided_by}: ${o.reason}`
        : t('Spreadsheets, the policy manual, contracts and letters go into a staging area. Nothing reaches a client master until the payroll manager approves.')}
      feature={o?.state === 'LIVE' ? <HeroFeature label="Need the client" value={num(o.counts.client)} support={<span className="text-xs text-muted-foreground">{t('Tasama settles')} {num(o.counts.issues - o.counts.client)}</span>} /> : undefined}
      actions={o && fileCount ? <>
        {o.state === 'LIVE' ? <Btn small kind="primary" onClick={() => go('payroll-inputs')}>{t('Open the first month')}</Btn> : null}
        <Btn small onClick={startAgain} disabled={reading}>{t(o.state === 'LIVE' ? 'Add another client' : 'Start again')}</Btn>
      </> : undefined} />}>
      {!o || !fileCount ? (
        <div onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={async (e) => { e.preventDefault(); setOver(false); await upload(await filesOf(e)); }}
          className={`flex min-h-[340px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${over ? 'border-primary bg-primary/5' : 'border-border bg-card/40'}`}>
          <FolderUp size={44} className={over ? 'text-primary' : 'text-muted-foreground'} />
          <p className="text-lg font-semibold">{busy ?? t('Drop the client\'s folder here')}</p>
          <p className="max-w-md text-sm text-muted-foreground">{t('The master data, payroll months, provisions, leave tracker, policy manual, contracts and letters, as the client keeps them.')}</p>
          <input ref={input} type="file" multiple className="hidden" {...({ webkitdirectory: '' } as any)}
            onChange={async (e) => { const fs = [...(e.target.files ?? [])].map((f) => ({ path: (f as any).webkitRelativePath?.split('/').slice(1).join('/') || f.name, file: f })); await upload(fs); e.target.value = ''; }} />
          <Btn onClick={() => input.current?.click()} disabled={!!busy}>{t('Choose the folder')}</Btn>
        </div>
      ) : (
        <>
          {card ? (
            <section className="space-y-4 rounded-2xl border border-primary/30 bg-card p-5 shadow-sm">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{card.kind}</span>
                <h2 className="mt-1.5 text-lg font-semibold leading-snug">{card.headline}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{lead ? t('Your decision as payroll manager') : `${t('Waiting on')} Sharifa AlMousa, ${t('payroll manager')}`}</p>
              </div>
              <FactGrid facts={card.facts} />
              {card.rec ? <Recommendation rec={card.rec} agent={card.agent ?? null} /> : null}
              {lead ? (
                <div className="space-y-2.5">
                  {returning ? <input className="input h-10 w-full text-sm" autoFocus placeholder={t('What has to change before the client is taken on')} value={reason} onChange={(e) => setReason(e.target.value)} /> : null}
                  {err ? <p className="text-sm text-danger">{err}</p> : null}
                  <div className="flex flex-wrap justify-end gap-2">
                    {returning ? <Btn onClick={() => { setReturning(false); setErr(null); }} disabled={!!busy}>{t('Cancel')}</Btn> : null}
                    <Btn kind="danger" onClick={() => decide('RETURNED')} disabled={!!busy}>{t(returning ? 'Confirm the return' : 'Return it')}</Btn>
                    {!returning ? <Btn kind="primary" onClick={() => decide('APPROVED')} disabled={!!busy}>{busy ?? `${t('Take it on from')} ${month}`}</Btn> : null}
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}
          <Panel icon={<FolderUp size={16} />} title={o.state === 'READING' ? `${num(fileCount)} ${t('files received')}` : `${num(fileCount)} ${t('files read and matched; the issues are below')}`}>
            <div className="divide-y divide-border/60">
              {lanes.map((l) => <LaneRow key={l.key} lane={l} />)}
            </div>
          </Panel>
          {issues.length ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <IssueList title={o.state === 'LIVE' ? 'Sent to the client\'s HR operations' : 'The client settles these'} items={issues.filter((i) => i.who === 'CLIENT')} tone="danger" />
              <IssueList title="Tasama settles these" items={issues.filter((i) => i.who === 'TASAMA')} tone="warn" />
            </div>
          ) : null}
          {o.checklist ? <ActivationChecklist o={o} onChange={() => { bump(); reload(); }} /> : null}
        </>
      )}
    </Screen>
  );
}

/**
 * The activation checklist (walkthrough addendum R40): the 26 requirements Tasama asks a new client for, in seven
 * categories, inside nine working days and before the first cut-off. Intiqal ticks what the files cover; Tasama HR
 * operations ticks the rest as it arrives.
 */
function ActivationChecklist({ o, onChange }: { o: any; onChange: () => void }) {
  const { t, bi, lang } = useLang();
  const c = o.checklist;
  const [busy, setBusy] = useState<number | null>(null);
  const receive = async (n: number) => { setBusy(n); try { await post(`/onboarding/${o.id}/activation/${n}/received`); onChange(); } finally { setBusy(null); } };
  const cats = [...new Set(c.items.map((i: any) => i.category))] as string[];
  const fromFiles = c.items.filter((i: any) => i.state === 'FROM_FILES').length;
  return (
    <Panel icon={<ClipboardCheck size={16} />} title={c.received === c.total ? t('Every activation requirement is in: the client can go live before its first cut-off') : `${c.received} ${t('of')} ${c.total} ${t('activation requirements are in')}: ${fromFiles} ${t('read from the files')}, ${c.total - c.received} ${t('to collect by')} ${date(c.due_on, lang)}`}
      action={<span className="text-xs text-muted-foreground">{t('SLA')} {c.sla_days} {t('working days')}{c.overdue ? ` · ${t('past due')}` : ''}</span>}>
      <div className="grid gap-x-6 gap-y-3 md:grid-cols-2 xl:grid-cols-3">{cats.map((cat) => { const rows = c.items.filter((i: any) => i.category === cat); return (
        <div key={cat}>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{bi(cat, rows[0].category_ar)} · {rows.filter((i: any) => i.state !== 'PENDING').length}/{rows.length}</p>
          <ul className="space-y-1">{rows.map((i: any) => (
            <li key={i.n} className="flex items-center gap-2 text-sm">
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border text-[10px] ${i.state === 'FROM_FILES' ? 'border-primary bg-primary text-white' : i.state === 'RECEIVED' ? 'border-success bg-success text-white' : 'border-border'}`}>{i.state === 'PENDING' ? '' : '✓'}</span>
              <span className={`flex-1 ${i.state === 'PENDING' ? '' : 'text-muted-foreground'}`}>{bi(i.label, i.label_ar)}</span>
              {i.state === 'FROM_FILES' ? <span className="text-[10px] text-primary">{t('from the files')}</span> : i.state === 'PENDING' && o.state !== 'LIVE' ? <button type="button" className="text-[11px] text-primary hover:underline" disabled={busy === i.n} onClick={() => receive(i.n)}>{t('Received')}</button> : null}
            </li>))}</ul>
        </div>); })}</div>
    </Panel>
  );
}

/** "Main bank" → "main bank", but "GOSI establishment" keeps its capitals. */
const lower = (s: string) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);

function LaneRow({ lane }: { lane: Lane }) {
  const { t, bi, lang } = useLang();
  const meta = LANE[lane.key];
  const n = lane.state === 'DONE' ? lane.files : meta.expect;
  // The headline carries the counts that matter; the line under it adds what the headline does not say.
  const shown = lane.stats.filter((s) => !s.tone).slice(0, 4);
  return (
    <div className={`grid items-center gap-4 py-3 md:grid-cols-[200px_minmax(0,1fr)_minmax(0,1.3fr)_88px] ${lane.state === 'WAITING' ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">{meta.icon}</span>
        <span><span className="block text-sm font-semibold">{t(meta.label)}</span><AgentTag id={meta.agent} showChip={false} /></span>
      </div>
      <div className="flex flex-wrap gap-[3px]" aria-label={`${lane.files} ${t('files')}`}>
        {Array.from({ length: Math.max(1, n) }, (_, i) => (
          <span key={i} className={`h-3 w-3 rounded-[3px] ${lane.state === 'DONE' ? 'bg-primary' : lane.state === 'READING' ? 'onb-read bg-primary' : 'bg-muted'}`}
            style={lane.state === 'READING' ? { animationDelay: `${(i % 30) * 40}ms` } : undefined} />
        ))}
      </div>
      <div className="min-w-0">
        {lane.state === 'DONE' ? <>
          <p className="text-sm font-semibold leading-snug">{bi(lane.headline, lane.headline_ar)}</p>
          {shown.length ? <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">{shown.map((s) => <span key={s.label}><span className="font-semibold text-foreground">{typeof s.value === 'number' ? num(s.value) : lang === 'ar' ? s.value_ar || t(String(s.value)) : s.value}</span> {lang === 'ar' ? s.label_ar ?? s.label : lower(s.label)}</span>)}</p> : null}
        </> : lane.state === 'EMPTY' ? <p className="text-sm text-muted-foreground">{bi(lane.headline, lane.headline_ar) || t('No file for this lane in the folder')}</p>
          : <p className="text-sm text-muted-foreground">{lane.state === 'READING' ? t('Reading…') : t('Waiting')}</p>}
      </div>
      <div className="text-end">{lane.state === 'DONE' ? (lane.issues ? <Chip tone="danger">{lane.issues} {t(lane.issues === 1 ? 'issue' : 'issues')}</Chip> : <Chip tone="success">{t('Clean')}</Chip>) : null}</div>
    </div>
  );
}

function IssueList({ title, items, tone }: { title: string; items: Issue[]; tone: 'danger' | 'warn' }) {
  const { t, bi } = useLang();
  return (
    <Panel title={`${t(title)} (${items.length})`}>
      <ul className="space-y-3">
        {items.map((i) => (
          <li key={i.id} className={`border-s-2 ps-3 ${tone === 'danger' ? 'border-danger' : 'border-warn'}`}>
            <p className="text-sm font-medium leading-snug">{bi(i.title, i.title_ar)}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{bi(i.settle, i.settle_ar)}</p>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
