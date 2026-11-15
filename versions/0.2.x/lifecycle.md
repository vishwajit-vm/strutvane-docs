---
title: Request Lifecycle
description: Follow one request through a Strutvane app, from bootstrap/app.ts to your controller and back, so you know where each piece of your code runs and why.
---

When something goes wrong, the fastest way to find it is to know the order things happen in. This page follows **one request** from the moment it reaches your app to the moment the response leaves, and names the file you edit for each step.

You don't need to remember all of it. Read it once, then come back when you wonder "does my middleware run before or after the post is looked up?".

:::tip[Coming from Laravel?]
It's the same journey as Laravel's: `bootstrap/app.ts` builds the app (Laravel's `bootstrap/app.php`), providers **register** then **boot**, the request passes through middleware, route model binding runs, then your controller answers.

Two differences: the app is checked **at start-up** (a typo in a middleware alias stops the app instead of failing on the first request), and helpers like `config()` read the current app from the request itself instead of from a global container, so there's no hidden global state (see [Helpers](../helpers/) and [Facades](../facades/)).
:::

:::note[Import paths]
Examples on these pages import from `@strutvane/framework`. The exact sub-paths (for example `@strutvane/framework/http`) may still change before 0.2 ships; the names you import won't.
:::

## The whole journey in one picture

```text
             node strut serve  /  npm run dev
                        │
     ┌──────────────────▼──────────────────┐
  1  │ bootstrap/app.ts builds the app      │  Application.configure(…)…create()
     └──────────────────┬──────────────────┘
                        │  first request (or command)
     ┌──────────────────▼──────────────────┐
  2  │ boot: .env + config/*.ts validated   │  every bad variable reported at once
  3  │ providers: all register(), then boot()│  bootstrap/providers.ts
  4  │ routes compiled and checked          │  routes/web.ts, routes/api.ts
     └──────────────────┬──────────────────┘
                        │  each request
     ┌──────────────────▼──────────────────┐
  5  │ global checks: trusted host,         │  before any of your code
     │ maintenance mode, CORS preflight     │
  6  │ match the route (404 / 405)          │
  7  │ middleware: csrf → signed → auth →   │  app/http/middleware
     │   can → throttle → idempotent, …     │
  8  │ route model binding ({post} → Post)  │  404 if not found
  9  │ your controller action               │  app/http/controllers
     └──────────────────┬──────────────────┘
                        │  a Response, or a thrown error
 10  ┌──────────────────▼──────────────────┐
     │ exception handler → problem+json     │  bootstrap/app.ts withExceptions
 11  │ security + CORS headers on EVERY     │  even on 404s and error pages
     │ response                             │
     └─────────────────────────────────────┘
```

Steps 1 to 4 happen **once per process**. Steps 5 to 11 happen **for every request**.

## Step 1: `bootstrap/app.ts` builds the app

Everything starts in one file. It's a single chain that lists your config, providers, routes, middleware and error handling:

```ts title="bootstrap/app.ts"
import { dirname } from 'node:path'
import { Application, type EnvSource } from '@strutvane/framework'
import { EnsureAdmin } from '../app/http/middleware/ensure-admin.ts'
import { Post } from '../app/models/post.ts'
import { config } from '../config/index.ts'
import api from '../routes/api.ts'
import web from '../routes/web.ts'
import { providers } from './providers.ts'

export function createApp(env?: EnvSource): Application {
  return Application.configure({ basePath: dirname(import.meta.dirname), ...(env === undefined ? {} : { env }) })
    .withConfig(config)
    .withProviders(providers)
    .withRouting({ web, api, health: '/up', bindings: { post: Post } })
    .withMiddleware((middleware) => {
      middleware.alias({ admin: EnsureAdmin })
      middleware.rateLimiter('api', { maxAttempts: 120, decaySeconds: 60 })
    })
    .withExceptions((exceptions) => exceptions.shouldRenderJsonWhen((ctx) => ctx.wantsJson()))
    .create()
}

export default createApp()
```

**Why a function plus a default export?** The server and `node strut` use the default app. Tests call `createApp({ APP_ENV: 'testing', … })` to get a fresh app with their own settings, so two tests never share state.

`create()` does **no work**: no files are read and no database is opened. That makes importing the app cheap and safe.

## Step 2: boot checks your settings

The first request (or the first `node strut` command) **boots** the app. Booting starts by reading `.env`, merging in real environment variables (those win), and running every file in `config/`.

Every problem is collected and reported together, so you fix them all in one go:

```text
✖ The app can't start: 2 environment variables need attention.
  - APP_DEBUG must be true or false (got "yes") (read in config/app.ts)
  - APP_KEY is required (a text value); add it to .env (read in config/app.ts)
→ Fix the values in .env (see .env.example for every key) and start again.
```

See [Configuration](../configuration/) for how config files read `.env`.

## Step 3: providers register, then boot

A **service provider** is a class that sets up one part of your app: it puts services into the container and adds routes, commands or menu entries. Your providers are listed in `bootstrap/providers.ts`.

Strutvane calls them in **two rounds**, exactly like Laravel:

1. `register()` on **every** provider. Only bind things here.
2. `boot()` on every provider. Now it's safe to use other services, because everything is registered.

```ts title="app/providers/app.provider.ts"
import { ServiceProvider, type Application } from '@strutvane/framework'

export class AppServiceProvider extends ServiceProvider {
  override register(app: Application): void {
    // 1st round: bind services
  }

  override boot(app: Application): void {
    // 2nd round: use services, add menu entries
    app.navigation.add({ label: 'Posts', route: 'posts.index', order: 10 })
  }
}
```

More in [Service Providers](../providers/).

## Step 4: routes are compiled and checked

Strutvane reads `routes/web.ts` and `routes/api.ts`, adds the `/api` prefix to API routes, and then **checks every route** before any request is served:

| Check | What you'd see if it fails |
|---|---|
| Every middleware alias exists | `No middleware is called "auht" (used by GET /api/me).` → `Did you mean "auth"?` |
| Every `{post:slug}` has a model binding | `/api/posts/{post:slug} binds {post:slug}, but no model is bound to "post".` |
| Every controller action exists | `PostController@publsh doesn't exist (route /api/posts/{post:slug}/publish).` |
| Resource controllers have a policy | `PostController serves resource routes but has no policy.` |
| No two routes share a name or method + path | `Two routes are named "posts.show": …` |

**Why at start-up?** Because `node strut route:list` and your test suite boot the app too. A typo fails there, on your machine, instead of on the first real request in production.

## Step 5: global checks, before any of your code

Before Strutvane even looks for a route, every request passes three global checks (Laravel calls these "global middleware"):

1. **Trusted host.** The `Host` header must be one your app serves: `APP_URL`'s host, plus `localhost`, `127.0.0.1` and `[::1]` in local and testing. Anything else is a `400 untrusted_host`, and the bad host name isn't echoed back. This stops attacks where a fake `Host` ends up in a password-reset link.
2. **Maintenance mode.** While the app is "down", requests stop here with a `503` (except the health route and people with the bypass cookie). See [Maintenance Mode](../maintenance-mode/).
3. **CORS preflight.** If you switched CORS on for other sites, their browser's preflight `OPTIONS` request is answered here.

At the same time the request's **state** is worked out once: the real client IP (forwarded headers are believed only from proxies you trust), whether it came over HTTPS, the body size limits, and a fresh **CSP nonce** (a random value for this response's inline scripts). Your code reads them as `ctx.ip`, `ctx.nonce` and so on.

