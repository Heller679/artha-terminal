import type { Quote, NewsItem, CalendarEvent, FeedStatus } from "@/lib/types";
import type { FiiDiiResult, SectorCell } from "@/lib/quotes";
import { Card, CardHeader, EmptyState, SkeletonRows } from "@/components/primitives";
import { fmtNum, fmtSigned, relTime, todayIST } from "@/lib/format";
import { goldInrPer10g } from "@/lib/quotes";
import { daysUntil } from "@/lib/calendar";

function Row({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-hairline/60 px-3.5 py-2 last:border-0">
      <span className="text-[12px] text-dim">{label}</span>
      <span className="text-right">
        <span className="font-mono-num text-[13px] font-semibold" style={{ color: color ?? "var(--text)" }}>
          {value}
        </span>
        {sub && <span className="ml-1.5 text-[10.5px] text-dim">{sub}</span>}
      </span>
    </div>
  );
}

// ---------- FII / DII ----------
export function FiiDiiCard({ data, loading }: { data: FiiDiiResult | null; loading: boolean }) {
  return (
    <Card>
      <CardHeader title="FII / DII flows" sub="Cash market · ₹ crore" />
      {loading ? (
        <SkeletonRows rows={3} />
      ) : !data || !data.reachable ? (
        <EmptyState
          title="Figures not reachable from the browser."
          hint={data?.message ?? "NSE usually publishes today's numbers by ~6:30 PM IST."}
        />
      ) : (
        <div>
          <Row
            label={`FII net ${data.provisional ? "(prov.)" : ""}`}
            value={data.fiiNet != null ? fmtSigned(data.fiiNet, 0) : "—"}
            color={data.fiiNet != null ? (data.fiiNet >= 0 ? "var(--bull)" : "var(--bear)") : undefined}
          />
          <Row
            label={`DII net ${data.provisional ? "(prov.)" : ""}`}
            value={data.diiNet != null ? fmtSigned(data.diiNet, 0) : "—"}
            color={data.diiNet != null ? (data.diiNet >= 0 ? "var(--bull)" : "var(--bear)") : undefined}
          />
          <p className="px-3.5 py-2 text-[10.5px] text-dim">
            {data.date ? `As of ${data.date} · ` : ""}Source: {data.source}. Provisional until final figures.
          </p>
        </div>
      )}
    </Card>
  );
}

// ---------- VIX ----------
export function VixCard({ quotes }: { quotes: Quote[] }) {
  const vix = quotes.find((q) => q.symbol === "^INDIAVIX");
  if (!vix)
    return (
      <Card>
        <CardHeader title="India VIX" />
        <EmptyState title="VIX quote unavailable." hint="Retrying automatically every minute." />
      </Card>
    );
  const v = vix.price;
  const regime = v < 13 ? ["Calm", "var(--bull)"] : v < 17 ? ["Normal", "var(--accent)"] : v < 22 ? ["Elevated", "var(--gold)"] : ["Fear", "var(--bear)"];
  return (
    <Card>
      <CardHeader title="India VIX" sub="Volatility regime" />
      <div className="flex items-center justify-between px-3.5 py-3">
        <span className="font-mono-num text-[26px] font-semibold text-ink">{fmtNum(v)}</span>
        <span
          className="rounded-md px-2 py-1 text-[11px] font-bold uppercase tracking-wider"
          style={{ color: regime[1], backgroundColor: `color-mix(in srgb, ${regime[1]} 14%, transparent)` }}
        >
          {regime[0]}
        </span>
      </div>
      <div className="px-3.5 pb-3">
        <div className="h-1.5 w-full rounded-full bg-hairline">
          <div
            className="h-1.5 rounded-full transition-all"
            style={{ width: `${Math.min(100, (v / 30) * 100)}%`, backgroundColor: regime[1] }}
          />
        </div>
        <p className="mt-1.5 text-[10.5px] text-dim">
          &lt;13 Calm · 13–17 Normal · 17–22 Elevated · &gt;22 Fear · {fmtSigned(vix.changePct, 2, "%")} today
        </p>
      </div>
    </Card>
  );
}

