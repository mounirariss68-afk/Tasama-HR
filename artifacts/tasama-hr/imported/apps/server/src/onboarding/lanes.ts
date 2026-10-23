/**
 * Intiqal takes a new client on from its files (design/payroll-addendum.md §13, §19, WF-24).
 *
 * Seven lanes read the dropped files into a staging area: the client, its roster, its policy, its
 * contracts and letters, the months it paid and its leave. Each lane says what it found and raises
 * the issues it cannot settle. Nothing is written to a client master here; go-live does that after
 * the payroll lead approves.
 *
 * Arithmetic and matching only. The history is recalculated by the same engine that pays every client.
 */
import type { ClientConfig } from '../domain/clients.js';
import { runPayroll, type EngineEmployee } from '../domain/payroll/engine.js';
import { termsFromRules } from '../domain/payroll/terms.js';
import { kindOf, readWorkbook, readPdf, pairs, fields, money, isoDate, ibanValid, type FileKind, type Sheet, type Cell } from './read.js';
import { handbookFromPages, readTerms, rulesFor } from './terms.js';

export type LaneKey = 'client' | 'roster' | 'policy' | 'contracts' | 'letters' | 'history' | 'leave';
export const LANES: { key: LaneKey; label: string; label_ar: string; agent: string }[] = [
  { key: 'client', label: 'Client', label_ar: 'العميل', agent: 'intiqal' },
  { key: 'roster', label: 'Roster', label_ar: 'الموظفون', agent: 'intiqal' },
  { key: 'policy', label: 'Policy', label_ar: 'السياسة', agent: 'nizam' },
  { key: 'contracts', label: 'Contracts', label_ar: 'العقود', agent: 'aqd' },
  { key: 'letters', label: 'Letters', label_ar: 'الخطابات', agent: 'intiqal' },
  { key: 'history', label: 'History', label_ar: 'السجل', agent: 'hisab' },
  { key: 'leave', label: 'Leave and provisions', label_ar: 'الإجازات والمخصصات', agent: 'intiqal' },
];
export type LaneState = 'WAITING' | 'READING' | 'DONE' | 'EMPTY';
export type Lane = { key: LaneKey; state: LaneState; files: number; headline: string; headline_ar?: string; stats: { label: string; label_ar?: string; value: string | number; value_ar?: string; tone?: 'ok' | 'warn' | 'bad' }[]; issues: number };
export type Issue = {
  id: string; code: string; lane: LaneKey; who: 'CLIENT' | 'TASAMA';
  title: string; title_ar: string; settle: string; settle_ar: string; people: { no: string; name: string }[]; amount?: number;
};
export type InFile = { path: string; content: Buffer };

/* ------------------------------------------------------------------ the master data's columns */

