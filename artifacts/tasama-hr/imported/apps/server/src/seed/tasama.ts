/**
 * Tasama-level data: contracts, delivery team, payroll run record, invoices,
 * satisfaction surveys. Runs after every client account has been seeded,
 * because the payroll record, invoices and service levels are derived from
 * the clients' own data. Illustrative and deterministic.
 */
import { pool, withClient, insertMany } from '../db.js';
import { CLIENTS, slasFor } from '../domain/clients.js';
import { rng } from '../domain/rng.js';
import { addDays, addMonths, iso, monthStart, parse, round2 } from '../domain/rules.js';
import { closedMonths, prepareInvoice, raqeebScan, tasamaTrail, invoiceLines } from '../tasama/service.js';
import { setClock } from '../clock.js';

/** Delivery team. FTE shares are of each person's time on these five accounts; the rest serves other Tasama clients. */
export const STAFF: [string, string, string, string, string[], number, [string, number][]][] = [
  ['Faisal Al Harbi', 'فيصل الحربي', 'HR Operations Manager', 'مدير عمليات الموارد البشرية', ['ACCOUNT'], 46000, [['roshn', 0.1], ['riyadhair', 0.1], ['redsea', 0.1], ['seven', 0.1], ['saudicoffee', 0.05]]],
  ['Nora Al Shehri', 'نورة الشهري', 'Client Account Manager', 'مديرة حسابات العملاء', ['ACCOUNT'], 34000, [['roshn', 0.2], ['riyadhair', 0.2]]],
  ['Majed Al Qahtani', 'ماجد القحطاني', 'Client Account Manager', 'مدير حسابات العملاء', ['ACCOUNT'], 33000, [['redsea', 0.15], ['seven', 0.15], ['saudicoffee', 0.05]]],
  ['Ahmed Al Zahrani', 'أحمد الزهراني', 'Senior Payroll Specialist', 'أخصائي رواتب أول', ['PAYROLL'], 27000, [['roshn', 0.35], ['redsea', 0.25]]],
  ['Ritu Menon', 'ريتو مينون', 'Payroll Specialist', 'أخصائية رواتب', ['PAYROLL'], 24000, [['riyadhair', 0.4], ['seven', 0.2]]],
  ['Hana Al Mutairi', 'هناء المطيري', 'Payroll Specialist', 'أخصائية رواتب', ['PAYROLL'], 23000, [['saudicoffee', 0.15], ['redsea', 0.1]]],
  ['Omar Farouk', 'عمر فاروق', 'Payroll Specialist', 'أخصائي رواتب', ['PAYROLL'], 22000, [['seven', 0.15], ['roshn', 0.1]]],
  ['Lama Al Dossary', 'لمى الدوسري', 'HR Operations Specialist', 'أخصائية عمليات الموارد البشرية', ['HR_OPS'], 22000, [['roshn', 0.45]]],
  ['Yousef Al Ghamdi', 'يوسف الغامدي', 'HR Operations Specialist', 'أخصائي عمليات الموارد البشرية', ['HR_OPS'], 21000, [['riyadhair', 0.5]]],
  ['Dalia Haddad', 'داليا حداد', 'HR Operations Specialist', 'أخصائية عمليات الموارد البشرية', ['HR_OPS'], 21000, [['seven', 0.35], ['redsea', 0.15]]],
  ['Sara Al Otaibi', 'سارة العتيبي', 'Recruitment Administrator', 'منسقة توظيف', ['RECRUITMENT'], 19000, [['roshn', 0.3], ['riyadhair', 0.3]]],
  ['Khalid Mansour', 'خالد منصور', 'Recruitment Administrator', 'منسق توظيف', ['RECRUITMENT'], 18500, [['riyadhair', 0.4], ['seven', 0.3]]],
];

