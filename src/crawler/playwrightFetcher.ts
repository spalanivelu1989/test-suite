import { type Browser, chromium, type Page } from "playwright";
import type { FetchedPage, PageFetcher } from "./crawl";

const NAV_TIMEOUT_MS = 20_000;

/** Closable Playwright-backed fetcher (T5b). Reuses one browser across fetches. */
export interface ClosablePageFetcher extends PageFetcher {
  close(): Promise<void>;
}

/** Extracts links + interactive elements from a live page. Runs in the browser. */
async function extractFromPage(page: Page): Promise<FetchedPage> {
  const title = await page.title();
  // esbuild/tsx instruments in-source functions with a `__name` helper that does
  // not exist in the browser. Define a no-op shim via string eval (not
  // instrumented) before running the typed page.evaluate below.
  await page.evaluate(
    "globalThis.__name = globalThis.__name || function (f) { return f; };",
  );
  const data = await page.evaluate(() => {
    const abs = (href: string) => {
      try {
        return new URL(href, document.baseURI).toString();
      } catch {
        return "";
      }
    };
    const links = Array.from(document.querySelectorAll("a[href]"))
      .map((a) => abs((a as HTMLAnchorElement).getAttribute("href") || ""))
      .filter((h) => h.length > 0);

    const selectorFor = (el: Element): string => {
      const id = el.getAttribute("id");
      if (id) return `#${CSS.escape(id)}`;
      const testid = el.getAttribute("data-testid");
      if (testid) return `[data-testid="${testid}"]`;
      const name = el.getAttribute("name");
      if (name) return `${el.tagName.toLowerCase()}[name="${name}"]`;
      return el.tagName.toLowerCase();
    };
    const labelFor = (el: Element): string =>
      (
        el.getAttribute("aria-label") ||
        (el as HTMLElement).innerText ||
        el.getAttribute("placeholder") ||
        el.getAttribute("value") ||
        ""
      )
        .trim()
        .slice(0, 120);

    const interactive = Array.from(
      document.querySelectorAll(
        "a[href], button, input, select, textarea, [role='button']",
      ),
    ).map((el) => ({
      role: el.getAttribute("role") || el.tagName.toLowerCase(),
      label: labelFor(el),
      selector: selectorFor(el),
    }));

    return { links, elements: interactive };
  });

  return { title, links: data.links, elements: data.elements };
}

export async function createPlaywrightFetcher(): Promise<ClosablePageFetcher> {
  const browser: Browser = await chromium.launch({ headless: true });

  return {
    async fetch(url: string): Promise<FetchedPage> {
      const page = await browser.newPage();
      try {
        await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: NAV_TIMEOUT_MS,
        });
        return await extractFromPage(page);
      } finally {
        await page.close();
      }
    },
    async close() {
      await browser.close();
    },
  };
}

/** Exported for integration testing against page.setContent (no network). */
export const __test = { extractFromPage };
