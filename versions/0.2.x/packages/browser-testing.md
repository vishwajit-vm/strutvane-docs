---
title: "@strutvane/browser-testing"
description: "Playwright fixtures: a fresh database, `actingAs`, teams, page objects for generated screens and accessibility checks."
---

Playwright fixtures: a fresh database, `actingAs`, teams, page objects for generated screens and accessibility checks.

Strutvane's equivalent of Laravel Dusk. Phase 7.

Once it is released, you add it to an existing app with one command:

```bash
node strut install:browser-testing
```

The installer adds the package with npm, writes `config/browser-testing.ts`, adds any `.env` keys, copies its migrations into `database/migrations/` and registers its provider in `bootstrap/providers.ts`.

:::note[Being written]
This package's page is being written. Every package page will follow the same template: overview, install, configuration, usage, UI, security notes, testing and upgrade notes.
:::
