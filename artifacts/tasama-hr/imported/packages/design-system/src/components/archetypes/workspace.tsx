import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

/**
 * WORKSPACE — one job, end to end.
 *
 * The Inbox is what is waiting on you. The Workspace is the job itself:
 * procurement, HR, claims, disruption. It is the screen that shows a workflow
 * as a thing with inputs, work in flight, and outputs — not as a chart.
 *
 * The three-lane shape is the whole idea, and it is what clients recognise as
 * their own process:
 *
 *   INTAKE      what arrived, and from where
 *   IN FLIGHT   what agents are doing about it, right now, with who owns it
 *   OUTPUT      what came out, and what happened to it downstream
 *
 * One workspace per job. If a second job needs a second set of lanes, that is
 * a second workspace and usually a second menu item — do not put two jobs in
 * one workspace and separate them with a filter.
 *
 * Glass: the lanes are L2, the cards inside them L3, so the whole thing sits
 * inside <MainPanel>.
 */

export function WorkspaceLayout({
  header,
  summary,
  children,
  aside,
  className,
}: {
  /** <WorkspaceHeader> — the job, the persona, the period. */
  header?: ReactNode;
  /** A <StatRow> of the four numbers this job is judged on. */
  summary?: ReactNode;
  /** <WorkspaceLanes>. */
  children: ReactNode;
  /** Optional right column — health, exceptions, recent decisions. */
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-3', className)}>
      {header}
      {summary}
      {aside ? (
        <div className="grid gap-3 xl:grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)]">
          <div className="min-w-0">{children}</div>
          <div className="min-w-0 space-y-3">{aside}</div>
        </div>
      ) : (
        children
      )}
    </div>
  );
}

/**
 * States the job, whose workspace this is, and over what period. Three facts,
 * because a workspace with no stated owner reads as everyone's and therefore
 * nobody's.
 */
export function WorkspaceHeader({
  job,
  owner,
  period,
  actions,
  className,
}: {
  job: ReactNode;
  /** The persona currently holding it. Changes when the persona switches. */
  owner?: ReactNode;
  period?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl glass-l2 px-4 py-3',
        className,
      )}
    >
      <h2 className="text-base font-semibold">{job}</h2>
      {owner ? (
        <span className="text-sm text-muted-foreground">{owner}</span>
      ) : null}
      {period ? (
        <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
          {period}
        </span>
      ) : null}
      {actions ? <div className="ms-auto">{actions}</div> : null}
    </div>
  );
}

export function WorkspaceLanes({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('grid gap-3 lg:grid-cols-3', className)}>{children}</div>
  );
}

/** One lane — L2. Its cards are L3. */
export function WorkspaceLane({
  icon,
  title,
  count,
  caption,
  action,
  children,
  emptyState,
  tone = 'default',
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  count?: number;
  /** One line saying what belongs in this lane, in the client's words. */
  caption?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  emptyState?: ReactNode;
  tone?: 'default' | 'accent';
  className?: string;
}) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <section
      className={cn(
        'flex min-h-0 flex-col overflow-hidden rounded-xl glass-l2',
        tone === 'accent' && 'border-accent/30',
        className,
      )}
    >
      <header className="px-4 py-3">
        <div className="flex items-center gap-2.5">
          {icon ? <span className="shrink-0 text-primary">{icon}</span> : null}
          <h3 className="min-w-0 truncate text-sm font-semibold">{title}</h3>
          {typeof count === 'number' ? (
            <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
              {count}
            </span>
          ) : null}
          {action ? <div className="ms-auto shrink-0">{action}</div> : null}
        </div>
        {caption ? (
          <p className="mt-1 text-xs leading-snug text-muted-foreground">
            {caption}
          </p>
        ) : null}
      </header>
      <div className="min-h-0 flex-1 space-y-2 px-3 pb-3">
        {hasChildren ? children : emptyState}
      </div>
    </section>
  );
}

/**
 * A unit of work in a lane — L3. `handler` is who or what currently owns it,
 * and it is not optional in practice: work with no visible owner is the thing
 * clients most often say they do not trust about agentic systems.
 */
export function WorkItemCard({
  reference,
  title,
  handler,
  state,
  progress,
  meta,
  onOpen,
  className,
}: {
  reference?: ReactNode;
  title: ReactNode;
  /** An <AgentAvatar> plus a name, or a person. */
  handler?: ReactNode;
  state?: ReactNode;
  /** 0–100. Omit rather than faking a number. */
  progress?: number;
  meta?: ReactNode;
  onOpen?: () => void;
  className?: string;
}) {
  return (
    <article
      onClick={onOpen}
      className={cn(
        'rounded-xl glass-l3 px-3.5 py-3 transition-colors',
        onOpen && 'cursor-pointer hover:border-primary/50',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        {reference}
        {state ? <span className="ms-auto shrink-0">{state}</span> : null}
      </div>
      <h4 className="mt-1.5 text-sm font-medium leading-snug">{title}</h4>
      {typeof progress === 'number' ? (
        <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
          />
        </div>
      ) : null}
      {handler || meta ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {handler}
          {meta}
        </div>
      ) : null}
    </article>
  );
}

/**
 * A finished artifact: the thing the workflow produced. Give it a format and
 * a destination — an output with nowhere to go is not an output.
 */
export function OutputCard({
  title,
  format,
  destination,
  provenance,
  meta,
  onOpen,
  className,
}: {
  title: ReactNode;
  /** "PDF", "Purchase order", "Email draft". */
  format?: ReactNode;
  /** Where it went, or is waiting to go: "Sent to SAP", "Awaiting approval". */
  destination?: ReactNode;
  /** A <ProvenanceChip>. Outputs built on synthetic inputs must say so. */
  provenance?: ReactNode;
  meta?: ReactNode;
  onOpen?: () => void;
  className?: string;
}) {
  return (
    <article
      onClick={onOpen}
      className={cn(
        'rounded-xl glass-l3 px-3.5 py-3 transition-colors',
        onOpen && 'cursor-pointer hover:border-primary/50',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        {format ? (
          <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            {format}
          </span>
        ) : null}
        {provenance ? <span className="ms-auto shrink-0">{provenance}</span> : null}
      </div>
      <h4 className="mt-1.5 text-sm font-medium leading-snug">{title}</h4>
      {destination ? (
        <p className="mt-1 text-xs text-muted-foreground">{destination}</p>
      ) : null}
      {meta ? <div className="mt-2 flex items-center gap-2">{meta}</div> : null}
    </article>
  );
}
