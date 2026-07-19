import { useEffect, useMemo, useState } from "react";
import { X, ExternalLink, Filter, Telescope } from "lucide-react";
import { getHistory, getStats, sma, rsi, type Candle, type RangeKey, type StockStats } from "@/lib/history";
import { ENTITIES } from "@/lib/entities";
import type { NewsItem } from "@/lib/types";
import { fmtNum, fmtSigned, relTime } from "@/lib/format";
import { Card, CardHeader, EmptyState, SkeletonRows, SentimentBadge, CategoryChip } from "@/components/primitives";

const RANGES: RangeKey[] = ["1D", "5D", "1M", "6M", "1Y", "5Y"];

function CandleChart({ candles, height = 260 }: { candles: Candle[]; height?: number }) {
  const W = 720;
  const H = height;
  const RSI_H = 54;
  const PRICE_H = H - RSI_H - 8;
  const pad = { l: 8, r: 54, t: 8, b: 4 };

  const closes = candles.map((c) => c.c);
  const rsiVals = useMemo(() => rsi(closes), [closes]);
  const sma20 = useMemo(() => sma(closes, Math.min(20, Math.max(2, Math.floor(closes.length / 4)))), [closes]);

  if (candles.length < 2) return null;
  const hi = Math.max(...candles.map((c) => c.h));
  const lo = Math.min(...candles.map((c) => c.l));
  const span = hi - lo || 1;
  const bw = (W - pad.l - pad.r) / candles.length;
  const y = (v: number) => pad.t + (1 - (v - lo) / span) * (PRICE_H - pad.t - pad.b);
  const rsiY = (v: number) => PRICE_H + 8 + (1 - v / 100) * (RSI_H - 6);

  const gridVals = [lo, lo + span * 0.25, lo + span * 0.5, lo + span * 0.75, hi];
  const up = closes[closes.length - 1] >= closes[0];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Price chart">
      {gridVals.map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={0.5} strokeDasharray="2 3" />
          <text x={W - pad.r + 5} y={y(v) + 3} fill="var(--muted)" fontSize={9} fontFamily="IBM Plex Mono">
            {v >= 10000 ? fmtNum(v, 0) : fmtNum(v, 1)}
          </text>
        </g>
      ))}
      {candles.map((c, i) => {
        const x = pad.l + i * bw + bw / 2;
        const bull = c.c >= c.o;
        const color = bull ? "var(--bull)" : "var(--bear)";
        const bodyW = Math.max(1, bw * 0.62);
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={y(c.h)} y2={y(c.l)} stroke={color} strokeWidth={Math.max(0.6, bw * 0.12)} />
            <rect
              x={x - bodyW / 2}
              y={Math.min(y(c.o), y(c.c))}
              width={bodyW}
              height={Math.max(0.8, Math.abs(y(c.o) - y(c.c)))}
              fill={bull ? color : color}
              fillOpacity={bull ? 0.85 : 0.95}
            />
          </g>
        );
      })}
      {/* SMA overlay */}
      <polyline
        fill="none"
        stroke="var(--accent)"
        strokeWidth={1.1}
        points={sma20
          .map((v, i) => (v == null ? null : `${pad.l + i * bw + bw / 2},${y(v)}`))
          .filter(Boolean)
          .join(" ")}
        opacity={0.8}
      />
      {/* RSI panel */}
      <line x1={pad.l} x2={W - pad.r} y1={PRICE_H + 4} y2={PRICE_H + 4} stroke="var(--line)" strokeWidth={0.5} />
      {[30, 70].map((lvl) => (
        <line key={lvl} x1={pad.l} x2={W - pad.r} y1={rsiY(lvl)} y2={rsiY(lvl)} stroke="var(--line)" strokeWidth={0.5} strokeDasharray="2 3" />
      ))}
      <polyline
        fill="none"
        stroke="var(--spec)"
        strokeWidth={1.1}
        points={rsiVals
          .map((v, i) => (v == null ? null : `${pad.l + i * bw + bw / 2},${rsiY(v)}`))
          .filter(Boolean)
          .join(" ")}
      />
      <text x={pad.l + 2} y={rsiY(70) - 2} fill="var(--muted)" fontSize={8} fontFamily="IBM Plex Mono">
        RSI 70
      </text>
      <text x={pad.l + 2} y={rsiY(30) + 8} fill="var(--muted)" fontSize={8} fontFamily="IBM Plex Mono">
        30
      </text>
      {/* last price marker */}
      <g>
        <rect
          x={W - pad.r + 1}
          y={y(closes[closes.length - 1]) - 7}
          width={pad.r - 3}
          height={14}
          fill={up ? "var(--bull)" : "var(--bear)"}
          rx={3}
        />
        <text
          x={W - pad.r + 5}
          y={y(closes[closes.length - 1]) + 3}
          fill="#0c0e13"
          fontSize={9}
          fontWeight={700}
          fontFamily="IBM Plex Mono"
        >
          {fmtNum(closes[closes.length - 1], closes[closes.length - 1] >= 10000 ? 0 : 1)}
        </text>
      </g>
    </svg>
  );
}

