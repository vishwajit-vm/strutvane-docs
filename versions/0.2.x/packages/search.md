---
title: "@strutvane/search"
description: "External search engines (Meilisearch, Typesense) and hybrid vector search."
---

External search engines (Meilisearch, Typesense) and hybrid vector search.

Strutvane's equivalent of Laravel Scout's engines. Phase 3.

Once it is released, you add it to an existing app with one command:

```bash
node strut install:search
```

The installer adds the package with npm, writes `config/search.ts`, adds any `.env` keys, copies its migrations into `database/migrations/` and registers its provider in `bootstrap/providers.ts`.

:::note[Being written]
This package's page is being written. Every package page will follow the same template: overview, install, configuration, usage, UI, security notes, testing and upgrade notes.
:::
