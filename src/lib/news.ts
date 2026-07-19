// News ingestion pipeline: fetch (via proxy chain) → parse RSS/Atom → classify
// → dedupe → sort. Per-feed status is tracked so the UI can be honest about
// which sources are reachable right now.
import { FEEDS } from "./sources";
import { proxiedText } from "./proxy";
import { classifyStory, dedupeStories, type RawStory } from "./classify";
import type { FeedStatus, NewsItem } from "./types";
import { swr, TTL, getStale } from "./cache";

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function text(el: Element | null | undefined, tag: string): string {
  return el?.getElementsByTagName(tag)[0]?.textContent?.trim() ?? "";
}

export function parseFeed(xml: string, feedName: string, feedKind: string, maxItems = 40): RawStory[] {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  if (doc.querySelector("parsererror")) throw new Error("XML parse error");
  const items: RawStory[] = [];

  const rssItems = Array.from(doc.getElementsByTagName("item"));
  const atomItems = Array.from(doc.getElementsByTagName("entry"));

  const push = (title: string, url: string, dateStr: string, desc: string) => {
    if (!title || !url) return;
    // Google News wraps the real publisher in the <source> tag
    const publishedAt = Date.parse(dateStr);
    items.push({
      title: stripHtml(title),
      url,
      source: feedName,
      // undated items (e.g. SEBI RSS) sink to mid-corpus instead of pinning to the top
      publishedAt: isNaN(publishedAt) ? Date.now() - 8 * 3_600_000 : publishedAt,
      feedKind,
      description: stripHtml(desc).slice(0, 400),
    });
  };

  for (const it of rssItems.slice(0, maxItems)) {
    const srcTag = it.getElementsByTagName("source")[0]?.textContent?.trim();
    push(
      text(it, "title"),
      text(it, "link") || it.getElementsByTagName("guid")[0]?.textContent?.trim() || "",
      text(it, "pubDate") || text(it, "dc:date"),
      text(it, "description"),
    );
    if (srcTag) items[items.length - 1] && (items[items.length - 1].source = srcTag);
  }
  for (const it of atomItems.slice(0, maxItems)) {
    const link = Array.from(it.getElementsByTagName("link"))
      .map((l) => l.getAttribute("href") ?? "")
      .find((h) => h);
    push(text(it, "title"), link ?? "", text(it, "published") || text(it, "updated"), text(it, "summary") || text(it, "content"));
  }
  return items;
}

export interface NewsResult {
  items: NewsItem[];
  statuses: FeedStatus[];
  fetchedAt: number;
  anyOk: boolean;
}

const CONCURRENCY = 6;

async function mapPool<T, R>(arr: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(arr.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, arr.length) }, async () => {
      while (i < arr.length) {
        const idx = i++;
        out[idx] = await fn(arr[idx]);
      }
    }),
  );
  return out;
}

async function fetchAllFeeds(): Promise<NewsResult> {
  const results = await mapPool(FEEDS, CONCURRENCY, async (feed): Promise<{ status: FeedStatus; stories: RawStory[] }> => {
    try {
      const xml = await proxiedText(feed.url, 9_000);
      // SEBI enforcement is high-volume & undated — inform, don't flood.
      // ET Top carries general news — keep it a garnish, not the meal.
      const cap = feed.name === "SEBI" ? 8 : feed.name === "Economic Times · Top" ? 15 : 40;
      const stories = parseFeed(xml, feed.name, feed.kind, cap);
      return { status: { name: feed.name, ok: true, count: stories.length, lastOk: Date.now() }, stories };
    } catch (e) {
      return {
        status: { name: feed.name, ok: false, count: 0, error: e instanceof Error ? e.message : "failed" },
        stories: [],
      };
    }
  });

  const statuses = results.map((r) => r.status);
  const raw = results.flatMap((r) => r.stories);
  // drop clearly non-business verticals that slip in via top-stories feeds
  const NON_BUSINESS = /\/(sports|entertainment|lifestyle|magazines|web-series|television|videos|astrology|education|new-updates|weather)\//i;
  const filtered = raw.filter((s) => !NON_BUSINESS.test(s.url));
  const classified = dedupeStories(filtered.map(classifyStory));
  return {
    items: classified,
    statuses,
    fetchedAt: Date.now(),
    anyOk: statuses.some((s) => s.ok),
  };
}

// bump when classification/shape changes so stale cached corpora are discarded
const KEY = "news.v2";
const ARCHIVE_KEY = "artha.archive";
const ARCHIVE_MAX_AGE = 180 * 86_400_000; // 180 days
const ARCHIVE_MAX_ITEMS = 800;

// High-signal categories worth remembering across sessions so the
// Chanakya engine accumulates a real evidence trail over weeks.
const ARCHIVE_CATS = new Set(["tenders-contracts"]);

export function getArchive(): NewsItem[] {
  try {
    const raw = localStorage.getItem(ARCHIVE_KEY);
    const items: NewsItem[] = raw ? JSON.parse(raw) : [];
    return items.filter((i) => Date.now() - i.publishedAt < ARCHIVE_MAX_AGE);
  } catch {
    return [];
  }
}

function updateArchive(items: NewsItem[]): void {
  try {
    const keep = items.filter((i) => ARCHIVE_CATS.has(i.category) || i.isSpeculation);
    if (keep.length === 0) return;
    const map = new Map<string, NewsItem>();
    for (const i of getArchive()) map.set(i.id, i);
    for (const i of keep) map.set(i.id, i);
    const merged = [...map.values()]
      .filter((i) => Date.now() - i.publishedAt < ARCHIVE_MAX_AGE)
      .sort((a, b) => b.publishedAt - a.publishedAt)
      .slice(0, ARCHIVE_MAX_ITEMS);
    localStorage.setItem(ARCHIVE_KEY, JSON.stringify(merged));
  } catch {
    /* quota — ignore */
  }
}

export async function getNews(force = false): Promise<NewsResult> {
  try {
    const r = await swr(
      KEY,
      TTL.news,
      async () => {
        const res = await fetchAllFeeds();
        updateArchive(res.items);
        // cap persisted corpus to keep localStorage light
        return { ...res, items: res.items.slice(0, 300) };
      },
      { force, persist: true },
    );
    return { ...r.data, fetchedAt: r.at };
  } catch {
    const stale = getStale<NewsResult>(KEY);
    if (stale) return { ...stale.data, fetchedAt: stale.at, anyOk: false };
    return { items: [], statuses: [], fetchedAt: Date.now(), anyOk: false };
  }
}
