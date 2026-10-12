/**
 * Reason codes: why a case was escalated, rejected or returned, and what kind
 * of payroll finding it was. A fixed list, chosen when the problem happens, is
 * what lets Basira say WHY a kind of problem is rising, not only that it is.
 */
export type Category = 'ESCALATION' | 'REJECTION' | 'RETURNED' | 'PAYROLL_FINDING';

export const CATEGORY_LABEL: Record<Category, [string, string]> = {
  ESCALATION: ['Escalations', 'التصعيدات'],
  REJECTION: ['Rejections', 'الرفض'],
  RETURNED: ['Returned for correction', 'الإعادة للتصحيح'],
  PAYROLL_FINDING: ['Payroll pre-run findings', 'ملاحظات فحص الرواتب'],
};

export const REASONS: Record<string, { category: Category; label: string; label_ar: string }> = {
  APPROVER_UNAVAILABLE: { category: 'ESCALATION', label: 'Approver away, no delegate set', label_ar: 'المعتمد غائب دون تفويض' },
  APPROVER_SLOW: { category: 'ESCALATION', label: 'Approver has not acted', label_ar: 'لم يتخذ المعتمد إجراءً' },
  MISSING_DOCUMENT: { category: 'ESCALATION', label: 'Waiting for a document', label_ar: 'بانتظار مستند' },
  CLIENT_DELAY: { category: 'ESCALATION', label: 'Waiting on the client\'s HR', label_ar: 'بانتظار الموارد البشرية لدى العميل' },
  OUTSIDE_POLICY: { category: 'REJECTION', label: 'Outside policy', label_ar: 'خارج السياسة' },
  TEAM_COVER: { category: 'REJECTION', label: 'Team cover', label_ar: 'تغطية الفريق' },
  DOCUMENT_MISSING: { category: 'REJECTION', label: 'Supporting document missing', label_ar: 'المستند الداعم غير مرفق' },
  DUPLICATE: { category: 'REJECTION', label: 'Duplicate request', label_ar: 'طلب مكرر' },
  NOT_RECORDED: { category: 'REJECTION', label: 'Reason not recorded', label_ar: 'لم يُسجل السبب' },
  DATA_WRONG_IN_HRMS: { category: 'RETURNED', label: 'Data wrong in the HRMS', label_ar: 'بيانات خاطئة في نظام الموارد البشرية' },
  WRONG_ROUTING: { category: 'RETURNED', label: 'Sent to the wrong approver', label_ar: 'أحيل إلى معتمد خاطئ' },
  ELEMENT_ENTRY_MISSING: { category: 'PAYROLL_FINDING', label: 'Salary change not in element entries', label_ar: 'تغيير الراتب غير مسجل في عناصر الرواتب' },
  LEAVER_STILL_PAID: { category: 'PAYROLL_FINDING', label: 'Leaver still on the payroll', label_ar: 'موظف مغادر ما زال في الرواتب' },
  DEDUCTION_CAP: { category: 'PAYROLL_FINDING', label: 'Deductions above the 50% cap', label_ar: 'خصومات تتجاوز 50%' },
  GOSI_MISSING: { category: 'PAYROLL_FINDING', label: 'GOSI line missing', label_ar: 'اشتراك التأمينات غير موجود' },
};

/** The reasons a person can pick when rejecting a case. */
export const REJECT_REASONS = ['OUTSIDE_POLICY', 'TEAM_COVER', 'DOCUMENT_MISSING', 'DUPLICATE'] as const;

export const reasonLabel = (code: string, ar = false) => (REASONS[code] ? (ar ? REASONS[code].label_ar : REASONS[code].label) : code);
