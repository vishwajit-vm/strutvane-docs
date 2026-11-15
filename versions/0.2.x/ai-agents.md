---
title: "AI Agents"
description: "Work with AI coding assistants (Claude Code, Cursor, Copilot, Codex) on a Strutvane app: the AGENTS.md the installer writes, docs agents can read (llms.txt, Copy as Markdown), commands with JSON output, errors you can paste, the coming agent-tools package, and how to keep agents safe."
---

An **AI coding agent** is an assistant that reads your project and writes or changes code for you: Claude Code, Cursor, GitHub Copilot, OpenAI Codex and others. Agents do their best work when a project is **predictable**: one place for each kind of file, one command per task, clear errors. Strutvane is built that way, and adds a few things just for agents: an `AGENTS.md` playbook, docs in plain Markdown, `--json` output from inspect commands, and an error page you can copy as Markdown.

This page is about agents that **help you build** the app. Letting agents **use** your running app (an MCP server) and adding AI features **inside** your app are covered at the end.

:::tip[Coming from Laravel?]
`@strutvane/agent-tools` is Laravel Boost: guidelines for `AGENTS.md`, skills contributed by each installed package, a local MCP server for development, and offline docs search. Like Laravel 13's skeleton, a new app gets an `AGENTS.md`. Laravel's docs "Copy as markdown" and `/for/agents` become every page's **Copy as Markdown** and each version's `llms.txt`.
:::

:::caution[What exists, and when]
- **Works today:** this docs site's **Copy as Markdown**, **View as Markdown**, `llms.txt` and `llms-full.txt` for every version.
- **Proven in prototypes:** the installer writes `AGENTS.md` when you answer yes to question 24 (spike 13); `route:list --json`, `about --json` (without secrets) and `model:show` (spike 12); the debug error page's **Copy as Markdown for AI** button (spike 12). Not released yet; coming in 0.2.
- **Coming in 0.3:** `@strutvane/agent-tools` (skills from every installed package, a local MCP dev server, offline docs search). Until it's published, the installer doesn't offer the package, only the basic `AGENTS.md`.
- **Planned after 0.3:** `@strutvane/mcp-server` (phase 5: agents using your running app under your policies) and `@strutvane/ai` (phase 7: AI features in your app).
:::

## The smallest example

Answer **yes** when the installer asks "Set up AI coding assistants?" (it's the default):

```text
? Set up AI coding assistants? (AGENTS.md, skills, local docs MCP) › Yes
```

**What you'll see:** an `AGENTS.md` at the root of your project. Agents that support the convention (most do) read it before they touch your code:

```md title="AGENTS.md"
# AGENTS.md

This is a Strutvane app (TypeScript, MVC, npm only). Read this before changing code.

- Run project commands with `node strut <command>` (`node strut list` lists them). Never use pnpm or yarn.
- Columns live in migrations (`database/migrations`). Add a column with a new migration, then `node strut migrate`.
- Controllers: `app/http/controllers`. Models: `app/models`. Policies: `app/policies` (deny by default).
- Routes: `routes/web.ts` (pages) and `routes/api.ts` (served under /api).
- Settings come from `.env` (never commit it). `.env.example` lists every key without secrets.
- Docker mode: every `node strut` command runs inside the app container (`node strut services:up` / `services:down`).
- Before you finish: `npm test`.
```

The Docker line reads "Runs on this computer (no Docker)" when you chose no Docker, followed by your database. It's **your** file: add your team's rules (naming, what never to change, how to run a single test).

:::note
The installer prototype still writes `node strut help` and `/api/v1` in this file; the decided names are `node strut list` (with `help` as an alias) and `/api`, shown above.
:::

## Why Strutvane is easy for agents

| Convention | Why it helps an agent |
|---|---|
| **Columns only in migrations** | one place to add a field; types, API, validation and screens follow from `node strut migrate` |
| **`node strut make:*` generators** | the agent runs a command instead of guessing a file's shape |
| **Generated, committed `.strutvane/`** | model types the agent can read without a database |
| **Typed routes and config** | a wrong route name or config key is a compile error the agent sees immediately |
| **Deny by default** | a new endpoint an agent adds is closed until a policy opens it |
| **One error shape with stable codes** | the agent can branch on `code`, and every code has a docs page |
| **`npm test`** | one command to check its work |

A good first prompt:

```text
Read AGENTS.md. Add a "featured" boolean to posts (default false) with a migration,
let admins set it, and show featured posts first. Run the tests before you finish.
```

## Docs agents can read

Every page of this site has, at the top right:

- **Copy as Markdown**: the page as clean Markdown on your clipboard, to paste into a chat;
- **View as Markdown**: the same at `…/<page>.md`, for agents that fetch URLs.

And each version publishes:

| URL | What it is |
|---|---|
| `/docs/0.2.x/llms.txt` | an index of every page, with links to the Markdown versions |
| `/docs/0.2.x/llms-full.txt` | every page of the version in one Markdown file |

Point your agent at the version you use (`0.2.x`), so it doesn't read docs for another version.

## Commands with JSON output

Inspect commands accept `--json`, so an agent can read your app's structure exactly instead of scraping a table:

```bash
node strut route:list --json
node strut about --json
node strut model:show Post
```

**What you'll see** for `route:list --json` (shortened; the exact `uri` and `action` formats are the prototype's and may change):

