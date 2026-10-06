/**
 * Tasama HR — the shell.
 *
 * Atelier frame: backdrop, assistant rail, pinned header, the menu as chrome
 * beside the display area, every screen inside <MainPanel>. The title bar
 * carries the product wordmark and the client switcher; the Tasama lockup
 * sits in the rail.
 *
 * Five lenses — Tasama Services, My HR, My Team, HR Workspace, Agent Control —
 * and the persona decides which of them exist. The menu inside a lens also follows the
 * persona: Payroll does not see calibration, Talent acquisition does not see
 * payroll. Persona switching is in the user badge, because nobody wants to
 * navigate mid-demo.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { AppShell, ContextNav, LensPicker, MainPanel, TitleBar, TitleBarSearch, UserBadge, Wordmark, useAppChrome, useChatRail, type ContextNavItem } from '@cognirise/atelier/layout';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@cognirise/atelier/components/ui/dropdown-menu';
import { Bell, Bot, Briefcase, CalendarDays, ClipboardCheck, Coins, DoorOpen, FileText, FlaskConical, GitBranch, Home, Inbox, LayoutGrid, LineChart, Network, Play, Scale, Settings as SettingsIcon, ShieldCheck, Sprout, TrendingUp, UserPlus, Users, Wallet } from 'lucide-react';
import { useApi } from './lib/api';
import { LanguageToggle, useLang } from './lib/i18n';
import { initials, ago } from './lib/format';
import { useApp, type LensId, LENS_HOME } from './app/state';
import { TasamaPortfolio, TasamaAccount, TasamaSla, TasamaEscalations, TasamaFinance, TasamaDelivery, TasamaPolicies } from './screens/tasama';
import { Building2, Gauge, Receipt, AlertTriangle, BookOpen, ChevronDown } from 'lucide-react';
import { AssistantRail } from './app/assistant';
import { CaseDrawer } from './app/case';

import { MyHome, MyRequests, MyLeave, MyPay, MyGrowth, MyOnboarding } from './screens/my';
import { TeamScreen, TeamApprovals, TeamHiring, TeamPerformance } from './screens/team';
import { HrInbox, Lifecycle, Workforce, PersonScreen } from './screens/hr-core';
import { HrHiring, HrOnboarding, HrPerformance } from './screens/hr-talent';
import { HrPayroll, HrExits, HrCompliance } from './screens/hr-ops';
import { AgentsScreen, WorkflowsScreen, ScenariosScreen, ConnectorScreen, EvidenceScreen, PoliciesScreen, ValueScreen, SettingsScreen } from './screens/control';

try { if (!localStorage.getItem('atelier-nav-orientation')) localStorage.setItem('atelier-nav-orientation', 'vertical'); } catch { /* */ }

type Item = ContextNavItem & { show?: (roles: string[], key: string) => boolean };
const I = (n: ReactNode) => n;

const MENUS: Record<LensId, Item[]> = {
  tasama: [
    { id: 'tasama-portfolio', label: 'Portfolio', icon: I(<LayoutGrid size={14} />) },
    { id: 'tasama-account', label: 'Client accounts', icon: I(<Building2 size={14} />) },
    { id: 'tasama-sla', label: 'Service levels', icon: I(<Gauge size={14} />) },
    { id: 'tasama-escalations', label: 'Escalations', icon: I(<AlertTriangle size={14} />) },
    { id: 'tasama-finance', label: 'Finance', icon: I(<Receipt size={14} />) },
    { id: 'tasama-delivery', label: 'Delivery team', icon: I(<Users size={14} />) },
    { id: 'tasama-policies', label: 'HR policies', icon: I(<BookOpen size={14} />) },
  ],
  my: [
    { id: 'my-home', label: 'Home', icon: I(<Home size={14} />) },
    { id: 'my-requests', label: 'Requests', icon: I(<ClipboardCheck size={14} />) },
    { id: 'my-leave', label: 'Leave', icon: I(<CalendarDays size={14} />) },
    { id: 'my-pay', label: 'Pay and documents', icon: I(<Wallet size={14} />) },
    { id: 'my-growth', label: 'Growth', icon: I(<Sprout size={14} />) },
    { id: 'my-onboarding', label: 'Onboarding', icon: I(<UserPlus size={14} />), show: (r) => r.includes('JOINER') },
  ],
  team: [
    { id: 'team', label: 'Team', icon: I(<Users size={14} />) },
    { id: 'team-approvals', label: 'Approvals', icon: I(<Inbox size={14} />) },
    { id: 'team-hiring', label: 'Hiring', icon: I(<UserPlus size={14} />) },
    { id: 'team-performance', label: 'Performance', icon: I(<TrendingUp size={14} />) },
  ],
  hr: [
    { id: 'hr-inbox', label: 'Inbox', icon: I(<Inbox size={14} />) },
    { id: 'hr-lifecycle', label: 'Lifecycle', icon: I(<LayoutGrid size={14} />) },
    { id: 'hr-workforce', label: 'Workforce', icon: I(<Users size={14} />) },
    { id: 'hr-hiring', label: 'Positions and hiring', icon: I(<Briefcase size={14} />), show: (r) => r.some((x) => ['TA', 'HRBP', 'CHRO'].includes(x)) },
    { id: 'hr-onboarding', label: 'Onboarding and probation', icon: I(<UserPlus size={14} />) },
    { id: 'hr-performance', label: 'Performance and talent', icon: I(<TrendingUp size={14} />), show: (r) => r.some((x) => ['HRBP', 'CHRO'].includes(x)) },
    { id: 'hr-payroll', label: 'Payroll and rewards', icon: I(<Coins size={14} />), show: (r) => r.some((x) => ['PAYROLL', 'CHRO'].includes(x)) },
    { id: 'hr-exits', label: 'Exits and relations', icon: I(<DoorOpen size={14} />), show: (r) => r.some((x) => ['PAYROLL', 'HRBP', 'CHRO'].includes(x)) },
    { id: 'hr-compliance', label: 'Compliance', icon: I(<ShieldCheck size={14} />), show: (r) => r.some((x) => ['PAYROLL', 'HRBP', 'CHRO'].includes(x)) },
  ],
  control: [
    { id: 'agents', label: 'Agents', icon: I(<Bot size={14} />) },
    { id: 'workflows', label: 'Workflows', icon: I(<GitBranch size={14} />) },
    { id: 'scenarios', label: 'Scenarios', icon: I(<Play size={14} />) },
    { id: 'connector', label: 'HRMS connector', icon: I(<Network size={14} />) },
    { id: 'evidence', label: 'Evidence', icon: I(<Scale size={14} />) },
    { id: 'policies', label: 'Policies', icon: I(<FileText size={14} />) },
    { id: 'value', label: 'Value', icon: I(<LineChart size={14} />) },
    { id: 'settings', label: 'Settings', icon: I(<SettingsIcon size={14} />) },
  ],
};
const LENSES: { id: LensId; label: string }[] = [{ id: 'tasama', label: 'Tasama Services' }, { id: 'my', label: 'My HR' }, { id: 'team', label: 'My Team' }, { id: 'hr', label: 'HR Workspace' }, { id: 'control', label: 'Agent Control' }];

