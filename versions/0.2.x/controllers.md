---
title: Controllers
description: Group request handling into controller classes. Plain controllers, constructor injection, ResourceController with its hooks (indexConstraints, prepareForStore, prepareForUpdate, visible), custom actions, and every make:controller variant.
---

A **controller** is a class whose methods (called **actions**) answer requests. Instead of writing every route's code inside `routes/api.ts`, you point the route at a controller action, and keep related actions together: everything about posts in `PostController`.

Controllers live in `app/http/controllers/`, one per file, named `post.controller.ts`.

:::tip[Coming from Laravel?]
Same idea. `php artisan make:controller PostController --resource` is `node strut make:controller PostController --resource`.

What's new is `ResourceController`: a base class that already implements `index`, `show`, `store`, `update` and `destroy` (pagination, search, sorting, filters, validation, policies, problem+json errors). You set the model and the policy, and override only the steps you want to change. Each action receives one `ctx` argument instead of injected `Request $request, Post $post`.
:::

## The smallest example

```bash
node strut make:controller ReportController
```

What you'll see:

```text
  Created app/http/controllers/report.controller.ts
```

The new file:

```ts title="app/http/controllers/report.controller.ts"
import { Controller, type HttpContext } from '@strutvane/framework'

/** TODO: say what this controller is for. */
export class ReportController extends Controller {
  // Add actions, then route them in routes/api.ts or routes/web.ts, for example:
  // Route.get('/reports', [ReportController, 'index']).name('reports.index')
  index(ctx: HttpContext): Response {
    return ctx.json({ data: [] })
  }
}
```

Route it:

```ts title="routes/api.ts"
Route.get('/reports', [ReportController, 'index']).name('reports.index'),
```

`GET /api/reports` answers `{ "data": [] }`.

## Plain controllers

An action takes `ctx` (the [request context](../requests/)) and returns a `Response`, or a `Promise` of one:

```ts title="app/http/controllers/profile.controller.ts"
import { Controller, type HttpContext } from '@strutvane/framework'
import { Post } from '../../models/post.ts'

export class ProfileController extends Controller {
  /** GET /api/me */
  show(ctx: HttpContext): Response {
    return ctx.json({ data: ctx.requireUser() })
  }

  /** GET /api/me/posts?status=draft */
  async posts(ctx: HttpContext): Promise<Response> {
    const user = ctx.requireUser()
    const status = ctx.query.get('status') ?? 'published'
    const posts = await Post.query().where('author_id', user.id).where('status', status).get()
    return ctx.json({ data: posts })
  }
}
```

**Why write the return type (`: Response`, `: Promise<Response>`)?** Your routes file reads the controller's types, and your controller may call `route()`, which reads the routes file. Writing the return type stops TypeScript from going round in that circle. Generated controllers always include it.

A **new controller object is made for every request**, so it's safe to keep per-request values on `this`; they never leak to another user.

## Constructor injection

A controller that needs a service lists it in `static inject`; the container passes it to the constructor:

```ts title="app/http/controllers/stats.controller.ts"
import { ConnectionToken, Controller, type Connection, type HttpContext } from '@strutvane/framework'

/** Admin statistics. */
export class StatsController extends Controller {
  static readonly inject = [ConnectionToken] as const
  readonly #db: Connection

  constructor(db: Connection) {
    super()
    this.#db = db
  }

  /** GET /api/admin/stats */
  async show(ctx: HttpContext): Promise<Response> {
    const [posts] = await this.#db.select('SELECT COUNT(*) AS "total" FROM "posts" WHERE "deleted_at" IS NULL')
    const [authors] = await this.#db.select('SELECT COUNT(*) AS "total" FROM "authors"')
    return ctx.json({ data: { posts: Number(posts?.['total'] ?? 0), authors: Number(authors?.['total'] ?? 0) } })
  }
}
```

What you'll see:

```json
{ "data": { "posts": 5, "authors": 3 } }
```

If the `inject` list doesn't match the constructor, it doesn't compile. See [Service Container](../container/).

## ResourceController: a whole API in a few lines

For a model that needs the standard API, extend `ResourceController` and set two things: the **model** and the **policy** (who may do what; see [Authorization](../authorization/)).

