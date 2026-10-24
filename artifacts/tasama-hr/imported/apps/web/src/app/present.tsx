/**
 * Present mode — the demo without PowerPoint (design/stage-addendum.md;
 * canon stage 5). Ported from QIB Jahiz.
 *
 * A storyline is a list of chapters. A card chapter is drawn full screen by
 * the app (the hero island, one claim per card, live numbers from the five
 * client accounts). A scenario chapter hands the room to the Director on the
 * Stage, and is followed by an interlude whose numbers are counted from the
 * steps the room just saw. The right arrow moves through everything, so the
 * presenter never touches the mouse.
 *
 * Storylines are edited in Settings › Demo and stored on the server; the
 * shipped ones live here and are merged with what is stored.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Loader2, Maximize2, Minimize2, Pause, Play, Plus, Trash2, X } from 'lucide-react';
import { api, useApi } from '../lib/api';
import { useLang } from '../lib/i18n';
import { AUTO_STEP_MS, useApp, type Director } from './state';
import { Btn, Chip, Field } from './ui';

const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// ------------------------------------------------------------------ model
/** Shown in the Present bar so the presenter can tell which build is running. Bump it with every change to Present mode or the Stage. */
export const PRESENT_BUILD = '1.3';
export type CardLayout = 'statement' | 'steps' | 'columns' | 'agenda';
export type CardChapter = { kind: 'card'; id: string; layout: CardLayout; eyebrow?: string; title: string; lines: string[] };
export type ScenarioChapter = { kind: 'scenario'; id: string; scenario: string; audience?: string; question?: string };
export type Chapter = CardChapter | ScenarioChapter;
export type Storyline = { id: string; name: string; chapters: Chapter[] };

/** Tokens a card may use; filled from the five client accounts when the card is shown. */
export const TOKENS = ['{clients}', '{employees}', '{openCases}', '{cases30d}', '{noTouchPct}', '{slaMet}', '{slaScored}', '{today}', '{payrollPaid}', '{payrollGross}', '{monthsPaid}', '{journalsPosted}', '{bankFiles}', '{payrollRules}', '{oracleClients}', '{platformClients}'];

const REAL_CLAUDE_SIMULATED: CardChapter = { kind: 'card', id: 'real', layout: 'columns', eyebrow: 'Honest boundaries', title: 'Here is what is real, what is Claude and what is simulated.', lines: [
  '## Real', 'The workflows, the approvals and the trail: who may decide what, and the reason when a decision goes against the agent', 'The Saudi rules the agents apply: advance caps (Art. 92 and 93), end of service, notice and leave', 'Service levels per contract, the escalations and the invoices, computed from the cases',
  '## Claude', 'Rafeeq and Murshid: understanding the request and answering from the client\'s handbook, when Claude is connected', 'Wording the letters and the explanations', 'The likely cause Basira gives for a rising problem',
  '## Simulated', 'Each client\'s employee master (Oracle HCM, or Tasama HR for clients with no system), behind one connector that logs every call', 'Qiwa, GOSI, Muqeem, Mudad and the banks', 'Every client, employee and case: synthetic data, marked DEMO'] };
const PROMISE: CardChapter = { kind: 'card', id: 'promise', layout: 'statement', eyebrow: 'The rule behind it', title: 'Agents check, prepare and recommend, and people decide.', lines: ['Nothing is written to a client\'s HRMS before the person who owns the decision approves it.', 'An agent told to break a rule refuses, cites the clause and tells someone.', 'Every step is on the audit trail, and every HRMS call is on the integration log.'] };

/** What is real, Claude and simulated in the payroll storylines: the engine is arithmetic, and only Nizam's reading uses Claude. */
const PAYROLL_REAL: CardChapter = { kind: 'card', id: 'real', layout: 'columns', eyebrow: 'Honest boundaries', title: 'The pay is calculated, not generated, and here is what is simulated around it.', lines: [
  '## Real', 'The engine: each pay line is arithmetic over the client\'s approved rules, and names the rule it applied', 'Tasama\'s July 2025 template run, reproduced figure by figure, and the Saudi rules on top of it: GOSI rates by registration date, Arts. 70, 84, 87, 92, 93 and 116', 'Every run, payment and journal balances, and the checks prove it after each reset',
  '## Claude', 'Nizam reading a client\'s handbook into rules, when Claude is connected', 'Rafeeq answering an employee\'s question about their pay', 'Nothing in a payslip, a bank file or a journal comes from Claude',
  '## Simulated', 'The banks, WPS and Mudad, and the bank layouts other than the public WPS file', 'Posting to Oracle Finance or Odoo: the import file is real, the ledger that receives it is not', 'Every client, employee and handbook: synthetic data, marked DEMO'] };
const PAYROLL_PROMISE: CardChapter = { kind: 'card', id: 'promise', layout: 'statement', eyebrow: 'The rule behind it', title: 'Agents calculate, check and explain, and no agent can approve a run or release a payment.', lines: ['Tasama HR operations enters every change, and payroll validates it.', 'Tasama\'s lead never validates a run she prepared, and the client\'s HR operations approves every run.', 'A rule below the law is refused, with the article, and the engine pays what the law requires.', 'Every line names its rule, and every change is on the audit trail.'] };
const PAYROLL_OPEN: CardChapter = { kind: 'card', id: 'open', layout: 'statement', eyebrow: 'Tasama Payroll · five clients', title: '{payrollPaid} people at {clients} clients were paid {payrollGross} last month from one platform.', lines: ['{monthsPaid} client months calculated by one engine, each client under its own approved rules.', '{oracleClients} clients keep Oracle HCM and the engine writes back to it; {platformClients} hold their payroll here.', 'Every month leaves as a bank file, a WPS file and the client\'s journals.'] };
const PAYROLL_PROBLEMS: CardChapter = { kind: 'card', id: 'problems', layout: 'steps', eyebrow: 'What your payroll managers told us', title: 'Your payroll managers named five problems the process documents do not cover.', lines: ['Every client has its own HR policy', 'Attendance deductions come from fingerprint data', 'Clients enter changes late', 'The Oracle Finance upload is prepared by hand', 'Each bank has its own file format'] };

