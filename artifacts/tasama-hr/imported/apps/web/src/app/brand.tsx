/**
 * The brand in the title bar, the assistant rail and the Stage person chip
 * (design/payroll-addendum.md §14). The assistant rail always carries Tasama's
 * logo; the title bar carries the client's logo, "HR" and "powered by Tasama".
 */
import { Wordmark } from '@cognirise/atelier/layout';
import { useLang } from '../lib/i18n';
import { logoUrl, type Skin } from '../lib/brand';

export function ClientTile({ skin, alt, small, large }: { skin: Skin; alt: string; small?: boolean; large?: boolean }) {
  const src = logoUrl(skin);
  if (!src) return null;
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-md ${large ? 'h-14 px-3' : small ? 'h-8 px-1.5' : 'h-11 px-2.5'}`} style={{ background: skin.tile, boxShadow: skin.tile === '#FFFFFF' ? 'inset 0 0 0 1px rgba(15,23,42,.12)' : undefined }}>
      <img src={src} alt={alt} className={`${large ? 'h-12 max-w-[200px]' : small ? 'h-6 max-w-[84px]' : 'h-9 max-w-[150px]'} w-auto object-contain`} />
    </span>
  );
}

/** The title bar brand: Tasama's own, or the client's logo with "HR" and "powered by Tasama". */
export function TitleBrand({ skin, clientName }: { skin: Skin; clientName: string }) {
  const { t } = useLang();
  if (skin.key === 'tasama') {
    return <span className="flex items-center gap-2"><img src="/brand/mark.png" alt="" className="h-7 w-7 dark:hidden" /><img src="/brand/mark-on-dark.png" alt="" className="hidden h-7 w-7 dark:block" /><Wordmark className="text-lg">{t('Tasama HR')}</Wordmark><span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('demo')}</span></span>;
  }
  const src = logoUrl(skin);
  return (
    <span className="flex items-center gap-2.5">
      {src ? <span className="flex h-9 items-center rounded-md bg-white px-1.5 dark:px-2"><img src={src} alt={clientName} className="h-8 w-auto max-w-[150px] object-contain" /></span> : <span className="text-lg font-semibold">{clientName}</span>}
      <span className="text-lg font-bold">{t('HR')}</span>
      <span className="text-xs text-muted-foreground">{t('powered by Tasama')}</span>
    </span>
  );
}
