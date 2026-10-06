/** Shared pieces used across screens. Compose from Atelier; nothing here re-styles it. */
import type { ReactNode } from 'react';
import { DemoBanner, DemoReference, AgentAutonomyChip, AgentAvatar, type AgentAutonomy } from '@cognirise/atelier/archetypes';
import { PageContainer, PageHero } from '@cognirise/atelier/layout';
import { cn } from '@cognirise/atelier/lib/utils';
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
  ajaza: ['Ajaza', 'إجازة'], wathiqa: ['Wathiqa', 'وثيقة'], mezan: ['Mezan', 'ميزان'], tarqiya: ['Tarqiya', 'ترقية'], hisab: ['Hisab', 'حساب'], sanad: ['Sanad', 'سند'], wadaa: ['Wadaa', 'وداع'], amin: ['Amin', 'أمين'],
  raqeeb: ['Raqeeb', 'رقيب'], fatoora: ['Fatoora', 'فاتورة'], tawzee: ['Tawzee', 'توزيع'], intiqal: ['Intiqal', 'انتقال'],
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
  NUDGED: { tone: 'is-primary', en: 'Reminded' }, ASSIGNED: { tone: 'is-primary', en: 'Assigned' }, OPERATE: { tone: 'is-success', en: 'Operate' }, BUILD: { tone: 'is-warn', en: 'Build' }, TRANSFER: { tone: '', en: 'Transfer' },
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
      className={cn('pill-btn', kind === 'primary' ? 'pill-btn-primary' : 'pill-btn-ghost', kind === 'danger' && 'border-danger/50 text-danger hover:bg-danger/10', small && 'px-3 py-1.5 text-xs', className)}>
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

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">{children}</div>;
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
  return <div className={cn('overflow-x-auto scroll-thin', className)}><table className="table-clean">{children}</table></div>;
}

/** Every screen: one hero, the synthetic-data banner, then the body. */
export function Screen({ hero, children, banner = true }: { hero: ReactNode; children: ReactNode; banner?: boolean }) {
  const { t } = useLang();
  const c = useClient();
  const tasamaView = typeof window !== 'undefined' && window.location.hash.startsWith('#/tasama-');
  return (
    <div className="space-y-4">
      {hero}
      {banner ? (
        <DemoBanner kind="synthetic" title={t('Synthetic data')} className="py-2.5">
          {tasamaView
            ? t('Client names are real PIF portfolio companies; every person, policy, contract, fee and figure is fictional. Each client HRMS (Oracle HCM or Odoo) is simulated.')
            : <>{t('Every person, case and figure here is generated for this demo. The HRMS is a simulation of')} {c.hrmsLabel ?? 'the HRMS'}.</>}
        </DemoBanner>
      ) : null}
      <div className="space-y-4">{children}</div>
    </div>
  );
}

export function Hero(props: Parameters<typeof PageHero>[0]) {
  return <PageHero {...props} />;
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
