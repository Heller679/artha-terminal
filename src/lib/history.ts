// Price history via Yahoo chart endpoint + technical indicators (SMA, RSI).
import { proxiedJson } from "./proxy";

export interface Candle {
  t: number; // epoch ms
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

interface YahooChartResp {
  chart?: {
    result?: {
      timestamp?: number[];
      indicators?: {
        quote?: { open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[] }[];
      };
    }[];
  };
}

export type RangeKey = "1D" | "5D" | "1M" | "6M" | "1Y" | "5Y";

export const RANGE_PARAMS: Record<RangeKey, { range: string; interval: string }> = {
  "1D": { range: "1d", interval: "5m" },
  "5D": { range: "5d", interval: "15m" },
  "1M": { range: "1mo", interval: "1d" },
  "6M": { range: "6mo", interval: "1d" },
  "1Y": { range: "1y", interval: "1wk" },
  "5Y": { range: "5y", interval: "1mo" },
};

export async function getHistory(ticker: string, rangeKey: RangeKey): Promise<Candle[]> {
  const { range, interval } = RANGE_PARAMS[rangeKey];
  const symbol = ticker.includes("^") || ticker.includes("=") ? ticker : `${ticker.toUpperCase().replace(/\.NS$|\.BO$/g, "")}.NS`;
  const j = await proxiedJson<YahooChartResp>(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`,
    10_000,
  );
  const res = j.chart?.result?.[0];
  const ts = res?.timestamp ?? [];
  const q = res?.indicators?.quote?.[0];
  if (!q) return [];
  const out: Candle[] = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open?.[i];
    const h = q.high?.[i];
    const l = q.low?.[i];
    const c = q.close?.[i];
    if (o == null || h == null || l == null || c == null) continue;
    out.push({ t: ts[i] * 1000, o, h, l, c, v: q.volume?.[i] ?? 0 });
  }
  return out;
}

export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function rsi(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (period - 1) + Math.max(0, d)) / period;
    loss = (loss * (period - 1) + Math.max(0, -d)) / period;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

export interface StockStats {
  last: number;
  prevClose: number;
  changePct: number;
  dayHigh: number;
  dayLow: number;
  w52High: number;
  w52Low: number;
  fromW52HighPct: number;
}

export async function getStats(ticker: string, candles1y: Candle[]): Promise<StockStats | null> {
  if (candles1y.length === 0) return null;
  const daily = await getHistory(ticker, "5D").catch(() => [] as Candle[]);
  const last = daily.length > 0 ? daily[daily.length - 1].c : candles1y[candles1y.length - 1].c;
  const dayHigh = daily.length > 0 ? Math.max(...daily.slice(-80).map((c) => c.h)) : last;
  const dayLow = daily.length > 0 ? Math.min(...daily.slice(-80).map((c) => c.l)) : last;
  const yearCandles = candles1y;
  const w52High = Math.max(...yearCandles.map((c) => c.h));
  const w52Low = Math.min(...yearCandles.map((c) => c.l));
  const prevClose = yearCandles.length > 1 ? yearCandles[yearCandles.length - 2].c : last;
  return {
    last,
    prevClose,
    changePct: prevClose ? ((last - prevClose) / prevClose) * 100 : 0,
    dayHigh,
    dayLow,
    w52High,
    w52Low,
    fromW52HighPct: w52High ? ((last - w52High) / w52High) * 100 : 0,
  };
}
