---
type: Screen
title: PO List Report
description: Filterable list of purchase orders; entry point of the app.
resource: https://northwind.s4hana.ondemand.com/ui#PurchaseOrder-manage
pattern: smart-filter-bar
timestamp: 2026-06-14T09:00:00Z
---

# PO List Report

The landing screen: a [smart filter bar](/platform/sap-fiori/patterns/smart-filter-bar.md)
above a table of purchase orders.

## Key filters

- Purchasing Document (PO number)
- Supplier
- Purchasing Organization / Group
- Document Date
- Status (e.g. Open, Released, Completed)

## Key columns

PO number, Supplier, Total Net Amount, Status, Creation Date.

## How to test

- Filter by Supplier, click **Go**, wait for the
  [busy indicator](/platform/sap-fiori/conventions/busy-indicator-waits.md).
- Click a PO row to open the [PO object page](./po-object-page.md).
