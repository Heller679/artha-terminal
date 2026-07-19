import { RefreshCw, Moon, Sun, Search } from "lucide-react";
import { useNow } from "@/hooks/useAutoRefresh";
import { istTime } from "@/lib/format";
import { marketStatus } from "@/lib/quotes";

export function Header({
  lastOk,
  refreshing,
  onRefresh,
  theme,
  onToggleTheme,
  onOpenPalette,
  demo,
  onToggleDemo,
  hasData,
}: {
  lastOk: number | null;
  refreshing: boolean;
  onRefresh: () => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onOpenPalette: () => void;
  demo: boolean;
  onToggleDemo: () => void;
  hasData: boolean;
}) {
  const now = useNow(1000);
  const mkt = marketStatus();

  return (
    <header className="relative border-b border-hairline bg-panel">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-3 py-2 md:px-5">
        {/* masthead */}
        <div className="relative flex items-baseline gap-2 select-none">
          <span
            aria-hidden
            className="font-display pointer-events-none absolute -left-1 -top-4 text-[52px] leading-none opacity-[0.06]"
          >
            अर्थ
          </span>
          <div>
            <div className="font-display text-[24px] leading-none tracking-wide text-ink">
              ARTHA <span className="text-marigold">TERMINAL</span>
            </div>
            <div className="mt-[3px] h-[2px] w-full bg-marigold" />
          </div>
        </div>

        {/* live status + actions */}
        <div className="flex items-center gap-2 md:gap-3">
          <button
            onClick={onOpenPalette}
            className="hidden items-center gap-2 rounded-md border border-hairline bg-surface px-2.5 py-1.5 text-[11.5px] text-dim hover:border-marigold/50 hover:text-ink md:flex"
          >
            <Search size={12} />
            <span>Jump to…</span>
            <kbd className="font-mono-num rounded bg-hairline px-1 text-[9.5px]">⌘K</kbd>
          </button>

          <div className="flex items-center gap-2 rounded-md border border-hairline bg-surface px-2.5 py-1.5">
            <span className={`live-dot inline-block h-[7px] w-[7px] rounded-full ${lastOk ? "bg-bull" : "bg-dim"}`} />
            <span className="font-mono-num text-[11px] font-medium text-ink">
              {lastOk ? (
                <>
                  LIVE <span className="text-dim">·</span> Updated {istTime(lastOk)} IST
                </>
              ) : (
                <>
                  {hasData ? "Refreshing" : "Connecting"} <span className="text-dim">·</span> {istTime(now)} IST
                </>
              )}
            </span>
          </div>

          <span
            className={`hidden rounded-md border px-2 py-1.5 text-[10.5px] font-medium lg:inline ${
              mkt.open ? "border-bull/30 text-bull" : "border-hairline text-dim"
            }`}
          >
            {mkt.label}
          </span>

          <button
            onClick={onRefresh}
            title="Refresh all data (R)"
            className="flex items-center gap-1.5 rounded-md border border-hairline bg-surface px-2.5 py-1.5 text-[11.5px] font-medium text-ink hover:border-marigold/60"
          >
            <RefreshCw size={13} className={refreshing ? "spin-refresh" : ""} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            onClick={onToggleDemo}
            title="Demo mode — sample stories for design evaluation, clearly badged"
            className={`rounded-md border px-2 py-1.5 text-[10.5px] font-bold uppercase tracking-wider ${
              demo ? "border-marigold bg-marigold/20 text-marigold" : "border-hairline text-dim hover:text-ink"
            }`}
          >
            Demo
          </button>

          <button
            onClick={onToggleTheme}
            title="Toggle theme"
            className="rounded-md border border-hairline bg-surface p-2 text-dim hover:text-ink"
          >
            {theme === "dark" ? <Sun size={13} /> : <Moon size={13} />}
          </button>
        </div>
      </div>
    </header>
  );
}
