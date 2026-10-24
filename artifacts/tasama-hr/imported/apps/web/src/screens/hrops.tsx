/**
 * HR Operations › Documents (design/payroll-ops-addendum.md 1.5, 1.7): each client's document set (contract,
 * national ID or iqama, IBAN letter), what is missing or expiring, and the records whose IBAN fails its check.
 * Tasama HR operations asks the client for what is missing and files what arrives.
 */
import { useEffect, useState } from 'react';
import { HeroFeature, Panel } from '@cognirise/atelier/layout';
import { FileCheck2, FolderOpen } from 'lucide-react';
import { bump, post, useApi } from '../lib/api';
import { useLang } from '../lib/i18n';
import { date, num } from '../lib/format';
import { useApp } from '../app/state';
import { Btn, Chip, Empty, Hero, Screen, Table } from '../app/ui';

function Completeness({ c }: { c: any }) {
  const total = Math.max(1, c.received + c.missing + c.requested);
  return (
    <span className="flex h-3 overflow-hidden rounded-full bg-muted/60">
      <span className="bg-success/80 transition-[width] duration-700" style={{ width: `${(c.received / total) * 100}%` }} />
      <span className="bg-primary/60" style={{ width: `${(c.requested / total) * 100}%` }} />
      <span className="bg-danger/80" style={{ width: `${(c.missing / total) * 100}%` }} />
    </span>
  );
}

export function HrOpsDocuments() {
  const { t, bi, lang } = useLang();
  const { route, session } = useApp();
  const [key, setKey] = useState<string | null>(route.param ?? session?.client.key ?? null);
  useEffect(() => { if (route.param) setKey(route.param); }, [route.param]);
  const { data, reload } = useApi<any>(`/hrops/documents${key ? `?client=${key}` : ''}`, { poll: 20000 });
  const clients: any[] = data?.clients ?? [];
  const sel = clients.find((c) => c.key === key) ?? null;
  const open = clients.reduce((s, c) => s + c.missing + c.requested, 0);
  const withGaps = clients.filter((c) => c.missing + c.requested > 0).length;
  const badIban = clients.reduce((s, c) => s + c.badIban, 0);
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const act = async (id: number, action: 'ask' | 'received') => {
    setBusy(id); setErr(null);
    try { await post(`/hrops/documents/${sel.key}/${id}/${action}`); bump(); reload(); }
    catch (x: any) { setErr(x.message); } finally { setBusy(null); }
  };
  const gaps: any[] = sel?.gaps ?? [];
  const toChase = gaps.filter((g) => g.status !== 'RECEIVED').length;
  const expiring = gaps.filter((g) => g.status === 'RECEIVED').length;
  return (
    <Screen hero={<Hero tone="surface" eyebrow="HR Operations"
      title={open ? `${open} ${t(open === 1 ? 'document is missing' : 'documents are missing')} ${t('at')} ${withGaps} ${t(withGaps === 1 ? 'client' : 'clients')}: ${t('Tasama asks for each before it reaches payroll')}` : t('Every employee’s contract, ID and IBAN letter is on file')}
      lede={t('Tasama HR operations holds each employee’s signed contract, national ID or iqama and IBAN letter, and checks the record against them. A missing document is asked for from the client’s HR operations and filed when it arrives.')}
      feature={<HeroFeature label="IBANs failing their check" value={num(badIban)} support={<span className="text-xs text-muted-foreground">{t('across every client’s records')}</span>} />} />}>
      <Panel icon={<FolderOpen size={16} />} title={clients.length ? `${clients.filter((c) => !c.missing && !c.requested).length} ${t('of')} ${clients.length} ${t('clients have a complete document set')}` : t('Document sets')}>
        <div className="space-y-2">{clients.map((c) => (
          <button key={c.key} type="button" onClick={() => setKey(c.key)}
            className={`grid w-full grid-cols-[10rem_1fr_16rem] items-center gap-4 rounded-xl border px-3 py-2.5 text-start transition-colors ${sel?.key === c.key ? 'border-primary bg-primary/5' : 'border-border/60 hover:border-primary/40'}`}>
            <span><span className="block text-sm font-semibold">{bi(c.short, c.name_ar)}</span><span className="block text-[11px] text-muted-foreground">{num(c.people)} {t('employees')}{c.hrOps ? ` · ${t('HR administration by Tasama')}` : ''}</span></span>
            <span className="flex items-center gap-3"><span className="flex-1"><Completeness c={c} /></span><span className="w-24 text-end text-xs tabular-nums text-muted-foreground">{((c.received / Math.max(1, c.received + c.missing + c.requested)) * 100).toFixed(1)}% {t('on file')}</span></span>
            <span className="flex flex-wrap justify-end gap-1">
              {c.byKind.length ? c.byKind.map((k: any) => <Chip key={k.kind} tone="danger">{k.missing} {bi(k.label, k.label_ar)}</Chip>) : <Chip tone="success">{t('Complete')}</Chip>}
              {c.expiring ? <Chip tone="warn">{c.expiring} {t('expiring')}</Chip> : null}
            </span>
          </button>))}</div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-success/80" />{t('On file')}</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-primary/60" />{t('Asked for')}</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-danger/80" />{t('Missing')}</span>
        </div>
      </Panel>
      {sel ? (
        <Panel icon={<FileCheck2 size={16} />} title={`${bi(sel.short, sel.name_ar)}: ${toChase} ${t(toChase === 1 ? 'document to chase' : 'documents to chase')}${expiring ? `, ${expiring} ${t('expiring within 60 days')}` : ''}`}>
          {gaps.length ? (
            <Table><thead><tr><th>{t('Employee')}</th><th>{t('Document')}</th><th>{t('Status')}</th><th /></tr></thead>
              <tbody>{gaps.map((g) => (
                <tr key={g.id}>
                  <td className="text-sm font-medium">{bi(g.name, g.name_ar)}</td>
                  <td className="text-sm">{bi(g.label, g.label_ar)}</td>
                  <td>{g.status === 'MISSING' ? <Chip tone="danger">{t('Missing')}</Chip> : g.status === 'REQUESTED' ? <Chip tone="primary">{t('Asked for on')} {date(g.requested_on, lang)}</Chip> : <Chip tone="warn">{t('Expires')} {date(g.expires_on, lang)}</Chip>}</td>
                  <td className="text-end">
                    <span className="inline-flex gap-1.5">
                      {g.status === 'MISSING' || g.status === 'RECEIVED' ? <Btn small onClick={() => act(g.id, 'ask')} disabled={busy === g.id}>{sel.ops ? `${t('Ask')} ${sel.ops}` : t('Ask the client')}</Btn> : null}
                      {g.status !== 'RECEIVED' ? <Btn small kind="primary" onClick={() => act(g.id, 'received')} disabled={busy === g.id}>{t('Received')}</Btn> : null}
                    </span>
                  </td>
                </tr>))}</tbody></Table>
          ) : <Empty icon={<FileCheck2 size={18} />}>{t('Nothing to chase at this client.')}</Empty>}
          {err ? <p className="mt-2 text-sm text-danger">{err}</p> : null}
        </Panel>
      ) : null}
    </Screen>
  );
}
