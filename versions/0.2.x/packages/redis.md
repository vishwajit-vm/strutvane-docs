---
title: "@strutvane/redis"
description: "Redis and Valkey drivers for cache, queues, locks, sessions, rate limits and broadcasting."
---

Redis and Valkey drivers for cache, queues, locks, sessions, rate limits and broadcasting.

Strutvane's equivalent of Laravel's Redis drivers. Phase 2.

Once it is released, you add it to an existing app with one command:

```bash
node strut install:redis
```

The installer adds the package with npm, writes `config/redis.ts`, adds any `.env` keys, copies its migrations into `database/migrations/` and registers its provider in `bootstrap/providers.ts`.

:::note[Being written]
This package's page is being written. Every package page will follow the same template: overview, install, configuration, usage, UI, security notes, testing and upgrade notes.
:::
