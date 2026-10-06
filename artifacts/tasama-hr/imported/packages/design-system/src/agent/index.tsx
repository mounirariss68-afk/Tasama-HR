/**
 * The in-app assistant layer.
 *
 * An assistant that can answer questions about the app's data and drive its
 * screens is three things, and only the first is app-specific:
 *
 *   1. a REGISTRY the app declares itself into (screens, collections, actions)
 *   2. a RESOLVER that turns an utterance plus that surface into tool calls
 *   3. a RUNNER that executes the calls, refusing anything the registry does
 *      not know and holding writes for confirmation
 *
 * See docs/AGENT.md for the full build.
 */
export {
  AgentProvider,
  useAgentRegistry,
  useRegisterAction,
  useRegisterCollection,
  useRegisterScreen,
} from './registry';
export {
  createLocalResolver,
  defaultStrings,
  localResolver,
  notFound,
  type ResolverStrings,
} from './resolver-local';
export { createHttpResolver, AGENT_UNAVAILABLE } from './resolver-http';
export { useAgentRunner } from './runner';
export type {
  AgentAction,
  AgentCollection,
  AgentEffect,
  AgentResolver,
  AgentResult,
  AgentScreen,
  AgentSurface,
  AgentToolCall,
  AgentTurn,
} from './types';
