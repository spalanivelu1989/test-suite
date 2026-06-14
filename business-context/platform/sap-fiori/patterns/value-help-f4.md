---
type: UI Pattern
title: Value Help (F4)
description: The F4 value-help dialog for selecting valid field entries.
timestamp: 2026-06-14T09:00:00Z
---

# Value Help (F4)

Input fields with a small icon open **value help** (the F4 dialog) — a searchable
dialog of valid entries.

## How to test

- Click the field's value-help icon to open the dialog.
- The dialog has its own filter bar and result table; select a row to fill the field.
- Free-typing an invalid value triggers field validation on blur (red border +
  a [message](../conventions/message-toasts.md)).
- Prefer selecting via value help over typing raw keys, for stability.
