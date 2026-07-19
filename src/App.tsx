import { useCallback, useEffect, useMemo, useState } from "react";
import { Header } from "@/sections/Header";
import { TickerStrip } from "@/sections/TickerStrip";
import { NewsFeed } from "@/sections/NewsFeed";
import { ChanakyaWatch } from "@/sections/Chanakya";
import { CalendarView } from "@/sections/CalendarView";
import { WatchlistView } from "@/sections/WatchlistView";
import { CommandPalette, type View } from "@/sections/CommandPalette";
import { LeftRail, MobileNav, Footer } from "@/sections/Chrome";
import {
  FiiDiiCard,
  VixCard,
  CommoditiesCard,
  RatesCard,
  SectorHeatmapCard,
  IpoCard,
  CalendarMini,
  SourceHealthCard,
} from "@/sections/Toolkit";
import { StockView } from "@/sections/StockView";
import { ResearchDesk } from "@/sections/ResearchDesk";
import { DeepDive } from "@/sections/DeepDive";
import { AlertsPanel } from "@/sections/AlertsPanel";
import { MoversView, ResultsView, SentimentView } from "@/sections/MarketsExtras";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWatchlist } from "@/hooks/useWatchlist";
import { getNews, getArchive, type NewsResult } from "@/lib/news";
import type { NewsItem } from "@/lib/types";
import { DEMO_STORIES } from "@/lib/demo";
import { getStale } from "@/lib/cache";
import type { QuotesResult, FiiDiiResult, SectorCell } from "@/lib/quotes";
import { getTickerQuotes, getFiiDii, getSectorHeatmap, getStockQuote } from "@/lib/quotes";
import { getMovers, type MoversResult } from "@/lib/movers";
import { evaluateNews, evaluateQuotes, getLog } from "@/lib/alerts";
import { updateSnapshots, type DaySentiment } from "@/lib/sentiment";
import { buildCalendar } from "@/lib/calendar";
import { todayIST } from "@/lib/format";

type MarketsTab = "overview" | "movers" | "results" | "sentiment";

