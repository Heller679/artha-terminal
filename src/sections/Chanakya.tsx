import { useEffect, useMemo, useState } from "react";
import { X, TrendingUp, TrendingDown, Minus, ExternalLink, Download } from "lucide-react";
import type { CompanyScore, Evidence, NewsItem, SignalKey } from "@/lib/types";
import { computeScores, sarkariRadar, SIGNALS, snapshotScores, scoreDeltas, orderBook, dossierCsv } from "@/lib/chanakya";
import { Card, CardHeader, EmptyState } from "@/components/primitives";
import { istDate, relTime } from "@/lib/format";

const BAND_COLORS: [number, string][] = [
  [25, "var(--muted)"],
  [50, "var(--accent)"],
  [75, "var(--spec)"],
  [101, "#b45ef0"],
];

function bandColor(score: number): string {
  for (const [cap, c] of BAND_COLORS) if (score < cap) return c;
  return "var(--spec)";
}

// ---------- The Nexus Meter: 0–100 gauge where each evidence item is a notch ----------
function NexusMeter({ score, evidence, onOpen }: { score: number; evidence: Evidence[]; onOpen: (e: Evidence) => void }) {
  const [hover, setHover] = useState<Evidence | null>(null);
  // distribute notches along the filled portion, slightly jittered for texture
  const notches = evidence.slice(0, 40).map((e, i) => ({
    e,
    x: evidence.length === 1 ? score / 2 : (i / Math.max(1, Math.min(39, evidence.length - 1))) * Math.max(4, score),
  }));
  return (
    <div className="relative select-none">
      <div className="flex items-baseline justify-between">
        <span className="section-eyebrow" style={{ color: "var(--spec)" }}>
          Nexus Meter · the meter is the citation trail
        </span>
        <span className="font-mono-num text-[22px] font-semibold" style={{ color: bandColor(score) }}>
          {score}
          <span className="text-[11px] text-dim">/100</span>
        </span>
      </div>
      <div className="relative mt-2 h-8">
        {/* track */}
        <div className="absolute inset-x-0 top-3 h-[6px] rounded-full bg-hairline" />
        {/* fill */}
        <div
          className="absolute left-0 top-3 h-[6px] rounded-full transition-all duration-300"
          style={{ width: `${score}%`, background: `linear-gradient(90deg, color-mix(in srgb, var(--spec) 55%, transparent), var(--spec))` }}
        />
        {/* band ticks */}
        {[25, 50, 75].map((t) => (
          <div key={t} className="absolute top-2 h-[14px] w-px bg-dim/40" style={{ left: `${t}%` }}>
            <span className="font-mono-num absolute -left-2 top-4 text-[8.5px] text-dim/60">{t}</span>
          </div>
        ))}
        {/* evidence notches */}
        {notches.map(({ e, x }) => (
          <button
            key={e.id}
            className="group absolute top-[7px] h-[18px] w-[5px] -translate-x-1/2 rounded-sm transition-transform hover:scale-y-125"
            style={{
              left: `${Math.min(99, Math.max(0.5, x))}%`,
              backgroundColor: "var(--spec)",
              boxShadow: "0 0 0 1px color-mix(in srgb, var(--spec) 30%, transparent)",
            }}
            onMouseEnter={() => setHover(e)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(e)}
            onBlur={() => setHover(null)}
            onClick={() => onOpen(e)}
            aria-label={`Evidence: ${e.title}`}
          />
        ))}
      </div>
      {hover && (
        <div className="pointer-events-none absolute left-0 top-12 z-30 w-[280px] rounded-md border border-spec/40 bg-panel p-2.5 shadow-xl">
          <p className="text-[11px] font-semibold leading-snug text-ink">{hover.title}</p>
          <p className="mt-1 text-[10px] text-dim">
            {hover.source} · {istDate(hover.date)} · feeds {SIGNALS.find((s) => s.key === hover.signal)?.name}
          </p>
        </div>
      )}
      <p className="mt-3 text-[10px] text-dim">
        Each notch is one linked, published source. {evidence.length} evidence items · hover to preview, click to open.
      </p>
    </div>
  );
}

