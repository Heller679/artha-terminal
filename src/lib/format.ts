// IST formatting + number helpers. Everything user-facing passes through here.

const IST = "Asia/Kolkata";

export function istTime(d: number | Date, withSeconds = true): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST,
    hour: "2-digit",
    minute: "2-digit",
    ...(withSeconds ? { second: "2-digit" } : {}),
    hour12: false,
  }).format(d);
}

export function istDate(d: number | Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

export function istDateTime(d: number | Date): string {
  return `${istDate(d)} · ${istTime(d, false)} IST`;
}

export function relTime(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 45) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return istDate(ts);
}

export function todayIST(): string {
  // yyyy-mm-dd in IST
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function istNowParts(): { hour: number; minute: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST,
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { hour: parseInt(get("hour"), 10), minute: parseInt(get("minute"), 10), day: dayMap[get("weekday")] ?? 1 };
}

export function fmtNum(n: number, decimals = 2): string {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

export function fmtCr(n: number): string {
  if (Math.abs(n) >= 100000) return `₹${fmtNum(n / 100000, 1)} lakh cr`;
  return `₹${fmtNum(n, 0)} cr`;
}

export function fmtSigned(n: number, decimals = 2, suffix = ""): string {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}${fmtNum(Math.abs(n), decimals)}${suffix}`;
}

export function hashId(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
