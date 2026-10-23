/** Shared pieces used across screens. Compose from Atelier; nothing here re-styles it. */
import type { ReactNode } from 'react';
import { DemoReference, AgentAutonomyChip, AgentAvatar, type AgentAutonomy } from '@cognirise/atelier/archetypes';
import { PageContainer, PageHero, StatRow as AtelierStatRow } from '@cognirise/atelier/layout';
import { cn } from '@cognirise/atelier/lib/utils';
import { CheckCircle2 } from 'lucide-react';
import { useLang } from '../lib/i18n';
import { initials } from '../lib/format';
import { useApp } from './state';

/** The client company of the current session (from /session). Session is not yet typed with `client` in state.tsx. */
export type ClientInfo = { key: string; code: string; name: string; name_ar: string; short: string; sector?: string; hrms?: string; hrmsLabel?: string; bank: [string, string]; services?: any };
export function useClient(): ClientInfo {
  const { session } = useApp();
  const c = (session as any)?.client as ClientInfo | undefined;
  return c ?? { key: '', code: '', name: 'the company', name_ar: 'الشركة', short: 'the company', bank: ['your bank', 'البنك'] };
}
/** Client name in the current language. */
export function useClientName(short = true) {
  const c = useClient();
  const { lang } = useLang();
  return lang === 'ar' ? c.name_ar : short ? c.short : c.name;
}

export const AUTONOMY: Record<string, AgentAutonomy> = { A0: 'observe', A1: 'recommend', A2: 'assisted', A3: 'supervised', A4: 'autonomous' };

export const AGENT_NAMES: Record<string, [string, string]> = {
  rafeeq: ['Rafeeq', 'رفيق'], murshid: ['Murshid', 'مرشد'], saeed: ['Saeed', 'سعيد'], hessa: ['Hessa', 'حصة'], tamkeen: ['Tamkeen', 'تمكين'], dalil: ['Dalil', 'دليل'],
  ajaza: ['Ajaza', 'إجازة'], wathiqa: ['Wathiqa', 'وثيقة'], mezan: ['Mezan', 'ميزان'], tarqiya: ['Tarqiya', 'ترقية'], hisab: ['Hisab', 'حساب'], nizam: ['Nizam', 'نظام'], sanad: ['Sanad', 'سند'], wadaa: ['Wadaa', 'وداع'], amin: ['Amin', 'أمين'],
  raqeeb: ['Raqeeb', 'رقيب'], fatoora: ['Fatoora', 'فاتورة'], tawzee: ['Tawzee', 'توزيع'], intiqal: ['Intiqal', 'انتقال'], basira: ['Basira', 'بصيرة'], hudoor: ['Hudoor', 'حضور'], wared: ['Wared', 'وارد'], aqd: ['Aqd', 'عقد'], tamin: ['Tamin', 'تأمين'], mutabaqa: ['Mutabaqa', 'مطابقة'], tahweel: ['Tahweel', 'تحويل'],
};

