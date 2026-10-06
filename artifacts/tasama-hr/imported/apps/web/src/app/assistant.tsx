/**
 * The assistant rail: Rafeeq for employees and managers, Murshid for HR.
 * The rail says which resolver is answering (Claude or offline) and every
 * answer shows the policy clauses it cites. A request the assistant prepares
 * is a card with a Confirm button: nothing is submitted on its say-so.
 */
import { useEffect, useRef, useState } from 'react';
import { ChatAssistantTurn, ChatComposer, ChatRail, ChatStatusBadge, ChatSuggestions, ChatUserTurn, RailBrandCard, type ChatRailState } from '@cognirise/atelier/layout';
import { FileCheck2, RotateCcw } from 'lucide-react';
import { api, bump, post, useApi } from '../lib/api';
import { useLang } from '../lib/i18n';
import { useApp } from './state';
import { Btn, Chip, useClient } from './ui';

type Msg = { id: number; role: 'user' | 'assistant'; content: string; mode?: string; citations?: { id: string; heading: string }[]; tool_calls?: { name: string }[]; pending?: any };

/** Suggestions per persona. `{bank}` is replaced with the client's salary bank from the session. */
const SUGGEST: Record<string, [string, string][]> = {
  tasama: [['What is waiting on me?', 'ما الذي ينتظر قراري؟'], ['Summarise the payroll pre-run check', 'لخّص فحص ما قبل تشغيل الرواتب'], ['Saudization ratio today', 'نسبة التوطين اليوم'], ['How many annual leave days does this company give?', 'كم يوماً من الإجازة السنوية تمنح هذه الشركة؟']],
  employee: [['How many leave days do I have?', 'كم رصيدي من الإجازات؟'], ['Salary certificate for {bank}', 'شهادة راتب لـ{bank}'], ['When is payday?', 'متى موعد الراتب؟'], ['Do I get an annual air ticket?', 'هل لي تذكرة طيران سنوية؟']],
  joiner: [['What do I need before my start date?', 'ما المطلوب قبل تاريخ التحاقي؟'], ['How long is probation?', 'كم مدة فترة التجربة؟'], ['What are the working hours?', 'ما ساعات العمل؟'], ['Who is my manager?', 'من مديري المباشر؟']],
  manager: [['What is waiting on me?', 'ما الذي ينتظر قراري؟'], ['Who in my team is away next week?', 'من في فريقي في إجازة الأسبوع القادم؟'], ['Can probation be extended?', 'هل يمكن تمديد فترة التجربة؟'], ['How does a salary advance work?', 'كيف تعمل سلفة الراتب؟']],
  hrbp: [['What is waiting on me?', 'ما الذي ينتظر قراري؟'], ['Saudization ratio today', 'نسبة التوطين اليوم'], ['Rules for terminating for performance', 'قواعد إنهاء الخدمة بسبب الأداء'], ['Summarise the calibration flags', 'لخص ملاحظات المعايرة']],
  ta: [['What is waiting on me?', 'ما الذي ينتظر قراري؟'], ['Open requisitions and applicants', 'طلبات التوظيف المفتوحة والمتقدمون'], ['Who approves an offer above midpoint?', 'من يعتمد عرضاً فوق منتصف الدرجة؟'], ['Saudization priority rule', 'قاعدة أولوية التوطين']],
  payroll: [['Summarise the payroll pre-run check', 'لخص فحص ما قبل تشغيل الرواتب'], ['What is waiting on me?', 'ما الذي ينتظر قراري؟'], ['How is the end-of-service award calculated?', 'كيف تُحسب مكافأة نهاية الخدمة؟'], ['Mudad deadline this month', 'موعد رفع ملف الأجور في مدد هذا الشهر']],
  chro: [['What is waiting on me?', 'ما الذي ينتظر قراري؟'], ['Saudization ratio today', 'نسبة التوطين اليوم'], ['Summarise the payroll pre-run check', 'لخص فحص ما قبل تشغيل الرواتب'], ['Rules for terminating for performance', 'قواعد إنهاء الخدمة بسبب الأداء']],
};

