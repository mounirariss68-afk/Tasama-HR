/** Formatting. Numbers stay in Western digits in both languages (Saudi business practice). */
export type Lang = 'en' | 'ar';

export const aed = (n: number | null | undefined, lang: Lang = 'en') => {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const v = Math.round(Number(n)).toLocaleString('en-US');
  return lang === 'ar' ? `${v} ريال` : `SAR ${v}`;
};
/** Compact SAR for stat tiles: SAR 7.05M, SAR 389K. */
export const aedShort = (n: number | null | undefined, lang: Lang = 'en') => {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const a = Math.abs(Number(n));
  const v = a >= 1e6 ? `${(Number(n) / 1e6).toFixed(2)}M` : a >= 1e4 ? `${Math.round(Number(n) / 1e3)}K` : Math.round(Number(n)).toLocaleString('en-US');
  return lang === 'ar' ? `${v} ريال` : `SAR ${v}`;
};
/** Saudi riyal aliases (aed/aedShort are kept because they are used widely). */
export const sar = aed;
export const sarShort = aedShort;
export const num = (n: number | null | undefined, d = 0) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }));
export const pct = (n: number | null | undefined, d = 0) => (n === null || n === undefined ? '—' : `${Number(n).toFixed(d)}%`);

const dtf = (lang: Lang, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { timeZone: 'Asia/Riyadh', ...o });
export const date = (s: string | Date | null | undefined, lang: Lang = 'en') => (s ? dtf(lang, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(typeof s === 'string' && s.length === 10 ? `${s}T08:00:00Z` : s)) : '—');
export const dateShort = (s: string | Date | null | undefined, lang: Lang = 'en') => (s ? dtf(lang, { day: 'numeric', month: 'short' }).format(new Date(typeof s === 'string' && s.length === 10 ? `${s}T08:00:00Z` : s)) : '—');
export const dateTime = (s: string | Date | null | undefined, lang: Lang = 'en') => (s ? dtf(lang, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(s)) : '—');
export const time = (s: string | Date | null | undefined, lang: Lang = 'en') => (s ? dtf(lang, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(s)) : '—');
export const month = (ym: string, lang: Lang = 'en') => { const m = String(ym ?? '').slice(0, 7); return /^\d{4}-\d{2}$/.test(m) ? dtf(lang, { month: 'short', year: 'numeric' }).format(new Date(`${m}-15T08:00:00Z`)) : String(ym ?? '—'); };

export function ago(s: string | Date | null | undefined, lang: Lang = 'en') {
  if (!s) return '—';
  const d = (Date.now() - new Date(s).getTime()) / 1000;
  const f = (n: number, en: string, ar: string) => (lang === 'ar' ? `منذ ${n} ${ar}` : `${n} ${en} ago`);
  if (d < 60) return lang === 'ar' ? 'الآن' : 'just now';
  if (d < 3600) return f(Math.round(d / 60), 'min', 'د');
  if (d < 86400) return f(Math.round(d / 3600), 'h', 'س');
  return f(Math.round(d / 86400), 'd', 'يوم');
}
export function until(s: string | Date | null | undefined, lang: Lang = 'en') {
  if (!s) return '—';
  const h = (new Date(s).getTime() - Date.now()) / 3600_000;
  if (h <= -48) return lang === 'ar' ? `متأخر ${Math.round(-h / 24)} يوم` : `${Math.round(-h / 24)} days overdue`;
  if (h < 0) return lang === 'ar' ? `متأخر ${Math.max(1, Math.round(-h))} س` : `${Math.max(1, Math.round(-h))}h overdue`;
  if (h < 48) return lang === 'ar' ? `خلال ${Math.round(h)} س` : `due in ${Math.round(h)}h`;
  return lang === 'ar' ? `خلال ${Math.round(h / 24)} يوم` : `due in ${Math.round(h / 24)}d`;
}
export const daysUntil = (s: string) => Math.round((new Date(`${s}T00:00:00Z`).getTime() - Date.now()) / 86400000);
export const initials = (name: string) => name.split(/\s+/).filter((w) => !/^(al|bin|el)$/i.test(w)).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
