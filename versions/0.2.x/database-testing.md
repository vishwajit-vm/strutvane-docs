---
title: "Database Testing"
description: "Give every test a clean database on the same engine as production, create data with factories and seeders, check what was stored, test soft deletes and tenancy, and keep tests fast and isolated."
---

Most bugs live where your code meets the database: a row that should be soft-deleted but is gone, a slug that isn't unique per team, a query that leaks another customer's data. **Database tests** create rows, run your code, and check what's stored. Strutvane runs them against a **real database engine**, never a mock, because a mock can't tell you that MySQL compares `'1abc' = 1` as true.

:::tip[Coming from Laravel?]
- `Post::factory()->count(10)->for($user)->create()` → `PostFactory.count(10).for(user, 'author_id').create()`;
- `use RefreshDatabase;` → `node strut migrate:fresh` before the run today, and a `refreshDatabase()` helper plus a transaction per test later;
- `$this->seed(PostSeeder::class)` → `await seed(app, 'PostSeeder')` (planned);
- `assertDatabaseHas('posts', [...])` → `assertDatabaseHas('posts', {...})` (planned).

What's different: the test database is the **same engine as production** (MySQL or PostgreSQL), not SQLite in memory, unless your app uses SQLite. Factories never create a new parent per row by accident (`recycle`).
:::

:::caution[What exists, and when]
- **On framework `main` (0.2.0-next.0, not on npm yet):** the ORM on MySQL 8.4+, MariaDB, PostgreSQL (node-postgres or PGlite) and SQLite; factories (`defineFactory` from `@strutvane/framework/database`, with states, `for`, `has`, `recycle` and `seed`); `runWithTenant()`; and the migration commands, which you can point at a test database.
- **Coming in 0.2:** test helpers for migration-first apps: `refreshDatabase(app)` and `seed(app)`, a transaction per test that's rolled back, a test database per Vitest worker on your app's engine, `assertDatabaseHas`-style assertions, and `asTenant()`. (`refreshDatabase` and `createTestApp` in `@strutvane/framework/testing` today belong to 0.1-style `defineModel` apps.)
- **Tests that don't boot the app** connect the ORM themselves, as below (see [Who opens the connection](../database/#who-opens-the-connection)).

Names marked "planned" may change.
:::

## The smallest example

Three small files give your tests their own SQLite database, built from your migrations, with the ORM connected. **First**, the test settings:

```ts title="vitest.config.ts"
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    env: { APP_ENV: 'testing', DB_CONNECTION: 'sqlite', DB_DATABASE: 'database/testing.sqlite' },
    globalSetup: ['tests/global-setup.ts'],
    setupFiles: ['tests/setup-database.ts'],
  },
})
```

**Second**, rebuild the test database once before the run, with the same command you'd type:

```ts title="tests/global-setup.ts"
import { execFileSync } from 'node:child_process'

export default function setup(): void {
  // APP_ENV=testing lets migrate:fresh drop the tables without --force.
  execFileSync(process.execPath, ['strut', 'migrate:fresh'], { stdio: 'inherit', env: process.env })
}
```

**Third**, connect the ORM in every test worker, with the same public functions the database commands use:

```ts title="tests/setup-database.ts"
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { databaseSettings, openDatabase, registerSchema, useConnection } from '@strutvane/framework/database'

const root = process.cwd()
registerSchema(JSON.parse(readFileSync(join(root, '.strutvane', 'schema.json'), 'utf8')))
useConnection(await openDatabase(databaseSettings(process.env, root)))
```

Now a test:

```ts title="tests/feature/post-store.test.ts"
import { expect, it } from 'vitest'
import { Post } from '../../app/models/post.ts'
import PostFactory from '../../database/factories/post.factory.ts'

it('stores posts as drafts', async () => {
  await PostFactory.count(3).create()

  expect(await Post.query().where('status', 'draft').count()).toBe(3)
})
```

