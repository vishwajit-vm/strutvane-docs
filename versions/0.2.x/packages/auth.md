---
title: "@strutvane/auth"
description: "Sign-in by password, email link or passkey; registration, password reset, email verification, 2FA, sessions, API tokens, teams and impersonation."
---

Sign-in by password, email link or passkey; registration, password reset, email verification, two-factor, sessions, personal access tokens, teams and impersonation, each behind its own switch in `config/auth.ts`. A switched-off feature has no routes at all.

Strutvane's equivalent of Laravel Fortify + Sanctum + the starter kits' auth screens. Installed by default in full-stack and API apps (with "no sign-in", it still guards the API with tokens). Phase 1. The engine is proven in a prototype (spike 20, 215 tests); the framework wiring and the screens are not built yet. See [Authentication](../../authentication/).

Once it is released, you add it to an existing app with one command:

```bash
node strut install:auth
```

The installer adds the package with npm, writes `config/auth.ts`, adds any `.env` keys, copies its migrations into `database/migrations/` and registers its provider in `bootstrap/providers.ts`.

:::note[Being written]
This package's page is being written. Every package page will follow the same template: overview, install, configuration, usage, UI, security notes, testing and upgrade notes.
:::
