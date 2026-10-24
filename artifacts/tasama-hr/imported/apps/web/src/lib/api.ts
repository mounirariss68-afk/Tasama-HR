/**
 * The API client. Every call carries the active client account and persona;
 * the SERVER decides what that persona may see and approve. Nothing here is a
 * permission check.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

let persona = (() => { try { return localStorage.getItem('tasama-persona') ?? 'tasama'; } catch { return 'tasama'; } })();
let client = (() => { try { return localStorage.getItem('tasama-client') ?? 'roshn'; } catch { return 'roshn'; } })();
export const getPersona = () => persona;
export const getClient = () => client;
export const setPersonaKey = (k: string) => { persona = k; try { localStorage.setItem('tasama-persona', k); } catch { /* */ } bump(); };
export const setClientKey = (k: string) => { client = k; try { localStorage.setItem('tasama-client', k); } catch { /* */ } bump(); };

// A global refresh signal: any write bumps it, every live view refetches.
let version = 0;
const listeners = new Set<() => void>();
export const bump = () => { version++; listeners.forEach((l) => l()); };
export function useVersion() {
  const [v, setV] = useState(version);
  useEffect(() => { const l = () => setV(version); listeners.add(l); return () => { listeners.delete(l); }; }, []);
  return v;
}

export async function api<T = any>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    method: init?.method ?? (init?.json !== undefined ? 'POST' : 'GET'),
    headers: { 'x-persona': persona, 'x-client': client, ...(init?.json !== undefined ? { 'content-type': 'application/json' } : {}), ...(init?.headers ?? {}) },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.error ?? `${res.status} ${res.statusText}`);
  return data as T;
}

export const post = <T = any>(path: string, json: unknown = {}) => api<T>(path, { json });

/** Fetch, refetch on any write, optionally poll. */
export function useApi<T = any>(path: string | null, opts: { poll?: number } = {}) {
  const v = useVersion();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const live = useRef(true);
  const load = useCallback(async () => {
    if (!path) return;
    void client;
    setLoading(true);
    try { const d = await api<T>(path); if (live.current) { setData(d); setError(null); } }
    catch (e: any) { if (live.current) setError(e.message); }
    finally { if (live.current) setLoading(false); }
  }, [path]);
  useEffect(() => { live.current = true; load(); return () => { live.current = false; }; }, [load, v]);
  useEffect(() => {
    if (!opts.poll) return;
    const t = setInterval(load, opts.poll);
    return () => clearInterval(t);
  }, [load, opts.poll]);
  return { data, error, loading, reload: load, setData };
}

/** Downloads a file the server writes (a package, a bank file), with the persona and client headers. */
export async function downloadFile(href: string, clientKey?: string) {
  const res = await fetch(href, { headers: { 'x-persona': persona, 'x-client': clientKey ?? client } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'download';
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}
