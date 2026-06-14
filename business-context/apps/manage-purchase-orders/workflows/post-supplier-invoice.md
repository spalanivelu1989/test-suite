---
type: Workflow
title: Post a Supplier Invoice
description: Recording a supplier invoice against a PO and goods receipt.
timestamp: 2026-06-14T09:00:00Z
persona: Accounts Payable Clerk
tags: [invoice, ap]
---

# Post a Supplier Invoice

Record a supplier's invoice against an existing PO and goods receipt.

## Steps

1. Open the PO on the [PO object page](../screens/po-object-page.md).
2. Choose **Post Supplier Invoice** (or the dedicated invoice app).
3. Enter the invoice quantity and amount per line item.
4. The system validates the [three-way match](../rules/three-way-match.md).
5. On success, the invoice posts and a confirmation
   [toast](/platform/sap-fiori/conventions/message-toasts.md) appears.

## Edge cases to test

- Invoice quantity within tolerance → posts.
- Invoice quantity beyond PO tolerance → **blocked** (see three-way match).
- No goods receipt yet → cannot post (match fails on GR quantity = 0).
