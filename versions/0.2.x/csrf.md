---
title: CSRF Protection
description: How Strutvane stops other websites from sending requests as your signed-in users, the exact rules, what a 419 means, and every way to adjust the check (app-wide, per route, per group, per controller, per function or by hand) with examples.
---

**CSRF** (cross-site request forgery) is an attack where another website makes your user's browser send a request to your app. The browser attaches your app's session cookie automatically, so without protection the request would run as that user: "delete my account", "publish this post".

Strutvane checks every request that could change something (POST, PUT, PATCH, DELETE) and **arrives with a session cookie**. Such a request must prove it came from your own pages. The check is on by default in both the `web` and the `api` route groups, so you write nothing to get it. When you do need to adjust it, you can do so in whichever style you like, and every change stays visible in `node strut route:list --security`.

:::tip[Coming from Laravel?]
Same purpose as Laravel's `VerifyCsrfToken` / `ValidateCsrfToken`, the same `X-CSRF-TOKEN` and `X-XSRF-TOKEN` headers, the same `XSRF-TOKEN` cookie for JavaScript, the same `_token` form field, the same `419 Page Expired` status, and the same app-wide exceptions in `bootstrap/app.ts` (`validateCsrfTokens({ except: [...] })`), matched against the full path like Laravel's.

Three differences:
- the check also covers `/api` routes when they're called with a cookie;
- the browser's `Sec-Fetch-Site: same-origin` header counts as proof, so your own React app passes without a token;
- `csrf_field()` and `csrf.token()` take the request context (`csrf_field(ctx)`), because there are no global request facades.
:::

:::caution[Coming in 0.2]
Everything on this page except the parts in their own "Coming in 0.2" boxes is **proven in a prototype** (spike 12, the application core, with attack-style tests). It is not released yet, and the import path inside `@strutvane/framework` may still change. Sessions and sign-in come with `@strutvane/auth`.
:::

## The smallest example (nothing to do)

Your React app calls your API from the same origin as `APP_URL`, with the session cookie:

```ts title="resources/ui/pages/new-post.tsx"
await fetch('/api/posts', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ title: 'Hello' }),
})
```

**What you'll see:** the request passes. The browser added `Sec-Fetch-Site: same-origin` by itself, and that is proof enough.

## The rules, exactly

For each request, the `csrf` middleware decides in this order:

| # | Situation | Result |
|---|---|---|
| 1 | The method is GET, HEAD or OPTIONS (these must never change anything) | **Pass** |
| 2 | The test client switched the check off with `withoutCsrf()` (only when `APP_ENV=testing`) | **Pass** |
| 3 | No session cookie (`strutvane_session`; `__Host-strutvane_session` over HTTPS), or an `Authorization: Bearer …` header | **Pass** (the browser attached nothing an attacker could borrow) |
| 4 | The path matches an app-wide exception from `validateCsrfTokens({ except })` | **Pass** |
| 5 | `Sec-Fetch-Site: same-origin` | **Pass** |
| 6 | `Sec-Fetch-Site` is `same-site` or `cross-site` | Not proof (a sibling subdomain is not your site); go on to rule 8 |
| 7 | No `Sec-Fetch-Site` (or `none`), and `Origin` equals the origin of `APP_URL`, or a trusted origin, exactly | **Pass** (`Origin: null` never passes) |
| 8 | A valid token in the `X-CSRF-TOKEN` or `X-XSRF-TOKEN` header, or in the `_token` field of a urlencoded form | **Pass** |
| — | Anything else | **419** |

The `Referer` header is never used: browsers often strip it, and a page on a sibling subdomain can shape it.

A failure is a problem response (the error format every Strutvane API uses). Every cross-origin refusal in Strutvane, from the framework or from the auth package, is this same 419 with the code `csrf_token_mismatch`:

```text
HTTP/1.1 419
content-type: application/problem+json

{"type":"https://strutvane.dev/problems/csrf_token_mismatch","title":"Page expired","status":419,"code":"csrf_token_mismatch","detail":"This request could not be verified as coming from this site. Reload the page and try again."}
```

When `APP_DEBUG=true` and `APP_ENV` is `local` or `testing`, the body also has a `hint`:

```text
Send the X-CSRF-TOKEN header (csrf.token(ctx)), a _token form field (csrf_field(ctx)), or make the request from the same origin as APP_URL.
```

