---
title: Rate Limiting
description: Limit how often a client may call your routes, per signed-in user or per IP address. The `throttle` middleware, named limiters (api, login, password-reset, aggregate), your own keys, the headers clients see, every way to apply a limit, and how to test it.
---

**Rate limiting** means refusing requests when one client sends too many in a short time. It protects sign-in forms from password guessing, keeps one busy script from slowing your app for everyone, and makes expensive endpoints (reports, exports) affordable.

Strutvane rate-limits every `/api` route out of the box: **60 requests per minute**, counted **per signed-in user**, or per IP address for guests. You can change that, and add tighter limits where they matter.

:::tip[Coming from Laravel?]
It's the same `throttle` middleware: `throttle:60,1` (60 per minute) or `throttle:api` (a named limiter). `RateLimiter::for('login', …)` becomes `middleware.rateLimiter('login', { … })` inside `withMiddleware()` in `bootstrap/app.ts`.

One difference: `throttle` always runs **after** `auth`, whatever order you list them in, so signed-in users always get their own bucket.
:::

:::caution[Coming in 0.2]
The `throttle` middleware, named limiters, user and IP buckets and the headers are **proven in a prototype** (spike 12). In that prototype the counts are kept in memory, per process, with fixed one-window counting. In 0.2 the counts live in the **cache** (the database by default, Redis if you chose it), so limits hold across processes and servers, and the four named limiters below ship by default.
:::

## The smallest example

Nothing to write: every route in `routes/api.ts` has `throttle:api`. Call one:

```bash
curl -i http://localhost:3000/api/posts -H "Authorization: Bearer $TOKEN"
```

**What you'll see** among the headers:

```text
x-ratelimit-limit: 60
x-ratelimit-remaining: 59
```

Call it 61 times within a minute, and the 61st answers:

```text
HTTP/1.1 429 Too Many Requests
retry-after: 42
x-ratelimit-limit: 60
x-ratelimit-remaining: 0
content-type: application/problem+json

{"type":"https://strutvane.dev/problems/too_many_requests","title":"Too many requests","status":429,"code":"too_many_requests","detail":"Slow down: try again in 42 seconds."}
```

`retry-after` says how many seconds until the window resets. Well-behaved clients wait that long.

## Who shares a bucket?

A **bucket** is one counter. Requests in the same bucket count together:

| Client | Bucket | Why |
|---|---|---|
| A signed-in user | their user id | Colleagues behind one office IP don't slow each other down |
| A guest | their IP address | The only thing we know about them |
| A guest on IPv6 | their `/64` network | One person usually controls a whole `/64`, so changing the last part of the address mustn't reset the limit |
| Behind a load balancer | the real client IP | Only if you trust the proxy: `middleware.trustProxies({ at: [...] })` (otherwise everyone shares the proxy's bucket) |

## Two ways to write a limit

| Reference | Means |
|---|---|
| `throttle:60,1` | 60 requests per 1 minute |
| `throttle:10` | 10 requests per minute (the minutes default to 1) |
| `throttle:api` | Use the named limiter `api` |
| `throttle` | The same as `throttle:api` |

```ts title="routes/api.ts"
Route.post('/contact', [ContactController, 'store']).middleware('throttle:5,1'),
Route.get('/reports/{report}', [ReportController, 'show']).middleware('throttle:reports'),
```

## Named limiters

A **named limiter** is a limit you define once and use by name. Define it in `bootstrap/app.ts`:

```ts title="bootstrap/app.ts"
.withMiddleware((middleware) => {
  middleware.rateLimiter('api', { maxAttempts: 120, decaySeconds: 60 })      // change the default
  middleware.rateLimiter('reports', { maxAttempts: 10, decaySeconds: 60 })
})
```

| Option | Means |
|---|---|
| `maxAttempts` | How many requests the bucket allows |
| `decaySeconds` | The window, in seconds |
| `by` | Optional: a function `(ctx) => string` that picks the bucket |

### The limiters Strutvane ships

| Name | Used by | Default |
|---|---|---|
| `api` | every route in `routes/api.ts` | 60 per minute per user or IP |
| `login` | sign-in | tight, per account and per IP |
| `password-reset` | "forgot password" | tight, per email and per IP |
| `aggregate` | the generated `/aggregate` endpoints (group-by counts) | tighter than `api`, because they're expensive |

:::caution[Coming in 0.2]
The prototype defines only `api` (60 per minute). `login`, `password-reset` and `aggregate` ship with 0.2; their exact numbers aren't final. Redefining one with `rateLimiter()` replaces it.
:::

### Your own bucket key: `by`

Limit sign-in attempts **per email address** as well as per IP, so one attacker can't try a password on thousands of accounts from one address, nor one account from many addresses:

```ts title="bootstrap/app.ts"
.withMiddleware((middleware) => {
  middleware.rateLimiter('login-by-ip', { maxAttempts: 20, decaySeconds: 60, by: (ctx) => ctx.ip })
  middleware.rateLimiter('exports', {
    maxAttempts: 3,
    decaySeconds: 3600,
    by: (ctx) => `user:${String(ctx.user?.id ?? ctx.ip)}`,   // 3 exports an hour per user
  })
})
```

```ts title="routes/api.ts"
Route.post('/exports', [ExportController, 'store']).middleware('auth', 'throttle:exports'),
```

**What you'll see:** the fourth export within an hour answers `429` with a `retry-after` of up to 3,600 seconds.

## Every way to apply a limit

`throttle` works in every style the other protections do:

| Style | Code |
|---|---|
| App-wide | it's in the `api` group already; change the `api` limiter |
| One route | `.middleware('throttle:5,1')` |
| A group | `Route.middleware('throttle:reports').group(() => { Route.get(…) })` |
| A whole resource | `Route.apiResource('posts', PostController).middleware('throttle:30,1')` |
| Some resource actions | `.middlewareFor(['store'], 'throttle:10,1')` |
| A controller | `static readonly middleware = [throttle({ params: ['10', '1'], only: ['store'] })]` |
| A closure | `withThrottle(async (ctx) => …, '5', '1')` |
| By hand | `await throttle.verify(ctx, '5', '1')` |
| Turn it off for a route | `.withoutMiddleware('throttle')` (flagged by `route:list --security`) |

Typical example, a controller that throttles only writing:

```ts title="app/http/controllers/comment.controller.ts"
import { Controller, throttle, type HttpContext } from '@strutvane/framework'

export class CommentController extends Controller {
  static readonly middleware = [throttle({ params: ['20', '1'], only: ['store'] })]

  index(ctx: HttpContext): Response { return ctx.json({ data: [] }) }
  store(ctx: HttpContext): Response { return ctx.json({ data: {} }, 201) }
}
```

See [Middleware](../middleware/) for the styles in detail.

## Several limits on one route

Limits add up: a route in the `api` group with `throttle:5,1` of its own is limited by **both** (`api` and `5,1` are different buckets). The tightest one decides first.

## Seeing the limits

```bash
node strut route:list --security
```

The Protections column shows every `throttle:…` that really applies to each route, after groups, the route, the controller and wrappers.

## Testing limits

Freeze the clock so windows are predictable, then send requests:

```ts title="tests/feature/contact-throttle.test.ts"
import { randomBytes } from 'node:crypto'
import { expect, test } from 'vitest'
import { ClockToken } from '@strutvane/framework'
import { client } from '@strutvane/framework/testing'
import { createApp } from '../../bootstrap/app.ts'

test('the contact form allows 5 posts a minute', async () => {
  const app = createApp({ APP_ENV: 'testing', APP_KEY: `base64:${randomBytes(32).toString('base64')}`, DB_CONNECTION: 'sqlite' })
  app.container.instance(ClockToken, () => new Date('2026-11-14T10:00:00Z'))
  const http = client(app).withoutCsrf()

  for (let i = 0; i < 5; i += 1) (await http.postJson('/api/contact', { message: 'hi' })).assertStatus(200)
  const sixth = await http.postJson('/api/contact', { message: 'hi' })

  sixth.assertProblem(429, 'too_many_requests')
  expect(sixth.headers.get('retry-after')).toBe('60')
})
```

**What you'll see** with `npm test`: the test passes. A new app per test means a fresh set of buckets. (`withoutCsrf()` skips the CSRF check for the test client; it only works when `APP_ENV=testing`, so it can never switch CSRF off in a real deployment.)

## With Docker, several processes and several servers

The counting store matters once your app runs more than one process:

| Setup | In the prototype (memory) | In 0.2 (the cache) |
|---|---|---|
| One process (`npm run dev`, one server) | correct | correct |
| Several processes or servers | each counts alone, so the real limit is multiplied | shared, so the limit holds |

Docker mode changes nothing: the app container is one process in development. To use your own store, bind `RateLimitStoreToken` in a provider's `register()`.

## Coming later

:::caution[Coming in 0.2]
Not in the prototype yet: sliding windows (smoother than a fixed one-minute window), lockout with growing back-off after repeated failed sign-ins, and **lockout events** for the audit log.
:::

## Common mistakes

### "No rate limiter is called …"

```text
✖ No rate limiter is called "report".
→ Define it in bootstrap/app.ts: withMiddleware((m) => m.rateLimiter('report', { maxAttempts: 60, decaySeconds: 60 })), or use numbers: throttle:60,1.
```

**Fix:** define it, or correct the name (`reports`).

### Everyone in our office gets 429 at once

**Why:** they're guests (not signed in), so they share their office's IP bucket. Or the app runs behind a proxy you haven't trusted, so **everyone** shares the proxy's address.
**Fix:** require sign-in for that route (users get their own bucket), and configure `trustProxies` behind a load balancer.

### Signed-in users still share a bucket

**Why:** the route has `throttle` but no `auth`, so nobody is signed in when it counts.
**Fix:** add `auth` (or `auth:optional`) to the route. `throttle` always runs after it.

### The limit seems higher than I set in production

**Why:** with several processes and the in-memory prototype store, each process counts on its own.
**Fix:** use the shared store (the default from 0.2), or bind `RateLimitStoreToken` to one.

## Next steps

- [Middleware](../middleware/): every style and the run order.
- [Authentication](../authentication/): sign-in throttling and lockouts.
- [Security Features](../security/): the other protections.