```bash
curl -i http://localhost:3000/up -H "Host: evil.example"
```

**What you'll see:**

```text
HTTP/1.1 400 Bad Request
content-type: application/problem+json

{"type":"https://strutvane.dev/problems/untrusted_host","title":"Untrusted host","status":400,"code":"untrusted_host","detail":"This server does not answer for the requested host name."}
```

To serve more host names, list them in `bootstrap/app.ts`: `.withMiddleware((m) => m.trustHosts({ at: ['blog.example.com'], subdomains: true }))`. See [Security Features](../security/).

:::caution[Coming in 0.2]
Maintenance mode's stage is reserved in the prototype's pipeline but not built yet. The trusted-host and CORS stages are proven in spike 12.
:::

## Step 6: the route is matched

For each request, Strutvane finds the route whose method and path match.

- **No route has that path:** a `404` with `Nothing is at GET /api/postz.`
- **The path exists, but not with that method:** a `405`, with an `Allow` header listing the methods that do work:

```bash
curl -i -X DELETE http://localhost:3000/up
```

What you'll see:

```text
HTTP/1.1 405 Method Not Allowed
allow: GET
content-type: application/problem+json

{"type":"https://strutvane.dev/problems/method_not_allowed","title":"Method not allowed","status":405,"code":"method_not_allowed","detail":"DELETE is not supported here. Use GET."}
```

