/**
 * The decision card: one shape for every decision in the app (SCREEN-DISCIPLINE.md).
 *
 *   meta line      what it is · from whom · waiting on you · due
 *   headline       one sentence a person would say
 *   facts          up to four, each stated once
 *   recommendation one line that carries its reason and its exception
 *
 * The actions and the one collapsed disclosure are rendered by the case reader.
 * Nothing here prints a workflow id, a type code, a rung, a rule id or a system call:
 * those live behind "How this was checked" and on the Audit trail and Integration log.
 */
import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { aed, aedShort, date, dateShort, month, num, until } from '../lib/format';
import type { Lang } from '../lib/format';
import { CapBar, CoverStrip, RangeBar, SegmentBar, Progress, Slope, Waterfall } from './viz';
const addDays = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);

export type Fact = { k: string; v: ReactNode; note?: string; tone?: 'warn' | 'danger' | 'success'; viz?: ReactNode; wide?: boolean };
export type Rec = { verdict: 'APPROVE' | 'DECLINE' | 'REVIEW'; line: string };
export type Card = { kind: string; headline: string; facts: Fact[]; rec: Rec | null; agent?: string | null };
type T = { t: (s: string) => string; bi: (en: any, ar: any) => string; lang: Lang; mine: boolean };

/** Removes internal references from text written by the engine for the trail. */
export function plain(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/\s*\[(?:HR-\d+[^\]]*|Art\.[^\]]*)\]/g, '')
    .replace(/\s*\((?:[^()]*?(?:HR-\d+\s*§|Art\.\s*\d)[^()]*)\)/g, '')
    .replace(/\s*;?\s*HR-\d+\s*§[\d.]+(?:–[\d.]+)?/g, '')
    .replace(/(^|[.!?]\s+)[A-Z]{3}-CASE-\d{2}-\d+\b/g, '$1The case')
    .replace(/(^|[.!?]\s+)PAT-\d{4}-\d{3}:\s*/g, '$1')
    .replace(/\bDEMO-[A-Z]+-[\w-]+\s*/g, '')
    .replace(/\b[A-Z]{3}-(?:CASE|ISS|DOC)-\d{2}-\d+\b\s*/g, '')
    .replace(/\bPAT-\d{4}-\d{3}:?\s*/g, '')
    .replace(/\bESC-\d+:?\s*/g, '')
    .replace(/\bWF-\d+\b\s*(?:·\s*)?/g, '')
    .replace(/\s*\b[a-z]+(?:[A-Z][a-z]+)+(?:\/[a-zA-Z]+)*\b/g, '')
    .replace(/\s*·\s*(?=·|$)/g, '')
    .replace(/\bORACLE_HCM\b/g, 'Oracle HCM').replace(/\bTASAMA_HR_EVENTS\b/g, 'Tasama HR events').replace(/\bTASAMA_HR\b/g, 'Tasama HR').replace(/\bHR_OPS\b/g, 'HR operations').replace(/\bLINE_MANAGER\b/g, 'line manager').replace(/\bODOO_WEBHOOK\b/g, 'Odoo webhooks')
    .replace(/\b[A-Z]{2,}(?:_[A-Z]{2,})+\b/g, (m) => m.toLowerCase().replace(/_/g, ' '))
    .replace(/\(([A-Z]{4,})\)/g, (_m, w) => `(${w.toLowerCase()})`)
    .replace(/\bthe (BASIC|HOUSING|TRANSPORT) entry\b/g, (_m, w) => `the ${w.toLowerCase()} entry`)
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;:])/g, '$1')
    .replace(/\(\s*\)/g, '')
    .replace(/\s+(?:on|for|in)\.$/, '.')
    .replace(/\s+about\.$/, ' about the request.')
    .replace(/\b(20\d{2})-(\d{2})-(\d{2})\b/g, (_m, y, mo, d) => new Date(`${y}-${mo}-${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }))
    .replace(/^[:;·\s]+/, '')
    .replace(/\s+([.,;:])/g, '$1')
    .trim()
    .replace(/^is /, 'It is ');
}
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const lower = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s);
const range = (a: string, b: string, lang: Lang) => (a === b ? date(a, lang) : `${dateShort(a, lang)} – ${date(b, lang)}`);
const out = (c: any, key: string) => c.steps?.find((s: any) => s.step_key === key)?.outputs ?? {};
const first = (name: string | null | undefined) => (name ?? '').split(' ')[0];
/** Working days (Sunday to Thursday) after `from` and before `to`. */
const workingDays = (from: string, to: string) => { let n = 0; const d = new Date(`${from}T00:00:00Z`); const end = new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); while (d < end) { const w = d.getUTCDay(); if (w !== 5 && w !== 6) n++; d.setUTCDate(d.getUTCDate() + 1); } return n; };

export const KIND: Record<string, string> = {
  'WF-01': 'New position', 'WF-02': 'Requisition', 'WF-03': 'Shortlist', 'WF-05': 'Offer', 'WF-06': 'Pre-boarding', 'WF-08': 'Probation review',
  'WF-10': 'Calibration', 'WF-12': 'Promotion', 'WF-13': 'Payroll pre-run', 'WF-14': 'Letter request', 'WF-15': 'Leave request', 'WF-16': 'Salary advance',
  'WF-19': 'Resignation', 'WF-20': 'Termination request', 'WF-26': 'Client policy', 'WF-29': 'Attendance month', 'WF-36': 'Payroll question', 'WF-27': 'Payroll changes', 'WF-28': 'Employment contract',
};
const LEAVE: Record<string, string> = { ANNUAL: 'annual leave', SICK: 'sick leave', UNPAID: 'unpaid leave', PARENTAL: 'parental leave', BEREAVEMENT: 'bereavement leave', STUDY: 'study leave' };
const LETTER: Record<string, string> = { SALARY_CERTIFICATE: 'a salary certificate', EMPLOYMENT_CERTIFICATE: 'an employment certificate', SALARY_TRANSFER: 'a salary transfer letter', NOC_TRAVEL: 'a no-objection letter for travel', NOC_DRIVING: 'an introduction letter', EXPERIENCE: 'an experience letter' };

/** "Leave request · from Ravi Reddy · waiting on you, due in 48h · RSN-CASE-26-04335" */
export function metaLine(c: any, x: T & { youDecide: boolean; showRef: boolean }): string {
  const { t, bi, lang } = x;
  const parts = [t(KIND[c.workflow_id] ?? 'Request')];
  if (!x.mine && c.requester_name) parts.push(`${t('from')} ${c.requester_name}`);
  if (['WAITING', 'ESCALATED'].includes(c.status)) {
    const who = x.youDecide ? t('waiting on you') : `${t('with')} ${bi(c.waiting_on_name, c.waiting_on_name_ar) || t('HR')}`;
    parts.push(c.sla_due ? `${who}, ${until(c.sla_due, lang)}` : who);
  } else if (c.status === 'COMPLETED') parts.push(`${t('completed')} ${date(c.closed_at, lang)}`);
  else if (c.status === 'REJECTED') parts.push(`${t('declined')} ${date(c.closed_at, lang)}`);
  else if (c.status === 'CANCELLED') parts.push(t('withdrawn'));
  else if (c.status === 'RUNNING') parts.push(t('in progress'));
  if (x.showRef) parts.push(c.ref);
  return parts.join(' · ');
}

function recOf(c: any, line?: string): Rec | null {
  const r = c.result?.recommendation;
  if (!r && !line) return null;
  const verdict = (r?.verdict ?? 'REVIEW') as Rec['verdict'];
  return { verdict, line: line ?? `${verdict === 'APPROVE' ? 'Approve' : verdict === 'DECLINE' ? 'Decline' : 'Review'}: ${lower(plain(r?.summary))}` };
}

/** The agent whose check produced the recommendation: the last agent step that ran. */
export function recommender(c: any): string | null {
  const done = (c.steps ?? []).filter((s: any) => s.actor_type === 'AGENT' && s.status === 'DONE');
  return done.length ? done[done.length - 1].actor_id : null;
}

/** "Approve: balance is fine" → ["Approve", "Balance is fine"]. */
export function splitRec(line: string): [string, string] {
  const m = /^([^:]{2,40}):\s*(.+)$/.exec(line);
  return m ? [m[1], cap(m[2])] : ['', line];
}

export function caseCard(c: any, x: T): Card {
  const { t, bi, lang, mine } = x;
  const p = c.payload ?? {}, r = c.result ?? {};
  const who = bi(c.subject_name, c.subject_name_ar);
  const kind = t(KIND[c.workflow_id] ?? 'Request');
  const base: Card = { kind, headline: bi(c.title, c.title_ar), facts: [], rec: recOf(c) };
  switch (c.workflow_id) {
    case 'WF-15': {
      const o = out(c, 'validate');
      const type = LEAVE[p.type_code] ?? 'leave';
      const lead = workingDays(c.created_at.slice(0, 10), p.start);
      const short = p.type_code === 'ANNUAL' && lead < 10;
      const after = o.balance !== undefined && o.balance !== null && p.type_code === 'ANNUAL' ? Math.round((o.balance - p.days) * 10) / 10 : null;
      const away: any[] = o.away ?? [];
      const issues: string[] = o.issues ?? [];
      const facts: Fact[] = [];
      if (after !== null) facts.push({ k: t('Annual leave'), v: after < 0 ? `${-after} ${t('days short')}` : `${after} ${t('days left after this request')}`, tone: after < 0 ? 'danger' : undefined, wide: true,
        note: `${t('This request uses')} ${p.days} ${t('of the')} ${Math.round(o.balance * 10) / 10} ${t('days available')}.`,
        viz: <SegmentBar legend={false} total={Math.max(o.balance, p.days)} segments={[{ label: t('This request'), value: p.days, tone: after < 0 ? 'danger' : 'primary' }, { label: t('Left'), value: Math.max(0, after), tone: 'muted' }]} format={(v) => `${v} ${t('days')}`} /> });
      facts.push({ k: t('Team cover'), v: away.length ? `${away.length} ${t(away.length === 1 ? 'other away' : 'others away')}` : t('No one else away'), tone: away.length >= 2 ? 'danger' : away.length ? 'warn' : undefined, wide: true,
        viz: <CoverStrip from={addDays(p.start, -2)} days={Math.min(14, (new Date(p.end).getTime() - new Date(p.start).getTime()) / 86400000 + 5)} rows={[{ name: first(who) || t('Request'), ranges: [{ start: p.start, end: p.end, self: true }] }, ...away.map((a) => ({ name: first(a.display_name), ranges: [{ start: String(a.start_date).slice(0, 10), end: String(a.end_date).slice(0, 10) }] }))]} /> });
      // Notice is a minimum, not a cap: a sentence, no bar.
      if (p.type_code === 'ANNUAL') facts.push({ k: t('Notice'), v: `${lead} ${t('working days')}`, tone: short ? 'warn' : undefined, note: t('The leave policy asks for at least 10 working days.') });
      if (p.reason) facts.push({ k: t('Reason'), v: p.reason });
      const headline = mine ? `${t('Your')} ${p.days} ${t('days of')} ${t(type)}, ${range(p.start, p.end, lang)}` : `${who} ${t('asks for')} ${p.days} ${t(p.days === 1 ? 'day of' : 'days of')} ${t(type)}, ${range(p.start, p.end, lang)}`;
      const ok = !issues.length;
      const noBalance = after !== null && after < 0;
      const exception = short ? `; ${t('the notice is short, which you can accept')}` : '';
      const line = ok
        ? `${t('Approve')}: ${t(away.length ? 'the balance covers it and the team is covered' : 'balance and cover are fine')}${exception}.`
        : `${t('Decline')}: ${noBalance ? t('the balance does not cover it') : t('too many of the team are already away then')}${exception}. ${t('Suggest other dates.')}`;
      return { kind, headline, facts: facts.slice(0, 4), rec: { verdict: ok ? 'APPROVE' : 'DECLINE', line } };
    }
    case 'WF-16': {
      const e = out(c, 'eligibility'), rc = out(c, 'recovery');
      const problems: string[] = e.problems ?? [];
      const headline = mine ? `${t('Your salary advance of')} ${aed(p.amount, lang)}, ${t('repaid over')} ${p.months} ${t('months')}` : `${who} ${t('asks for a salary advance of')} ${aed(p.amount, lang)}, ${t('repaid over')} ${p.months} ${t('months')}`;
      const facts: Fact[] = [
        { k: t('Against the policy limit'), v: problems.length ? t('Needs an exception') : `${aed(p.amount, lang)} ${t('of')} ${aed(e.max ?? p.max_amount, lang)}`, note: problems.length ? cap(plain(problems[0])) : undefined, tone: problems.length || p.amount > (e.max ?? p.max_amount ?? Infinity) ? 'warn' : undefined, wide: true,
          viz: <CapBar value={p.amount} cap={e.max ?? p.max_amount ?? p.amount} tone={problems.length ? 'warn' : 'primary'} capLabel={`${t('limit')} ${aed(e.max ?? p.max_amount, lang)}`} format={(v) => aed(v, lang)} /> },
        { k: t('Monthly recovery'), v: rc.monthly ? aed(rc.monthly, lang) : '—',
          viz: rc.monthly && p.basic ? <CapBar value={rc.monthly} cap={p.basic * 0.1} tone="primary" capLabel={t('10% of wage')} format={(v) => aed(v, lang)} /> : undefined },
        { k: t('All deductions after'), v: rc.deductionShare ? `${Math.round(rc.deductionShare * 100)}% ${t('of wage')}` : '—',
          viz: rc.deductionShare ? <CapBar value={Math.round(rc.deductionShare * 100)} cap={50} max={60} tone={rc.deductionShare > 0.5 ? 'danger' : 'success'} capLabel={t('cap 50%')} /> : undefined },
      ];
      if (p.reason) facts.push({ k: t('Reason'), v: p.reason });
      const line = problems.length
        ? `${t('Review')}: ${t('approve only as an exception to the policy; the recovery itself stays inside the wage caps.')}`
        : `${t('Approve')}: ${t('within the limit, and the recovery stays inside the wage caps.')}`;
      return { kind, headline, facts: facts.slice(0, 4), rec: { verdict: problems.length ? 'REVIEW' : 'APPROVE', line } };
    }
    case 'WF-19': case 'WF-20': {
      const st = r.settlement, chk = r.check;
      if (chk) {
        const missing = chk.checks.filter((k: any) => !k.ok);
        const headline = missing.length ? `${t('The termination of')} ${who} ${t('is stopped')}: ${missing.length} ${t(missing.length === 1 ? 'required step is missing' : 'required steps are missing')}` : `${t('The termination of')} ${who} ${t('passes every check')}`;
        return { kind, headline, facts: chk.checks.slice(0, 4).map((k: any) => ({ k: bi(k.label, k.label_ar), v: plain(k.detail) || (k.ok ? t('Yes') : t('No')), tone: k.ok ? undefined : 'danger' })),
          rec: { verdict: missing.length ? 'DECLINE' : 'APPROVE', line: missing.length ? `${t('Do not proceed')}: ${lower(bi(missing[0].label, missing[0].label_ar))} ${t('is missing; resume only once it is on file.')}` : `${t('Proceed')}: ${t('the documentation supports it.')}` } };
      }
      if (st) {
        const line = (code: string) => st.lines.find((l: any) => l.code === code);
        const g = line('GRATUITY'), lv = line('LEAVE_ENCASH');
        const rest = st.lines.filter((l: any) => !['GRATUITY', 'LEAVE_ENCASH'].includes(l.code)).reduce((a: number, l: any) => a + l.amount, 0);
        return { kind: t('Final settlement'), headline: `${mine ? t('Your final settlement is') : `${who}${t('’s final settlement is')}`} ${aed(st.total, lang)}, ${t('to be paid by')} ${date(st.payBy, lang)}`,
          facts: [
            { k: t('How it adds up'), v: aed(st.total, lang), wide: true,
              viz: <Waterfall totalLabel={t('Total')} format={(v) => aedShort(v, lang)} steps={[{ label: t('Salary and other'), value: Math.round(rest), tone: 'chart3' }, ...(lv ? [{ label: t('Unused leave'), value: Math.round(lv.amount), tone: 'chart2' as const }] : []), ...(g ? [{ label: t('End of service'), value: Math.round(g.amount), tone: 'chart1' as const }] : [])]} /> },
            { k: t('Last working day'), v: date(st.lastDay, lang) },
            { k: t('Pay by'), v: date(st.payBy, lang), note: t('14 days after the last working day') },
          ],
          rec: recOf(c, `${t('Approve')}: ${t('every line traces to its rule and the HRMS record; the payment deadline is')} ${date(st.payBy, lang)}.`) };
      }
      return { kind, headline: mine ? `${t('Your resignation: last working day')} ${date(p.last_day, lang)}` : `${who} ${t('has resigned; last working day')} ${date(p.last_day, lang)}`,
        facts: [{ k: t('Notice'), v: p.notice_days ? `${p.notice_days} ${t('days')}` : '—' }, ...(p.reason ? [{ k: t('Reason'), v: p.reason }] : [])], rec: recOf(c, `${t('Accept')}: ${t('the last working day follows the notice in the contract.')}`) };
    }
    case 'WF-13': {
      const pc = r.precheck;
      if (!pc) return base;
      const must = pc.findings.filter((f: any) => ['BLOCKER', 'HIGH', 'MEDIUM'].includes(f.severity)).length;
      const blockers = pc.findings.filter((f: any) => f.severity === 'BLOCKER').length;
      return { kind, headline: must ? `${t('The')} ${month(pc.period, lang)} ${t('payroll is held')}: ${must} ${t('findings must be fixed or explained')}` : `${t('The')} ${month(pc.period, lang)} ${t('payroll is clear to release')}`,
        facts: [{ k: t('Findings by severity'), v: `${pc.findings.length} ${t('findings')}`, wide: true, tone: blockers ? 'danger' : undefined,
            viz: <SegmentBar height={14} segments={[{ label: t('Blocker'), value: blockers, tone: 'danger' }, { label: t('High'), value: pc.findings.filter((f: any) => f.severity === 'HIGH').length, tone: 'warn' }, { label: t('Medium'), value: pc.findings.filter((f: any) => f.severity === 'MEDIUM').length, tone: 'chart2' }, { label: t('Info'), value: pc.findings.filter((f: any) => !['BLOCKER', 'HIGH', 'MEDIUM'].includes(f.severity)).length, tone: 'muted' }]} /> },
          { k: t('Gross against last month'), v: aed(pc.totals.gross - (pc.last?.gross ?? pc.totals.gross), lang), viz: pc.last?.gross ? <Slope from={pc.last.gross} to={pc.totals.gross} fromLabel={t('Last')} toLabel={t('Now')} format={(v) => aedShort(v, lang)} /> : undefined }, { k: t('Employees'), v: pc.totals.headcount }],
        rec: { verdict: 'REVIEW', line: `${t('Apply the fixes, then release')}: ${t('each blocker must be fixed or accepted with a reason before the wage file goes to Mudad.')}` } };
    }
    case 'WF-14': {
      const to = p.addressee || t('to whom it may concern');
      return { kind, headline: mine ? `${t('Your')} ${t((LETTER[p.letter_type] ?? 'letter').replace(/^an? /, ''))}, ${t('addressed to')} ${to}` : `${who} ${t('asks for')} ${t(LETTER[p.letter_type] ?? 'a letter')} ${t('addressed to')} ${to}`,
        facts: [{ k: t('Language'), v: p.language === 'ar' ? 'العربية' : 'English' }], rec: recOf(c) };
    }
    case 'WF-12': {
      const k = r.case;
      if (!k) return base;
      return { kind, headline: `${c.requester_name} ${t('proposes promoting')} ${who} ${t('to')} ${k.to.grade} ${t('at')} ${aed(k.proposed, lang)}`,
        facts: [{ k: `${t('In the')} ${k.to.grade} ${t('range')}`, v: `${aed(k.proposed, lang)} · +${k.increasePct}%`, wide: true, tone: k.equity ? 'warn' : undefined,
            viz: <RangeBar min={k.to.min} max={k.to.max} format={(v) => aed(v, lang)} markers={[{ label: t('Today'), value: k.from.basic, tone: 'muted' }, { label: t('Peer median'), value: k.peerMedian, tone: 'chart2' }, { label: t('Proposed'), value: k.proposed, tone: 'primary' }]} /> },
          { k: t('Last ratings'), v: k.ratings.slice(0, 3).map((x: any) => x.rating).join(' · ') }, { k: t('Months in grade'), v: k.monthsInGrade }],
        rec: recOf(c) };
    }
    case 'WF-05': {
      const o = out(c, 'propose');
      return { kind, headline: `${t('Offer for the')} ${p.title}: ${aed(p.basic, lang)} ${t('basic, starting')} ${date(p.start_date, lang)}`,
        facts: [{ k: `${t('In the')} ${p.grade} ${t('range')}`, v: aed(p.basic, lang), wide: true,
            viz: o.range ? <RangeBar min={o.range[0]} max={o.range[2]} format={(v) => aed(v, lang)} markers={[{ label: t('Peer median'), value: o.median, tone: 'chart2' }, { label: t('Offer'), value: p.basic, tone: 'primary' }]} /> : undefined },
          { k: t('Package a month'), v: aed((p.basic ?? 0) + (p.housing ?? 0) + (p.transport ?? 0) + (p.other_allowance ?? 0), lang) }, { k: t('Start'), v: date(p.start_date, lang) }],
        rec: recOf(c) };
    }
    case 'WF-01': {
      const o = out(c, 'check');
      return { kind, headline: `${c.requester_name} ${t('asks for a new position')}: ${p.job_title}`,
        facts: ([{ k: t('Budget'), v: p.budgeted ? t('Budgeted') : t('Not budgeted'), tone: p.budgeted ? undefined : 'warn' }, ...(o.annual_cost_mid ? [{ k: t('Annual cost'), v: aed(o.annual_cost_mid, lang) }] : []), ...(o.grade ? [{ k: t('Grade'), v: o.grade }] : []), ...(o.saudization ? [{ k: t('Saudization with a Saudi hire'), v: `${o.saudization.ifSaudi}%`, viz: <CapBar value={o.saudization.ifSaudi} cap={o.saudization.target} max={Math.max(60, o.saudization.ifSaudi + 10)} tone={o.saudization.ifSaudi >= o.saudization.target ? 'success' : 'warn'} capLabel={`${t('target')} ${o.saudization.target}%`} /> }] : [])] as Fact[]).slice(0, 4),
        rec: recOf(c) };
    }
    case 'WF-08': {
      const o = out(c, 'evidence');
      return { kind, headline: `${who}${t('’s probation ends on')} ${date(p.probation_end, lang)}: ${t('confirm or extend')}`,
        facts: o.goals !== undefined ? [{ k: t('Goals'), v: `${o.goals}%`, viz: <Progress done={o.goals} total={100} tone={o.goals >= 70 ? 'success' : 'warn'} /> }, { k: t('Mandatory learning'), v: `${o.learning?.done}/${o.learning?.total}`, viz: <Progress done={o.learning?.done ?? 0} total={o.learning?.total ?? 1} /> }, { k: t('Check-ins'), v: `${o.checkins}`, note: o.concern ? t('One raised a concern') : t('All positive'), tone: o.concern ? 'warn' : undefined }, { k: t('Sick days'), v: o.sick ?? 0 }] : [],
        rec: recOf(c) };
    }
    case 'WF-03': {
      const o = out(c, 'evidence');
      return { kind, headline: o.screened ? `${o.allMust} ${t('of')} ${o.screened} ${t('applicants show every must-have for')} ${lower(bi(c.title, c.title_ar).replace(/^Shortlist:\s*/, ''))}` : base.headline, facts: [], rec: o.refused ? { verdict: 'DECLINE', line: `${t('Refused')}: "${o.refused}"` } : recOf(c) };
    }
    case 'WF-02': {
      const m = out(c, 'internal').matches ?? [];
      return { kind, headline: `${t('The requisition for')} ${bi(c.title, c.title_ar).replace(/^Requisition:\s*/, '')} ${t('is ready to post')}`,
        facts: [{ k: t('Internal matches'), v: m.length ? m.map((x: any) => x.display_name).join(', ') : t('None') }, { k: t('Criteria'), v: (p.criteria ?? []).length }, { k: t('Advert'), v: t('English and Arabic') }], rec: recOf(c) };
    }
    case 'WF-10': {
      const cal = r.calibration;
      if (!cal) return base;
      const five = cal.distribution?.find((d: any) => d.rating === 5)?.count ?? 0;
      return { kind, headline: `${t(p.division)} ${p.period}: ${cal.flags.length} ${t('flags to resolve before ratings are shared')}`,
        facts: [{ k: t('Rated'), v: cal.n }, { k: t('Average'), v: cal.average?.toFixed?.(2) ?? '—' }, { k: t('Rated 5'), v: cal.n ? `${Math.round((five / cal.n) * 100)}%` : '—', tone: cal.n && five / cal.n > 0.15 ? 'warn' : undefined, viz: cal.n ? <CapBar value={Math.round((five / cal.n) * 100)} cap={15} max={30} tone={five / cal.n > 0.15 ? 'warn' : 'success'} capLabel={t('guide 15%')} /> : undefined }],
        rec: recOf(c) };
    }
    case 'WF-26': {
      const rd = r.reading;
      if (!rd) return base;
      const unclear = rd.flagged.filter((f: any) => f.flag === 'UNCLEAR');
      const below = rd.flagged.filter((f: any) => f.flag === 'BELOW_LAW');
      const missing = rd.flagged.filter((f: any) => f.flag === 'MISSING');
      const client = bi(c.client_short, c.client_ar) || '';
      const atClient = c.current_step === 'activate';
      const headline = atClient
        ? `${t('Activate version')} ${rd.version} ${t('of the payroll policy')}${(p.readings_applied ?? []).length ? `: ${lower(p.readings_applied[0])}` : ''}`
        : unclear.length ? `${client ? `${client}: ` : ''}${t('the revised handbook reads into')} ${rd.rules} ${t('rules')}; ${unclear.length} ${t(unclear.length === 1 ? 'needs a reading' : 'need a reading')}`
        : `${client ? `${client}: ` : ''}${t('the revised handbook reads into')} ${rd.rules} ${t('rules, all clear')}`;
      const facts: Fact[] = [
        { k: t('Read'), v: `${rd.rules} ${t('rules on all')} ${rd.dims} ${t('dimensions')}`, note: `${rd.clauses} ${t('clauses')}` },
        { k: t('Below the law'), v: below.length ? below.map((f: any) => bi(f.label, f.label_ar)).join(', ') : t('None'), tone: below.length ? 'danger' : undefined },
        ...unclear.slice(0, 1).map((f: any) => ({ k: `${t('Unclear')}: ${bi(f.label, f.label_ar)}`, v: f.quote ? `“${(f.quote.match(/[^.]*time and a half[^.]*\./i) ?? [f.quote])[0].trim()}”` : '—', tone: 'warn' as const, wide: true, note: plain(f.note) })),
        { k: t('Not in the handbook'), v: missing.length ? missing.map((f: any) => bi(f.label, f.label_ar)).join(', ') : t('Nothing'), note: missing.length ? t('Asked of the client before anything is paid') : undefined },
      ];
      return { kind, headline, facts: facts.slice(0, 4), rec: recOf(c) };
    }
    case 'WF-29': {
      const at = r.attendance;
      if (!at) return base;
      const month = new Date(`${at.from}T00:00:00Z`).toLocaleString(lang === 'ar' ? 'ar' : 'en-GB', { month: 'long', timeZone: 'UTC' });
      const facts: Fact[] = [
        { k: t('Late arrivals'), v: num(at.lates), note: `${at.fined} ${t(at.fined === 1 ? 'person fined under the penalty table' : 'people fined under the penalty table')}` },
        { k: t('Absent'), v: `${at.absences} ${t(at.absences === 1 ? 'day' : 'days')}`, note: `${t('Of')} ${at.noPunch} ${t('days with no attendance recorded')}, ${at.leaveCovered} ${t('were approved leave')}` },
        { k: t('Fines'), v: aed(at.fines, lang), tone: at.capped?.length ? 'warn' : undefined, note: at.capped?.length ? `${at.capped.length} ${t(at.capped.length === 1 ? 'person stopped at five days\' wage' : 'people stopped at five days\' wage')} (${t('Art. 70')})` : undefined },
        { k: t('Explained by employees'), v: num(at.explained ?? 0), wide: Boolean(at.explanations?.length), note: at.explanations?.length ? `${at.explanations[0].name}, ${date(at.explanations[0].day, lang)}${at.explanations[0].minutes_late ? ` (${at.explanations[0].minutes_late} ${t('minutes late')})` : ''}: “${at.explanations[0].text}” ${t('An explained day is excused unless you decide otherwise.')}` : t('An explained day is excused unless you decide otherwise.') },
      ];
      return { kind, headline: `${month}${t('’s attendance')}: ${at.fined} ${t(at.fined === 1 ? 'fine' : 'fines')} ${t('and')} ${at.unpaidDays} ${c.status === 'COMPLETED' ? t(at.unpaidDays === 1 ? 'unpaid day, confirmed' : 'unpaid days, confirmed') : t(at.unpaidDays === 1 ? 'unpaid day to confirm' : 'unpaid days to confirm')}`, facts, rec: recOf(c) };
    }
    case 'WF-27': {
      const mon = (pn: string) => pn ? new Date(`${pn}-01T00:00:00Z`).toLocaleString(lang === 'ar' ? 'ar' : 'en-GB', { month: 'long', timeZone: 'UTC' }) : '';
      const done = c.status === 'COMPLETED';
      if (c.type === 'LATE_CHANGE') {
        const facts: Fact[] = [
          { k: t('Entered'), v: date(p.entered_on, lang), tone: 'warn', note: `${t('After the cut-off on')} ${date(p.cutoff, lang)}` },
          { k: t('Worth'), v: aed(p.backPay ?? 0, lang), note: `${p.days ?? '—'} ${t('days of')} ${mon(p.period)} ${t('at')} ${aed(p.monthly ?? 0, lang)} ${t('a month more')}` },
          { k: `${mon(p.period)}${t('’s run')}`, v: t('Stays as approved'), note: t('Nothing reopens; the difference is paid as back pay.') },
        ];
        return { kind, headline: done ? `${p.person_name}${t('’s back pay of')} ${aed(p.backPay ?? 0, lang)} ${t('is booked for')} ${mon(p.next)}` : `${p.person_name}${t('’s')} ${t(String(p.what ?? 'change').toLowerCase())} ${t('arrived after the cut-off:')} ${aed(p.backPay ?? 0, lang)} ${t('is paid with')} ${mon(p.next)}`, facts, rec: recOf(c) };
      }
      const m = r.month ?? {};
      const facts: Fact[] = [
        { k: t('Already in'), v: num(m.confirmed ?? 0), note: t('Joiners, leavers, pay changes, leave and advances from approved cases') },
        { k: done ? t('Sent by HR operations') : t('Expected from HR operations'), v: num(m.expected ?? 0), tone: !done && m.expected ? 'warn' : undefined, note: t('Overtime hours, with last month\'s figures as suggestions') },
        { k: t('Cut-off'), v: date(p.cutoff, lang), note: (() => { const n = (c.trail ?? []).filter((x: any) => x.actor_id === 'wared' && x.act === 'NOTIFY').length; return n ? `${n} ${t(n === 1 ? 'reminder from Wared' : 'reminders from Wared')}` : undefined; })() },
      ];
      if (done && r.applied) facts.push({ k: t('Entered'), v: `${r.applied.confirmed} ${t('lines')}, ${r.applied.hours} ${t('hours')}`, note: r.applied.dropped ? `${r.applied.dropped} ${t('dropped')}` : undefined });
      return { kind, headline: done ? `${mon(p.period)}${t('’s changes are confirmed')}` : `${m.expected ?? 0} ${t(m.expected === 1 ? 'change for' : 'changes for')} ${mon(p.period)} ${t('are still expected before the cut-off on')} ${date(p.cutoff, lang)}`, facts, rec: recOf(c) };
    }
    case 'WF-28': {
      const k = p.contract ?? {};
      const fp = r.first_pay;
      const done = c.status === 'COMPLETED';
      const facts: Fact[] = [
        { k: t('Pay'), v: aed(p.wage ?? 0, lang), note: `${t('basic')} ${aed(k.basic ?? 0, lang)}, ${t('housing')} ${aed(k.housing ?? 0, lang)}, ${t('transport')} ${aed(k.transport ?? 0, lang)}${k.other ? `, ${t('other')} ${aed(k.other, lang)}` : ''}` },
        { k: t('Term'), v: t(k.contract_type === 'FIXED_TERM' ? 'Two years, fixed' : 'Indefinite'), note: k.contract_type === 'FIXED_TERM' ? t('A non-Saudi is employed on a fixed term (Art. 37)') : t('Art. 55') },
        { k: t('Starts'), v: date(p.start_date, lang), note: `${t('Probation')} ${k.probation_days ?? '—'} ${t('days')} · ${t('leave')} ${k.annual_leave ?? '—'} ${t('days')} · ${t('notice')} ${k.notice_days ?? 30} ${t('days')}` },
        done && fp ? { k: t('First pay'), v: `${fp.days} ${t('days')}`, note: `${t('gross')} ${aed(fp.gross, lang)} · ${t('net')} ${aed(fp.net, lang)}` } : { k: t('Same as the offer'), v: t('Every pay term'), note: p.offer_number ?? undefined },
      ];
      return { kind, headline: done ? `${k.employee ?? who} ${t('is an employee from')} ${date(p.start_date, lang)}${fp ? `: ${fp.days} ${t('days paid in')} ${new Date(`${fp.period}-01T00:00:00Z`).toLocaleString(lang === 'ar' ? 'ar' : 'en-GB', { month: 'long', timeZone: 'UTC' })}` : ''}` : `${k.employee ?? who}${t('’s contract is ready to send:')} ${aed(p.wage ?? 0, lang)} ${t('a month from')} ${date(p.start_date, lang)}`, facts, rec: recOf(c) };
    }
    case 'WF-36': {
      // A question from Tasama payroll that stops or holds part of the run (design/payroll-addendum.md §16).
      const month = p.period ? new Date(`${p.period}-01T00:00:00Z`).toLocaleString(lang === 'ar' ? 'ar' : 'en-GB', { month: 'long', timeZone: 'UTC' }) : '';
      const gosi = p.kind === 'GOSI_REGISTRATION';
      const done = c.status === 'COMPLETED';
      const headline = gosi
        ? (done ? `${p.person_name}${t('’s GOSI registration is recorded')}` : `${t('Is')} ${p.person_name} ${t('registered with GOSI? The')} ${month} ${t('run stops until you give the date')}`)
        : (done ? `${p.person_name}${t('’s held overtime is settled')}` : `${t('Should')} ${p.person_name}${t('’s')} ${p.held_hours ?? ''} ${t('overtime hours above the cap be paid?')}`);
      const facts: Fact[] = [
        { k: t('Tasama found'), v: plain(p.finding ?? ''), wide: true },
        gosi ? { k: t('What you do'), v: t('Register in your GOSI account, then give the date here'), note: t('The run calculates the contribution from that date.') }
          : { k: t('Held'), v: p.held_amount != null ? aed(p.held_amount, lang) : '—', note: p.cap ? `${t('Policy cap')}: ${p.cap} ${t('hours a month')}` : undefined },
      ];
      if (done && r.answered) facts.push({ k: t('Answer'), v: plain(r.answered), wide: true });
      return { kind, headline, facts, rec: null };
    }
    case 'WF-06': return { kind, headline: `${who}${t('’s pre-boarding is blocked; start date')} ${date(p.start_date, lang)}`, facts: [], rec: recOf(c) };
    default: return base;
  }
}

/** The one disclosure every decision carries. Collapsed by default, everywhere. */
export function Provenance({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <details className="group border-t border-border/60 pt-3">
      <summary className="flex cursor-pointer list-none items-center gap-2 py-1 text-sm hover:text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90 rtl:rotate-180 rtl:group-open:rotate-90" />
        <span className="font-medium">{label}</span>
        {hint ? <span className="text-xs text-muted-foreground group-open:hidden">{hint}</span> : null}
      </summary>
      <div className="mt-3 space-y-5">{children}</div>
    </details>
  );
}

/** One line for a list row: who and what, never the reference or the workflow. */
export function rowTitle(r: any, bi: (en: any, ar: any) => string, withSubject = true): string {
  const title = bi(r.title, r.title_ar);
  const who = bi(r.subject_name, r.subject_name_ar);
  if (!withSubject || !who || title.includes(r.subject_name ?? '\u0000') || title.includes(r.subject_name_ar ?? '\u0000')) return title;
  return `${who} · ${title}`;
}

/** A list row in Outlook's shape: who (with initials), what, and the kind of request. */
export function rowParts(r: any, bi: (en: any, ar: any) => string, t: (s: string) => string) {
  const who = bi(r.subject_name, r.subject_name_ar) || r.requester_name || '';
  let what = bi(r.title, r.title_ar);
  for (const n of [r.subject_name, r.subject_name_ar]) if (n) what = what.replace(n, '');
  what = what.replace(/[:،,]\s*$/, '').replace(/^\s*[:·]\s*/, '').replace(/^(?:Shortlist|Requisition|Offer|Promotion|Resignation|New position|Probation review|Calibration|Pre-boarding|Termination request)\s*:\s*/i, '').trim();
  return { who, what: what || bi(r.title, r.title_ar), kind: t(KIND[r.workflow_id] ?? 'Request') };
}

const OWNER: Record<string, string> = { EMPLOYEE: 'You', CLINIC: 'Clinic', INSURER: 'Insurer', HR_OPS: 'HR operations', LINE_MANAGER: 'Line manager', MANAGER: 'Manager', IT: 'IT', PAYROLL: 'Payroll', TA: 'Talent acquisition', HRBP: 'HR business partner' };
/** A task owner in words: role codes become the role. */
export const owner = (s: string | null | undefined) => (s ? OWNER[s] ?? (/^[A-Z_]+$/.test(s) && s.length > 4 ? s[0] + s.slice(1).toLowerCase().replace(/_/g, ' ') : s) : '');
