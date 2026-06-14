// Walks the Markdown link graph of an OKF bundle tree and finds dangling links.
// The authored layer IS a graph of `[label](target.md)` links (see
// business-context/README.md); a broken cross-reference silently drops an edge,
// so this is the guard that keeps the graph honest. Also reused by the future
// retrieval layer, which needs the same link resolution to walk concept → concept.
//
// Resolution mirrors the OKF spec's two link forms:
//   • root-absolute  `/platform/sap-fiori/index.md`  → from the bundle-tree root
//   • relative       `../rules/three-way-match.md`   → from the file's directory
// Anchors (`#joins`) are stripped; external (`http(s)://`) and non-`.md` targets
// are ignored. Links inside fenced/inline code are skipped (examples, not edges).

import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

const LINK = /\[[^\]]*\]\(([^)]+)\)/g;
const FENCED = /```[\s\S]*?```/g; // fenced code blocks
const INLINE = /`[^`]*`/g; // inline code spans

/** A resolved concept→concept edge. */
export interface ConceptLink {
  /** Absolute path of the file the link appears in. */
  from: string;
  /** The link target exactly as written. */
  target: string;
  /** Absolute path the target resolves to (anchor stripped). */
  to: string;
  /** Whether `to` exists on disk. */
  exists: boolean;
}

/** Strip code so example snippets are never mistaken for real links. */
function stripCode(md: string): string {
  return md.replace(FENCED, "").replace(INLINE, "");
}

/** Resolve one raw link target to an absolute `.md` path, or null if not a concept link. */
export function resolveLink(
  fromFile: string,
  target: string,
  root: string,
): string | null {
  const clean = target.split("#")[0].trim();
  if (clean === "" || /^[a-z]+:\/\//i.test(clean)) return null; // empty / external
  if (!clean.endsWith(".md")) return null; // not a concept doc
  return clean.startsWith("/")
    ? resolve(root, clean.replace(/^\/+/, "")) // root-absolute
    : resolve(dirname(fromFile), clean); // relative to file
}

/** Recursively list every `.md` file under `dir` (absolute paths). */
export async function walkMarkdown(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walkMarkdown(p)));
    else if (e.name.endsWith(".md")) out.push(p);
  }
  return out.sort();
}

/** Every resolved concept link under `root` (existence flagged). */
export async function collectLinks(root: string): Promise<ConceptLink[]> {
  const files = await walkMarkdown(root);
  const links: ConceptLink[] = [];
  for (const from of files) {
    const body = stripCode(await readFile(from, "utf8"));
    for (const m of body.matchAll(LINK)) {
      const target = m[1];
      const to = resolveLink(from, target, root);
      if (to) links.push({ from, target, to, exists: existsSync(to) });
    }
  }
  return links;
}

/** Just the broken edges, as repo-relative strings for a readable assertion. */
export async function findBrokenLinks(
  root: string,
): Promise<Array<{ from: string; target: string }>> {
  const links = await collectLinks(root);
  return links
    .filter((l) => !l.exists)
    .map((l) => ({ from: relative(root, l.from), target: l.target }));
}
