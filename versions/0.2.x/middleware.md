---
title: Middleware
description: Middleware is code that runs around your controllers. Use the built-in auth, throttle and csrf middleware, write your own, give it an alias, set up rate limiters, and understand the order things run in.
---

**Middleware** is code that runs before (and optionally after) your controller, for every request on a route. It's where you put checks that many routes share: "is someone signed in?", "is this user an admin?", "has this client sent too many requests?".

Each middleware gets the request and a `next` function. It can stop the request (by throwing or returning a response), or call `next()` to let it continue.

:::tip[Coming from Laravel?]
Same model: classes with `handle()`, aliases like `'auth'` and `'throttle:60,1'`, the `web` and `api` groups, `RateLimiter::for()` (here `middleware.rateLimiter()`), and a fixed priority like `$middlewarePriority`.

The difference: every alias is checked **when the app starts**, so `'auht'` fails `node strut route:list` with "Did you mean "auth"?" instead of failing on a live request.
:::

## The smallest example

```ts title="app/http/middleware/ensure-admin.ts"
import { ForbiddenError, type HttpContext, type Middleware, type Next } from '@strutvane/framework'

/** The `admin` middleware: only admins pass. */
export class EnsureAdmin implements Middleware {
  async handle(ctx: HttpContext, next: Next): Promise<Response> {
    if (ctx.requireUser().is_admin) return next()
    throw new ForbiddenError('This area is for administrators.')
  }
}
```

Give it an alias in `bootstrap/app.ts`:

```ts title="bootstrap/app.ts"
.withMiddleware((middleware) => {
  middleware.alias({ admin: EnsureAdmin })
})
```

Use the alias on a route (after `auth`, so a user is signed in):

```ts title="routes/api.ts"
Route.get('/admin/stats', [StatsController, 'show']).name('admin.stats').middleware('auth', 'admin'),
```

What you'll see when a signed-in non-admin calls it:

```text
HTTP/1.1 403 Forbidden
content-type: application/problem+json

{"type":"https://strutvane.dev/problems/forbidden","title":"Forbidden","status":403,"code":"forbidden","detail":"This area is for administrators."}
```

## How `handle()` works

```ts
async handle(ctx: HttpContext, next: Next, ...params: string[]): Promise<Response>
```

| Argument | What it is |
|---|---|
| `ctx` | The request context: `ctx.user`, `ctx.request`, `ctx.ip`, `ctx.method`… |
| `next` | Calls the rest of the chain (more middleware, then the controller) and returns its `Response` |
| `params` | The text after the colon in the alias: `'throttle:60,1'` → `['60', '1']` |

There are three things a middleware can do:

1. **Let the request through:** `return next()`.
2. **Stop it:** throw an HTTP error (`ForbiddenError`, `UnauthenticatedError`…) or return your own response.
3. **Change the response:** `const response = await next()`, then return a modified copy.

### Changing the response (after the controller)

```ts title="app/http/middleware/add-timing.ts"
import type { HttpContext, Middleware, Next } from '@strutvane/framework'

/** Adds how long the request took, in milliseconds. */
export class AddTiming implements Middleware {
  async handle(_ctx: HttpContext, next: Next): Promise<Response> {
    const started = performance.now()
    const response = await next()
    // Copy before setting headers: some responses can't be changed in place.
    const timed = new Response(response.body, response)
    timed.headers.set('server-timing', `app;dur=${(performance.now() - started).toFixed(1)}`)
    return timed
  }
}
```

What you'll see in the response headers:

```text
server-timing: app;dur=3.4
```

### Middleware with parameters

```ts title="app/http/middleware/require-header.ts"
import { HttpError, type HttpContext, type Middleware, type Next } from '@strutvane/framework'

/** `require-header:X-Client-Version` refuses requests without that header. */
export class RequireHeader implements Middleware {
  async handle(ctx: HttpContext, next: Next, name = 'x-client-version'): Promise<Response> {
    if (ctx.request.headers.get(name) !== null) return next()
    throw new HttpError(400, 'missing_header', 'Missing header', `Send the "${name}" header.`)
  }
}
```

```ts
middleware.alias({ 'require-header': RequireHeader })
Route.get('/sync', [SyncController, 'show']).middleware('require-header:x-client-version'),
```

