---
title: "Pagination"
description: "Split long lists into pages: numbered and cursor pages in your queries, the generated API's ?page and ?perPage, the meta block clients read, the admin screens, and how to make your own endpoints page the same way."
---

**Pagination** means showing a long list one **page** at a time (say 25 rows), with a way to go to the next one. It keeps pages fast, keeps responses small, and protects your database from "give me all 2 million rows". Strutvane paginates in three places that fit together: your **queries**, the generated **API**, and the **admin screens**.

:::tip[Coming from Laravel?]
Same two kinds: `paginate()` (numbered pages with a total) and `cursorPaginate()` (a "next" token, fast at any depth). `Post::paginate(25)` becomes `await Post.query().paginate(25, page)`: you pass the page number yourself, because there's no global request. The result is a plain object (`{ data, total, perPage, currentPage, lastPage }`), and the generated API answers `?page=2&perPage=25` with `{ data, meta }`. `simplePaginate()` is coming in 0.2.
:::

## The smallest example

```ts title="app/http/controllers/post.controller.ts (excerpt)"
import { Post } from '../../models/post.ts'

const page = await Post.query().latest().paginate(25, 2)
console.log(page.currentPage, page.lastPage, page.total, page.data.length)
```

**What you'll see** with 30 posts:

```text
2 2 30 5
```

Page 2 of 2: 30 posts in all, and the 5 left over after the first 25.

## The two kinds of pages

| | Numbered pages (offset) | Cursor pages |
|---|---|---|
| **Looks like** | "Page 2 of 8", jump to any page | "Load more" or infinite scroll |
| **Query method** | `paginate(perPage, page)` | `cursorPaginate(perPage, cursor)` |
| **Returns** | `{ data, total, perPage, currentPage, lastPage }` | `{ data, perPage, nextCursor }` |
| **Cost** | Counts every matching row, and skips the earlier ones: slower on deep pages of huge tables | The same at any depth: the database jumps straight to the right place |
| **When rows are added while reading** | A row can show twice or be skipped | Never: each row exactly once |
| **Sort columns** | Any | Must be required (`NOT NULL`) columns |
| **Use it for** | Admin tables, search results, most lists | Feeds, exports, very long lists, APIs other programs walk through |

Both are explained with every option on [ORM: Pagination](../orm-pagination/). The rest of this page is about the API, the screens and your own endpoints.

## Page size

| Setting | Value | Change it |
|---|---|---|
| A model's default page size (your queries and its API) | 25 | `Model('posts', { fillable: [...], perPage: 50 })` |
| The admin screens' default | 25, with a choice of 10, 25, 50 or 100 | `pageSize: 50` in `resources/ui/posts.ui.ts` |
| The largest page anyone may ask for | 100 | `configureOrm({ maxPerPage: 500 })` (think twice) |

The limit protects your database: without it, `?perPage=1000000` would be a one-line attack.

:::caution[Coming in 0.2]
The API, the screens and `paginate()` all default to 25 (decided 2026-11-15). The ORM and API prototypes still default to 15.
:::

## The generated API

Every generated list endpoint (see [Auto CRUD](../crud/)) takes the page from the URL:

```text
GET /api/posts?page=2&perPage=25
```

| Parameter | Meaning | Default | Allowed |
|---|---|---|---|
| `page` | Which page, starting at 1 | `1` | whole numbers from 1 |
| `perPage` | Rows per page | the model's `perPage` | 1 to 100 |

It combines with search, filters and sorting: `GET /api/posts?page=2&perPage=25&search=launch&sort=-created_at&filter[status]=published`.

**What you'll see** (shortened):

```json
{
  "data": [
    { "id": 5, "title": "Post 5", "slug": "post-5", "status": "published" },
    { "id": 4, "title": "Post 4", "slug": "post-4", "status": "published" }
  ],
  "meta": { "page": 2, "perPage": 25, "total": 27, "lastPage": 2, "from": 26, "to": 27 }
}
```

| `meta` field | Meaning |
|---|---|
| `page` | The page you got |
| `perPage` | Rows per page |
| `total` | Matching rows in all |
| `lastPage` | The last page number (at least 1, even when there are no rows) |
| `from`, `to` | The position of the first and last row on this page ("Showing 26 to 27 of 27"), or `null` when the page is empty |

A page past the end returns `"data": []` with `from` and `to` set to `null`, not an error, so a client can show "No more results".

### The order is always stable

Every page is sorted with a **tie-breaker**: after your sort columns, rows are ordered by `id`, and empty values always come last on every database. Without that, two rows with the same `created_at` could swap places between requests, and a row could appear on page 1 and again on page 2.

### Cursor pages in the API

```text
GET /api/posts?cursor=eyJmIjoi…&perPage=25
```

The response's `meta` then carries `nextCursor` instead of `total` and `lastPage`; the client stops when it's `null`.

:::caution[Coming in 0.2]
Page-number pagination of the generated API is proven in the schema prototype (identical answers on SQLite and PostgreSQL over 108 requests). The cursor mode of the generated API, and capping `total` at 10,000 rows on very large tables (so counting never becomes the slow part), are designed and arrive with 0.2. Cursor pages in your own code (`cursorPaginate()`) already work in the ORM prototype.
:::

