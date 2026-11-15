---
title: "@strutvane/observability"
description: "OpenTelemetry export, a self-hosted production metrics dashboard and health checks."
---

OpenTelemetry export, a self-hosted production metrics dashboard and health checks.

Strutvane's equivalent of Laravel Pulse. Phase 3.

Once it is released, you add it to an existing app with one command:

```bash
node strut install:observability
```

The installer adds the package with npm, writes `config/observability.ts`, adds any `.env` keys, copies its migrations into `database/migrations/` and registers its provider in `bootstrap/providers.ts`.

:::note[Being written]
This package's page is being written. Every package page will follow the same template: overview, install, configuration, usage, UI, security notes, testing and upgrade notes.
:::