export function StockView({
  ticker,
  news,
  onClose,
  onFilterFeed,
  onResearch,
}: {
  ticker: string;
  news: NewsItem[];
  onClose: () => void;
  onFilterFeed: (t: string) => void;
  onResearch: (t: string) => void;
}) {
  const [range, setRange] = useState<RangeKey>("6M");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [yearCandles, setYearCandles] = useState<Candle[]>([]);
  const [stats, setStats] = useState<StockStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const entity = ENTITIES.find((e) => e.ticker === ticker);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [c, y] = await Promise.all([getHistory(ticker, range), getHistory(ticker, "1Y")]);
        if (cancelled) return;
        setCandles(c);
        setYearCandles(y);
        setStats(await getStats(ticker, y));
        if (c.length === 0) setError("No price history reachable for this symbol.");
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ticker, range]);

  const related = useMemo(
    () => news.filter((n) => n.tickers.includes(ticker)).slice(0, 20),
    [news, ticker],
  );

  const statItems: [string, string][] = stats
    ? [
        ["Last", `₹${fmtNum(stats.last)}`],
        ["Day range", `${fmtNum(stats.dayLow, 0)} – ${fmtNum(stats.dayHigh, 0)}`],
        ["52w high", `₹${fmtNum(stats.w52High, 0)}`],
        ["52w low", `₹${fmtNum(stats.w52Low, 0)}`],
        ["From 52w high", fmtSigned(stats.fromW52HighPct, 1, "%")],
      ]
    : [];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-arthabg" role="dialog" aria-label={`${ticker} detail`}>
      <div className="sticky top-0 z-10 border-b border-hairline bg-panel/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2.5">
              <h1 className="font-mono-num text-[20px] font-bold text-ink">{ticker}</h1>
              {entity && (
                <span className="truncate text-[12.5px] text-dim">
                  {entity.name} · {entity.sector}
                  {entity.isPSU ? " · PSU" : ""}
                </span>
              )}
            </div>
            {stats && (
              <div className="mt-0.5 flex items-baseline gap-2">
                <span className="font-mono-num text-[17px] font-semibold text-ink">₹{fmtNum(stats.last)}</span>
                <span className={`font-mono-num text-[12.5px] font-semibold ${stats.changePct >= 0 ? "text-bull" : "text-bear"}`}>
                  {fmtSigned(stats.changePct, 2, "%")}
                </span>
              </div>
            )}
          </div>
          <button
            onClick={() => onResearch(ticker)}
            className="flex items-center gap-1.5 rounded-md border border-marigold/40 bg-marigold/10 px-2.5 py-1.5 text-[11.5px] font-medium text-marigold hover:bg-marigold/20"
          >
            <Telescope size={12} /> Deep dive
          </button>
          <button
            onClick={() => onFilterFeed(ticker)}
            className="flex items-center gap-1.5 rounded-md border border-hairline px-2.5 py-1.5 text-[11.5px] text-dim hover:border-marigold/50 hover:text-marigold"
          >
            <Filter size={12} /> Filter feed
          </button>
          <button onClick={onClose} className="rounded-md border border-hairline p-2 text-dim hover:text-ink" aria-label="Close">
            <X size={15} />
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-5xl space-y-4 px-4 py-4 pb-16">
        <Card>
          <CardHeader
            title="Price chart"
            sub="Yahoo Finance · delayed"
            right={
              <div className="flex gap-0.5">
                {RANGES.map((r) => (
                  <button
                    key={r}
                    onClick={() => setRange(r)}
                    className={`rounded px-2 py-1 text-[10.5px] font-semibold ${range === r ? "bg-marigold/15 text-marigold" : "text-dim hover:text-ink"}`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            }
          />
          {loading && candles.length === 0 ? (
            <SkeletonRows rows={5} height="h-6" />
          ) : error && candles.length === 0 ? (
            <EmptyState title="Chart unavailable right now." hint="Yahoo Finance may be unreachable through the proxy routes — it retries on next open." />
          ) : (
            <div className="p-2">
              <CandleChart candles={candles} />
              <p className="px-2 pb-1 text-[10px] text-dim">
                Candles + SMA overlay (amber) + RSI-14 (violet). {candles.length} bars.
              </p>
            </div>
          )}
        </Card>

        {stats && (
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-hairline bg-hairline sm:grid-cols-5">
            {statItems.map(([k, v]) => (
              <div key={k} className="bg-surface px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-wider text-dim">{k}</p>
                <p className="font-mono-num mt-0.5 text-[13px] font-semibold text-ink">{v}</p>
              </div>
            ))}
          </div>
        )}

        <Card>
          <CardHeader title="News timeline" sub={`${related.length} stories mentioning ${ticker} in the corpus`} />
          {related.length === 0 ? (
            <EmptyState title={`No ${ticker} stories in the current corpus.`} hint="As feeds refresh, matching headlines collect here." />
          ) : (
            <div>
              {related.map((n) => (
                <a
                  key={n.id}
                  href={n.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-3 border-b border-hairline/60 px-4 py-2.5 last:border-0 hover:bg-panel/60"
                >
                  <span className="font-mono-num w-14 shrink-0 pt-0.5 text-[10.5px] text-dim">{relTime(n.publishedAt)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium leading-snug text-ink">
                      {n.title} <ExternalLink size={10} className="ml-0.5 inline opacity-40" />
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <CategoryChip c={n.category} />
                      <span className="text-[10.5px] text-dim">{n.source}</span>
                      <SentimentBadge s={n.sentiment} />
                      {n.orderValueCr != null && (
                        <span className="font-mono-num text-[11px] font-semibold text-marigold">
                          ₹{n.orderValueCr.toLocaleString("en-IN")} cr
                        </span>
                      )}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </Card>
        <p className="text-center text-[10.5px] text-dim/60">Year context: {yearCandles.length} weekly bars loaded.</p>
      </div>
    </div>
  );
}
