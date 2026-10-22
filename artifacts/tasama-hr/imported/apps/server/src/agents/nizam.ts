/**
 * Nizam — Policy Reader (WF-26).
 *
 * Reads a client's handbook into rules on the 27 dimensions payroll needs
 * (domain/payroll-policy.ts), keeps the clause and words behind each rule,
 * and flags what the law refuses, what the words leave unclear and what the
 * handbook does not cover. The values and the legal checks are deterministic.
 * When Claude is connected it words the note on each flagged rule for the
 * person who decides; offline the note is the rule's own.
 *
 * Nizam never activates anything: a version stays a draft until the client's
 * CHRO activates it.
 */
import type { ClientConfig } from '../domain/clients.js';
import { policiesFor, type Policy } from '../domain/policies.js';
import { readRules, DIMENSIONS, type Rule } from '../domain/payroll-policy.js';
import { aiConfigured, createMessage } from '../ai.js';

export type Reading = { rules: Rule[]; clauses: number; dims: number; flagged: Rule[]; by: 'Nizam (Claude)' | 'Nizam (offline)'; source: string };

export async function readHandbook(c: ClientConfig, opts: { revised?: boolean; policies?: Policy[]; source?: string; useClaude?: boolean } = {}): Promise<Reading> {
  const policies = opts.policies ?? policiesFor(c, opts.revised);
  const rules = readRules(c, policies);
  const flagged = rules.filter((r) => r.flag);
  let by: Reading['by'] = 'Nizam (offline)';
  if (opts.useClaude && aiConfigured() && flagged.length) {
    try {
      const { msg } = await createMessage({
        max_tokens: 600,
        system: 'You help a Saudi payroll team read a client HR handbook. For each flagged rule, write one plain sentence (at most 30 words) a payroll manager would say to the client\'s head of HR, explaining the problem and the decision needed. No preamble. Return JSON: {"<key>": "<sentence>"}.',
        messages: [{ role: 'user', content: JSON.stringify(flagged.map((r) => ({ key: r.key, rule: r.label, flag: r.flag, words: r.quote, law: r.flag_note }))) }],
      });
      const text = msg.content.map((b: any) => (b.type === 'text' ? b.text : '')).join('');
      const notes = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
      for (const r of flagged) if (typeof notes[r.key] === 'string' && notes[r.key].length < 300) r.flag_note = notes[r.key];
      by = 'Nizam (Claude)';
    } catch (e: any) {
      console.warn('[nizam] Claude note failed, keeping the offline notes:', e.message);
    }
  }
  return {
    rules, flagged, by,
    clauses: policies.reduce((n, p) => n + p.clauses.length, 0),
    dims: new Set(rules.map((r) => r.dim)).size,
    source: opts.source ?? `${c.short} HR handbook${opts.revised ? ', revised' : ''}`,
  };
}

export const dimensionName = (n: number) => DIMENSIONS.find((d) => d.n === n)?.name ?? `Dimension ${n}`;
