/**
 * The fixed branded backdrop, painted once behind everything (bottom → top):
 *
 *   1. `.cog-backdrop` on the app root — a fixed 160° gradient from the
 *      brand.backdrop token stops. Also the fallback while art loads.
 *   2. `.cog-backdrop-art` — this component. A fixed, pointer-events-none
 *      layer whose image and opacity come from brand.backdropArt per theme.
 *   3. Content — glass surfaces blur over both layers.
 *
 * Fixed pseudo-elements are used instead of `background-attachment: fixed`,
 * which is broken and slow on iOS Safari.
 *
 * <AppShell> renders this for you. Render it directly only when building a
 * layout outside the shell (a sign-in screen, a print view).
 */
export function AppBackdrop() {
  return <div className="cog-backdrop-art" aria-hidden="true" />;
}