const STATUS: Record<string, { tone: string; en: string }> = {
  WAITING: { tone: 'is-warn', en: 'Waiting' }, RUNNING: { tone: 'is-primary', en: 'Running' }, COMPLETED: { tone: 'is-success', en: 'Completed' },
  REJECTED: { tone: 'is-danger', en: 'Declined' }, ESCALATED: { tone: 'is-danger', en: 'Escalated' }, CANCELLED: { tone: '', en: 'Withdrawn' },
  DONE: { tone: 'is-success', en: 'Done' }, PENDING: { tone: '', en: 'Pending' }, SKIPPED: { tone: '', en: 'Skipped' }, FAILED: { tone: 'is-danger', en: 'Failed' }, REFUSED: { tone: 'is-danger', en: 'Refused' },
  APPROVED: { tone: 'is-success', en: 'Approved' }, SUBMITTED: { tone: 'is-warn', en: 'Submitted' }, ISSUED: { tone: 'is-success', en: 'Issued' },
  NOT_STARTED: { tone: '', en: 'Not started' }, IN_PROGRESS: { tone: 'is-primary', en: 'In progress' }, BLOCKED: { tone: 'is-danger', en: 'Blocked' },
  OPEN: { tone: 'is-primary', en: 'Open' }, FILLED: { tone: 'is-success', en: 'Filled' }, ACTIVE: { tone: 'is-primary', en: 'Active' }, SETTLED: { tone: 'is-success', en: 'Settled' },
  BLOCKER: { tone: 'is-danger', en: 'Blocker' }, HIGH: { tone: 'is-danger', en: 'High' }, MEDIUM: { tone: 'is-warn', en: 'Medium' }, INFO: { tone: '', en: 'Info' }, LOW: { tone: '', en: 'Low' },
  URGENT: { tone: 'is-danger', en: 'Urgent' }, ACTION: { tone: 'is-warn', en: 'Action' }, WATCH: { tone: 'is-primary', en: 'Watch' }, NORMAL: { tone: '', en: 'Normal' },
  RESOLVED: { tone: 'is-success', en: 'Resolved' }, ON_TRACK: { tone: 'is-success', en: 'On track' }, AT_RISK: { tone: 'is-warn', en: 'At risk' },
  CLOSED: { tone: '', en: 'Closed' }, RELEASED: { tone: 'is-success', en: 'Released' }, IN_PROBATION: { tone: 'is-warn', en: 'In probation' }, CONFIRMED: { tone: 'is-success', en: 'Confirmed' },
  CALIBRATION: { tone: 'is-warn', en: 'Calibration' }, SELF_EVALUATION: { tone: '', en: 'Self-evaluation' }, MANAGER_EVALUATION: { tone: 'is-primary', en: 'Manager evaluation' }, SHARED: { tone: 'is-success', en: 'Shared' },
  NEW: { tone: '', en: 'New' }, SCREENING: { tone: 'is-primary', en: 'Screening' }, SHORTLISTED: { tone: 'is-success', en: 'Shortlisted' }, INTERVIEW: { tone: 'is-primary', en: 'Interview' }, ASSESSMENT: { tone: 'is-primary', en: 'Assessment' }, OFFER: { tone: 'is-warn', en: 'Offer' }, HIRED: { tone: 'is-success', en: 'Hired' }, NOT_SELECTED: { tone: '', en: 'Not selected' }, WITHDRAWN: { tone: '', en: 'Withdrawn' },
  EXTENDED: { tone: 'is-warn', en: 'Extended' }, ACCEPTED: { tone: 'is-success', en: 'Accepted' }, DECLINED: { tone: 'is-danger', en: 'Declined' },
  VACANT: { tone: 'is-danger', en: 'Vacant' }, IN_RECRUITMENT: { tone: 'is-primary', en: 'In recruitment' },
  PREPARED: { tone: 'is-warn', en: 'Waiting for approval' }, PAID: { tone: 'is-success', en: 'Paid' }, OVERDUE: { tone: 'is-danger', en: 'Overdue' }, BREACHED: { tone: 'is-danger', en: 'Breached' },
  NUDGED: { tone: 'is-primary', en: 'Reminded' }, MONITORING: { tone: 'is-primary', en: 'Monitoring' }, CROSS_CLIENT: { tone: 'is-warn', en: 'Across clients' }, CLIENT: { tone: '', en: 'One client' }, ASSIGNED: { tone: 'is-primary', en: 'Assigned' }, OPERATE: { tone: 'is-success', en: 'Operate' }, BUILD: { tone: 'is-warn', en: 'Build' }, TRANSFER: { tone: '', en: 'Transfer' },
};

export function StatusChip({ status, className }: { status: string | null | undefined; className?: string }) {
  const { t } = useLang();
  if (!status) return null;
  const s = STATUS[status] ?? { tone: '', en: status.replace(/_/g, ' ').toLowerCase() };
  return <span className={cn('mono-chip whitespace-nowrap', s.tone, className)}>{t(s.en)}</span>;
}

export function Chip({ children, tone, className }: { children: ReactNode; tone?: 'primary' | 'success' | 'warn' | 'danger'; className?: string }) {
  return <span className={cn('mono-chip whitespace-nowrap', tone && `is-${tone}`, className)}>{children}</span>;
}

export const Ref = ({ children }: { children: ReactNode }) => <DemoReference>{children}</DemoReference>;

export function Person({ name, sub, size = 28 }: { name: string; sub?: ReactNode; size?: number }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span className="flex shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/10 font-semibold text-primary" style={{ width: size, height: size, fontSize: size * 0.36 }}>{initials(name)}</span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-sm font-medium">{name}</span>
        {sub ? <span className="block truncate text-xs text-muted-foreground">{sub}</span> : null}
      </span>
    </span>
  );
}

export function AgentTag({ id, autonomy, showChip = true }: { id: string; autonomy?: string | null; showChip?: boolean }) {
  const { bi } = useLang();
  const n = AGENT_NAMES[id];
  if (!n) return <span className="text-sm">{id}</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <AgentAvatar agent={{ id, name: n[0], role: '', initials: bi(n[0], n[1]).slice(0, 2) }} size={22} showActivity={false} />
      <span className="text-sm font-medium">{bi(n[0], n[1])}</span>
      {showChip && autonomy && AUTONOMY[autonomy] ? <AgentAutonomyChip level={AUTONOMY[autonomy]} /> : null}
    </span>
  );
}

