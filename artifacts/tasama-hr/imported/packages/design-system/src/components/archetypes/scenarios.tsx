import { tr } from '../../lib/i18n';
import type { ReactNode } from 'react';
import { Play, RotateCcw } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * SCENARIOS — the demo's remote control.
 *
 * A prototype that only sits at rest demos badly: the client sees a populated
 * screen and has to take on faith that anything happens. A scenario runner
 * fixes that. Pick "Flight cancelled at 06:40", press run, and watch the case
 * appear in the inbox, the agents pick it up, the trail fill and the output
 * land. It is the difference between showing a screen and showing a system.
 *
 * It is also the honest place to put the seams. Each scenario states its
 * premise and what it is meant to demonstrate, so a client watching knows
 * an event was injected rather than observed.
 *
 * Keep the set small — four to six — and make each one a different SHAPE of
 * case, not a different set of names: the happy path, the exception, the one
 * the agent refuses, the one that escalates to a person.
 *
 * Glass: cards are L3; put the runner inside a <Panel>.
 */

export type ScenarioState = 'idle' | 'running' | 'complete' | 'failed';

export function ScenarioRunner({
  children,
  onReset,
  className,
}: {
  children: ReactNode;
  /** Restores the prototype to its opening state. Always offer it. */
  onReset?: () => void;
  className?: string;
}) {
  return (
    <div className={cn('space-y-3', className)}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
      {onReset ? (
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-2 rounded-full border border-border px-3.5 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {tr('Reset the demo')}
        </button>
      ) : null}
    </div>
  );
}

export function ScenarioCard({
  name,
  premise,
  demonstrates,
  state = 'idle',
  onRun,
  className,
}: {
  name: ReactNode;
  /** The event being injected, in one sentence. */
  premise: ReactNode;
  /** What the client should watch for. This is the line you say out loud. */
  demonstrates?: ReactNode;
  state?: ScenarioState;
  onRun?: () => void;
  className?: string;
}) {
  const running = state === 'running';
  return (
    <article className={cn('flex h-full flex-col rounded-xl glass-l3 p-4', className)}>
      <div className="flex items-start gap-2">
        <h3 className="min-w-0 flex-1 font-semibold leading-tight">{name}</h3>
        {state !== 'idle' ? (
          <span
            className={cn(
              'shrink-0 font-mono text-[11px] uppercase tracking-wider',
              running && 'text-warn',
              state === 'complete' && 'text-success',
              state === 'failed' && 'text-danger',
            )}
          >
            {running ? 'Running' : state === 'complete' ? 'Complete' : 'Failed'}
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-sm leading-snug text-muted-foreground">{premise}</p>
      {demonstrates ? (
        <p className="mt-2 border-s-2 border-primary/50 ps-3 text-sm leading-snug">
          {demonstrates}
        </p>
      ) : null}
      {onRun ? (
        <button
          type="button"
          onClick={onRun}
          disabled={running}
          className="mt-auto inline-flex w-fit items-center gap-2 pt-4 text-sm font-medium text-primary disabled:opacity-50"
        >
          <Play className="h-3.5 w-3.5" />
          {tr(running ? 'Running…' : 'Run scenario')}
        </button>
      ) : null}
    </article>
  );
}
