---
title: "@strutvane/oauth-server"
description: "Make your app an OAuth 2.1 provider (authorization code with PKCE, client credentials, device flow)."
---

Make your app an OAuth 2.1 provider (authorization code with PKCE, client credentials, device flow).

Strutvane's equivalent of Laravel Passport. Phase 5.

Once it is released, you add it to an existing app with one command:

```bash
node strut install:oauth-server
```

The installer adds the package with npm, writes `config/oauth-server.ts`, adds any `.env` keys, copies its migrations into `database/migrations/` and registers its provider in `bootstrap/providers.ts`.

:::note[Being written]
This package's page is being written. Every package page will follow the same template: overview, install, configuration, usage, UI, security notes, testing and upgrade notes.
:::
