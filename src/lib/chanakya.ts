// CHANAKYA WATCH — State-Alignment Score engine.
//
// THE RULES (hard):
// 1. A signal only contributes when ≥1 linked published source exists.
// 2. No sources → no score → company omitted entirely (fail closed).
// 3. Language stays "reported / according to" — the score measures
//    alignment patterns in public data, never wrongdoing.
import type { CompanyScore, Evidence, NewsItem, SignalKey } from "./types";
import { ENTITIES } from "./entities";
import { clamp } from "./format";

export const SIGNALS: { key: SignalKey; name: string; weight: number; desc: string }[] = [
  { key: "S1", name: "Contract velocity", weight: 25, desc: "Govt/PSU orders won in trailing 12 months vs. sector baseline" },
  { key: "S2", name: "Policy tailwind timing", weight: 15, desc: "Favorable policy/duty/PLI announced near the company's related moves" },
  { key: "S3", name: "Asset-transfer wins", weight: 15, desc: "Disinvestment, privatisation, airport/port/mine/spectrum awards" },
  { key: "S4", name: "Political proximity (as reported)", weight: 15, desc: "Credible-outlet reporting of promoter–politician ties, electoral funding disclosures, ex-bureaucrat boards" },
  { key: "S5", name: "Regulatory fast-track", weight: 10, desc: "Clearances reported as unusually fast vs. sector norms" },
  { key: "S6", name: "State-linked financing", weight: 10, desc: "Reported large exposure from PSU banks / LIC / state funds" },
  { key: "S7", name: "Narrative asymmetry", weight: 10, desc: "Government publicly defending the company; rivals facing exclusions" },
];

const DAY = 86_400_000;

function evidenceFrom(item: NewsItem, signal: SignalKey, note: string): Evidence {
  return {
    id: item.id + signal,
    title: item.title,
    url: item.url,
    source: item.source,
    date: item.publishedAt,
    signal,
    note,
  };
}

// signal detectors over the classified corpus
const DETECTORS: Record<SignalKey, { match: (item: NewsItem, text: string) => boolean; note: (item: NewsItem) => string }> = {
  S1: {
    match: (i, t) => i.category === "tenders-contracts" && i.tickers.length > 0 && (t.includes("government") || t.includes("psu") || t.includes("ministry") || t.includes("nhai") || t.includes("railways") || t.includes("defence") || t.includes("order") || t.includes("contract")),
    note: (i) => `Reported order win${i.orderValueCr ? ` (~₹${i.orderValueCr.toLocaleString("en-IN")} cr)` : ""} — counts toward contract velocity.`,
  },
  S2: {
    match: (_i, t) => (t.includes("pli") || t.includes("incentive") || t.includes("duty cut") || t.includes("import duty") || t.includes("policy") || t.includes("approved")) && (t.includes("scheme") || t.includes("sector") || t.includes("industry")),
    note: () => `Policy/incentive announcement with read-through to the company's segment.`,
  },
  S3: {
    match: (_i, t) => t.includes("disinvestment") || t.includes("privatisation") || t.includes("privatization") || t.includes("stake sale") || t.includes("auction") || t.includes("concession"),
    note: () => `Reported asset-transfer / privatisation development.`,
  },
  S4: {
    match: (_i, t) => t.includes("electoral bond") || t.includes("political funding") || t.includes("ties with") || t.includes("close to") || t.includes("proximity") || t.includes("crony") || t.includes("electoral trust"),
    note: () => `Public reporting on political-proximity / funding disclosures. Alignment pattern only — no wrongdoing is implied.`,
  },
  S5: {
    match: (_i, t) => (t.includes("clearance") || t.includes("approval") || t.includes("nod") || t.includes("license") || t.includes("licence")) && (t.includes("fast") || t.includes("record time") || t.includes("quick") || t.includes("expedite") || t.includes("granted")),
    note: () => `Reported clearance/approval development.`,
  },
  S6: {
    match: (_i, t) => (t.includes("lic") || t.includes("sbi") || t.includes("psu bank") || t.includes("state bank") || t.includes("lifeline") || t.includes("loan") || t.includes("funding")) && (t.includes("crore") || t.includes("cr ") || t.includes("exposure") || t.includes("stake")),
    note: () => `Reported state-linked financing / institutional exposure.`,
  },
  S7: {
    match: (_i, t) => t.includes("defend") || t.includes("backs ") || t.includes("support") || t.includes("denies") || t.includes("no wrongdoing") || t.includes("clean chit") || t.includes("exclude"),
    note: () => `Reported narrative-asymmetry signal (defence/exclusion pattern in public statements).`,
  },
};

