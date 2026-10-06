import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/**
 * The Atelier light / dark / system theme contract.
 *
 * - The selected MODE persists, never its resolved value, so "system" survives
 *   a reload and keeps following the OS.
 * - "system" tracks `prefers-color-scheme` live.
 * - First-time default is "system".
 * - The theme applies as the `dark` class on <html> plus `style.colorScheme`.
 *   Every token and every Tailwind `dark:` variant keys off that class; there
 *   is no `data-theme` support.
 *
 * Apps must ALSO run `themeInitScript` inline in <head> so the class is set
 * before first paint — otherwise the page flashes the wrong theme.
 */
export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'atelier-theme';

/**
 * Drop this into <head> as `<script dangerouslySetInnerHTML={{ __html:
 * themeInitScript() }} />` (or a plain inline <script> in index.html). It runs
 * before paint and sets the same class this provider would.
 */
export function themeInitScript(storageKey: string = THEME_STORAGE_KEY): string {
  return `(function(){try{var m=localStorage.getItem(${JSON.stringify(
    storageKey,
  )})||'system';var d=m==='dark'||(m==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light';}catch(e){}})();`;
}

function readStoredMode(storageKey: string): ThemeMode {
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
  } catch {
    // Private mode / blocked storage: fall through to the default.
  }
  return 'system';
}

type ThemeContextValue = {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  children,
  storageKey = THEME_STORAGE_KEY,
}: {
  children: ReactNode;
  storageKey?: string;
}) {
  const [mode, setModeState] = useState<ThemeMode>(() =>
    typeof window === 'undefined' ? 'system' : readStoredMode(storageKey),
  );
  const [systemDark, setSystemDark] = useState(() =>
    typeof window === 'undefined'
      ? false
      : window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemDark(media.matches);
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const resolved: ResolvedTheme =
    mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark');
    document.documentElement.style.colorScheme = resolved;
  }, [resolved]);

  const setMode = useCallback(
    (next: ThemeMode) => {
      setModeState(next);
      try {
        window.localStorage.setItem(storageKey, next);
      } catch {
        // Persisting is best-effort; the session still themes correctly.
      }
    },
    [storageKey],
  );

  const value = useMemo(
    () => ({ mode, resolved, setMode }),
    [mode, resolved, setMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within <ThemeProvider>');
  }
  return ctx;
}
