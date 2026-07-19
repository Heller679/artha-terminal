// CORS-resilient fetch: the app is fully static, so third-party RSS/JSON is
// reached through several free public CORS proxies on different domains.
//
// Reliability model:
// · a GLOBAL semaphore caps total in-flight proxy requests app-wide — bursting
//   20+ parallel requests gets everything rate-limited/hung by the proxies
// · per URL, proxies are raced in pairs (first valid response wins)
// · honest error if every route fails — never fabricated data

export class ProxyError extends Error {
  attempts: string[];
  constructor(attempts: string[]) {
    super(`All fetch routes failed (${attempts.length} tried)`);
    this.attempts = attempts;
  }
}

// ---- global concurrency gate ----
const MAX_IN_FLIGHT = 8;
let inFlight = 0;
const waiters: (() => void)[] = [];

async function acquire(): Promise<void> {
  if (inFlight >= MAX_IN_FLIGHT) {
    await new Promise<void>((resolve) => waiters.push(resolve));
  }
  inFlight++;
}

function release(): void {
  inFlight--;
  const next = waiters.shift();
  if (next) next();
}

function withTimeout(ms: number): { signal: AbortSignal; cancel: () => void } {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return { signal: c.signal, cancel: () => clearTimeout(t) };
}

type Route = {
  name: string;
  make: (url: string) => string;
  extract?: (text: string) => string;
};

const ROUTES: Route[] = [
  { name: "allorigins", make: (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}` },
  { name: "codetabs", make: (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}` },
  { name: "corsfix", make: (u) => `https://proxy.corsfix.com/?${encodeURIComponent(u)}` },
  { name: "corsproxy", make: (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}` },
  {
    name: "allorigins-get",
    make: (u) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
    extract: (t) => {
      try {
        return (JSON.parse(t) as { contents?: string }).contents ?? "";
      } catch {
        return "";
      }
    },
  },
  { name: "corslol", make: (u) => `https://api.cors.lol/?url=${encodeURIComponent(u)}` },
];

const GROUPS: Route[][] = [
  [ROUTES[0], ROUTES[1]],
  [ROUTES[2], ROUTES[3]],
  [ROUTES[4], ROUTES[5]],
];

async function tryRoute(r: Route, url: string, timeoutMs: number, attempts: string[]): Promise<string> {
  const { signal, cancel } = withTimeout(timeoutMs);
  try {
    const res = await fetch(r.make(url), { signal, headers: { Accept: "*/*" } });
    if (!res.ok) {
      attempts.push(`${r.name}:${res.status}`);
      throw new Error(`http ${res.status}`);
    }
    let text = await res.text();
    if (r.extract) text = r.extract(text);
    if (!text || text.length < 64) {
      attempts.push(`${r.name}:empty`);
      throw new Error("empty response");
    }
    return text;
  } catch (e) {
    if (e instanceof Error) {
      if (e.name === "AbortError") attempts.push(`${r.name}:timeout`);
      else if (!/^http |^empty/.test(e.message)) attempts.push(`${r.name}:neterr`);
    }
    throw e;
  } finally {
    cancel();
  }
}

async function raceGroup(group: Route[], url: string, timeoutMs: number, attempts: string[]): Promise<string> {
  return Promise.any(group.map((r) => tryRoute(r, url, timeoutMs, attempts)));
}

export async function proxiedText(url: string, timeoutMs = 9_000): Promise<string> {
  const attempts: string[] = [];
  await acquire();
  try {
    for (const group of GROUPS) {
      try {
        return await raceGroup(group, url, timeoutMs, attempts);
      } catch {
        /* this pair failed — try the next */
      }
    }
  } finally {
    release();
  }
  throw new ProxyError(attempts);
}

export async function proxiedJson<T>(url: string, timeoutMs = 9_000): Promise<T> {
  const text = await proxiedText(url, timeoutMs);
  // some proxies wrap with junk — find the first { or [
  const i = text.search(/[{[]/);
  if (i < 0) throw new Error("no JSON in response");
  return JSON.parse(text.slice(i)) as T;
}