### What "419" means

**419** isn't an official HTTP status; Laravel made it popular as "Page Expired". It means "this request changes something, it came with your session cookie, and nothing proves it came from your pages". A user usually sees it after a page sat open so long that the session behind its token ended, which is why the message says "Reload the page".

## Why bearer tokens skip the check

A browser attaches cookies (and Basic credentials) to requests **by itself**, which is what makes CSRF possible. It never attaches an `Authorization: Bearer` header by itself: your code has to add it. So a request with a bearer token can't have been forged by another site.

Only `Bearer` skips the check. `Authorization: Basic …` doesn't, because browsers *do* attach Basic credentials automatically. And a request with a bearer header is never signed in through the cookie, even if it also carries one, so a fake bearer can't ride on a real session.

```bash
curl -X POST http://localhost:3000/api/posts \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"title":"From a script"}'
```

**What you'll see:** `201 Created`. Scripts, mobile apps and other servers use tokens and never deal with CSRF.

## Every way to adjust it

The check is a **protection**: a middleware you can add or remove in several styles. All of them run the same code. Pick the one that fits the place you're working in.

| Style | Code | Shown by `route:list --security` |
|---|---|---|
| Default | nothing: on for the `web` and `api` groups | yes |
| App-wide exceptions | `validateCsrfTokens({ except: ['api/webhooks/*'] })` in `bootstrap/app.ts` | yes, as `csrf (app: api/webhooks/*)` |
| One route | `.middleware('csrf')` / `.withoutMiddleware('csrf')` | yes, as `csrf (route)` |
| A group | `Route.middleware('csrf').group(() => [...])` / `Route.withoutMiddleware('csrf').group(() => [...])` (an array instead of the callback works too) | yes, as `csrf (group)` |
| A controller | `static readonly middleware = [csrf({ except: ['callback'] })]` | yes, as `csrf (controller)` |
| A plain function | `export default withCsrf(async (ctx) => ...)` | yes |
| By hand | `await csrf.verify(ctx)` | no (it runs inside your code) |

### App-wide exceptions (small)

Use this for **webhooks**: payment providers and other services post to you from their servers, with no session cookie and no token. Listing their paths here is Laravel 11's way, and it keeps all exceptions in one file.

```ts title="bootstrap/app.ts"
import { dirname } from 'node:path'
import { Application } from '@strutvane/framework'
import { config } from '../config/index.ts'
import api from '../routes/api.ts'
import web from '../routes/web.ts'
import { providers } from './providers.ts'

export default Application.configure({ basePath: dirname(import.meta.dirname) })
  .withConfig(config)
  .withProviders(providers)
  .withRouting({ web, api })
  .withMiddleware((middleware) => {
    middleware.validateCsrfTokens({
      // Full paths, `api/` prefix included, without the leading slash. `*` matches anything, slashes included.
      except: ['api/webhooks/*'],
      // Another of your own sites whose pages may post here (exact origins only).
      origins: ['https://admin.example.com'],
    })
  })
  .create()
```

**What you'll see:** `POST /api/webhooks/stripe` with a cookie and no token passes; `POST /api/webhooksx` still gets 419. A page on `https://admin.example.com` passes the `Origin` check (rule 7), while `https://admin.example.com.evil.net` and `http://admin.example.com` (no `s`) don't.

Patterns match the **full path**, as in Laravel, so routes in `routes/api.ts` need the `api/` prefix: `except: ['webhooks/*']` would only match `/webhooks/...`, never `/api/webhooks/...`.

A pattern that can never match a registered route is almost always this mistake, so the app logs a warning naming the pattern when it starts.

:::caution[Coming in 0.2]
The start-up warning for a pattern that matches no route is decided but not built yet. The prototype (spike 12) already refuses an empty pattern or one with a space, and `security:check` warns about a pattern that matches every path.
:::

An origin must be exactly `scheme://host[:port]`. `null`, `*` and origins with a path are refused when the app starts, because any of them would accept pages you don't own.

### One route

When a single endpoint needs a different rule than its group:

