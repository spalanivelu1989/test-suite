import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { collectLinks, findBrokenLinks, resolveLink } from "./links";

const ROOT = fileURLToPath(
  new URL("../../../business-context", import.meta.url),
);

test("resolveLink: handles root-absolute, relative, anchors, and ignores non-concepts", () => {
  const from = "/x/business-context/apps/po/screens/po-object-page.md";
  const root = "/x/business-context";

  // root-absolute (from the bundle-tree root)
  assert.equal(
    resolveLink(from, "/platform/sap-fiori/index.md", root),
    "/x/business-context/platform/sap-fiori/index.md",
  );
  // relative (from the file's directory) + anchor stripped
  assert.equal(
    resolveLink(from, "../rules/three-way-match.md#tolerance", root),
    "/x/business-context/apps/po/rules/three-way-match.md",
  );
  // ignored: external + non-.md
  assert.equal(resolveLink(from, "https://sap.com/docs", root), null);
  assert.equal(resolveLink(from, "./image.png", root), null);
});

// The real guard: every Markdown link in the authored bundles must resolve.
test("link integrity: no broken concept links across business-context", async () => {
  const broken = await findBrokenLinks(ROOT);
  const detail = broken.map((b) => `  ${b.from}  ->  ${b.target}`).join("\n");
  assert.deepEqual(broken, [], `Broken concept links found:\n${detail}`);
});

// Sanity: the graph actually exists and is cross-linked (not an empty tree).
test("link integrity: the graph is non-trivially cross-linked", async () => {
  const links = await collectLinks(ROOT);
  assert.ok(
    links.length >= 40,
    `expected a dense graph, got ${links.length} links`,
  );

  const sub = (p: string) => p.slice(0, p.lastIndexOf("/"));
  const lateral = links.filter((l) => sub(l.from) !== sub(l.to));
  assert.ok(
    lateral.length > links.length / 2,
    `expected mostly lateral edges, got ${lateral.length}/${links.length}`,
  );
});
