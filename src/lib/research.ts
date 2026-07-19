// Kimi Research engine — an automated, fully transparent adaptation of the
// Buffett/Graham 20-criterion scorecard. Every point is computed from public
// data (screener.in fundamentals + price history + the terminal's own news
// signals). Where data is missing the dimension scores lower — it never
// guesses. Educational screen, NOT investment advice.
import type { ScreenerData, DerivedFundamentals } from "./screener";
import { derive } from "./screener";
import { getHistory, sma } from "./history";
import type { NewsItem } from "./types";
import { clamp } from "./format";

export type DimensionKey = "moat" | "management" | "financials" | "valuation";

export interface DimensionScore {
  key: DimensionKey;
  label: string;
  score: number; // 0-25
  max: 25;
  reasons: string[]; // human-readable evidence lines
}

export interface ResearchScore {
  ticker: string;
  name: string;
  total: number; // 0-100
  rating: string;
  stars: number;
  dimensions: DimensionScore[];
  reasons: string[]; // top evidence lines across dimensions
  funda: DerivedFundamentals;
  data: ScreenerData;
  aboveDma200: boolean | null;
  momentum6mPct: number | null;
  newsSkew: number | null; // net bullish-bearish in corpus
  computedAt: number;
}

const INDIA_10Y = 6.5; // indicative risk-free proxy for earnings-yield checks

function ratingOf(total: number): { rating: string; stars: number } {
  if (total >= 85) return { rating: "Outstanding", stars: 5 };
  if (total >= 70) return { rating: "Excellent", stars: 4 };
  if (total >= 55) return { rating: "Average", stars: 3 };
  if (total >= 40) return { rating: "Weak", stars: 2 };
  return { rating: "Poor", stars: 1 };
}

function band(value: number | null, bands: [number, number][], invert = false): { pts: number } {
  if (value == null) return { pts: 0 };
  for (const [threshold, pts] of bands) {
    if (invert ? value <= threshold : value >= threshold) return { pts };
  }
  return { pts: 0 };
}

