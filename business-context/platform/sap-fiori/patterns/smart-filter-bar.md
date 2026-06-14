---
type: UI Pattern
title: Smart Filter Bar
description: The filter bar above list-report tables and how to drive it.
timestamp: 2026-06-14T09:00:00Z
---

# Smart Filter Bar

List-report apps open on a **smart filter bar** above a results table.

## How to test

- Enter filter criteria, then click **Go** (or **Adapt Filters** to add fields).
- **Go** triggers a server round-trip — wait for the
  [busy indicator](../conventions/busy-indicator-waits.md), not a fixed timeout.
- An empty result set shows a "No data" illustration in the table, not an error.
- Filter fields often use [value help (F4)](./value-help-f4.md) for valid inputs.
