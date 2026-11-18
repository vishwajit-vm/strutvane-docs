---
title: Controllers
description: Group request handling into controller classes. Plain and single-action controllers, constructor injection, ResourceController with its hooks (indexConstraints, prepareForStore, prepareForUpdate, visible), custom actions and controller middleware.
---

A **controller** is a class whose methods (called **actions**) answer requests. Instead of writing every route's code inside `routes/api.ts`, you point the route at a controller action, and keep related actions together: everything about posts in `PostController`.

Controllers live in `app/http/controllers/`, one per file, named `post.controller.ts`.

:::tip[Coming from Laravel?]
Same idea. `php artisan make:controller` becomes `node strut make:controller` once it ships (see [Generating controllers](#generating-controllers)); until then you write the file yourself, as below.

What's new is `ResourceController`: a base class that already implements `index`, `show`, `store`, `update` and `destroy` (pagination, search, sorting, filters, validation, policies, problem+json errors). You set the model and the policy, and override only the steps you want to change. Each action receives one `ctx` argument instead of injected `Request $request, Post $post`.
:::

## The smallest example

Create the file:

```ts title="app/http/controllers/report.controller.ts"
import { Controller, type HttpContext } from '@strutvane/framework'

/** Reports for the admin area. */
export class ReportController extends Controller {
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

An action takes `ctx` (the [request context](../requests/)) and returns a `Response`, or a `Promise` of one. Returning anything else (a plain object, nothing) is an error: use `ctx.json()`, `ctx.html()` or `ctx.noContent()`.

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

`Post` is an [ORM](../orm/) model; any code that returns data works the same way.

**Why write the return type (`: Response`, `: Promise<Response>`)?** Your routes file reads the controller's types, and your controller may call `route()`, which reads the routes file. Writing the return type stops TypeScript from going round in that circle. Generated controllers always include it.

A **new controller object is made for every request**, so it's safe to keep per-request values on `this`; they never leak to another user. The app also builds every routed controller once at start-up, to check that each action exists, so a constructor must not do slow work.

## Constructor injection

A controller that needs a service lists its container tokens in `static inject`, in constructor order; the container passes them to the constructor:

```ts title="app/http/controllers/about.controller.ts"
import { type ConfigRepository, ConfigRepositoryToken, Controller, type HttpContext } from '@strutvane/framework'

/** What this app is. */
export class AboutController extends Controller {
  static readonly inject = [ConfigRepositoryToken] as const
  readonly #config: ConfigRepository

  constructor(config: ConfigRepository) {
    super()
    this.#config = config
  }

  /** GET /api/about */
  show(ctx: HttpContext): Response {
    return ctx.json({ data: { name: this.#config.string('app.name', 'Strutvane') } })
  }
}
```

What you'll see:

```json
{ "data": { "name": "Blog" } }
```

If the `inject` list doesn't match the constructor, it doesn't compile. See [Service Container](../container/).

## ResourceController: a whole API in a few lines

For a model that needs the standard API, extend `ResourceController` and set two things: the **model** and the **policy** (who may do what; see [Authorization](../authorization/)).

:::caution[Coming in 0.2]
In 0.2.0-next.0, `ResourceController` works with a model that implements its small `ResourceModel` contract (`metadata()`, `paginate()`, `createFromValidated()`, `resolveRouteBinding()`, `isTaken()`). [ORM](../orm/) models don't implement it yet: that wiring is the next step on the 0.2 plan, and the examples below show the finished shape.
:::

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
| `GET /api/authors` | `index` | One page from the model's `paginate()`, which reads the query string | `viewAny` |
| `GET /api/authors/{author}` | `show` | The bound record | `view` |
| `POST /api/authors` | `store` | Validate, refuse non-`fillable` fields, check unique columns, create; `201` + `Location` | `create` |
| `PUT`/`PATCH /api/authors/{author}` | `update` | Validate, check uniques, save | `view`, then `update` |
| `DELETE /api/authors/{author}` | `destroy` | Delete the record; `204` | `view`, then `delete` |

Without a `policy` property, the controller uses the policy **discovered** for the model (`app/policies/author.policy.ts`, exporting `AuthorPolicy` or a default). With neither, the app refuses to start. A duplicate value in a unique column is a `422` issue with code `taken` ("That Email is already taken."), and a race the database catches is a `409` `conflict`.

What you'll see for `GET /api/authors?search=ada&sort=-created_at`:

```json
{
  "data": [{ "id": 1, "name": "Ada Admin", "email": "ada@example.test", "bio": null, "created_at": "2026-11-14T10:00:00.000Z" }],
  "meta": { "page": 1, "perPage": 25, "total": 1, "lastPage": 1, "from": 1, "to": 1 }
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

Sending `author_id` in the body is refused with `422`, because it isn't a field the request accepts. The issue has code `unknown_field` and the message `"Author id" is not a field you can send here. Remove it from the request body.`

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
import { type HttpContext, ResourceController, route } from '@strutvane/framework'
import { ForbiddenError } from '@strutvane/framework/core'
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
    const post = await this.visible(ctx)                                     // 404 if they can't see it
    if ((await this.policy.update(ctx.user, post)) !== true) throw new ForbiddenError() // 403 if they can't change it
    await post.updateFromValidated({ status: 'published' })
    return ctx.json({ data: post, links: { self: route('posts.show', { post }) } })
  }
}
```

A policy method allows only when it returns exactly `true`, so the check above compares with `true` too.

```ts title="routes/api.ts"
Route.apiResource('posts', PostController, { bindBy: 'slug' })
  .middlewareFor(['index', 'show'], 'auth:optional')
  .middlewareFor(['store', 'update', 'destroy'], 'auth'),
Route.post('/posts/{post:slug}/publish', [PostController, 'publish']).name('posts.publish').middleware('auth'),
```

:::caution[Coming in 0.2]
Laravel-style `authorize()` and `allows()` helpers for policies exist inside the framework but aren't exported in 0.2.0-next.0; until they are, call the policy method yourself as above. Once ORM models implement the resource contract, `post.fill(…)` and `post.save()` work here as well.
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

| You want | Use |
|---|---|
| A few custom endpoints | a plain `Controller` |
| One endpoint per class | a [single-action controller](#single-action-controllers) |
| The standard 5 API actions for a model, with every safety check | `ResourceController` |
| The standard actions, but every line in your file | your own controller with `index`, `store`, `show`, `update`, `destroy` and a `policy` |
| Nothing at all | the generated API from `node strut migrate` |

The generated API already covers most tables; write a controller only when you need different behaviour. To take over one model's API, write the controller, route it with `Route.apiResource()` in `routes/api.ts`, and opt that model out of the generated routes.

## Single-action controllers

A controller that does one thing can be a class with one `__invoke` method, Laravel's invokable controller. Route it without a method name:

```ts title="app/http/controllers/export-posts.controller.ts"
import { Controller, type HttpContext } from '@strutvane/framework'

export class ExportPostsController extends Controller {
  __invoke(ctx: HttpContext): Response {
    return ctx.json({ queued: true }, 202)
  }
}
```

```ts title="routes/api.ts"
Route.post('/exports', ExportPostsController).name('exports.store'),
```

**What you'll see:** `POST /api/exports` answers `202` with `{ "queued": true }`, and `route:list` shows the action as `ExportPostsController@__invoke`.

## Singleton and nested controllers

- **Singleton resource controllers** for things that exist once (a profile, a team's settings): `show`, `edit` and `update` only, routed with `Route.singleton('profile', ProfileController)` (`Route.apiSingleton()` without `edit`).
- **Nested, shallow resources**: `Route.apiResource('posts.comments', CommentController, { shallow: true })`. The `index` and `store` routes carry the parent (`{post}`); the others use the short `/comments/{comment}`.

See [Routing](../routing/#more-route-types) for the URLs each one produces.

## Testing a controller

Call the app with a request and check the answer; no server is needed:

```ts title="tests/feature/reports.test.ts"
import { expect, test } from 'vitest'
import app from '../../bootstrap/app.ts'

test('reports list is empty at first', async () => {
  const response = await app.handle(new Request('http://localhost/api/reports'))
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ data: [] })
})
```

**What you'll see** with `npm test` (and `APP_ENV=testing`): the test passes. `app.handle()` boots the app on the first call and runs the request through the whole pipeline, with no port.

:::caution[Coming in 0.2]
Laravel-style test helpers for an application (`getJson()`, `actingAs(user)`, `withoutCsrf()`, `assertStatus()`) are built but not exported from `@strutvane/framework/testing` in 0.2.0-next.0. See [HTTP Tests](../http-tests/).
:::

## Generating controllers

:::caution[Coming in 0.2]
`node strut make:controller` isn't in 0.2.0-next.0 (the app generators that ship are `make:command`, `make:rule` and `make:observer`). It's planned with these variants:

| Command | Writes |
|---|---|
| `node strut make:controller ReportController` | An empty controller with one `index` action |
| `node strut make:controller PostController --model=Post` | A `ResourceController` for `Post` and a deny-all `post.policy.ts` |
| `node strut make:controller PostController --api` | An owned controller with the 5 API actions written out, plus the policy |
| `node strut make:controller PostController --resource` | The 7 actions, including the `create` and `edit` form pages, plus the policy |

Until then, copy the examples on this page. `node strut make:policy Post` writes the deny-by-default policy.
:::

## Common mistakes

### "… serves resource routes but has no policy"

```text
✖ PostController serves resource routes but has no policy.
→ Give it a `protected readonly policy = new PostPolicy()` and call authorize() in every action, or extend ResourceController.
```

**Why:** a resource route without a policy would let anyone do anything.

**Fix:** add `protected readonly policy = new PostPolicy()`.

### "… serves Post but no policy was found for it"

```text
✖ PostController serves Post but no policy was found for it.
→ Create app/policies/post.policy.ts (node strut make:policy Post), or set `protected readonly policy` on the controller.
```

**Why:** a `ResourceController` without a `policy` property looks for `app/policies/post.policy.ts` at start-up, and there is none.

### "… doesn't exist (route …)"

```text
✖ PostController@publsh doesn't exist (POST /api/posts/{post:slug}/publish).
→ Add a publsh(ctx: HttpContext) method to PostController.
```

**Fix:** correct the method name in the route, or add the method.

### "… would serve the internal … table over the API"

```text
✖ UserController would serve the internal "users" table over the API.
→ Framework and identity tables (sessions, tokens, roles, jobs, users…) are never auto resources. Write a purpose-built controller with explicit fields instead.
```

**Fix:** extend `Controller` instead and return only the fields you mean to expose.

### My action returned nothing

```text
PostController@show returned nothing instead of a Response.
→ Return ctx.json(...), ctx.html(...) or ctx.noContent().
```

**Why:** unlike Laravel, a returned object isn't turned into JSON for you, so a forgotten `return` can't silently send an empty page.

**Fix:** `return ctx.json(...)`.

## Next steps

- [Validation](../validation/): form requests for `storeRequest` and `updateRequest`.
- [Authorization](../authorization/): the policies every resource controller needs.
- [Responses](../responses/): everything an action can return.