function App() {
  const [view, setView] = useState<View>("feed");
  const [tickerFilter, setTickerFilter] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">(() =>
    document.documentElement.classList.contains("light") ? "light" : "dark",
  );
  const [demo, setDemo] = useState<boolean>(() => localStorage.getItem("artha.demo") === "1");
  useEffect(() => {
    localStorage.setItem("artha.demo", demo ? "1" : "0");
  }, [demo]);
  const [stockTicker, setStockTicker] = useState<string | null>(null);
  const [deepDiveTicker, setDeepDiveTicker] = useState<string | null>(null);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [unreadAlerts, setUnreadAlerts] = useState(() => getLog().filter((e) => !e.read).length);
  const [marketsTab, setMarketsTab] = useState<MarketsTab>("overview");
  const [sentSnaps, setSentSnaps] = useState<DaySentiment[]>([]);

  const wl = useWatchlist();

  // ---- data orchestration (auto-refresh contract) ----
  const news = useAutoRefresh((force) => getNews(force), 240_000, () => getStale<NewsResult>("news.v2")?.data ?? null);

  // if the first fetch comes back empty, retry every 60s until news lands
  const hasNews = (news.data?.items?.length ?? 0) > 0;
  useEffect(() => {
    if (hasNews || news.loading || news.refreshing) return;
    const t = setTimeout(() => news.refresh(), 60_000);
    return () => clearTimeout(t);
  }, [hasNews, news.loading, news.refreshing, news]);
  const quotes = useAutoRefresh((force) => getTickerQuotes(force), 60_000, () => getStale<QuotesResult>("quotes.ticker")?.data ?? null);
  const fiidii = useAutoRefresh((force) => getFiiDii(force), 15 * 60_000, () => {
    const s = getStale<FiiDiiResult>("eod.fiidii");
    return s && s.data.reachable ? s.data : null;
  });
  const sectors = useAutoRefresh(
    (force) => getSectorHeatmap(force),
    120_000,
    () => getStale<{ cells: SectorCell[]; fetchedAt: number }>("quotes.sectors")?.data ?? null,
  );
  // movers are heavy (54 quote requests) — only fetch when the user actually
  // opens the Markets view, so they never starve news/research at startup
  const moversEnabled = view === "markets";
  const movers = useAutoRefresh(
    (force) => (moversEnabled ? getMovers(force) : Promise.resolve(getStale<MoversResult>("quotes.movers.v1")?.data ?? null) as Promise<MoversResult | null>),
    5 * 60_000,
    () => getStale<MoversResult>("quotes.movers.v1")?.data ?? null,
  );
  useEffect(() => {
    if (moversEnabled) movers.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moversEnabled]);

  const refreshAll = useCallback(async () => {
    await Promise.allSettled([news.refresh(), quotes.refresh(), fiidii.refresh(), sectors.refresh(), movers.refresh()]);
  }, [news, quotes, fiidii, sectors, movers]);

  const lastOk = useMemo(() => {
    const times = [news.lastOk, quotes.lastOk].filter((x): x is number => x != null);
    return times.length ? Math.max(...times) : null;
  }, [news.lastOk, quotes.lastOk]);
  const refreshing = news.refreshing || quotes.refreshing;

  // ---- keyboard: ⌘K palette, R refresh ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      } else if (e.key.toLowerCase() === "r" && tag !== "INPUT" && tag !== "TEXTAREA" && !e.metaKey && !e.ctrlKey) {
        refreshAll();
      } else if (e.key === "Escape") {
        setPaletteOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [refreshAll]);

  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const liveItems = news.data?.items ?? [];
  const items = demo ? DEMO_STORIES : liveItems;
  const newsFetchError =
    liveItems.length === 0 && news.data
      ? news.data.statuses.filter((s) => !s.ok && s.error).length > 0
        ? `Last attempt — ${news.data.statuses
            .filter((s) => !s.ok && s.error)
            .slice(0, 2)
            .map((s) => s.error)
            .join(" · ")}`
        : news.error
      : null;
  const goldDriver = useMemo(
    () => items.filter((i) => i.category === "gold-commodities").sort((a, b) => b.publishedAt - a.publishedAt)[0] ?? null,
    [items],
  );
  const events = useMemo(() => buildCalendar(todayIST(), 30), []);

  // ---- alerts + sentiment snapshots on fresh news ----
  useEffect(() => {
    if (liveItems.length === 0) return;
    const log = evaluateNews(liveItems, wl.watchlist);
    setUnreadAlerts(log.filter((e) => !e.read).length);
    setSentSnaps(updateSnapshots(liveItems));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [news.data?.fetchedAt]);

  // ---- watchlist price-move alerts ----
  useEffect(() => {
    if (wl.watchlist.length === 0) return;
    let cancelled = false;
    (async () => {
      const qs = [];
      for (const t of wl.watchlist.slice(0, 10)) {
        const q = await getStockQuote(t);
        if (q) qs.push(q);
      }
      if (!cancelled && qs.length > 0) {
        const log = evaluateQuotes(qs);
        setUnreadAlerts(log.filter((e) => !e.read).length);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotes.data?.fetchedAt, wl.watchlist]);

  const goTicker = (t: string) => {
    setStockTicker(t);
  };

  const filterFeedTo = (t: string) => {
    setStockTicker(null);
    setTickerFilter(t);
    setView("feed");
    window.scrollTo({ top: 0 });
  };

  const toolkitCards = (
    <>
      <FiiDiiCard data={fiidii.data} loading={fiidii.loading} />
      <VixCard quotes={quotes.data?.quotes ?? []} />
      <CommoditiesCard quotes={quotes.data?.quotes ?? []} goldDriver={goldDriver} />
      <RatesCard quotes={quotes.data?.quotes ?? []} />
      <SectorHeatmapCard
        cells={sectors.data?.cells ?? []}
        onSector={() => {
          setView("feed");
        }}
      />
      <IpoCard items={items} />
      <CalendarMini events={events} />
      <SourceHealthCard statuses={news.data?.statuses ?? []} />
    </>
  );

  return (
    <div className="flex min-h-full flex-col bg-arthabg text-ink">
      <Header
        lastOk={lastOk}
        refreshing={refreshing}
        onRefresh={refreshAll}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
        onOpenPalette={() => setPaletteOpen(true)}
        demo={demo}
        onToggleDemo={() => setDemo((d) => !d)}
        hasData={items.length > 0 || (quotes.data?.quotes?.length ?? 0) > 0}
      />
      <TickerStrip quotes={quotes.data?.quotes ?? []} asOf={quotes.data?.fetchedAt ?? null} />
      {demo && (
        <div className="border-b border-marigold/40 bg-marigold/10 px-4 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wider text-marigold">
          Demo data — sample stories for design evaluation · not live · toggle “Demo” to return to live feeds
        </div>
      )}

      <div className="mx-auto flex w-full max-w-[1600px] flex-1">
        <LeftRail view={view} onNavigate={setView} watchlist={wl.watchlist} onTicker={goTicker} />

        <main className="min-w-0 flex-1 pb-16 lg:pb-0">
          {view === "feed" && (
            <NewsFeed
              items={items}
              loading={news.loading}
              refreshing={news.refreshing}
              watchlist={wl.watchlist}
              tickerFilter={tickerFilter}
              onTickerFilter={setTickerFilter}
              fetchError={newsFetchError}
              onRetry={news.refresh}
              onOpenStock={setStockTicker}
            />
          )}
          {view === "markets" && (
            <div className="p-3 md:p-5">
              <div className="mb-4 flex w-fit gap-1 rounded-lg border border-hairline bg-surface p-1">
                {(
                  [
                    ["overview", "Overview"],
                    ["movers", "Movers"],
                    ["results", "Results"],
                    ["sentiment", "Sentiment"],
                  ] as [MarketsTab, string][]
                ).map(([k, l]) => (
                  <button
                    key={k}
                    onClick={() => setMarketsTab(k)}
                    className={`rounded-md px-3 py-1.5 text-[12px] font-medium ${marketsTab === k ? "bg-marigold/15 text-marigold" : "text-dim hover:text-ink"}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
              {marketsTab === "overview" && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{toolkitCards}</div>}
              {marketsTab === "movers" && <MoversView data={movers.data} loading={movers.loading} onTicker={setStockTicker} />}
              {marketsTab === "results" && <ResultsView items={items} />}
              {marketsTab === "sentiment" && <SentimentView snaps={sentSnaps} />}
            </div>
          )}
          {view === "research" && (
            <ResearchDesk corpus={items} watchlist={wl.watchlist} onOpenDeepDive={setDeepDiveTicker} />
          )}
          {view === "chanakya" && (
            <ChanakyaWatch
              corpus={(() => {
                // live corpus + rolling evidence archive (deduped by id)
                const map = new Map<string, NewsItem>();
                for (const i of items) map.set(i.id, i);
                for (const a of getArchive()) if (!map.has(a.id)) map.set(a.id, a);
                return [...map.values()].sort((a, b) => b.publishedAt - a.publishedAt);
              })()}
              loading={news.loading}
            />
          )}
          {view === "calendar" && <CalendarView />}
          {view === "watchlist" && (
            <WatchlistView
              watchlist={wl.watchlist}
              add={wl.add}
              remove={wl.remove}
              importJson={wl.importJson}
              exportJson={wl.exportJson}
              news={items}
              onTickerClick={goTicker}
            />
          )}
        </main>

        {/* right rail — desktop feed view */}
        {view === "feed" && (
          <aside className="hidden w-[340px] shrink-0 border-l border-hairline xl:block">
            <div className="sticky top-0 max-h-[calc(100vh-96px)] space-y-3 overflow-y-auto p-3">{toolkitCards}</div>
          </aside>
        )}
      </div>

      <Footer />
      <MobileNav view={view} onNavigate={setView} />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNavigate={setView}
        onTicker={goTicker}
      />
      {stockTicker && !deepDiveTicker && (
        <StockView
          ticker={stockTicker}
          news={items}
          onClose={() => setStockTicker(null)}
          onFilterFeed={filterFeedTo}
          onResearch={(t) => setDeepDiveTicker(t)}
        />
      )}
      {deepDiveTicker && (
        <DeepDive
          ticker={deepDiveTicker}
          corpus={items}
          onClose={() => {
            setDeepDiveTicker(null);
          }}
        />
      )}
      {alertsOpen && <AlertsPanel onClose={() => setAlertsOpen(false)} onBadge={setUnreadAlerts} />}

      {/* alerts bell */}
      <button
        onClick={() => setAlertsOpen(true)}
        className="fixed bottom-20 right-4 z-40 rounded-full border border-hairline bg-panel p-3 shadow-lg hover:border-marigold/50 lg:bottom-6"
        aria-label="Alerts"
        title="Alerts"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unreadAlerts > 0 && (
          <span className="font-mono-num absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-bear px-1 text-[10px] font-bold text-white">
            {unreadAlerts > 9 ? "9+" : unreadAlerts}
          </span>
        )}
      </button>
    </div>
  );
}

export default App;
