---
type: Workflow
title: Procure to Pay
description: End-to-end purchase-order to paid-invoice journey.
timestamp: 2026-06-14T09:00:00Z
persona: Procurement Clerk
tags: [p2p, procurement]
---

# Procure to Pay

The end-to-end journey this app participates in.

## Steps

1. Create a purchase order (PO) for a material and quantity on the
   [PO object page](../screens/po-object-page.md).
2. Post a **goods receipt** when the supplier delivers.
3. Post a **supplier invoice** — see
   [Post a supplier invoice](./post-supplier-invoice.md).
4. The system runs a [three-way match](../rules/three-way-match.md) before the
   invoice can post.
5. POs above a value threshold need approval — see
   [release strategy](../rules/release-strategy.md).

## Preconditions

A clerk is logged in; a supplier and material master exist.

## Expected outcome

A posted, three-way-matched invoice against a released PO.