```ts title="routes/web.ts"
import { defineRoutes, Route } from '@strutvane/framework'
import { ImportController } from '../app/http/controllers/import.controller.ts'
import { PaymentWebhookController } from '../app/http/controllers/payment-webhook.controller.ts'

export default defineRoutes([
  // The provider posts here from its own servers: no cookie, no token.
  Route.post('/payments/notify', [PaymentWebhookController, 'handle']).withoutMiddleware('csrf'),
  // Already on through the web group; writing it again is harmless and documents intent.
  Route.post('/import', [ImportController, 'store']).middleware('csrf'),
])
```

**What you'll see:** `/payments/notify` accepts the provider's posts, and `route:list --security` lists `! csrf (route)` next to it so a reviewer notices.

### A group

Add or remove the check for several routes at once:

```ts title="routes/web.ts"
import { defineRoutes, Route } from '@strutvane/framework'
import { InboundMailController } from '../app/http/controllers/inbound-mail.controller.ts'

export default defineRoutes([
  Route.withoutMiddleware('csrf').group(() => [
    Route.post('/inbound/mail', [InboundMailController, 'receive']),
    // A more specific add wins over the group's opt-out: this one is protected again.
    Route.post('/inbound/settings', [InboundMailController, 'settings']).middleware('csrf'),
  ]),
])
```

**What you'll see:** a forged post to `/inbound/mail` passes (200), and one to `/inbound/settings` gets 419. Adding a protection is always safe, so a route or controller that adds `csrf` keeps it even inside a group that opted out.

`.group()` takes the routes from a callback, Laravel's shape, or directly as an array: `Route.middleware('csrf').group([...])`. Both give the same group. `Route.group({ prefix, name, middleware, withoutMiddleware: ['csrf'] }, [...])` does the same as the fluent form, together with a prefix and a name.

:::caution[Coming in 0.2]
The prototype (spike 12) takes the array form only; the callback form is decided but not built yet.
:::

### A controller

When the rule belongs with the code it protects, write it in the controller's `static readonly middleware` list. Each entry is built by a protection function: `csrf()`, `auth()`, `can()`, `throttle()`.

```ts title="app/http/controllers/payment.controller.ts"
import { csrf, type HttpContext } from '@strutvane/framework'

export class PaymentController {
  // CSRF on every action except the provider's callback.
  static readonly middleware = [csrf({ except: ['callback'] })]

  callback(ctx: HttpContext): Response {
    return ctx.json({ received: true })
  }

  pay(ctx: HttpContext): Response {
    return ctx.json({ paid: true })
  }
}
```

**What you'll see:** a forged post to the `callback` action passes; one to `pay` gets 419. `except` both adds the protection to the other actions and **opts these actions out**, even when a group added `csrf`. Use `only: ['store']` to add it to some actions without opting anything out.

### A plain function

Small routes are often a single function instead of a controller. Wrap it:

```ts title="app/http/handlers/import-posts.ts"
import { withCsrf } from '@strutvane/framework'

export default withCsrf(async (ctx) => {
  return ctx.json({ imported: true })
})
```

**What you'll see:** the check runs even if the route sits in a group that opted out. When the router already ran `csrf`, the wrapper doesn't run it a second time; when you call the function directly (outside the router), the wrapper runs the check itself.

### By hand

Sometimes the decision depends on the request, so the check has to happen inside your code:

```ts title="app/http/controllers/comment.controller.ts"
import { csrf, type HttpContext } from '@strutvane/framework'

export class CommentController {
  async store(ctx: HttpContext): Promise<Response> {
    // Verify now. Resolves when the request passes; throws the 419 when it doesn't.
    await csrf.verify(ctx)
    return ctx.json({ saved: true }, 201)
  }
}
```

**What you'll see:** the same 419 as the middleware. This is the one style `route:list --security` can't see, so prefer the others when you can.

## Sending the token yourself

When a request can't prove its origin with headers (a page served from another origin you trust, or an old browser), send the token. It's an HMAC of the session id under a key derived from your `APP_KEY`, so it's tied to one session and useless in any other.

The key comes from the framework's keyring (`keyring.derive('csrf')`), which also accepts the keys in `APP_PREVIOUS_KEYS`, so `node strut key:rotate` doesn't break forms that are already open.

:::caution[Coming in 0.2]
The prototype (spike 12) derives the CSRF key from the current `APP_KEY` only, so after a rotation an open form needs one reload. Moving CSRF onto the keyring is decided but not built yet.
:::

### From a server-rendered page or a plain HTML form

