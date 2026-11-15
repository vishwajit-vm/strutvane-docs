---
title: "@strutvane/realtime"
description: "A WebSocket server with private and presence channels, and live-updating admin tables."
---

A WebSocket server with private and presence channels, and live-updating admin tables.

Strutvane's equivalent of Laravel Reverb + Echo. Phase 6.

Once it is released, you add it to an existing app with one command:

```bash
node strut install:realtime
```

The installer adds the package with npm, writes `config/realtime.ts`, adds any `.env` keys, copies its migrations into `database/migrations/` and registers its provider in `bootstrap/providers.ts`.

:::note[Being written]
This package's page is being written. Every package page will follow the same template: overview, install, configuration, usage, UI, security notes, testing and upgrade notes.
:::
