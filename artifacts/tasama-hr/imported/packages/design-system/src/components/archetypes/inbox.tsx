import type { ReactNode } from 'react';
import { Inbox as InboxIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * INBOX — everything waiting on this person.
 *
 * The first screen of every Cognirise prototype, because it answers the
 * question the client actually has: "what does the human still do?" An
 * agentic system that shows only dashboards implies it needs nobody; an inbox
 * shows exactly where judgement is still required and how much of the work
 * arrived already done.
 *
 * The layout is deliberately the one everybody already knows — list on the
 * left, reader on the right — so no one spends demo time learning navigation.
 *
 *   <InboxLayout>
 *     tabs     count tabs; the FIRST one is always the attention queue
 *     filters  one row, collapsible, never more than six controls
 *     list     <InboxList> of <InboxItem>s — L2 panel, scrolls on its own
 *     reader   <InboxReader> — L2 panel, scrolls on its own
 *
 * Glass: the layout is L1 content, so place it inside <MainPanel>. The list
 * and reader are L2; the cards and blocks inside them are L3.
 *
 * WHAT MAKES IT GOOD: the reader ends in a <DecisionBar>. An inbox whose
 * items cannot be resolved is a report with extra steps.
 */

export function InboxLayout({
  tabs,
  filters,
  list,
  reader,
  /** List column width. Narrower than a mail client — these rows are richer. */
  listWidth = 380,
  className,
}: {
  tabs?: ReactNode;
  filters?: ReactNode;
  list: ReactNode;
  reader: ReactNode;
  listWidth?: number;
  className?: string;
}) {
  return (
    <div className={cn('flex min-h-0 flex-col gap-3', className)}>
      {tabs || filters ? (
        <div className="space-y-3">
          {tabs}
          {filters}
        </div>
      ) : null}
      <div
        className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[var(--inbox-list)_minmax(0,1fr)]"
        style={{ ['--inbox-list' as string]: `${listWidth}px` }}
      >
        {list}
        {reader}
      </div>
    </div>
  );
}

/**
 * The count tabs. Each tab states a number, because the number is the point:
 * "6 need attention, 0 failed, 10 all" tells the whole story of the queue
 * before anything is clicked. Keep them to three or four.
 */
export function InboxTabs({
  items,
  value,
  onChange,
  className,
}: {
  items: { id: string; label: ReactNode; count?: number; tone?: 'attention' | 'default' }[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn('flex flex-wrap items-center gap-2', className)}
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition-colors',
              active
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground',
            )}
          >
            {typeof item.count === 'number' ? (
              <span
                className={cn(
                  'font-mono text-xs tabular-nums',
                  item.tone === 'attention' && item.count > 0 && 'text-warn',
                )}
              >
                {item.count}
              </span>
            ) : null}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

/** One row of filter controls. Six at most — a seventh means the list is wrong. */
export function InboxFilters({
  children,
  action,
  className,
}: {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-xl glass-l2 px-3 py-2.5',
        className,
      )}
    >
      {children}
      {action ? <div className="ms-auto">{action}</div> : null}
    </div>
  );
}

/** The scrolling list column. */
export function InboxList({
  label,
  count,
  action,
  children,
  emptyState,
  className,
}: {
  label: ReactNode;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
  emptyState?: ReactNode;
  className?: string;
}) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <section
      className={cn('flex min-h-0 flex-col overflow-hidden rounded-xl glass-l2', className)}
    >
      <header className="flex items-center gap-2.5 border-b border-border/60 px-4 py-3">
        <InboxIcon className="h-4 w-4 shrink-0 text-primary" />
        <h2 className="min-w-0 truncate text-sm font-semibold">{label}</h2>
        {typeof count === 'number' ? (
          <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
            {count}
          </span>
        ) : null}
        {action ? <div className="ms-auto shrink-0">{action}</div> : null}
      </header>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
        {hasChildren ? children : emptyState}
      </div>
    </section>
  );
}

/**
 * One item in the list — L3. Anatomy is fixed so a dense list still scans:
 *
 *   thumbnail?  reference · state chip
 *               title
 *               preview (one line, truncated)
 *               meta (who, when, which agent)
 */
export function InboxItem({
  selected,
  onSelect,
  thumbnail,
  reference,
  state,
  title,
  preview,
  meta,
  /** Draws the unread rule down the left edge. */
  unread,
  className,
}: {
  selected?: boolean;
  onSelect?: () => void;
  thumbnail?: ReactNode;
  reference?: ReactNode;
  state?: ReactNode;
  title: ReactNode;
  preview?: ReactNode;
  meta?: ReactNode;
  unread?: boolean;
  className?: string;
}) {
  return (
    <article
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'relative flex gap-3 rounded-xl glass-l3 px-3 py-3 transition-colors',
        onSelect && 'cursor-pointer hover:border-primary/50',
        selected && 'border-primary bg-primary/10',
        className,
      )}
    >
      {unread ? (
        <span className="absolute start-0 top-3 bottom-3 w-0.5 rounded-full bg-primary" />
      ) : null}
      {thumbnail ? (
        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-muted">
          {thumbnail}
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {reference}
          {state ? <span className="ms-auto shrink-0">{state}</span> : null}
        </div>
        <h3
          className={cn(
            'mt-1 truncate text-sm leading-snug',
            unread ? 'font-semibold' : 'font-medium',
          )}
        >
          {title}
        </h3>
        {preview ? (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{preview}</p>
        ) : null}
        {meta ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>
        ) : null}
      </div>
    </article>
  );
}

/** The reader column. Header pins; body scrolls; actions pin to the bottom. */
export function InboxReader({
  header,
  children,
  actions,
  empty,
  className,
}: {
  header?: ReactNode;
  children?: ReactNode;
  /** Pass a <DecisionBar>. Pinned, so it survives a long body. */
  actions?: ReactNode;
  /** Shown when nothing is selected. Say what to do, not "no item selected". */
  empty?: ReactNode;
  className?: string;
}) {
  if (!children && empty) {
    return (
      <section
        className={cn(
          'flex min-h-0 items-center justify-center rounded-xl glass-l2 p-8 text-center text-sm text-muted-foreground',
          className,
        )}
      >
        {empty}
      </section>
    );
  }
  return (
    <section
      className={cn('flex min-h-0 flex-col overflow-hidden rounded-xl glass-l2', className)}
    >
      {header ? (
        <header className="shrink-0 border-b border-border/60 px-5 py-4">
          {header}
        </header>
      ) : null}
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
        {children}
      </div>
      {actions ? (
        <footer className="shrink-0 border-t border-border/60 px-5 py-3">
          {actions}
        </footer>
      ) : null}
    </section>
  );
}

/** A labelled block inside the reader. */
export function ReaderSection({
  label,
  action,
  children,
  className,
}: {
  label: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <div className="mb-2 flex items-center gap-2">
        <p className="eyebrow">{label}</p>
        {action ? <div className="ms-auto">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * The decision bar. The reason the inbox exists: name the actual decision
 * ("Approve the rebooking", not "Submit") and put the reversible options on
 * the left of the irreversible one.
 */
export function DecisionBar({
  prompt,
  children,
  className,
}: {
  /** One line stating what is being decided and by whom. */
  prompt?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-3', className)}>
      {prompt ? (
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">{prompt}</p>
      ) : null}
      <div className="ms-auto flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