**What you'll see:**

```text
 ✓ tests/feature/post-store.test.ts (1 test) 22ms
```

This recipe is checked against framework `main` piece by piece (`migrate:fresh` with `APP_ENV=testing`, then a factory and a count through the connection above); the Vitest wiring around it is *(unverified)*. The ORM connection is shared by the whole test process, so the ORM works in tests without `app.run()`.

## A clean database for every test

| How | Speed | When |
|---|---|---|
| `node strut migrate:fresh` before the run (above, works today) | once per run; tests share rows | small suites; clean up what each test writes |
| `refreshDatabase(app)` per test (coming in 0.2) | fast with SQLite; slower on a server | small apps, SQLite |
| **a transaction per test** (coming in 0.2) | the fastest on every engine | the planned default |

**A transaction per test** works like this: the schema is built **once per worker**, each test runs inside a database transaction, and the transaction is **rolled back** at the end. Every test starts from the same rows, and nothing is ever deleted by hand.

**A database per worker:** Vitest runs test files in parallel, in several **workers**. The plan for 0.2 gives each worker its own copy of the test database (`my_app_test_1`, `my_app_test_2`…), so parallel files never see each other's rows. Until then, run database tests in one worker (`npx vitest --no-file-parallelism`) when they share tables.

### Which engine?

| Your app uses | Tests use | Why |
|---|---|---|
| MySQL | a MySQL test database (`DB_DATABASE=<app>_test` in `vitest.config.ts`) | MySQL's type coercion, collations and `NULLS LAST` behave differently from SQLite |
| PostgreSQL | a PostgreSQL test database | row-level security (tenancy) only exists there |
| SQLite | a SQLite file | the same engine |

Running MySQL-app tests on SQLite would pass tests that fail in production. Create the test database on your server once and put its name in the test settings (`DB_DATABASE`). An installer-made test database (`DB_TEST_DATABASE`) is planned.

## Creating data with factories

A **factory** makes realistic rows for tests: you say what matters, and it fills in the rest. `node strut make:migration create_posts_table --seeder` already wrote one for you, `database/factories/post.factory.ts` (see [Factories](../orm-factories/) for every feature). Use it in tests:

```ts
import PostFactory from '../../database/factories/post.factory.ts'
import UserFactory from '../../database/factories/user.factory.ts'

const alice = await UserFactory.create({ name: 'Alice' })

const one = await PostFactory.for(alice, 'author_id').create()                       // one post by Alice
const many = await PostFactory.count(10).state({ status: 'published' }).for(alice, 'author_id').create()
const titled = await PostFactory.create({ title: 'Exactly this title' })            // override a field
const values = PostFactory.raw()                                                     // the values, not stored
```

**What you'll see:** rows in the test database, returned as `Post` models with ids, slugs and timestamps filled in. Slugs follow the real rules (`-2`, `-3` on a clash), because factories go through the model.

### Children and parents: `has`, `for` and `recycle`

```ts
// A user with five posts
const author = await UserFactory.has(PostFactory.count(5), 'author_id').create()

// Ten posts that all share one author, instead of creating ten authors
const posts = await PostFactory.count(10).recycle(author).create()
```

When the definition says `author_id: UserFactory`, a factory makes a **new** parent for every row without `recycle`: ten posts, ten authors. That's rarely what you meant.

## Seeders in tests

Run the seeders when a test needs the app's standard data:

```ts
await seed(app)                  // database/seeders/database.seeder.ts, which runs every registered seeder
await seed(app, 'PostSeeder')    // one seeder, like node strut db:seed --class=PostSeeder
```