export function computeScores(corpus: NewsItem[]): CompanyScore[] {
  const now = Date.now();
  const window = 365 * DAY;
  const recent = corpus.filter((i) => now - i.publishedAt < window);

  const byTicker = new Map<string, NewsItem[]>();
  for (const item of recent) {
    for (const t of item.tickers) {
      if (!byTicker.has(t)) byTicker.set(t, []);
      byTicker.get(t)!.push(item);
    }
  }

  const scores: CompanyScore[] = [];

  for (const [ticker, items] of byTicker) {
    const entity = ENTITIES.find((e) => e.ticker === ticker);
    if (!entity) continue;

    const evidence: Evidence[] = [];
    const signalScores = {} as Record<SignalKey, number>;

    for (const sig of SIGNALS) {
      const det = DETECTORS[sig.key];
      const matched: Evidence[] = [];
      for (const item of items) {
        const text = `${item.title} ${item.whyItMatters}`.toLowerCase();
        if (det.match(item, text)) matched.push(evidenceFrom(item, sig.key, det.note(item)));
      }
      // points: weight scaled by log of evidence count, capped at full weight
      const points = matched.length === 0 ? 0 : clamp(sig.weight * (0.45 + 0.55 * Math.min(1, Math.log10(matched.length + 1) / Math.log10(6))), 0, sig.weight);
      signalScores[sig.key] = Math.round(points * 10) / 10;
      // keep strongest (highest-impact) evidence first
      evidence.push(...matched.sort((a, b) => b.date - a.date));
    }

    const totalEvidence = evidence.length;
    if (totalEvidence === 0) continue; // fail closed — no evidence, no score

    const score = Math.round(clamp(Object.values(signalScores).reduce((a, b) => a + b, 0), 0, 100));
    const topSignal = (Object.entries(signalScores) as [SignalKey, number][]).sort((a, b) => b[1] - a[1])[0][0];

    // trend: evidence in last 90d vs prior 90d
    const e90 = evidence.filter((e) => now - e.date < 90 * DAY).length;
    const ePrev = evidence.filter((e) => now - e.date >= 90 * DAY && now - e.date < 180 * DAY).length;
    const trend = e90 > ePrev ? "up" : e90 < ePrev ? "down" : "flat";

    scores.push({
      ticker,
      name: entity.name,
      sector: entity.sector,
      isPSU: entity.isPSU,
      score,
      band: bandOf(score),
      signalScores,
      evidence: evidence.sort((a, b) => b.date - a.date),
      topSignal,
      trend,
    });
  }

  return scores.sort((a, b) => b.score - a.score);
}

export function bandOf(score: number): string {
  if (score < 25) return "Market-driven";
  if (score < 50) return "Mild tailwind";
  if (score < 75) return "Notable state alignment";
  return "Heavy state alignment (speculative)";
}

// ---- Score snapshots: one per day, enabling delta leaderboards ----
const SNAP_KEY = "artha.chanakya.snaps";
const SNAP_MAX = 60;

interface ScoreSnap {
  date: string;
  scores: Record<string, number>;
}

export function snapshotScores(scores: CompanyScore[]): void {
  try {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const raw = localStorage.getItem(SNAP_KEY);
    const snaps: ScoreSnap[] = raw ? JSON.parse(raw) : [];
    const filtered = snaps.filter((s) => s.date !== today);
    filtered.push({ date: today, scores: Object.fromEntries(scores.map((c) => [c.ticker, c.score])) });
    localStorage.setItem(SNAP_KEY, JSON.stringify(filtered.slice(-SNAP_MAX)));
  } catch {
    /* ignore */
  }
}

