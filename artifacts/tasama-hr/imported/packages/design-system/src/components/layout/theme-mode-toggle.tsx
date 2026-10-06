import { Check, Monitor, Moon, Sun } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { useTheme, type ThemeMode } from './theme';
import { cn } from '../../lib/utils';

const MODES = [
  { id: 'light', label: 'Light', Icon: Sun },
  { id: 'dark', label: 'Dark', Icon: Moon },
  { id: 'system', label: 'System', Icon: Monitor },
] as const satisfies ReadonlyArray<{
  id: ThemeMode;
  label: string;
  Icon: typeof Sun;
}>;

/**
 * The standard light / dark / system selector. Icon-only ghost button whose
 * icon reflects the RESOLVED mode; the menu shows all three with the active
 * one checked. Every Atelier title bar carries this — a two-state toggle is
 * not an acceptable substitute.
 */
export function ThemeModeToggle({ className }: { className?: string }) {
  const { mode, resolved, setMode } = useTheme();
  const active =
    mode === 'system'
      ? MODES[2]
      : (MODES.find((m) => m.id === mode) ?? MODES[2]);
  const ResolvedIcon = mode === 'system' ? Monitor : resolved === 'dark' ? Moon : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
            className,
          )}
          aria-label={`Theme mode: ${active.label}`}
        >
          <ResolvedIcon className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        {MODES.map(({ id, label, Icon }) => (
          <DropdownMenuItem key={id} onSelect={() => setMode(id)}>
            <Icon className="h-4 w-4" />
            <span className="flex-1">{label}</span>
            {id === mode ? <Check className="h-3.5 w-3.5" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
