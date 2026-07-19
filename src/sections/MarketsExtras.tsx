import { useMemo } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import type { MoversResult } from "@/lib/movers";
import type { NewsItem } from "@/lib/types";
import { extractResults } from "@/lib/results";
import { sectorMomentum, netScore, type DaySentiment } from "@/lib/sentiment";
import { Card, CardHeader, EmptyState, SkeletonRows } from "@/components/primitives";
import { fmtNum, fmtSigned, relTime } from "@/lib/format";

// ---------- Movers ----------
export function MoversView({ data, loading, onTicker }: { data: MoversResult | null; loading: boolean; onTicker: (t: string) => void }) {
  if (loading && !data)
    return (
      <Card>
        <SkeletonRows rows={10} />
      </Card>
    );
  if (!data || data.movers.length === 0)
    return (
      <Card>
        <EmptyState title="Movers data unavailable." hint="Quotes are retried automatically — check Source health." />
      </Card>
    );
  const gainers = [...data.movers].sort((a, b) => b.changePct - a.changePct).slice(0, 10);
  const losers = [...data.movers].sort((a, b) => a.changePct - b.changePct).slice(0, 10);
  const total = data.advances + data.declines + data.unchanged || 1;

  const MoverRow = ({ m }: { m: (typeof gainers)[0] }) => (
    <button
      key={m.ticker}
      onClick={() => onTicker(m.ticker)}
      className="flex w-full items-center gap-2 border-b border-hairline/60 px-3.5 py-2 text-left last:border-0 hover:bg-panel/60"
    >
      <span className="font-mono-num w-20 shrink-0 text-[12px] font-semibold text-ink">{m.ticker}</span>
      <span className="min-w-0 flex-1 truncate text-[11px] text-dim">{m.name}</span>
      <span className="font-mono-num text-[11.5px] text-ink">₹{fmtNum(m.price, 0)}</span>
      <span className={`font-mono-num w-16 text-right text-[12px] font-semibold ${m.changePct >= 0 ? "text-bull" : "text-bear"}`}>
        {fmtSigned(m.changePct, 2, "%")}
      </span>
    </button>
  );

  return (
    <div className="space-y-4">
      {/* breadth bar */}
      <Card>
        <CardHeader title="Market breadth" sub={`${data.movers.length} liquid names · ${relTime(data.fetchedAt)}`} />
        <div className="px-4 py-3">
          <div className="flex h-3.5 overflow-hidden rounded-full">
            <div className="bg-bull" style={{ width: `${(data.advances / total) * 100}%` }} />
            <div className="bg-dim/40" style={{ width: `${(data.unchanged / total) * 100}%` }} />
            <div className="bg-bear" style={{ width: `${(data.declines / total) * 100}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-[11px]">
            <span className="text-bull">
              <TrendingUp size={11} className="mr-1 inline" />
              {data.advances} advancing
            </span>
            <span className="text-dim">{data.unchanged} flat</span>
            <span className="text-bear">
              {data.declines} declining
              <TrendingDown size={11} className="ml-1 inline" />
            </span>
          </div>
        </div>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title="Top gainers" />
          <div>{gainers.map((m) => <MoverRow key={m.ticker} m={m} />)}</div>
        </Card>
        <Card>
          <CardHeader title="Top losers" />
          <div>{losers.map((m) => <MoverRow key={m.ticker} m={m} />)}</div>
        </Card>
      </div>
    </div>
  );
}

// ---------- Results tracker ----------
const VERDICT_STYLE: Record<string, [string, string]> = {
  beat: ["BEAT", "var(--bull)"],
  miss: ["MISS", "var(--bear)"],
  inline: ["IN-LINE", "var(--accent)"],
  na: ["—", "var(--muted)"],
};

export function ResultsView({ items }: { items: NewsItem[] }) {
  const rows = useMemo(() => extractResults(items), [items]);
  if (rows.length === 0)
    return (
      <Card>
        <EmptyState
          title="No results reported in the current corpus."
          hint="During results season (Jan/Apr/Jul/Oct), earnings headlines are auto-extracted and verdict-tagged here."
        />
      </Card>
    );
  const beats = rows.filter((r) => r.verdict === "beat").length;
  const misses = rows.filter((r) => r.verdict === "miss").length;
  return (
    <Card>
      <CardHeader
        title="Results tracker"
        sub={`${rows.length} earnings reports detected · ${beats} beat / ${misses} miss`}
      />
      <div className="grid grid-cols-[4.5rem_1fr_5rem_5rem_4.5rem] items-center gap-2 border-b border-hairline px-3.5 py-2 text-[10px] font-semibold uppercase tracking-wider text-dim sm:grid-cols-[5rem_1fr_6rem_6rem_5rem_4.5rem]">
        <span>Company</span>
        <span>Headline</span>
        <span className="text-right">Profit</span>
        <span className="text-right">Δ YoY</span>
        <span className="hidden text-right sm:block">Qtr</span>
        <span className="text-right">Verdict</span>
      </div>
      {rows.map((r, i) => {
        const [label, color] = VERDICT_STYLE[r.verdict];
        return (
          <a
            key={i}
            href={r.url}
            target="_blank"
            rel="noopener noreferrer"
            className="grid grid-cols-[4.5rem_1fr_5rem_5rem_4.5rem] items-center gap-2 border-b border-hairline/60 px-3.5 py-2 last:border-0 hover:bg-panel/60 sm:grid-cols-[5rem_1fr_6rem_6rem_5rem_4.5rem]"
          >
            <span className="font-mono-num truncate text-[11.5px] font-semibold text-ink">{r.ticker ?? r.company.slice(0, 10)}</span>
            <span className="min-w-0">
              <span className="block truncate text-[12px] text-ink">{r.headline}</span>
              <span className="text-[10px] text-dim">{r.source} · {relTime(r.publishedAt)}</span>
            </span>
            <span className="font-mono-num text-right text-[11.5px] text-ink">
              {r.profitCr != null ? `₹${fmtNum(r.profitCr, 0)} cr` : "—"}
            </span>
            <span className={`font-mono-num text-right text-[11.5px] ${r.profitChgPct != null ? (r.profitChgPct >= 0 ? "text-bull" : "text-bear") : "text-dim"}`}>
              {r.profitChgPct != null ? fmtSigned(r.profitChgPct, 1, "%") : "—"}
            </span>
            <span className="font-mono-num hidden text-right text-[11px] text-dim sm:block">{r.quarter || "—"}</span>
            <span className="text-right">
              <span
                className="rounded px-1.5 py-0.5 text-[9.5px] font-bold"
                style={{ color, backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)` }}
              >
                {label}
              </span>
            </span>
          </a>
        );
      })}
    </Card>
  );
}

