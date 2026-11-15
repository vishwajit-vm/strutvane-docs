---
title: "Collections"
description: "Work with lists of models: they're plain, typed JavaScript arrays, so map, filter, group and chunk them with the array methods you already know."
---

A **collection** is a list of models, such as the posts a query returned. In Strutvane a collection is a plain JavaScript **array**: `Post.query().get()` gives you `Post[]`. Every array method you already know (`map`, `filter`, `find`, `some`, `reduce`, `toSorted`) works, fully typed, and there's no special class to learn.

Use this page when you have a list in memory and want to reshape it: pick out titles, group posts by status, look rows up by id, or split a list into batches.

:::tip[Coming from Laravel?]
Eloquent returns an `Illuminate\Support\Collection`; Strutvane returns a native array. Most Collection methods have a direct array twin: `pluck('title')` → `map((post) => post.title)`, `filter` → `filter`, `first` → `[0]` or `find`, `groupBy` → `Object.groupBy`, `keyBy` → `new Map(...)`, `sum` → `reduce`, `chunk` → a small loop. Typed helpers for the common ones, and `cursor()`/`lazy()` streaming, are coming in 0.2. `$posts->load('author')` is `loadMany(posts, 'author')`.
:::

## The smallest example

```ts title="app/http/controllers/post.controller.ts (excerpt)"
import { Post } from '../../models/post.ts'

const posts = await Post.query().orderBy('title').get()
const titles = posts.map((post) => post.title)
console.log(titles)
```

**What you'll see:**

```text
[ 'Alpha', 'Beta', 'Delta 100%', 'Gamma' ]
```

`titles` is typed `string[]`, because `post.title` is a `string` column.

## Everyday operations

Every example below starts from `const posts = await Post.query().get()`.

| You want | Laravel Collection | Strutvane (plain array) |
|---|---|---|
| One column from every row | `$posts->pluck('title')` | `posts.map((post) => post.title)` |
| Only some rows | `$posts->filter(fn ($p) => $p->isPublished)` | `posts.filter((post) => post.isPublished)` |
| The first match | `$posts->firstWhere('status', 'draft')` | `posts.find((post) => post.status === 'draft')` |
| Whether any / all match | `contains`, `every` | `posts.some(...)`, `posts.every(...)` |
| How many | `$posts->count()` | `posts.length` |
| Empty? | `$posts->isEmpty()` | `posts.length === 0` |
| Sorted copy | `$posts->sortBy('title')` | `posts.toSorted((a, b) => a.title.localeCompare(b.title))` |
| Ids | `$posts->modelKeys()` | `posts.map((post) => post.id)` |
| JSON | `$posts->toJson()` | `JSON.stringify(posts)` (each model's `toJSON()` runs) |

### Grouping

`Object.groupBy` (built into Node 24) splits a list into groups by a key:

```ts
const byStatus = Object.groupBy(posts, (post) => post.status)
console.log(Object.keys(byStatus), byStatus.draft?.length)
```

**What you'll see** (the group order follows the rows' order):

```text
[ 'published', 'draft' ] 2
```

### Looking rows up by id

