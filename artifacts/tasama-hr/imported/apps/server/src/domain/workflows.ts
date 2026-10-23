/**
 * The 21 agentic workflows, hire to retire, under Saudi Labor Law and each
 * client's handbook, Tasama-level workflows (WF-22 to WF-25) that run across
 * clients, and the payroll workflows from WF-26 (design/payroll-addendum.md §7).
 *
 * Every step states its actor, inputs, outputs and the decision it makes (the
 * Atelier workflow contract). `actor_type` is AGENT, HUMAN or SYSTEM; a HUMAN
 * step's `actor` is a ROLE, resolved to a person by the engine. SYSTEM steps
 * are the connector: the only place anything is written to the client's HRMS
 * (Oracle HCM or Odoo). TASAMA_OPS is Tasama HR Operations.
 *
 * Coverage is honest: `implemented` runs end to end in the engine;
 * `partial` has screens and data, with some steps manual; `designed` is
 * specified only.
 */
export type StepDef = {
  key: string;
  actor_type: 'AGENT' | 'HUMAN' | 'SYSTEM';
  actor: string;
  label: string;
  label_ar: string;
  inputs: string;
  outputs: string;
  decision: string;
};
export type WorkflowDef = {
  id: string; num: number; name: string; name_ar: string; stage: string; coverage: 'implemented' | 'partial' | 'designed';
  trigger: string; agents: string[]; decision_by: string; steps: StepDef[];
};

const S = (key: string, actor_type: StepDef['actor_type'], actor: string, label: string, label_ar: string, inputs: string, outputs: string, decision: string): StepDef =>
  ({ key, actor_type, actor, label, label_ar, inputs, outputs, decision });

