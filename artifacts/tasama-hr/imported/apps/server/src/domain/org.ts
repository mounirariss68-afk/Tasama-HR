/**
 * The organisation template every client is built from: corporate functions
 * (executive office, finance, HR, technology, legal, procurement) plus three
 * operating divisions that each client renames for its sector (see
 * clients.ts orgRename/roleRename). Department sizes, grades and salary bands
 * are ILLUSTRATIVE and are not the real companies' data.
 */

import type { ClientConfig } from './clients.js';

const LOCATIONS_BY_CLIENT: Record<string, { code: string; name: string; name_ar: string; region: string }[]> = {
  roshn: [
    { code: 'HO', name: 'Head Office, Riyadh', name_ar: 'المقر الرئيسي، الرياض', region: 'Riyadh' },
    { code: 'SDR', name: 'SEDRA community, Riyadh', name_ar: 'مجتمع سدرة، الرياض', region: 'Riyadh' },
    { code: 'ARS', name: 'ALAROUS community, Jeddah', name_ar: 'مجتمع العروس، جدة', region: 'Makkah' },
    { code: 'DMM', name: 'Sales centre, Dammam', name_ar: 'مركز المبيعات، الدمام', region: 'Eastern Province' },
  ],
  riyadhair: [
    { code: 'HO', name: 'Head Office, Riyadh', name_ar: 'المقر الرئيسي، الرياض', region: 'Riyadh' },
    { code: 'RUH', name: 'King Khalid International Airport', name_ar: 'مطار الملك خالد الدولي', region: 'Riyadh' },
    { code: 'JED', name: 'Jeddah station', name_ar: 'محطة جدة', region: 'Makkah' },
    { code: 'MRO', name: 'Maintenance base, Riyadh', name_ar: 'قاعدة الصيانة، الرياض', region: 'Riyadh' },
  ],
  redsea: [
    { code: 'HO', name: 'Head Office, Riyadh', name_ar: 'المقر الرئيسي، الرياض', region: 'Riyadh' },
    { code: 'RSD', name: 'Red Sea destination', name_ar: 'وجهة البحر الأحمر', region: 'Tabuk' },
    { code: 'AML', name: 'AMAALA site', name_ar: 'موقع أمالا', region: 'Tabuk' },
    { code: 'JED', name: 'Jeddah office', name_ar: 'مكتب جدة', region: 'Makkah' },
  ],
  seven: [
    { code: 'HO', name: 'Head Office, Riyadh', name_ar: 'المقر الرئيسي، الرياض', region: 'Riyadh' },
    { code: 'RUH-V', name: 'Riyadh entertainment destination', name_ar: 'الوجهة الترفيهية بالرياض', region: 'Riyadh' },
    { code: 'JED-V', name: 'Jeddah entertainment destination', name_ar: 'الوجهة الترفيهية بجدة', region: 'Makkah' },
    { code: 'DMM-V', name: 'Dammam entertainment destination', name_ar: 'الوجهة الترفيهية بالدمام', region: 'Eastern Province' },
  ],
  saudicoffee: [
    { code: 'HO', name: 'Head Office, Riyadh', name_ar: 'المقر الرئيسي، الرياض', region: 'Riyadh' },
    { code: 'JZN', name: 'Jazan farms and roastery', name_ar: 'مزارع ومحمصة جازان', region: 'Jazan' },
    { code: 'CH-RUH', name: 'Coffee houses, Riyadh', name_ar: 'المقاهي، الرياض', region: 'Riyadh' },
    { code: 'CH-JED', name: 'Coffee houses, Jeddah', name_ar: 'المقاهي، جدة', region: 'Makkah' },
  ],
};

/** Minimum role counts the planted people and open cases rely on. */
const MIN_COUNT: Record<string, number> = { 'CXP-SR': 2, 'CXP-OF': 3, 'CCN-OF': 3, 'CXP-MGR': 2, 'CMP-OF': 2, 'HUC-TAS': 2, 'HUC-BP': 3, 'INV-AN': 5, 'RSL-RO': 3, 'FIN-SA': 2, 'COR-RM': 2, 'RSL-MGR': 2 };

