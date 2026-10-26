/**
 * The pay element catalogue, as Tasama's Elements tab lays it out (design/walkthrough-addendum.md R6): each element is an
 * earning or a deduction, recurring or not, inside or outside the GOSI and end-of-service wages. The HRMS codes are the
 * ones in hcm.element_types; a client's extra allowances (payroll-policy.ts) join the catalogue under their own codes.
 */
export type ElementGroup = 'RECURRING_EARNING' | 'NON_RECURRING_EARNING' | 'DEDUCTION' | 'INFORMATION';
export type CatalogueElement = {
  code: string; name: string; name_ar: string; group: ElementGroup;
  /** In the GOSI contributory wage (basic and housing, by law). */
  gosi: boolean;
  /** In the end-of-service wage (the regular allowances, Art. 2 and 84). */
  eos: boolean;
  /** A deduction recovered over a term, in months (an advance, a loan); null when it is one-off or open-ended. */
  termMonths?: number | null;
  /** Where it comes from each month. */
  source: string; source_ar: string;
};

const E = (code: string, name: string, name_ar: string, group: ElementGroup, gosi: boolean, eos: boolean, source: string, source_ar: string, termMonths: number | null = null): CatalogueElement =>
  ({ code, name, name_ar, group, gosi, eos, termMonths, source, source_ar });

