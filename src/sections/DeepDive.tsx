import { useEffect, useState } from "react";
import { X, ExternalLink, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { NewsItem } from "@/lib/types";
import { getScreenerData } from "@/lib/screener";
import { computeResearchScore, priceContext, newsSkewFor, type ResearchScore } from "@/lib/research";
import { ENTITIES } from "@/lib/entities";
import { Card, CardHeader, EmptyState, SkeletonRows } from "@/components/primitives";
import { fmtNum, relTime } from "@/lib/format";

const DIM_COLOR: Record<string, string> = {
  moat: "var(--accent)",
  management: "var(--bull)",
  financials: "var(--spec)",
  valuation: "var(--gold)",
};

// "Jun 2025" → "Jun 25" (keep the year — slice(0,6) mangled it to "Jun 20")
function shortPeriod(label: string | undefined): string {
  if (!label) return "";
  const m = label.match(/^([A-Za-z]{3})\s*(\d{4})$/);
  if (m) return `${m[1]} ${m[2].slice(2)}`;
  return label.length > 8 ? label.slice(0, 8) : label;
}

function MiniBars({ values, labels, color = "var(--accent)", height = 90 }: { values: (number | null)[]; labels?: string[]; color?: string; height?: number }) {
  const nums = values.map((v) => v ?? 0);
  const max = Math.max(1, ...nums.map(Math.abs));
  return (
    <div className="flex items-end gap-1.5" style={{ height }}>
      {nums.map((v, i) => (
        <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1">
          <span className="font-mono-num text-[8.5px] text-dim">{v !== 0 ? fmtNum(v, 0) : ""}</span>
          <div
            className="w-full rounded-t-sm"
            style={{
              height: `${Math.max(v !== 0 ? 6 : 2, (Math.abs(v) / max) * 62)}px`,
              backgroundColor: v >= 0 ? color : "var(--bear)",
              opacity: 0.85,
            }}
          />
          {labels && <span className="font-mono-num text-[8px] text-dim/70">{shortPeriod(labels[i])}</span>}
        </div>
      ))}
    </div>
  );
}

function Section({ eyebrow, children }: { eyebrow: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="section-eyebrow mb-2">{eyebrow}</p>
      {children}
    </div>
  );
}

export function DeepDive({ ticker, corpus, onClose }: { ticker: string; corpus: NewsItem[]; onClose: () => void }) {
  const [score, setScore] = useState<ResearchScore | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const entity = ENTITIES.find((e) => e.ticker === ticker);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setScore(null);
    (async () => {
      try {
        const data = await getScreenerData(ticker);
        const ctx = await priceContext(ticker);
        if (cancelled) return;
        setScore(computeResearchScore(data, { ...ctx, newsSkew: newsSkewFor(ticker, corpus) }));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ticker, corpus]);

  const related = corpus.filter((n) => n.tickers.includes(ticker)).slice(0, 8);
  const d = score?.data;
  const f = score?.funda;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-arthabg" role="dialog" aria-label={`${ticker} research`}>
      {/* header */}
      <div className="sticky top-0 z-10 border-b border-hairline bg-panel/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="section-eyebrow">Kimi deep dive</p>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-2">
              <h1 className="font-mono-num text-[19px] font-bold text-ink">{ticker}</h1>
              <span className="truncate text-[12.5px] text-dim">
                {d?.name ?? entity?.name ?? ""} {entity ? `· ${entity.sector}` : ""}
              </span>
            </div>
          </div>
          {score && (
            <div className="text-right">
              <span
                className="font-mono-num text-[22px] font-bold"
                style={{ color: score.total >= 70 ? "var(--bull)" : score.total >= 55 ? "var(--accent)" : "var(--gold)" }}
              >
                {score.total}
              </span>
              <p className="text-[10.5px] text-dim">
                {"★".repeat(score.stars)} {score.rating}
              </p>
            </div>
          )}
          <button onClick={onClose} className="rounded-md border border-hairline p-2 text-dim hover:text-ink" aria-label="Close">
            <X size={15} />
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-5xl space-y-6 px-4 py-5 pb-16">
        {loading ? (
          <Card>
            <SkeletonRows rows={8} />
          </Card>
        ) : error || !score || !d || !f ? (
          <EmptyState
            title="Fundamentals for this company are unreachable right now."
            hint="Screener.in may be blocked through the current proxy routes — try again in a moment or from a different network."
          />
        ) : (
          <>
            {/* disclaimer */}
            <div className="flex items-start gap-2 rounded-lg border border-marigold/30 bg-marigold/5 px-3 py-2 text-[11px] leading-relaxed text-dim">
              <AlertTriangle size={13} className="mt-0.5 shrink-0 text-marigold" />
              Automated analysis by Kimi from public data — educational only, not investment advice. Verify with a
              SEBI-registered adviser. Sources:{" "}
              <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-marigold underline">
                Screener.in
              </a>
              , Yahoo Finance, terminal news corpus · {relTime(d.fetchedAt)}
            </div>

            {/* scorecard */}
            <Section eyebrow="Scorecard — 4 dimensions, 20 underlying signals">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {score.dimensions.map((dim) => (
                  <Card key={dim.key} className="p-3">
                    <div className="flex items-baseline justify-between">
                      <span className="text-[12px] font-semibold text-ink">{dim.label}</span>
                      <span className="font-mono-num text-[16px] font-bold" style={{ color: DIM_COLOR[dim.key] }}>
                        {dim.score}
                        <span className="text-[10px] text-dim">/25</span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-hairline">
                      <div className="h-1.5 rounded-full" style={{ width: `${(dim.score / 25) * 100}%`, backgroundColor: DIM_COLOR[dim.key] }} />
                    </div>
                    <ul className="mt-2 space-y-1">
                      {dim.reasons.slice(0, 3).map((r, i) => (
                        <li key={i} className="text-[10.5px] leading-snug text-dim">
                          · {r}
                        </li>
                      ))}
                    </ul>
                  </Card>
                ))}
              </div>
            </Section>

            {/* business model */}
            <Section eyebrow="How the company makes money">
              <Card className="p-4">
                {d.about ? (
                  <p className="text-[13px] leading-relaxed text-ink/90">{d.about}</p>
                ) : (
                  <p className="text-[12px] text-dim">
                    Business description unavailable from the source page. Sector: {entity?.sector ?? "—"}.
                  </p>
                )}
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    ["Market cap", f.marketCapCr != null ? `₹${fmtNum(f.marketCapCr, 0)} cr` : "—"],
                    ["Revenue (latest FY)", f.yearlySales.length ? `₹${fmtNum(f.yearlySales.filter((v): v is number => v != null).slice(-1)[0] ?? 0, 0)} cr` : "—"],
                    ["Net profit (latest FY)", f.netProfitLatestCr != null ? `₹${fmtNum(f.netProfitLatestCr, 0)} cr` : "—"],
                    ["Operating margin", f.qOpmPct.filter((v): v is number => v != null).length ? `${fmtNum(f.qOpmPct.filter((v): v is number => v != null).slice(-1)[0]!, 1)}%` : "—"],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-md border border-hairline px-2.5 py-2">
                      <p className="text-[9.5px] uppercase tracking-wider text-dim">{k}</p>
                      <p className="font-mono-num mt-0.5 text-[13px] font-semibold text-ink">{v}</p>
                    </div>
                  ))}
                </div>
              </Card>
            </Section>

            {/* financials */}
            <Section eyebrow="Financials — quarterly trend">
              <div className="grid gap-3 lg:grid-cols-2">
                <Card>
                  <CardHeader title="Revenue (₹ cr)" sub={d.quarterly ? `${d.quarterly.headers.length} quarters` : "unavailable"} />
                  <div className="p-3">
                    {f.qSales.filter((v) => v != null).length >= 4 ? (
                      <MiniBars values={f.qSales.slice(-12)} labels={d.quarterly?.headers.slice(-12)} color="var(--accent)" />
                    ) : (
                      <EmptyState title="Quarterly revenue not parsed." />
                    )}
                  </div>
                </Card>
                <Card>
                  <CardHeader title="Net profit (₹ cr)" sub="green = profit · red = loss" />
                  <div className="p-3">
                    {f.qProfit.filter((v) => v != null).length >= 4 ? (
                      <MiniBars values={f.qProfit.slice(-12)} labels={d.quarterly?.headers.slice(-12)} color="var(--bull)" />
                    ) : (
                      <EmptyState title="Quarterly profit not parsed." />
                    )}
                  </div>
                </Card>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {[
                  ["ROE", f.roePct != null ? `${f.roePct}%` : "—"],
                  ["ROCE", f.rocePct != null ? `${f.rocePct}%` : "—"],
                  ["Debt/equity", f.debtToEquity != null ? f.debtToEquity.toFixed(2) : "—"],
                  ["OCF/Profit", f.ocfToProfit != null ? `${f.ocfToProfit.toFixed(2)}×` : "—"],
                  ["3Y profit CAGR", f.profitCagr3y != null ? `${f.profitCagr3y}%` : "—"],
                  ["3Y sales CAGR", f.salesCagr3y != null ? `${f.salesCagr3y}%` : "—"],
                ].map(([k, v]) => (
                  <Card key={k} className="px-2.5 py-2">
                    <p className="text-[9.5px] uppercase tracking-wider text-dim">{k}</p>
                    <p className="font-mono-num mt-0.5 text-[13px] font-semibold text-ink">{v}</p>
                  </Card>
                ))}
              </div>
            </Section>

            {/* competitors */}
            <Section eyebrow="Competitors — peer comparison">
              <Card>
                {!d.peers || d.peers.rows.length === 0 ? (
                  <EmptyState title="Peer table unavailable." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[11.5px]">
                      <thead>
                        <tr className="border-b border-hairline text-[10px] uppercase tracking-wider text-dim">
                          <th className="px-3 py-2 font-semibold">Company</th>
                          {d.peers.headers.slice(0, 7).map((h) => (
                            <th key={h} className="px-3 py-2 font-semibold">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {d.peers.rows.map((r, i) => (
                          <tr key={i} className={`border-b border-hairline/50 last:border-0 ${i === 0 ? "bg-marigold/5" : ""}`}>
                            <td className="max-w-[180px] truncate px-3 py-2 font-medium text-ink">
                              {i === 0 && <span className="mr-1 text-marigold">▸</span>}
                              {r.name}
                            </td>
                            {d.peers!.headers.slice(0, 7).map((h) => (
                              <td key={h} className="font-mono-num px-3 py-2 text-dim">
                                {r.metrics[h] ?? "—"}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </Section>

            {/* bull vs bear */}
            <Section eyebrow="The case for vs the case against">
              <div className="grid gap-3 md:grid-cols-2">
                <Card>
                  <CardHeader title="Bull case" sub="from data & filings" />
                  <ul className="space-y-2 px-4 py-3">
                    {[...d.pros, ...score.dimensions.flatMap((x) => x.reasons).filter((r) => !d.pros.some((p) => r.includes(p.slice(0, 20))))]
                      .slice(0, 7)
                      .map((p, i) => (
                        <li key={i} className="flex gap-2 text-[12px] leading-snug text-ink/90">
                          <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-bull" />
                          {p}
                        </li>
                      ))}
                  </ul>
                </Card>
                <Card>
                  <CardHeader title="Bear case / risks" sub="read before the bull case" />
                  {d.cons.length === 0 && score.total >= 55 ? (
                    <ul className="space-y-2 px-4 py-3">
                      <li className="flex gap-2 text-[12px] leading-snug text-ink/90">
                        <AlertTriangle size={13} className="mt-0.5 shrink-0 text-bear" />
                        No structural red flags in the parsed data — the main risks are valuation cycles and sector
                        headwinds. Verify independently.
                      </li>
                    </ul>
                  ) : (
                    <ul className="space-y-2 px-4 py-3">
                      {d.cons.slice(0, 7).map((c, i) => (
                        <li key={i} className="flex gap-2 text-[12px] leading-snug text-ink/90">
                          <AlertTriangle size={13} className="mt-0.5 shrink-0 text-bear" />
                          {c}
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>
            </Section>

            {/* context signals */}
            <Section eyebrow="Live context from this terminal">
              <Card className="grid gap-2 p-4 sm:grid-cols-3">
                <div className="flex items-center gap-2">
                  {score.aboveDma200 == null ? (
                    <span className="text-[11.5px] text-dim">Trend: unavailable</span>
                  ) : (
                    <>
                      {score.aboveDma200 ? <TrendingUp size={15} className="text-bull" /> : <TrendingDown size={15} className="text-bear" />}
                      <span className="text-[11.5px] text-ink">
                        Price {score.aboveDma200 ? "above" : "below"} long-term average
                        {score.momentum6mPct != null && (
                          <span className="font-mono-num ml-1 text-dim">
                            ({score.momentum6mPct >= 0 ? "+" : ""}
                            {score.momentum6mPct.toFixed(0)}% / 6M)
                          </span>
                        )}
                      </span>
                    </>
                  )}
                </div>
                <div className="text-[11.5px] text-ink">
                  News tone:{" "}
                  {score.newsSkew == null ? (
                    <span className="text-dim">insufficient coverage</span>
                  ) : (
                    <span className={score.newsSkew >= 0 ? "text-bull" : "text-bear"}>
                      net {score.newsSkew >= 0 ? "+" : ""}
                      {score.newsSkew} bullish
                    </span>
                  )}
                </div>
                <div className="text-[11.5px] text-ink">
                  Promoter holding:{" "}
                  <span className="font-mono-num">{f.promoterHolding != null ? `${f.promoterHolding}%` : "—"}</span>
                  {f.pledgedPct != null && f.pledgedPct > 0.5 && <span className="ml-1 text-bear">(pledged {f.pledgedPct}%)</span>}
                </div>
              </Card>
              {related.length > 0 && (
                <Card className="mt-3">
                  <CardHeader title="Latest coverage" sub={`${related.length} stories in corpus`} />
                  {related.map((n) => (
                    <a
                      key={n.id}
                      href={n.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2.5 border-b border-hairline/50 px-4 py-2 text-[12px] last:border-0 hover:bg-panel/60"
                    >
                      <span className="font-mono-num w-12 shrink-0 text-[10px] text-dim">{relTime(n.publishedAt)}</span>
                      <span className="min-w-0 flex-1 truncate text-ink">{n.title}</span>
                      <ExternalLink size={10} className="shrink-0 text-dim/50" />
                    </a>
                  ))}
                </Card>
              )}
            </Section>

            {/* verdict */}
            <Section eyebrow="Kimi's verdict">
              <Card className="border-l-2 p-4" >
                <p className="text-[13.5px] leading-relaxed text-ink">
                  <strong style={{ color: score.total >= 70 ? "var(--bull)" : score.total >= 55 ? "var(--accent)" : "var(--gold)" }}>
                    {"★".repeat(score.stars)} {score.rating} ({score.total}/100).
                  </strong>{" "}
                  {score.total >= 70
                    ? `${d.name} screens as a high-quality business on the fundamentals measured — strong ${score.dimensions.sort((a, b) => b.score - a.score)[0].label.toLowerCase()} is the standout. Worth deep independent research; the score says nothing about tomorrow's price.`
                    : score.total >= 55
                      ? `${d.name} is a mixed case — real strengths alongside visible weaknesses (see bear case). Position sizing and entry price matter more than usual here.`
                      : `${d.name} does not clear the bar on this framework right now. That can change with results — but on current public data, capital may work harder elsewhere.`}
                </p>
                <p className="mt-2 text-[10.5px] leading-relaxed text-dim">
                  Framework: automated Buffett/Graham-style scorecard (moat, management, financials, valuation) over
                  Screener.in data. It cannot see fraud, pending regulation, or management intent. Educational only —
                  not a recommendation to buy or sell.
                </p>
              </Card>
            </Section>
          </>
        )}
      </div>
    </div>
  );
}
