// Rule-based classification engine — deterministic, free, fast.
// Ships as code config; every rule is inspectable and editable.
import type { AssetImpact, Category, NewsItem, Sentiment } from "./types";
import { ALIAS_INDEX, MINISTRIES } from "./entities";
import { clamp, hashId } from "./format";

const TENDER_VERBS = [
  "wins order", "bags order", "bags contract", "secures order", "letter of award",
  "loa", "letter of intent", "loi", "l1 bidder", "lowest bidder", "epc contract",
  "epc order", "work order", "supply order", "emerges as lowest", "awarded contract",
  "order win", "wins contract", "signs mou", "purchase order", "wins bid", "wins tender",
];

const BEARISH_TRIGGERS = [
  "sebi probe", "ed raid", "it raid", "income tax raid", "cbi", "insolvency", "nclt",
  "default", "rating downgrade", "downgrade", "pledge invoked", "auditor resign",
  "order cancellation", "penalty", "show-cause", "show cause", "fraud", "scam",
  "crash", "plunge", "tank", "selloff", "sell-off", "slump", "falls", "declines",
  "layoffs", "profit warning", "misses estimates", "ban", "penalise", "penalize",
];

const BULLISH_TRIGGERS = [
  "upgrade", "record profit", "beats estimates", "surges", "rallies", "soars",
  "all-time high", "52-week high", "buyback", "bonus issue", "raises guidance",
  "strong growth", "wins", "bags", "expands", "approval", "nod", "clearance",
  "rises", "jumps", "climbs", "zooms", "beats", "outperforms",
];

const MACRO_TRIGGERS = [
  "rbi", "repo rate", "mpc", "sebi", "budget", "gst", "cpi", "wpi", "iip", "gdp",
  "inflation", "fiscal deficit", "current account", "finance ministry", "nirmala sitharaman",
  "monetary policy", "crude windfall", "import duty", "export duty", "plf", "forex reserves",
];

const GOLD_TRIGGERS: { term: string; dir: 1 | -1 | 0 }[] = [
  { term: "gold", dir: 0 }, { term: "silver", dir: 0 },
  { term: "rate cut", dir: 1 }, { term: "rate hike", dir: -1 },
  { term: "fed", dir: 0 }, { term: "dollar index", dir: 0 }, { term: "dxy", dir: 0 },
  { term: "us yields", dir: 0 }, { term: "treasury yields", dir: 0 },
  { term: "war", dir: 1 }, { term: "sanctions", dir: 1 }, { term: "geopolitical", dir: 1 },
  { term: "central bank buying", dir: 1 }, { term: "rbi gold", dir: 1 },
  { term: "import duty", dir: 0 }, { term: "customs duty", dir: 0 },
  { term: "wedding season", dir: 1 }, { term: "akshaya tritiya", dir: 1 }, { term: "dhanteras", dir: 1 },
  { term: "etf inflows", dir: 1 }, { term: "inflation", dir: 1 },
  { term: "weak dollar", dir: 1 }, { term: "strong dollar", dir: -1 },
];

const GLOBAL_TRIGGERS = [
  "wall street", "dow jones", "nasdaq", "s&p 500", "fed", "fomc", "us cpi", "nonfarm",
  "china pmi", "nikkei", "hang seng", "gift nifty", "us futures", "asian markets",
  "treasury", "brent", "opec", "dollar index",
];

const GEO_TRIGGERS = [
  "war", "missile", "sanctions", "ceasefire", "tariff", "trade war", "border clash",
  "election", "geopolitical", "ukraine", "gaza", "israel", "iran", "pakistan tension",
];

const IPO_TRIGGERS = ["ipo", "price band", "subscription opens", "gmp", "grey market premium", "listing", "sme ipo", "anchor investors", "qib"];

const ORDER_VALUE_RE = /(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)\s*(crore|cr|lakh crore|lakh|bn|billion|mn|million)/i;
const NUM_UNIT_RE = /([\d,]+(?:\.\d+)?)\s*(crore|cr)\b/i;

export function extractOrderValueCr(text: string): number | undefined {
  const m = text.match(ORDER_VALUE_RE) ?? text.match(NUM_UNIT_RE);
  if (!m) return undefined;
  const num = parseFloat(m[1].replace(/,/g, ""));
  if (!isFinite(num)) return undefined;
  const unit = m[2].toLowerCase();
  if (unit === "crore" || unit === "cr") return num;
  if (unit === "lakh crore") return num * 100000;
  if (unit === "lakh") return num / 100;
  if (unit === "billion" || unit === "bn") return num * 100; // ₹1 bn ≈ ₹100 cr
  if (unit === "million" || unit === "mn") return num / 10;
  return undefined;
}

