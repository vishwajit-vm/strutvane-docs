---
title: "Query Builder"
description: "Every method of Strutvane's typed query builder in one place, the SQL each one produces on MySQL, PostgreSQL and SQLite, safe raw SQL, debugging, and what's coming (joins, aggregates, chunking)."
---

The **query builder** is the object you get from `Post.query()`: you chain methods onto it (`where`, `orderBy`, `limit`…) to describe the rows you want, and a final method (`get`, `first`, `count`…) runs one SQL statement and gives you the result. It's fully typed from your migrations: a wrong column name, a value of the wrong type or a misspelled enum value is a compile error.

This page is the **reference**: every method, what it produces, and how the three databases differ. For a guided tour with the blog example, start with [ORM: Querying](../orm-querying/).

:::tip[Coming from Laravel?]
It's Laravel's query builder, reached through a model: `Post::where('status', 'draft')->orderBy('created_at', 'desc')->get()` becomes `await Post.where('status', 'draft').orderBy('created_at', 'desc').get()`. Columns keep their migration names (`created_at`). Two differences: every query starts from a model (there's no `DB::table('posts')` yet), and raw SQL only goes through the `sql` tag, never a string, so `whereRaw("title = '$x'")` can't be written at all.
:::

## The smallest query

```ts title="app/http/controllers/post.controller.ts (excerpt)"
import { Post } from '../../models/post.ts'

const drafts = await Post.query().where('status', 'draft').orderBy('created_at', 'desc').limit(10).get()
console.log(drafts.length, drafts[0]?.title)
```

**What you'll see:**

```text
2 A draft
```

`drafts` is a `Post[]`: each item is a model with typed columns.

## How a query becomes SQL

1. **You build.** Each method adds to a plain description of the query. Nothing runs yet, and column names are checked against your schema as you go (a typo fails right here, with a suggestion).
2. **The model adds its own rules.** Soft-deleted rows are left out, the model's global scopes are added, and on team tables the team condition is added. Your conditions are wrapped in brackets first, so an `orWhere` of yours can never escape them.
3. **The grammar writes SQL** for your database, with placeholders instead of values.
4. **A final check** refuses the statement if it could reach another team's rows.
5. **The connection runs it**, sending the values separately, and the rows become models (booleans, dates and decimals converted).

The builder is **mutable**: each method changes the query and returns it. To branch one base query into two, use `clone()`.

## Every method

### Conditions

| Method | Example | SQL (PostgreSQL) |
|---|---|---|
| `where(column, value)` | `where('status', 'draft')` | `"posts"."status" = $1` |
| `where(column, operator, value)` | `where('created_at', '>=', since)` | `"posts"."created_at" >= $1` |
| `where(column, null)` | `where('body', null)` | `"posts"."body" IS NULL` |
| `where((q) => …)` | `where((q) => q.where('a', 1).orWhere('b', 2))` | `("posts"."a" = $1 OR "posts"."b" = $2)` |
| `orWhere(…)` | same forms as `where` | `… OR …` |
| `whereIn(column, values)` | `whereIn('status', ['draft', 'published'])` | `"posts"."status" IN ($1, $2)` |
| `whereNotIn(column, values)` | `whereNotIn('status', ['draft'])` | NULL-safe: rows where `status` is empty also match |
| `whereNull(column)` / `whereNotNull(column)` | `whereNull('published_on')` | `"posts"."published_on" IS NULL` |
| `whereContains(column, text)` | `whereContains('title', '100%')` | case-insensitive "contains"; `%` and `_` are plain text |
| `whereStartsWith(column, text)` | `whereStartsWith('slug', 'how-to')` | case-insensitive "starts with" |
| `whereHas(relation, (q) => …)` | `whereHas('posts', (q) => q.where('status', 'published'))` | `EXISTS (SELECT …)` |
| `whereRaw(fragment)` | ``whereRaw(sql`length(${sql.id('title')}) > ${60}`)`` | your SQL, values bound |

**Operators** are `=`, `!=`, `<>`, `<`, `<=`, `>` and `>=`; anything else (`like`, `ilike`) is refused with a hint. `!=` and `<>` are **NULL-safe**: `where('status', '!=', 'draft')` also returns rows whose status is empty, the way `!==` works in JavaScript. Plain SQL `!=` would silently skip them.

### Requests: search, filter and sort

These take **strings from a request** and check every column name, so they're safe to feed with query-string values (the generated API uses them).

| Method | Example | What it does |
|---|---|---|
| `search(term, columns)` | `search('hello world', ['title', 'body'])` | Case-insensitive search: **every word** must appear, each in **any** of the columns (at most 10 columns). A term that is an id or a UUID also matches that row exactly. Blank terms are ignored; at most 200 characters. |
| `filter(column, operator, value)` | `filter('status', 'in', ['draft', 'published'])` | One filter. Operators: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`, `contains`, `startsWith`, `null` (`true` = is empty, `false` = isn't). |
| `sort(spec)` | `sort('-created_at,title')` | Comma-separated columns, `-` for descending. |

The "every word" and "id or UUID" rules are decided (2026-11-15); the ORM prototype still looks for the whole term as one piece of text. A column that exists isn't automatically one users may filter on: the generated API also checks each name against the allow-lists in `.strutvane/resources.json`. Do the same in your own controllers (see [ORM: Querying](../orm-querying/#search-filter-and-sort-from-a-request)).

### Order and size

| Method | Example | Notes |
|---|---|---|
| `orderBy(column, direction = 'asc')` | `orderBy('created_at', 'desc')` | The direction is checked at runtime too, because it often comes from a URL. |
| `latest(column = 'created_at')` | `latest()` | Newest first. |
| `limit(count)` | `limit(10)` | At most this many rows. |
| `offset(count)` | `offset(20)` | Skip this many rows. |

### Relations, scopes and soft deletes

| Method | Example | Guide |
|---|---|---|
| `with(...paths)` | `with('author', 'tags')`, `with('posts.tags')`, `with({ posts: (q) => q.where('status', 'published') })` | [Relationships](../orm-relationships/) |
| `withCount(...relations)` | `withCount('tags')` → `post.tags_count` | [Relationships](../orm-relationships/) |
| your scopes | `published()`, `ofStatus('draft')` | [Scopes](../orm-scopes/) |
| `withoutGlobalScope(name)` | `withoutGlobalScope('visible')` | [Scopes](../orm-scopes/) |
| `withTrashed()` / `onlyTrashed()` | `withTrashed().find(7)` | [Soft Deletes](../orm-soft-deletes/) |
| `unsafeWithoutTenancy(reason)` | `unsafeWithoutTenancy('nightly usage report')` | [ORM: Tenancy](../orm-tenancy/) |

### Running the query

| Method | Returns | Notes |
|---|---|---|
| `get()` | `Post[]` | Every matching row. |
| `first()` | `Post \| undefined` | Adds `LIMIT 1`. |
| `firstOrFail()` | `Post` | Throws `ModelNotFoundError` (a 404 in a controller). |
| `find(id)` / `findOrFail(id)` | `Post \| undefined` / `Post` | By primary key, within the query's conditions. |
| `count()` | `number` | `SELECT COUNT(*)`, ignoring order, limit and offset. |
| `exists()` | `boolean` | Whether at least one row matches. |
| `paginate(perPage?, page?)` | `{ data, total, perPage, currentPage, lastPage }` | Numbered pages. See [Pagination](../pagination/). |
| `cursorPaginate(perPage?, cursor?)` | `{ data, perPage, nextCursor }` | Fast pages for long lists. |
| `toSql()` | `{ sql, params }` | The SQL and its values, **without** running it. |
| `clone()` | a new builder | An independent copy of the query so far. |

## SQL on each database

The same query produces slightly different SQL per database. You never write these differences yourself; they matter when you read `toSql()` output or a slow-query log.

| | MySQL 8.4+ | PostgreSQL | SQLite |
|---|---|---|---|
| Quoting names | `` `posts`.`title` `` | `"posts"."title"` | `"posts"."title"` |
| Placeholders | `?` | `$1`, `$2`, … | `?` |
| NULL-safe `!=` | `NOT (a <=> b)` | `a IS DISTINCT FROM b` | `a IS NOT b` |
| Contains / starts with | a position check on lower-cased text (never `LIKE`) | same | same |
| `offset()` without `limit()` | adds a huge `LIMIT` | fine | adds `LIMIT -1` |
| Reading back a new row | an extra `SELECT` by id (MySQL has no `RETURNING`) | `RETURNING *` | `RETURNING *` |

```ts
const { sql: text, params } = Post.query().where('status', '!=', 'draft').limit(5).toSql()
console.log(text)
console.log(params)
```

**What you'll see** on MySQL (something like this):

```text
SELECT `posts`.* FROM `posts` WHERE NOT (`posts`.`status` <=> ?) AND `posts`.`deleted_at` IS NULL LIMIT ?
[ 'draft', 5 ]
```

On PostgreSQL the same query uses `"posts"."status" IS DISTINCT FROM $1` and `LIMIT $2`.

## Raw SQL, safely

Use `whereRaw` for one hand-written condition inside a model query, and the connection for a whole statement:

```ts title="app/reports/post-stats.ts"
import { defaultConnection, sql } from '@strutvane/framework'
import { Post } from '../models/post.ts'

// 1. One raw condition inside a model query: you still get Post models back.
const longTitles = await Post.query().whereRaw(sql`length(${sql.id('title')}) > ${60}`).get()

// 2. A whole statement: you get plain rows back.
const { rows } = await defaultConnection().run(
  sql`SELECT ${sql.id('author_id')}, COUNT(*) AS total FROM ${sql.id('posts')} GROUP BY ${sql.id('author_id')}`,
)
console.log(longTitles.length, rows)
```

**What you'll see** (on MySQL):

```text
1 [ { author_id: 1, total: 4 }, { author_id: 2, total: 1 } ]
```

The rules of the `sql` tag:

- every `${value}` is **bound** (sent separately), never pasted into the SQL;
- `${sql.id('name')}` is a checked, quoted column or table name;
- a `${fragment}` made with the tag is spliced in, so you can build SQL from parts;
- `sql.join(fragments, ' AND ')` joins several fragments;
- plain strings are refused everywhere.

Raw SQL that names a team's table is refused inside a team context; see [Database: Getting Started](../database/#raw-sql-and-teams).

## Three queries, from small to advanced

**Small:** one condition.

```ts
const published = await Post.where('status', 'published').get()
```

**Typical:** a list page with search, a filter, eager loading and pages.

```ts title="app/http/controllers/post.controller.ts (excerpt)"
const page = await Post.query()
  .search('launch', ['title', 'body'])
  .filter('status', 'eq', 'published')
  .with('author')
  .withCount('tags')
  .latest()
  .paginate(25, 1)
console.log(page.total, page.data[0]?.author?.name, page.data[0]?.tags_count)
// → 3 Ada 2
```

**Advanced:** a reusable base query, branched, with a grouped OR and a relation condition.

```ts title="app/http/controllers/dashboard.controller.ts (excerpt)"
import { User } from '../../models/user.ts'
import { Post } from '../../models/post.ts'

const mine = (userId: number) =>
  Post.query().where((q) => q.where('author_id', userId).orWhere('status', 'published'))

const me = await User.findOrFail(1)
const recent = await mine(me.id).clone().latest().limit(5).get()
const draftCount = await mine(me.id).clone().where('status', 'draft').count()
const activeAuthors = await User.query().whereHas('posts', (q) => q.where('status', 'published')).count()
console.log(recent.length, draftCount, activeAuthors)
// → 5 2 3
```

## Coming later

These are part of Laravel's query builder and designed for Strutvane, but not built yet. Until then, use [raw SQL](#raw-sql-safely) through the connection.

| Feature | Laravel | Status |
|---|---|---|
| Queries without a model | `DB::table('posts')` | Coming in 0.2 |
| Choosing columns | `select('id', 'title')` | Coming in 0.2 |
| Joins | `join`, `leftJoin` | Coming in 0.2 |
| Grouping and aggregates | `groupBy`, `having`, `sum`, `avg`, `min`, `max` | Coming in 0.2 |
| Counting and summing relations | `withSum`, `withExists` | Coming in 0.2 |
| Processing big tables in pieces | `chunk`, `chunkById`, `cursor`, `lazy` | Coming in 0.2 (see [Collections](../orm-collections/)) |
| Insert or update in one statement | `upsert` (the conflict columns must include the team column) | Coming in 0.2 |
| Changing many rows at once | `update`, `delete`, `increment` on a query | Coming in 0.2 |
| Full-text search | `whereFullText` | Opt-in, coming later |

## Common mistakes

### "is not a supported operator"

```text
OrmUsageError: "like" is not a supported operator. Use one of: = != <> < <= > >=. For text search use whereRaw with the sql tag.
```

**Why:** `LIKE` treats `%` and `_` in user input as wildcards, which surprises users and can be slow.
**Fix:** use `whereContains('title', text)` or `whereStartsWith('slug', text)`.

### "has no column … Did you mean …?"

```text
OrmUsageError: "posts" has no column "titel". Did you mean "title"? Columns come from your migrations.
```

**Why:** a typo, often in a value that came from a URL (`?sort=titel`), so TypeScript couldn't catch it.
**Fix:** correct the name. In a controller, check request names against `resources.json` first and answer 400.

### "whereRaw() needs a sql fragment, not a string"

```text
OrmUsageError: whereRaw() needs a sql`…` fragment, not a string. Strings would let user input become SQL; put values in ${…} inside the sql tag.
```

**Fix:** ``whereRaw(sql`length(${sql.id('title')}) > ${60}`)``.

### My `!=` query returns rows with empty values

**Why:** `!=` is NULL-safe on purpose: `status != 'draft'` includes rows where `status` is empty, because an empty status isn't `'draft'`.
**Fix:** if you want only rows that have a value, add `.whereNotNull('status')`.

### Two queries share conditions by accident

```ts
const base = Post.query().where('status', 'published')
const recent = base.latest().limit(5)   // changes base too!
const total = await base.count()        // still counts, but `base` now has the order and limit
```

**Why:** the builder is mutable; each method changes the same query.
**Fix:** branch with `clone()`: `const recent = base.clone().latest().limit(5)`.

### "needs a whole number of 0 or more"

```text
OrmUsageError: limit() needs a whole number of 0 or more; got -1.
```

**Fix:** check numbers from a URL before passing them, or use `paginate()`, which validates page and size for you.

## Next steps

- [ORM: Querying](../orm-querying/): the same methods, walked through with the blog example.
- [Pagination](../pagination/): numbered and cursor pages, in the ORM, the API and the screens.
- [Relationships](../orm-relationships/): `with`, `withCount` and `whereHas` in depth.
- [Database: Getting Started](../database/): connections, raw SQL and seeing every query.