```ts title="app/http/controllers/author.controller.ts"
import { ResourceController } from '@strutvane/framework'
import { Author } from '../../models/author.ts'
import { AuthorPolicy } from '../../policies/author.policy.ts'

/** Author profiles. */
export class AuthorController extends ResourceController<typeof Author> {
  protected readonly model = Author
  protected readonly policy = new AuthorPolicy()
}
```

```ts title="routes/api.ts"
Route.apiResource('authors', AuthorController),
```

That's the whole controller. You get:

| Request | Action | What it does | Checks the policy's |
|---|---|---|---|
| `GET /api/authors` | `index` | One page, with `?page`, `?perPage`, `?search`, `?sort`, `?filter[…]` | `viewAny` |
| `GET /api/authors/{author}` | `show` | The bound record | `view` |
| `POST /api/authors` | `store` | Validate, check unique columns, create; `201` + `Location` | `create` |
| `PATCH /api/authors/{author}` | `update` | Validate (every field optional), check uniques, save | `view`, then `update` |
| `DELETE /api/authors/{author}` | `destroy` | Delete (soft delete when the table has `deleted_at`); `204` | `view`, then `delete` |

What you'll see for `GET /api/authors?search=ada&sort=-created_at`:

```json
{
  "data": [{ "id": 1, "name": "Ada Admin", "email": "ada@example.test", "bio": null, "created_at": "2026-11-14T10:00:00.000Z" }],
  "meta": { "page": 1, "perPage": 15, "total": 1, "lastPage": 1, "from": 1, "to": 1 }
}
```

Hidden columns (like `api_token`) are never returned.

### Your own validation: `storeRequest` and `updateRequest`

By default, validation rules come from your migrations (required columns, lengths, enums) and the model's `fillable` list. Point at your own [form requests](../validation/) to take over:

```ts title="app/http/controllers/post.controller.ts"
export class PostController extends ResourceController<typeof Post> {
  protected readonly model = Post
  protected readonly policy = new PostPolicy()
  protected override readonly storeRequest = new StorePostRequest()
  protected override readonly updateRequest = new UpdatePostRequest()
}
```

### Hook: `indexConstraints()`: which rows a user may list

`index` checks `viewAny`, but "may list posts" doesn't mean "may see every post". Narrow the list per user:

```ts
protected override indexConstraints(ctx: HttpContext): Constraint[] {
  if (ctx.user?.is_admin === true) return []
  const visible: Constraint[] = [{ column: 'status', equals: 'published' }]
  if (ctx.user !== null) visible.push({ column: 'author_id', equals: ctx.user.id })
  return [{ anyOf: visible }]
}
```

A **constraint** is `{ column, equals }`, or `{ anyOf: [...] }` for "any of these". Constraints are combined with AND; `anyOf` means OR inside it.

What you'll see: a guest gets only published posts; Alice also sees her own drafts; an admin sees everything. The `meta.total` matches what each person can see.

### Hook: `prepareForStore()`: set values the client must not send

Some values come from the server, never from the request body, like who wrote a post:

```ts
protected override prepareForStore(values: Record<string, unknown>, ctx: HttpContext): Record<string, unknown> {
  return { ...values, author_id: ctx.requireUser().id }
}
```

What you'll see for `POST /api/posts {"title":"Crème brûlée tips"}` as Alice (id 3):

```text
HTTP/1.1 201 Created
location: /api/posts/creme-brulee-tips

{"data":{"id":6,"title":"Crème brûlée tips","slug":"creme-brulee-tips","status":"draft","author_id":3, …}}
```

Sending `author_id` in the body is refused with `422` (`"author_id" is not a field you can send here.`), because it isn't a field the request accepts.

### Hook: `prepareForUpdate()`: adjust values before saving

```ts
protected override prepareForUpdate(values: Record<string, unknown>, post: Post, ctx: HttpContext): Record<string, unknown> {
  return values['status'] === 'published' && post.status !== 'published' ? { ...values, published_at: now() } : values
}
```

### `visible()`: "can't see it" looks the same as "doesn't exist"

`show`, `update` and `destroy` start with `this.visible(ctx)`: the bound record, **if the policy's `view` allows it**. Otherwise it answers `404`, exactly like a missing record.

