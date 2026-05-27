// Pure URL helpers for the crawler. No I/O — unit-testable.

/** Strip hash + trailing slash so the same page isn't visited twice. */
export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = "";
    let s = u.toString();
    if (s.endsWith("/")) s = s.slice(0, -1);
    return s;
  } catch {
    return raw;
  }
}

/** Same registrable origin (protocol + host + port). Keeps the crawl on-site. */
export function isSameOrigin(base: string, candidate: string): boolean {
  try {
    return new URL(base).origin === new URL(candidate, base).origin;
  } catch {
    return false;
  }
}

/** Only crawl http(s) pages; skip mailto:, tel:, javascript:, files, etc. */
export function isCrawlable(url: string): boolean {
  try {
    const proto = new URL(url).protocol;
    return proto === "http:" || proto === "https:";
  } catch {
    return false;
  }
}