export async function seedTasama(log: (s: string) => void = console.log) {
  const today = new Date();
  const R = rng(4242);

  // Delivery team and contracts.
  const staff = await insertMany(pool, 'tasama.staff', STAFF.map(([name, name_ar, role, role_ar, skills, cost]) => ({ name, name_ar, role, role_ar, skills, monthly_cost: cost, capacity_hours: 150 })), 'id, name');
  const sid = (n: string) => staff.find((s: any) => s.name === n)!.id as number;
  const am: Record<string, string> = { roshn: 'Nora Al Shehri', riyadhair: 'Nora Al Shehri', redsea: 'Majed Al Qahtani', seven: 'Majed Al Qahtani', saudicoffee: 'Majed Al Qahtani' };
  await insertMany(pool, 'tasama.clients', CLIENTS.map((c, i) => ({
    key: c.key, code: c.code, name: c.name, name_ar: c.name_ar, short: c.short, sector: c.sector, sector_ar: c.sector_ar, city: c.city, city_ar: c.city_ar,
    hrms: c.hrms, hrms_label: c.hrmsLabel, model: c.contract.model, model_ar: c.contract.model_ar, services: c.contract.services, pepm: c.contract.pepm, per_hire: c.contract.perHire,
    contract_start: c.contract.start, contract_end: iso(addDays(addMonths(c.contract.start, c.contract.term), -1)), phase: c.contract.phase, credit_cap_pct: c.contract.creditCapPct,
    account_manager_id: sid(am[c.key]), nitaqat: c.nitaqat, sort: i,
  })));
  await insertMany(pool, 'tasama.sla_defs', CLIENTS.flatMap((c) => slasFor(c).map((s) => ({ client_key: c.key, key: s.key, label: s.label, label_ar: s.label_ar, target: s.target, credit_pct: s.creditPct }))));
  await insertMany(pool, 'tasama.allocations', STAFF.flatMap(([name, , , , , , al]) => al.map(([client_key, fte]) => ({ staff_id: sid(name), client_key, fte }))));

  for (const cl of CLIENTS) {
    // Payroll run record for each closed month, from the client's own payroll results.
    const runs = await withClient(cl.key, async () => (await pool.query(
      `SELECT pp.start_date AS period, pp.pay_date, COUNT(pr.id)::int employees, COALESCE(SUM(pr.gross),0) gross
         FROM hcm.payroll_periods pp LEFT JOIN hcm.payroll_results pr ON pr.period_id = pp.id
        WHERE pp.status='CLOSED' GROUP BY 1,2 ORDER BY 1`)).rows);
    const rows = runs.filter((r: any) => r.employees > 0).map((r: any, i: number, all: any[]) => {
      const last = i === all.length - 1, prev = i === all.length - 2;
      // Planted service history: one month with post-release corrections at Riyadh Air, one late Mudad upload at Saudi Coffee.
      const errors = cl.key === 'riyadhair' && prev ? 3 : cl.key === 'redsea' && i === all.length - 4 ? 1 : R.chance(0.15) ? 1 : 0;
      const late = cl.key === 'saudicoffee' && last;
      const paid = late ? iso(addDays(r.pay_date, 2)) : r.pay_date;
      return { client_key: cl.key, period: r.period, employees: r.employees, findings_before: R.int(3, 9) + (cl.size > 200 ? 3 : 0), errors_after: cl.key === 'roshn' ? 0 : errors, pay_date_due: r.pay_date, paid_on: paid, mudad_uploaded_on: iso(addDays(paid, -2)), gross: round2(Number(r.gross)) };
    });
    await insertMany(pool, 'tasama.payroll_runs', rows);

    // Onboarding readiness history: a slower client misses day-one readiness for one recent joiner.
    if (cl.slowness >= 1.4) await withClient(cl.key, async () => {
      await pool.query(`UPDATE hcm.journey_tasks t SET completed_at = wr.start_date + 3, note = 'Laptop and access ready on day four'
                          FROM hcm.journeys j, hcm.work_relationships wr
                         WHERE t.journey_id = j.id AND j.person_id = wr.person_id AND t.task_key = 'day1'
                           AND t.id = (SELECT t2.id FROM hcm.journey_tasks t2 JOIN hcm.journeys j2 ON j2.id=t2.journey_id WHERE t2.task_key='day1' AND t2.status='DONE' ORDER BY t2.id LIMIT 1)`);
    });

    // Satisfaction surveys: steady at most clients, lower where service levels slipped.
    const csat = closedMonths(cl, 9, today).map((m, i, all) => ({ client_key: cl.key, period: iso(m),
      score: round2(Math.min(4.9, (cl.slowness >= 1.8 ? 3.95 - (i === all.length - 1 ? 0.25 : 0) : cl.slowness >= 1.3 ? 4.15 : 4.45) + (R.next() - 0.5) * 0.25)), responses: R.int(18, 60) }));
    if (csat.length) await insertMany(pool, 'tasama.csat', csat);

    // Invoices: every closed month since the contract started. The last month is left for Fatoora where noted.
    const months = closedMonths(cl, 9, today);
    for (const [i, m] of months.entries()) {
      const last = i === months.length - 1;
      if (last && cl.key === 'redsea') continue;   // the month-end scenario prepares this one
      setClock(new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 2, 7)));
      const inv = await prepareInvoice(cl, m);
      const issued = iso(addDays(monthStart(m, 1), 2)), due = iso(addDays(issued, 30));
      const overdue = cl.key === 'riyadhair' && i === months.length - 2;
      const status = last ? (cl.key === 'roshn' ? 'PREPARED' : 'ISSUED') : overdue ? 'OVERDUE' : parse(due) < today ? 'PAID' : 'ISSUED';
      await pool.query(`UPDATE tasama.invoices SET status=$2, issued_at=$3, due_at=$4, paid_at=$5 WHERE id=$1`,
        [inv.id, status, status === 'PREPARED' ? null : issued, status === 'PREPARED' ? null : due, status === 'PAID' ? iso(addDays(due, -R.int(1, 9))) : null]);
      if (status !== 'PREPARED') await tasamaTrail(pool, { client_key: cl.key, actor_type: 'HUMAN', actor_id: 'tasama', actor_name: 'Faisal Al Harbi', act: 'APPROVE', ref: inv.number, at: new Date(`${issued}T08:00:00Z`),
        summary: `Approved and issued ${inv.number}.`, summary_ar: `اعتمد وأصدر الفاتورة ${inv.number}.` });
    }
    setClock(null);
    void invoiceLines;
  }
  setClock(null);
  const found = await raqeebScan();
  await pool.query(`INSERT INTO tasama.meta (key, value) VALUES ('seeded_at', $1)`, [JSON.stringify(new Date().toISOString())]);
  log(`tasama seeded: ${CLIENTS.length} clients, ${STAFF.length} delivery staff, ${found.length} SLA escalations`);
}
