---
title: "@strutvane/dashboards"
description: "Metric cards, trends and charts on admin home pages, and scheduled report emails."
---

Metric cards, trends and charts on admin home pages, and scheduled report emails.

Strutvane's equivalent of Nova metrics and Filament widgets. Phase 3 (on the way to 1.0), together with charts. The chart widgets, the aggregate endpoint and named dashboards are proven in a prototype; see [Charts](../../charts/).

Once it is released, you add it to an existing app with one command:

```bash
node strut install:dashboards
```

The installer adds the package with npm, writes `config/dashboards.ts`, adds any `.env` keys, copies its migrations into `database/migrations/` and registers its provider in `bootstrap/providers.ts`.

:::note[Being written]
This package's page is being written. Every package page will follow the same template: overview, install, configuration, usage, UI, security notes, testing and upgrade notes.
:::
