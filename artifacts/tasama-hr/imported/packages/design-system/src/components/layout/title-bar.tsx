import type { ReactNode } from 'react';
import { tr, trs } from '../../lib/i18n';
import { PanelLeft, PanelTop, Search, Type } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { AppChromeState } from './chrome';
import { ThemeModeToggle } from './theme-mode-toggle';

/**
 * The 56px sticky glass title bar: wordmark left, flexible spacer, then the
 * right cluster — lens drop-down, theme selector, optional icon utilities,
 * user menu. Height, radius and the glass treatment are fixed across every
 * Atelier app; only the contents vary.
 */
export function TitleBar({
  brand,
  search,
  lens,
  utilities,
  user,
  className,
}: {
  /** Wordmark or logo lockup. Links home. */
  brand: ReactNode;
  /** Global search. Any app with more than one collection of records should
   * carry it here — it is the fastest route to anything and its absence is
   * what makes a title bar feel empty. */
  search?: ReactNode;
  /** The <LensPicker />, when the app has lenses. */
  lens?: ReactNode;
  /** Optional icon utilities (notifications, motion toggle) — after the theme selector. */
  utilities?: ReactNode;
  /** <UserBadge /> or a user menu. */
  user?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        // Gaps tighten at phone width. At 430px the bar was 17px wider than
        // the viewport, which put a horizontal scrollbar under every screen
        // in the app — the kind of defect that is invisible on a laptop and
        // the first thing anyone notices on a phone.
        'flex h-14 items-center gap-2 rounded-xl glass-chrome px-3 shadow-lg sm:gap-4 sm:px-4',
        className,
      )}
    >
      <div className="flex min-w-0 shrink items-center overflow-hidden">{brand}</div>
      {search ? (
        <div className="ms-auto hidden min-w-0 md:block">{search}</div>
      ) : null}
      <div className={cn('flex shrink-0 items-center gap-2 sm:gap-4', search ? 'ms-2 sm:ms-4' : 'ms-auto')}>
        {lens}
        <ThemeModeToggle />
        {utilities}
        {user}
      </div>
    </header>
  );
}

/**
 * The title bar's search field. Width is fixed so the bar's right cluster
 * stays put as the page changes.
 */
export function TitleBarSearch({
  placeholder,
  value,
  onChange,
  onSubmit,
  className,
}: {
  placeholder: string;
  value?: string;
  onChange?: (value: string) => void;
  onSubmit?: () => void;
  className?: string;
}) {
  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit?.();
      }}
      className={cn(
        'flex h-9 w-[clamp(220px,26vw,340px)] items-center gap-2 rounded-lg border border-border bg-background/40 px-3 transition-colors focus-within:border-primary',
        className,
      )}
    >
      <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={trs(placeholder)}
        aria-label={trs(placeholder)}
        className="min-w-0 flex-1 border-none bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
      />
    </form>
  );
}

/**
 * The signed-in user: name over role, then the 32px avatar. The role line is
 * what turns an avatar into an identity — in an app where what you can see
 * depends on who you are, show who you are.
 */
export function UserBadge({
  name,
  role,
  initials,
  onClick,
  className,
}: {
  name: ReactNode;
  role?: ReactNode;
  initials: string;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('flex items-center gap-2.5 text-start', className)}
    >
      <span className="hidden leading-tight sm:block">
        <span className="block text-sm font-semibold">{name}</span>
        {role ? (
          <span className="block text-xs text-muted-foreground">{tr(role)}</span>
        ) : null}
      </span>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary/50 bg-background/40 text-xs font-semibold transition-colors hover:border-primary">
        {initials}
      </span>
    </button>
  );
}

export type ContextNavItem = {
  id: string;
  label: string;
  /** A 14px lucide icon. Give every item one or none — a half-iconed nav reads
   * like a mistake, and the icon is the only thing left when labels are off. */
  icon?: ReactNode;
  href?: string;
  onSelect?: () => void;
};

