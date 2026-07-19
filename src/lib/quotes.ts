// Live quotes via Yahoo Finance chart endpoint (through the proxy chain),
// sector heatmap, FII/DII attempt via NSE (degrades honestly), computed
// INR gold parity, and market-hours logic.
import { proxiedJson } from "./proxy";
import { TICKER_SYMBOLS, SECTOR_INDICES, yahooChart, NSE, GOLD_OZ_TO_10G } from "./sources";
import type { Quote } from "./types";
import { swr, TTL, getStale } from "./cache";
import { istNowParts } from "./format";

interface YahooChartResp {
  chart?: {
    result?: {
      meta?: {
        regularMarketPrice?: number;
        chartPreviousClose?: number;
        previousClose?: number;
        regularMarketChange?: number;
        regularMarketChangePercent?: number;
        currency?: string;
        marketState?: string;
        regularMarketTime?: number;
      };
    }[];
    error?: unknown;
  };
}

async function fetchOne(symbol: string, label: string): Promise<Quote | null> {
  try {
    const j = await proxiedJson<YahooChartResp>(yahooChart(symbol, "5d", "1d"), 8_000);
    const meta = j.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice;
    const prev = meta?.chartPreviousClose ?? meta?.previousClose;
    if (price == null || prev == null) return null;
    const change = price - prev;
    return {
      symbol,
      label,
      price,
      change,
      changePct: prev !== 0 ? (change / prev) * 100 : 0,
      prevClose: prev,
      currency: meta?.currency ?? "",
      marketState: meta?.marketState,
      asOf: (meta?.regularMarketTime ?? Math.floor(Date.now() / 1000)) * 1000,
    };
  } catch {
    return null;
  }
}

export interface QuotesResult {
  quotes: Quote[];
  okCount: number;
  fetchedAt: number;
}

const CONCURRENCY = 4;

async function pool<T, R>(arr: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(arr.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, arr.length) }, async () => {
      while (i < arr.length) {
        const idx = i++;
        out[idx] = await fn(arr[idx]);
      }
    }),
  );
  return out;
}

const QKEY = "quotes.ticker";

export async function getTickerQuotes(force = false): Promise<QuotesResult> {
  const fetcher = async (): Promise<QuotesResult> => {
    const res = await pool(TICKER_SYMBOLS, CONCURRENCY, (s) => fetchOne(s.symbol, s.label));
    const quotes = res.filter((q): q is Quote => q !== null);
    if (quotes.length === 0) throw new Error("no quotes reachable");
    return { quotes, okCount: quotes.length, fetchedAt: Date.now() };
  };
  try {
    const r = await swr(QKEY, TTL.quotes, fetcher, { force, persist: true });
    return { ...r.data, fetchedAt: r.at };
  } catch {
    const stale = getStale<QuotesResult>(QKEY);
    if (stale) return { ...stale.data, fetchedAt: stale.at };
    return { quotes: [], okCount: 0, fetchedAt: Date.now() };
  }
}

export function getQuote(quotes: Quote[], symbol: string): Quote | undefined {
  return quotes.find((q) => q.symbol === symbol);
}

// ---- INR gold parity (honest label in UI) ----
export function goldInrPer10g(quotes: Quote[]): number | null {
  const gc = getQuote(quotes, "GC=F")?.price;
  const fx = getQuote(quotes, "INR=X")?.price;
  if (!gc || !fx) return null;
  return gc * GOLD_OZ_TO_10G * fx;
}

// ---- sector heatmap ----
export interface SectorCell {
  symbol: string;
  label: string;
  changePct: number;
}

const SKEY = "quotes.sectors";

export async function getSectorHeatmap(force = false): Promise<{ cells: SectorCell[]; fetchedAt: number }> {
  const fetcher = async () => {
    const res = await pool(SECTOR_INDICES, CONCURRENCY, (s) => fetchOne(s.symbol, s.label));
    const cells = res
      .filter((q): q is Quote => q !== null)
      .map((q) => ({ symbol: q.symbol, label: q.label, changePct: q.changePct }));
    if (cells.length === 0) throw new Error("sector data unreachable");
    return { cells, fetchedAt: Date.now() };
  };
  try {
    const r = await swr(SKEY, TTL.quotes * 2, fetcher, { force, persist: true });
    return { ...r.data, fetchedAt: r.at };
  } catch {
    const stale = getStale<{ cells: SectorCell[]; fetchedAt: number }>(SKEY);
    if (stale) return stale.data;
    return { cells: [], fetchedAt: Date.now() };
  }
}