export function computeResearchScore(
  data: ScreenerData,
  opts: {
    aboveDma200: boolean | null;
    momentum6mPct: number | null;
    newsSkew: number | null;
  },
): ResearchScore {
  const f = derive(data);
  const dims: DimensionScore[] = [];

  // ================= MOAT (0-25) =================
  // proxies: ROCE vs peers, margin stability (OPM), size among peers, ROE durability
  const moatReasons: string[] = [];
  let moat = 0;
  if (f.rocePct != null) {
    const p = band(f.rocePct, [[30, 7], [22, 6], [15, 4], [10, 2], [0, 1]]).pts;
    moat += p;
    moatReasons.push(`ROCE ${f.rocePct}% — ${f.rocePct >= 20 ? "strong capital efficiency vs peers" : f.rocePct >= 15 ? "healthy" : "modest"}`);
  }
  if (f.roePct != null) {
    const p = band(f.roePct, [[25, 6], [18, 5], [14, 4], [10, 2], [0, 1]]).pts;
    moat += p;
    moatReasons.push(`ROE ${f.roePct}%`);
  }
  const opm = f.qOpmPct.filter((v): v is number => v != null);
  if (opm.length >= 4) {
    const avg = opm.reduce((a, b) => a + b, 0) / opm.length;
    const min = Math.min(...opm);
    const stability = min / (avg || 1);
    const p = band(avg, [[35, 7], [25, 6], [18, 5], [12, 3], [5, 1]]).pts;
    const stabBonus = stability > 0.75 ? 2 : stability > 0.5 ? 1 : 0;
    moat += p + stabBonus;
    moatReasons.push(
      `Avg operating margin ${avg.toFixed(1)}% over ${opm.length} quarters${stabBonus === 2 ? " — very stable (pricing power signal)" : ""}`,
    );
  }
  if (f.marketCapCr != null && data.peers && data.peers.rows.length >= 3) {
    // peers table header varies ("Mar Cap Rs.Cr.") — match by prefix
    const capKey = data.peers.headers.find((h) => h.toLowerCase().startsWith("mar cap"));
    const caps = capKey
      ? data.peers.rows.map((r) => parseFloat((r.metrics[capKey] ?? "").replace(/,/g, ""))).filter((x) => isFinite(x) && x > 0)
      : [];
    if (caps.length >= 2) {
      const rank = caps.filter((c) => c <= (f.marketCapCr ?? 0)).length;
      const p = rank >= caps.length * 0.75 ? 3 : rank >= caps.length * 0.4 ? 2 : 1;
      moat += p;
      moatReasons.push(`#${caps.length - rank + 1} of ${caps.length} peers by size — scale advantage`);
    }
  }
  dims.push({ key: "moat", label: "Moat", score: Math.min(25, moat), max: 25, reasons: moatReasons });

  // ================= MANAGEMENT (0-25) =================
  const mgmtReasons: string[] = [];
  let mgmt = 0;
  if (f.promoterHolding != null) {
    const p = band(f.promoterHolding, [[60, 6], [50, 5], [40, 4], [25, 3], [10, 2], [0, 1]]).pts;
    mgmt += p;
    mgmtReasons.push(`Promoter holding ${f.promoterHolding}% — ${f.promoterHolding >= 50 ? "strong skin in the game" : "moderate alignment"}`);
  }
  if (f.pledgedPct != null) {
    const p = f.pledgedPct <= 0.5 ? 5 : f.pledgedPct <= 3 ? 3 : f.pledgedPct <= 10 ? 1 : 0;
    mgmt += p;
    if (f.pledgedPct <= 0.5) mgmtReasons.push("Negligible promoter pledging — clean governance signal");
    else mgmtReasons.push(`Promoter pledging ${f.pledgedPct}% — watch`);
  }
  if (f.debtToEquity != null) {
    const p = f.debtToEquity <= 0.1 ? 7 : f.debtToEquity <= 0.35 ? 6 : f.debtToEquity <= 0.7 ? 4 : f.debtToEquity <= 1.2 ? 2 : 0;
    mgmt += p;
    mgmtReasons.push(`Debt/equity ${f.debtToEquity.toFixed(2)} — ${f.debtToEquity <= 0.35 ? "conservative balance sheet" : "leverage present"}`);
  }
  if (f.divYieldPct != null) {
    const p = band(f.divYieldPct, [[3, 4], [1.5, 3], [0.5, 2], [0.1, 1]]).pts;
    mgmt += p;
    if (f.divYieldPct >= 1) mgmtReasons.push(`Dividend yield ${f.divYieldPct}% — shareholder-friendly payouts`);
  }
  if (data.cons.length > 0 && mgmtReasons.length > 0) {
    // transparency: surface cons, small deduction if many
    const deduction = Math.min(3, Math.floor(data.cons.length / 2));
    mgmt -= deduction;
  }
  dims.push({ key: "management", label: "Management", score: clamp(Math.min(25, mgmt), 0, 25), max: 25, reasons: mgmtReasons });

  // ================= FINANCIALS (0-25) =================
  const finReasons: string[] = [];
  let fin = 0;
  if (f.roe10yPct != null) {
    // Graham/Buffett: long-run ROE consistency beats any single year
    const p = band(f.roe10yPct, [[25, 5], [18, 4], [14, 3], [10, 2], [0, 1]]).pts;
    fin += p;
    finReasons.push(`10Y avg ROE ${f.roe10yPct}% — ${f.roe10yPct >= 15 ? "sustained compounding machine" : "unremarkable long-run returns"}`);
  }
  if (f.profitCagr3y != null) {
    const p = band(f.profitCagr3y, [[25, 7], [15, 6], [10, 5], [5, 3], [0, 1]]).pts;
    fin += p;
    finReasons.push(`3Y profit CAGR ${f.profitCagr3y}%`);
  }
  if (f.salesCagr3y != null) {
    const p = band(f.salesCagr3y, [[20, 5], [12, 4], [8, 3], [3, 2], [0, 1]]).pts;
    fin += p;
    finReasons.push(`3Y sales CAGR ${f.salesCagr3y}%`);
  }
  if (f.ocfToProfit != null) {
    const p = f.ocfToProfit >= 1.2 ? 6 : f.ocfToProfit >= 1.0 ? 5 : f.ocfToProfit >= 0.8 ? 3 : f.ocfToProfit >= 0.5 ? 1 : 0;
    fin += p;
    finReasons.push(
      `Operating cash flow / net profit ${f.ocfToProfit.toFixed(2)}× — ${f.ocfToProfit >= 1 ? "earnings are cash-backed" : "earnings quality needs watching"}`,
    );
  }
  const yp = f.yearlyProfit.filter((v): v is number => v != null);
  if (yp.length >= 5) {
    const recent = yp.slice(-5);
    const positives = recent.filter((v) => v > 0).length;
    const growing = recent[recent.length - 1] > recent[0];
    const p = positives === 5 ? (growing ? 5 : 4) : positives >= 4 ? 3 : 1;
    fin += p;
    finReasons.push(`${positives}/5 profitable years${growing ? " with profit rising" : ""}`);
  }
  const qg = f.qProfit.filter((v): v is number => v != null);
  if (qg.length >= 8) {
    const latest4 = qg.slice(-4).reduce((a, b) => a + b, 0);
    const prior4 = qg.slice(-8, -4).reduce((a, b) => a + b, 0);
    if (prior4 > 0) {
      const growth = ((latest4 - prior4) / prior4) * 100;
      const p = growth >= 20 ? 2 : growth >= 5 ? 1.5 : growth >= 0 ? 1 : 0;
      fin += p;
      finReasons.push(`Latest 4 quarters profit ${growth >= 0 ? "+" : ""}${growth.toFixed(0)}% vs prior 4`);
    }
  }
  dims.push({ key: "financials", label: "Financials", score: Math.min(25, Math.round(fin)), max: 25, reasons: finReasons });

  // ================= VALUATION (0-25) =================
  const valReasons: string[] = [];
  let val = 0;
  if (f.pe != null && f.pe > 0) {
    const p = f.pe <= 12 ? 8 : f.pe <= 18 ? 7 : f.pe <= 25 ? 5 : f.pe <= 35 ? 3 : f.pe <= 50 ? 1 : 0;
    val += p;
    valReasons.push(`P/E ${f.pe} — ${f.pe <= 18 ? "reasonable for quality" : f.pe <= 35 ? "priced for growth" : "expensive"}`);
  }
  if (f.pe != null && f.pe > 0) {
    const ey = 100 / f.pe;
    const vsRf = ey / INDIA_10Y;
    const p = vsRf >= 1.5 ? 6 : vsRf >= 1.1 ? 4 : vsRf >= 0.8 ? 2 : 0;
    val += p;
    valReasons.push(`Earnings yield ${ey.toFixed(1)}% vs ~${INDIA_10Y}% risk-free — ${vsRf >= 1 ? "equity attractive vs bonds" : "thin premium over bonds"}`);
  }
  if (f.pb != null && f.pb > 0) {
    const p = f.pb <= 1.5 ? 5 : f.pb <= 3 ? 4 : f.pb <= 5 ? 2 : f.pb <= 8 ? 1 : 0;
    val += p;
    if (f.bookValue != null) valReasons.push(`P/B ${f.pb} (book value ₹${f.bookValue})`);
  }
  if (f.divYieldPct != null) {
    const p = band(f.divYieldPct, [[3, 3], [1.5, 2], [0.5, 1]]).pts;
    val += p;
  }
  if (opts.momentum6mPct != null) {
    // buying strength costs points, buying dips earns margin-of-safety points
    const m = opts.momentum6mPct;
    const p = m <= -15 ? 3 : m <= 0 ? 2.5 : m <= 15 ? 1.5 : m <= 40 ? 0.5 : 0;
    val += p;
    valReasons.push(`6M price move ${m >= 0 ? "+" : ""}${m.toFixed(0)}% — ${m <= 0 ? "entry after correction = margin of safety" : m <= 15 ? "moderate run-up" : "hot — valuation stretched"}`);
  }
  dims.push({ key: "valuation", label: "Valuation", score: Math.min(25, Math.round(val)), max: 25, reasons: valReasons });

  const total = dims.reduce((a, d) => a + d.score, 0);
  const { rating, stars } = ratingOf(total);
  const reasons = dims.flatMap((d) => d.reasons.slice(0, 2)).slice(0, 6);

  return {
    ticker: data.ticker,
    name: data.name,
    total,
    rating,
    stars,
    dimensions: dims,
    reasons,
    funda: f,
    data,
    aboveDma200: opts.aboveDma200,
    momentum6mPct: opts.momentum6mPct,
    newsSkew: opts.newsSkew,
    computedAt: Date.now(),
  };
}

