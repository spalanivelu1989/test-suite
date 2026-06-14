---
type: Platform
title: SAP Fiori
description: SAP's UX framework (SAPUI5) for S/4HANA apps, served via the Fiori Launchpad.
resource: https://experience.sap.com/fiori-design-web/
tags: [sap, fiori, s4hana, ui5]
timestamp: 2026-06-14T09:00:00Z
---

# SAP Fiori

General, app-agnostic knowledge about how SAP Fiori apps behave. Any app bundle
that declares `built_on: [sap-fiori]` inherits this handbook, so its tests stay
stable against Fiori's standard UI behaviour.

## Core mental model

- Users start on the **Fiori Launchpad**, a home page of **tiles**. Each tile opens
  an app via an intent route like `#PurchaseOrder-manage` (semantic object + action).
- Many apps share one origin and differ only by that `#...` route — so an app's
  identity is **origin + route**, not origin alone.
- A typical app is a **list report** (filter + table) that drills into an
  **object page** (header + sections + actions).

## Patterns

- [Launchpad and tiles](./patterns/launchpad-and-tiles.md)
- [Smart filter bar](./patterns/smart-filter-bar.md)
- [Object page](./patterns/object-page.md)
- [Draft handling](./patterns/draft-handling.md)
- [Value help (F4)](./patterns/value-help-f4.md)

## Conventions

- [Busy indicator waits](./conventions/busy-indicator-waits.md)
- [Message toasts: error vs warning](./conventions/message-toasts.md)
