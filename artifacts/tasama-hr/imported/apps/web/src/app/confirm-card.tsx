/**
 * The assistant's confirm card: one sentence, the facts once, one Confirm
 * button and a Change link (SCREEN-DISCIPLINE.md). It never prints a payload,
 * a type code, a workflow id or a tool name.
 */
import { useState } from 'react';
import { CalendarDays, CheckCircle2, FileText, Wallet, DoorOpen } from 'lucide-react';
import { useLang } from '../lib/i18n';
import { Btn } from './ui';
import { KIND } from './decision';

export type Pending = { title: string; title_ar: string; workflow?: string; card?: { lines: string[] }; confirmed?: string };

const ICON: Record<string, typeof FileText> = { 'WF-15': CalendarDays, 'WF-16': Wallet, 'WF-19': DoorOpen };

export function ConfirmCard({ pending, onConfirm, onChange, onOpen }: { pending: Pending; onConfirm: () => Promise<void>; onChange: () => void; onOpen: (ref: string) => void }) {
  const { t, bi } = useLang();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [first, ...rest] = pending.card?.lines ?? [`${bi(pending.title, pending.title_ar)}.`];
  const Icon = ICON[pending.workflow ?? ''] ?? FileText;
  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
      <div className="px-3.5 py-3">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary"><Icon className="h-3.5 w-3.5" />{t(KIND[pending.workflow ?? ''] ?? 'Request')}</p>
        <p className="mt-1.5 text-[13.5px] font-semibold leading-snug text-foreground">{first}</p>
        {rest.length ? <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{rest.join(' ')}</p> : null}
      </div>
      <div className="flex items-center gap-2 border-t border-border/60 bg-muted/30 px-3.5 py-2.5">
        {pending.confirmed ? (
          <>
            <CheckCircle2 className="h-4 w-4 text-success" />
            <span className="text-[12.5px] font-medium">{t('Sent')}</span>
            <button type="button" className="ms-auto text-[12.5px] text-primary hover:underline" onClick={() => onOpen(pending.confirmed!)}>{t('Open')}</button>
          </>
        ) : (
          <>
            <Btn small kind="primary" disabled={busy} onClick={async () => { setBusy(true); setErr(''); try { await onConfirm(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }}>{busy ? t('Sending…') : t('Confirm')}</Btn>
            <Btn small onClick={onChange}>{t('Change')}</Btn>
          </>
        )}
      </div>
      {err ? <p className="px-3.5 pb-2 text-[11px] text-danger">{err}</p> : null}
    </div>
  );
}