// ---------- Company dossier ----------
function Dossier({ company, onClose }: { company: CompanyScore; onClose: () => void }) {
  const [activeSignal, setActiveSignal] = useState<SignalKey | "all">("all");
  const ev = activeSignal === "all" ? company.evidence : company.evidence.filter((e) => e.signal === activeSignal);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm md:items-center" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-xl border border-hairline bg-panel p-5 md:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="section-eyebrow" style={{ color: "var(--spec)" }}>
              Chanakya Watch · speculative analysis
            </p>
            <h2 className="font-display mt-1 text-[26px] leading-tight text-ink">{company.name}</h2>
            <p className="mt-0.5 text-[12px] text-dim">
              {company.ticker} · {company.sector} · {company.isPSU ? "PSU" : "Private"} ·{" "}
              <span style={{ color: bandColor(company.score) }}>{company.band}</span>
            </p>
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={() => {
                const blob = new Blob([dossierCsv(company)], { type: "text/csv" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = `chanakya-${company.ticker}-dossier.csv`;
                a.click();
                URL.revokeObjectURL(a.href);
              }}
              className="flex items-center gap-1.5 rounded-md border border-spec/40 px-2.5 py-1.5 text-[11px] font-medium text-spec hover:bg-spec/10"
              title="Export dossier with citations as CSV"
            >
              <Download size={12} /> CSV
            </button>
            <button onClick={onClose} className="rounded-md border border-hairline p-1.5 text-dim hover:text-ink">
              <X size={15} />
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-hairline bg-surface p-4">
          <NexusMeter score={company.score} evidence={company.evidence} onOpen={(e) => window.open(e.url, "_blank", "noopener")} />
        </div>

        {/* signal breakdown */}
        <div className="mt-4 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {SIGNALS.map((s) => {
            const pts = company.signalScores[s.key];
            const pct = (pts / s.weight) * 100;
            return (
              <button
                key={s.key}
                onClick={() => setActiveSignal(activeSignal === s.key ? "all" : s.key)}
                className={`rounded-md border p-2 text-left transition-colors-150 ${
                  activeSignal === s.key ? "border-spec/60 bg-spec/10" : "border-hairline hover:border-spec/40"
                }`}
              >
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-medium text-ink">
                    <span className="font-mono-num text-spec">{s.key}</span> {s.name}
                  </span>
                  <span className="font-mono-num text-[10.5px] text-dim">
                    {pts}/{s.weight}
                  </span>
                </div>
                <div className="mt-1.5 h-1 rounded-full bg-hairline">
                  <div className="h-1 rounded-full bg-spec" style={{ width: `${pct}%` }} />
                </div>
              </button>
            );
          })}
        </div>

        {/* evidence timeline */}
        <h3 className="section-eyebrow mt-5">Evidence timeline {activeSignal !== "all" && `· ${activeSignal}`}</h3>
        <div className="relative mt-3 space-y-0 border-l border-spec/30 pl-4">
          {ev.slice(0, 25).map((e) => (
            <div key={e.id} className="relative pb-4">
              <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-panel bg-spec" />
              <a href={e.url} target="_blank" rel="noopener noreferrer" className="group block">
                <p className="text-[12.5px] font-medium leading-snug text-ink group-hover:text-spec">
                  {e.title} <ExternalLink size={10} className="ml-0.5 inline opacity-50" />
                </p>
                <p className="mt-0.5 text-[10.5px] text-dim">
                  {e.source} · {istDate(e.date)} · <span className="font-mono-num text-spec/80">{e.signal}</span>
                </p>
                <p className="mt-0.5 text-[11px] italic leading-snug text-dim/80">{e.note}</p>
              </a>
            </div>
          ))}
        </div>

        <p className="mt-2 rounded-md border border-spec/25 bg-spec/5 px-3 py-2 text-[10.5px] leading-relaxed text-dim">
          Speculative analysis · opinion based on cited public reporting. The score measures alignment patterns visible in
          public data — it does not assert or imply corruption, bribery, or any illegality. Where a company has publicly
          responded to a cited report, refer to the linked source for that response.
        </p>
      </div>
    </div>
  );
}

