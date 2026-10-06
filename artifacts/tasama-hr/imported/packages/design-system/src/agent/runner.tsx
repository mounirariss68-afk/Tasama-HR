import { useCallback, useState } from 'react';
import { useAgentRegistry } from './registry';
import type {
  AgentResolver,
  AgentResult,
  AgentToolCall,
} from './types';

/**
 * Executes the calls a resolver returns.
 *
 * THE SAFETY MODEL, and why it lives here rather than in the resolver: the
 * resolver is a model. Its output is a *suggestion*, and it can be steered by
 * anything the user types or anything embedded in the data it read. So the
 * runner never trusts it:
 *
 *   - Every id is looked up in the registry. An invented screen, collection,
 *     record or action id simply does not resolve, so a hallucinated or
 *     injected call does nothing.
 *   - `navigate` and `read` run immediately. They change what is on screen or
 *     return data the user can already reach.
 *   - `write` NEVER runs on the resolver's say-so. It comes back as a pending
 *     confirmation for the user to approve. In a banking app this is the line
 *     between an assistant and an incident.
 *
 * The server must enforce the same rules independently — see resolver-http.
 */

const MAX_MATCHES = 6;

export function useAgentRunner(resolve: AgentResolver) {
  const { surface } = useAgentRegistry();
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<AgentResult['pending']>(undefined);

  const execute = useCallback(
    (call: AgentToolCall): { note?: string; text?: string; needsConfirm?: string } => {
      switch (call.tool) {
        case 'open_screen': {
          const screen = surface.screens.find((s) => s.id === call.screenId);
          if (!screen) return {};
          screen.open(call.params);
          return { note: screen.label };
        }

        case 'open_record': {
          const collection = surface.collections.find((c) => c.id === call.collectionId);
          if (!collection?.open) return {};
          const item = collection
            .list()
            .find((entry) => collection.identify(entry) === call.recordId);
          if (!item) return {};
          collection.open(item);
          return { note: call.recordId };
        }

        case 'search': {
          const collection = surface.collections.find((c) => c.id === call.collectionId);
          if (!collection) return {};
          const q = call.query.toLocaleLowerCase('tr');
          const words = q.split(/\s+/).filter((w) => w.length > 3);
          const matches = collection
            .list()
            .map((item) => ({ item, text: collection.summarise(item) }))
            .filter(({ text }) => {
              const hay = text.toLocaleLowerCase('tr');
              return words.some((w) => hay.includes(w));
            })
            .slice(0, MAX_MATCHES);
          if (matches.length === 0) return {};
          return {
            text: `${collection.label}: ${matches.map((m) => m.text).join(' · ')}`,
          };
        }

        case 'run_action': {
          const action = surface.actions.find((a) => a.id === call.actionId);
          if (!action) return {};
          if (action.effect === 'write') {
            // Stop here. The user approves before anything is written.
            return {
              needsConfirm:
                action.confirm?.(call.params) ??
                `Run "${action.description}"?`,
            };
          }
          const result = action.run(call.params);
          return { text: typeof result === 'string' ? result : undefined };
        }

        default:
          return {};
      }
    },
    [surface],
  );

  const send = useCallback(
    async (
      utterance: string,
      history: { from: 'user' | 'assistant'; text: string }[] = [],
    ): Promise<AgentResult> => {
      setBusy(true);
      try {
        const turn = await resolve(utterance, surface, history);
        const performed: string[] = [];
        const found: string[] = [];
        let confirm: { call: AgentToolCall; prompt: string } | undefined;

        for (const call of turn.calls) {
          const outcome = execute(call);
          if (outcome.needsConfirm && !confirm) {
            confirm = { call, prompt: outcome.needsConfirm };
          }
          if (outcome.note) performed.push(outcome.note);
          if (outcome.text) found.push(outcome.text);
        }

        setPending(confirm);

        /* `performed` is a list of what was opened, for an app that wants to
         * render it as chips. The reply is what gets spoken. */
        const reply =
          turn.reply || (found.length > 0 ? found.join('\n') : '');

        return { reply, performed, pending: confirm };
      } finally {
        setBusy(false);
      }
    },
    [execute, resolve, surface],
  );

  /** Run the action the user just approved. */
  const confirmPending = useCallback(async (): Promise<string> => {
    const call = pending?.call;
    if (!call || call.tool !== 'run_action') return '';
    const action = surface.actions.find((a) => a.id === call.actionId);
    setPending(undefined);
    if (!action) return '';
    const result = await action.run(call.params);
    return typeof result === 'string' ? result : '';
  }, [pending, surface]);

  const cancelPending = useCallback(() => setPending(undefined), []);

  return { send, busy, pending, confirmPending, cancelPending, surface };
}
