import { useCallback, useEffect, useState } from 'react';

/**
 * App chrome preferences: where the context nav sits and whether it shows
 * labels. Both persist, because they are a working preference — someone who
 * docks the nav vertically wants it that way tomorrow too.
 */
export type NavOrientation = 'horizontal' | 'vertical';

const ORIENTATION_KEY = 'atelier-nav-orientation';
const LABELS_KEY = 'atelier-nav-labels';

/** Vertical nav widths. Collapsed shows icons only. */
export const NAV_VERTICAL_WIDTH = 236;
export const NAV_VERTICAL_COLLAPSED = 60;
/** Below this the vertical dock costs more width than it is worth. */
export const NAV_DOCK_BREAKPOINT = 1024;

function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const v = window.localStorage.getItem(key);
    return allowed.includes(v as T) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}

export function useAppChrome() {
  const [orientation, setOrientationState] = useState<NavOrientation>(() =>
    read(ORIENTATION_KEY, ['horizontal', 'vertical'] as const, 'horizontal'),
  );
  const [labels, setLabelsState] = useState<boolean>(() =>
    read(LABELS_KEY, ['on', 'off'] as const, 'on') === 'on',
  );
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < NAV_DOCK_BREAKPOINT,
  );

  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < NAV_DOCK_BREAKPOINT);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const persist = (key: string, value: string) => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Best-effort; the session still behaves correctly.
    }
  };

  const setOrientation = useCallback((next: NavOrientation) => {
    setOrientationState(next);
    persist(ORIENTATION_KEY, next);
  }, []);

  const setLabels = useCallback((next: boolean) => {
    setLabelsState(next);
    persist(LABELS_KEY, next ? 'on' : 'off');
  }, []);

  /* A vertical dock on a narrow window would eat the content column, so the
   * nav falls back to horizontal there without discarding the preference. */
  const effectiveOrientation: NavOrientation = narrow ? 'horizontal' : orientation;

  return {
    orientation: effectiveOrientation,
    /** What the user chose, even when the window is too narrow to honour it. */
    preferredOrientation: orientation,
    setOrientation,
    labels,
    setLabels,
    toggleLabels: () => setLabels(!labels),
    toggleOrientation: () =>
      setOrientation(orientation === 'horizontal' ? 'vertical' : 'horizontal'),
    /** How far the main column must pad left for a vertical nav. */
    navInset:
      effectiveOrientation === 'vertical'
        ? labels
          ? NAV_VERTICAL_WIDTH
          : NAV_VERTICAL_COLLAPSED
        : 0,
  };
}

export type AppChromeState = ReturnType<typeof useAppChrome>;
