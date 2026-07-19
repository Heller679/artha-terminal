// Screener.in fundamentals — public company pages fetched through the proxy
// chain and parsed with DOMParser. Defensive by design: every section is
// optional, and anything missing is simply absent from the UI (never faked).
import { proxiedText } from "./proxy";
import { swr, getStale } from "./cache";

export interface FundaRow {
  label: string;
  values: (number | null)[];
}

export interface FundaTable {
  title: string;
  headers: string[]; // periods (e.g. "Mar 2024" or "Dec 2025")
  rows: FundaRow[];
}

export interface PeerRow {
  name: string;
  metrics: Record<string, string>;
}

export interface ScreenerData {
  ticker: string;
  name: string;
  about: string;
  url: string;
  warehouseId: string | null; // screener's internal id — used for the peers AJAX endpoint
  ratios: Record<string, string>; // "Market Cap" → "15,12,345 Cr." etc.
  quarterly: FundaTable | null;
  yearly: FundaTable | null;
  balanceSheet: FundaTable | null;
  cashFlow: FundaTable | null;
  peers: { headers: string[]; rows: PeerRow[] } | null;
  shareholding: FundaTable | null;
  growth: { sales3y: number | null; profit3y: number | null; roe10y: number | null; priceCagr10y: number | null };
  pros: string[];
  cons: string[];
  fetchedAt: number;
}

const SCREENER_TTL = 12 * 60 * 60_000;

function num(s: string | null | undefined): number | null {
  if (!s) return null;
  const cleaned = s.replace(/[,%\s₹]/g, "").replace(/cr\.?$/i, "");
  if (cleaned === "" || cleaned === "-" || isNaN(Number(cleaned))) return null;
  return Number(cleaned);
}

function cellText(el: Element | null | undefined): string {
  return (el?.textContent ?? "").replace(/\s+/g, " ").trim();
}

function parseTable(section: Element | null, title: string): FundaTable | null {
  if (!section) return null;
  const table = section.querySelector("table");
  if (!table) return null;
  const headers = Array.from(table.querySelectorAll("thead th"))
    .map(cellText)
    .filter((h) => h && h.toLowerCase() !== "");
  const rows: FundaRow[] = [];
  for (const tr of Array.from(table.querySelectorAll("tbody tr"))) {
    const cells = Array.from(tr.querySelectorAll("td"));
    if (cells.length < 2) continue;
    const label = cellText(cells[0]).replace(/\+$/, "").trim();
    if (!label) continue;
    rows.push({ label, values: cells.slice(1).map((c) => num(cellText(c))) });
  }
  if (rows.length === 0) return null;
  return { title, headers: headers.slice(0, rows[0].values.length || headers.length), rows };
}

function rowVal(t: FundaTable | null, ...labels: string[]): (number | null)[] | null {
  if (!t) return null;
  const row = t.rows.find((r) => labels.some((l) => r.label.toLowerCase().includes(l)));
  return row ? row.values : null;
}

export function latest(t: (number | null)[] | null): number | null {
  if (!t) return null;
  for (let i = t.length - 1; i >= 0; i--) if (t[i] != null) return t[i];
  return null;
}

// 3-year CAGR from an annual series: (latest / value-4-periods-ago)^(1/3) − 1
function cagrFromSeries(series: (number | null)[] | null): number | null {
  if (!series) return null;
  const pts = series.filter((v): v is number => v != null && v > 0);
  if (pts.length < 4) return null;
  const end = pts[pts.length - 1];
  const start = pts[pts.length - 4];
  if (start <= 0 || end <= 0) return null;
  return Math.round((Math.pow(end / start, 1 / 3) - 1) * 1000) / 10;
}

