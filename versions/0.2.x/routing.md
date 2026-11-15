---
title: Routing
description: Map URLs to controllers in routes/web.ts and routes/api.ts. Single routes, names and typed URLs, groups, middleware and opt-outs, signed links, resource routes, slug binding, 405s and the /up health check, plus fallback, singleton, shallow and spoofed-method routes coming in 0.2, each with a complete example.
---

A **route** connects a URL and an HTTP method (GET, POST…) to the code that answers it. Your routes live in two files:

- `routes/api.ts`: your JSON API. Every route here is served under `/api` and gets the `api` middleware group (CSRF check and rate limit).
- `routes/web.ts`: pages for the browser (the React app's HTML shell). These get the `web` group (CSRF check).

:::tip[Coming from Laravel?]
`Route::get()`, `->name()`, `->middleware()`, `Route::group()`, `Route::resource()` and `Route::apiResource()` are all here as `Route.get()`, `.name()`, `.middleware()`, `Route.group()`, `Route.resource()` and `Route.apiResource()`. `{post:slug}` binding works the same way.

Two differences: routes are **values** in an array (`defineRoutes([...])`), not global side effects, and every route **name and parameter is typed**, so `route('posts.shwo')` doesn't compile.
:::

## The smallest example

```ts title="routes/api.ts"
import { defineRoutes, Route } from '@strutvane/framework'

export default defineRoutes([
  Route.get('/hello', (ctx) => ctx.json({ message: 'Hello!' })).name('hello'),
])
```

Start the app (`npm run dev`, or `node strut serve`) and call it:

```bash
curl http://localhost:3000/api/hello
```

What you'll see:

```json
{ "message": "Hello!" }
```

The route was defined as `/hello`, but it's served at `/api/hello`, because everything in `routes/api.ts` gets the `/api` prefix.

## Routes are values

`Route.get()` doesn't register anything. It returns a route object, and `defineRoutes([...])` returns the list. `bootstrap/app.ts` hands the lists to the app:

```ts title="bootstrap/app.ts"
.withRouting({ web, api, health: '/up', bindings: { post: Post } })
```

**Why values?** Your routes file can be imported twice (by the server, `node strut route:list` and your tests) without registering anything twice, and TypeScript can read every name and path from `typeof api`.

## Single routes

There's one method per HTTP verb, plus `match` for several at once:

```ts title="routes/api.ts"
import { defineRoutes, Route } from '@strutvane/framework'
import { ReportController } from '../app/http/controllers/report.controller.ts'

export default defineRoutes([
  Route.get('/reports', [ReportController, 'index']),
  Route.post('/reports', [ReportController, 'store']),
  Route.put('/reports/{report}', [ReportController, 'replace']),
  Route.patch('/reports/{report}', [ReportController, 'update']),
  Route.delete('/reports/{report}', [ReportController, 'destroy']),
  Route.match(['GET', 'POST'], '/reports/search', [ReportController, 'search']),
])
```

The second argument is the **action**: either `[ControllerClass, 'methodName']`, or a function `(ctx) => Response` for tiny routes. A method name that doesn't exist on the controller is a compile error.

## Naming routes

Give a route a **name** with `.name()`, then build its URL anywhere with `route()`:

```ts title="routes/api.ts"
Route.post('/posts/{post:slug}/publish', [PostController, 'publish']).name('posts.publish'),
```

```ts title="app/http/controllers/post.controller.ts"
return ctx.json({ links: { publish: route('posts.publish', { post }) } })
```

What you'll see in the response:

```json
{ "links": { "publish": "/api/posts/hello-world/publish" } }
```

### Every way to call `route()`

| Call | Result |
|---|---|
| `route('posts.index')` | `/api/posts` |
| `route('posts.show', { post })` | `/api/posts/hello-world` (a model fills the parameter with the field the route binds by) |
| `route('posts.show', { post: 'hello-world' })` | `/api/posts/hello-world` (a plain string or number works too) |
| `route('posts.index', {}, { query: { page: 2, sort: '-created_at' } })` | `/api/posts?page=2&sort=-created_at` |
| `route('posts.show', { post }, { absolute: true })` | `http://localhost:3000/api/posts/hello-world` (prefixed with `APP_URL`) |

These are **compile errors**, caught before you run anything:

```ts
route('posts.shwo', { post })   // no route has that name
route('posts.show')             // {post} is required
route('posts.show', { pots: post }) // wrong parameter name
```

To make this work, `bootstrap/app.ts` has one block that tells TypeScript about your routes (new apps already have it):

```ts title="bootstrap/app.ts"
declare module '@strutvane/framework' {
  interface RouteRegistry extends RoutesOf<[typeof web, typeof api]> {}
}
```

## Route parameters

A part of the path in braces is a **parameter**: `{report}` matches any value in that position. Read it as a string with `ctx.param()`:

```ts
Route.get('/reports/{report}', (ctx) => ctx.json({ id: ctx.param('report') })),
```

`GET /api/reports/42` answers `{ "id": "42" }`.

Parameter names use letters, digits and underscores, and each name appears once per path.

## Route model binding

Usually a parameter stands for a database record. **Route model binding** looks the record up for you before your controller runs. Register which model a parameter name means, once, in `bootstrap/app.ts`:

```ts title="bootstrap/app.ts"
.withRouting({ web, api, health: '/up', bindings: { post: Post, author: Author } })
```

Now any route with `{post}` gets a `Post`:

```ts title="routes/api.ts"
Route.get('/posts/{post}', [PostController, 'show']),
```

```ts title="app/http/controllers/post.controller.ts"
show(ctx: HttpContext): Response {
  const post = ctx.model(Post)   // typed as Post
  return ctx.json({ data: post })
}
```

What you'll see:

| Request | Response |
|---|---|
| `GET /api/posts/1` (exists) | `200` with the post |
| `GET /api/posts/999` (missing) | `404`: `No post matches "999".` |

### Binding by slug: `{post:slug}`

Add `:field` to look the record up by another column. `{post:slug}` finds the post whose `slug` matches:

```ts
Route.get('/posts/{post:slug}', [PostController, 'show']),
```

`GET /api/posts/hello-world` → the post with slug `hello-world`. And `route('posts.show', { post })` builds `/api/posts/hello-world` from the model.

Binding runs **after** middleware, so a guest on an `auth` route gets `401` before they can learn whether a record exists.

## Groups

A **group** shares a path prefix, a name prefix and middleware between routes:

```ts title="routes/api.ts"
import { defineRoutes, Route } from '@strutvane/framework'
import { StatsController } from '../app/http/controllers/stats.controller.ts'
import { UserAdminController } from '../app/http/controllers/user-admin.controller.ts'

export default defineRoutes([
  Route.group({ prefix: 'admin', name: 'admin.', middleware: ['auth', 'admin'] }, [
    Route.get('/stats', [StatsController, 'show']).name('stats'),
    Route.get('/users', [UserAdminController, 'index']).name('users'),
  ]),
])
```

What you'll see in `node strut route:list`:

```text
  Method  URI               Name         Action                     Middleware
  ------  ----------------  -----------  -------------------------  ----------------
  GET     /api/admin/stats  admin.stats  StatsController@show       api, auth, admin
  GET     /api/admin/users  admin.users  UserAdminController@index  api, auth, admin
```

The name prefix is typed too: `route('admin.stats')` compiles, `route('stats')` doesn't. Groups can be nested; prefixes, names and middleware add up.

### Fluent groups: `Route.middleware(...).group(...)`

When all you share is middleware, the fluent form reads like Laravel's `Route::middleware([...])->group(...)`. The middleware names are separate arguments, and `.group()` takes the routes either from a callback (Laravel's shape) or as an array:

```ts title="routes/api.ts"
import { defineRoutes, Route } from '@strutvane/framework'
import { ProfileController } from '../app/http/controllers/profile.controller.ts'
import { StatsController } from '../app/http/controllers/stats.controller.ts'

export default defineRoutes([
  // the callback form, as in Laravel
  Route.middleware('auth').group(() => [
    Route.get('/me', [ProfileController, 'show']).name('me'),
    Route.patch('/me', [ProfileController, 'update']).name('me.update'),
  ]),

  // the array form: the same thing
  Route.middleware('auth', 'can:view-stats').group([
    Route.get('/admin/stats', [StatsController, 'show']).name('admin.stats'),
  ]),
])
```

Either way the callback **returns** the routes: nothing is registered as a side effect, because routes are values.

:::caution[Coming in 0.2]
The callback form is the decided syntax (it matches Laravel); the prototype (spike 12) accepts only the array form so far.
:::

### Versioned APIs

Everything in `routes/api.ts` is under `/api`. Versioning is **opt-in**: put the routes of each version in a group with a prefix and a name prefix:

```ts title="routes/api.ts"
Route.group({ prefix: 'v1', name: 'v1.' }, [
  Route.apiResource('posts', PostController),       // /api/v1/posts, named v1.posts.index …
]),
```

