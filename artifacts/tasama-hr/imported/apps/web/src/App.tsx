/**
 * Tasama HR — the shell.
 *
 * Atelier frame: backdrop, assistant rail, pinned header, the menu as chrome
 * beside the display area, every screen inside <MainPanel>.
 *
 * The title bar holds five things (MENU-DISCIPLINE.md): the brand, one lens
 * picker, notifications and language, the person, and the Demo control.
 * Lenses are the hats one person wears — Tasama Services, each client's HR
 * (for Tasama), My HR, My Team, HR Workspace, How it works — and the menu
 * inside a lens follows the role. The rig (scenarios, persona, client
 * account, demo data, theme) is in the Demo control, not the menu.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppShell, ContextNav, LensPicker, MainPanel, TitleBar, TitleBarSearch, UserBadge, Wordmark, useAppChrome, useChatRail, type ContextNavItem } from '@cognirise/atelier/layout';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@cognirise/atelier/components/ui/dropdown-menu';
import { Bell, Bot, Briefcase, CalendarDays, ClipboardCheck, Coins, DoorOpen, FileText, GitBranch, Home, Inbox, LayoutGrid, LineChart, Scale, ShieldCheck, Sprout, TrendingUp, UserPlus, Users, Wallet } from 'lucide-react';
import { useApi } from './lib/api';
import { LanguageToggle, useLang } from './lib/i18n';
import { initials, ago } from './lib/format';
import { useApp, type LensId, lensHome } from './app/state';
import { DemoControl } from './app/demo-control';
import { TasamaPortfolio, TasamaAccount, TasamaSla, TasamaEscalations, TasamaFinance, TasamaDelivery, TasamaPolicies, TasamaPatterns } from './screens/tasama';
import { DirectorBar } from './app/director';
import { Receipt, AlertTriangle, BookOpen } from 'lucide-react';
import { AssistantRail } from './app/assistant';
import { CaseDrawer } from './app/case';
import { plain } from './app/decision';

import { MyHome, MyRequests, MyLeave, MyPay, MyGrowth, MyOnboarding } from './screens/my';
import { TeamScreen, TeamApprovals, TeamHiring, TeamPerformance } from './screens/team';
import { HrInbox, Lifecycle, Workforce, PersonScreen } from './screens/hr-core';
import { ChroOverview } from './screens/chro';
import { HrHiring, HrOnboarding, HrPerformance } from './screens/hr-talent';
import { HrPayroll, HrExits, HrCompliance } from './screens/hr-ops';
import { AgentsScreen, WorkflowsScreen, ScenariosScreen, ConnectorScreen, EvidenceScreen, PoliciesScreen, ValueScreen, SettingsScreen } from './screens/control';

try { if (!localStorage.getItem('atelier-nav-orientation')) localStorage.setItem('atelier-nav-orientation', 'vertical'); } catch { /* */ }

type Item = ContextNavItem & { show?: (roles: string[], key: string) => boolean };
const I = (n: ReactNode) => n;