export function parseScreener(html: string, ticker: string, url: string): ScreenerData {
  const doc = new DOMParser().parseFromString(html, "text/html");

  // name
  const name =
    cellText(doc.querySelector("h1.h2")) ||
    cellText(doc.querySelector("h1")) ||
    ticker;

  // about — first substantial paragraph inside company info
  let about = "";
  const aboutEl =
    doc.querySelector(".company-info .about") ?? doc.querySelector("#company-info .about");
  if (aboutEl) about = cellText(aboutEl);
  if (!about) {
    for (const p of Array.from(doc.querySelectorAll(".company-info p, #company-info p"))) {
      const t = cellText(p);
      if (t.length > 80) {
        about = t;
        break;
      }
    }
  }

  // top ratios
  const ratios: Record<string, string> = {};
  for (const li of Array.from(doc.querySelectorAll("#top-ratios li, ul#top-ratios li"))) {
    const nameEl = li.querySelector(".name");
    const valueEl = li.querySelector(".value") ?? li.querySelector(".number");
    const k = cellText(nameEl);
    let v = cellText(valueEl);
    const unit = cellText(li.querySelector(".value + span")) || "";
    if (unit && /cr|%|rs|₹/i.test(unit) && !v.includes(unit)) v = `${v} ${unit}`;
    if (k && v) ratios[k] = v;
  }

  const quarterly = parseTable(doc.querySelector("#quarters"), "Quarterly results");
  const yearly = parseTable(doc.querySelector("#profit-loss"), "Profit & loss (annual)");
  const balanceSheet = parseTable(doc.querySelector("#balance-sheet"), "Balance sheet");
  const cashFlow = parseTable(doc.querySelector("#cash-flow"), "Cash flow");
  const shareholding = parseTable(doc.querySelector("#shareholding"), "Shareholding pattern");

  // warehouse id — the peers comparison table loads via AJAX using this id
  const warehouseId = doc.querySelector("[data-warehouse-id]")?.getAttribute("data-warehouse-id") ?? null;

  // peers — the section on the base page has no table (AJAX-loaded), so peers
  // are parsed separately from /api/company/<warehouseId>/peers/ (see parsePeers)
  const peers: ScreenerData["peers"] = null;

  // pros / cons — markup is <div class="pros"><p class="title">Pros</p><ul>…
  const pros: string[] = [];
  const cons: string[] = [];
  for (const h of Array.from(doc.querySelectorAll("p.title, b, strong, h3, h4"))) {
    const t = cellText(h).toLowerCase();
    if (t !== "pros" && t !== "cons") continue;
    const container = h.parentElement?.querySelector("ul") ?? h.nextElementSibling;
    if (!container || container.tagName !== "UL") continue;
    for (const li of Array.from(container.querySelectorAll("li"))) {
      const txt = cellText(li);
      if (txt.length > 12) (t === "pros" ? pros : cons).push(txt);
    }
  }

  // compounded growth mini-tables inside #profit-loss
  // ("Compounded Sales Growth" / "Compounded Profit Growth" / "Return on Equity")
  const growth = { sales3y: null as number | null, profit3y: null as number | null, roe10y: null as number | null, priceCagr10y: null as number | null };
  const plSection = doc.querySelector("#profit-loss");
  if (plSection) {
    for (const tb of Array.from(plSection.querySelectorAll("table"))) {
      const firstRow = cellText(tb.querySelector("tbody tr")).toLowerCase();
      let target: "sales3y" | "profit3y" | "roe10y" | "priceCagr10y" | null = null;
      let period = "3 years";
      if (firstRow.startsWith("compounded sales growth")) target = "sales3y";
      else if (firstRow.startsWith("compounded profit growth")) target = "profit3y";
      else if (firstRow.startsWith("return on equity")) { target = "roe10y"; period = "10 years"; }
      else if (firstRow.startsWith("stock price cagr")) { target = "priceCagr10y"; period = "10 years"; }
      if (!target) continue;
      for (const tr of Array.from(tb.querySelectorAll("tbody tr"))) {
        const cells = Array.from(tr.querySelectorAll("td"));
        if (cells.length < 2) continue;
        if (cellText(cells[0]).toLowerCase().startsWith(period)) {
          growth[target] = num(cellText(cells[1]));
          break;
        }
      }
    }
  }

  return {
    ticker,
    name,
    about: about.slice(0, 900),
    url,
    warehouseId,
    ratios,
    quarterly,
    yearly,
    balanceSheet,
    cashFlow,
    peers,
    shareholding,
    growth,
    pros: pros.slice(0, 8),
    cons: cons.slice(0, 8),
    fetchedAt: Date.now(),
  };
}

// Peers comparison comes from screener's own AJAX endpoint — an HTML fragment
// whose table has header cells inside the first tbody row (no thead).
export function parsePeers(html: string): ScreenerData["peers"] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const table = doc.querySelector("table");
  if (!table) return null;
  const trs = Array.from(table.querySelectorAll("tr"));
  if (trs.length < 2) return null;
  const headerCells = Array.from(trs[0].querySelectorAll("th"));
  if (headerCells.length < 3) return null;
  // first two columns are S.No. + Name — keep only the metric columns so that
  // headers[j] aligns with cells[j + 2] on every data row
  const headers = headerCells.map(cellText).slice(2);
  const rows: PeerRow[] = [];
  for (const tr of trs.slice(1)) {
    const cells = Array.from(tr.querySelectorAll("td"));
    if (cells.length < 3) continue;
    const nameTxt = cellText(cells[1]);
    if (!nameTxt) continue;
    const metrics: Record<string, string> = {};
    for (let j = 0; j < headers.length && j + 2 < cells.length; j++) {
      metrics[headers[j]] = cellText(cells[j + 2]);
    }
    rows.push({ name: nameTxt, metrics });
    if (rows.length >= 12) break;
  }
  return rows.length > 0 ? { headers, rows } : null;
}

