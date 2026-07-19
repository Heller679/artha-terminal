// ============ ARTHA TERMINAL — core domain types ============

export type Category =
  | "macro-policy"
  | "gold-commodities"
  | "stocks-corporate"
  | "tenders-contracts"
  | "ipo"
  | "global-cues"
  | "geopolitics";

export type Sentiment = "bullish" | "bearish" | "neutral";

export interface AssetImpact {
  equity: boolean;
  gold: boolean;
  inr: boolean;
  bonds: boolean;
}

export interface NewsItem {
  id: string; // stable hash of url
  title: string;
  url: string;
  source: string;
  sourceDomain: string;
  publishedAt: number; // epoch ms
  fetchedAt: number;
  category: Category;
  sentiment: Sentiment;
  impactScore: 1 | 2 | 3 | 4 | 5;
  tickers: string[]; // NSE tickers detected
  sectors: string[];
  assetImpact: AssetImpact;
  whyItMatters: string;
  orderValueCr?: number; // normalized ₹ crore when detected
  awardingBody?: string; // ministry / PSU for tender stories
  duplicateCount: number; // "+N sources"
  isSpeculation: boolean;
  demo?: boolean; // sample data — always badged amber in UI
}

export interface Quote {
  symbol: string;
  label: string;
  price: number;
  change: number;
  changePct: number;
  prevClose: number;
  currency: string;
  marketState?: string;
  asOf: number;
}

export interface FeedStatus {
  name: string;
  ok: boolean;
  count: number;
  error?: string;
  lastOk?: number;
}

export interface EntityDef {
  ticker: string;
  name: string;
  aliases: string[];
  sector: string;
  isPSU: boolean;
  group?: string;
}

export type SignalKey = "S1" | "S2" | "S3" | "S4" | "S5" | "S6" | "S7";

export interface Evidence {
  id: string;
  title: string;
  url: string;
  source: string;
  date: number;
  signal: SignalKey;
  note: string; // "reported …" phrasing
}

export interface CompanyScore {
  ticker: string;
  name: string;
  sector: string;
  isPSU: boolean;
  score: number; // 0-100
  band: string;
  signalScores: Record<SignalKey, number>; // points contributed per signal (post-weight)
  evidence: Evidence[];
  topSignal: SignalKey;
  trend: "up" | "down" | "flat";
}

export interface CalendarEvent {
  id: string;
  date: string; // ISO yyyy-mm-dd (IST)
  title: string;
  kind: "india-macro" | "rbi" | "us" | "global" | "corporate";
  moves: ("equity" | "gold" | "inr" | "bonds")[];
  time?: string;
}

export interface EconData {
  fiiDii: { date: string; fiiNet: number; diiNet: number; provisional: boolean } | null;
  note?: string;
}
