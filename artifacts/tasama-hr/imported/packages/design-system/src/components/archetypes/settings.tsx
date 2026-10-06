import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * SETTINGS — and the persona switcher, which is the real reason this screen
 * exists in a prototype.
 *
 * In a production app, settings are plumbing. In a demo, the persona switcher
 * is the most-used control in the room: it is how one build shows the buyer,
 * the operator and the approver their own screen, and how a client sees that
 * authority is modelled rather than assumed.
 *
 * So treat it as a first-class feature, not a preference:
 *
 *   - Switching persona changes the inbox, the workspace owner, what is
 *     approvable and what the assistant will do. If it only changes a name in
 *     the title bar, the prototype has no authority model.
 *   - Every persona states its approval limits in the client's own units.
 *   - The switch is instant and reversible. No reload, no login.
 *
 * Put the switcher both here AND in the title bar's user badge — during a demo
 * nobody wants to navigate to settings to change who they are.
 *
 * Glass: <SettingsLayout> nav and body are L2; rows and persona cards are L3.
 * Use the `prose` container width for the body.
 */

export function SettingsLayout({
  nav,
  children,
  className,
}: {
  /** A vertical list of section links. Omit for a single-column settings page. */
  nav?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  if (!nav) {
    return <div className={cn('space-y-3', className)}>{children}</div>;
  }
  return (
    <div
      className={cn(
        'grid gap-3 lg:grid-cols-[minmax(0,220px)_minmax(0,1fr)]',
        className,
      )}
    >
      <nav className="h-fit rounded-xl glass-l2 p-2">{nav}</nav>
      <div className="min-w-0 space-y-3">{children}</div>
    </div>
  );
}

export function SettingsNavItem({
  active,
  onSelect,
  children,
  className,
}: {
  active?: boolean;
  onSelect?: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'w-full rounded-lg px-3 py-2 text-start text-sm transition-colors',
        active
          ? 'bg-primary/10 font-medium text-primary'
          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
        className,
      )}
    >
      {children}
    </button>
  );
}

/** A titled group of settings — L2. Its rows are L3 or plain. */
export function SettingsGroup({
  title,
  description,
  action,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('overflow-hidden rounded-xl glass-l2', className)}>
      <header className="px-5 py-4">
        <div className="flex items-center gap-2">
          <h2 className="min-w-0 text-base font-semibold">{title}</h2>
          {action ? <div className="ms-auto shrink-0">{action}</div> : null}
        </div>
        {description ? (
          <p className="mt-1 text-sm leading-snug text-muted-foreground">
            {description}
          </p>
        ) : null}
      </header>
      <div className="px-5 pb-5">{children}</div>
    </section>
  );
}

/** One setting. Label and hint on the left, the control on the right. */
export function SettingsRow({
  label,
  hint,
  control,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  control: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-4 border-b border-border/60 py-3 last:border-b-0',
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        {hint ? (
          <p className="mt-0.5 text-sm leading-snug text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

export type Persona = {
  id: string;
  /** The person's name. Give personas names; "Approver 2" is not a persona. */
  name: string;
  /** Job title, in the client's vocabulary. */
  role: string;
  /** What this persona is responsible for. One sentence. */
  remit?: ReactNode;
  /** What they may approve, in the client's own units: "Up to AED 250,000". */
  authority?: ReactNode;
  /** What is hidden from them. Say it — scope is half of a persona. */
  restrictions?: ReactNode;
  avatar?: string;
  initials?: string;
};

/**
 * The persona switcher. Cards rather than a drop-down, because the authority
 * and remit have to be visible at the moment of switching — that is what makes
 * the demo land.
 */
export function PersonaSwitcher({
  personas,
  value,
  onChange,
  className,
}: {
  personas: Persona[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-[repeat(auto-fit,minmax(16rem,1fr))] gap-3',
        className,
      )}
    >
      {personas.map((persona) => (
        <PersonaCard
          key={persona.id}
          persona={persona}
          selected={persona.id === value}
          onSelect={() => onChange(persona.id)}
        />
      ))}
    </div>
  );
}

export function PersonaCard({
  persona,
  selected,
  onSelect,
  className,
}: {
  persona: Persona;
  selected?: boolean;
  onSelect?: () => void;
  className?: string;
}) {
  const initials =
    persona.initials ?? persona.name.trim().slice(0, 2).toLocaleUpperCase();
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'flex h-full flex-col rounded-xl glass-l3 p-4 text-start transition-colors',
        onSelect && 'cursor-pointer hover:border-primary/50',
        selected && 'border-primary bg-primary/10',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-sm font-semibold">
          {persona.avatar ? (
            <img
              src={persona.avatar}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            initials
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight">{persona.name}</p>
          <p className="text-sm leading-snug text-muted-foreground">{persona.role}</p>
        </div>
        {selected ? (
          <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        ) : null}
      </div>
      {persona.remit ? (
        <p className="mt-3 text-sm leading-snug text-muted-foreground">
          {persona.remit}
        </p>
      ) : null}
      {persona.authority || persona.restrictions ? (
        <dl className="mt-3 space-y-2 border-t border-border/60 pt-3 text-sm">
          {persona.authority ? (
            <div>
              <dt className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                Approves
              </dt>
              <dd className="mt-0.5 leading-snug">{persona.authority}</dd>
            </div>
          ) : null}
          {persona.restrictions ? (
            <div>
              <dt className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                Cannot see
              </dt>
              <dd className="mt-0.5 leading-snug text-muted-foreground">
                {persona.restrictions}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </button>
  );
}
