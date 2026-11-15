---
title: "@strutvane/feature-flags"
description: "Typed feature flags per user, team or plan, with an operator UI."
---

Typed feature flags per user, team or plan, with an operator UI.

Strutvane's equivalent of Laravel Pennant. Phase 5.

Once it is released, you add it to an existing app with one command:

```bash
node strut install:feature-flags
```

The installer adds the package with npm, writes `config/feature-flags.ts`, adds any `.env` keys, copies its migrations into `database/migrations/` and registers its provider in `bootstrap/providers.ts`.

:::note[Being written]
This package's page is being written. Every package page will follow the same template: overview, install, configuration, usage, UI, security notes, testing and upgrade notes.
:::
