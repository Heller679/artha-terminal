import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import type { NewsItem } from "@/lib/types";
import { NewsCard } from "./NewsCard";
import { Card, EmptyState, SkeletonRows, CategoryChip, SentimentBadge, ImpactMeter } from "@/components/primitives";
import { relTime, istDateTime } from "@/lib/format";
import { SECTORS } from "@/lib/entities";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "macro-policy", label: "Macro & Policy" },
  { key: "markets", label: "Markets" },
  { key: "gold-commodities", label: "Gold & Commodities" },
  { key: "stocks-corporate", label: "Corporate" },
  { key: "tenders-contracts", label: "Tenders & Contracts" },
  { key: "ipo", label: "IPO" },
  { key: "global-cues", label: "Global" },
  { key: "speculation", label: "Speculation" },
] as const;

export function NewsFeed({
  items,
  loading,
  refreshing,
  watchlist,
  tickerFilter,
  onTickerFilter,
  fetchError,
  onRetry,
  onOpenStock,
}: {
  items: NewsItem[];
  loading: boolean;
  refreshing: boolean;
  watchlist: string[];
  tickerFilter: string | null;
  onTickerFilter: (t: string | null) => void;
  fetchError: string | null;
  onRetry: () => void;
  onOpenStock: (t: string) => void;
}) {
  const [filter, setFilter] = useState<string>("all");
  const [minImpact, setMinImpact] = useState(1);
  const [search, setSearch] = useState("");
  const [wlOnly, setWlOnly] = useState(false);
  const [compact, setCompact] = useState(() => localStorage.getItem("artha.density") === "compact");
  const [sector, setSector] = useState<string | null>(null);

  // ---- new-stories pill (no layout shove) ----
  const [baselineIds, setBaselineIds] = useState<Set<string> | null>(null);
  const listTopRef = useRef<HTMLDivElement>(null);
  const [scrolledDown, setScrolledDown] = useState(false);

  useEffect(() => {
    if (baselineIds === null && items.length > 0) setBaselineIds(new Set(items.map((i) => i.id)));
  }, [items, baselineIds]);

  const newItems = useMemo(() => {
    if (!baselineIds) return [];
    return items.filter((i) => !baselineIds.has(i.id));
  }, [items, baselineIds]);

  useEffect(() => {
    // if user is at the top, accept new items immediately (they fade in)
    if (!scrolledDown && newItems.length > 0) {
      setBaselineIds(new Set(items.map((i) => i.id)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrolledDown, newItems.length]);

  useEffect(() => {
    const onScroll = () => setScrolledDown(window.scrollY > 300);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const acceptNew = () => {
    setBaselineIds(new Set(items.map((i) => i.id)));
    listTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    localStorage.setItem("artha.density", compact ? "compact" : "comfortable");
  }, [compact]);

  const filtered = useMemo(() => {
    let out = items;
    if (filter === "markets") out = out.filter((i) => i.category === "stocks-corporate" || i.category === "global-cues");
    else if (filter === "speculation") out = out.filter((i) => i.isSpeculation);
    else if (filter !== "all") out = out.filter((i) => i.category === filter);
    if (minImpact > 1) out = out.filter((i) => i.impactScore >= minImpact);
    if (sector) out = out.filter((i) => i.sectors.includes(sector));
    if (tickerFilter) out = out.filter((i) => i.tickers.includes(tickerFilter));
    if (wlOnly) out = out.filter((i) => i.tickers.some((t) => watchlist.includes(t)));
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter((i) => i.title.toLowerCase().includes(q) || i.source.toLowerCase().includes(q) || i.tickers.some((t) => t.toLowerCase().includes(q)));
    }
    return out;
  }, [items, filter, minImpact, search, wlOnly, tickerFilter, sector, watchlist]);

  const topStory = useMemo(() => {
    const sixH = Date.now() - 6 * 3_600_000;
    const cands = items.filter((i) => i.publishedAt > sixH && i.impactScore >= 3);
    return cands.sort((a, b) => b.impactScore - a.impactScore || b.publishedAt - a.publishedAt)[0];
  }, [items]);

  return (
    <div className="relative">
      {/* filter bar */}
      <div className="sticky top-0 z-20 border-b border-hairline bg-panel/95 backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-1 px-3 py-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-md px-2 py-1 text-[11.5px] font-medium transition-colors-150 ${
                filter === f.key
                  ? f.key === "speculation"
                    ? "bg-spec/20 text-spec"
                    : "bg-marigold/15 text-marigold"
                  : "text-dim hover:text-ink"
              }`}
            >
              {f.label}
            </button>
          ))}
          <span className="mx-1 hidden h-4 w-px bg-hairline sm:inline" />
          <label className="hidden items-center gap-1.5 text-[11px] text-dim sm:flex">
            Impact ≥{" "}
            <input
              type="range"
              min={1}
              max={5}
              value={minImpact}
              onChange={(e) => setMinImpact(Number(e.target.value))}
              className="h-1 w-16 accent-[var(--accent)]"
            />
            <span className="font-mono-num w-3 text-ink">{minImpact}</span>
          </label>
          <select
            value={sector ?? ""}
            onChange={(e) => setSector(e.target.value || null)}
            className="hidden rounded-md border border-hairline bg-surface px-1.5 py-1 text-[11px] text-dim md:block"
          >
            <option value="">All sectors</option>
            {SECTORS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search headlines…"
            className="min-w-[110px] flex-1 rounded-md border border-hairline bg-surface px-2 py-1 text-[11.5px] text-ink placeholder:text-dim/60 focus:border-marigold/60"
          />
          <button
            onClick={() => setWlOnly((v) => !v)}
            className={`rounded-md border px-2 py-1 text-[11px] font-medium ${wlOnly ? "border-marigold/60 bg-marigold/10 text-marigold" : "border-hairline text-dim"}`}
          >
            ★ Watchlist
          </button>
          <button
            onClick={() => setCompact((v) => !v)}
            className="rounded-md border border-hairline px-2 py-1 text-[11px] text-dim hover:text-ink"
            title="Toggle density"
          >
            {compact ? "Comfortable" : "Compact"}
          </button>
        </div>
        {tickerFilter && (
          <div className="flex items-center gap-2 border-t border-hairline bg-marigold/5 px-3 py-1.5 text-[11.5px]">
            <span className="text-dim">Filtered to</span>
            <span className="font-mono-num rounded bg-marigold/15 px-1.5 py-0.5 font-semibold text-marigold">{tickerFilter}</span>
            <button onClick={() => onTickerFilter(null)} className="ml-auto text-dim hover:text-ink">
              ✕ clear
            </button>
          </div>
        )}
      </div>

      <div ref={listTopRef} />

      {/* new stories pill */}
      {newItems.length > 0 && scrolledDown && (
        <button
          onClick={acceptNew}
          aria-live="polite"
          className="fade-in-item fixed bottom-20 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-marigold px-3.5 py-2 text-[12px] font-semibold text-black shadow-lg md:bottom-6"
        >
          <ArrowUp size={13} /> {newItems.length} new {newItems.length === 1 ? "story" : "stories"}
        </button>
      )}

      {/* top story */}
      {topStory && !compact && filter === "all" && !search && !tickerFilter && (
        <a
          href={topStory.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block border-b border-hairline bg-panel/40 px-4 py-4 hover:bg-panel/70"
        >
          <div className="flex items-center gap-2">
            <CategoryChip c={topStory.category} />
            <span className="section-eyebrow">Top story · last 6h</span>
            <span className="ml-auto text-[11px] text-dim" title={istDateTime(topStory.publishedAt)}>
              {topStory.source} · {relTime(topStory.publishedAt)}
            </span>
          </div>
          <h2 className="font-display mt-2 text-[26px] leading-[1.15] text-ink">{topStory.title}</h2>
          <p className="mt-2 max-w-3xl text-[12.5px] leading-relaxed text-dim">{topStory.whyItMatters}</p>
          <div className="mt-2 flex items-center gap-3">
            <SentimentBadge s={topStory.sentiment} />
            <ImpactMeter score={topStory.impactScore} />
          </div>
        </a>
      )}

      {/* list */}
      <Card className="rounded-none border-0">
        {loading && items.length === 0 ? (
          <SkeletonRows rows={8} />
        ) : filtered.length === 0 ? (
          items.length === 0 ? (
            <div className="mx-auto max-w-lg px-6 py-12 text-center">
              <p className="text-[15px] font-semibold text-ink">Live feeds not reachable from this network</p>
              <p className="mt-2 text-[12.5px] leading-relaxed text-dim">
                The terminal pulls public RSS feeds through free CORS-proxy routes. All routes failed just now — the
                usual causes:
              </p>
              <ul className="mt-3 space-y-1.5 text-left text-[12px] leading-relaxed text-dim">
                <li className="flex gap-2">
                  <span className="text-marigold">1.</span>
                  <span>
                    <strong className="text-ink">Ad-blocker or tracking protection</strong> (uBlock, Brave Shields,
                    AdGuard, Pi-hole) — these often block proxy domains. Whitelist this site and it works instantly.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-marigold">2.</span>
                  <span>
                    <strong className="text-ink">Corporate firewall / strict ISP or VPN</strong> — try a mobile hotspot
                    or a different network.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-marigold">3.</span>
                  <span>
                    <strong className="text-ink">Free proxies momentarily rate-limited</strong> — the terminal retries
                    automatically every 60 seconds until news lands.
                  </span>
                </li>
              </ul>
              {fetchError && (
                <p className="font-mono-num mt-3 rounded-md border border-hairline bg-panel px-2.5 py-1.5 text-[10px] text-dim/70">
                  {fetchError}
                </p>
              )}
              <button
                onClick={onRetry}
                disabled={refreshing}
                className="mt-4 rounded-md bg-marigold px-5 py-2 text-[12.5px] font-semibold text-black hover:brightness-110 disabled:opacity-50"
              >
                {refreshing ? "Retrying…" : "Retry now"}
              </button>
            </div>
          ) : (
            <EmptyState title="No stories match these filters." hint="Try widening the impact slider or clearing the search." />
          )
        ) : (
          <div className={refreshing ? "opacity-80 transition-opacity" : "transition-opacity"}>
            {filtered.slice(0, 120).map((item, idx) => (
              <NewsCard
                key={item.id}
                item={item}
                compact={compact}
                onTickerClick={onOpenStock}
                watchlist={watchlist}
                fresh={idx < 3 && !baselineIds?.has(item.id)}
              />
            ))}
            {filtered.length > 120 && (
              <p className="px-4 py-3 text-center text-[11.5px] text-dim">
                Showing latest 120 of {filtered.length} — refine filters to narrow.
              </p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
