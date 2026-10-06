import type { ReactNode } from 'react';
import { tr } from '../../lib/i18n';
import { ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * PAGE COMPOSITION.
 *
 * The shell (AppShell, TitleBar, PageHero…) is the frame. These are the pieces
 * that go inside it, and they are what make a page read as a product rather
 * than a report. Compose from these before reaching for a bare Card or a
 * <table>: an app built only from the frame comes out correct and empty.
 *
 * THE GLASS SCALE. Every surface here sits at a declared level, and the depth
 * of the interface comes from being able to see all four at once:
 *
 *   L0  the page       backdrop fully visible — page gutters, gaps between
 *                      panels, the margin around the display shell
 *   L1  display shell  <MainPanel>. 16% fill, 22px blur.
 *   L2  section panel  <Panel>, <StatRow>, and the archetype layouts'
 *                      list/reader/lane panels. 34% fill, 12px blur.
 *   L3  card           <FeedCard>, <RecordCard>, <StatTile>, and every
 *                      archetype card. 62% fill, 6px blur — a nearer plate
 *                      ON the panel.
 *
 * Never nest a level inside itself. An L3 always sits on an L2, and an L2
 * always sits on the L1 display shell.
 *
 * See docs/LAYOUT.md → "Composing a page".
 */

/**
 * The standard body split: a primary column carrying the main feed or table,
 * and a secondary column of supporting panels. Most product pages want this
 * rather than a single full-width stack — the secondary column is where
 * queues, related records, health and "what changed" live.
 */
export function PageColumns({
  children,
  aside,
  className,
}: {
  children: ReactNode;
  aside: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('grid gap-4 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]', className)}>
      <div className="min-w-0 space-y-4">{children}</div>
      <div className="min-w-0 space-y-4">{aside}</div>
    </div>
  );
}

/**
 * A titled section panel — an L2 surface, so it belongs inside a <MainPanel>.
 * Every panel on a page carries the same header shape (icon, title, optional
 * right-aligned action or scope label) so a dense page still scans. Do not
 * hand-roll a panel header.
 *
 * Its children are L3: <FeedCard>, <RecordCard>, <StatTile>, a table, or plain
 * content.
 */
export function Panel({
  icon,
  title,
  action,
  children,
  tone = 'default',
  className,
  bodyClassName,
}: {
  /** A 16px lucide icon. Panels without one read flat. */
  icon?: ReactNode;
  title: ReactNode;
  /** Scope label, filter or "see all" link, right-aligned in the header. */
  action?: ReactNode;
  children: ReactNode;
  /** `accent` tints the panel with the brand accent — use for at most one
   * panel per page, to mark the one that is different in kind. */
  tone?: 'default' | 'accent';
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        'overflow-hidden rounded-xl glass-l2',
        tone === 'accent' && 'border-accent/30',
        className,
      )}
    >
      <header className="flex items-center gap-2.5 px-5 py-4">
        {icon ? <span className="shrink-0 text-primary">{icon}</span> : null}
        <h2 className="min-w-0 truncate text-base font-semibold">{tr(title)}</h2>
        {action ? <div className="ms-auto shrink-0">{action}</div> : null}
      </header>
      <div className={cn('px-5 pb-5', bodyClassName)}>{children}</div>
    </section>
  );
}

/** The small pill used for a panel's scope or filter ("Last 48 hours", "All"). */
/**
 * The thing on the right of a panel header. It is a BUTTON only when there is
 * something to press.
 *
 * Most uses of this are a count or a caption — "36 components", "5 recorded" —
 * and rendering those as buttons taught people that panel headers are
 * clickable, then disappointed them six times a screen. An affordance that
 * does nothing is worse than no affordance, so without an `onClick` this is a
 * plain label and looks like one.
 */
export function PanelAction({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick?: () => void;
}) {
  if (!onClick) {
    return (
      <span className="rounded-full border border-border/60 px-2.5 py-1 text-xs text-muted-foreground">
        {children}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary hover:bg-card/60"
    >
      {children}
    </button>
  );
}

/**
 * The container for a row of <StatTile>s — an L2 panel, so the tiles inside it
 * read as L3 plates rather than floating on the shell. Four across is usual.
 *
 * A bare row of tiles is the most common way the glass scale gets flattened:
 * the tiles end up at the same level as every panel around them and the page
 * loses a layer of depth.
 */
export function StatRow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-xl glass-l2 p-3', className)}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{children}</div>
    </div>
  );
}

/**
 * A KPI tile — an L3 surface, so it belongs inside a <StatRow> or a <Panel>.
 * Anatomy is fixed: label with a state chip pushed right, then the value at
 * display size, then the trend.
 */
