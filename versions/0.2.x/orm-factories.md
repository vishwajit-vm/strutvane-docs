---
title: "Factories"
description: "Make realistic fake records for tests and seeders: what the generated factory file gives you today, and the full factory API (counts, states, sequences, relations, recycle) arriving in 0.2."
---

A **factory** is a recipe for one fake record. Instead of typing out a post with a title, a body and an author every time a test or a seeder needs one, you describe a typical post once, and then ask for "ten of those" or "three published ones by this user".

Use factories in two places: **tests**, where every test needs its own small set of data, and **seeders**, where you fill a development database with enough realistic rows that the screens look real (see [Seeding](../seeding/)).

:::tip[Coming from Laravel?]
The API is Laravel's, in TypeScript (decided 2026-11-15): `Post::factory()->count(10)->for($user, 'author')->create()` becomes `Post.factory().count(10).for(user, 'author').create()`, `state([...])` becomes `state({ ... })`, `has()` and `recycle()` keep their names, and the definition is a function instead of a class. Factories write through `forceCreate()` (trusted code), and on tenant tables they run inside the active tenant. In 0.2, `--seeder` and `--factory` write a `defineFactory` file; today the prototype writes a plain starter function, shown first below.
:::

## What you get today

Ask for a factory when you create a table:

```bash
node strut make:migration create_posts_table --factory
```

**What you'll see:**

```text
  Created database/migrations/2026_11_14_093000_create_posts_table.ts
  Created app/models/post.ts
  Created database/factories/post.factory.ts

  Next: add your columns to the migration, then run `node strut migrate`.
```

`--factory` on its own creates only the factory. `--seeder` creates the seeder **and** its factory, because a seeder usually uses the factory (see [Seeding](../seeding/)).

:::caution[Coming in 0.2]
In the prototype, `--seeder` writes only the seeder; you add `--factory` to get both. The decided behaviour above ships with 0.2.
:::

The new file is a small, plain function. This is its exact content:

```ts title="database/factories/post.factory.ts"
/**
 * Fake `posts` rows for tests and seeders. `sequence` makes each row unique.
 */
export function postDefinition(sequence: number): Record<string, unknown> {
  // Return one row's columns, for example: return { title: `Post ${sequence}` }
  void sequence
  return {}
}
```

The function name follows the model: `post.factory.ts` exports `postDefinition`, and a `blog_posts` table gets `blog-post.factory.ts`. The file is only written when it doesn't exist yet, so running the command again never overwrites your work.

### Using it, step by step

1. Fill in the definition. `sequence` is a counter you pass in (1, 2, 3…), so every row can be different:

   ```ts title="database/factories/post.factory.ts"
   /** One fake post's columns (the author is added by the caller). */
   export interface PostDefinition {
     title: string
     body: string
     status: 'draft' | 'published'
   }

   /** Fake `posts` rows for tests and seeders. `sequence` makes each row unique. */
   export function postDefinition(sequence: number): PostDefinition {
     return {
       title: `Post ${sequence}`,
       body: `The body of post ${sequence}.`,
       status: sequence % 2 === 0 ? 'published' : 'draft',
     }
   }
   ```

   Replacing the generated `Record<string, unknown>` return type with a precise one lets TypeScript check the values against the `posts` columns when you save them in step 2.

2. Call it in a loop, adding the columns that link to other rows, and save with `forceCreate()`:

   ```ts title="database/seeders/post.seeder.ts"
   import { defineSeeder } from '@strutvane/framework'
   import { Post } from '../../app/models/post.ts'
   import { User } from '../../app/models/user.ts'
   import { postDefinition } from '../factories/post.factory.ts'

   export default defineSeeder({
     after: ['users'],
     async run() {
       const author = await User.query().orderBy('id').firstOrFail()
       for (let sequence = 1; sequence <= 10; sequence += 1) {
         await Post.forceCreate({ ...postDefinition(sequence), author_id: author.id })
       }
     },
   })
   ```

3. Run it with `node strut db:seed` (or let `node strut migrate` run new seeders in development; see [Seeding](../seeding/)).

**What you'll see** afterwards, if you query the table:

```ts
console.log(await Post.query().count())                        // → 10
console.log((await Post.query().orderBy('id').first())?.title) // → Post 1
```

`forceCreate()` is right here because a factory is your own trusted code: it may set `author_id`, which users may not. Never feed request data into it (see [Mass Assignment](../orm-mass-assignment/)).

## The factory API (coming in 0.2)

:::caution[Coming in 0.2]
Everything from here on is **decided but not built yet**: `defineFactory(Post, ({ faker, sequence }) => ({ … }))` with `.state()`, `.for()`, `.has()` and `.recycle()` is the shape for 0.2 (decided 2026-11-15), and 0.2's `make:migration --seeder`/`--factory` writes this file instead of the starter function. Until then, use the plain definition function above.
:::