### Middleware that needs services

Middleware is built by the [container](../container/), once per request, so it can use `static inject` like any class:

```ts title="app/http/middleware/audit-requests.ts"
import { LoggerToken, type HttpContext, type Logger, type Middleware, type Next } from '@strutvane/framework'

/** Logs every request's method and route template (never the URL: it can carry tokens). */
export class AuditRequests implements Middleware {
  static readonly inject = [LoggerToken] as const
  readonly #logger: Logger

  constructor(logger: Logger) {
    this.#logger = logger
  }

  async handle(ctx: HttpContext, next: Next): Promise<Response> {
    this.#logger.info('request', { method: ctx.method, route: ctx.route?.uri })
    return next()
  }
}
```

## Built-in middleware

| Alias | What it does | Fails with |
|---|---|---|
| `auth` | Requires a valid `Authorization: Bearer <token>` header | `401 unauthenticated` |
| `auth:optional` | Signs the user in if a token is sent, lets guests through otherwise | `401` only for a **wrong** token |
| `throttle:api` | Rate limit with the named limiter `api` | `429 too_many_requests` |
| `throttle:60,1` | Rate limit: 60 requests per 1 minute | `429` |
| `csrf` | Checks cookie-authenticated unsafe requests come from your own site (see [CSRF Protection](../csrf/)) | `419 csrf_token_mismatch` |
| `can:<ability>` | Runs a named ability you defined with `defineAbility()` | `403 forbidden` |
| `signed` | The URL must carry a valid, unexpired signature | `403 invalid_signature` / `signature_expired` |
| `idempotent` | A retry with the same `Idempotency-Key` gets the first response instead of running twice | `400`, `409` or `422` (see below) |

### `auth` and `auth:optional`

```ts
Route.get('/me', (ctx) => ctx.json({ data: ctx.requireUser() })).middleware('auth'),
Route.apiResource('posts', PostController).middlewareFor(['index', 'show'], 'auth:optional'),
```

What you'll see without a token on an `auth` route:

```text
HTTP/1.1 401 Unauthorized
www-authenticate: Bearer

{"type":"https://strutvane.dev/problems/unauthenticated","title":"Unauthenticated","status":401,"code":"unauthenticated","detail":"Sign in first: send an \"Authorization: Bearer <token>\" header."}
```

On `auth:optional`, a **wrong** token is still a `401` (`That token is not valid. Sign in again to get a new one.`): the client tried to sign in and should learn that it failed, instead of silently seeing the guest view.

:::caution[Coming in 0.2]
Cookie sessions and the login screens come with `@strutvane/auth`. Today's `auth` middleware checks bearer tokens through the `UserProviderToken` binding (see [Service Providers](../providers/)).
:::

### `can:<ability>`: named permissions

An **ability** is a named yes/no rule about the user, Laravel's `Gate::define()`. Define it once, then use it on any route:

```ts title="bootstrap/app.ts"
.withMiddleware((middleware) => {
  middleware.defineAbility('view-stats', (user) => user !== null && hasAdminRole(user))
})
```

```ts title="routes/api.ts"
Route.get('/admin/stats', [StatsController, 'show']).middleware('auth', 'can:view-stats'),
```

**What you'll see** for a member: `403` with `"detail":"You are not allowed to do this."` (in local debug mode the body also has `"hint":"The \"view-stats\" ability denied this request."`).

Only a literal `true` allows: a rule that returns a string or an object denies (deny by default). A `can:` naming an ability you never defined stops the app at start-up. Rules about **one record** ("may this user edit this post?") belong in a policy, called from the controller, because route model binding runs after middleware. See [Authorization](../authorization/).

### `signed`

```ts
Route.get('/downloads/{file}', [DownloadController, 'show']).name('downloads.show').middleware('signed'),
```

Only links made with `signedRoute()` or `temporarySignedRoute()` get through. See [Routing: Signed routes](../routing/).

### `idempotent`: safe retries

Networks drop answers. A client that retries "charge the card" must not charge twice. With `idempotent`, the client sends a unique `Idempotency-Key` header (a UUID); a retry with the same key gets the **first** response replayed, marked with `idempotent-replayed: true`, and your action doesn't run again.

