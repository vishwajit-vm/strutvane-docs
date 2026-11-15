---
title: "Database Testing"
description: "Give every test a clean database on the same engine as production, create data with factories and seeders, check what was stored, test soft deletes and tenancy, and keep tests fast and isolated."
---

Most bugs live where your code meets the database: a row that should be soft-deleted but is gone, a slug that isn't unique per team, a query that leaks another customer's data. **Database tests** create rows, run your code, and check what's stored. Strutvane runs them against a **real database engine**, never a mock, because a mock can't tell you that MySQL compares `'1abc' = 1` as true.

:::tip[Coming from Laravel?]
- `use RefreshDatabase;` → `await refreshDatabase(app)` (and, in 0.2, a transaction per test, like Laravel's `DatabaseTransactions`);
- `Post::factory()->count(10)->for($user)->create()` → `Post.factory().count(10).for(user).create()`;
- `$this->seed(PostSeeder::class)` → `await app.run(() => new PostSeeder().run())`;
- `assertDatabaseHas('posts', [...])` → `assertDatabaseHas('posts', {...})`.

What's different: the test database is the **same engine as production** (MySQL or PostgreSQL), not SQLite in memory, unless your app uses SQLite. Factories never create a new parent per row by accident (`recycle`).
:::

:::caution[What exists, and when]
- **Proven in a prototype:** `refreshDatabase(app)` loading the schema dump your migrations produce (spike 12), and the ORM on real MySQL 8.4, PostgreSQL (PGlite) and SQLite (spike 11, 184 tests). Seeders run with `app.run()` (spike 12's example app).
- **Coming in 0.2:** a transaction per test that's rolled back, a test database per Vitest worker on your app's engine, factories (`Post.factory()…`, with states, sequences, `for`, `has` and `recycle`), `assertDatabaseHas`-style assertions, and `asTenant()`. 0.1 has factories in another shape (`defineFactory`, `createTestApp`); they're being rebuilt on the new ORM.

Names marked "planned" may change.
:::

## The smallest example

```ts title="tests/feature/post-store.test.ts"
import { beforeEach, expect, it } from 'vitest'
import type { Application } from '@strutvane/framework'
import { client, refreshDatabase } from '@strutvane/framework/testing'
import { createApp } from '../../bootstrap/app.ts'
import { Post } from '../../app/models/post.ts'
import { DatabaseSeeder, demoTokens } from '../../database/seeders/database.seeder.ts'

let app: Application

beforeEach(async () => {
  app = createApp({ APP_ENV: 'testing', APP_KEY: 'base64:dGVzdGluZy1rZXktdGVzdGluZy1rZXktdGVzdGluZy0=', DB_CONNECTION: 'sqlite', DB_DATABASE: ':memory:' })
  await refreshDatabase(app)
  await app.run(() => new DatabaseSeeder().run())
})

it('stores a new post as a draft owned by its author', async () => {
  await client(app).actingAs(demoTokens.alice).postJson('/api/posts', { title: 'Database testing' })

  const post = await app.run(() => Post.query().where('slug', 'database-testing').first())
  expect(post?.status).toBe('draft')
  expect(post?.author_id).toBe(1)
})
```

**What you'll see:**

```text
 ✓ tests/feature/post-store.test.ts (1 test) 22ms
```

The ORM is used inside `app.run(…)`, because models read the current app's connection.

## A clean database for every test

`refreshDatabase(app)` creates every table in the test database from `.strutvane/sql/schema.<engine>.sql`, the schema your migrations produce. It doesn't replay each migration file, so it takes milliseconds even with a hundred tables.

| How | Speed | When |
|---|---|---|
| `refreshDatabase(app)` in `beforeEach` (works today in the prototype) | fast with SQLite in memory; slower on a server | small apps, SQLite |
| **a transaction per test** (0.2) | the fastest on every engine | the default in 0.2 |

**A transaction per test** works like this: the schema is built **once per worker**, each test runs inside a database transaction, and the transaction is **rolled back** at the end. Every test starts from the same rows, and nothing is ever deleted by hand.

**A database per worker:** Vitest runs test files in parallel, in several **workers**. In 0.2 each worker gets its own copy of the test database (`my_app_test_1`, `my_app_test_2`…), so parallel files never see each other's rows.

### Which engine?

| Your app uses | Tests use | Why |
|---|---|---|
| MySQL | the MySQL test database (`DB_TEST_DATABASE=<app>_test`) | MySQL's type coercion, collations and `NULLS LAST` behave differently from SQLite |
| PostgreSQL | the PostgreSQL test database | row-level security (tenancy) only exists there |
| SQLite | a SQLite file or `:memory:` | the same engine |

Running MySQL-app tests on SQLite would pass tests that fail in production. With Docker, the test database is already running next to your dev database; without Docker, create it on your server once and put its name in `DB_TEST_DATABASE`.

## Creating data with factories

A **factory** makes realistic rows for tests: you say what matters, and it fills in the rest. `node strut make:migration create_posts_table --seeder` already wrote one for you.

:::caution[Coming in 0.2]
**Planned API (a sketch: names may change).** The factory API below is from the blueprint (`Post.factory().count(10).for(user).create()`) and the parity checklist (states, sequences, `for`/`has`, `recycle`). The ORM prototype doesn't include factories yet.
:::

The generated file, `database/factories/post.factory.ts`, describes one typical post (see [Factories](../orm-factories/) for what it looks like today). Use it in tests:

```ts
const alice = await User.factory().create({ name: 'Alice' })

const one = await Post.factory().for(alice, 'author').create()                       // one draft by Alice
const many = await Post.factory().count(10).state({ status: 'published' }).for(alice, 'author').create()
const titled = await Post.factory().create({ title: 'Exactly this title' })           // override a field
const unsaved = Post.factory().make()                                                  // built, not stored
```

**What you'll see:** rows in the test database, returned as `Post` models with ids, slugs and timestamps filled in. Slugs follow the real rules (random suffix on a clash), because factories go through the model.

### Sequences

```ts
await Post.factory().count(3).sequence({ status: 'draft' }, { status: 'published' }).create()
// → draft, published, draft
```

### Children and parents: `has`, `for` and `recycle`

```ts
// A user with five posts
const author = await User.factory().has(Post.factory().count(5), 'posts').create()

// Ten posts that all share one author, instead of creating ten authors
const posts = await Post.factory().count(10).recycle(author).create()
```

Without `recycle`, a factory that needs a parent makes a **new** parent for every row: ten posts, ten authors. That's rarely what you meant (it was a real bug in the 0.1 demo app).

## Seeders in tests

Run a seeder when a test needs the app's standard data:

```ts
await app.run(() => new DatabaseSeeder().run())
```

Seeders are tracked once per database in development, but tests start from an empty database each time, so they always run here. Prefer factories for data a test depends on: a test that says `Post.factory().create({ title: 'X' })` explains itself; a test that relies on "the third seeded post" doesn't.

## Checking what's stored

### With the ORM (works today)

```ts
const count = await app.run(() => Post.query().where('status', 'published').count())
expect(count).toBe(3)
```

### Assertions (planned)

:::caution[Coming in 0.2]
**Planned API (a sketch: names may change).** The parity checklist lists Laravel's database assertions for the testing kit.
:::

```ts
await assertDatabaseHas(app, 'posts', { slug: 'hello-world', status: 'published' })
await assertDatabaseMissing(app, 'posts', { slug: 'alice-draft' })
await assertDatabaseCount(app, 'posts', 3)
await assertSoftDeleted(app, 'posts', { slug: 'old-news' })
```

A failure prints the rows that **are** in the table, so you see what's there instead of guessing.

## Soft deletes

```ts
it('soft deletes a post', async () => {
  await client(app).actingAs(demoTokens.alice).deleteJson('/api/posts/hello-world')

  const visible = await app.run(() => Post.query().where('slug', 'hello-world').first())
  const trashed = await app.run(() => Post.query().withTrashed().where('slug', 'hello-world').first())
  expect(visible).toBeNull()
  expect(trashed?.deleted_at).not.toBeNull()
})
```

The row still exists with `deleted_at` set; normal queries don't see it. See [Soft Deletes](../orm-soft-deletes/).

## Tenancy

With teams, every query is scoped to the current team. Database tests must set one, or the ORM refuses (fail closed):

```text
TenantRequiredError: "projects" is tenant-scoped, but no tenant is active. Wrap the work in runWithTenant(tenantId, () => …) (the HTTP layer does this for you per request). Deliberate cross-tenant jobs use .unsafeWithoutTenancy(reason), which is audited.
```

The error code is `TENANT_REQUIRED` (answered as 403 over HTTP). Set the team for a block of code with the ORM's `runWithTenant()` (proven in spike 11):

```ts
import { runWithTenant } from '@strutvane/framework'

await app.run(() => runWithTenant('acme', () => Project.create({ name: 'Secret launch' })))
const seenByGlobex = await app.run(() => runWithTenant('globex', () => Project.query().count()))
expect(seenByGlobex).toBe(0)   // globex sees none of acme's projects
```

The testing kit's planned `asTenant(team)` does the same for HTTP test clients.

On PostgreSQL the database's row-level security checks this again underneath, so even a raw query can't cross teams. Test it on PostgreSQL if that's your production engine. See [Tenancy](../orm-tenancy/).

## Transactions in your own code

When your code uses `transaction()`, it works the same inside the test's own transaction: Strutvane uses **savepoints** for nested transactions, so your code's rollback undoes only its own part. Parallel savepoints on one connection are refused (a real bug the ORM prototype found), so don't `Promise.all` two transactions inside a test.

## Platform and Docker differences

- **With Docker:** MySQL or PostgreSQL run in the `db` container, and the test database was created on its first start. `npm test` runs inside the `app` container.
- **Without Docker, SQLite:** nothing to set up; the test file is `database/testing.sqlite`.
- **Without Docker, a server database:** create the test database once and give your user rights on it, then set `DB_TEST_DATABASE`.
- **Windows:** SQLite test files can stay locked by an open database tool. Close it if `refreshDatabase` fails with `EBUSY`.

## Common mistakes

### "no such table: posts"

```text
SqliteError: no such table: posts
```

**Why:** the test didn't call `refreshDatabase(app)`, or `.strutvane/sql/schema.sqlite.sql` is stale because you added a migration and didn't run `node strut migrate`.
**Fix:** call `refreshDatabase(app)` in `beforeEach`, and run `node strut migrate` (or `node strut sync`) after changing migrations.

### Tests pass locally on SQLite but fail in CI on MySQL

**Why:** the engines differ: MySQL compares strings and numbers loosely, sorts `NULL` differently, and its collation decides case sensitivity.
**Fix:** run tests locally on the same engine as CI and production.

### A test sees rows from another test

**Why:** the app (or the database) is shared across tests and nothing cleans it.
**Fix:** build the app and refresh the database in `beforeEach`, as above. In 0.2 the per-test transaction does this for you.

### Ten posts created ten users

**Why:** each post needed an author and the factory made one per row.
**Fix:** `Post.factory().count(10).recycle(author).create()`.

### "Model.query() was called outside a request or console command"

**Why:** the ORM needs the current app to find its connection.
**Fix:** wrap it: `await app.run(() => Post.query().count())`.

## Next steps

- [HTTP Tests](../http-tests/): request helpers and assertions.
- [Factories](../orm-factories/): every factory feature.
- [Seeding](../seeding/): seeders and how they're tracked.
- [Mocking](../mocking/): fakes for mail, HTTP and time.
