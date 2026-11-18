---
title: "Factories"
description: "Make realistic fake records for tests and seeders with defineFactory: counts, states, sequences, parents, children, recycled parents and reproducible fake data."
---

A **factory** is a recipe for one fake record. Instead of typing out a post with a title, a body and an author every time a test or a seeder needs one, you describe a typical post once, and then ask for "ten of those" or "three published ones by this user".

Use factories in two places: **tests**, where every test needs its own small set of data, and **seeders**, where you fill a development database with enough realistic rows that the screens look real (see [Seeding](../seeding/)).

:::tip[Coming from Laravel?]
The API is Laravel's, in TypeScript. A factory is a value, not a class, and you import it instead of calling `Post::factory()`: `Post::factory()->count(10)->for($user, 'author')->create()` becomes `PostFactory.count(10).for(user, 'author_id').create()`. `state()`, `has()`, `recycle()` and `sequence` keep their meaning. Two differences: `for()` and `has()` take the **foreign-key column** (`author_id`), not the relationship name, and factories write through `forceCreate()` (trusted code), so `fillable` doesn't apply.
:::

## The smallest example

Ask for a factory when you create a table:

```bash
node strut make:migration create_posts_table --factory
```

**What you'll see** (something like this):

```text
  Created database/migrations/2026_11_14_093000_create_posts_table.ts
  Created app/models/post.ts
  Created database/factories/post.factory.ts
```

`--factory` adds only the factory. `--seeder` adds the seeder **and** its factory, and registers the seeder in `database/seeders/database.seeder.ts` (see [Seeding](../seeding/)). Existing files are never overwritten, so running the command again never loses your work.

The new factory looks like this:

```ts title="database/factories/post.factory.ts"
import { defineFactory } from '@strutvane/framework/database'
import { Post } from '../../app/models/post.ts'

/** Fake `posts` rows for seeders and tests. Fill in the columns your migration adds. */
export default defineFactory(Post, ({ faker, sequence }) => ({
  // title: `${faker.sentence()} #${sequence}`,
}))
```

Fill in the columns:

```ts title="database/factories/post.factory.ts"
import { defineFactory } from '@strutvane/framework/database'
import { Post } from '../../app/models/post.ts'
import UserFactory from './user.factory.ts'

export default defineFactory(Post, ({ faker, sequence }) => ({
  title: `${faker.sentence()} #${sequence}`,
  body: faker.paragraph(),
  status: faker.pick(['draft', 'published']),
  author_id: UserFactory, // a new user per post, unless you recycle some (below)
}))
```

Then use it in a seeder (or a test):

```ts title="database/seeders/post.seeder.ts"
import { defineSeeder } from '@strutvane/framework/database'
import PostFactory from '../factories/post.factory.ts'

