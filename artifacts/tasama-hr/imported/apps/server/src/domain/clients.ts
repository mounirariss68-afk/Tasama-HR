/**
 * The Tasama client portfolio for the demo.
 *
 * Company names are real PIF portfolio companies, used at Cognirise's request
 * for a pitch to Tasama. EVERYTHING ELSE IS FICTIONAL: the employees, salaries,
 * ratings, HR policies, which HRMS each company runs, the Tasama contracts,
 * fees and service levels. Nothing here describes the real companies.
 *
 * One object per client drives the whole build: its own simulated HRMS
 * (schema hcm_<key>), its own agentic-layer store (layer_<key>), its handbook
 * terms, its org naming and its Tasama contract.
 *
 * Two modes (design/payroll-addendum.md §1): ROSHN and Riyadh Air keep their
 * employee master in Oracle HCM; Red Sea Global, SEVEN and Saudi Coffee hold
 * it in Tasama HR (hrms PLATFORM). The hcm_<key> schema is the master either
 * way; only the connector's dialect differs.
 */

/** Where the employee master lives: the client's Oracle or Odoo, or Tasama HR itself (platform of record). */
export type Hrms = 'ORACLE' | 'ODOO' | 'PLATFORM';
/** The ledger the payroll journals go to. */
export type Finance = 'ORACLE_FIN' | 'ODOO_ACC';

export type PolicyParams = {
  annualLeave: number;            // working days a year, first five years (statutory minimum 21)
  annualLeaveAfter5: number;      // after five years (statutory minimum 30)
  carryForwardMax: number;        // days that may be carried into next year
  probationDays: number;          // 90 default; up to 180 by written contract (Art. 53)
  housingPct: number;             // housing allowance, % of basic
  transportPct: number;           // transport allowance, % of basic
  weeklyHours: number;            // up to 48 (Art. 98)
  remoteDays: number;             // remote days a week for eligible roles
  advanceMultiple: number;        // advance cap: this many months of ...
  advanceBasis: 'basic' | 'gross';
  advanceMinServiceMonths: number;
  advanceMaxTerm: number;         // months
  letterHours: number;            // standard letters issued within (hours)
  ticket: 'annual' | 'biennial' | 'none' | 'staff-travel';
  educationAllowance: number;     // SAR per child per year, expatriates (0 = none)
  educationChildren: number;
  medicalClass: string;           // CCHI policy class
  sickTopUpDays: number;          // company tops the 75% band up to full pay for this many days (0 = statutory only)
  seniorNoticeDays: number;       // contractual notice for G11 and above (statutory: 60 employer / 30 employee)
  bonusTargetPct: number;         // target bonus, % of annual basic, rating 3
  payDay: number;                 // day of month salaries are paid
  cutoffDay: number;              // payroll input cut-off
  leaveDayDivisor?: 22 | 30 | 'ENTITLEMENT';   // a leave day in the provision: the month ÷ 22 working days, ÷ 30, or ÷ the annual entitlement (walkthrough addendum item 16)
  gosiProrate?: boolean;          // GOSI × pay days ÷ month days in a partial month, as Tasama's sheet does (walkthrough addendum item 28)
  eosYearDays?: 365 | 360;        // end of service on calendar days, or on 30-day months with a flat monthly cost (walkthrough addendum R18)
  leaveNetMonth?: boolean;        // the leave month cost nets the days taken in the month (walkthrough addendum R27)
};

export type ClientSla = { key: string; label: string; label_ar: string; target: number; unit: '%'; creditPct: number };

