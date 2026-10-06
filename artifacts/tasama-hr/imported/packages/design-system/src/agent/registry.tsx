import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  AgentAction,
  AgentCollection,
  AgentScreen,
  AgentSurface,
} from './types';

/**
 * The registry every screen and collection declares itself into.
 *
 * Components register on mount and unregister on unmount, so the surface always
 * describes the app as it is *now* — including screens that only exist for
 * certain roles or lenses. The assistant cannot offer to open something the
 * current user cannot see, which is the cheapest access control there is.
 */

type RegistryValue = {
  surface: AgentSurface;
  registerScreen: (screen: AgentScreen) => () => void;
  registerCollection: (collection: AgentCollection<any>) => () => void;
  registerAction: (action: AgentAction) => () => void;
};

const AgentRegistryContext = createContext<RegistryValue | null>(null);

export function AgentProvider({ children }: { children: ReactNode }) {
  const [screens, setScreens] = useState<AgentScreen[]>([]);
  const [collections, setCollections] = useState<AgentCollection<any>[]>([]);
  const [actions, setActions] = useState<AgentAction[]>([]);

  const make = <T extends { id: string }>(
    set: React.Dispatch<React.SetStateAction<T[]>>,
  ) =>
    useCallback(
      (entry: T) => {
        set((current) => [...current.filter((e) => e.id !== entry.id), entry]);
        return () => set((current) => current.filter((e) => e.id !== entry.id));
      },
      [set],
    );

  const registerScreen = make(setScreens);
  const registerCollection = make(setCollections);
  const registerAction = make(setActions);

  const value = useMemo<RegistryValue>(
    () => ({
      surface: { screens, collections, actions },
      registerScreen,
      registerCollection,
      registerAction,
    }),
    [screens, collections, actions, registerScreen, registerCollection, registerAction],
  );

  return (
    <AgentRegistryContext.Provider value={value}>
      {children}
    </AgentRegistryContext.Provider>
  );
}

export function useAgentRegistry(): RegistryValue {
  const ctx = useContext(AgentRegistryContext);
  if (!ctx) throw new Error('useAgentRegistry must be used within <AgentProvider>');
  return ctx;
}

/** Keeps a registration in sync without re-registering on every render. */
function useRegistration<T extends { id: string }>(
  entry: T,
  register: (entry: T) => () => void,
) {
  const latest = useRef(entry);
  latest.current = entry;
  useEffect(() => {
    // Register a stable proxy that always reads the current closure, so
    // handlers capturing fresh state do not go stale between renders.
    return register({ ...entry, ...latest.current });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.id, register]);
}

/** Declare a screen the assistant can open. Call it where the screen lives. */
export function useRegisterScreen(screen: AgentScreen) {
  const { registerScreen } = useAgentRegistry();
  useRegistration(screen, registerScreen);
}

/** Declare a collection the assistant can search and summarise. */
export function useRegisterCollection<T>(collection: AgentCollection<T>) {
  const { registerCollection } = useAgentRegistry();
  useRegistration(collection as AgentCollection<any>, registerCollection);
}

/** Declare an action beyond navigating and reading. */
export function useRegisterAction(action: AgentAction) {
  const { registerAction } = useAgentRegistry();
  useRegistration(action, registerAction);
}
