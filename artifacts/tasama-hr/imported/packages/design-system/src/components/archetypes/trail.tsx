import type { ReactNode } from 'react';
import { tr } from '../../lib/i18n';
import { cn } from '../../lib/utils';

/**
 * DECISION TRAIL — who did what, at what authority, and what a human changed.
 *
 * This is the archetype that is usually missing, and it is the one that wins
 * the room. When a client asks "but how do I know what it did?", a trail is
 * the answer; a confidence score is not.
 *
 * Every entry names an actor (agent or person), the kind of act, the autonomy
 * it acted under, and — when a person disagreed — the override and its reason.
 * Overrides are the most valuable rows on the screen: they are the evidence
 * that the human is still in charge, and in a real deployment they are the
 * training data. Render them prominently, never as an error.
 *
 * Put it in the reader under the case, in the agent profile as recent activity,
 * and as its own screen when the client is in a regulated sector.
 *
 * Glass: L3 entries inside an L2 <Panel>.
 */

export type TrailKind =
  | 'observed'
  | 'proposed'
  | 'acted'
  | 'approved'
  | 'rejected'
  | 'overridden'
  | 'escalated';

const KIND: Record<TrailKind, { label: string; tone: string }> = {
  observed: { label: 'Observed', tone: 'text-muted-foreground' },
  proposed: { label: 'Proposed', tone: 'text-primary' },
  acted: { label: 'Acted', tone: 'text-primary' },
  approved: { label: 'Approved', tone: 'text-success' },
  rejected: { label: 'Rejected', tone: 'text-danger' },
  overridden: { label: 'Overridden', tone: 'text-warn' },
  escalated: { label: 'Escalated', tone: 'text-warn' },
};

export function DecisionTrail({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <ol className={cn('space-y-2', className)}>{tr(children)}</ol>;
}

export function TrailEntry({
  actor,
  kind,
  at,
  summary,
  detail,
  autonomy,
  /** What a person changed, and why. The reason is the point — require it. */
  override,
  className,
}: {
  /** An <AgentAvatar> + name, or a person's name. */
  actor: ReactNode;
  kind: TrailKind;
  at: ReactNode;
  summary: ReactNode;
  detail?: ReactNode;
  /** An <AgentAutonomyChip> for the level this act ran at. */
  autonomy?: ReactNode;
  override?: { from: ReactNode; to: ReactNode; reason: ReactNode };
  className?: string;
}) {
  const spec = KIND[kind];
  return (
    <li className={cn('rounded-xl glass-l3 px-4 py-3', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex min-w-0 items-center gap-2">{actor}</span>
        <span
          className={cn(
            'font-mono text-[11px] uppercase tracking-wider',
            spec.tone,
          )}
        >
          {tr(spec.label)}
        </span>
        {autonomy}
        <span className="ms-auto shrink-0 font-mono text-xs text-muted-foreground">
          {at}
        </span>
      </div>
      <p className="mt-2 text-sm leading-snug">{tr(summary)}</p>
      {detail ? (
        <p className="mt-1 text-sm leading-snug text-muted-foreground">{tr(detail)}</p>
      ) : null}
      {override ? (
        <div className="mt-2.5 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2">
          <p className="font-mono text-[11px] uppercase tracking-wider text-warn">
            {tr('Human override')}
          </p>
          <p className="mt-1 text-sm leading-snug">
            <span className="line-through opacity-60">{override.from}</span>
            <span className="mx-2 opacity-60">→</span>
            <span className="font-medium">{override.to}</span>
          </p>
          <p className="mt-1 text-sm leading-snug text-muted-foreground">
            {override.reason}
          </p>
        </div>
      ) : null}
    </li>
  );
}