## The admin screens

The screens show **numbered pages**: the rows, "Showing 26 to 50 of 132", page buttons, and a page-size menu (10, 25, 50, 100). The page, size, search, filters and sort are kept in the address bar, so a link or the back button brings you to the same page. Set the default per screen:

```ts title="resources/ui/posts.ui.ts"
import { auto, defineResourceUi } from '@strutvane/ui/define'

export default defineResourceUi('posts', {
  columns: auto(),
  form: auto(),
  pageSize: 50,
  defaultSort: '-created_at',
})
```

See [Customising the CRUD](../crud-customising/) for every screen option.

## Your own endpoints, the same shape

When you write your own controller, answer in the same `{ data, meta }` shape as the generated API, so the generated client and screens can read it:

```ts title="app/http/controllers/feed.controller.ts"
import { Controller, type HttpContext } from '@strutvane/framework'
import { Post } from '../../models/post.ts'

const PER_PAGE = 25

/** GET /api/feed: published posts, newest first, numbered pages. */
export class FeedController extends Controller {
  async index(ctx: HttpContext): Promise<Response> {
    const pageNumber = Number(ctx.query.get('page') ?? '1')
    const page = await Post.query().where('status', 'published').with('author').latest().paginate(PER_PAGE, pageNumber)
    const offset = (page.currentPage - 1) * page.perPage
    return ctx.json({
      data: page.data,
      meta: {
        page: page.currentPage,
        perPage: page.perPage,
        total: page.total,
        lastPage: page.lastPage,
        from: page.data.length === 0 ? null : offset + 1,
        to: page.data.length === 0 ? null : offset + page.data.length,
      },
    })
  }
}
```

**What you'll see** for `GET /api/feed?page=1` with 3 published posts:

```json
{
  "data": [ { "id": 3, "title": "Launch", "author": { "id": 1, "name": "Ada" } } ],
  "meta": { "page": 1, "perPage": 25, "total": 3, "lastPage": 1, "from": 1, "to": 3 }
}
```

(The data is shortened to one post.) A bad page number such as `?page=0` or `?page=abc` makes `paginate()` throw an `OrmUsageError` with the code `invalid_page` before any SQL runs; answer it with a 400 (the generated API checks the page for you and answers 422).

:::note[Small, typical, advanced]
- **Small:** `await Post.query().paginate()` gives page 1 at the model's default size.
- **Typical:** the controller above.
- **Advanced:** for an endless feed, swap `paginate(PER_PAGE, pageNumber)` for `cursorPaginate(PER_PAGE, ctx.query.get('cursor') ?? undefined)` and return `nextCursor` in `meta` (see [ORM: Pagination](../orm-pagination/#cursor-pages-in-an-api)).
:::

## Coming later

| Feature | Status |
|---|---|
| `simplePaginate()`: next and previous only, without counting the total (Laravel's "simple" paginator) | Coming in 0.2 |
| Cursor mode in the generated API | Coming in 0.2 |
| Total capped at 10,000 on very large tables | Coming in 0.2 |
| A helper that turns a page into the API's `meta` block for you | Coming in 0.2 (part of API resources; see [API Resources](../orm-resources/)) |

## Common mistakes

### The API answers 422 for my page size

```json
{
  "type": "https://strutvane.dev/problems/validation_failed",
  "title": "Some fields need attention",
  "status": 422,
  "code": "validation_failed",
  "detail": "Fix the fields listed in `issues` and try again.",
  "issues": [{ "path": ["perPage"], "field": "perPage", "code": "invalid_integer", "message": "Page size must be a whole number from 1 to 100." }]
}
```

**Why:** `perPage` was 0, above 100, or not a whole number.
**Fix:** ask for 100 or fewer and walk through the pages, or use cursor pages for exports.

### "Page size must be between 1 and 100"

```text
OrmUsageError: Page size must be between 1 and 100; got 500. Raise the limit with configureOrm({ maxPerPage }).
```

**Why:** your own code asked `paginate()` for more than the limit.
**Fix:** page through the list, or raise the limit once with `configureOrm({ maxPerPage })` if you're sure.

### "Page numbers start at 1"

```text
OrmUsageError: Page numbers start at 1; got 0.
```

**Why:** `Number(undefined)` is `NaN` and `Number('')` is `0`: a missing `?page` wasn't given a default.
**Fix:** `Number(ctx.query.get('page') ?? '1')`.

### The same row shows up on two pages

**Why:** your own SQL (outside the ORM) sorts by a column with equal values and no tie-breaker, or rows were added between two numbered-page requests.
**Fix:** use the ORM, which always adds the `id` tie-breaker; for lists that change while people read them, use cursor pages.

### Deep pages are slow on a huge table

**Why:** numbered pages count every matching row and skip all the earlier ones.
**Fix:** use `cursorPaginate()` for long lists; put an index on the sort column (see [Migrations](../migrations/#indexes)).

## Next steps

- [ORM: Pagination](../orm-pagination/): `paginate()` and `cursorPaginate()` with every option.
- [Query Builder](../queries/): search, filter and sort on the same query.
- [Auto CRUD](../crud/): the generated API and screens that use these pages.