A `Map` gives you fast lookups by key (Laravel's `keyBy`):

```ts
const byId = new Map(posts.map((post) => [post.id, post]))
console.log(byId.get(1)?.title)
// → Alpha
```

### Adding up numbers

Remember that decimal columns are exact **strings** (see [Casts](../orm-casts/)). Convert them deliberately, and round only at the end:

```ts
// projects.budget is t.decimal('budget', 12, 2), read as '1200.50', '300.25', …
const projects = await runWithTenant(teamId, () => Project.all())
const totalCents = projects.reduce((sum, project) => sum + Math.round(Number(project.budget) * 100), 0)
console.log((totalCents / 100).toFixed(2))
// → 1500.75
```

Working in whole cents keeps floating-point rounding out of the total.

### Splitting into batches

To send a list to another service 100 at a time (Laravel's `chunk(100)`):

```ts
for (let start = 0; start < posts.length; start += 100) {
  const batch = posts.slice(start, start + 100)
  await searchIndex.upload(batch.map((post) => post.toJSON())) // your own service
}
```

## Do the work in the database when you can

Filtering, sorting and counting in JavaScript means loading every row first. For anything bigger than a handful of rows, ask the database instead:

| Instead of | Write |
|---|---|
| `(await Post.all()).filter((p) => p.status === 'draft')` | `await Post.where('status', 'draft').get()` |
| `(await Post.all()).length` | `await Post.query().count()` |
| `(await Post.all()).slice(0, 10)` | `await Post.query().limit(10).get()` |
| `(await Post.all()).some((p) => p.slug === slug)` | `await Post.query().where('slug', slug).exists()` |
| counting each user's posts in a loop | `await User.query().withCount('posts').get()` |

The database only sends the rows you need, and it can use its indexes.

## Lists and relationships

Load a relationship for a whole list at once, never inside a loop. The best place is the query itself, which also gives the list the right type:

```ts
const posts = await Post.query().with('author', 'tags').latest().limit(20).get()  // 3 queries for all 20 posts
const names = posts.map((post) => post.author?.name)                             // typed: (string | undefined)[]
```

If you already have the list, `loadMany(posts, 'author')` fills it in with one query (see [Relationships](../orm-relationships/)).

## Walking through a huge table

An array holds every row in memory. For a table with millions of rows, page through it with a cursor so only one page is in memory at a time:

```ts title="app/jobs/reindex-posts.ts (excerpt)"
let cursor: string | undefined
do {
  const page = await Post.query().orderBy('id').cursorPaginate(500, cursor)
  await searchIndex.upload(page.data.map((post) => post.toJSON()))
  cursor = page.nextCursor ?? undefined
} while (cursor !== undefined)
```

See [Pagination](../orm-pagination/) for how cursors stay correct while rows are being added.

:::caution[Coming in 0.2]
Designed but not built yet: typed helpers for the common Collection methods on ORM results (`pluck`, `keyBy`, `groupBy`, `chunk`), and streaming with `Post.query().cursor()` and `lazy()` as async iterators (`for await (const post of …)`), which replace the cursor loop above. Native arrays stay the default; Strutvane won't ship a full copy of Laravel's Collection class.
:::

## Common mistakes

### "Property 'map' does not exist on type 'Promise<Post[]>'"

```text
error TS2339: Property 'map' does not exist on type 'Promise<Post[]>'.
```

**Why:** the query returns a promise; the array only exists after it finishes.

**Fix:** `await` it first:

```ts
const titles = (await Post.query().get()).map((post) => post.title)
```

### Adding decimals glues strings together

```ts
projects[0].budget + projects[1].budget // → '1200.50300.25', not 1500.75
```

**Why:** decimal columns are strings, so `+` joins them.

**Fix:** convert on purpose (`Number(project.budget)`), ideally to whole cents as shown above.

### Loading a relationship inside `map` or a loop

```text
LazyLoadingError: You're loading "author" one "posts" row at a time (an N+1 query). Load it for the whole list instead: Model.query().with('author'), or await loadMany(models, 'author').
```

**Fix:** `await loadMany(posts, 'author')` before the loop, or add `with('author')` to the query.

### `JSON.stringify` shows a getter's value as missing

**Why:** getters (accessors) like `post.isPublished` aren't part of `toJSON()`.

**Fix:** map to the shape you want: `posts.map((post) => ({ ...post.toJSON(), isPublished: post.isPublished }))`, or use an [API resource](../orm-resources/).

## Next steps

- [Querying](../orm-querying/): let the database do the filtering.
- [Pagination](../orm-pagination/): page through long lists.
- [API Resources](../orm-resources/): shape lists for JSON responses.