export default defineSeeder({
  async run() {
    await PostFactory.count(10).create()
  },
})
```

**What you'll see** after `node strut db:seed`:

```ts
console.log(await Post.query().count()) // → 10
```

## Writing the definition

The function you pass to `defineFactory()` returns one row's columns. It receives:

| Name | What it is |
|---|---|
| `faker` | a fake-data generator (below) |
| `sequence` | `1` for the first row this factory builds in one `create()` call, then `2`, `3`… Use it for values that must be unique |

- The keys are typed by the table's columns (from your migrations), so a typo or a wrong value type doesn't compile.
- A foreign-key column may hold **another factory** (`author_id: UserFactory`): a parent is created for each row, unless `recycle()` hands it existing ones.
- Columns you leave out are left out of the INSERT, so the database default applies (or the row is refused when the column is required).
- Values go through the same [casts](../orm-casts/), [slug generation](../orm-slugs/), timestamps and [tenant scope](../orm-tenancy/) as any other write.

### The fake-data generator

`faker` is small and dependency-free. Every value comes from one seeded random generator:

| Method | Example result |
|---|---|
| `faker.number({ min, max })` | `417` (defaults 0 and 1000) |
| `faker.decimal({ min, max, scale })` | `'129.40'` (a string, like decimal columns) |
| `faker.boolean()` | `true` |
| `faker.pick(['draft', 'published'])` | `'draft'` |
| `faker.word()`, `faker.words(3)` | `'amber'`, `'anchor beacon cedar'` (3 words by default) |
| `faker.sentence()` | a capitalised sentence of 4–10 words, with a full stop |
| `faker.paragraph()` | 2–5 sentences |
| `faker.firstName()`, `faker.lastName()`, `faker.name()` | `'Ada'`, `'Baker'`, `'Ada Baker'` |
| `faker.email()` | `'ada.baker1.417@example.com'`: on the reserved `example.com` domain, never a real mailbox |
| `faker.uuid()` | a UUIDv7 |
| `faker.date({ days })` | `'2026-08-02'`, within the last `days` days (default 365) |
| `faker.pastDate({ days })` | a `Date` within the last `days` days |

The exact words are random (the examples show the kind of value). To get the same data every time, see [Reproducible data](#reproducible-data).

## Making records

| You want | Write | You get |
|---|---|---|
| One saved post | `await PostFactory.create()` | `Post` |
| One, with some values fixed | `await PostFactory.create({ status: 'published' })` | `Post` |
| Ten saved posts | `await PostFactory.count(10).create()` | `Post[]` |
| The values, without saving | `PostFactory.raw()` | an array of attribute objects |

`count(n)` takes a whole number from 1 to 100,000. Without it, `create()` returns one model; with it, an array. `raw()` builds the attributes the next rows would get, without touching the database (foreign keys that are factories come back as `undefined`).

Factories never change: every method returns a **new** factory, so a shared base is safe to reuse.

### States

A **state** overrides some values of the definition, like "published" or "featured". Chain several; later ones win:

```ts
await PostFactory.state({ status: 'published' }).count(3).create()

// a state can also be a function of the row being built
await PostFactory.state((attributes, { sequence }) => ({ title: `${String(attributes['title'])} (${sequence})` })).create()
```

## Records that belong to another one: `for()`

`for(parent, foreignKey)` sets the foreign key of every row to an existing parent, instead of creating a new one:

```ts
const ada = await UserFactory.create({ name: 'Ada' })
const posts = await PostFactory.count(5).for(ada, 'author_id').create()
console.log(posts.every((post) => post.author_id === ada.id)) // → true
```

Without the second argument, the column is guessed from the parent's table: `users` → `user_id`. Pass the real column whenever it's named differently (here `author_id`).

## Records with children: `has()`

`has(childFactory, foreignKey)` creates children after each record:

```ts
const user = await UserFactory.has(PostFactory.count(3), 'author_id').create()
console.log(await user.posts().count()) // → 3
```

Each user gets `count` children (one when the child factory has no `count()`). Without the second argument, the children's column is guessed from this table: `users` → `user_id`.

`has()` fills a foreign key on the children. Linking many-to-many rows through a pivot table isn't part of it: create the records, then use `attach()` (see [Relationships](../orm-relationships/)).

## Sharing parents: `recycle()`

With `author_id: UserFactory` in the definition, `PostFactory.count(50).create()` creates **50 different authors**, one per post, which makes demo data look odd. `recycle()` hands the factory existing records to reuse whenever it needs a parent of their type:

```ts
const authors = await UserFactory.count(3).create()
await PostFactory.count(50).recycle(authors).create()
// 50 posts, spread over the same 3 authors
```

`recycle()` takes one model or a list, and picks one of them at random for each row.

## Reproducible data

`seed(n)` makes the fake values the same on every run and every machine:

```ts
const a = PostFactory.seed(42).raw()
const b = PostFactory.seed(42).raw()
console.log(JSON.stringify(a) === JSON.stringify(b)) // → true
```

Without `seed()`, every run starts from a random seed. Three things stay different between runs even with a seed: `faker.uuid()` (a UUIDv7 holds the current time), `faker.date()` and `faker.pastDate()` (counted back from now), and which recycled parent a row gets.

## Tenant tables

On a tenant table, a factory writes inside the active tenant, like every other write, and stamps the tenant column for you:

```ts
await runWithTenant(teamId, () => ProjectFactory.count(5).create())
```

`node strut db:seed --tenant <id>` runs every seeder inside that tenant.

## In tests

```ts title="tests/feature/published-posts.test.ts (excerpt)"
import PostFactory from '../../database/factories/post.factory.ts'
import UserFactory from '../../database/factories/user.factory.ts'

