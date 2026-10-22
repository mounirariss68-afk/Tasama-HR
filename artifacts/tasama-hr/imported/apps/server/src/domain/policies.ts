/**
 * The HR policy handbooks that the agents cite, one per Tasama client.
 *
 * FICTIONAL AND ILLUSTRATIVE. Written for the demo from the Saudi Labor Law
 * (Royal Decree M/51, as amended in 2025), GOSI, Mudad, Qiwa and PDPL rules
 * and common Saudi practice. Where a clause restates the law or a regulation
 * it names it in `legal`; where it is company practice (advances, letters,
 * approval limits, benefits) it has no `legal`. Every number that differs
 * between clients comes from the client's PolicyParams in clients.ts. None of
 * this is the real policy of ROSHN, Riyadh Air, Red Sea Global, SEVEN or
 * Saudi Coffee Company, and it must not be used as such.
 */
import type { ClientConfig } from './clients.js';
import { payrollClauses } from './payroll-policy.js';

export type Clause = { ref: string; heading: string; heading_ar: string; en: string; ar: string; legal?: string; tags: string[] };
export type Policy = { id: string; title: string; title_ar: string; version: string; effective: string; owner: string; summary: string; clauses: Clause[] };

const CHRO = 'Chief Human Resources Officer';
const OPS = 'HR Operations';
const TA = 'Talent Acquisition Lead';
const PAY = 'Payroll and HR Operations Lead';
const CHRO_AR = 'الرئيس التنفيذي للموارد البشرية';

const fmt = (n: number) => n.toLocaleString('en-US');
const money = (n: number) => `SAR ${fmt(n)}`;
const moneyAr = (n: number) => `${fmt(n)} ريال`;

/** Arabic counted nouns: 1, 2, 3–10 (plural), 11+ (singular accusative). */
const countAr = (n: number, one: string, two: string, plural: string, single: string) =>
  n === 1 ? one : n === 2 ? two : n >= 3 && n <= 10 ? `${n} ${plural}` : `${n} ${single}`;
const daysAr = (n: number) => countAr(n, 'يوم واحد', 'يومان', 'أيام', 'يوماً');
const monthsAr = (n: number) => countAr(n, 'شهر واحد', 'شهران', 'أشهر', 'شهراً');
const hoursAr = (n: number) => countAr(n, 'ساعة واحدة', 'ساعتان', 'ساعات', 'ساعة');

const multEn = (m: number) => (m === 0.5 ? "half a month's" : m === 1 ? "one month's" : m === 2 ? "two months'" : `${m} months'`);
const multAr = (m: number) => (m === 0.5 ? 'نصف شهر' : m === 1 ? 'شهراً واحداً' : m === 2 ? 'شهرين' : `${m} أشهر`);

/** Per-client issue dates and version offsets, so handbooks do not all look identical. */
const ISSUE: Record<string, { y1: string; y2: string; bump: number }> = {
  roshn: { y1: '2025-01-01', y2: '2026-01-01', bump: 1 },
  riyadhair: { y1: '2025-03-01', y2: '2026-02-01', bump: 0 },
  redsea: { y1: '2025-04-01', y2: '2026-01-01', bump: 2 },
  seven: { y1: '2025-07-01', y2: '2026-04-01', bump: 1 },
  saudicoffee: { y1: '2025-09-01', y2: '2026-06-01', bump: 0 },
};

/** The client's handbook. `revised`: the version uploaded in scenario D1 (see payroll-policy.ts). */
export function policiesFor(c: ClientConfig, revised = false): Policy[] {
  return withPayrollTerms(c, baseHandbook(c), revised);
}

/** The payroll terms (payroll-policy.ts) replace or join the clauses with the same reference. */
function withPayrollTerms(c: ClientConfig, policies: Policy[], revised: boolean): Policy[] {
  const pay = payrollClauses(c, revised);
  const home: Record<string, string> = { '5.5': 'HR-05', '6.2': 'HR-06', '6.8': 'HR-06' };
  const order = (a: Clause, b: Clause) => { const [x1, y1] = a.ref.split('.').map(Number), [x2, y2] = b.ref.split('.').map(Number); return x1 - x2 || y1 - y2; };
  return policies.map((p) => {
    const clauses = p.clauses.map((k) => pay[k.ref] ?? k);
    for (const [ref, id] of Object.entries(home)) if (id === p.id && !clauses.some((k) => k.ref === ref)) clauses.push(pay[ref]);
    return { ...p, clauses: clauses.sort(order) };
  });
}

