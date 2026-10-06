import { Check, ChevronDown } from 'lucide-react';
import { trs } from '../../lib/i18n';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { cn } from '../../lib/utils';

export type Lens = {
  id: string;
  label: string;
  /** Optional keyboard hint, right-aligned in the menu. */
  shortcut?: string;
};

/**
 * Lenses are an app's top-level workspaces (Clients, People, Finance…). When
 * an app has them, they live in a title-bar drop-down — never as sidebar
 * sections and never as a separate page. Render it even with a single lens: it
 * doubles as the "where am I" label. Hide it only for guest roles with none.
 */
export function LensPicker({
  lenses,
  value,
  onChange,
  className,
}: {
  lenses: ReadonlyArray<Lens>;
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  if (lenses.length === 0) return null;
  const active = lenses.find((lens) => lens.id === value) ?? lenses[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md border border-border bg-background/40 px-2.5 py-1 text-sm font-medium',
            className,
          )}
          aria-label={`${trs("Scope")}: ${trs(active.label)}`}
        >
          {trs(active.label)}
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {lenses.map((lens) => (
          <DropdownMenuItem key={lens.id} onSelect={() => onChange(lens.id)}>
            <span className="flex-1">{trs(lens.label)}</span>
            {lens.shortcut ? (
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {lens.shortcut}
              </span>
            ) : null}
            {lens.id === active.id ? <Check className="h-3.5 w-3.5" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
