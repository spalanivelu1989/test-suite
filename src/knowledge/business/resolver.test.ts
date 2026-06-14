import assert from "node:assert/strict";
import { test } from "node:test";
import { navTargetFor, resolveBusinessContext } from "./resolver";
import type { BusinessBundle, BusinessManifest } from "./types";

function app(over: Partial<BusinessBundle> & { id: string }): BusinessBundle {
  return {
    dir: `/x/${over.id}`,
    kind: "app",
    type: "App",
    routes: [],
    builtOn: [],
    ...over,
  };
}

function platform(key: string): BusinessBundle {
  return {
    id: `platform/${key}`,
    dir: `/x/platform/${key}`,
    kind: "platform",
    type: "Platform",
    routes: [],
    builtOn: [],
    platformKey: key,
  };
}

const ORIGIN = "https://northwind.s4hana.ondemand.com";

function manifest(
  apps: BusinessBundle[],
  platforms: string[],
): BusinessManifest {
  return {
    apps,
    platforms: new Map(platforms.map((k) => [k, platform(k)])),
  };
}

test("navTargetFor: extracts lowercased path + hash, tolerates junk", () => {
  assert.equal(
    navTargetFor(`${ORIGIN}/ui#PurchaseOrder-manage`),
    "/ui#purchaseorder-manage",
  );
  assert.equal(navTargetFor("::::not a url"), "");
});

test("resolve: origin + route picks the app and stacks its platform", () => {
  const m = manifest(
    [
      app({
        id: "apps/manage-purchase-orders",
        origin: ORIGIN,
        routes: ["#PurchaseOrder-manage"],
        builtOn: ["sap-fiori"],
      }),
    ],
    ["sap-fiori"],
  );
  const r = resolveBusinessContext(`${ORIGIN}/ui#PurchaseOrder-manage`, m);
  assert.equal(r.app?.id, "apps/manage-purchase-orders");
  assert.equal(r.matchedBy, "origin+route");
  assert.deepEqual(
    r.platforms.map((p) => p.id),
    ["platform/sap-fiori"],
  );
});

test("resolve: longest matching route wins on a shared origin", () => {
  const m = manifest(
    [
      app({ id: "apps/po", origin: ORIGIN, routes: ["#PurchaseOrder"] }),
      app({
        id: "apps/po-manage",
        origin: ORIGIN,
        routes: ["#PurchaseOrder-manage"],
      }),
    ],
    [],
  );
  const r = resolveBusinessContext(`${ORIGIN}/ui#PurchaseOrder-manage`, m);
  assert.equal(r.app?.id, "apps/po-manage");
  assert.equal(r.matchedBy, "origin+route");
});

test("resolve: a route-bearing app whose route does not match is skipped", () => {
  const m = manifest(
    [
      app({
        id: "apps/invoice",
        origin: ORIGIN,
        routes: ["#SupplierInvoice-create"],
      }),
    ],
    [],
  );
  const r = resolveBusinessContext(`${ORIGIN}/ui#PurchaseOrder-manage`, m);
  assert.equal(r.app, undefined);
  assert.equal(r.matchedBy, "none");
});

test("resolve: origin-wide bundle (no routes) matches as a low-priority fallback", () => {
  const m = manifest([app({ id: "apps/whole", origin: ORIGIN })], []);
  const r = resolveBusinessContext(`${ORIGIN}/anything`, m);
  assert.equal(r.app?.id, "apps/whole");
  assert.equal(r.matchedBy, "origin");
  assert.equal(r.routeScore, 0);
});

test("resolve: a specific route beats an origin-wide fallback", () => {
  const m = manifest(
    [
      app({ id: "apps/whole", origin: ORIGIN }),
      app({ id: "apps/po", origin: ORIGIN, routes: ["#PurchaseOrder-manage"] }),
    ],
    [],
  );
  const r = resolveBusinessContext(`${ORIGIN}/ui#PurchaseOrder-manage`, m);
  assert.equal(r.app?.id, "apps/po");
});

test("resolve: tie on score → active status, then higher version", () => {
  const m = manifest(
    [
      app({
        id: "apps/v1",
        origin: ORIGIN,
        routes: ["#PurchaseOrder-manage"],
        version: "2025.1",
        status: "draft",
      }),
      app({
        id: "apps/v2",
        origin: ORIGIN,
        routes: ["#PurchaseOrder-manage"],
        version: "2025.2",
        status: "active",
      }),
    ],
    [],
  );
  const r = resolveBusinessContext(`${ORIGIN}/ui#PurchaseOrder-manage`, m);
  assert.equal(r.app?.id, "apps/v2");
});

test("resolve: different origin → no match (runs cold)", () => {
  const m = manifest(
    [app({ id: "apps/po", origin: ORIGIN, routes: ["#PurchaseOrder-manage"] })],
    ["sap-fiori"],
  );
  const r = resolveBusinessContext(
    "https://other.example.com/ui#PurchaseOrder-manage",
    m,
  );
  assert.equal(r.matchedBy, "none");
  assert.deepEqual(r.platforms, []);
});

test("resolve: missing platform in built_on is silently skipped", () => {
  const m = manifest(
    [
      app({
        id: "apps/po",
        origin: ORIGIN,
        routes: ["#PurchaseOrder-manage"],
        builtOn: ["sap-fiori", "ghost-platform"],
      }),
    ],
    ["sap-fiori"],
  );
  const r = resolveBusinessContext(`${ORIGIN}/ui#PurchaseOrder-manage`, m);
  assert.deepEqual(
    r.platforms.map((p) => p.id),
    ["platform/sap-fiori"],
  );
});
