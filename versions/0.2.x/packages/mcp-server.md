---
title: "@strutvane/mcp-server"
description: "Expose your app to AI agents as MCP tools, resources and prompts, under your policies."
---

Expose your app to AI agents as MCP tools, resources and prompts, under your policies.

Strutvane's equivalent of Laravel MCP. Phase 5.

Once it is released, you add it to an existing app with one command:

```bash
node strut install:mcp-server
```

The installer adds the package with npm, writes `config/mcp-server.ts`, adds any `.env` keys, copies its migrations into `database/migrations/` and registers its provider in `bootstrap/providers.ts`.

:::note[Being written]
This package's page is being written. Every package page will follow the same template: overview, install, configuration, usage, UI, security notes, testing and upgrade notes.
:::
