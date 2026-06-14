// Loads OKF concept docs (a `.md` file = one concept) into a struct the selection
// and formatting steps can work with. Pure-ish IO leaf: reads a file, splits its
// frontmatter from its body. Best-effort — an unreadable/malformed file yields null
// rather than throwing, so one bad doc never sinks a run.

import { readFile } from "node:fs/promises";
import { basename, relative } from "node:path";
import { parseFrontmatter } from "./frontmatter";
import { walkMarkdown } from "./links";

/** One authored concept (a rule, screen, workflow, pattern, …). */
export interface ConceptDoc {
  /** Stable id, e.g. `apps/manage-purchase-orders/rules/three-way-match`. */
  id: string;
  path: string;
  type: string;
  title: string;
  description: string;
  /** Markdown body after the frontmatter, trimmed. */
  body: string;
  /** title + description + body, for lexical scoring. */
  text: string;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Load one concept doc; null if it cannot be read. */
export async function loadConcept(
  path: string,
  root: string,
): Promise<ConceptDoc | null> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return null;
  }
  const { data, body } = parseFrontmatter(raw);
  const title = str(data.title) || basename(path, ".md");
  const description = str(data.description);
  const trimmedBody = body.trim();
  return {
    id: relative(root, path).replace(/\.md$/, ""),
    path,
    type: str(data.type) || "Concept",
    title,
    description,
    body: trimmedBody,
    text: `${title}\n${description}\n${trimmedBody}`,
  };
}

/**
 * Load every concept under `dir`, EXCLUDING `index.md` navigation pages (they are
 * tables of contents, not content — selection works over real concepts only).
 */
export async function loadLeafConcepts(
  dir: string,
  root: string,
): Promise<ConceptDoc[]> {
  const files = (await walkMarkdown(dir)).filter(
    (f) => basename(f) !== "index.md",
  );
  const docs = await Promise.all(files.map((f) => loadConcept(f, root)));
  return docs.filter((d): d is ConceptDoc => d !== null);
}
