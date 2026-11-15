---
title: "@strutvane/social-login"
description: "Sign in with Google, Microsoft, GitHub, Apple and more, with safe account linking."
---

Sign in with Google, Microsoft, GitHub, Apple and more, with safe account linking.

Strutvane's equivalent of Laravel Socialite. Phase 2 (0.3): the v2 blueprint moved it up because the installer asks about it (question 7, "Social login", default none). See [Authentication](../../authentication/) for the sign-in methods built into `@strutvane/auth`.

Once it is released, you add it to an existing app with one command:

```bash
node strut install:social-login
```

The installer adds the package with npm, writes `config/social-login.ts`, adds any `.env` keys, copies its migrations into `database/migrations/` and registers its provider in `bootstrap/providers.ts`.

:::note[Being written]
This package's page is being written. Every package page will follow the same template: overview, install, configuration, usage, UI, security notes, testing and upgrade notes.
:::