**Why not `403`?** A `403` on `PATCH /api/posts/alice-draft` would tell Bob that a draft with that slug exists. With `visible()`, hidden records can't be discovered by guessing URLs. If Bob *can* see a post but may not change it, he still gets an honest `403`.

### Custom actions

Add your own actions next to the inherited ones. Use `visible()` and `authorize()` the same way:

```ts title="app/http/controllers/post.controller.ts"
import { authorize, now, ResourceController, route, type Constraint, type HttpContext } from '@strutvane/framework'
import { Post } from '../../models/post.ts'
import { PostPolicy } from '../../policies/post.policy.ts'
import { StorePostRequest, UpdatePostRequest } from '../requests/post.request.ts'

export class PostController extends ResourceController<typeof Post> {
  protected readonly model = Post
  protected readonly policy = new PostPolicy()
  protected override readonly storeRequest = new StorePostRequest()
  protected override readonly updateRequest = new UpdatePostRequest()

  protected override prepareForStore(values: Record<string, unknown>, ctx: HttpContext): Record<string, unknown> {
    return { ...values, author_id: ctx.requireUser().id }
  }

  /** POST /api/posts/{post:slug}/publish */
  async publish(ctx: HttpContext): Promise<Response> {
    const post = await this.visible(ctx)                                  // 404 if they can't see it
    await authorize(this.policy, 'update', ctx.user, post, 'post')       // 403 if they can't change it
    post.fill({ status: 'published' })
    await post.save()
    return ctx.json({ data: post, links: { self: route('posts.show', { post }) } })
  }
}
```

```ts title="routes/api.ts"
Route.apiResource('posts', PostController, { bindBy: 'slug' })
  .middlewareFor(['index', 'show'], 'auth:optional')
  .middlewareFor(['store', 'update', 'destroy'], 'auth'),
Route.post('/posts/{post:slug}/publish', [PostController, 'publish']).name('posts.publish').middleware('auth'),
```

:::caution[Coming in 0.2]
In the application-core prototype (spike 12), `ResourceController` runs on a small stand-in data layer. In 0.2 it runs on the [Strutvane ORM](../orm/) (the `post.fill(...).save()` style above). The controller API on this page stays the same.
:::

## Middleware in a controller

A controller can declare its own protections in `static readonly middleware`, Laravel's `$this->middleware('auth')->only(...)`:

```ts title="app/http/controllers/comment.controller.ts"
import { auth, Controller, throttle, type HttpContext } from '@strutvane/framework'

export class CommentController extends Controller {
  static readonly middleware = [
    auth({ except: ['index'] }),                         // reading is public
    throttle({ params: ['20', '1'], only: ['store'] }),  // 20 comments a minute
  ]

  index(ctx: HttpContext): Response { return ctx.json({ data: [] }) }
  store(ctx: HttpContext): Response { return ctx.json({ data: {} }, 201) }
}
```

**What you'll see** in `node strut route:list --security`: `auth` on `store` but not on `index`, and `throttle:20,1` on `store`. Every style (route, group, controller, wrapper) is explained in [Middleware](../middleware/).

## Which kind of controller?

| You want | Use | Write |
|---|---|---|
| A few custom endpoints | a plain `Controller` | `make:controller ReportController` |
| The standard 5 API actions for a model, with every safety check | `ResourceController` | `make:controller PostController --model=Post` |
| The standard actions, but every line in your file | an owned resource controller | `make:controller PostController --api` (or `--resource` for 7) |
| Nothing at all | the generated API from `node strut migrate` | — |

The generated API already covers most tables; write a controller only when you need different behaviour. To take over one model's API, write the controller, route it with `Route.apiResource()` in `routes/api.ts`, and opt that model out of the generated routes.

## Coming in 0.2: single-action, singleton and nested controllers

:::caution[Coming in 0.2]
Not in the prototype yet. Planned in the Laravel parity matrix; the syntax shown is a preview.
:::

- **Single-action (invokable) controllers.** Laravel's `__invoke` controllers: a class with one action, routed without a method name. Until it lands, route `[ExportController, 'handle']`, or a closure.

  ```ts
  Route.post('/exports', [ExportController, 'handle']).name('exports.store'),   // works today
  ```