export const DEFAULT_STORYLINES: Storyline[] = [
  { id: 'tasama', name: 'Tasama leadership', chapters: [
    { kind: 'card', id: 'open', layout: 'statement', eyebrow: 'Tasama HR · five client accounts', title: '{employees} employees at {clients} clients asked for {cases30d} things in the last 30 days.', lines: ['{noTouchPct} of them closed without anyone in HR touching them.', 'Service levels met last month: {slaMet} of {slaScored}.', 'Every request ran on the client\'s own HRMS. Nothing was migrated.'] },
    { kind: 'card', id: 'loop', layout: 'steps', eyebrow: 'What the agents do', title: 'Agents do the HR work that follows rules, for every client, every day.', lines: ['Rafeeq takes the request in chat, in English or Arabic', 'The specialist agent checks it against the client\'s HRMS and handbook', 'It prepares the letter, the plan or the recommendation', 'A person decides wherever the handbook says a person decides', 'The HRMS is updated through one logged connector'] },
    PROMISE,
    { kind: 'card', id: 'agenda', layout: 'agenda', eyebrow: 'The next twenty minutes', title: 'Three requests, live, through the real engine.', lines: ['Nothing is pre-recorded. Every step runs the same code a click would run.'] },
    { kind: 'scenario', id: 's1', scenario: 'certificate', audience: 'everyone', question: 'How long does a salary certificate take at your clients today?' },
    { kind: 'scenario', id: 's2', scenario: 'advance-exception', audience: 'client HR and the CHRO', question: 'Who decides an exception today, and where is the reason written down?' },
    { kind: 'scenario', id: 's3', scenario: 'sla-rescue', audience: 'Tasama operations', question: 'How would you have known this request was about to breach?' },
    REAL_CLAUDE_SIMULATED,
    { kind: 'card', id: 'rules', layout: 'statement', eyebrow: 'Your rules', title: 'Each client\'s rules live in its handbook, and the agents read them from there.', lines: ['Leave, advances, letters, approval limits and who decides, per client.', 'Service levels and the price per employee, per contract.', 'What each agent may do on its own, and what it must hand to a person, on the Agents screen.'] },
    { kind: 'card', id: 'next', layout: 'steps', eyebrow: 'Next step', title: 'Next, we type in one client\'s handbook and run these requests again under its rules.', lines: ['A half-day with the client\'s HR team on the handbook and the approval limits', 'A technical session with IT on the HRMS connector and the integration log', 'The same three requests, under that client\'s rules'] },
  ] },
  { id: 'compliance', name: 'Compliance and Legal', chapters: [
    PROMISE,
    { kind: 'card', id: 'agenda', layout: 'agenda', eyebrow: 'The next twenty minutes', title: 'Three times the agents stop work that should not go ahead.', lines: ['Nothing is pre-recorded. Every step runs the same code a click would run.'] },
    { kind: 'scenario', id: 's1', scenario: 'screening-refusal', audience: 'Legal and HR', question: 'Which clause would your team have cited?' },
    { kind: 'scenario', id: 's2', scenario: 'termination-stop', audience: 'Legal and the HRBPs', question: 'Who stops a termination like this at your clients today?' },
    { kind: 'scenario', id: 's3', scenario: 'payroll-escalation', audience: 'Payroll', question: 'How many of these would reach Mudad today?' },
    REAL_CLAUDE_SIMULATED,
  ] },
  { id: 'payroll-rules', name: 'Every client\'s own rules', chapters: [
    PAYROLL_OPEN, PAYROLL_PROBLEMS, PAYROLL_PROMISE,
    { kind: 'card', id: 'agenda', layout: 'agenda', eyebrow: 'The next twenty minutes', title: 'Each client is paid by its own rules, from day one.', lines: ['Nothing is pre-recorded. Every step runs the same engine a click would run.'] },
    { kind: 'scenario', id: 's1', scenario: 'client-transition', audience: 'Tasama\'s HR operations and payroll teams', question: 'How many weeks does taking on a client like Soudah take today?' },
    { kind: 'scenario', id: 's2', scenario: 'overtime-two-clients', audience: 'Tasama HR operations and payroll', question: 'Where does each client\'s overtime rule live today, and who checks it is applied?' },
    { kind: 'scenario', id: 's3', scenario: 'attendance-month', audience: 'Tasama and client HR operations', question: 'How long does turning a fingerprint file into deductions take each month?' },
    PAYROLL_REAL,
    { kind: 'card', id: 'next', layout: 'steps', eyebrow: 'Next step', title: 'Next, we read one of your clients\' real handbooks and run last month under its rules.', lines: ['Tasama shares one client\'s handbook and last month\'s payroll file', 'Nizam reads the handbook into rules and your lead settles what it flags', 'The engine runs the month, and every difference from your file is explained'] },
  ] },
  { id: 'payroll-changes', name: 'Changes on time', chapters: [
    PAYROLL_OPEN, PAYROLL_PROMISE,
    { kind: 'card', id: 'agenda', layout: 'agenda', eyebrow: 'The next twenty minutes', title: 'Changes reach payroll once, and on time.', lines: ['Nothing is pre-recorded. Every step runs the same engine a click would run.'] },
    { kind: 'scenario', id: 's1', scenario: 'late-change', audience: 'Tasama and client HR operations', question: 'Who chases the client today when the 15th passes?' },
    { kind: 'scenario', id: 's2', scenario: 'hire-to-onboard', audience: 'client HR and payroll', question: 'How many times is a new hire\'s salary typed today, and by whom?' },
    { kind: 'scenario', id: 's4', scenario: 'contract-intake', audience: 'Tasama and client HR operations', question: 'How long does checking a contract against the policy take today, and who chases what is missing?' },
    { kind: 'scenario', id: 's3', scenario: 'backpay-leaver', audience: 'payroll specialists', question: 'How long does a three-month back pay take to calculate by hand?' },
    PAYROLL_REAL,
    { kind: 'card', id: 'next', layout: 'steps', eyebrow: 'Next step', title: 'Next, we replay one client\'s last three months of changes through the platform.', lines: ['Tasama shares the changes one client sent for three months, as they arrived', 'Wared reads them and routes each to its month', 'We compare the result with what was paid, and explain every difference'] },
  ] },
  { id: 'payroll-ledger', name: 'From run to ledger', chapters: [
    PAYROLL_OPEN, PAYROLL_PROMISE,
    { kind: 'card', id: 'agenda', layout: 'agenda', eyebrow: 'The next twenty minutes', title: 'Every step from run to ledger reconciles.', lines: ['Nothing is pre-recorded. Every step runs the same engine a click would run.'] },
    { kind: 'scenario', id: 's1', scenario: 'run-approve', audience: 'payroll and the client\'s HR operations', question: 'How long does explaining last month\'s differences take today?' },
    { kind: 'scenario', id: 's2', scenario: 'bank-file', audience: 'payroll and the client\'s finance controller', question: 'How do you find out today that a salary was returned?' },
    { kind: 'scenario', id: 's3', scenario: 'ledger-loop', audience: 'client finance', question: 'How many days after pay day does finance receive the journal today?' },
    { kind: 'card', id: 'loop', layout: 'statement', eyebrow: 'Every client, every month', title: 'Since each client\'s history began, {bankFiles} bank files and {journalsPosted} journals have left the platform with no spreadsheet in between.', lines: ['The bank file total equals net pay, and the WPS file matches the bank file.', 'Salaries payable credited by each month\'s accrual equals what its payment journal pays out.', 'An element with no account stops the journals, and the account is approved once.'] },
    PAYROLL_REAL,
    { kind: 'card', id: 'next', layout: 'steps', eyebrow: 'Next step', title: 'Next, your bank templates and one client\'s chart of accounts replace the illustrative ones.', lines: ['Tasama sends each paying bank\'s file template', 'One Oracle client shares its chart of accounts and the payroll mapping spreadsheet', 'We load one past month into that client\'s test ledger'] },
  ] },
];