## Step 7: middleware runs

**Middleware** is code that runs before (and after) your controller, for things every request needs: checking the CSRF token, signing the user in, rate limiting.

Routes in `routes/web.ts` get the `web` group (`csrf`). Routes in `routes/api.ts` get the `api` group (`csrf`, `throttle:api`). Each route can add more, like `auth`, and a controller or a wrapped handler can add more again. Strutvane merges all of them for each route at start-up.

Whatever order they're listed in, the built-in ones always run in this order: **`csrf` → `signed` → `auth` → `can` → `throttle` → `idempotent`**. Why:

- `csrf` first: a forged request is refused before anything else happens;
- `signed` before `auth`: a tampered link is a `403` whoever you are;
- `can` after `auth`: it needs to know who you are;
- `throttle` after `auth`: each signed-in user gets their own rate-limit bucket instead of sharing one per IP;
- `idempotent` last: a replayed response never skips the checks before it.

Your own middleware keeps its place in the list. See [Middleware](../middleware/).

## Step 8: route model binding

If the route has a parameter like `{post}` or `{post:slug}`, Strutvane looks up the matching record **after** middleware has run:

```ts
Route.get('/posts/{post:slug}', [PostController, 'show'])   // GET /api/posts/hello-world
```

- Found: the controller gets it with `ctx.model(Post)`.
- Not found: `404` with `No post matches "hello-world".`

**Why after middleware?** So a guest gets `401 Unauthenticated` from `auth` before they can learn whether a record exists.

## Step 9: your controller answers

Your controller action receives one argument, `ctx` (the **HTTP context**: the request, the user, the bound models), and returns a `Response`:

```ts title="app/http/controllers/post.controller.ts"
import { Controller, type HttpContext } from '@strutvane/framework'
import { Post } from '../../models/post.ts'

export class PostController extends Controller {
  show(ctx: HttpContext): Response {
    return ctx.json({ data: ctx.model(Post) })
  }
}
```

A new controller object is created **for every request**, so nothing you store on `this` can leak from one user's request into another's.

## Step 10: errors become problem+json

If anything throws (a policy says no, validation fails, or a real bug), the **exception handler** turns it into a response:

| What was thrown | Logged? | What the client gets |
|---|---|---|
| An HTTP error (401, 403, 404, 422, 429…) | No | `application/problem+json` with a stable `code` |
| A bug, in local development with `APP_DEBUG=true` | Yes | The debug page, or JSON with a `debug` member |
| A bug, in production | Yes, with a reference id | A plain 500 that quotes the reference id |

See [Error Handling](../errors/).

## Step 11: headers on every response

Last, every response (your JSON, a 404, the debug page, a 500) gets the **security headers**: a Content-Security-Policy with this request's nonce, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, framing protection, and HSTS in production. If you switched CORS on, the CORS headers are added here too.

This runs **outside** the exception handler on purpose, so even an error page is protected. You can check it on any route:

```bash
curl -i http://localhost:3000/up
```

**What you'll see** (the headers, shortened):

```text
HTTP/1.1 200 OK
content-type: application/json
content-security-policy: default-src 'self'; script-src 'nonce-…'; …
x-content-type-options: nosniff
referrer-policy: strict-origin-when-cross-origin
```

See [Security Features](../security/) to adjust them.

## "The current app": how helpers find it

Helpers like `route()`, `config()` and `now()` need to know which app they belong to. Strutvane sets the **current app** around every request and every command, using Node's `AsyncLocalStorage` (a way to carry a value through every `await` of one request, without passing it as an argument).

That's why:

