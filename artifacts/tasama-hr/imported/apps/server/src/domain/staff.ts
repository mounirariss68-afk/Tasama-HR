/**
 * Tasama staff notifications (design/payroll-ops-addendum.md §3). Tasama staff are not employees of a
 * client, so each has a negative id for notification rows; a case waiting on a Tasama team notifies its people.
 */
export const STAFF_NOTIFY_ID: Record<string, number> = { tasama: -7, 'tasama-lead': -14, 'tasama-specialist': -21, 'tasama-hrops': -31 };
export const TEAM_NOTIFY: Record<string, number[]> = { TASAMA_HR_OPS: [-31, -7], TASAMA_PAYROLL: [-21], TASAMA_PAYROLL_LEAD: [-14] };