/** Platform field ← the column names a client's master data uses for it. The map is shown and can be corrected. */
export const FIELDS: { field: string; label: string; match: RegExp }[] = [
  { field: 'no', label: 'Employee number', match: /^(employee|emp|staff)\.?\s*(no|number|id|#)$/i },
  { field: 'name', label: 'Name in English', match: /name.*english|^(employee )?name$/i },
  { field: 'name_ar', label: 'Name in Arabic', match: /name.*arabic|الاسم/i },
  { field: 'nationalId', label: 'National ID or iqama', match: /^(?!.*expiry).*(national id|iqama)/i },
  { field: 'idExpiry', label: 'ID or iqama expiry', match: /(id|iqama).*expiry/i },
  { field: 'nationality', label: 'Nationality', match: /^nationality$/i },
  { field: 'saudi', label: 'Saudi or expatriate', match: /saudi\s*\/\s*expat/i },
  { field: 'gender', label: 'Gender', match: /^gender$/i },
  { field: 'marital', label: 'Marital status', match: /marital/i },
  { field: 'dependants', label: 'Dependants', match: /dependan/i },
  { field: 'birth', label: 'Date of birth', match: /birth/i },
  { field: 'passport', label: 'Passport', match: /^(?!.*expiry).*passport/i },
  { field: 'passportExpiry', label: 'Passport expiry', match: /passport.*expiry/i },
  { field: 'mobile', label: 'Mobile', match: /mobile|phone/i },
  { field: 'email', label: 'Email', match: /e-?mail/i },
  { field: 'dept', label: 'Department', match: /organi[sz]ation|department/i },
  { field: 'location', label: 'Location', match: /^location$/i },
  { field: 'position', label: 'Position', match: /position|job title/i },
  { field: 'grade', label: 'Grade', match: /^grade$/i },
  { field: 'managerNo', label: 'Line manager', match: /manager/i },
  { field: 'hire', label: 'Hire date', match: /hire date|joining date|date of joining/i },
  { field: 'probationEnd', label: 'Probation end', match: /probation/i },
  { field: 'contractType', label: 'Contract type', match: /contract type/i },
  { field: 'contractStart', label: 'Contract start', match: /contract start/i },
  { field: 'contractEnd', label: 'Contract end', match: /contract end/i },
  { field: 'basic', label: 'Basic salary', match: /^basic/i },
  { field: 'housing', label: 'Housing allowance', match: /housing/i },
  { field: 'transport', label: 'Transport allowance', match: /transport/i },
  { field: 'other', label: 'Other allowance', match: /other allow/i },
  { field: 'bank', label: 'Bank', match: /^bank$/i },
  { field: 'iban', label: 'IBAN', match: /iban/i },
  { field: 'gosiFirst', label: 'GOSI first registration', match: /gosi/i },
  { field: 'leaveEntitlement', label: 'Annual leave entitlement', match: /leave entitlement|annual leave/i },
  { field: 'education', label: 'Education', match: /education|qualification/i },
  { field: 'project', label: 'Project', match: /project/i },
];
export function mapColumns(headers: string[], override: Record<string, string> = {}) {
  const used = new Set<string>();
  return headers.filter(Boolean).map((column) => {
    const field = override[column] ?? FIELDS.find((f) => !used.has(f.field) && f.match.test(column))?.field ?? null;
    if (field) used.add(field);
    return { column, field, label: FIELDS.find((f) => f.field === field)?.label ?? null };
  });
}

/* ------------------------------------------------------------------ helpers */

const r2 = (n: number) => Math.round(n * 100) / 100;
const str = (v: Cell | undefined) => (v == null ? '' : String(v).trim());
const numv = (v: Cell | undefined) => (v == null || v === '' ? 0 : Number(v));
const sar = (n: number) => `SAR ${Math.round(n).toLocaleString('en-US')}`;
const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' });
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const monthEnd = (m: string) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10);
const sarAr = (n: number) => `${Math.round(n).toLocaleString('en-US')} ريال`;
const monthAr = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleString('ar', { month: 'long', timeZone: 'UTC' });
const listAr = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join('، ')} و${xs[xs.length - 1]}`);
const dateAr = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('ar', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
/** The lanes' labels in Arabic. */
const STAT_AR: Record<string, string> = {
  'Legal entity': 'الكيان القانوني', 'Commercial registration': 'السجل التجاري', 'GOSI establishment': 'منشأة التأمينات', 'Main bank': 'البنك الرئيسي', 'Pay day': 'يوم صرف الرواتب', 'Cut-off': 'يوم الإقفال',
  Ready: 'جاهزون', Held: 'معلّقون', Departments: 'إدارات', Positions: 'وظائف', Grades: 'درجات', Managers: 'مديرون', 'Columns mapped': 'أعمدة مطابقة',
  Dimensions: 'أبعاد', Refused: 'مرفوضة', 'Not stated': 'غير مذكورة', Policies: 'سياسات', Clauses: 'بنود',
  Matched: 'مطابقة', 'Salary differences': 'فروقات رواتب', 'Explained by a letter': 'مفسّرة بخطاب', Missing: 'مفقودة', Expired: 'منتهية', 'Not matched': 'غير مطابقة',
  Attached: 'ملحقة', Promotion: 'ترقية', Promotions: 'ترقيات', 'Salary certificate': 'شهادة راتب', 'Salary certificates': 'شهادات راتب', 'Salary transfer': 'خطاب تحويل راتب', 'Salary transfers': 'خطابات تحويل راتب', Warning: 'إنذار', Warnings: 'إنذارات', 'Not attached': 'غير ملحقة',
  Months: 'أشهر', Differences: 'فروقات', 'People concerned': 'موظفون معنيون', 'Net paid in the six months': 'صافي المدفوع في الأشهر الستة', 'Net difference': 'فرق الصافي',
  Balances: 'أرصدة', Negative: 'بالسالب', 'End of service, sheet': 'نهاية الخدمة في الجدول', 'End of service, platform': 'نهاية الخدمة في المنصة', 'Leave, sheet': 'الإجازات في الجدول', 'Leave, platform': 'الإجازات في المنصة', 'Over five years of service': 'أكثر من خمس سنوات خدمة',
};
const valueAr = (v: string | number) => (typeof v === 'number' ? undefined : /^SAR /.test(v) ? `${v.slice(4)} ريال` : /^Day (\d+)$/.test(v) ? `اليوم ${v.slice(4)}` : v === 'Not given' || v === 'Not stated' ? 'غير مذكور' : /^(\d+) of (\d+)$/.test(v) ? v.replace(/^(\d+) of (\d+)$/, '$1 من $2') : undefined);
const consonants = (s: string) => (s.toUpperCase().replace(/[^A-Z]/g, '').replace(/(?!^)[AEIOU]/g, '') + 'XXX').slice(0, 3);

export type Person = {
  no: string; masterNo: string; name: string; name_ar: string; nationalId: string; nationality: string; isSaudi: boolean; gender: string;
  marital: string; dependants: number; birth: string | null; idExpiry: string | null; passport: string; passportExpiry: string | null; mobile: string; email: string;
  dept: string; location: string; position: string; grade: string; managerNo: string; hire: string; probationEnd: string | null;
  contractType: string; contractStart: string | null; contractEnd: string | null;
  basic: number; housing: number; transport: number; other: number; bank: string; iban: string; gosiFirst: string | null;
  leaveEntitlement: number; education: string; project: string; held: string | null;
};

/* ------------------------------------------------------------------ the reading */

/**
 * Reads every file and returns the lanes, the issues and the staged client. `onLane` is called as
 * each lane is done, in the order the screen shows them, so the lanes fill one after another.
 */
export async function readClient(files: InFile[], opts: { today: string; columnMap?: Record<string, string>; onLane?: (lane: Lane, issues: Issue[]) => Promise<void> } ) {
  const by = (k: FileKind) => files.filter((f) => kindOf(f.path) === k);
  const issues: Issue[] = [];
  const lanes: Lane[] = [];
  const done = async (lane: Lane) => {
    lane.stats = lane.stats.map((x) => ({ ...x, label_ar: STAT_AR[x.label] ?? x.label, value_ar: valueAr(x.value) }));
    lanes.push(lane); await opts.onLane?.(lane, issues.filter((i) => i.lane === lane.key));
  };
  const raise = (i: Omit<Issue, 'id'>) => { issues.push({ ...i, id: `${i.code}:${i.people.map((p) => p.no).join('+') || i.lane}` }); };

  /* ----- read everything first: some lanes settle what another found ----- */
  const master = by('MASTER')[0] ? await readWorkbook(by('MASTER')[0].content) : [];
  const md = master.find((s) => /master/i.test(s.name)) ?? master[0];
  const leaversSheet = master.find((s) => /leaver/i.test(s.name));
  const company = master.find((s) => /company/i.test(s.name));
  const co = company ? { ...pairs(company) } : {};
  const policyFile = by('POLICY')[0];
  const hb = policyFile ? handbookFromPages(await readPdf(policyFile.content)) : null;
  const terms = hb ? readTerms(hb.policies) : null;
  const contracts = await Promise.all(by('CONTRACT').map(async (f) => ({ file: f.path, f: fields((await readPdf(f.content)).join('\n')) })));
  const letterTexts = await Promise.all(by('LETTER').map(async (f) => ({ file: f.path, text: (await readPdf(f.content)).join('\n') })));
  const payroll = await Promise.all(by('PAYROLL').map(async (f) => ({ file: f.path, month: f.path.match(/(\d{4}-\d{2})/)![1], sheet: (await readWorkbook(f.content))[0] })));
  payroll.sort((a, b) => a.month.localeCompare(b.month));
  const leaveSheet = by('LEAVE')[0] ? (await readWorkbook(by('LEAVE')[0].content))[0] : null;
  const provSheet = by('PROVISIONS')[0] ? (await readWorkbook(by('PROVISIONS')[0].content))[0] : null;

  /* ----- Client ----- */
  const short = terms?.short ?? str(co['Trading name' as any]).split(' ')[0] ?? 'New client';
  const name = co['Trading name'] || co['Legal name (English)'] || short;
  const key = short.toLowerCase().replace(/[^a-z]/g, '');
  const p = terms?.params;
  const banks = new Map<string, number>();
  const map = md ? mapColumns(md.headers, opts.columnMap) : [];
  const col = (field: string) => map.find((m) => m.field === field)?.column;
  const get = (r: Record<string, Cell>, field: string) => { const c = col(field); return c ? r[c] : null; };
  for (const r of md?.rows ?? []) { const b = str(get(r, 'bank')); if (b) banks.set(b, (banks.get(b) ?? 0) + 1); }
  const mainBank = co['Main bank'] || [...banks.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  const client = {
    key, code: consonants(short), name, name_ar: co['Trading name (Arabic)'] || co['Legal name (Arabic)']?.replace(/^شركة\s+/, '') || '', sector: co['Sector'] ?? '', sector_ar: co['Sector (Arabic)'] ?? '', city: co['City'] ?? '', city_ar: co['City (Arabic)'] ?? '', legal: co['Legal name (English)'] ?? name, legal_ar: co['Legal name (Arabic)'] ?? '',
    short, cr: co['Commercial registration'] ?? null, gosiEstablishment: co['GOSI establishment number'] ?? null, bank: mainBank,
    nitaqat: { activity: co['Nitaqat activity'] ?? '', band: co['Nitaqat band'] ?? '', requiredPct: (Number(String(co['Nitaqat required Saudi share'] ?? '').replace('%', '')) || 0) / 100 },
    headOffice: co['Head office'] ?? null, sites: co['Sites'] ?? null, payDay: p?.payDay ?? null, cutoffDay: p?.cutoffDay ?? null, headcount: md?.rows.length ?? 0,
  };
  await done({ key: 'client', state: md || hb ? 'DONE' : 'EMPTY', files: (md ? 1 : 0) + (hb ? 1 : 0), headline: `${client.name}, ${client.headcount} employees, paid on day ${client.payDay ?? '?'}`, headline_ar: `${client.name_ar || client.name}، ${client.headcount} موظفًا، تُصرف الرواتب في اليوم ${client.payDay ?? '?'}`, issues: 0,
    stats: [{ label: 'Legal entity', value: client.legal }, { label: 'Commercial registration', value: client.cr ?? 'Not given' }, { label: 'GOSI establishment', value: client.gosiEstablishment ?? 'Not given' },
      { label: 'Main bank', value: client.bank }, { label: 'Pay day', value: client.payDay ? `Day ${client.payDay}` : 'Not stated' }, { label: 'Cut-off', value: client.cutoffDay ? `Day ${client.cutoffDay}` : 'Not stated' }] });

  /* ----- Roster ----- */
  const toPerson = (r: Record<string, Cell>): Person => {
    const nat = str(get(r, 'nationality'));
    return {
      no: str(get(r, 'no')), masterNo: str(get(r, 'no')), name: str(get(r, 'name')), name_ar: str(get(r, 'name_ar')), nationalId: str(get(r, 'nationalId')), nationality: nat,
      isSaudi: /^saudi$/i.test(str(get(r, 'saudi'))) || /^saudi$/i.test(nat), gender: str(get(r, 'gender')), marital: str(get(r, 'marital')), dependants: numv(get(r, 'dependants')),
      birth: str(get(r, 'birth')) || null, idExpiry: str(get(r, 'idExpiry')) || null, passport: str(get(r, 'passport')), passportExpiry: str(get(r, 'passportExpiry')) || null, mobile: str(get(r, 'mobile')), email: str(get(r, 'email')),
      dept: str(get(r, 'dept')), location: str(get(r, 'location')), position: str(get(r, 'position')), grade: str(get(r, 'grade')), managerNo: str(get(r, 'managerNo')),
      hire: str(get(r, 'hire')), probationEnd: str(get(r, 'probationEnd')) || null, contractType: str(get(r, 'contractType')), contractStart: str(get(r, 'contractStart')) || null, contractEnd: str(get(r, 'contractEnd')) || null,
      basic: numv(get(r, 'basic')), housing: numv(get(r, 'housing')), transport: numv(get(r, 'transport')), other: numv(get(r, 'other')),
      bank: str(get(r, 'bank')), iban: str(get(r, 'iban')), gosiFirst: str(get(r, 'gosiFirst')) || null, leaveEntitlement: numv(get(r, 'leaveEntitlement')),
      education: str(get(r, 'education')), project: str(get(r, 'project')), held: null,
    };
  };
  const roster = (md?.rows ?? []).map(toPerson);
  const who = (x: { no: string; name: string }) => ({ no: x.no, name: x.name });
  const ar = (x: { name: string; name_ar?: string }) => x.name_ar || x.name;

  // Contracts matched to people: by number and name or ID; failing that by ID, then by name.
  const contractOf = new Map<Person, (typeof contracts)[number]>();
  const cNo = (c: (typeof contracts)[number]) => c.f['Employee number'];
  for (const c of contracts) {
    const id = c.f['National ID / Iqama'], nm = c.f['Employee name'];
    const hit = roster.find((x) => x.masterNo === cNo(c) && (x.nationalId === id || x.name === nm)) ?? roster.find((x) => x.nationalId === id) ?? roster.find((x) => x.name === nm);
    if (hit && !contractOf.has(hit)) contractOf.set(hit, c);
  }
  // One number for two people: the one whose contract carries another number is held, with that number proposed.
  const byNo = new Map<string, Person[]>();
  for (const x of roster) byNo.set(x.masterNo, [...(byNo.get(x.masterNo) ?? []), x]);
  for (const [no, xs] of byNo) if (xs.length > 1) {
    const wrong = xs.find((x) => contractOf.get(x) && cNo(contractOf.get(x)!) !== no) ?? [...xs].sort((a, b) => b.hire.localeCompare(a.hire))[0];
    const right = xs.find((x) => x !== wrong)!;
    const proposed = contractOf.get(wrong) ? cNo(contractOf.get(wrong)!) : null;
    if (proposed) wrong.no = proposed;
    wrong.held = 'DUPLICATE_NUMBER';
    raise({ code: 'DUPLICATE_NUMBER', lane: 'roster', who: 'CLIENT', people: [who(right), { no: proposed ?? no, name: wrong.name }],
      title: `${no} is used for both ${right.name} and ${wrong.name}`, settle: proposed ? `${wrong.name}'s contract says ${proposed}. The client confirms the number before this row is taken on.` : 'The client gives the right number before this row is taken on.',
      title_ar: `الرقم ${no} مستخدم لكلٍّ من ${ar(right)} و${ar(wrong)}`, settle_ar: proposed ? `يذكر عقد ${ar(wrong)} الرقم ${proposed}. يؤكد العميل الرقم قبل نقل هذا السجل.` : 'يحدد العميل الرقم الصحيح قبل نقل هذا السجل.' });
  }
  for (const x of roster) if (!ibanValid(x.iban)) {
    x.held = x.held ?? 'IBAN_CHECK';
    raise({ code: 'IBAN_CHECK', lane: 'roster', who: 'CLIENT', people: [who(x)], title: `${x.name}'s IBAN fails the check digits`, settle: 'The client sends a bank letter with the right IBAN; until then the salary cannot be paid through WPS.',
      title_ar: `رقم الآيبان لـ${ar(x)} لا يجتاز خانات التحقق`, settle_ar: 'يرسل العميل خطابًا من البنك بالآيبان الصحيح، ولا يُصرف الراتب عبر حماية الأجور قبل ذلك.' });
  }
  for (const x of roster) if (x.isSaudi && !x.gosiFirst) raise({ code: 'GOSI_DATE_MISSING', lane: 'roster', who: 'TASAMA', people: [who(x)], title: `${x.name} has no GOSI registration date`, settle: 'Tasama reads the date from the GOSI portal; it sets the contribution rate.', title_ar: `لا يوجد تاريخ تسجيل في التأمينات الاجتماعية لـ${ar(x)}`, settle_ar: 'تقرأ تسامى التاريخ من بوابة التأمينات، وهو يحدد نسبة الاشتراك.' });
  for (const x of roster) if (p && Math.abs(x.housing - Math.round(x.basic * p.housingPct / 100)) > 1) {
    const c = contractOf.get(x), fromContract = c ? money(c.f['Housing allowance']) : null, pct = Math.round(x.housing / x.basic * 100);
    if (fromContract != null) x.housing = fromContract;
    raise({ code: 'HOUSING_NOT_POLICY', lane: 'roster', who: 'TASAMA', people: [who(x)], amount: fromContract ?? undefined,
      title: `${x.name}'s housing allowance is ${pct}% of basic, not the policy's ${p.housingPct}%`,
      settle: fromContract != null ? `The contract says ${sar(fromContract)}, the policy amount; that is what is taken on.` : 'Tasama asks the client which amount is right.',
      title_ar: `بدل السكن لـ${ar(x)} ${pct}% من الأساسي، لا ${p.housingPct}% كما تنص السياسة`, settle_ar: fromContract != null ? `يذكر العقد ${sarAr(fromContract)}، وهو مبلغ السياسة، ويُعتمد عند النقل.` : 'تسأل تسامى العميل عن المبلغ الصحيح.' });
  }
  const depts = new Set(roster.map((x) => x.dept)), positions = new Set(roster.map((x) => x.position)), grades = new Set(roster.map((x) => x.grade)), managers = new Set(roster.map((x) => x.managerNo).filter(Boolean));
  const held = roster.filter((x) => x.held).length;
  await done({ key: 'roster', state: md ? 'DONE' : 'EMPTY', files: md ? 1 : 0, headline: `${roster.length} employees: ${roster.length - held} ready, ${held} held`, headline_ar: `${roster.length} موظفًا: ${roster.length - held} جاهزون و${held} معلّقون`, issues: issues.filter((i) => i.lane === 'roster').length,
    stats: [{ label: 'Ready', value: roster.length - held, tone: 'ok' }, { label: 'Held', value: held, tone: held ? 'bad' : 'ok' }, { label: 'Departments', value: depts.size }, { label: 'Positions', value: positions.size },
      { label: 'Grades', value: grades.size }, { label: 'Managers', value: managers.size }, { label: 'Columns mapped', value: `${map.filter((m) => m.field).length} of ${map.length}` }] });

  /* ----- Policy ----- */
  const cfg: ClientConfig | null = p && terms ? {
    key, code: client.code, name: client.name, name_ar: client.name_ar || client.name, short, sector: client.sector, sector_ar: client.sector_ar, city: client.city, city_ar: client.city_ar, hrms: 'PLATFORM', hrmsLabel: 'Tasama HR employee master',
    finance: 'ODOO_ACC', size: roster.length, saudiShare: roster.length ? roster.filter((x) => x.isSaudi).length / roster.length : 0, nitaqat: client.nitaqat, slowness: 1,
    policy: p, contract: { model: 'Payroll managed service', model_ar: 'خدمة الرواتب المُدارة', services: ['PAYROLL'], pepm: 0, perHire: 0, start: '', term: 24, phase: 'BUILD', creditCapPct: 8 },
    orgRename: {}, roleRename: {}, bank: [mainBank, ''],
  } : null;
  const pay = terms ? { ...terms.pay, overtimeWho_ar: terms.pay.overtimeWho } : null;
  const read = cfg && pay && hb ? rulesFor(cfg, pay, hb.policies) : null;
  const refused = read?.rules.filter((r) => r.flag === 'BELOW_LAW') ?? [];
  const LAW_OF: Record<string, [string, (r: (typeof refused)[number]) => string, string, (r: (typeof refused)[number]) => string, string]> = {
    probation: ['PROBATION_ABOVE_LAW', (r) => `The policy sets probation at ${r.num} days, above the law's 180`, 'Refused: probation stops at 180 days (Art. 53).',
      (r) => `تحدد السياسة فترة التجربة بـ${r.num} يومًا، أكثر من 180 يومًا يسمح بها النظام`, 'مرفوضة: تنتهي فترة التجربة عند 180 يومًا (المادة 53).'],
    'lateness.cap': ['FINES_ABOVE_LAW', (r) => `The policy allows fines of up to ${r.num} days' wage a month, above the law's 5`, 'Refused: fines in a month stop at five days\' wage (Art. 70).',
      (r) => `تسمح السياسة بغرامات تصل إلى أجر ${r.num} أيام في الشهر، أكثر من 5 أيام يسمح بها النظام`, 'مرفوضة: لا تتجاوز الغرامات في الشهر أجر خمسة أيام (المادة 70).'],
  };
  for (const r of refused) { const l = LAW_OF[r.key]; raise({ code: l?.[0] ?? 'RULE_BELOW_LAW', lane: 'policy', who: 'TASAMA', people: [], title: l ? l[1](r) : `${r.label}: ${r.value} is below the law`, settle: l?.[2] ?? r.flag_note ?? 'The law applies.',
    title_ar: l ? l[3](r) : `${r.label_ar}: ${r.value} يخالف النظام`, settle_ar: l?.[4] ?? 'يُطبق النظام.' }); }
  const dims = new Set(read?.rules.map((r) => r.dim) ?? []);
  await done({ key: 'policy', state: hb ? 'DONE' : 'EMPTY', files: hb ? 1 : 0, headline: hb ? `${dims.size} dimensions read, ${refused.length} rules refused as below the law` : 'No policy manual in the folder', headline_ar: hb ? `قُرئ ${dims.size} بُعدًا، ورُفضت ${refused.length} قواعد لمخالفتها النظام` : 'لا يوجد دليل سياسات في المجلد', issues: refused.length,
    stats: [{ label: 'Dimensions', value: dims.size, tone: 'ok' }, { label: 'Refused', value: refused.length, tone: refused.length ? 'bad' : 'ok' }, { label: 'Not stated', value: read?.rules.filter((r) => r.flag === 'MISSING').length ?? 0, tone: 'warn' },
      { label: 'Policies', value: hb?.policies.length ?? 0 }, { label: 'Clauses', value: hb?.policies.reduce((s, x) => s + x.clauses.length, 0) ?? 0 }] });

  /* ----- Letters (read before contracts are judged: a promotion letter explains a salary difference) ----- */
  const letters = letterTexts.map((l) => {
    const t = l.text.replace(/\s+/g, ' ');
    const kind = /Promotion letter/.test(t) ? 'PROMOTION' : /Salary certificate/.test(t) ? 'SALARY_CERTIFICATE' : /Salary transfer letter/.test(t) ? 'SALARY_TRANSFER' : /Warning letter/.test(t) ? 'WARNING' : 'OTHER';
    const no = t.match(/[Ee]mployee number:?\s*([A-Z]{2,4}-\d+)/)?.[1] ?? l.file.match(/([A-Z]{2,4}-\d+)/)?.[1] ?? null;
    const date = l.file.match(/(\d{4}-\d{2}-\d{2})\.pdf$/)?.[1] ?? null;
    const promo = kind === 'PROMOTION' ? t.match(/effective (\d{1,2} \w+ \d{4})\. Your basic salary rises from SAR ([\d,.]+) to SAR ([\d,.]+)/) : null;
    const grades = kind === 'PROMOTION' ? t.match(/from grade (G\d+) to grade (G\d+)/) : null;
    return { file: l.file, kind, no, date, fromGrade: grades?.[1] ?? null, toGrade: grades?.[2] ?? null, effective: promo ? isoDate(promo[1]) : null, from: promo ? Number(promo[2].replace(/,/g, '')) : null, to: promo ? Number(promo[3].replace(/,/g, '')) : null };
  });
  const personByNo = (no: string | null) => roster.find((x) => x.no === no) ?? roster.find((x) => x.masterNo === no);
  const attached = letters.filter((l) => personByNo(l.no));

  /* ----- Contracts ----- */
  let differences = 0, explained = 0;
  for (const [x, c] of contractOf) {
    const basic = money(c.f['Basic salary']);
    if (basic != null && Math.abs(basic - x.basic) > 1) {
      differences++;
      const letter = letters.find((l) => l.kind === 'PROMOTION' && personByNo(l.no) === x && l.from != null && Math.abs(l.from - basic) <= 1 && Math.abs((l.to ?? 0) - x.basic) <= 1);
      if (letter) { explained++; continue; }
      raise({ code: 'SALARY_UNEXPLAINED', lane: 'contracts', who: 'CLIENT', people: [who(x)], amount: r2(x.basic - basic),
        title: `${x.name}'s basic salary is ${sar(x.basic)} in the master data and ${sar(basic)} in the contract`, settle: 'No letter in the folder explains it. The client sends the amendment or confirms the right amount.',
        title_ar: `الراتب الأساسي لـ${ar(x)} ${sarAr(x.basic)} في البيانات الرئيسية و${sarAr(basic)} في العقد`, settle_ar: 'لا يفسّره أي خطاب في المجلد. يرسل العميل التعديل أو يؤكد المبلغ الصحيح.' });
    }
  }
  const missing = roster.filter((x) => !contractOf.has(x));
  for (const x of missing) raise({ code: 'NO_CONTRACT', lane: 'contracts', who: 'CLIENT', people: [who(x)], title: `There is no contract for ${x.name} in the folder`, settle: 'The client sends the signed contract.', title_ar: `لا يوجد عقد لـ${ar(x)} في المجلد`, settle_ar: 'يرسل العميل العقد الموقّع.' });
  const expired = [...contractOf].filter(([, c]) => { const end = isoDate(c.f['End date']); return end != null && end < opts.today; });
  for (const [x, c] of expired) raise({ code: 'CONTRACT_EXPIRED', lane: 'contracts', who: 'CLIENT', people: [who(x)], title: `${x.name}'s fixed-term contract ended on ${c.f['End date']} and ${x.name.split(' ')[0]} is still paid`, settle: 'The client sends the renewal, or the contract is now indefinite by law (Art. 55) and the client confirms it.',
    title_ar: `انتهى العقد محدد المدة لـ${ar(x)} في ${dateAr(isoDate(c.f['End date'])!)} وما زال يتقاضى راتبه`, settle_ar: 'يرسل العميل التجديد، أو يصبح العقد غير محدد المدة بحكم النظام (المادة 55) ويؤكد العميل ذلك.' });
  const unmatched = contracts.filter((c) => ![...contractOf.values()].includes(c));
  await done({ key: 'contracts', state: contracts.length ? 'DONE' : 'EMPTY', files: contracts.length, headline: `${contractOf.size} matched, ${differences} differences (${explained} explained), ${missing.length} missing, ${expired.length} expired`, headline_ar: `طوبق ${contractOf.size} عقدًا: ${differences} فروقات (${explained} مفسّرة)، ${missing.length} مفقودة، ${expired.length} منتهية`, issues: issues.filter((i) => i.lane === 'contracts').length,
    stats: [{ label: 'Matched', value: contractOf.size, tone: 'ok' }, { label: 'Salary differences', value: differences, tone: differences - explained ? 'bad' : 'ok' }, { label: 'Explained by a letter', value: explained },
      { label: 'Missing', value: missing.length, tone: missing.length ? 'bad' : 'ok' }, { label: 'Expired', value: expired.length, tone: expired.length ? 'bad' : 'ok' }, ...(unmatched.length ? [{ label: 'Not matched', value: unmatched.length, tone: 'warn' as const }] : [])] });

  const kinds = (k: string) => letters.filter((l) => l.kind === k).length;
  await done({ key: 'letters', state: letters.length ? 'DONE' : 'EMPTY', files: letters.length, headline: `${attached.length} letters attached to their employees`, headline_ar: `أُلحق ${attached.length} خطابًا بأصحابها`, issues: 0,
    stats: [{ label: 'Attached', value: attached.length, tone: 'ok' }, { label: kinds('PROMOTION') === 1 ? 'Promotion' : 'Promotions', value: kinds('PROMOTION') }, { label: kinds('SALARY_CERTIFICATE') === 1 ? 'Salary certificate' : 'Salary certificates', value: kinds('SALARY_CERTIFICATE') },
      { label: kinds('SALARY_TRANSFER') === 1 ? 'Salary transfer' : 'Salary transfers', value: kinds('SALARY_TRANSFER') }, { label: kinds('WARNING') === 1 ? 'Warning' : 'Warnings', value: kinds('WARNING') }, ...(letters.length - attached.length ? [{ label: 'Not attached', value: letters.length - attached.length, tone: 'warn' as const }] : [])] });

  /* ----- History: each month as paid, against the engine under the policy ----- */
  const terms27 = read ? termsFromRules(`${hb!.title} v${hb!.version}`, read.rules.map((r) => ({ key: r.key, dim: r.dim, value: r.value, num: r.num ?? null, flag: r.flag ?? null, clause: r.clause }))) : null;
  const leavers = (leaversSheet?.rows ?? []).map((r) => ({ no: str(r['Employee No']), name: str(r['Employee Name (English)']), name_ar: str(r['Employee Name (Arabic)']), nationalId: str(r['National ID / Iqama']), nationality: str(r['Nationality']), gender: str(r['Gender']), birth: str(r['Date of Birth']) || null, dept: str(r['Organisation']), position: str(r['Position']), grade: str(r['Grade']), hire: str(r['Hire Date']), lastDay: str(r['Last Working Day']), reason: str(r['Reason']) }));
  const months: { month: string; people: number; gross: number; net: number; due: number }[] = [];
  const diffs: { month: string; no: string; name: string; paid: number; due: number; difference: number; why: 'HOUSING' | 'GOSI' | 'LEFT' | 'OTHER'; paidRate?: number; dueRate?: number; housingPaid: number; housingDue: number; gosiPaid: number; gosiDue: number }[] = [];
  /** Each month as it was paid, person by person, for the history written at go-live. */
  const paidRows: { month: string; no: string; days: number; basic: number; housing: number; transport: number; gross: number; gosi: number; deductions: number; net: number; gosiEr: number }[] = [];
  const firstFull = new Map<string, Record<string, Cell>>();
  for (const m of payroll) for (const r of m.sheet.rows) if (numv(r['Days Paid']) === 30 && !firstFull.has(str(r['Employee No']) + str(r['Employee Name']))) firstFull.set(str(r['Employee No']) + str(r['Employee Name']), r);
  if (terms27 && p) for (const m of payroll) {
    const rows = m.sheet.rows;
    const people: EngineEmployee[] = [];
    const sheetOf = new Map<string, Record<string, Cell>>();
    for (const r of rows) {
      const no = str(r['Employee No']), nm = str(r['Employee Name']);
      const x = roster.find((y) => y.masterNo === no && y.name === nm) ?? roster.find((y) => y.name === nm);
      const lv = !x ? leavers.find((y) => y.no === no || y.name === nm) : null;
      const ref = x ? x.no : lv ? lv.no : no;
      sheetOf.set(ref, r);
      paidRows.push({ month: m.month, no: ref, days: numv(r['Days Paid']), basic: numv(r['Basic']), housing: numv(r['Housing']), transport: numv(r['Transport']), gross: numv(r['Gross Salary']), gosi: numv(r['GOSI Employee']), deductions: numv(r['Total Deductions']), net: numv(r['Net Salary']), gosiEr: numv(r['GOSI Employer']) });
      if (x) {
        const promo = letters.find((l) => l.kind === 'PROMOTION' && personByNo(l.no) === x && l.effective && `${m.month}-01` < l.effective);
        const basic = promo?.from ?? x.basic;
        const housing = promo ? Math.round(basic * p.housingPct / 100) : x.housing, transport = promo ? Math.round(basic * p.transportPct / 100) : x.transport;
        people.push({ ref, isSaudi: x.isSaudi, hire: x.hire, gosiFirstRegistered: x.gosiFirst ?? x.hire, lastDay: null, elements: { basic, housing, transport, ...(x.other ? { other: x.other } : {}) }, unpaidLeaveDays: numv(r['Unpaid Days']), leave: { entitlementDays: 21, carryoverDays: 0, usedDaysYtd: 0 } });
      } else if (lv) {
        const full = firstFull.get(no + nm) ?? r;
        people.push({ ref, isSaudi: false, hire: lv.hire, lastDay: lv.lastDay, elements: { basic: numv(full['Basic']), housing: numv(full['Housing']), transport: numv(full['Transport']) }, unpaidLeaveDays: numv(r['Unpaid Days']), leave: { entitlementDays: 21, carryoverDays: 0, usedDaysYtd: 0 } });
      }
    }
    const run = runPayroll({ start: `${m.month}-01`, end: monthEnd(m.month) }, terms27, people);
    let due = 0;
    for (const e of run.employees) {
      const r = sheetOf.get(e.ref)!, paid = numv(r['Net Salary']);
      due += e.net;
      if (Math.abs(paid - e.net) < 0.01) continue;
      const lv = leavers.find((y) => y.no === e.ref);
      const why = lv && lv.lastDay < `${m.month}-01` ? 'LEFT' : numv(r['Housing']) === 0 && (e.lines.find((l) => l.code === 'housing')?.amount ?? 0) > 0 ? 'HOUSING' : Math.abs(numv(r['GOSI Employee']) - e.gosi.employee) >= 0.01 ? 'GOSI' : 'OTHER';
      const wage = numv(r['Basic']) + numv(r['Housing']);
      diffs.push({ month: m.month, no: e.ref, name: str(r['Employee Name']), paid, due: e.net, difference: r2(paid - e.net), why, paidRate: wage ? r2(numv(r['GOSI Employee']) / wage * 100) : undefined, dueRate: r2(e.gosi.eeRate * 100), housingPaid: numv(r['Housing']), housingDue: e.lines.find((l) => l.code === 'housing')?.amount ?? 0, gosiPaid: numv(r['GOSI Employee']), gosiDue: e.gosi.employee });
    }
    months.push({ month: m.month, people: rows.length, gross: r2(rows.reduce((s, r) => s + numv(r['Gross Salary']), 0)), net: r2(rows.reduce((s, r) => s + numv(r['Net Salary']), 0)), due: r2(due) });
  }
  const groups = new Map<string, typeof diffs>();
  for (const d of diffs) groups.set(`${d.why}:${d.no}`, [...(groups.get(`${d.why}:${d.no}`) ?? []), d]);
  for (const [, ds] of groups) {
    const d0 = ds[0], ms = list(ds.map((d) => monthName(d.month))), owed = r2(-ds.reduce((s, d) => s + d.difference, 0));
    const msA = listAr(ds.map((d) => monthAr(d.month))), nA = roster.find((y) => y.no === d0.no)?.name_ar || leavers.find((y) => y.no === d0.no)?.name_ar || d0.name;
    if (d0.why === 'HOUSING') raise({ code: 'HOUSING_NOT_PAID', lane: 'history', who: 'TASAMA', people: [{ no: d0.no, name: d0.name }], amount: owed, title: `${d0.name} was paid without housing in ${ms}`, settle: `${sar(owed)} net is owed. Tasama pays it as back pay in the first month on the platform.`, title_ar: `صُرف راتب ${nA} دون بدل السكن في ${msA}`, settle_ar: `المستحق ${sarAr(owed)} صافيًا، وتصرفه تسامى فروقاتٍ في أول شهر على المنصة.` });
    else if (d0.why === 'GOSI') raise({ code: 'GOSI_RATE', lane: 'history', who: 'TASAMA', people: [{ no: d0.no, name: d0.name }], amount: owed, title: `${d0.name}'s GOSI was deducted at ${d0.paidRate}% for ${ds.length} months`, settle: `First registered with GOSI on or after 3 July 2024, so the rate is ${list([...new Set(ds.map((d) => `${d.dueRate}%`))])}. ${sar(-owed)} is under-deducted; Tasama recovers it as GOSI arrears in the first month on the platform.`,
      title_ar: `خُصمت التأمينات لـ${nA} بنسبة ${d0.paidRate}% لمدة ${ds.length} أشهر`, settle_ar: `سُجّل في التأمينات في 3 يوليو 2024 أو بعده، فالنسبة ${listAr([...new Set(ds.map((d) => `${d.dueRate}%`))])}. المبلغ غير المخصوم ${sarAr(-owed)}، وتسترده تسامى متأخراتِ تأمينات في أول شهر على المنصة.` });
    else if (d0.why === 'LEFT') { const lv = leavers.find((y) => y.no === d0.no); raise({ code: 'PAID_AFTER_LEAVING', lane: 'history', who: 'TASAMA', people: [{ no: d0.no, name: d0.name }], amount: owed, title: `${d0.name} was paid for ${ms} after a last day of ${lv ? new Date(`${lv.lastDay}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : ''}`, settle: `${sar(-owed)} was overpaid. Tasama agrees the recovery with the client.`, title_ar: `صُرف لـ${nA} راتب ${msA} بعد آخر يوم عمل في ${lv ? dateAr(lv.lastDay) : ''}`, settle_ar: `الزيادة المدفوعة ${sarAr(-owed)}، وتتفق تسامى مع العميل على استردادها.` }); }
    else raise({ code: 'PAY_DIFFERENCE', lane: 'history', who: 'TASAMA', people: [{ no: d0.no, name: d0.name }], amount: owed, title: `${d0.name} was paid differently from the policy in ${ms}`, settle: 'Tasama checks the month with the client.', title_ar: `صُرف لـ${nA} بخلاف السياسة في ${msA}`, settle_ar: 'تراجع تسامى الشهر مع العميل.' });
  }
  const histIssues = issues.filter((i) => i.lane === 'history');
  await done({ key: 'history', state: payroll.length ? 'DONE' : 'EMPTY', files: payroll.length, headline: `${payroll.length} months recalculated, ${histIssues.length} differences`, headline_ar: `أُعيد احتساب ${payroll.length} أشهر، ${histIssues.length} فروقات`, issues: histIssues.length,
    stats: [{ label: 'Months', value: payroll.length, tone: 'ok' }, { label: 'Differences', value: histIssues.length, tone: histIssues.length ? 'bad' : 'ok' }, { label: 'People concerned', value: new Set(diffs.map((d) => d.no)).size },
      { label: 'Net paid in the six months', value: sar(months.reduce((s, m) => s + m.net, 0)) }, { label: 'Net difference', value: sar(Math.abs(diffs.reduce((s, d) => s + d.difference, 0))), tone: diffs.length ? 'warn' : 'ok' }] });

  /* ----- Leave and provisions ----- */
  const leave = (leaveSheet?.rows ?? []).map((r) => ({ no: str(r['Employee No']), name: str(r['Employee Name']), entitlement: numv(r['Entitlement 2026']), carry: numv(r['Carried from 2025']), accrued: numv(r['Accrued to 30 Sep']), taken: numv(r['Taken 2026']), balance: numv(r['Balance']) }));
  const leaveOf = (x: Person) => leave.find((l) => l.no === x.masterNo && l.name === x.name) ?? leave.find((l) => l.name === x.name);
  for (const l of leave.filter((l) => l.balance < 0)) { const x = roster.find((y) => y.name === l.name); raise({ code: 'LEAVE_NEGATIVE', lane: 'leave', who: 'TASAMA', people: [{ no: x?.no ?? l.no, name: l.name }], title: `${l.name}'s leave balance is ${l.balance} days`, settle: 'Taken on as it stands; the days are recovered from future leave unless the client agrees otherwise.', title_ar: `رصيد إجازات ${x?.name_ar || l.name} ${l.balance} يومًا`, settle_ar: 'يُنقل كما هو، وتُسترد الأيام من الإجازات القادمة ما لم يتفق العميل على غير ذلك.' }); }
  const provRows = provSheet?.rows ?? [];
  const lastMonth = payroll[payroll.length - 1]?.month;
  let engineEos = 0, engineLeave = 0, over5 = 0;
  let provRowsOut: { no: string; eos_wage: number; eos_accrued: number; eos_month: number; leave_days: number; leave_accrued: number; leave_month: number; eos_rule: string; leave_rule: string }[] = [];
  if (terms27 && lastMonth) {
    const run = runPayroll({ start: `${lastMonth}-01`, end: monthEnd(lastMonth) }, terms27, roster.filter((x) => x.hire <= monthEnd(lastMonth)).map((x) => {
      const l = leaveOf(x);
      return { ref: x.no, isSaudi: x.isSaudi, hire: x.hire, elements: { basic: x.basic, housing: x.housing, transport: x.transport }, leave: { entitlementDays: l?.entitlement ?? x.leaveEntitlement, carryoverDays: l?.carry ?? 0, usedDaysYtd: l?.taken ?? 0 } };
    }));
    engineEos = r2(run.totals.eosAccrued); engineLeave = r2(run.totals.leaveAccrued);
    provRowsOut = run.employees.map((e) => ({ no: e.ref, eos_wage: r2(e.provisions.eos.wage), eos_accrued: r2(e.provisions.eos.accrued), eos_month: r2(e.provisions.eos.month), leave_days: Math.round(e.provisions.leave.balanceDays * 1000) / 1000, leave_accrued: r2(e.provisions.leave.accrued), leave_month: r2(e.provisions.leave.monthCost), eos_rule: e.provisions.eos.rule, leave_rule: e.provisions.leave.rule }));
    over5 = run.employees.filter((e) => e.provisions.eos.serviceDays / 365 > 5).length;
  }
  const sheetEos = r2(provRows.reduce((s, r) => s + numv(r['EOS Provision']), 0)), sheetLeave = r2(provRows.reduce((s, r) => s + numv(r['Leave Provision']), 0));
  const neg = leave.filter((l) => l.balance < 0).length;
  await done({ key: 'leave', state: leaveSheet || provSheet ? 'DONE' : 'EMPTY', files: (leaveSheet ? 1 : 0) + (provSheet ? 1 : 0), headline: `${leave.length} balances loaded, ${neg} negative; end-of-service provision ${sar(Math.abs(engineEos - sheetEos))} ${engineEos >= sheetEos ? 'above' : 'below'} the sheet`, headline_ar: `حُمّل ${leave.length} رصيدًا، ${neg} بالسالب؛ مخصص نهاية الخدمة ${sarAr(Math.abs(engineEos - sheetEos))} ${engineEos >= sheetEos ? 'أعلى من' : 'أقل من'} الجدول`, issues: neg,
    stats: [{ label: 'Balances', value: leave.length, tone: 'ok' }, { label: 'Negative', value: neg, tone: neg ? 'bad' : 'ok' }, { label: 'End of service, sheet', value: sar(sheetEos) }, { label: 'End of service, platform', value: sar(engineEos) },
      ...(Math.abs(sheetLeave - engineLeave) >= 1 ? [{ label: 'Leave, sheet', value: sar(sheetLeave) }, { label: 'Leave, platform', value: sar(engineLeave) }] : []), { label: 'Over five years of service', value: over5 }] });

  const staged = {
    client, columnMap: map, policy: hb && terms && read ? { title: hb.title, version: hb.version, effective: hb.effective, params: p, pay, rules: read.rules, differs: read.differs, fromTemplate: terms.fromTemplate, policies: hb.policies } : null,
    config: cfg,
    roster, leavers,
    contracts: [...contractOf].map(([x, c]) => ({ no: x.no, file: c.file, number: cNo(c), basic: money(c.f['Basic salary']), grade: c.f['Grade'], position: c.f['Position'], type: c.f['Contract type'], start: isoDate(c.f['Start date']), end: isoDate(c.f['End date']) })),
    letters: letters.map((l) => ({ ...l, no: personByNo(l.no)?.no ?? l.no })),
    history: { months, differences: diffs, rows: paidRows, total: r2(diffs.reduce((s, d) => s + d.difference, 0)) },
    leave, provisions: { month: lastMonth, sheetEos, engineEos, sheetLeave, engineLeave, over5, rows: provRowsOut },
  };
  return { lanes, issues, staged };
}
