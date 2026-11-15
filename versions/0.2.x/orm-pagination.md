---
title: "Pagination"
description: "Split long lists into pages: numbered pages with a total, or fast cursor pages for infinite scrolling and APIs."
---

**Pagination** means showing a long list a page at a time: posts 1–25, then 26–50, and so on. It keeps responses small and the database fast.

Strutvane has two kinds:

- **`paginate(perPage, page)`**: numbered pages with a total ("page 2 of 8"). Best for tables with page numbers, like the admin screens.
- **`cursorPaginate(perPage, cursor)`**: "give me the next 25 after this one". No total, but fast at any depth and stable while rows are being added. Best for infinite scrolling and APIs.

:::tip[Coming from Laravel?]
`paginate()` and `cursorPaginate()` work like Eloquent's, with two changes: the page number is an argument (`paginate(25, 2)`) instead of being read from the request, and the result is a plain object (`{ data, total, perPage, currentPage, lastPage }`). Cursors are tied to their sort order, so a cursor from one list can't be replayed on another. `simplePaginate()` is coming in 0.2.
:::

## The smallest example

```ts
const page = await Post.query().orderBy('title').paginate(3, 2)
console.log(page.total, page.perPage, page.currentPage, page.lastPage)
console.log(page.data.map((post) => post.title))
```

**What you'll see** (with four posts in the table):

```text
4 3 2 2
[ 'Gamma' ]
```

## Numbered pages: `paginate()`

```ts
await Post.query().paginate()          // page 1, with the model's default page size (25)
await Post.query().paginate(25)        // page 1, 25 per page
await Post.query().paginate(25, 3)     // page 3
```

The result:

| Property | Meaning |
|---|---|
| `data` | the rows on this page (`Post[]`) |
| `total` | how many rows match in all |
| `perPage` | the page size used |
| `currentPage` | the page number you asked for |
| `lastPage` | the number of the last page (at least 1, even when empty) |

An empty result is still a valid page:

```ts
await Post.query().where('title', 'Nope').paginate(10)
// → { data: [], total: 0, perPage: 10, currentPage: 1, lastPage: 1 }
```

### Everything else still works

Conditions, scopes, relationships and counts combine with pagination:

```ts
const page = await Post.query()
  .published()
  .with('author')
  .withCount('tags')
  .latest()
  .paginate(25, 1)

page.data[0]?.author?.name   // loaded for the whole page in one extra query
page.data[0]?.tags_count
```

### From a request

The page number usually comes from the URL (`?page=2`). Turn it into a number and let Strutvane check it:

```ts title="app/http/controllers/post.controller.ts (excerpt)"
const pageNumber = Number(ctx.query.get('page') ?? '1')
const page = await Post.query().latest().paginate(25, pageNumber)
return ctx.json({ data: page.data, meta: { total: page.total, page: page.currentPage, perPage: page.perPage, lastPage: page.lastPage } })
```

**What you'll see** for `GET /posts?page=2`, with 30 posts (shortened):

```json
{
  "data": [ { "id": 5, "title": "Post 5" }, { "id": 4, "title": "Post 4" } ],
  "meta": { "total": 30, "page": 2, "perPage": 25, "lastPage": 2 }
}
```

A page number below 1, or something that isn't a whole number, is refused (see Common mistakes). The generated CRUD API already does all of this for you.

## Page size: the default and the limit

- Each model's default page size is **25**, the same as the API and the screens. Change it per model with the `perPage` option (the ORM prototype still defaults to 15; 0.2 uses 25):

  ```ts title="app/models/post.ts"
  export class Post extends Model('posts', { fillable: ['title'], perPage: 50 }) {}
  ```

- The largest page anyone can ask for is **100**, to protect the database. Raise it once for the whole app if you must:

  ```ts title="app/providers/app.provider.ts (excerpt)"
  import { configureOrm } from '@strutvane/framework'

  configureOrm({ maxPerPage: 500 })
  ```

## Cursor pages: `cursorPaginate()`

A **cursor** is a short, opaque string that means "continue after this row". You get it from one page and pass it back for the next.

```ts
let cursor: string | undefined
do {
  const page = await Post.query().orderBy('created_at', 'desc').cursorPaginate(25, cursor)
  for (const post of page.data) console.log(post.title)
  cursor = page.nextCursor ?? undefined
} while (cursor !== undefined)
```