```ts title="routes/api.ts"
Route.post('/payments', [PaymentController, 'store']).middleware('auth', 'idempotent'),
```

```bash
curl -X POST http://localhost:3000/api/payments \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -H "Idempotency-Key: 6f1c2a9e-1b7d-4c1e-9f0a-2b3c4d5e6f70" \
  -d '{"amount":"19.90"}'
```

| Situation | Answer |
|---|---|
| First request with this key | Your action runs; its response is stored for 24 hours |
| Retry with the same key and the same body | The stored response, with `idempotent-replayed: true` |
| No `Idempotency-Key` header | `400 idempotency_key_required` |
| A key that isn't 1–255 visible ASCII characters | `400 idempotency_key_invalid` |
| Same key while the first is still running | `409 idempotency_in_progress`, `retry-after: 1` |
| Same key with a **different** request | `422 idempotency_key_reused` |

Only the status, body, `content-type` and `location` are replayed, never cookies. Stored responses are kept in memory by default; bind `IdempotencyStoreToken` to share them between servers.

## Every way to apply a protection

`auth`, `csrf`, `can`, `throttle`, `signed` and `idempotent` can each be applied in **six styles**. Pick whichever reads best where you are; they all run the same middleware class, so behaviour is identical.

| Style | Code |
|---|---|
| Default / app-wide | in the `web` and `api` groups, or `withMiddleware(…)` in `bootstrap/app.ts` |
| One route | `Route.post('/import', handler).middleware('throttle:10,1')` / `.withoutMiddleware('csrf')` |
| A group | `Route.middleware('auth').group(() => [...])` (or an array), `Route.withoutMiddleware('csrf').group([...])`, `Route.group({ withoutMiddleware: ['csrf'] }, [...])` |
| A controller | `static readonly middleware = [auth({ except: ['index', 'show'] })]` |
| A handler function | `export default withAuth(async (ctx) => …)` |
| Imperative | `await auth.verify(ctx)` |

### A controller's own middleware

```ts title="app/http/controllers/post.controller.ts"
import { auth, Controller, throttle, type HttpContext } from '@strutvane/framework'

export class PostController extends Controller {
  static readonly middleware = [
    auth({ except: ['index', 'show'] }),                      // guests may read
    throttle({ params: ['10', '1'], only: ['store'] }),       // throttle:10,1 on store only
  ]

  index(ctx: HttpContext): Response { return ctx.json({ data: [] }) }
  show(ctx: HttpContext): Response { return ctx.json({ data: {} }) }
  store(ctx: HttpContext): Response { return ctx.json({ data: {} }, 201) }
}
```

- `only` adds the protection to those actions.
- `except` adds it everywhere else **and opts those actions out**, even if a group added it. That's how `csrf({ except: ['callback'] })` turns CSRF off for one webhook action.
- An action name that doesn't exist on the controller stops the app at start-up with "Did you mean …?".

### Wrapping a plain function

For routes with a closure, wrap it:

```ts title="routes/api.ts"
import { defineRoutes, Route, withAuth, withThrottle } from '@strutvane/framework'

export default defineRoutes([
  Route.get('/me', withAuth(async (ctx) => ctx.json({ data: ctx.requireUser() }))),
  Route.post('/contact', withThrottle(async (ctx) => ctx.json({ sent: true }), '5', '1')),
])
```

The wrappers are `withAuth`, `withCsrf`, `withCan`, `withThrottle`, `withSigned` and `withIdempotency`. Parameters come after the handler: `withCan(handler, 'view-stats')`. When the route is matched, the router runs the middleware in priority order and the wrapper sees it already ran, so it never runs twice.

### Checking by hand: `.verify(ctx)`

Inside your own code, run a check right now. It resolves when the request passes and throws (an HTTP error) when it doesn't:

```ts
import { csrf, throttle } from '@strutvane/framework'

await csrf.verify(ctx)
await throttle.verify(ctx, '3', '1')   // 3 per minute
```

This style is the only one `route:list --security` can't see, so prefer the others.

### Your own middleware in every style

`defineProtection()` turns any middleware class you registered under an alias into the same six styles:

```ts title="app/http/middleware/protections.ts"
import { defineProtection } from '@strutvane/framework'
import { EnsureAdmin } from './ensure-admin.ts'

export const admin = defineProtection('admin', EnsureAdmin)   // the alias you registered
export const withAdmin = admin.wrap
```

Now `static middleware = [admin({ only: ['destroy'] })]`, `withAdmin(handler)` and `await admin.verify(ctx)` all work.

### See what really applies: `route:list --security`

```bash
node strut route:list --security
```

**What you'll see** (shortened):

```text
  Method  URI                      Name           Protections                Opt-outs                Warnings
  ------  -----------------------  -------------  -------------------------  ----------------------  ----------------------------------
  GET     /api/posts               posts.index    csrf, throttle:api
  POST    /api/posts               posts.store    csrf, auth, throttle:api
  POST    /api/webhooks/stripe     webhooks       throttle:api               ! csrf (route)
  POST    /api/legacy-import                      throttle:api                                       ! unsafe method with no CSRF check

  4 routes, 1 opt-out, 1 warning.
```

Every opt-out and every unsafe route without a CSRF check is flagged, so a reviewer sees the security surface in one table.

## Global middleware

Some checks run for **every** request, before routing, and aren't in any group: the trusted-host check, maintenance mode and CORS preflights. Security headers are added to every response at the end. You configure them in `bootstrap/app.ts` (`trustHosts`, `trustProxies`, `cors`, `securityHeaders`, `limits`); see [Request Lifecycle](../lifecycle/) and [Security Features](../security/).

## Groups: `web` and `api`

Every route gets its file's group automatically:

| Group | Contains | Applied to |
|---|---|---|
| `web` | `csrf` | `routes/web.ts` |
| `api` | `csrf`, `throttle:api` | `routes/api.ts` |

Add your own middleware to a group for every route in it:

```ts title="bootstrap/app.ts"
.withMiddleware((middleware) => {
  middleware.alias({ timing: AddTiming })
  middleware.appendToGroup('api', 'timing')        // at the end
  middleware.prependToGroup('web', 'timing')       // at the start
})
```

## Rate limiters

`throttle` counts requests per **bucket**: each signed-in user gets their own bucket; guests share one per IP address (IPv6 clients per `/64` network, so they can't dodge the limit by changing addresses).

The `api` group uses the limiter named `api`: 60 requests per minute by default. Change it, or add your own:

```ts title="bootstrap/app.ts"
.withMiddleware((middleware) => {
  middleware.rateLimiter('api', { maxAttempts: 120, decaySeconds: 60 })
  middleware.rateLimiter('login', { maxAttempts: 5, decaySeconds: 60, by: (ctx) => ctx.ip })
})
```

```ts title="routes/api.ts"
Route.post('/login', [LoginController, 'store']).middleware('throttle:login'),
```

Every throttled response carries the limit:

```text
x-ratelimit-limit: 120
x-ratelimit-remaining: 117
```

When the bucket is empty:

```text
HTTP/1.1 429 Too Many Requests
retry-after: 42

{"type":"https://strutvane.dev/problems/too_many_requests","title":"Too many requests","status":429,"code":"too_many_requests","detail":"Slow down: try again in 42 seconds."}
```

:::caution[Coming in 0.2]
In the prototype, counts are kept in memory, per process. In 0.2 the counts live in the **cache** (the database by default, Redis if you chose it), so limits hold across processes and servers. The store still plugs in behind `RateLimitStoreToken`.
:::

Everything about limits (named limiters, buckets, headers, testing) is on [Rate Limiting](../rate-limiting/).

## The order middleware runs in

Middleware runs in the order it's listed: group first, then the route's own, then the controller's and a wrapper's. The same alias with the same parameters is kept once. **Except** for six built-ins, which always run in this order wherever they're listed (Laravel's `$middlewarePriority`):

```text
csrf  →  signed  →  auth  →  can  →  throttle  →  idempotent
```

**Why?**

- `csrf` first: a forged request is refused before anything else.
- `signed` before `auth`: a tampered link is a `403` whoever you are.
- `can` after `auth`: it needs the user.
- `throttle` after `auth`: the `api` group lists `throttle` before your route's `auth`. If they ran in that order, the rate limiter wouldn't know who's signed in yet, and all users behind one office IP would share one bucket. This was found by a failing test in the prototype.
- `idempotent` last: a replayed response is scoped to the user and never skips the checks before it.

