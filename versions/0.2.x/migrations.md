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

Three differences: `schema` is passed **into** `up()` and `down()` (there's no global `Schema`); `create_x_table` **always** writes the model too; and the migrations are the **source of truth** for your TypeScript types, your API and your screens, so you never repeat columns in the model.
:::

## The commands at a glance

Every database command in one table. The sections below explain each one with examples.

| You want to | Run | Status |
|---|---|---|
| **Create a migration file** (and the model, for a new table) | `node strut make:migration create_posts_table` | Prototype |
| Create a migration plus a seeder and a factory | `node strut make:migration create_posts_table --seeder` | Prototype (see note) |
| Create a migration plus only a factory | `node strut make:migration create_posts_table --factory` | Prototype |
| Create a model (with optional extra files) | `node strut make:model Post -a` | Coming in 0.2 |
| Run every migration that hasn't run yet | `node strut migrate` | Coming in 0.2 |
| See the SQL without running it | `node strut migrate --pretend` | Coming in 0.2 |
| Run migrations one at a time (each its own batch) | `node strut migrate --step` | Coming in 0.2 |
| Run migrations and then the seeders | `node strut migrate --seed` | Prototype |
| See which migrations have run | `node strut migrate:status` | Coming in 0.2 |
| Undo the last batch | `node strut migrate:rollback` | Coming in 0.2 |
| Undo the last few migrations | `node strut migrate:rollback --step=3` | Coming in 0.2 |
| Undo every migration | `node strut migrate:reset` | Coming in 0.2 |
| Undo everything, then run everything again | `node strut migrate:refresh` | Coming in 0.2 |
| Drop every table and run everything again | `node strut migrate:fresh` | Coming in 0.2 |
| Regenerate types and metadata without touching the database | `node strut sync` | Coming in 0.2 |
| Run the seeders | `node strut db:seed` | Prototype |
| Squash old migrations into one schema file | `node strut schema:dump` | Coming in 0.3 |

"Prototype" means the behaviour is proven in a Strutvane prototype and ships with 0.2; "Coming in 0.2" means it's designed and arrives with 0.2. The schema builder and the batches behind `migrate` and `migrate:rollback` are already proven (in the schema prototype, with 248 tests on SQLite and PostgreSQL); the commands that wrap them are what's still being built.

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
     Created database/migrations/2026_11_15_093000_create_posts_table.ts
     Created app/models/post.ts

     Next: add your columns to the migration, then run `node strut migrate`.
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

   **What you'll see** (something like this; the exact wording isn't final):

   ```text
     ran  2026_11_15_093000_create_posts_table
   Migrations run (1 new, 4 total)
   ```

5. **Use it.** The table exists, `app/models/post.ts` is fully typed, and `post.title` is a `string` in your editor. If your project has a UI, a "Posts" entry appears in the sidebar for admins. See [ORM: Getting Started](../orm/) to read and write posts.

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
In Strutvane one table has one model. Writing it for you means you can use the table right after `migrate`. If `app/models/post.ts` already exists, it's kept untouched and the command says `Kept app/models/post.ts (it already exists)`.
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
import { Model } from '@strutvane/framework'

/**
 * A post. Its columns come from database/migrations (run `node strut migrate` to
 * refresh the types); add relations, scopes and computed attributes here.
 */
export class Post extends Model('posts', {
  // Columns the API may write. Empty on purpose: list the columns clients may send, and any
  // column you don't list stays read-only (owners, flags and timestamps are set by your code).
  fillable: [],
}) {}
```

`fillable` starts **empty** on purpose: nobody can write any column through a form or the API until you list it. That's Strutvane's deny-by-default rule; see [Mass Assignment](../orm-mass-assignment/).

:::caution[Coming in 0.2]
This model shape is decided (2026-11-15). The prototype still writes the list as a static property (`static override readonly fillable = []`) and imports from its internal module names; 0.2 writes the file exactly as shown.
:::

### `--seeder` and `--factory`

| Option | Short | What it adds |
|---|---|---|
| `--seeder` | `-s` | `database/seeders/post.seeder.ts` **and** `database/factories/post.factory.ts` (a seeder usually uses the factory), and registers the seeder in `database/seeders/database.seeder.ts`, after the seeders of the tables it points at |
| `--factory` | `-f` | Only `database/factories/post.factory.ts` |

```bash
node strut make:migration create_posts_table --seeder
```

**What you'll see** (something like this; the exact wording isn't final):

```text
  Created database/migrations/2026_11_15_093000_create_posts_table.ts
  Created app/models/post.ts
  Created database/seeders/post.seeder.ts
  Created database/factories/post.factory.ts

  Next: add your columns to the migration, then run `node strut migrate`.
