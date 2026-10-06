import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { MessageSquare, PanelLeftClose } from 'lucide-react';
import { cn } from '../../lib/utils';

export const CHAT_RAIL_COLLAPSED = 48;
export const CHAT_RAIL_DEFAULT = 320;
export const CHAT_RAIL_MIN = 320;
export const CHAT_RAIL_MAX = 720;
const RAIL_WIDTH_STORAGE_KEY = 'atelier-chat-rail-width';
/** Below this the expanded rail would take more of the window than it leaves
 * for content, so it collapses to the 48px strip and the user opens it
 * deliberately. Matches Tailwind's lg breakpoint. */
export const CHAT_RAIL_DOCK_BREAKPOINT = 1024;

function clampWidth(width: number): number {
  const viewportCap =
    typeof window === 'undefined'
      ? CHAT_RAIL_MAX
      : Math.min(CHAT_RAIL_MAX, window.innerWidth * 0.6);
  return Math.max(CHAT_RAIL_MIN, Math.min(width, Math.max(CHAT_RAIL_MIN, viewportCap)));
}

/**
 * Width state for the docked chat rail. <AppShell> wires this up; use the hook
 * directly only when composing a custom shell.
 */
export function useChatRail(initialOpen = true) {
  const [open, setOpen] = useState(() => {
    if (typeof window === 'undefined') return initialOpen;
    return initialOpen && window.innerWidth >= CHAT_RAIL_DOCK_BREAKPOINT;
  });
  const [width, setWidthState] = useState(() => {
    if (typeof window === 'undefined') return CHAT_RAIL_DEFAULT;
    try {
      const stored = Number(window.localStorage.getItem(RAIL_WIDTH_STORAGE_KEY));
      return stored ? clampWidth(stored) : CHAT_RAIL_DEFAULT;
    } catch {
      return CHAT_RAIL_DEFAULT;
    }
  });

  const setWidth = useCallback((next: number) => {
    const clamped = clampWidth(next);
    setWidthState(clamped);
    try {
      window.localStorage.setItem(RAIL_WIDTH_STORAGE_KEY, String(clamped));
    } catch {
      // Best-effort.
    }
  }, []);

  // Keep the rail within 60% of the window when the window shrinks, and
  // collapse it entirely once the window is too narrow to dock it.
  useEffect(() => {
    const onResize = () => {
      setWidthState((current) => clampWidth(current));
      if (window.innerWidth < CHAT_RAIL_DOCK_BREAKPOINT) setOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const docked =
    typeof window === 'undefined' || window.innerWidth >= CHAT_RAIL_DOCK_BREAKPOINT;

  return {
    open,
    setOpen,
    width,
    setWidth,
    /** How far main content must pad left. An expanded rail on a narrow window
     * overlays the content instead of squeezing it, so the inset stays at the
     * collapsed strip. */
    inset: open && docked ? width : CHAT_RAIL_COLLAPSED,
  };
}

export type ChatRailState = ReturnType<typeof useChatRail>;

/**
 * The docked assistant rail: fixed to the left edge, pinned to the window
 * height, collapsed to 48px or expanded and drag-resizable between 320px and
 * 720px (never past 60% of the window).
 *
 * The rail stacks a 56px logo card and then the glass chat panel filling the
 * remaining height. Inside the panel the transcript is the ONLY scrolling
 * region — the composer never moves and the page never scrolls the chat.
 */
export function ChatRail({
  rail,
  brand,
  collapsedBrand,
  header,
  transcript,
  suggestions,
  composer,
  label = 'Assistant',
  className,
}: {
  rail: ChatRailState;
  /** The 56px card at the top of the expanded rail — normally a
   * <RailBrandCard> carrying the client's lockup. Rendered as given; the rail
   * adds no chrome of its own around it. */
  brand?: ReactNode;
  /** What the 48px collapsed strip shows instead — a mark, not a wordmark.
   * Nothing is shown when this is omitted, because a wordmark does not fit. */
  collapsedBrand?: ReactNode;
  /** Optional row above the transcript (title, session actions). */
  header?: ReactNode;
  transcript: ReactNode;
  /** Suggested prompts, shown directly above the composer. An assistant with
   * an empty input and no suggestions gets ignored; these are what tell a
   * first-time user what it can actually do. Use <ChatSuggestions />. */
  suggestions?: ReactNode;
  composer: ReactNode;
  label?: string;
  className?: string;
}) {
  const { open, setOpen, width, setWidth } = rail;
  const dragging = useRef(false);

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      if (!dragging.current) return;
      event.preventDefault();
      setWidth(event.clientX);
    };
    const onUp = () => {
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [setWidth]);

  if (!open) {
    return (
      <div
        className={cn(
          'fixed inset-y-0 start-0 z-40 flex w-12 flex-col items-center gap-3 border-e border-border bg-background/30 py-3 backdrop-blur-md',
          className,
        )}
      >
        {collapsedBrand ? (
          <div className="flex h-8 w-8 items-center justify-center overflow-hidden">
            {collapsedBrand}
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Open ${label.toLowerCase()}`}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-primary"
        >
          <MessageSquare className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn('fixed inset-y-0 left-0 z-40 flex flex-col gap-3 p-3', className)}
      style={{ width }}
    >
      {brand}

      <aside
        aria-label={label}
        className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl glass-chrome"
      >
        {header ? (
          <div className="shrink-0 border-b border-border px-4 py-2.5">{header}</div>
        ) : null}
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">{transcript}</div>
        {suggestions ? (
          <div className="shrink-0 px-3 pb-2">{suggestions}</div>
        ) : null}
        {composer}
      </aside>

      {/* Drag handle. Keyboard users resize with the arrow keys. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize assistant"
        tabIndex={0}
        onMouseDown={() => {
          dragging.current = true;
          document.body.style.cursor = 'col-resize';
          document.body.style.userSelect = 'none';
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') setWidth(width - 16);
          if (event.key === 'ArrowRight') setWidth(width + 16);
        }}
        className="absolute inset-y-0 end-0 w-1.5 cursor-col-resize transition-colors hover:bg-primary/40 focus-visible:bg-primary/60 focus-visible:outline-none"
      />
    </div>
  );
}

/** A user turn: right-aligned, capped at 85% of the column. */
export function ChatUserTurn({ children }: { children: ReactNode }) {
  return (
    <div className="flex justify-end">
      <div dir="auto" className="max-w-[85%] rounded-2xl glass-l3 px-3 py-1.5 text-xs leading-relaxed">
        {children}
      </div>
    </div>
  );
}

/** An assistant turn: left-aligned at 92%, beside a 24px round avatar. */
export function ChatAssistantTurn({
  avatar,
  children,
}: {
  avatar?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex max-w-[92%] items-start gap-2">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
        {avatar}
      </span>
      <div dir="auto" className="text-xs leading-relaxed text-muted-foreground">{children}</div>
    </div>
  );
}

/**
 * Suggested prompts above the composer. Keep them short, concrete and phrased
 * as the work ("Weekly summary", "Compare competitors"), never as questions to
 * the user. Three or four is right; more becomes a menu.
 */
export function ChatSuggestions({
  items,
  onSelect,
  className,
}: {
  items: ReadonlyArray<string>;
  onSelect: (prompt: string) => void;
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {items.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onSelect(item)}
          className="rounded-full border border-border bg-background/40 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
        >
          {item}
        </button>
      ))}
    </div>
  );
}

/**
 * The rail's brand card: the CLIENT's lockup, in its own 56px glass card at
 * the top of the rail.
 *
 * This is the standard split — the client's mark lives in the rail, the
 * PRODUCT's wordmark lives in the title bar. It keeps the two identities from
 * competing, and it means a client who has only supplied a positive lockup
 * still has a correct place to put it, because this card is a light surface in
 * both themes.
 */
export function RailBrandCard({
  children,
  onCollapse,
  className,
}: {
  children: ReactNode;
  onCollapse?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex h-14 shrink-0 items-center gap-3 rounded-xl border border-black/5 bg-white/90 px-4 shadow-[var(--shadow-lift)] backdrop-blur-sm',
        className,
      )}
    >
      {children}
      {onCollapse ? (
        <button
          type="button"
          onClick={onCollapse}
          aria-label="Collapse assistant"
          className="ms-auto text-[#5A6472] transition-opacity hover:opacity-70"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

/**
 * A live/offline badge for the rail header. Show the assistant's actual state:
 * a rail that claims to be live when its feed is stale is worse than one that
 * says nothing.
 */
export function ChatStatusBadge({
  state = 'live',
  children,
}: {
  state?: 'live' | 'idle' | 'offline';
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'mono-chip',
        state === 'live' && 'is-success',
        state === 'offline' && 'is-danger',
      )}
    >
      {children}
    </span>
  );
}
