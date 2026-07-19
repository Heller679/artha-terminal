import { useEffect, useRef, useState } from "react";
import type { Quote } from "@/lib/types";
import { fmtNum, fmtSigned } from "@/lib/format";
import { goldInrPer10g } from "@/lib/quotes";

function Chip({ label, value, changePct, decimals = 2, flashKey }: { label: string; value: string; changePct?: number; decimals?: number; flashKey: string | number }) {
  const up = (changePct ?? 0) > 0;
  const down = (changePct ?? 0) < 0;
  const [flash, setFlash] = useState<"" | "flash-bull" | "flash-bear">("");
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current !== value) {
      const dir = parseFloat(value.replace(/,/g, "")) > parseFloat(prev.current.replace(/,/g, ""));
      setFlash(dir ? "flash-bull" : "flash-bear");
      prev.current = value;
      const t = setTimeout(() => setFlash(""), 650);
      return () => clearTimeout(t);
    }
  }, [value, flashKey]);
  return (
    <span className={`inline-flex shrink-0 items-center gap-2 rounded px-2.5 py-1 transition-colors-150 ${flash}`}>
      <span className="text-[10.5px] font-semibold uppercase tracking-wider text-dim">{label}</span>
      <span className="font-mono-num text-[12.5px] font-medium text-ink">{value}</span>
      {changePct !== undefined && (
        <span className={`font-mono-num text-[11.5px] font-semibold ${up ? "text-bull" : down ? "text-bear" : "text-dim"}`}>
          {fmtSigned(changePct, decimals === 3 ? 2 : 2, "%")}
        </span>
      )}
    </span>
  );
}

export function TickerStrip({ quotes, asOf }: { quotes: Quote[]; asOf: number | null }) {
  const gold = goldInrPer10g(quotes);
  const items: { label: string; value: string; changePct?: number; decimals?: number }[] = quotes.map((q) => ({
    label: q.label,
    value: fmtNum(q.price, q.symbol === "INR=X" ? 3 : 2),
    changePct: q.changePct,
    decimals: q.symbol === "INR=X" ? 3 : 2,
  }));
  if (gold) {
    const gc = quotes.find((q) => q.symbol === "GC=F");
    items.splice(5, 0, {
      label: "GOLD ₹/10g*",
      value: `₹${fmtNum(gold, 0)}`,
      changePct: gc?.changePct,
    });
  }

  const content: { label: string; value: string; changePct?: number; decimals?: number }[] =
    items.length > 0 ? items : FALLBACK_LABELS.map((l) => ({ label: l, value: "—" }));

  return (
    <div className="relative overflow-hidden border-b border-hairline bg-panel" aria-live="polite">
      <div className="ticker-track flex w-max items-center py-1">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex items-center" aria-hidden={copy === 1}>
            {content.map((it, i) => (
              <span key={`${copy}-${i}`} className="flex items-center">
                <Chip label={it.label} value={it.value} changePct={it.changePct} decimals={it.decimals} flashKey={asOf ?? 0} />
                <span className="h-3 w-px bg-hairline" />
              </span>
            ))}
          </div>
        ))}
      </div>
      {items.length > 0 && (
        <span className="absolute bottom-0 right-2 top-0 hidden items-center text-[9.5px] text-dim/60 md:flex">
          *intl parity, excl. duty & GST
        </span>
      )}
    </div>
  );
}

const FALLBACK_LABELS = ["NIFTY 50", "SENSEX", "BANK NIFTY", "INDIA VIX", "USD/INR", "GOLD", "BRENT", "US 10Y"];
