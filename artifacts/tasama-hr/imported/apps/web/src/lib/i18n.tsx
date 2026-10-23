/**
 * English and Arabic, with right-to-left layout.
 *
 * Interface strings are keyed by their English text (AR in ./ar.ts). The design
 * system translates every plain-string label it renders through the same
 * lookup, so panel titles, nav items and stat labels need no call site. Data
 * comes from the API with its own `_ar` fields and is chosen with `bi()`.
 * A string without a translation falls back to English rather than vanishing.
 * Numbers stay Western in both languages.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { setDirection, setTranslator } from '@cognirise/atelier/layout';
import { AR, AR_PATTERNS } from './ar';
import { arabicDom, arabicDomRefresh } from './ar-dom';
import type { Lang } from './format';

const STORAGE = 'rafeeq-lang';
const NUMERIC = /(?:AED\s)?-?\d[\d.,]*(?:%|h|d)?/g;

/** People's names in Arabic, keyed by the English display name; filled from /names once the session loads. */
const NAMES_STORE = 'tasama-names';
const NAMES: Record<string, string> = (() => { try { return JSON.parse(localStorage.getItem(NAMES_STORE) ?? '{}'); } catch { return {}; } })();
export function setNames(m: Record<string, string>) { Object.assign(NAMES, m); try { localStorage.setItem(NAMES_STORE, JSON.stringify(m)); } catch { /* a convenience only */ } }

export function lookup(s: string): string {
  const exact = AR[s];
  if (exact) return exact;
  const held: string[] = [];
  const key = s.replace(NUMERIC, (m) => { held.push(m); return '{}'; });
  const pattern = AR[key];
  if (!pattern) {
    for (const [re, to] of AR_PATTERNS) { const m = s.match(re); if (m) return to(m, lookup); }
    if (NAMES[s]) return NAMES[s];
    // "<a name>: <a sentence>", the way agents write a finding about one person.
    const said = /^([^:]{3,60}): (.+)$/.exec(s);
    if (said && (NAMES[said[1]] || AR[said[1]])) { const rest = lookup(said[2]); if (rest !== said[2] || /[\u0600-\u06FF]/.test(rest)) return `${NAMES[said[1]] ?? AR[said[1]]}: ${rest}`; }
    const who = /^(.+), (Tasama|Tasama HR)$/.exec(s);
    return who && NAMES[who[1]] ? `${NAMES[who[1]]}، تسامى` : s;
  }
  let i = 0;
  return pattern.replace(/\{\}/g, () => held[i++] ?? '');
}

type Ctx = { lang: Lang; dir: 'ltr' | 'rtl'; setLang: (l: Lang) => void; t: (s: string) => string; bi: (en: string | null | undefined, ar: string | null | undefined) => string };
const LangCtx = createContext<Ctx | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => { try { return localStorage.getItem(STORAGE) === 'ar' ? 'ar' : 'en'; } catch { return 'en'; } });
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  // Registered during render so design-system labels translate on this paint.
  setTranslator(lang === 'ar' ? lookup : (s) => s);
  setDirection(dir);
  useEffect(() => {
    document.documentElement.setAttribute('dir', dir);
    document.documentElement.setAttribute('lang', lang);
    try { localStorage.setItem(STORAGE, lang); } catch { /* */ }
  }, [lang, dir]);
  const setLang = useCallback((l: Lang) => setLangState(l), []);
  // Names arrive once, the first time Arabic is on; the version re-renders what was drawn before.
  const [names, setNamesVer] = useState(0);
  useEffect(() => {
    if (lang !== 'ar' || names) return;
    fetch('/api/names').then((r) => (r.ok ? r.json() : {})).then((m) => { setNames(m); setNamesVer((v) => v + 1); }).catch(() => {});
  }, [lang, names]);
  useEffect(() => { arabicDom(lang === 'ar', lookup, NAMES); return () => arabicDom(false, lookup); }, [lang]);
  useEffect(() => { if (names) arabicDomRefresh(lookup); }, [names]);
  const t = useCallback((s: string) => (lang === 'ar' && typeof s === 'string' ? lookup(s) : s), [lang, names]);
  const bi = useCallback((en: string | null | undefined, ar: string | null | undefined) => (lang === 'ar' ? (ar && ar !== en ? ar : lookup(en || ar || '')) : (en || ar || '')), [lang, names]);
  const value = useMemo(() => ({ lang, dir: dir as 'ltr' | 'rtl', setLang, t, bi }), [lang, dir, setLang, t, bi, names]);
  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
}

export function useLang(): Ctx {
  const c = useContext(LangCtx);
  if (!c) throw new Error('useLang outside LangProvider');
  return c;
}

export function LanguageToggle() {
  const { lang, setLang } = useLang();
  return (
    <div className="flex items-center gap-0.5 rounded-full border border-border/70 bg-card/50 p-0.5" role="group" aria-label="Interface language">
      {(['en', 'ar'] as const).map((l) => (
        <button key={l} type="button" onClick={() => setLang(l)} aria-pressed={lang === l}
          className={`rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${lang === l ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
          {l === 'en' ? 'EN' : 'ع'}
        </button>
      ))}
    </div>
  );
}