```ts title="app/http/controllers/post-form.controller.ts"
import { csrf_field, csrf_meta, type HttpContext } from '@strutvane/framework'

export class PostFormController {
  create(ctx: HttpContext): Response {
    return ctx.html(`<!doctype html>
<html>
  <head>${csrf_meta(ctx)}</head>
  <body>
    <form method="post" action="/posts">
      ${csrf_field(ctx)}
      <input name="title">
      <button>Save</button>
    </form>
  </body>
</html>`)
  }
}
```

**What you'll see** in the page source:

```html
<meta name="csrf-token" content="k1YqZ3x0...">
<input type="hidden" name="_token" value="k1YqZ3x0...">
```

The form posts `_token` with the other fields (rule 8). The value is HTML-escaped for you.

### From your own JavaScript

The framework sets an **`XSRF-TOKEN` cookie** that JavaScript can read (`SameSite=Lax`, not `HttpOnly`, on purpose). The generated API client and the `@strutvane/ui` forms copy it into an `X-XSRF-TOKEN` header for you. In a plain `fetch`, do the same:

```ts title="resources/ui/lib/xsrf.ts"
export function xsrfToken(): string {
  const cookie = document.cookie.split('; ').find((part) => part.startsWith('XSRF-TOKEN='))
  return cookie === undefined ? '' : decodeURIComponent(cookie.slice('XSRF-TOKEN='.length))
}

export async function publishPost(slug: string): Promise<Response> {
  return fetch(`/api/posts/${encodeURIComponent(slug)}/publish`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-xsrf-token': xsrfToken() },
    body: '{}',
  })
}
```

**What you'll see:** the request passes rule 8. Reading the cookie is safe: another site can make the browser *send* it, but can't *read* it, so it can't copy it into a header.

:::caution[Coming in 0.2]
The `XSRF-TOKEN` cookie is decided but not built: the prototype (spike 12) accepts the `X-XSRF-TOKEN` header but doesn't set the cookie yet. Until then, read the token from the meta tag, as below.
:::

Or read the meta tag and send the header:

```ts title="resources/ui/lib/api.ts"
const token = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? ''

export async function createPost(title: string): Promise<Response> {
  return fetch('/api/posts', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': token },
    body: JSON.stringify({ title }),
  })
}
```

**What you'll see:** the request passes rule 8. The token is compared in constant time, so it can't be guessed byte by byte from response timings.

`csrf.token(ctx)` returns the bare token, for anything else (a JSON bootstrap, a custom header).

:::caution[Coming in 0.2]
**Designed, not built yet:** the `@strutvane/ui` forms and the generated API client will send `X-XSRF-TOKEN` for you, and a `<CsrfField />` React component in `@strutvane/ui` will do what `csrf_field(ctx)` does. Until then, use the code above.
:::

## In tests

Feature tests post with a session cookie and no real browser, so they would get 419. Turn the check off for one request with `withoutCsrf()`:

```ts title="tests/feature/posts.test.ts"
import { client } from '@strutvane/framework/testing'
import { describe, it } from 'vitest'
import app from '../../bootstrap/app.ts'

describe('posts', () => {
  it('creates a post', async () => {
    const response = await client(app)
      .withHeaders({ cookie: 'strutvane_session=test-session' })
      .withoutCsrf()
      .postJson('/api/posts', { title: 'Hello' })
    response.assertStatus(201)
  })
})
```

**What you'll see:** the test passes. `withoutCsrf()` works **only** with `APP_ENV=testing`; in `local`, `staging` or `production` it throws, so it can never switch CSRF off in a real deployment.

Requests with an API token don't need it at all: `withToken(token)` sends an `Authorization: Bearer` header, and bearer requests skip the check (see [why](#why-bearer-tokens-skip-the-check)). To sign in as a user instead, `actingAs(user)` takes a user model.

:::caution[Coming in 0.2]
`actingAs(user)` with a user model and `withToken(token)` are decided but not built. In the prototype (spike 12), `actingAs()` takes a bearer token. See [HTTP Tests](../http-tests/).
:::

Keep at least one test that proves a route **rejects** a forged request: post with the cookie and no token, and assert `419`. A dedicated assertion helper for this is designed but not built yet.

## Seeing every opt-out: `route:list --security`

Every style except the by-hand call shows up here, with the place it was written:

```bash
node strut route:list --security
```

