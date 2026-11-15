---
title: "Serialization"
description: "Turn models into JSON for your API: what toJSON() returns, hiding columns, dates and decimals, loaded relations and counts, the typed JsonOf and PostJson shapes, and what's coming (visible, appends)."
---

**Serialization** means turning a model into plain data you can send, usually JSON: `{ "id": 1, "title": "Hello" }`. Every model has a `toJSON()` method that does it, and `JSON.stringify(post)` and `ctx.json(post)` call it for you. This page shows exactly what comes out, how to keep columns out, and how the TypeScript types follow along.

:::tip[Coming from Laravel?]
`$post->toArray()` and `$post->toJson()` become `post.toJSON()` (one method; `JSON.stringify` turns it into text). `$hidden` moves into the model options (`Model('users', { hidden: ['password'] })`) and is reflected **in the type**: `user.toJSON().password` doesn't compile. Dates are always ISO 8601 strings in UTC. `$visible`, `$appends`, `makeVisible()` and `makeHidden()` are coming in 0.2; until then, [API Resources](../orm-resources/) give you full control.
:::

## The smallest example

```ts title="app/http/controllers/post.controller.ts (excerpt)"
import { Post } from '../../models/post.ts'

const post = await Post.findOrFail(1)
return ctx.json({ data: post })
```

**What you'll see** (the response body):

```json
{
  "data": {
    "id": 1,
    "title": "Hello world",
    "slug": "hello-world",
    "body": null,
    "status": "published",
    "published_on": "2026-11-15",
    "meta": { "pinned": true },
    "author_id": 1,
    "created_at": "2026-11-15T09:30:00.000Z",
    "updated_at": "2026-11-15T09:41:12.000Z",
    "deleted_at": null
  }
}
```

Every column is there, under its migration name, with a JSON-friendly value.

## How each kind of value comes out

| Column | In your code | In the JSON |
|---|---|---|
| `t.id()`, `t.integer()`, `t.foreignId()` | `1` | `1` |
| `t.string()`, `t.text()`, `t.slug()`, `t.uuid()` | `'hello'` | `"hello"` |
| `t.enum()` | `'draft'` | `"draft"` |
| `t.boolean()` | `true` (even on MySQL and SQLite, which store `1`) | `true` |
| `t.decimal()` | `'12.50'` (a string, so no cents are lost) | `"12.50"` |
| `t.double()` | `4.5` | `4.5` |
| `t.date()` | `'2026-11-15'` | `"2026-11-15"` |
| `t.timestamp()`, `created_at`, `updated_at`, `deleted_at` | a `Date` | `"2026-11-15T09:30:00.000Z"` (ISO 8601, UTC, with milliseconds) |
| `t.json()` | the parsed value (an object, a list…) | the same value |
| an empty (`NULL`) column | `null` | `null` |

Why ISO and UTC: every client (a browser, a phone app, another server) reads the same instant the same way, whatever its time zone. Show it in the user's local time on the client.

Why decimals are strings: JavaScript numbers can't hold every decimal exactly (`0.1 + 0.2` isn't `0.3`). A string keeps `12.50` exact all the way to the client.

## Hiding columns: `hidden`

List columns that must never leave the server:

```ts title="app/models/user.ts"
import { Model } from '@strutvane/framework'

export class User extends Model('users', {
  fillable: ['name', 'email'],
  hidden: ['password', 'remember_token'],
}) {}
```

```ts
const user = await User.findOrFail(1)
console.log(user.toJSON())
```

**What you'll see:**

```text
{ id: 1, name: 'Ada', email: 'ada@example.com', created_at: '2026-11-15T09:00:00.000Z', updated_at: '2026-11-15T09:00:00.000Z' }
```

The hidden keys are missing from the **type** too, so a mistake is caught by your editor:

```ts
const json = user.toJSON()
json.password // compile error: Property 'password' does not exist
```

Your own code still reads `user.password` normally; `hidden` only affects serialization.

Three more layers protect secrets, whatever you write in `hidden`:

- columns named `password`, `remember_token` or `two_factor_secret`, or ending in `_secret` or `_token`, are never returned by the generated API;
- columns marked `.secret()` or `.hidden()` in the migration are left out of the API and the screens *(coming in 0.2)*;
- the logger redacts secret-looking keys (see [Logging](../logging/)).

## Relations and counts in the output

Relations you **loaded** are nested in, each with its own `hidden` applied. Counts from `withCount()` appear as `<relation>_count`:

```ts
const post = await Post.query().with('author', 'tags').withCount('tags').findOrFail(1)
console.log(JSON.stringify(post, null, 2))
```

**What you'll see** (shortened):

```json
{
  "id": 1,
  "title": "Hello world",
  "author_id": 1,
  "author": { "id": 1, "name": "Ada", "email": "ada@example.com" },
  "tags": [ { "id": 3, "name": "news" }, { "id": 5, "name": "launch" } ],
  "tags_count": 2
}
```

