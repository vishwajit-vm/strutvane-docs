---
title: "@strutvane/sso"
description: "Per-tenant OIDC and SAML single sign-on, SCIM provisioning and domain verification."
---

Per-tenant OIDC and SAML single sign-on, SCIM provisioning and domain verification.

Strutvane's equivalent of the WorkOS starter-kit variant. Phase 5.

Once it is released, you add it to an existing app with one command:

```bash
node strut install:sso
```

The installer adds the package with npm, writes `config/sso.ts`, adds any `.env` keys, copies its migrations into `database/migrations/` and registers its provider in `bootstrap/providers.ts`.

:::note[Being written]
This package's page is being written. Every package page will follow the same template: overview, install, configuration, usage, UI, security notes, testing and upgrade notes.
:::
