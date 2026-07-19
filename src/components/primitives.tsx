import type { ReactNode } from "react";
import type { Sentiment } from "@/lib/types";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-[10px] border border-hairline bg-surface ${className}`}>{children}</div>
  );
}

export function CardHeader({ title, right, sub }: { title: string; right?: ReactNode; sub?: string }) {
  return (
    <div className="flex items-start justify-between gap-2 border-b border-hairline px-3.5 py-2.5">
      <div>
        <h3 className="text-[13px] font-semibold tracking-wide text-ink">{title}</h3>
        {sub && <p className="mt-0.5 text-[11px] text-dim">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="px-3.5 py-6 text-center">
      <p className="text-[13px] font-medium text-dim">{title}</p>
      {hint && <p className="mt-1 text-[11.5px] leading-relaxed text-dim/70">{hint}</p>}
    </div>
  );
}

export function SkeletonRows({ rows = 3, height = "h-4" }: { rows?: number; height?: string }) {
  return (
    <div className="space-y-2.5 px-3.5 py-3.5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={`skeleton ${height}`} style={{ width: `${88 - i * 12}%` }} />
      ))}
    </div>
  );
}

export function SentimentBadge({ s }: { s: Sentiment }) {
  if (s === "bullish")
    return (
      <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-bull">
        ▲ Bullish
      </span>
    );
  if (s === "bearish")
    return (
      <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-bear">
        ▼ Bearish
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-dim">
      ◆ Neutral
    </span>
  );
}

export function ImpactMeter({ score }: { score: number }) {
  return (
    <span className="inline-flex items-end gap-[2px]" title={`Impact ${score}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className="w-[3px] rounded-sm"
          style={{
            height: `${5 + i * 2}px`,
            backgroundColor: i <= score ? "var(--accent)" : "var(--line)",
          }}
        />
      ))}
    </span>
  );
}

// styled glyphs, not emoji
export function AssetGlyphs({ equity, gold, inr, bonds }: { equity: boolean; gold: boolean; inr: boolean; bonds: boolean }) {
  const items: { on: boolean; label: string; color: string; title: string }[] = [
    { on: equity, label: "EQ", color: "var(--bull)", title: "Equities" },
    { on: gold, label: "AU", color: "var(--gold)", title: "Gold" },
    { on: inr, label: "₹", color: "var(--accent)", title: "INR / FX" },
    { on: bonds, label: "10Y", color: "var(--spec)", title: "Bonds / rates" },
  ];
  return (
    <span className="inline-flex items-center gap-1">
      {items
        .filter((i) => i.on)
        .map((i) => (
          <span
            key={i.label}
            title={`Affects: ${i.title}`}
            className="font-mono-num rounded border px-1 text-[9px] font-semibold leading-[14px]"
            style={{ color: i.color, borderColor: `color-mix(in srgb, ${i.color} 40%, transparent)` }}
          >
            {i.label}
          </span>
        ))}
    </span>
  );
}

export const CATEGORY_LABEL: Record<string, string> = {
  "macro-policy": "Macro & Policy",
  "gold-commodities": "Gold & Commodities",
  "stocks-corporate": "Corporate",
  "tenders-contracts": "Tenders & Contracts",
  ipo: "IPO",
  "global-cues": "Global Cues",
  geopolitics: "Geopolitics",
};

export function CategoryChip({ c }: { c: string }) {
  const color =
    c === "tenders-contracts"
      ? "var(--accent)"
      : c === "gold-commodities"
        ? "var(--gold)"
        : c === "macro-policy"
          ? "var(--spec)"
          : "var(--muted)";
  return (
    <span
      className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
      style={{ color, backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)` }}
    >
      {CATEGORY_LABEL[c] ?? c}
    </span>
  );
}
