---
title: Middleware
description: Middleware is code that runs around your controllers. Use the built-in auth, throttle, csrf, can, signed and idempotent middleware, write your own, give it an alias, set up rate limiters, run work after the response, and understand the order things run in.
---

**Middleware** is code that runs before (and optionally after) your controller, for every request on a route. It's where you put checks that many routes share: "is someone signed in?", "is this user an admin?", "has this client sent too many requests?".

Each middleware gets the request and a `next` function. It can stop the request (by throwing or returning a response), or call `next()` to let it continue.

:::tip[Coming from Laravel?]
Same model: classes with `handle()`, aliases like `'auth'` and `'throttle:60,1'`, the `web` and `api` groups, `RateLimiter::for()` (here `middleware.rateLimiter()`), and a fixed priority like `$middlewarePriority`.

The difference: every alias is checked **when the app starts**, so `'auht'` fails `node strut route:list` with "Did you mean "auth"?" instead of failing on a live request.
:::

## The smallest example

```ts title="app/http/middleware/ensure-admin.ts"
import type { HttpContext, Middleware, Next } from '@strutvane/framework'
import { ForbiddenError } from '@strutvane/framework/core'

/** The `admin` middleware: only admins pass. */
export class EnsureAdmin implements Middleware {
  async handle(ctx: HttpContext, next: Next): Promise<Response> {
    const user = ctx.requireUser()   // a 401 for guests
    if (user.roles.includes('admin')) return next()
    throw new ForbiddenError()
  }
}
```

`ctx.user` is the signed-in user (`null` for guests). Until your app declares its own user type, it has the shape of an **actor**: `id`, `type`, `roles` and `attrs`.

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

{"type":"https://strutvane.dev/errors/forbidden","title":"Not allowed","status":403,"code":"forbidden","detail":"You don't have permission to do this.","traceId":"…","instance":"/api/admin/stats"}
```

The wording comes from the message catalog, so every 403 reads the same; see [Localization](../localization/) to change it.

## How `handle()` works

```ts
async handle(ctx: HttpContext, next: Next, ...params: string[]): Promise<Response>
```

| Argument | What it is |
|---|---|
| `ctx` | The request context: `ctx.user`, `ctx.request`, `ctx.ip`, `ctx.method`… |
| `next` | Calls the rest of the chain (more middleware, then the controller) and returns its `Response` |
| `params` | The text after the colon in the alias, split on commas: `'throttle:60,1'` → `['60', '1']` |

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
import type { HttpContext, Middleware, Next } from '@strutvane/framework'
import { StrutvaneError } from '@strutvane/framework/core'

/** `require-header:X-Client-Version` refuses requests without that header. */
export class RequireHeader implements Middleware {
  async handle(ctx: HttpContext, next: Next, name = 'x-client-version'): Promise<Response> {
    if (ctx.request.headers.get(name) !== null) return next()
    throw new StrutvaneError('missing_header', { status: 400, params: { header: name } })
  }
}
```

The client gets a `400` problem with code `missing_header`. Give it a title and detail in your [message catalog](../localization/) (`errors.missing_header.title`, `errors.missing_header.detail`, where `{header}` is available); without them the title is the code in words, "Missing header".

```ts
middleware.alias({ 'require-header': RequireHeader })
Route.get('/sync', [SyncController, 'show']).middleware('require-header:x-client-version'),
```

### Middleware that needs services

Middleware is built by the [container](../container/), once per request, so it can use `static inject` like any class:

```ts title="app/http/middleware/audit-requests.ts"
import type { HttpContext, Middleware, Next } from '@strutvane/framework'
import type { Logger } from '@strutvane/framework/contracts'
import { LoggerToken } from '@strutvane/framework/core'

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
| `auth` | Requires a signed-in user (`ctx.user` is not `null`) | `401 unauthenticated` |
| `auth:optional` | Lets guests through too; documents that the action works for both | never |
| `throttle:api` | Rate limit with the named limiter `api` | `429 rate_limited` |
| `throttle:60,1` | Rate limit: 60 requests per 1 minute | `429 rate_limited` |
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

{"type":"https://strutvane.dev/errors/unauthenticated","title":"Sign-in required","status":401,"code":"unauthenticated","detail":"Please sign in to continue.","traceId":"…","instance":"/api/me"}
```

**Who signs the user in?** Not the `auth` middleware: it only checks that someone is. The user is found earlier, for every request, by the authentication package's request hook (a session cookie or an API token), which sets `ctx.user`. Without such a package every request is a guest, so `auth` routes answer 401.

