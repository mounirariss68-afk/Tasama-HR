import type { ReactNode } from 'react';
import { tr } from '../../lib/i18n';
import { cn } from '../../lib/utils';

/**
 * The content measure. Every page body sits inside one of these so column
 * width is consistent across the product.
 *
 *   default  1200px — dashboards, tables, dense app pages
 *   wide     1440px — boards, canvases, wide data grids
 *   prose     760px — documents, settings forms, long-form reading
 */
export function PageContainer({
  children,
  width = 'default',
  className,
}: {
  children: ReactNode;
  width?: 'default' | 'wide' | 'prose';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'mx-auto w-full px-4 sm:px-6',
        width === 'wide' && 'max-w-[1440px]',
        width === 'default' && 'max-w-[1200px]',
        width === 'prose' && 'max-w-[760px]',
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * The page hero. Two tones:
 *
 *   `island`  the dark brand surface, in BOTH themes. Use it for a section
 *             landing page, a record header — anywhere the page should feel
 *             like it sits on the brand.
 *   `surface` a glass hero over the backdrop. Use it for a dashboard or daily
 *             view, where the page is a live surface rather than a chapter
 *             opener, and especially when the hero carries `media`.
 *
 * A hero that is only eyebrow + headline + lede is the most common way an
 * Atelier app ends up looking thin. Give it `media` (a signature visual for
 * the product) and `feature` (the one number that answers "how are we doing
 * right now") unless there is a reason not to.
 *
 * One hero per page, at the top. Never a second, never nested.
 */
export function PageHero({
  eyebrow,
  title,
  lede,
  actions,
  media,
  feature,
  children,
  tone = 'island',
  width = 'default',
  className,
}: {
  /** Mono uppercase label with a leading accent rule. */
  eyebrow?: ReactNode;
  title: ReactNode;
  /** Short standfirst, set in the accent-bordered lede. */
  lede?: ReactNode;
  /** Primary/secondary actions. */
  actions?: ReactNode;
  /** The product's signature visual, bleeding to the right edge on wide
   * viewports and hidden below `lg` where it would crowd the text. */
  media?: ReactNode;
  /** A single featured figure, floated over the media on wide viewports. */
  feature?: ReactNode;
  /** Extra hero content (chip row, tabs) below the headline block. */
  children?: ReactNode;
  tone?: 'island' | 'surface';
  width?: 'default' | 'wide' | 'prose';
  className?: string;
}) {
  return (
    <section
      className={cn(
        'relative overflow-hidden',
        tone === 'island' && 'page-hero',
        tone === 'surface' &&
          'rounded-xl glass-l2 py-[clamp(1.75rem,3.5vw,2.75rem)]',
        className,
      )}
    >
      {media ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 end-0 hidden w-[46%] lg:block"
        >
          {media}
        </div>
      ) : null}

      <PageContainer width={width} className="relative">
        <div className={cn(media ? 'lg:max-w-[54%]' : feature ? 'lg:pe-[300px]' : undefined)}>
          <div className={cn('flex flex-col gap-6', !media && !feature && 'md:flex-row md:items-end md:justify-between')}>
            <div className="space-y-3">
              {eyebrow ? <p className="eyebrow">{tr(eyebrow)}</p> : null}
              <h1 className="headline">{tr(title)}</h1>
              {lede ? <p className="lede">{tr(lede)}</p> : null}
            </div>
            {actions ? (
              <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div>
            ) : null}
          </div>
          {children ? <div className="mt-8">{children}</div> : null}
        </div>
      </PageContainer>

      {feature ? (
        <div className="pointer-events-none absolute end-8 top-1/2 hidden -translate-y-1/2 lg:block">
          <div className="pointer-events-auto">{feature}</div>
        </div>
      ) : null}
    </section>
  );
}

/**
 * The page masthead — the compact alternative to `PageHero`.
 *
 * A hero announces a chapter. An operational screen does not need announcing:
 * the rail already says which section you are in and the title bar already says
 * which account you are looking at, so a 48px headline and a paragraph of
 * standfirst are two things the user has to read past to reach the numbers.
 *
 * So this is one bar. A tight title, a factual meta line, and the figures that
 * would otherwise be prose — and then the page starts. Roughly 70px against the
 * hero's 300.
 *
 * The meta line states facts, not claims: counts, money, dates, scope. If a
 * sentence here could appear in a brochure, it does not belong.
 */
export function PageMasthead({
  back,
  title,
  meta,
  figures,
  actions,
  width = 'default',
  className,
}: {
  /** A back control, shown before the title on record pages. */
  back?: ReactNode;
  title: ReactNode;
  /** One factual line: counts, money, dates, scope. */
  meta?: ReactNode;
  /** Chips. The figures that used to be written out in the lede. */
  figures?: ReactNode;
  actions?: ReactNode;
  width?: 'default' | 'wide' | 'prose';
  className?: string;
}) {
  return (
    <section className={cn('border-b border-border/60 bg-card/30', className)}>
      <PageContainer width={width}>
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3.5">
          <div className="min-w-0">
            {back ? <div className="mb-1">{back}</div> : null}
            <h1 className="truncate text-[17px] font-semibold leading-tight tracking-tight text-foreground">
              {tr(title)}
            </h1>
            {meta ? (
              <p className="mt-1 font-mono text-[11px] leading-snug text-muted-foreground">{tr(meta)}</p>
            ) : null}
          </div>
          {figures || actions ? (
            <div className="flex flex-wrap items-center gap-2">
              {figures}
              {actions}
            </div>
          ) : null}
        </div>
      </PageContainer>
    </section>
  );
}

/**
 * The featured figure for a hero: a small glass card carrying one label, one
 * large value, and a supporting chip. One per page at most.
 */
export function HeroFeature({
  label,
  value,
  support,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  support?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'min-w-[220px] rounded-xl glass-l3 px-5 py-4 shadow-[var(--shadow-lift)]',
        className,
      )}
    >
      <p className="text-xs uppercase tracking-widest text-muted-foreground">{tr(label)}</p>
      <p className="mt-1.5 text-3xl font-bold leading-none">{value}</p>
      {support ? <div className="mt-3 flex items-center gap-2">{support}</div> : null}
    </div>
  );
}

/**
 * A titled content section: gradient divider, mono section label, then the
 * content. This is the standard rhythm for stacking sections down a page.
 */
export function PageSection({
  label,
  action,
  children,
  className,
}: {
  label?: ReactNode;
  /** Optional right-aligned control on the label row. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('space-y-5', className)}>
      {label ? (
        <div className="space-y-3">
          <span className="section-divider" />
          <div className="flex items-center gap-4">
            <h2 className="section-label min-w-0 flex-1">{tr(label)}</h2>
            {action ? <div className="shrink-0">{action}</div> : null}
          </div>
        </div>
      ) : null}
      {children}
    </section>
  );
}