const SCREENS: Record<string, () => ReactNode> = {
  'tasama-portfolio': () => <TasamaPortfolio />, 'tasama-account': () => <TasamaAccount />, 'tasama-sla': () => <TasamaSla />, 'tasama-escalations': () => <TasamaEscalations />,
  'tasama-finance': () => <TasamaFinance />, 'tasama-delivery': () => <TasamaDelivery />, 'tasama-policies': () => <TasamaPolicies />,
  'my-home': () => <MyHome />, 'my-requests': () => <MyRequests />, 'my-leave': () => <MyLeave />, 'my-pay': () => <MyPay />, 'my-growth': () => <MyGrowth />, 'my-onboarding': () => <MyOnboarding />,
  team: () => <TeamScreen />, 'team-approvals': () => <TeamApprovals />, 'team-hiring': () => <TeamHiring />, 'team-performance': () => <TeamPerformance />,
  'hr-inbox': () => <HrInbox />, 'hr-lifecycle': () => <Lifecycle />, 'hr-workforce': () => <Workforce />, person: () => <PersonScreen />,
  'hr-hiring': () => <HrHiring />, 'hr-onboarding': () => <HrOnboarding />, 'hr-performance': () => <HrPerformance />,
  'hr-payroll': () => <HrPayroll />, 'hr-exits': () => <HrExits />, 'hr-compliance': () => <HrCompliance />,
  agents: () => <AgentsScreen />, workflows: () => <WorkflowsScreen />, scenarios: () => <ScenariosScreen />, connector: () => <ConnectorScreen />,
  evidence: () => <EvidenceScreen />, policies: () => <PoliciesScreen />, value: () => <ValueScreen />, settings: () => <SettingsScreen />,
};