**What you'll see** (something like this; the table layout is final, the routes are your own):

```text
  Method  URI                     Name                  Protections            Opt-outs                       Warnings
  ------  ----------------------  --------------------  ---------------------  -----------------------------  --------
  POST    /payments/notify                              (none)                 ! csrf (route)
  POST    /inbound/mail                                 (none)                 ! csrf (group)
  POST    /api/webhooks/stripe                          throttle:api           ! csrf (app: api/webhooks/*)
  POST    /api/pay/callback                             throttle:api           ! csrf (controller)
  GET     /api/me                                       csrf, auth, throttle:api
  POST    /_strutvane/csp-report  strutvane.csp-report  throttle:60,1          ! csrf (route)

  6 routes, 5 opt-outs, 0 warnings.
```

- **Protections** are the security middleware that really run, after groups, the route, the controller and wrappers: `csrf`, `signed`, `auth`, `can`, `throttle`, `idempotent`.
- **Opt-outs** say where each one was switched off: `route`, `group`, `controller` or `app` (with the pattern).
- **Warnings** flag an unsafe route (POST, PUT, PATCH, DELETE) with no CSRF check at all, and a developer tool route (a path starting with `/_`) with no `auth`, `can` or `signed`.

The framework's own CSP report endpoint is listed with a deliberate opt-out: browsers post violation reports without your token, and a report changes nothing. Add `--json` for the same data in a form scripts can read.

## The rules for opting out

These rules make a mistake fail loudly instead of quietly removing a protection:

1. An opt-out removes the protection whichever group added it.
2. A route, controller or wrapper that **adds** a protection its group opted out of keeps it: the more specific declaration wins.
3. Adding and removing the same protection at the same level is an error when the app starts.
4. Opting out of a name nobody registered (a typo) is an error when the app starts, with a suggestion.
5. A controller's `only`/`except` naming an action the controller doesn't have is an error when the app starts.

Because these are start-up errors, `node strut route:list` and every test fail on them too, long before a request arrives.

## The same styles for other protections

CSRF is one example of a rule that runs through the whole framework: every protection can be applied by default, in `bootstrap/app.ts`, per route, per group, per controller, as a wrapper function and by hand.

| Protection | What it checks | Styles |
|---|---|---|
| `csrf` | the request came from your pages | proven in the prototype |
| `auth` (`auth:optional`) | someone is signed in | proven: `auth()`, `withAuth()`, `auth.verify(ctx)` |
| `can` | a named ability (`can:view-reports`) | proven: `can({ params: ['view-reports'] })`, `withCan(handler, 'view-reports')` |
| `throttle` | the rate limit (`throttle:60,1`, `throttle:api`) | proven: `throttle({ params: ['10', '1'] })`, `withThrottle(handler, '10', '1')` |
| `signed`, `idempotent` | a valid signed URL (403 `invalid_signature` / `signature_expired`), an idempotency key | proven: `withSigned(handler)`, `withIdempotency(handler)` |
| `verified`, `password.confirm` | a verified email, a recent password | designed, not built yet |

```ts title="app/http/controllers/report.controller.ts"
import { auth, can, throttle, type HttpContext } from '@strutvane/framework'

export class ReportController {
  static readonly middleware = [
    auth({ except: ['index'] }),
    can({ params: ['view-reports'], only: ['secret'] }),
    throttle({ params: ['10', '1'], only: ['index'] }),
  ]

  index(ctx: HttpContext): Response {
    return ctx.json({ public: true })
  }

  secret(ctx: HttpContext): Response {
    return ctx.json({ secret: true })
  }
}
```

**What you'll see:** a guest can read `index` (at most 10 times a minute), gets 401 on `secret`, and a signed-in user without the `view-reports` ability gets 403. See [Middleware](../middleware/) and [Rate Limiting](../rate-limiting/).

## Why not decorators?

Some TypeScript frameworks let you write `@csrf()` above a method. Strutvane doesn't offer that, for now:

- the engineering standard bans decorators;
- Node's built-in TypeScript support (type stripping, which runs your `.ts` files without a build step) can't run them, so development would need a compiler;
- they hide behaviour from `route:list --security`, which is how a reviewer sees the whole security surface.

Allowing them as optional sugar would need a decision record from the project lead. The controller's `static readonly middleware` list gives the same "rule next to the code" feel without these costs.

