---
title: "Scopes"
description: "Give common conditions a name (Post.query().published()) and add conditions that apply to every query of a model automatically."
---

A **scope** is a named, reusable piece of a query. Instead of writing `.where('status', 'published')` in twenty places, you define it once on the model and write `.published()`. If the rule ever changes, you change it in one place.

There are two kinds:

- **Local scopes** you call by name when you want them: `Post.query().published()`.
- **Global scopes** apply to every query of the model automatically, until you remove them by name.

:::tip[Coming from Laravel?]
Local scopes are Laravel's `scopePublished()` / `#[Scope]` methods; global scopes are `addGlobalScope()` / `#[ScopedBy]`. In Strutvane both are plain objects of functions on the model (`static scopes` and `static globalScopes`), and TypeScript turns each local scope into a typed builder method. `withoutGlobalScope('name')` works as in Laravel.
:::

## Your first local scope

```ts title="app/models/post.ts"
import { Model, type Scopes } from '@strutvane/framework'

export class Post extends Model('posts', { fillable: ['title', 'body', 'status'] }) {
  static readonly scopes = {
    published: (query) => query.where('status', 'published'),
  } satisfies Scopes<'posts'>
}
```

```ts
const posts = await Post.query().published().orderBy('title').get()
console.log(posts.map((post) => post.title))
```

**What you'll see:**

```text
[ 'Alpha', 'Gamma' ]
```

`satisfies Scopes<'posts'>` lets TypeScript check each scope against the `posts` columns, and `query` inside the function is fully typed.

To add a scope to any model:

1. Add `static readonly scopes = { … } satisfies Scopes<'your_table'>` to the model class (import `Scopes` from `@strutvane/framework`).
2. Give each scope a name and a function that receives the query and adds conditions to it.
3. Call it on a query by its name: `Post.query().published()`.

### What a scope can use

Inside a scope, `query` offers the filtering part of the builder, typed by the table:

| Method | Example |
|---|---|
| `where` / `orWhere` | `query.where('status', 'published')`, `query.where('published_on', '>=', '2026-01-01')` |
| `whereIn` | `query.whereIn('status', ['draft', 'published'])` |
| `whereNull` / `whereNotNull` | `query.whereNotNull('published_on')` |
| `whereRaw` | ``query.whereRaw(sql`length(${sql.id('title')}) > ${10}`)`` |
| `orderBy` | `query.orderBy('published_on', 'desc')` |

A scope sees the **table's** types, not the model class, which keeps the model's types simple. Relationship methods (`with`, `whereHas`) and grouping with a function aren't part of a scope's query; add those where you call the scope.

## Scopes with arguments

Add parameters after `query`. They become the method's parameters:

```ts title="app/models/post.ts"
static readonly scopes = {
  published: (query) => query.where('status', 'published'),
  ofStatus: (query, status: 'draft' | 'published') => query.where('status', status),
} satisfies Scopes<'posts'>
```

```ts
await Post.query().ofStatus('draft').orderBy('title').get()
// → [ 'Beta', 'Delta 100%' ]

Post.query().ofStatus('archived') // compile error: not 'draft' | 'published'
```

A scope can take several parameters, with defaults like any function:

```ts title="app/models/post.ts (excerpt)"
static readonly scopes = {
  publishedBetween: (query, from: string, to: string = '9999-12-31') =>
    query.where('status', 'published').where('published_on', '>=', from).where('published_on', '<=', to),
} satisfies Scopes<'posts'>
```

```ts
await Post.query().publishedBetween('2026-01-01').count()
await Post.query().publishedBetween('2026-01-01', '2026-06-30').get()
```

## Combining scopes

Scopes chain with everything else, in any order:

```ts
const latestPublished = await Post.query()
  .published()
  .where('published_on', '>=', '2026-01-01')
  .latest()
  .limit(5)
  .get()
```

They also work through relationships:

```ts
const ada = await User.query().where('name', 'Ada').firstOrFail()
const adasPublished = await ada.posts().published().get()
// → [ 'Ada one' ]
```

## Global scopes

A global scope is added to **every** query of the model: lists, `find()`, counts, relationships, `whereHas()` and pagination. Use it for rules that should never be forgotten.

```ts title="app/models/published-post.ts"
import { Model, type Scopes } from '@strutvane/framework'

/** The posts table, seen through a filter: only published posts. */
export class PublishedPost extends Model('posts', { fillable: ['title'] }) {
  static readonly globalScopes = {
    published: (query) => query.where('status', 'published'),
  } satisfies Scopes<'posts'>
}
```

```ts
await PublishedPost.query().orderBy('title').get()          // → [ 'Alpha', 'Gamma' ]
await PublishedPost.query().count()                          // → 2
```

### Your OR conditions can't escape a global scope

Strutvane wraps your conditions in brackets before adding the global scope, so an `orWhere()` can never leak rows the scope hides:

```ts
await PublishedPost.query().where('title', 'Beta').orWhere('title', 'Alpha').get()
// SQL: WHERE (title = ? OR title = ?) AND status = ?
// → [ 'Alpha' ]   (Beta is a draft, so it stays hidden)
```

Without the brackets, SQL would read `title = 'Beta' OR (title = 'Alpha' AND status = 'published')`, and the draft would leak. This is tested on every database.

### Removing a global scope

```ts
await PublishedPost.query().withoutGlobalScope('published').count() // → 4
```

Use the name you gave the scope in `globalScopes`.

## Built-in automatic conditions

Two conditions behave like global scopes without you writing them:

| Condition | When | How to change it |
|---|---|---|
| Hide soft-deleted rows (`deleted_at IS NULL`) | the table has `t.softDeletes()` | `withTrashed()`, `onlyTrashed()` (see [Soft Deletes](../orm-soft-deletes/)) |
| Only the active tenant's rows | the table has the tenant column | can't be removed silently; see [Tenancy](../orm-tenancy/) |

:::caution[Coming in 0.2]
Authorization scopes are designed but not built yet: `Post.query().authorizedFor(user, 'view')` will add your policy's row rule (see [Authorization](../authorization/)) as one more group of conditions, so lists only ever contain records the user may see.
:::

## Common mistakes

### A scope with the same name as a query method

```text
OrmUsageError: Post has a scope named "latest", which clashes with the query method latest(). Rename the scope.
```

**Why:** scopes become methods on the query builder, so they can't reuse a built-in name like `where`, `latest` or `count`.

**Fix:** pick a descriptive name, such as `newestFirst` or `recentlyPublished`.

### Removing a global scope that doesn't exist

```text
OrmUsageError: PublishedPost has no global scope "publish". Global scopes are listed in its static globalScopes.
```

**Fix:** use the exact key from `static globalScopes` (here `'published'`).

### A scope that isn't a function

```text
OrmUsageError: static scopes.published must be a function (query, …args) => …
```

**Why:** each entry must be a function that receives the query.

**Fix:**

```ts
static readonly scopes = {
  published: (query) => query.where('status', 'published'),
} satisfies Scopes<'posts'>
```

### Calling a scope on the model instead of the query

`Post.published()` doesn't exist: scopes live on the query builder.

**Fix:** start a query first: `Post.query().published()`.

## Next steps

- [Querying](../orm-querying/): everything you can put inside a scope.
- [Soft Deletes](../orm-soft-deletes/): the built-in "hide deleted rows" condition.
- [Tenancy](../orm-tenancy/): the condition you can't forget.