const MENUS: Record<LensId, Item[]> = {
  tasama: [
    { id: 'tasama-portfolio', label: 'Overview', icon: I(<LayoutGrid size={14} />) },
    { id: 'tasama-escalations', label: 'Escalations', icon: I(<AlertTriangle size={14} />) },
    { id: 'tasama-patterns', label: 'Patterns', icon: I(<TrendingUp size={14} />) },
    { id: 'tasama-finance', label: 'Finance', icon: I(<Receipt size={14} />) },
    { id: 'tasama-delivery', label: 'Delivery team', icon: I(<Users size={14} />) },
    { id: 'tasama-policies', label: 'Client handbooks', icon: I(<BookOpen size={14} />) },
  ],
  my: [
    { id: 'my-onboarding', label: 'Onboarding', icon: I(<UserPlus size={14} />), show: (r) => r.includes('JOINER') },
    { id: 'my-home', label: 'Home', icon: I(<Home size={14} />) },
    { id: 'my-requests', label: 'Requests', icon: I(<ClipboardCheck size={14} />) },
    { id: 'my-leave', label: 'Leave', icon: I(<CalendarDays size={14} />) },
    { id: 'my-pay', label: 'Pay and documents', icon: I(<Wallet size={14} />) },
    { id: 'my-growth', label: 'Growth', icon: I(<Sprout size={14} />) },
  ],
  team: [
    { id: 'team-approvals', label: 'Approvals', icon: I(<Inbox size={14} />) },
    { id: 'team', label: 'Team', icon: I(<Users size={14} />) },
    { id: 'team-hiring', label: 'Hiring', icon: I(<UserPlus size={14} />) },
    { id: 'team-performance', label: 'Performance', icon: I(<TrendingUp size={14} />) },
  ],
  hr: [
    { id: 'hr-overview', label: 'Overview', icon: I(<LayoutGrid size={14} />), show: (_r, k) => k === 'chro' },
    { id: 'hr-inbox', label: 'Inbox', icon: I(<Inbox size={14} />) },
    { id: 'hr-workforce', label: 'Workforce', icon: I(<Users size={14} />) },
    { id: 'hr-hiring', label: 'Hiring', icon: I(<Briefcase size={14} />), show: (r) => r.some((x) => ['TA', 'HRBP', 'CHRO'].includes(x)) },
    { id: 'hr-onboarding', label: 'Onboarding', icon: I(<UserPlus size={14} />) },
    { id: 'hr-performance', label: 'Performance', icon: I(<TrendingUp size={14} />), show: (r) => r.some((x) => ['HRBP', 'CHRO'].includes(x)) },
    { id: 'hr-payroll', label: 'Payroll', icon: I(<Coins size={14} />), show: (r) => r.some((x) => ['PAYROLL', 'CHRO'].includes(x)) },
    { id: 'hr-exits', label: 'Exits', icon: I(<DoorOpen size={14} />), show: (r) => r.some((x) => ['PAYROLL', 'HRBP', 'CHRO'].includes(x)) },
    // For the CHRO, Compliance is a tab of the Overview, so the lens stays at eight.
    { id: 'hr-compliance', label: 'Compliance', icon: I(<ShieldCheck size={14} />), show: (r, k) => k !== 'chro' && r.some((x) => ['PAYROLL', 'HRBP', 'CHRO'].includes(x)) },
  ],
  control: [
    { id: 'agents', label: 'Agents', icon: I(<Bot size={14} />) },
    { id: 'workflows', label: 'Workflows', icon: I(<GitBranch size={14} />) },
    { id: 'policies', label: 'Rules', icon: I(<FileText size={14} />) },
    { id: 'evidence', label: 'Audit trail', icon: I(<Scale size={14} />) },
    { id: 'value', label: 'Value', icon: I(<LineChart size={14} />) },
  ],
};
const LENSES: { id: LensId; label: string }[] = [{ id: 'tasama', label: 'Tasama Services' }, { id: 'my', label: 'My HR' }, { id: 'team', label: 'My Team' }, { id: 'hr', label: 'HR Workspace' }, { id: 'control', label: 'How it works' }];
/** Which menu item a screen that is not in the menu lights up. */
const NAV_OF: Record<string, string> = { 'tasama-account': 'tasama-portfolio', 'tasama-sla': 'tasama-portfolio', person: 'hr-workforce', connector: 'evidence' };

const SCREENS: Record<string, () => ReactNode> = {
  'tasama-portfolio': () => <TasamaPortfolio />, 'tasama-account': () => <TasamaAccount />, 'tasama-sla': () => <TasamaSla />, 'tasama-escalations': () => <TasamaEscalations />,
  'tasama-patterns': () => <TasamaPatterns />, 'tasama-finance': () => <TasamaFinance />, 'tasama-delivery': () => <TasamaDelivery />, 'tasama-policies': () => <TasamaPolicies />,
  'my-home': () => <MyHome />, 'my-requests': () => <MyRequests />, 'my-leave': () => <MyLeave />, 'my-pay': () => <MyPay />, 'my-growth': () => <MyGrowth />, 'my-onboarding': () => <MyOnboarding />,
  team: () => <TeamScreen />, 'team-approvals': () => <TeamApprovals />, 'team-hiring': () => <TeamHiring />, 'team-performance': () => <TeamPerformance />,
  'hr-inbox': () => <HrInbox />, 'hr-lifecycle': () => <Lifecycle />, 'hr-overview': () => <ChroOverview />, 'hr-workforce': () => <Workforce />, person: () => <PersonScreen />,
  'hr-hiring': () => <HrHiring />, 'hr-onboarding': () => <HrOnboarding />, 'hr-performance': () => <HrPerformance />,
  'hr-payroll': () => <HrPayroll />, 'hr-exits': () => <HrExits />, 'hr-compliance': () => <HrCompliance />,
  agents: () => <AgentsScreen />, workflows: () => <WorkflowsScreen />, scenarios: () => <ScenariosScreen />, connector: () => <ConnectorScreen />,
  evidence: () => <EvidenceScreen />, policies: () => <PoliciesScreen />, value: () => <ValueScreen />, settings: () => <SettingsScreen />,
};

