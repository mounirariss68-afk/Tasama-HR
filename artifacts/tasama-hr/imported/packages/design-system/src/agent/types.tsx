import type { ReactNode } from 'react';

/**
 * THE AGENT SURFACE.
 *
 * An in-app assistant that can answer questions about the app's data and drive
 * its screens needs the app to declare what exists. That declaration — screens,
 * records, actions — is the *surface*. Everything else (tool schemas, the model
 * call, the execution loop) is generated from it.
 *
 * The rule that keeps this maintainable: the registry is the single source of
 * truth. Adding a screen makes it reachable by the assistant automatically. A
 * hand-written tool schema that drifts from the app is the failure mode this
 * design exists to prevent.
 */

/** What an action does to the app. The runner treats these very differently. */
export type AgentEffect =
  /** Changes what is on screen. Safe to run without asking. */
  | 'navigate'
  /** Reads data and returns it. Safe. */
  | 'read'
  /** Changes stored data or sends something. NEVER run without confirmation. */
  | 'write';

/** A screen the assistant can open. */
export type AgentScreen = {
  id: string;
  /** How a person refers to it, in the app's own language. */
  label: string;
  /** Other names people use — synonyms, the English name, common misspellings. */
  aliases?: string[];
  /** One line telling the model when this screen is the right answer. */
  description: string;
  open: (params?: Record<string, string>) => void;
};

/**
 * A collection of records the assistant can search, summarise and open.
 * Keep `summarise` cheap: it runs for every item the model is shown.
 */
export type AgentCollection<T = unknown> = {
  id: string;
  label: string;
  aliases?: string[];
  description: string;
  /** Every record, or the ones currently loaded. */
  list: () => T[];
  /** Stable id for a record, so the model can refer to one precisely. */
  identify: (item: T) => string;
  /** The short text the model reasons over. Include the identifier. */
  summarise: (item: T) => string;
  /** Show this record in the UI. Omit for collections that are read-only. */
  open?: (item: T) => void;
};

/** A verb beyond navigating and reading — declared by the app, run by the user. */
export type AgentAction = {
  id: string;
  description: string;
  effect: AgentEffect;
  /** Flat string params only: this is what a model can reliably produce. */
  params?: Record<string, { description: string; required?: boolean }>;
  run: (params: Record<string, string>) => Promise<string> | string;
  /** Shown to the user before a `write` runs. */
  confirm?: (params: Record<string, string>) => string;
};

/** The generated description of everything the assistant can see and do. */
export type AgentSurface = {
  screens: AgentScreen[];
  collections: AgentCollection<any>[];
  actions: AgentAction[];
};

/** One step the resolver wants the app to take. */
export type AgentToolCall =
  | { tool: 'open_screen'; screenId: string; params?: Record<string, string> }
  | { tool: 'open_record'; collectionId: string; recordId: string }
  | { tool: 'search'; collectionId: string; query: string }
  | { tool: 'run_action'; actionId: string; params: Record<string, string> };

export type AgentTurn = {
  /** What to say. May be empty if the calls speak for themselves. */
  reply: string;
  calls: AgentToolCall[];
};

/**
 * Turns an utterance plus the surface into a turn. Two implementations ship:
 * a local deterministic one (no network, good for demos and as a fallback) and
 * an HTTP one that posts to a server running the real model loop.
 */
export type AgentResolver = (
  utterance: string,
  surface: AgentSurface,
  history: { from: 'user' | 'assistant'; text: string }[],
) => Promise<AgentTurn>;

/** What the runner hands back for rendering in the transcript. */
export type AgentResult = {
  reply: string;
  /** Human-readable note of what was done — "Opened Ürün Portföyü". */
  performed: string[];
  /** Set when a `write` needs the user to approve it first. */
  pending?: { call: AgentToolCall; prompt: string };
};

export type AgentRenderable = ReactNode;
