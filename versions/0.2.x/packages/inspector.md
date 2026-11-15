---
title: "@strutvane/inspector"
description: "A development recorder for requests, queries, jobs, mail and policy decisions, with \"why was this denied?\"."
---

A development recorder for requests, queries, jobs, mail and policy decisions, with "why was this denied?".

Strutvane's equivalent of Laravel Telescope. Phase 3.

Once it is released, you add it to an existing app with one command:

```bash
node strut install:inspector
```

The installer adds the package with npm, writes `config/inspector.ts`, adds any `.env` keys, copies its migrations into `database/migrations/` and registers its provider in `bootstrap/providers.ts`.

:::note[Being written]
This package's page is being written. Every package page will follow the same template: overview, install, configuration, usage, UI, security notes, testing and upgrade notes.
:::
