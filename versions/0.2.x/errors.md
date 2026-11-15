---
title: Error Handling
description: What happens when your code throws. The developer error page with "Copy as Markdown for AI", the JSON debug member, plain 500s with a reference id in production, which errors are logged, and how to customise it all.
---

Sooner or later some code throws an error. Strutvane catches every error thrown while handling a request and decides two things:

1. **What to send** to the client: a helpful page while you develop, a safe and plain answer in production.
2. **What to log:** real bugs, with a reference id, but never expected errors like "not found".

You don't have to set anything up. This page shows what you'll see, and how to change it.

:::tip[Coming from Laravel?]
The developer page is Strutvane's Ignition (with a **"Copy as Markdown for AI"** button), `withExceptions()` in `bootstrap/app.ts` is the same place as Laravel 11's, and `render()`, `dontReport()` and `shouldRenderJson()` are here as `render()`, `dontReport()` and `shouldRenderJsonWhen()`.

One stricter rule: the debug page needs `APP_DEBUG=true` **and** `APP_ENV=local` or `testing`. In production, the app **refuses to start** with `APP_DEBUG=true` (unless you force it), so a forgotten flag can't leak your source code.
:::

## The smallest example

A route with a bug:

```ts title="app/http/controllers/diagnostics.controller.ts"
import { Controller, type HttpContext } from '@strutvane/framework'

export class DiagnosticsController extends Controller {
  boom(_ctx: HttpContext): Response {
    throw new TypeError('Cannot read properties of undefined (reading "title")')
  }
}
```

```ts title="routes/web.ts"
Route.get('/_diagnostics/boom', [DiagnosticsController, 'boom']).name('diagnostics.boom'),
```

Open `http://localhost:3000/_diagnostics/boom` in your browser with this in `.env`:

```ini
APP_ENV=local
APP_DEBUG=true
```

What you'll see: the **developer error page**, with

- a red header: `TypeError` and the message;
- the **exact line** in your file that threw (`app/http/controllers/diagnostics.controller.ts:7`), with the code around it;
- the stack (the chain of calls that led there);
- the request: method, URL and headers, with credentials masked;
- a **Copy as Markdown for AI** button.

## The three behaviours

