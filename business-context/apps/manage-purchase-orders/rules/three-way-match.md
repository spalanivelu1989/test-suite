---
type: Business Rule
title: Three-Way Match
description: Invoice quantity vs goods-received vs PO quantity validation.
timestamp: 2026-06-14T09:00:00Z
applies_to_screen: po-object-page
severity: blocking
tags: [invoice, validation]
---

# Three-Way Match

An invoice may post only when:

    invoice quantity  ≤  goods-received quantity  ≤  PO quantity

## Tolerance

Over-delivery is allowed up to **10%** of the PO quantity. Beyond that, the post
MUST be **blocked with a hard error** — not a warning.

## Expected behaviour to test

- Invoice qty within tolerance → posts successfully.
- Invoice qty **> 110%** of PO qty → **hard error**, post is rejected.
- No goods receipt (GR qty = 0) → cannot post (match fails on the GR leg).

> A mere yellow [warning](/platform/sap-fiori/conventions/message-toasts.md) instead
> of a blocking red error is a **defect**, not expected behaviour.