- **Singleton resource controllers** for things that exist once (a profile, a team's settings): `show`, `edit` and `update` only, routed with `Route.singleton('profile', ProfileController)`.
- **Nested, shallow resources**: `Route.apiResource('posts.comments', CommentController, { shallow: true })` gives `CommentController` the parent post on `index` and `store`, and short URLs for the rest.

See [Routing](../routing/) for the URLs each one produces.

## Testing a controller

Call the app with a request and check the answer; no server is needed:

```ts title="tests/feature/reports.test.ts"
import { expect, test } from 'vitest'
import { client } from '@strutvane/framework/testing'
import { createApp } from '../../bootstrap/app.ts'

test('reports list is empty at first', async () => {
  const app = createApp({ APP_ENV: 'testing', APP_KEY: 'test-key', DB_CONNECTION: 'sqlite' })
  const response = await client(app).getJson('/api/reports')
  response.assertStatus(200)
  expect(response.json).toEqual({ data: [] })
})
```

**What you'll see** with `npm test`: the test passes. See [HTTP Tests](../http-tests/).

## Generating controllers

| Command | Writes |
|---|---|
| `node strut make:controller ReportController` | An empty controller with one `index` action |
| `node strut make:controller PostController --model=Post` (or `-m Post`) | A `ResourceController` for `Post` (all five actions inherited) **and** a deny-all `post.policy.ts` |
| `node strut make:controller PostController --api` | An owned controller with the 5 API actions written out, each calling `authorize()`, plus the policy |
| `node strut make:controller PostController --resource` (or `-r`) | The 7 actions, including the `create` and `edit` form-page actions, plus the policy |
| add `--force` | Overwrite an existing controller file |

What you'll see for `--resource`:

```bash
node strut make:controller CommentController --resource
```

```text
  Created app/http/controllers/comment.controller.ts
  Created app/policies/comment.policy.ts (denies everyone but admins until you edit it)
  Note: app/models/comment.ts doesn't exist yet. Create it with: node strut make:migration create_comments_table

  Next: route it in routes/web.ts:
    Route.resource('comments', CommentController)
  and bind the model in bootstrap/app.ts: withRouting({ bindings: { comment: Comment } })
```

The generated policy **denies everyone except admins**, so a new endpoint is never open by accident. A generated controller compiles under strict TypeScript straight away and answers `403` for every action until you edit the policy.

## Common mistakes

### "… serves resource routes but has no policy"

```text
✖ PostController serves resource routes but has no policy.
→ Give it a `protected readonly policy = new PostPolicy()` and call authorize() in every action (node strut make:controller --resource writes this for you).
```

**Why:** a resource route without a policy would let anyone do anything.

**Fix:** add `protected readonly policy = new PostPolicy()`.

### "… doesn't exist (route …)"

```text
✖ PostController@publsh doesn't exist (route /api/posts/{post:slug}/publish).
→ Add a publsh(ctx: HttpContext) method to PostController.
```

**Fix:** correct the method name in the route, or add the method.

### "… would serve the internal … table over the API"

```text
✖ UserController would serve the internal "users" table over the API.
→ Framework and identity tables (sessions, tokens, roles, jobs, users…) are never auto resources. Write a purpose-built controller with explicit fields instead.
```

**Fix:** extend `Controller` instead and return only the fields you mean to expose.

### "--resource and --api can't be used together"

```text
✖ --resource and --api can't be used together.
→ Use --resource for 7 actions (with form pages) or --api for 5.
```

### "… already exists, so nothing was written"

```text
✖ app/http/controllers/post.controller.ts already exists, so nothing was written.
→ Pick another name, or add --force to overwrite it (your changes in that file would be lost).
```

### "… is not a controller class name"

```text
✖ "posts" is not a controller class name.
→ Use PascalCase ending in "Controller", for example: node strut make:controller PostsController
```

### My action returned nothing

```text
PostController@show returned nothing instead of a Response.
→ Return ctx.json(...), ctx.html(...) or ctx.noContent().
```

**Fix:** `return ctx.json(...)`.

## Next steps

- [Validation](../validation/): form requests for `storeRequest` and `updateRequest`.
- [Authorization](../authorization/): the policies every resource controller needs.
- [Responses](../responses/): everything an action can return.
