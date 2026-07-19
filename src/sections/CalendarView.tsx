import { useMemo } from "react";
import { buildCalendar, daysUntil } from "@/lib/calendar";
import { todayIST, istDate } from "@/lib/format";
import { Card } from "@/components/primitives";

const KIND_COLORS: Record<string, string> = {
  "india-macro": "var(--accent)",
  rbi: "var(--spec)",
  us: "var(--gold)",
  global: "var(--muted)",
  corporate: "var(--bull)",
};

export function CalendarView() {
  const today = todayIST();
  const events = useMemo(() => buildCalendar(today, 30), [today]);

  return (
    <div className="p-3 md:p-5">
      <h1 className="font-display text-[28px] text-ink">Economic calendar</h1>
      <p className="mb-4 mt-1 text-[12px] text-dim">
        Rolling 30 days · IST · dates marked "~" are typical windows — verify against official releases.
      </p>
      <Card>
        {events.map((e, i) => {
          const d = daysUntil(e.date, today);
          const showDate = i === 0 || events[i - 1].date !== e.date;
          return (
            <div key={e.id}>
              {showDate && (
                <div className="border-b border-hairline bg-panel/60 px-4 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-dim">
                  {istDate(new Date(e.date + "T00:00:00Z"))} {d === 0 && <span className="ml-1 text-marigold">· today</span>}
                </div>
              )}
              <div className="flex items-center gap-3 border-b border-hairline/50 px-4 py-2.5 last:border-0">
                <span
                  className="font-mono-num w-12 shrink-0 rounded px-1 py-1 text-center text-[10px] font-bold"
                  style={{
                    color: KIND_COLORS[e.kind],
                    backgroundColor: `color-mix(in srgb, ${KIND_COLORS[e.kind]} 12%, transparent)`,
                  }}
                >
                  {d === 0 ? "TODAY" : `D-${d}`}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-ink">{e.title}</p>
                  {e.time && <p className="text-[10.5px] text-dim">{e.time}</p>}
                </div>
                <div className="flex shrink-0 gap-1">
                  {e.moves.map((m) => (
                    <span key={m} className="font-mono-num rounded border border-hairline px-1 text-[9px] uppercase text-dim">
                      {m === "equity" ? "EQ" : m === "gold" ? "AU" : m === "inr" ? "₹" : "10Y"}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}