export const ELEMENT_CATALOGUE: CatalogueElement[] = [
  // Recurring earnings: the contract, changed only by a promotion or a policy change.
  E('BASIC', 'Basic salary', 'الراتب الأساسي', 'RECURRING_EARNING', true, true, 'The contract', 'العقد'),
  E('HOUSING', 'Housing allowance', 'بدل السكن', 'RECURRING_EARNING', true, true, 'The contract and the policy', 'العقد والسياسة'),
  E('TRANSPORT', 'Transport allowance', 'بدل المواصلات', 'RECURRING_EARNING', false, true, 'The contract and the policy', 'العقد والسياسة'),
  E('MOBILE', 'Mobile allowance', 'بدل الهاتف', 'RECURRING_EARNING', false, true, 'The policy, for eligible roles', 'السياسة للأدوار المستحقة'),
  E('OTHER_ALW', 'Other allowance', 'بدلات أخرى', 'RECURRING_EARNING', false, true, 'The contract', 'العقد'),
  // Non-recurring earnings: the month's changes, from the client's HR operations or a case.
  E('BACK_PAY', 'Retro (basic, housing, transport, other)', 'فروقات بأثر رجعي', 'NON_RECURRING_EARNING', true, false, 'A late joiner or a backdated change, recalculated by month', 'موظف متأخر الانضمام أو تغيير بأثر رجعي'),
  E('OVERTIME', 'Overtime', 'العمل الإضافي', 'NON_RECURRING_EARNING', false, false, 'The month\'s overtime sheet', 'كشف العمل الإضافي'),
  E('ADV_HOUSING', 'Advance housing', 'بدل السكن المقدم', 'NON_RECURRING_EARNING', false, false, 'The policy: housing paid ahead, recovered over the year', 'السياسة: بدل السكن يُدفع مقدماً ويُسترد على مدار السنة'),
  E('BUSINESS_TRIP', 'Business trip allowance', 'بدل رحلة عمل', 'NON_RECURRING_EARNING', false, false, 'The approved trip', 'رحلة العمل المعتمدة'),
  E('BONUS', 'Bonus', 'المكافأة', 'NON_RECURRING_EARNING', false, false, 'The bonus decision', 'قرار المكافأة'),
  E('EDUCATION', 'Education allowance', 'بدل التعليم', 'NON_RECURRING_EARNING', false, false, 'The policy, per child', 'السياسة لكل طفل'),
  E('RELOCATION', 'Relocation allowance', 'بدل الانتقال', 'NON_RECURRING_EARNING', false, false, 'The offer', 'عرض العمل'),
  E('TICKET', 'Air ticket', 'تذكرة السفر', 'NON_RECURRING_EARNING', false, false, 'The policy, at leave', 'السياسة عند الإجازة'),
  E('VACATION_ALW', 'Vacation allowance', 'بدل الإجازة', 'NON_RECURRING_EARNING', false, false, 'The policy, at leave', 'السياسة عند الإجازة'),
  E('WELLNESS', 'Wellness allowance', 'بدل الصحة', 'NON_RECURRING_EARNING', false, false, 'The policy', 'السياسة'),
  E('LEAVE_ENCASH', 'Leave encashment', 'بدل الإجازات غير المستخدمة', 'NON_RECURRING_EARNING', false, false, 'The final settlement', 'التسوية النهائية'),
  E('GRATUITY', 'End-of-service award', 'مكافأة نهاية الخدمة', 'NON_RECURRING_EARNING', false, false, 'The final settlement', 'التسوية النهائية'),
  // Deductions.
  E('GOSI_EE', 'GOSI, employee share', 'التأمينات - حصة الموظف', 'DEDUCTION', false, false, 'The registration and the rates', 'التسجيل والنسب'),
  E('GOSI_ARREARS', 'Retro GOSI', 'التأمينات على الفروقات', 'DEDUCTION', false, false, 'With the retro', 'مع الفروقات'),
  E('ADVANCE_REC', 'Salary advance recovery', 'استرداد السلفة', 'DEDUCTION', false, false, 'The advance case, by instalment', 'حالة السلفة بالأقساط', 6),
  E('ADV_HOUSING_REC', 'Advance housing recovery', 'استرداد بدل السكن المقدم', 'DEDUCTION', false, false, 'The housing advance, over the year', 'بدل السكن المقدم على مدار السنة', 12),
  E('LOAN_REC', 'Loan deduction', 'خصم القرض', 'DEDUCTION', false, false, 'The loan schedule', 'جدول القرض', 3),
  E('LATE_FINE', 'Lateness fine', 'غرامة التأخير', 'DEDUCTION', false, false, 'Attendance, under the penalty table', 'الحضور وفق جدول الجزاءات'),
  E('DISCIPLINARY', 'Disciplinary deduction', 'خصم تأديبي', 'DEDUCTION', false, false, 'A disciplinary decision', 'قرار تأديبي'),
  E('COC', 'Cost of care deduction', 'خصم تكلفة الرعاية', 'DEDUCTION', false, false, 'The client\'s instruction', 'تعليمات العميل'),
  E('UNPAID_LEAVE', 'Unpaid leave', 'إجازة بدون راتب', 'DEDUCTION', false, false, 'The leave record', 'سجل الإجازات'),
  // Information: counted, never paid as such.
  E('OT_HOURS', 'Overtime hours', 'ساعات العمل الإضافي', 'INFORMATION', false, false, 'The overtime sheet', 'كشف العمل الإضافي'),
  E('ABSENT_DAYS', 'Absent days', 'أيام الغياب', 'INFORMATION', false, false, 'Attendance', 'الحضور'),
  E('GOSI_ER', 'GOSI, employer share', 'التأمينات - حصة صاحب العمل', 'INFORMATION', false, false, 'The registration and the rates', 'التسجيل والنسب'),
  E('EOS_PROVISION', 'End-of-service provision', 'مخصص نهاية الخدمة', 'INFORMATION', false, false, 'The engine, each month', 'المحرك كل شهر'),
];

export const GROUP_LABEL: Record<ElementGroup, [string, string]> = {
  RECURRING_EARNING: ['Recurring earnings', 'الاستحقاقات الثابتة'], NON_RECURRING_EARNING: ['Non-recurring earnings', 'الاستحقاقات غير الثابتة'],
  DEDUCTION: ['Deductions', 'الاستقطاعات'], INFORMATION: ['Information', 'للمعلومة'],
};
