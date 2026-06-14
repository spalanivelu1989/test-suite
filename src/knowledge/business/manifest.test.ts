import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildManifest } from "./manifest";
import { resolveBusinessContext } from "./resolver";

// Integration: load the REAL scaffolded bundles under <repo>/business-context and
// resolve the Northwind PO app end-to-end. Proves the authored files parse and the
// resolver wires up against them.
const ROOT = fileURLToPath(
  new URL("../../../business-context", import.meta.url),
);

test("buildManifest: loads the scaffolded SAP Fiori bundles", async () => {
  const m = await buildManifest(ROOT);

  assert.ok(m.platforms.has("sap-fiori"), "sap-fiori platform bundle loaded");

  const po = m.apps.find((a) => a.id === "apps/manage-purchase-orders");
  assert.ok(po, "manage-purchase-orders app bundle loaded");
  assert.equal(po.origin, "https://northwind.s4hana.ondemand.com");
  assert.ok(po.routes.includes("#PurchaseOrder-manage"));
  assert.ok(po.builtOn.includes("sap-fiori"));
  assert.equal(po.status, "active");
});

test("resolve: Northwind PO URL → app + sap-fiori platform", async () => {
  const m = await buildManifest(ROOT);
  const r = resolveBusinessContext(
    "https://northwind.s4hana.ondemand.com/ui#PurchaseOrder-manage",
    m,
  );
  assert.equal(r.app?.id, "apps/manage-purchase-orders");
  assert.equal(r.matchedBy, "origin+route");
  assert.deepEqual(
    r.platforms.map((p) => p.id),
    ["platform/sap-fiori"],
  );
});

test("buildManifest: missing directory → empty manifest, never throws", async () => {
  const m = await buildManifest("/no/such/business-context");
  assert.deepEqual(m.apps, []);
  assert.equal(m.platforms.size, 0);
});