/** One client's organisation: legal employer, locations, departments with renamed functions and scaled headcount. */
export function orgFor(c: ClientConfig) {
  const legal = {
    code: `${c.code}-SA`,
    name: `${c.name} (DEMO legal employer)`,
    name_ar: `${c.name_ar} (جهة عمل تجريبية)`,
    mol_establishment_no: `DEMO-MOL-${c.code}-${7000 + c.size}`,
    payroll_statutory_unit: `${c.short} Payroll Statutory Unit (DEMO)`,
  };
  const total = DEPARTMENTS.reduce((a, d) => a + d.roles.reduce((x, r) => x + r[4], 0), 0);
  const scale = (c.size * 1.03) / total;
  const departments: DeptSpec[] = DEPARTMENTS.map((d) => {
    const rn = c.orgRename[d.code];
    const divRename = (div: string, div_ar: string): [string, string] => {
      // Rename the division when a department carrying it was renamed with a division.
      const hit = Object.entries(c.orgRename).find(([code, v]) => v[2] && DEPARTMENTS.find((x) => x.code === code)?.division === div);
      return hit ? [hit[1][2]!, hit[1][3]!] : [div, div_ar];
    };
    const [division, division_ar] = rn?.[2] ? [rn[2], rn[3]!] : divRename(d.division, d.division_ar);
    return {
      ...d,
      name: rn?.[0] ?? d.name, name_ar: rn?.[1] ?? d.name_ar, division, division_ar,
      roles: d.roles.map(([code, title, ar, g, n]) => {
        const rr = c.roleRename[code];
        return [code, rr?.[0] ?? title, rr?.[1] ?? ar, g, Math.max(MIN_COUNT[code] ?? 1, Math.round(n * scale))] as RoleSpec;
      }),
    };
  });
  return { legal, locations: LOCATIONS_BY_CLIENT[c.key], departments };
}

/** Monthly basic salary bands in SAR. Illustrative. */
export const GRADES: { code: string; rank: number; min: number; max: number; notice: number }[] = [
  { code: 'G04', rank: 4, min: 4500, max: 7000, notice: 30 },
  { code: 'G05', rank: 5, min: 6000, max: 9000, notice: 30 },
  { code: 'G06', rank: 6, min: 7500, max: 11500, notice: 30 },
  { code: 'G07', rank: 7, min: 9500, max: 14500, notice: 30 },
  { code: 'G08', rank: 8, min: 12000, max: 18000, notice: 60 },
  { code: 'G09', rank: 9, min: 15000, max: 22500, notice: 60 },
  { code: 'G10', rank: 10, min: 18500, max: 28000, notice: 60 },
  { code: 'G11', rank: 11, min: 23000, max: 35000, notice: 90 },
  { code: 'G12', rank: 12, min: 29000, max: 44000, notice: 90 },
  { code: 'G13', rank: 13, min: 37000, max: 56000, notice: 90 },
  { code: 'G14', rank: 14, min: 47000, max: 71000, notice: 90 },
  { code: 'G15', rank: 15, min: 62000, max: 92000, notice: 90 },
];

export type RoleSpec = [code: string, title: string, titleAr: string, grade: string, count: number];

export type DeptSpec = {
  code: string;
  name: string;
  name_ar: string;
  division: string;
  division_ar: string;
  family: string;
  family_ar: string;
  location?: string;
  parent?: string;
  roles: RoleSpec[];
};

const EXEC = ['Executive Office', 'المكتب التنفيذي'] as const;
const COMM = ['Commercial', 'القطاع التجاري'] as const;
const INV = ['Investments', 'الاستثمار'] as const;
const FIN = ['Finance', 'المالية'] as const;
const RISK = ['Risk and Compliance', 'المخاطر والامتثال'] as const;
const TECH = ['Technology and Digital', 'التقنية والرقمنة'] as const;
const OPS = ['Operations', 'العمليات'] as const;
const HC = ['Human Resources', 'الموارد البشرية'] as const;