// word-boundary matching so "ban" doesn't fire inside "bank", "loa" inside "loan"
const boundaryCache = new Map<string, RegExp>();
function hasTerm(text: string, term: string): boolean {
  let re = boundaryCache.get(term);
  if (!re) {
    re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    boundaryCache.set(term, re);
  }
  return re.test(text);
}

function countHits(text: string, terms: string[]): number {
  let n = 0;
  for (const t of terms) if (hasTerm(text, t)) n++;
  return n;
}

export interface RawStory {
  title: string;
  url: string;
  source: string;
  publishedAt: number;
  feedKind: string;
  description?: string;
}

export function classifyStory(raw: RawStory): NewsItem {
  const text = `${raw.title} ${raw.description ?? ""}`.toLowerCase();
  const titleText = raw.title.toLowerCase();

  // entities
  const tickers: string[] = [];
  const sectors = new Set<string>();
  for (const { alias, entity } of ALIAS_INDEX) {
    if (alias.length < 3) continue;
    // word-boundary-ish match to reduce false positives
    const idx = text.indexOf(alias);
    if (idx >= 0) {
      const before = idx === 0 ? " " : text[idx - 1];
      const after = idx + alias.length >= text.length ? " " : text[idx + alias.length];
      if (/[\s,.;:'"()\-/]/.test(before) && /[\s,.;:'"()\-/]/.test(after)) {
        if (!tickers.includes(entity.ticker)) tickers.push(entity.ticker);
        sectors.add(entity.sector);
      }
    }
  }

  const tenderHits = countHits(text, TENDER_VERBS);
  const macroHits = countHits(text, MACRO_TRIGGERS);
  const globalHits = countHits(text, GLOBAL_TRIGGERS);
  const geoHits = countHits(text, GEO_TRIGGERS);
  const ipoHits = countHits(text, IPO_TRIGGERS);
  // gold relevance needs a bullion term AND a market-context term
  const hasBullion = hasTerm(text, "gold") || hasTerm(text, "silver") || hasTerm(text, "bullion") || hasTerm(text, "mcx");
  const hasGoldCtx = countHits(text, [
    "price", "prices", "rate", "duty", "demand", "import", "export", "etf", "reserve",
    "dollar", "inflation", "jewellers", "jewellery", "ounce", "record", "central bank",
    "fed", "yields", "safe haven", "rally", "drop",
  ]) > 0;
  const goldRelevant = hasBullion && (hasGoldCtx || raw.feedKind === "gold");
  const goldHits = goldRelevant ? GOLD_TRIGGERS.filter((g) => hasTerm(text, g.term)) : [];

  // results/earnings context — never a tender even if numbers are large
  const isEarnings =
    /q[1-4]\s*(results|earnings|profit|net)|net profit|profit (rises|jumps|falls|drops|grows)|revenue (rises|grows)|nii|results today/.test(
      text,
    );

  // category decision
  let category: Category = "stocks-corporate";
  if (tenderHits > 0 && !isEarnings) category = "tenders-contracts";
  else if (ipoHits >= 1 && /\bipo\b|price band|subscription|listing|gmp|drhp/.test(text)) category = "ipo";
  else if (goldHits.length > 0) category = "gold-commodities";
  else if (macroHits > 0 || raw.feedKind === "policy") category = "macro-policy";
  else if (geoHits >= 2) category = "geopolitics";
  else if (globalHits > 0 || raw.feedKind === "global") category = "global-cues";
  else if (hasTerm(titleText, "crude") || hasTerm(titleText, "copper")) category = "gold-commodities";

  // ₹ values are only meaningful as order values for tender stories —
  // anywhere else ("mcap jumps ₹1.54 lakh crore") they're noise
  const orderValueCr =
    category === "tenders-contracts"
      ? (extractOrderValueCr(raw.title) ?? extractOrderValueCr(raw.description ?? ""))
      : undefined;

  // sentiment
  const bull = countHits(text, BULLISH_TRIGGERS) + (category === "tenders-contracts" ? 1 : 0);
  const bear = countHits(text, BEARISH_TRIGGERS);
  let sentiment: Sentiment = "neutral";
  if (bull > bear) sentiment = "bullish";
  else if (bear > bull) sentiment = "bearish";

  // asset impact
  const assetImpact: AssetImpact = {
    equity: category !== "gold-commodities" || tickers.length > 0,
    gold: goldRelevant,
    inr:
      hasTerm(text, "rupee") || text.includes("usd/inr") || hasTerm(text, "dollar") ||
      hasTerm(text, "forex") || hasTerm(text, "fii") || macroHits >= 2,
    bonds:
      hasTerm(text, "bond") || hasTerm(text, "yield") || hasTerm(text, "g-sec") ||
      hasTerm(text, "repo") || hasTerm(text, "rate cut") || hasTerm(text, "rate hike"),
  };

  // impact score 1–5
  let impact = 1;
  if (tickers.length > 0) impact += 1;
  if (tenderHits > 0 && orderValueCr && orderValueCr >= 100) impact += 1;
  if ((orderValueCr ?? 0) >= 1000) impact += 1;
  if (macroHits >= 1 && /rbi|repo|sebi|budget|cpi|gdp|fed/.test(text)) impact += 1;
  if (bear >= 2 || bull >= 2) impact += 1;
  const impactScore = clamp(impact, 1, 5) as 1 | 2 | 3 | 4 | 5;

  // awarding body for tenders
  let awardingBody: string | undefined;
  if (category === "tenders-contracts") {
    for (const m of MINISTRIES) {
      if (text.includes(m)) {
        awardingBody = m.replace(/\b\w/g, (c) => c.toUpperCase());
        break;
      }
    }
  }

  // speculation flag (political-proximity narratives)
  const isSpeculation =
    raw.feedKind === "speculation" ||
    text.includes("electoral bond") ||
    (text.includes("government") && tenderHits > 0 && tickers.length > 0);

  const whyItMatters = buildWhy(category, sentiment, tickers, orderValueCr, impactScore);

  return {
    id: hashId(raw.url || raw.title),
    title: raw.title.trim(),
    url: raw.url,
    source: raw.source,
    sourceDomain: domainOf(raw.url),
    publishedAt: raw.publishedAt,
    fetchedAt: Date.now(),
    category,
    sentiment,
    impactScore,
    tickers,
    sectors: [...sectors],
    assetImpact,
    whyItMatters,
    orderValueCr,
    awardingBody,
    duplicateCount: 0,
    isSpeculation,
  };
}

function buildWhy(
  category: Category,
  sentiment: Sentiment,
  tickers: string[],
  orderValueCr: number | undefined,
  impact: number,
): string {
  const t = tickers.slice(0, 2).join(", ");
  switch (category) {
    case "tenders-contracts":
      return orderValueCr
        ? `Order inflow of ~₹${orderValueCr.toLocaleString("en-IN")} cr${t ? ` — directly accretive to ${t}'s order book and revenue visibility` : " — watch the winner's order book and margin guidance"}.`
        : `Government/PSU order flow${t ? ` linked to ${t}` : ""} — order-driven names tend to re-rate on award confirmation.`;
    case "macro-policy":
      return `Policy signal with read-through to rates, liquidity and sector earnings — moves index heavyweights and rate-sensitives.`;
    case "gold-commodities":
      return `Tracks the gold complex — bullion prices, import duty and INR feed straight into jewellers, MCX and gold-loan NBFCs.`;
    case "ipo":
      return `Primary-market action — subscription and listing signals for the issue${t ? `; peer read-through to ${t}` : ""}.`;
    case "global-cues":
      return `Overnight global cue — sets the GIFT Nifty / opening tone and FII risk appetite for Indian equities.`;
    case "geopolitics":
      return `Geopolitical risk — typically lifts crude, gold and volatility while pressuring risk assets and INR.`;
    default:
      return sentiment === "bearish"
        ? `Negative trigger${t ? ` for ${t}` : ""} — watch for follow-through selling and analyst revisions.`
        : sentiment === "bullish"
          ? `Positive trigger${t ? ` for ${t}` : ""} — momentum and estimate-revision potential.`
          : impact >= 3
            ? `Material corporate development${t ? ` involving ${t}` : ""} — details in the linked report.`
            : `Corporate newsflow${t ? ` involving ${t}` : ""} — low immediate market impact, keep on radar.`;
  }
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

// fuzzy-title dedupe: normalize, strip punctuation, compare first 8 words
export function titleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 8)
    .join(" ");
}

export function dedupeStories(items: NewsItem[]): NewsItem[] {
  const byKey = new Map<string, NewsItem>();
  for (const item of items) {
    const key = titleKey(item.title);
    const existing = byKey.get(key) ?? byKey.get(item.id);
    if (!existing) {
      byKey.set(key, item);
      byKey.set(item.id, item);
    } else {
      // keep earliest timestamp, bump duplicate count
      if (item.publishedAt < existing.publishedAt) {
        item.duplicateCount = existing.duplicateCount + 1;
        byKey.set(key, item);
        byKey.set(item.id, item);
      } else {
        existing.duplicateCount += 1;
      }
    }
  }
  const unique = new Set<NewsItem>();
  for (const v of byKey.values()) unique.add(v);
  return [...unique].sort((a, b) => b.publishedAt - a.publishedAt);
}
