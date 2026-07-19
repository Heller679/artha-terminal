// In-memory stale-while-revalidate cache with the brief's TTLs.
// EOD datasets additionally persist to localStorage so a revisit shows the last
// good snapshot instantly while revalidating.

export const TTL = {
  news: 180_000,
  quotes: 60_000,
  eod: 15 * 60_000,
  calendar: 24 * 60 * 60_000,
};

interface Entry<T> {
  data: T;
  at: number;
}

const mem = new Map<string, Entry<unknown>>();

export function getFresh<T>(key: string, ttl: number): T | null {
  const e = mem.get(key) as Entry<T> | undefined;
  if (e && Date.now() - e.at < ttl) return e.data;
  return null;
}

export function getStale<T>(key: string): { data: T; at: number } | null {
  const e = mem.get(key) as Entry<T> | undefined;
  if (e) return { data: e.data, at: e.at };
  try {
    const raw = localStorage.getItem(`artha.cache.${key}`);
    if (raw) {
      const parsed = JSON.parse(raw) as Entry<T>;
      mem.set(key, parsed);
      return { data: parsed.data, at: parsed.at };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function setCache<T>(key: string, data: T, persist = false): void {
  const e = { data, at: Date.now() };
  mem.set(key, e as Entry<unknown>);
  if (persist) {
    try {
      localStorage.setItem(`artha.cache.${key}`, JSON.stringify(e));
    } catch {
      /* quota — ignore */
    }
  }
}

// stale-while-revalidate: returns fresh data immediately if present,
// otherwise kicks off the fetch and returns stale data (or null).
export async function swr<T>(
  key: string,
  ttl: number,
  fetcher: () => Promise<T>,
  opts: { persist?: boolean; force?: boolean } = {},
): Promise<{ data: T; at: number; fresh: boolean }> {
  if (!opts.force) {
    const fresh = getFresh<T>(key, ttl);
    if (fresh !== null) {
      const e = mem.get(key) as Entry<T>;
      return { data: fresh, at: e.at, fresh: true };
    }
  }
  try {
    const data = await fetcher();
    setCache(key, data, opts.persist ?? false);
    return { data, at: Date.now(), fresh: true };
  } catch (err) {
    const stale = getStale<T>(key);
    if (stale) return { data: stale.data, at: stale.at, fresh: false };
    throw err;
  }
}
