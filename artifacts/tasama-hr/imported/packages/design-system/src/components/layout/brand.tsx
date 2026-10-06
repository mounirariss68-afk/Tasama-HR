import { useTheme } from './theme';
import { cn } from '../../lib/utils';

/**
 * Brand assets live at fixed paths under the app's public root, so a rebrand
 * swaps files and never touches component code:
 *
 *   /brand/logo-on-dark.png   full lockup, light ink — for dark surfaces
 *   /brand/logo-on-light.png  full lockup, dark ink  — for light surfaces
 *   /brand/mark.png           glyph only — avatars, sign-in, tight spaces
 *   /brand/favicon.svg        browser icon
 *   /brand/light-backdrop.webp, /brand/dark-backdrop.webp   wallpaper art
 */
export const BRAND_ASSETS = {
  logoOnDark: '/brand/logo-on-dark.png',
  logoOnLight: '/brand/logo-on-light.png',
  mark: '/brand/mark.png',
} as const;

/**
 * The theme-correct full lockup. Inside a `.page-hero` island the surface is
 * dark in BOTH themes, so pass `on="dark"` to pin the light-ink lockup.
 */
export function BrandLogo({
  alt,
  className,
  on,
}: {
  alt: string;
  className?: string;
  /** Force a surface instead of following the theme. */
  on?: 'light' | 'dark';
}) {
  const { resolved } = useTheme();
  const surface = on ?? resolved;
  return (
    <img
      src={surface === 'dark' ? BRAND_ASSETS.logoOnDark : BRAND_ASSETS.logoOnLight}
      alt={alt}
      className={cn('h-7 w-auto select-none', className)}
    />
  );
}

/** The glyph-only mark. Reads on any background. */
export function BrandMark({
  alt = '',
  className,
}: {
  alt?: string;
  className?: string;
}) {
  return (
    <img
      src={BRAND_ASSETS.mark}
      alt={alt}
      aria-hidden={alt === '' ? true : undefined}
      className={cn('h-7 w-7 select-none', className)}
    />
  );
}

/**
 * The text wordmark, set in the brand display face. Use this in the title bar
 * when the product name is typographic; use <BrandLogo /> when it is a lockup.
 */
export function Wordmark({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn('font-wordmark select-none text-lg', className)}>
      {children}
    </span>
  );
}
