---
title: "@strutvane/import-export"
description: "CSV and XLSX import with column mapping and a dry run, and policy-aware exports."
---

CSV and XLSX import with column mapping and a dry run, and policy-aware exports.

Strutvane's equivalent of the community Laravel Excel package. Phase 3.

Once it is released, you add it to an existing app with one command:

```bash
node strut install:import-export
```

The installer adds the package with npm, writes `config/import-export.ts`, adds any `.env` keys, copies its migrations into `database/migrations/` and registers its provider in `bootstrap/providers.ts`.

:::note[Being written]
This package's page is being written. Every package page will follow the same template: overview, install, configuration, usage, UI, security notes, testing and upgrade notes.
:::