// ---- FII/DII (NSE is geo/cookie gated; attempt honestly, degrade cleanly) ----
export interface FiiDiiResult {
  date: string;
  fiiNet: number | null;
  diiNet: number | null;
  provisional: boolean;
  source: string;
  reachable: boolean;
  message?: string;
}

const FKEY = "eod.fiidii";

export async function getFiiDii(force = false): Promise<FiiDiiResult> {
  const fallback: FiiDiiResult = {
    date: "",
    fiiNet: null,
    diiNet: null,
    provisional: true,
    source: "NSE",
    reachable: false,
    message:
      "NSE blocks cross-origin reads of this endpoint from browsers. Figures are usually published by ~6:30 PM IST — check nseindia.com directly.",
  };
  const fetcher = async (): Promise<FiiDiiResult> => {
    try {
      const j = await proxiedJson<unknown>(NSE.fiiDii, 10_000);
      // NSE returns an array of category rows; parse defensively
      const rows = Array.isArray(j) ? (j as Record<string, string>[]) : [];
      let fii: number | null = null;
      let dii: number | null = null;
      let date = "";
      for (const r of rows) {
        const cat = (r.category ?? r.CATEGORY ?? "").toString().toUpperCase();
        const net = parseFloat((r.netValue ?? r.NET_VALUE ?? "").toString().replace(/,/g, ""));
        date = r.date ?? r.DATE ?? date;
        if (cat.includes("FII") && isFinite(net)) fii = net;
        if (cat.includes("DII") && isFinite(net)) dii = net;
      }
      if (fii === null && dii === null) throw new Error("unparseable");
      return { date, fiiNet: fii, diiNet: dii, provisional: true, source: "NSE", reachable: true };
    } catch {
      throw new Error("unreachable");
    }
  };
  try {
    const r = await swr(FKEY, TTL.eod, fetcher, { force, persist: true });
    return r.data;
  } catch {
    const stale = getStale<FiiDiiResult>(FKEY);
    if (stale && stale.data.reachable) return { ...stale.data, message: "Last fetched snapshot." };
    return fallback;
  }
}

// ---- NSE market hours ----
export interface MarketStatus {
  open: boolean;
  label: string;
}

// 2026 NSE trading holidays (seeded; update annually)
const NSE_HOLIDAYS_2026 = new Set([
  "2026-01-26", "2026-03-03", "2026-03-26", "2026-03-31", "2026-04-03", "2026-04-14",
  "2026-05-01", "2026-05-28", "2026-06-26", "2026-08-15", "2026-09-14", "2026-10-02",
  "2026-10-20", "2026-11-10", "2026-11-24", "2026-12-25",
]);

export function marketStatus(now = new Date()): MarketStatus {
  const { hour, minute, day } = istNowParts();
  const dstr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  if (day === 0 || day === 6) return { open: false, label: "Market closed · weekend · reopens Mon 09:15 IST" };
  if (NSE_HOLIDAYS_2026.has(dstr)) return { open: false, label: "Market closed · NSE holiday · reopens next session 09:15 IST" };
  const mins = hour * 60 + minute;
  if (mins < 9 * 60 + 15) return { open: false, label: "Pre-open · market opens 09:15 IST" };
  if (mins > 15 * 60 + 30) return { open: false, label: "Market closed · reopens 09:15 IST" };
  return { open: true, label: "NSE open · 09:15–15:30 IST" };
}

// ---- single stock quote for watchlist ----
export async function getStockQuote(ticker: string): Promise<Quote | null> {
  const clean = ticker.toUpperCase().replace(/\.NS$|\.BO$/g, "");
  return fetchOne(`${clean}.NS`, clean);
}