// ---------- Methodology modal (first-visit gate) ----------
function MethodologyModal({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-xl border border-spec/40 bg-panel p-6">
        <p className="section-eyebrow" style={{ color: "var(--spec)" }}>
          Chanakya Watch · methodology
        </p>
        <h2 className="font-display mt-1 text-[24px] text-ink">How the State-Alignment Score works</h2>
        <p className="mt-2 text-[12.5px] leading-relaxed text-dim">
          Academic research (e.g. Faccio et al.) finds politically connected firms often enjoy easier financing, lighter
          regulation, and preferential contracts. Chanakya Watch makes such patterns visible using{" "}
          <strong className="text-ink">public, cited evidence only</strong>. Seven signals, weighted:
        </p>
        <div className="mt-3 space-y-1.5">
          {SIGNALS.map((s) => (
            <div key={s.key} className="flex gap-2.5 rounded-md border border-hairline px-2.5 py-2">
              <span className="font-mono-num shrink-0 text-[11px] font-bold text-spec">
                {s.key}·{s.weight}
              </span>
              <div>
                <p className="text-[12px] font-medium text-ink">{s.name}</p>
                <p className="text-[11px] text-dim">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-[11.5px] leading-relaxed text-dim">
          <li>A signal counts only with ≥1 linked published source. No source → no score → company omitted.</li>
          <li>Score bands: 0–24 Market-driven · 25–49 Mild tailwind · 50–74 Notable alignment · 75–100 Heavy (speculative).</li>
          <li>This measures alignment patterns in public data. It never asserts corruption or illegality.</li>
          <li>Limitations: news-window dependent; reporting volume biases scores upward for heavily covered firms.</li>
        </ul>
        <button
          onClick={onDismiss}
          className="mt-5 w-full rounded-md bg-spec py-2.5 text-[13px] font-semibold text-white hover:brightness-110"
        >
          I understand — show the analysis
        </button>
      </div>
    </div>
  );
}

// ---------- Sarkari Radar ----------
function SarkariRadar({ corpus }: { corpus: NewsItem[] }) {
  const rows = useMemo(() => sarkariRadar(corpus, 6), [corpus]);
  const max = Math.max(1, ...rows.flatMap((r) => r.months.map((m) => m.valueCr)));
  if (rows.length === 0)
    return <EmptyState title="No tender news detected yet in the current corpus." hint="Standing queries for order wins run on every refresh cycle." />;
  return (
    <div className="space-y-4 px-4 py-3">
      {rows.slice(0, 6).map((r) => (
        <div key={r.sector}>
          <div className="flex items-baseline justify-between">
            <span className="text-[12px] font-semibold capitalize text-ink">{r.sector}</span>
            <span className="font-mono-num text-[11px] text-dim">
              {r.totalCr > 0 ? `₹${r.totalCr.toLocaleString("en-IN", { maximumFractionDigits: 0 })} cr detected` : `${r.months.reduce((a, m) => a + m.count, 0)} awards (value n/a)`}
            </span>
          </div>
          <div className="mt-1 flex h-9 items-end gap-1">
            {r.months.map((m, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-0.5">
                <div
                  className="w-full rounded-t-sm bg-spec/80"
                  style={{ height: `${Math.max(m.count > 0 ? 8 : 2, (m.valueCr / max) * 100)}%` }}
                  title={`${m.label}: ₹${m.valueCr.toLocaleString("en-IN", { maximumFractionDigits: 0 })} cr · ${m.count} awards`}
                />
                <span className="text-[8.5px] text-dim/70">{m.label}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      <p className="text-[10px] text-dim">₹ value of government/PSU orders detected in newsflow per sector per month. Bar height = value (or minimum tick when only the count is known).</p>
    </div>
  );
}

// ---------- Trends: delta leaderboard + sector alignment heat ----------
function TrendsView({ scores }: { scores: CompanyScore[] }) {
  const deltas = useMemo(() => scoreDeltas(scores, 7), [scores]);
  const sectorAgg = useMemo(() => {
    const map = new Map<string, { sum: number; n: number; max: number; top: string }>();
    for (const c of scores) {
      const cur = map.get(c.sector) ?? { sum: 0, n: 0, max: 0, top: "" };
      cur.sum += c.score;
      cur.n += 1;
      if (c.score > cur.max) {
        cur.max = c.score;
        cur.top = c.ticker;
      }
      map.set(c.sector, cur);
    }
    return [...map.entries()]
      .map(([sector, v]) => ({ sector, avg: Math.round(v.sum / v.n), n: v.n, top: v.top, max: v.max }))
      .sort((a, b) => b.avg - a.avg);
  }, [scores]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Δ Movers" sub="Score change vs ~7 days ago · builds as you revisit" />
        {deltas.length === 0 ? (
          <EmptyState
            title="Not enough history yet."
            hint="A daily score snapshot is saved each time you open the terminal — deltas appear from your second day onward."
          />
        ) : (
          <div>
            {deltas.slice(0, 12).map((d) => {
              const c = scores.find((s) => s.ticker === d.ticker);
              return (
                <div key={d.ticker} className="flex items-center gap-3 border-b border-hairline/60 px-4 py-2.5 last:border-0">
                  <span className="font-mono-num w-20 shrink-0 text-[12px] font-semibold text-ink">{d.ticker}</span>
                  <span className="min-w-0 flex-1 truncate text-[11px] text-dim">{c?.name ?? d.ticker}</span>
                  <span className={`font-mono-num text-[13px] font-bold ${d.delta > 0 ? "text-spec" : "text-dim"}`}>
                    {d.delta > 0 ? "+" : ""}
                    {d.delta}
                  </span>
                  <span className="text-dim">{d.delta > 0 ? <TrendingUp size={13} className="text-spec" /> : <TrendingDown size={13} />}</span>
                </div>
              );
            })}
            <p className="px-4 py-2 text-[10px] text-dim">Baseline: {deltas[0]?.from}. Rising alignment ≠ rising stock — it's a narrative signal.</p>
          </div>
        )}
      </Card>
      <Card>
        <CardHeader title="Sector alignment heat" sub="Average score by sector" />
        {sectorAgg.length === 0 ? (
          <EmptyState title="No scored companies yet." />
        ) : (
          <div className="grid grid-cols-2 gap-px bg-hairline p-px sm:grid-cols-3">
            {sectorAgg.map((s) => (
              <div
                key={s.sector}
                className="flex flex-col items-center px-2 py-3"
                style={{ backgroundColor: `color-mix(in srgb, var(--spec) ${Math.min(45, s.avg)}%, var(--card))` }}
                title={`Top: ${s.top} (${s.max})`}
              >
                <span className="text-[10.5px] font-medium capitalize text-dim">{s.sector}</span>
                <span className="font-mono-num text-[18px] font-bold text-spec">{s.avg}</span>
                <span className="font-mono-num text-[9px] text-dim/70">
                  {s.n} co · top {s.top}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------- Order Book ----------
function OrderBookView({ corpus }: { corpus: NewsItem[] }) {
  const rows = useMemo(() => orderBook(corpus), [corpus]);
  if (rows.length === 0)
    return (
      <Card>
        <EmptyState
          title="No tender orders detected yet."
          hint="The archive accumulates every order win the terminal sees — the book builds up over days of use."
        />
      </Card>
    );
  const months = [...new Set(rows.flatMap((r) => Object.keys(r.byMonth)))].sort().slice(-4);
  return (
    <Card>
      <CardHeader
        title="Order book tracker"
        sub={`${rows.length} companies · ₹ value of order wins detected in newsflow (archive + live)`}
      />
      <div className="grid grid-cols-[5rem_1fr_6rem_4rem_5rem] items-center gap-2 border-b border-hairline px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-dim sm:grid-cols-[6rem_1fr_7rem_5rem_6rem_7rem]">
        <span>Ticker</span>
        <span>Company</span>
        <span className="text-right">Detected book</span>
        <span className="text-right"># orders</span>
        <span className="hidden text-right sm:block">Largest</span>
        <span className="text-right">Latest</span>
      </div>
      {rows.map((r) => (
        <div key={r.ticker} className="grid grid-cols-[5rem_1fr_6rem_4rem_5rem] items-center gap-2 border-b border-hairline/60 px-4 py-2.5 last:border-0 sm:grid-cols-[6rem_1fr_7rem_5rem_6rem_7rem]">
          <span className="font-mono-num text-[12px] font-semibold text-ink">{r.ticker}</span>
          <span className="min-w-0">
            <span className="block truncate text-[12px] text-dim">{r.name}</span>
            <span className="flex gap-1">
              {months.map((m) => (
                <span
                  key={m}
                  className="h-1.5 flex-1 rounded-sm"
                  style={{
                    backgroundColor: r.byMonth[m] ? "var(--spec)" : "var(--line)",
                    opacity: r.byMonth[m] ? 0.4 + Math.min(0.6, (r.byMonth[m] / (r.totalCr || 1)) * 2) : 0.4,
                  }}
                  title={`${m}: ₹${Math.round(r.byMonth[m] ?? 0).toLocaleString("en-IN")} cr`}
                />
              ))}
            </span>
          </span>
          <span className="font-mono-num text-right text-[13px] font-bold text-marigold">
            {r.totalCr > 0 ? `₹${r.totalCr.toLocaleString("en-IN", { maximumFractionDigits: 0 })} cr` : "n/a"}
          </span>
          <span className="font-mono-num text-right text-[12px] text-ink">{r.count}</span>
          <span className="font-mono-num hidden text-right text-[11px] text-dim sm:block">
            {r.largestCr > 0 ? `₹${r.largestCr.toLocaleString("en-IN", { maximumFractionDigits: 0 })} cr` : "—"}
          </span>
          <span className="text-right text-[11px] text-dim">{relTime(r.latestAt)}</span>
        </div>
      ))}
      <p className="px-4 py-2 text-[10px] text-dim">
        Detected book = sum of ₹ values parsed from headlines (many awards don't disclose value → shown as count only). Not audited order backlog.
      </p>
    </Card>
  );
}

// ---------- Main section ----------
export function ChanakyaWatch({ corpus, loading }: { corpus: NewsItem[]; loading: boolean }) {
  const [tab, setTab] = useState<"scores" | "trends" | "radar" | "orders" | "method">("scores");
  const [selected, setSelected] = useState<CompanyScore | null>(null);
  const [gate, setGate] = useState(() => localStorage.getItem("artha.chanakya.gate") !== "seen");

  const scores = useMemo(() => computeScores(corpus), [corpus]);

  useEffect(() => {
    if (scores.length > 0) snapshotScores(scores);
  }, [scores]);

  useEffect(() => {
    if (!gate) localStorage.setItem("artha.chanakya.gate", "seen");
  }, [gate]);

  return (
    <div className="p-3 md:p-5">
      {gate && <MethodologyModal onDismiss={() => setGate(false)} />}

      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="font-display text-[28px] leading-none text-ink">
            Chanakya <span className="text-spec">Watch</span>
          </h1>
          <p className="mt-1.5 max-w-xl text-[12px] leading-relaxed text-dim">
            The Speculation Lab. Scores whether listed companies appear to be quietly benefiting from state alignment —
            computed only from linked, published reporting. <span className="text-spec">Speculative analysis · opinion based on cited public reporting.</span>
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-hairline bg-surface p-1">
          {(
            [
              ["scores", "Scores"],
              ["trends", "Trends"],
              ["orders", "Order Book"],
              ["radar", "Sarkari Radar"],
              ["method", "Methodology"],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              onClick={() => (k === "method" ? setGate(true) : setTab(k))}
              className={`rounded-md px-3 py-1.5 text-[12px] font-medium ${tab === k && k !== "method" ? "bg-spec/20 text-spec" : "text-dim hover:text-ink"}`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {tab === "scores" && (
        <Card>
          <CardHeader
            title="State-Alignment Scores"
            sub={loading ? "Computing from live corpus…" : `${scores.length} companies with linked evidence · trailing 12 months`}
          />
          {loading && scores.length === 0 ? (
            <EmptyState title="Ingesting the news corpus…" hint="Scores appear once feeds land." />
          ) : scores.length === 0 ? (
            <EmptyState
              title="No companies meet the evidence bar in the current corpus."
              hint="The engine fails closed by design — no linked sources, no score. Check back as the corpus grows through the day."
            />
          ) : (
            <div>
              <div className="grid grid-cols-[2rem_1fr_4rem_5rem_6rem] items-center gap-2 border-b border-hairline px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-dim sm:grid-cols-[2.5rem_1fr_6rem_5rem_5rem_6rem]">
                <span>#</span>
                <span>Company</span>
                <span className="text-right">Score</span>
                <span className="text-right">Top signal</span>
                <span className="hidden text-right sm:block">Evidence</span>
                <span className="text-right">90d trend</span>
              </div>
              {scores.slice(0, 30).map((c, i) => (
                <button
                  key={c.ticker}
                  onClick={() => setSelected(c)}
                  className="grid w-full grid-cols-[2rem_1fr_4rem_5rem_6rem] items-center gap-2 border-b border-hairline/60 px-4 py-2.5 text-left transition-colors-150 hover:bg-spec/5 sm:grid-cols-[2.5rem_1fr_6rem_5rem_5rem_6rem]"
                >
                  <span className="font-mono-num text-[11px] text-dim">{i + 1}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold text-ink">{c.name}</span>
                    <span className="font-mono-num text-[10px] text-dim">
                      {c.ticker} · {c.sector}
                      {c.isPSU ? " · PSU" : ""}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="font-mono-num text-[15px] font-bold" style={{ color: bandColor(c.score) }}>
                      {c.score}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="font-mono-num rounded bg-spec/10 px-1.5 py-0.5 text-[10px] font-semibold text-spec">{c.topSignal}</span>
                  </span>
                  <span className="font-mono-num hidden text-right text-[11px] text-dim sm:block">{c.evidence.length}</span>
                  <span className="flex justify-end text-dim">
                    {c.trend === "up" ? <TrendingUp size={14} className="text-bull" /> : c.trend === "down" ? <TrendingDown size={14} className="text-bear" /> : <Minus size={14} />}
                  </span>
                </button>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === "trends" && <TrendsView scores={scores} />}
      {tab === "orders" && <OrderBookView corpus={corpus} />}
      {tab === "radar" && (
        <Card>
          <CardHeader title="Sarkari Radar" sub="PSU / government order flow by sector · ₹ crore detected in newsflow" />
          <SarkariRadar corpus={corpus} />
        </Card>
      )}

      {selected && <Dossier company={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
