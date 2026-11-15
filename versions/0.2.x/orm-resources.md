---
title: "API Resources"
description: "Decide exactly what a model looks like in your JSON responses: what toJSON() and hidden give you today, how to write a typed transformer now, and the API resources arriving in 0.2."
---

When your API returns a post, it sends JSON. An **API resource** is a small layer between your model and that JSON: it says which fields go out, under which names, with which related data. It's the public face of a model.

You want one as soon as the JSON is seen by someone outside your team (a mobile app, a partner, the public), because the database and the API then change at different speeds. Without a resource, a column you add next month appears in the API automatically, whether you meant it to or not.

:::tip[Coming from Laravel?]
Laravel's `JsonResource` (`PostResource::make($post)`, `PostResource::collection($posts)`, `whenLoaded`, `whenCounted`) is designed for Strutvane as `defineResource()` and `node strut make:resource`, and arrives in 0.2. Today you have the same building blocks Laravel's `$hidden` gives you: `hidden` columns are left out of `toJSON()` and of its TypeScript type. A plain typed function does the rest until resources ship.
:::

## What you get today: `toJSON()` and `hidden`

Every model turns itself into JSON with `toJSON()`, and `JSON.stringify(post)` or `ctx.json(post)` call it for you:

- every column, except those listed in `hidden`;
- dates as ISO strings (`'2026-11-14T09:30:00.000Z'`);
- loaded relationships nested, each with its **own** `hidden` columns removed;
- `withCount()` counts as `<relation>_count`.

```ts title="app/models/user.ts"
import { Model } from '@strutvane/framework'

export class User extends Model('users', {
  fillable: ['name', 'email', 'password'],
  hidden: ['password'],
}) {}
```

```ts
const user = await User.findOrFail(1)
console.log(JSON.stringify(user))
```

**What you'll see:**

```text
{"id":1,"name":"Ada","email":"ada@example.test","is_admin":false,"created_at":"2026-11-14T09:30:00.000Z","updated_at":"2026-11-14T09:30:00.000Z"}
```

No `password`. The TypeScript type of `user.toJSON()` (`JsonOf<User>`) has no `password` key either, so code that tries to read it doesn't compile.

The generated CRUD API adds one more safety net: columns whose names look like secrets (`password`, `remember_token`, `two_factor_secret`, anything ending in `_token` or `_secret`) are never returned, searched or sorted, whatever the model says. Marking any other column as secret or hidden right in the migration (`.secret()`, `.hidden()`) is designed for 0.2 but not built yet.

## A typed transformer, today

When you want control over the output (a renamed field, a computed value, only some columns), write a plain function. It's fully typed, and new columns only appear when you add them:

```ts title="app/http/resources/post.resource.ts"
import type { WithRelations } from '@strutvane/framework'
import type { Post } from '../../models/post.ts'

/** A post as the public API shows it. */
export interface PostResource {
  id: number
  title: string
  slug: string
  status: 'draft' | 'published'
  isPublished: boolean
  publishedOn: string | null
  author: { id: number; name: string } | null
}

/** Turns a post (with its author loaded) into its public JSON shape. */
export function postResource(post: WithRelations<Post, 'author'>): PostResource {
  return {
    id: post.id,
    title: post.title,
    slug: post.slug,
    status: post.status,
    isPublished: post.isPublished,
    publishedOn: post.published_on,
    author: post.author === null ? null : { id: post.author.id, name: post.author.name },
  }
}
```

Use it in a controller:

```ts title="app/http/controllers/post.controller.ts (excerpt)"
import { postResource } from '../resources/post.resource.ts'

const post = await Post.query().with('author').findOrFail(1)
return ctx.json({ data: postResource(post) })
```

**What you'll see:**

```json
{
  "data": {
    "id": 1,
    "title": "Hello world",
    "slug": "hello-world",
    "status": "published",
    "isPublished": true,
    "publishedOn": "2026-11-14",
    "author": { "id": 1, "name": "Ada" }
  }
}
```

`WithRelations<Post, 'author'>` is the type of a post with `author` loaded, so forgetting `with('author')` is a compile error, not a silent `null`.

### A list with page details

```ts title="app/http/controllers/post.controller.ts (excerpt)"
const page = await Post.query().published().with('author').latest().paginate(25, Number(ctx.query.get('page') ?? '1'))
return ctx.json({
  data: page.data.map(postResource),
  meta: { total: page.total, page: page.currentPage, perPage: page.perPage, lastPage: page.lastPage },
})
```

**What you'll see** (shortened):

```json
{ "data": [ { "id": 7, "title": "Newest post", "author": { "id": 2, "name": "Grace" } } ], "meta": { "total": 31, "page": 1, "perPage": 25, "lastPage": 2 } }
```

### Fields only some users may see

Pass what you know about the viewer, and add fields conditionally:

```ts title="app/http/resources/user.resource.ts"
import type { User } from '../../models/user.ts'

export function userResource(user: User, viewerIsAdmin: boolean) {
  return {
    id: user.id,
    name: user.name,
    ...(viewerIsAdmin ? { email: user.email, isAdmin: user.is_admin } : {}),
  }
}
```

## API resources (coming in 0.2)

:::caution[Coming in 0.2]
Designed but not built yet; names may still change. `node strut make:resource PostResource` will write a resource file, and resources will be typed transformers used both by your controllers and by the generated CRUD API:

```ts title="app/http/resources/post.resource.ts"
export const PostResource = defineResource(Post, (post, { whenLoaded, whenCounted }) => ({
  id: post.id,
  title: post.title,
  author: whenLoaded(post, 'author', UserResource),
  tags: whenCounted(post, 'tags'),
}))

return PostResource.page(await Post.query().with('author').paginate(25))
// → { data: [...], meta: { total, … }, links: { … } }
```

`whenLoaded` includes a relationship only when it was loaded (so a resource never triggers extra queries), `whenCounted` does the same for counts, and `.page()` adds the pagination details. A resource is also a good place for computed fields. Laravel's `$appends` and `$visible` (an allowlist of serialised columns) are designed as model options for 0.2 but not built; until then, use a transformer when you need them.
:::

## Common mistakes

### A new column suddenly appears in the API

**Why:** `toJSON()` includes every column that isn't hidden, so a column added by a later migration is sent too.

**Fix:** return a transformer's output (above) for public endpoints, or add the column to `hidden` if it must never leave the server.

### A getter is missing from the JSON

**Why:** getters (accessors) such as `isPublished` aren't part of `toJSON()`.

**Fix:** add them in a transformer: `isPublished: post.isPublished`.

### Passing a post without its author to the transformer

**What you'll see:** a compile error on the call `postResource(post)`, something like "Argument of type 'Post' is not assignable to parameter of type 'WithRelations<Post, "author">'".

**Why:** the transformer expects the author to be loaded, but the query didn't load it, so `post.author` is still the relationship method.

**Fix:** add `with('author')` to the query (and type the parameter as `WithRelations<Post, 'author'>`, so TypeScript reminds you).

### A `hidden` column that doesn't exist

```text
OrmUsageError: User hides "passwd", but "users" has no such column.
```

**Fix:** use the column name from the migration (`password`).

## Next steps

- [ORM: Getting Started](../orm/): `toJSON()` and `hidden` in context.
- [Responses](../responses/): sending JSON from a controller.
- [Pagination](../orm-pagination/): the page details to send with lists.