// ---------- Sentiment momentum ----------
export function SentimentView({ snaps }: { snaps: DaySentiment[] }) {
  const sectors = useMemo(() => sectorMomentum(snaps, 14), [snaps]);
  const daily = snaps.slice(-14);
  if (snaps.length === 0)
    return (
      <Card>
        <EmptyState title="Sentiment history is building." hint="A daily snapshot is stored each time you open the terminal — trends appear from day 2." />
      </Card>
    );
  const today = snaps[snaps.length - 1];
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Market tone"
          sub={`Net sentiment ${netScore(today) > 0 ? "+" : ""}${netScore(today)} today · ${today.bullish} bullish vs ${today.bearish} bearish stories`}
        />
        <div className="flex h-24 items-end gap-1 px-4 pb-3 pt-2">
          {daily.map((d) => {
            const s = netScore(d);
            const h = Math.min(100, Math.abs(s));
            return (
              <div key={d.date} className="flex flex-1 flex-col items-center justify-end gap-0.5" title={`${d.date}: net ${s}`}>
                <div
                  className="w-full rounded-t-sm"
                  style={{
                    height: `${Math.max(4, h)}%`,
                    backgroundColor: s >= 0 ? "var(--bull)" : "var(--bear)",
                    opacity: 0.35 + Math.min(0.65, Math.abs(s) / 100),
                  }}
                />
                <span className="font-mono-num text-[8px] text-dim/70">{d.date.slice(8)}</span>
              </div>
            );
          })}
        </div>
      </Card>
      <Card>
        <CardHeader title="Sector narrative momentum" sub="14-day bull/bear balance from headlines" />
        {sectors.length === 0 ? (
          <EmptyState title="No sector-tagged stories yet." />
        ) : (
          <div>
            {sectors.slice(0, 12).map((s) => (
              <div key={s.sector} className="flex items-center gap-3 border-b border-hairline/60 px-4 py-2.5 last:border-0">
                <span className="w-24 shrink-0 text-[12px] font-medium capitalize text-ink">{s.sector}</span>
                <div className="relative h-2 flex-1 rounded-full bg-hairline">
                  <div
                    className="absolute top-0 h-2 rounded-full"
                    style={{
                      left: s.score >= 0 ? "50%" : `${50 + s.score / 2}%`,
                      width: `${Math.abs(s.score) / 2}%`,
                      backgroundColor: s.score >= 0 ? "var(--bull)" : "var(--bear)",
                    }}
                  />
                  <div className="absolute left-1/2 top-[-3px] h-[14px] w-px bg-dim/40" />
                </div>
                <span className={`font-mono-num w-12 text-right text-[12px] font-semibold ${s.score >= 0 ? "text-bull" : "text-bear"}`}>
                  {s.score > 0 ? "+" : ""}
                  {s.score}
                </span>
                <span className="font-mono-num hidden w-20 text-right text-[10px] text-dim sm:block">
                  {s.bull}▲ {s.bear}▼
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