```

These options need to know the table, so they work with `create_…_table` and `…_to_/_from_/_in_/_on_…_table` names, not with free names like `backfill_slugs`. See [Seeding](../seeding/) and [Factories](../orm-factories/) for what goes in those files.

:::caution[Coming in 0.2]
In the prototype, `--seeder` writes only the seeder, `--factory` is needed for the factory, and instead of registering the seeder it prints `Then call PostSeeder from database/seeders/database.seeder.ts.` 0.2 ships the behaviour in the table above.
:::

### Running it with no name

Like every `make:*` command, `node strut make:migration` with no name will ask you for one interactively *(coming in 0.2)*. Today it stops with:

```text
  ✖ make:migration needs <name>.
  → Example: node strut make:migration <name>  (more: node strut help make:migration)
```

### Help for the command

```bash
node strut make:migration --help
```

prints the arguments, the options and two examples (`create_posts_table --seeder`, `add_subtitle_to_posts_table`).

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
`make:model` and its flags are designed (blueprint §2.2) but not built in the prototype yet. Until then, use `make:migration create_posts_table`, which writes the model too.
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

:::danger[No side effects at the top of a migration file]
Strutvane imports your migration files to work out your types, even when no database is running (for example during `node strut sync` or `npm run dev`). Code at the top of the file, outside `up()` and `down()`, runs every time. Keep it to constants and helper functions: never send emails, call APIs or read secrets there.
:::

## Running migrations: `migrate`

```bash
node strut migrate
```

`migrate` does five things, in this order:

1. **Applies every migration that hasn't run yet**, oldest first. Each one runs in a transaction on PostgreSQL and SQLite (see [When a migration fails](#when-a-migration-fails)). Before touching the database, a **safety check** stops the run with a hint when it finds:
   - a new required column without a default on a table that has rows;
   - a dropped column next to an added one that looks like a rename;
   - a dropped column that your own `resources/ui` files still use.
2. **Regenerates your types and metadata** by replaying every migration in memory (about 50 milliseconds for 100 tables).
3. **Seeds**, in development only: each seeder that hasn't run yet runs once. See [Seeding](../seeding/).
4. **Generates the CRUD API** for every table with a model.
5. **Updates the UI**, if your project has one: new screens for new tables, sidebar entries, and the UI's type registry.

Each `migrate` run is one **batch**: a group of migrations applied together. `migrate:rollback` undoes exactly one batch, so it undoes what you last applied.

**What you'll see** (something like this; the exact wording isn't final):

```text
  ran  2026_11_15_093000_create_posts_table
  ran  2026_11_15_101500_add_subtitle_to_posts_table
Migrations run (2 new, 6 total)
```

When there's nothing to do:

```text
Migrations run (0 new, 6 total)
```

:::caution[Coming in 0.2]
Batches, rollback, transactions per migration and type generation are proven in the schema prototype (spike 10). The installer prototype runs `migrate --seed` against real MySQL 8.4, PostgreSQL and SQLite. The full command (all five steps, the safety check, the per-step progress report on MySQL) arrives with 0.2.
:::

### The options

| Option | When you'd use it | What it does |
|---|---|---|
| `--pretend` | You want to read the SQL before it runs, for example before a production deploy | Prints the SQL each pending migration would run, and runs nothing |
| `--step` | You want to be able to roll back each migration on its own | Gives each migration its own batch |
| `--seed` | You want the seeders again on purpose | Runs the seeders after migrating, even ones that already ran |
| `--force` | You're deploying to production | In production, `migrate` asks "Are you sure?" first; `--force` skips the question (deploy scripts use `migrate --force`). Also needed with `--seed` there |
| `--isolated` | Several servers deploy at once | Takes a lock so only one of them migrates |

```bash
node strut migrate --pretend
```

**What you'll see** (on MySQL; something like this):

```text
2026_11_15_101500_add_subtitle_to_posts_table
  ALTER TABLE `posts` ADD COLUMN `subtitle` VARCHAR(255) NULL
