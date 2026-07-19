import { useEffect, useState } from "react";
import { Star, Download, Upload, X } from "lucide-react";
import type { NewsItem, Quote } from "@/lib/types";
import { getStockQuote } from "@/lib/quotes";
import { Card, CardHeader, EmptyState } from "@/components/primitives";
import { fmtNum, fmtSigned } from "@/lib/format";
import { NewsCard } from "./NewsCard";

export function WatchlistView({
  watchlist,
  add,
  remove,
  importJson,
  exportJson,
  news,
  onTickerClick,
}: {
  watchlist: string[];
  add: (t: string) => void;
  remove: (t: string) => void;
  importJson: (j: string) => boolean;
  exportJson: () => string;
  news: NewsItem[];
  onTickerClick: (t: string) => void;
}) {
  const [input, setInput] = useState("");
  const [quotes, setQuotes] = useState<Record<string, Quote | null>>({});
  const [ioMsg, setIoMsg] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const out: Record<string, Quote | null> = {};
      for (const t of watchlist.slice(0, 12)) {
        out[t] = await getStockQuote(t);
      }
      if (!cancelled) setQuotes(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [watchlist]);

  const pinned = news.filter((n) => n.tickers.some((t) => watchlist.includes(t)));

  return (
    <div className="grid gap-4 p-3 md:grid-cols-[340px_1fr] md:p-5">
      <div>
        <Card>
          <CardHeader title="Watchlist" sub="Persisted locally · quotes via Yahoo" />
          <div className="flex gap-1.5 px-3.5 py-2.5">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && input.trim()) {
                  add(input);
                  setInput("");
                }
              }}
              placeholder="Add ticker, e.g. HAL"
              className="min-w-0 flex-1 rounded-md border border-hairline bg-panel px-2 py-1.5 font-mono-num text-[12px] uppercase text-ink placeholder:normal-case placeholder:text-dim/60"
            />
            <button
              onClick={() => {
                if (input.trim()) {
                  add(input);
                  setInput("");
                }
              }}
              className="rounded-md bg-marigold px-3 text-[12px] font-semibold text-black"
            >
              Add
            </button>
          </div>
          {watchlist.length === 0 ? (
            <EmptyState title="Watchlist is empty." hint="Add NSE tickers to pin their news and quotes." />
          ) : (
            <div>
              {watchlist.map((t) => {
                const q = quotes[t];
                return (
                  <div key={t} className="flex items-center gap-2 border-b border-hairline/60 px-3.5 py-2 last:border-0">
                    <Star size={12} className="shrink-0 fill-[var(--accent)] text-marigold" />
                    <button onClick={() => onTickerClick(t)} className="font-mono-num text-[12.5px] font-semibold text-ink hover:text-marigold">
                      {t}
                    </button>
                    <span className="ml-auto text-right">
                      {q === undefined ? (
                        <span className="text-[10.5px] text-dim">…</span>
                      ) : q === null ? (
                        <span className="text-[10.5px] text-dim">quote n/a</span>
                      ) : (
                        <>
                          <span className="font-mono-num text-[12px] text-ink">₹{fmtNum(q.price)}</span>
                          <span className={`font-mono-num ml-2 text-[11px] ${q.changePct >= 0 ? "text-bull" : "text-bear"}`}>
                            {fmtSigned(q.changePct, 2, "%")}
                          </span>
                        </>
                      )}
                    </span>
                    <button onClick={() => remove(t)} className="text-dim hover:text-bear">
                      <X size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex gap-1.5 border-t border-hairline px-3.5 py-2">
            <button
              onClick={() => {
                navigator.clipboard.writeText(exportJson());
                setIoMsg("Copied JSON to clipboard.");
              }}
              className="flex items-center gap-1 rounded-md border border-hairline px-2 py-1 text-[11px] text-dim hover:text-ink"
            >
              <Download size={11} /> Export
            </button>
            <button
              onClick={async () => {
                const text = await navigator.clipboard.readText().catch(() => "");
                setIoMsg(text && importJson(text) ? "Imported." : "Clipboard has no valid watchlist JSON.");
              }}
              className="flex items-center gap-1 rounded-md border border-hairline px-2 py-1 text-[11px] text-dim hover:text-ink"
            >
              <Upload size={11} /> Import
            </button>
            {ioMsg && <span className="ml-1 self-center text-[10.5px] text-dim">{ioMsg}</span>}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Pinned news" sub={`${pinned.length} stories matching your watchlist`} />
        {pinned.length === 0 ? (
          <EmptyState
            title="No watchlist stories in the current corpus."
            hint="As feeds refresh through the day, matching headlines pin here automatically."
          />
        ) : (
          <div>
            {pinned.slice(0, 40).map((item) => (
              <NewsCard key={item.id} item={item} compact={false} onTickerClick={onTickerClick} watchlist={watchlist} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