export function mergeStorylines(stored: Storyline[] | null | undefined): Storyline[] {
  return [...DEFAULT_STORYLINES.map((d) => (stored ?? []).find((s) => s.id === d.id) ?? d), ...(stored ?? []).filter((s) => !DEFAULT_STORYLINES.some((d) => d.id === s.id))];
}

type Item = { type: 'card'; chapter: CardChapter } | { type: 'scenario'; chapter: ScenarioChapter } | { type: 'interlude'; chapter: ScenarioChapter };
const expand = (s: Storyline): Item[] => s.chapters.flatMap((c): Item[] => (c.kind === 'card' ? [{ type: 'card', chapter: c }] : [{ type: 'scenario', chapter: c }, { type: 'interlude', chapter: c }]));

/** What a scenario did, counted from the step results the room saw. */
export type Tally = { steps: number; agentActions: number; agents: number; decisions: number; inRoom: number; overrides: number; writes: number; cases: number };
export function tallyOf(d: Director | null): Tally | null {
  if (!d) return null;
  const rs = Object.values(d.results);
  const trail = rs.flatMap((r) => [...r.changes.trail, ...r.changes.tasama]);
  const agentRows = trail.filter((x: any) => x.actor_type === 'AGENT');
  const decided = trail.filter((x: any) => x.actor_type === 'HUMAN' && ['APPROVE', 'REJECT', 'OVERRIDE', 'DECIDE', 'ASSIGN'].includes(x.act));
  return {
    steps: d.steps.length, agentActions: agentRows.length, agents: new Set(agentRows.map((x: any) => x.actor_id)).size,
    decisions: decided.length, inRoom: rs.filter((r) => r.result === 'Decided in the room').length, overrides: trail.filter((x: any) => x.act === 'OVERRIDE').length,
    writes: trail.filter((x: any) => x.actor_type === 'SYSTEM' && x.act === 'WRITE').length, cases: new Set(rs.flatMap((r) => r.changes.cases.map((c: any) => c.ref))).size,
  };
}

export type PresentView = 'stage' | 'app';
type PresentState = { storylineId: string; index: number; startedAt: number; tally: Tally | null; elapsedMs: number; view: PresentView };
type PresentCtx = {
  present: PresentState | null; storylines: Storyline[]; storyline: Storyline | null; items: Item[]; item: Item | null;
  start: (storylineId: string) => void; exit: () => void;
  /** Play one scenario on the Stage, outside a storyline (Demo › Scenarios). */
  play: (key: string) => void; next: () => void; prev: () => void; goTo: (index: number) => void;
  fullscreen: boolean; toggleFullscreen: () => void; busy: boolean; reloadStorylines: () => void;
  /** How a scenario chapter is shown: the three-pane Stage, or the product's own screens. */
  setView: (v: PresentView) => void;
  /** True while a scenario chapter is on the Stage. */
  onStage: boolean;
};
const Ctx = createContext<PresentCtx | null>(null);
const STORE = 'tasama-present';

