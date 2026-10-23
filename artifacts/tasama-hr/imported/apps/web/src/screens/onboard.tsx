/**
 * Add a payroll client (design/payroll-addendum.md §13, §19): the team drops a client's folder and
 * seven lanes fill as Intiqal and the other agents read it. Nothing reaches a client master until
 * the payroll lead approves; that decision follows the lanes.
 */
import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { HeroFeature, Panel } from '@cognirise/atelier/layout';
import { BookOpen, Building2, CalendarClock, FileSignature, FolderUp, History, Mail, Users } from 'lucide-react';
import { api, bump, post, useApi } from '../lib/api';
import { useLang } from '../lib/i18n';
import { num } from '../lib/format';
import { AgentTag, Btn, Chip, Hero, Screen } from '../app/ui';

type Lane = { key: string; state: 'WAITING' | 'READING' | 'DONE' | 'EMPTY'; files: number; headline: string; stats: { label: string; value: string | number; tone?: 'ok' | 'warn' | 'bad' }[]; issues: number };
type Issue = { id: string; code: string; lane: string; who: 'CLIENT' | 'TASAMA'; title: string; settle: string; people: { no: string; name: string }[] };

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
  const { t } = useLang();
  const { data, reload } = useApi<any>('/onboarding/current', { poll: 900 });
  const [busy, setBusy] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const o = data;
  const lanes: Lane[] = o?.lanes ?? [];
  const issues: Issue[] = o?.issues ?? [];
  const reading = o?.state === 'READING' || !!busy;
  const fileCount = (o?.files ?? []).reduce((s: number, f: any) => s + f.n, 0);

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
  const startAgain = async () => { if (o) await api(`/onboarding/${o.id}`, { method: 'DELETE' }); bump(); reload(); };

  const client = o?.client;
  const title = !o || !fileCount ? t('Drop a client\'s folder and its payroll moves onto the platform')
    : o.state === 'STAGED' ? `${client?.name ?? ''}: ${num(o.ready ?? 0)} ${t('of')} ${num(client?.headcount ?? 0)} ${t('employees are ready to take on')}`
    : `${t('Intiqal is reading')} ${num(fileCount)} ${t('files')}`;

  return (
    <Screen hero={<Hero tone="surface" eyebrow="Add a payroll client" title={title}
      lede={t('Spreadsheets, the policy manual, contracts and letters go into a staging area. Nothing reaches a client master until the payroll lead approves.')}
      feature={o?.state === 'STAGED' ? <HeroFeature label="Need the client" value={num(o.counts.client)} support={<span className="text-xs text-muted-foreground">{t('Tasama settles')} {num(o.counts.issues - o.counts.client)}</span>} /> : undefined}
      actions={o && fileCount ? <Btn small onClick={startAgain} disabled={reading}>{t('Start again')}</Btn> : undefined} />}>
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
          <Panel icon={<FolderUp size={16} />} title={o.state === 'STAGED' ? `${num(fileCount)} ${t('files read and matched; the issues are below')}` : `${num(fileCount)} ${t('files received')}`}>
            <div className="divide-y divide-border/60">
              {lanes.map((l) => <LaneRow key={l.key} lane={l} />)}
            </div>
          </Panel>
          {issues.length ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <IssueList title="The client settles these" items={issues.filter((i) => i.who === 'CLIENT')} tone="danger" />
              <IssueList title="Tasama settles these" items={issues.filter((i) => i.who === 'TASAMA')} tone="warn" />
            </div>
          ) : null}
        </>
      )}
    </Screen>
  );
}

/** "Main bank" → "main bank", but "GOSI establishment" keeps its capitals. */
const lower = (s: string) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);

function LaneRow({ lane }: { lane: Lane }) {
  const { t } = useLang();
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
          <p className="text-sm font-semibold leading-snug">{lane.headline}</p>
          {shown.length ? <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">{shown.map((s) => <span key={s.label}><span className="font-semibold text-foreground">{typeof s.value === 'number' ? num(s.value) : s.value}</span> {lower(t(s.label))}</span>)}</p> : null}
        </> : lane.state === 'EMPTY' ? <p className="text-sm text-muted-foreground">{lane.headline || t('No file for this lane in the folder')}</p>
          : <p className="text-sm text-muted-foreground">{lane.state === 'READING' ? t('Reading…') : t('Waiting')}</p>}
      </div>
      <div className="text-end">{lane.state === 'DONE' ? (lane.issues ? <Chip tone="danger">{lane.issues} {t(lane.issues === 1 ? 'issue' : 'issues')}</Chip> : <Chip tone="success">{t('Clean')}</Chip>) : null}</div>
    </div>
  );
}

function IssueList({ title, items, tone }: { title: string; items: Issue[]; tone: 'danger' | 'warn' }) {
  const { t } = useLang();
  return (
    <Panel title={`${t(title)} (${items.length})`}>
      <ul className="space-y-3">
        {items.map((i) => (
          <li key={i.id} className={`border-s-2 ps-3 ${tone === 'danger' ? 'border-danger' : 'border-warn'}`}>
            <p className="text-sm font-medium leading-snug">{i.title}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{i.settle}</p>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