Your own middleware keeps its position; only these six are reordered among themselves.

## Coming in 0.2: work after the response

:::caution[Coming in 0.2]
Planned in the Laravel parity matrix, not in the prototype yet. A preview; names may change.
:::

Some work shouldn't make the user wait: writing an audit line, sending a metric. Laravel runs it **after** the response with terminable middleware and `defer()`. Strutvane plans both:

```ts title="app/http/middleware/record-timing.ts"
import type { HttpContext, Middleware, Next } from '@strutvane/framework'

export class RecordTiming implements Middleware {
  async handle(ctx: HttpContext, next: Next): Promise<Response> {
    return next()
  }

  /** Runs after the response was sent to the client. */
  async terminate(ctx: HttpContext, response: Response): Promise<void> {
    // store timing for ctx.route?.uri and response.status
  }
}
```

```ts
import { defer } from '@strutvane/framework'

defer(async () => {
  await sendWelcomeMetric(user.id)   // runs after the response
})
```

Errors inside deferred work are **logged, never lost**, and they can't change a response that was already sent. For longer jobs, use a queue. See [Concurrency](../concurrency/) and [Queues](../queues/).

## Common mistakes

### "No middleware is called …"

```text
✖ No middleware is called "admn" (used by GET /api/admin/stats).
→ Did you mean "admin"?
```

When nothing is close:

```text
✖ No middleware is called "audit" (used by GET /api/posts).
→ Register it in bootstrap/app.ts: withMiddleware((m) => m.alias({ audit: YourMiddleware })). Known: auth, throttle, csrf, admin.
```

**Fix:** correct the spelling, or register the alias.

### "No rate limiter is called …"

```text
No rate limiter is called "logins".
→ Define it in bootstrap/app.ts: withMiddleware((m) => m.rateLimiter('logins', { maxAttempts: 60, decaySeconds: 60 })), or use numbers: throttle:60,1.
```

### `ctx.requireUser()` throws 401 in my middleware

```text
{"status":401,"code":"unauthenticated","detail":"Sign in first: send an \"Authorization: Bearer <token>\" header.", …}
```

**Why:** your middleware runs on a route without `auth`, so nobody was signed in. (In local debug mode the response also has a `hint`: `Add the "auth" middleware to this route so guests get a 401 before the controller runs.`)

**Fix:** list `auth` on the route: `.middleware('auth', 'admin')`.

### "… uses can:…, but no such ability is defined"

```text
✖ GET /api/admin/stats uses can:view-stat, but no such ability is defined.
→ Did you mean "view-stats"?
```

**Fix:** correct the name, or define it with `middleware.defineAbility('view-stats', (user) => …)`.

### "… middleware must be a list of protections …"

```text
✖ PostController.middleware must be a list of protections such as [csrf(), auth({ except: ['index'] })].
→ Build each entry with a protection function (csrf, auth, can, throttle, signed, idempotent, or one made with defineProtection).
```

**Why:** the controller listed a string (`'auth'`) or a class instead of a protection entry. Strings aren't accepted there, so a typo can't silently drop a check.
**Fix:** `static readonly middleware = [auth()]`.

### "… names "…", which is not an action of …"

```text
✖ PostController.middleware names "stor", which is not an action of PostController (POST /api/posts).
→ Did you mean "store"?
```

**Fix:** correct the action name in `only` or `except`.

### My POST answers 400 "idempotency_key_required"

**Why:** the route has `idempotent`, and the request didn't send `Idempotency-Key`.
**Fix:** send a fresh UUID per action: `-H "Idempotency-Key: $(uuidgen)"` (macOS/Linux) or `-H "Idempotency-Key: $([guid]::NewGuid())"` (PowerShell). Reuse it only when retrying the **same** request.

### Headers I set disappear or throw

**Why:** some `Response` objects are immutable.

**Fix:** copy first: `const copy = new Response(response.body, response)`, then set headers on `copy`.

## Next steps

- [CSRF Protection](../csrf/): what the `csrf` middleware checks.
- [Authorization](../authorization/): per-record permissions, beyond "is admin".
- [Routing](../routing/): attaching middleware to routes and groups.