// ---------- Commodities ----------
export function CommoditiesCard({ quotes, goldDriver }: { quotes: Quote[]; goldDriver: NewsItem | null }) {
  const gold = goldInrPer10g(quotes);
  const gc = quotes.find((q) => q.symbol === "GC=F");
  const si = quotes.find((q) => q.symbol === "SI=F");
  const bz = quotes.find((q) => q.symbol === "BZ=F");
  const hg = quotes.find((q) => q.symbol === "HG=F");
  if (!gc && !bz)
    return (
      <Card>
        <CardHeader title="Commodities" />
        <EmptyState title="Commodity quotes unavailable." hint="Retrying automatically." />
      </Card>
    );
  return (
    <Card>
      <CardHeader title="Commodities" sub="Live via Yahoo · delayed" />
      {gold != null && (
        <Row
          label="Gold ₹/10g (intl parity*)"
          value={`₹${fmtNum(gold, 0)}`}
          sub={gc ? fmtSigned(gc.changePct, 2, "%") : ""}
          color="var(--gold)"
        />
      )}
      {gc && <Row label="Gold $/oz" value={fmtNum(gc.price)} sub={fmtSigned(gc.changePct, 2, "%")} />}
      {si && <Row label="Silver $/oz" value={fmtNum(si.price)} sub={fmtSigned(si.changePct, 2, "%")} />}
      {bz && <Row label="Brent $/bbl" value={fmtNum(bz.price)} sub={fmtSigned(bz.changePct, 2, "%")} />}
      {hg && <Row label="Copper $/lb" value={fmtNum(hg.price)} sub={fmtSigned(hg.changePct, 2, "%")} />}
      <p className="px-3.5 py-1.5 text-[10px] text-dim">*Excl. import duty & GST — MCX trades at a premium.</p>
      {goldDriver && (
        <a
          href={goldDriver.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block border-t border-hairline px-3.5 py-2 text-[11px] leading-snug text-gold hover:text-marigold"
        >
          Driver now: {goldDriver.title}
          <span className="block text-[10px] text-dim">{goldDriver.source} · {relTime(goldDriver.publishedAt)}</span>
        </a>
      )}
    </Card>
  );
}

// ---------- Rates & FX ----------
export function RatesCard({ quotes }: { quotes: Quote[] }) {
  const fx = quotes.find((q) => q.symbol === "INR=X");
  const tnx = quotes.find((q) => q.symbol === "^TNX");
  const dxy = quotes.find((q) => q.symbol === "DX-Y.NYB");
  return (
    <Card>
      <CardHeader title="Rates & FX" />
      {!fx && !tnx ? (
        <EmptyState title="Rates unavailable." hint="Retrying automatically." />
      ) : (
        <div>
          {fx && <Row label="USD/INR" value={fmtNum(fx.price, 3)} sub={fmtSigned(fx.changePct, 2, "%")} />}
          {tnx && <Row label="US 10Y" value={`${fmtNum(tnx.price, 2)}%`} sub={fmtSigned(tnx.changePct, 2, "%")} />}
          {dxy && <Row label="Dollar index" value={fmtNum(dxy.price, 2)} sub={fmtSigned(dxy.changePct, 2, "%")} />}
          <Row label="India 10Y G-Sec" value="~6.3–6.6%" sub="indicative band · verify with CCIL" />
        </div>
      )}
    </Card>
  );
}

// ---------- Sector heatmap ----------
export function SectorHeatmapCard({ cells, onSector }: { cells: SectorCell[]; onSector?: (label: string) => void }) {
  return (
    <Card>
      <CardHeader title="Sector heatmap" sub="NSE sector indices · % today" />
      {cells.length === 0 ? (
        <EmptyState title="Sector data unavailable." hint="Retrying automatically every 2 minutes." />
      ) : (
        <div className="grid grid-cols-3 gap-px bg-hairline p-px">
          {cells.map((c) => {
            const mag = Math.min(1, Math.abs(c.changePct) / 1.6);
            const bg =
              c.changePct >= 0
                ? `color-mix(in srgb, var(--bull) ${8 + mag * 38}%, var(--card))`
                : `color-mix(in srgb, var(--bear) ${8 + mag * 38}%, var(--card))`;
            return (
              <button
                key={c.symbol}
                onClick={() => onSector?.(c.label.toLowerCase())}
                className="flex flex-col items-center px-1 py-2.5 transition-colors-150 hover:brightness-125"
                style={{ backgroundColor: bg }}
              >
                <span className="text-[10px] font-medium text-dim">{c.label}</span>
                <span className={`font-mono-num text-[12px] font-semibold ${c.changePct >= 0 ? "text-bull" : "text-bear"}`}>
                  {fmtSigned(c.changePct, 2, "%")}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ---------- IPO center (from live news) ----------
export function IpoCard({ items }: { items: NewsItem[] }) {
  const ipos = items.filter((i) => i.category === "ipo").slice(0, 6);
  return (
    <Card>
      <CardHeader
        title="IPO center"
        sub="From live newsflow"
        right={
          <span className="rounded bg-marigold/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-marigold">
            GMP unofficial
          </span>
        }
      />
      {ipos.length === 0 ? (
        <EmptyState title="No IPO news in the current window." hint="The IPO standing query runs on every refresh." />
      ) : (
        <div>
          {ipos.map((i) => (
            <a
              key={i.id}
              href={i.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block border-b border-hairline/60 px-3.5 py-2 text-[12px] leading-snug text-ink last:border-0 hover:text-marigold"
            >
              {i.title}
              <span className="mt-0.5 block text-[10.5px] text-dim">
                {i.source} · {relTime(i.publishedAt)}
                {/gmp|grey market/i.test(i.title) && <span className="ml-1 text-marigold">· unofficial GMP mention</span>}
              </span>
            </a>
          ))}
        </div>
      )}
    </Card>
  );
}

// ---------- Calendar mini ----------
export function CalendarMini({ events }: { events: CalendarEvent[] }) {
  const t = todayIST();
  const upcoming = events.filter((e) => daysUntil(e.date, t) >= 0).slice(0, 6);
  return (
    <Card>
      <CardHeader title="Economic calendar" sub="Next 30 days · IST" />
      {upcoming.length === 0 ? (
        <EmptyState title="No scheduled events in window." />
      ) : (
        <div>
          {upcoming.map((e) => {
            const d = daysUntil(e.date, t);
            return (
              <div key={e.id} className="flex items-center gap-2.5 border-b border-hairline/60 px-3.5 py-2 last:border-0">
                <span
                  className={`font-mono-num w-10 shrink-0 rounded px-1 py-0.5 text-center text-[10px] font-bold ${
                    d === 0 ? "bg-marigold/20 text-marigold" : "bg-hairline/50 text-dim"
                  }`}
                >
                  {d === 0 ? "TODAY" : `D-${d}`}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-ink">{e.title}</span>
                <span className="flex shrink-0 gap-0.5">
                  {e.moves.map((m) => (
                    <span key={m} className="font-mono-num text-[9px] uppercase text-dim/70">
                      {m === "equity" ? "EQ" : m === "gold" ? "AU" : m === "inr" ? "₹" : "10Y"}
                    </span>
                  ))}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ---------- Source health ----------
export function SourceHealthCard({ statuses }: { statuses: FeedStatus[] }) {
  const ok = statuses.filter((s) => s.ok).length;
  return (
    <Card>
      <CardHeader title="Source health" sub={`${ok}/${statuses.length} feeds live`} />
      {statuses.length === 0 ? (
        <EmptyState title="First fetch in progress…" />
      ) : (
        <div className="max-h-[180px] overflow-y-auto px-3.5 py-2">
          {statuses.map((s) => (
            <div key={s.name} className="flex items-center gap-2 py-1 text-[11px]">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.ok ? "bg-bull" : "bg-bear"}`} />
              <span className="min-w-0 flex-1 truncate text-dim">{s.name}</span>
              <span className="font-mono-num text-[10px] text-dim/70">{s.ok ? `${s.count}` : "down"}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
