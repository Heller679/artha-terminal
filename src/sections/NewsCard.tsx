import type { NewsItem } from "@/lib/types";
import { relTime, istDateTime } from "@/lib/format";
import { SentimentBadge, ImpactMeter, AssetGlyphs, CategoryChip } from "@/components/primitives";

export function NewsCard({
  item,
  compact,
  onTickerClick,
  watchlist,
  fresh,
}: {
  item: NewsItem;
  compact: boolean;
  onTickerClick: (t: string) => void;
  watchlist: string[];
  fresh?: boolean;
}) {
  const wl = item.tickers.some((t) => watchlist.includes(t));

  if (compact) {
    return (
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className={`group flex items-center gap-2.5 border-b border-hairline px-3 py-1.5 hover:bg-panel/70 ${fresh ? "fade-in-item" : ""}`}
      >
        <span className="font-mono-num w-[52px] shrink-0 text-[10.5px] text-dim">{relTime(item.publishedAt)}</span>
        <CategoryChip c={item.category} />
        <span className={`min-w-0 flex-1 truncate text-[12.5px] text-ink group-hover:text-marigold ${wl ? "font-semibold" : ""}`}>
          {item.title}
        </span>
        {item.orderValueCr != null && (
          <span className="font-mono-num shrink-0 text-[11px] font-semibold text-marigold">₹{item.orderValueCr.toLocaleString("en-IN")} cr</span>
        )}
        {item.tickers.slice(0, 2).map((t) => (
          <span key={t} className="font-mono-num shrink-0 rounded bg-hairline/50 px-1 text-[9.5px] text-dim">{t}</span>
        ))}
        <SentimentBadge s={item.sentiment} />
        <span className="hidden shrink-0 text-[10.5px] text-dim/70 sm:inline">{item.source}</span>
      </a>
    );
  }

  return (
    <article
      className={`border-b border-hairline px-4 py-3 transition-colors-150 hover:bg-panel/60 ${fresh ? "fade-in-item" : ""} ${
        item.isSpeculation ? "border-l-2 border-l-spec" : ""
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <CategoryChip c={item.category} />
        {item.isSpeculation && (
          <span className="rounded bg-spec/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-spec">
            Speculation
          </span>
        )}
        {item.demo && (
          <span className="rounded bg-marigold/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-marigold">
            Demo data
          </span>
        )}
        <span className="text-[11px] text-dim" title={istDateTime(item.publishedAt)}>
          {item.source} · {relTime(item.publishedAt)}
          {item.duplicateCount > 0 && <span className="ml-1 text-marigold">+{item.duplicateCount} sources</span>}
        </span>
        <span className="ml-auto flex items-center gap-2">
          <AssetGlyphs {...item.assetImpact} />
          <ImpactMeter score={item.impactScore} />
        </span>
      </div>

      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1.5 block text-[14.5px] font-semibold leading-snug text-ink hover:text-marigold"
      >
        {item.title}
      </a>

      <p className="mt-1 text-[12px] leading-relaxed text-dim">
        <span className="font-semibold text-dim/80">Why it matters — </span>
        {item.whyItMatters}
      </p>

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {item.tickers.map((t) => (
          <button
            key={t}
            onClick={() => onTickerClick(t)}
            className={`font-mono-num rounded border px-1.5 py-0.5 text-[10.5px] font-semibold transition-colors-150 ${
              watchlist.includes(t)
                ? "border-marigold/50 bg-marigold/10 text-marigold"
                : "border-hairline text-dim hover:border-marigold/50 hover:text-marigold"
            }`}
            title={`Open ${t} — chart, stats, news`}
          >
            {t}
          </button>
        ))}
        {item.orderValueCr != null && (
          <span className="font-mono-num text-[11px] font-semibold text-marigold">
            ₹{item.orderValueCr.toLocaleString("en-IN")} cr
            {item.awardingBody && <span className="ml-1 font-normal text-dim">· {item.awardingBody}</span>}
          </span>
        )}
        <span className="ml-auto">
          <SentimentBadge s={item.sentiment} />
        </span>
      </div>
    </article>
  );
}
