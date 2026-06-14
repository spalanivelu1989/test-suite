// A deliberately tiny YAML-frontmatter parser for OKF bundle `index.md` files.
// There is no YAML dependency in this project, and the bundle frontmatter only
// uses a small subset: top-level scalars, top-level inline arrays (`[a, b]`),
// block lists (`- item`), and ONE level of nested map (`applies_to:` → indented
// scalars/arrays). That subset — and only that — is what this parses; anything
// fancier (anchors, multi-line scalars, deep nesting) is out of scope by design.
//
// Never throws: malformed input yields whatever parsed cleanly (best-effort),
// mirroring the rest of the knowledge layer.

export interface Frontmatter {
  /** Parsed key/value tree (depth ≤ 2). Values are string | string[] | object. */
  data: Record<string, unknown>;
  /** The Markdown body after the closing `---`. */
  body: string;
}

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** Split a document into its YAML frontmatter block and Markdown body. */
export function parseFrontmatter(content: string): Frontmatter {
  const m = content.match(FENCE);
  if (!m) return { data: {}, body: content };
  return { data: parseBlock(m[1]), body: content.slice(m[0].length) };
}

function parseBlock(block: string): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  // The most-recent indent-0 `key:` with an empty value — children (indented
  // `key: val` or `- item` lines) attach to it as a map or a list respectively.
  let pendingParent: string | null = null;

  for (const raw of block.split(/\r?\n/)) {
    if (raw.trim() === "" || raw.trim().startsWith("#")) continue; // blank / comment
    const indent = raw.length - raw.trimStart().length;
    const line = raw.trim();

    // Block-list item — belongs to the pending parent as an array element.
    if (line.startsWith("- ")) {
      if (pendingParent)
        ensureArray(data, pendingParent).push(parseScalar(line.slice(2)));
      continue;
    }

    const kv = line.match(/^([\w.-]+):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    const rest = kv[2];

    if (indent === 0) {
      if (rest === "") {
        // A nested map or block list follows — decide lazily on first child.
        pendingParent = key;
      } else {
        data[key] = parseScalar(rest);
        pendingParent = null;
      }
    } else if (pendingParent) {
      // Indented `key: val` — a child of the pending nested map.
      ensureObject(data, pendingParent)[key] = parseScalar(rest);
    }
  }
  return data;
}

/** Parse a scalar or an inline flow array (`[a, "b"]`). Everything stays a string. */
function parseScalar(input: string): string | string[] {
  const v = input.trim();
  if (v.startsWith("[") && v.endsWith("]")) {
    const inner = v.slice(1, -1).trim();
    if (inner === "") return [];
    return inner.split(",").map((s) => stripQuotes(s.trim()));
  }
  return stripQuotes(v);
}

function stripQuotes(v: string): string {
  if (
    v.length >= 2 &&
    (v[0] === '"' || v[0] === "'") &&
    v[v.length - 1] === v[0]
  ) {
    return v.slice(1, -1);
  }
  return v;
}

function ensureObject(
  data: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const cur = data[key];
  if (cur && typeof cur === "object" && !Array.isArray(cur)) {
    return cur as Record<string, unknown>;
  }
  const obj: Record<string, unknown> = {};
  data[key] = obj;
  return obj;
}

function ensureArray(data: Record<string, unknown>, key: string): unknown[] {
  const cur = data[key];
  if (Array.isArray(cur)) return cur;
  const arr: unknown[] = [];
  data[key] = arr;
  return arr;
}
