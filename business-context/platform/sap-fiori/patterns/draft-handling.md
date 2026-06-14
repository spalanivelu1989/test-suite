---
type: UI Pattern
title: Draft Handling
description: How Fiori edits records through drafts (Edit / Save / Cancel).
timestamp: 2026-06-14T09:00:00Z
---

# Draft Handling

Fiori object pages edit through **drafts**. Pressing **Edit** creates a draft copy;
changes are not persisted until saved.

## How to test

- **Save** persists the draft and exits edit mode (a server round-trip).
- **Cancel** discards the draft; a confirmation dialog may appear.
- A draft is per-user; re-opening the object may offer to resume "your draft".
- Assert success only after the save round-trip completes and a confirmation
  [toast](../conventions/message-toasts.md) appears.
