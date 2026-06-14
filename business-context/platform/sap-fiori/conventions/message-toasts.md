---
type: Convention
title: Message Toasts — Error vs Warning
description: Distinguishing success, warning, and blocking-error messages.
timestamp: 2026-06-14T09:00:00Z
---

# Message Toasts: Error vs Warning

Fiori surfaces outcomes through the **message handling** framework. The distinction
matters for assertions:

- **Success toast** — a brief confirmation (e.g. "Object saved"); auto-dismisses.
- **Warning** — yellow; the action _proceeds_. The user may continue.
- **Error** — red; the action is **blocked** and does not persist.

When a business rule says an action must be _blocked_, a mere warning is a **defect**:
the test should assert a red **error** that prevents the post/save, not a warning.
See, e.g., [three-way match](/apps/manage-purchase-orders/rules/three-way-match.md).
