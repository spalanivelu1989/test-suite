---
type: App
title: Manage Purchase Orders
description: Procurement clerks create, edit, and release purchase orders.
resource: https://northwind.s4hana.ondemand.com/ui#PurchaseOrder-manage
applies_to:
  origin: https://northwind.s4hana.ondemand.com
  routes: ["#PurchaseOrder-manage"]
built_on: [sap-fiori]
status: active
version: 2025.2
tags: [procurement, purchase-order, mm]
timestamp: 2026-06-14T09:00:00Z
---

# Manage Purchase Orders

Built on [SAP Fiori](/platform/sap-fiori/index.md). Procurement clerks manage the
purchase-order lifecycle here: create POs, track goods receipts, post supplier
invoices, and release POs that exceed approval thresholds.

## Workflows

- [Procure to pay](./workflows/procure-to-pay.md) — the end-to-end journey
- [Post a supplier invoice](./workflows/post-supplier-invoice.md)

## Screens

- [PO list report](./screens/po-list-report.md)
- [PO object page](./screens/po-object-page.md)

## Business rules

- [Three-way match](./rules/three-way-match.md)
- [Release strategy](./rules/release-strategy.md)
