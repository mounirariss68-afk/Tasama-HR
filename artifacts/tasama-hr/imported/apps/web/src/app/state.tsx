/**
 * App state: who is looking (persona), where they are (lens and screen, in
 * the URL hash so a screen can be shared), and the case drawer that any
 * screen can open.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, post, bump, getPersona, getClient, setPersonaKey, setClientKey, useVersion } from '../lib/api';

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
  'hr-inbox': 'hr', 'hr-lifecycle': 'hr', 'hr-overview': 'hr', 'hr-workforce': 'hr', 'hr-hiring': 'hr', 'hr-onboarding': 'hr', 'hr-performance': 'hr', 'hr-payroll': 'hr', 'hr-exits': 'hr', 'hr-compliance': 'hr', person: 'hr',
  'tasama-portfolio': 'tasama', 'tasama-account': 'tasama', 'tasama-sla': 'tasama', 'tasama-escalations': 'tasama', 'tasama-finance': 'tasama', 'tasama-delivery': 'tasama', 'tasama-policies': 'tasama', 'tasama-patterns': 'tasama',
  agents: 'control', workflows: 'control', connector: 'control', evidence: 'control', policies: 'control', value: 'control',
};
/** The rig: reached from the Demo control by every persona, in no lens. */
export const RIG = new Set(['scenarios', 'settings']);
export const LENS_HOME: Record<LensId, string> = { tasama: 'tasama-portfolio', my: 'my-home', team: 'team-approvals', hr: 'hr-inbox', control: 'agents' };
/** A lens's landing for this persona: the joiner starts on Onboarding, the CHRO on the Overview. */
export const lensHome = (l: LensId, p?: { key: string } | null): string => (l === 'my' && p?.key === 'joiner' ? 'my-onboarding' : l === 'hr' && p?.key === 'chro' ? 'hr-overview' : LENS_HOME[l]);
/** Where a persona lands. */
export const homeLens = (p: { lenses: string[] }): LensId => (p.lenses.includes('tasama') ? 'tasama' : p.lenses.includes('hr') ? 'hr' : p.lenses.includes('team') ? 'team' : 'my');
/** Where a persona lands. */
export const homeScreen = (p: { key: string; lenses: string[] }): string => lensHome(homeLens(p), p);

type Route = { screen: string; param: string | null };

/** The Demo Director: a scenario played step by step (Play / Pause / Step / Back). */
export type DirectorOutline = { id: string; title: string; title_ar: string; trigger: string; persona: string; screen: string; kind: string };
export type DirectorResult = {
  index: number; total: number; step: { id: string; title: string; title_ar: string; trigger: string; kind: string }; narration: string;
  persona: string; client: string; screen: string; caseRef: string | null; pattern: string | null; result: string; error: string | null;
  changes: { trail: any[]; cases: any[]; tasama: any[] };
};
export type Director = {
  key: string; title: string; title_ar: string; run: number; client: string; steps: DirectorOutline[];
  index: number; results: Record<number, DirectorResult>; status: 'running' | 'done'; auto: boolean; busy: boolean; error: string | null;
};
export const AUTO_STEP_MS = 9000;
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
  booting: string | null;
  director: Director | null;
  startScenario: (key: string) => Promise<void>;
  stepScenario: (dir: 1 | -1) => Promise<void>;
  stopScenario: () => void;
  setAuto: (on: boolean) => void;
};
const AppCtx = createContext<Ctx | null>(null);

