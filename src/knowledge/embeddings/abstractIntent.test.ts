import assert from "node:assert/strict";
import { test } from "node:test";
import { abstractIntent, patternTextFor } from "./abstractIntent";

test("abstractIntent collapses app-specific product names to a shared workflow", () => {
  const a = abstractIntent("Add 'Acme Pro Plan' to cart");
  const b = abstractIntent('Add "Widget XL" to cart');
  assert.equal(a, "add to cart");
  assert.equal(a, b); // two apps' add-to-cart now look identical
});

test("abstractIntent strips urls, emails, prices, numbers, and punctuation", () => {
  assert.equal(
    abstractIntent("Sign in at https://acme.io with jane@acme.io"),
    "sign in at with",
  );
  assert.equal(abstractIntent("Pay $49.99 for 3 items"), "pay for items");
  assert.equal(
    abstractIntent("Order #10428 placed on 2026-06-15"),
    "order placed on",
  );
});

test("abstractIntent keeps the workflow verbs/nouns that carry across apps", () => {
  assert.equal(
    abstractIntent("Submit the checkout form and confirm the order"),
    "submit the checkout form and confirm the order",
  );
});

test("patternTextFor falls back to the lowercased original when abstraction empties it", () => {
  // All-entity text would otherwise abstract to "" — keep a usable signal.
  assert.equal(patternTextFor("'X' 42 $9"), "'x' 42 $9");
  assert.equal(patternTextFor("Login flow"), "login flow");
});
