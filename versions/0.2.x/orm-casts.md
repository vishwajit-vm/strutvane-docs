---
title: "Casts & Accessors"
description: "How database values become proper TypeScript values (booleans, dates, exact decimals, typed JSON), and how to add your own conversions and computed properties."
---

Databases store values in their own ways: MySQL keeps `true` as `1`, SQLite keeps decimals as floating-point numbers, JSON is stored as text. A **cast** converts a value when it's read from the database, and back again when it's written, so your code always works with the right TypeScript type.

Most casts are automatic: Strutvane picks them from the column type in your migration. You only write a cast when you want something the column type can't know, like the shape of a JSON column or "always store emails in lower case". An **accessor** is a computed property, such as `post.isPublished`, written as a normal TypeScript getter.

:::tip[Coming from Laravel?]
You rarely need `$casts`: a `t.boolean()` column already is a boolean, a `t.timestamp()` a `Date`. For the rest, `casts: { meta: json<PostMeta>() }` replaces `'meta' => 'array'`, and `cast({ get, set })` replaces `Attribute::make(get:, set:)`. Accessors are plain getters, and today they aren't added to JSON: Laravel's `$appends` (and `$visible`) are designed for 0.2; until then, put computed fields in an API resource.
:::

## Automatic casts

```ts
const user = await User.findOrFail(1)
user.is_admin      // → false         (stored as 0 on MySQL and SQLite)

const post = await Post.findOrFail(1)
post.created_at    // → Date object   (stored in UTC)
post.published_on  // → '2026-11-14'  (a date column is a 'YYYY-MM-DD' string, no time zone surprises)
post.status        // → 'published'   (typed 'draft' | 'published')
post.meta          // → { tags: [ 'orm' ], pinned: true }  (JSON parsed)
```

| Column in the migration | In TypeScript | Notes |
|---|---|---|
| `t.boolean()` | `boolean` | `0`/`1` on MySQL and SQLite becomes `false`/`true` |
| `t.timestamp()`, `t.timestamps()` | `Date` | always UTC, on every database |
| `t.date()` | `string` like `'2026-11-14'` | no time, so no time-zone shifts |
| `t.decimal('price', 12, 2)` | `string` like `'10.50'` | exact: never a float, so no lost cents |
| `t.integer()`, `t.bigInteger()`, `t.id()`, `t.foreignId()` | `number` | whole numbers only; a string of digits (as in a URL) is accepted on the way in; values beyond JavaScript's safe range are refused |
| `t.double()` | `number` | must be a finite number |
| `t.enum('status', [...])` | the union of the values | other values are refused before any SQL |
| `t.string('title', 200)`, `t.slug()`, `t.text()` | `string` | the length is checked, even on SQLite, which ignores it; the NUL character is refused everywhere |
| `t.uuid()` | `string` | must be a valid UUID; stored lower-case |
| `t.json()` | a JSON value | parsed on read; give it a type with `json<T>()` |

### Decimals are strings

```ts
// projects.budget is t.decimal('budget', 12, 2); projects is a tenant table, so a tenant must be active.
const project = await runWithTenant(teamId, () => Project.create({ name: 'Budgeted', budget: 10.5 }))
console.log(project.budget) // → '10.50'
```

You can pass a number or a string; you always get back an exact string with the column's number of decimals. Floating-point numbers can't hold `0.1` exactly, and money must add up.

### Values are checked before they reach the database

```ts
const post = await Post.findOrFail(1)
post.fill(JSON.parse('{"status":"archived"}')) // untyped input, from a request
await post.save()
```

**What you'll see:**

```text
CastError: Can't store that value in "posts.status": "archived" is not one of draft, published.
```

Every database gives the same error, because the check runs in Strutvane, not in the database. In a controller, it becomes a 422 response.

This matters most on MySQL, which compares across types by converting: on a raw MySQL server, `'1abc' = 1` is true. Strutvane checks the type of every value, in writes **and** in `where()`, before any SQL is sent, so an id of `'1abc'` taken from a URL is a `CastError` (`expected a whole number, got "1abc"`), not a surprise match with row 1.

## Typing a JSON column with `json<T>()`

```ts title="app/models/post.ts"
import { json, Model } from '@strutvane/framework'

export interface PostMeta {
  readonly tags: readonly string[]
  readonly pinned?: boolean
}

export class Post extends Model('posts', {
  fillable: ['title', 'body', 'status', 'published_on', 'meta'],
  casts: { meta: json<PostMeta>() },
}) {}
```

```ts
post.fill({ meta: { tags: ['orm'], pinned: true } })
await post.save()

const fresh = await Post.findOrFail(post.id)
fresh.meta?.tags   // → [ 'orm' ]   typed readonly string[]
```

### Checking JSON on the way in and out