## With Docker or without

Nothing changes. In Docker mode your browser still talks to `http://localhost:3000` (the published port), so `APP_URL` stays `http://localhost:3000` and the `Origin` check matches. If you open the app through another address (a LAN IP, a tunnel), set `APP_URL` to that address.

## Common mistakes

### My form post from another subdomain gets 419

```text
{"type":"https://strutvane.dev/problems/csrf_token_mismatch","title":"Page expired","status":419,"code":"csrf_token_mismatch","detail":"This request could not be verified as coming from this site. Reload the page and try again."}
```

**Why:** `admin.example.com` calling `api.example.com` is `same-site`, not `same-origin`, and Strutvane never trusts a sibling subdomain on headers alone.

**Fix:** trust that exact origin, or send the token:

```ts title="bootstrap/app.ts"
// inside .withMiddleware((middleware) => { ... })
middleware.validateCsrfTokens({ origins: ['https://admin.example.com'] })
```

### I get 419 in local development only

**Why:** `APP_URL` in `.env` doesn't match the address in your browser (`http://localhost:3000` vs `http://127.0.0.1:3000`), so the `Origin` check fails.

**Fix:** open the app at exactly the address in `APP_URL`, or change it:

```ini title=".env"
APP_URL=http://localhost:3000
```

### My script gets 419

**Why:** it sends a session cookie copied from the browser, but no bearer token.

**Fix:** authenticate scripts with a token, never a copied cookie:

```bash
curl -X POST http://localhost:3000/api/posts -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"title":"Hi"}'
```

### My webhook gets 419

**Why:** the provider's request carries no token. (It also usually carries no session cookie, in which case it passes rule 3; a 419 means a cookie was sent, often by a proxy or a test tool.)

**Fix:** list the path as an exception, with the `api/` prefix for API routes, and verify the provider's signature in the controller:

```ts title="bootstrap/app.ts"
// inside .withMiddleware((middleware) => { ... })
middleware.validateCsrfTokens({ except: ['api/webhooks/*'] })
```

### "There is no session on this request" when I call `csrf.token(ctx)`

```text
There is no session on this request, so there is no CSRF token to give out.
```

**Why:** the token is bound to a session, and this request has none yet (nobody has signed in). A token bound to nothing would protect nothing. The error code is `no_session_for_csrf`.

**Fix:** render the token only on pages for signed-in users. Tokens for the sign-in and registration pages come with the session layer of `@strutvane/auth` (coming in 0.2).

### `withoutCsrf()` throws outside my tests

```text
withoutCsrf() was used with APP_ENV=local.
```

**Why:** it's a test helper, and it refuses to run unless `APP_ENV=testing`, so it can never switch CSRF off in a real deployment.

**Fix:** run your tests with `APP_ENV=testing` (the test setup does this), and use one of the styles above for real exceptions.

### The app won't start after I added an exception or origin

```text
  ✖ The app can't start: 1 security setting is unsafe or invalid.
  - csrf origins: "*" must be an exact origin such as https://admin.example.com (no path, no "*", never "null").
  → Fix them in bootstrap/app.ts (withMiddleware). Each line above says what is wrong and what is allowed.
```

**Why:** an origin was `*`, `null` or carried a path, or an `except` pattern was empty or contained a space (`csrf except: "api/web hooks/*" is not a path pattern (use something like "webhooks/*").`). Each would accept far more than you meant.

**Fix:** list exact origins and plain path patterns. A leading slash is fine (it's ignored):

```ts title="bootstrap/app.ts"
// inside .withMiddleware((middleware) => { ... })
middleware.validateCsrfTokens({ except: ['api/webhooks/*'], origins: ['https://admin.example.com'] })
```

### "both adds "csrf" and opts out of it"

```text
POST /import both adds "csrf" and opts out of it (route).
```

**Why:** the same route both adds and removes the protection, and guessing which one you meant could silently remove a protection someone wrote on purpose. The code is `middleware_conflict`.

**Fix:** remove one of the two: an opt-out can only remove middleware the route inherits from a group.

## Next steps

- [Security Features](../security/): every protection that is on by default.
- [Middleware](../middleware/): where `csrf` sits in the order.
- [Authentication](../authentication/): sessions and tokens.
- [CLI Reference](../cli-reference/): `route:list` and its options.