export function StatTile({
  label,
  value,
  state,
  trend,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  /** Short state chip on the label row ("Active", "Last 24h"). */
  state?: ReactNode;
  trend?: { direction: 'up' | 'down' | 'flat'; label: ReactNode; sentiment?: 'good' | 'bad' | 'neutral' };
  className?: string;
}) {
  const sentiment = trend?.sentiment ?? 'neutral';
  return (
    <div className={cn('rounded-xl glass-l3 px-5 py-4', className)}>
      <div className="flex items-start gap-2">
        <p className="min-w-0 text-xs uppercase tracking-widest text-muted-foreground">
          {tr(label)}
        </p>
        {state ? <span className="ms-auto shrink-0">{tr(state)}</span> : null}
      </div>
      <p className="mt-3 text-3xl font-extrabold tabular-nums">{value}</p>
      {trend ? (
        <p
          className={cn(
            'mt-2 inline-flex items-center gap-1 font-mono text-xs tabular-nums',
            sentiment === 'good' && 'text-success',
            sentiment === 'bad' && 'text-danger',
            sentiment === 'neutral' && 'text-muted-foreground',
          )}
        >
          <span aria-hidden="true">
            {trend.direction === 'up' ? '↗' : trend.direction === 'down' ? '↘' : '→'}
          </span>
          {tr(trend.label)}
        </p>
      ) : null}
    </div>
  );
}

/**
 * One item in a signal / activity / alert feed — an L3 surface, so it belongs
 * inside a <Panel>.
 *
 * A feed reads better than a table whenever the rows are things that HAPPENED
 * rather than records to compare. The taxonomy chips carry the classification,
 * the headline carries the event, and `consequence` carries the so-what — that
 * third line is what separates an intelligence feed from a log, so write it.
 */
export function FeedCard({
  tags,
  timestamp,
  headline,
  consequence,
  onOpen,
  className,
}: {
  /** One or two classification chips — kind, then priority. */
  tags?: ReactNode;
  timestamp?: ReactNode;
  headline: ReactNode;
  /** Why this matters / what to do. Not a repeat of the headline. */
  consequence?: ReactNode;
  onOpen?: () => void;
  className?: string;
}) {
  const interactive = Boolean(onOpen);
  return (
    <article
      onClick={onOpen}
      className={cn(
        'group rounded-xl glass-l3 px-4 py-3.5 transition-colors',
        interactive && 'cursor-pointer hover:border-primary/50',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        {tags}
        {timestamp ? (
          <span className="ms-1 font-mono text-xs text-muted-foreground">{timestamp}</span>
        ) : null}
        {interactive ? (
          <ChevronRight className="ms-auto h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
        ) : null}
      </div>
      <h3 className="mt-2 font-semibold leading-snug">{headline}</h3>
      {consequence ? (
        <p className="mt-1 text-sm leading-snug text-muted-foreground">{consequence}</p>
      ) : null}
    </article>
  );
}

/**
 * A record card for a queue — an L3 surface, so it belongs inside a <Panel>:
 * an identifier, a workflow state, the title, then classification.
 */
export function RecordCard({
  reference,
  state,
  title,
  meta,
  onOpen,
  className,
}: {
  /** Human-readable id — give records one, it is how people talk about them. */
  reference?: ReactNode;
  /** Workflow state chip ("New", "In review"). */
  state?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  onOpen?: () => void;
  className?: string;
}) {
  return (
    <article
      onClick={onOpen}
      className={cn(
        'rounded-xl glass-l3 px-4 py-3.5 transition-colors',
        onOpen && 'cursor-pointer hover:border-primary/50',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        {reference}
        {state ? <span className="ms-auto shrink-0">{state}</span> : null}
      </div>
      <h3 className="mt-2 font-semibold leading-snug">{title}</h3>
      {meta ? <div className="mt-2 flex items-center gap-2">{meta}</div> : null}
    </article>
  );
}

/**
 * A row in a status list — a source, an integration, a job. Products that
 * depend on feeds should show whether those feeds are actually healthy;
 * degraded states need their own wording, not a silent green.
 */
export function StatusRow({
  name,
  detail,
  status,
  className,
}: {
  name: ReactNode;
  detail?: ReactNode;
  status: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-3 py-2.5', className)}>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{tr(name)}</p>
        {detail ? (
          <p className="truncate text-xs text-muted-foreground">{tr(detail)}</p>
        ) : null}
      </div>
      <span className="ms-auto shrink-0">{status}</span>
    </div>
  );
}
