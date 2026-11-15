---
title: "@strutvane/agent-tools"
description: "AGENTS.md and skills, a local MCP dev server and offline docs search for coding agents."
---

AGENTS.md and skills, a local MCP dev server and offline docs search for coding agents.

Strutvane's equivalent of Laravel Boost. Phase 2 (0.3): the v2 blueprint moved it up because the installer asks about it (question 24, "AI coding assistants", default yes). Until the package is published, the installer prototype (spike 13) writes a basic `AGENTS.md` when you answer yes.

Once it is released, you add it to an existing app with one command:

```bash
node strut install:agent-tools
```

The installer adds the package with npm, writes `config/agent-tools.ts`, adds any `.env` keys, copies its migrations into `database/migrations/` and registers its provider in `bootstrap/providers.ts`.

:::note[Being written]
This package's page is being written. Every package page will follow the same template: overview, install, configuration, usage, UI, security notes, testing and upgrade notes.
:::
