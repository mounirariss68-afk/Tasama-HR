/**
 * GOSI as a dated rate table (design/payroll-addendum.md §5).
 *
 * The rate depends on the date the person was FIRST registered with GOSI, not
 * the hire date with the current employer, and on the period being paid.
 * Contribution wage = basic + housing, capped at SAR 45,000. No I/O.
 */
export type GosiGroup = 'SAUDI_LEGACY' | 'SAUDI_NEW' | 'NON_SAUDI';
export type GosiRate = { from: string; employee: number; employer: number };

/** Saudis first registered on or after this date are on the new annuity system. */
export const NEW_SYSTEM_FROM = '2024-07-03';
export const CONTRIBUTION_CAP = 45_000;

export const GOSI_TABLE: Record<GosiGroup, GosiRate[]> = {
  SAUDI_LEGACY: [{ from: '1900-01-01', employee: 0.0975, employer: 0.1175 }],
  SAUDI_NEW: [
    { from: '2024-07-03', employee: 0.0975, employer: 0.1175 },
    { from: '2025-07-01', employee: 0.1025, employer: 0.1225 },
    { from: '2026-07-01', employee: 0.1075, employer: 0.1275 },
    { from: '2027-07-01', employee: 0.1125, employer: 0.1325 },
    { from: '2028-07-01', employee: 0.1175, employer: 0.1375 },
  ],
  NON_SAUDI: [{ from: '1900-01-01', employee: 0, employer: 0.02 }],
};

const d10 = (s: string | Date) => (s instanceof Date ? s.toISOString() : String(s)).slice(0, 10);

export function gosiGroup(isSaudi: boolean, firstRegistered: string | Date): GosiGroup {
  if (!isSaudi) return 'NON_SAUDI';
  return d10(firstRegistered) >= NEW_SYSTEM_FROM ? 'SAUDI_NEW' : 'SAUDI_LEGACY';
}

/** The rate in force on a date (the period's last day). */
export function gosiRate(group: GosiGroup, on: string | Date): GosiRate {
  const day = d10(on);
  const rows = GOSI_TABLE[group];
  let pick = rows[0];
  for (const r of rows) if (r.from <= day) pick = r;
  return pick;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function gosiContribution(basicPlusHousing: number, isSaudi: boolean, firstRegistered: string | Date, on: string | Date) {
  const group = gosiGroup(isSaudi, firstRegistered);
  const rate = gosiRate(group, on);
  const wage = Math.min(basicPlusHousing, CONTRIBUTION_CAP);
  return { group, wage, eeRate: rate.employee, erRate: rate.employer, employee: r2(wage * rate.employee), employer: r2(wage * rate.employer), rateFrom: rate.from };
}