export const DEPARTMENTS: DeptSpec[] = [
  { code: 'CEO', name: 'Office of the Group CEO', name_ar: 'مكتب الرئيس التنفيذي للمجموعة', division: EXEC[0], division_ar: EXEC[1], family: 'Executive', family_ar: 'تنفيذي',
    roles: [['EXE-CEO', 'Group Chief Executive Officer', 'الرئيس التنفيذي للمجموعة', 'G15', 1], ['EXE-EA', 'Executive Office Manager', 'مدير المكتب التنفيذي', 'G09', 1], ['EXE-ADM', 'Executive Assistant', 'مساعد تنفيذي', 'G06', 2]] },
  { code: 'STR', name: 'Strategy and Transformation', name_ar: 'الاستراتيجية والتحول', division: EXEC[0], division_ar: EXEC[1], family: 'Strategy', family_ar: 'الاستراتيجية', parent: 'CEO',
    roles: [['STR-HD', 'Head of Strategy and Transformation', 'رئيس الاستراتيجية والتحول', 'G13', 1], ['STR-MGR', 'Transformation Manager', 'مدير التحول', 'G11', 2], ['STR-SR', 'Senior Strategy Analyst', 'محلل استراتيجية أول', 'G09', 2], ['STR-AN', 'Strategy Analyst', 'محلل استراتيجية', 'G07', 2]] },
  { code: 'AUD', name: 'Internal Audit', name_ar: 'التدقيق الداخلي', division: EXEC[0], division_ar: EXEC[1], family: 'Audit', family_ar: 'التدقيق', parent: 'CEO',
    roles: [['AUD-HD', 'Head of Internal Audit', 'رئيس التدقيق الداخلي', 'G13', 1], ['AUD-SR', 'Senior Internal Auditor', 'مدقق داخلي أول', 'G09', 2], ['AUD-AU', 'Internal Auditor', 'مدقق داخلي', 'G07', 2]] },
  { code: 'LEG', name: 'Legal and Company Secretariat', name_ar: 'الشؤون القانونية وأمانة السر', division: EXEC[0], division_ar: EXEC[1], family: 'Legal', family_ar: 'القانونية', parent: 'CEO',
    roles: [['LEG-GC', 'General Counsel', 'المستشار القانوني العام', 'G13', 1], ['LEG-SC', 'Senior Legal Counsel', 'مستشار قانوني أول', 'G11', 2], ['LEG-CS', 'Company Secretary', 'أمين سر الشركة', 'G09', 1], ['LEG-PL', 'Paralegal', 'مساعد قانوني', 'G06', 2]] },

  { code: 'COM', name: 'Commercial Leadership', name_ar: 'قيادة القطاع التجاري', division: COMM[0], division_ar: COMM[1], family: 'Sales', family_ar: 'المبيعات', parent: 'CEO',
    roles: [['COM-CCO', 'Chief Commercial Officer', 'الرئيس التجاري', 'G14', 1], ['COM-PMO', 'Commercial Planning Manager', 'مدير التخطيط التجاري', 'G10', 1]] },
  { code: 'RSL', name: 'Retail Sales', name_ar: 'مبيعات الأفراد', division: COMM[0], division_ar: COMM[1], family: 'Sales', family_ar: 'المبيعات', parent: 'COM',
    roles: [['RSL-HD', 'Head of Retail Sales', 'رئيس مبيعات الأفراد', 'G12', 1], ['RSL-MGR', 'Sales Manager', 'مدير مبيعات', 'G10', 4], ['RSL-SR', 'Senior Relationship Officer', 'مسؤول علاقات أول', 'G08', 10], ['RSL-RO', 'Relationship Officer', 'مسؤول علاقات', 'G06', 18], ['RSL-ASC', 'Sales Associate', 'مساعد مبيعات', 'G04', 8]] },
  { code: 'COR', name: 'Corporate Solutions', name_ar: 'حلول الشركات', division: COMM[0], division_ar: COMM[1], family: 'Sales', family_ar: 'المبيعات', parent: 'COM',
    roles: [['COR-HD', 'Head of Corporate Solutions', 'رئيس حلول الشركات', 'G12', 1], ['COR-RM', 'Corporate Relationship Manager', 'مدير علاقات الشركات', 'G10', 5], ['COR-ES', 'End-of-Service Scheme Specialist', 'أخصائي نظام مكافأة نهاية الخدمة', 'G09', 4], ['COR-AN', 'Corporate Sales Analyst', 'محلل مبيعات الشركات', 'G07', 6]] },
  { code: 'CXP', name: 'Customer Experience', name_ar: 'تجربة العملاء', division: COMM[0], division_ar: COMM[1], family: 'Customer Service', family_ar: 'خدمة العملاء', parent: 'COM',
    roles: [['CXP-HD', 'Head of Customer Experience', 'رئيس تجربة العملاء', 'G12', 1], ['CXP-MGR', 'Customer Experience Manager', 'مدير تجربة العملاء', 'G10', 2], ['CXP-SR', 'Senior Customer Experience Officer', 'مسؤول تجربة عملاء أول', 'G07', 6], ['CXP-OF', 'Customer Experience Officer', 'مسؤول تجربة العملاء', 'G06', 8], ['CXP-CC', 'Contact Centre Agent', 'موظف مركز الاتصال', 'G04', 10]] },
  { code: 'CCN', name: 'Customer Centres', name_ar: 'مراكز العملاء', division: COMM[0], division_ar: COMM[1], family: 'Customer Service', family_ar: 'خدمة العملاء', parent: 'COM',
    roles: [['CCN-MGR', 'Customer Centre Manager', 'مدير مركز العملاء', 'G09', 3], ['CCN-SR', 'Senior Customer Service Officer', 'مسؤول خدمة عملاء أول', 'G06', 6], ['CCN-OF', 'Customer Service Officer', 'مسؤول خدمة العملاء', 'G05', 12]] },
  { code: 'MKT', name: 'Marketing and Communications', name_ar: 'التسويق والاتصال', division: COMM[0], division_ar: COMM[1], family: 'Marketing', family_ar: 'التسويق', parent: 'COM',
    roles: [['MKT-HD', 'Head of Marketing and Communications', 'رئيس التسويق والاتصال', 'G12', 1], ['MKT-MGR', 'Brand Manager', 'مدير العلامة التجارية', 'G10', 2], ['MKT-DM', 'Digital Marketing Specialist', 'أخصائي تسويق رقمي', 'G08', 4], ['MKT-CO', 'Communications Officer', 'مسؤول اتصال', 'G06', 4]] },

  { code: 'INV', name: 'Investment Management', name_ar: 'إدارة الاستثمار', division: INV[0], division_ar: INV[1], family: 'Investments', family_ar: 'الاستثمار', parent: 'CEO',
    roles: [['INV-CIO', 'Group Chief Investment Officer', 'الرئيس التنفيذي للاستثمار', 'G14', 1], ['INV-PM', 'Portfolio Manager', 'مدير محفظة', 'G12', 3], ['INV-SR', 'Senior Investment Analyst', 'محلل استثمار أول', 'G10', 4], ['INV-AN', 'Investment Analyst', 'محلل استثمار', 'G08', 5]] },
  { code: 'TRS', name: 'Treasury', name_ar: 'الخزينة', division: INV[0], division_ar: INV[1], family: 'Investments', family_ar: 'الاستثمار', parent: 'INV',
    roles: [['TRS-HD', 'Head of Treasury', 'رئيس الخزينة', 'G12', 1], ['TRS-DL', 'Treasury Dealer', 'متداول خزينة', 'G09', 3], ['TRS-OF', 'Treasury Officer', 'مسؤول خزينة', 'G07', 2]] },
  { code: 'REA', name: 'Real Estate Investments', name_ar: 'الاستثمار العقاري', division: INV[0], division_ar: INV[1], family: 'Investments', family_ar: 'الاستثمار', parent: 'INV',
    roles: [['REA-HD', 'Head of Real Estate', 'رئيس الاستثمار العقاري', 'G12', 1], ['REA-AM', 'Asset Manager', 'مدير أصول', 'G10', 2], ['REA-AN', 'Real Estate Analyst', 'محلل عقاري', 'G08', 3]] },

  { code: 'FIN', name: 'Finance and Accounting', name_ar: 'المالية والمحاسبة', division: FIN[0], division_ar: FIN[1], family: 'Finance', family_ar: 'المالية', parent: 'CEO',
    roles: [['FIN-CFO', 'Group Chief Financial Officer', 'الرئيس التنفيذي للمالية', 'G14', 1], ['FIN-FC', 'Financial Controller', 'المراقب المالي', 'G12', 1], ['FIN-MGR', 'Finance Manager', 'مدير مالي', 'G10', 3], ['FIN-SA', 'Senior Accountant', 'محاسب أول', 'G08', 5], ['FIN-AC', 'Accountant', 'محاسب', 'G06', 5]] },

  { code: 'RSK', name: 'Risk Management', name_ar: 'إدارة المخاطر', division: RISK[0], division_ar: RISK[1], family: 'Risk', family_ar: 'المخاطر', parent: 'CEO',
    roles: [['RSK-CRO', 'Chief Risk Officer', 'الرئيس التنفيذي للمخاطر', 'G13', 1], ['RSK-MGR', 'Risk Manager', 'مدير مخاطر', 'G10', 2], ['RSK-AN', 'Risk Analyst', 'محلل مخاطر', 'G08', 5]] },
  { code: 'CMP', name: 'Compliance and AML', name_ar: 'الامتثال ومكافحة غسل الأموال', division: RISK[0], division_ar: RISK[1], family: 'Compliance', family_ar: 'الامتثال', parent: 'RSK',
    roles: [['CMP-HD', 'Head of Compliance', 'رئيس الامتثال', 'G12', 1], ['CMP-MLRO', 'Money Laundering Reporting Officer', 'مسؤول الإبلاغ عن غسل الأموال', 'G10', 1], ['CMP-OF', 'Compliance Officer', 'مسؤول امتثال', 'G08', 6]] },
  { code: 'SHR', name: 'Shariah Compliance', name_ar: 'الرقابة الشرعية', division: RISK[0], division_ar: RISK[1], family: 'Shariah', family_ar: 'الشريعة', parent: 'RSK',
    roles: [['SHR-HD', 'Head of Shariah Compliance', 'رئيس الرقابة الشرعية', 'G12', 1], ['SHR-AU', 'Shariah Auditor', 'مدقق شرعي', 'G09', 3]] },

  { code: 'TEC', name: 'Technology', name_ar: 'التقنية', division: TECH[0], division_ar: TECH[1], family: 'Technology', family_ar: 'التقنية', parent: 'CEO',
    roles: [['TEC-CTO', 'Chief Technology Officer', 'الرئيس التنفيذي للتقنية', 'G14', 1], ['TEC-MGR', 'Technology Manager', 'مدير تقنية', 'G11', 3], ['TEC-SE', 'Senior Software Engineer', 'مهندس برمجيات أول', 'G10', 6], ['TEC-ENG', 'Software Engineer', 'مهندس برمجيات', 'G08', 8], ['TEC-SUP', 'IT Support Specialist', 'أخصائي دعم تقني', 'G06', 6]] },
  { code: 'DIG', name: 'Digital Products', name_ar: 'المنتجات الرقمية', division: TECH[0], division_ar: TECH[1], family: 'Technology', family_ar: 'التقنية', parent: 'TEC',
    roles: [['DIG-HD', 'Head of Digital Products', 'رئيس المنتجات الرقمية', 'G12', 1], ['DIG-PO', 'Product Owner', 'مالك منتج', 'G10', 4], ['DIG-UX', 'UX Designer', 'مصمم تجربة مستخدم', 'G08', 4], ['DIG-DA', 'Data Analyst', 'محلل بيانات', 'G08', 4]] },
  { code: 'SEC', name: 'Information Security', name_ar: 'أمن المعلومات', division: TECH[0], division_ar: TECH[1], family: 'Technology', family_ar: 'التقنية', parent: 'TEC',
    roles: [['SEC-CISO', 'Chief Information Security Officer', 'رئيس أمن المعلومات', 'G12', 1], ['SEC-AN', 'Security Analyst', 'محلل أمن', 'G09', 5]] },

  { code: 'OPS', name: 'Operations and Bond Services', name_ar: 'العمليات وخدمات الصكوك', division: OPS[0], division_ar: OPS[1], family: 'Operations', family_ar: 'العمليات', parent: 'CEO',
    roles: [['OPS-COO', 'Chief Operating Officer', 'الرئيس التنفيذي للعمليات', 'G14', 1], ['OPS-MGR', 'Operations Manager', 'مدير عمليات', 'G10', 2], ['OPS-SR', 'Senior Operations Officer', 'مسؤول عمليات أول', 'G07', 6], ['OPS-OF', 'Operations Officer', 'مسؤول عمليات', 'G05', 10]] },
  { code: 'PRC', name: 'Procurement and Administration', name_ar: 'المشتريات والشؤون الإدارية', division: OPS[0], division_ar: OPS[1], family: 'Operations', family_ar: 'العمليات', parent: 'OPS',
    roles: [['PRC-MGR', 'Procurement Manager', 'مدير المشتريات', 'G10', 1], ['PRC-OF', 'Procurement Officer', 'مسؤول مشتريات', 'G07', 3], ['PRC-ADM', 'Administration Officer', 'مسؤول شؤون إدارية', 'G05', 4]] },

  { code: 'HUC', name: 'Human Capital', name_ar: 'رأس المال البشري', division: HC[0], division_ar: HC[1], family: 'Human Capital', family_ar: 'رأس المال البشري', parent: 'CEO',
    roles: [['HUC-CHRO', 'Chief Human Capital Officer', 'الرئيس التنفيذي لرأس المال البشري', 'G14', 1], ['HUC-BP', 'HR Business Partner', 'شريك أعمال الموارد البشرية', 'G10', 3], ['HUC-TA', 'Talent Acquisition Lead', 'قائد استقطاب المواهب', 'G10', 1], ['HUC-TAS', 'Talent Acquisition Specialist', 'أخصائي استقطاب المواهب', 'G08', 2], ['HUC-PAY', 'Payroll and HR Operations Manager', 'مدير الرواتب وعمليات الموارد البشرية', 'G10', 1], ['HUC-OPS', 'HR Operations Officer', 'مسؤول عمليات الموارد البشرية', 'G06', 3], ['HUC-LD', 'Learning and Development Specialist', 'أخصائي التعلم والتطوير', 'G08', 1], ['HUC-EM', 'Emiratisation Specialist', 'أخصائي التوطين', 'G08', 1]] },
];

