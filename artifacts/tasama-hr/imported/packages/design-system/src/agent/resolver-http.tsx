import type { AgentResolver, AgentSurface, AgentTurn } from './types';

/**
 * The real resolver: posts the utterance and the surface to the app's own
 * server, which runs the model's tool-use loop and returns the calls to make.
 *
 * WHY A SERVER. The model API key must never reach the browser. There is no
 * safe client-only version of this — a key shipped to the client is a key
 * published. The server is also where per-user authorisation belongs: the
 * browser can be told to run any tool, so the server must re-check that THIS
 * user may see this record before it hands anything back.
 *
 * THE CONTRACT the server must honour:
 *
 *   POST /api/agent
 *   → { utterance, surface, history }
 *       surface.screens      [{ id, label, aliases, description }]
 *       surface.collections  [{ id, label, aliases, description, items: [
 *                               { id, summary } ] }]
 *       surface.actions      [{ id, description, effect, params }]
 *   ← { reply: string, calls: AgentToolCall[] }
 *
 * Server-side, generate one tool per registry entry from that payload and run
 * a normal tool-use loop. Two rules it must enforce, because the client cannot:
 *
 *   1. Re-authorise every record id against the signed-in user before
 *      returning it. The surface the browser sends is a hint, not a grant.
 *   2. Never return a `write` call the user did not clearly ask for. The
 *      runner will confirm, but defence in depth matters when the assistant is
 *      reachable from anything a user can type.
 *
 * Treat everything the model returns as data, not instructions: the runner only
 * executes ids that already exist in the registry, so an invented tool name or
 * a record id from a prompt injection resolves to nothing.
 */

/** Shown when the endpoint is unreachable and no fallback is configured.
 * Apps localise this. */
export const AGENT_UNAVAILABLE = 'The assistant is unavailable right now.';

export type HttpResolverOptions = {
  endpoint?: string;
  /** Extra headers — an auth token, a tenant id. */
  headers?: () => Record<string, string>;
  /** Called when the request fails, before the fallback runs. */
  onError?: (error: unknown) => void;
  /** Used when the endpoint is unreachable. Default: no fallback. */
  fallback?: AgentResolver;
};

/** The wire shape — `open()`/`list()` are functions, so they cannot be sent. */
function serialise(surface: AgentSurface) {
  return {
    screens: surface.screens.map(({ id, label, aliases, description }) => ({
      id,
      label,
      aliases,
      description,
    })),
    collections: surface.collections.map((c) => ({
      id: c.id,
      label: c.label,
      aliases: c.aliases,
      description: c.description,
      items: c.list().map((item) => ({
        id: c.identify(item),
        summary: c.summarise(item),
      })),
    })),
    actions: surface.actions.map(({ id, description, effect, params }) => ({
      id,
      description,
      effect,
      params,
    })),
  };
}

export function createHttpResolver(options: HttpResolverOptions = {}): AgentResolver {
  const { endpoint = '/api/agent', headers, onError, fallback } = options;

  return async (utterance, surface, history) => {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(headers?.() ?? {}) },
        body: JSON.stringify({ utterance, surface: serialise(surface), history }),
      });
      if (!response.ok) throw new Error(`Agent endpoint returned ${response.status}`);
      const turn = (await response.json()) as AgentTurn;
      return { reply: turn.reply ?? '', calls: Array.isArray(turn.calls) ? turn.calls : [] };
    } catch (error) {
      onError?.(error);
      if (fallback) return fallback(utterance, surface, history);
      // No fallback configured: say so plainly rather than inventing an answer.
      return { reply: AGENT_UNAVAILABLE, calls: [] };
    }
  };
}