A shorter `Route.prefix('v1').group(…)` form is planned for 0.2.

## Middleware on routes

Add middleware to one route with `.middleware()`:

```ts
Route.get('/me', (ctx) => ctx.json({ data: ctx.requireUser() })).name('me').middleware('auth'),
```

Middleware can take parameters after a colon: `'auth:optional'`, `'throttle:5,1'`. See [Middleware](../middleware/).

### Opting a route out: `.withoutMiddleware()`

A route can drop middleware its group added. The classic case is a webhook from another service, which can't carry your CSRF token:

```ts title="routes/api.ts"
Route.post('/webhooks/stripe', [StripeWebhookController, 'handle']).withoutMiddleware('csrf'),
```

The same works for whole groups (`Route.withoutMiddleware('csrf').group([...])`, or `Route.group({ withoutMiddleware: ['csrf'] }, [...])`) and resources (`.withoutMiddleware('throttle')`). Every opt-out is listed by `node strut route:list --security`, so a reviewer sees it. A webhook still needs **its own** check, usually a signature from the sender. See [CSRF Protection](../csrf/).

To exempt paths app-wide instead, list them in `bootstrap/app.ts`: `.withMiddleware((m) => m.validateCsrfTokens({ except: ['api/webhooks/*'] }))`. Patterns match the **full path** without the leading slash, `api/` prefix included, so `webhooks/*` alone would never match an API route (a start-up warning for patterns that can never match is coming in 0.2).

### Rate limits on routes

```ts
Route.post('/login', [LoginController, 'store']).middleware('throttle:5,1'),   // 5 per minute
Route.get('/search', [SearchController, 'index']).middleware('throttle:search'), // a named limiter
```

Every `/api` route already has `throttle:api` (60 requests per minute per user, or per IP for guests). See [Rate Limiting](../rate-limiting/).

## Signed routes

A **signed URL** has a signature on the end, made with your `APP_KEY`. Anyone can open it, but nobody can change it. Use it for links you email: unsubscribe, download, confirm.

1. Protect the route with `signed`:

   ```ts title="routes/api.ts"
   Route.get('/downloads/{file}', [DownloadController, 'show']).name('downloads.show').middleware('signed'),
   ```

2. Make the link with the typed helpers (same arguments as `route()`):

   ```ts
   import { signedRoute, temporarySignedRoute } from '@strutvane/framework'

   signedRoute('downloads.show', { file: 'report-2026.pdf' })
   temporarySignedRoute('downloads.show', new Date(Date.now() + 30 * 60_000), { file: 'report-2026.pdf' }) // 30 minutes
   ```

**What you'll see:**

| Request | Answer |
|---|---|
| The link as made | `200`, your controller runs |
| The link with anything changed | `403` `invalid_signature`: "This link is not valid. It may have been changed or copied incompletely." |
| A temporary link after it expired | `403` `signature_expired`: "This link has expired. Ask for a new one." |

`signed` runs before `auth`, so a bad link is refused whoever you are.

:::note[Naming]
The Laravel parity matrix lists these as `url.signed()` and `url.temporarySigned()`; the prototype (spike 12) names them `signedRoute()` and `temporarySignedRoute()`. These docs use the prototype's names until the final names are settled.
:::

## Resource routes

Most models need the same set of routes. One line gives you all of them, with standard names.

### `Route.resource()`: seven routes (with form pages)

```ts
Route.resource('posts', PostController),
```

| Method | URI | Name | Action |
|---|---|---|---|
| GET | `/posts` | `posts.index` | `index` |
| GET | `/posts/create` | `posts.create` | `create` |
| POST | `/posts` | `posts.store` | `store` |
| GET | `/posts/{post}` | `posts.show` | `show` |
| GET | `/posts/{post}/edit` | `posts.edit` | `edit` |
| PUT\|PATCH | `/posts/{post}` | `posts.update` | `update` |
| DELETE | `/posts/{post}` | `posts.destroy` | `destroy` |

The parameter name is the singular of the resource name: `posts` → `{post}`.

### `Route.apiResource()`: five routes (no form pages)

APIs don't need `create` and `edit` pages, so `apiResource` leaves them out:

```ts title="routes/api.ts"
Route.apiResource('posts', PostController),
```

You get `index`, `store`, `show`, `update` and `destroy`. Pair it with a `ResourceController` and every action works with no further code. See [Controllers](../controllers/).

### Resource options