```

### What `migrate` generates

These files are **machine-owned**: Strutvane rewrites them on every run, and you never edit them. They're committed to git, so a fresh clone type-checks before anyone runs a database.

| File | What's in it |
|---|---|
| `.strutvane/types/models.d.ts` | Four types per table (below) |
| `.strutvane/resources.json` | Per table: labels, the title field, which fields are searchable, sortable and filterable (and with which operators), form inputs, relations, the slug source, soft deletes, default sort, sidebar order |
| `routes/resources.gen.ts` | One API resource per table with a model; `routes/api.ts` imports it |
| `.strutvane/ui.gen.ts`, `.strutvane/ui.lock.json` | The UI's typed registry of fields per screen (UI projects only) |

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

**The API.** For `posts` you get, with no code of your own (see [Auto CRUD](../crud/)):

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

**Tables that never get an API or screens:** Strutvane's internal tables (users, sessions, cache, jobs, password resets, access tokens, roles and memberships, audit, `migrations`, `seeders`) are always skipped, for security.

### Stopping generation for a model

| You want | Do this |
|---|---|
| Keep the screens, hide the sidebar entry | In `resources/ui/posts.ui.ts`: `navigation: { hidden: true }` |
| Your own API code instead of the generated one | `node strut make:controller PostController --resource`, then route it yourself |
| Nobody (but admins) to see the table | Leave the generated policy as it is: it denies everyone but admins |
| No generated API for a model | `Model('posts', { fillable: [...], api: false })` |
| No generated screens or sidebar entry for a model | `Model('posts', { fillable: [...], ui: false })` |
| Neither | `Model('posts', { fillable: [...], api: false, ui: false })` |

```ts title="app/models/audit-note.ts"
import { Model } from '@strutvane/framework'

/** Used by our own code only: no generated API, no screens. */
export class AuditNote extends Model('audit_notes', { fillable: [], api: false, ui: false }) {}
```

**What you'll see** after the next `node strut migrate`: no `audit-notes` route in `node strut route:list`, and no "Audit notes" entry in the sidebar. Your own code still uses the model as usual.

:::caution[Coming in 0.2]
The `api` and `ui` switches are decided (2026-11-15) and arrive with 0.2. Until then, a table without a model gets no API, and the generated policy keeps everyone but admins out.
:::

## Checking and undoing migrations

### `migrate:status`

```bash
node strut migrate:status
```

**What you'll see** (something like this):

```text
  Migration                                           Batch  Status
  0001_01_01_000000_create_users_table                1      Ran
  2026_11_15_093000_create_posts_table                2      Ran
  2026_11_15_101500_add_subtitle_to_posts_table              Pending
```

### `migrate:rollback`

Undoes the **last batch**: runs the `down()` of each migration in it, newest first, and forgets that they ran.

```bash
node strut migrate:rollback            # undo the last batch
node strut migrate:rollback --step=2   # undo the last two migrations, whatever their batch
```

**What you'll see** (something like this):

```text
  rolled back  2026_11_15_101500_add_subtitle_to_posts_table
