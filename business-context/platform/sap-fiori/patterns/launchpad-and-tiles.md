---
type: UI Pattern
title: Launchpad and Tiles
description: The Fiori Launchpad home page and how tiles launch apps via intent routes.
timestamp: 2026-06-14T09:00:00Z
---

# Launchpad and Tiles

The Fiori Launchpad is the entry home page. Apps are launched from **tiles** grouped
into sections/groups.

## How to test

- A tile is a clickable card with a title; some show a live count (dynamic tile).
- Clicking a tile navigates to the app's intent route (`#SemanticObject-action`),
  changing the URL hash without a full page reload.
- To reach an app directly, navigate to `<origin>/ui#<SemanticObject>-<action>`.
- After launch, wait for the [busy indicator](../conventions/busy-indicator-waits.md)
  to clear before asserting the app has loaded.
