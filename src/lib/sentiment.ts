// Sentiment momentum: daily bull/bear aggregates per sector, snapshotted to
// localStorage so a 30-day picture builds up over time. Today's slice is
// always computed live from the current corpus.
import type { NewsItem } from "./types";
import { todayIST } from "./format";

export interface DaySentiment {
  date: string; // yyyy-mm-dd IST
  bullish: number;
  bearish: number;
  total: number;
  bySector: Record<string, { bull: number; bear: number }>;
}

const KEY = "artha.sentiment.days";
const MAX_DAYS = 45;

export function getSnapshots(): DaySentiment[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as DaySentiment[]) : [];
  } catch {
    return [];
  }
}

export function computeToday(items: NewsItem[]): DaySentiment {
  const bySector: Record<string, { bull: number; bear: number }> = {};
  let bullish = 0;
  let bearish = 0;
  for (const i of items) {
    if (i.sentiment === "bullish") bullish++;
    if (i.sentiment === "bearish") bearish++;
    for (const s of i.sectors) {
      if (!bySector[s]) bySector[s] = { bull: 0, bear: 0 };
      if (i.sentiment === "bullish") bySector[s].bull++;
      if (i.sentiment === "bearish") bySector[s].bear++;
    }
  }
  return { date: todayIST(), bullish, bearish, total: items.length, bySector };
}

export function updateSnapshots(items: NewsItem[]): DaySentiment[] {
  const today = computeToday(items);
  const snaps = getSnapshots().filter((s) => s.date !== today.date);
  snaps.push(today);
  const trimmed = snaps.sort((a, b) => a.date.localeCompare(b.date)).slice(-MAX_DAYS);
  try {
    localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch {
    /* ignore */
  }
  return trimmed;
}

// net score −100..+100 for a day
export function netScore(d: DaySentiment): number {
  const n = d.bullish + d.bearish;
  if (n === 0) return 0;
  return Math.round(((d.bullish - d.bearish) / n) * 100);
}

export interface SectorMomentum {
  sector: string;
  score: number; // −100..+100
  bull: number;
  bear: number;
  series: number[]; // daily net scores, oldest→newest
}

export function sectorMomentum(snaps: DaySentiment[], days = 14): SectorMomentum[] {
  const recent = snaps.slice(-days);
  const map = new Map<string, SectorMomentum>();
  for (const day of recent) {
    for (const [sector, v] of Object.entries(day.bySector)) {
      if (!map.has(sector)) map.set(sector, { sector, score: 0, bull: 0, bear: 0, series: [] });
      const m = map.get(sector)!;
      m.bull += v.bull;
      m.bear += v.bear;
    }
  }
  for (const m of map.values()) {
    const n = m.bull + m.bear;
    m.score = n === 0 ? 0 : Math.round(((m.bull - m.bear) / n) * 100);
    m.series = recent.map((d) => {
      const v = d.bySector[m.sector];
      if (!v || v.bull + v.bear === 0) return 0;
      return Math.round(((v.bull - v.bear) / (v.bull + v.bear)) * 100);
    });
  }
  return [...map.values()].sort((a, b) => b.score - a.score);
}