export type ClientConfig = {
  key: string;                    // schema suffix
  code: string;                   // case reference prefix
  name: string; name_ar: string;
  short: string;
  sector: string; sector_ar: string;
  city: string; city_ar: string;
  hrms: Hrms; hrmsLabel: string;
  finance: Finance;               // ledger for the payroll journals (design/payroll-addendum.md §1)
  size: number;                   // active employees in the demo workforce (a sample, not the real company)
  saudiShare: number;             // share of Saudi nationals
  nitaqat: { activity: string; band: string; requiredPct: number };
  slowness: number;               // 1 = typical approver speed; >1 slower (drives SLA results)
  policy: PolicyParams;
  /** Who at Tasama serves this client (walkthrough addendum R3): the payroll specialist who calculates and the HR operations specialist who is its point of contact. The names stay until Tasama confirms them. */
  team?: { payrollSpecialist: string; hrOps: string };
  contract: {
    model: string; model_ar: string;
    services: string[];           // PAYROLL, HR_OPS, EMPLOYEE_SERVICES, RECRUITMENT, ONBOARDING, OFFBOARDING, PERFORMANCE_ADMIN
    pepm: number;                 // SAR per employee per month
    perHire: number;              // SAR per completed hire (0 = not in scope)
    start: string; term: number;  // months
    phase: 'BUILD' | 'OPERATE' | 'TRANSFER';
    creditCapPct: number;         // service credits capped at % of monthly fee
    approvalChain?: ('PAYROLL' | 'CHRO')[];   // who approves a payroll run at the client, in order (design/walkthrough-addendum.md item 4); HR operations alone when absent
  };
  orgRename: Record<string, [string, string, string?, string?]>;    // dept code -> [name, name_ar, division?, division_ar?]
  roleRename: Record<string, [string, string]>;                     // role code -> [title, title_ar]
  bank: [string, string];         // the bank employees most often ask letters for
};

const SLA_BASE: ClientSla[] = [
  { key: 'PAY_ACCURACY', label: 'Payroll accuracy', label_ar: 'دقة الرواتب', target: 99.5, unit: '%', creditPct: 3 },
  { key: 'PAY_ONTIME', label: 'Salaries paid on time (Mudad)', label_ar: 'صرف الرواتب في موعدها (مدد)', target: 100, unit: '%', creditPct: 5 },
  { key: 'LETTERS', label: 'Letters within turnaround', label_ar: 'الخطابات ضمن المدة', target: 98, unit: '%', creditPct: 1 },
  { key: 'REQUESTS', label: 'Employee requests within 3 working days', label_ar: 'طلبات الموظفين خلال 3 أيام عمل', target: 95, unit: '%', creditPct: 2 },
  { key: 'ONBOARD', label: 'Joiners ready on day one', label_ar: 'جاهزية الموظفين الجدد في اليوم الأول', target: 95, unit: '%', creditPct: 2 },
  { key: 'SETTLEMENT', label: 'Final settlements within legal deadline', label_ar: 'التسويات النهائية ضمن المهلة النظامية', target: 100, unit: '%', creditPct: 3 },
];
export const slasFor = (c: ClientConfig): ClientSla[] =>
  SLA_BASE.filter((s) => s.key !== 'ONBOARD' || c.contract.services.includes('ONBOARDING'))
    .filter((s) => s.key !== 'SETTLEMENT' || c.contract.services.includes('OFFBOARDING'))
    .filter((s) => !['LETTERS', 'REQUESTS'].includes(s.key) || c.contract.services.includes('EMPLOYEE_SERVICES'));

export const SERVICE_LABELS: Record<string, [string, string]> = {
  PAYROLL: ['Payroll and Mudad', 'الرواتب ومدد'],
  HR_OPS: ['HR operations', 'عمليات الموارد البشرية'],
  EMPLOYEE_SERVICES: ['Employee services and letters', 'خدمات الموظفين والخطابات'],
  RECRUITMENT: ['Recruitment administration', 'إدارة التوظيف'],
  ONBOARDING: ['Onboarding and Qiwa contracts', 'التهيئة وعقود قوى'],
  OFFBOARDING: ['Offboarding and final settlement', 'إنهاء الخدمة والتسوية النهائية'],
  PERFORMANCE_ADMIN: ['Performance cycle administration', 'إدارة دورة الأداء'],
};

// Department and role names shared by most clients; each client overrides the sector-specific ones.
const CORP_RENAMES: ClientConfig['orgRename'] = {
  HUC: ['Human Resources', 'الموارد البشرية', 'Human Resources', 'الموارد البشرية'],
  SHR: ['Quality and HSE', 'الجودة والصحة والسلامة والبيئة'],
  CMP: ['Compliance', 'الامتثال'],
};
const CORP_ROLES: ClientConfig['roleRename'] = {
  'HUC-CHRO': ['Chief Human Resources Officer', 'الرئيس التنفيذي للموارد البشرية'],
  'HUC-EM': ['Saudization Specialist', 'أخصائي التوطين'],
  'HUC-PAY': ['Payroll and HR Operations Lead', 'قائد الرواتب وعمليات الموارد البشرية'],
  'SHR-HD': ['Head of Quality and HSE', 'رئيس الجودة والصحة والسلامة'],
  'SHR-AU': ['HSE Specialist', 'أخصائي صحة وسلامة'],
  'CMP-MLRO': ['Compliance Manager', 'مدير الامتثال'],
  'COR-ES': ['Key Account Specialist', 'أخصائي الحسابات الرئيسية'],
};

