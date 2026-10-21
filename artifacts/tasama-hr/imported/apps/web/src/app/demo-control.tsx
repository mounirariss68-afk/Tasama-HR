/**
 * The Demo control: every rig item in one place beside the person, so the
 * menu holds only the work (MENU-DISCIPLINE.md). Scenarios, the persona, the
 * client account, the demo data and the interface. Hidden with `?client=1`,
 * when the client drives.
 */
import { useState } from 'react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@cognirise/atelier/components/ui/dropdown-menu';
import { useTheme } from '@cognirise/atelier/layout';
import { Building2, Check, Monitor, Moon, Play, RotateCcw, SlidersHorizontal, Sun, UserRound } from 'lucide-react';
import { useApi, post, bump } from '../lib/api';
import { useLang } from '../lib/i18n';
import { initials } from '../lib/format';
import { useApp } from './state';

export const clientMode = (): boolean => { try { return new URLSearchParams(window.location.search).get('client') === '1'; } catch { return false; } };

export function DemoControl() {
  const { t, bi } = useLang();
  const { session, persona, switchPersona, switchClient, startScenario, go, route } = useApp();
  const { mode, setMode } = useTheme();
  const { data: scenarios } = useApi<any[]>('/director/scenarios');
  const [busy, setBusy] = useState(false);
  if (!session || !persona || clientMode()) return null;
  const inClient = persona.key !== 'tasama';
  const level = (l: string) => (scenarios ?? []).filter((s) => (l === 'tasama' ? s.level === 'tasama' : s.level !== 'tasama'));
  const scenarioItem = (s: any) => (
    <DropdownMenuItem key={s.key} onSelect={() => { startScenario(s.key); }} className="items-start gap-2 py-2">
      <Play className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
      <span className="min-w-0"><span className="block text-sm">{bi(s.title, s.title_ar)}</span><span className="block text-[11px] text-muted-foreground">{bi(s.shape, s.shape_ar)} · {s.steps.length} {t('steps')}</span></span>
    </DropdownMenuItem>
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card/50 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground active:scale-[0.97]">
          <SlidersHorizontal className="h-3.5 w-3.5" />{t('Demo')}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>{t('Demo control')}</DropdownMenuLabel>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger><Play className="me-2 h-4 w-4" />{t('Scenarios')}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-[70vh] w-80 overflow-y-auto">
            <DropdownMenuLabel>{t('Inside the client account')}: {bi(session.client.short, session.client.name_ar)}</DropdownMenuLabel>
            {level('client').map(scenarioItem)}
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t('Tasama level, across all clients')}</DropdownMenuLabel>
            {level('tasama').map(scenarioItem)}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => go('scenarios')}>{t('All scenarios, with what each shows')}</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger><UserRound className="me-2 h-4 w-4" />{t('Persona')}: <span className="ms-1 truncate text-muted-foreground">{bi(persona.label, persona.label_ar)}</span></DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-[70vh] w-80 overflow-y-auto">
            {session.personas.map((p) => (
              <DropdownMenuItem key={p.key} onSelect={() => switchPersona(p.key)} className="items-start gap-3 py-2">
                <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${p.key === persona.key ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}>{initials(p.display_name)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{bi(p.label, p.label_ar)}</span>
                  <span className="block truncate text-xs text-muted-foreground">{bi(p.display_name, p.display_name_ar)} · {bi(p.role_title, p.role_title_ar)}</span>
                  {p.key === persona.key && p.approval_limits.length ? <span className="mt-1 block text-[11px] leading-snug text-muted-foreground">{t('May approve')}: {p.approval_limits.map((l) => bi(l.what, l.what_ar)).join('; ')}</span> : null}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {inClient ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger><Building2 className="me-2 h-4 w-4" />{t('Client account')}: <span className="ms-1 truncate text-muted-foreground">{bi(session.client.short, session.client.name_ar)}</span></DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-80">
              {session.clients.map((x) => (
                <DropdownMenuItem key={x.key} onSelect={() => switchClient(x.key, route.screen)} className="items-start gap-3 py-2">
                  <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${x.key === session.client.key ? 'bg-primary' : 'border border-border'}`} />
                  <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{bi(x.name, x.name_ar)}</span><span className="block text-xs text-muted-foreground">{bi(x.sector, x.sector_ar)} · {x.hrmsLabel}</span></span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : null}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>{mode === 'dark' ? <Moon className="me-2 h-4 w-4" /> : mode === 'light' ? <Sun className="me-2 h-4 w-4" /> : <Monitor className="me-2 h-4 w-4" />}{t('Theme')}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-40">
            {([['light', 'Light', Sun], ['dark', 'Dark', Moon], ['system', 'System', Monitor]] as const).map(([id, label, Icon]) => (
              <DropdownMenuItem key={id} onSelect={() => setMode(id)}><Icon className="me-2 h-4 w-4" />{t(label)}{mode === id ? <Check className="ms-auto h-3.5 w-3.5" /> : null}</DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={busy} onSelect={async (e) => { e.preventDefault(); setBusy(true); try { await post('/reset'); bump(); } finally { setBusy(false); } }}><RotateCcw className="me-2 h-4 w-4" />{busy ? t('Rebuilding…') : t('Reset the demo data')}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => go('settings')}><SlidersHorizontal className="me-2 h-4 w-4" />{t('Demo settings and the AI mode')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