export function PresentProvider({ children }: { children: ReactNode }) {
  const { route, go, director, startScenario, stepScenario, stopScenario } = useApp();
  const { data: stored, reload } = useApi<Storyline[]>('/director/storylines');
  const storylines = useMemo(() => mergeStorylines(stored), [stored]);
  const [present, setPresent] = useState<PresentState | null>(() => { try { const s = sessionStorage.getItem(STORE); return s ? { view: 'stage', ...JSON.parse(s), tally: null } : null; } catch { return null; } });
  const [busy, setBusy] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const storyline = useMemo(() => (!present ? null : present.storylineId.startsWith('scenario:') ? { id: present.storylineId, name: 'Scenario', chapters: [{ kind: 'scenario' as const, id: 's', scenario: present.storylineId.slice(9) }] } : storylines.find((s) => s.id === present.storylineId) ?? null), [present, storylines]);
  const items = useMemo(() => (storyline ? expand(storyline) : []), [storyline]);
  const item = present && items.length ? items[Math.min(present.index, items.length - 1)] : null;
  const directorRef = useRef(director); directorRef.current = director;

  // The place in the storyline survives a reload in the meeting room.
  useEffect(() => { try { if (present) sessionStorage.setItem(STORE, JSON.stringify({ storylineId: present.storylineId, index: present.index, startedAt: present.startedAt, elapsedMs: present.elapsedMs, view: present.view })); else sessionStorage.removeItem(STORE); } catch { /* */ } }, [present]);
  // After a reload there is no Director: a scenario cannot be resumed, so land on the card before it.
  useEffect(() => { if (present && items.length && !director && !busy && items[present.index]?.type !== 'card' && present.index > 0) setPresent((p) => p && { ...p, index: Math.max(0, p.index - (items[p.index]?.type === 'interlude' ? 2 : 1)) }); }, [items, present, director, busy]);

  const start = useCallback((storylineId: string) => {
    setPresent((p) => (p && p.storylineId === storylineId ? p : { storylineId, index: 0, startedAt: 0, tally: null, elapsedMs: 0, view: 'stage' }));
    if (route.screen !== 'present') go('present', storylineId);
  }, [route.screen, go]);
  // #/present/<storyline> enters Present mode.
  useEffect(() => { if (route.screen === 'present') start(route.param ?? DEFAULT_STORYLINES[0].id); }, [route.screen, route.param, start]);

  const exit = useCallback(() => {
    if (directorRef.current) stopScenario();
    setPresent(null);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    go('scenarios');
  }, [stopScenario, go]);

  const beginScenario = useCallback(async (index: number, key: string) => {
    setBusy(true);
    try {
      if (directorRef.current) stopScenario();
      setPresent((p) => p && { ...p, index, startedAt: Date.now(), tally: null, elapsedMs: 0 });
      await startScenario(key);
    } finally { setBusy(false); }
  }, [startScenario, stopScenario]);

  const play = useCallback((key: string) => {
    const id = `scenario:${key}`;
    setPresent({ storylineId: id, index: 0, startedAt: Date.now(), tally: null, elapsedMs: 0, view: 'stage' });
    go('present', id);
    beginScenario(0, key);
  }, [go, beginScenario]);

  const goTo = useCallback((index: number) => {
    if (!present) return;
    const i = Math.max(0, Math.min(items.length - 1, index));
    const target = items[i];
    if (!target) return;
    if (target.type === 'scenario') { beginScenario(i, target.chapter.scenario); return; }
    if (target.type === 'interlude') { goTo(i - 1); return; }
    if (directorRef.current) stopScenario();
    setPresent((p) => p && { ...p, index: i });
    if (route.screen !== 'present') go('present', present.storylineId);
  }, [present, items, beginScenario, stopScenario, route.screen, go]);

  const next = useCallback(() => {
    if (!present || !item || busy) return;
    if (item.type === 'scenario') {
      const d = directorRef.current;
      if (!d) { beginScenario(present.index, item.chapter.scenario); return; }
      if (d.busy) return;
      if (d.index < d.steps.length - 1) { stepScenario(1); return; }
      // The scenario is done: count what it did and show the interlude. The Director stays behind the card, so Back returns to its last step.
      setPresent((p) => p && { ...p, index: p.index + 1, tally: tallyOf(d), elapsedMs: Date.now() - p.startedAt });
      go('present', present.storylineId);
      return;
    }
    const ni = present.index + 1;
    if (ni >= items.length) return;
    const target = items[ni];
    if (target.type === 'scenario') { beginScenario(ni, target.chapter.scenario); return; }
    if (directorRef.current) stopScenario();
    setPresent((p) => p && { ...p, index: ni });
  }, [present, item, busy, items, beginScenario, stepScenario, stopScenario, go]);

  const prev = useCallback(() => {
    if (!present || !item || busy) return;
    const d = directorRef.current;
    if (item.type === 'scenario' && d) {
      if (d.busy) return;
      if (d.index > 0) { stepScenario(-1); return; }
      stopScenario(); setPresent((p) => p && { ...p, index: Math.max(0, p.index - 1) }); go('present', present.storylineId); return;
    }
    if (item.type === 'interlude' && d) {
      // Back into the scenario's last step; the Director is still there.
      setPresent((p) => p && { ...p, index: p.index - 1 });
      const r = d.results[d.index]; if (r) go(r.screen, r.pattern);
      return;
    }
    if (present.index === 0) return;
    let pi = present.index - 1;
    if (items[pi]?.type === 'interlude') pi -= 1; // a finished scenario cannot be shown again without running it again
    if (items[pi]?.type === 'scenario') pi -= 1;
    setPresent((p) => p && { ...p, index: Math.max(0, pi) });
  }, [present, item, busy, items, stepScenario, stopScenario, go]);

  const toggleFullscreen = useCallback(() => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else document.documentElement.requestFullscreen().catch(() => {}); }, []);
  useEffect(() => { const on = () => setFullscreen(!!document.fullscreenElement); document.addEventListener('fullscreenchange', on); return () => document.removeEventListener('fullscreenchange', on); }, []);

  // Keys: → / space / PageDown next · ← / PageUp back · Esc leave · F full screen. Not while typing.
  useEffect(() => {
    if (!present) return;
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); prev(); }
      else if (e.key === 'Escape') { if (!document.fullscreenElement) exit(); }
      else if (e.key === 'f' || e.key === 'F') { toggleFullscreen(); }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [present, next, prev, exit, toggleFullscreen]);

  const onStage = !!present && item?.type === 'scenario' && present.view === 'stage';
  // Larger type for the room while presenting; the Stage keeps its size.
  useEffect(() => { document.documentElement.classList.toggle('presenting', !!present); return () => document.documentElement.classList.remove('presenting'); }, [present]);
  useEffect(() => { document.documentElement.classList.toggle('on-stage', onStage); return () => document.documentElement.classList.remove('on-stage'); }, [onStage]);

  const setView = useCallback((v: PresentView) => setPresent((p) => p && { ...p, view: v }), []);
  const value = useMemo<PresentCtx>(() => ({ present, storylines, storyline, items, item, start, exit, play, next, prev, goTo, fullscreen, toggleFullscreen, busy, reloadStorylines: reload, setView, onStage }), [present, storylines, storyline, items, item, start, exit, play, next, prev, goTo, fullscreen, toggleFullscreen, busy, reload, setView, onStage]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function usePresent(): PresentCtx { const c = useContext(Ctx); if (!c) throw new Error('usePresent outside PresentProvider'); return c; }

// ------------------------------------------------------------------ live numbers
function useTokens() {
  const { data: n } = useApi<any>('/director/numbers');
  const { lang } = useLang();
  return useCallback((s: string) => {
    if (!n) return s.replace(/\{[a-zA-Z0-9]+\}/g, '…');
    const map: Record<string, string> = {
      clients: String(n.clients), employees: Number(n.employees).toLocaleString('en-US'), openCases: Number(n.openCases).toLocaleString('en-US'), cases30d: Number(n.cases30d).toLocaleString('en-US'),
      noTouchPct: `${n.noTouchPct}%`, slaMet: String(n.slaMet), slaScored: String(n.slaScored), today: n.today,
      payrollPaid: Number(n.payrollPaid ?? 0).toLocaleString('en-US'), monthsPaid: String(n.monthsPaid ?? 0), journalsPosted: String(n.journalsPosted ?? 0), bankFiles: String(n.bankFiles ?? 0),
      payrollRules: Number(n.payrollRules ?? 0).toLocaleString('en-US'), oracleClients: String(n.oracleClients ?? 0), platformClients: String(n.platformClients ?? 0),
      payrollGross: lang === 'ar' ? `${(Number(n.payrollGross ?? 0) / 1e6).toFixed(1)} ${'مليون ريال'}` : `SAR ${(Number(n.payrollGross ?? 0) / 1e6).toFixed(1)} million`,
    };
    return s.replace(/\{([a-zA-Z0-9]+)\}/g, (m, k) => map[k] ?? m);
  }, [n, lang]);
}

// ------------------------------------------------------------------ the full-screen card
export function PresentOverlay() {
  const { present, storyline, items, item, next, prev, exit, goTo, fullscreen, toggleFullscreen, busy } = usePresent();
  const { session, director } = useApp();
  const { t } = useLang();
  const fill = useTokens();
  const { data: sc } = useApi<any[]>('/director/scenarios');
  if (!present || !storyline || !item || item.type === 'scenario') return null;
  const scenarioOf = (key: string) => (sc ?? []).find((s) => s.key === key);
  const n = present.index;
  return (
    <div className="page-hero present-overlay fixed inset-0 z-[70] flex flex-col" style={{ background: 'linear-gradient(135deg, hsl(var(--hero-background)) 0%, hsl(var(--hero-card)) 100%)', color: 'hsl(var(--hero-foreground))' }}>
      <div className="flex items-center justify-between px-10 pt-8">
        <div className="flex items-center gap-3"><img src="/brand/mark-on-dark.png" alt="" className="h-9 w-9" /><span className="text-lg font-semibold tracking-tight">{t('Tasama HR')}</span><span className="text-sm opacity-70">· {t(storyline.name)}</span></div>
        <div className="flex items-center gap-2 text-sm opacity-80">{session ? <span className="font-mono">{session.today}</span> : null}<button type="button" onClick={toggleFullscreen} title={fullscreen ? t('Leave full screen (F)') : t('Full screen (F)')} className="rounded-full border border-white/25 p-2 hover:bg-white/10">{fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</button><button type="button" onClick={exit} title={t('Leave Present mode (Esc)')} className="rounded-full border border-white/25 p-2 hover:bg-white/10"><X className="h-4 w-4" /></button></div>
      </div>
      <div key={n} className="present-enter flex flex-1 flex-col justify-center px-10 pb-6 pt-4 md:px-16 lg:px-24">
        {item.type === 'card' ? <Card card={item.chapter} fill={fill} storyline={storyline} scenarioOf={scenarioOf} /> : <Interlude chapter={item.chapter} tally={present.tally ?? tallyOf(director)} elapsedMs={present.elapsedMs} scenario={scenarioOf(item.chapter.scenario)} />}
      </div>
      <div className="flex items-center justify-between px-10 pb-7">
        <div className="flex items-center gap-1.5">{items.map((it, i) => <button key={i} type="button" onClick={() => goTo(i)} title={it.type === 'card' ? fill(it.chapter.title) : scenarioOf(it.chapter.scenario)?.title ?? it.chapter.scenario} className={cn('h-1.5 rounded-full transition-all', i === n ? 'w-7 bg-primary' : it.type === 'scenario' ? 'w-3.5 bg-white/45 hover:bg-white/70' : 'w-1.5 bg-white/30 hover:bg-white/60')} />)}</div>
        <div className="flex items-center gap-3 text-[12px] opacity-80"><span className="hidden sm:inline">{t('← → to move · F full screen · Esc to leave')}</span>
          <button type="button" onClick={prev} disabled={n === 0 || busy} className="rounded-full border border-white/25 p-2 hover:bg-white/10 disabled:opacity-40" aria-label={t('Back')}><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" onClick={next} disabled={n >= items.length - 1 || busy} className="rounded-full bg-primary p-2 text-primary-foreground hover:opacity-90 disabled:opacity-40" aria-label={t('Next')}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}</button>
        </div>
      </div>
    </div>
  );
}

function Card({ card, fill, storyline, scenarioOf }: { card: CardChapter; fill: (s: string) => string; storyline: Storyline; scenarioOf: (k: string) => any }) {
  const { bi, t } = useLang();
  const lines = card.lines.map((l) => fill(t(l)));
  return (
    <div className="mx-auto w-full max-w-[1180px]">
      {card.eyebrow ? <p className="eyebrow text-[12px]">{fill(t(card.eyebrow))}</p> : null}
      <h1 className="headline-xl mt-4 max-w-[1000px]">{fill(t(card.title))}</h1>
      {card.layout === 'statement' ? <div className="mt-8 max-w-[860px] space-y-4">{lines.map((l, i) => <p key={i} className={cn('text-xl leading-relaxed md:text-2xl', i === lines.length - 1 && lines.length > 1 ? 'text-primary' : 'opacity-90')}>{l}</p>)}</div> : null}
      {card.layout === 'steps' ? <ol className="mt-8 grid max-w-[1100px] gap-x-10 gap-y-4 md:grid-cols-2">{lines.map((l, i) => <li key={i} className="flex items-start gap-4"><span className="mt-0.5 w-8 shrink-0 font-mono text-2xl text-primary">{i + 1}</span><span className="text-lg leading-snug md:text-xl">{l}</span></li>)}</ol> : null}
      {card.layout === 'columns' ? <Columns lines={lines} /> : null}
      {card.layout === 'agenda' ? (
        <>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {storyline.chapters.filter((c): c is ScenarioChapter => c.kind === 'scenario').map((c) => { const s = scenarioOf(c.scenario); return (
              <div key={c.id} className="rounded-2xl border border-white/15 bg-white/5 p-5">
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-primary">{s ? bi(s.shape, s.shape_ar) : ''}</p>
                <p className="mt-2 text-xl font-semibold leading-tight">{s ? bi(s.title, s.title_ar) : c.scenario}</p>
                <p className="mt-2 text-[15px] leading-relaxed opacity-75">{s ? bi(s.summary, s.summary_ar) : ''}</p>
                {c.audience ? <p className="mt-3 text-[12px] opacity-70">{t('For')} {t(c.audience)}</p> : null}
              </div>); })}
          </div>
          {lines.length ? <p className="mt-6 text-lg opacity-80">{lines[0]}</p> : null}
        </>
      ) : null}
    </div>
  );
}

function Columns({ lines }: { lines: string[] }) {
  const cols: { title: string; lines: string[] }[] = [];
  for (const l of lines) { const h = /^(##|#)\s/.exec(l); if (h) cols.push({ title: l.slice(h[0].length), lines: [] }); else if (cols.length) cols[cols.length - 1].lines.push(l); else cols.push({ title: '', lines: [l] }); }
  return (
    <div className={cn('mt-8 grid gap-6', cols.length >= 3 ? 'md:grid-cols-3' : cols.length === 2 ? 'md:grid-cols-2' : '')}>
      {cols.map((c, i) => (
        <div key={i} className="rounded-2xl border border-white/15 bg-white/5 p-5">
          {c.title ? <p className="text-xl font-semibold text-primary">{c.title}</p> : null}
          <ul className="mt-3 space-y-2.5">{c.lines.map((l, j) => <li key={j} className="flex gap-3 text-[15px] leading-relaxed"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />{l}</li>)}</ul>
        </div>
      ))}
    </div>
  );
}

function Interlude({ chapter, tally, elapsedMs, scenario }: { chapter: ScenarioChapter; tally: Tally | null; elapsedMs: number; scenario: any }) {
  const { bi, t } = useLang();
  const mins = Math.max(1, Math.round(elapsedMs / 60000));
  const one = (n: number, w: string, ws = `${w}s`) => `${n} ${t(n === 1 ? w : ws)}`;
  const facts = tally ? [
    tally.agentActions ? `${one(tally.agentActions, 'agent action')} ${t('by')} ${one(tally.agents, 'agent')}` : null,
    tally.inRoom ? `${tally.inRoom} ${t(tally.inRoom === 1 ? 'decision taken here in the room' : 'decisions taken here in the room')}` : null,
    tally.overrides ? `${one(tally.overrides, 'decision against the recommendation', 'decisions against the recommendation')}, ${t('each with its reason')}` : null,
    tally.writes ? `${one(tally.writes, 'update written to the HRMS', 'updates written to the HRMS')} ${t('through the connector')}` : null,
    tally.cases ? `${one(tally.cases, 'case on the audit trail', 'cases on the audit trail')}` : null,
  ].filter(Boolean) as string[] : [];
  return (
    <div className="mx-auto w-full max-w-[1180px]">
      <p className="eyebrow text-[12px]">{t('What you just saw')} · {scenario ? bi(scenario.title, scenario.title_ar) : chapter.scenario}</p>
      <h1 className="headline-xl mt-4 max-w-[1000px]">{tally ? `${one(tally.steps, 'step')}, ${tally.decisions ? one(tally.decisions, 'decision by a person', 'decisions by people') : t('no decision by a person')}, ${one(mins, 'minute')}.` : '…'}</h1>
      <div className="mt-8 grid max-w-[1000px] gap-x-10 gap-y-3 md:grid-cols-2">{facts.map((f, i) => <p key={i} className="text-lg leading-snug md:text-xl">{f}</p>)}</div>
      {chapter.question ? <p className="mt-10 text-2xl text-primary md:text-3xl">{t(chapter.question)}</p> : null}
    </div>
  );
}

// ------------------------------------------------------------------ the slim title bar while a scenario runs
export function PresentBar({ user }: { user?: ReactNode }) {
  const { present, storyline, items, item, next, prev, exit, busy, setView } = usePresent();
  const { session, director, setAuto } = useApp();
  const { t, bi } = useLang();
  if (!present || !storyline || !item) return null;
  const speed = director ? Math.round(AUTO_STEP_MS / (director.autoMs || AUTO_STEP_MS)) : 1;
  return (
    <div className="glass-chrome flex h-14 items-center gap-3 rounded-xl px-4 shadow-lg">
      <div className="flex items-center gap-2"><img src="/brand/mark.png" alt="" className="h-7 w-7 dark:hidden" /><img src="/brand/mark-on-dark.png" alt="" className="hidden h-7 w-7 dark:block" /><span className="text-base font-semibold">{t('Tasama HR')}</span><Chip tone="warn">{t('Present')} · {PRESENT_BUILD}</Chip></div>
      <div className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
        {director ? <><span className="font-medium text-foreground">{bi(director.title, director.title_ar)}</span> · {t('step')} {Math.max(0, director.index) + 1} {t('of')} {director.steps.length}{director.index >= director.steps.length - 1 && !director.busy ? ` · ${t('complete, → for what you saw')}` : ''}</> : <>{t('Starting…')}</>}
        <span className="ms-3 hidden xl:inline">{t('chapter')} {present.index + 1} {t('of')} {items.length}</span>
      </div>
      {session ? <span className="hidden rounded-full border border-border/70 bg-card/50 px-3 py-1.5 font-mono text-[12px] lg:inline">{session.today}</span> : null}
      {director ? (
        <div className="hidden items-center gap-1 rounded-full border border-border/70 bg-card/50 p-1 md:flex" title={t('Auto-play speed')}>
          {[1, 2, 4].map((x) => <button key={x} type="button" onClick={() => setAuto(director.auto, AUTO_STEP_MS / x)} className={cn('rounded-full px-2 py-0.5 font-mono text-[11px]', speed === x ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>{x}×</button>)}
        </div>
      ) : null}
      <div className="hidden items-center gap-1 rounded-full border border-border/70 bg-card/50 p-1 md:flex" title={t('Stage: the person asking, the agents and the system side by side. App: the product\'s own screens.')}>
        {(['stage', 'app'] as const).map((v) => <button key={v} type="button" onClick={() => setView(v)} className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-medium', present.view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>{v === 'stage' ? t('Stage') : t('App')}</button>)}
      </div>
      <div className="flex items-center gap-1.5">
        <Btn small onClick={prev} disabled={busy || director?.busy}><ChevronLeft className="h-3.5 w-3.5" /><span className="sr-only">{t('Back')}</span></Btn>
        <Btn small kind="primary" onClick={next} disabled={busy || director?.busy}>{busy || director?.busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronRight className="h-3.5 w-3.5" />}<span className="sr-only">{t('Next')}</span></Btn>
        {director ? <Btn small onClick={() => setAuto(!director.auto)} disabled={director.index >= director.steps.length - 1}>{director.auto ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}<span className="sr-only">{director.auto ? t('Pause') : t('Play')}</span></Btn> : null}
        <Btn small onClick={exit}><X className="h-3.5 w-3.5" /><span className="sr-only">{t('Leave Present mode (Esc)')}</span></Btn>
      </div>
      {user}
    </div>
  );
}

// ------------------------------------------------------------------ Settings › Demo: the storyline editor
export function StorylineEditor() {
  const { storylines, reloadStorylines } = usePresent();
  const { go } = useApp();
  const { t, bi } = useLang();
  const { data: sc } = useApi<any[]>('/director/scenarios');
  const [draft, setDraft] = useState<Storyline[] | null>(null);
  const [sel, setSel] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false); const [msg, setMsg] = useState('');
  const list = draft ?? storylines;
  const s = list[Math.min(sel, list.length - 1)];
  const scenarios = sc ?? [];
  const update = (fn: (st: Storyline) => Storyline) => setDraft(list.map((x, i) => (i === sel ? fn(x) : x)));
  const setChapters = (chs: Chapter[]) => update((st) => ({ ...st, chapters: chs }));
  const setAt = (i: number, c: Chapter) => setChapters(s.chapters.map((x, j) => (j === i ? c : x)));
  const move = (i: number, d: -1 | 1) => { const c = [...s.chapters]; const j = i + d; if (j < 0 || j >= c.length) return; [c[i], c[j]] = [c[j], c[i]]; setChapters(c); };
  const newId = () => `c${Date.now().toString(36)}`;
  const save = async () => { setSaving(true); try { await api('/director/storylines', { method: 'PUT', json: list }); setMsg(t('Saved. Present mode uses this storyline from its next start.')); setDraft(null); reloadStorylines(); } catch (e: any) { setMsg(`${t('Not saved')}: ${e.message}`); } finally { setSaving(false); } };
  if (!s) return null;
  const scName = (k: string) => { const x = scenarios.find((y) => y.key === k); return x ? bi(x.title, x.title_ar) : k; };
  return (
    <div className="space-y-3">
      {msg ? <p className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">{msg}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        {list.map((st, i) => <button key={st.id} type="button" onClick={() => { setSel(i); setOpenId(null); }} className={cn('mono-chip', i === sel && 'is-primary')}>{t(st.name)}</button>)}
        <Btn small onClick={() => { setDraft([...list, { id: newId(), name: 'New storyline', chapters: [] }]); setSel(list.length); }}><Plus className="h-3.5 w-3.5" /> {t('New storyline')}</Btn>
        <span className="flex-1" />
        <Btn small kind="primary" onClick={() => go('present', s.id)}><Play className="h-3.5 w-3.5" /> {t('Present this storyline')}</Btn>
      </div>
      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
        <Field label={t('Storyline name')}><input className="input" value={s.name} onChange={(e) => update((st) => ({ ...st, name: e.target.value }))} /></Field>
        <div className="flex items-end gap-2">
          <Btn small onClick={() => setChapters([...s.chapters, { kind: 'card', id: newId(), layout: 'statement', eyebrow: '', title: 'A claim, the way you would say it', lines: ['One sentence under it.'] }])}><Plus className="h-3.5 w-3.5" /> {t('Card')}</Btn>
          <Btn small onClick={() => setChapters([...s.chapters, { kind: 'scenario', id: newId(), scenario: scenarios[0]?.key ?? 'certificate', audience: '', question: 'Who in this room would have clicked approve?' }])}><Plus className="h-3.5 w-3.5" /> {t('Scenario')}</Btn>
        </div>
      </div>
      <ol className="divide-y divide-border/60 rounded-xl border border-border/70">
        {s.chapters.map((c, i) => (
          <li key={c.id} className="p-2.5">
            <div className="flex items-center gap-2">
              <span className="w-6 font-mono text-[11px] text-muted-foreground">{i + 1}</span>
              <Chip tone={c.kind === 'scenario' ? 'primary' : undefined}>{c.kind === 'scenario' ? t('Scenario') : t(c.layout)}</Chip>
              <button type="button" onClick={() => setOpenId(openId === c.id ? null : c.id)} className="min-w-0 flex-1 truncate text-start text-sm hover:text-primary">{c.kind === 'card' ? t(c.title) : `${scName(c.scenario)}${c.audience ? ` · ${t('for')} ${t(c.audience)}` : ''}`}</button>
              <Btn small onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp className="h-3.5 w-3.5" /><span className="sr-only">{t('Move up')}</span></Btn>
              <Btn small onClick={() => move(i, 1)} disabled={i === s.chapters.length - 1}><ArrowDown className="h-3.5 w-3.5" /><span className="sr-only">{t('Move down')}</span></Btn>
              <Btn small kind="danger" onClick={() => setChapters(s.chapters.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5" /><span className="sr-only">{t('Remove')}</span></Btn>
            </div>
            {openId === c.id ? (
              <div className="mt-3 grid gap-3 ps-8 md:grid-cols-2">
                {c.kind === 'card' ? <>
                  <Field label={t('Layout')}><select className="input" value={c.layout} onChange={(e) => setAt(i, { ...c, layout: e.target.value as CardLayout })}><option value="statement">{t('Statement: a claim and up to three sentences')}</option><option value="steps">{t('Steps: a numbered list')}</option><option value="columns">{t('Columns: lines starting with "## " open a column')}</option><option value="agenda">{t('Agenda: the storyline\'s scenarios as tiles')}</option></select></Field>
                  <Field label={t('Eyebrow, the small line above the claim')}><input className="input" value={c.eyebrow ?? ''} onChange={(e) => setAt(i, { ...c, eyebrow: e.target.value })} /></Field>
                  <div className="md:col-span-2"><Field label={t('The claim, as a person would say it')}><input className="input" value={c.title} onChange={(e) => setAt(i, { ...c, title: e.target.value })} /></Field></div>
                  <div className="md:col-span-2"><Field label={`${t('Lines, one per line; live numbers')}: ${TOKENS.join(' ')}`}><textarea className="input min-h-[120px] font-sans" value={c.lines.join('\n')} onChange={(e) => setAt(i, { ...c, lines: e.target.value.split('\n') })} /></Field></div>
                </> : <>
                  <Field label={t('Scenario')}><select className="input" value={c.scenario} onChange={(e) => setAt(i, { ...c, scenario: e.target.value })}>{scenarios.map((x) => <option key={x.key} value={x.key}>{bi(x.title, x.title_ar)}</option>)}</select></Field>
                  <Field label={t('For whom in the room, shown on the agenda card')}><input className="input" value={c.audience ?? ''} onChange={(e) => setAt(i, { ...c, audience: e.target.value })} /></Field>
                  <div className="md:col-span-2"><Field label={t('The question to the room after it')}><input className="input" value={c.question ?? ''} onChange={(e) => setAt(i, { ...c, question: e.target.value })} /></Field></div>
                </>}
              </div>
            ) : null}
          </li>
        ))}
        {!s.chapters.length ? <li className="p-4 text-sm text-muted-foreground">{t('No chapters yet. Add a card or a scenario.')}</li> : null}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <Btn kind="primary" disabled={saving || !draft} onClick={save}>{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} {t('Save')}</Btn>
        <Btn disabled={!draft} onClick={() => { setDraft(null); setMsg(''); }}>{t('Discard changes')}</Btn>
        <Btn onClick={() => { const d = DEFAULT_STORYLINES.find((x) => x.id === s.id); if (d) update(() => d); }} disabled={!DEFAULT_STORYLINES.some((x) => x.id === s.id)}>{t('Put the shipped storyline back')}</Btn>
        {list.length > 1 ? <Btn kind="danger" onClick={() => { setDraft(list.filter((_, i) => i !== sel)); setSel(0); }} disabled={DEFAULT_STORYLINES.some((x) => x.id === s.id)}>{t('Remove storyline')}</Btn> : null}
        <span className="text-[12px] text-muted-foreground">{t('Each scenario is followed by a card with what it did, counted from its steps.')}</span>
      </div>
    </div>
  );
}