export function Btn({ children, onClick, kind = 'ghost', disabled, type = 'button', className, small }: { children: ReactNode; onClick?: () => void; kind?: 'primary' | 'ghost' | 'danger'; disabled?: boolean; type?: 'button' | 'submit'; className?: string; small?: boolean }) {
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={cn('pill-btn transition-transform active:scale-[0.97] motion-reduce:transform-none', kind === 'primary' ? 'pill-btn-primary' : 'pill-btn-ghost', kind === 'danger' && 'border-danger/50 text-danger hover:bg-danger/10', small && 'px-3 py-1.5 text-xs', className)}>
      {children}
    </button>
  );
}

export function Bar({ value, max = 100, tone = 'primary', className }: { value: number; max?: number; tone?: 'primary' | 'success' | 'warn' | 'danger' | 'accent'; className?: string }) {
  const w = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}>
      <div className={cn('h-full rounded-full', { primary: 'bg-primary', success: 'bg-success', warn: 'bg-warn', danger: 'bg-danger', accent: 'bg-accent' }[tone])} style={{ width: `${w}%` }} />
    </div>
  );
}

export function Empty({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">{icon ?? <CheckCircle2 className="h-4 w-4" />}</span>{children}</div>;
}

export function Kv({ k, v, mono }: { k: ReactNode; v: ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd className={cn('mt-0.5 break-words text-sm leading-snug', mono && 'font-mono')}>{v}</dd>
    </div>
  );
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('overflow-x-auto scroll-thin [&_td.tabular-nums]:whitespace-nowrap', className)}><table className="table-clean">{children}</table></div>;
}

/** Every screen: one hero, then the body. Provenance is said once, by "demo" in the title bar. */
export function Screen({ hero, children }: { hero: ReactNode; children: ReactNode; banner?: boolean }) {
  return (
    <div className="space-y-4">
      {hero}
      <div className="space-y-4">{children}</div>
    </div>
  );
}

/**
 * The work-screen hero: the same island, sized for work. The headline is a
 * sentence, so it is set at heading size, not display size, and the island
 * gives the screen back its height.
 */
export function Hero({ landing, ...props }: Parameters<typeof PageHero>[0] & { landing?: boolean }) {
  return <PageHero {...props} className={cn(landing ? 'min-h-[280px] py-8 sm:py-9' : 'py-5 sm:py-6', '[&_h1.headline]:text-[clamp(22px,1.9vw,28px)] [&_h1.headline]:leading-[1.2] [&_h1.headline]:tracking-[-0.01em] [&_.lede]:text-[14px] [&_.lede]:leading-relaxed [&_.eyebrow]:mb-0', props.className)} />;
}
export { PageContainer };

/** A source stamp for anything read from the HRMS through the connector. */
export function SourceStamp({ resource }: { resource: string }) {
  const { t } = useLang();
  const c = useClient();
  return <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{t('Source')}: {c.hrmsLabel ?? 'HRMS'} · {resource}</span>;
}

export function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

/** Stat tiles sized for a work screen: the figure reads at heading size, not display size. */
export function StatRow({ children, className }: { children: ReactNode; className?: string }) {
  return <AtelierStatRow className={cn('[&_p.text-3xl]:mt-2 [&_p.text-3xl]:text-[22px] [&_p.text-3xl]:font-bold [&_p.text-3xl]:leading-tight [&_.glass-l3]:py-3.5', className)}>{children}</AtelierStatRow>;
}

/**
 * Tabs on a page or a record: words only, no counts (a count belongs in the
 * headline). With `route`, each tab is a screen and the strip moves between
 * them; without it, the caller holds the value.
 */
export function TabStrip({ items, value, onChange }: { items: { id: string; label: string }[]; value: string; onChange: (id: string) => void }) {
  const { t } = useLang();
  return (
    <div role="tablist" className="flex flex-wrap gap-1 border-b border-border/70">
      {items.map((i) => (
        <button key={i.id} type="button" role="tab" aria-selected={value === i.id} onClick={() => onChange(i.id)}
          className={cn('-mb-px border-b-2 px-3 pb-2 pt-1 text-sm transition-colors active:scale-[0.98]', value === i.id ? 'border-primary font-semibold text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
          {t(i.label)}
        </button>
      ))}
    </div>
  );
}

/** Tabs that are screens: the strip goes to the screen. */
export function RouteTabs({ items }: { items: { id: string; label: string; param?: string | null }[] }) {
  const { route, go } = useApp();
  return <TabStrip items={items} value={route.screen} onChange={(id) => go(id, items.find((i) => i.id === id)?.param ?? null)} />;
}
