import type { ReactNode } from 'react';
import { tr } from '../../lib/i18n';
import { ArrowRight, X } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * AGENTS TEAM — the roster, the profile, and the live strip.
 *
 * An agentic prototype is judged on whether the client can name the agents.
 * Give every agent a face, a job title in the client's own vocabulary, one
 * sentence of purpose, and a declared autonomy level. An unnamed "AI" doing
 * unspecified things reads as a black box and gets argued with; a named
 * colleague with a stated remit gets negotiated with, which is the
 * conversation worth having.
 *
 * Three surfaces, all on the glass scale:
 *
 *   <AgentStatusStrip>  L3 plates inside a panel — who is on THIS case, now
 *   <AgentDirectory>    the Agents Team screen, a grid of L3 <AgentCard>s
 *   <AgentProfile>      the detail view: functions, superpower, impact, stats
 *
 * AUTONOMY IS NOT DECORATION. The level shown on a card is the level the
 * workflow actually runs at. If the prototype asks for approval, the agent is
 * `assisted` — do not label it `autonomous` because that is the roadmap.
 */

/** The authority ladder. Same five rungs across every Cognirise prototype. */
export type AgentAutonomy =
  | 'observe'
  | 'recommend'
  | 'assisted'
  | 'supervised'
  | 'autonomous';

const AUTONOMY: Record<
  AgentAutonomy,
  { label: string; short: string; detail: string; tone: string }
> = {
  observe: {
    label: 'Observes',
    short: 'A0',
    detail: 'Reads and reports. Takes no action and proposes none.',
    tone: 'border-border bg-muted/40 text-muted-foreground',
  },
  recommend: {
    label: 'Recommends',
    short: 'A1',
    detail: 'Proposes an action. A person decides and executes.',
    tone: 'border-border bg-muted/40 text-foreground',
  },
  assisted: {
    label: 'Acts on approval',
    short: 'A2',
    detail: 'Prepares the action in full. Executes only once approved.',
    tone: 'border-primary/30 bg-primary/10 text-primary',
  },
  supervised: {
    label: 'Acts and notifies',
    short: 'A3',
    detail: 'Executes within its remit, then reports. Reversible by a person.',
    tone: 'border-warn/40 bg-warn/10 text-warn',
  },
  autonomous: {
    label: 'Autonomous',
    short: 'A4',
    detail: 'Executes and closes without review, inside stated boundaries.',
    tone: 'border-danger/40 bg-danger/10 text-danger',
  },
};

export function AgentAutonomyChip({
  level,
  showCode = true,
  className,
}: {
  level: AgentAutonomy;
  showCode?: boolean;
  className?: string;
}) {
  const spec = AUTONOMY[level];
  return (
    <span
      title={spec.detail}
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider',
        spec.tone,
        className,
      )}
    >
      {showCode ? <span className="opacity-70">{spec.short}</span> : null}
      {tr(spec.label)}
    </span>
  );
}

/** The one-line explanation of a rung — use it in the profile, not the card. */
export function autonomyDetail(level: AgentAutonomy) {
  return AUTONOMY[level].detail;
}

/** What an agent is doing right now, on this case. */
export type AgentActivity = 'working' | 'waiting' | 'idle' | 'blocked' | 'done';

const ACTIVITY: Record<AgentActivity, { label: string; ring: string; dot: string }> = {
  working: { label: 'Working', ring: 'ring-success', dot: 'bg-success' },
  waiting: { label: 'Waiting', ring: 'ring-warn', dot: 'bg-warn' },
  idle: { label: 'Idle', ring: 'ring-border', dot: 'bg-muted-foreground' },
  blocked: { label: 'Blocked', ring: 'ring-danger', dot: 'bg-danger' },
  done: { label: 'Done', ring: 'ring-primary', dot: 'bg-primary' },
};

export type Agent = {
  id: string;
  /** The agent's given name. Short, human, pronounceable in the client's language. */
  name: string;
  /** Job title in the client's vocabulary — "Disruption Coordinator", not "Agent 3". */
  role: string;
  /** One sentence: what it is for. Not a feature list. */
  purpose?: ReactNode;
  avatar?: string;
  /** Two letters, used when no avatar image is supplied. */
  initials?: string;
  autonomy?: AgentAutonomy;
  activity?: AgentActivity;
};

