// Every external source the terminal reads. All free, no API keys.

export interface FeedDef {
  name: string;
  url: string;
  kind: "news" | "policy" | "tenders" | "gold" | "global" | "speculation";
}

const bing = (q: string) =>
  `https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=rss&setlang=en-IN&cc=IN`;

export const FEEDS: FeedDef[] = [
  // Publisher RSS
  { name: "Economic Times · Top", url: "https://economictimes.indiatimes.com/rssfeedstopstories.cms", kind: "news" },
  { name: "Economic Times · Markets", url: "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms", kind: "news" },
  { name: "Livemint · Markets", url: "https://www.livemint.com/rss/markets", kind: "news" },
  { name: "Livemint · Companies", url: "https://www.livemint.com/rss/companies", kind: "news" },
  { name: "BusinessLine · Markets", url: "https://www.thehindubusinessline.com/markets/feeder/default.rss", kind: "news" },
  { name: "BusinessLine · Companies", url: "https://www.thehindubusinessline.com/companies/feeder/default.rss", kind: "news" },
  { name: "BusinessLine · Economy", url: "https://www.thehindubusinessline.com/economy/feeder/default.rss", kind: "news" },
  { name: "CNBC-TV18 · Market", url: "https://www.cnbctv18.com/commonfeeds/v1/cne/rss/market.xml", kind: "news" },
  { name: "Financial Express", url: "https://www.financialexpress.com/feed/", kind: "news" },
  { name: "Indian Express · Business", url: "https://indianexpress.com/section/business/feed/", kind: "news" },
  { name: "Moneycontrol · Latest", url: "https://www.moneycontrol.com/rss/latestnews.xml", kind: "news" },
  // Policy & regulation
  { name: "SEBI", url: "https://www.sebi.gov.in/sebirss.xml", kind: "policy" },
  { name: "SQ · RBI SEBI MoF", url: bing('RBI SEBI "Ministry of Finance" India policy markets'), kind: "policy" },
  // Standing queries — power Tenders, Chanakya Watch, Gold
  {
    name: "SQ · Tenders & orders",
    url: bing('("wins order" OR "bags order" OR "bags contract" OR "letter of award" OR "L1 bidder" OR "EPC order") India company'),
    kind: "tenders",
  },
  {
    name: "SQ · PSU defence rail orders",
    url: bing("(HAL OR BEL OR RVNL OR IRFC OR IRCON OR BEML) order contract crore"),
    kind: "tenders",
  },
  { name: "SQ · Disinvestment", url: bing('(disinvestment OR privatisation OR "stake sale") PSU India'), kind: "speculation" },
  { name: "SQ · PLI approvals", url: bing('("PLI scheme" OR "production linked incentive") approved India'), kind: "speculation" },
  {
    name: "SQ · Gold India",
    url: bing('("import duty" gold OR "gold demand" OR "gold price" OR "central bank gold") India'),
    kind: "gold",
  },
  {
    name: "SQ · Electoral funding / ties",
    url: bing('("electoral bonds" OR "political funding") company India'),
    kind: "speculation",
  },
  { name: "SQ · IPO India", url: bing('IPO ("price band" OR "opens for subscription" OR GMP) India NSE BSE'), kind: "news" },
  { name: "SQ · Global cues", url: bing("(Fed OR FOMC OR \"Wall Street\") Indian markets gift nifty"), kind: "global" },
];

// Yahoo Finance chart endpoint symbols (server-equivalent, via proxy)
export const TICKER_SYMBOLS: { symbol: string; label: string; decimals?: number }[] = [
  { symbol: "^NSEI", label: "NIFTY 50" },
  { symbol: "^BSESN", label: "SENSEX" },
  { symbol: "^NSEBANK", label: "BANK NIFTY" },
  { symbol: "^INDIAVIX", label: "INDIA VIX" },
  { symbol: "INR=X", label: "USD/INR", decimals: 3 },
  { symbol: "GC=F", label: "GOLD $/oz" },
  { symbol: "SI=F", label: "SILVER $/oz" },
  { symbol: "BZ=F", label: "BRENT" },
  { symbol: "HG=F", label: "COPPER" },
  { symbol: "^TNX", label: "US 10Y" },
  { symbol: "DX-Y.NYB", label: "DXY" },
  { symbol: "^GSPC", label: "S&P 500" },
  { symbol: "^IXIC", label: "NASDAQ" },
  { symbol: "^N225", label: "NIKKEI" },
  { symbol: "^HSI", label: "HANG SENG" },
];

export const SECTOR_INDICES: { symbol: string; label: string }[] = [
  { symbol: "^NSEBANK", label: "Banks" },
  { symbol: "^CNXIT", label: "IT" },
  { symbol: "^CNXAUTO", label: "Auto" },
  { symbol: "^CNXPHARMA", label: "Pharma" },
  { symbol: "^CNXFMCG", label: "FMCG" },
  { symbol: "^CNXMETAL", label: "Metals" },
  { symbol: "^CNXENERGY", label: "Energy" },
  { symbol: "^CNXREALTY", label: "Realty" },
  { symbol: "^CNXINFRA", label: "Infra" },
  { symbol: "^CNXPSUBANK", label: "PSU Banks" },
  { symbol: "^CNXMEDIA", label: "Media" },
  { symbol: "^CNXCONSUMPTION", label: "Consumption" },
];

export const yahooChart = (symbol: string, range = "5d", interval = "1d") =>
  `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;

export const NSE = {
  allIndices: "https://www.nseindia.com/api/allIndices",
  fiiDii: "https://www.nseindia.com/api/fiidiiTradeReact",
  holidays: "https://www.nseindia.com/api/holiday-master?type=trading",
};

export const GOLD_OZ_TO_10G = 10 / 31.1035;