export function AppState({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [route, setRoute] = useState<Route>(parseHash);
  const [caseRef, setCaseRef] = useState<string | null>(null);
  const v = useVersion();

  const [booting, setBooting] = useState<string | null>(null);
  const loadSession = useCallback(async (): Promise<Session> => {
    try {
      const s = await api<Session>('/session');
      setSession(s); setBooting(null);
      return s;
    } catch (e: any) {
      // While the server builds the demo data it answers 503; wait and try again.
      setBooting(e.message);
      await new Promise((r) => setTimeout(r, 3000));
      return loadSession();
    }
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
    if (RIG.has(screen)) return true;
    return l ? persona.lenses.includes(l) : false;
  }, [persona]);

  const go = useCallback((screen: string, param: string | null = null) => {
    window.location.hash = `#/${screen}${param ? `/${encodeURIComponent(param)}` : ''}`;
    window.scrollTo({ top: 0 });
  }, []);

  const switchPersona = useCallback((key: string) => {
    setPersonaKey(key);
    setCaseRef(null);
    loadSession().then((s) => { window.location.hash = `#/${homeScreen(s.persona)}`; });
  }, [loadSession]);

  /** Enter another client account. The same persona role is kept; the people behind it are that client's. */
  const switchClient = useCallback((key: string, screen?: string) => {
    setClientKey(key);
    setCaseRef(null);
    loadSession().then((s) => { window.location.hash = `#/${screen && (LENS_OF[screen] ? s.persona.lenses.includes(LENS_OF[screen]) : true) ? screen : homeScreen(s.persona)}`; });
  }, [loadSession]);

  // ---------------------------------------------------------------- the Demo Director
  const [director, setDirector] = useState<Director | null>(null);
  const auto = useRef<number | null>(null);
  /** Put the app where a step says: client account, persona, screen, then the case or pattern. */
  const show = useCallback(async (r: DirectorResult) => {
    if (getClient() !== r.client) setClientKey(r.client);
    if (getPersona() !== r.persona) setPersonaKey(r.persona);
    await loadSession();
    setCaseRef(null);
    window.location.hash = `#/${r.screen}${r.pattern ? `/${encodeURIComponent(r.pattern)}` : ''}`;
    if (r.caseRef) window.setTimeout(() => setCaseRef(r.caseRef), 350);
  }, [loadSession]);
  const runIndex = useCallback(async (d: Director, index: number) => {
    setDirector((x) => x && { ...x, busy: true, error: null });
    try {
      const r = await post<DirectorResult>(`/director/runs/${d.run}/step`, { index });
      bump();
      setDirector((x) => x && { ...x, busy: false, index, results: { ...x.results, [index]: r }, status: index >= x.steps.length - 1 ? 'done' : 'running', auto: index >= x.steps.length - 1 ? false : x.auto });
      await show(r);
    } catch (e: any) { setDirector((x) => x && { ...x, busy: false, auto: false, error: e.message }); }
  }, [show]);
  const startScenario = useCallback(async (key: string) => {
    const r = await post<any>(`/director/${key}/start`);
    const d: Director = { key, title: r.scenario.title, title_ar: r.scenario.title_ar, run: r.run, client: r.client, steps: r.scenario.steps, index: -1, results: {}, status: 'running', auto: false, busy: false, error: null };
    setDirector(d);
    await runIndex(d, 0);
  }, [runIndex]);
  const stepScenario = useCallback(async (dir: 1 | -1) => {
    if (!director || director.busy) return;
    const next = director.index + dir;
    if (next < 0 || next >= director.steps.length) return;
    // A step already played is shown again, not run again.
    const done = director.results[next];
    if (done) { setDirector((x) => x && { ...x, index: next }); await show(done); return; }
    await runIndex(director, next);
  }, [director, runIndex, show]);
  const stopScenario = useCallback(() => { post('/director/stop').catch(() => {}); setDirector(null); if (auto.current) window.clearTimeout(auto.current); }, []);
  const setAuto = useCallback((on: boolean) => setDirector((x) => x && { ...x, auto: on }), []);
  useEffect(() => {
    if (!director?.auto || director.busy || director.index >= director.steps.length - 1) return;
    auto.current = window.setTimeout(() => { stepScenario(1); }, AUTO_STEP_MS);
    return () => { if (auto.current) window.clearTimeout(auto.current); };
  }, [director?.auto, director?.busy, director?.index, director?.steps.length, stepScenario]);

  // Land on the lens home when the screen is empty or not allowed for this persona.
  useEffect(() => {
    if (!persona) return;
    // A scenario step may show a proof screen outside the persona's lenses (the audit trail for the recruiter): the Director's choice stands.
    if (director) return;
    if (!route.screen || !allowed(route.screen)) {
      window.location.hash = `#/${homeScreen(persona)}`;
    }
  }, [persona, route.screen, allowed, director]);

  const lens: LensId = LENS_OF[route.screen] ?? (persona ? homeLens(persona) : 'my');
  const client = session?.client ?? null;
  const value = useMemo<Ctx>(() => ({
    session, persona, switchPersona, client, switchClient, route, go, lens, caseRef, openCase: setCaseRef,
    has: (r: string) => !!persona?.roles.includes(r), reloadSession: loadSession, booting,
    director, startScenario, stepScenario, stopScenario, setAuto,
  }), [session, persona, switchPersona, client, switchClient, route, go, lens, caseRef, loadSession, booting, director, startScenario, stepScenario, stopScenario, setAuto]);
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp outside AppState');
  return c;
}
export { getPersona, getClient };