const ada = await UserFactory.create()
await PostFactory.count(3).for(ada, 'author_id').state({ status: 'published' }).create()
await PostFactory.count(2).for(ada, 'author_id').state({ status: 'draft' }).create()

expect(await ada.posts().where('status', 'published').count()).toBe(3)
```

See [Database Testing](../database-testing/) for a fresh database per test.

:::note[Two factory APIs]
`@strutvane/framework/testing` also exports a `defineFactory`: that one belongs to 0.1-style apps (`defineModel` models, `fake` and `related()`). For migration-first apps, import `defineFactory` from `@strutvane/framework/database`, as on this page. Likewise, `node strut make:factory` reads 0.1-style model files; use `node strut make:migration … --factory` instead.
:::

:::caution[Coming in 0.2]
Designed but not built yet: building models without saving them (Laravel's `make()`), filling left-out columns with a fake value from their type, and `has()` for many-to-many relationships.
:::

## Common mistakes

### A database error about a missing `author_id`

**Why:** the definition doesn't set a required column that links to another table, so the database refuses the row.

**Fix:** give the definition a parent factory (`author_id: UserFactory`), or set it when you call the factory: `PostFactory.for(user, 'author_id').create()`.

### `for()` guessed the wrong column

```text
MassAssignmentError: "posts" has no column "user_id". Did you mean "author_id"? Columns come from your migrations: add one with a new migration, then run `node strut migrate`.
```

**Why:** `for(user)` guesses `user_id` from the parent's table.

**Fix:** pass the column: `for(user, 'author_id')`. The same applies to `has()`.

### A count out of range

```text
OrmUsageError: count() needs a whole number from 1 to 100000; got 0.
```

**Fix:** pass a whole number from 1 to 100,000. To create nothing, don't call the factory.

### No active tenant

```text
TenantRequiredError: "projects" is tenant-scoped, but no tenant is active. Wrap the work in runWithTenant(tenantId, () => …) (the HTTP layer does this for you per request). Deliberate cross-tenant jobs use .unsafeWithoutTenancy(reason), which is audited.
```

**Fix:** wrap the call in `runWithTenant(teamId, …)`, or seed with `node strut db:seed --tenant <id>`.

### Unique values clash

**What you'll see:** a duplicate-key error from the database (the exact wording depends on MySQL, MariaDB, PostgreSQL or SQLite), or a `CastError` saying a value "is longer than" its column allows.

**Why:** a fixed value in the definition (or a fake value from a small set) repeats across rows, or a fake value is longer than its column.

**Fix:** build unique values from `sequence`, and keep fake text within the column's length:

```ts
export default defineFactory(Tag, ({ sequence }) => ({ name: `tag-${sequence}` }))
```

### "Can't tell which table … is about"

```text
Can't tell which table "backfill_slugs" is about, so no seeder or factory was written. Name it create_<table>_table or add_<column>_to_<table>_table.
```

**Fix:** use a `create_…_table` or `add_…_to_…_table` name, or run `make:migration` again without `--seeder`/`--factory`.

## Next steps

- [Seeding](../seeding/): run factories from seeders.
- [Database Testing](../database-testing/): fresh data for every test.
- [Mass Assignment](../orm-mass-assignment/): why factories use `forceCreate()`.
