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
import { AR } from './ar';
import type { Lang } from './format';

const STORAGE = 'rafeeq-lang';
const NUMERIC = /(?:AED\s)?-?\d[\d.,]*(?:%|h|d)?/g;

export function lookup(s: string): string {
  const exact = AR[s];
  if (exact) return exact;
  const held: string[] = [];
  const key = s.replace(NUMERIC, (m) => { held.push(m); return '{}'; });
  const pattern = AR[key];
  if (!pattern) return s;
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
  const t = useCallback((s: string) => (lang === 'ar' ? lookup(s) : s), [lang]);
  const bi = useCallback((en: string | null | undefined, ar: string | null | undefined) => (lang === 'ar' ? (ar || en || '') : (en || ar || '')), [lang]);
  const value = useMemo(() => ({ lang, dir: dir as 'ltr' | 'rtl', setLang, t, bi }), [lang, dir, setLang, t, bi]);
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
