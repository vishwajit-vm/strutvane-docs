---
title: "@strutvane/log-viewer"
description: "A screen at `/_strutvane/logs` to tail, search and filter the logs your app writes."
---

A screen at `/_strutvane/logs` to tail, search and filter the logs your app writes.

Strutvane's equivalent of Laravel Pail plus a log viewer. Phase 1. It is the **screen only**: writing logs (channels, files, redaction, `log:tail`) is built into `@strutvane/framework` (ADR-0022), so an app without this package still logs normally. See [Logging](../../logging/).

- It holds the UI and a read API, nothing else. It was renamed from the 0.1 `strutvane-logs` package, whose pipeline moved into the framework.
- It reads both file formats (`line` and `json`) and merges the per-process files (`…worker-2.log`) by timestamp, so you see one timeline.
- It is **pre-selected** in the installer's "Extra features" question, so most new apps have it. To add it to an existing app:

```bash
node strut install:log-viewer
```

The installer adds the package with npm, writes its config, and registers its provider in `bootstrap/providers.ts`. Like every `/_strutvane/*` tool, the screen sits behind sign-in and a permission; `node strut security:check` warns when such a tool is exposed.

:::note[Being written]
This package's page is being written. Every package page will follow the same template: overview, install, configuration, usage, UI, security notes, testing and upgrade notes.
:::
