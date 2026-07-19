import { useState } from "react";
import { Bell, X, Trash2, ExternalLink } from "lucide-react";
import {
  getLog,
  getSettings,
  saveSettings,
  markAllRead,
  clearLog,
  requestNotifPermission,
  type AlertSettings,
} from "@/lib/alerts";
import { relTime } from "@/lib/format";

const KIND_COLOR: Record<string, string> = {
  tender: "var(--accent)",
  impact: "var(--bear)",
  "watchlist-move": "var(--bull)",
  "watchlist-news": "var(--spec)",
};

function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button onClick={() => onChange(!on)} className="flex w-full items-center justify-between gap-3 px-3.5 py-2 text-left hover:bg-panel/60">
      <span>
        <span className="block text-[12px] text-ink">{label}</span>
        {hint && <span className="block text-[10.5px] text-dim">{hint}</span>}
      </span>
      <span
        className={`relative h-4.5 w-8 shrink-0 rounded-full transition-colors-150 ${on ? "bg-marigold" : "bg-hairline"}`}
        style={{ height: 18, width: 32 }}
      >
        <span
          className="absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white transition-all"
          style={{ left: on ? 16 : 2 }}
        />
      </span>
    </button>
  );
}

export function AlertsPanel({ onClose, onBadge }: { onClose: () => void; onBadge: (n: number) => void }) {
  const [log, setLog] = useState(getLog());
  const [settings, setSettings] = useState<AlertSettings>(getSettings());
  const [tab, setTab] = useState<"alerts" | "settings">("alerts");

  const update = (patch: Partial<AlertSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/50" onClick={onClose}>
      <div
        className="h-full w-full max-w-md overflow-y-auto border-l border-hairline bg-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-hairline bg-panel px-4 py-3">
          <Bell size={15} className="text-marigold" />
          <h2 className="text-[15px] font-semibold text-ink">Alerts</h2>
          <div className="ml-auto flex gap-1">
            {(["alerts", "settings"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-md px-2.5 py-1 text-[11.5px] font-medium capitalize ${tab === t ? "bg-marigold/15 text-marigold" : "text-dim hover:text-ink"}`}
              >
                {t}
              </button>
            ))}
            <button onClick={onClose} className="ml-1 rounded-md border border-hairline p-1.5 text-dim hover:text-ink">
              <X size={13} />
            </button>
          </div>
        </div>

        {tab === "settings" ? (
          <div className="py-1">
            <Toggle on={settings.tenders} onChange={(v) => update({ tenders: v })} label="Tenders & order wins" hint="Every detected contract award" />
            <Toggle on={settings.bigImpact} onChange={(v) => update({ bigImpact: v })} label="High-impact stories" hint="Impact score ≥ 4" />
            <Toggle on={settings.watchlistNews} onChange={(v) => update({ watchlistNews: v })} label="Watchlist news" hint="Stories mentioning your tickers" />
            <Toggle on={settings.watchlistMoves} onChange={(v) => update({ watchlistMoves: v })} label="Watchlist price moves" hint="Checked against the previous quote this session" />
            <div className="flex items-center justify-between px-3.5 py-2">
              <span className="text-[12px] text-ink">Move threshold</span>
              <span className="flex items-center gap-2">
                <input
                  type="range"
                  min={1}
                  max={8}
                  step={0.5}
                  value={settings.moveThresholdPct}
                  onChange={(e) => update({ moveThresholdPct: Number(e.target.value) })}
                  className="w-24 accent-[var(--accent)]"
                />
                <span className="font-mono-num w-10 text-[12px] text-ink">±{settings.moveThresholdPct}%</span>
              </span>
            </div>
            <div className="mx-3.5 my-2 border-t border-hairline" />
            <Toggle
              on={settings.browserNotifs}
              onChange={async (v) => {
                if (v) {
                  const ok = await requestNotifPermission();
                  update({ browserNotifs: ok });
                } else update({ browserNotifs: false });
              }}
              label="Browser notifications"
              hint={settings.browserNotifs ? "Enabled — alerts pop up even in another tab" : "Requires permission"}
            />
          </div>
        ) : (
          <div>
            <div className="flex gap-2 px-3.5 py-2">
              <button
                onClick={() => {
                  markAllRead();
                  setLog(getLog());
                  onBadge(0);
                }}
                className="rounded-md border border-hairline px-2 py-1 text-[11px] text-dim hover:text-ink"
              >
                Mark all read
              </button>
              <button
                onClick={() => {
                  clearLog();
                  setLog([]);
                  onBadge(0);
                }}
                className="flex items-center gap-1 rounded-md border border-hairline px-2 py-1 text-[11px] text-dim hover:text-bear"
              >
                <Trash2 size={11} /> Clear
              </button>
            </div>
            {log.length === 0 ? (
              <p className="px-4 py-10 text-center text-[12.5px] text-dim">
                No alerts yet. They fire automatically as new tenders, high-impact stories and watchlist news arrive.
              </p>
            ) : (
              log.map((e) => (
                <a
                  key={e.id}
                  href={e.url ?? "#"}
                  target={e.url ? "_blank" : undefined}
                  rel="noopener noreferrer"
                  className={`block border-b border-hairline/60 px-4 py-2.5 last:border-0 ${e.read ? "opacity-60" : ""} hover:bg-panel/60`}
                >
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: KIND_COLOR[e.kind] }} />
                    <span className="text-[12px] font-semibold text-ink">{e.title}</span>
                    {e.url && <ExternalLink size={10} className="text-dim/50" />}
                    <span className="ml-auto text-[10px] text-dim">{relTime(e.at)}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 pl-3.5 text-[11.5px] leading-snug text-dim">{e.body}</p>
                </a>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
