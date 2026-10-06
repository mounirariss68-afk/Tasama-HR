import { tr } from '../../lib/i18n';
import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * WORKFLOWS — what the prototype automates, and exactly how.
 *
 * Two surfaces, and both are needed. The catalog is what a sponsor reads: a
 * structured list of every workflow, what triggers it, who runs it and at what
 * autonomy. The walkthrough is what an engineer and a process owner read: every
 * step, its inputs, its outputs, and the decision it makes.
 *
 * This screen is also the honest one. Mark the workflows that are NOT
 * implemented in the prototype with `coverage="designed"` and leave them in the
 * list. A catalog that only shows what was built lets a client assume the rest
 * exists; a catalog that shows the whole process with three of nine steps
 * implemented is a much better conversation, and a much better scope document.
 *
 * Glass: <WorkflowCard> and <WorkflowStep> are L3 — put the catalog and the
 * walkthrough inside a <Panel>.
 */

/** How much of this workflow the prototype actually does. */
export type WorkflowCoverage = 'implemented' | 'partial' | 'designed' | 'manual';

const COVERAGE: Record<
  WorkflowCoverage,
  { label: string; detail: string; tone: string }
> = {
  implemented: {
    label: 'Implemented',
    detail: 'Runs end to end in the prototype.',
    tone: 'border-success/40 bg-success/10 text-success',
  },
  partial: {
    label: 'Partial',
    detail: 'Some steps run; the rest are described, not built.',
    tone: 'border-warn/40 bg-warn/10 text-warn',
  },
  designed: {
    label: 'Designed',
    detail: 'Specified for the build, not implemented in the prototype.',
    tone: 'border-border bg-muted/40 text-muted-foreground',
  },
  manual: {
    label: 'Stays manual',
    detail: 'Deliberately left with a person.',
    tone: 'border-border bg-muted/40 text-muted-foreground',
  },
};

export function WorkflowCoverageChip({
  coverage,
  className,
}: {
  coverage: WorkflowCoverage;
  className?: string;
}) {
  const spec = COVERAGE[coverage];
  return (
    <span
      title={spec.detail}
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-sm border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider',
        spec.tone,
        className,
      )}
    >
      {tr(spec.label)}
    </span>
  );
}

export function WorkflowCatalog({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('grid gap-3 xl:grid-cols-2', className)}>{children}</div>
  );
}

export function WorkflowCard({
  name,
  purpose,
  trigger,
  outcome,
  coverage,
  autonomy,
  agents,
  stepCount,
  onOpen,
  className,
}: {
  name: ReactNode;
  /** One sentence. What it is for, not how it works. */
  purpose?: ReactNode;
  /** What starts it: an event, a schedule, a person. */
  trigger?: ReactNode;
  /** What the world looks like when it finishes. */
  outcome?: ReactNode;
  coverage?: WorkflowCoverage;
  /** An <AgentAutonomyChip> for the highest level any step runs at. */
  autonomy?: ReactNode;
  /** A row of <AgentAvatar>s. */
  agents?: ReactNode;
  stepCount?: number;
  onOpen?: () => void;
  className?: string;
}) {
  return (
    <article
      onClick={onOpen}
      className={cn(
        'group flex h-full flex-col rounded-xl glass-l3 p-4 transition-colors',
        onOpen && 'cursor-pointer hover:border-primary/50',
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <h3 className="min-w-0 flex-1 font-semibold leading-tight">{name}</h3>
        {coverage ? (
          <WorkflowCoverageChip coverage={coverage} className="shrink-0" />
        ) : null}
      </div>
      {purpose ? (
        <p className="mt-2 text-sm leading-snug text-muted-foreground">{purpose}</p>
      ) : null}
      {trigger || outcome ? (
        <dl className="mt-3 space-y-1.5 text-sm">
          {trigger ? (
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                Trigger
              </dt>
              <dd className="min-w-0">{trigger}</dd>
            </div>
          ) : null}
          {outcome ? (
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                Outcome
              </dt>
              <dd className="min-w-0">{outcome}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
        {agents}
        {autonomy}
        {typeof stepCount === 'number' ? (
          <span className="font-mono text-xs text-muted-foreground">
            {stepCount} steps
          </span>
        ) : null}
        {onOpen ? (
          <span className="ms-auto inline-flex items-center gap-1 text-xs font-medium text-primary">
            Walk through
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        ) : null}
      </div>
    </article>
  );
}

/** The ordered walkthrough. Numbered, with a rule connecting the steps. */
export function WorkflowWalkthrough({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <ol className={cn('relative space-y-2 ps-8', className)}>
      <span
        aria-hidden="true"
        className="absolute left-[15px] top-3 bottom-3 w-px bg-border"
      />
      {children}
    </ol>
  );
}

/**
 * One step. `actor`, `inputs`, `outputs` and `decision` are the four things a
 * process owner checks, so the component asks for all four rather than letting
 * a step be a sentence.
 */
export function WorkflowStep({
  index,
  title,
  actor,
  detail,
  inputs,
  outputs,
  /** The judgement made here, and by whom. Omit only if the step is mechanical. */
  decision,
  autonomy,
  coverage,
  className,
}: {
  index: number;
  title: ReactNode;
  /** The agent or role that performs it. */
  actor?: ReactNode;
  detail?: ReactNode;
  inputs?: ReactNode[];
  outputs?: ReactNode[];
  decision?: ReactNode;
  autonomy?: ReactNode;
  coverage?: WorkflowCoverage;
  className?: string;
}) {
  return (
    <li className={cn('relative rounded-xl glass-l3 px-4 py-3.5', className)}>
      <span className="absolute -left-8 top-3 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card font-mono text-xs tabular-nums">
        {String(index).padStart(2, '0')}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="min-w-0 flex-1 font-semibold leading-tight">{title}</h4>
        {coverage ? <WorkflowCoverageChip coverage={coverage} /> : null}
      </div>
      {actor || autonomy ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {actor}
          {autonomy}
        </div>
      ) : null}
      {detail ? (
        <p className="mt-2 text-sm leading-snug text-muted-foreground">{detail}</p>
      ) : null}
      {inputs?.length || outputs?.length ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {inputs?.length ? <StepList label="Inputs" items={inputs} /> : null}
          {outputs?.length ? <StepList label="Outputs" items={outputs} /> : null}
        </div>
      ) : null}
      {decision ? (
        <div className="mt-3 border-s-2 border-primary/50 ps-3">
          <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            {tr('Decision')}
          </p>
          <p className="mt-0.5 text-sm leading-snug">{decision}</p>
        </div>
      ) : null}
    </li>
  );
}

function StepList({ label, items }: { label: string; items: ReactNode[] }) {
  return (
    <div>
      <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
        {tr(label)}
      </p>
      <ul className="mt-1 space-y-0.5">
        {items.map((item, index) => (
          <li key={index} className="text-sm leading-snug">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
