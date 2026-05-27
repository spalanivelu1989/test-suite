import type {
  CrawledPage,
  CrawlResult,
  PageElement,
  RunConfig,
} from "../types";
import { isCrawlable, isSameOrigin, normalizeUrl } from "./url";

/** What a page fetch yields. The Playwright fetcher (T5b) implements this. */
export interface FetchedPage {
  title: string;
  links: string[];
  elements: PageElement[];
}

/** Injectable so BFS traversal is testable without a real browser. */
export interface PageFetcher {
  fetch(url: string): Promise<FetchedPage>;
}

const DEFAULT_MAX_DEPTH = 2;
const DEFAULT_MAX_PAGES = 25;

/**
 * Breadth-first, same-origin crawl from the entry URL (T5a). Honors maxDepth and
 * maxPages scope limits (R1). Returns the visited page set (R2); element
 * extraction is the fetcher's job (T5b).
 */
export async function crawl(
  config: RunConfig,
  fetcher: PageFetcher,
): Promise<CrawlResult> {
  const maxDepth = config.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxPages = config.maxPages ?? DEFAULT_MAX_PAGES;
  const entry = normalizeUrl(config.url);

  const visited = new Set<string>();
  const pages: CrawledPage[] = [];
  const queue: { url: string; depth: number }[] = [{ url: entry, depth: 0 }];

  while (queue.length > 0 && pages.length < maxPages) {
    const { url, depth } = queue.shift()!;
    if (visited.has(url)) continue;
    visited.add(url);

    let fetched: FetchedPage;
    try {
      fetched = await fetcher.fetch(url);
    } catch {
      // A page that fails to load is skipped, not fatal — the run continues.
      continue;
    }

    pages.push({
      url,
      title: fetched.title,
      depth,
      links: fetched.links,
      elements: fetched.elements,
    });

    if (depth >= maxDepth) continue;
    for (const link of fetched.links) {
      const norm = normalizeUrl(link);
      if (
        !visited.has(norm) &&
        isCrawlable(norm) &&
        isSameOrigin(entry, norm)
      ) {
        queue.push({ url: norm, depth: depth + 1 });
      }
    }
  }

  return { entryUrl: entry, pages };
}