### Defining a factory

```ts title="database/factories/post.factory.ts"
import { defineFactory } from '@strutvane/framework'
import { Post } from '../../app/models/post.ts'
import { User } from '../../app/models/user.ts'

export default defineFactory(Post, ({ faker, sequence }) => ({
  title: faker.lorem.sentence(),
  body: faker.lorem.paragraph(),
  status: 'draft',
  author_id: () => User.factory(),   // a new user per post, unless you say otherwise
}))
```

- `faker` makes realistic fake values (names, sentences, emails).
- `sequence` is a counter that grows with each record, for values that must be unique.
- The keys are typed by the model's columns, so a typo or a wrong value type doesn't compile.
- Columns you leave out get a sensible fake value from their type (text, numbers, dates, enum values), with a fixed random seed, so the same seeder makes the same data on every machine.

### Making records

| You want | Write |
|---|---|
| One saved post | `await Post.factory().create()` |
| Ten saved posts | `await Post.factory().count(10).create()` |
| Built but not saved | `await Post.factory().make()` (or `.count(3).make()`) |
| Some values fixed | `await Post.factory().state({ status: 'published' }).create()` |
| Values that change per record | `.state(({ sequence }) => ({ title: \`Post ${sequence}\` }))` |

A **state** is a set of values that overrides the definition, like "published" or "featured". Chain several; later ones win.

### Records that belong to another one: `for()`

```ts
const ada = await User.factory().create()
await Post.factory().count(5).for(ada, 'author').create()   // five posts by Ada
```

`for(model, relation)` fills in the foreign key of a `belongsTo` relation (`author_id` here) instead of creating a new parent.

### Records with children: `has()`

```ts
const post = await Post.factory()
  .has(Tag.factory().count(2), 'tags')
  .create()
// one post, two new tags, linked through post_tag
```

### Sharing parents: `recycle()`

Without care, `Post.factory().count(50).create()` creates **50 different authors**, one per post, which makes demo data look odd. `recycle()` hands the factory a set of existing records to reuse whenever it needs a parent:

```ts
const authors = await User.factory().count(3).create()
await Post.factory().count(50).recycle(authors).create()
// 50 posts, spread over the same 3 authors
```

### Tenant tables

On a tenant table, a factory runs inside the active tenant, like every other write:

```ts
await runWithTenant(teamId, () => Project.factory().count(5).create())
```

### In tests

```ts title="tests/feature/published-posts.test.ts (excerpt)"
const ada = await User.factory().create()
await Post.factory().count(3).for(ada, 'author').state({ status: 'published' }).create()
await Post.factory().count(2).for(ada, 'author').create()   // drafts

expect(await ada.posts().published().count()).toBe(3)
```

See [Database Testing](../database-testing/) for a fresh database per test.

### Creating factory files

`node strut make:factory PostFactory` will write a factory on its own, and `node strut make:model Post -f` alongside a model.

## Common mistakes

### A database error about a missing `author_id`

**Why:** the definition doesn't set a required column that links to another table, so the insert is refused.

**Fix (today):** add the column when you call the definition: `{ ...postDefinition(1), author_id: author.id }`. With the 0.2 API, use `for(user, 'author')` or give the definition a default (`author_id: () => User.factory()`).

### mass_assignment when saving factory data with `create()`

```text
MassAssignmentError: "author_id" can't be mass-assigned on "posts". If users may set it, add it to `fillable` in Model('posts', { fillable: [...] }). If your own code sets it, assign it directly (model.author_id = value) or use forceCreate().
```

**Why:** `create()` only accepts `fillable` columns. Factory data is trusted, and often sets owner columns.

**Fix:** save factory data with `forceCreate()`.

### Unique values clash

**What you'll see:** a duplicate-key error from the database (the exact wording depends on MySQL, PostgreSQL or SQLite), or a `CastError` saying a value "is longer than" its column allows.

**Why:** a fixed value in the definition (or a fake value from a small set) repeats across rows, or a fake value is longer than its column.

**Fix:** build unique values from `sequence`, and keep fake text within the column's length:

```ts
return { name: `tag-${sequence}` }
```

### "Can't tell which table … is about, so no seeder or factory was written"

```text
  ✖ Can't tell which table "backfill_slugs" is about, so no seeder or factory was written.
  → Name it create_<table>_table or add_<column>_to_<table>_table, or run make:migration again without --seeder/--factory.
```

**Fix:** use a `create_…_table` or `add_…_to_…_table` name, or drop `--factory`.

## Next steps

- [Seeding](../seeding/): run factories from seeders.
- [Database Testing](../database-testing/): fresh data for every test.
- [Mass Assignment](../orm-mass-assignment/): why factories use `forceCreate()`.
