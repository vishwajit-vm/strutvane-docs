---
title: "@strutvane/webhooks"
description: "Signed outgoing webhooks with retries and a delivery log, and signature checks for incoming ones."
---

Signed outgoing webhooks with retries and a delivery log, and signature checks for incoming ones.

Strutvane's equivalent of the Spatie webhook packages. Phase 5.

Once it is released, you add it to an existing app with one command:

```bash
node strut install:webhooks
```

The installer adds the package with npm, writes `config/webhooks.ts`, adds any `.env` keys, copies its migrations into `database/migrations/` and registers its provider in `bootstrap/providers.ts`.

:::note[Being written]
This package's page is being written. Every package page will follow the same template: overview, install, configuration, usage, UI, security notes, testing and upgrade notes.
:::
