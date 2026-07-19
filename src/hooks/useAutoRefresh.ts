import { useCallback, useEffect, useRef, useState } from "react";

// The auto-refresh UX contract in one hook:
// · fetch on mount (fresh data every time the site opens)
// · refetch on window focus
// · poll on an interval, paused when the tab is hidden
// · never blank existing content while refreshing
export function useAutoRefresh<T>(
  fetcher: (force: boolean) => Promise<T>,
  intervalMs: number,
  seed?: () => T | null,
): {
  data: T | null;
  loading: boolean; // first load only — no data yet
  refreshing: boolean; // background refresh in flight
  error: string | null;
  lastOk: number | null;
  refresh: () => Promise<void>;
} {
  const [data, setData] = useState<T | null>(() => seed?.() ?? null);
  const [loading, setLoading] = useState(() => (seed?.() ?? null) === null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastOk, setLastOk] = useState<number | null>(null);
  const busy = useRef(false);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const run = useCallback(async (force: boolean) => {
    if (busy.current) return;
    busy.current = true;
    setRefreshing(true);
    try {
      const d = await fetcherRef.current(force);
      setData(d);
      setError(null);
      setLastOk(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "fetch failed");
    } finally {
      setLoading(false);
      setRefreshing(false);
      busy.current = false;
    }
  }, []);

  const refresh = useCallback(() => run(true), [run]);

  useEffect(() => {
    run(true); // mount — always fetch fresh on open
    const onFocus = () => run(false);
    const tick = () => {
      if (document.visibilityState === "visible") run(false);
    };
    window.addEventListener("focus", onFocus);
    const iv = setInterval(tick, intervalMs);
    return () => {
      window.removeEventListener("focus", onFocus);
      clearInterval(iv);
    };
  }, [run, intervalMs]);

  return { data, loading, refreshing, error, lastOk, refresh };
}

export function useNow(stepMs = 1000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), stepMs);
    return () => clearInterval(iv);
  }, [stepMs]);
  return now;
}
