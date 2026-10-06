import type { AgentResolver, AgentToolCall } from './types';

/**
 * A deterministic, offline resolver.
 *
 * It matches an utterance against the labels, aliases and record summaries in
 * the surface. No model, no network, no API key — which makes it the right
 * choice for a demo, for tests, and as the fallback when the real resolver is
 * unreachable.
 *
 * Be honest about what it is: this is keyword matching, not comprehension. It
 * handles "open X", "show me record Y", "how many Z" and little else. Ship it
 * as a fallback, not as the product, and never describe it to a client as an
 * AI assistant.
 */

function fold(value: string): string {
  // Turkish and other Latin-ext text needs folding before naive matching:
  // "İSTİHBARAT" and "istihbarat" must compare equal.
  return value
    .toLocaleLowerCase('tr')
    .replace(/[ıİ]/g, 'i')
    .replace(/[şŞ]/g, 's')
    .replace(/[ğĞ]/g, 'g')
    .replace(/[üÜ]/g, 'u')
    .replace(/[öÖ]/g, 'o')
    .replace(/[çÇ]/g, 'c')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

/** How many of the needle's words appear in the haystack. */
function overlap(needle: string, haystack: string): number {
  const words = fold(needle).split(/\s+/).filter((w) => w.length > 2);
  if (words.length === 0) return 0;
  const hay = fold(haystack);
  return words.filter((w) => hay.includes(w)).length / words.length;
}

/**
 * The three sentences this resolver can say.
 *
 * They are English by default and overridable per app, because the resolver is
 * product-agnostic and must not ship one client's language to the next one.
 * That bug has happened: a Turkish build's strings reached an English app and
 * the assistant answered in Turkish.
 */
export type ResolverStrings = {
  /** Nothing matched. Ask again rather than guessing. */
  notFound: string;
  /** Opening a record, given its identifier. */
  openingRecord: (id: string) => string;
  /** Opening a screen, given its label. */
  openingScreen: (label: string) => string;
};

export const defaultStrings: ResolverStrings = {
  notFound: "I could not find that — could you put it another way?",
  openingRecord: (id) => `Opening ${id}.`,
  openingScreen: (label) => `Opening ${label}.`,
};

/** Kept for apps that imported it directly. Prefer `defaultStrings.notFound`. */
export const notFound = defaultStrings.notFound;

/**
 * Build a resolver with this app's own wording. A Turkish app passes Turkish
 * strings here; it does not edit the design system.
 */
export function createLocalResolver(
  strings: Partial<ResolverStrings> = {},
): AgentResolver {
  const say = { ...defaultStrings, ...strings };
  return async (utterance, surface) => run(utterance, surface, say);
}

export const localResolver: AgentResolver = async (utterance, surface) =>
  run(utterance, surface, defaultStrings);

const run: (
  utterance: string,
  surface: Parameters<AgentResolver>[1],
  say: ResolverStrings,
) => ReturnType<AgentResolver> = async (utterance, surface, say) => {
  const calls: AgentToolCall[] = [];
  const q = fold(utterance);

  // 1. A record referred to by its identifier wins outright — people quote ids
  //    precisely and mean exactly that record.
  for (const collection of surface.collections) {
    for (const item of collection.list()) {
      const id = collection.identify(item);
      if (id && q.includes(fold(id))) {
        calls.push({ tool: 'open_record', collectionId: collection.id, recordId: id });
        return {
          reply: say.openingRecord(id),
          calls,
        };
      }
    }
  }

  // 2. A screen by name or alias.
  let bestScreen: { id: string; score: number } | null = null;
  for (const screen of surface.screens) {
    const score = Math.max(
      overlap(screen.label, utterance),
      ...(screen.aliases ?? []).map((a) => overlap(a, utterance)),
    );
    if (score >= 0.6 && (!bestScreen || score > bestScreen.score)) {
      bestScreen = { id: screen.id, score };
    }
  }
  if (bestScreen) {
    const screen = surface.screens.find((s) => s.id === bestScreen!.id)!;
    return {
      reply: say.openingScreen(screen.label),
      calls: [{ tool: 'open_screen', screenId: screen.id }],
    };
  }

  // 3. A search within a collection the utterance names.
  for (const collection of surface.collections) {
    const named =
      overlap(collection.label, utterance) >= 0.6 ||
      (collection.aliases ?? []).some((a) => overlap(a, utterance) >= 0.6);
    if (named) {
      return {
        reply: '',
        calls: [{ tool: 'search', collectionId: collection.id, query: utterance }],
      };
    }
  }

  // 4. Otherwise search every collection. The runner returns what it finds;
  //     if nothing matches, say so plainly rather than guessing.
  const searches = surface.collections.map((c) => ({
    tool: 'search' as const,
    collectionId: c.id,
    query: utterance,
  }));
  const anyMatch = surface.collections.some((c) =>
    c.list().some((item) => overlap(utterance, c.summarise(item)) > 0),
  );
  return {
    reply: anyMatch ? '' : say.notFound,
    calls: anyMatch ? searches : [],
  };
};
