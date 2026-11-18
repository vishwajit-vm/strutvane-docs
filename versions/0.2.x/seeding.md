---
title: Seeding
description: Fill your database with starting data (roles, lists of countries) and with realistic fake data while you build. Create seeders, order them, run one on its own, seed a team's tables, and know exactly when Strutvane runs them for you.
---

**Seeding** means putting data into your database with code instead of by hand: the roles your app needs, a list of countries, or a few hundred fake posts so the screens look real while you build. A **seeder** is a small file with a `run()` function that creates those rows. Seeders live in `database/seeders/`, one file per table, named like `post.seeder.ts`.

:::tip[Coming from Laravel?]
Same idea, same commands: `php artisan db:seed` becomes `node strut db:seed`, `--class=PostSeeder` runs one seeder, `--force` seeds in production, and `migrate:fresh --seed` works the same. The differences:

- a seeder is `defineSeeder({ run })` instead of a class, and it's named after its file (`post.seeder.ts` is `PostSeeder`);
- `database.seeder.ts` is kept up to date for you: `make:migration … --seeder` adds every new seeder to its `call([...])` list;
- the whole `db:seed` run is **one transaction**: if a seeder fails, nothing from the run stays behind;
- `--tenant <id>` seeds inside one team, for apps with [multi-tenancy](../tenancy/).
:::

## The commands at a glance

| You want to | Run | Status |
|---|---|---|
| Create a table with a seeder and a factory | `node strut make:migration create_posts_table --seeder` | Available |
| Create a seeder for an existing table | `node strut make:seeder PostSeeder` | Coming in 0.2 for migration-first apps (see [below](#creating-a-seeder-for-an-existing-table)) |
| Run every seeder | `node strut db:seed` | Available |
| Run one seeder | `node strut db:seed --class=PostSeeder` | Available |
| Seed inside one team | `node strut db:seed --tenant=<team id>` | Available |
| Seed in production, on purpose | `node strut db:seed --force` | Available |
| Migrate, then run the seeders | `node strut migrate --seed` | Available |
| Start over: drop everything, migrate, seed | `node strut migrate:fresh --seed` | Available |

"Available" means the command is in `@strutvane/framework` 0.2.0-next.0 (the framework's `main` branch).

## The smallest seeder, step by step

1. **Ask for a seeder when you create the table:**

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

   `--seeder` also creates the [factory](../orm-factories/), because the seeder uses it, and adds the seeder to `database/seeders/database.seeder.ts`.

2. **Open the seeder.** It creates ten posts with the factory:

   ```ts title="database/seeders/post.seeder.ts"
   import { defineSeeder } from '@strutvane/framework/database'
   import PostFactory from '../factories/post.factory.ts'

   /** Seeds the `posts` table. */
   export default defineSeeder({
     async run() {
       await PostFactory.count(10).create()
     },
   })
   ```

3. **Fill in the factory**, which starts empty, with your columns:

   ```ts title="database/factories/post.factory.ts"
   import { defineFactory } from '@strutvane/framework/database'
   import { Post } from '../../app/models/post.ts'
   import UserFactory from './user.factory.ts'

   /** Fake `posts` rows for seeders and tests. Fill in the columns your migration adds. */
   export default defineFactory(Post, ({ faker, sequence }) => ({
     title: `${faker.sentence()} #${sequence}`,
     body: faker.paragraph(),
     status: faker.pick(['draft', 'published']),
     author_id: UserFactory, // a new user for each post, unless you recycle some (see below)
   }))
   ```

4. **Run your migrations, then the seeders:**

   ```bash
   node strut migrate --seed
   ```

   **What you'll see:**

   ```text
   Database: mysql://root@127.0.0.1:3306/my_app
   ✔ Migrated 2026_11_15_093000_create_posts_table (batch 2)
   Updated .strutvane/types/models.d.ts
   ✔ Seeded DatabaseSeeder
   ✔ Seeded UserSeeder
   ✔ Seeded PostSeeder
   ```

Factories write through `forceCreate()`, which is for **trusted code** like seeders: it may set any real column, including ones that aren't in the model's `fillable` list (like `author_id`), but never Strutvane's own columns such as `id` or `created_at`. Forms and the API use `create()`, which only accepts `fillable` columns. See [Mass Assignment](../orm-mass-assignment/).

## What `run()` receives

`run()` gets one object. You can ignore it, as above, and use your models and factories directly.

| Name | What it is |
|---|---|
| `env` | The value of `APP_ENV` (`'local'`, `'testing'`, `'staging'`, `'production'`), or `undefined` |
| `tenantId` | The team this run seeds (`--tenant`), or `undefined` |
| `faker` | A fake-data generator, the same one factories get (`faker.name()`, `faker.email()`, `faker.sentence()`, `faker.pick([...])`, …) |
| `db` | The database connection, for the rare [raw SQL](../database/#running-your-own-sql) a seeder needs |
| `call` | Runs other seeders, in order: `await call([UserSeeder, PostSeeder])` |

```ts title="database/seeders/demo.seeder.ts"
import { defineSeeder } from '@strutvane/framework/database'
import PostFactory from '../factories/post.factory.ts'