export const ELEMENT_TYPES = [
  ['BASIC', 'Basic salary', 'الراتب الأساسي', 'EARNING', true],
  ['HOUSING', 'Housing allowance', 'بدل السكن', 'EARNING', true],
  ['TRANSPORT', 'Transport allowance', 'بدل المواصلات', 'EARNING', true],
  ['OTHER_ALW', 'Other allowance', 'بدلات أخرى', 'EARNING', true],
  ['OVERTIME', 'Overtime', 'العمل الإضافي', 'EARNING', false],
  ['BONUS', 'Performance bonus', 'مكافأة الأداء', 'EARNING', false],
  ['ADVANCE_PAY', 'Salary advance payment', 'دفعة السلفة', 'EARNING', false],
  ['ADVANCE_REC', 'Salary advance recovery', 'استرداد السلفة', 'DEDUCTION', true],
  ['UNPAID_LEAVE', 'Unpaid leave deduction', 'خصم إجازة بدون راتب', 'DEDUCTION', false],
  ['GOSI_EE', 'GOSI, employee share (annuities and SANED)', 'التأمينات الاجتماعية - حصة الموظف', 'DEDUCTION', true],
  ['GOSI_ER', 'GOSI, employer share', 'التأمينات الاجتماعية - حصة صاحب العمل', 'EMPLOYER_CONTRIBUTION', true],
  ['EOS_PROVISION', 'End-of-service award provision', 'مخصص مكافأة نهاية الخدمة', 'EMPLOYER_CONTRIBUTION', false],
  ['LEAVE_ENCASH', 'Leave encashment', 'بدل الإجازات غير المستخدمة', 'EARNING', false],
  ['GRATUITY', 'End-of-service gratuity', 'مكافأة نهاية الخدمة', 'EARNING', false],
] as const;

