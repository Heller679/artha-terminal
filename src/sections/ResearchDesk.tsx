import { useEffect, useMemo, useState } from "react";
import { Search, ShieldAlert, Sparkles, RefreshCw } from "lucide-react";
import type { NewsItem } from "@/lib/types";
import { getScreenerData } from "@/lib/screener";
import { computeResearchScore, priceContext, newsSkewFor, SCREEN_POOL, type ResearchScore } from "@/lib/research";
import { Card, EmptyState } from "@/components/primitives";
import { relTime } from "@/lib/format";

const DIM_COLOR: Record<string, string> = {
  moat: "var(--accent)",
  management: "var(--bull)",
  financials: "var(--spec)",
  valuation: "var(--gold)",
};

function ScoreRing({ score, size = 64 }: { score: number; size?: number }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const color = score >= 70 ? "var(--bull)" : score >= 55 ? "var(--accent)" : score >= 40 ? "var(--gold)" : "var(--bear)";
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={5} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray={`${(score / 100) * circ} ${circ}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dasharray 600ms ease-out" }}
      />
      <text x="50%" y="47%" textAnchor="middle" dominantBaseline="middle" fill="var(--text)" fontSize={size * 0.28} fontWeight={700} fontFamily="IBM Plex Mono">
        {score}
      </text>
      <text x="50%" y="66%" textAnchor="middle" fill="var(--muted)" fontSize={size * 0.12} fontFamily="IBM Plex Mono">
        /100
      </text>
    </svg>
  );
}

function DimBars({ s }: { s: ResearchScore }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {s.dimensions.map((d) => (
        <div key={d.key} title={d.reasons.join("\n")}>
          <div className="flex items-baseline justify-between">
            <span className="text-[9px] uppercase tracking-wider text-dim">{d.label.slice(0, 4)}</span>
            <span className="font-mono-num text-[9.5px] text-dim">{d.score}</span>
          </div>
          <div className="mt-0.5 h-1 rounded-full bg-hairline">
            <div
              className="h-1 rounded-full"
              style={{ width: `${(d.score / 25) * 100}%`, backgroundColor: DIM_COLOR[d.key] }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ResearchDesk({
  corpus,
  watchlist,
  onOpenDeepDive,
}: {
  corpus: NewsItem[];
  watchlist: string[];
  onOpenDeepDive: (ticker: string) => void;
}) {
  const [results, setResults] = useState<ResearchScore[]>(() => {
    try {
      const raw = localStorage.getItem("artha.research.results.v2");
      return raw ? (JSON.parse(raw) as ResearchScore[]) : [];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(() => results.length === 0);
  const [progress, setProgress] = useState(0);
  const [search, setSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (results.length === 0) setLoading(true);
    setProgress(0);
    (async () => {
      const out: ResearchScore[] = [];
      let done = 0;
      // sequential-ish batches keep the proxy semaphore happy
      const batch = 3;
      for (let i = 0; i < SCREEN_POOL.length; i += batch) {
        const chunk = SCREEN_POOL.slice(i, i + batch);
        await Promise.all(
          chunk.map(async (ticker) => {
            try {
              const data = await getScreenerData(ticker);
              const ctx = await priceContext(ticker);
              const score = computeResearchScore(data, {
                ...ctx,
                newsSkew: newsSkewFor(ticker, corpus),
              });
              out.push(score);
            } catch {
              /* screener unreachable for this ticker — skip honestly */
            } finally {
              done++;
              if (!cancelled) setProgress(done);
            }
          }),
        );
        // progressive render: show what we have so far
        if (!cancelled && out.length > 0) {
          setResults([...out].sort((a, b) => b.total - a.total));
          setLoading(false);
        }
      }
      if (!cancelled) {
        const sorted = out.sort((a, b) => b.total - a.total);
        setResults(sorted);
        setLoading(false);
        try {
          // persist a slim copy (full fundamentals re-fetch from cache on demand)
          const slim = sorted.slice(0, 24).map((s) => ({
            ...s,
            data: { ...s.data, quarterly: null, yearly: null, balanceSheet: null, cashFlow: null, shareholding: null, peers: null },
          }));
          localStorage.setItem("artha.research.results.v2", JSON.stringify(slim));
        } catch {
          /* quota — ignore */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const filtered = useMemo(() => {
    if (!search.trim()) return results;
    const q = search.toLowerCase();
    return results.filter((r) => r.ticker.toLowerCase().includes(q) || r.name.toLowerCase().includes(q));
  }, [results, search]);

  const picks = filtered.slice(0, 6);
  const rest = filtered.slice(6);

  return (
    <div className="p-3 md:p-5">
      {/* header */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] leading-none text-ink">
            Research <span className="text-marigold">Desk</span>
          </h1>
          <p className="mt-1.5 max-w-2xl text-[12px] leading-relaxed text-dim">
            Kimi screens liquid Indian companies on a 20-signal fundamental scorecard — moat, management, financials,
            valuation — computed from public filings data, price history and this terminal's own news signals. Open any
            company for the full deep dive: business model, financials, competitors, and the bull vs bear case.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-dim" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter screened names…"
              className="rounded-md border border-hairline bg-surface py-1.5 pl-7 pr-2 text-[12px] text-ink placeholder:text-dim/60 focus:border-marigold/60"
            />
          </div>
          <button
            onClick={() => setRefreshKey((k) => k + 1)}
            className="flex items-center gap-1.5 rounded-md border border-hairline px-2.5 py-1.5 text-[11.5px] text-dim hover:text-ink"
          >
            <RefreshCw size={12} className={loading ? "spin-refresh" : ""} /> Re-screen
          </button>
        </div>
      </div>

      {/* honesty banner */}
      <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-marigold/30 bg-marigold/5 px-3.5 py-2.5">
        <ShieldAlert size={15} className="mt-0.5 shrink-0 text-marigold" />
        <p className="text-[11.5px] leading-relaxed text-dim">
          <strong className="text-ink">Educational screen, not investment advice.</strong> Scores are computed by an AI
          from public data (Screener.in, Yahoo Finance) and can be wrong, stale, or incomplete. Kimi is not a
          SEBI-registered analyst. Do your own research and consult a registered adviser before investing.
        </p>
      </div>

      {loading && results.length === 0 ? (
        <Card className="p-6">
          <div className="mx-auto max-w-sm text-center">
            <Sparkles size={20} className="mx-auto text-marigold" />
            <p className="mt-2 text-[13px] font-medium text-ink">Kimi is screening {SCREEN_POOL.length} companies…</p>
            <p className="mt-1 text-[11.5px] text-dim">
              Fetching fundamentals, price history and news signals ({progress}/{SCREEN_POOL.length})
            </p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-hairline">
              <div
                className="h-full rounded-full bg-marigold transition-all"
                style={{ width: `${(progress / SCREEN_POOL.length) * 100}%` }}
              />
            </div>
          </div>
        </Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Screener data unreachable right now."
          hint="Fundamentals come from Screener.in via the proxy routes — retry in a moment."
        />
      ) : (
        <>
          {/* picks */}
          <p className="section-eyebrow mb-2 flex items-center gap-1.5">
            <Sparkles size={11} className="text-marigold" /> Kimi's top screens · {picks.length}
          </p>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {picks.map((s, i) => (
              <button
                key={s.ticker}
                onClick={() => onOpenDeepDive(s.ticker)}
                className="group rounded-[10px] border border-hairline bg-surface p-4 text-left transition-colors-150 hover:border-marigold/50"
              >
                <div className="flex items-start gap-3">
                  <ScoreRing score={s.total} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono-num rounded bg-marigold/10 px-1 text-[9px] font-bold text-marigold">
                        #{i + 1}
                      </span>
                      <span className="font-mono-num text-[13px] font-bold text-ink">{s.ticker}</span>
                      {watchlist.includes(s.ticker) && <span className="text-[10px] text-marigold">★</span>}
                    </div>
                    <p className="truncate text-[11.5px] text-dim">{s.name}</p>
                    <p className="mt-1 text-[11px] font-semibold" style={{ color: s.total >= 70 ? "var(--bull)" : "var(--accent)" }}>
                      {"★".repeat(s.stars)} {s.rating}
                    </p>
                  </div>
                </div>
                <div className="mt-3">
                  <DimBars s={s} />
                </div>
                <ul className="mt-3 space-y-1">
                  {s.reasons.slice(0, 3).map((r, j) => (
                    <li key={j} className="flex gap-1.5 text-[11px] leading-snug text-dim">
                      <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-marigold" />
                      {r}
                    </li>
                  ))}
                </ul>
                <p className="mt-2.5 text-[10.5px] font-medium text-marigold opacity-0 transition-opacity group-hover:opacity-100">
                  Open deep dive →
                </p>
              </button>
            ))}
          </div>

          {/* rest of the screen */}
          {rest.length > 0 && (
            <>
              <p className="section-eyebrow mb-2 mt-5">Also screened</p>
              <Card>
                {rest.map((s) => (
                  <button
                    key={s.ticker}
                    onClick={() => onOpenDeepDive(s.ticker)}
                    className="flex w-full items-center gap-3 border-b border-hairline/60 px-4 py-2.5 text-left last:border-0 hover:bg-panel/60"
                  >
                    <span className="font-mono-num w-24 shrink-0 text-[12.5px] font-semibold text-ink">{s.ticker}</span>
                    <span className="min-w-0 flex-1 truncate text-[11.5px] text-dim">{s.name}</span>
                    <div className="hidden w-32 sm:block">
                      <DimBars s={s} />
                    </div>
                    <span
                      className="font-mono-num w-10 text-right text-[14px] font-bold"
                      style={{ color: s.total >= 70 ? "var(--bull)" : s.total >= 55 ? "var(--accent)" : "var(--dim, var(--muted))" }}
                    >
                      {s.total}
                    </span>
                  </button>
                ))}
              </Card>
            </>
          )}
          <p className="mt-3 text-[10.5px] text-dim/70">
            Screened {results.length} companies · fundamentals cached 12h · last run {relTime(Math.max(...results.map((r) => r.computedAt)))} ·
            any ticker can be deep-dived from its stock page or ⌘K
          </p>
        </>
      )}
    </div>
  );
}