Without a validator, `json<PostMeta>()` is a promise you make to TypeScript. Pass a function that checks the value (a Zod `parse`, for example) to make it a guarantee:

```ts title="app/models/post.ts"
import { json, Model } from '@strutvane/framework'
import { z } from 'zod'

const PostMetaSchema = z.object({ tags: z.array(z.string()), pinned: z.boolean().optional() })

export class Post extends Model('posts', {
  fillable: ['title', 'meta'],
  casts: { meta: json(PostMetaSchema.parse) },
}) {}
```

A value that doesn't match is refused with a `CastError` instead of being stored.

## Your own cast with `cast({ get, set })`

`set` runs when a value goes **into** the model (on `create`, `fill`, assignment, and even in `where()`); `get` runs when it comes **out** of the database.

```ts title="app/models/user.ts"
import { cast, Model } from '@strutvane/framework'

/** Emails are stored trimmed and lower-cased. */
const email = cast<string>({
  get: (stored) => String(stored),
  set: (value) => value.trim().toLowerCase(),
})

export class User extends Model('users', {
  fillable: ['name', 'email', 'password'],
  hidden: ['password'],
  casts: { email },
}) {}
```

```ts
const user = await User.create({ name: 'Grace', email: '  Grace@Example.TEST ' })
console.log(user.email)                                     // → 'grace@example.test'

await User.query().where('email', ' GRACE@example.test ').first() // finds Grace: the cast runs on lookups too
```

If `set` throws (for example `value.trim()` on a number sent by a client), Strutvane turns it into a clean `CastError`, not a crash:

```text
CastError: Can't store that value in "users.email": the value could not be converted (value.trim is not a function).
```

## Accessors: computed properties

An accessor is a getter in the model class. It's typed, it's never stored, and it can use any column:

```ts title="app/models/post.ts"
export class Post extends Model('posts', { fillable: ['title', 'status'] }) {
  get isPublished(): boolean {
    return this.status === 'published'
  }
}
```

```ts
const post = await Post.findOrFail(1)
post.isPublished          // → true
post.toJSON().isPublished // undefined: accessors aren't part of the JSON
```

### The order casts run in

When you **write** a value (create, fill, assignment, or a `where()` value):

1. your model cast's `set` runs, if the column has one;
2. the built-in cast for the column type checks and converts it;
3. the value is sent to the database as a bound parameter.

When you **read** a row, it's the other way round: the built-in cast first, then your cast's `get`. `NULL` skips both and stays `null`.

:::caution[Coming in 0.2]
`encrypted()` (a cast that encrypts a column with your `APP_KEY`) and `asEnum(MyEnum)` (a TypeScript enum for a column) are designed but not built yet. A `t.enum()` column already gives you a checked union type today. Computed fields in JSON will come with API resources (see [API Resources](../orm-resources/)).
:::

## Common mistakes

### A value outside an enum

```text
CastError: Can't store that value in "posts.status": "archived" is not one of draft, published.
```

**Fix:** use one of the allowed values, or add the new value to the enum in a new migration and run `node strut migrate`.

### Text that's too long

```text
CastError: Can't store that value in "posts.title": it is longer than 200 characters.
```

**Why:** the migration said `t.string('title', 200)`. SQLite would quietly store the long text; Strutvane refuses it on every database so they all behave the same.

**Fix:** shorten the value, or validate the length in your form request so users see a friendly message first.

### Wrong format for a date column

```text
CastError: Can't store that value in "posts.published_on": expected a date like 2026-11-14, got "14/11/2026".
```

**Fix:** send dates as `'YYYY-MM-DD'`. For date-times (timestamps), pass a `Date` or an ISO string like `'2026-11-14T09:30:00Z'`.

### A cast for a column that doesn't exist

```text
OrmUsageError: Post casts "metadata", but "posts" has no such column.
```

**Fix:** use the column name from the migration (`meta`), or add the column first.

### A JSON body sends a number where text is expected

```text
CastError: Can't store that value in "posts.title": expected text, got 42.
```

**Why:** a request body can contain any JSON type. The cast refuses a number for a text column instead of storing `'42'` by surprise.

**Fix:** validate request bodies first (see [Validation](../validation/)), so users get a field-level message.

### Comparing a decimal as a number

`project.budget === 10.5` is always `false`, because `project.budget` is the string `'10.50'`.

**Fix:** compare strings (`project.budget === '10.50'`), or convert deliberately when you calculate (`Number(project.budget)`), knowing that floats can round.

## Next steps

- [Mass Assignment](../orm-mass-assignment/): which values `fill()` and `create()` accept.
- [Migrations](../migrations/): the column types the automatic casts come from.
- [Querying](../orm-querying/): casts also apply to values in `where()`.