/** Lots of demo posts, but only on developers' machines. */
export default defineSeeder({
  async run({ env }) {
    if (env !== 'local') return
    await PostFactory.count(200).create()
  },
})
```

**What you'll see:** with `APP_ENV=local`, 200 posts; anywhere else, nothing (the line `✔ Seeded DemoSeeder` still appears, because the seeder ran).

## Creating a seeder for an existing table

For a table that already exists, or a seeder that isn't about one table (for example "demo data"), create the file yourself in `database/seeders/`. The file name ends in `.seeder.ts`, and the seeder's name comes from it: `demo.seeder.ts` is `DemoSeeder`, `blog-post.seeder.ts` is `BlogPostSeeder`.

```ts title="database/seeders/category.seeder.ts"
import { defineSeeder } from '@strutvane/framework/database'
import { Category } from '../../app/models/category.ts'

export default defineSeeder({
  async run() {
    for (const name of ['News', 'Guides', 'Releases']) {
      await Category.forceCreate({ name })
    }
  },
})
```

Then add it to the list in `database.seeder.ts` (next section), or run it on its own with `node strut db:seed --class=CategorySeeder`.

:::caution[Coming in 0.2]
`node strut make:seeder` exists, but on framework `main` it still writes the 0.1 seeder shape (`defineSeeder('PostSeeder', async ({ create, scope }) => …)`), which a migration-first app's `db:seed` can't run: it doesn't pass `create` or `scope`. A `make:seeder` that writes the shape above and registers it in `database.seeder.ts` arrives with 0.2. Until then, write the file by hand or use `make:migration … --seeder`.
:::

## The order seeders run in

`database/seeders/database.seeder.ts` is the **main seeder**: the one `db:seed` runs. It calls every other seeder, in order:

```ts title="database/seeders/database.seeder.ts"
import { defineSeeder } from '@strutvane/framework/database'
import RoleSeeder from './role.seeder.ts'
import CategorySeeder from './category.seeder.ts'
import UserSeeder from './user.seeder.ts'
import PostSeeder from './post.seeder.ts'

/**
 * Seeds the database (`node strut db:seed`). `node strut make:migration … --seeder` adds each
 * new seeder to the list between the markers, after the seeders of the tables it depends on.
 * Everything outside the markers is yours.
 */
export default defineSeeder({
  async run({ call }) {
    // strut:seeders:start
    await call([RoleSeeder, CategorySeeder, UserSeeder, PostSeeder])
    // strut:seeders:end
  },
})
```

`call([...])` runs the seeders you pass, one after another. The list between `// strut:seeders:start` and `// strut:seeders:end` is **maintained by the CLI**: `make:migration … --seeder` **appends** each new seeder there, with its import. Because you create a table after the tables it points at, appending keeps parents before children. If you reorder by hand, keep that rule: a post's seeder must come after its author's. Leave the markers in place. You may add your own code **outside** them, for example a seeder you only want on your machine:

```ts title="database/seeders/database.seeder.ts (excerpt)"
  async run({ call, env }) {
    // strut:seeders:start
    await call([RoleSeeder, CategorySeeder, UserSeeder, PostSeeder])
    // strut:seeders:end
    if (env === 'local') await call(DemoSeeder)
  },
```

**What you'll see** for `node strut db:seed`:

```text
✔ Seeded DatabaseSeeder
✔ Seeded RoleSeeder
✔ Seeded CategorySeeder
✔ Seeded UserSeeder
✔ Seeded PostSeeder
```

**Each seeder runs at most once per run**, however often it's called, so a seeder that calls `UserSeeder` itself doesn't create the users twice.

:::note[`after`]
`defineSeeder({ after: ['users'], run })` lets a seeder say which tables' seeders it needs first. On framework `main` it's checked (table names only) and kept with the seeder, but nothing reorders the list from it yet: the `call([...])` order is what runs.
:::

## When seeders run

Seeders run only when you ask:

| You run | What happens |
|---|---|
| `node strut db:seed` | `DatabaseSeeder`, and every seeder it calls |
| `node strut db:seed --class=PostSeeder` | Only `PostSeeder` (and any seeder it calls itself) |
| `node strut migrate --seed` | The migrations, then `DatabaseSeeder` |
| `node strut migrate:fresh --seed` / `migrate:refresh --seed` | Start over (deletes all data), then `DatabaseSeeder` |
| `node strut migrate` | Never seeds |

Seeders don't remember that they ran, so running them twice creates the rows twice. Make seeders that must be safe to repeat check first (see the advanced example below), or start over with `migrate:fresh --seed` on your own machine.

```bash
node strut db:seed                 # run DatabaseSeeder
node strut migrate --seed          # migrate, then seed
node strut migrate:fresh --seed    # start over: drop everything, migrate, seed (deletes all data)
```

**All or nothing.** The whole run is one transaction: if a seeder throws, every row created during that run is undone, and the error is printed. Fix the seeder and run it again.

### Running one seeder: `--class`

While you work on one seeder, run only that one:

```bash
node strut db:seed --class=PostSeeder
```

It runs `post.seeder.ts` (any seeder in `database/seeders/`, called or not) and nothing else. The seeders before it in the list aren't run for you, so the rows it needs must already exist.

### Seeding in production: `--force`

Production data that every installation needs (a list of countries, your plans) can come from a seeder, run on purpose:

```bash
node strut db:seed --class=CountrySeeder --force
```

With `APP_ENV=production`, `db:seed` (and `migrate --seed`) refuses without `--force`:

```text
error Validation failed.
  - --force: APP_ENV is production. Run node strut db:seed --force to change the production database.
```

Write production seeders so they're safe to run twice (see the advanced example below).

### With Docker or without

The commands are the same. Without Docker, `db:seed` runs on your computer against the database in `.env` (XAMPP, MAMP, Laragon, your own install; see [Database: Getting Started](../database/)). With the database in a container, it runs on your computer too, pointed at the container's port; running it **inside** the app container for you is coming in 0.2. On Windows, macOS and Linux the commands are identical.

## Three seeders, from small to advanced

