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
- [Error codes are lowercase](#error-codes-are-lowercase)
- [Seeders are registered for you](#seeders-are-registered-for-you)

## Low impact changes

- [Validation issues gain `field`](#validation-issues-gain-field)
- [Object-form seeders get the new context](#object-form-seeders-get-the-new-context)
- [ORM tenancy is off until you enable it](#orm-tenancy-is-off-until-you-enable-it)
- [Levels and `eject` are retired](#levels-and-eject-are-retired)
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
node strut migrate        # runs the pending migrations and regenerates .strutvane/
node strut doctor         # reports old packages, version mismatches and env problems
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

// 0.2: app/models/post.ts (import { Model } from '@strutvane/framework/database')
export class Post extends Model('posts', { fillable: ['title', 'status'] }) {}
```

**What to do.** For each 0.1 model, write a `create_<table>_table` migration with the same columns (`node strut make:migration create_posts_table` also writes the new model), then delete the old model file. If your database already has the tables, point the 0.2 app at a copy first and compare. See [Migrations](../migrations/).

**No rush, within 0.2.** A 0.1 app keeps working on `@strutvane/framework` 0.2: `node strut migrate`, `migrate:status` and `db:seed` detect a `defineModel` project and take the 0.1 path. That path's planning functions (`planMigration`, `compilePg`, `compileSqlite`, `writeMigration`, `migrateProject` and the rest) are [deprecated](../deprecations/) and removed in 0.3.

### Seeders are registered for you

**Likelihood of impact: Medium**

**What changed.** `node strut db:seed` runs `database/seeders/database.seeder.ts`, which calls the other seeders in order. `node strut make:migration create_posts_table --seeder` writes the seeder and its factory and adds the seeder to that list for you. `node strut migrate --seed` seeds right after migrating, and production needs `--force`.

**Why.** In 0.1, seeders weren't registered automatically, so they silently never ran.

**What to do.** Move seed code into `database/seeders/` (one file per table), written with `defineSeeder` from `@strutvane/framework/database`, and call each one from `database.seeder.ts`. See [Seeding](../seeding/).

:::caution[Coming in 0.2]
Tracking seeders in a `seeders` table, so that `node strut migrate` runs each new seeder **once** in development, is designed but not in `@strutvane/framework` 0.2.0-next.0.
:::

### Object-form seeders get the new context

**Likelihood of impact: Low**

**What changed.** A seeder written as `defineSeeder({ run })` (the object form) now receives the migration-first context `{ db, env, tenantId, faker, call }`. The string form, `defineSeeder('PostSeeder', async (ctx) => …)`, keeps 0.1's context.

**What to do.** In object-form seeders, use the new context. See [Seeding](../seeding/).

### ORM tenancy is off until you enable it

**Likelihood of impact: Low**

**What changed.** Tenancy in the ORM is off unless `config/tenancy.ts` enables it, and a table whose migration has `t.tenant()` is refused while it's off, instead of being read without a tenant filter.

**What to do.** If your app has teams, enable tenancy in `config/tenancy.ts`. See [ORM: Multi-tenancy](../orm-tenancy/).

## Errors

### Error codes are lowercase

**Likelihood of impact: Medium**

**What changed.** Every error code is lowercase `snake_case`: HTTP problem codes (`NOT_FOUND` → `not_found`, `VALIDATION_FAILED` → `validation_failed`), the codes of `node strut … --json` (`PROJECT_NOT_FOUND` → `project_not_found`), and the container, devkit and model-DSL codes. Each new name is the old one in lower case.

**Why.** One spelling everywhere, matching the auth package and common RFC 9457 practice.

**Who is affected.** Clients and tests that compare `problem.code`, and apps that throw errors with their own uppercase codes.

```ts
// 0.1
if (problem.code === 'NOT_FOUND') showNotFound()

// 0.2
if (problem.code === 'not_found') showNotFound()
```

**What to do.** Switch every comparison to the lowercase name, and rename message catalog keys to `errors.<new code>.title`. On the server, old names keep working through 0.2 with a one-time `DeprecationWarning` (code `STRUTVANE_UPPERCASE_ERROR_CODE`); `LEGACY_ERROR_CODES` from `@strutvane/framework/core` lists every rename. See [Deprecations](../deprecations/).

### Validation issues gain `field`

**Likelihood of impact: Low**

**What changed.** Each entry of a validation problem's `issues` now also carries `field`, the dotted path as one string (`items.0.title`), next to the `path` array.

**What to do.** Nothing; `path` is unchanged. New code can read `field` instead of joining `path`. See [Validation](../validation/).

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

### Levels and `eject` are retired

**Likelihood of impact: Low**

**What changed.** The 0.1 levels L0–L3 and `eject` are gone. Files you own are never overwritten, and generated files (`.strutvane/`, `*.gen.ts`) are always regenerated.

**What to do.** Nothing, unless you ejected files: keep them as your own code. `node strut upgrade` still exists in 0.2.0-next.0: it bumps your Strutvane packages and three-way merges the files they generated, keeping your edits (see the [CLI Reference](../cli-reference/#add-remove-and-upgrade)).

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

`@strutvane/core`, `@strutvane/contracts`, `@strutvane/cli` and `@strutvane/devkit` are now part of `@strutvane/framework`, like `laravel/framework`, and the logging pipeline from `@strutvane/logs` is moving there too. The log viewer is the separate `@strutvane/log-viewer` package. If you imported from the old packages, import from the matching subpath instead:

| 0.1 import | 0.2 import |
|---|---|
| `@strutvane/core` | `@strutvane/framework/core` |
| `@strutvane/contracts` | `@strutvane/framework/contracts` |
| `@strutvane/cli` | `@strutvane/framework/console` (the program is `strutvane`) |
| `@strutvane/devkit` | `@strutvane/framework/devkit` |

`node strut doctor` fails while one of the old packages is still installed next to the framework, and gives the command that removes it.

### Logging uses Laravel-style channels

**Likelihood of impact: Low**

:::caution[Coming in 0.2]
Logging channels (ADR-0022) are being built and aren't in `@strutvane/framework` 0.2.0-next.0 yet. This section describes the design.
:::

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
**Fix:** remove them from `package.json`, keep `@strutvane/framework`, and change imports from the old packages to the framework's subpaths (`@strutvane/framework/core`, `/contracts`, `/console`, `/devkit`).

### `pnpm sv migrate` says "command not found"

**Why:** 0.2 apps use npm only, and the `sv` script is gone.
**Fix:**

```bash
node strut migrate
```

### `node strut migrate` still plans migrations from my models

**Why:** your project still has `defineModel()` files (and `strutvane.config.ts`), so the commands take the 0.1 path, which is deprecated and removed in 0.3.
**Fix:** write a `create_…_table` migration with the same columns, move any behaviour into the new `class … extends Model('…')` file, then delete the old model.
