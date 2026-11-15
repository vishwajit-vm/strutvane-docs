---
title: "@strutvane/backup"
description: "Encrypted database and storage backups with retention, restore drills and monitoring."
---

Encrypted database and storage backups with retention, restore drills and monitoring.

Strutvane's equivalent of the community spatie/laravel-backup. Phase 4.

Once it is released, you add it to an existing app with one command:

```bash
node strut install:backup
```

The installer adds the package with npm, writes `config/backup.ts`, adds any `.env` keys, copies its migrations into `database/migrations/` and registers its provider in `bootstrap/providers.ts`.

:::note[Being written]
This package's page is being written. Every package page will follow the same template: overview, install, configuration, usage, UI, security notes, testing and upgrade notes.
:::
