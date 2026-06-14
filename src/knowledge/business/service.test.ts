import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { selectConcepts } from "./select";
import { createBusinessContextService } from "./service";
import type { ConceptDoc } from "./concept";

const ROOT = fileURLToPath(
  new URL("../../../business-context", import.meta.url),
);
const PO_URL = "https://northwind.s4hana.ondemand.com/ui#PurchaseOrder-manage";

function doc(over: Partial<ConceptDoc> & { id: string }): ConceptDoc {
  return {
    path: `/x/${over.id}.md`,
    type: "Concept",
    title: over.id,
    description: "",
    body: "",
    text: over.id,
    ...over,
  };
}

test("selectConcepts: ranks an overlapping rule first, drops irrelevant docs", () => {
  const docs = [
    doc({
      id: "rules/three-way-match",
      type: "Business Rule",
      text: "invoice quantity over delivery tolerance blocked",
    }),
    doc({
      id: "patterns/value-help",
      type: "UI Pattern",
      text: "value help dialog F4 selection",
    }),
  ];
  const picked = selectConcepts(
    docs,
    "post a supplier invoice over the ordered quantity",
    { k: 5 },
  );
  assert.equal(picked[0]?.id, "rules/three-way-match");
});

test("selectConcepts: no overlap → falls back to the bundle's business rules", () => {
  const docs = [
    doc({
      id: "rules/release-strategy",
      type: "Business Rule",
      text: "approval thresholds release",
    }),
    doc({
      id: "patterns/object-page",
      type: "UI Pattern",
      text: "object page header sections",
    }),
  ];
  const picked = selectConcepts(docs, "completely unrelated zzz query", {
    k: 5,
  });
  assert.deepEqual(
    picked.map((d) => d.id),
    ["rules/release-strategy"],
  );
});

test("getBusinessOverview: Northwind URL → app map + platform", async () => {
  const svc = createBusinessContextService({ root: ROOT });
  assert.equal(svc.enabled, true);
  const ov = await svc.getBusinessOverview(PO_URL);
  assert.ok(ov, "expected an overview");
  assert.equal(ov.appTitle, "Manage Purchase Orders");
  assert.deepEqual(ov.platforms, ["SAP Fiori"]);
  assert.match(ov.block, /<business-context>/);
  assert.match(ov.block, /Procure to Pay/);
  assert.match(ov.block, /Post a Supplier Invoice/);
});

test("getBusinessContext: invoice scenario → three-way-match rule with the tolerance", async () => {
  const svc = createBusinessContextService({ root: ROOT });
  const ctx = await svc.getBusinessContext(PO_URL, [
    "Post a supplier invoice for more units than were ordered",
  ]);
  assert.ok(ctx, "expected a context block");
  assert.ok(
    ctx.concepts.some((c) => c.endsWith("rules/three-way-match")),
    `three-way-match should be selected, got ${ctx.concepts.join(", ")}`,
  );
  assert.match(ctx.block, /10%/);
  assert.match(ctx.block, /blocked|hard error/i);
});

test("getBusinessOverview: unknown URL → null (run cold)", async () => {
  const svc = createBusinessContextService({ root: ROOT });
  assert.equal(
    await svc.getBusinessOverview("https://unknown.example.com/x"),
    null,
  );
});

test("service: missing business-context dir → disabled, null results, never throws", async () => {
  const svc = createBusinessContextService({ root: "/no/such/dir" });
  assert.equal(svc.enabled, false);
  assert.equal(await svc.getBusinessOverview(PO_URL), null);
  assert.equal(await svc.getBusinessContext(PO_URL, ["x"]), null);
});
