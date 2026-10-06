/**
 * The Atelier layout system — the default shell every app is built on.
 * See docs/LAYOUT.md for the contract and a copy-paste starting point.
 */
export { AppShell, MainPanel } from './app-shell';
export { AppBackdrop } from './backdrop';
export {
  useAppChrome,
  NAV_DOCK_BREAKPOINT,
  NAV_VERTICAL_COLLAPSED,
  NAV_VERTICAL_WIDTH,
  type AppChromeState,
  type NavOrientation,
} from './chrome';
export { BrandLogo, BrandMark, Wordmark, BRAND_ASSETS } from './brand';
export {
  ChatAssistantTurn,
  ChatRail,
  ChatStatusBadge,
  ChatSuggestions,
  ChatUserTurn,
  RailBrandCard,
  useChatRail,
  CHAT_RAIL_COLLAPSED,
  CHAT_RAIL_DOCK_BREAKPOINT,
  CHAT_RAIL_DEFAULT,
  CHAT_RAIL_MAX,
  CHAT_RAIL_MIN,
  type ChatRailState,
} from './chat-rail';
export {
  ChatComposer,
  CHAT_INPUT_LIMIT,
  type ComposerAttachment,
} from './chat-composer';
export { LensPicker, type Lens } from './lens-picker';
export { HeroFeature, PageContainer, PageHero, PageMasthead, PageSection } from './page';
export {
  FeedCard,
  PageColumns,
  Panel,
  PanelAction,
  RecordCard,
  StatRow,
  StatTile,
  StatusRow,
} from './composition';
export { ThemeModeToggle } from './theme-mode-toggle';
export {
  ThemeProvider,
  themeInitScript,
  useTheme,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemeMode,
} from './theme';
export {
  ContextNav,
  TitleBar,
  TitleBarSearch,
  UserBadge,
  type ContextNavItem,
} from './title-bar';
export { setTranslator, setDirection, getDirection, tr, trs, type Direction } from '../../lib/i18n';
