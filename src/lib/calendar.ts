// Economic calendar — seeded recurring macro events (editable here), computed
// forward from rules so it never goes stale. Dates marked "~" are typical
// windows; verify against official releases.
import type { CalendarEvent } from "./types";

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}
function iso(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

// 2026 US FOMC meetings (announcement dates)
const FOMC_2026 = [
  "2026-01-28", "2026-03-18", "2026-04-29", "2026-06-17",
  "2026-07-29", "2026-09-16", "2026-10-28", "2026-12-09",
];

// 2026 RBI MPC outcome dates (scheduled)
const RBI_MPC_2026 = ["2026-02-06", "2026-04-08", "2026-06-05", "2026-08-07", "2026-10-07", "2026-12-04"];

export function buildCalendar(todayISO: string, days = 30): CalendarEvent[] {
  const [y0, m0, d0] = todayISO.split("-").map(Number);
  const start = new Date(Date.UTC(y0, m0 - 1, d0));
  const events: CalendarEvent[] = [];
  const push = (e: CalendarEvent) => events.push(e);

  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() + i * 86_400_000);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    const dateISO = iso(y, m, day);

    if (day === 1)
      push({
        id: `gst-${dateISO}`,
        date: dateISO,
        title: "GST collections & auto sales (monthly)",
        kind: "india-macro",
        moves: ["equity", "inr"],
        time: "morning",
      });
    if (day >= 11 && day <= 13 && !events.some((e) => e.id.startsWith("cpi-") && e.date.startsWith(`${y}-${pad(m)}`)))
      push({
        id: `cpi-${dateISO}`,
        date: dateISO,
        title: "India CPI inflation (~12th)",
        kind: "india-macro",
        moves: ["equity", "bonds", "gold", "inr"],
        time: "17:30 IST",
      });
    if (day >= 13 && day <= 15 && !events.some((e) => e.id.startsWith("wpi-") && e.date.startsWith(`${y}-${pad(m)}`)))
      push({
        id: `wpi-${dateISO}`,
        date: dateISO,
        title: "India WPI inflation (~14th)",
        kind: "india-macro",
        moves: ["bonds", "equity"],
        time: "12:00 IST",
      });
    if (day >= 11 && day <= 13)
      push({
        id: `iip-${dateISO}`,
        date: dateISO,
        title: "India IIP (industrial output, ~12th)",
        kind: "india-macro",
        moves: ["equity"],
        time: "17:30 IST",
      });
    if (day >= 10 && day <= 13)
      push({
        id: `uscpi-${dateISO}`,
        date: dateISO,
        title: "US CPI inflation (~mid-month)",
        kind: "us",
        moves: ["equity", "gold", "inr", "bonds"],
        time: "18:00 IST (approx)",
      });
    // first Friday: US NFP
    const dow = d.getUTCDay();
    if (dow === 5 && day <= 7)
      push({
        id: `nfp-${dateISO}`,
        date: dateISO,
        title: "US Nonfarm Payrolls",
        kind: "us",
        moves: ["equity", "gold", "inr", "bonds"],
        time: "18:00 IST (approx)",
      });
    if (m === 2 && day === 1)
      push({
        id: `budget-${dateISO}`,
        date: dateISO,
        title: "Union Budget (Feb 1)",
        kind: "india-macro",
        moves: ["equity", "bonds", "inr", "gold"],
        time: "11:00 IST",
      });
    if (m >= 6 && m <= 9 && (day === 1 || day === 15))
      push({
        id: `monsoon-${dateISO}`,
        date: dateISO,
        title: "IMD monsoon update window",
        kind: "india-macro",
        moves: ["equity"],
      });
  }

  for (const f of FOMC_2026)
    if (f >= todayISO)
      push({ id: `fomc-${f}`, date: f, title: "US FOMC decision", kind: "us", moves: ["equity", "gold", "inr", "bonds"], time: "23:30 IST" });
  for (const r of RBI_MPC_2026)
    if (r >= todayISO)
      push({ id: `mpc-${r}`, date: r, title: "RBI MPC decision", kind: "rbi", moves: ["equity", "bonds", "inr"], time: "10:00 IST" });

  const cutoff = iso(
    new Date(start.getTime() + days * 86_400_000).getUTCFullYear(),
    new Date(start.getTime() + days * 86_400_000).getUTCMonth() + 1,
    new Date(start.getTime() + days * 86_400_000).getUTCDate(),
  );

  return events
    .filter((e) => e.date >= todayISO && e.date <= cutoff)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 40);
}

export function daysUntil(dateISO: string, todayISO: string): number {
  const a = new Date(dateISO + "T00:00:00Z").getTime();
  const b = new Date(todayISO + "T00:00:00Z").getTime();
  return Math.round((a - b) / 86_400_000);
}
