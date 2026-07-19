import { Rss, BarChart3, Eye, CalendarDays, Star, Telescope, Globe } from "lucide-react";
import type { View } from "./CommandPalette";

const NAV: { key: View; label: string; icon: typeof Rss }[] = [
  { key: "feed", label: "Feed", icon: Rss },
  { key: "global", label: "Global", icon: Globe },
  { key: "markets", label: "Markets", icon: BarChart3 },
  { key: "research", label: "Research", icon: Telescope },
  { key: "chanakya", label: "Chanakya", icon: Eye },
  { key: "calendar", label: "Calendar", icon: CalendarDays },
  { key: "watchlist", label: "Watchlist", icon: Star },
];

export function LeftRail({
  view,
  onNavigate,
  watchlist,
  onTicker,
}: {
  view: View;
  onNavigate: (v: View) => void;
  watchlist: string[];
  onTicker: (t: string) => void;
}) {
  return (
    <aside className="hidden w-[232px] shrink-0 border-r border-hairline lg:block">
      <nav className="sticky top-0 space-y-0.5 p-3">
        {NAV.map((n) => (
          <button
            key={n.key}
            onClick={() => onNavigate(n.key)}
            className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition-colors-150 ${
              view === n.key
                ? n.key === "chanakya"
                  ? "bg-spec/15 text-spec"
                  : "bg-marigold/15 text-marigold"
                : "text-dim hover:bg-panel hover:text-ink"
            }`}
          >
            <n.icon size={15} />
            {n.label}
          </button>
        ))}

        <div className="pt-5">
          <p className="section-eyebrow px-3 pb-2">Watchlist</p>
          {watchlist.length === 0 ? (
            <p className="px-3 text-[11px] text-dim">No tickers yet.</p>
          ) : (
            watchlist.slice(0, 10).map((t) => (
              <button
                key={t}
                onClick={() => onTicker(t)}
                className="font-mono-num block w-full rounded px-3 py-1 text-left text-[11.5px] text-dim hover:bg-panel hover:text-marigold"
              >
                ★ {t}
              </button>
            ))
          )}
        </div>

        <div className="px-3 pt-6">
          <p className="text-[10px] leading-relaxed text-dim/60">
            अर्थ · artha — wealth, purpose. Named for Kautilya's Arthashastra: economics and statecraft in one treatise.
          </p>
        </div>
      </nav>
    </aside>
  );
}

export function MobileNav({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 flex border-t border-hairline bg-panel lg:hidden">
      {NAV.map((n) => (
        <button
          key={n.key}
          onClick={() => onNavigate(n.key)}
          className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[9.5px] font-medium ${
            view === n.key ? (n.key === "chanakya" ? "text-spec" : "text-marigold") : "text-dim"
          }`}
        >
          <n.icon size={17} />
          {n.label}
        </button>
      ))}
    </nav>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-hairline bg-panel px-4 py-4 pb-20 lg:pb-4">
      <p className="mx-auto max-w-4xl text-center text-[10.5px] leading-relaxed text-dim/80">
        Artha Terminal is an information aggregator, not a SEBI-registered investment adviser or research analyst.
        Nothing here is investment advice. Market data may be delayed or inaccurate — verify with NSE/BSE before
        trading. Grey-market (GMP) figures are unofficial and unregulated. Chanakya Watch is speculative analysis based
        on cited public reporting; it measures alignment patterns, not wrongdoing. All headlines link to their
        original publishers.
      </p>
    </footer>
  );
}