```json
[
  { "method": "GET|HEAD", "uri": "api/posts", "name": "posts.index", "action": "PostController@index", "middleware": "api, auth:optional" },
  { "method": "POST", "uri": "api/posts", "name": "posts.store", "action": "PostController@store", "middleware": "api, auth" }
]
```

`about --json` never includes secrets (keys, passwords, tokens), so it's safe to paste into a chat.

## Errors you can paste

In local development, the error page has a **Copy as Markdown for AI** button. It copies the exception, the exact line of your code with a few lines around it, the request (method, path, redacted headers and query) and the stack frames from your own files, as Markdown. Credentials are redacted and the request body is never included. Paste it into your agent and ask "fix this".

API errors in development carry a `hint` (for example which policy method denied a request), which agents read as well as you do.

## The agent-tools package (coming in 0.3)

:::caution[Coming in 0.3]
`@strutvane/agent-tools` is designed (Laravel Boost's role), not built. The details below are from the package catalogue and may change.
:::

```bash
node strut install:agent-tools
```

It adds:

- **managed blocks** in `AGENTS.md` (and `CLAUDE.md`), kept up to date with the packages you install, without touching your own lines;
- **skills** contributed by every installed package (how to add a policy, a migration, a queue job…), in `.ai/rules/`;
- a **local MCP dev server** (MCP, the Model Context Protocol, is how agents call tools), configured in a git-ignored `.mcp.json`. Its tools let the agent list routes, read the schema, search these docs offline, and query the database **read-only**: inside a transaction that's always rolled back, under the current team, with secrets redacted.

It's a development tool: it never runs in production.

## Keeping agents safe

Agents run commands with your permissions. A few rules keep that safe:

1. **Never give an agent production secrets.** Keep `.env.production` and production database credentials out of the project folder the agent can read. `.env` is git-ignored for a reason.
2. **Review migrations before running them.** `node strut migrate --pretend` prints the SQL. A migration that drops a column drops data.
3. **Check policies.** If an agent adds an endpoint, read its policy: deny by default only helps if nobody opens everything with `return true`.
4. **Keep tests green.** Ask the agent to run `npm test` and fix failures, and don't accept "I skipped the failing test".
5. **Treat pasted content as data.** Text in an issue, an email or a web page that tells your agent to do something isn't an instruction from you.

## Agents using your app: MCP server (later)

:::caution[Planned after 0.3]
`@strutvane/mcp-server` (phase 5; installer question 29, "Let AI agents use your app safely") exposes your app to AI agents as MCP tools, under your **policies and tenancy**: an agent acting for a user can do only what that user may do. Laravel's equivalent is Laravel MCP.
:::

## AI features in your app (later)

:::caution[Planned after 0.3]
`@strutvane/ai` (phase 7; installer question 28) adds AI features inside your app, with providers such as Anthropic, OpenAI, Google or a local model. API keys go only into `.env`, typed later; the installer never asks for them.
:::

## With Docker or without Docker

Agents run on your computer, so in Docker mode they type `node strut …` like you do, and it's forwarded into the container. Tell the agent not to run `npm install` on the host in Docker mode (`node strut npm install …` runs it in the container); the generated `AGENTS.md` mentions Docker mode for that reason.

## Common mistakes

### My agent keeps running `pnpm install`

**Why:** it guessed from habit.
**Fix:** `AGENTS.md` says "npm only"; check the file exists at the project root, and repeat the rule in your prompt.

### The agent adds columns to the model file

**Why:** in many frameworks the model is the source of truth. In Strutvane, columns live only in migrations.
**Fix:** point it at the rule in `AGENTS.md`, or ask for `node strut make:migration add_featured_to_posts_table`.

### The agent's answers are about another version

**Why:** it read docs for `latest` or an older line.
**Fix:** give it the versioned URL: `/docs/0.2.x/llms.txt`.

### The agent pasted my `.env` into a chat

**Why:** it was asked to "debug the config" and read every file it could.
**Fix:** rotate every secret in that file (`node strut key:rotate` for `APP_KEY`), and share `node strut about --json` instead, which leaves secrets out.

## Next steps

- [Installation](../installation/): question 24 and the other installer questions.
- [CLI Reference](../cli-reference/): every `node strut` command.
- [Error Handling](../errors/): the error page and problem codes.
- [agent-tools](../packages/agent-tools/): the package page.