export async function getScreenerData(ticker: string, force = false): Promise<ScreenerData> {
  const clean = ticker.toUpperCase().replace(/\.NS$|\.BO$/g, "");
  const key = `screener.v2.${clean}`;
  const fetcher = async (): Promise<ScreenerData> => {
    // consolidated first, standalone fallback
    for (const suffix of ["consolidated/", ""]) {
      const url = `https://www.screener.in/company/${encodeURIComponent(clean)}/${suffix}`;
      try {
        const html = await proxiedText(url, 12_000);
        if (!html.includes("top-ratios") && !html.includes("company-info")) continue;
        const data = parseScreener(html, clean, url);
        if (Object.keys(data.ratios).length === 0 && !data.about) continue;
        // quality gate — a fast proxy race winner can be a truncated page;
        // only accept (and cache) pages whose core statements parsed
        if (!data.quarterly || !data.yearly) continue;
        // peers table is AJAX-loaded on screener — fetch it via the same proxy chain
        if (data.warehouseId) {
          try {
            const peersHtml = await proxiedText(
              `https://www.screener.in/api/company/${encodeURIComponent(data.warehouseId)}/peers/`,
              9_000,
            );
            data.peers = parsePeers(peersHtml);
          } catch {
            /* peers optional — DeepDive shows an honest empty state */
          }
        }
        return data;
      } catch {
        /* try next */
      }
    }
    throw new Error("screener unreachable");
  };
  try {
    const r = await swr(key, SCREENER_TTL, fetcher, { force, persist: true });
    return r.data;
  } catch (e) {
    const stale = getStale<ScreenerData>(key);
    if (stale) return stale.data;
    throw e;
  }
}

// ---- derived metrics used by the scorecard engine ----
export interface DerivedFundamentals {
  marketCapCr: number | null;
  pe: number | null;
  pb: number | null;
  bookValue: number | null;
  divYieldPct: number | null;
  rocePct: number | null;
  roePct: number | null;
  roe10yPct: number | null;
  faceValue: number | null;
  cmp: number | null;
  salesCagr3y: number | null;
  profitCagr3y: number | null;
  debtToEquity: number | null;
  ocfLatestCr: number | null;
  netProfitLatestCr: number | null;
  ocfToProfit: number | null;
  qSales: (number | null)[];
  qProfit: (number | null)[];
  qOpmPct: (number | null)[];
  promoterHolding: number | null;
  pledgedPct: number | null;
  fiiHolding: number | null;
  diiHolding: number | null;
  yearlySales: (number | null)[];
  yearlyProfit: (number | null)[];
}

export function derive(d: ScreenerData): DerivedFundamentals {
  const r = (k: string) => {
    for (const key of Object.keys(d.ratios)) {
      if (key.toLowerCase().startsWith(k.toLowerCase())) return num(d.ratios[key]);
    }
    return null;
  };

  const borrowings = latest(rowVal(d.balanceSheet, "borrowings"));
  const equityCapital = latest(rowVal(d.balanceSheet, "equity capital"));
  const reserves = latest(rowVal(d.balanceSheet, "reserves"));
  const debtToEquity =
    borrowings != null && equityCapital != null && reserves != null && equityCapital + reserves > 0
      ? borrowings / (equityCapital + reserves)
      : null;

  const ocfLatestCr = latest(rowVal(d.cashFlow, "operating activity"));
  const netProfitLatestCr = latest(rowVal(d.yearly, "net profit"));
  const ocfToProfit = ocfLatestCr != null && netProfitLatestCr != null && netProfitLatestCr > 0 ? ocfLatestCr / netProfitLatestCr : null;

  const promoterRow = rowVal(d.shareholding, "promoters");
  const fiiRow = rowVal(d.shareholding, "fii");
  const diiRow = rowVal(d.shareholding, "dii");
  const pledgeRow = rowVal(d.shareholding, "pledged");

  return {
    marketCapCr: r("Market Cap"),
    pe: r("Stock P/E") ?? r("P/E"),
    pb: r("Price to book") ?? r("P/B"),
    bookValue: r("Book Value"),
    divYieldPct: r("Dividend Yield"),
    rocePct: r("ROCE"),
    roePct: r("ROE"),
    faceValue: r("Face Value"),
    cmp: r("Current Price") ?? r("CMP"),
    // prefer screener's own compounded-growth tables; fall back to computing
    // from the annual series (last 4 data points → 3-year CAGR)
    salesCagr3y: d.growth?.sales3y ?? r("Sales growth 3Years") ?? cagrFromSeries(rowVal(d.yearly, "sales")),
    profitCagr3y: d.growth?.profit3y ?? r("Profit growth 3Years") ?? cagrFromSeries(rowVal(d.yearly, "net profit")),
    roe10yPct: d.growth?.roe10y ?? null,
    debtToEquity,
    ocfLatestCr,
    netProfitLatestCr,
    ocfToProfit,
    qSales: rowVal(d.quarterly, "sales") ?? [],
    qProfit: rowVal(d.quarterly, "net profit") ?? [],
    qOpmPct: rowVal(d.quarterly, "opm") ?? [],
    promoterHolding: latest(promoterRow),
    pledgedPct: latest(pledgeRow),
    fiiHolding: latest(fiiRow),
    diiHolding: latest(diiRow),
    yearlySales: rowVal(d.yearly, "sales") ?? [],
    yearlyProfit: rowVal(d.yearly, "net profit") ?? [],
  };
}