`seed()` is the testing kit's planned helper (coming in 0.2; names may change). Today, seed the test database before the run: add `execFileSync(process.execPath, ['strut', 'db:seed'], { stdio: 'inherit', env: process.env })` to `tests/global-setup.ts`, after `migrate:fresh`. A seeder is a `defineSeeder({ run({ db, env, tenantId, faker, call }) { … } })` file in `database/seeders/`; see [Seeding](../seeding/). Prefer factories for data a test depends on: a test that says `PostFactory.create({ title: 'X' })` explains itself; a test that relies on "the third seeded post" doesn't.

## Checking what's stored

### With the ORM (works today)

```ts
const count = await Post.query().where('status', 'published').count()
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
  const post = await PostFactory.create({ title: 'Hello world' })
  await post.delete()

  const visible = await Post.query().where('slug', 'hello-world').first()
  const trashed = await Post.withTrashed().where('slug', 'hello-world').first()
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

The error code is `tenant_required`. Set the team for a block of code with the ORM's `runWithTenant()`:

```ts
import { runWithTenant } from '@strutvane/framework/database'

await runWithTenant(acmeId, () => Project.create({ name: 'Secret launch' }))
const seenByGlobex = await runWithTenant(globexId, () => Project.query().count())
expect(seenByGlobex).toBe(0)   // globex sees none of acme's projects
```

(Tenancy in the ORM is off until `config/tenancy.ts` turns it on; see [ORM Tenancy](../orm-tenancy/).)

The testing kit's planned `asTenant(team)` does the same for HTTP test clients.

On PostgreSQL the database's row-level security checks this again underneath, so even a raw query can't cross teams. Test it on PostgreSQL if that's your production engine. See [Tenancy](../orm-tenancy/).

## Transactions in your own code

When your code uses `transaction()`, it works the same inside the test's own transaction: Strutvane uses **savepoints** for nested transactions, so your code's rollback undoes only its own part. Parallel savepoints on one connection are refused (a real bug the ORM prototype found), so don't `Promise.all` two transactions inside a test.

## Platform and Docker differences

- **With Docker:** MySQL or PostgreSQL run in the `db` container; create the test database there once. `npm test` runs inside the `app` container.
- **Without Docker, SQLite:** nothing to set up; `migrate:fresh` creates `database/testing.sqlite`.
- **Without Docker, a server database:** create the test database once and give your user rights on it, then name it in `vitest.config.ts`.
- **Windows:** SQLite test files can stay locked by an open database tool. Close it if `migrate:fresh` fails with `EBUSY`.

## Common mistakes

### "no such table: posts"

```text
SqliteError: no such table: posts
```

**Why:** the test database wasn't rebuilt (no `migrate:fresh` in `tests/global-setup.ts`), or the tests point at another file than the one that was migrated.
**Fix:** run `node strut migrate:fresh` with the same `DB_*` settings as the tests, as in [the smallest example](#the-smallest-example).

### Tests pass locally on SQLite but fail in CI on MySQL

**Why:** the engines differ: MySQL compares strings and numbers loosely, sorts `NULL` differently, and its collation decides case sensitivity.
**Fix:** run tests locally on the same engine as CI and production.

### A test sees rows from another test

**Why:** the database is shared by every test in the run, and nothing cleans it between tests.
**Fix:** give each test its own rows (filter by what it created), or delete what it wrote in `afterEach`. The planned per-test transaction does this for you.

### Ten posts created ten users

**Why:** each post needed an author and the factory made one per row.
**Fix:** `PostFactory.count(10).recycle(author).create()`.

### "No database connection is set yet"

**Why:** the ORM has no connection in this test worker: `tests/setup-database.ts` isn't listed in `setupFiles`, or it didn't run.
**Fix:** connect it as in [the smallest example](#the-smallest-example). See also [ORM: Getting Started](../orm/#no-database-connection-is-set-yet).

## Next steps

- [HTTP Tests](../http-tests/): request helpers and assertions.
- [Factories](../orm-factories/): every factory feature.
- [Seeding](../seeding/): seeders and `db:seed`.
- [Mocking](../mocking/): fakes for mail, HTTP and time.
