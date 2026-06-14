---
type: Screen
title: PO Object Page
description: Detail page for a single purchase order — header, items, actions.
resource: https://northwind.s4hana.ondemand.com/ui#PurchaseOrder-manage
pattern: object-page
timestamp: 2026-06-14T09:00:00Z
---

# PO Object Page

The [object page](/platform/sap-fiori/patterns/object-page.md) for a single purchase
order.

## Header fields

PO number, Supplier, Purchasing Org, Purchasing Group, Total Net Amount, Status.

## Sections

- **Items** — line items: Material, Quantity, Unit, Net Price, Delivery Date.
- **General** — terms, dates, currency.
- **Notes / Attachments**.

## Actions

- **Edit** → [draft mode](/platform/sap-fiori/patterns/draft-handling.md)
- **Save**, **Cancel**
- **Post Goods Receipt**, **Post Supplier Invoice**
- **Release** (when a [release strategy](../rules/release-strategy.md) applies)

## Rules enforced here

- [Three-way match](../rules/three-way-match.md) on invoice posting.
- [Release strategy](../rules/release-strategy.md) on PO value.
