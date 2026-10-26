/**
 * Tasama's two phase checklists, as its process slides carry them (design/walkthrough-addendum.md R40, R41).
 *
 *  - Onboarding: the 26 requirements Tasama asks a new client for, in seven categories, inside 9 working days and
 *    before the first cut-off. The ones a lane of the client's files covers are ticked by Intiqal.
 *  - Offboarding: the 20 items Tasama shares with the client when its payroll goes back, inside 7 working days.
 */
export type ActivationItem = { n: number; category: string; category_ar: string; label: string; label_ar: string; lane: string | null };
const A = (n: number, category: string, category_ar: string, label: string, label_ar: string, lane: string | null = null): ActivationItem => ({ n, category, category_ar, label, label_ar, lane });

export const ACTIVATION_SLA_DAYS = 9;
export const ACTIVATION_ITEMS: ActivationItem[] = [
  A(1, 'HR governance', 'حوكمة الموارد البشرية', 'HR policies', 'سياسات الموارد البشرية', 'policy'),
  A(2, 'HR governance', 'حوكمة الموارد البشرية', 'Delegation of authority', 'تفويض الصلاحيات'),
  A(3, 'HR governance', 'حوكمة الموارد البشرية', 'Organisational structure', 'الهيكل التنظيمي', 'roster'),
  A(4, 'Compensation', 'التعويضات', 'Salary scale framework', 'سلم الرواتب', 'policy'),
  A(5, 'Platforms', 'المنصات', 'Qiwa access', 'صلاحية منصة قوى'),
  A(6, 'Platforms', 'المنصات', 'Mudad access', 'صلاحية منصة مدد'),
  A(7, 'Platforms', 'المنصات', 'GOSI access', 'صلاحية التأمينات الاجتماعية'),
  A(8, 'Platforms', 'المنصات', 'Riyadh Chamber access', 'صلاحية غرفة الرياض'),
  A(9, 'Medical insurance', 'التأمين الطبي', 'Company name on the policy', 'اسم الشركة في الوثيقة'),
  A(10, 'Medical insurance', 'التأمين الطبي', 'Policy number', 'رقم الوثيقة'),
  A(11, 'Medical insurance', 'التأمين الطبي', 'Contact details', 'بيانات الاتصال'),
  A(12, 'Medical insurance', 'التأمين الطبي', 'Credentials, if applicable', 'بيانات الدخول إن وجدت'),
  A(13, 'Employee data', 'بيانات الموظفين', 'Employment contracts', 'عقود العمل', 'contracts'),
  A(14, 'Employee data', 'بيانات الموظفين', 'Bank IBAN certificates', 'شهادات الآيبان', 'roster'),
  A(15, 'Employee data', 'بيانات الموظفين', 'Employee IDs and family IDs, if any', 'هويات الموظفين وأفراد الأسرة', 'roster'),
  A(16, 'Employee data', 'بيانات الموظفين', 'Passports', 'جوازات السفر'),
  A(17, 'Employee data', 'بيانات الموظفين', 'Curriculum vitae', 'السير الذاتية'),
  A(18, 'Employee data', 'بيانات الموظفين', 'Financial obligations on employees, if any', 'الالتزامات المالية على الموظفين', 'history'),
  A(19, 'Employee data', 'بيانات الموظفين', 'Violations record, if any', 'سجل المخالفات'),
  A(20, 'Payroll', 'الرواتب', 'Bank credentials', 'بيانات الدخول للبنك'),
  A(21, 'Payroll', 'الرواتب', 'Previous payroll records', 'سجلات الرواتب السابقة', 'history'),
  A(22, 'Payroll', 'الرواتب', 'Payment disbursement dates', 'تواريخ صرف الرواتب', 'client'),
  A(23, 'Leave management', 'إدارة الإجازات', 'Leave history', 'سجل الإجازات', 'leave'),
  A(24, 'Leave management', 'إدارة الإجازات', 'Annual leave balances', 'أرصدة الإجازات السنوية', 'leave'),
  A(25, 'Company documents', 'مستندات الشركة', 'Company logo', 'شعار الشركة', 'client'),
  A(26, 'Company documents', 'مستندات الشركة', 'Commercial registration', 'السجل التجاري', 'client'),
];

export type HandoverItem = { n: number; label: string; label_ar: string };
const H = (n: number, label: string, label_ar: string): HandoverItem => ({ n, label, label_ar });

export const HANDOVER_SLA_DAYS = 7;
export const HANDOVER_ITEMS: HandoverItem[] = [
  H(1, 'Payroll reports', 'تقارير الرواتب'),
  H(2, 'Medical insurance registration and SPOC details (insurer account manager)', 'تسجيل التأمين الطبي وبيانات مسؤول الحساب'),
  H(3, 'Records of medical insurance (employees and dependents)', 'سجلات التأمين الطبي للموظفين والتابعين'),
  H(4, 'Employee letters', 'خطابات الموظفين'),
  H(5, 'Employee leave requests (approved and signed forms and records)', 'طلبات الإجازات المعتمدة والموقعة'),
  H(6, 'Overtime processing and overtime history, if any', 'معالجة العمل الإضافي وسجله'),
  H(7, 'Allowance requests', 'طلبات البدلات'),
  H(8, 'Promotions, if any (history of changes)', 'الترقيات وسجل التغييرات'),
  H(9, 'Business trip records and supporting documents', 'سجلات رحلات العمل ومستنداتها'),
  H(10, 'Mudad status', 'حالة منصة مدد'),
  H(11, 'Mudad account details', 'بيانات حساب مدد'),
  H(12, 'Resignations, if any', 'الاستقالات إن وجدت'),
  H(13, 'List of leavers in the year to date', 'قائمة المغادرين خلال السنة'),
  H(14, 'End-of-service documents, if any', 'مستندات نهاية الخدمة'),
  H(15, 'GOSI account access', 'صلاحية حساب التأمينات الاجتماعية'),
  H(16, 'Employee master data: records and documents (grade, date of hire, date of birth, family members, IBAN, salary details, benefit entitlements)', 'بيانات الموظفين الأساسية ومستنداتهم'),
  H(17, 'HR policy, in case available', 'سياسة الموارد البشرية إن وجدت'),
  H(18, 'Templates in use: employee letters, leave request, forms', 'النماذج المستخدمة: الخطابات وطلبات الإجازة والنماذج'),
  H(19, 'The company\'s HR email and password', 'بريد الموارد البشرية وكلمة المرور'),
  H(20, 'Every access given to Tasama revoked (bank, ERP and GOSI)', 'إلغاء كل الصلاحيات الممنوحة لتسامى (البنك ونظام الموارد والتأمينات)'),
];