export const ABSENCE_TYPES = [
  { code: 'ANNUAL', name: 'Annual leave', name_ar: 'إجازة سنوية', plan: 'Annual leave plan', ent: 21, paid: 'Full pay; days per the company handbook (minimum 21, 30 after five years)', cert: false, legal: 'Saudi Labor Law Art. 109' },
  { code: 'SICK', name: 'Sick leave', name_ar: 'إجازة مرضية', plan: 'Sick leave plan', ent: 120, paid: '30 days full, 60 at 75%, 30 unpaid, in a year', cert: true, legal: 'Art. 117' },
  { code: 'MATERNITY', name: 'Maternity leave', name_ar: 'إجازة وضع', plan: 'Maternity', ent: 84, paid: '12 weeks full pay', cert: true, legal: 'Art. 151 (as amended 2025)' },
  { code: 'PATERNITY', name: 'Paternity leave', name_ar: 'إجازة أبوة', plan: 'Paternity', ent: 3, paid: 'Full pay, within 7 days of the birth', cert: true, legal: 'Art. 113' },
  { code: 'BEREAVEMENT', name: 'Bereavement leave', name_ar: 'إجازة وفاة', plan: 'Bereavement', ent: 5, paid: 'Full pay: 5 days spouse, parent or child; 3 days sibling', cert: false, legal: 'Art. 113' },
  { code: 'HAJJ', name: 'Hajj leave', name_ar: 'إجازة الحج', plan: 'Hajj', ent: 15, paid: 'Full pay, 10 to 15 days, once, after two years of service', cert: true, legal: 'Art. 114' },
  { code: 'UNPAID', name: 'Unpaid leave', name_ar: 'إجازة بدون راتب', plan: 'Unpaid', ent: 0, paid: 'Unpaid; deducted in payroll', cert: false, legal: 'HR-04 §4.9' },
  { code: 'MARRIAGE', name: 'Marriage leave', name_ar: 'إجازة زواج', plan: 'Marriage', ent: 5, paid: 'Full pay, 5 days', cert: true, legal: 'Art. 113' },
] as const;
