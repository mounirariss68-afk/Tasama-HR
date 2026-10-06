/**
 * Claude through Replit AI Integrations.
 *
 * On Replit, the platform's Anthropic connection sets
 * AI_INTEGRATIONS_ANTHROPIC_BASE_URL and AI_INTEGRATIONS_ANTHROPIC_API_KEY
 * (the key is a placeholder; Replit authenticates and bills the call). No
 * Anthropic key of our own is used anywhere. Without the connection, the
 * assistants fall back to offline answers and the UI says so.
 *
 * Model: the first of MODELS that the connection accepts. If a model is not
 * offered, the next one is tried and the working one is remembered.
 */
import Anthropic from '@anthropic-ai/sdk';

const MODELS = ['claude-sonnet-4-6', 'claude-sonnet-4-5', 'claude-opus-4-6', 'claude-haiku-4-5'];
let working: string | null = null;
let client: Anthropic | null = null;

export function aiConfigured(): boolean {
  return Boolean(process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL);
}

export function aiStatus() {
  return { mode: aiConfigured() ? ('claude' as const) : ('offline' as const), model: working ?? MODELS[0], via: 'Replit AI Integrations' };
}

function getClient(): Anthropic | null {
  if (!aiConfigured()) return null;
  return (client ??= new Anthropic({
    baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
    apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || 'replit-ai-integrations',
  }));
}

const modelRejected = (e: any) =>
  e?.status === 404 || (e?.status === 400 && /model/i.test(String(e?.message ?? '')));

/** messages.create with the first model the connection accepts. */
export async function createMessage(params: Omit<Anthropic.MessageCreateParamsNonStreaming, 'model'>): Promise<{ msg: Anthropic.Message; model: string }> {
  const c = getClient();
  if (!c) throw new Error('Replit AI Integrations is not connected');
  const order = working ? [working, ...MODELS.filter((m) => m !== working)] : MODELS;
  let last: any;
  for (const model of order) {
    try {
      const msg = await c.messages.create({ ...params, model });
      working = model;
      return { msg, model };
    } catch (e: any) {
      last = e;
      if (!modelRejected(e)) throw e;
      console.warn(`[ai] model ${model} not available, trying the next one`);
    }
  }
  throw last;
}
