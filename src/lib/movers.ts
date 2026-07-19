// Market movers & breadth from batch Yahoo quotes over the entity universe.
import { proxiedJson } from "./proxy";
import { ENTITIES } from "./entities";
import { swr, TTL, getStale } from "./cache";

export interface Mover {
  ticker: string;
  name: string;
  sector: string;
  price: number;
  changePct: number;
}

interface YahooChartResp {
  chart?: {
    result?: {
      meta?: { regularMarketPrice?: number; chartPreviousClose?: number; previousClose?: number };
    }[];
  };
}

async function fetchOne(ticker: string): Promise<Mover | null> {
  try {
    const j = await proxiedJson<YahooChartResp>(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker + ".NS")}?range=5d&interval=1d`,
      8_000,
    );
    const meta = j.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice;
    const prev = meta?.chartPreviousClose ?? meta?.previousClose;
    if (price == null || prev == null || prev === 0) return null;
    const e = ENTITIES.find((x) => x.ticker === ticker);
    return { ticker, name: e?.name ?? ticker, sector: e?.sector ?? "", price, changePct: ((price - prev) / prev) * 100 };
  } catch {
    return null;
  }
}

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

export interface MoversResult {
  movers: Mover[];
  advances: number;
  declines: number;
  unchanged: number;
  fetchedAt: number;
}

// liquid subset — Nifty50 + active PSUs keeps request count sane
const UNIVERSE = ENTITIES.slice(0, 60).map((e) => e.ticker);
const KEY = "quotes.movers.v1";

export async function getMovers(force = false): Promise<MoversResult> {
  const fetcher = async (): Promise<MoversResult> => {
    const res = await pool(UNIVERSE, 4, fetchOne);
    const movers = res.filter((m): m is Mover => m !== null);
    if (movers.length === 0) throw new Error("movers unreachable");
    return {
      movers,
      advances: movers.filter((m) => m.changePct > 0.05).length,
      declines: movers.filter((m) => m.changePct < -0.05).length,
      unchanged: movers.filter((m) => Math.abs(m.changePct) <= 0.05).length,
      fetchedAt: Date.now(),
    };
  };
  try {
    const r = await swr(KEY, TTL.eod / 3, fetcher, { force, persist: true });
    return { ...r.data, fetchedAt: r.at };
  } catch {
    const stale = getStale<MoversResult>(KEY);
    if (stale) return stale.data;
    return { movers: [], advances: 0, declines: 0, unchanged: 0, fetchedAt: Date.now() };
  }
}
