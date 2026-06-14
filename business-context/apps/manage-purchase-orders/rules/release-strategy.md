---
type: Business Rule
title: Release Strategy
description: Approval thresholds for releasing purchase orders by value.
timestamp: 2026-06-14T09:00:00Z
applies_to_screen: po-object-page
severity: blocking
tags: [approval, governance]
---

# Release Strategy

Purchase orders above a value threshold require **approval (release)** before they
can be acted on (e.g. sent to the supplier).

## Thresholds (example)

| PO net value     | Required release          |
| ---------------- | ------------------------- |
| ≤ 10,000         | None — auto-released      |
| 10,001 – 100,000 | Manager release           |
| > 100,000        | Manager + Finance release |

## Expected behaviour to test

- A PO ≤ 10,000 is immediately actionable (status Released).
- A PO of 50,000 shows status **Awaiting Release** and **cannot** be sent until a
  manager releases it.
- The **Release** action is hidden/disabled for users without release authorization.

> Allowing a non-released high-value PO to proceed is a **defect**.