export function scoreDeltas(scores: CompanyScore[], daysBack = 7): { ticker: string; delta: number; from: string }[] {
  try {
    const raw = localStorage.getItem(SNAP_KEY);
    const snaps: ScoreSnap[] = raw ? JSON.parse(raw) : [];
    if (snaps.length < 2) return [];
    const target = snaps[Math.max(0, snaps.length - 1 - daysBack)];
    return scores
      .filter((c) => target.scores[c.ticker] != null)
      .map((c) => ({ ticker: c.ticker, delta: c.score - target.scores[c.ticker], from: target.date }))
      .filter((d) => d.delta !== 0)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  } catch {
    return [];
  }
}

// ---- Order book: per-company accumulated tender values from the corpus ----
export interface OrderBookRow {
  ticker: string;
  name: string;
  sector: string;
  totalCr: number;
  count: number;
  largestCr: number;
  latestAt: number;
  byMonth: Record<string, number>; // "2026-07" → cr
}

export function orderBook(corpus: NewsItem[]): OrderBookRow[] {
  const map = new Map<string, OrderBookRow>();
  for (const item of corpus) {
    if (item.category !== "tenders-contracts") continue;
    for (const t of item.tickers) {
      const e = ENTITIES.find((x) => x.ticker === t);
      if (!e) continue;
      if (!map.has(t)) {
        map.set(t, { ticker: t, name: e.name, sector: e.sector, totalCr: 0, count: 0, largestCr: 0, latestAt: 0, byMonth: {} });
      }
      const row = map.get(t)!;
      const v = item.orderValueCr ?? 0;
      row.totalCr += v;
      row.count += 1;
      row.largestCr = Math.max(row.largestCr, v);
      row.latestAt = Math.max(row.latestAt, item.publishedAt);
      const mk = new Date(item.publishedAt).toISOString().slice(0, 7);
      row.byMonth[mk] = (row.byMonth[mk] ?? 0) + v;
    }
  }
  return [...map.values()].sort((a, b) => b.totalCr - a.totalCr || b.count - a.count);
}

export function dossierCsv(c: CompanyScore): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const lines = [
    "signal,points,evidence_title,source,date,url,note",
    ...c.evidence.map((e) =>
      [e.signal, String(c.signalScores[e.signal]), esc(e.title), esc(e.source), new Date(e.date).toISOString().slice(0, 10), e.url, esc(e.note)].join(","),
    ),
  ];
  return `Company,${esc(c.name)}\nTicker,${c.ticker}\nScore,${c.score}\nBand,${esc(c.band)}\n\n${lines.join("\n")}`;
}

// ---- Sarkari Radar: PSU/govt order flow by sector per month (₹ cr) ----
export interface RadarRow {
  sector: string;
  months: { label: string; valueCr: number; count: number }[];
  totalCr: number;
}

export function sarkariRadar(corpus: NewsItem[], monthsBack = 6): RadarRow[] {
  const tenders = corpus.filter((i) => i.category === "tenders-contracts");
  const now = new Date();
  const buckets: { key: string; label: string }[] = [];
  for (let m = monthsBack - 1; m >= 0; m--) {
    const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
    buckets.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: d.toLocaleString("en-IN", { month: "short" }),
    });
  }
  const map = new Map<string, RadarRow>();
  for (const item of tenders) {
    const d = new Date(item.publishedAt);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const sectors = item.sectors.length > 0 ? item.sectors : ["general"];
    for (const sector of sectors) {
      if (!map.has(sector)) {
        map.set(sector, { sector, months: buckets.map((b) => ({ label: b.label, valueCr: 0, count: 0 })), totalCr: 0 });
      }
      const row = map.get(sector)!;
      const idx = buckets.findIndex((b) => b.key === key);
      if (idx >= 0) {
        row.months[idx].valueCr += item.orderValueCr ?? 0;
        row.months[idx].count += 1;
        row.totalCr += item.orderValueCr ?? 0;
      }
    }
  }
  return [...map.values()].sort((a, b) => b.totalCr - a.totalCr);
}