**Small: fixed starting data.** A list your app needs to work, the same everywhere. (This is the `category.seeder.ts` from [above](#creating-a-seeder-for-an-existing-table).)

**What you'll see:** three rows in `categories`, with ids, slugs (if the table has one) and timestamps filled in.

**Typical: data that depends on other rows.** Look the parent up instead of guessing its id, and make sure its seeder comes first in the list.

```ts title="database/seeders/welcome-post.seeder.ts"
import { defineSeeder } from '@strutvane/framework/database'
import { Post } from '../../app/models/post.ts'
import { User } from '../../app/models/user.ts'

export default defineSeeder({
  async run() {
    const author = await User.query().where('email', 'admin@my-app.test').firstOrFail()
    await Post.forceCreate({ title: 'Welcome', body: 'Hello from the seeder.', status: 'published', author_id: author.id })
  },
})
```

**What you'll see:** one post by the admin. If the admin doesn't exist, `firstOrFail()` stops the run with `No row in "users" matching your query.`, and nothing from the run is kept.

**Advanced: safe to run twice.** Production seeders (run with `--force`) should never create duplicates:

```ts title="database/seeders/role.seeder.ts"
import { defineSeeder } from '@strutvane/framework/database'
import { Role } from '../../app/models/role.ts'

export default defineSeeder({
  async run() {
    for (const name of ['admin', 'member', 'viewer']) {
      const exists = await Role.query().where('name', name).exists()
      if (!exists) await Role.forceCreate({ name })
    }
  },
})
```

**What you'll see:** the first run creates three roles; a second run changes nothing. You don't need your own [transaction](../orm-transactions/) here: the run already is one.

## Seeding tables that belong to a team

If your app has teams (see [Multi-tenancy](../tenancy/)), a team's tables can only be written **inside** that team. The simplest way is to seed one team at a time:

```bash
node strut db:seed --tenant=0190a000-0000-7000-8000-0000000000aa
```

The whole run then happens inside that team: every row a seeder or factory creates gets its `tenant_id`, and on PostgreSQL row-level security applies too. The id must be a UUID; anything else is refused before anything runs:

```text
error Validation failed.
  - --tenant: --tenant must be a tenant id (a UUID such as 0190a000-0000-7000-8000-0000000000aa).
```

To seed **every** team in one run, wrap each team's work in `runWithTenant`:

```ts title="database/seeders/project.seeder.ts"
import { defineSeeder, runWithTenant } from '@strutvane/framework/database'
import { Project } from '../../app/models/project.ts'
import { Team } from '../../app/models/team.ts'

export default defineSeeder({
  async run() {
    for (const team of await Team.all()) {
      await runWithTenant(team.id, async () => {
        await Project.forceCreate({ name: 'Getting started' })
      })
    }
  },
})
```

**What you'll see:** one "Getting started" project per team, each with its team's `tenant_id` filled in for you. Without `--tenant` or `runWithTenant`, the ORM stops with `tenant_required` instead of guessing a team.

## Fake data with factories

A **factory** is a recipe for one realistic fake record. `--seeder` creates one next to your seeder (step 3 above). Use it from a seeder:

```ts title="database/seeders/post.seeder.ts (with factories)"
import { defineSeeder } from '@strutvane/framework/database'
import { User } from '../../app/models/user.ts'
import PostFactory from '../factories/post.factory.ts'

export default defineSeeder({
  async run() {
    const users = await User.all()
    await PostFactory.count(10).create()                                // 10 saved posts
    await PostFactory.count(3).state({ status: 'published' }).create()  // a state: override some values
    await PostFactory.count(5).for(users[0], 'author_id').create()      // 5 posts by one user
    await PostFactory.count(20).recycle(users).create()                 // reuse existing users as authors
  },
})
```

- A **state** overrides some values (`{ status: 'published' }`).
- A **sequence** is the counter your definition receives (1, 2, 3…), so every record can differ.
- `for(parent, 'author_id')` attaches the records to an existing parent; `has(PostFactory.count(3), 'author_id')` on the user factory creates children for each record.
- `recycle()` picks parents from a list you pass, instead of creating a new user for every post (a common reason demo databases fill up with thousands of users).
- `seed(42)` makes the fake values the same on every run.

Factories write through `forceCreate()` (trusted code) and run inside the active team on tenant tables. Every option is on [Factories](../orm-factories/).

## The first admin user

New apps will come with a seeder that creates your roles and the first admin user, run by the installer:

- The admin's **email** is in `.env` as `SEED_ADMIN_EMAIL` (by default `admin@<your-app>.test`).
- The admin's **password is never written to any file**: not to `.env`, not to `.env.example`, not to `strutvane.json`. The installer either generates one and shows it **once** in the terminal, or lets you type one (masked, at least 12 characters). It reaches the seeder only through an environment variable for that one run, and the account is marked "must change password at first sign-in".
- In CI, or when you missed the one-time password, you'll set a new one with `node strut user:password admin@my-app.test`.
- The admin seeder refuses to run when `APP_ENV` is `production` or `staging`, so it can never create a known account on a live server.

:::caution[Coming in 0.2]
The admin seeder, the one-time password, `node strut user:password` and `node strut user:create` belong to the installer and `@strutvane/auth`; they're proven in the installer prototype (spike 13) but aren't in the framework's `db:seed`.
:::

## Common mistakes

Errors thrown by a seeder are printed as `error Unexpected error: <message>`; the run is rolled back, and the command exits with code **1**.

### mass_assignment in a seeder

```text
error Unexpected error: "author_id" can't be mass-assigned on "posts". If users may set it, add it to `fillable` in Model('posts', { fillable: [...] }). If your own code sets it, assign it directly (model.author_id = value) or use forceCreate().
```

**Why:** `create()` only accepts `fillable` columns, even in a seeder.
**Fix:** seeders are trusted code, so use `forceCreate()` (factories already do):

```ts
await Post.forceCreate({ title: 'Hello', author_id: author.id })
```

### "Can't tell which table … is about, so no seeder or factory was written"

```text
error Can't tell which table "backfill_slugs" is about, so no seeder or factory was written. Name it create_<table>_table or add_<column>_to_<table>_table.
```

**Why:** `--seeder` needs to know the table, and only names like `create_posts_table` say which.
**Fix:** use a `create_…_table` or `add_…_to_…_table` name, or drop `--seeder` and write the seeder by hand (see [Creating a seeder for an existing table](#creating-a-seeder-for-an-existing-table)).

### "No seeder named … in database/seeders"

```text
error Validation failed.
  - --class: No seeder named PostsSeeder in database/seeders. Seeders there: DatabaseSeeder, PostSeeder, UserSeeder.
```

**Why:** the name comes from the file (`post.seeder.ts` is `PostSeeder`, singular), and only files ending in `.seeder.ts` directly in `database/seeders/` count.
**Fix:** use one of the names the message lists. Without `--class`, `db:seed` needs `database/seeders/database.seeder.ts`; if it's missing, the message says so.

### "must default-export defineSeeder"

```text
error Unexpected error: database/seeders/post.seeder.ts must default-export defineSeeder({ async run() { … } })
```

**Why:** every `*.seeder.ts` file is loaded, and each must end with `export default defineSeeder({ … })`.
**Fix:** export the seeder as the file's default export; move helpers into a file whose name doesn't end in `.seeder.ts`.

### "No row in "users" matching your query" from a seeder

```text
error Unexpected error: No row in "users" matching your query. It may not exist, may be soft-deleted, or may belong to another tenant.
```

**Why:** the seeder ran before the seeder of the table it depends on, so the parent row isn't there yet.
**Fix:** put the parent's seeder earlier in the `call([...])` list in `database.seeder.ts`.

### My seeder created the same rows twice

**Why:** seeders don't remember that they ran; each `db:seed` or `--seed` runs them again.
**Fix:** make it safe to run twice (see the advanced example), or start over on your machine with `node strut migrate:fresh --seed`.

### My new seeder never ran

**Why:** it isn't in the `call([...])` list of `database.seeder.ts` (only `make:migration … --seeder` adds seeders there), or its file isn't `database/seeders/<name>.seeder.ts`.
**Fix:** add it to the list, or run it on its own with `node strut db:seed --class=PostSeeder`.

### tenant_required in a seeder

```text
error Unexpected error: "projects" is tenant-scoped, but no tenant is active. Wrap the work in runWithTenant(tenantId, () => …) (the HTTP layer does this for you per request). Deliberate cross-tenant jobs use .unsafeWithoutTenancy(reason), which is audited.
```

**Why:** a seeder runs outside any request, so no team is active.
**Fix:** run `node strut db:seed --tenant=<team id>`, or wrap the writes in `runWithTenant(team.id, …)`, as in [Seeding tables that belong to a team](#seeding-tables-that-belong-to-a-team).

## Next steps

- [Factories](../orm-factories/): states, sequences, relations and `recycle()`.
- [Mass Assignment](../orm-mass-assignment/): `create()` versus `forceCreate()`.
- [Migrations](../migrations/): `migrate --seed`, `migrate:fresh --seed` and the other commands.
- [Database Testing](../database-testing/): use seeders and factories to set up each test.
