import assert from "node:assert/strict";
import { test } from "node:test";
import { parseFrontmatter } from "./frontmatter";

test("parseFrontmatter: scalars, inline arrays, nested map, body", () => {
  const { data, body } = parseFrontmatter(
    [
      "---",
      "type: App",
      "title: Manage Purchase Orders",
      "applies_to:",
      "  origin: https://northwind.s4hana.ondemand.com",
      '  routes: ["#PurchaseOrder-manage"]',
      "built_on: [sap-fiori]",
      "tags: [procurement, mm]",
      "---",
      "# Heading",
      "body text",
    ].join("\n"),
  );

  assert.equal(data.type, "App");
  assert.equal(data.title, "Manage Purchase Orders");
  assert.deepEqual(data.applies_to, {
    origin: "https://northwind.s4hana.ondemand.com",
    routes: ["#PurchaseOrder-manage"],
  });
  assert.deepEqual(data.built_on, ["sap-fiori"]);
  assert.deepEqual(data.tags, ["procurement", "mm"]);
  assert.equal(body.trim(), "# Heading\nbody text");
});

test("parseFrontmatter: block lists and full-line comments", () => {
  const { data } = parseFrontmatter(
    [
      "---",
      "# a comment",
      "routes:",
      '  - "#PurchaseOrder-manage"',
      "  - '#PurchaseOrder-display'",
      "---",
      "x",
    ].join("\n"),
  );
  assert.deepEqual(data.routes, [
    "#PurchaseOrder-manage",
    "#PurchaseOrder-display",
  ]);
});

test("parseFrontmatter: no frontmatter → empty data, body untouched", () => {
  const { data, body } = parseFrontmatter("# Just markdown\nno frontmatter");
  assert.deepEqual(data, {});
  assert.equal(body, "# Just markdown\nno frontmatter");
});

test("parseFrontmatter: never throws on malformed input", () => {
  assert.doesNotThrow(() => parseFrontmatter("---\n: : : \n  - \n---\n"));
});
