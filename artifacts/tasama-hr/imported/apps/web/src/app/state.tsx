/**
 * App state: who is looking (persona), where they are (lens and screen, in
 * the URL hash so a screen can be shared), and the case drawer that any
 * screen can open.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, getPersona, getClient, setPersonaKey, setClientKey, useVersion } from '../lib/api';

export type PersonaInfo = {
  key: string; person_id: number; label: string; label_ar: string; role_title: string; role_title_ar: string;
  lenses: string[]; roles: string[]; approval_limits: { what: string; what_ar: string }[]; display_name: string; display_name_ar: string; person_number: string; inbox?: number;
};
export type ClientInfo = { key: string; code: string; name: string; name_ar: string; short: string; sector: string; sector_ar: string; hrms: 'ORACLE' | 'ODOO'; hrmsLabel: string; bank?: [string, string]; services?: string[] };
export type Session = { persona: PersonaInfo; personas: PersonaInfo[]; client: ClientInfo; clients: ClientInfo[]; ai: { mode: 'claude' | 'offline'; model: string; via?: string }; today: string };

export type LensId = 'tasama' | 'my' | 'team' | 'hr' | 'control';
export const LENS_OF: Record<string, LensId> = {
  'my-home': 'my', 'my-requests': 'my', 'my-leave': 'my', 'my-pay': 'my', 'my-growth': 'my', 'my-onboarding': 'my',
  team: 'team', 'team-approvals': 'team', 'team-hiring': 'team', 'team-performance': 'team',
  'hr-inbox': 'hr', 'hr-lifecycle': 'hr', 'hr-workforce': 'hr', 'hr-hiring': 'hr', 'hr-onboarding': 'hr', 'hr-performance': 'hr', 'hr-payroll': 'hr', 'hr-exits': 'hr', 'hr-compliance': 'hr', person: 'hr',
  'tasama-portfolio': 'tasama', 'tasama-account': 'tasama', 'tasama-sla': 'tasama', 'tasama-escalations': 'tasama', 'tasama-finance': 'tasama', 'tasama-delivery': 'tasama', 'tasama-policies': 'tasama',
  agents: 'control', workflows: 'control', scenarios: 'control', connector: 'control', evidence: 'control', policies: 'control', value: 'control', settings: 'control',
};
export const LENS_HOME: Record<LensId, string> = { tasama: 'tasama-portfolio', my: 'my-home', team: 'team', hr: 'hr-inbox', control: 'agents' };
/** Where a persona lands. */
export const homeLens = (p: { lenses: string[] }): LensId => (p.lenses.includes('tasama') ? 'tasama' : p.lenses.includes('hr') ? 'hr' : p.lenses.includes('team') ? 'team' : 'my');

type Route = { screen: string; param: string | null };
const parseHash = (): Route => {
  const h = window.location.hash.replace(/^#\/?/, '');
  const [screen, param] = h.split('/');
  return { screen: screen || '', param: param ? decodeURIComponent(param) : null };
};

type Ctx = {
  session: Session | null;
  persona: PersonaInfo | null;
  switchPersona: (key: string) => void;
  client: ClientInfo | null;
  switchClient: (key: string, screen?: string) => void;
  route: Route;
  go: (screen: string, param?: string | null) => void;
  lens: LensId;
  caseRef: string | null;
  openCase: (ref: string | null) => void;
  has: (role: string) => boolean;
  reloadSession: () => void;
};
const AppCtx = createContext<Ctx | null>(null);

export function AppState({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [route, setRoute] = useState<Route>(parseHash);
  const [caseRef, setCaseRef] = useState<string | null>(null);
  const v = useVersion();

  const loadSession = useCallback(async () => {
    const s = await api<Session>('/session');
    setSession(s);
    return s;
  }, []);
  useEffect(() => { loadSession(); }, [loadSession, v]);
  useEffect(() => {
    const on = () => setRoute(parseHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const persona = session?.persona ?? null;
  const allowed = useCallback((screen: string) => {
    if (!persona) return true;
    const l = LENS_OF[screen];
    if (screen === 'settings') return true;
    return l ? persona.lenses.includes(l) : false;
  }, [persona]);

  // Land on the lens home when the screen is empty or not allowed for this persona.
  useEffect(() => {
    if (!persona) return;
    if (!route.screen || !allowed(route.screen)) {
      window.location.hash = `#/${LENS_HOME[homeLens(persona)]}`;
    }
  }, [persona, route.screen, allowed]);

  const go = useCallback((screen: string, param: string | null = null) => {
    window.location.hash = `#/${screen}${param ? `/${encodeURIComponent(param)}` : ''}`;
    window.scrollTo({ top: 0 });
  }, []);

  const switchPersona = useCallback((key: string) => {
    setPersonaKey(key);
    setCaseRef(null);
    loadSession().then((s) => { window.location.hash = `#/${LENS_HOME[homeLens(s.persona)]}`; });
  }, [loadSession]);

  /** Enter another client account. The same persona role is kept; the people behind it are that client's. */
  const switchClient = useCallback((key: string, screen?: string) => {
    setClientKey(key);
    setCaseRef(null);
    loadSession().then((s) => { window.location.hash = `#/${screen && (LENS_OF[screen] ? s.persona.lenses.includes(LENS_OF[screen]) : true) ? screen : LENS_HOME[homeLens(s.persona)]}`; });
  }, [loadSession]);

  const lens: LensId = LENS_OF[route.screen] ?? (persona ? homeLens(persona) : 'my');
  const client = session?.client ?? null;
  const value = useMemo<Ctx>(() => ({
    session, persona, switchPersona, client, switchClient, route, go, lens, caseRef, openCase: setCaseRef,
    has: (r: string) => !!persona?.roles.includes(r), reloadSession: loadSession,
  }), [session, persona, switchPersona, client, switchClient, route, go, lens, caseRef, loadSession]);
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp outside AppState');
  return c;
}
export { getPersona, getClient };
