/**
 * Tasama HR operations' document set and the contracts clients send (design/payroll-ops-addendum.md 1.4, 1.5, 1.7).
 *
 *  - Every active employee has a contract, a national ID or iqama and an IBAN letter on file, received at hire.
 *    At each client two records miss their IBAN letter and one misses its ID: Lama's gaps to chase.
 *  - At ROSHN and SEVEN two contracts the client sent wait on Tasama HR operations (WF-37): one clean, one that
 *    pays housing below the policy and arrives without its IBAN letter.
 * Own random numbers, so nothing else in the seed moves.
 */
import type { PoolClient } from 'pg';
import { rng } from '../domain/rng.js';
import type { ClientConfig } from '../domain/clients.js';
import type { BaseResult } from './base.js';
import { startCase } from '../engine/core.js';
import { setClock } from '../clock.js';
import { syntheticIban } from '../domain/banks.js';

const hash = (s: string) => [...s].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) | 0, 7);
const d10 = (d: any) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
const DAY = 86_400_000;

export async function seedDocuments(c: PoolClient, cl: ClientConfig) {
  const R = rng(hash(`documents:${cl.key}`));
  const people = (await c.query(`SELECT p.id, p.person_number, p.is_saudi, p.iqama_expiry, p.national_id_expiry, wr.start_date FROM hcm.persons p JOIN hcm.work_relationships wr ON wr.person_id=p.id
    WHERE wr.worker_type='E' AND wr.end_date IS NULL ORDER BY p.id`)).rows;
  const gaps = R.shuffle(people.map((p: any) => p.id)).slice(0, 3);
  for (const p of people) {
    const start = d10(p.start_date);
    const rows: [string, string | null, string | null][] = [
      ['CONTRACT', `${p.person_number} employment contract.pdf`, null],
      [p.is_saudi ? 'NATIONAL_ID' : 'IQAMA', `${p.person_number} ${p.is_saudi ? 'national ID' : 'iqama'}.pdf`, p.is_saudi ? d10(p.national_id_expiry) : p.iqama_expiry ? d10(p.iqama_expiry) : null],
      ['IBAN_LETTER', `${p.person_number} IBAN letter.pdf`, null],
    ];
    for (const [kind, file, exp] of rows) {
      const missing = (kind === 'IBAN_LETTER' && (p.id === gaps[0] || p.id === gaps[1])) || ((kind === 'NATIONAL_ID' || kind === 'IQAMA') && p.id === gaps[2]);
      await c.query(`INSERT INTO layer.employee_documents (person_id, kind, file_name, received_on, expires_on, status, source) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [p.id, kind, missing ? null : file, missing ? null : start, exp, missing ? 'MISSING' : 'RECEIVED', 'The client\'s email']);
    }
  }
}

type Intake = { first: string; last: string; first_ar: string; last_ar: string; gender: 'M' | 'F'; nationality: string; is_saudi: boolean; dob: string; bank: string; below: boolean; ibanLetter: boolean };
export const INTAKES: Record<string, Intake[]> = {
  roshn: [
    { first: 'Reem', last: 'Al Harthi', first_ar: 'ريم', last_ar: 'الحارثي', gender: 'F', nationality: 'SA', is_saudi: true, dob: '1996-03-14', bank: 'Al Rajhi Bank', below: false, ibanLetter: true },
    { first: 'Omar', last: 'Siddiqui', first_ar: 'عمر', last_ar: 'صديقي', gender: 'M', nationality: 'PK', is_saudi: false, dob: '1991-08-02', bank: 'Saudi National Bank', below: true, ibanLetter: false },
  ],
  seven: [
    { first: 'Lina', last: 'Al Qahtani', first_ar: 'لينا', last_ar: 'القحطاني', gender: 'F', nationality: 'SA', is_saudi: true, dob: '1998-11-21', bank: 'Riyad Bank', below: false, ibanLetter: true },
    { first: 'Karim', last: 'Haddad', first_ar: 'كريم', last_ar: 'حداد', gender: 'M', nationality: 'JO', is_saudi: false, dob: '1993-05-09', bank: 'Alinma Bank', below: true, ibanLetter: false },
  ],
};

/** One contract the client sent (WF-37): the employee, the terms and the documents, from INTAKES. */
export async function startIntake(c: PoolClient, cl: ClientConfig, i: number, requester: number, opts: { scenario?: string; daysAgo?: number } = {}) {
  const x = INTAKES[cl.key]?.[i];
  if (!x) return null;
  const R = rng(hash(`intake:${cl.key}:${i}`));
  const per = (await c.query(`SELECT period_name, to_char(start_date,'YYYY-MM-DD') s, to_char(end_date,'YYYY-MM-DD') e FROM hcm.payroll_periods WHERE status='OPEN' ORDER BY start_date DESC LIMIT 1`)).rows[0];
  if (!per) return null;
  const positions = (await c.query(`SELECT p.id, p.name, p.name_ar, g.code grade, g.min_basic, g.mid_basic FROM hcm.positions p JOIN hcm.grades g ON g.id=p.grade_id WHERE p.status='ACTIVE' AND g.rank BETWEEN 3 AND 6 ORDER BY p.id`)).rows;
  const pol = cl.policy;
  const pos = positions[Math.floor(R.next() * positions.length)];
  const basic = Math.round(Number(pos.mid_basic) / 50) * 50;
  const housingPct = x.below ? pol.housingPct - 5 : pol.housingPct;
  const start = new Date(Date.parse(`${per.e}T00:00:00Z`) - (i === 0 ? 9 : 6) * DAY);
  const contract = {
    title: pos.name, title_ar: pos.name_ar, position_id: pos.id, grade: pos.grade, start_date: d10(start),
    basic, housing: Math.round((basic * housingPct) / 100), transport: Math.round((basic * pol.transportPct) / 100), other: 0,
    probation_days: pol.probationDays, annual_leave: Math.max(21, pol.annualLeave), notice_days: 30, weekly_hours: pol.weeklyHours,
    contract_type: x.is_saudi ? 'INDEFINITE' : 'FIXED_TERM',
  };
  const nid = `${x.is_saudi ? '1' : '2'}${String(Math.abs(hash(`${cl.key}:${x.first}`))).padStart(9, '0').slice(0, 9)}`;
  const employee = { first: x.first, last: x.last, first_ar: x.first_ar, last_ar: x.last_ar, name: `${x.first} ${x.last}`, name_ar: `${x.first_ar} ${x.last_ar}`, gender: x.gender, nationality: x.nationality, is_saudi: x.is_saudi, dob: x.dob,
    national_id: nid, iban: syntheticIban(`${cl.key}:intake:${x.first}`, x.bank, String(1200 + i * 37)), bank: x.bank };
  const documents = [
    { kind: 'CONTRACT', file: `${employee.name} signed contract.pdf`, received: true },
    { kind: x.is_saudi ? 'NATIONAL_ID' : 'IQAMA', file: `${employee.name} ${x.is_saudi ? 'national ID' : 'iqama'}.pdf`, received: true },
    { kind: 'IBAN_LETTER', file: x.ibanLetter ? `${employee.name} IBAN letter.pdf` : null, received: x.ibanLetter },
  ];
  if (opts.daysAgo) setClock(new Date(Date.now() - opts.daysAgo * DAY + 3 * 3600_000));
  const k = await startCase(c, { workflowId: 'WF-37', type: 'CLIENT_CONTRACT', title: `Contract from ${cl.short}: ${employee.name}`, title_ar: `عقد من ${cl.name_ar}: ${employee.name_ar}`,
    requester, subject: requester, channel: 'FORM', scenario: opts.scenario, payload: { employee, contract, documents, received_from: 'HR operations', client: cl.short } });
  if (opts.daysAgo) setClock(null);
  return k;
}

/** The contracts a client sent by email, waiting on Tasama HR operations on the demo day (WF-37). */
export async function seedContractIntake(c: PoolClient, base: BaseResult, cl: ClientConfig) {
  if (!INTAKES[cl.key]) return;
  for (let i = 0; i < INTAKES[cl.key].length; i++) await startIntake(c, cl, i, base.persona.payroll, { daysAgo: i === 0 ? 1 : 2 });
}