function Answer({ m, onConfirmed }: { m: Msg; onConfirmed: () => void }) {
  const { t, bi } = useLang();
  const { go, openCase } = useApp();
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle');
  const [err, setErr] = useState('');
  const pending = m.pending;
  return (
    <div className="space-y-2">
      <p className="whitespace-pre-wrap text-foreground">{m.content}</p>
      {m.citations?.length ? (
        <div className="flex flex-wrap gap-1">{m.citations.map((c) => <button key={c.id} type="button" onClick={() => go('policies', c.id)} className="mono-chip is-primary hover:opacity-80" title={c.heading}>{c.id}</button>)}</div>
      ) : null}
      {pending ? (
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-2.5">
          <p className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground"><FileCheck2 className="h-3.5 w-3.5 text-primary" />{bi(pending.title, pending.title_ar)}</p>
          <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{pending.workflow} · {Object.entries(pending.payload ?? {}).filter(([, v]) => v !== null && v !== '' && typeof v !== 'object').map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>
          {pending.confirmed ? (
            <button type="button" className="mt-1.5 text-[12px] text-primary underline" onClick={() => openCase(pending.confirmed)}>{t('Submitted')}: {pending.confirmed}</button>
          ) : (
            <div className="mt-2 flex items-center gap-2">
              <Btn small kind="primary" disabled={state === 'busy'} onClick={async () => {
                setState('busy');
                try { const r = await post('/assistant/confirm', { message_id: m.id }); bump(); onConfirmed(); openCase(r.ref); setState('idle'); }
                catch (e: any) { setErr(e.message); setState('error'); }
              }}>{t('Confirm')}</Btn>
              <span className="text-[11px] text-muted-foreground">{t('Nothing is submitted until you confirm.')}</span>
            </div>
          )}
          {state === 'error' ? <p className="mt-1 text-[11px] text-danger">{err}</p> : null}
        </div>
      ) : null}
      {m.tool_calls?.length ? <p className="font-mono text-[10px] text-muted-foreground">{t('Read')}: {[...new Set(m.tool_calls.map((c) => c.name))].join(', ')}{m.mode === 'offline' ? ` · ${t('offline')}` : ''}</p> : null}
    </div>
  );
}

export function AssistantRail({ rail }: { rail: ChatRailState }) {
  const { t, bi, lang } = useLang();
  const { persona, session, route, go } = useApp();
  const isHR = !!persona?.roles.some((r) => ['HRBP', 'TA', 'PAYROLL', 'CHRO'].includes(r));
  const name = isHR ? bi('Murshid', 'مرشد') : bi('Rafeeq', 'رفيق');
  const { data: history, reload } = useApi<Msg[]>(persona ? `/assistant/history?k=${persona.key}` : null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { if (history) setMsgs(history); }, [history]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs, busy]);
  const mode = session?.ai.mode ?? 'offline';
  const client = useClient();

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setDraft('');
    setMsgs((m) => [...m, { id: -Date.now(), role: 'user', content: q }]);
    setBusy(true);
    try {
      const r = await post<Msg & { navigate?: string }>('/assistant', { text: q, lang, screen: route.screen });
      setMsgs((m) => [...m, r]);
      if (r.navigate) go(r.navigate);
    } catch (e: any) {
      setMsgs((m) => [...m, { id: -Date.now(), role: 'assistant', content: `${t('Something went wrong')}: ${e.message}` }]);
    } finally { setBusy(false); }
  };

  const suggestions = (SUGGEST[persona?.key ?? 'employee'] ?? SUGGEST.employee).map(([en, ar]) => bi(en.replace('{bank}', client.bank[0]), ar.replace('{bank}', client.bank[1])));
  return (
    <ChatRail
      rail={rail}
      label={name}
      brand={<RailBrandCard className="dark:border-white/10 dark:bg-card/80" onCollapse={() => rail.setOpen(false)}><img src="/brand/logo-on-light.png" alt={client.short} className="h-8 w-auto dark:hidden" /><img src="/brand/logo-on-dark.png" alt={client.short} className="hidden h-8 w-auto dark:block" /></RailBrandCard>}
      collapsedBrand={<><img src="/brand/mark.png" alt="" className="h-6 w-6 dark:hidden" /><img src="/brand/mark-on-dark.png" alt="" className="hidden h-6 w-6 dark:block" /></>}
      header={
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">{name.slice(0, 1)}</span>
          <div className="min-w-0 leading-tight">
            <p className="text-sm font-semibold">{name}</p>
            <p className="truncate text-[11px] text-muted-foreground">{isHR ? t('HR Co-pilot') : t('Employee HR Concierge')}</p>
          </div>
          <span className="ms-auto flex items-center gap-1.5">
            <ChatStatusBadge state={mode === 'claude' ? 'live' : 'idle'}>{mode === 'claude' ? t('Claude') : t('Offline')}</ChatStatusBadge>
            <button type="button" title={t('New conversation')} aria-label={t('New conversation')} className="text-muted-foreground hover:text-foreground" onClick={async () => { await api('/assistant/history', { method: 'DELETE' }); setMsgs([]); reload(); }}><RotateCcw className="h-3.5 w-3.5" /></button>
          </span>
        </div>
      }
      transcript={
        <div className="space-y-3 text-[13px]">
          {!msgs.length ? (
            <ChatAssistantTurn avatar={name.slice(0, 1)}>
              <p className="text-foreground">{isHR ? t('I can answer from HRMS data inside your scope, cite the HR policy, and prepare cases for you to confirm.') : t('Ask me about leave, pay, letters or any HR policy. I answer from the HR handbook and your HRMS record, and I prepare requests for you to confirm.')}</p>
              {mode === 'offline' ? <p className="mt-1.5 text-[11px]"><Chip tone="warn">{t('Offline')}</Chip> {t('Replit AI Integrations is not connected, so answers come from fixed matching over the same data.')}</p> : null}
            </ChatAssistantTurn>
          ) : null}
          {msgs.map((m) => m.role === 'user' ? <ChatUserTurn key={m.id}>{m.content}</ChatUserTurn> : (
            <ChatAssistantTurn key={m.id} avatar={name.slice(0, 1)}><Answer m={m} onConfirmed={reload} /></ChatAssistantTurn>
          ))}
          {busy ? <ChatAssistantTurn avatar={name.slice(0, 1)}><span className="animate-pulse">{t('Checking the policy and your records…')}</span></ChatAssistantTurn> : null}
          <div ref={end} />
        </div>
      }
      suggestions={<ChatSuggestions items={suggestions} onSelect={send} />}
      composer={<ChatComposer value={draft} onChange={setDraft} onSend={() => send(draft)} placeholder={isHR ? t('Ask Murshid…') : t('Ask Rafeeq…')} busy={busy} />}
    />
  );
}
