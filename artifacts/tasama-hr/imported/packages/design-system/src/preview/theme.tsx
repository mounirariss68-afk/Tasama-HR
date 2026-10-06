/**
 * The preview browser uses the SAME theme controller apps use, so the style
 * guide can never drift from the shipped light/dark/system contract. These are
 * thin aliases over src/components/layout/theme.tsx — see that file for the
 * contract, and docs/LAYOUT.md for how an app wires it.
 */
export {
  ThemeProvider as PreviewThemeProvider,
  useTheme as usePreviewTheme,
  themeInitScript,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemeMode,
} from '../components/layout/theme';