- two apps in one test file never see each other's routes or config;
- a helper called at the top level of a file (when it's imported, before any request) fails with a clear message instead of reading the wrong app.

Outside a request or command (a script, a test), run code inside the app explicitly:

```ts title="scripts/print-url.ts"
import app from '../bootstrap/app.ts'
import { route } from '@strutvane/framework'

await app.boot()
const url = app.run(() => route('posts.index'))
console.log(url) // → '/api/posts'
```

See [Helpers](../helpers/).

:::caution[Coming in 0.3]
The parity plan adds a request **context** you can write to (`Context`, like Laravel's): values such as an order id that flow into every log line of the request **and into queued jobs** it dispatches. Log context per request is designed for 0.2 ([Logging](../logging/)); carrying it into queued jobs comes with the queue in 0.3.
:::

## After the response: shutdown and deferred work

When you stop the server with `Ctrl+C`, `node strut serve` stops accepting connections, waits for the open ones, then closes the database connection (`app.shutdown()`), so nothing is cut off halfway.

:::caution[Coming in 0.2]
Work that runs **after** the response is sent (Laravel's terminable middleware and `defer()`) is planned as a `terminate()` hook on middleware and a `defer(fn)` helper. Errors in deferred work are logged, never lost. See [Middleware](../middleware/).
:::

## Calling the app directly (tests)

An app is a function from a `Request` to a `Response`. Tests don't need a port or a server:

```ts title="tests/feature/health.test.ts"
import { randomBytes } from 'node:crypto'
import { expect, test } from 'vitest'
import { createApp } from '../../bootstrap/app.ts'

test('the health route answers', async () => {
  const app = createApp({ APP_ENV: 'testing', APP_KEY: `base64:${randomBytes(32).toString('base64')}`, DB_CONNECTION: 'sqlite' })
  const response = await app.handle(new Request('http://localhost/up'))
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ status: 'ok' })
})
```

**What you'll see** with `npm test`: the test passes, and it went through every step on this page: boot, global checks, routing, middleware, your action, and the headers. See [Testing](../testing/).

## Console commands follow the same path

`node strut route:list` boots the app exactly like a request does (steps 1–4), then runs the command instead of a controller. That's why `route:list` is a quick way to check that your whole app starts.

```bash
node strut route:list
```

Commands that only write files (`make:*`) skip booting, so they work even before `.env` exists. See [Strut Console](../strut-console/).

## With Docker, in production, and on Windows

- **With Docker**, the same steps run inside the `app` container; nothing changes in your code.
- **In production**, boot happens once when the process starts, and the debug page is never shown. With `APP_DEBUG=true` and `APP_ENV=production` the app refuses to boot unless you pass `--force-debug` (coming in 0.2; the prototype ignores the flag and logs a warning).
- **On every operating system**, the order is the same; only file paths in error messages look different (`C:\…` on Windows).

## Common mistakes

### "config() was called outside a request"

```text
✖ config() was called outside a request or console command, so there is no current app.
→ Call it from a controller, middleware or command, or wrap the code in app.run(() => …) (tests: await app.run(async () => …)).
```

**Why:** helpers find "the current app" from the request or command that is running. Code at the top level of a file runs when the file is imported, before any request exists.

**Fix:** call the helper inside a function that runs during a request, or wrap it:

```ts
const name = await app.run(() => config('app.name'))
```

### "Routes were added after the app booted"

```text
✖ Routes were added after the app booted, so they would never be matched.
→ Call app.addRoutes() in a provider's register() method.
```

**Why:** routes are compiled once, during boot (step 4).

**Fix:** move the `app.addRoutes(...)` call from `boot()` to `register()`.

### "My controller returned nothing"

```text
PostController@show returned nothing instead of a Response.
→ Return ctx.json(...), ctx.html(...) or ctx.noContent().
```

**Fix:** add `return` in front of `ctx.json(...)`.

### Every request answers 400 "Untrusted host"

```text
{"type":"https://strutvane.dev/problems/untrusted_host","title":"Untrusted host","status":400,"code":"untrusted_host","detail":"This server does not answer for the requested host name."}
```

**Why:** the request's host name isn't `APP_URL`'s host (or a loopback name in development). It happens when you open the app under a new domain, or behind a proxy that changes the host.
**Fix:** set `APP_URL` to the address people use, or allow more names in `bootstrap/app.ts`:

```ts title="bootstrap/app.ts"
.withMiddleware((middleware) => {
  middleware.trustHosts({ at: ['blog.example.com'], subdomains: true })
})
```

Behind a load balancer, also tell Strutvane which proxies to believe: `middleware.trustProxies({ at: ['10.0.0.0/8'] })`.

### "… was used before the app booted"

```text
✖ app.routes was used before the app booted.
→ Call `await app.boot()` first (requests and commands do it for you).
```

**Why:** a script or test read `app.routes`, `app.config` or `app.url` on an app that hasn't booted yet.
**Fix:** `await app.boot()` first. Requests (`app.handle()`) and `node strut` commands boot for you.

## Next steps

- [Service Providers](../providers/): what goes in `register()` and `boot()`.
- [Routing](../routing/): define the routes from step 4.
- [Middleware](../middleware/): write your own step 6.
