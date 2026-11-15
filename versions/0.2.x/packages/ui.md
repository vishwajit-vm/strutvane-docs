---
title: "@strutvane/ui"
description: "The React UI kit plus the auto-generated admin: lists, forms, details and the sidebar, from your tables."
---

The React UI kit plus the auto-generated admin: lists, forms, details and the sidebar, from your tables.

Strutvane's equivalent of the Laravel starter kits' layouts plus a Filament/Nova-style admin. Installed by default in full-stack apps. Phase 1.

`@strutvane/ui` holds the **behaviour** only: the auto CRUD screens, tables, forms, filters, the sidebar registry, the command palette, keyboard shortcuts and accessibility. It has no colours or layout chrome of its own. The **look** comes from a design package, `@strutvane/design-crisp` (the default) or `@strutvane/design-vivid`, chosen in the installer and swappable later. See [Designs](../../designs/).

Once it is released, you add it to an existing app with one command:

```bash
node strut install:ui
```

The installer adds the package with npm, writes `config/ui.ts`, adds any `.env` keys, copies its migrations into `database/migrations/` and registers its provider in `bootstrap/providers.ts`.

:::note[Being written]
This package's page is being written. Every package page will follow the same template: overview, install, configuration, usage, UI, security notes, testing and upgrade notes.
:::