| Option | What it does | Example |
|---|---|---|
| `only` | Keep just these actions | `{ only: ['index', 'show'] }` |
| `except` | Drop these actions | `{ except: ['destroy'] }` |
| `bindBy` | Bind the parameter by this column | `{ bindBy: 'slug' }` → `/posts/{post:slug}` |
| `parameter` | Rename the parameter (for irregular plurals) | `Route.resource('news', NewsController, { parameter: 'story' })` → `{story}` |

And two methods to add middleware to the whole resource or to some actions:

```ts title="routes/api.ts"
Route.apiResource('posts', PostController, { bindBy: 'slug' })
  .middlewareFor(['index', 'show'], 'auth:optional')
  .middlewareFor(['store', 'update', 'destroy'], 'auth'),

Route.apiResource('authors', AuthorController, { only: ['index', 'show', 'store'] })
  .middleware('throttle:30,1'),
```

The controller must have a method for **every** action you keep; if it doesn't, the line doesn't compile.

## The health route: `/up`

`health: '/up'` in `withRouting` adds a route that answers when the app is alive, for load balancers and uptime checks:

```bash
curl http://localhost:3000/up
```

What you'll see:

```json
{ "status": "ok" }
```

## Wrong method: 405 with `Allow`

When the path exists but not for that method, you get `405` and an `Allow` header naming the methods that work:

```bash
curl -i -X DELETE http://localhost:3000/api/hello
```

```text
HTTP/1.1 405 Method Not Allowed
allow: GET

{"type":"https://strutvane.dev/problems/method_not_allowed","title":"Method not allowed","status":405,"code":"method_not_allowed","detail":"DELETE is not supported here. Use GET."}
```

A path that doesn't exist at all is a `404`: `Nothing is at GET /api/helo.`

## Closures or controllers?

| Action | Example | Use it for |
|---|---|---|
| A closure `(ctx) => Response` | `Route.get('/ping', (ctx) => ctx.json({ pong: true }))` | One-liners, health checks, prototypes |
| A controller method `[Controller, 'method']` | `Route.get('/reports', [ReportController, 'index'])` | Everything else: testable, injectable, shows as `ReportController@index` in `route:list` |
| A resource | `Route.apiResource('posts', PostController)` | A model's standard actions |

A closure can also carry protections, with a wrapper: `withAuth(async (ctx) => …)`. See [Middleware](../middleware/).

## Coming in 0.2: more route types

:::caution[Coming in 0.2]
These are on the 0.2 plan (Laravel parity matrix) and **not in the prototype yet**. The names are decided; the exact options shown are a preview.
:::

### Fallback route: `Route.fallback()`

Laravel's `Route::fallback()`: one route that answers when nothing else matches, instead of the default `404` problem. Useful for a custom "not found" page.

```ts title="routes/web.ts"
Route.fallback([SpaController, 'show']),   // let the React app show its own "not found" screen
```

It runs only after every other route failed to match, and still goes through the group's middleware.

### Subdomain routing

Laravel's `Route::domain('{account}.example.com')`: routes that match a host name, with the subdomain as a parameter. It's planned together with teams picked by subdomain (`acme.yourapp.com`, installer question 12). Until then, every route answers on every trusted host.

### Singleton resources: `Route.singleton()`

Some resources exist **once** per parent: a user's profile, a team's settings. There's no id in the URL and no list:

```ts
Route.singleton('profile', ProfileController),
```

| Method | URI | Name | Action |
|---|---|---|---|
| GET | `/profile` | `profile.show` | `show` |
| GET | `/profile/edit` | `profile.edit` | `edit` |
| PUT\|PATCH | `/profile` | `profile.update` | `update` |

### Nested and shallow resources: `{ shallow: true }`

A nested resource lives under its parent: the comments of a post. **Shallow** nesting keeps the parent only where it's needed (listing and creating), so a single comment has a short URL:

```ts
Route.apiResource('posts.comments', CommentController, { shallow: true }),
```

| Method | URI | Name |
|---|---|---|
| GET | `/posts/{post}/comments` | `posts.comments.index` |
| POST | `/posts/{post}/comments` | `posts.comments.store` |
| GET | `/comments/{comment}` | `comments.show` |
| PUT\|PATCH | `/comments/{comment}` | `comments.update` |
| DELETE | `/comments/{comment}` | `comments.destroy` |

### Form method spoofing: `_method`

HTML forms can only send GET and POST. To send PUT, PATCH or DELETE from a plain HTML form, add a hidden `_method` field to a **POST**:

```html
<form method="post" action="/posts/hello-world">
  <input type="hidden" name="_method" value="DELETE">
  <input type="hidden" name="_token" value="…">
  <button>Delete</button>
</form>
```

Only POST can be turned into PUT, PATCH or DELETE (a GET never becomes a write), and the **CSRF check still applies** to the spoofed request. The React UI doesn't need this: it sends real methods.

## Coming in 0.3: session blocking

:::caution[Coming in 0.3]
Planned for phase 2 (0.3).
:::

Laravel's `->block()`: while one request of a user's session runs on this route, a second one waits, so two quick clicks on "Pay" can't run side by side. Planned as `.block()` on a route. For API calls today, use the `idempotent` middleware: a retry with the same `Idempotency-Key` gets the first response instead of running twice. See [Middleware](../middleware/).

## Checking your routes

```bash
node strut route:list                 # every route
node strut route:list --path posts    # only URIs containing "posts"
node strut route:list --name admin.   # only names containing "admin."
node strut route:list --security      # the protections that really apply, opt-outs and warnings
node strut route:list --json          # machine-readable
```

With Docker, type the same commands: `node strut` forwards them into the app container.

What you'll see (the example app, shortened):

```text
  Method     URI                             Name           Action                 Middleware
  ---------  ------------------------------  -------------  ---------------------  ----------------
  GET        /api/posts                      posts.index    PostController@index   api, auth:optional
  POST       /api/posts                      posts.store    PostController@store   api, auth
  GET        /api/posts/{post:slug}          posts.show     PostController@show    api, auth:optional
  PUT|PATCH  /api/posts/{post:slug}          posts.update   PostController@update  api, auth
  DELETE     /api/posts/{post:slug}          posts.destroy  PostController@destroy api, auth
  POST       /api/posts/{post:slug}/publish  posts.publish  PostController@publish api, auth
```

## Common mistakes

### "No middleware is called …"

```text
✖ No middleware is called "auht" (used by GET /api/me).
→ Did you mean "auth"?
```

**Fix:** correct the alias. Strutvane checks every alias when the app starts, so this shows up in `route:list` and your tests, never in production.

### "… binds {post:slug}, but no model is bound to "post""

```text
✖ /api/posts/{post:slug} binds {post:slug}, but no model is bound to "post".
→ Add it in bootstrap/app.ts: withRouting({ bindings: { post: YourModel } }).
```

**Fix:**

```ts title="bootstrap/app.ts"
.withRouting({ web, api, bindings: { post: Post } })
```

### "Two routes are named …"

```text
✖ Two routes are named "posts.show": /api/posts/{post:slug} and /api/articles/{post}.
→ Route names must be unique, because route() would not know which URL to build. Rename one of them.
```

### "… is registered twice"

```text
✖ GET /api/posts is registered twice.
→ The second one could never run. Remove it, or change its path or method.
```

### "… has an unmatched brace"

```text
✖ The route path "/posts/{post" has an unmatched brace.
→ Write parameters as {post} or {post:slug}.
```

### "route('…') needs a value for {post}"

```text
✖ route('posts.show') needs a value for {post}.
→ Pass every parameter of /api/posts/{post:slug}: { post }.
```

This only happens when the name comes from a variable (otherwise it's a compile error). **Fix:** pass the parameter: `route('posts.show', { post })`.

### "… both adds "csrf" and opts out of it"

```text
✖ POST /api/import both adds "csrf" and opts out of it (route).
→ Remove one of the two declarations. An opt-out can only remove middleware the route inherits from a group.
```

**Why:** the same route says `.middleware('csrf')` and `.withoutMiddleware('csrf')`. Strutvane won't guess which one you meant, because guessing could silently remove a protection.
**Fix:** keep one of the two.

### A signed link answers 403 "invalid_signature"

**Why:** something changed the URL after it was signed: an email client that re-encoded it, a parameter added by hand, or a different `APP_KEY` on the server that checks it.
**Fix:** send the link exactly as `signedRoute()` returned it, and make sure every server shares the same `APP_KEY` (after `key:rotate`, the old key stays valid through `APP_PREVIOUS_KEYS`).

### `Route.resource('Posts', …)` fails

```text
✖ "Posts" is not a valid resource name.
→ Use the plural, lower-case table-style name, for example Route.resource('posts', PostController).
```

## Next steps

- [Controllers](../controllers/): what your routes call.
- [Middleware](../middleware/): `auth`, `throttle` and your own.
- [Requests](../requests/): reading parameters, query strings and bodies.
