// Results-season tracker: extracts earnings announcements from the corpus and
// classifies beat / miss / in-line from headline language.
import type { NewsItem } from "./types";

export interface ResultRow {
  ticker: string | null;
  company: string;
  headline: string;
  url: string;
  source: string;
  publishedAt: number;
  verdict: "beat" | "miss" | "inline" | "na";
  profitCr: number | null;
  profitChgPct: number | null;
  quarter: string; // "Q1".."Q4" or ""
}

const RESULTS_RE =
  /q[1-4]\s*(fy)?\d{0,2}\s*(results|earnings|profit)|net profit|profit (rises|jumps|falls|drops|grows|declines|surges)|revenue (rises|grows|falls)|results today|earnings/i;

const BEAT_RE = /beats? (estimates|expectations)|above (estimates|expectations)|better than expected|beats street|surprises/i;
const MISS_RE = /misses? (estimates|expectations)|below (estimates|expectations)|disappoints|misses street|profit, nii miss/i;
const PROFIT_CR_RE = /(?:net profit|profit)[^\d₹]*(?:₹|rs\.?)\s*([\d,]+(?:\.\d+)?)\s*(?:crore|cr)/i;
const PROFIT_CHG_RE = /(?:rises|jumps|grows|surges|up|falls|drops|declines|down)[^\d%]*([\d.]+)\s*%/i;
const QUARTER_RE = /\b(q[1-4])\b/i;

export function extractResults(items: NewsItem[]): ResultRow[] {
  const rows: ResultRow[] = [];
  for (const i of items) {
    const t = i.title;
    if (!RESULTS_RE.test(t)) continue;
    // exclude previews ("set to announce", "results this week") unless they report numbers
    const isPreview = /set to announce|results this week|to announce|ahead of|expect/i.test(t) && !PROFIT_CR_RE.test(t);
    if (isPreview) continue;

    const profitM = t.match(PROFIT_CR_RE);
    const chgM = t.match(PROFIT_CHG_RE);
    const qM = t.match(QUARTER_RE);
    const profitCr = profitM ? parseFloat(profitM[1].replace(/,/g, "")) : null;
    const profitChgPct = chgM ? parseFloat(chgM[1]) * (/falls|drops|declines|down|plunges|slides/i.test(t) ? -1 : 1) : null;

    // untracked companies must carry hard numbers, else it's an opinion/preview piece
    if (!i.tickers[0] && profitCr == null && profitChgPct == null) continue;

    let verdict: ResultRow["verdict"] = "na";
    if (BEAT_RE.test(t)) verdict = "beat";
    else if (MISS_RE.test(t)) verdict = "miss";
    else if (profitChgPct != null && profitChgPct <= -3) verdict = "miss";
    else if (i.sentiment === "bullish") verdict = "inline";
    else if (i.sentiment === "bearish") verdict = "miss";
    rows.push({
      ticker: i.tickers[0] ?? null,
      company: i.tickers[0] ?? t.split(/[—:|-]/)[0].slice(0, 40),
      headline: t,
      url: i.url,
      source: i.source,
      publishedAt: i.publishedAt,
      verdict,
      profitCr,
      profitChgPct,
      quarter: qM ? qM[1].toUpperCase() : "",
    });
  }
  // dedupe by ticker+quarter keeping latest
  const map = new Map<string, ResultRow>();
  for (const r of rows.sort((a, b) => a.publishedAt - b.publishedAt)) {
    map.set(`${r.ticker ?? r.company}-${r.quarter}`, r);
  }
  return [...map.values()].sort((a, b) => b.publishedAt - a.publishedAt);
}
