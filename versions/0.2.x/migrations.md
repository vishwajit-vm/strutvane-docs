---
title: Migrations
description: Create migration files with one command, describe your tables with the Schema builder, run, check and undo migrations, and see exactly what Strutvane generates from them (types, API, screens).
---

A **migration** is a small TypeScript file that describes one change to your database: "create a `posts` table", "add a `subtitle` column", "rename `body` to `content`". Your migrations, run in order, build your whole database. This page shows every command that creates or runs them, every column you can write, and what Strutvane builds for you from them.

:::tip[Coming from Laravel?]
Almost everything carries over:

- `php artisan make:migration create_posts_table` → `node strut make:migration create_posts_table`
- `php artisan migrate` (and `:status`, `:rollback`, `:fresh`, `:refresh`, `:reset`) → `node strut migrate` (and the same sub-commands)
- `Schema::create('posts', function (Blueprint $table) { … })` → `schema.create('posts', (t) => { … })`, and `$table->string('title')` → `t.string('title')`

Three differences: `schema` is passed **into** `up()` and `down()` (there's no global `Schema`); `create_x_table` **always** writes the model too; and the migrations are the **source of truth** for your TypeScript types and metadata, so you never repeat columns in the model.
:::

## The commands at a glance

Every database command in one table. The sections below explain each one with examples.

| You want to | Run | Status |
|---|---|---|
| **Create a migration file** (and the model, for a new table) | `node strut make:migration create_posts_table` | Available |
| Create a migration plus a seeder and a factory | `node strut make:migration create_posts_table --seeder` | Available |
| Create a migration plus only a factory | `node strut make:migration create_posts_table --factory` | Available |
| Create a model (with optional extra files) | `node strut make:model Post -a` | Coming in 0.2 (see [below](#creating-a-model-makemodel)) |
| Run every migration that hasn't run yet | `node strut migrate` | Available |
| See the SQL without running it | `node strut migrate --pretend` | Available |
| Run migrations one at a time (each its own batch) | `node strut migrate --step` | Available |
| Run migrations and then the seeders | `node strut migrate --seed` | Available |
| Run migrations in production | `node strut migrate --force` | Available |
| Skip, instead of waiting, when another server is migrating | `node strut migrate --isolated` | Available |
| See which migrations have run | `node strut migrate:status` | Available |
| Undo the last batch | `node strut migrate:rollback` | Available |
| Undo the last few migrations | `node strut migrate:rollback --step=3` | Available |
| Undo one batch by its number | `node strut migrate:rollback --batch=2` | Available |
| Undo every migration | `node strut migrate:reset` | Available |
| Undo everything, then run everything again | `node strut migrate:refresh` | Available |
| Drop every table and run everything again | `node strut migrate:fresh` | Available |
| Regenerate types and metadata without touching the database | `node strut sync` | Available |
| Run the seeders | `node strut db:seed` | Available |
| Squash old migrations into one schema file | `node strut schema:dump` | Coming in 0.3 |

"Available" means the command is in `@strutvane/framework` 0.2.0-next.0 (the framework's `main` branch); "Coming in 0.2" means it's designed and arrives before 0.2 is released. Every command also takes `--help` (`node strut migrate --help`), and `--json` for scripts.

## What is a migration?

Think of migrations as version control for your database. Every teammate and every server runs the same files in the same order and ends up with the same tables.

In Strutvane, migrations are also **the single source of truth**. Your columns are written here, and only here. From your migrations, `node strut migrate` generates:

- your **TypeScript types** (`Post`, `NewPost`, `PostPatch`, `PostJson`);
- the **metadata** the API and UI run on (labels, which fields are searchable, sortable and filterable, relations, slugs);
- the **SQL** for MySQL, PostgreSQL or SQLite;
- a **CRUD API** and, if your project has a UI, **screens and a sidebar entry** for every new table.

Because all of these come from the same file, they can't drift apart.

## Your first migration, step by step

This is the whole flow, from nothing to a working `posts` table.

1. **Create the migration file.** In your project folder, run:

   ```bash
   node strut make:migration create_posts_table
   ```

   **What you'll see:**

   ```text
     create    database/migrations/2026_11_15_093000_create_posts_table.ts
     create    app/models/post.ts
   ✔ migration-first: 2 file(s) written.
   Next: node strut migrate
   ```

2. **Open the migration** `database/migrations/2026_11_15_093000_create_posts_table.ts`. Strutvane already wrote the table with an `id` and timestamps:

   ```ts title="database/migrations/2026_11_15_093000_create_posts_table.ts"
   import { migration } from '@strutvane/framework/schema'

   export default migration({
     up(schema) {
       schema.create('posts', (t) => {
         t.id()
         // Add your columns here, for example:
         // t.string('title', 200)
         // t.slug('slug').from('title')
         t.timestamps()
       })
     },
     down(schema) {
       schema.dropIfExists('posts')
     },
   })
   ```

3. **Add your columns** between `t.id()` and `t.timestamps()`:

   ```ts title="database/migrations/2026_11_15_093000_create_posts_table.ts"
   import { migration } from '@strutvane/framework/schema'

   export default migration({
     up(schema) {
       schema.create('posts', (t) => {
         t.id()
         t.string('title', 200)
         t.slug('slug').from('title')
         t.text('body').nullable()
         t.enum('status', ['draft', 'published']).default('draft')
         t.foreignId('author_id').constrained('users')
         t.timestamps()
         t.softDeletes()
       })
     },
     down(schema) {
       schema.dropIfExists('posts')
     },
   })
   ```

4. **Run it:**

   ```bash
   node strut migrate
   ```

   **What you'll see** (the generated files are listed once, the first time):

   ```text
   Database: mysql://root@127.0.0.1:3306/my_app
   ✔ Migrated 2026_11_15_093000_create_posts_table (batch 1)
   Updated .strutvane/resources.json
   Updated .strutvane/schema.json
   Updated .strutvane/types/models.d.ts
   ```

   (Plus `Updated` lines for the `.strutvane/sql/…` files, two per database engine.) The `posts` table here points at `users`, so a `create_users_table` migration must run first; a new app has one.

5. **Use it.** The table exists, `app/models/post.ts` is fully typed, and `post.title` is a `string` in your editor. See [ORM: Getting Started](../orm/) to read and write posts.

## Creating a migration: `make:migration`

`make:migration` is the command that creates a migration file. It takes one **argument**, the name of the change, in snake_case (lower-case words joined by `_`):

```bash
node strut make:migration create_posts_table
node strut make:migration add_subtitle_to_posts_table
node strut make:migration backfill_slugs
```

### Where the file goes and how it's named

The file lands in `database/migrations/`. Its name starts with the date and time **in UTC** (so every machine and time zone agrees), then your name:

```text
database/migrations/2026_11_15_093000_create_posts_table.ts
                    └ year_month_day_hhmmss ┘└ your name ┘
```

Migrations run in the order of their file names, so a migration created later always runs later. Strutvane sorts names the same way on Windows, macOS and Linux (character by character, never by your computer's language settings), so the order never differs between machines.

### The name tells Strutvane what you're doing

Strutvane reads the name to give you a head start, like Laravel:

| Name pattern | Example | What the file contains | Model |
|---|---|---|---|
| `create_<table>_table` | `create_posts_table` | `schema.create('posts', …)` with `t.id()` and `t.timestamps()`, and `dropIfExists` in `down()` | **Created** (`app/models/post.ts`) if it doesn't exist |
| `<anything>_to_<table>_table` | `add_subtitle_to_posts_table` | `schema.table('posts', …)` in both `up()` and `down()` | not touched |
| `<anything>_from_<table>_table` | `remove_excerpt_from_posts_table` | `schema.table('posts', …)` | not touched |
| `<anything>_in_<table>_table` | `rename_body_in_posts_table` | `schema.table('posts', …)` | not touched |
| `<anything>_on_<table>_table` | `add_index_on_posts_table` | `schema.table('posts', …)` | not touched |
| anything else | `backfill_slugs`, `rename_labels_to_tags` | empty `up()` and `down()` | not touched |

Multi-word table names work too: `create_blog_posts_table` creates the table `blog_posts` and the model `BlogPost` in `app/models/blog-post.ts`.

:::note[Why the model comes with the table]
In Strutvane one table has one model. Writing it for you means you can use the table right after `migrate`. If `app/models/post.ts` already exists, it's kept untouched and the command says `Kept app/models/post.ts (it already exists).`
:::

### The exact files it writes

**A `create_…_table` migration** is the one shown in [step 2 above](#your-first-migration-step-by-step).

**A change migration** (`add_subtitle_to_posts_table`):

```ts title="database/migrations/2026_11_15_101500_add_subtitle_to_posts_table.ts"
import { migration } from '@strutvane/framework/schema'

export default migration({
  up(schema) {
    schema.table('posts', (t) => {
      // Add, rename or drop columns here.
    })
  },
  down(schema) {
    schema.table('posts', (t) => {
      // Undo exactly what up() did, in reverse order.
    })
  },
})
```

**A blank migration** (`backfill_slugs`):

```ts title="database/migrations/2026_11_15_102000_backfill_slugs.ts"
import { migration } from '@strutvane/framework/schema'

export default migration({
  up(schema) {},
  down(schema) {},
})
```

**The model** written for `create_posts_table`:

```ts title="app/models/post.ts"
import { Model } from '@strutvane/framework/database'

/**
 * The `posts` table. Its columns come from the migrations (`node strut migrate` regenerates
 * the types), so they are never repeated here. Add relations, scopes and accessors in the class.
 */
export class Post extends Model('posts', {
  // The columns a request may set with Post.create(…) / fill(…). Nothing until you list them.
  fillable: [],
}) {}
```

`fillable` starts **empty** on purpose: nobody can write any column through a form or the API until you list it. That's Strutvane's deny-by-default rule; see [Mass Assignment](../orm-mass-assignment/).

The name you type is turned into snake_case for you: `node strut make:migration CreatePostsTable` writes `…_create_posts_table.ts`. It must start with a letter and use only letters, digits, `-` and `_`.

### `--seeder` and `--factory`

| Option | What it adds |
|---|---|
| `--seeder` | `database/seeders/post.seeder.ts` **and** `database/factories/post.factory.ts` (the seeder uses the factory), and adds the seeder to the list in `database/seeders/database.seeder.ts` (creating that file if it's missing) |
| `--factory` | Only `database/factories/post.factory.ts` |

```bash
node strut make:migration create_posts_table --seeder
```

**What you'll see:**

```text
  create    database/migrations/2026_11_15_093000_create_posts_table.ts
  create    app/models/post.ts
  create    database/factories/post.factory.ts
  create    database/seeders/post.seeder.ts
  update    database/seeders/database.seeder.ts
✔ migration-first: 5 file(s) written.
Next: node strut migrate
```

A file that already exists (the model, the seeder or the factory) is never overwritten; the command says `Kept app/models/post.ts (it already exists).` instead. The seeder is **appended** to the list between the `// strut:seeders:start` and `// strut:seeders:end` markers, so tables created later are seeded later. If your `database.seeder.ts` has no markers, nothing in it is touched, and the command prints the two lines to add yourself.

These options need to know the table, so they work with `create_…_table` and `…_to_/_from_/_in_/_on_…_table` names, not with free names like `backfill_slugs`. See [Seeding](../seeding/) and [Factories](../orm-factories/) for what goes in those files.

### Running it with no name

`node strut make:migration` with no name stops with:

```text
error Missing required argument <name>.
hint: Usage: node strut make:migration <name> [flags]
```

Asking for the name interactively instead is coming in 0.2.

### Help for the command

```bash
node strut make:migration --help
```

prints the argument, the options and two examples (`create_posts_table --seeder`, `add_subtitle_to_posts_table`).

## Creating a model: `make:model`

You rarely need this, because `make:migration create_…_table` writes the model for you. It's for when you want the model first, or several files at once, like Laravel's `make:model`.

```bash
node strut make:model Post        # app/models/post.ts
node strut make:model Post -m     # plus a create_posts_table migration
node strut make:model Post -a     # plus everything below
```

| Flag | Adds |
|---|---|
| `-m`, `--migration` | `database/migrations/<now>_create_posts_table.ts` |
| `-f`, `--factory` | `database/factories/post.factory.ts` |
| `-s`, `--seeder` | `database/seeders/post.seeder.ts` |
| `-c`, `--controller` | `app/http/controllers/post.controller.ts` |
| `-a`, `--all` | all of the above |

The model's table name is the plural snake_case of the class name: `Post` → `posts`, `BlogPost` → `blog_posts`, `Category` → `categories`.

:::caution[Coming in 0.2]
`make:model` with these flags is designed (blueprint §2.2) for migration-first apps but not built yet. The `node strut make:model` on framework `main` is the 0.1 command: it writes the old `defineModel` model layer, a policy, a factory, a seeder and a test, not the `Model('posts')` class above. Until the new one arrives, use `make:migration create_posts_table`, which writes the model too.
:::

## The structure of a migration

Every migration file default-exports `migration({ up, down })`:

- `up(schema)` makes the change;
- `down(schema)` undoes it, so the change can be rolled back.

```ts title="database/migrations/2026_11_15_093000_create_tags_table.ts"
import { migration } from '@strutvane/framework/schema'

export default migration({
  up(schema) {
    schema.create('tags', (t) => {
      t.id()
      t.string('name', 60).unique()
      t.timestamps()
    })
  },
  down(schema) {
    schema.dropIfExists('tags')
  },
})
```

`schema` is handed to your functions as a **parameter**; there's no global database object. That small detail lets Strutvane run your migrations **in memory, without a database**, to work out your types. It also means a migration can't touch your data by accident while Strutvane is only reading it.

`up()` and `down()` must be **synchronous**: no `async` and no `await`. Everything after the first `await` would be missing from the types and the SQL, so an `async up()` is refused.

### Migrations run in a sandbox

Every command that reads your migrations (`migrate` and its friends, `migrate:status`, `db:seed` and `sync`) runs them, which means their code executes. A migration that arrives with a `git pull` or a pull request must not be able to read your secrets or reach the network while that happens. So Strutvane **replays** them in a locked-down child process (the **sandbox**), and checks each file before it runs:

- **Imports:** only `@strutvane/framework/schema`, and your own `.ts` helper files inside `database/migrations`, written as `./path/file.ts`. Type-only imports are fine.
- **Forbidden code:** `process`, `globalThis`, `global`, `eval`, `Function`, `fetch`, `require`, `module`, `exports`, `__dirname`, `__filename`, `import.meta`, `import()`, `import x = require()` and `export =`.
- **Files:** every migration must be a real file inside the folder (no symbolic links), and the folder may not contain a `package.json` or a `node_modules`. Every `.ts` file directly in `database/migrations` must be named like a migration, so helpers go in a subfolder (for example `database/migrations/support/columns.ts`).
- **The child process** gets no environment variables (so no `.env` value or token), may not write files or start programs, and is stopped after 10 seconds.
- **Size limits:** a migration may record at most 1,000 operations; a string or slug length is 1 to 65,535, a decimal's precision 1 to 65, and its scale at most the precision.

```ts title="database/migrations/support/columns.ts"
import type { Blueprint } from '@strutvane/framework/schema'

/** Columns every content table has. */
export function contentColumns(t: Blueprint): void {
  t.string('title', 200)
  t.text('body').nullable()
}
```

```ts title="database/migrations/2026_11_15_120000_create_pages_table.ts"
import { migration } from '@strutvane/framework/schema'
import { contentColumns } from './support/columns.ts'

export default migration({
  up(schema) {
    schema.create('pages', (t) => {
      t.id()
      contentColumns(t)
      t.timestamps()
    })
  },
  down(schema) {
    schema.dropIfExists('pages')
  },
})
```

Code that needs the environment, files or the network (an import, a backfill from an API) belongs in a [seeder](../seeding/) or your app, never in a migration.

## Running migrations: `migrate`

```bash
node strut migrate
```

`migrate` does five things, in this order:

1. **Replays your migrations** in the [sandbox](#migrations-run-in-a-sandbox), which checks them and records what each one does, without a database.
2. **Applies every migration that hasn't run yet**, oldest first, and records each one in the `migrations` table. On PostgreSQL and SQLite each migration runs in one transaction; on MySQL and MariaDB it runs statement by statement and can resume (see [When a migration fails](#when-a-migration-fails)). Before a migration runs, a **safety check**:
   - **stops** the run when it adds a required column without a default to a table that already has rows;
   - **stops** the run when it creates a table called `migrations` (Strutvane's own);
   - **warns** when it drops a column and adds one of the same type in the same table, which looks like a rename that would lose the data.
3. **Regenerates your types and metadata** in `.strutvane/` (see [What `migrate` generates](#what-migrate-generates)).
4. **Compares the database with your migrations** and prints a `Schema drift: …` warning for every table, column or index that differs (for example a column someone added by hand).
5. **Seeds**, only with `--seed`: runs `database/seeders/database.seeder.ts`. See [Seeding](../seeding/).

Each `migrate` run is one **batch**: a group of migrations applied together. `migrate:rollback` undoes exactly one batch, so it undoes what you last applied.

**What you'll see:**

```text
Database: mysql://root@127.0.0.1:3306/my_app
✔ Migrated 2026_11_15_093000_create_posts_table (batch 2)
✔ Migrated 2026_11_15_101500_add_subtitle_to_posts_table (batch 2)
Updated .strutvane/resources.json
Updated .strutvane/schema.json
Updated .strutvane/types/models.d.ts
```

When there's nothing to do:

```text
Database: mysql://root@127.0.0.1:3306/my_app
✔ Nothing to migrate.
```

The `Database:` line shows where Strutvane connected, never the password. The `Updated` lines list only the generated files that changed.

### The options

| Option | When you'd use it | What it does |
|---|---|---|
| `--pretend` | You want to read the SQL before it runs, for example before a production deploy | Prints the SQL each pending migration would run, and changes nothing |
| `--step` | You want to be able to roll back each migration on its own | Gives each migration its own batch |
| `--seed` | You want the seeders after migrating | Runs `database/seeders/database.seeder.ts` after the migrations |
| `--force` | You're deploying to production | When `APP_ENV=production`, `migrate` refuses to change the database without it (there's no "Are you sure?" question to answer, so deploy scripts always pass it) |
| `--isolated` | Several servers deploy at once | Doesn't wait when another `migrate` holds the lock: it says so and changes nothing |

```bash
node strut migrate --pretend
```

**What you'll see** (on MySQL; the SQL depends on your migration and your database):

```text
Database: mysql://root@127.0.0.1:3306/my_app
-- 2026_11_15_101500_add_subtitle_to_posts_table
ALTER TABLE `posts` ADD COLUMN `subtitle` VARCHAR(255) NULL;
```

**Only one `migrate` at a time.** While it runs, `migrate` holds a lock in the database (an advisory lock on PostgreSQL, `GET_LOCK` on MySQL and MariaDB; SQLite's own file lock). A second `migrate` started at the same time, for example by a second server during a deploy, waits up to 10 seconds and then stops with `Another migration run is in progress on this database`. With `--isolated` it doesn't wait:

```text
warning: Another node strut migrate holds the migration lock; nothing ran (--isolated).
```

So every server can run `node strut migrate --force --isolated` at start-up, and the migrations run exactly once.

:::note[0.1 apps]
In an app that still uses the 0.1 model layer (`strutvane.config.ts` and `defineModel`, no Laravel-named migration files), `migrate` runs the 0.1 planner instead, with its own flags (`--name`, `--rename old=new`, `--separate old=new`, `--allow-destructive`). See the [upgrade guide](../upgrade/).
:::

### What `migrate` generates

These files are **machine-owned**: Strutvane rewrites them on every run (and on `node strut sync`), and you never edit them. They're committed to git, so a fresh clone type-checks before anyone runs a database.

| File | What's in it |
|---|---|
| `.strutvane/types/models.d.ts` | Four types per table (below), registered with `@strutvane/framework/database` so `Model('posts')` knows its columns |
| `.strutvane/resources.json` | Per table: labels, the title field, which fields are searchable, sortable and filterable (and with which operators), form inputs, relations, the slug source, soft deletes |
| `.strutvane/schema.json` | Every table, column, index and key after your last migration: what the ORM reads at runtime |
| `.strutvane/sql/schema.<engine>.sql` | The whole schema as SQL, for `mysql`, `mariadb`, `postgres` and `sqlite` |
| `.strutvane/sql/migrations.<engine>.sql` | What each migration runs on that engine, for review |

Hidden and secret columns are never searchable, sortable or filterable in `resources.json`, and `text` and `json` columns are never sortable.

The four types for `posts`:

```ts title=".strutvane/types/models.d.ts (excerpt)"
export interface Post {          // a row, as a model sees it
  id: number
  title: string
  slug: string
  body: string | null
  status: 'draft' | 'published'
  author_id: number
  created_at: Date | null
  updated_at: Date | null
  deleted_at: Date | null
}
export interface NewPost {       // what creating a post needs
  title: string
  slug?: string
  body?: string | null
  status?: 'draft' | 'published'
  author_id: number
}
export type PostPatch = Partial<NewPost>   // what an update accepts
export interface PostJson {      // what the API returns: dates as ISO strings
  // the same fields, with created_at: string | null and so on
}
```

### Coming in 0.2: the API, screens and sidebar

:::caution[Coming in 0.2]
Everything in this section is designed (blueprint §2.4) but not on framework `main` yet: on `main`, `migrate` writes the files above and nothing else. The generated CRUD API, `routes/resources.gen.ts`, the UI registry (`.strutvane/ui.gen.ts`), the `resources/ui/*.ui.ts` screens, the sidebar entries and the model switches `api: false` / `ui: false` arrive with 0.2.
:::

**The API.** For `posts` you'll get, with no code of your own (see [Auto CRUD](../crud/)):

```text
GET    /api/posts                  a page of posts (?page, ?perPage, ?search, ?sort, ?filter[…])
GET    /api/posts/1                one post (or /api/posts/hello-world, by its slug)
POST   /api/posts                  create
PATCH  /api/posts/1                update
DELETE /api/posts/1                delete (soft, because the table has deleted_at)
POST   /api/posts/1/restore        bring a soft-deleted post back
```

The post in the address is found by **route model binding**: by id, or by slug when the table has one (`{post:slug}`). Soft-deleted rows are hidden from lists unless you ask with `?filter[trashed]=with` (all rows) or `?filter[trashed]=only` (only deleted ones).

**The screens.** For a **new** table only, `migrate` writes `resources/ui/posts.ui.ts`, a file **you own**, starting with `columns: auto()` and `form: auto()`. `auto()` keeps picking up new columns on every later migration. Strutvane never overwrites this file. If you replace `auto()` with an explicit list, later migrations report new columns instead of adding them. See [Customising the CRUD](../crud-customising/).

**The sidebar.** Every table with a screen gets a sidebar entry (its plural label, for example "Posts"), shown only to users whose policy allows `viewAny`. New apps' policies allow only admins until you edit them. See [Sidebar](../crud-sidebar/).

**Tables that never get an API or screens:** Strutvane's internal tables (users, sessions, cache, jobs, password resets, access tokens, roles and memberships, audit, `migrations`) and every table created with `{ internal: true }` (see [Tenant columns](#tenant-columns)) are always skipped, for security.

#### Stopping generation for a model

| You want | Do this |
|---|---|
| Keep the screens, hide the sidebar entry | In `resources/ui/posts.ui.ts`: `navigation: { hidden: true }` |
| Your own API code instead of the generated one | `node strut make:controller PostController --resource`, then route it yourself |
| Nobody (but admins) to see the table | Leave the generated policy as it is: it denies everyone but admins |
| No generated API for a model | `Model('posts', { fillable: [...], api: false })` |
| No generated screens or sidebar entry for a model | `Model('posts', { fillable: [...], ui: false })` |
| Neither | `Model('posts', { fillable: [...], api: false, ui: false })` |

```ts title="app/models/audit-note.ts"
import { Model } from '@strutvane/framework/database'

/** Used by our own code only: no generated API, no screens. (The api/ui switches arrive with 0.2.) */
export class AuditNote extends Model('audit_notes', { fillable: [], api: false, ui: false }) {}
```

**What you'll see** after the next `node strut migrate`, once 0.2 ships: no `audit-notes` route in `node strut route:list`, and no "Audit notes" entry in the sidebar. Your own code still uses the model as usual.

## Checking and undoing migrations

### `migrate:status`

```bash
node strut migrate:status
```

**What you'll see:**

```text
Database: mysql://root@127.0.0.1:3306/my_app
Migration                                       Status
0001_01_01_000000_create_users_table            ran (batch 1)
2026_11_15_093000_create_posts_table            ran (batch 2)
2026_11_15_101500_add_subtitle_to_posts_table   pending
```

A migration whose history doesn't match its file shows up as `drift: missing` (it ran, but the file is gone), `drift: changed` (the file was edited after it ran) or `drift: partial` (a MySQL or MariaDB migration stopped halfway). With any drift, `migrate:status` exits with code **1**, so a deploy script can stop. A `partial` migration is finished by the next `node strut migrate`; with a `missing` or `changed` one, every other command refuses to run until it's fixed (see [Common mistakes](#common-mistakes)).

### `migrate:rollback`

Undoes the **last batch**: runs the `down()` of each migration in it, newest first, and forgets that they ran.

```bash
node strut migrate:rollback              # undo the last batch
node strut migrate:rollback --step=2     # undo the last two migrations, whatever their batch
node strut migrate:rollback --batch=3    # undo batch 3
node strut migrate:rollback --pretend    # print the SQL; change nothing
```

**What you'll see:**

```text
Database: mysql://root@127.0.0.1:3306/my_app
✔ Rolled back 2026_11_15_101500_add_subtitle_to_posts_table
Updated .strutvane/resources.json
```

With nothing to undo, it says `✔ Nothing to roll back.` `--step` and `--batch` take a whole number of 1 or more.

### `migrate:reset`, `migrate:refresh` and `migrate:fresh`

| Command | What it does | Data |
|---|---|---|
| `migrate:reset` | Rolls back **every** migration, newest first, through their `down()` | Deleted |
| `migrate:refresh` | `migrate:reset`, then `migrate` | Deleted |
| `migrate:fresh` | **Drops every table** (without running any `down()`), then `migrate` | Deleted |

Add `--seed` to `migrate:refresh` or `migrate:fresh` to seed afterwards:

```bash
node strut migrate:fresh --seed
```

**What you'll see:** one `Dropped table …` line per table, then the `✔ Migrated …` lines and, with `--seed`, one `✔ Seeded …` line per seeder.

`migrate:fresh` is the fastest way back to a clean database on your own machine, and it works even when a `down()` is broken. `migrate:refresh` is the way to test that all your `down()` functions really work.

:::danger[These delete all your data]
`migrate:rollback`, `migrate:reset`, `migrate:refresh` and `migrate:fresh` delete data. Use them on your own machine only, never on a shared or production database.
:::

**Two guards stop them in the wrong place.** They are **destructive** commands: they run without asking only when `APP_ENV` is `local`, `test`, `testing` or `development`. Anywhere else, **including when `APP_ENV` isn't set at all**, they stop with:

```text
error `node strut migrate:fresh` is destructive and APP_ENV is not set; it runs without confirmation only in local, test, testing or development.
hint: Set APP_ENV for this project, or pass --force --i-understand if you really mean it.
```

Set `APP_ENV=local` in your `.env` (a new app has it). On a server you really mean to change, pass `--force --i-understand` (and `--force` alone is also what `APP_ENV=production` asks for). Destructive commands must also be typed in full: `node strut migrate:fr` isn't accepted as a short form.

### Where Strutvane remembers what ran

A table called `migrations` holds one row per migration that has run: its name, its batch number, a **checksum** of what it does (so an edited migration is noticed instead of silently skipped) and, on MySQL and MariaDB, how far an unfinished one got. Like Laravel's, it's internal: it never gets an API or a screen. Never edit it by hand unless a fix below tells you to.

### Regenerating without the database: `sync`

```bash
node strut sync
```

Regenerates everything in `.strutvane/` (types, `resources.json`, `schema.json`, the SQL files) from your migrations, **without** touching the database. Use it after a merge conflict in `.strutvane/`, or when a teammate's migration arrived and you only want your editor's types updated.

**What you'll see:** `✔ Updated .strutvane/types/models.d.ts` for each file that changed, or `✔ .strutvane/ is up to date.`

### Squashing old migrations: `schema:dump`

After a few years, an app can have hundreds of migrations. `node strut schema:dump` will write the current schema to one SQL file per engine, so new databases start from it instead of replaying every old migration. *(Coming in 0.3.)*

## Tables

| Call | What it does |
|---|---|
| `schema.create('posts', (t) => { … })` | Create a table. Inside, you can only **add** columns and indexes. |
| `schema.table('posts', (t) => { … })` | Change an existing table: add, rename or drop columns and indexes. |
| `schema.rename('labels', 'tags')` | Rename a table. Indexes keep their names; foreign keys in other tables follow the new name. |
| `schema.drop('posts')` | Delete a table that must exist. |
| `schema.dropIfExists('posts')` | Delete a table if it exists; the usual choice in `down()`. |
| `schema.hasTable('posts')` | `true` if the table exists **at this point in your migrations**. |
| `schema.hasColumn('posts', 'slug')` | `true` if the column exists at this point. |

`hasTable` and `hasColumn` answer from the migrations that ran before this one, so they give the same answer with or without a database.

Table, column and index names must be lower-case snake_case (letters, digits and `_`, starting with a letter or `_`) and at most 63 characters. That keeps them portable across all three databases (PostgreSQL silently cuts longer names, which could make two names collide).

## Columns

Every column method takes the column name first. Columns are **required** (`NOT NULL`) unless you add `.nullable()`.

| Method | Example | TypeScript type | Notes |
|---|---|---|---|
| `t.id(name = 'id')` | `t.id()` | `number` | Auto-increment primary key (a 64-bit integer), Laravel's default. One per table, only in `schema.create`. |
| `t.uuid('id').primary()` | `t.uuid('id').primary()` | `string` | A UUID primary key instead: a time-ordered UUIDv7 that Strutvane makes before the insert. Hard to guess, so good for ids in URLs. |
| `t.string(name, length = 255)` | `t.string('title', 200)` | `string` | Short text, 1 to 65,535 characters. The length is enforced on every engine, SQLite included. |
| `t.text(name)` | `t.text('body')` | `string` | Long text, no length limit. Never sortable in the generated metadata. |
| `t.slug(name = 'slug', length = 255)` | `t.slug('slug').from('title')` | `string` | A URL-friendly name, filled in from another column and always unique. See [Slugs](#slugs). |
| `t.integer(name)` | `t.integer('stock')` | `number` | A 32-bit whole number. |
| `t.bigInteger(name)` | `t.bigInteger('views')` | `number` | A 64-bit whole number. JavaScript numbers are exact up to 2^53; Strutvane refuses bigger values rather than rounding them. |
| `t.decimal(name, precision = 8, scale = 2)` | `t.decimal('price', 12, 2)` | `string` | An exact number, for money. Read back as a string (`'12.50'`), so no cents are lost; you may write a number or a string. Precision 1 to 65, scale 0 up to the precision. |
| `t.double(name)` | `t.double('rating')` | `number` | An approximate number. Never use it for money. |
| `t.boolean(name)` | `t.boolean('featured')` | `boolean` | Yes or no. |
| `t.enum(name, values)` | `t.enum('status', ['draft', 'published'])` | `'draft' \| 'published'` | One of a fixed list. The list can't be empty or repeat a value. |
| `t.date(name)` | `t.date('published_on')` | `string` | A calendar date, `'2026-11-15'`, with no time and no time zone. |
| `t.timestamp(name)` | `t.timestamp('sent_at')` | `Date` | A point in time, stored in UTC. |
| `t.uuid(name)` | `t.uuid('public_id')` | `string` | A UUID, stored in one spelling (lower case). |
| `t.json(name)` | `t.json('meta')` | `JsonValue` | Any JSON. Can't have a default. Give it a precise type with a [cast](../orm-casts/). |
| `t.foreignId(name)` | `t.foreignId('author_id').constrained('users')` | `number` | Holds another table's `id`. See [Foreign keys](#foreign-keys). |
| `t.foreignUuid(name)` | `t.foreignUuid('order_id').constrained('orders')` | `string` | Holds another table's UUID key (`t.uuid('id').primary()`). |
| `t.tenant(name = 'tenant_id')` | `t.tenant()` | `string` | The team a row belongs to (a required UUID). See [Tenant columns](#tenant-columns). |
| `t.timestamps()` | | `Date \| null` | Adds nullable `created_at` and `updated_at`, which Strutvane fills in on every create and update. |
| `t.softDeletes()` | | `Date \| null` | Adds a nullable `deleted_at`. Deleting a row then hides it so it can be restored. See [Soft Deletes](../orm-soft-deletes/). |

How each type is stored, per engine:

| Method | MySQL (and MariaDB) | PostgreSQL | SQLite |
|---|---|---|---|
| `id` | `BIGINT UNSIGNED AUTO_INCREMENT` | `BIGINT GENERATED BY DEFAULT AS IDENTITY` | `INTEGER PRIMARY KEY AUTOINCREMENT` |
| `string`, `slug` | `VARCHAR(n)` | `VARCHAR(n)` | `VARCHAR(n)` (length checked by Strutvane) |
| `text` | `TEXT` | `TEXT` | `TEXT` |
| `integer` | `INT` | `INTEGER` | `INTEGER` |
| `bigInteger` | `BIGINT` | `BIGINT` | `INTEGER` |
| `foreignId` | `BIGINT UNSIGNED` (to match `id`) | `BIGINT` | `INTEGER` |
| `decimal` | `DECIMAL(p, s)` | `NUMERIC(p, s)` | `NUMERIC` (about 15 digits; re-formatted on the way out) |
| `double` | `DOUBLE` | `DOUBLE PRECISION` | `REAL` |
| `boolean` | `TINYINT(1)` | `BOOLEAN` | `INTEGER` (0/1) |
| `enum` | native `ENUM(…)` | `VARCHAR(255)` + `CHECK` | `VARCHAR(255)` + `CHECK` |
| `date` | `DATE` | `DATE` | `DATE` |
| `timestamp` | `DATETIME(3)`, in UTC | `TIMESTAMP(3) WITH TIME ZONE` | `DATETIME` |
| `uuid`, `foreignUuid`, `tenant` | `CHAR(36)` | `UUID` | `VARCHAR(36)` |
| `json` | `JSON` (MariaDB: `LONGTEXT` + `CHECK (JSON_VALID(…))`) | `JSONB` | `TEXT` |

You never write these types yourself; the table is here so you know what you'll see in a database client like TablePlus or DBeaver. On MySQL and MariaDB, timestamps are `DATETIME(3)` holding UTC, not `TIMESTAMP`, so dates after 2038 work and the server's time zone never changes them. Slugs, UUIDs and `string` columns named like identifiers (`email`, `username`, `token`, `…_email`, `…_token`) are compared byte for byte there, so `A` and `a` are different values, as on the other engines.

### Column modifiers

Chain these after a column:

| Modifier | Example | What it does |
|---|---|---|
| `.nullable()` | `t.string('subtitle').nullable()` | The column may be empty (`NULL`). Its type becomes `string \| null`. |
| `.default(value)` | `t.boolean('featured').default(false)` | The value new rows get when none is given. Must match the column's type. |
| `.unique()` | `t.string('email').unique()` | No two rows may have the same value. Adds the index `<table>_<column>_unique`. |
| `.index()` | `t.string('sku').index()` | Faster lookups and sorting. Adds the index `<table>_<column>_index`. |
| `.comment(text)` | `t.string('code').comment('Shown on invoices')` | A note stored with the column (MySQL and PostgreSQL). |
| `.secret()` | `t.string('api_key_hint').secret()` | Never returned, searched, sorted or shown, and redacted in logs. See [Secret columns](#secret-columns). |
| `.hidden()` | `t.decimal('cost_price', 12, 2).hidden()` | Left out of `toJSON()`, the API and the screens. |
| `.primary()` | `t.uuid('id').primary()` | Only on `uuid`: makes it the primary key. |
| `.from(column)` | `t.slug('slug').from('title')` | Only on `slug`: the column the slug is made from. |

They combine in any order:

```ts
t.string('subtitle', 120).nullable().default(null)
t.enum('status', ['draft', 'published']).default('draft').index()
t.decimal('price', 12, 2).default('0.00')   // decimals accept a number or a string
```

**Mistakes are caught before anything runs.** These don't compile:

```ts
t.enum('status', ['draft', 'published']).default('archived') // 'archived' isn't in the list
t.boolean('featured').default('yes')                          // a boolean needs true or false
t.string('title').from('name')                                 // only slugs have .from()
t.integer('author_id').constrained()                           // only foreignId can be constrained
t.enum('status', [])                                           // an enum needs at least one value
t.json('meta').default({})                                     // JSON columns can't have a default
```

### Indexes

An **index** is a lookup table the database keeps next to your table, so finding and sorting rows by those columns is fast. A **unique** index also stops duplicates.

```ts
schema.table('posts', (t) => {
  t.index('status')                               // posts_status_index
  t.index(['author_id', 'created_at'])            // posts_author_id_created_at_index
  t.unique(['author_id', 'title'])                // posts_author_id_title_unique
  t.unique('code', 'posts_public_code_unique')    // your own name
})
```

Names follow Laravel's rule, `<table>_<columns>_index` or `<table>_<columns>_unique`, and must be unique across the **whole database** (PostgreSQL and SQLite require it). Remove one by its name:

```ts
t.dropIndex('posts_status_index')
t.dropUnique('posts_author_id_title_unique')
```

Dropping a column also drops every index that covers it.

### Foreign keys

A **foreign key** is a column that points at a row in another table, like `posts.author_id` pointing at `users.id`. The database then refuses an `author_id` that doesn't exist.

```ts
schema.create('posts', (t) => {
  t.id()
  t.foreignId('author_id').constrained('users')                       // author_id → users.id
  t.foreignId('category_id').nullable().constrained().nullOnDelete()   // guesses `categories`
  t.timestamps()
})

schema.create('comments', (t) => {
  t.id()
  t.foreignId('post_id').constrained().cascadeOnDelete()               // deleting a post deletes its comments
  t.text('body')
  t.timestamps()
})
```

| Method | What it does |
|---|---|
| `.constrained(table?, column = 'id')` | Adds the foreign key. With no table, it's guessed Laravel's way: `category_id` → `categories`, `post_id` → `posts`. |
| `.cascadeOnDelete()` | Deleting the parent deletes this row too. |
| `.nullOnDelete()` | Deleting the parent sets this column to `NULL`. The column must be `.nullable()`. |
| `.restrictOnDelete()` | The parent can't be deleted while rows point at it. |
| *(none of the three)* | `NO ACTION`: the database refuses to delete a parent that still has children. |

Call `.constrained()` **before** the on-delete rule. The parent table must already exist, so create parents in earlier migrations. A table can point at itself (`t.foreignId('parent_id').nullable().constrained('categories')` inside `categories`).

To remove a foreign key column and its constraint together:

```ts
t.dropConstrainedForeignId('category_id')
```

### Slugs

A **slug** is the URL-friendly version of a title: `Hello, World!` becomes `hello-world`, so a post's address can be `/posts/hello-world` instead of `/posts/17`.

```ts
t.string('title', 200)
t.slug('slug').from('title')
```

- The slug is filled in from `title` when a row is created without one, and **stays the same** afterwards, so links never break.
- It's always unique: Strutvane adds the unique index even if you forget `.unique()`. With teams on, the index is on `(tenant_id, slug)`, so each team has its own slugs.
- A taken slug gets `-2`, `-3`, … (`hello-world-2`).
- Accents are folded (`Crème brûlée` → `creme-brulee`).
- You can't drop the source column (`title`) while the slug is built from it.

See [ORM: Slugs](../orm-slugs/) for what happens when two posts have the same title, and [Slugs in the CRUD](../crud-slugs/) for slug URLs.

### Timestamps and soft deletes

```ts
t.timestamps()     // created_at, updated_at
t.softDeletes()    // deleted_at
```

You never set these yourself: Strutvane writes `created_at` on insert, `updated_at` on every update, and `deleted_at` when you `delete()` a row of a soft-deleting table. Remove them with `t.dropTimestamps()` and `t.dropSoftDeletes()`.

### Tenant columns

If your app has **teams** (each customer company sees only its own data), every table that belongs to a team needs a tenant column. See [Multi-tenancy](../tenancy/) for the whole picture.

```ts
schema.create('projects', (t) => {
  t.id()
  t.tenant()                       // tenant_id: a required UUID
  t.string('name', 120)
  t.slug('slug').from('name')      // unique per team: (tenant_id, slug)
  t.timestamps()
})
```

`t.tenant()` adds the tenant column the right way in one call (`t.tenant('team_id')` names it differently; use the same name as `column` in `config/tenancy.ts`):

- every unique index in the table, the slug's included, becomes unique **per team** (`(tenant_id, slug)`);
- the table gets a unique `(tenant_id, id)` key, and a foreign key from one team table to another becomes **composite** (`(tenant_id, project_id)` → `projects (tenant_id, id)`), so a row can never point at another team's row;
- on **PostgreSQL**, `migrate` also turns on **row-level security** for the table (a restrictive policy on the tenant column, forced even for the table's owner), the database's own second wall between teams (ADR-0007).

Because a composite key includes the tenant column, which can't be set to `NULL`, `nullOnDelete()` isn't allowed between two team tables: use `cascadeOnDelete()` or `restrictOnDelete()`. A table has at most one `t.tenant()`. The [ORM](../orm-tenancy/) only reads and writes team tables when tenancy is switched on in `config/tenancy.ts`; with it off, a `t.tenant()` table is refused rather than read without the team condition.

Two table options go with it, as a third argument to `schema.create`:

```ts
// Shared by every team (a list of countries): no tenant column, never refused.
schema.create('countries', (t) => {
  t.id()
  t.string('name', 100).unique()
}, { global: true })

// Strutvane's own kind of table: never gets a generated API or screens.
schema.create('webhook_deliveries', (t) => {
  t.id()
  t.text('payload')
  t.timestamps()
}, { internal: true })
```

A `{ global: true }` table may not have a tenant column: a table is either shared by every team or belongs to one.

### Secret columns

Some columns are **secret by their name**, whatever else you do: they're never returned by `toJSON()` or the API, never searched, sorted or filtered from a request, never shown in a screen, and never named in a "did you mean" hint. The names (in any letter case) are:

- exactly `password`, `password_hash`, `passwd`, `passcode`, `pin_hash`, `token`, `secret`, `salt`, `api_key`, `apikey`, `private_key`, `secret_key`, `access_key`, `signing_key`, `encryption_key`, `recovery_codes`, `otp`, `remember_token`, `two_factor_secret` or `two_factor_recovery_codes`;
- or ending in `_password`, `_password_hash`, `_passwd`, `_token`, `_secret`, `_api_key`, `_apikey`, `_private_key`, `_secret_key`, `_access_key`, `_signing_key`, `_encryption_key` or `_recovery_codes`.

Mark any other column the same way in the migration:

```ts
t.string('api_key_hint').secret()      // never returned, searched, sorted or shown, and redacted in logs
t.decimal('cost_price', 12, 2).hidden() // left out of toJSON(), the API and the screens; your own code still reads it
```

A secret column can't simply be added to a model's `fillable`: the ORM also asks you to list it in `allowSensitive`, so a password hash is never mass-assigned by accident (see [Mass Assignment](../orm-mass-assignment/)).

### Not supported yet

| You want | Status |
|---|---|
| Change a column's type or length (Laravel's `->change()`) | Coming in 0.2 (needs a table rebuild on SQLite) |
| Raw SQL in a migration (Laravel's `DB::statement`) | Coming in 0.2, as a recorded escape hatch |
| A migration that changes data, not structure | Coming in 0.2, as a separate data hook |
| `unsigned`, `useCurrent()`, CHECK constraints beyond enums, partial or expression indexes, views | Not planned for 0.2 |
| Other column types (`float`, `char`, `time`, `dateTime`, `morphs`, `rememberToken`…) | Not available: use the types in [Columns](#columns) (`double`, `string`, `timestamp`, …) |
| Composite foreign keys you write yourself | Not available (`t.tenant()` makes the team ones for you) |

## Changing a table

Never edit a migration that has already run (on your machine, a teammate's or a server): it will never run again, so your change would silently go nowhere. Write a new migration instead:

```bash
node strut make:migration add_subtitle_to_posts_table
```

### Adding columns

```ts title="database/migrations/2026_11_15_101500_add_subtitle_to_posts_table.ts"
import { migration } from '@strutvane/framework/schema'

export default migration({
  up(schema) {
    schema.table('posts', (t) => {
      t.string('subtitle').nullable()
      t.boolean('featured').default(false)
    })
  },
  down(schema) {
    schema.table('posts', (t) => {
      t.dropColumn('subtitle', 'featured')
    })
  },
})
```

A new column on a table that already exists must be `.nullable()` or have a `.default(…)`, because the rows already there need a value.

### Renaming a column

```ts
schema.table('posts', (t) => {
  t.renameColumn('body', 'content')
})
```

Indexes, the slug source and foreign keys in other tables follow the rename. After `migrate`, every line of code that still says `post.body` becomes a compile error, so you find each one.

### Dropping columns

```ts
schema.table('posts', (t) => {
  t.dropColumn('subtitle')                 // one
  t.dropColumn('excerpt', 'reading_time')  // several
  t.dropConstrainedForeignId('category_id')
  t.dropTimestamps()
  t.dropSoftDeletes()
})
```

You can't drop a column another table still points at, or a slug's source; the error tells you which to change first.

### Renaming and dropping tables

```ts
schema.rename('labels', 'tags')
schema.drop('drafts')
schema.dropIfExists('old_imports')
```

You can't drop a table that another table still points at. Drop the child first; in `down()`, drop tables in the reverse order you created them.

### Writing a good `down()`

`down()` must undo **exactly** what `up()` did, in **reverse order**, so each step sees the table the way the previous step left it:

```ts title="database/migrations/2026_11_15_110000_restructure_posts_table.ts"
import { migration } from '@strutvane/framework/schema'

export default migration({
  up(schema) {
    schema.table('posts', (t) => {
      t.string('subtitle').nullable()
      t.renameColumn('body', 'content')
      t.index('status')
    })
  },
  down(schema) {
    schema.table('posts', (t) => {
      t.dropIndex('posts_status_index')
      t.renameColumn('content', 'body')
      t.dropColumn('subtitle')
    })
  },
})
```

The framework can already compare every migration's `down()` with its `up()` and find a `down()` that forgets a step, but no command reports it yet. How 0.2 reports it (a warning in `migrate`, or a `doctor` check) isn't settled. Until then, `node strut migrate:refresh` on your own machine is the test.

## Three migrations, from small to advanced

**Small:** add one optional column.

```ts title="database/migrations/2026_11_15_101500_add_subtitle_to_posts_table.ts"
import { migration } from '@strutvane/framework/schema'

export default migration({
  up(schema) {
    schema.table('posts', (t) => {
      t.string('subtitle').nullable()
    })
  },
  down(schema) {
    schema.table('posts', (t) => {
      t.dropColumn('subtitle')
    })
  },
})
```

**Typical:** a new table, a many-to-many link table, and a link from an existing table.

```ts title="database/migrations/2026_11_15_102000_create_categories_and_tags.ts"
import { migration } from '@strutvane/framework/schema'

export default migration({
  up(schema) {
    schema.create('categories', (t) => {
      t.id()
      t.string('name', 120).unique()
      t.timestamps()
    })
    schema.table('posts', (t) => {
      t.foreignId('category_id').nullable().constrained().nullOnDelete()
    })
    // A pivot table: one row per (post, tag) pair. Named with both singulars, in alphabetical order.
    schema.create('post_tag', (t) => {
      t.foreignId('post_id').constrained().cascadeOnDelete()
      t.foreignId('tag_id').constrained().cascadeOnDelete()
      t.unique(['post_id', 'tag_id'])
    })
  },
  down(schema) {
    // Reverse order: links before the tables they point to.
    schema.drop('post_tag')
    schema.table('posts', (t) => {
      t.dropConstrainedForeignId('category_id')
    })
    schema.drop('categories')
  },
})
```

**Advanced:** a defensive migration with a constant, a loop and a check. It's ordinary TypeScript, so constants, loops, helper functions and `if` all work, and `hasColumn` answers correctly even when Strutvane replays the migration without a database.

```ts title="database/migrations/2026_11_15_103000_add_localised_titles_to_products_table.ts"
import { migration } from '@strutvane/framework/schema'

const SKU_LENGTH = 40
const LOCALES = ['en', 'fr', 'de'] as const

export default migration({
  up(schema) {
    schema.table('products', (t) => {
      if (!schema.hasColumn('products', 'sku')) {
        t.string('sku', SKU_LENGTH).nullable().unique()
      }
      for (const locale of LOCALES) {
        t.string(`title_${locale}`, 200).nullable()
      }
    })
  },
  down(schema) {
    schema.table('products', (t) => {
      t.dropColumn(...LOCALES.map((locale) => `title_${locale}`))
    })
  },
})
```

**What you'll see** after `node strut migrate`: one line per migration that ran, and the types updated (`product.sku` is now `string | null`, and `product.title_fr` exists).

## Types stay in sync

`node strut migrate` regenerates `.strutvane/types/models.d.ts` every time. So if a migration renames `body` to `content`, every line that still says `post.body` becomes a compile error:

```text
error TS2339: Property 'body' does not exist on type 'Post'.
```

You find the problem in your editor, not in production.

:::note[How it works]
Strutvane runs the `up()` functions of all your migrations in the [sandbox](#migrations-run-in-a-sandbox), against a **recorder** (an object that writes down each step instead of running it). That needs no database. The same recorded steps produce the SQL that `migrate` runs, so the types and the database always match.
:::

## Which database you use

Your migrations are written once and run on every supported database. **MariaDB** behaves like MySQL in this table (including the failed-migration row). The differences you might notice:

| | MySQL 8.4+ (default) | PostgreSQL | SQLite |
|---|---|---|---|
| A migration fails halfway | Earlier statements of **that** migration stay applied; the next `migrate` resumes (see below) | Rolled back completely | Rolled back completely |
| `t.decimal` | Exact | Exact | About 15 digits; Strutvane re-formats the scale (`12.5` → `'12.50'`) |
| `t.enum` | Native `ENUM` | A `CHECK` constraint | A `CHECK` constraint |
| `t.boolean` | `0`/`1`, read back as `true`/`false` | Native | `0`/`1`, read back as `true`/`false` |
| Foreign keys | Separate named constraints, dropped before their column | Inline | Inline; dropping a foreign-key column **rebuilds the table** (your rows are kept) |
| Dropping an indexed column | Direct | Direct | Strutvane drops the index first |
| Row-level security for `t.tenant()` tables | No (the ORM's team condition only) | Yes, created by `migrate` | No (the ORM's team condition only) |
| Who runs migrations | The user in `.env` | The user in `.env`; give migrations the **owner** role (see [Database](../database/#postgresql-two-database-users)) | The app |

### When a migration fails

On **PostgreSQL** and **SQLite**, each migration runs in a **transaction** (an all-or-nothing unit): if any statement fails, nothing from that migration is left behind and it isn't recorded as run. The error names the file and the statement:

```text
error Unexpected error: 2026_11_15_101500_add_subtitle_to_posts_table failed at statement 2 of 3: column "subtitle" of relation "posts" already exists
```

Fix the migration or the data, then run `node strut migrate` again.

On **MySQL** and **MariaDB**, the database itself can't undo table changes: it saves each one the moment it runs. So Strutvane records each statement in the `migrations` table as it completes. When one fails, the error lists how many statements before it are applied, and the **next `node strut migrate` resumes at the failed statement** instead of failing on "column already exists":

```text
error Unexpected error: 2026_11_15_101500_add_subtitle_to_posts_table failed at statement 2 of 3: Duplicate column name 'subtitle'. 1 statement(s) before it are applied (MySQL and MariaDB commit each schema change on its own).
```

**What you'll see** on the next run, after you fixed the cause:

```text
warning: Resuming 2026_11_15_101500_add_subtitle_to_posts_table after statement 1 (MySQL applies schema changes one statement at a time)
✔ Migrated 2026_11_15_101500_add_subtitle_to_posts_table (batch 3)
```

Until it's finished, `migrate:status` shows the migration as `drift: partial`, and `migrate:rollback` refuses to undo it. To abandon it instead, undo the applied statements by hand and delete its row from the `migrations` table. Laravel has the same MySQL limit; two habits make it painless:

1. Keep each migration small: one table, or one change.
2. Try new migrations on your machine (or with `--pretend`) before a shared database.

### Windows, macOS and Linux; Docker or not

The commands are identical in PowerShell, cmd, bash and zsh, because columns are written in the migration file, never typed on the command line, so there's no quoting to get wrong. File names use `_` only, so they're valid on every system.

Without Docker, `node strut migrate` runs on your computer against the database in `.env`. With the database in a container, it runs on your computer too, with `DB_HOST` and `DB_PORT` pointing at the container's published port. Running every command **inside the app container** for you is coming in 0.2. See [Docker](../docker/).

## Common mistakes

Strutvane checks your migrations before touching the database. A problem inside a migration is reported with the file's name and what's wrong, like this:

```text
error Unexpected error: 2026_11_15_101500_add_subtitle_to_posts_table.ts failed: The new column "posts.subtitle" is required but has no default, so existing rows would have no value.
hint: Run again with --verbose for the stack trace, and report the bug.
```

The command exits with code **1**. Ignore the generic "report the bug" hint: the framework's own fix for each problem is in the **Fix** lines below (printing it in the terminal is planned). Each section shows the part after `failed:`.

### "is required but has no default"

```text
The new column "posts.subtitle" is required but has no default, so existing rows would have no value.
```

**Why:** the table may already have rows, and they need a value.
**Fix:** make it `.nullable()`, or give it a `.default(…)`:

```ts
t.string('subtitle').nullable()   // or: t.string('subtitle').default('')
```

### "There is no table … at this point in the migrations"

```text
There is no table "post" at this point in the migrations.
```

**Why:** a typo (`post` instead of `posts`), or the migration that creates the table runs later (its file name sorts after this one). The framework's hint lists the tables that do exist: `Known tables: users, posts. Check the spelling and the migration order.`
**Fix:** correct the name, or rename the file so its date comes after the `create_…` migration.

### "points to the table …, which doesn't exist yet"

```text
"posts.author_id" points to the table "users", which doesn't exist yet.
```

**Why:** a foreign key needs its parent table first.
**Fix:** create `users` in an earlier migration, or fix the name in `.constrained('…')`.

### "Can't guess which table … points to"

```text
Can't guess which table "writer" points to.
```

**Why:** `.constrained()` with no table guesses from a name ending in `_id`.
**Fix:** name the table, or name the column `<thing>_id`: `t.foreignId('writer_id').constrained('users')`.

### "uses nullOnDelete() but isn't nullable"

```text
"posts.category_id" uses nullOnDelete() but isn't nullable, so the database couldn't set it to null.
```

**Fix:** add `.nullable()`, or use `cascadeOnDelete()` / `restrictOnDelete()` instead: `t.foreignId('category_id').nullable().constrained().nullOnDelete()`.

### "sets an on-delete rule but doesn't reference a table"

```text
Column "comments.post_id" sets an on-delete rule but doesn't reference a table.
```

**Fix:** add `.constrained()`: `t.foreignId('post_id').constrained().cascadeOnDelete()`.

### "Can't drop …: … still points to it"

```text
Can't drop "categories": "posts.category_id" still points to it.
```

**Why:** dropping the parent would leave children pointing at nothing.
**Fix:** drop the foreign key first (`t.dropConstrainedForeignId('category_id')` on `posts`), then the table; in `down()`, drop tables in the reverse order you created them.

### "Can't drop …: the slug … is built from it"

```text
Can't drop "posts.title": the slug "slug" is built from it.
```

**Fix:** change the slug's source first, or drop `slug` in the same migration before `title`.

### A default that doesn't fit the column

```text
Column "posts.subtitle" defaults to null but isn't nullable.
```

**Why:** TypeScript catches most wrong defaults; this is the safety net for plain JavaScript or out-of-range values.
**Fix:** `t.string('subtitle').nullable().default(null)`, or pick a non-null default.

### A name that can't be used

```text
The column name "Title" can't be used.
```

**Fix:** use lower-case snake_case (letters, digits and `_`), start with a letter or `_`, and keep it under 64 characters: `t.string('title')`.

### "already exists" or "has no column/index"

```text
The table "posts" already exists.
The table "posts" already has a column "title".
The table "posts" has no column "bodi".
The table "posts" has no index named "posts_title_index".
An index named "posts_status_index" already exists (on "posts").
```

**Fix:** use `schema.table('posts', …)` to change an existing table; for a missing name, check the spelling against what exists (the framework's hint lists the table's columns or indexes, for example `Its columns are: id, title, slug, body, …`).

### Renaming or dropping inside `schema.create`

```text
schema.create('posts') can only add columns and indexes, but it asks to renameColumn.
```

**Fix:** write the column with its final name in `schema.create`, or move the change to `schema.table` in a later migration.

### "migrations may not use …" or "may not import …"

```text
error Unexpected error: 2026_11_15_093000_create_posts_table.ts:3:21: migrations may not use `process`.
error Unexpected error: 2026_11_15_093000_create_posts_table.ts:2:1: migrations may not import "node:fs".
```

**Why:** the [sandbox](#migrations-run-in-a-sandbox) checks every migration before it runs. Migrations describe the schema with the schema builder only.
**Fix:** remove the code. Import only `@strutvane/framework/schema` and `.ts` files inside `database/migrations`, written as `./path/file.ts`. Reading the environment, files or the network belongs in seeders or app code.

### "returned a promise"

**Why:** `up()` or `down()` is `async`, or awaits something. Migrations are recorded synchronously, so everything after the first `await` would be missing from the types, metadata and SQL.
**Fix:** remove `async`/`await` from the migration. Data changes that need I/O belong in a seeder.

### A file in the migrations folder that isn't a migration

```text
error Unexpected error: "helpers.ts" is in the migrations folder but isn't named like a migration.
error Unexpected error: 2026_11_15_093000_create_posts_table.ts failed: 2026_11_15_093000_create_posts_table.ts doesn't default-export a migration.
```

**Why:** Strutvane refuses rather than skipping: a skipped migration would mean wrong types with no warning.
**Fix:** name migrations `YYYY_MM_DD_HHMMSS_what_it_does.ts` (`node strut make:migration` does this for you), and move shared helpers into a subfolder (for example `database/migrations/support/`, see [the sandbox](#migrations-run-in-a-sandbox)); make sure every migration ends with `export default migration({ … })`.

### "must start with a letter"

```bash
node strut make:migration 2026_posts
```

```text
error Migration name "2026_posts" must start with a letter and use only letters, digits, "-" or "_".
```

**Fix:** start with a letter. Any letter case is fine: `node strut make:migration CreatePostsTable` writes `…_create_posts_table.ts`.

### "the database says … ran, but there is no such migration file"

```text
error Unexpected error: The database says "2026_11_10_120000_create_drafts_table" ran, but there is no such migration file.
```

**Why:** someone deleted or renamed a migration that had already run. Strutvane stops (every command except `migrate:status`), because it can't know what your database looks like without it.
**Fix:** restore the file with git (`git log --diff-filter=D -- database/migrations` finds it). If you're sure it never mattered, delete its row from the `migrations` table. On your own machine only, `node strut migrate:fresh` starts over.

### "changed after it ran"

```text
error Unexpected error: "2026_11_15_093000_create_posts_table" changed after it ran: its schema operations are different now, so the database no longer matches it.
```

**Why:** you edited a migration that has already run. It will never run again, so your edit would silently go nowhere; Strutvane notices from the checksum in the `migrations` table and stops instead.
**Fix:** undo your edit (`git checkout -- database/migrations/2026_11_15_093000_create_posts_table.ts`) and put the change in a new migration (`node strut make:migration …`). On your own machine only, you can start over with `node strut migrate:fresh --seed` (this **deletes all data**).

### "APP_ENV is production. Run node strut migrate --force"

```text
error Validation failed.
  - --force: APP_ENV is production. Run node strut migrate --force to change the production database.
```

**Why:** with `APP_ENV=production`, every command that writes to the database needs `--force`, so nobody changes production by accident. The command exits with code **3**.
**Fix:** in your deploy script, `node strut migrate --force` (add `--isolated` when several servers start at once).

### "Another migration run is in progress"

```text
error Unexpected error: Another migration run is in progress on this database (it has held the lock for more than 10 s).
```

**Why:** another `migrate` (a second server, a second terminal) holds the lock.
**Fix:** wait for it and run `node strut migrate` again, or use `--isolated` to skip instead of waiting.

### The database can't be reached

```text
Database: mysql://root@127.0.0.1:3306/my_app
error Unexpected error: connect ECONNREFUSED 127.0.0.1:3306
```

**Fix:** start the database, then check `DB_HOST` and `DB_PORT` in `.env`. Every connection error is listed on [Database: Getting Started](../database/#common-mistakes).

### My code still compiles after I dropped a column

**Why:** the types are regenerated by `migrate` (or `sync`). Until then, the old types still list the column.
**Fix:** run `node strut migrate` (or `node strut sync`), and commit the updated `.strutvane/`.

## Next steps

- [Seeding](../seeding/): fill your new tables with data.
- [ORM: Getting Started](../orm/): read and write rows with the model `make:migration` wrote.
- [Your First CRUD](../first-crud/): from migration to screens in five minutes.
- [Database: Getting Started](../database/): connections, engines and the other database commands.