:::caution[Coming in 0.2]
Cookie sessions, API tokens and the login screens come with `@strutvane/auth` 0.2. Whether a **wrong** token on an `auth:optional` route is a 401 is decided there, not by this middleware.
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

**What you'll see** for a member: `403` with code `forbidden` and `"detail":"You don't have permission to do this."`. The check receives `(user, ctx)`, and `user` is `null` for guests.

Only a literal `true` allows: a rule that returns a string or an object denies (deny by default). A `can:` naming an ability you never defined stops the app at start-up. Rules about **one record** ("may this user edit this post?") belong in a policy, called from the controller, because route model binding runs after middleware. See [Authorization](../authorization/).

### `signed`

```ts
Route.get('/downloads/{file}', [DownloadController, 'show']).name('downloads.show').middleware('signed'),
```

Only links made with `url.signedRoute()` or `url.temporarySignedRoute()` for **this route's name** get through; the route must have a name. See [URL Generation](../urls/).

### `idempotent`: safe retries

Networks drop answers. A client that retries "charge the card" must not charge twice. With `idempotent`, the client sends a unique `Idempotency-Key` header (a UUID); a retry with the same key gets the **first** response replayed, marked with `Idempotent-Replayed: true`, and your action doesn't run again. GET, HEAD and OPTIONS pass straight through.

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
| Retry with the same key and the same body | The stored response, with `Idempotent-Replayed: true` |
| No `Idempotency-Key` header | `400 idempotency_key_required` (`idempotent:optional` lets it through instead) |
| A key that isn't 1–255 visible ASCII characters | `400 idempotency_key_invalid` |
| Same key while the first is still running | `409 idempotency_in_progress`, `retry-after: 1` |
| Same key with a **different** request | `422 idempotency_key_reused` |

Only the status, body, `content-type` and `location` are replayed, never cookies. Keys are scoped to the caller (user, tenant or IP), so two users can't collide. A `5xx` answer isn't stored, so a retry runs for real. Stored responses are kept in memory by default (at most 10,000 keys); bind `IdempotencyStoreToken` to share them between servers.

## Every way to apply a protection

`auth`, `csrf`, `can`, `throttle`, `signed` and `idempotent` can each be applied in **six styles**. Pick whichever reads best where you are; they all run the same middleware class, so behaviour is identical.

| Style | Code |
|---|---|
| Default / app-wide | in the `web` and `api` groups, or `withMiddleware(…)` in `bootstrap/app.ts` |
| One route | `Route.post('/import', handler).middleware('throttle:10,1')` / `.withoutMiddleware('csrf')` |
| A group | `Route.middleware('auth').group(() => { Route.get(…) })` (or an array), `Route.withoutMiddleware('csrf').group([...])`, `Route.group({ withoutMiddleware: ['csrf'] }, [...])` |
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

:::caution[Coming in 0.2]
`defineProtection()`, which turns a middleware class you registered under an alias into the same six styles, exists in the framework but isn't exported in 0.2.0-next.0. Until it is, use your own middleware through its alias (routes and groups) only:

```ts
export const admin = defineProtection('admin', EnsureAdmin)   // planned
// then: static middleware = [admin({ only: ['destroy'] })], admin.wrap(handler), await admin.verify(ctx)
```
:::

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

Every opt-out and every unsafe route without a CSRF check is flagged, and so is a developer tool route (a path starting with `/_`) without `auth`, `can` or `signed` (`developer tool route without auth`), so a reviewer sees the security surface in one table.

## Global middleware

Some checks run for **every** request, before routing, and aren't in any group, in this order: the trusted-host check, maintenance mode, CORS preflights and the request timeout (30 seconds by default, then a `503`). Security headers, the `XSRF-TOKEN` cookie and `X-Request-Id` are added to every response at the end, error responses included. You configure them in `bootstrap/app.ts` (`trustHosts`, `trustProxies`, `cors`, `securityHeaders`, `limits`, `requestTimeout`); see [Request Lifecycle](../lifecycle/) and [Security Features](../security/).

## Groups: `web` and `api`

Every route gets its file's group automatically:

| Group | Contains | Applied to |
|---|---|---|
| `web` | `csrf` | `routes/web.ts` |
| `api` | `csrf`, `throttle:api` | `routes/api.ts` |

The framework's aliases (`csrf`, `auth`, `can`, `throttle`, `signed`, `idempotent`) are reserved: giving your own class one of those names stops the app at start-up, so `route:list --security` always tells the truth. Add your own middleware to a group for every route in it:

```ts title="bootstrap/app.ts"
.withMiddleware((middleware) => {
  middleware.alias({ timing: AddTiming })
  middleware.appendToGroup('api', 'timing')        // at the end
  middleware.prependToGroup('web', 'timing')       // at the start
})
```

## Rate limiters

`throttle` counts requests per **bucket**: each signed-in user gets their own bucket; guests share one per IP address (IPv6 clients per `/64` network, so they can't dodge the limit by changing addresses).

Four limiters exist in every app: `api` (60 a minute per user, else per IP; the `api` group uses it), `login` (5 a minute per IP), `password-reset` (3 per 15 minutes per IP) and `aggregate` (1,000 a minute shared by **every** client, a circuit breaker). Change one, or add your own:

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
x-ratelimit-limit: 120
x-ratelimit-remaining: 0

{"type":"https://strutvane.dev/errors/rate-limited","title":"Too many requests","status":429,"code":"rate_limited","detail":"Please wait a moment and try again.","traceId":"…","instance":"/api/login"}
```

Counts live in the app's default [cache](../cache/) store (`memory` or `file` in 0.2, set in `config/cache.ts`). With the `memory` store each process counts on its own; shared stores (database, Redis) come in 0.3.

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
- `throttle` after `auth`: the `api` group lists `throttle` before your route's `auth`. If they ran in that order, the rate limiter wouldn't know who's signed in yet, and all users behind one office IP would share one bucket. This was found by a failing test while building it.
- `idempotent` last: a replayed response is scoped to the user and never skips the checks before it.

Your own middleware keeps its position; only these six are reordered among themselves.

## Work after the response

Some work shouldn't make the user wait: writing an audit line, sending a metric. Laravel runs it **after** the response with terminable middleware and `defer()`, and so does Strutvane. A middleware with a `terminate()` method gets it called after the response is sent:

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

In a controller, `defer()` (or `ctx.defer()`) queues work for after the response:

```ts title="app/http/controllers/signup.controller.ts"
import { Controller, defer, type HttpContext } from '@strutvane/framework'

export class SignupController extends Controller {
  store(ctx: HttpContext): Response {
    defer(async () => {
      await sendWelcomeMetric()   // runs after the response
    })
    return ctx.json({ welcome: true }, 201)
  }
}

async function sendWelcomeMetric(): Promise<void> {
  // your metrics call
}
```

Errors inside deferred work and `terminate()` are **logged, never lost**, and they can't change a response that was already sent. `node strut start` keeps the process alive until deferred work finishes, also on a graceful stop. In tests (`app.handle()` without the server), the work finishes before `handle()` returns, so assertions are deterministic. For longer jobs, use a queue. See [Concurrency](../concurrency/) and [Queues](../queues/).

## Common mistakes

### "No middleware is called …"

```text
✖ No middleware is called "admn" (used by GET /api/admin/stats).
→ Did you mean "admin"?
```

When nothing is close:

```text
✖ No middleware is called "audit" (used by GET /api/posts).
→ Register it in bootstrap/app.ts: withMiddleware((m) => m.alias({ audit: YourMiddleware })). Known: admin, csrf, auth, can, throttle, signed, idempotent.
```

**Fix:** correct the spelling, or register the alias.

### "No rate limiter is called …"

```text
✖ No rate limiter is called "logins".
→ Did you mean "login"?
```

When no limiter name is close, the hint says how to define one: `withMiddleware((m) => m.rateLimiter('logins', { maxAttempts: 60, decaySeconds: 60 })), or use numbers: throttle:60,1.`

### `ctx.requireUser()` throws 401 in my middleware

```text
{"status":401,"code":"unauthenticated","detail":"Please sign in to continue.", …}
```

**Why:** your middleware runs on a route without `auth`, so nobody was signed in.

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

(`defineProtection` isn't exported yet; see [above](#your-own-middleware-in-every-style).)

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

### "… is a framework middleware alias and can't be replaced"

```text
✖ "auth" is a framework middleware alias and can't be replaced.
→ Give your middleware another alias; the framework protections keep their names so route:list --security stays true.
```

**Fix:** register your class under another name (`'admin'`, `'team-member'`).

### Headers I set disappear or throw

**Why:** some `Response` objects are immutable.

**Fix:** copy first: `const copy = new Response(response.body, response)`, then set headers on `copy`.

## Next steps

- [CSRF Protection](../csrf/): what the `csrf` middleware checks.
- [Authorization](../authorization/): per-record permissions, beyond "is admin".
- [Routing](../routing/): attaching middleware to routes and groups.