// ---- price context from Yahoo history ----
export async function priceContext(ticker: string): Promise<{ aboveDma200: boolean | null; momentum6mPct: number | null }> {
  try {
    const candles = await getHistory(ticker, "1Y");
    if (candles.length < 30) return { aboveDma200: null, momentum6mPct: null };
    const closes = candles.map((c) => c.c);
    const dma = sma(closes, Math.min(40, Math.floor(closes.length / 2)));
    const last = closes[closes.length - 1];
    const lastDma = dma[dma.length - 1];
    const mid = closes[Math.floor(closes.length / 2)];
    return {
      aboveDma200: lastDma != null ? last > lastDma : null,
      momentum6mPct: mid ? ((last - mid) / mid) * 100 : null,
    };
  } catch {
    return { aboveDma200: null, momentum6mPct: null };
  }
}

export function newsSkewFor(ticker: string, corpus: NewsItem[]): number | null {
  const items = corpus.filter((i) => i.tickers.includes(ticker));
  if (items.length < 3) return null;
  let skew = 0;
  for (const i of items) {
    if (i.sentiment === "bullish") skew++;
    if (i.sentiment === "bearish") skew--;
  }
  return skew;
}

// ---- the candidate pool Kimi screens (liquid, sector-diverse) ----
export const SCREEN_POOL = [
  "TCS", "INFY", "HDFCBANK", "ICICIBANK", "RELIANCE", "SBIN", "LT", "HAL",
  "BEL", "BHARTIARTL", "TITAN", "MARUTI", "SUNPHARMA", "TATAMOTORS", "NTPC",
  "COALINDIA", "ITC", "HINDUNILVR",
];