export const WORKFLOWS: WorkflowDef[] = [
  { id: 'WF-01', num: 1, name: 'Position request', name_ar: 'طلب وظيفة', stage: 'Plan', coverage: 'implemented', trigger: 'A manager asks for a new or backfill position', agents: ['saeed'], decision_by: 'HRBP; CHRO at G11+',
    steps: [
      S('intake', 'HUMAN', 'LINE_MANAGER', 'Manager describes the need', 'المدير يصف الاحتياج', 'Role, reason, grade sought, start date', 'Draft position request', 'Whether to ask'),
      S('check', 'AGENT', 'saeed', 'Check budget, grade and Saudization', 'التحقق من الميزانية والدرجة والتوطين', 'Department headcount plan, grade structure, workforce, Nitaqat band', 'Budget position, grade fit, Saudization (Nitaqat) effect, draft job description', 'Within budget or not'),
      S('hrbp', 'HUMAN', 'HRBP', 'HRBP approves', 'اعتماد شريك الأعمال', 'Saeed\'s check, the draft', 'Approved or returned', 'Approve the position'),
      S('chro', 'HUMAN', 'CHRO', 'CHRO approves (G11+ or unbudgeted)', 'اعتماد الرئيس التنفيذي للموارد البشرية', 'The approved request', 'Approved or declined', 'Approve a senior or unbudgeted position'),
      S('post', 'SYSTEM', 'connector', 'Create the position in the HRMS', 'إنشاء الوظيفة في النظام', 'Approved position', 'POST /positions; empupdate event', 'None'),
    ] },
  { id: 'WF-02', num: 2, name: 'Requisition and job ad', name_ar: 'طلب التوظيف والإعلان', stage: 'Attract', coverage: 'implemented', trigger: 'A position is approved (HRMS event)', agents: ['hessa'], decision_by: 'Talent acquisition',
    steps: [
      S('draft', 'AGENT', 'hessa', 'Draft requisition and bilingual ad', 'صياغة طلب التوظيف والإعلان باللغتين', 'Position, job description', 'Requisition, criteria (must / nice), ad in English and Arabic', 'None'),
      S('internal', 'AGENT', 'hessa', 'Match internal talent and Jadarat first', 'مطابقة المواهب الداخلية وجدارات أولاً', 'Criteria, talent profiles', 'Internal matches to invite', 'None'),
      S('approve', 'HUMAN', 'TA', 'Talent acquisition approves posting', 'اعتماد النشر', 'Draft requisition', 'Approved or edited', 'Post the requisition'),
      S('post', 'SYSTEM', 'connector', 'Open the requisition', 'فتح طلب التوظيف', 'Approved requisition', 'POST /recruitingJobRequisitions', 'None'),
    ] },
  { id: 'WF-03', num: 3, name: 'Screening evidence', name_ar: 'أدلة الفرز', stage: 'Select', coverage: 'implemented', trigger: 'Applications arrive', agents: ['hessa'], decision_by: 'Recruiter, hiring manager',
    steps: [
      S('evidence', 'AGENT', 'hessa', 'Extract evidence against each criterion', 'استخراج الأدلة لكل معيار', 'Applications, criteria', 'Evidence table per candidate; no score, no rank', 'None. Hessa does not reject'),
      S('shortlist', 'HUMAN', 'TA', 'Recruiter shortlists', 'مسؤول التوظيف يعد القائمة المختصرة', 'Evidence', 'Shortlist with reasons', 'Who goes forward'),
      S('agree', 'HUMAN', 'LINE_MANAGER', 'Hiring manager agrees the shortlist', 'المدير يوافق على القائمة', 'Shortlist', 'Agreed shortlist', 'Agree or add'),
      S('update', 'SYSTEM', 'connector', 'Update candidate phases', 'تحديث مراحل المرشحين', 'Decisions', 'PATCH /recruitingCandidateApplications', 'None'),
    ] },
  { id: 'WF-04', num: 4, name: 'Interviews and assessment centre', name_ar: 'المقابلات ومركز التقييم', stage: 'Select', coverage: 'partial', trigger: 'Shortlist agreed', agents: ['hessa', 'tamkeen'], decision_by: 'Panel',
    steps: [
      S('schedule', 'AGENT', 'hessa', 'Schedule panels from calendars', 'جدولة المقابلات من التقويمات', 'Shortlist, panel calendars (M365)', 'Invitations', 'None'),
      S('score', 'HUMAN', 'LINE_MANAGER', 'Panel scores each competency', 'اللجنة تقيّم كل كفاءة', 'Interview', 'Scores 1-5 with notes', 'Scores'),
      S('integrate', 'AGENT', 'tamkeen', 'Flag assessor spread, draft integration report', 'رصد تباين المقيمين وصياغة تقرير الدمج', 'All scores', 'Integration report', 'None'),
      S('decide', 'HUMAN', 'LINE_MANAGER', 'Integration session selects', 'جلسة الدمج تختار', 'Report', 'Selected candidate', 'Who receives an offer'),
    ] },
  { id: 'WF-05', num: 5, name: 'Offer', name_ar: 'عرض العمل', stage: 'Hire', coverage: 'implemented', trigger: 'A candidate is selected', agents: ['hessa', 'tarqiya'], decision_by: 'HRBP to midpoint; CHRO above',
    steps: [
      S('propose', 'AGENT', 'tarqiya', 'Propose pay within grade and check peer equity', 'اقتراح الأجر ضمن الدرجة والتحقق من العدالة', 'Grade range, peers in grade, candidate expectation', 'Offer package, compa-ratio, peer comparison', 'None'),
      S('approve', 'HUMAN', 'HRBP', 'Approve the offer (CHRO above midpoint)', 'اعتماد العرض', 'Proposal', 'Approved offer', 'Make the offer'),
      S('letter', 'AGENT', 'hessa', 'Prepare the offer letter in English and Arabic', 'إعداد خطاب العرض باللغتين', 'Approved offer', 'Offer letter', 'None'),
      S('extend', 'SYSTEM', 'connector', 'Extend the offer; on acceptance create the pending worker', 'إرسال العرض وإنشاء سجل الموظف المرتقب', 'Offer, acceptance', 'POST /recruitingJobOffers; POST /workers (pending)', 'None'),
    ] },
  { id: 'WF-06', num: 6, name: 'Pre-boarding: Qiwa, GOSI and Muqeem', name_ar: 'ما قبل الالتحاق: قوى والتأمينات ومقيم', stage: 'Onboard', coverage: 'implemented', trigger: 'Offer accepted; pending worker created', agents: ['dalil'], decision_by: 'HR Ops clears blockers',
    steps: [
      S('journey', 'AGENT', 'dalil', 'Open the pre-boarding journey', 'فتح رحلة ما قبل الالتحاق', 'Pending worker, nationality', 'Tasks: documents, Qiwa contract, work visa, medical, CCHI insurance, GOSI registration, Muqeem (iqama), IT', 'Which tasks apply'),
      S('immigration', 'SYSTEM', 'connector', 'Submit Qiwa, GOSI and Muqeem steps', 'تقديم إجراءات قوى والتأمينات ومقيم', 'Documents', 'Qiwa employment contract, GOSI registration, work visa and iqama via Muqeem', 'None'),
      S('blockers', 'HUMAN', 'PAYROLL', 'HR Ops clears blockers', 'عمليات الموارد البشرية تعالج العوائق', 'Blocked tasks', 'Resolved tasks', 'How to unblock'),
      S('ready', 'AGENT', 'dalil', 'Confirm day-one readiness', 'تأكيد الجاهزية لليوم الأول', 'All tasks', 'Day-one plan, buddy, introductions', 'Ready or at risk'),
    ] },
  { id: 'WF-07', num: 7, name: 'Onboarding journey and 30/60/90', name_ar: 'رحلة التهيئة والمتابعة', stage: 'Onboard', coverage: 'partial', trigger: 'Newhire event', agents: ['dalil'], decision_by: 'Manager',
    steps: [
      S('day1', 'AGENT', 'dalil', 'Day-one plan and introductions', 'خطة اليوم الأول والتعارف', 'Newhire event', 'Calendar invites, checklist', 'None'),
      S('checkins', 'AGENT', 'dalil', '30, 60 and 90-day check-ins', 'المتابعة بعد 30 و60 و90 يوماً', 'Pulse answers', 'Concerns flagged to manager', 'Whether to flag'),
      S('confirm', 'HUMAN', 'LINE_MANAGER', 'Manager reviews check-ins', 'المدير يراجع المتابعات', 'Check-in summary', 'Actions', 'Act on concerns'),
    ] },
  { id: 'WF-08', num: 8, name: 'Probation review', name_ar: 'مراجعة فترة التجربة', stage: 'Onboard', coverage: 'implemented', trigger: '30 days before probation ends (Art. 53)', agents: ['amin', 'mezan'], decision_by: 'Manager with HRBP',
    steps: [
      S('flag', 'AGENT', 'amin', 'Flag probation end in 30 days', 'التنبيه بانتهاء التجربة خلال 30 يوماً', 'Assignment probation date', 'Probation case', 'None'),
      S('evidence', 'AGENT', 'mezan', 'Prepare evidence: goals, check-ins, attendance', 'إعداد الأدلة: الأهداف والمتابعات والحضور', 'HRMS records', 'Evidence summary', 'None'),
      S('decide', 'HUMAN', 'LINE_MANAGER', 'Manager confirms or ends employment', 'المدير يثبت التعيين أو ينهيه', 'Evidence', 'Confirm / end within probation (Art. 54)', 'Confirm the employee'),
      S('concur', 'HUMAN', 'HRBP', 'HRBP concurs', 'موافقة شريك الأعمال', 'Decision', 'Concurred', 'Concur'),
      S('post', 'SYSTEM', 'connector', 'Update the assignment', 'تحديث التعيين', 'Decision', 'POST assignment PROBATION_CONFIRM; empassignment event', 'None'),
    ] },
  { id: 'WF-09', num: 9, name: 'Goals and check-ins', name_ar: 'الأهداف والمتابعات', stage: 'Perform', coverage: 'partial', trigger: 'Cycle opens; quarterly', agents: ['mezan'], decision_by: 'Manager and employee',
    steps: [
      S('cascade', 'AGENT', 'mezan', 'Suggest goals from the division plan', 'اقتراح الأهداف من خطة القطاع', 'Division goals', 'Draft goals', 'None'),
      S('agree', 'HUMAN', 'LINE_MANAGER', 'Agree goals', 'اعتماد الأهداف', 'Draft goals', 'Goals', 'Agree'),
      S('prep', 'AGENT', 'mezan', 'Prepare each check-in', 'التحضير لكل متابعة', 'Goal progress, last notes', 'Talking points', 'None'),
    ] },
  { id: 'WF-10', num: 10, name: 'Annual review and calibration', name_ar: 'المراجعة السنوية والمعايرة', stage: 'Perform', coverage: 'implemented', trigger: 'Review window opens', agents: ['mezan'], decision_by: 'Manager rates; panel finalises',
    steps: [
      S('draft', 'AGENT', 'mezan', 'Draft review evidence for each employee', 'إعداد أدلة المراجعة لكل موظف', 'Goals, check-ins, feedback', 'Evidence for the manager', 'None'),
      S('rate', 'HUMAN', 'LINE_MANAGER', 'Manager rates', 'المدير يقيّم', 'Evidence, self-evaluation', 'Rating 1-5 and comment', 'The rating'),
      S('check', 'AGENT', 'mezan', 'Check distribution and consistency', 'التحقق من التوزيع والاتساق', 'All ratings in the division', 'Flags: skew, leniency, rating vs goals, gender gap', 'None'),
      S('calibrate', 'HUMAN', 'HRBP', 'Calibration panel finalises', 'لجنة المعايرة تعتمد', 'Ratings with flags', 'Calibrated ratings with reasons', 'Final ratings'),
      S('post', 'SYSTEM', 'connector', 'Write calibrated ratings', 'تسجيل التقييمات المعايرة', 'Final ratings', 'PATCH /performanceDocuments', 'None'),
    ] },
  { id: 'WF-11', num: 11, name: 'Talent review and succession', name_ar: 'مراجعة المواهب والتعاقب', stage: 'Grow', coverage: 'partial', trigger: 'After calibration', agents: ['tarqiya'], decision_by: 'Talent committee',
    steps: [
      S('grid', 'AGENT', 'tarqiya', 'Place everyone on the 9-box from rating and potential', 'وضع الجميع على مصفوفة التسعة', 'Ratings, potential', '9-box', 'None'),
      S('bench', 'AGENT', 'tarqiya', 'Update succession bench for critical roles', 'تحديث قائمة التعاقب للوظائف الحرجة', '9-box, readiness', 'Bench strength', 'None'),
      S('review', 'HUMAN', 'CHRO', 'Talent committee reviews', 'لجنة المواهب تراجع', 'Grid, bench', 'Agreed actions', 'Development and succession actions'),
    ] },
  { id: 'WF-12', num: 12, name: 'Promotion', name_ar: 'الترقية', stage: 'Grow', coverage: 'implemented', trigger: 'Nomination or calibration outcome', agents: ['tarqiya'], decision_by: 'HRBP; CHRO for two grades',
    steps: [
      S('case', 'AGENT', 'tarqiya', 'Build the promotion case', 'إعداد ملف الترقية', 'Ratings, time in grade, grade ranges, peers', 'Eligibility, proposed salary, compa-ratio, peer comparison', 'Eligible or not'),
      S('approve', 'HUMAN', 'HRBP', 'Approve (CHRO for two grades or above midpoint)', 'الاعتماد', 'Case', 'Approved', 'Promote'),
      S('post', 'SYSTEM', 'connector', 'Post assignment, salary and element entries', 'تسجيل التعيين والراتب وعناصر الرواتب', 'Approved promotion', 'POST assignment PROMOTION, POST /salaries, element entries; payupdate event', 'None'),
    ] },
  { id: 'WF-13', num: 13, name: 'Payroll pre-run check', name_ar: 'التحقق قبل تشغيل الرواتب', stage: 'Pay', coverage: 'implemented', trigger: 'Five working days before cut-off and the Mudad upload', agents: ['hisab'], decision_by: 'Payroll specialist',
    steps: [
      S('check', 'AGENT', 'hisab', 'Run the pre-run checks', 'تشغيل الفحوصات', 'Draft results, salaries, element entries, absences, terminations, GOSI', 'Findings by severity with the record behind each', 'Release blocked or clear'),
      S('resolve', 'HUMAN', 'PAYROLL', 'Payroll resolves each finding and releases', 'فريق الرواتب يعالج الملاحظات ويعتمد', 'Findings', 'Fixes, explanations, release', 'Release the run'),
      S('release', 'SYSTEM', 'connector', 'Release payroll and upload the wage file to Mudad', 'اعتماد الرواتب ورفع ملف الأجور إلى مدد', 'Released run', 'Payroll release; wage file to Mudad (wage protection) and the bank', 'None'),
    ] },
  { id: 'WF-14', num: 14, name: 'Letters and certificates', name_ar: 'الخطابات والشهادات', stage: 'Everyday', coverage: 'implemented', trigger: 'Employee request', agents: ['wathiqa'], decision_by: 'None, or HR Ops for salary transfer',
    steps: [
      S('intake', 'AGENT', 'rafeeq', 'Take the request', 'استلام الطلب', 'Type, addressee, purpose, language', 'Request', 'None'),
      S('validate', 'AGENT', 'wathiqa', 'Validate against policy and HRMS', 'التحقق من السياسة والنظام', 'Employment status, salary record', 'Valid, or needs HR Ops', 'Standard or not'),
      S('approve', 'HUMAN', 'PAYROLL', 'HR Ops approves (salary transfer only)', 'اعتماد عمليات الموارد البشرية (تحويل الراتب فقط)', 'Draft letter', 'Approved', 'Commit salary to the bank'),
      S('issue', 'SYSTEM', 'connector', 'Generate and record the letter', 'إصدار الخطاب وتسجيله', 'Letter', 'documentRecords.generateDraftLetter; POST /documentRecords', 'None'),
    ] },
  { id: 'WF-15', num: 15, name: 'Leave', name_ar: 'الإجازات', stage: 'Everyday', coverage: 'implemented', trigger: 'Employee request', agents: ['ajaza'], decision_by: 'Line manager',
    steps: [
      S('intake', 'AGENT', 'rafeeq', 'Take the request', 'استلام الطلب', 'Type, dates', 'Request', 'None'),
      S('validate', 'AGENT', 'ajaza', 'Check balance, rules and team cover', 'التحقق من الرصيد والقواعد وتغطية الفريق', 'Balance, Saudi Labor Law rules, team calendar', 'Within policy / conflicts', 'None'),
      S('approve', 'HUMAN', 'LINE_MANAGER', 'Line manager approves', 'المدير المباشر يعتمد', 'Prepared request', 'Approved or declined', 'Approve the leave'),
      S('post', 'SYSTEM', 'connector', 'Record the absence', 'تسجيل الغياب', 'Approved leave', 'POST /absences', 'None'),
    ] },
  { id: 'WF-16', num: 16, name: 'Salary advance', name_ar: 'سلفة الراتب', stage: 'Everyday', coverage: 'implemented', trigger: 'Employee request', agents: ['ajaza', 'hisab'], decision_by: 'Manager; HR Ops; CHRO for exceptions',
    steps: [
      S('intake', 'AGENT', 'rafeeq', 'Take the request', 'استلام الطلب', 'Amount, months, reason', 'Request', 'None'),
      S('eligibility', 'AGENT', 'ajaza', 'Check eligibility (HR-07)', 'التحقق من الأهلية', 'Probation status, outstanding advances, basic salary', 'Eligible / eligible with changes / ineligible', 'Whether an exception is needed'),
      S('recovery', 'AGENT', 'hisab', 'Schedule recovery and test the Art. 92 and 93 caps', 'جدولة الاسترداد واختبار حدود المادتين 92 و93', 'Amount, months, current deductions', 'Monthly recovery, cap test', 'None'),
      S('manager', 'HUMAN', 'LINE_MANAGER', 'Manager supports', 'تأييد المدير', 'Prepared request', 'Supported or not', 'Support the advance'),
      S('approve', 'HUMAN', 'PAYROLL', 'HR Ops approves (CHRO for exceptions)', 'اعتماد عمليات الموارد البشرية', 'Supported request', 'Approved', 'Pay the advance'),
      S('post', 'SYSTEM', 'connector', 'Post payment and recovery entries', 'تسجيل الدفعة والاسترداد', 'Approved advance', 'POST /elementEntries ADVANCE_PAY, ADVANCE_REC', 'None'),
    ] },
  { id: 'WF-17', num: 17, name: 'Policy answers', name_ar: 'الإجابة عن السياسات', stage: 'Everyday', coverage: 'implemented', trigger: 'Any question', agents: ['rafeeq', 'murshid'], decision_by: 'None; escalates without a source',
    steps: [
      S('answer', 'AGENT', 'rafeeq', 'Answer from cited policy and HRMS data', 'الإجابة من السياسة والنظام', 'Question, policy clauses, the person\'s records', 'Answer with clause and version', 'Answer or route to HR'),
    ] },
  { id: 'WF-18', num: 18, name: 'Employee relations case', name_ar: 'حالة علاقات الموظفين', stage: 'Relate', coverage: 'partial', trigger: 'Grievance or concern', agents: ['sanad'], decision_by: 'HRBP, Legal',
    steps: [
      S('triage', 'AGENT', 'sanad', 'Triage and build the chronology', 'الفرز وإعداد التسلسل الزمني', 'Report, HRMS records', 'Case file', 'Severity'),
      S('investigate', 'HUMAN', 'HRBP', 'HRBP investigates', 'شريك الأعمال يحقق', 'Case file', 'Findings', 'Outcome'),
    ] },
  { id: 'WF-19', num: 19, name: 'Resignation and final settlement', name_ar: 'الاستقالة والتسوية النهائية', stage: 'Exit', coverage: 'implemented', trigger: 'Employee resigns', agents: ['wadaa', 'dalil'], decision_by: 'Manager; HR Ops',
    steps: [
      S('intake', 'AGENT', 'wadaa', 'Take the resignation, propose last working day', 'استلام الاستقالة واقتراح آخر يوم عمل', 'Resignation, contract notice', 'Proposed last working day', 'None'),
      S('accept', 'HUMAN', 'LINE_MANAGER', 'Manager accepts; regretted or not', 'المدير يقبل الاستقالة', 'Resignation', 'Accepted, regretted flag', 'Accept'),
      S('settlement', 'AGENT', 'wadaa', 'Calculate the final settlement', 'احتساب التسوية النهائية', 'Salary, leave balance, service, end-of-service award (Arts. 84-85), advances', 'Settlement lines with rule for each; due within 14 days (Art. 88)', 'None'),
      S('approve', 'HUMAN', 'PAYROLL', 'HR Ops approves the settlement', 'اعتماد التسوية', 'Settlement', 'Approved', 'Pay the settlement'),
      S('terminate', 'SYSTEM', 'connector', 'Post termination; close the Qiwa contract; final exit', 'تسجيل إنهاء الخدمة وإنهاء العقد في قوى والخروج النهائي', 'Approved exit', 'Work relationship end; termination event; Qiwa contract closure; GOSI deregistration; final exit visa via Muqeem (expatriates)', 'None'),
    ] },
  { id: 'WF-20', num: 20, name: 'Involuntary exit', name_ar: 'إنهاء الخدمة من قبل الشركة', stage: 'Exit', coverage: 'implemented', trigger: 'Manager or HR initiates', agents: ['sanad', 'wadaa'], decision_by: 'HRBP, Legal, CHRO',
    steps: [
      S('intake', 'HUMAN', 'LINE_MANAGER', 'Manager or HR states the grounds', 'المدير أو الموارد البشرية يحدد الأسباب', 'Grounds, evidence', 'Case', 'Start'),
      S('check', 'AGENT', 'sanad', 'Check documentation, legal grounds and protections', 'التحقق من التوثيق والأسس القانونية والحماية', 'Warnings, improvement plan, ratings, leave, protected status (Saudi Labor Law Arts. 77, 80)', 'Complete / missing steps', 'Proceed or stop'),
      S('review', 'HUMAN', 'HRBP', 'HRBP reviews the case file', 'شريك الأعمال يراجع الملف', 'Sanad\'s check', 'Recommendation', 'Recommend'),
      S('approve', 'HUMAN', 'CHRO', 'CHRO and Legal approve', 'اعتماد الرئيس التنفيذي للموارد البشرية والقانونية', 'Recommendation', 'Approved or stopped', 'End employment'),
      S('settlement', 'AGENT', 'wadaa', 'Calculate the final settlement', 'احتساب التسوية النهائية', 'HRMS data', 'Settlement (Art. 84); due within 7 days (Art. 88)', 'None'),
      S('terminate', 'SYSTEM', 'connector', 'Post termination; close the Qiwa contract; final exit', 'تسجيل إنهاء الخدمة وإنهاء العقد في قوى والخروج النهائي', 'Approved exit', 'Work relationship end; termination event; Qiwa contract closure; GOSI deregistration; final exit visa via Muqeem (expatriates)', 'None'),
    ] },
  { id: 'WF-21', num: 21, name: 'Compliance watch', name_ar: 'رقابة الامتثال', stage: 'Always on', coverage: 'implemented', trigger: 'Daily', agents: ['amin'], decision_by: 'Owner of each alert',
    steps: [
      S('scan', 'AGENT', 'amin', 'Scan dates and ratios', 'فحص التواريخ والنسب', 'Persons (iqama, national ID, passport), assignments, Qiwa contracts, payroll periods, Nitaqat band', 'Alerts with owner and due date (Muqeem, Qiwa, Mudad, GOSI)', 'Severity'),
      S('assign', 'HUMAN', 'PAYROLL', 'Owner acts on the alert', 'المسؤول يتعامل مع التنبيه', 'Alert', 'Resolved', 'Action'),
    ] },
  { id: 'WF-22', num: 22, name: 'SLA watch and escalation', name_ar: 'مراقبة مستوى الخدمة والتصعيد', stage: 'Tasama', coverage: 'implemented', trigger: 'Hourly, across every client', agents: ['raqeeb'], decision_by: 'Tasama HR Operations',
    steps: [
      S('scan', 'AGENT', 'raqeeb', 'Scan open cases against the contract SLA', 'فحص الحالات المفتوحة مقابل مستوى الخدمة في العقد', 'Open cases per client, SLA due times, client contracts', 'Cases at risk and breached, by client', 'At risk or not'),
      S('nudge', 'AGENT', 'raqeeb', 'Nudge the person the case waits on', 'تذكير صاحب الاعتماد', 'Cases at risk', 'Reminder with the due time', 'None'),
      S('escalate', 'HUMAN', 'TASAMA_OPS', 'Escalate to Tasama HR Operations', 'التصعيد إلى عمليات الموارد البشرية في تسامى', 'Breached or repeatedly delayed cases', 'Owner and action agreed with the client', 'How to recover the case'),
      S('resolve', 'HUMAN', 'TASAMA_OPS', 'Tasama HR Operations resolves', 'عمليات الموارد البشرية في تسامى تعالج', 'Escalated case', 'Resolved; service credit noted if breached', 'Close the escalation'),
    ] },
  { id: 'WF-23', num: 23, name: 'Monthly client invoice', name_ar: 'الفاتورة الشهرية للعميل', stage: 'Tasama', coverage: 'implemented', trigger: 'Month end, per client', agents: ['fatoora', 'raqeeb'], decision_by: 'Tasama HR Operations Manager',
    steps: [
      S('volumes', 'AGENT', 'fatoora', 'Compute volumes', 'احتساب الأحجام', 'Headcount served, completed hires, client contract', 'Fee lines: employees served x fee per employee per month; hires x fee per hire', 'None'),
      S('credits', 'AGENT', 'fatoora', 'Apply service credits for missed SLAs', 'تطبيق خصومات الخدمة عن مستويات الخدمة غير المحققة', 'Monthly SLA results (Raqeeb), credit rates, credit cap', 'Service credits, capped at the contract limit', 'None'),
      S('approve', 'HUMAN', 'TASAMA_OPS', 'Tasama HR Operations Manager approves', 'اعتماد مدير عمليات الموارد البشرية في تسامى', 'Draft invoice', 'Approved invoice', 'Issue the invoice'),
      S('issue', 'SYSTEM', 'connector', 'Issue to the client', 'الإصدار إلى العميل', 'Approved invoice', 'Invoice issued to the client', 'None'),
    ] },
  { id: 'WF-24', num: 24, name: 'New client transition', name_ar: 'انتقال عميل جديد', stage: 'Tasama', coverage: 'designed', trigger: 'A new client contract starts (build, operate, transfer)', agents: ['intiqal'], decision_by: 'Tasama HR Operations',
    steps: [
      S('map', 'AGENT', 'intiqal', 'Map the client\'s HRMS data to the standard model', 'مطابقة بيانات نظام العميل مع النموذج الموحد', 'Client HRMS extract (Oracle HCM or Odoo)', 'Field mapping and gaps', 'None'),
      S('validate', 'AGENT', 'intiqal', 'Validate payroll master data', 'التحقق من البيانات الأساسية للرواتب', 'Workers, salaries, element entries, IBANs, GOSI registration, iqama and national ID', 'Data issues by severity', 'Ready for parallel run or not'),
      S('parallel', 'AGENT', 'intiqal', 'Parallel run against the client\'s last payroll', 'تشغيل موازٍ مقابل آخر رواتب العميل', 'Client\'s last payroll, computed payroll', 'Differences by employee with reasons', 'None'),
      S('golive', 'HUMAN', 'TASAMA_OPS', 'Go-live approval', 'اعتماد بدء التشغيل', 'Mapping, data issues, parallel-run differences', 'Approved go-live date', 'Go live'),
    ] },
  { id: 'WF-25', num: 25, name: 'Pattern watch and root cause', name_ar: 'مراقبة الأنماط والسبب الجذري', stage: 'Tasama', coverage: 'implemented', trigger: 'Weekly, across every client; or on demand', agents: ['basira'], decision_by: 'Tasama HR Operations Manager',
    steps: [
      S('measure', 'AGENT', 'basira', 'Measure each kind of problem per 100 cases', 'قياس كل نوع من المشكلات لكل 100 حالة', 'Issues with reason codes; cases per week', 'Weekly rate per client and across clients', 'None'),
      S('flag', 'AGENT', 'basira', 'Flag rises that hold for two weeks', 'التنبيه إلى الارتفاع المستمر أسبوعين', 'Rates against each one\'s own baseline', 'Patterns; rises looked at and not flagged, with the reason', 'Whether a rise is a pattern'),
      S('explain', 'AGENT', 'basira', 'Contrast recent cases with earlier ones and state likely causes', 'مقارنة الحالات الأخيرة بالسابقة وبيان الأسباب المرجحة', 'The issues behind the pattern, absences, cut-off dates', 'Likely causes with evidence', 'None: causes are hypotheses'),
      S('assign', 'HUMAN', 'TASAMA_OPS', 'Assign an owner and an action', 'إسناد مالك وإجراء', 'Pattern, causes, issues', 'Owner, action, date to measure again', 'What to do about the cause'),
      S('recheck', 'AGENT', 'basira', 'Measure again after the fix', 'إعادة القياس بعد المعالجة', 'Rate since the action', 'Closed, or kept open', 'None'),
    ] },
  { id: 'WF-26', num: 26, name: 'Client policy', name_ar: 'سياسة العميل', stage: 'Pay', coverage: 'implemented', trigger: 'A client handbook is uploaded or changed', agents: ['nizam'], decision_by: 'Tasama payroll lead recommends; the client\'s CHRO activates',
    steps: [
      S('read', 'AGENT', 'nizam', 'Read the handbook into rules on the 27 dimensions', 'قراءة الدليل إلى قواعد على الأبعاد السبعة والعشرين', 'The handbook, the legal floor for each dimension', 'A draft version: every rule with its clause and words; flags', 'Which rules the law refuses, which are unclear, what is missing'),
      S('review', 'HUMAN', 'TASAMA_PAYROLL_LEAD', 'Tasama\'s payroll lead reviews the flagged rules and recommends a reading', 'قائدة الرواتب في تسامى تراجع القواعد وتوصي بالقراءة', 'Draft version and flags', 'The reading recommended for each unclear rule', 'Recommend the reading'),
      S('propose', 'AGENT', 'nizam', 'Prepare the version for the client\'s decision', 'إعداد النسخة لقرار العميل', 'Draft, the lead\'s readings', 'The version as it would apply, and what changes', 'None'),
      S('activate', 'HUMAN', 'CHRO', 'The client\'s CHRO activates the version', 'الرئيس التنفيذي للموارد البشرية لدى العميل يفعّل النسخة', 'The version and what changes', 'Activated, or returned', 'Activate the version'),
      S('apply', 'SYSTEM', 'platform', 'Activate the version for payroll and the assistants', 'تفعيل النسخة للرواتب والمساعدين', 'Activated version', 'The active policy; the previous version kept for the record', 'None'),
    ] },
  { id: 'WF-27', num: 27, name: 'Monthly inputs and cut-off', name_ar: 'مدخلات الشهر وموعد الإقفال', stage: 'Pay', coverage: 'implemented', trigger: 'The payroll month opens, ten days before the cut-off; or a change arrives after the cut-off', agents: ['wared'], decision_by: 'The client\'s HR operations',
    steps: [
      S('prefill', 'AGENT', 'wared', 'List the month\'s changes against the cut-off', 'سرد تغييرات الشهر مقابل موعد الإقفال', 'The master, approved cases, the payroll calendar', 'Changes already confirmed, and the ones the client still has to send', 'What is expected from the client before the cut-off'),
      S('confirm', 'HUMAN', 'PAYROLL', 'The client\'s HR operations confirms the month\'s changes', 'عمليات الموارد البشرية لدى العميل تؤكد تغييرات الشهر', 'The expected lines with Wared\'s suggestions', 'Each line confirmed, changed or dropped', 'Confirm the changes'),
      S('apply', 'SYSTEM', 'platform', 'Enter the confirmed changes in the payroll month', 'إدخال التغييرات المؤكدة في شهر الرواتب', 'Confirmed changes', 'Entries in the open month; a late change booked for next month', 'None'),
    ] },
  { id: 'WF-28', num: 28, name: 'Offer to contract to payroll', name_ar: 'من العرض إلى العقد إلى الرواتب', stage: 'Pay', coverage: 'implemented', trigger: 'An offer is accepted at a client whose payroll Tasama runs', agents: ['aqd', 'tamin'], decision_by: 'The client\'s HR operations sends the contract; the employee signs on Qiwa',
    steps: [
      S('draft', 'AGENT', 'aqd', 'Draft the employment contract from the accepted offer', 'صياغة عقد العمل من العرض المقبول', 'The offer, the client\'s policy, the contract template', 'A contract with every term and the article behind it', 'Contract type, probation, leave and notice'),
      S('send', 'HUMAN', 'PAYROLL', 'The client\'s HR operations sends the contract for signature', 'عمليات الموارد البشرية لدى العميل ترسل العقد للتوقيع', 'The draft contract', 'The contract sent on Qiwa', 'Send for signature'),
      S('sign', 'SYSTEM', 'qiwa', 'The employee accepts the contract on Qiwa', 'الموظف يقبل العقد في منصة قوى', 'The contract sent', 'The signed contract', 'None'),
      S('hire', 'SYSTEM', 'platform', 'The pending worker becomes the employee, with the pay from the contract', 'يصبح الموظف المرتقب موظفاً بأجر العقد', 'The signed contract', 'The same record as an employee; pay elements from the start date', 'None'),
      S('gosi', 'AGENT', 'tamin', 'Register the employee with GOSI', 'تسجيل الموظف في التأمينات الاجتماعية', 'Nationality, first registration, wage', 'The GOSI registration, insured group and rate', 'Which insured group applies'),
    ] },
  { id: 'WF-29', num: 29, name: 'Attendance month', name_ar: 'شهر الحضور', stage: 'Pay', coverage: 'implemented', trigger: 'The month\'s attendance file is uploaded', agents: ['hudoor'], decision_by: 'The employee explains; the client\'s HR operations confirms',
    steps: [
      S('read', 'AGENT', 'hudoor', 'Read the attendance against schedules and leave; propose unpaid days and fines', 'قراءة الحضور مقابل الجداول والإجازات واقتراح أيام الغياب والغرامات', 'The attendance file, schedules, approved leave, the penalty table', 'Each day marked; per person, unpaid days and a fine capped at five days\' wage', 'Which days are late, absent or covered by leave'),
      S('confirm', 'HUMAN', 'PAYROLL', 'The client\'s HR operations confirms, after employees have explained', 'عمليات الموارد البشرية لدى العميل تؤكد بعد سماع الموظفين', 'The proposed amounts and the explanations', 'Each explanation accepted or not; the amounts confirmed', 'Confirm the deductions'),
      S('apply', 'SYSTEM', 'platform', 'Enter the confirmed amounts in the open payroll month', 'إدخال المبالغ المؤكدة في شهر الرواتب المفتوح', 'Confirmed amounts', 'Unpaid days and fines as entries in the open month', 'None'),
    ] },
  { id: 'WF-30', num: 30, name: 'Payroll run', name_ar: 'تشغيل الرواتب', stage: 'Pay', coverage: 'implemented', trigger: 'The cut-off has passed', agents: ['hisab', 'mutabaqa', 'wathiqa'], decision_by: 'Payroll specialist prepares, payroll lead validates, the client\'s CHRO approves',
    steps: [
      S('check', 'AGENT', 'hisab', 'Prepare the draft run and run the pre-run checks', 'إعداد مسودة الرواتب وتشغيل فحوصات ما قبل التشغيل', 'The master, confirmed inputs, the active policy', 'Every person\'s lines, and the checks with who settles each', 'Whether anything stops the run'),
      S('prepare', 'HUMAN', 'TASAMA_PAYROLL', 'The payroll specialist sends the run for validation', 'أخصائي الرواتب يرسل الرواتب للمراجعة', 'The draft and its checks', 'The run as prepared', 'Send for validation'),
      S('freeze', 'SYSTEM', 'platform', 'Freeze every line as calculated', 'تثبيت كل سطر كما حُسب', 'The draft', 'The frozen run', 'None'),
      S('validate', 'HUMAN', 'TASAMA_PAYROLL_LEAD', 'The payroll lead validates, never the preparer', 'قائدة الرواتب تراجع، وليست من أعدّ الرواتب', 'The frozen run', 'The validated run', 'Validate'),
      S('explain', 'AGENT', 'mutabaqa', 'Explain every difference from last month', 'تفسير كل فرق عن الشهر الماضي', 'This run and last month', 'Each person\'s change split into its causes', 'Whether any difference is not explained'),
      S('approve', 'HUMAN', 'CHRO', 'The client\'s CHRO approves the run', 'الرئيس التنفيذي للموارد البشرية لدى العميل يعتمد الرواتب', 'The run and its differences', 'Approved, or returned with a reason', 'Approve the run'),
      S('write', 'SYSTEM', 'connector', 'Write the approved run to the master', 'كتابة الرواتب المعتمدة في السجل الرئيسي', 'The approved run', 'Payroll results in Oracle HCM or Tasama HR', 'None'),
      S('payslips', 'AGENT', 'wathiqa', 'Issue every payslip', 'إصدار قسائم الرواتب', 'The written run', 'A payslip for each person, and a notification', 'None'),
    ] },
  { id: 'WF-33', num: 33, name: 'Bank file, WPS and Mudad', name_ar: 'ملف البنك وحماية الأجور ومدد', stage: 'Pay', coverage: 'implemented', trigger: 'The client\'s CHRO approved the run', agents: ['tahweel'], decision_by: 'Tasama\'s payroll lead sends the file; the client\'s finance approves the payment in the bank',
    steps: [
      S('build', 'AGENT', 'tahweel', 'Write the bank file and the WPS file and check them before release', 'إعداد ملف البنك وملف حماية الأجور وفحصهما قبل الإرسال', 'The approved run, the paying bank and its format', 'The bank file, the WPS file, and the release checks', 'Whether anything stops the file'),
      S('send', 'HUMAN', 'TASAMA_PAYROLL_LEAD', 'The payroll lead sends the file to the bank', 'قائدة الرواتب ترسل الملف إلى البنك', 'The files and their checks', 'The file sent, or held with a reason', 'Send to the bank'),
      S('upload', 'SYSTEM', 'bank', 'The file reaches the client\'s bank portal for its finance team to approve', 'يصل الملف إلى بوابة البنك لدى العميل ليعتمده فريق المالية', 'The bank file', 'The file in the portal, waiting for the client\'s approvals', 'None'),
    ] },
  { id: 'WF-35', num: 35, name: 'Back pay and off-cycle', name_ar: 'الفروقات والدفعات خارج الدورة', stage: 'Pay', coverage: 'implemented', trigger: 'A change dated in a closed month, or an off-cycle request', agents: ['hisab'], decision_by: 'Payroll specialist adds it to the open run; the run is validated and approved as usual',
    steps: [
      S('calc', 'AGENT', 'hisab', 'Recalculate each closed month under the change', 'إعادة احتساب كل شهر مغلق بالتغيير', 'The change, what was paid each month, the policy', 'Back pay per month, GOSI on it, and the provisions re-measured', 'Which months the change reaches'),
      S('confirm', 'HUMAN', 'TASAMA_PAYROLL', 'The payroll specialist adds it to this month\'s run', 'أخصائي الرواتب يضيفها إلى رواتب هذا الشهر', 'The recalculation', 'Back pay in the open run', 'Add to this month\'s run'),
      S('apply', 'SYSTEM', 'platform', 'Enter the back pay in the open month; closed months stay as paid', 'إدخال الفروقات في الشهر المفتوح؛ تبقى الأشهر المغلقة كما صُرفت', 'The confirmed back pay', 'Entries in the open month', 'None'),
    ] },
  { id: 'WF-36', num: 36, name: 'Run question to the client', name_ar: 'سؤال الرواتب إلى العميل', stage: 'Pay', coverage: 'implemented', trigger: 'Tasama payroll asks the client to settle a check on the draft run', agents: [], decision_by: 'The client\'s HR operations',
    steps: [
      S('answer', 'HUMAN', 'PAYROLL', 'The client\'s HR operations answers', 'عمليات الموارد البشرية لدى العميل تجيب', 'The check on the draft run and what it costs', 'The registration date, or whether the held hours are paid', 'Answer'),
      S('apply', 'SYSTEM', 'platform', 'Apply the answer to the open payroll month', 'تطبيق الإجابة على شهر الرواتب المفتوح', 'The answer', 'Entries in the open month; the run recalculates', 'None'),
    ] },
];

export const wf = (id: string) => {
  const w = WORKFLOWS.find((x) => x.id === id);
  if (!w) throw new Error(`unknown workflow ${id}`);
  return w;
};
