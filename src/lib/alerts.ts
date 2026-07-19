// Alert engine: evaluates rules on each data refresh, fires browser
// notifications + an in-app alert log. Settings & log persist locally.
import type { NewsItem, Quote } from "./types";

export interface AlertEvent {
  id: string;
  at: number;
  kind: "tender" | "impact" | "watchlist-move" | "watchlist-news";
  title: string;
  body: string;
  url?: string;
  read: boolean;
}

export interface AlertSettings {
  tenders: boolean;
  bigImpact: boolean;
  watchlistMoves: boolean;
  watchlistNews: boolean;
  moveThresholdPct: number;
  browserNotifs: boolean;
}

const SKEY = "artha.alerts.settings";
const LKEY = "artha.alerts.log";
const LOG_MAX = 60;

export const DEFAULT_SETTINGS: AlertSettings = {
  tenders: true,
  bigImpact: true,
  watchlistMoves: false,
  watchlistNews: true,
  moveThresholdPct: 3,
  browserNotifs: false,
};

export function getSettings(): AlertSettings {
  try {
    const raw = localStorage.getItem(SKEY);
    return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AlertSettings>) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: AlertSettings): void {
  try {
    localStorage.setItem(SKEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function getLog(): AlertEvent[] {
  try {
    const raw = localStorage.getItem(LKEY);
    return raw ? (JSON.parse(raw) as AlertEvent[]) : [];
  } catch {
    return [];
  }
}

export function markAllRead(): void {
  try {
    const log = getLog().map((e) => ({ ...e, read: true }));
    localStorage.setItem(LKEY, JSON.stringify(log));
  } catch {
    /* ignore */
  }
}

export function clearLog(): void {
  try {
    localStorage.setItem(LKEY, "[]");
  } catch {
    /* ignore */
  }
}

function push(events: AlertEvent[]): AlertEvent[] {
  if (events.length === 0) return getLog();
  const existing = getLog();
  const seen = new Set(existing.map((e) => e.id));
  const fresh = events.filter((e) => !seen.has(e.id));
  if (fresh.length === 0) return existing;
  const merged = [...fresh, ...existing].slice(0, LOG_MAX);
  try {
    localStorage.setItem(LKEY, JSON.stringify(merged));
  } catch {
    /* ignore */
  }
  if (getSettings().browserNotifs && "Notification" in window && Notification.permission === "granted") {
    for (const e of fresh.slice(0, 3)) {
      try {
        new Notification(e.title, { body: e.body.slice(0, 140) });
      } catch {
        /* ignore */
      }
    }
  }
  return merged;
}

// dedupe across refreshes: remember which news ids already triggered alerts
const SEEN_KEY = "artha.alerts.seen";
function getSeen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}
function addSeen(ids: string[]): void {
  try {
    const s = getSeen();
    ids.forEach((i) => s.add(i));
    localStorage.setItem(SEEN_KEY, JSON.stringify([...s].slice(-1500)));
  } catch {
    /* ignore */
  }
}

export function evaluateNews(items: NewsItem[], watchlist: string[]): AlertEvent[] {
  const s = getSettings();
  const seen = getSeen();
  const events: AlertEvent[] = [];
  const now = Date.now();
  const fresh = items.filter((i) => now - i.publishedAt < 30 * 60_000 && !seen.has(i.id));

  for (const item of fresh) {
    if (s.tenders && item.category === "tenders-contracts") {
      events.push({
        id: `t-${item.id}`,
        at: now,
        kind: "tender",
        title: `Tender: ${item.tickers[0] ?? item.source}`,
        body: item.title,
        url: item.url,
        read: false,
      });
    } else if (s.bigImpact && item.impactScore >= 4) {
      events.push({
        id: `i-${item.id}`,
        at: now,
        kind: "impact",
        title: `High-impact: ${item.source}`,
        body: item.title,
        url: item.url,
        read: false,
      });
    } else if (s.watchlistNews && item.tickers.some((t) => watchlist.includes(t))) {
      events.push({
        id: `w-${item.id}`,
        at: now,
        kind: "watchlist-news",
        title: `Watchlist: ${item.tickers.filter((t) => watchlist.includes(t)).join(", ")}`,
        body: item.title,
        url: item.url,
        read: false,
      });
    }
  }
  if (fresh.length > 0) addSeen(fresh.map((i) => i.id));
  return push(events.slice(0, 10));
}

// watchlist price alerts need previous quotes to compare — stored in-memory per session
let prevQuotes: Record<string, number> = {};

export function evaluateQuotes(watchlistQuotes: Quote[]): AlertEvent[] {
  const s = getSettings();
  if (!s.watchlistMoves) return getLog();
  const events: AlertEvent[] = [];
  const now = Date.now();
  for (const q of watchlistQuotes) {
    const prev = prevQuotes[q.symbol];
    prevQuotes[q.symbol] = q.price;
    if (prev == null) continue;
    const movePct = ((q.price - prev) / prev) * 100;
    if (Math.abs(movePct) >= s.moveThresholdPct) {
      events.push({
        id: `m-${q.symbol}-${Math.round(q.price)}`,
        at: now,
        kind: "watchlist-move",
        title: `${q.symbol} ${movePct > 0 ? "+" : ""}${movePct.toFixed(2)}%`,
        body: `${q.symbol} moved ${movePct > 0 ? "up" : "down"} ${Math.abs(movePct).toFixed(2)}% to ₹${q.price.toLocaleString("en-IN")} (prev ₹${prev.toLocaleString("en-IN")}).`,
        read: false,
      });
    }
  }
  return push(events);
}

export async function requestNotifPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  const p = await Notification.requestPermission();
  return p === "granted";
}