export const CLIENTS: ClientConfig[] = [
  {
    key: 'roshn', code: 'RSN', name: 'ROSHN Group', name_ar: 'مجموعة روشن', short: 'ROSHN',
    team: { payrollSpecialist: 'Nasser AlFarraj', hrOps: 'Lama Al Dossary' },
    sector: 'Real estate development', sector_ar: 'التطوير العقاري', city: 'Riyadh', city_ar: 'الرياض',
    hrms: 'ORACLE', hrmsLabel: 'Oracle Fusion Cloud HCM', finance: 'ORACLE_FIN', size: 236, saudiShare: 0.72,
    nitaqat: { activity: 'Real estate development', band: 'High Green', requiredPct: 0.38 }, slowness: 1.0,
    policy: { annualLeave: 25, annualLeaveAfter5: 30, carryForwardMax: 10, probationDays: 90, housingPct: 25, transportPct: 10, weeklyHours: 40, remoteDays: 2,
      advanceMultiple: 2, advanceBasis: 'basic', advanceMinServiceMonths: 6, advanceMaxTerm: 18, letterHours: 8, ticket: 'annual', educationAllowance: 20000, educationChildren: 2,
      medicalClass: 'A', sickTopUpDays: 30, seniorNoticeDays: 90, bonusTargetPct: 15, payDay: 27, cutoffDay: 18 },
    contract: { approvalChain: ['PAYROLL', 'CHRO'], model: 'Full HR outsourcing', model_ar: 'تعهيد كامل للموارد البشرية', services: ['PAYROLL', 'HR_OPS', 'EMPLOYEE_SERVICES', 'RECRUITMENT', 'ONBOARDING', 'OFFBOARDING', 'PERFORMANCE_ADMIN'],
      pepm: 395, perHire: 3200, start: '2025-09-01', term: 36, phase: 'OPERATE', creditCapPct: 10 },
    orgRename: { ...CORP_RENAMES,
      COM: ['Commercial', 'القطاع التجاري'], RSL: ['Residential Sales', 'مبيعات الوحدات السكنية'], COR: ['Commercial Leasing', 'التأجير التجاري'],
      CXP: ['Customer Experience', 'تجربة العملاء'], CCN: ['Community Sales Centres', 'مراكز مبيعات المجتمعات'], MKT: ['Marketing and Communications', 'التسويق والاتصال'],
      INV: ['Development and Projects', 'التطوير والمشاريع', 'Development', 'التطوير'], TRS: ['Project Controls', 'ضبط المشاريع', 'Development', 'التطوير'], REA: ['Land and Master Planning', 'الأراضي والتخطيط العام', 'Development', 'التطوير'],
      OPS: ['Community Management', 'إدارة المجتمعات'], DIG: ['Digital Products', 'المنتجات الرقمية'] },
    roleRename: { ...CORP_ROLES,
      'RSL-HD': ['Head of Residential Sales', 'رئيس مبيعات الوحدات السكنية'], 'RSL-SR': ['Senior Sales Consultant', 'مستشار مبيعات أول'], 'RSL-RO': ['Sales Consultant', 'مستشار مبيعات'], 'RSL-ASC': ['Sales Coordinator', 'منسق مبيعات'],
      'COR-HD': ['Head of Commercial Leasing', 'رئيس التأجير التجاري'], 'COR-RM': ['Leasing Manager', 'مدير تأجير'], 'COR-AN': ['Leasing Analyst', 'محلل تأجير'],
      'INV-CIO': ['Chief Development Officer', 'الرئيس التنفيذي للتطوير'], 'INV-PM': ['Project Director', 'مدير مشروع رئيسي'], 'INV-SR': ['Senior Project Engineer', 'مهندس مشاريع أول'], 'INV-AN': ['Project Engineer', 'مهندس مشاريع'],
      'TRS-HD': ['Head of Project Controls', 'رئيس ضبط المشاريع'], 'TRS-DL': ['Cost Controller', 'مراقب تكاليف'], 'TRS-OF': ['Planning Engineer', 'مهندس تخطيط'],
      'REA-HD': ['Head of Master Planning', 'رئيس التخطيط العام'], 'REA-AM': ['Urban Planner', 'مخطط عمراني'], 'REA-AN': ['Land Analyst', 'محلل أراضٍ'],
      'OPS-COO': ['Chief Operating Officer', 'الرئيس التنفيذي للعمليات'], 'OPS-SR': ['Senior Community Officer', 'مسؤول مجتمع أول'], 'OPS-OF': ['Community Officer', 'مسؤول مجتمع'],
      'CCN-MGR': ['Sales Centre Manager', 'مدير مركز مبيعات'], 'CCN-SR': ['Senior Customer Advisor', 'مستشار عملاء أول'], 'CCN-OF': ['Customer Advisor', 'مستشار عملاء'] },
    bank: ['Al Rajhi Bank', 'مصرف الراجحي'],
  },
  {
    key: 'riyadhair', code: 'RXI', name: 'Riyadh Air', name_ar: 'طيران الرياض', short: 'Riyadh Air',
    team: { payrollSpecialist: 'Nasser AlFarraj', hrOps: 'Lama Al Dossary' },
    sector: 'Aviation', sector_ar: 'الطيران', city: 'Riyadh', city_ar: 'الرياض',
    hrms: 'ORACLE', hrmsLabel: 'Oracle Fusion Cloud HCM', finance: 'ORACLE_FIN', size: 224, saudiShare: 0.58,
    nitaqat: { activity: 'Air transport', band: 'Medium Green', requiredPct: 0.30 }, slowness: 1.9,
    policy: { annualLeave: 30, annualLeaveAfter5: 35, carryForwardMax: 15, probationDays: 180, housingPct: 25, transportPct: 10, weeklyHours: 40, remoteDays: 1,
      advanceMultiple: 1, advanceBasis: 'gross', advanceMinServiceMonths: 6, advanceMaxTerm: 12, letterHours: 8, ticket: 'staff-travel', educationAllowance: 25000, educationChildren: 3,
      medicalClass: 'VIP', sickTopUpDays: 60, seniorNoticeDays: 90, bonusTargetPct: 15, payDay: 25, cutoffDay: 15 },
    contract: { approvalChain: ['PAYROLL', 'CHRO'], model: 'Full HR outsourcing with recruitment', model_ar: 'تعهيد كامل مع التوظيف', services: ['PAYROLL', 'HR_OPS', 'EMPLOYEE_SERVICES', 'RECRUITMENT', 'ONBOARDING', 'OFFBOARDING'],
      pepm: 410, perHire: 4500, start: '2025-11-01', term: 36, phase: 'OPERATE', creditCapPct: 10 },
    orgRename: { ...CORP_RENAMES,
      COM: ['Commercial', 'القطاع التجاري'], RSL: ['Sales and Distribution', 'المبيعات والتوزيع'], COR: ['Corporate and Partner Sales', 'مبيعات الشركات والشركاء'],
      CXP: ['Guest Experience', 'تجربة الضيوف'], CCN: ['Contact Centre', 'مركز الاتصال'], MKT: ['Brand and Marketing', 'العلامة التجارية والتسويق'],
      INV: ['Flight Operations', 'عمليات الطيران', 'Operations', 'العمليات'], TRS: ['Network Planning', 'تخطيط الشبكة', 'Operations', 'العمليات'], REA: ['Engineering and Maintenance', 'الهندسة والصيانة', 'Operations', 'العمليات'],
      OPS: ['Airport Operations', 'عمليات المطارات'], DIG: ['Digital and Loyalty', 'الرقمنة والولاء'] },
    roleRename: { ...CORP_ROLES,
      'RSL-HD': ['Head of Sales and Distribution', 'رئيس المبيعات والتوزيع'], 'RSL-SR': ['Senior Sales Executive', 'تنفيذي مبيعات أول'], 'RSL-RO': ['Sales Executive', 'تنفيذي مبيعات'], 'RSL-ASC': ['Sales Agent', 'وكيل مبيعات'],
      'COR-HD': ['Head of Corporate Sales', 'رئيس مبيعات الشركات'], 'COR-RM': ['Corporate Account Manager', 'مدير حسابات الشركات'], 'COR-AN': ['Revenue Analyst', 'محلل إيرادات'],
      'INV-CIO': ['Chief Operations Officer, Flight', 'الرئيس التنفيذي لعمليات الطيران'], 'INV-PM': ['Fleet Captain', 'كابتن الأسطول'], 'INV-SR': ['Senior Flight Operations Officer', 'مسؤول عمليات طيران أول'], 'INV-AN': ['Flight Operations Officer', 'مسؤول عمليات طيران'],
      'TRS-HD': ['Head of Network Planning', 'رئيس تخطيط الشبكة'], 'TRS-DL': ['Network Planner', 'مخطط شبكة'], 'TRS-OF': ['Scheduling Analyst', 'محلل جدولة'],
      'REA-HD': ['Head of Engineering', 'رئيس الهندسة'], 'REA-AM': ['Licensed Aircraft Engineer', 'مهندس طائرات مرخّص'], 'REA-AN': ['Maintenance Planner', 'مخطط صيانة'],
      'OPS-COO': ['Chief Airport Officer', 'الرئيس التنفيذي للمطارات'], 'OPS-SR': ['Senior Station Officer', 'مسؤول محطة أول'], 'OPS-OF': ['Station Officer', 'مسؤول محطة'],
      'CXP-HD': ['Head of Guest Experience', 'رئيس تجربة الضيوف'], 'CXP-MGR': ['Guest Experience Manager', 'مدير تجربة الضيوف'], 'CXP-SR': ['Senior Guest Experience Officer', 'مسؤول تجربة ضيوف أول'], 'CXP-OF': ['Guest Experience Officer', 'مسؤول تجربة الضيوف'],
      'CCN-MGR': ['Contact Centre Manager', 'مدير مركز الاتصال'], 'CCN-SR': ['Senior Contact Centre Agent', 'وكيل مركز اتصال أول'], 'CCN-OF': ['Contact Centre Agent', 'وكيل مركز اتصال'] },
    bank: ['Saudi National Bank', 'البنك الأهلي السعودي'],
  },
  {
    key: 'redsea', code: 'RSG', name: 'Red Sea Global', name_ar: 'البحر الأحمر الدولية', short: 'Red Sea Global',
    team: { payrollSpecialist: 'Nasser AlFarraj', hrOps: 'Lama Al Dossary' },
    sector: 'Tourism and hospitality', sector_ar: 'السياحة والضيافة', city: 'Riyadh and the Red Sea destination', city_ar: 'الرياض ووجهة البحر الأحمر',
    hrms: 'PLATFORM', hrmsLabel: 'Tasama HR employee master', finance: 'ORACLE_FIN', size: 204, saudiShare: 0.55,
    nitaqat: { activity: 'Hotels and tourism', band: 'Medium Green', requiredPct: 0.32 }, slowness: 1.2,
    policy: { annualLeave: 26, annualLeaveAfter5: 30, carryForwardMax: 10, probationDays: 90, housingPct: 30, transportPct: 10, weeklyHours: 48, remoteDays: 0,
      advanceMultiple: 1, advanceBasis: 'basic', advanceMinServiceMonths: 6, advanceMaxTerm: 12, letterHours: 16, ticket: 'annual', educationAllowance: 30000, educationChildren: 3,
      medicalClass: 'A', sickTopUpDays: 0, seniorNoticeDays: 90, bonusTargetPct: 12, payDay: 26, cutoffDay: 16, eosYearDays: 360 },
    contract: { model: 'Payroll and employee services', model_ar: 'الرواتب وخدمات الموظفين', services: ['PAYROLL', 'EMPLOYEE_SERVICES', 'OFFBOARDING'],
      pepm: 240, perHire: 0, start: '2026-01-01', term: 24, phase: 'OPERATE', creditCapPct: 8 },
    orgRename: { ...CORP_RENAMES,
      COM: ['Commercial', 'القطاع التجاري'], RSL: ['Destination Sales', 'مبيعات الوجهة'], COR: ['Partnerships and Trade', 'الشراكات والتجارة'],
      CXP: ['Guest Experience', 'تجربة الضيوف'], CCN: ['Reservations Centre', 'مركز الحجوزات'], MKT: ['Brand and Marketing', 'العلامة التجارية والتسويق'],
      INV: ['Destination Development', 'تطوير الوجهة', 'Destination', 'الوجهة'], TRS: ['Environment and Sustainability', 'البيئة والاستدامة', 'Destination', 'الوجهة'], REA: ['Hotel Asset Management', 'إدارة الأصول الفندقية', 'Destination', 'الوجهة'],
      OPS: ['Destination Operations', 'عمليات الوجهة'], DIG: ['Digital Experience', 'التجربة الرقمية'] },
    roleRename: { ...CORP_ROLES,
      'RSL-HD': ['Head of Destination Sales', 'رئيس مبيعات الوجهة'], 'RSL-SR': ['Senior Sales Manager', 'مدير مبيعات أول'], 'RSL-RO': ['Sales Executive', 'تنفيذي مبيعات'], 'RSL-ASC': ['Sales Coordinator', 'منسق مبيعات'],
      'COR-HD': ['Head of Partnerships', 'رئيس الشراكات'], 'COR-RM': ['Trade Partnerships Manager', 'مدير شراكات تجارية'], 'COR-AN': ['Partnerships Analyst', 'محلل شراكات'],
      'INV-CIO': ['Chief Development Officer', 'الرئيس التنفيذي للتطوير'], 'INV-PM': ['Development Director', 'مدير تطوير'], 'INV-SR': ['Senior Development Manager', 'مدير تطوير أول'], 'INV-AN': ['Development Analyst', 'محلل تطوير'],
      'TRS-HD': ['Head of Environment', 'رئيس البيئة'], 'TRS-DL': ['Marine Scientist', 'عالم بحار'], 'TRS-OF': ['Sustainability Officer', 'مسؤول استدامة'],
      'REA-HD': ['Head of Hotel Assets', 'رئيس الأصول الفندقية'], 'REA-AM': ['Hotel Asset Manager', 'مدير أصول فندقية'], 'REA-AN': ['Asset Analyst', 'محلل أصول'],
      'OPS-COO': ['Chief Destination Officer', 'الرئيس التنفيذي للوجهة'], 'OPS-SR': ['Senior Destination Officer', 'مسؤول وجهة أول'], 'OPS-OF': ['Destination Officer', 'مسؤول الوجهة'],
      'CCN-MGR': ['Reservations Manager', 'مدير الحجوزات'], 'CCN-SR': ['Senior Reservations Agent', 'وكيل حجوزات أول'], 'CCN-OF': ['Reservations Agent', 'وكيل حجوزات'] },
    bank: ['Riyad Bank', 'بنك الرياض'],
  },
  {
    key: 'seven', code: 'SVN', name: 'Saudi Entertainment Ventures (SEVEN)', name_ar: 'شركة الترفيه السعودية (سفن)', short: 'SEVEN',
    team: { payrollSpecialist: 'Nasser AlFarraj', hrOps: 'Lama Al Dossary' },
    sector: 'Entertainment', sector_ar: 'الترفيه', city: 'Riyadh', city_ar: 'الرياض',
    hrms: 'PLATFORM', hrmsLabel: 'Tasama HR employee master', finance: 'ODOO_ACC', size: 148, saudiShare: 0.66,
    nitaqat: { activity: 'Entertainment', band: 'High Green', requiredPct: 0.35 }, slowness: 1.0,
    policy: { annualLeave: 22, annualLeaveAfter5: 30, carryForwardMax: 5, probationDays: 90, housingPct: 25, transportPct: 10, weeklyHours: 40, remoteDays: 2,
      advanceMultiple: 1, advanceBasis: 'gross', advanceMinServiceMonths: 6, advanceMaxTerm: 12, letterHours: 8, ticket: 'biennial', educationAllowance: 0, educationChildren: 0,
      medicalClass: 'B', sickTopUpDays: 0, seniorNoticeDays: 60, bonusTargetPct: 10, payDay: 27, cutoffDay: 18 },
    contract: { model: 'Full HR outsourcing', model_ar: 'تعهيد كامل للموارد البشرية', services: ['PAYROLL', 'HR_OPS', 'EMPLOYEE_SERVICES', 'RECRUITMENT', 'ONBOARDING', 'OFFBOARDING', 'PERFORMANCE_ADMIN'],
      pepm: 360, perHire: 2800, start: '2026-02-01', term: 24, phase: 'OPERATE', creditCapPct: 10 },
    orgRename: { ...CORP_RENAMES,
      COM: ['Commercial', 'القطاع التجاري'], RSL: ['Ticketing and Sales', 'التذاكر والمبيعات'], COR: ['Sponsorship and Partnerships', 'الرعاية والشراكات'],
      CXP: ['Guest Experience', 'تجربة الزوار'], CCN: ['Venue Guest Services', 'خدمات زوار المرافق'], MKT: ['Marketing and Content', 'التسويق والمحتوى'],
      INV: ['Destinations Development', 'تطوير الوجهات الترفيهية', 'Destinations', 'الوجهات'], TRS: ['Attractions Design', 'تصميم المعالم', 'Destinations', 'الوجهات'], REA: ['Venue Portfolio', 'محفظة المرافق', 'Destinations', 'الوجهات'],
      OPS: ['Venue Operations', 'تشغيل المرافق'], DIG: ['Digital and Ticketing Platforms', 'المنصات الرقمية والتذاكر'] },
    roleRename: { ...CORP_ROLES,
      'RSL-HD': ['Head of Ticketing and Sales', 'رئيس التذاكر والمبيعات'], 'RSL-SR': ['Senior Sales Executive', 'تنفيذي مبيعات أول'], 'RSL-RO': ['Sales Executive', 'تنفيذي مبيعات'], 'RSL-ASC': ['Box Office Associate', 'موظف شباك التذاكر'],
      'COR-HD': ['Head of Sponsorship', 'رئيس الرعاية'], 'COR-RM': ['Partnerships Manager', 'مدير شراكات'], 'COR-AN': ['Partnerships Analyst', 'محلل شراكات'],
      'INV-CIO': ['Chief Development Officer', 'الرئيس التنفيذي للتطوير'], 'INV-PM': ['Destination Project Director', 'مدير مشروع وجهة'], 'INV-SR': ['Senior Development Manager', 'مدير تطوير أول'], 'INV-AN': ['Development Analyst', 'محلل تطوير'],
      'TRS-HD': ['Head of Attractions Design', 'رئيس تصميم المعالم'], 'TRS-DL': ['Attractions Designer', 'مصمم معالم'], 'TRS-OF': ['Design Coordinator', 'منسق تصميم'],
      'REA-HD': ['Head of Venue Portfolio', 'رئيس محفظة المرافق'], 'REA-AM': ['Venue Asset Manager', 'مدير أصول المرافق'], 'REA-AN': ['Portfolio Analyst', 'محلل محفظة'],
      'OPS-COO': ['Chief Operating Officer', 'الرئيس التنفيذي للعمليات'], 'OPS-SR': ['Senior Venue Supervisor', 'مشرف مرافق أول'], 'OPS-OF': ['Venue Operations Officer', 'مسؤول تشغيل مرافق'],
      'CCN-MGR': ['Guest Services Manager', 'مدير خدمات الزوار'], 'CCN-SR': ['Senior Guest Services Officer', 'مسؤول خدمات زوار أول'], 'CCN-OF': ['Guest Services Officer', 'مسؤول خدمات الزوار'] },
    bank: ['Alinma Bank', 'مصرف الإنماء'],
  },
  {
    key: 'saudicoffee', code: 'SCC', name: 'Saudi Coffee Company', name_ar: 'الشركة السعودية للقهوة', short: 'Saudi Coffee',
    team: { payrollSpecialist: 'Nasser AlFarraj', hrOps: 'Lama Al Dossary' },
    sector: 'Food and agriculture', sector_ar: 'الأغذية والزراعة', city: 'Jazan and Riyadh', city_ar: 'جازان والرياض',
    hrms: 'PLATFORM', hrmsLabel: 'Tasama HR employee master', finance: 'ODOO_ACC', size: 104, saudiShare: 0.62,
    nitaqat: { activity: 'Food manufacturing', band: 'Low Green', requiredPct: 0.28 }, slowness: 1.4,
    policy: { annualLeave: 21, annualLeaveAfter5: 30, carryForwardMax: 0, probationDays: 90, housingPct: 20, transportPct: 10, weeklyHours: 48, remoteDays: 0,
      advanceMultiple: 0.5, advanceBasis: 'gross', advanceMinServiceMonths: 12, advanceMaxTerm: 6, letterHours: 16, ticket: 'none', educationAllowance: 0, educationChildren: 0,
      medicalClass: 'C', sickTopUpDays: 0, seniorNoticeDays: 60, bonusTargetPct: 8, payDay: 28, cutoffDay: 20, leaveDayDivisor: 22, leaveNetMonth: true, gosiProrate: true },
    contract: { model: 'Payroll managed service (Build, Operate, Transfer)', model_ar: 'خدمة الرواتب المُدارة (بناء، تشغيل، نقل)', services: ['PAYROLL'],
      pepm: 95, perHire: 0, start: '2026-06-01', term: 24, phase: 'OPERATE', creditCapPct: 8 },
    orgRename: { ...CORP_RENAMES,
      COM: ['Commercial', 'القطاع التجاري'], RSL: ['Retail and Brands', 'التجزئة والعلامات التجارية'], COR: ['Wholesale and Export', 'الجملة والتصدير'],
      CXP: ['Customer Experience', 'تجربة العملاء'], CCN: ['Coffee Houses', 'المقاهي'], MKT: ['Marketing', 'التسويق'],
      INV: ['Coffee Production', 'إنتاج القهوة', 'Production', 'الإنتاج'], TRS: ['Farmer Programmes', 'برامج المزارعين', 'Production', 'الإنتاج'], REA: ['Roastery and Processing', 'التحميص والمعالجة', 'Production', 'الإنتاج'],
      OPS: ['Supply Chain', 'سلسلة الإمداد'], DIG: ['Digital and E-commerce', 'الرقمنة والتجارة الإلكترونية'] },
    roleRename: { ...CORP_ROLES,
      'RSL-HD': ['Head of Retail and Brands', 'رئيس التجزئة والعلامات'], 'RSL-SR': ['Senior Brand Executive', 'تنفيذي علامة تجارية أول'], 'RSL-RO': ['Retail Executive', 'تنفيذي تجزئة'], 'RSL-ASC': ['Retail Associate', 'موظف تجزئة'],
      'COR-HD': ['Head of Wholesale', 'رئيس الجملة'], 'COR-RM': ['Key Account Manager', 'مدير حسابات رئيسية'], 'COR-AN': ['Sales Analyst', 'محلل مبيعات'],
      'INV-CIO': ['Chief Production Officer', 'الرئيس التنفيذي للإنتاج'], 'INV-PM': ['Plantation Manager', 'مدير مزرعة'], 'INV-SR': ['Senior Agronomist', 'مهندس زراعي أول'], 'INV-AN': ['Agronomist', 'مهندس زراعي'],
      'TRS-HD': ['Head of Farmer Programmes', 'رئيس برامج المزارعين'], 'TRS-DL': ['Farmer Liaison', 'منسق المزارعين'], 'TRS-OF': ['Field Officer', 'مسؤول ميداني'],
      'REA-HD': ['Roastery Manager', 'مدير المحمصة'], 'REA-AM': ['Roast Master', 'خبير تحميص'], 'REA-AN': ['Quality Analyst', 'محلل جودة'],
      'OPS-COO': ['Head of Supply Chain', 'رئيس سلسلة الإمداد'], 'OPS-SR': ['Senior Supply Chain Officer', 'مسؤول إمداد أول'], 'OPS-OF': ['Supply Chain Officer', 'مسؤول إمداد'],
      'CCN-MGR': ['Coffee House Manager', 'مدير مقهى'], 'CCN-SR': ['Senior Barista', 'باريستا أول'], 'CCN-OF': ['Barista', 'باريستا'] },
    bank: ['Bank Albilad', 'بنك البلاد'],
  },
];

/**
 * Clients Tasama takes on in the demo from their files (design/payroll-addendum.md §13, §19). They are
 * kept in tasama.clients and registered here at go-live and at start-up, so every lookup finds them.
 * Reset drops them; the five above are the seed's.
 */
export const ONBOARDED: ClientConfig[] = [];
export const allClients = (): ClientConfig[] => [...CLIENTS, ...ONBOARDED];
export function registerClient(c: ClientConfig) { const i = ONBOARDED.findIndex((x) => x.key === c.key); if (i >= 0) ONBOARDED[i] = c; else ONBOARDED.push(c); }
export function unregisterClient(key?: string) { for (let i = ONBOARDED.length - 1; i >= 0; i--) if (!key || ONBOARDED[i].key === key) ONBOARDED.splice(i, 1); }
export const isSeedClient = (k: string) => CLIENTS.some((c) => c.key === k);

export const clientByKey = (k: string) => CLIENTS.find((c) => c.key === k) ?? ONBOARDED.find((c) => c.key === k);
export const DEFAULT_CLIENT = CLIENTS[0].key;
