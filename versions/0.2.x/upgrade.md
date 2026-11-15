---
title: Upgrade Guide
description: Upgrading an app from Strutvane 0.1 to 0.2. Every breaking change, how likely it is to affect you, what to do, and why it changed.
---

This guide lists every change that can break an app when you move from Strutvane 0.1 to 0.2, how likely each one is to affect you, and exactly what to do.

:::tip[Coming from Laravel?]
It follows the format of Laravel's upgrade guide: an estimated time, the changes grouped by **likelihood of impact** (High, Medium, Low), and for each one what changed, why, who is affected, and the code before and after.
:::

## Upgrading to 0.2 from 0.1

#### Estimated upgrade time: not measured yet

:::caution[Read this first]
0.1 was only ever published as pre-releases (`0.1.0-next.N`), and 0.2 changes the *shape* of a Strutvane app, not just a few APIs. For most 0.1 apps, the fastest path is to **create a fresh 0.2 app and move your tables and logic across**, using this guide as the checklist. The time estimate will be measured on the acceptance app (Northwind Ops) before 0.2 ships.
:::

We try to document every breaking change. Work from the top: high impact first.

**Before you start:**

1. Commit your work, so `git diff` shows exactly what the upgrade changed.
2. Make sure you have **Node.js 24.3 or newer** (`node --version`).
3. Read [What's new in Strutvane 0.2](../releases/#whats-new-in-strutvane-02) for the big picture.

### Upgrading with an AI agent

Click **Copy as Markdown** at the top of this page and paste the guide into your coding agent, together with your app's `package.json` and its `app/models` folder. Ask it to go through the changes below one at a time.

## High impact changes

- [npm instead of pnpm](#npm-instead-of-pnpm)
- [Updating dependencies](#updating-dependencies)
- [Columns move from models to migrations](#columns-move-from-models-to-migrations)
- [`pnpm sv` becomes `node strut`](#pnpm-sv-becomes-node-strut)

## Medium impact changes

- [Auth is built in (Better Auth is no longer the default)](#auth-is-built-in)
- [UI customisations move to `resources/ui/`](#ui-customisations-move-to-resourcesui)
- [Seeders run once and are tracked](#seeders-run-once-and-are-tracked)

## Low impact changes

- [`upgrade` and three-way merges are retired](#upgrade-and-three-way-merges-are-retired)
- [Packages merged into `@strutvane/framework`](#packages-merged-into-strutvaneframework)
- [Logging uses Laravel-style channels](#logging-uses-laravel-style-channels)

---

## Dependencies

### npm instead of pnpm

**Likelihood of impact: High**

**What changed.** Strutvane apps use **npm only**. The `pnpm-lock.yaml`, `pnpm-workspace.yaml` and `corepack pnpm` commands are gone.

**Why.** pnpm's build-script blocking stopped new 0.1 apps from installing (esbuild was blocked), and every extra tool is one more thing to set up. npm comes with Node.

**Who is affected.** Every 0.1 app.

```bash
# 0.1
corepack pnpm install
corepack pnpm sv migrate

# 0.2
npm install
node strut migrate
```

**What to do.** Delete `pnpm-lock.yaml` and `node_modules`, then run `npm install` to create `package-lock.json`.

### Updating dependencies

**Likelihood of impact: High**

**What changed.** 0.1 was published only under the `next` tag; 0.2 is published on `latest`. Several packages were merged (see [below](#packages-merged-into-strutvaneframework)).

**What to do.** In `package.json`, set:

- `@strutvane/framework` to `^0.2.0`
- `@strutvane/auth` to `^0.2.0`
- `@strutvane/ui` to `^0.2.0`

and remove `@strutvane/core`, `@strutvane/contracts`, `@strutvane/cli`, `@strutvane/devkit` and `@strutvane/logs`. Then:

```bash
npm install
node strut migrate        # applies framework tables and regenerates types, API and UI
node strut doctor         # reports anything still on 0.1 conventions
```

## Database & migrations

### Columns move from models to migrations

**Likelihood of impact: High**

**What changed.** In 0.1, `app/models/*.model.ts` declared every field with `defineModel()` and `field.*`, and migrations were generated from it. In 0.2, **migrations are the source of truth**: you write columns with the Schema builder, and the model holds only behaviour.

**Why.** Real projects need to rename, backfill and reshape tables, which a model file can't describe. Laravel's flow (columns in migrations) handles all of it, and Strutvane now generates the types from the migrations, so you lose no type safety.

**Who is affected.** Every 0.1 app.

```ts
// 0.1: app/models/post.model.ts
export const Post = defineModel('Post', {
  title: field.string(200),
  status: field.enum(['draft', 'published']),
})

// 0.2: database/migrations/2026_11_14_093000_create_posts_table.ts
schema.create('posts', (t) => {
  t.id()
  t.string('title', 200)
  t.enum('status', ['draft', 'published']).default('draft')
  t.timestamps()
})

// 0.2: app/models/post.ts
export class Post extends Model('posts', { fillable: ['title', 'status'] }) {}
```

**What to do.** For each 0.1 model, write a `create_<table>_table` migration with the same columns (`node strut make:migration create_posts_table` also writes the new model), then delete the old model file. If your database already has the tables, point the 0.2 app at a copy first and compare. See [Migrations](../migrations/).

### Seeders run once and are tracked

**Likelihood of impact: Medium**

**What changed.** Seeders are registered in `database/seeders/database-seeder.ts` and tracked in a `seeders` table. In development, `node strut migrate` runs each new seeder **once**; production seeds only with `--seed --force`.

**Why.** In 0.1, seeders weren't registered automatically, so they silently never ran.

**What to do.** Move seed code into `database/seeders/` (one file per table) and register it. See [Seeding](../seeding/).

## Command line

### `pnpm sv` becomes `node strut`

**Likelihood of impact: High**

**What changed.** The project CLI is `node strut <command>` (or `npx strutvane <command>`). The `sv` script is gone. Column definitions on the command line (`make:model Post title:string`) are gone too, because columns live in migrations.

**Why.** `sv` clashes with a built-in PowerShell alias, and field specs broke on Windows quoting. `node strut` works identically in every shell.

```bash
# 0.1
pnpm sv make:model Post title:string status:enum:draft,published

# 0.2
node strut make:migration create_posts_table --seeder
```

### `upgrade` and three-way merges are retired

**Likelihood of impact: Low**

**What changed.** The 0.1 levels L0–L3, `eject` and the `upgrade` command with three-way merges are gone.

**Why.** In 0.2, files you own are simply never overwritten, and generated files (`.strutvane/`, `*.gen.ts`) are always regenerated, so there's nothing to merge.

**What to do.** Nothing, unless you ejected files: keep them as your own code.

## Auth

### Auth is built in

**Likelihood of impact: Medium**

**What changed.** Better Auth is no longer the default engine. Sign-in follows Laravel's Fortify + Sanctum model: a `features` list in `config/auth.ts`, standard `/login` and `/register` routes, and the auth tables as **ordinary migrations in your app**, with a real `users` model.

**Why.** In 0.1, identity lived in a separate store and could be lost on restart, and auth needed its own migration step.

**What to do.** Recreate your sign-in settings in `config/auth.ts`, and move existing users across with a one-off script. *(A migration helper is planned; it isn't built yet.)*

## UI

### UI customisations move to `resources/ui/`

**Likelihood of impact: Medium**

**What changed.** UI customisations live in `resources/ui/` (for example `resources/ui/posts.ui.ts`), written once by `node strut migrate` and never overwritten.

**What to do.** Move each override from your 0.1 `web/` folder into the matching `resources/ui/<resource>.ui.ts`. See [Customising Screens](../crud-customising/).

## Miscellaneous

### Packages merged into `@strutvane/framework`

**Likelihood of impact: Low**

`@strutvane/core`, `@strutvane/contracts`, `@strutvane/cli`, `@strutvane/devkit` and the logging pipeline from `@strutvane/logs` are now part of `@strutvane/framework`, like `laravel/framework`. The log viewer is the separate `@strutvane/log-viewer` package. If you imported from the old packages, import from `@strutvane/framework` instead.

### Logging uses Laravel-style channels

**Likelihood of impact: Low**

**What changed.** Logging is now part of `@strutvane/framework` and works like Laravel's: you pick **channels** (`single`, `daily`, `stack`, `stderr`, `slack`, …) in `config/logging.ts` and `.env` (`LOG_CHANNEL`, `LOG_STACK`, `LOG_LEVEL`, `LOG_DAILY_DAYS`, `LOG_FORMAT`). Three things look different from 0.1:

| | 0.1 (`@strutvane/logs`) | 0.2 |
|---|---|---|
| Level names | six pino-style names (`trace`, `debug`, `info`, `warn`, `error`, `fatal`) | the eight RFC 5424 names, as in Laravel: `emergency`, `alert`, `critical`, `error`, `warning`, `notice`, `info`, `debug` |
| File names | `storage/logs/YYYY-MM-DD.w<id>.ndjson` | `storage/logs/strutvane-YYYY-MM-DD.log` (daily) or `strutvane.log` (single) |
| File format | NDJSON (one JSON object per line) | readable lines by default; `LOG_FORMAT=json` keeps NDJSON |

**What to do.** Usually nothing: the old names `warn`, `fatal` and `trace` still work as aliases for `warning`, `critical` and `debug`. If a log shipper reads the old `.ndjson` files, point it at the new names and set `LOG_FORMAT=json`. See [Logging](../logging/).

The full list of changes in 0.2 is in the [release notes](../releases/).

## Common mistakes

### `npm install` fails with "No matching version found for @strutvane/core"

```text
npm error notarget No matching version found for @strutvane/core@^0.2.0.
```

**Why:** `@strutvane/core` (and `contracts`, `cli`, `devkit`, `logs`) don't exist in 0.2: they were merged into `@strutvane/framework`.
**Fix:** remove them from `package.json`, keep `@strutvane/framework`, and change imports from the old packages to `@strutvane/framework`.

### `pnpm sv migrate` says "command not found"

**Why:** 0.2 apps use npm only, and the `sv` script is gone.
**Fix:**

```bash
node strut migrate
```

### My 0.1 model file still compiles, but nothing uses it

**Why:** `defineModel()` files aren't read in 0.2; columns come from migrations.
**Fix:** write a `create_…_table` migration with the same columns, move any behaviour into the new `class … extends Model('…')` file, then delete the old model.