function baseHandbook(c: ClientConfig): Policy[] {
  const p = c.policy;
  const S = c.short;
  const A = c.name_ar;
  const iss = ISSUE[c.key] ?? { y1: '2025-01-01', y2: '2026-01-01', bump: 0 };
  const ver = (major: number, minor: number) => `${major}.${(minor + iss.bump) % 6}`;
  const reqPct = Math.round(c.nitaqat.requiredPct * 100);
  const remote = p.remoteDays > 0;
  const basisEn = p.advanceBasis === 'basic' ? 'basic salary' : 'gross salary (basic plus allowances)';
  const basisAr = p.advanceBasis === 'basic' ? 'الراتب الأساسي' : 'الراتب الإجمالي (الأساسي مع البدلات)';

  /* ---------- company-specific clauses ---------- */

  const ticketClause: Clause =
    p.ticket === 'annual'
      ? { ref: '4.4', heading: 'Annual leave air ticket', heading_ar: 'تذكرة السفر السنوية',
          en: `${S} provides expatriate employees with one economy return air ticket to their home country every year, for the employee, spouse and up to two children under 18. The ticket is booked through HR Operations or paid as a cash allowance at the published route rate. Saudi employees receive no ticket.`,
          ar: `توفر ${A} للموظف الوافد تذكرة سفر ذهاباً وإياباً على الدرجة السياحية إلى بلده كل سنة، له ولزوجه ولطفلين دون 18 سنة كحد أقصى. وتُحجز التذكرة عبر عمليات الموارد البشرية أو تُصرف بدلاً نقدياً وفق السعر المعتمد للمسار. ولا تشمل هذه الميزة الموظفين السعوديين.`,
          tags: ['ticket', 'air ticket', 'flight', 'annual ticket', 'home country', 'expatriate', 'family', 'travel', 'vacation'] }
      : p.ticket === 'biennial'
      ? { ref: '4.4', heading: 'Air ticket every two years', heading_ar: 'تذكرة السفر كل سنتين',
          en: `${S} provides expatriate employees with one economy return air ticket to their home country after every two years of service, for the employee only. It may be taken as a cash allowance at the published route rate. Saudi employees receive no ticket.`,
          ar: `توفر ${A} للموظف الوافد تذكرة سفر ذهاباً وإياباً على الدرجة السياحية إلى بلده بعد كل سنتين من الخدمة، للموظف وحده. ويجوز صرفها بدلاً نقدياً وفق السعر المعتمد للمسار. ولا تشمل هذه الميزة الموظفين السعوديين.`,
          tags: ['ticket', 'air ticket', 'flight', 'biennial', 'two years', 'home country', 'expatriate', 'travel', 'vacation'] }
      : p.ticket === 'staff-travel'
      ? { ref: '4.4', heading: 'Staff travel and leave tickets', heading_ar: 'سفر الموظفين وتذاكر الإجازة',
          en: `${S} employees, their spouse, children under 24 and parents may use staff travel on the ${S} network: standby tickets for taxes only, after probation. Expatriate employees also receive one confirmed economy return ticket a year to their home country for themselves, spouse and up to three children. Staff travel is a privilege, not part of wage, and may be withdrawn for misuse.`,
          ar: `يحق لموظفي ${A} وأزواجهم وأبنائهم دون 24 سنة ووالديهم الاستفادة من سفر الموظفين على شبكة ${A} بتذاكر انتظار مقابل الضرائب فقط بعد انتهاء فترة التجربة. كما يحصل الموظف الوافد على تذكرة مؤكدة سنوياً ذهاباً وإياباً على الدرجة السياحية إلى بلده له ولزوجه ولثلاثة أبناء كحد أقصى. وسفر الموظفين ميزة وليس جزءاً من الأجر، ويجوز سحبها عند إساءة الاستخدام.`,
          tags: ['ticket', 'staff travel', 'standby', 'flight', 'free flights', 'family', 'parents', 'air ticket', 'home country', 'expatriate', 'travel', 'vacation'] }
      : { ref: '4.4', heading: 'Air tickets', heading_ar: 'تذاكر السفر',
          en: `${S} does not provide annual air tickets or a ticket allowance. Business travel is covered by the travel policy.`,
          ar: `لا توفر ${A} تذاكر سفر سنوية أو بدل تذاكر. ويغطي سفرَ العمل نظامُ السفر المعتمد.`,
          tags: ['ticket', 'air ticket', 'flight', 'travel', 'ticket allowance', 'home country', 'expatriate'] };

  const educationClause: Clause =
    p.educationAllowance > 0
      ? { ref: '6.5', heading: 'Education allowance', heading_ar: 'بدل التعليم',
          en: `${S} pays expatriate employees at grade G08 and above an education allowance of up to ${money(p.educationAllowance)} per child per school year, for up to ${p.educationChildren} children aged 4 to 18 at a licensed school in Saudi Arabia. It is paid against the school invoice, is not part of wage and is not counted for end of service or GOSI.`,
          ar: `تدفع ${A} للموظف الوافد في الدرجة G08 فما فوق بدل تعليم يصل إلى ${moneyAr(p.educationAllowance)} عن كل طفل في العام الدراسي، لعدد أقصاه ${p.educationChildren === 2 ? 'طفلان' : `${p.educationChildren} أطفال`} تتراوح أعمارهم بين 4 و18 سنة في مدرسة مرخصة في المملكة. ويُصرف مقابل فاتورة المدرسة، ولا يُعد جزءاً من الأجر، ولا يدخل في حساب مكافأة نهاية الخدمة أو اشتراكات التأمينات.`,
          tags: ['education', 'education allowance', 'school', 'school fees', 'children', 'tuition', 'kids', 'expatriate', 'allowance'] }
      : { ref: '6.5', heading: 'Education allowance', heading_ar: 'بدل التعليم',
          en: `${S} does not pay an education allowance or school fees. Employees may request a salary advance under HR-07 for school fees.`,
          ar: `لا تدفع ${A} بدل تعليم أو رسوماً دراسية. ويجوز للموظف طلب سلفة على الراتب وفق السياسة HR-07 لسداد الرسوم الدراسية.`,
          tags: ['education', 'education allowance', 'school', 'school fees', 'children', 'tuition', 'allowance'] };

  const medicalClause: Clause = {
    ref: '6.6', heading: 'Medical insurance', heading_ar: 'التأمين الطبي', legal: 'Cooperative Health Insurance Law; Council of Health Insurance (CCHI) rules',
    en: `${S} provides cooperative health insurance at class ${p.medicalClass} for every employee, spouse and children under 25 (unmarried daughters at any age), from the first day of employment. Cover follows the Council of Health Insurance essential benefits as a minimum. Cards are issued through HR Operations; claims and approvals go through the insurer's app.`,
    ar: `توفر ${A} تأميناً صحياً تعاونياً من الفئة ${p.medicalClass} لكل موظف ولزوجه وأبنائه دون 25 سنة (والبنات غير المتزوجات دون حد للعمر) من أول يوم عمل. وتمثل منافع وثيقة مجلس الضمان الصحي الأساسية الحد الأدنى للتغطية. وتُصدر البطاقات عبر عمليات الموارد البشرية، وتتم المطالبات والموافقات عبر تطبيق شركة التأمين.`,
    tags: ['medical', 'insurance', 'health insurance', 'cchi', 'class', `class ${p.medicalClass.toLowerCase()}`, 'family', 'dependants', 'doctor', 'hospital', 'card'],
  };

  const bonusClause: Clause = {
    ref: '6.7', heading: 'Annual bonus', heading_ar: 'المكافأة السنوية',
    en: `The target annual bonus at ${S} is ${p.bonusTargetPct}% of annual basic salary for a rating of 3, from 0% at rating 1 to twice target at rating 5, subject to company results. It is paid in March to employees in service on the payment date with at least three months of service in the performance year.`,
    ar: `تبلغ المكافأة السنوية المستهدفة في ${A} ${p.bonusTargetPct}% من الراتب الأساسي السنوي عند التقييم 3، وتتراوح من 0% عند التقييم 1 إلى ضعف النسبة المستهدفة عند التقييم 5، بحسب نتائج الشركة. وتُصرف في مارس للموظفين على رأس العمل في تاريخ الصرف ممن أمضوا ثلاثة أشهر على الأقل في سنة الأداء.`,
    tags: ['bonus', 'incentive', 'variable pay', 'annual bonus', 'rating', 'target'],
  };

  const siteClause: Clause | null =
    c.key === 'redsea'
      ? { ref: '5.7', heading: 'Site rotation and accommodation', heading_ar: 'المناوبة في المواقع والسكن',
          en: `Employees based at ${S} destination sites on the Red Sea coast work a rotation agreed in writing, within 48 hours a week on average. ${S} provides furnished site accommodation, meals and transport between site and Al Wajh or Red Sea International airport. Employees given site accommodation receive the housing allowance in cash only for the months they are not housed.`,
          ar: `يعمل الموظفون في مواقع وجهات ${A} على ساحل البحر الأحمر وفق نظام مناوبة متفق عليه كتابياً، بمتوسط لا يتجاوز 48 ساعة أسبوعياً. وتوفر ${A} سكناً مؤثثاً في الموقع والوجبات والنقل بين الموقع ومطار الوجه أو مطار البحر الأحمر الدولي. ولا يُصرف بدل السكن نقداً لمن يُوفر له سكن في الموقع إلا عن الأشهر التي لا يُسكن فيها.`,
          tags: ['site', 'rotation', 'accommodation', 'housing', 'camp', 'transport', 'remote location', 'shift', 'meals'] }
      : c.key === 'riyadhair'
      ? { ref: '5.7', heading: 'Rostered and operational roles', heading_ar: 'الوظائف التشغيلية وفق الجداول',
          en: `Flight crew, engineering and operations control staff at ${S} work published rosters. Flight and duty time limits follow GACA regulations; within the Labor Law limits, average hours are measured over the roster period. Roster changes are published at least 7 days ahead except in disruption.`,
          ar: `يعمل طاقم الطيران وموظفو الهندسة ومراقبة العمليات في ${A} وفق جداول منشورة. وتتبع حدود ساعات الطيران والخدمة أنظمة الهيئة العامة للطيران المدني، ويُحتسب متوسط الساعات على مدى فترة الجدول ضمن حدود نظام العمل. وتُنشر تغييرات الجداول قبل 7 أيام على الأقل إلا في حالات الاضطراب التشغيلي.`,
          tags: ['roster', 'crew', 'shift', 'gaca', 'flight time', 'duty time', 'operations', 'schedule'] }
      : c.key === 'seven'
      ? { ref: '5.7', heading: 'Venue and event shifts', heading_ar: 'مناوبات المرافق والفعاليات',
          en: `Venue, guest services and box office staff at ${S} work shifts that may include evenings, weekends and public holidays. Each employee has at least one full rest day a week. Work on the weekly rest day or a public holiday is paid as overtime under §5.3 or given as a substitute day off by agreement.`,
          ar: `يعمل موظفو المرافق وخدمات الزوار وشباك التذاكر في ${A} بنظام مناوبات قد تشمل المساء وعطلات نهاية الأسبوع والعطلات الرسمية. ولكل موظف يوم راحة كامل واحد على الأقل أسبوعياً. ويُدفع العمل في يوم الراحة الأسبوعية أو العطلة الرسمية عملاً إضافياً وفق البند 5.3 أو يُمنح عنه يوم بديل بالاتفاق.`,
          tags: ['shift', 'venue', 'event', 'weekend', 'evening', 'rest day', 'holiday work', 'schedule'] }
      : c.key === 'saudicoffee'
      ? { ref: '5.7', heading: 'Harvest season and farm sites', heading_ar: 'موسم الحصاد ومواقع المزارع',
          en: `During the coffee harvest in the Jazan highlands, production and farmer-programme staff may work six days a week within 48 hours. ${S} provides transport to farm sites and a daily field allowance set by the Head of Supply Chain. Hours above 48 are overtime under §5.3.`,
          ar: `خلال موسم حصاد البن في مرتفعات جازان، يجوز أن يعمل موظفو الإنتاج وبرامج المزارعين ستة أيام أسبوعياً في حدود 48 ساعة. وتوفر ${A} النقل إلى مواقع المزارع وبدلاً ميدانياً يومياً يحدده رئيس سلسلة الإمداد. وما يزيد على 48 ساعة يُعد عملاً إضافياً وفق البند 5.3.`,
          tags: ['harvest', 'farm', 'field', 'jazan', 'site', 'field allowance', 'transport', 'season', 'schedule'] }
      : c.key === 'roshn'
      ? { ref: '5.7', heading: 'Construction sites and midday break', heading_ar: 'مواقع الإنشاء والاستراحة وقت الظهيرة', legal: 'MHRSD ministerial decision on midday outdoor work',
          en: `Employees working on ${S} community construction sites follow the site safety induction. From 15 June to 15 September no one works in direct sun between 12:00 and 15:00. Site staff receive transport from their community or a transport allowance under §6.1.`,
          ar: `يلتزم الموظفون العاملون في مواقع إنشاء مجتمعات ${A} بالتهيئة الخاصة بسلامة الموقع. ومن 15 يونيو إلى 15 سبتمبر لا يُكلف أحد بالعمل تحت أشعة الشمس المباشرة بين الساعة 12:00 و15:00. ويحصل موظفو المواقع على نقل من مجتمعهم أو بدل نقل وفق البند 6.1.`,
          tags: ['site', 'construction', 'safety', 'heat', 'summer', 'midday', 'outdoor', 'transport'] }
      : null;

  return [
    /* ------------------------------------------------------------ HR-01 */
    {
      id: 'HR-01', title: 'Code of Conduct and Equal Opportunity', title_ar: 'مدونة السلوك وتكافؤ الفرص', version: ver(2, 1), effective: iss.y1, owner: CHRO,
      summary: `${S} conduct standards, non-discrimination, equal pay and how concerns are raised.`,
      clauses: [
        { ref: '1.2', heading: 'Non-discrimination', heading_ar: 'عدم التمييز', legal: 'Labor Law Art. 3',
          en: `${S} treats all employees equally. It does not discriminate on the basis of sex, disability, age or any other form of discrimination in recruitment, pay, training, promotion or termination. Selection criteria must relate to the job.`,
          ar: `تعامل ${A} جميع الموظفين على قدم المساواة، ولا تميز على أساس الجنس أو الإعاقة أو السن أو أي شكل آخر من أشكال التمييز في التوظيف أو الأجر أو التدريب أو الترقية أو إنهاء الخدمة. ويجب أن ترتبط معايير الاختيار بالوظيفة.`,
          tags: ['discrimination', 'equal treatment', 'equal opportunity', 'fairness', 'age', 'gender', 'disability', 'recruitment'] },
        { ref: '1.4', heading: 'Equal pay', heading_ar: 'المساواة في الأجر', legal: 'Labor Law Art. 3',
          en: 'Women and men receive equal pay for work of equal value. Pay decisions are reviewed for gaps by gender and nationality during each compensation cycle.',
          ar: 'تتقاضى المرأة والرجل أجراً متساوياً عن العمل ذي القيمة المتساوية. وتُراجع قرارات الأجور في كل دورة تعويضات للتحقق من الفجوات بحسب الجنس والجنسية.',
          tags: ['equal pay', 'pay', 'salary', 'gender', 'pay gap', 'fairness'] },
        { ref: '1.6', heading: 'Raising a concern', heading_ar: 'رفع شكوى أو ملاحظة',
          en: 'An employee may raise a grievance with their line manager, their HR Business Partner, or confidentially through the HR case channel. Retaliation against anyone raising a concern in good faith is a disciplinary offence. An employee may also complain to the Ministry of Human Resources and Social Development.',
          ar: 'يجوز للموظف رفع تظلم إلى مديره المباشر أو شريك أعمال الموارد البشرية أو بشكل سري عبر قناة الحالات في الموارد البشرية. ويُعد الانتقام من أي شخص يرفع ملاحظة بحسن نية مخالفة تأديبية. كما يحق للموظف التقدم بشكوى إلى وزارة الموارد البشرية والتنمية الاجتماعية.',
          tags: ['grievance', 'complaint', 'concern', 'retaliation', 'whistleblowing', 'harassment', 'mhrsd'] },
      ],
    },
    /* ------------------------------------------------------------ HR-02 */
    {
      id: 'HR-02', title: 'Workforce Planning and Recruitment', title_ar: 'تخطيط القوى العاملة والتوظيف', version: ver(2, 3), effective: iss.y2, owner: TA,
      summary: `Position approval, Saudization priority under Nitaqat, selection and offers at ${S}.`,
      clauses: [
        { ref: '2.1', heading: 'Position approval', heading_ar: 'اعتماد الوظائف',
          en: `A new position at ${S} requires an approved budget line. The HR Business Partner and Finance approve every new position; the Chief Human Resources Officer also approves positions at grade G11 and above and any unbudgeted position.`,
          ar: `يتطلب استحداث وظيفة جديدة في ${A} بنداً معتمداً في الميزانية. ويعتمد شريك أعمال الموارد البشرية والمالية كل وظيفة جديدة، كما يعتمد ${CHRO_AR} الوظائف من الدرجة G11 فما فوق وأي وظيفة غير مدرجة في الميزانية.`,
          tags: ['position', 'headcount', 'budget', 'approval', 'requisition', 'new role', 'vacancy'] },
        { ref: '2.3', heading: 'Saudization priority', heading_ar: 'أولوية التوطين', legal: 'Nitaqat Saudization programme (MHRSD)',
          en: `${S} is classified under Nitaqat activity "${c.nitaqat.activity}" and must keep at least ${reqPct}% Saudi nationals to stay in its ${c.nitaqat.band} band. Every requisition is posted on the Jadarat national job portal as well as ${S} channels. Qualified Saudi candidates who meet all must-have criteria are shortlisted.`,
          ar: `تُصنف ${A} في نطاقات ضمن نشاط "${c.nitaqat.activity}"، ويجب ألا تقل نسبة السعوديين فيها عن ${reqPct}% للبقاء في نطاق ${c.nitaqat.band}. ويُنشر كل طلب توظيف على منصة جدارات الوطنية للتوظيف إلى جانب قنوات الشركة. ويُدرج في القائمة المختصرة كل مرشح سعودي مؤهل يستوفي جميع المعايير الأساسية.`,
          tags: ['saudization', 'nitaqat', 'jadarat', 'saudi national', 'localisation', 'shortlist', 'band', 'quota'] },
        { ref: '2.5', heading: 'Selection decisions', heading_ar: 'قرارات الاختيار',
          en: 'Shortlisting, interview outcomes and selection are decided by the recruiter, the hiring manager and the panel. AI tools may summarise evidence against the stated criteria but may not reject, rank or score a candidate.',
          ar: 'يتخذ مسؤول التوظيف والمدير المعني ولجنة المقابلة قرارات القائمة المختصرة ونتائج المقابلات والاختيار. ويجوز لأدوات الذكاء الاصطناعي تلخيص الأدلة مقابل المعايير المعلنة، لكن لا يجوز لها رفض مرشح أو ترتيبه أو تقييمه بالدرجات.',
          tags: ['ai', 'screening', 'shortlist', 'selection', 'automated', 'rank', 'score', 'interview', 'candidate'] },
        { ref: '2.7', heading: 'Offers', heading_ar: 'عروض العمل',
          en: 'Offers are made within the grade range. The HR Business Partner approves basic salary up to the grade midpoint; above the midpoint, or above the range, the Chief Human Resources Officer approves.',
          ar: `تُقدم العروض ضمن نطاق الدرجة. ويعتمد شريك أعمال الموارد البشرية الراتب الأساسي حتى منتصف الدرجة، وما يزيد على المنتصف أو على النطاق يعتمده ${CHRO_AR}.`,
          tags: ['offer', 'salary', 'midpoint', 'grade', 'approval', 'job offer', 'hiring'] },
      ],
    },
    /* ------------------------------------------------------------ HR-03 */
    {
      id: 'HR-03', title: 'Onboarding and Probation', title_ar: 'التهيئة وفترة التجربة', version: ver(2, 0), effective: iss.y1, owner: OPS,
      summary: `Pre-boarding, Qiwa and GOSI registration, immigration steps and the ${p.probationDays}-day probation at ${S}.`,
      clauses: [
        { ref: '3.1', heading: 'Pre-boarding', heading_ar: 'ما قبل الالتحاق',
          en: `Before day one HR Operations issues the employment contract on Qiwa for the employee to accept, and registers the employee with GOSI from the start date. For expatriate joiners HR Operations also arranges the work visa, the medical examination, Muqeem registration and iqama issuance on arrival, and CCHI medical insurance at class ${p.medicalClass}.`,
          ar: `قبل اليوم الأول تُصدر عمليات الموارد البشرية عقد العمل عبر منصة قوى ليقبله الموظف، وتسجله في المؤسسة العامة للتأمينات الاجتماعية من تاريخ المباشرة. وبالنسبة للموظفين الوافدين تتولى أيضاً ترتيب تأشيرة العمل والفحص الطبي والتسجيل في مقيم وإصدار الإقامة عند الوصول، والتأمين الطبي وفق مجلس الضمان الصحي من الفئة ${p.medicalClass}.`,
          tags: ['onboarding', 'new joiner', 'qiwa', 'contract', 'gosi', 'visa', 'work visa', 'iqama', 'muqeem', 'medical', 'insurance', 'cchi', 'first day'] },
        { ref: '3.4', heading: 'Probation period', heading_ar: 'فترة التجربة', legal: 'Labor Law Art. 53',
          en: p.probationDays > 90
            ? `Probation at ${S} is ${p.probationDays} days, as agreed in writing in the employment contract (the law allows up to 180 days by written agreement). Eid al-Fitr and Eid al-Adha holidays and sick leave are not counted. The line manager confirms or ends employment before the probation end date, with the HR Business Partner.`
            : `Probation at ${S} is ${p.probationDays} days. It may be extended by written agreement up to a total of 180 days. Eid al-Fitr and Eid al-Adha holidays and sick leave are not counted. The line manager confirms or ends employment before the probation end date, with the HR Business Partner.`,
          ar: p.probationDays > 90
            ? `مدة التجربة في ${A} ${p.probationDays} يوماً بحسب ما نص عليه عقد العمل كتابياً (ويجيز النظام أن تصل إلى 180 يوماً باتفاق مكتوب). ولا تُحتسب منها إجازتا عيد الفطر وعيد الأضحى والإجازة المرضية. ويؤكد المدير المباشر التعيين أو ينهيه قبل تاريخ انتهاء التجربة بالتنسيق مع شريك أعمال الموارد البشرية.`
            : `مدة التجربة في ${A} ${p.probationDays} يوماً، ويجوز تمديدها باتفاق مكتوب على ألا يتجاوز مجموعها 180 يوماً. ولا تُحتسب منها إجازتا عيد الفطر وعيد الأضحى والإجازة المرضية. ويؤكد المدير المباشر التعيين أو ينهيه قبل تاريخ انتهاء التجربة بالتنسيق مع شريك أعمال الموارد البشرية.`,
          tags: ['probation', 'probation period', 'confirmation', 'trial period', `${p.probationDays} days`, 'extension'] },
        { ref: '3.5', heading: 'Ending employment in probation', heading_ar: 'إنهاء الخدمة خلال التجربة', legal: 'Labor Law Art. 54',
          en: 'During probation either party may end the contract without notice, unless the contract gives one of them the right to notice. No end-of-service award or compensation is due. Salary to the last day and unused leave are paid in the final settlement.',
          ar: 'يجوز لأي من الطرفين خلال فترة التجربة إنهاء العقد دون إشعار، ما لم يتضمن العقد حقاً لأحدهما في الإشعار. ولا تُستحق مكافأة نهاية خدمة أو تعويض. ويُصرف الأجر حتى آخر يوم والإجازة غير المستخدمة ضمن التسوية النهائية.',
          tags: ['probation', 'termination', 'resignation', 'notice', 'end of service', 'leaving'] },
      ],
    },
    /* ------------------------------------------------------------ HR-04 */
    {
      id: 'HR-04', title: 'Leave', title_ar: 'الإجازات', version: ver(3, 2), effective: iss.y2, owner: OPS,
      summary: `Annual, sick, family, Hajj and unpaid leave at ${S}, and ${p.ticket === 'none' ? 'air tickets' : 'leave air tickets'}.`,
      clauses: [
        { ref: '4.1', heading: 'Annual leave entitlement', heading_ar: 'استحقاق الإجازة السنوية', legal: 'Labor Law Art. 109',
          en: `${S} employees earn ${p.annualLeave} working days of paid annual leave a year, rising to ${p.annualLeaveAfter5} working days after five years of continuous service. The statutory minimum is 21 days, and 30 days after five years. Leave accrues monthly and is requested at least 10 working days ahead except in emergencies.`,
          ar: `يستحق موظفو ${A} إجازة سنوية مدفوعة الأجر مدتها ${p.annualLeave} يوم عمل في السنة، ترتفع إلى ${p.annualLeaveAfter5} يوم عمل بعد خمس سنوات خدمة متصلة. والحد الأدنى النظامي 21 يوماً، و30 يوماً بعد خمس سنوات. وتُستحق الإجازة شهرياً وتُطلب قبل 10 أيام عمل على الأقل إلا في الحالات الطارئة.`,
          tags: ['annual leave', 'vacation', 'holiday', 'days', 'entitlement', 'balance', 'leave days', 'how many days', 'time off'] },
        { ref: '4.2', heading: 'Carry-forward', heading_ar: 'ترحيل الإجازات',
          en: p.carryForwardMax > 0
            ? `Up to ${p.carryForwardMax} days of unused annual leave may be carried into the next year with line-manager approval. Carried days must be used by 31 March. Days above the limit are not lost if the employee was unable to take them because of ${S}; HR Operations agrees a date with the employee.`
            : `Annual leave is taken within the year it is earned; ${S} does not carry leave forward as a practice. The employee's rights under Art. 109 are kept: leave may be deferred to the next year only by written agreement, and leave not taken is paid on leaving.`,
          ar: p.carryForwardMax > 0
            ? `يجوز ترحيل ما يصل إلى ${daysAr(p.carryForwardMax)} من الإجازة السنوية غير المستخدمة إلى السنة التالية بموافقة المدير المباشر، على أن تُستخدم الأيام المرحلة قبل 31 مارس. ولا تسقط الأيام الزائدة على الحد إذا تعذر على الموظف أخذها بسبب الشركة، وتتفق عمليات الموارد البشرية معه على موعد لها.`
            : `تُستخدم الإجازة السنوية في السنة التي تُستحق فيها، ولا تعتمد ${A} ترحيل الإجازات. مع حفظ حقوق الموظف وفق المادة 109: يجوز تأجيل الإجازة إلى السنة التالية باتفاق مكتوب فقط، ويُصرف بدل الإجازة غير المستخدمة عند انتهاء الخدمة.`,
          tags: ['carry forward', 'carry over', 'rollover', 'unused leave', 'annual leave', 'balance', 'expire'] },
        { ref: '4.3', heading: 'Approval and team cover', heading_ar: 'الموافقة وتغطية الفريق',
          en: 'The line manager approves leave. Requests that would leave a team below its minimum cover are referred back with alternative dates.',
          ar: 'يعتمد المدير المباشر الإجازة. وتُعاد الطلبات التي تؤدي إلى انخفاض تغطية الفريق عن الحد الأدنى مع اقتراح تواريخ بديلة.',
          tags: ['approval', 'leave request', 'cover', 'team', 'manager', 'leave'] },
        ticketClause,
        { ref: '4.5', heading: 'Sick leave', heading_ar: 'الإجازة المرضية', legal: 'Labor Law Art. 117',
          en: `An employee with a medical certificate (issued through Seha) is entitled in any one year to 30 days of sick leave on full pay, the next 60 days on 75% of wage, and the next 30 days unpaid. ${p.sickTopUpDays > 0 ? `${S} tops the 75% band up to full pay for the first ${p.sickTopUpDays} days of that band. ` : ''}Notify your manager on the first day of absence.`,
          ar: `يستحق الموظف الذي يقدم تقريراً طبياً (صادراً عبر منصة صحة) في السنة الواحدة إجازة مرضية مدتها 30 يوماً بأجر كامل، ثم 60 يوماً بثلاثة أرباع الأجر، ثم 30 يوماً بدون أجر. ${p.sickTopUpDays > 0 ? `وتكمل ${A} الأجر إلى أجر كامل خلال أول ${daysAr(p.sickTopUpDays)} من فترة ثلاثة أرباع الأجر. ` : ''}ويجب إبلاغ المدير في اليوم الأول من الغياب.`,
          tags: ['sick leave', 'sick', 'illness', 'medical', 'medical certificate', 'seha', 'sick note', 'doctor', '75%'] },
        { ref: '4.6', heading: 'Maternity and paternity leave', heading_ar: 'إجازة الوضع وإجازة الأبوة', legal: 'Labor Law Arts. 113, 151 (as amended 2025)',
          en: 'Maternity leave is 12 weeks on full pay, starting up to four weeks before the expected birth date, and may be extended by one month unpaid. A father receives 3 days of paid paternity leave on the birth of a child. A nursing mother receives one hour a day of nursing break for 24 months.',
          ar: 'إجازة الوضع 12 أسبوعاً بأجر كامل، تبدأ قبل الموعد المتوقع للولادة بأربعة أسابيع كحد أقصى، ويجوز تمديدها شهراً بدون أجر. ويحصل الأب على إجازة أبوة مدفوعة مدتها 3 أيام عند ولادة مولود له. وتحصل الأم المرضع على ساعة رضاعة يومياً لمدة 24 شهراً.',
          tags: ['maternity', 'paternity', 'baby', 'birth', 'pregnancy', 'newborn', 'parental leave', 'nursing'] },
        { ref: '4.7', heading: 'Bereavement, marriage and Hajj', heading_ar: 'إجازات الوفاة والزواج والحج', legal: 'Labor Law Arts. 113-114 (as amended 2025)',
          en: 'Paid leave is 5 days on the death of a spouse, parent or child, 3 days on the death of a brother or sister, and 5 days on the employee\'s marriage. Hajj leave is 10 to 15 days including Eid al-Adha, on full pay, once during service, for employees with at least two years of continuous service.',
          ar: 'الإجازة المدفوعة 5 أيام عند وفاة الزوج أو أحد الوالدين أو الأبناء، و3 أيام عند وفاة الأخ أو الأخت، و5 أيام عند زواج الموظف. وإجازة الحج من 10 إلى 15 يوماً تشمل إجازة عيد الأضحى، بأجر كامل، مرة واحدة طوال الخدمة، لمن أمضى سنتين على الأقل في الخدمة المتصلة.',
          tags: ['bereavement', 'death', 'funeral', 'compassionate', 'marriage', 'wedding', 'hajj', 'pilgrimage', 'special leave'] },
        { ref: '4.9', heading: 'Unpaid leave', heading_ar: 'الإجازة بدون راتب', legal: 'Labor Law Art. 116',
          en: 'Unpaid leave may be granted by agreement between the employee and the line manager with HR approval. Unpaid days are deducted in payroll at monthly wage divided by 30. Unpaid leave of more than 20 days suspends the contract for that period unless agreed otherwise.',
          ar: 'يجوز منح إجازة بدون راتب باتفاق بين الموظف والمدير المباشر وبموافقة الموارد البشرية. وتُخصم الأيام غير المدفوعة في الرواتب بقسمة الأجر الشهري على 30. وتؤدي الإجازة بدون راتب التي تزيد على 20 يوماً إلى وقف العقد خلال مدتها ما لم يُتفق على خلاف ذلك.',
          tags: ['unpaid leave', 'leave without pay', 'deduction', 'payroll', 'special leave'] },
      ],
    },
    /* ------------------------------------------------------------ HR-05 */
    {
      id: 'HR-05', title: 'Working Time', title_ar: 'أوقات العمل', version: ver(2, 1), effective: iss.y1, owner: OPS,
      summary: `Hours, Ramadan, overtime, public holidays and ${remote ? 'remote work' : 'site-based work'} at ${S}.`,
      clauses: [
        { ref: '5.1', heading: 'Working hours', heading_ar: 'ساعات العمل', legal: 'Labor Law Art. 98',
          en: `The working week at ${S} is ${p.weeklyHours} hours, Sunday to Thursday, with Friday and Saturday as rest days unless a roster says otherwise. No one is scheduled for more than 8 hours a day or 48 hours a week, excluding breaks.`,
          ar: `أسبوع العمل في ${A} ${p.weeklyHours} ساعة من الأحد إلى الخميس، والجمعة والسبت يوما راحة ما لم ينص جدول المناوبات على غير ذلك. ولا يُجدول أي موظف لأكثر من 8 ساعات يومياً أو 48 ساعة أسبوعياً، دون احتساب فترات الراحة.`,
          tags: ['hours', 'working hours', 'schedule', 'week', 'sunday', 'thursday', 'weekend', 'rest day', `${p.weeklyHours} hours`] },
        { ref: '5.2', heading: 'Ramadan', heading_ar: 'رمضان', legal: 'Labor Law Art. 98',
          en: 'During Ramadan working hours for Muslim employees are 6 hours a day, 36 hours a week.',
          ar: 'خلال شهر رمضان تكون ساعات العمل للموظفين المسلمين 6 ساعات يومياً و36 ساعة أسبوعياً.',
          tags: ['ramadan', 'hours', 'reduced hours', 'fasting'] },
        { ref: '5.3', heading: 'Overtime', heading_ar: 'العمل الإضافي', legal: 'Labor Law Art. 107',
          en: 'Overtime must be approved in advance by the line manager. Each overtime hour is paid at the hourly wage plus 50% of the basic hourly wage. Work on the weekly rest day or a public holiday is overtime.',
          ar: 'يجب أن يعتمد المدير المباشر العمل الإضافي مسبقاً. وتُدفع كل ساعة عمل إضافي بأجر الساعة مضافاً إليه 50% من أجر الساعة الأساسي. ويُعد العمل في يوم الراحة الأسبوعية أو العطلة الرسمية عملاً إضافياً.',
          tags: ['overtime', 'extra hours', 'holiday work', 'rest day', 'weekend work', '150%'] },
        { ref: '5.4', heading: 'Public holidays', heading_ar: 'العطلات الرسمية', legal: 'Labor Law Implementing Regulations',
          en: 'Paid public holidays are Founding Day (22 February), Eid al-Fitr (4 days), Eid al-Adha (4 days, starting on the Day of Arafah) and Saudi National Day (23 September). A holiday falling on a rest day is not replaced unless announced.',
          ar: 'العطلات الرسمية المدفوعة هي يوم التأسيس (22 فبراير) وعيد الفطر (4 أيام) وعيد الأضحى (4 أيام تبدأ من يوم عرفة) واليوم الوطني (23 سبتمبر). ولا تُعوض العطلة التي تصادف يوم راحة إلا إذا أُعلن ذلك.',
          tags: ['public holiday', 'holiday', 'eid', 'national day', 'founding day', 'day off'] },
        { ref: '5.6', heading: 'Remote and flexible work', heading_ar: 'العمل عن بعد والعمل المرن',
          en: remote
            ? `Eligible office-based roles at ${S} may work remotely up to ${p.remoteDays === 1 ? 'one day' : `${p.remoteDays} days`} a week with line-manager agreement. Customer-facing, site and operational roles are not eligible. Core hours are 10:00 to 14:00.`
            : `Roles at ${S} are site-based. Remote work is not offered; temporary exceptions for personal circumstances need the Chief Human Resources Officer.`,
          ar: remote
            ? `يجوز لشاغلي الوظائف المكتبية المؤهلة في ${A} العمل عن بعد ${p.remoteDays === 1 ? 'يوماً واحداً' : p.remoteDays === 2 ? 'يومين' : `${p.remoteDays} أيام`} كحد أقصى أسبوعياً بموافقة المدير المباشر. ولا تشمل الأهلية الوظائف التي تتعامل مع العملاء أو وظائف المواقع والعمليات. وساعات العمل الأساسية من 10:00 إلى 14:00.`
            : `الوظائف في ${A} تُؤدى في مواقع العمل، ولا يُتاح العمل عن بعد. وتتطلب الاستثناءات المؤقتة لظروف شخصية اعتماد ${CHRO_AR}.`,
          tags: ['remote', 'work from home', 'wfh', 'hybrid', 'flexible', 'flexible hours', 'site-based', 'office'] },
        ...(siteClause ? [siteClause] : []),
      ],
    },
    /* ------------------------------------------------------------ HR-06 */
    {
      id: 'HR-06', title: 'Grades, Pay, Benefits and Promotion', title_ar: 'الدرجات والأجور والمزايا والترقيات', version: ver(3, 0), effective: iss.y2, owner: CHRO,
      summary: `${S} pay structure and allowances, education and medical benefits, bonus and promotion.`,
      clauses: [
        { ref: '6.1', heading: 'Pay structure', heading_ar: 'هيكل الأجور',
          en: `Jobs at ${S} are graded G04 to G15. Monthly pay is basic salary plus a housing allowance of ${p.housingPct}% of basic and a transport allowance of ${p.transportPct}% of basic. End-of-service is calculated on the full wage; GOSI contributions on basic plus housing.`,
          ar: `تُصنف الوظائف في ${A} من الدرجة G04 إلى G15. ويتكون الأجر الشهري من الراتب الأساسي مضافاً إليه بدل سكن بنسبة ${p.housingPct}% من الأساسي وبدل نقل بنسبة ${p.transportPct}% من الأساسي. وتُحتسب مكافأة نهاية الخدمة على الأجر الكامل، واشتراكات التأمينات الاجتماعية على الأساسي مع بدل السكن.`,
          tags: ['salary', 'pay', 'basic', 'allowance', 'housing', 'housing allowance', 'transport', 'transport allowance', 'grade', 'package'] },
        { ref: '6.3', heading: 'Promotion eligibility', heading_ar: 'أهلية الترقية',
          en: 'An employee is eligible for promotion after 12 months in grade with a rating of 3 or above in the last review. A promotion is normally one grade; basic salary moves to at least the new grade minimum and by at least 8%.',
          ar: 'يكون الموظف مؤهلاً للترقية بعد 12 شهراً في الدرجة مع تقييم 3 أو أعلى في آخر مراجعة. وتكون الترقية عادة درجة واحدة، ويرتفع الراتب الأساسي إلى الحد الأدنى للدرجة الجديدة على الأقل وبنسبة لا تقل عن 8%.',
          tags: ['promotion', 'grade', 'eligibility', 'increase', 'raise', 'career'] },
        { ref: '6.4', heading: 'Promotion approval', heading_ar: 'اعتماد الترقية',
          en: 'The HR Business Partner approves one-grade promotions within the new grade range. Two-grade promotions, or salaries above the new grade midpoint, need the Chief Human Resources Officer.',
          ar: `يعتمد شريك أعمال الموارد البشرية الترقيات بدرجة واحدة ضمن نطاق الدرجة الجديدة. وتتطلب الترقية بدرجتين أو الراتب الذي يتجاوز منتصف الدرجة الجديدة اعتماد ${CHRO_AR}.`,
          tags: ['promotion', 'approval', 'midpoint'] },
        educationClause,
        medicalClause,
        bonusClause,
      ],
    },
    /* ------------------------------------------------------------ HR-07 */
    {
      id: 'HR-07', title: 'Salary Advances', title_ar: 'سلف الرواتب', version: ver(1, 2), effective: iss.y1, owner: PAY,
      summary: `${S} practice on salary advances: eligibility, amount, repayment and the legal deduction limits.`,
      clauses: [
        { ref: '7.1', heading: 'Eligibility', heading_ar: 'الأهلية',
          en: `Employees with at least ${p.advanceMinServiceMonths} months of service at ${S} who have completed probation may request a salary advance. Only one advance may be outstanding at a time.`,
          ar: `يحق للموظفين الذين أمضوا ${monthsAr(p.advanceMinServiceMonths)} على الأقل في خدمة ${A} وأتموا فترة التجربة طلب سلفة على الراتب. ولا يجوز أن تكون هناك أكثر من سلفة قائمة في الوقت نفسه.`,
          tags: ['advance', 'salary advance', 'loan', 'eligibility', 'service', 'borrow', 'money'] },
        { ref: '7.2', heading: 'Amount and repayment', heading_ar: 'المبلغ والسداد',
          en: `An advance is up to ${multEn(p.advanceMultiple)} ${basisEn}, repaid in equal monthly deductions over up to ${p.advanceMaxTerm} months. Advances are interest-free and carry no fees.`,
          ar: `تصل السلفة إلى ما يعادل ${multAr(p.advanceMultiple)} من ${basisAr}، وتُسدد على أقساط شهرية متساوية خلال مدة لا تتجاوز ${monthsAr(p.advanceMaxTerm)}. والسلف بدون فوائد أو رسوم.`,
          tags: ['advance', 'salary advance', 'loan', 'amount', 'how much', 'repayment', 'instalment', 'months', 'interest'] },
        { ref: '7.3', heading: 'Deduction limit', heading_ar: 'حد الخصم', legal: 'Labor Law Arts. 92-93',
          en: 'An advance instalment may not exceed 10% of the monthly wage; if the requested amount and term would breach this, the amount is reduced or the term lengthened within policy. All deductions together may not exceed 50% of the wage. Recovery is set up with the employee\'s written acknowledgement.',
          ar: 'لا يجوز أن يتجاوز قسط السلفة 10% من الأجر الشهري، وإذا أدى المبلغ والمدة المطلوبان إلى تجاوز ذلك يُخفض المبلغ أو تُمدد المدة ضمن حدود السياسة. ولا يجوز أن يتجاوز مجموع الخصومات 50% من الأجر. ويُفعّل الاسترداد بإقرار كتابي من الموظف.',
          tags: ['deduction', 'deduction limit', '10%', '50%', 'cap', 'consent', 'advance', 'instalment'] },
        { ref: '7.4', heading: 'Approval and exceptions', heading_ar: 'الاعتماد والاستثناءات',
          en: 'The line manager supports and HR Operations approves advances within policy. Anything above policy (amount, term or a second advance) goes to the Chief Human Resources Officer. Any balance outstanding on leaving is recovered from the final settlement.',
          ar: `يؤيد المدير المباشر وتعتمد عمليات الموارد البشرية السلف ضمن السياسة. وأي طلب يتجاوز السياسة (في المبلغ أو المدة أو سلفة ثانية) يُرفع إلى ${CHRO_AR}. ويُسترد أي رصيد متبقٍ عند انتهاء الخدمة من التسوية النهائية.`,
          tags: ['advance', 'approval', 'exception', 'second advance', 'settlement', 'chro'] },
      ],
    },
    /* ------------------------------------------------------------ HR-08 */
    {
      id: 'HR-08', title: 'HR Letters and Certificates', title_ar: 'الخطابات والشهادات', version: ver(2, 2), effective: iss.y1, owner: OPS,
      summary: `Which letters ${S} issues automatically, which need HR approval, and the service certificate.`,
      clauses: [
        { ref: '8.1', heading: 'Standard letters', heading_ar: 'الخطابات القياسية',
          en: `Salary letters, employment letters, NOC letters (for travel, visas or a driving licence) and embassy letters are issued from HRMS data on request within ${p.letterHours} working hours, signed digitally by HR Operations.`,
          ar: `تصدر خطابات الراتب وخطابات التعريف بالعمل وخطابات عدم الممانعة (للسفر أو التأشيرات أو رخصة القيادة) وخطابات السفارات من بيانات نظام الموارد البشرية عند الطلب خلال ${hoursAr(p.letterHours)} عمل، بتوقيع رقمي من عمليات الموارد البشرية.`,
          tags: ['letter', 'salary letter', 'salary certificate', 'employment letter', 'employment certificate', 'noc', 'no objection', 'embassy', 'visa', 'driving licence'] },
        { ref: '8.2', heading: 'Salary transfer letters', heading_ar: 'خطابات تحويل الراتب',
          en: `A salary transfer letter commits ${S} to pay salary and end-of-service benefits to one named bank, typically for a loan or credit card. It is issued only after HR Operations approval and only to one bank at a time.`,
          ar: `يُلزم خطاب تحويل الراتب ${A} بتحويل الراتب ومكافأة نهاية الخدمة إلى بنك محدد واحد، وعادة يُطلب للحصول على تمويل أو بطاقة ائتمانية. ولا يصدر إلا بعد اعتماد عمليات الموارد البشرية ولبنك واحد فقط في كل مرة.`,
          tags: ['salary transfer', 'bank', 'loan', 'finance', 'mortgage', 'credit card', 'letter', c.bank[0].toLowerCase()] },
        { ref: '8.3', heading: 'Experience letters and service certificate', heading_ar: 'شهادات الخبرة وشهادة الخدمة', legal: 'Labor Law Art. 64',
          en: 'At the end of service, on request, the employee receives a service certificate free of charge stating the start and end dates, last position and last wage. It may not contain anything that harms the employee\'s reputation or reduces their job prospects.',
          ar: 'يحصل الموظف عند انتهاء خدمته وبناءً على طلبه على شهادة خدمة دون مقابل، توضح تاريخ الالتحاق وتاريخ انتهاء الخدمة وآخر وظيفة وآخر أجر. ولا يجوز أن تتضمن ما يسيء إلى سمعة الموظف أو يقلل من فرص العمل أمامه.',
          tags: ['experience letter', 'service certificate', 'certificate', 'leaving', 'reference', 'end of service'] },
      ],
    },
    /* ------------------------------------------------------------ HR-09 */
    {
      id: 'HR-09', title: 'Performance Management', title_ar: 'إدارة الأداء', version: ver(2, 4), effective: iss.y1, owner: CHRO,
      summary: 'Performance year, ratings, calibration and improvement plans.',
      clauses: [
        { ref: '9.1', heading: 'Performance year', heading_ar: 'سنة الأداء',
          en: 'The performance year is the calendar year. Goals are agreed by 31 January, the mid-year review closes by 31 July and the year-end review closes by 31 January of the following year.',
          ar: 'سنة الأداء هي السنة الميلادية. وتُعتمد الأهداف قبل 31 يناير، وتُستكمل مراجعة منتصف العام قبل 31 يوليو، ومراجعة نهاية العام قبل 31 يناير من السنة التالية.',
          tags: ['performance', 'goals', 'review', 'mid-year', 'year-end', 'appraisal', 'cycle'] },
        { ref: '9.3', heading: 'Rating scale', heading_ar: 'مقياس التقييم',
          en: 'Ratings are 1 (does not meet) to 5 (exceptional). As a guide, no more than 15% of a division is rated 5 and about 60% sits at 3.',
          ar: 'يتراوح التقييم من 1 (لا يلبي التوقعات) إلى 5 (استثنائي). وكإرشاد، لا يزيد من يحصلون على 5 عن 15% من القطاع، ويقع نحو 60% عند 3.',
          tags: ['rating', 'scale', 'distribution', 'score', 'appraisal'] },
        { ref: '9.4', heading: 'Calibration', heading_ar: 'المعايرة',
          en: 'Ratings are calibrated by division before they are shared. The calibration panel, chaired by the HR Business Partner, may change a rating and records the reason.',
          ar: 'تُعاير التقييمات على مستوى القطاع قبل مشاركتها. ويجوز للجنة المعايرة برئاسة شريك أعمال الموارد البشرية تعديل التقييم مع تسجيل السبب.',
          tags: ['calibration', 'rating', 'panel', 'moderation'] },
        { ref: '9.6', heading: 'Performance improvement', heading_ar: 'تحسين الأداء',
          en: 'An employee rated 1, or with a documented performance concern, receives a documented performance improvement plan of at least 60 days with written objectives and regular reviews before any termination for performance.',
          ar: 'يحصل الموظف الذي يُقيّم بـ1 أو الذي لديه ملاحظة موثقة على أدائه على خطة موثقة لتحسين الأداء لا تقل عن 60 يوماً، بأهداف مكتوبة ومراجعات منتظمة، قبل أي إنهاء للخدمة بسبب الأداء.',
          tags: ['pip', 'improvement plan', 'underperformance', 'performance', 'termination', 'warning'] },
      ],
    },
    /* ------------------------------------------------------------ HR-10 */
    {
      id: 'HR-10', title: 'Payroll, Mudad and GOSI', title_ar: 'الرواتب ومدد والتأمينات الاجتماعية', version: ver(2, 5), effective: iss.y2, owner: PAY,
      summary: `${S} pay date and cut-off, Mudad wage protection, pre-run checks and GOSI contributions.`,
      clauses: [
        { ref: '10.1', heading: 'Pay date', heading_ar: 'موعد صرف الرواتب', legal: 'Labor Law Art. 90; Wage Protection Program (Mudad)',
          en: `Salaries are paid in SAR on day ${p.payDay} of each month through the Mudad wage protection system, to the employee's bank account. If day ${p.payDay} is not a working day, salaries are paid on the previous working day. Payroll inputs close on day ${p.cutoffDay}; changes after the cut-off are paid in the next month.`,
          ar: `تُصرف الرواتب بالريال السعودي في اليوم ${p.payDay} من كل شهر عبر منصة مدد لحماية الأجور إلى الحساب البنكي للموظف. وإذا لم يكن اليوم ${p.payDay} يوم عمل تُصرف في يوم العمل السابق. ويُقفل إدخال بيانات الرواتب في اليوم ${p.cutoffDay}، وتُصرف التغييرات التي ترد بعد الإقفال في الشهر التالي.`,
          tags: ['payday', 'pay date', 'salary', 'when paid', 'mudad', 'wps', 'wage protection', 'cut-off', 'payslip', 'bank'] },
        { ref: '10.2', heading: 'Pre-run checks', heading_ar: 'التحقق قبل التشغيل',
          en: 'Every payroll run is checked before release: variances against the previous month, joiners, leavers, promotions, unpaid leave, advances, deductions and GOSI. Every finding is fixed or explained before the run is released.',
          ar: 'يُتحقق من كل تشغيل للرواتب قبل اعتماده: الفروقات مقارنة بالشهر السابق، والموظفون الجدد والمغادرون، والترقيات، والإجازات بدون راتب، والسلف، والخصومات، والتأمينات الاجتماعية. ويُصحح كل ملاحظة أو يُفسر قبل اعتماد التشغيل.',
          tags: ['payroll', 'variance', 'check', 'release', 'audit', 'payroll run'] },
        { ref: '10.4', heading: 'GOSI contributions', heading_ar: 'اشتراكات التأمينات الاجتماعية', legal: 'Social Insurance Law (Royal Decree M/273, 2024) and GOSI rules',
          en: 'For Saudi employees registered before 3 July 2024, GOSI annuities and SANED contributions are 11.75% from the employer (9% annuities, 0.75% SANED, 2% occupational hazards) and 9.75% from the employee (9% annuities, 0.75% SANED). For Saudis first registered from 3 July 2024 the annuities rate rises in steps each July under the new system. For non-Saudi employees the employer pays 2% for occupational hazards. The contribution wage is basic plus housing, capped at SAR 45,000 a month.',
          ar: 'بالنسبة للموظفين السعوديين المسجلين قبل 3 يوليو 2024، تبلغ اشتراكات المعاشات وساند 11.75% على صاحب العمل (9% معاشات و0.75% ساند و2% أخطار مهنية) و9.75% على الموظف (9% معاشات و0.75% ساند). وبالنسبة للسعوديين المسجلين لأول مرة منذ 3 يوليو 2024 ترتفع نسبة المعاشات تدريجياً في يوليو من كل سنة وفق النظام الجديد. وبالنسبة لغير السعوديين يدفع صاحب العمل 2% للأخطار المهنية. ويتكون أجر الاشتراك من الأساسي وبدل السكن بحد أقصى 45,000 ريال شهرياً.',
          tags: ['gosi', 'social insurance', 'pension', 'saned', 'contribution', 'deduction', 'saudi national', 'occupational hazards', 'annuities'] },
      ],
    },
    /* ------------------------------------------------------------ HR-11 */
    {
      id: 'HR-11', title: 'End of Service', title_ar: 'نهاية الخدمة', version: ver(2, 0), effective: iss.y2, owner: PAY,
      summary: 'End-of-service award, resignation entitlement, GOSI and SANED, and final settlement deadlines.',
      clauses: [
        { ref: '11.1', heading: 'End-of-service award', heading_ar: 'مكافأة نهاية الخدمة', legal: 'Labor Law Art. 84',
          en: `When the contract ends, ${S} pays an end-of-service award of half a month's wage for each of the first five years of service and one month's wage for each year after that, pro rata for part years. It is calculated on the last wage: basic plus housing and transport allowances.`,
          ar: `عند انتهاء العقد تدفع ${A} مكافأة نهاية خدمة تعادل أجر نصف شهر عن كل سنة من السنوات الخمس الأولى، وأجر شهر عن كل سنة بعدها، مع الاحتساب النسبي لجزء السنة. وتُحتسب على أساس آخر أجر: الأساسي مع بدلي السكن والنقل.`,
          tags: ['end of service', 'eosb', 'gratuity', 'end-of-service award', 'settlement', 'leaving', 'years of service'] },
        { ref: '11.2', heading: 'Resignation entitlement', heading_ar: 'استحقاق المكافأة عند الاستقالة', legal: 'Labor Law Arts. 85, 87',
          en: 'An employee who resigns receives no award with less than two years of service, one third of the award for two to five years, two thirds for five to ten years, and the full award after ten years. The full award is paid if a woman resigns within six months of marriage or three months of giving birth, or the employee leaves for force majeure.',
          ar: 'لا يستحق الموظف المستقيل مكافأة إذا قلت خدمته عن سنتين، ويستحق ثلث المكافأة إذا كانت خدمته من سنتين إلى خمس سنوات، وثلثيها من خمس إلى عشر سنوات، والمكافأة كاملة بعد عشر سنوات. وتُستحق المكافأة كاملة إذا استقالت الموظفة خلال ستة أشهر من الزواج أو ثلاثة أشهر من الوضع، أو ترك الموظف العمل لقوة قاهرة.',
          tags: ['resignation', 'resign', 'end of service', 'gratuity', 'one third', 'two thirds', 'eosb'] },
        { ref: '11.3', heading: 'Saudi nationals: GOSI and SANED', heading_ar: 'الموظفون السعوديون: التأمينات وساند', legal: 'Social Insurance Law; SANED Unemployment Insurance Law',
          en: 'The end-of-service award is paid in addition to, and does not replace, GOSI pension rights. Eligible Saudi employees whose employment ends for reasons outside their control may claim SANED unemployment benefit through GOSI.',
          ar: 'تُصرف مكافأة نهاية الخدمة إضافة إلى حقوق المعاش لدى التأمينات الاجتماعية ولا تحل محلها. ويحق للموظفين السعوديين المؤهلين الذين تنتهي خدمتهم لأسباب خارجة عن إرادتهم التقدم بطلب تعويض ساند للتعطل عن العمل عبر التأمينات الاجتماعية.',
          tags: ['saudi national', 'gosi', 'pension', 'saned', 'unemployment', 'end of service'] },
        { ref: '11.5', heading: 'Final settlement', heading_ar: 'التسوية النهائية', legal: 'Labor Law Art. 88',
          en: `The final settlement covers salary to the last working day, pay for unused annual leave, and the end-of-service award, less amounts owed such as an outstanding advance. ${S} pays it within one week of the end of employment when ${S} ends the contract, and within two weeks when the employee resigns.`,
          ar: `تشمل التسوية النهائية الأجر حتى آخر يوم عمل، وبدل الإجازات السنوية غير المستخدمة، ومكافأة نهاية الخدمة، مخصوماً منها المبالغ المستحقة مثل السلفة القائمة. وتدفعها ${A} خلال أسبوع من انتهاء العلاقة إذا كانت الشركة هي التي أنهت العقد، وخلال أسبوعين إذا استقال الموظف.`,
          tags: ['settlement', 'final settlement', 'final pay', 'leaving', 'leave encashment', 'unused leave', 'one week', 'two weeks'] },
      ],
    },
    /* ------------------------------------------------------------ HR-12 */
    {
      id: 'HR-12', title: 'Resignation, Termination and Exit', title_ar: 'الاستقالة وإنهاء الخدمة والمغادرة', version: ver(2, 3), effective: iss.y2, owner: CHRO,
      summary: 'Notice periods, resignation, termination grounds, protected situations and exit formalities.',
      clauses: [
        { ref: '12.1', heading: 'Notice periods', heading_ar: 'فترات الإشعار', legal: 'Labor Law Art. 75 (as amended 2025)',
          en: `For indefinite contracts, notice is 60 days when ${S} ends the contract and 30 days when the employee does. For grades G11 and above the contract sets ${p.seniorNoticeDays} days for both parties. Notice may be waived by agreement or paid in lieu.`,
          ar: `في العقود غير محددة المدة، تكون مدة الإشعار 60 يوماً إذا أنهت ${A} العقد، و30 يوماً إذا أنهاه الموظف. وللدرجة G11 فما فوق يحدد العقد مدة إشعار ${p.seniorNoticeDays} يوماً للطرفين. ويجوز التنازل عن الإشعار بالاتفاق أو دفع بدل عنه.`,
          tags: ['notice', 'notice period', 'resignation', 'termination', '30 days', '60 days', 'pay in lieu'] },
        { ref: '12.2', heading: 'Resignation', heading_ar: 'الاستقالة', legal: 'Labor Law (as amended 2025)',
          en: `An employee resigns in writing through the HR system or to the line manager. If ${S} does not respond within 30 days the resignation is deemed accepted. ${S} may defer acceptance for up to 60 days for business reasons, giving the reason in writing.`,
          ar: `يقدم الموظف استقالته كتابياً عبر نظام الموارد البشرية أو إلى المدير المباشر. وإذا لم ترد ${A} خلال 30 يوماً تُعد الاستقالة مقبولة. ويجوز للشركة تأجيل قبولها مدة لا تزيد على 60 يوماً لمصلحة العمل مع بيان السبب كتابياً.`,
          tags: ['resignation', 'resign', 'quit', 'leaving', 'acceptance', 'deferral'] },
        { ref: '12.4', heading: 'Termination by the company', heading_ar: 'إنهاء الخدمة من قبل الشركة', legal: 'Labor Law Arts. 77, 80',
          en: `${S} ends employment only for a valid reason. Termination for performance follows a completed improvement plan under HR-09 §9.6. Dismissal without notice or award is only for the cases in Art. 80, after an investigation. If a contract is ended without a valid reason, compensation under Art. 77 is due. The Chief Human Resources Officer and Legal approve every termination.`,
          ar: `لا تنهي ${A} الخدمة إلا لسبب مشروع. ولا يكون إنهاء الخدمة بسبب الأداء إلا بعد استكمال خطة تحسين الأداء وفق البند 9.6 من السياسة HR-09. ولا يكون الفصل دون إشعار أو مكافأة إلا في الحالات الواردة في المادة 80 وبعد تحقيق. وإذا أُنهي العقد دون سبب مشروع يُستحق التعويض وفق المادة 77. ويعتمد ${CHRO_AR} والشؤون القانونية كل حالة إنهاء خدمة.`,
          tags: ['termination', 'dismissal', 'fired', 'misconduct', 'redundancy', 'performance', 'compensation', 'article 77', 'article 80'] },
        { ref: '12.5', heading: 'Protected situations', heading_ar: 'الحالات المحمية', legal: 'Labor Law Art. 155',
          en: 'Employment is not ended during maternity leave, during illness arising from pregnancy or childbirth, during sick leave within the statutory entitlement, or because of a complaint in progress made in good faith.',
          ar: 'لا تُنهى الخدمة أثناء إجازة الوضع، أو أثناء المرض الناتج عن الحمل أو الولادة، أو أثناء الإجازة المرضية ضمن المدة النظامية، أو بسبب شكوى قائمة قُدمت بحسن نية.',
          tags: ['protected', 'pregnancy', 'maternity', 'sick leave', 'complaint', 'termination', 'unfair dismissal'] },
        { ref: '12.7', heading: 'Exit formalities', heading_ar: 'إجراءات المغادرة', legal: 'Labor Law Art. 64',
          en: 'Before the last day the employee completes handover and clearance. HR Operations closes the contract on Qiwa and the GOSI registration, removes system access on the last working day, and issues the service certificate. For expatriates HR Operations issues the final exit visa through Muqeem, or supports a transfer of service to a new employer on Qiwa; an exit/re-entry visa already issued is cancelled.',
          ar: 'قبل آخر يوم عمل يستكمل الموظف التسليم وإخلاء الطرف. وتُغلق عمليات الموارد البشرية العقد في منصة قوى والتسجيل في التأمينات الاجتماعية، وتوقف صلاحيات الأنظمة في آخر يوم عمل، وتُصدر شهادة الخدمة. وبالنسبة للوافدين تُصدر تأشيرة الخروج النهائي عبر مقيم، أو تدعم نقل الخدمات إلى صاحب عمل جديد عبر قوى، وتُلغى أي تأشيرة خروج وعودة صادرة.',
          tags: ['exit', 'offboarding', 'clearance', 'handover', 'qiwa', 'final exit', 'exit re-entry', 'visa', 'iqama', 'muqeem', 'transfer', 'service certificate'] },
      ],
    },
    /* ------------------------------------------------------------ HR-13 */
    {
      id: 'HR-13', title: 'HR Data and Use of AI', title_ar: 'بيانات الموارد البشرية واستخدام الذكاء الاصطناعي', version: ver(1, 0), effective: '2026-07-01', owner: CHRO,
      summary: `How ${S} and Tasama use employee data and what the HR agents may and may not do.`,
      clauses: [
        { ref: '13.1', heading: 'Purpose and access', heading_ar: 'الغرض والصلاحيات', legal: 'Personal Data Protection Law (PDPL, Royal Decree M/19)',
          en: `Employee data is used only for employment purposes. Tasama processes it on behalf of ${S} under a data processing agreement. Access follows least privilege: HR agents act with the permissions of the person they are helping and cannot see data that person could not see.`,
          ar: `تُستخدم بيانات الموظفين لأغراض العمل فقط، وتعالجها تسامى نيابة عن ${A} بموجب اتفاقية معالجة بيانات. وتُمنح الصلاحيات وفق مبدأ الحد الأدنى: تعمل وكلاء الموارد البشرية بصلاحيات الشخص الذي تساعده ولا يمكنها الاطلاع على بيانات لا يحق لذلك الشخص رؤيتها.`,
          tags: ['data', 'privacy', 'pdpl', 'personal data', 'access', 'ai', 'confidentiality', 'sdaia'] },
        { ref: '13.2', heading: 'Decisions stay with people', heading_ar: 'القرارات تبقى للأشخاص',
          en: 'HR agents check, prepare and recommend. Decisions on hiring, ratings, pay, promotion, discipline and termination are made by people, and every agent action is recorded in the decision trail.',
          ar: 'تتحقق وكلاء الموارد البشرية وتُعد المستندات وتقدم التوصيات، أما قرارات التوظيف والتقييم والأجور والترقية والتأديب وإنهاء الخدمة فيتخذها الأشخاص، ويُسجل كل إجراء يقوم به الوكيل في سجل القرارات.',
          tags: ['ai', 'agent', 'decision', 'human', 'trail', 'automation', 'audit'] },
        { ref: '13.3', heading: 'Right to human review', heading_ar: 'الحق في المراجعة البشرية',
          en: 'Anyone may ask for a person in HR to review an outcome produced or prepared by an HR agent. The review is completed within 5 working days.',
          ar: 'يحق لأي شخص أن يطلب من أحد موظفي الموارد البشرية مراجعة أي نتيجة أعدها أو أصدرها وكيل الموارد البشرية، وتُستكمل المراجعة خلال 5 أيام عمل.',
          tags: ['review', 'human review', 'appeal', 'ai', 'challenge', 'objection'] },
      ],
    },
  ];
}