```

### `migrate:reset`, `migrate:refresh` and `migrate:fresh`

| Command | What it does | Data |
|---|---|---|
| `migrate:reset` | Rolls back **every** migration, newest first, through their `down()` | Deleted |
| `migrate:refresh` | `migrate:reset`, then `migrate` | Deleted |
| `migrate:fresh` | **Drops every table** (without running any `down()`), then `migrate` | Deleted |

Add `--seed` to any of them to seed afterwards:

```bash
node strut migrate:fresh --seed
```

`migrate:fresh` is the fastest way back to a clean database on your own machine, and it works even when a `down()` is broken. `migrate:refresh` is the way to test that all your `down()` functions really work.

:::danger[These delete all your data]
`reset`, `refresh` and `fresh` empty the database. Use them on your own machine only, never on a shared or production database.
:::

:::caution[Coming in 0.2]
Rolling back by batch and rolling back everything are proven in the schema prototype, on SQLite and PostgreSQL, with no drift at any of 14 checkpoints. The commands `migrate:status`, `migrate:rollback --step`, `migrate:reset`, `migrate:refresh` and `migrate:fresh` arrive with 0.2.
:::

### Where Strutvane remembers what ran

A table called `migrations` holds one row per migration that has run, with its batch number. Like Laravel's, it's internal: it never gets an API or a screen. Never edit it by hand unless a fix below tells you to.

:::caution[Coming in 0.2]
The prototypes still use their own names for this table (`strutvane_migrations` and `strut_migrations`). 0.2 uses `migrations`.
:::

### Regenerating without the database: `sync`

```bash
node strut sync
```

Regenerates everything in `.strutvane/` (types, `resources.json`, the UI registry) from your migrations, **without** touching the database. Use it after a merge conflict in `.strutvane/`, or when a teammate's migration arrived and you only want your editor's types updated. *(Coming in 0.2.)*

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
| `t.uuid('id').primary()` | `t.uuid('id').primary()` | `string` | A UUID primary key instead: a time-ordered UUIDv7 that Strutvane makes before the insert. Hard to guess, so good for ids in URLs. *(Coming in 0.2.)* |
| `t.string(name, length = 255)` | `t.string('title', 200)` | `string` | Short text. The length is enforced on every engine, SQLite included. |
| `t.text(name)` | `t.text('body')` | `string` | Long text, no length limit. Not sortable in the API. |
| `t.slug(name = 'slug', length = 255)` | `t.slug('slug').from('title')` | `string` | A URL-friendly name, filled in from another column and always unique. See [Slugs](#slugs). |
| `t.integer(name)` | `t.integer('stock')` | `number` | A 32-bit whole number. |
| `t.bigInteger(name)` | `t.bigInteger('views')` | `number` | A 64-bit whole number. JavaScript numbers are exact up to 2^53; Strutvane refuses bigger values rather than rounding them. |
| `t.decimal(name, precision = 8, scale = 2)` | `t.decimal('price', 12, 2)` | `string` | An exact number, for money. Read back as a string (`'12.50'`), so no cents are lost. |
| `t.double(name)` | `t.double('rating')` | `number` | An approximate number. Never use it for money. |
| `t.boolean(name)` | `t.boolean('featured')` | `boolean` | Yes or no. |
| `t.enum(name, values)` | `t.enum('status', ['draft', 'published'])` | `'draft' \| 'published'` | One of a fixed list. The list can't be empty or repeat a value. |
| `t.date(name)` | `t.date('published_on')` | `string` | A calendar date, `'2026-11-15'`, with no time and no time zone. |
| `t.timestamp(name)` | `t.timestamp('sent_at')` | `Date` | A point in time, stored in UTC. |
| `t.uuid(name)` | `t.uuid('public_id')` | `string` | A UUID, stored in one spelling (lower case). |
| `t.json(name)` | `t.json('meta')` | `JsonValue` | Any JSON. Can't have a default. Give it a precise type with a [cast](../orm-casts/). |
| `t.foreignId(name)` | `t.foreignId('author_id').constrained('users')` | `number` | Holds another table's `id`. See [Foreign keys](#foreign-keys). |
| `t.timestamps()` | | `Date \| null` | Adds nullable `created_at` and `updated_at`, which Strutvane fills in on every create and update. |
| `t.softDeletes()` | | `Date \| null` | Adds a nullable `deleted_at`. Deleting a row then hides it so it can be restored. See [Soft Deletes](../orm-soft-deletes/). |

How each type is stored, per engine:

| Method | MySQL | PostgreSQL | SQLite |
|---|---|---|---|
| `id` | `BIGINT UNSIGNED AUTO_INCREMENT` | `BIGINT GENERATED BY DEFAULT AS IDENTITY` | `INTEGER PRIMARY KEY AUTOINCREMENT` |
| `string`, `slug` | `VARCHAR(n)` | `VARCHAR(n)` | `VARCHAR(n)` (length checked by Strutvane) |
| `text` | `TEXT` | `TEXT` | `TEXT` |
| `integer` | `INT` | `INTEGER` | `INTEGER` |
| `bigInteger`, `foreignId` | `BIGINT UNSIGNED` | `BIGINT` | `INTEGER` |
| `decimal` | `DECIMAL(p, s)` | `NUMERIC(p, s)` | `NUMERIC` (about 15 digits; re-formatted on the way out) |
| `double` | `DOUBLE` | `DOUBLE PRECISION` | `REAL` |
| `boolean` | `TINYINT(1)` | `BOOLEAN` | `INTEGER` (0/1) |
| `enum` | native `ENUM(…)` | `VARCHAR(255)` + `CHECK` | `VARCHAR(255)` + `CHECK` |
| `date` | `DATE` | `DATE` | `DATE` |
| `timestamp` | `DATETIME(3)`, in UTC | `TIMESTAMP(3) WITH TIME ZONE` | `DATETIME` |
| `uuid` | `CHAR(36)` | `UUID` | `VARCHAR(36)` |
| `json` | `JSON` | `JSONB` | `TEXT` |

You never write these types yourself; the table is here so you know what you'll see in a database client like TablePlus or DBeaver. On MySQL and MariaDB, timestamps are `DATETIME(3)` holding UTC, not `TIMESTAMP`, so dates after 2038 work and the server's time zone never changes them (the schema prototype still writes `TIMESTAMP(3)`; 0.2 writes `DATETIME(3)`).

### Column modifiers

Chain these after a column:

| Modifier | Example | What it does |
|---|---|---|
| `.nullable()` | `t.string('subtitle').nullable()` | The column may be empty (`NULL`). Its type becomes `string \| null`. |
| `.default(value)` | `t.boolean('featured').default(false)` | The value new rows get when none is given. Must match the column's type. |
| `.unique()` | `t.string('email').unique()` | No two rows may have the same value. Adds the index `<table>_<column>_unique`. |
| `.index()` | `t.string('sku').index()` | Faster lookups and sorting. Adds the index `<table>_<column>_index`. |
| `.comment(text)` | `t.string('code').comment('Shown on invoices')` | A note stored with the column (MySQL and PostgreSQL). |
| `.secret()` | `t.string('api_key_hint').secret()` | Never returned, searched, sorted or shown. See [Secret columns](#secret-columns). *(Coming in 0.2.)* |
| `.hidden()` | `t.decimal('cost_price', 12, 2).hidden()` | Left out of the API and the screens. *(Coming in 0.2.)* |

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
  t.tenant()                       // tenant_id (or the column in config/tenancy.ts), indexed
  t.string('name', 120)
  t.slug('slug').from('name')      // unique per team: (tenant_id, slug)
  t.timestamps()
})
```

