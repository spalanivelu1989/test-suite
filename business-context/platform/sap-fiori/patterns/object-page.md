---
type: UI Pattern
title: Object Page
description: The detail page for a single record, opened from a list report.
timestamp: 2026-06-14T09:00:00Z
---

# Object Page

Clicking a row in a list report opens the **object page** for that record.

## Anatomy

- A **header** with the object's key fields and a title.
- An **anchor bar** linking to sections (e.g. General, Items, Notes).
- Tables of child items (e.g. PO line items) within sections.
- Footer actions: **Edit**, **Save**, **Cancel**, plus app-specific actions.

## How to test

- Identify the object by its header title/key field, not by row index.
- Editing puts the page into [draft mode](./draft-handling.md).
- Child-item tables can paginate or lazy-load on scroll — wait for the
  [busy indicator](../conventions/busy-indicator-waits.md).
