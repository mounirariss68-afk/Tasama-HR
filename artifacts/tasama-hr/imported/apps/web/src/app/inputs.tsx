/**
 * The month's changes (design/payroll-addendum.md §17): one table and one bar, shared by
 * Payroll › Inputs (Tasama) and HR Workspace › Payroll › This month (the client).
 */
import { useLang } from '../lib/i18n';
import { aed, date } from '../lib/format';
import { useApp } from './state';
import { Chip, Empty, Table } from './ui';
import { SegmentBar } from './viz';

const STATE: Record<string, { tone: 'success' | 'warn' | 'primary' | undefined; en: string }> = {
  CONFIRMED: { tone: 'success', en: 'Confirmed' }, EXPECTED: { tone: 'warn', en: 'Expected' }, NEXT_MONTH: { tone: 'primary', en: 'Next month' }, DROPPED: { tone: undefined, en: 'Not this month' },
};
const SOURCE: Record<string, string> = { HIRING: 'Hiring', HRMS_EVENT: 'HR record', LEAVE: 'Approved leave', ADVANCE: 'Approved advance', ATTENDANCE: 'Attendance month', PREFILLED: 'Only the client can send', LATE_CHANGE: 'After the cut-off' };

export const cutoffWords = (cutoff: string, today: string, t: (s: string) => string) => {
  const d = Math.round((Date.parse(cutoff) - Date.parse(today)) / 864e5);
  return d === 0 ? t('Cut-off today') : d === 1 ? t('Cut-off tomorrow') : d > 1 ? `${t('Cut-off in')} ${d} ${t('days')}` : d === -1 ? t('Cut-off passed yesterday') : `${t('Cut-off passed')} ${-d} ${t('days ago')}`;
};

export function InputsBar({ counts, legend = true }: { counts: any; legend?: boolean }) {
  const { t } = useLang();
  return <SegmentBar legend={legend} segments={[
    { label: t('Confirmed'), value: counts.confirmed, tone: 'success' },
    { label: t('Expected'), value: counts.expected, tone: 'warn' },
    { label: t('Next month'), value: counts.next, tone: 'primary' },
    { label: t('Not this month'), value: counts.dropped, tone: 'muted' },
  ]} />;
}

export function InputRows({ rows, client }: { rows: any[]; client?: boolean }) {
  const { t, bi, lang } = useLang();
  const { openCase } = useApp();
  if (!rows.length) return <Empty>{t('No changes this month.')}</Empty>;
  const figure = (r: any) => r.amount != null ? aed(r.amount, lang) : r.quantity != null ? `${r.quantity} ${t(r.kind === 'OT_HOURS' ? 'h' : r.quantity === 1 ? 'day' : 'days')}` : r.suggested != null ? `${r.suggested} h ${t('suggested')}` : '—';
  return (
    <Table><thead><tr><th>{t('Person')}</th><th>{t('Change')}</th><th className="text-end">{t('Figure')}</th><th>{t('From')}</th><th>{t('State')}</th></tr></thead>
      <tbody>{rows.map((r) => (
        <tr key={r.id} className={r.case_ref ? 'clickable' : undefined} onClick={r.case_ref ? () => openCase(r.case_ref) : undefined}>
          <td className="text-sm">{r.person_id ? bi(r.name, r.name_ar) : t('Everyone')}</td>
          <td className="text-sm">{t(r.label)}{r.note ? <span className="block text-xs text-muted-foreground">{t(r.note)}</span> : null}{r.confirmed_by && r.state !== 'EXPECTED' ? <span className="block text-xs text-muted-foreground">{t('by')} {t(r.confirmed_by)}{r.confirmed_at ? `, ${date(r.confirmed_at, lang)}` : ''}</span> : null}</td>
          <td className="text-end tabular-nums text-sm">{figure(r)}</td>
          <td className="text-xs text-muted-foreground">{t(client && r.source === 'PREFILLED' ? 'Only you can send this' : SOURCE[r.source] ?? r.source)}</td>
          <td><Chip tone={STATE[r.state]?.tone}>{t(STATE[r.state]?.en ?? r.state)}</Chip></td>
        </tr>))}</tbody></Table>
  );
}