The result is `{ data, perPage, nextCursor }`. `nextCursor` is `null` on the last page.

Why use it:

- **Fast at any depth.** Page 1,000 costs the same as page 1, because the database jumps straight to the right place instead of counting past the earlier rows.
- **Stable.** New rows don't shift the next page, so nothing is shown twice or skipped.
- **Every row exactly once, even with ties.** When many rows share a sort value (like `status`), Strutvane adds the key as a tie-breaker.

```ts
// Sorting by status has many equal values; the id tie-breaker keeps pages apart.
const page = await Post.query().orderBy('status', 'desc').cursorPaginate(3)
```

### Cursors are tied to their query

A cursor remembers the table and the sort order it was made for. Using it with a different order, or changing a single character, is refused instead of returning wrong rows. A cursor is not a secret, though: it holds the sort values of the last row (base64 text), so don't sort cursor pages by a column the user mustn't see.

### Cursor pages in an API

Send the cursor to the client and read it back from the next request:

```ts title="app/http/controllers/post.controller.ts (excerpt)"
const cursor = ctx.query.get('cursor') ?? undefined
const page = await Post.query().published().orderBy('created_at', 'desc').cursorPaginate(25, cursor)
return ctx.json({ data: page.data, meta: { perPage: page.perPage, nextCursor: page.nextCursor } })
```

**What you'll see** (shortened):

```json
{ "data": [ { "id": 30, "title": "Post 30" } ], "meta": { "perPage": 25, "nextCursor": "eyJmIjoicG9zdHM6Y3JlYXRlZF9hdDpkZXNjLGlkOmRlc2MiLCJ2IjpbIjIwMjYtMTEtMTRUMDk6MzA6MDAuMDAwWiIsNl19" } }
```

The client calls `GET /posts?cursor=<nextCursor>` for more, and stops when `nextCursor` is `null`.

## How the generated API pages lists

The generated CRUD API uses the same two modes, with its own URL parameters (`?page=2&perPage=25`), a maximum of 100 per page, and a `meta` object with `page`, `perPage`, `total`, `lastPage`, `from` and `to`. The admin screens show numbered pages with 10, 25, 50 or 100 rows. See [Pagination](../pagination/) for the API and the screens.

:::caution[Coming in 0.2]
`simplePaginate()` (next and previous only, without counting the total) and capping the total count at 10,000 rows on very large tables are designed but not built yet.
:::

## Which one should I use?

| You need… | Use |
|---|---|
| page numbers and "page 2 of 8" | `paginate()` |
| infinite scrolling, "load more", or a public API | `cursorPaginate()` |
| to walk through a huge table in a job | `cursorPaginate()` in a loop (streaming with `cursor()` is coming in 0.2) |

## Common mistakes

### A page size of 0 or above the limit

```text
OrmUsageError: Page size must be between 1 and 100; got 0. Raise the limit with configureOrm({ maxPerPage }).
```

**Fix:** pass a size from 1 to 100, or raise the limit with `configureOrm({ maxPerPage })` if large pages are really needed.

### Page 0

```text
OrmUsageError: Page numbers start at 1; got 0.
```

**Why:** pages are numbered from 1, like in a book.

**Fix:** default to 1 when the request has no page: `Number(ctx.query.get('page') ?? '1')`.

### A cursor from a different sort, or a tampered one

```text
OrmUsageError: That page cursor is invalid or was made for a different sort order. Start again from the first page.
```

**Fix:** keep the same `orderBy()` for every page of one list. When the user changes the sort, start again without a cursor.

### Sorting cursor pages by a column that can be empty

```text
OrmUsageError: cursorPaginate() can't sort by "body" because it can be NULL. Sort by a NOT NULL column, or use paginate().
```

**Why:** "continue after this row" doesn't work when the sort value can be missing.

**Fix:** sort by a required column (`created_at`, `title`, `id`), or use `paginate()`.

## Next steps

- [Querying](../orm-querying/): narrow down what gets paginated.
- [Search, Filters & Sorting](../crud-search/): how the generated API turns `?page=` and `?sort=` into these calls.
- [Relationships](../orm-relationships/): load related rows for a whole page at once.