/** The person: who is looking. Click to view the platform as someone else, with what they may approve. */
function PersonaMenu() {
  const { persona, session, switchPersona } = useApp();
  const { bi, t } = useLang();
  if (!persona || !session) return null;
  const row = (p: any) => (
    <DropdownMenuItem key={p.key} onSelect={() => switchPersona(p.key)} className="items-start gap-3 py-2">
      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${p.key === persona.key ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}>{initials(p.display_name)}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{bi(p.label, p.label_ar)}</span>
        <span className="block truncate text-xs text-muted-foreground">{bi(p.display_name, p.display_name_ar)} · {bi(p.role_title, p.role_title_ar)}</span>
        {p.key === persona.key && p.approval_limits?.length ? <span className="mt-1 block text-[11px] leading-snug text-muted-foreground">{t('May approve')}: {p.approval_limits.map((l: any) => bi(l.what, l.what_ar)).join('; ')}</span> : null}
      </span>
    </DropdownMenuItem>
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="rounded-full text-start" aria-label={t('View the platform as')}><UserBadge name={bi(persona.display_name, persona.display_name_ar)} role={bi(persona.label, persona.label_ar)} initials={initials(persona.display_name)} /></button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[75vh] w-80 overflow-y-auto">
        <DropdownMenuLabel>{t('View the platform as')}</DropdownMenuLabel>
        {session.personas.map(row)}
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
            <span className="block text-xs text-muted-foreground">{plain(x.body)} · {ago(x.created_at, lang)}</span>
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
  const { persona: who } = useApp();
  // The assistant is where the employee's and the manager's work starts; people who work in lists get the room.
  useEffect(() => { if (who) rail.setOpen(['employee', 'joiner', 'manager'].includes(who.key) && window.innerWidth >= 1024); }, [who?.key]);
  const chrome = useAppChrome();
  const { persona, route, go, lens, booting, director } = useApp();
  const { t } = useLang();
  const { session, switchClient } = useApp();
  const tasama = persona?.key === 'tasama';
  // For Tasama, each client's HR is a lens of its own: one picker instead of a lens picker and a client switcher.
  const lenses = useMemo(() => LENSES.filter((l) => persona?.lenses.includes(l.id)).flatMap((l) => (tasama && l.id === 'hr' ? (session?.clients ?? []).map((c) => ({ id: `hr:${c.key}`, label: `${c.short} HR` })) : [{ id: l.id, label: l.label }])), [persona, tasama, session]);
  const lensValue = tasama && lens === 'hr' ? `hr:${session?.client.key}` : lens;
  const pickLens = (id: string) => { if (id.startsWith('hr:')) switchClient(id.slice(3), 'hr-inbox'); else go(lensHome(id as LensId, persona)); };
  const items = useMemo(() => (MENUS[lens] ?? []).filter((i) => !i.show || i.show(persona?.roles ?? [], persona?.key ?? '')).map((i) => ({ ...i, onSelect: () => go(i.id) })), [lens, persona, go]);
  const navValue = route.screen === 'hr-compliance' && persona?.key === 'chro' ? 'hr-overview' : NAV_OF[route.screen] ?? route.screen;
  const screen = SCREENS[route.screen];
  return (
    <>
      <AppShell
        rail={rail}
        chrome={chrome}
        chatRail={<AssistantRail rail={rail} />}
        titleBar={
          <TitleBar
            brand={<button type="button" onClick={() => go(lensHome(lens, persona))} className="flex items-center gap-2"><img src="/brand/mark.png" alt="" className="h-7 w-7 dark:hidden" /><img src="/brand/mark-on-dark.png" alt="" className="hidden h-7 w-7 dark:block" /><Wordmark className="text-lg">{t('Tasama HR')}</Wordmark><span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('demo')}</span></button>}
            theme={false}
            lens={lenses.length > 1 ? <LensPicker lenses={lenses} value={lensValue} onChange={pickLens} /> : undefined}
            utilities={<div className="flex items-center gap-3"><Notifications /><LanguageToggle /></div>}
            user={<div className="flex items-center gap-3"><PersonaMenu /><DemoControl /></div>}
          />
        }
        contextNav={<ContextNav items={items} value={navValue} chrome={chrome} />}
      >
        <MainPanel>{persona && screen ? screen() : <div className="p-10 text-center text-sm text-muted-foreground">{booting ? t('Preparing the demo data: the five client accounts and Tasama\'s records are being built. This takes about a minute; the page opens by itself.') : t('Loading…')}</div>}{director ? <div aria-hidden className="h-56" /> : null}</MainPanel>
      </AppShell>
      <CaseDrawer />
      <DirectorBar />
    </>
  );
}

