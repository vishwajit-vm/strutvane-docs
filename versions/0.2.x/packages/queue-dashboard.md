---
title: "@strutvane/queue-dashboard"
description: "Jobs, failures, throughput, retries and schedules, in the operator panel."
---

Jobs, failures, throughput, retries and schedules, in the operator panel.

Strutvane's equivalent of Laravel Horizon. Phase 2.

Once it is released, you add it to an existing app with one command:

```bash
node strut install:queue-dashboard
```

The installer adds the package with npm, writes `config/queue-dashboard.ts`, adds any `.env` keys, copies its migrations into `database/migrations/` and registers its provider in `bootstrap/providers.ts`.

:::note[Being written]
This package's page is being written. Every package page will follow the same template: overview, install, configuration, usage, UI, security notes, testing and upgrade notes.
:::
