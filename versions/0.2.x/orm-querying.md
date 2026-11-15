---
title: "Querying"
description: "Find exactly the rows you need with typed conditions, grouping, ordering, limits, request-driven search and filters, and safe raw SQL."
---

A **query** is a question you ask the database: "which posts are published, newest first?". In Strutvane you build it with the **query builder**: a chain of methods that starts with `Post.query()` (or a shortcut like `Post.where(...)`) and ends with a method that runs it, such as `get()` or `first()`.

Every column name and value is checked by TypeScript against your migrations, and every value is sent to the database separately from the SQL (a **bound parameter**), so user input can never become SQL.

:::tip[Coming from Laravel?]
`Post::where('status', 'published')->orderBy('created_at', 'desc')->get()` becomes `Post.where('status', 'published').orderBy('created_at', 'desc').get()`, with `await`. Columns keep their migration names. Two deliberate differences: `!=` matches rows where the column is `NULL` (like JavaScript's `!==`), and raw SQL is only accepted through the `` sql`…` `` tag, never as a string. `LIKE` isn't an operator: use `whereContains()` or `search()`.
:::

## The smallest query

```ts title="app/http/controllers/post.controller.ts (excerpt)"
import { Post } from '../../models/post.ts'

const posts = await Post.where('status', 'published').orderBy('title').get()
console.log(posts.map((post) => post.title))
```

**What you'll see:**

```text
[ 'Alpha', 'Gamma' ]
```

The examples on this page use four posts: **Alpha** (published, with a body), **Beta** (draft), **Gamma** (published) and **Delta 100%** (draft). Only Alpha has a `body`.

## How a query is built and run

1. **Start** a query: `Post.query()`, or a shortcut on the model (`Post.where(...)`, `Post.with(...)`, `Post.withTrashed()`, `Post.onlyTrashed()`).
2. **Add** conditions, ordering, limits, relationships and scopes. Each method returns the same builder, so you can chain them.
3. **Run** it with a terminal method. Nothing is sent to the database before this step.

| Terminal method | Returns | Use it when |
|---|---|---|
| `get()` | `Post[]` (may be empty) | you want a list |
| `first()` | `Post` or `undefined` | you want one row, if any |
| `firstOrFail()` | `Post`, or throws `ModelNotFoundError` | the row must exist (becomes a 404) |
| `find(key)` / `findOrFail(key)` | one row by its key | you know the id |
| `count()` | `number` | you only need how many |
| `exists()` | `boolean` | you only need "any at all?" |
| `paginate()` / `cursorPaginate()` | a page | see [Pagination](../orm-pagination/) |
| `toSql()` | `{ sql, params }`, without running | you want to see the SQL |

## Conditions

### Equal to a value

```ts
await Post.query().where('status', 'published').get()
```

The value is typed by the column: `where('status', 'archived')` doesn't compile when the column only allows `draft` and `published`, and `where('author_id', 'abc')` doesn't compile because `author_id` is a number.

### Comparisons

Pass an operator in the middle. The allowed operators are `=`, `!=`, `<>`, `<`, `<=`, `>` and `>=`:

```ts
await Post.query().where('published_on', '>=', '2026-01-01').where('id', '>', 100).get()
```

Several `where()` calls are joined with **AND**: every condition must match.

### OR

```ts
const rows = await Post.query().where('title', 'Alpha').orWhere('title', 'Beta').orderBy('title', 'desc').get()
// → titles: [ 'Beta', 'Alpha' ]
```

`orWhere()` takes the same forms as `where()`.

### Grouping with parentheses

Pass a function to `where()` (or `orWhere()`) to group conditions, like brackets in maths:

```ts
const rows = await Post.query()
  .where('status', 'published')
  .where((query) => query.where('title', 'Alpha').orWhere('title', 'Beta'))
  .get()
// SQL: WHERE status = ? AND (title = ? OR title = ?)
// → titles: [ 'Alpha' ]
```

Without the group, `status = 'published' AND title = 'Alpha' OR title = 'Beta'` would also return the draft Beta. When in doubt, group.

### In a list, or not

```ts
await Post.query().whereIn('title', ['Gamma', 'Alpha', 'Nope']).get() // → Alpha, Gamma
await Post.query().whereIn('title', []).get()                         // → [] (an empty list matches nothing)
await Post.query().whereNotIn('status', ['draft']).get()              // → Alpha, Gamma
```

### Empty values (NULL)

`NULL` is the database's "no value". These find rows with or without a value:

```ts
await Post.query().whereNull('body').count()     // → 3: posts with no body
await Post.query().whereNotNull('body').get()    // → Alpha
await Post.query().where('body', null).count()   // → 3: the same as whereNull
```

### `!=` includes empty values

In plain SQL, `body <> 'x'` silently skips rows where `body` is `NULL`. Strutvane's `!=`, `<>` and `whereNotIn` include them, the way `!==` works in JavaScript:

```ts
// body is NULL for Beta, Gamma and Delta, and 'has a body' for Alpha.
await Post.query().where('body', '!=', 'has a body').count() // → 3, not 0
await Post.query().where('body', '!=', null).count()         // → 1 (only rows with a body)
```

### Contains and starts with

For "contains" and "starts with" there are two methods instead of a `LIKE` operator. Both ignore upper and lower case, and `%` and `_` are ordinary characters, not wildcards:

```ts
await Post.query().whereContains('title', '100%').get()      // → [ 'Delta 100%' ]
await Post.query().whereStartsWith('slug', 'gam').get()      // → [ 'Gamma' ]
```

Because `%` is literal, a user searching for `100%` finds exactly that, and a search for `%` doesn't match every row.

## Ordering and limiting

```ts
await Post.query().orderBy('title').get()                 // A → Z ('asc' is the default)
await Post.query().orderBy('created_at', 'desc').get()    // newest first
await Post.query().orderBy('status').orderBy('title').get() // by status, then by title
await Post.query().latest().get()                         // newest by created_at
await Post.query().latest('published_on').first()         // newest by another column
await Post.query().orderBy('title').limit(2).offset(1).get()
// → [ 'Beta', 'Delta 100%' ] (skip 1, take 2)
```

`latest()` sorts by `created_at`, newest first. On a table without timestamps, pass a column: `latest('id')`. `limit()` and `offset()` take whole numbers of 0 or more.

## Shortcuts on the model

These start a query for you, so you can skip `.query()`:

```ts
await Post.where('status', 'draft').get()
await Post.with('author').get()          // see Relationships
await Post.withTrashed().find(1)         // see Soft Deletes
await Post.onlyTrashed().get()
```

## Branching a query with `clone()`

The builder changes in place (like Laravel's). To build two queries from a common start, `clone()` it:

```ts
const base = Post.query().where('status', 'published')
const total = await base.clone().count()
const newest = await base.clone().latest().limit(5).get()
console.log(total, newest.length)
// → 2 2
```

Without `clone()`, the `latest().limit(5)` would also change `base`.

## Search, filter and sort from a request

Your own conditions use typed column names. When names come from a **request** (a URL like `?search=hello&sort=-title`), they're plain strings, so the builder has three methods that check every name at runtime against the table and refuse anything unknown:

```ts
await Post.query().search('100%', ['title', 'body']).get()   // → [ 'Delta 100%' ]
await Post.query().filter('status', 'in', ['draft']).sort('-title').get()
await Post.query().filter('title', 'startsWith', 'ga').get() // → [ 'Gamma' ]
await Post.query().filter('body', 'null', true).count()      // → 3: posts with no body
await Post.query().filter('body', 'null', false).count()     // → 1: posts with a body
```

- **`search(term, columns)`**: rows where **any** of the columns contains the term. Case-insensitive; `%` and `_` are ordinary characters; a blank term adds nothing; at most 200 characters. In 0.2 the rule becomes: every **word** must appear (each in any column), at most 10 columns, and an id or UUID also matches exactly (decided 2026-11-15; the prototype matches the whole term).
- **`filter(column, operator, value)`**: operators are `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in` (a list), `contains`, `startsWith` and `null` (`true` for "is empty", `false` for "has a value").
- **`sort('-created_at,title')`**: comma-separated columns; a minus sign means descending.

A typical controller reads them from the URL:

```ts title="app/http/controllers/post.controller.ts (excerpt)"
const search = ctx.query.get('search') ?? ''
const sort = ctx.query.get('sort') ?? '-created_at'

const posts = await Post.query()
  .search(search, ['title', 'body'])
  .sort(sort)
  .limit(25)
  .get()
return ctx.json({ data: posts })
```

**What you'll see** for `GET /posts?search=alp&sort=title`:

```json
{ "data": [ { "id": 1, "title": "Alpha", "status": "published" } ] }
```

(shortened: every column of the post is included).

:::caution[Existing isn't the same as allowed]
These methods only check that a column **exists**. Before passing names from a request, also check that the column may be searched, sorted or filtered (the generated CRUD API checks the lists in `.strutvane/resources.json`; see [Search, Filters & Sorting](../crud-search/)). Otherwise a user could sort by a column you never meant to expose.
:::

Hostile input stays data:

```ts
await Post.query().where('title', "x' OR '1'='1").count() // → 0, it's only a strange title
Post.query().sort('title; DROP TABLE posts')              // throws OrmUsageError: no such column
```

## Raw SQL, safely

When you need SQL the builder can't express, use `whereRaw` with the `sql` tag. Values inside `${…}` are always bound, and `sql.id()` quotes a column name for the current database:

```ts
import { sql } from '@strutvane/framework'

const minimum = 5
const rows = await Post.query()
  .whereRaw(sql`length(${sql.id('title')}) >= ${minimum}`)
  .orderBy('title')
  .get()
// → [ 'Alpha', 'Delta 100%', 'Gamma' ]
```

On tenant tables, raw conditions that name a tenant table are refused inside a tenant, because Strutvane can't check them for the tenant condition. See [Tenancy](../orm-tenancy/).

## Seeing the SQL

`toSql()` shows the statement and its values without running it:

```ts
const { sql: text, params } = Post.query().where('status', 'published').orderBy('title').toSql()
console.log(text)
console.log(params)
```

**What you'll see** (something like this; quoting depends on your database, MySQL uses backticks):

```text
SELECT `posts`.* FROM `posts` WHERE `posts`.`status` = ? AND `posts`.`deleted_at` IS NULL ORDER BY `posts`.`title` ASC
[ 'published' ]
```

Notice the `deleted_at IS NULL`: soft-deleted rows are left out automatically. On a tenant table you'd also see the tenant condition.

## Three queries, from small to advanced

**Small:** one condition.

```ts
const drafts = await Post.where('status', 'draft').get()
```

**Typical:** a page of a list screen, with a scope, a relationship and a count.

```ts
const page = await Post.query()
  .published()
  .with('author')
  .withCount('tags')
  .latest()
  .paginate(25, 1)
```

**Advanced:** a reusable base query, a grouped OR, a relationship filter and a raw condition.

```ts
import { sql } from '@strutvane/framework'

const recent = Post.query().where('published_on', '>=', '2026-01-01')

const needsReview = await recent
  .clone()
  .where((query) => query.whereNull('body').orWhere('status', 'draft'))
  .whereHas('tags', (query) => query.where('name', 'news'))
  .whereRaw(sql`length(${sql.id('title')}) < ${10}`)
  .orderBy('published_on', 'desc')
  .get()
```

:::caution[Coming in 0.2]
These are designed but not built yet: `join`/`leftJoin`, `select`, `groupBy`/`having`, `distinct`, `when(condition, fn)`, `lockForUpdate`, `increment`/`decrement`, bulk `update`/`delete`, aggregates (`sum`, `avg`, `min`, `max`), `pluck`/`value`, and streaming large tables with `cursor()`/`chunkById()`. The [Query Builder](../queries/) page covers queries without models.
:::

## Common mistakes

### "is not a supported operator"

```text
OrmUsageError: "LIKE" is not a supported operator. Use one of: = != <> < <= > >=. For text search use whereRaw with the sql tag.
```

**Why:** `where()` only accepts comparison operators, so a typo can never turn into SQL.

**Fix:** for "contains" searches, use `whereContains()`, `search()` or `filter(column, 'contains', text)`:

```ts
await Post.query().whereContains('title', 'hello').get()
```

### "whereRaw() needs a sql fragment, not a string"

```text
OrmUsageError: whereRaw() needs a sql`…` fragment, not a string. Strings would let user input become SQL; put values in ${…} inside the sql tag.
```

**Why:** a plain string could contain user input, which is how SQL injection happens.

**Fix:** write `` whereRaw(sql`length(${sql.id('title')}) > ${10}`) `` instead of `whereRaw('length(title) > 10')`.

### A typo in a column name from a request

```text
OrmUsageError: "posts" has no column "titel". Did you mean "title"? Columns come from your migrations.
```

**Why:** `sort()`, `filter()` and `search()` check names at runtime. (In your own code, a typo in `where()` is already a compile error.)

**Fix:** use the real column name; list them with `node strut model:show Post`.

### Sort direction from user input

```text
OrmUsageError: Sort direction must be "asc" or "desc", not "asc; DROP TABLE posts".
```

**Fix:** map user input to `'asc'` or `'desc'` yourself, or use `sort('-title')`, which parses the minus sign safely.

### A filter operator that doesn't exist

```text
OrmUsageError: "like" is not a filter operator. Use one of: eq, ne, gt, gte, lt, lte, in, contains, startsWith, null.
```

**Fix:** use one of the listed operators; for `in`, pass a list: `filter('status', 'in', ['draft', 'published'])`.

### A very long search term

```text
OrmUsageError: Search text is limited to 200 characters.
```

**Why:** long "contains" searches are slow and almost always abuse.

**Fix:** cut the term in your request validation, or tell the user it's too long.

### A negative limit or offset

```text
OrmUsageError: limit() needs a whole number of 0 or more; got -1.
```

**Fix:** check numbers from the URL before using them, or use [pagination](../orm-pagination/), which checks them for you.

### `latest()` on a table without timestamps

```text
OrmUsageError: "tags" has no created_at column; pass the column to sort by, e.g. latest('id').
```

**Fix:** `latest('id')`, or add `t.timestamps()` to the table in a new migration.

## Next steps

- [Relationships](../orm-relationships/): load authors and tags with your posts.
- [Scopes](../orm-scopes/): give common conditions a name.
- [Pagination](../orm-pagination/): split results into pages.
