---
title: "@strutvane/files"
description: "Cloud disks (S3, Azure), file and image fields, variants, virus scanning and quotas."
---

Cloud disks (S3, Azure), file and image fields, variants, virus scanning and quotas.

Strutvane's equivalent of Flysystem adapters plus Spatie Media Library. Phase 3.

Once it is released, you add it to an existing app with one command:

```bash
node strut install:files
```

The installer adds the package with npm, writes `config/files.ts`, adds any `.env` keys, copies its migrations into `database/migrations/` and registers its provider in `bootstrap/providers.ts`.

:::note[Being written]
This package's page is being written. Every package page will follow the same template: overview, install, configuration, usage, UI, security notes, testing and upgrade notes.
:::
