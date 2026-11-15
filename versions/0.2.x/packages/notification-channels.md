---
title: "@strutvane/notification-channels"
description: "SMS, Slack, Microsoft Teams, web push and WhatsApp channels, plus a user preference centre."
---

SMS, Slack, Microsoft Teams, web push and WhatsApp channels, plus a user preference centre.

Strutvane's equivalent of the community laravel-notification-channels. Phase 6.

Once it is released, you add it to an existing app with one command:

```bash
node strut install:notification-channels
```

The installer adds the package with npm, writes `config/notification-channels.ts`, adds any `.env` keys, copies its migrations into `database/migrations/` and registers its provider in `bootstrap/providers.ts`.

:::note[Being written]
This package's page is being written. Every package page will follow the same template: overview, install, configuration, usage, UI, security notes, testing and upgrade notes.
:::
