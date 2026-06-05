// App identity = normalized origin (Spec R5, Plan D6). All runs against the same
// origin aggregate to one App; individual URLs are recorded at the Page level.
//
// Rules: lowercase host, drop a leading "www.", keep scheme + host (+ non-default
// port), and DROP path, query, fragment, and trailing slash. Two URLs that differ
// only in path/query/fragment/case/www map to the same id; different origins differ.

/**
 * Normalize a URL to its app id (origin), e.g.
 *   `http://www.X.com/a?b=1#c` → `http://x.com`
 *   `https://x.com/`           → `https://x.com`
 * Returns a best-effort lowercased trim for unparseable input (never throws).
 */
export function normalizeOrigin(url: string): string {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    // Tolerate a bare host ("x.com/path") by assuming https.
    try {
      u = new URL(`https://${url.trim()}`);
    } catch {
      return url.trim().toLowerCase();
    }
  }
  const scheme = u.protocol.replace(/:$/, "").toLowerCase();
  let host = u.hostname.toLowerCase();
  if (host.startsWith("www.")) host = host.slice(4);
  // Keep an explicit non-default port so :3000 vs :4000 are distinct apps.
  const defaultPort =
    (scheme === "http" && u.port === "80") ||
    (scheme === "https" && u.port === "443");
  const port = u.port && !defaultPort ? `:${u.port}` : "";
  return `${scheme}://${host}${port}`;
}
