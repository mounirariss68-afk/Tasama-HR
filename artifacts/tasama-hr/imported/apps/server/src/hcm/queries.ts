/**
 * Read models over the simulated HRMS. Every function goes through
 * connector.read(), so each one is a logged "REST call" to Oracle HCM.
 */
import { read, type Ctx } from './connector.js';

export type Worker = {
  person_id: number; person_number: string; display_name: string; display_name_ar: string; first_name: string; gender: string;
  nationality: string; is_saudi: boolean; date_of_birth: string; work_email: string; mobile: string;
  national_id_masked: string; national_id_expiry: string; passport_expiry: string; iqama_expiry: string | null;
  bank_name: string; iban_masked: string; photo_seed: number;
  worker_type: string; start_date: string; original_hire_date: string; gosi_first_registered: string | null; end_date: string | null; last_working_day: string | null; termination_action: string | null;
  assignment_number: string; effective_start: string; position_id: number | null; position_code: string | null;
  job_code: string; job_name: string; job_name_ar: string; job_family: string;
  department_id: number; department_code: string; department_name: string; department_name_ar: string; division: string; division_ar: string;
  grade_code: string; grade_rank: number; grade_min: number; grade_mid: number; grade_max: number;
  location_name: string; location_name_ar: string;
  manager_person_id: number | null; manager_name: string | null; manager_name_ar: string | null;
  probation_end_date: string | null; probation_status: string | null; contract_end_date: string | null; notice_period_days: number;
  basic: number; housing: number; transport: number; other_allowance: number; salary_from: string;
  eos_basis: string | null; eos_enrolled: string | null; eos_contributions: number | null;
};

export const WORKER_SQL = (where: string) => `
  SELECT p.id AS person_id, p.person_number, p.display_name, p.display_name_ar, p.first_name, p.gender, p.nationality, p.is_saudi,
         p.date_of_birth, p.work_email, p.mobile, p.national_id_masked, p.national_id_expiry, p.passport_expiry, p.iqama_expiry,
         p.bank_name, p.iban_masked, p.photo_seed,
         wr.worker_type, wr.start_date, wr.original_hire_date, wr.end_date, wr.last_working_day, wr.termination_action,
         (SELECT g.first_registered FROM hcm.gosi_registrations g WHERE g.person_id = p.id) AS gosi_first_registered,
         a.assignment_number, a.effective_start, a.position_id, pos.code AS position_code,
         j.code AS job_code, j.name AS job_name, j.name_ar AS job_name_ar, j.family AS job_family,
         d.id AS department_id, d.code AS department_code, d.name AS department_name, d.name_ar AS department_name_ar, d.division, d.division_ar,
         g.code AS grade_code, g.rank AS grade_rank, g.min_basic AS grade_min, g.mid_basic AS grade_mid, g.max_basic AS grade_max,
         l.name AS location_name, l.name_ar AS location_name_ar,
         a.manager_person_id, m.display_name AS manager_name, m.display_name_ar AS manager_name_ar,
         a.probation_end_date, a.probation_status, a.contract_end_date, a.notice_period_days,
         s.basic, s.housing, s.transport, s.other_allowance, s.date_from AS salary_from,
         eos.basis AS eos_basis, eos.enrolled_date AS eos_enrolled, eos.contributions_to_date AS eos_contributions
    FROM hcm.persons p
    JOIN hcm.work_relationships wr ON wr.person_id = p.id
    JOIN LATERAL (SELECT * FROM hcm.assignments a2 WHERE a2.person_id = p.id AND a2.effective_start <= GREATEST($1::date, wr.start_date)
                  ORDER BY a2.effective_start DESC, a2.effective_sequence DESC LIMIT 1) a ON true
    LEFT JOIN hcm.positions pos ON pos.id = a.position_id
    JOIN hcm.jobs j ON j.id = a.job_id
    JOIN hcm.departments d ON d.id = a.department_id
    JOIN hcm.grades g ON g.id = a.grade_id
    JOIN hcm.locations l ON l.id = a.location_id
    LEFT JOIN hcm.persons m ON m.id = a.manager_person_id
    LEFT JOIN LATERAL (SELECT * FROM hcm.salaries s2 WHERE s2.person_id = p.id AND s2.date_from <= GREATEST($1::date, wr.start_date)
                       ORDER BY s2.date_from DESC LIMIT 1) s ON true
    LEFT JOIN hcm.end_of_service eos ON eos.person_id = p.id
   WHERE ${where}`;

export async function worker(ctx: Ctx, personId: number, asOf: string): Promise<Worker | undefined> {
  return read(ctx, 'workers', `q=PersonId=${personId}&expand=workRelationships.assignments,salaries`, `Read worker ${personId}`, async () => {
    const r = await ctx.c.query(WORKER_SQL('p.id = $2'), [asOf, personId]);
    return r.rows[0] as Worker | undefined;
  });
}

export async function workers(ctx: Ctx, asOf: string, where = 'true', params: unknown[] = [], summary = 'List workers'): Promise<Worker[]> {
  return read(ctx, 'workers', 'expand=workRelationships.assignments', summary, async () => {
    const r = await ctx.c.query(`${WORKER_SQL(where)} ORDER BY p.display_name`, [asOf, ...params]);
    return r.rows as Worker[];
  });
}

/** Active on a date: started, not ended, not a pending worker. */
export const ACTIVE = `wr.worker_type = 'E' AND wr.start_date <= $1::date AND (wr.end_date IS NULL OR wr.end_date >= $1::date)`;

export async function team(ctx: Ctx, managerId: number, asOf: string) {
  return workers(ctx, asOf, `${ACTIVE} AND a.manager_person_id = $2`, [managerId], `Direct reports of ${managerId}`);
}

export async function balances(ctx: Ctx, personId: number, year: number) {
  return read(ctx, 'absences', `q=PersonId=${personId}&expand=entitlementSummary`, `Absence balances ${personId}`, async () => {
    const r = await ctx.c.query(
      `SELECT b.*, t.name, t.name_ar, (b.entitlement + b.carried_over - b.taken - b.booked) AS balance
         FROM hcm.absence_balances b JOIN hcm.absence_types t ON t.code = b.type_code
        WHERE b.person_id = $1 AND b.year = $2 ORDER BY t.code = 'ANNUAL' DESC, t.code`, [personId, year]);
    return r.rows as any[];
  });
}
