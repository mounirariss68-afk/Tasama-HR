import type { ClientInfo } from './state';
import { useApp } from './state';
import { StatusChip } from './ui';
import { DocumentDownload } from './document-download';
import { useLang } from '../lib/i18n';
import { brandAsset, documentBrand, type DocumentSpec } from '../lib/documents';

export function DocumentPreview({ document: doc, issuer }: { document: DocumentSpec; issuer?: ClientInfo }) {
  const { client } = useApp();
  const { lang } = useLang();
  const company = issuer ?? client;
  if (!company) return null;
  let brand;
  try { brand = documentBrand(company); } catch (e) {
    return <p role="alert" className="rounded-xl border border-danger/40 px-4 py-3 text-sm text-danger">{e instanceof Error ? e.message : 'No letterhead configured.'}</p>;
  }
  const ar = doc.language === 'ar';
  const dir = ar ? 'rtl' : 'ltr';
  const d = doc.date ? new Date(doc.date) : null;
  const date = d && Number.isFinite(d.getTime()) ? d.toLocaleDateString(ar ? 'ar-SA' : 'en-GB', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
  const uiAr = lang === 'ar';
  const lines = (doc.body ?? '').split(/\r?\n/);

  return (
    <div className="space-y-3">
      <div className="flex justify-end"><DocumentDownload document={doc} issuer={company} small /></div>
      <article aria-label={doc.title} className="mx-auto w-full max-w-3xl overflow-hidden rounded-lg border border-border/60 bg-[#FBFAF7] text-[#28363B] shadow-sm">
        <div style={{ background: brand.color }} className="h-1.5" />
        <header className="flex flex-col gap-4 px-5 pt-5 sm:flex-row sm:items-center sm:justify-between sm:px-10 sm:pt-8" dir="ltr">
          <div className="flex h-24 w-40 shrink-0 items-center justify-center rounded-sm p-3 sm:h-28 sm:w-48" style={{ background: brand.logoBackground }}>
            <img src={brandAsset(brand)} alt={company.name} className="h-full w-full object-contain" />
          </div>
          <div className="min-w-0 sm:text-right" style={{ color: brand.color }}>
            <p className="text-lg font-semibold leading-tight sm:text-xl">{company.name}</p>
            <p className="mt-1 text-base leading-tight" dir="rtl">{company.name_ar}</p>
            <p className="mt-2 text-xs text-[#67747C]">Human Resources / الموارد البشرية</p>
          </div>
        </header>
        <div className="mx-5 mt-5 h-[3px] sm:mx-10" style={{ background: brand.color }} />
        <section className="px-5 py-6 sm:px-10" dir={dir}>
          <h2 className="break-words text-2xl font-semibold leading-snug sm:text-3xl" style={{ color: brand.color }}>{doc.title}</h2>
          <dl className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
            <div className="flex gap-1"><dt className="text-[#67747C]">{ar ? 'المرجع' : 'Reference'}:</dt><dd className="break-all font-mono">{doc.reference}</dd></div>
            <div className="flex gap-1"><dt className="text-[#67747C]">{ar ? 'التاريخ' : 'Date'}:</dt><dd>{date}</dd></div>
            <div className="flex items-center gap-1"><dt className="text-[#67747C]">{ar ? 'الحالة' : 'Status'}:</dt><dd>{doc.status ? <StatusChip status={doc.status} /> : (ar ? 'مسودة' : 'DRAFT')}</dd></div>
          </dl>
          <div className="mt-6 space-y-1 text-[15px] leading-7 sm:text-base">
            {lines.map((l, i) => l.trim()
              ? <p key={i} dir={ar ? 'rtl' : 'auto'} className="whitespace-pre-wrap break-words" style={{ textAlign: 'start' }}>{l}</p>
              : <div key={i} className="h-3" aria-hidden />)}
          </div>
        </section>
        <footer className="mx-5 border-t border-[#DCE2E4] py-4 text-xs leading-5 text-[#67747C] sm:mx-10">
          <p dir="ltr">DEMO DOCUMENT · Synthetic data · Not an official company-issued document</p>
          <p dir="rtl">مستند تجريبي · بيانات افتراضية · ليس مستنداً رسمياً صادراً عن الشركة</p>
          <p dir="ltr" className="mt-1 font-mono" style={{ color: brand.color }}>{[brand.website.replace(/^https?:\/\//, ''), doc.reference].filter(Boolean).join('  ·  ')}</p>
        </footer>
      </article>
      <span className="sr-only">{uiAr ? 'معاينة للقراءة فقط' : 'Read-only preview'}</span>
    </div>
  );
}
