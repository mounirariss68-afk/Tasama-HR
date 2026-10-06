import { tr } from '../../lib/i18n';
import type { ReactNode } from 'react';
import { FlaskConical, Info, ShieldCheck, TriangleAlert } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * PROVENANCE — labelling what is real and what is not.
 *
 * Every Cognirise prototype runs on synthetic data. The failure mode is not
 * the client disbelieving the demo; it is the client believing it too much —
 * screenshotting a fabricated case and circulating it as a finding, or
 * carrying a made-up number into a business case.
 *
 * So provenance is a first-class primitive, labelled at three scales:
 *
 *   screen   <DemoBanner>      once, at the top of a surface built on
 *                              fabricated events
 *   record   <ProvenanceChip>  on the card, the row, the reader header
 *   claim    <ProvenanceNote>  under the specific sentence that would be
 *                              mistaken for evidence
 *
 * Use the honest word. `synthetic` is data we generated. `simulated` is an
 * event we injected. `illustrative` is a number chosen to make a point rather
 * than computed. `verified` is the rare case where the value came from a real
 * source the client supplied — say so, and say which source.
 */

export type ProvenanceKind =
  | 'synthetic'
  | 'simulated'
  | 'illustrative'
  | 'verified';

const PROVENANCE: Record<
  ProvenanceKind,
  { label: string; icon: ReactNode; tone: string }
> = {
  synthetic: {
    label: 'Synthetic',
    icon: <FlaskConical className="h-3 w-3" />,
    tone: 'border-primary/30 bg-primary/10 text-primary',
  },
  simulated: {
    label: 'Simulated',
    icon: <TriangleAlert className="h-3 w-3" />,
    tone: 'border-warn/40 bg-warn/10 text-warn',
  },
  illustrative: {
    label: 'Illustrative',
    icon: <Info className="h-3 w-3" />,
    tone: 'border-border bg-muted/40 text-muted-foreground',
  },
  verified: {
    label: 'Verified',
    icon: <ShieldCheck className="h-3 w-3" />,
    tone: 'border-success/40 bg-success/10 text-success',
  },
};

/** Record-level label. Put it where the eye lands on the record's identity. */
export function ProvenanceChip({
  kind,
  label,
  className,
}: {
  kind: ProvenanceKind;
  /** Overrides the default word — use it to name the source: "Verified — client CSV". */
  label?: ReactNode;
  className?: string;
}) {
  const spec = PROVENANCE[kind];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider',
        spec.tone,
        className,
      )}
    >
      {spec.icon}
      {label ?? spec.label}
    </span>
  );
}

/**
 * Screen-level banner. One per surface, directly under the page hero or at the
 * top of the reader — never more than one, or it stops being read.
 */
export function DemoBanner({
  kind = 'synthetic',
  title,
  children,
  className,
}: {
  kind?: ProvenanceKind;
  title?: ReactNode;
  /** One sentence naming what is fabricated and what a viewer must not infer. */
  children: ReactNode;
  className?: string;
}) {
  const spec = PROVENANCE[kind];
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-xl glass-l3 px-4 py-3',
        className,
      )}
    >
      <span className={cn('mt-0.5 shrink-0 rounded-sm border p-1', spec.tone)}>
        {spec.icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold">{tr(title ?? `${spec.label} data`)}</p>
        <p className="mt-0.5 text-sm leading-snug text-muted-foreground">
          {children}
        </p>
      </div>
    </div>
  );
}

/**
 * Claim-level fine print. Sits immediately under the sentence it qualifies,
 * so the qualification travels with the claim into a screenshot.
 */
export function ProvenanceNote({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        'mt-1.5 font-mono text-[11px] leading-snug text-muted-foreground',
        className,
      )}
    >
      {children}
    </p>
  );
}

/**
 * A fabricated identifier, rendered so it cannot be mistaken for a production
 * reference. Always prefix demo ids — `DEMO-PNR-000431`, not `PNR-000431`.
 */
export function DemoReference({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'font-mono text-xs tracking-wide text-muted-foreground',
        className,
      )}
    >
      {children}
    </span>
  );
}
