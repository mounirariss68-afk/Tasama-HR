import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import type { ClientInfo } from './state';
import { useApp } from './state';
import { Btn } from './ui';
import { useLang } from '../lib/i18n';
import { downloadDocument, type DocumentSpec } from '../lib/documents';

export function DocumentDownload({ document: doc, issuer, small = false }: { document: DocumentSpec; issuer?: ClientInfo; small?: boolean }) {
  const { client } = useApp();
  const { lang } = useLang();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const company = issuer ?? client;
  const download = async () => {
    if (!company) return;
    setBusy(true); setError('');
    try { await downloadDocument(company, doc); }
    catch (e) { setError(e instanceof Error ? e.message : 'Document download failed.'); }
    finally { setBusy(false); }
  };
  return <div className="space-y-1">
    <Btn small={small} onClick={download} disabled={busy || !company || !doc.body?.trim()}>
      {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
      {lang === 'ar' ? (busy ? 'جارٍ إنشاء الملف…' : 'تنزيل PDF') : (busy ? 'Preparing PDF…' : 'Download PDF')}
    </Btn>
    {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
  </div>;
}