function PersonaMenu() {
  const { persona, session, switchPersona, go } = useApp();
  const { bi, t } = useLang();
  if (!persona || !session) return null;
  const row = (p: any) => (
    <DropdownMenuItem key={p.key} onSelect={() => switchPersona(p.key)} className="items-start gap-3 py-2">
      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${p.key === persona.key ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}>{initials(p.display_name)}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{bi(p.label, p.label_ar)}</span>
        <span className="block truncate text-xs text-muted-foreground">{bi(p.display_name, p.display_name_ar)} · {bi(p.role_title, p.role_title_ar)}</span>
      </span>
      {p.inbox ? <span className="mono-chip is-warn">{p.inbox}</span> : null}
    </DropdownMenuItem>
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <span><UserBadge name={bi(persona.display_name, persona.display_name_ar)} role={bi(persona.label, persona.label_ar)} initials={initials(persona.display_name)} /></span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>{t('Tasama HR Services')}</DropdownMenuLabel>
        {session.personas.filter((p) => p.key === 'tasama').map(row)}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t('Inside')} {bi(session.client.short, session.client.name_ar)}</DropdownMenuLabel>
        {session.personas.filter((p) => p.key !== 'tasama').map(row)}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => go('settings')}><SettingsIcon className="me-2 h-4 w-4" />{t('Settings and approval limits')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The client account in view. Personas inside a client are that client's people; Tasama works across all. */
function ClientSwitcher() {
  const { session, switchClient, route } = useApp();
  const { bi, t } = useLang();
  if (!session) return null;
  const c = session.client;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="flex min-w-0 items-center gap-2 rounded-full border border-border/70 bg-card/50 px-3 py-1.5 text-sm hover:bg-card">
          <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate font-medium">{bi(c.short, c.name_ar)}</span>
          <span className={`mono-chip shrink-0 ${c.hrms === 'ODOO' ? 'is-warn' : 'is-primary'}`}>{c.hrms === 'ODOO' ? 'Odoo' : 'Oracle'}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80">
        <DropdownMenuLabel>{t('Client account')}</DropdownMenuLabel>
        {session.clients.map((x) => (
          <DropdownMenuItem key={x.key} onSelect={() => switchClient(x.key, route.screen)} className="items-start gap-3 py-2">
            <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${x.key === c.key ? 'bg-primary' : 'border border-border'}`} />
            <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{bi(x.name, x.name_ar)}</span><span className="block text-xs text-muted-foreground">{bi(x.sector, x.sector_ar)} · {x.hrmsLabel}</span></span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Notifications() {
  const { t, bi, lang } = useLang();
  const { openCase, persona } = useApp();
  const { data } = useApi<any[]>(persona ? `/notifications?k=${persona.key}` : null, { poll: 15000 });
  const n = (data ?? []).filter((x) => !x.read).length;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="relative text-muted-foreground hover:text-foreground" aria-label={t('Notifications')}>
          <Bell className="h-4 w-4" />
          {n ? <span className="absolute -end-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">{n}</span> : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>{t('Notifications')}</DropdownMenuLabel>
        {(data ?? []).slice(0, 8).map((x) => (
          <DropdownMenuItem key={x.id} onSelect={() => x.link?.startsWith('case:') && openCase(x.link.slice(5))} className="block py-2">
            <span className="block text-sm font-medium">{bi(x.title, x.title_ar)}</span>
            <span className="block text-xs text-muted-foreground">{x.body} · {ago(x.created_at, lang)}</span>
          </DropdownMenuItem>
        ))}
        {!data?.length ? <p className="px-2 py-3 text-sm text-muted-foreground">{t('Nothing new.')}</p> : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Search() {
  const { t } = useLang();
  const { go, openCase, persona } = useApp();
  const [q, setQ] = useState('');
  const canPeople = !!persona?.roles.some((r) => ['HRBP', 'TA', 'PAYROLL', 'CHRO', 'LINE_MANAGER'].includes(r));
  return (
    <TitleBarSearch placeholder={canPeople ? t('Search people or a case reference') : t('Search a case reference')} value={q} onChange={setQ}
      onSubmit={() => { const v = q.trim(); if (!v) return; if (/^[A-Z]{3}-CASE/i.test(v)) openCase(v.toUpperCase()); else if (canPeople) go('hr-workforce', v); else go('my-requests'); setQ(''); }} />
  );
}
void Search;

export default function App() {
  const rail = useChatRail(true);
  const chrome = useAppChrome();
  const { persona, route, go, lens } = useApp();
  const { t } = useLang();
  const lenses = useMemo(() => LENSES.filter((l) => persona?.lenses.includes(l.id)), [persona]);
  const items = useMemo(() => (MENUS[lens] ?? []).filter((i) => !i.show || i.show(persona?.roles ?? [], persona?.key ?? '')).map((i) => ({ ...i, onSelect: () => go(i.id) })), [lens, persona, go]);
  const screen = SCREENS[route.screen];
  return (
    <>
      <AppShell
        rail={rail}
        chrome={chrome}
        chatRail={<AssistantRail rail={rail} />}
        titleBar={
          <TitleBar
            brand={<button type="button" onClick={() => go(LENS_HOME[lens])} className="flex items-center gap-2"><img src="/brand/mark.png" alt="" className="h-7 w-7 dark:hidden" /><img src="/brand/mark-on-dark.png" alt="" className="hidden h-7 w-7 dark:block" /><Wordmark className="text-lg">{t('Tasama HR')}</Wordmark></button>}
            search={<ClientSwitcher />}
            lens={lenses.length ? <LensPicker lenses={lenses} value={lens} onChange={(id) => go(LENS_HOME[id as LensId])} /> : undefined}
            utilities={<div className="flex items-center gap-3"><LanguageToggle /><Notifications /></div>}
            user={<PersonaMenu />}
          />
        }
        contextNav={<ContextNav items={items} value={route.screen === 'person' ? 'hr-workforce' : route.screen} chrome={chrome} />}
      >
        <MainPanel>{persona && screen ? screen() : <div className="p-10 text-center text-sm text-muted-foreground">{t('Loading…')}</div>}</MainPanel>
      </AppShell>
      <CaseDrawer />
    </>
  );
}
void FlaskConical; void Search; void Gauge; void Receipt; void AlertTriangle;
