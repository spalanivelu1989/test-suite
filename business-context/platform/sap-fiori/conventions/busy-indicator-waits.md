---
type: Convention
title: Busy Indicator Waits
description: Wait on the global busy indicator instead of fixed timeouts.
timestamp: 2026-06-14T09:00:00Z
---

# Busy Indicator Waits

Fiori shows a global **busy indicator** during server round-trips. Before asserting
on a list or object page, wait for the busy indicator to clear rather than using a
fixed timeout.

## Triggers a round-trip (wait after each)

- Filter-bar **Go**
- Object-page **Save** / action buttons
- Opening a tile or drilling into a row
- Paginating or lazy-loading a child table

Fixed `waitForTimeout` calls are flaky here — prefer waiting on the busy state or on
the expected element/text to appear.