| What was thrown | Logged? | Local/testing + `APP_DEBUG=true` | Production (or `APP_DEBUG=false`) |
|---|---|---|---|
| An HTTP error (`NotFoundError`, `ForbiddenError`, `ValidationError`…) | **No** (it's expected) | problem+json, with a developer `hint` when there is one | problem+json, no hint |
| Anything else (a bug), for a browser | **Yes**, with a reference id | The developer error page | A plain "500 · Server error" page with the reference id |
| Anything else (a bug), for an API client | **Yes**, with a reference id | problem+json with a `debug` member | problem+json with the reference id |

"For a browser" or "for an API client" is decided by `ctx.wantsJson()`: `/api/...` paths and requests whose `Accept` header mentions JSON get JSON.

## The developer error page

Shown only when **both** are true:

```ini
APP_DEBUG=true
APP_ENV=local     # or testing
```

It's built to be safe even on your machine:

- `Authorization`, `Cookie`, `X-CSRF-TOKEN`, `X-API-Key` and similar headers show `[redacted]`;
- query parameters named like `token`, `password`, `secret`, `key`, `signature` or `code` are masked;
- the request **body is never shown**;
- only **your app's own files** are quoted, never `node_modules`;
- everything is HTML-escaped, and the page's single script (the copy button) is locked down by a Content Security Policy, so an error message containing `<script>` can't run.

### Copy as Markdown for AI

The button copies the whole report as Markdown, ready to paste into an AI assistant or a GitHub issue:

````markdown
# TypeError: Cannot read properties of undefined (reading "title")

- **Request:** GET http://localhost:3000/_diagnostics/boom
- **Route:** diagnostics.boom
- **Environment:** local, Node v24.21.0

## Where: `app/http/controllers/diagnostics.controller.ts:7`

```ts
     5 | export class DiagnosticsController extends Controller {
     6 |   boom(_ctx: HttpContext): Response {
>    7 |     throw new TypeError('Cannot read properties of undefined (reading "title")')
     8 |   }
     9 | }
```

## Stack

- DiagnosticsController.boom (app/http/controllers/diagnostics.controller.ts:7:11)

## Request headers (credentials redacted)

- accept: text/html
- cookie: [redacted]
````

The Markdown is redacted exactly like the page.

## API errors in development: the `debug` member

When an API client hits a bug in local debug mode, it gets problem+json with an extra `debug` member:

```bash
curl -H "Accept: application/json" http://localhost:3000/_diagnostics/boom
```

```json
{
  "type": "https://strutvane.dev/problems/server_error",
  "title": "Server error",
  "status": 500,
  "code": "server_error",
  "detail": "See `debug` for the exception (shown because APP_DEBUG=true in a local environment).",
  "debug": {
    "exception": "TypeError",
    "message": "Cannot read properties of undefined (reading \"title\")",
    "at": "app/http/controllers/diagnostics.controller.ts:7",
    "route": "diagnostics.boom"
  }
}
```

## Production: a plain 500 with a reference id

With `APP_ENV=production` (whatever `APP_DEBUG` says), the client learns nothing about your code:

```json
{
  "type": "https://strutvane.dev/problems/server_error",
  "title": "Server error",
  "status": 500,
  "code": "server_error",
  "detail": "Something went wrong on our side. If it keeps happening, quote this reference: 3f2b9c1e-6a4d-4f0e-9b7a-2c8d5e1f0a42."
}
```

And the log gets one line with the **same** reference id, so support can find the full error in seconds:

```json
{"time":"2026-11-14T10:00:00.000Z","level":"error","message":"Cannot read properties of undefined (reading \"title\")","errorId":"3f2b9c1e-6a4d-4f0e-9b7a-2c8d5e1f0a42","exception":"TypeError","stack":"TypeError: Cannot read …","method":"GET","route":"/_diagnostics/boom"}
```

The log records the **route template** (`/posts/{post:slug}`), never the full URL, because URLs can carry slugs and tokens.

### The `APP_DEBUG` safety net

If `APP_DEBUG=true` is left on with `APP_ENV=production`, the app **refuses to boot**: failing closed is safer than a debug page on the internet. To start anyway for a short, deliberate investigation, pass `--force-debug`.

Even then, the debug page itself only ever appears in `local` and `testing`; production errors stay plain.

:::caution[Coming in 0.2]
Refusing to boot (and `--force-debug`) is the decided behaviour. The prototype (spike 12) still starts, ignores the flag and logs this warning:

```text
APP_DEBUG=true is ignored outside local and testing environments; production errors stay plain.
```
:::

## Developer hints on 4xx errors

Some HTTP errors carry a `hint` for the developer. It's included only in local debug mode:

```json
{
  "type": "https://strutvane.dev/problems/forbidden",
  "title": "Forbidden",
  "status": 403,
  "code": "forbidden",
  "detail": "You are not allowed to delete this post.",
  "hint": "PostPolicy has no delete() method, so this is denied (Strutvane denies by default). Add delete(user, post) to the policy to allow it."
}
```

In production the same response has no `hint`, so it never tells an attacker how your policies are written.

## Customising: `withExceptions()`

All customisation lives in `bootstrap/app.ts`.

### Render one error type your own way

```ts title="bootstrap/app.ts"
.withExceptions((exceptions) => {
  exceptions.render(PaymentDeclined, (error, ctx) => ctx.json({ declined: true, reason: error.message }, 402))
})
```

```ts title="app/errors/payment-declined.ts"
/** The payment provider said no. Expected, not a bug. */
export class PaymentDeclined extends Error {
  override readonly name = 'PaymentDeclined'
}
```

What you'll see when a controller throws `new PaymentDeclined('Card expired')`:

```json
{ "declined": true, "reason": "Card expired" }
```

Return `undefined` from the renderer to fall back to the default rendering.

### Don't log expected errors

```ts
exceptions.dontReport(PaymentDeclined)
```

HTTP errors (401, 403, 404, 422, 429…) are never logged anyway.

### Decide when errors are JSON

The default is `ctx.wantsJson()`. Change it, for example to send JSON only under `/api/`:

```ts
exceptions.shouldRenderJsonWhen((ctx) => ctx.url.pathname.startsWith('/api/'))
```

### Several rules together

All three can live in one `withExceptions()` call, and you can call `withExceptions()` more than once (each call adds to the previous):

```ts title="bootstrap/app.ts"
import { dirname } from 'node:path'
import { Application } from '@strutvane/framework'
import { PaymentDeclined } from '../app/errors/payment-declined.ts'
import { config } from '../config/index.ts'
import api from '../routes/api.ts'

export default Application.configure({ basePath: dirname(import.meta.dirname) })
  .withConfig(config)
  .withRouting({ api, health: '/up' })
  .withExceptions((exceptions) => {
    exceptions.dontReport(PaymentDeclined)
    exceptions.render(PaymentDeclined, (error, ctx) =>
      ctx.wantsJson() ? ctx.json({ declined: true, reason: error.message }, 402) : undefined,
    )
    exceptions.shouldRenderJsonWhen((ctx) => ctx.wantsJson())
  })
  .create()
```

**What you'll see:** an API client gets `402` with your JSON; a browser on a web route falls back to the default page (because the renderer returned `undefined`); nothing is logged.

### Which error should I throw?

| Situation | Throw | Logged? |
|---|---|---|
| The record or page doesn't exist | `NotFoundError` (or `abort(404)`) | No |
| Not signed in | `UnauthenticatedError` (or `abort(401)`) | No |
| Signed in but not allowed | `ForbiddenError` (or `abort(403)`) | No |
| Bad input | `ValidationError([{ path, field, code, message }])` | No |
| A conflict, a business rule | `new HttpError(409, 'conflict', 'Conflict', '…')` | No |
| Something that should never happen | let it throw (a plain `Error`) | **Yes**, with a reference id |
| An expected failure from a partner | your own error class + `dontReport()` + `render()` | Only if you want |

## Coming in 0.2: error pages, codes and quieter logs

:::caution[Coming in 0.2]
Designed in the blueprint and the Laravel parity matrix, not in the prototype yet.
:::

- **A docs page for every error code.** Every problem `code` (`validation_failed`, `csrf_token_mismatch`, `untrusted_host`…) gets a one-line fix and a page at `/docs/errors/<code>`, linked from the problem's `type`. CLI errors follow the same "what happened / why / fix / docs" shape.
- **"Why was this denied?" in development.** A `403` in local debug mode explains which policy rule said no, as in the `hint` above, also for rules that filter lists.
- **Throttled reports.** Laravel's `throttle()` for reporting: when the same error happens thousands of times a minute, it's logged a limited number of times (with a count), so one broken partner can't flood your logs.
- **Your own error pages for browsers:** a 404 or 500 page in your design instead of the minimal one.

## Errors before the app starts

Mistakes in your setup (a bad `.env` value, a typo in a middleware alias, a missing binding) are caught **when the app boots**, so they show up in `npm run dev`, `node strut …` and your tests, before any request. They print a message and a fix, with no stack trace:

```text
✖ The app can't start: 1 environment variable needs attention.
  - APP_DEBUG must be true or false (got "yes") (read in config/app.ts)
→ Fix the values in .env (see .env.example for every key) and start again.
```

## Common mistakes

### I see a plain 500 page locally instead of the error page

**Why:** one of the two conditions is missing.

**Fix:** set both in `.env`, then restart:

```ini
APP_ENV=local
APP_DEBUG=true
```

### The app won't start in production: "APP_DEBUG"

**Why:** `APP_DEBUG=true` with `APP_ENV=production`. The app refuses to boot so the debug page can never reach the internet.
**Fix:** set `APP_DEBUG=false` in the server's environment. (Only for a short, deliberate investigation: start with `--force-debug`.)

### A user reports an error and quotes a reference id

**Why:** in production, a bug answers a plain 500 that names only a reference id; the details are in your log, under the same id.
**Fix:** search the log for the id (`node strut log:tail --grep=<id>`, or the log viewer) to find the exception, the route template and the stack.

### My 404 is logged as an error

**Why:** you threw a plain `Error('not found')`, which counts as a bug.

**Fix:** throw `new NotFoundError('No report for that month.')`.

### The error page points at a framework file, not mine

**Why:** the error was thrown inside a package and the stack never passed through your files (the page then says `No source from your app is in this stack.`).

**Fix:** use **Copy as Markdown for AI** and read the stack list; look for the first call from your code, or the route shown in the report.

## Next steps

- [Responses](../responses/): throwing HTTP errors on purpose.
- [Configuration](../configuration/): `APP_ENV` and `APP_DEBUG`.
- [Logging](../logging/): where the error log goes.
