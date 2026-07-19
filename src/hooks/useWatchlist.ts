import { useCallback, useEffect, useState } from "react";

const KEY = "artha.watchlist";

export function useWatchlist(): {
  watchlist: string[];
  add: (t: string) => void;
  remove: (t: string) => void;
  toggle: (t: string) => void;
  has: (t: string) => boolean;
  importJson: (json: string) => boolean;
  exportJson: () => string;
} {
  const [watchlist, setWatchlist] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as string[]) : ["RELIANCE", "HAL", "RVNL"];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(watchlist));
    } catch {
      /* ignore */
    }
  }, [watchlist]);

  const add = useCallback((t: string) => {
    const clean = t.toUpperCase().trim();
    if (clean) setWatchlist((w) => (w.includes(clean) ? w : [...w, clean]));
  }, []);
  const remove = useCallback((t: string) => setWatchlist((w) => w.filter((x) => x !== t)), []);
  const toggle = useCallback(
    (t: string) => setWatchlist((w) => (w.includes(t) ? w.filter((x) => x !== t) : [...w, t])),
    [],
  );
  const has = useCallback((t: string) => watchlist.includes(t), [watchlist]);
  const importJson = useCallback((json: string) => {
    try {
      const arr = JSON.parse(json) as unknown;
      if (Array.isArray(arr) && arr.every((x) => typeof x === "string")) {
        setWatchlist(arr.map((s) => s.toUpperCase()));
        return true;
      }
    } catch {
      /* fallthrough */
    }
    return false;
  }, []);
  const exportJson = useCallback(() => JSON.stringify(watchlist, null, 2), [watchlist]);

  return { watchlist, add, remove, toggle, has, importJson, exportJson };
}