function initialsOf(agent: Agent) {
  if (agent.initials) return agent.initials;
  return agent.name.trim().slice(0, 2).toLocaleUpperCase();
}

export function AgentAvatar({
  agent,
  size = 48,
  showActivity = true,
  className,
}: {
  agent: Agent;
  size?: number;
  showActivity?: boolean;
  className?: string;
}) {
  const activity = agent.activity ? ACTIVITY[agent.activity] : null;
  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      <span
        style={{ width: size, height: size }}
        className={cn(
          'inline-flex items-center justify-center overflow-hidden rounded-full bg-muted font-semibold text-foreground ring-2 ring-offset-2 ring-offset-transparent',
          activity ? activity.ring : 'ring-border',
        )}
      >
        {agent.avatar ? (
          <img
            src={agent.avatar}
            alt=""
            className="h-full w-full object-cover object-[center_15%]"
            loading="lazy"
          />
        ) : (
          <span style={{ fontSize: Math.round(size * 0.34) }}>
            {initialsOf(agent)}
          </span>
        )}
      </span>
      {showActivity && activity ? (
        <span
          aria-label={activity.label}
          className={cn(
            'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background',
            activity.dot,
          )}
        />
      ) : null}
    </span>
  );
}

export function AgentActivityChip({
  activity,
  className,
}: {
  activity: AgentActivity;
  className?: string;
}) {
  const spec = ACTIVITY[activity];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground',
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', spec.dot)} />
      {tr(spec.label)}
    </span>
  );
}

/**
 * The participating-agents strip: who is on THIS record, and what each is
 * doing about it. Belongs inside a <Panel> above the case detail — it answers
 * "who is handling this" before the reader asks.
 */
