---
title: "ORM: Getting Started"
description: "Read, create, update and delete database rows with model classes whose columns come straight from your migrations, and learn the conventions, settings and safety switches behind them."
---

The **ORM** (object-relational mapper) is the part of Strutvane that turns database rows into TypeScript objects and back. Each table gets a **model**: a small class in `app/models` that knows how to find, create, update and delete rows of that table. You never write SQL for everyday work, and you never repeat your columns: the model reads them from your [migrations](../migrations/).

Use the ORM whenever your own code (a controller, a seeder, a job) needs to read or change data. The generated CRUD API uses exactly the same models, so what you learn here also explains what the API does.

:::tip[Coming from Laravel?]
This is Eloquent. `class Post extends Model` becomes `class Post extends Model('posts', { fillable: [...] })`, and `$fillable`, `$hidden`, `$casts` and `$perPage` move into that options object (like Laravel 13's `#[Fillable]` and `#[Hidden]` attributes). Three differences: columns keep their migration names (`created_at`), there's no implicit lazy loading (JavaScript can't wait inside a property read, so you load relations with `with()`), and unknown or non-fillable fields **throw** instead of being dropped silently.
:::

## Your first model

Say a migration created a `posts` table with `title`, `slug`, `body`, `status`, `published_on`, `meta`, `author_id`, timestamps and soft deletes (see [Your First CRUD](../first-crud/)). This is a complete model for it:

```ts title="app/models/post.ts"
import { Model } from '@strutvane/framework/database'

export class Post extends Model('posts', {
  fillable: ['title', 'body', 'status'],
}) {}
```

That's all. The name `'posts'` tells Strutvane which table this is, and from the generated types it knows every column, its type and whether it can be empty. `fillable` lists the columns people may set when creating or filling a post (see [Mass Assignment](../orm-mass-assignment/)).

Now use it. A post needs an author, so the smallest real example creates it through the author's `posts()` [relationship](../orm-relationships/), which fills in `author_id` for you:

```ts title="app/http/controllers/post.controller.ts (excerpt)"
import { User } from '../../models/user.ts'

const ada = await User.findOrFail(1)
const post = await ada.posts().create({ title: 'Hello world', status: 'draft' })

console.log(post.id)          // a number: the new row's key
console.log(post.slug)        // filled in from the title
console.log(post.author_id)   // set by the relationship
console.log(post.created_at)  // a Date, set for you
```

**What you'll see:**

```text
1
hello-world
1
2026-11-14T09:30:00.000Z
```

The row is in the database, the slug was generated, the author was linked and both timestamps were set.

:::note[Why a function call, `Model('posts', …)`?]
TypeScript can only give `post.title` the type `string` if the class is created by a function that knows the table. That's also why options that change types (`fillable`, `hidden`, `casts`, `allowSensitive`, `perPage`) go in the call, and behaviour (relations, scopes, getters, your own methods) goes in the class body. No decorators are needed.
:::

:::note[Import paths]
Everything on the ORM pages (`Model`, `Scopes`, `cast`, `json`, `sql`, `transaction`, `runWithTenant`, `loadMany`, `configureOrm`, `defineFactory`, `defineSeeder`, the error classes and the types) comes from `@strutvane/framework/database`. Migrations use `@strutvane/framework/schema`. `node strut make:migration create_posts_table` writes the model with the right import for you.
:::

### Where the ORM gets its connection

The ORM needs two things before a model can run a query: the **schema snapshot** (`.strutvane/schema.json`, written by `node strut migrate` and `node strut sync`), so it knows every table and column, and a **connection** built from your `DB_*` settings (see [Database](../database/)).

Your app sets both up when it boots (`node strut dev`, `node strut start`), and `node strut db:seed`, `node strut migrate --seed` and the other database commands do the same, so models work in controllers, seeders and factories without any code of yours.

A stand-alone script or a test runner that doesn't boot the app connects the models itself, with the same public functions; see [Who opens the connection](../database/#who-opens-the-connection).

## How a model finds its data

You never configure these; they follow from your migrations.

| Thing | Convention | Where it comes from |
|---|---|---|
| Table | the first argument of `Model('posts')` | must be a table some migration created |
| Columns | every column of that table, typed | the generated `.strutvane/types/models.d.ts` |
| Primary key | the column named `id` | `t.id()` or `t.uuid('id').primary()` in the migration |
| Timestamps | `created_at` and `updated_at` are filled in when both exist | `t.timestamps()` |
| Soft deletes | on when `deleted_at` exists | `t.softDeletes()` (see [Soft Deletes](../orm-soft-deletes/)) |
| Slugs | filled in on create | `t.slug('slug').from('title')` (see [Slugs](../orm-slugs/)) |
| Casts | picked from each column's type | the migration (see [Casts](../orm-casts/)) |

### Primary keys

| Migration | The key is | Who makes it |
|---|---|---|
| `t.id()` | a growing whole number (`1`, `2`, `3`…) | the database |
| `t.uuid('id').primary()` | a **UUIDv7** string like `'019a8b2c-6a7f-7b12-9d6f-2f8a4e0c9c11'` | the ORM, before the insert |

A UUIDv7 is a random-looking id that still sorts by creation time, so new rows land at the end of the index (fast inserts) and `orderBy('id')` is creation order. It's also hard to guess, which makes it a good choice for ids in URLs. Laravel 13 uses the same kind by default.

A table without an `id` column can't have a model (pivot tables like `post_tag` don't need one). And the key of a saved row never changes; see Common mistakes.

Your own code may choose a UUID key itself: `forceCreate({ id: '…' })` and `forceFill()` accept `id` on a UUID table (never on a `t.id()` table). Requests can't set it, because `id` can't be in `fillable`.

:::caution[Coming in 0.2]
`t.ulid('id')` keys and composite primary keys are designed but not built yet.
:::

### When columns change

Columns live only in migrations. When you add, rename or drop one, run `node strut migrate`: it regenerates the types, and every line of code that still uses an old name becomes a compile error. With Docker, the command runs inside the app container; the result is the same.

```text
error TS2339: Property 'body' does not exist on type 'Post'.
```

## Reading rows

| You want | Write | You get |
|---|---|---|
| Every row | `await Post.all()` | `Post[]` |
| One row by its key | `await Post.find(1)` | `Post` or `undefined` |
| One row, or a 404 | `await Post.findOrFail(1)` | `Post`, or throws `ModelNotFoundError` |
| Rows that match | `await Post.where('status', 'published').get()` | `Post[]` |
| The first match | `await Post.query().where('status', 'draft').first()` | `Post` or `undefined` |
| The first match, or a 404 | `await Post.query().where('slug', slug).firstOrFail()` | `Post` |
| How many | `await Post.query().count()` | `number` |
| Whether any exist | `await Post.query().where('status', 'draft').exists()` | `boolean` |

```ts title="app/http/controllers/post.controller.ts (excerpt)"
const post = await Post.findOrFail(1)
console.log(post.title, post.status)
// → Hello world draft

const drafts = await Post.where('status', 'draft').orderBy('created_at', 'desc').get()
console.log(drafts.map((p) => p.title))
// → [ 'Hello world' ]
```

Every column is a typed property: `post.status` is `'draft' | 'published'`, so `if (post.status === 'archived')` doesn't compile. Lists are plain JavaScript arrays (see [Collections](../orm-collections/)). All the ways to filter, order and limit are in [Querying](../orm-querying/).

### Large tables

To walk through thousands of rows without loading them all at once, page through them with a cursor:

```ts title="app/jobs/send-digest.ts (excerpt)"
let cursor: string | undefined
do {
  const page = await Post.query().published().orderBy('id').cursorPaginate(100, cursor)
  for (const post of page.data) {
    // work on one post
  }
  cursor = page.nextCursor ?? undefined
} while (cursor !== undefined)
```

Memory stays flat, because only 100 posts are loaded at a time. See [Pagination](../orm-pagination/) for how cursors work.

:::caution[Coming in 0.2]
Laravel's `chunk()`, `chunkById()`, `cursor()` and `lazy()` are designed as async iterators (`for await (const post of Post.query().cursor())`) over the same keyset pages, but they're not built yet. The loop above does the same job today.
:::

## Creating rows

There are three ways, and all of them run the same checks.

**1. Through a relationship**, which also sets the foreign key (the safest way to set an owner):

```ts
const post = await ada.posts().create({ title: 'Second post', body: 'More words.', status: 'draft' })
```

**2. In one step**, with `create()`, when every required column is fillable or has a default:

```ts
const tag = await Tag.create({ name: 'news' })
```

**3. In steps**, with `make()`, then `fill()` or plain assignment, then `save()`:

```ts
const post = Post.make()           // a new, unsaved post
post.fill({ title: 'Third post' }) // from a request: only fillable columns
post.author_id = ada.id            // your own code may set any column directly
await post.save()                  // INSERT
console.log(post.isPersisted())    // → true
```

When a row is inserted, Strutvane:

1. stamps the active tenant on tenant tables (see [Tenancy](../orm-tenancy/));
2. generates the key when it's a UUID;
3. sets `created_at` and `updated_at` when the table has them;
4. converts and checks every value (see [Casts](../orm-casts/));
5. fills empty slug columns from their source;
6. reads the row back, so database defaults appear: `post.status` is `'draft'` even when you didn't send it.

For trusted data (seeders, imports, your own services), `Post.forceCreate({...})` accepts every real column except the ones Strutvane manages. See [Mass Assignment](../orm-mass-assignment/).

:::note[MySQL, PostgreSQL and SQLite]
PostgreSQL and SQLite return the new row in the same statement (`RETURNING`). MySQL 8.4 doesn't support that, so on MySQL the ORM reads the row again by its key right after the insert: one extra, fast query per write. You don't need to do anything about it.
:::

:::caution[Coming in 0.2]
Designed but not built yet: `firstOrCreate()`, `updateOrCreate()`, `upsert()` (on tenant tables the conflict target must include the tenant column, so one tenant can never overwrite another's row), bulk `insert()`, and `replicate()` (copy a row without its key, timestamps and slug; the admin screens' "Duplicate" action will use it).
:::

## Updating rows

Change properties, then `save()`. Only the columns you changed are written, plus `updated_at`:

```ts
const post = await Post.findOrFail(1)
post.title = 'Hello again'

console.log(post.getDirty())         // → { title: 'Hello again' }
console.log(post.isDirty())          // → true
console.log(post.isDirty('status'))  // → false

await post.save()                    // UPDATE posts SET title = ?, updated_at = ? WHERE id = ?
console.log(post.isDirty())          // → false
```

A **dirty** column is one you changed since the row was loaded or last saved. Calling `save()` with nothing dirty sends no query at all.

`fill()` works for updates too, with the same `fillable` rules as `create()`:

```ts
post.fill({ status: 'published' })
await post.save()
```

To throw away unsaved changes and reload the row from the database, use `await post.refresh()`.

:::caution[Coming in 0.2]
Bulk updates (`Post.query().where(...).update({...})`), `increment()`/`decrement()`, `touch()`, `withoutTimestamps()` and optimistic locking (a `lock_version` column, a 409 when someone else saved first) are designed but not built yet.
:::

## Deleting rows

```ts
const post = await Post.findOrFail(1)
await post.delete()
```

If the table has a `deleted_at` column (`t.softDeletes()` in the migration), `delete()` only hides the row so it can be restored; `forceDelete()` removes it for good. See [Soft Deletes](../orm-soft-deletes/).

:::caution[Coming in 0.2]
Bulk deletes (`Post.query().where(...).delete()`) and `Post.destroy([1, 2, 3])` are designed but not built yet. Until then, load the rows and delete each one inside a [transaction](../orm-transactions/).
:::

### Pruning old rows

**Pruning** means deleting rows you no longer need on a schedule, like posts soft-deleted more than 30 days ago.

:::caution[Coming in 0.3]
A `prunable()` method on the model (the query of rows to delete) plus a scheduled `node strut model:prune` command, like Laravel's `Prunable`, is coming in 0.3. Until then, a scheduled job can query the rows and `forceDelete()` them.
:::

## Turning models into JSON

`toJSON()` gives you a plain object, ready to send; `JSON.stringify(post)` and `ctx.json(post)` call it for you. Dates become ISO strings, decimals stay exact strings, loaded relations and counts are nested in, and hidden columns never appear (their keys are missing from the TypeScript type too).

A column is hidden when the model lists it in `hidden`, when its migration marks it `.hidden()` or `.secret()`, or when its name looks like a secret (`password`, `remember_token`, `api_key`, anything ending in `_token`, `_secret` or `_password`, …). So a `password` column is hidden even though this model doesn't list it:

```ts title="app/models/user.ts"
import { Model } from '@strutvane/framework/database'

export class User extends Model('users', {
  fillable: ['name', 'email'],
}) {}
```

```ts
const user = await User.findOrFail(1)
console.log(user.toJSON())
// → { id: 1, name: 'Ada', email: 'ada@example.com', created_at: '2026-11-14T09:30:00.000Z', updated_at: '2026-11-14T09:30:00.000Z' }
console.log(user)              // the same fields: console.log and util.inspect never print a hidden column
user.toJSON().password         // compile error: Property 'password' does not exist
```

Your own server code can still read `user.password` (to check a hash, say); hidden only affects what leaves the server. Everything about the output (each value type, relations, the `JsonOf` and generated `PostJson` types, and the coming `visible` and `appends`) is on [Serialization](../orm-serialization/).

## Adding behaviour to a model

The class body is yours. Add methods, getters (computed values), [relations](../orm-relationships/) and [scopes](../orm-scopes/):

```ts title="app/models/post.ts"
import { Model, type Scopes } from '@strutvane/framework/database'
import { User } from './user.ts'

export class Post extends Model('posts', {
  fillable: ['title', 'body', 'status', 'published_on'],
}) {
  static readonly scopes = {
    published: (query) => query.where('status', 'published'),
  } satisfies Scopes<'posts'>

  author() {
    return this.belongsTo(User, 'author_id')
  }

  get isPublished(): boolean {
    return this.status === 'published'
  }
}
```

```ts
const posts = await Post.query().published().with('author').get()
console.log(posts[0]?.author?.name, posts[0]?.isPublished)
// → Ada true
```

A method or getter must not have the same name as a column (see Common mistakes).

## Model events and observers

A **model event** is a hook that runs when a model is created, updated, deleted or restored, like "send a welcome mail after a user is created". An **observer** is a class that groups those hooks for one model. They follow Laravel's names (`creating`, `created`, `updating`, `updated`, `saving`, `saved`, `deleting`, `deleted`, `restoring`, `restored`), and "after" events inside a transaction wait for the commit.

:::caution[Coming in 0.2]
The ORM doesn't fire model events yet. `node strut make:observer` already writes an observer class, but there's no way to attach it to a model until events ship. The full guide (hooks on the model, the order events fire in, transactions, `saveQuietly()`) is on [Events & Observers](../orm-events/).
:::

## Settings: `configureOrm()`

A few switches apply to the whole app. Change them once, at start-up (in a service provider):

```ts title="app/providers/app.provider.ts (excerpt)"
import { configureOrm } from '@strutvane/framework/database'

configureOrm({
  maxPerPage: 200,
  onUnsafeTenancy: (event) => console.warn('tenancy bypass', event), // send this to your audit log
})
```

| Setting | Default | What it does |
|---|---|---|
| `preventLazyLoading` | `true`, except when `NODE_ENV=production` | refuses loading a relation one row at a time inside a list (the N+1 problem) |
| `maxPerPage` | `100` | the largest page `paginate()` and `cursorPaginate()` accept |
| `maxInValues` | `1000` | the longest list `whereIn()`, `whereNotIn()` and `filter(…, 'in', …)` accept |
| `tenancy` | `false`; the database commands read `config/tenancy.ts` | the one tenant column of the app (`{ column: 'tenant_id' }`), or `false` for a single-tenant app |
| `onUnsafeTenancy` | does nothing | called for every audited tenancy bypass; wire it to your audit log |

Settings you don't pass keep their values.

:::note[Tenancy follows `config/tenancy.ts`]
Tenancy is on only in apps created with teams (`enabled: true` in `config/tenancy.ts`; `node strut migrate`, `db:seed` and the other database commands pass it to the ORM). With tenancy on, every table must either have the tenant column (it's **scoped** to one tenant) or be marked as **global** (shared by all tenants) in its migration; any other table is refused. The examples on the ORM pages treat `users`, `posts` and `tags` as global tables and `projects` and `tasks` as tenant tables. A single-tenant app has `enabled: false`, and then none of this applies. See [Tenancy](../orm-tenancy/).
:::

### Strict mode

**Strict mode** means "fail loudly in development instead of quietly doing something slow or wrong". Part of it is always on:

- **Unknown and non-fillable fields throw** (Laravel's `preventSilentlyDiscardingAttributes`), in every environment. See [Mass Assignment](../orm-mass-assignment/).
- **Lazy loading inside a list throws** `LazyLoadingError` outside production (`preventLazyLoading`). See [Relationships](../orm-relationships/).
- **Unknown column names throw** with a "did you mean", in `where()`, `sort()`, `filter()` and `search()`. A hidden column answers exactly like a missing one in `sort()`, `filter()` and `search()`, and is never suggested.
- **Odd model options throw** the first time the model is used: a `hidden`, `fillable` or `casts` entry for a column that doesn't exist, a secret or sensitive-looking column in `fillable` (see [Mass Assignment](../orm-mass-assignment/)), or a scope named like a query method.

:::caution[Coming in 0.2]
`Model.strict()`, one switch that also refuses reading an attribute that wasn't selected (Laravel's `preventAccessingMissingAttributes`), and a development warning when the same query runs more than 5 times in one request, are designed but not built yet.
:::

### Seeing every query

To log or count the SQL your code sends (useful in tests and while debugging), listen on the connection:

```ts title="tests/feature/post-list.test.ts (excerpt)"
import { defaultConnection } from '@strutvane/framework/database'

let queries = 0
const stop = defaultConnection().onQuery((event) => {
  queries += 1
  console.log(event.sql, event.params, `${event.durationMs.toFixed(1)} ms`)
})

await Post.query().with('author').get()
stop()
console.log(queries) // → 2
```

`onQuery()` returns a function that stops listening. Parameters are included for debugging; never write them to a log without redaction, because they can contain personal data.

:::caution[Coming in 0.2]
Several named connections (`Post.on('reporting')`, read and write hosts) are designed but not built yet; the ORM uses one connection, built from your `DB_*` settings (see [Database](../database/)).
:::

## Which database?

The ORM behaves the same on **MySQL 8.4+** (the default), **MariaDB**, **PostgreSQL** (a server, or PGlite in process) and **SQLite** (Node's built-in `node:sqlite`): the framework's ORM tests run on every one of them. Where the engines differ, the ORM smooths it over:

- **Booleans:** MySQL and SQLite store `0`/`1`; you always get `true`/`false`.
- **Decimals:** SQLite stores them as floats; you always get an exact string like `'10.50'`.
- **Text length:** SQLite ignores `VARCHAR(200)`; the ORM enforces the length everywhere.
- **Dates:** stored and read in UTC on every engine.
- **Inserts:** MySQL and MariaDB have no `RETURNING`, so the row is read back by key (one extra query).
- **Mixed types:** MySQL compares across types by converting (`'1abc' = 1` is true there). The ORM checks every value against its column's type before any SQL is sent, so that can't happen.
- **Case and accents:** MySQL's default collation treats `'résumé'` and `'resume'` as equal. On MySQL and MariaDB, the migration gives identifier-like columns (slugs, UUIDs, and text columns named `email`, `username`, `token` or ending in `_email`/`_token`) a byte-for-byte collation, so they're compared exactly. Other text columns keep the server's default; normalise values you look up with a cast (see [Casts](../orm-casts/)).

## Common mistakes

### "No row in posts with key 99"

```text
ModelNotFoundError: No row in "posts" with key 99. It may not exist, may be soft-deleted, or may belong to another tenant.
```

**Why:** `findOrFail()` (and `firstOrFail()`) throw when nothing matches. In a controller this becomes a 404 response, which is usually what you want.

**Fix:** when "not found" is a normal case, use `find()` and check for `undefined`:

```ts
const post = await Post.find(99)
if (post === undefined) {
  // show a friendly message instead
}
```

### "Did you mean …?" when creating a row

```text
MassAssignmentError: "posts" has no column "titel". Did you mean "title"? Columns come from your migrations: add one with a new migration, then run `node strut migrate`.
```

**Why:** the column doesn't exist (here, a typo). Strutvane refuses unknown fields instead of silently dropping them.

**Fix:** use the real column name. If the column is new, add it in a migration and run `node strut migrate`, which regenerates the types.

### "The table … is not in the schema snapshot"

```text
OrmUsageError: The table "post" is not in the schema snapshot. Did you create it in a migration and run `node strut migrate`?
```

**Why:** the name in `Model('post')` doesn't match a table (tables are plural), or the migration hasn't run yet.

**Fix:** use the table name from the migration (`Model('posts')`) and run `node strut migrate`. If the message ends with "No schema is registered yet: call registerSchema(snapshot) at boot.", the ORM hasn't been set up in this process at all (see [Where the ORM gets its connection](#where-the-orm-gets-its-connection)).

### "No database connection is set yet"

```text
OrmUsageError: No database connection is set yet. Call useConnection(connection) at boot (the framework does this for you).
```

**Why:** a model ran a query in a process where nobody called `useConnection()`: a stand-alone script or a test runner that doesn't boot the app. The app and the database commands do it for you.

**Fix:** connect the models first, as in [Who opens the connection](../database/#who-opens-the-connection).

### A model for a table without `id`

```text
OrmUsageError: "post_tag" has no "id" column. Models need t.id() (or t.uuid('id')) in the migration; pivot tables don't need a model.
```

**Fix:** add `t.id()` (or `t.uuid('id').primary()`) in the migration, or don't write a model for a pivot table: use `belongsToMany()` instead.

### A column with the same name as a model method

```text
OrmUsageError: "posts.save" has the same name as the model method save(). Rename the column in a new migration.
```

**Why:** columns become properties of the model, so a column called `save`, `delete` or `fill` would hide the method.

**Fix:** rename the column in a new migration (`t.renameColumn('save', 'saved_flag')`).

### Deleting a model you never saved

```text
OrmUsageError: Can't delete() a "posts" row that was never saved. Call save() first.
```

**Why:** `Post.make()` builds an object that isn't in the database yet.

**Fix:** call `await post.save()` first, or use `create()`, which saves in one step.

### Changing a row's key

```text
OrmUsageError: The primary key of a saved "posts" row can't change. Create a new row instead.
```

**Why:** the key is how every other table points at this row. Changing it would break those links.

**Fix:** create a new row and delete the old one if you need to.

### A database error about `author_id` when creating a post

**What you'll see:** a NOT NULL error from the database driver (the wording depends on MySQL, MariaDB, PostgreSQL or SQLite). If your own code sets `author_id` to `null`, the ORM stops it first with `CastError: Can't store that value in "posts.author_id": it is required (the column is NOT NULL).`

**Why:** `author_id` is required but isn't in `fillable` (on purpose: users must not pick the author), so `Post.create({ title })` leaves it out of the INSERT and the database refuses the row.

**Fix:** create the post through the relationship, `user.posts().create({...})`, or set `post.author_id = user.id` in your own code before `save()`.

## Next steps

- [Querying](../orm-querying/): every way to filter, order and limit.
- [Relationships](../orm-relationships/): authors, posts and tags, without N+1 queries.
- [Mass Assignment](../orm-mass-assignment/): what `fillable` protects you from.
- [Serialization](../orm-serialization/) and [Events & Observers](../orm-events/): what comes out, and hooks around each write.
- [Tenancy](../orm-tenancy/): keeping each team's data apart.