/**
 * The context navigation — the app's main menu.
 *
 * It is a surface of its own, never part of the display area: horizontally it
 * is a bar under the title bar, vertically it is a column docked between the
 * chat rail and the main panel. Two controls sit at its far end in both
 * orientations:
 *
 *   labels      show the items as icon + label, or icons alone
 *   orientation dock the menu at the top, or down the side
 *
 * Both persist. Pass the `chrome` state from `useAppChrome()`; <AppShell>
 * handles the geometry.
 */
export function ContextNav({
  items,
  value,
  home,
  chrome,
  className,
}: {
  items: ReadonlyArray<ContextNavItem>;
  value?: string;
  /** Leading "Home" link, rendered before the items. */
  home?: ReactNode;
  chrome: AppChromeState;
  className?: string;
}) {
  const vertical = chrome.orientation === 'vertical';
  const showLabels = chrome.labels;

  const item = (entry: ContextNavItem) => {
    const active = entry.id === value;
    const classes = cn(
      'inline-flex shrink-0 items-center rounded-full font-mono text-xs uppercase tracking-widest transition-colors',
      vertical ? 'w-full gap-2.5 px-3 py-2' : 'gap-1.5 px-3 py-1.5',
      !showLabels && 'justify-center',
      active
        ? 'bg-primary text-primary-foreground'
        : 'text-muted-foreground hover:bg-primary/10 hover:text-foreground',
    );
    const content = (
      <>
        {entry.icon ? (
          <span className="shrink-0" aria-hidden="true">
            {entry.icon}
          </span>
        ) : null}
        {showLabels ? <span className="truncate">{trs(entry.label)}</span> : null}
      </>
    );
    // `key` is passed explicitly rather than spread — React warns (loudly, in
    // every consuming app's console) when a key arrives inside a props object.
    const shared = {
      className: classes,
      'aria-current': active ? ('page' as const) : undefined,
      // With labels hidden the icon is the only affordance, so it must be named.
      title: showLabels ? undefined : trs(entry.label),
      'aria-label': showLabels ? undefined : trs(entry.label),
    };
    return entry.href ? (
      <a key={entry.id} {...shared} href={entry.href}>
        {content}
      </a>
    ) : (
      <button key={entry.id} {...shared} type="button" onClick={entry.onSelect}>
        {content}
      </button>
    );
  };

  const controls = (
    <div className={cn('flex shrink-0 gap-1', vertical ? 'flex-col' : 'flex-row')}>
      <NavControl
        onClick={chrome.toggleLabels}
        label={trs(showLabels ? 'Hide menu labels' : 'Show menu labels')}
        pressed={!showLabels}
      >
        <Type className="h-3.5 w-3.5" />
      </NavControl>
      <NavControl
        onClick={chrome.toggleOrientation}
        label={vertical ? 'Dock menu at the top' : 'Dock menu to the side'}
      >
        {vertical ? <PanelTop className="h-3.5 w-3.5" /> : <PanelLeft className="h-3.5 w-3.5" />}
      </NavControl>
    </div>
  );

  if (vertical) {
    return (
      <nav
        aria-label="Main menu"
        className={cn(
          'flex h-full flex-col gap-1 overflow-y-auto rounded-xl glass-chrome p-2',
          className,
        )}
      >
        {home}
        {items.map(item)}
        <div className="mt-auto flex justify-center pt-2">{controls}</div>
      </nav>
    );
  }

  return (
    <nav
      aria-label="Main menu"
      className={cn(
        'flex h-11 items-center gap-2 rounded-xl glass-chrome px-2',
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
        {home}
        {items.map(item)}
      </div>
      {controls}
    </nav>
  );
}

/** The small square control used for the nav's own toggles. */
function NavControl({
  children,
  label,
  onClick,
  pressed,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-md border border-border transition-colors',
        pressed
          ? 'bg-primary/15 text-primary'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}
