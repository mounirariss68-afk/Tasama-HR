import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { AppBackdrop } from './backdrop';
import { CHAT_RAIL_COLLAPSED, type ChatRailState } from './chat-rail';
import type { AppChromeState } from './chrome';

/**
 * THE DEFAULT ATELIER PAGE LAYOUT.
 *
 * Every app uses this unless there is a stated reason not to. Four surfaces,
 * each on its own, separated by the L0 gutters that let the backdrop through:
 *
 *   .cog-backdrop root   fixed brand gradient behind everything
 *   <AppBackdrop />      fixed wallpaper layer above the gradient
 *   chat rail            optional, fixed left, pinned to window height
 *   context nav          THE MENU — its own surface, never part of the display
 *                        area. Horizontally a bar under the title bar;
 *                        vertically a column between the rail and the content,
 *                        starting on the same line as the chat panel and the
 *                        display shell, below the title bar.
 *   main column          padded left by the rail:
 *     sticky header      the pinned block holding <TitleBar /> (+ the nav when
 *                        horizontal), with the 12px gutter inside it. The bar
 *                        always spans the full column width.
 *     <MainPanel>        THE DISPLAY AREA — one L1 shell holding the hero and
 *                        every section panel on the page
 *     footer             optional
 *
 * The page scrolls; the rail, the header and the chat composer do not.
 */
export function AppShell({
  titleBar,
  contextNav,
  chatRail,
  rail,
  chrome,
  footer,
  children,
  className,
}: {
  titleBar: ReactNode;
  /** The <ContextNav />. Placed by orientation, never inside the display area. */
  contextNav?: ReactNode;
  /** The <ChatRail /> element, when the app ships an assistant. */
  chatRail?: ReactNode;
  /** Its state, so the main column can pad by the live rail width. */
  rail?: ChatRailState;
  /** From useAppChrome() — drives where the nav sits. */
  chrome?: AppChromeState;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const railInset = chatRail ? (rail?.inset ?? CHAT_RAIL_COLLAPSED) : 0;
  const navVertical = chrome?.orientation === 'vertical' && Boolean(contextNav);
  const navWidth = navVertical ? (chrome?.navInset ?? 0) : 0;

  return (
    <div className={cn('cog-backdrop min-h-screen text-foreground', className)}>
      <AppBackdrop />
      {chatRail}

      <div
        className="flex min-h-screen flex-col transition-[padding] duration-200"
        style={{ paddingLeft: railInset }}
      >
        {/* The header block is what sticks, not the title bar itself.
         *
         * A `sticky` element only travels within its own parent's box, so a
         * sticky TitleBar inside a short auto-height wrapper scrolls away the
         * moment that wrapper leaves the viewport. Sticking the wrapper — whose
         * parent is this full-height column — keeps the bar pinned for the
         * whole page.
         *
         * The p-3 lives INSIDE the sticky element so the 12px gutter is
         * preserved when pinned, which is what keeps the title bar's top edge
         * aligned with the rail's brand card at every scroll position.
         *
         * The title bar always spans the full width of this column. A vertical
         * menu sits BELOW it, so its top edge lines up with the chat panel and
         * the display shell rather than with the title bar. */}
        <div className="app-header-scrim sticky top-0 z-30 shrink-0 space-y-3 p-3 pb-0">
          {titleBar}
          {navVertical ? null : contextNav}
        </div>

        <div className="flex flex-1 gap-3 p-3">
          {navVertical ? (
            <div
              className="shrink-0 transition-[width] duration-200"
              style={{ width: navWidth }}
            >
              {/* Sticks just under the pinned title bar: 12px gutter + 56px
               * bar + 12px gap = 80px, the same line the chat panel and the
               * display shell start on. */}
              <div className="sticky top-20 h-[calc(100vh-5rem-0.75rem)]">
                {contextNav}
              </div>
            </div>
          ) : null}
          <main className="min-w-0 flex-1">{children}</main>
        </div>
        {footer}
      </div>
    </div>
  );
}

/**
 * THE DISPLAY AREA — the L1 shell that holds the working area of a page.
 *
 * Everything a page shows lives inside one of these: the hero, the stat row,
 * and every section panel. That nesting is what produces the depth the system
 * is built on — you see the backdrop (L0) in the gutters around it, the shell
 * (L1) through the gaps between its panels, each section panel (L2), and the
 * cards inside those (L3), all at once.
 *
 * The menu is deliberately NOT inside it. Navigation is chrome; it belongs
 * beside the display area, not within it.
 */
export function MainPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-2xl glass-l1 p-3 sm:p-4', className)}>{children}</div>
  );
}