`t.tenant()` adds the tenant column the right way in one call: the column your app is configured with, slug and other unique indexes scoped per team, and composite foreign keys so a row can't point at another team's row.

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

:::caution[Coming in 0.2]
`t.tenant()`, `{ global: true }` and `{ internal: true }` are decided (2026-11-15) and added to the schema builder for 0.2. Until then, `t.uuid('tenant_id').index()` gives you the column, and the ORM already protects it.
:::

### Secret columns

Columns named `password`, `remember_token` or `two_factor_secret`, or ending in `_secret` or `_token`, are **never** returned by the API, searched, sorted or shown in a screen, whatever else you do. Mark any other column the same way in the migration:

```ts
t.string('api_key_hint').secret()      // never returned, searched, sorted or shown, and redacted in logs
t.decimal('cost_price', 12, 2).hidden() // left out of the API and the screens; your own code still reads it
```

:::caution[Coming in 0.2]
`.secret()` and `.hidden()` are decided (2026-11-15); the name-based rule above already works in the prototype.
:::

### Not supported yet

| You want | Status |
|---|---|
| Change a column's type or length (Laravel's `->change()`) | Coming in 0.2 (needs a table rebuild on SQLite) |
| Raw SQL in a migration (Laravel's `DB::statement`) | Coming in 0.2, as a recorded escape hatch |
| A migration that changes data, not structure | Coming in 0.2, as a separate data hook |
| `unsigned`, `useCurrent()`, CHECK constraints beyond enums, partial or expression indexes, views | Not planned for 0.2 |
| A UUID primary key: `t.uuid('id').primary()` (a time-ordered UUIDv7 made by Strutvane) | Coming in 0.2 |
| Composite foreign keys | Coming in 0.2 (with `t.tenant()`) |

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

The schema prototype checks every migration's `down()` against its `up()` and finds a `down()` that forgets a step. How 0.2 reports it (a warning in `migrate`, or a `doctor` check) isn't settled yet.

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
Strutvane runs the `up()` functions of all your migrations in memory, against a **recorder** (an object that writes down each step instead of running it). For 100 tables that takes about 50 milliseconds and needs no database. The same recorded steps produce the SQL that `migrate` runs, so the types and the database always match. (Proven in spike 10, with 248 tests on SQLite and PostgreSQL.)
:::

## Which database you use

Your migrations are written once and run on every supported database. **MariaDB** behaves like MySQL in this table (including the failed-migration row). The differences you might notice:

| | MySQL 8.4+ (default) | PostgreSQL | SQLite |
|---|---|---|---|
| A migration fails halfway | Earlier steps of **that** migration stay applied (see below) | Rolled back completely | Rolled back completely |
| `t.decimal` | Exact | Exact | About 15 digits; Strutvane re-formats the scale (`12.5` → `'12.50'`) |
| `t.enum` | Native `ENUM` | A `CHECK` constraint | A `CHECK` constraint |
| `t.boolean` | `0`/`1`, read back as `true`/`false` | Native | `0`/`1`, read back as `true`/`false` |
| Foreign keys | Separate named constraints, dropped before their column | Inline | Inline; dropping a foreign-key column **rebuilds the table** (your rows are kept) |
| Dropping an indexed column | Direct | Direct | Strutvane drops the index first |
| Who runs migrations | The app's user | A separate **owner** role (`DB_MIGRATION_USERNAME`), so the app's own role can't switch off row-level security | The app |

### When a migration fails

On **PostgreSQL** and **SQLite**, each migration runs in a **transaction** (an all-or-nothing unit): if any step fails, nothing from that migration is left behind, it isn't recorded as run, and the error names the file. Fix the file and run `migrate` again.

On **MySQL**, the database itself can't undo table changes: it saves each one the moment it runs. A migration that fails halfway can leave some of its steps applied. `migrate` will report each step as it goes and, on failure, say exactly which steps were applied and how to recover *(coming in 0.2)*. Laravel has the same MySQL limit. Two habits make it painless:

1. Keep each migration small: one table, or one change.
2. Try new migrations on your machine (or with `--pretend`) before a shared database.

If a MySQL migration does fail halfway, undo the applied steps by hand (or with a small migration), fix the file, and run `migrate` again.

### Windows, macOS and Linux; Docker or not

The commands are identical in PowerShell, cmd, bash and zsh, because columns are written in the migration file, never typed on the command line, so there's no quoting to get wrong. File names use `_` only, so they're valid on every system.

With Docker, `node strut migrate` (and every other command on this page) runs **inside the app container**, against the database container; you type the same command on your computer. Without Docker, it runs on your computer against the database in `.env`. See [Docker](../docker/).

## Common mistakes

Strutvane checks your migrations before touching the database, and prints a code, the file, what's wrong and a hint. (The prototype prints the codes in capitals, `[INVALID_COLUMN]`; 0.2 uses lowercase codes everywhere, as below.)

### "is required but has no default"

```text
[invalid_column] in 2026_11_15_101500_add_subtitle_to_posts_table.ts: The new column "posts.subtitle" is required but has no default, so existing rows would have no value. Hint: Make it .nullable(), or give it a .default(…).
```

**Why:** the table may already have rows, and they need a value.
**Fix:**

```ts
t.string('subtitle').nullable()   // or: t.string('subtitle').default('')
```

### "There is no table … at this point in the migrations"

```text
[unknown_table] in 2026_11_15_101500_add_subtitle_to_posts_table.ts: There is no table "post" at this point in the migrations. Hint: Known tables: users, posts. Check the spelling and the migration order.
```

**Why:** a typo (`post` instead of `posts`), or the migration that creates the table runs later (its file name sorts after this one).
**Fix:** correct the name, or rename the file so its date comes after the `create_…` migration.

### "points to the table …, which doesn't exist yet"

```text
[invalid_foreign_key] in 2026_11_15_093000_create_posts_table.ts: "posts.author_id" points to the table "users", which doesn't exist yet. Hint: Create "users" in an earlier migration, or fix the name in .constrained('…').
```

**Why:** a foreign key needs its parent table first.
**Fix:** create the parent table in an earlier migration, or check the name in `.constrained('…')`.

### "Can't guess which table … points to"

```text
[invalid_foreign_key] in 2026_11_15_093000_create_posts_table.ts: Can't guess which table "writer" points to. Hint: Name the table explicitly, for example .constrained('users'), or name the column "<thing>_id".
```

**Why:** `.constrained()` with no table guesses from a name ending in `_id`.
**Fix:** `t.foreignId('writer_id').constrained('users')`.

### "uses nullOnDelete() but isn't nullable"

```text
[invalid_foreign_key] in 2026_11_15_093000_create_posts_table.ts: "posts.category_id" uses nullOnDelete() but isn't nullable, so the database couldn't set it to null. Hint: Add .nullable(), or use cascadeOnDelete() / restrictOnDelete() instead.
```

**Fix:** `t.foreignId('category_id').nullable().constrained().nullOnDelete()`.

### "sets an on-delete rule but doesn't reference a table"

```text
[invalid_foreign_key] in 2026_11_15_093000_create_comments_table.ts: Column "comments.post_id" sets an on-delete rule but doesn't reference a table. Hint: Call .constrained() before .cascadeOnDelete() / .nullOnDelete(), for example t.foreignId('post_id').constrained().cascadeOnDelete().
```

**Fix:** add `.constrained()` before the rule.

### "Can't drop …: … still points to it"

```text
[invalid_foreign_key] in 2026_11_20_090000_drop_categories_table.ts: Can't drop "categories": "posts.category_id" still points to it. Hint: Drop "posts" first; in down(), drop tables in the reverse order you created them.
```

**Why:** dropping the parent would leave children pointing at nothing.
**Fix:** drop the foreign key first (`t.dropConstrainedForeignId('category_id')` on `posts`), then the table.

### "Can't drop …: the slug … is built from it"

```text
[invalid_slug_source] in 2026_11_20_090000_remove_title_from_posts_table.ts: Can't drop "posts.title": the slug "slug" is built from it. Hint: Change the slug's source first, or drop "slug" in the same migration before "title".
```

**Fix:** drop or change the slug first, in the same migration.

### A default that doesn't fit the column

```text
[invalid_default] in 2026_11_15_093000_create_posts_table.ts: Column "posts.subtitle" defaults to null but isn't nullable. Hint: Add .nullable() before .default(null), or pick a non-null default.
```

**Why:** TypeScript catches most wrong defaults; this is the safety net for plain JavaScript or out-of-range values.
**Fix:** `t.string('subtitle').nullable().default(null)`.

### A name that can't be used

```text
[invalid_identifier] in 2026_11_15_093000_create_posts_table.ts: The column name "Title" can't be used. Hint: Use lower-case snake_case (letters, digits and _), start with a letter or _, and keep it under 64 characters, for example "blog_posts".
```

**Fix:** `t.string('title')`.

### "already exists" or "has no column/index"

```text
[table_exists] in 2026_11_15_093000_create_posts_table.ts: The table "posts" already exists. Hint: Use schema.table('posts', …) to change it, or drop it first.
[column_exists] in 2026_11_15_101500_add_title_to_posts_table.ts: The table "posts" already has a column "title". Hint: Pick another name, or rename/drop the existing column first.
[unknown_column] in 2026_11_15_101500_rename_body_in_posts_table.ts: The table "posts" has no column "bodi". Hint: Its columns are: id, title, slug, body, status, author_id, created_at, updated_at, deleted_at.
[unknown_index] in 2026_11_15_101500_drop_index_on_posts_table.ts: The table "posts" has no index named "posts_title_index". Hint: Existing indexes: posts_slug_unique, posts_status_index.
[index_exists] in 2026_11_15_101500_add_index_on_posts_table.ts: An index named "posts_status_index" already exists (on "posts"). Hint: Give the index another name.
```

**Fix:** each hint lists what does exist; use one of those names.

### Renaming or dropping inside `schema.create`

```text
[not_allowed_in_create] in 2026_11_15_093000_create_posts_table.ts: schema.create('posts') can only add columns and indexes, but it asks to renameColumn. Hint: Define the table the way you want it, or change it later with schema.table('posts', …).
```

**Fix:** write the column with its final name in `schema.create`, or move the change to `schema.table` in a later migration.

### A file in the migrations folder that isn't a migration

```text
[invalid_migration]: "helpers.ts" is in the migrations folder but isn't named like a migration. Hint: Name it YYYY_MM_DD_HHMMSS_what_it_does.ts (node strut make:migration does this for you), or move it out of the folder.
[invalid_migration]: 2026_11_15_093000_create_posts_table.ts doesn't default-export a migration. Hint: Make the file end with `export default migration({ up(schema) { … }, down(schema) { … } })`.
```

**Why:** Strutvane refuses rather than skipping: a skipped migration would mean wrong types with no warning.
**Fix:** move shared helpers to another folder (for example `database/helpers/`) and import them; make sure every migration ends with `export default migration({ … })`.

### "is not a valid migration name"

```bash
node strut make:migration CreatePostsTable
```

```text
  ✖ "CreatePostsTable" is not a valid migration name.
  → Use snake_case letters, digits and underscores, for example: node strut make:migration create_posts_table
```

**Fix:** use the suggested snake_case name.

### "the database says … ran, but there is no such migration file"

```text
The database says "2026_11_10_120000_create_drafts_table" ran, but there is no such migration file. Restore the file (from version control) so Strutvane knows what the database looks like, or remove its row from the migrations table if you are sure it never mattered.
```

**Why:** someone deleted or renamed a migration that had already run. Strutvane stops, because it can't know what your database looks like without it.
**Fix:** restore the file with git (`git log --diff-filter=D -- database/migrations` finds it). On your own machine only, `node strut migrate:fresh` starts over.

### The database can't be reached

```text
Cannot reach MySQL at 127.0.0.1:3306 (ECONNREFUSED). Start the database (Docker: node strut services:up), check DB_* in .env, then run: npm run setup
```

`migrate` exits with code **3** in this case (not 1), so scripts and the installer can tell "database down" apart from "migration broken".
**Fix:** start the database; with Docker, `node strut services:up`. Check `DB_HOST` and `DB_PORT` in `.env` (see [Database: Getting Started](../database/)).

### I edited an old migration and nothing changed

**Why:** a migration that has already run never runs again; the `migrations` table remembers it.
**Fix:** write a new migration for the change. On your own machine only, you can start over with `node strut migrate:fresh --seed` (this **deletes all data**).

### My code still compiles after I dropped a column

**Why:** the types are regenerated by `migrate` (or `sync`). Until then, the old types still list the column.
**Fix:** run `node strut migrate` (or `node strut sync`). CI also fails when the committed `.strutvane/` doesn't match your migrations.

## Next steps

- [Seeding](../seeding/): fill your new tables with data.
- [ORM: Getting Started](../orm/): read and write rows with the model `make:migration` wrote.
- [Your First CRUD](../first-crud/): from migration to screens in five minutes.
- [Database: Getting Started](../database/): connections, engines and the other database commands.