export function AgentStatusStrip({
  agents,
  onOpen,
  className,
}: {
  agents: Agent[];
  onOpen?: (agent: Agent) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {agents.map((agent) => (
        <button
          key={agent.id}
          type="button"
          onClick={onOpen ? () => onOpen(agent) : undefined}
          className={cn(
            'flex items-center gap-2.5 rounded-xl glass-l3 px-3 py-2 text-start transition-colors',
            onOpen && 'cursor-pointer hover:border-primary/50',
          )}
        >
          <AgentAvatar agent={agent} size={32} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium leading-tight">
              {agent.name}
            </span>
            {agent.activity ? (
              <AgentActivityChip activity={agent.activity} />
            ) : (
              <span className="block truncate text-xs text-muted-foreground">
                {tr(agent.role)}
              </span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}

/** The grid on the Agents Team screen. Put it inside a <Panel>. */
export function AgentDirectory({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] gap-3',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** One agent's summary card — L3, so it belongs inside a <Panel>. */
export function AgentCard({
  agent,
  onOpen,
  footer,
  className,
}: {
  agent: Agent;
  onOpen?: () => void;
  /** Optional extra row — a workload count, a last-run time. */
  footer?: ReactNode;
  className?: string;
}) {
  /**
   * With a portrait, the photograph IS the card's header: full width, bled to
   * the card's own edges, with the name and role set over the foot of it. A
   * 48px circle makes a colleague look like a contact row; this makes the team
   * page read as a team. Without a portrait the card falls back to the avatar
   * row, so an agent with no photograph does not break the grid.
   */
  const portrait = Boolean(agent.avatar);
  return (
    <article
      onClick={onOpen}
      className={cn(
        'group flex h-full flex-col overflow-hidden rounded-xl glass-l3 p-4 transition-colors',
        onOpen && 'cursor-pointer hover:border-primary/50',
        className,
      )}
    >
      {portrait ? (
        <div className="relative -mx-4 -mt-4 mb-3.5 aspect-[4/5] overflow-hidden">
          <img
            src={agent.avatar}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.03]"
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/45 to-transparent px-4 pb-3 pt-10">
            <h3 className="truncate text-[15px] font-semibold leading-tight text-white">{agent.name}</h3>
            <p className="truncate text-[12.5px] leading-tight text-white/85">{tr(agent.role)}</p>
          </div>
          {agent.activity ? (
            <span className="absolute end-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-white backdrop-blur-sm">
              <span className={cn('h-1.5 w-1.5 rounded-full', ACTIVITY[agent.activity].dot)} />
              {ACTIVITY[agent.activity].label}
            </span>
          ) : null}
        </div>
      ) : (
        <div className="flex items-start gap-3">
          <AgentAvatar agent={agent} size={52} />
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-semibold leading-tight">{agent.name}</h3>
            <p className="truncate text-sm text-muted-foreground">{tr(agent.role)}</p>
          </div>
        </div>
      )}
      {agent.purpose ? (
        <p className={cn('text-sm leading-snug text-muted-foreground', portrait ? 'mt-0' : 'mt-3')}>
          {tr(agent.purpose)}
        </p>
      ) : null}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
        {agent.autonomy ? <AgentAutonomyChip level={agent.autonomy} /> : null}
        {onOpen ? (
          <span className="ms-auto inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-medium text-primary">
            Open profile
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        ) : null}
      </div>
      {footer ? (
        <div className="mt-3 border-t border-border pt-3">{footer}</div>
      ) : null}
    </article>
  );
}

/**
 * The agent profile. Four blocks, in this order, because this is the order a
 * sceptical client reads them in:
 *
 *   FUNCTIONS    what it does, numbered, in its own words
 *   SUPERPOWER   the one thing it does that a person cannot do at this speed
 *   IMPACT       what changes in the business if it works
 *   STATS        the numbers it is accountable for
 *
 * Render it in a <Dialog> or as a page. It carries no surface of its own above
 * L2, so wrap it in a <Panel> or a dialog's own glass.
 */
export function AgentProfile({
  agent,
  functions,
  superpower,
  impact,
  stats,
  onClose,
  className,
}: {
  agent: Agent;
  /** Numbered on render — pass them in priority order, three to six. */
  functions: ReactNode[];
  superpower?: ReactNode;
  impact?: ReactNode;
  stats?: { label: ReactNode; value: ReactNode }[];
  onClose?: () => void;
  className?: string;
}) {
  return (
    <div className={cn('space-y-5', className)}>
      <header className="flex items-start gap-4">
        <AgentAvatar agent={agent} size={64} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl font-semibold leading-tight">
            {agent.name}
          </h2>
          <p className="truncate text-muted-foreground">{tr(agent.role)}</p>
          {agent.autonomy ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <AgentAutonomyChip level={agent.autonomy} />
              <span className="text-xs text-muted-foreground">
                {autonomyDetail(agent.autonomy)}
              </span>
            </div>
          ) : null}
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close profile"
            className="shrink-0 rounded-full border border-border p-1.5 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </header>

      <ProfileBlock label="Functions">
        <ol className="space-y-2">
          {functions.map((entry, index) => (
            <li key={index} className="flex gap-3 text-sm leading-snug">
              <span className="shrink-0 font-mono text-xs text-primary">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="min-w-0">{entry}</span>
            </li>
          ))}
        </ol>
      </ProfileBlock>

      {superpower ? (
        <ProfileBlock label="Superpower">
          <p className="text-sm leading-snug">{superpower}</p>
        </ProfileBlock>
      ) : null}

      {impact ? (
        <ProfileBlock label="Business impact">
          <p className="text-sm leading-snug">{impact}</p>
        </ProfileBlock>
      ) : null}

      {stats && stats.length ? (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-3">
          {stats.map((stat, index) => (
            <div key={index} className="rounded-xl glass-l3 px-4 py-3">
              <p className="text-[11px] uppercase leading-tight tracking-widest text-muted-foreground">
                {stat.label}
              </p>
              <p className="mt-1.5 text-2xl font-extrabold tabular-nums">
                {stat.value}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ProfileBlock({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <section>
      <p className="eyebrow mb-2">{tr(label)}</p>
      {children}
    </section>
  );
}
