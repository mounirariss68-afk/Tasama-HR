/**
 * The engine's clock. Live, it is the wall clock. During seeding the history
 * of cases is REPLAYED through the same engine with the clock set into the
 * past, so every historical case has a real trail, real HRMS writes and real
 * integration-log entries, timestamped when they would have happened.
 */
let virtual: Date | null = null;
export const now = () => (virtual ? new Date(virtual) : new Date());
export const setClock = (d: Date | null) => { virtual = d ? new Date(d) : null; };
export const tick = (ms: number) => { if (virtual) virtual = new Date(virtual.getTime() + ms); };
export const today = () => now().toISOString().slice(0, 10);