`author` has no `password`, because the `User` model hides it. Relations you **didn't** load are left out: serializing never runs a query, so it can't cause an N+1 problem (see [Relationships](../orm-relationships/)).

## Lists and pages

A list is an array of models, so it becomes an array of objects:

```ts
const posts = await Post.query().latest().limit(2).get()
JSON.stringify(posts) // [{ "id": 2, … }, { "id": 1, … }]
```

A page from `paginate()` is a plain object whose `data` holds the models:

```ts
const page = await Post.query().latest().paginate(25, 1)
return ctx.json({ data: page.data, meta: { page: page.currentPage, perPage: page.perPage, total: page.total, lastPage: page.lastPage } })
```

See [Pagination](../pagination/#your-own-endpoints-the-same-shape) for the full `meta` block the generated API uses.

## The types: `JsonOf` and `PostJson`

Two types describe serialized data; they always match what `toJSON()` returns.

**`JsonOf<T>`** is the type of `toJSON()` for a model value **as you loaded it**: hidden columns removed, dates as strings, loaded relations and counts included.

```ts
import type { JsonOf } from '@strutvane/framework'

const post = await Post.query().with('author').withCount('tags').findOrFail(1)
type PostOut = JsonOf<typeof post>
// { id: number; title: string; …; created_at: string | null;
//   author: { id: number; name: string; … } | null; tags_count: number }
```

**`PostJson`** is generated by `node strut migrate` into `.strutvane/types/models.d.ts`, one per table: the columns as the API returns them (dates as strings, secret-looking columns removed), without relations. Front-end code and the generated API client use it.

```ts title=".strutvane/types/models.d.ts (excerpt)"
export interface PostJson {
  id: number
  title: string
  slug: string
  body: string | null
  status: 'draft' | 'published'
  author_id: number
  created_at: string | null
  updated_at: string | null
  deleted_at: string | null
}
```

| | `JsonOf<typeof post>` | `PostJson` |
|---|---|---|
| Where it comes from | Your model and how you queried it | Your migrations |
| Includes loaded relations and counts | Yes | No |
| Respects the model's `hidden` | Yes | No (it removes secret-looking names only) |
| Use it in | Server code, controllers, tests | Front-end code, the generated client |

## Getters and computed values

Getters on a model (`get isPublished()`) are **not** in `toJSON()`: serialization outputs columns, loaded relations and counts only. To send a computed value, build the response yourself or with an API resource:

```ts
const post = await Post.findOrFail(1)
return ctx.json({ data: { ...post.toJSON(), is_published: post.isPublished } })
```

**What you'll see:** the usual post fields plus `"is_published": true`.

## Small, typical, advanced

- **Small:** `ctx.json(post)`: every column, dates as strings.
- **Typical:** `hidden` on the model, relations loaded with `with()`, a list or page in `data`.
- **Advanced:** a different shape per audience (rename fields, add computed values, include fields only for admins) with a typed transformer or an [API resource](../orm-resources/).

## Coming in 0.2

:::caution[Coming in 0.2]
These are designed as model options and methods, Laravel-style, but not built yet:

- `visible: ['id', 'title']`: an allowlist instead of `hidden`;
- `appends: ['is_published']`: add getters to the JSON;
- `post.makeVisible('…')` and `post.makeHidden('…')` for one response.

Until then, use `hidden` plus an [API resource](../orm-resources/) or a small transformer for anything else.
:::

## Common mistakes

### A secret column appears in the API

**Why:** its name doesn't look secret (`api_key_hint`), and it isn't in the model's `hidden`.
**Fix:** add it to `hidden`, and in 0.2 mark it `.secret()` in the migration:

```ts
export class User extends Model('users', { fillable: ['name'], hidden: ['password', 'api_key_hint'] }) {}
```

### "hides …, but … has no such column"

```text
OrmUsageError: User hides "pasword", but "users" has no such column.
```

**Why:** a typo in `hidden`. Strutvane refuses it at start-up rather than silently hiding nothing.
**Fix:** use the column's exact migration name: `hidden: ['password']`.

### A getter is missing from the JSON

**Why:** getters aren't serialized.
**Fix:** add it yourself (`{ ...post.toJSON(), is_published: post.isPublished }`) or use an API resource.

### A relation is missing from the JSON

**Why:** it wasn't loaded; serializing never runs queries.
**Fix:** load it in the query: `Post.query().with('author')`.

### Dates show the wrong time in the browser

**Why:** the JSON holds UTC (`…Z`), and the page prints it as text.
**Fix:** convert on the client: `new Date(post.created_at).toLocaleString()`.

## Next steps

- [API Resources](../orm-resources/): shape the JSON per endpoint.
- [Relationships](../orm-relationships/): load what you want serialized.
- [Casts & Accessors](../orm-casts/): how values are converted on the way in and out.
