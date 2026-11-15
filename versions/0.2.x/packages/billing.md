---
title: "@strutvane/billing"
description: "Subscriptions, seats, invoices and one-off payments (Stripe, Paddle) per team."
---

Subscriptions, seats, invoices and one-off payments (Stripe, Paddle) per team.

Strutvane's equivalent of Laravel Cashier. Phase 6.

Once it is released, you add it to an existing app with one command:

```bash
node strut install:billing
```

The installer adds the package with npm, writes `config/billing.ts`, adds any `.env` keys, copies its migrations into `database/migrations/` and registers its provider in `bootstrap/providers.ts`.

:::note[Being written]
This package's page is being written. Every package page will follow the same template: overview, install, configuration, usage, UI, security notes, testing and upgrade notes.
:::
