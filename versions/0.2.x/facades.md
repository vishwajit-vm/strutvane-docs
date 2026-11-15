---
title: Facades
description: What Laravel's facades are, why Strutvane started with helpers and injection instead, and the typed static accessors planned for 0.2 (Log, Cache, DB, Route, Mail, Storage, Http) that read the current app's container and can be swapped in tests.
---

In Laravel, a **facade** is a class with static methods, like `Cache::get('key')` or `Log::info('hi')`, that quietly forwards each call to a real service inside the app's container. It reads like a global, but behind it is an object you can swap.

Strutvane's version is planned for 0.2: **typed static accessors** with the same short names (`Log`, `Cache`, `DB`, `Route`, `Mail`, `Storage`, `Http`), resolved from the **current app's** container, with no magic and with fakes for tests. This page explains how they'll work, and what to use today.

:::tip[Coming from Laravel?]
`Log::info()` becomes `Log.info()`, `Cache::remember()` becomes `Cache.remember()`, `Http::fake()` becomes `Http.fake()`. The differences:

- there's no `__callStatic`: every method is a real, typed method, so autocomplete and the compiler know exactly what exists and what it returns;
- each accessor reads the **current app** (the one handling this request or command), not a process-wide global, so tests running side by side never share a fake;
- `Route` is already here, as a builder of route **values** (`Route.get()` returns a route; it doesn't register one globally).
:::

:::caution[Coming in 0.2]
The accessors are a **gap found on 2026-11-15** and added to the 0.2 plan (Laravel parity matrix). They aren't in any prototype yet. The application core prototype (spike 12) deliberately proved the alternative first: plain [helpers](../helpers/) and constructor injection, with no facades over global state. Everything below marked as a preview may change.
:::

## The smallest example (preview)

```ts title="app/http/controllers/report.controller.ts"
import { Controller, Log, type HttpContext } from '@strutvane/framework'

export class ReportController extends Controller {
  async show(ctx: HttpContext): Promise<Response> {
    Log.info('Report opened', { report: ctx.param('report') })
    return ctx.json({ data: { opened: true } })
  }
}
```

**What you'll see** in `storage/logs/strutvane.log` (something like this; request id and user are added for you):

```text
[2026-11-15 10:00:00] local.INFO: Report opened {"report":"monthly","requestId":"01J…","userId":1}
```

## Why "static" doesn't mean "global" here

A Laravel facade asks one global container. Strutvane's accessors ask the **current app**, the same way `config()` and `route()` do: Strutvane remembers which app is handling the request (with Node's `AsyncLocalStorage`) and the accessor looks up its service in **that** app's container.

```text
Log.info('hi')
   └─► current app (this request's app)
          └─► container.make(LoggerToken)
                 └─► the logger you (or a test) bound
```

So:

- **swapping works per app:** bind a different logger in one test's app and only that test sees it;
- **outside a request** an accessor fails with the same friendly "called outside a request or console command" error as the helpers, telling you to use `app.run()`;
- **nothing is hidden:** each accessor is a thin, typed shortcut to one container token, listed below.

## The planned accessors

| Accessor | Shortcut to | Laravel | Fake for tests | Arrives with |
|---|---|---|---|---|
| `Log` | the logger (`LoggerToken`) | `Log::` | capture lines in memory | 0.2 ([Logging](../logging/)) |
| `Cache` | the cache store | `Cache::` | an in-memory store | 0.3 ([Cache](../cache/)) |
| `DB` | the database connection | `DB::` | — (tests use a real test database) | 0.2 ([Database](../database/)) |
| `Route` | the route builder | `Route::` | — | **already here** ([Routing](../routing/)) |
| `Mail` | the mailer | `Mail::` | `Mail.fake()`, then assert what was sent | 0.2 ([Mail](../mail/)) |
| `Storage` | file disks | `Storage::` | `Storage.fake()`, a temporary disk | 0.2 / 0.3 ([File Storage](../storage/)) |
| `Http` | the outgoing HTTP client | `Http::` | `Http.fake()`, `Http.preventStrayRequests()` | 0.2 ([HTTP Client](../http-client/)) |

A row arrives together with the feature it fronts: `Cache` can't exist before the cache does.

## Every way to reach a service

The accessors are one of three ways to get a service. All three end at the same container binding, so they always agree.

### 1. Constructor injection (recommended for your classes)

The class says what it needs; the container passes it in. Best for testing and for reading code, because dependencies are visible at the top of the class. This works **today**:

```ts title="app/http/controllers/stats.controller.ts"
import { Controller, LoggerToken, type HttpContext, type Logger } from '@strutvane/framework'

export class StatsController extends Controller {
  static readonly inject = [LoggerToken] as const
  readonly #log: Logger

  constructor(log: Logger) {
    super()
    this.#log = log
  }

  show(ctx: HttpContext): Response {
    this.#log.info('Stats viewed')
    return ctx.json({ data: {} })
  }
}
```

See [Service Container](../container/).

### 2. Helpers and `app()` (anywhere, today)

```ts
import { app, LoggerToken } from '@strutvane/framework'

app().container.make(LoggerToken).info('Hello')
```

See [Helpers](../helpers/).

### 3. Accessors (anywhere, coming in 0.2)

```ts
import { Log } from '@strutvane/framework'

Log.info('Hello')
```

The shortest, for code that isn't a class you control: a route closure, a small function, a seeder.

| | Injection | `app()` | Accessor |
|---|---|---|---|
| Typed | yes | yes | yes |
| Dependencies visible | yes, in `static inject` | no | no |
| Needs a class | yes | no | no |
| Works today | yes | yes | coming in 0.2 |

## Faking in tests (preview)

Each accessor that talks to the outside world gets a fake that replaces the real service **in that test's app only**:

```ts title="tests/feature/welcome-mail.test.ts"
import { expect, test } from 'vitest'
import { Mail } from '@strutvane/framework'
import { client } from '@strutvane/framework/testing'
import { createApp } from '../../bootstrap/app.ts'

test('signing up sends a welcome mail', async () => {
  const app = createApp({ APP_ENV: 'testing', APP_KEY: 'test-key', DB_CONNECTION: 'sqlite' })
  await app.run(async () => {
    Mail.fake()
    await client(app).postJson('/register', { name: 'Asha', email: 'asha@example.test', password: 'a long password here' })
    Mail.assertSent('WelcomeMail', (mail) => mail.to === 'asha@example.test')
  })
})
```

```ts title="tests/feature/rates.test.ts"
import { expect, test } from 'vitest'
import { Http } from '@strutvane/framework'

test('rates are read from the partner', async () => {
  Http.preventStrayRequests()                       // any request without a fake fails the test
  Http.fake({ 'https://rates.example.com/*': { status: 200, body: { rate: 1.08 } } })
  // … call your code, then assert on the result
})
```

**What you'll see:** the tests pass without sending mail or calling the internet. With `preventStrayRequests()`, an un-faked request fails loudly instead of reaching a real server.

## When to use which

- **Your own classes** (controllers, services, middleware): inject. It's explicit and needs no current app.
- **Route closures, seeders, small functions**: accessors (or `app()` until they arrive).
- **Library code you publish as a package**: inject, and bind your defaults in your provider.

## Common mistakes

### "… was called outside a request or console command"

```text
✖ Log.info() was called outside a request or console command, so there is no current app.
→ Call it from a controller, middleware or command, or wrap the code in app.run(() => …) (tests: await app.run(async () => …)).
```

**Why:** accessors read the current app, which exists only while a request or command runs. (This preview reuses the helpers' error, which exists today.)
**Fix:** call it inside a function that runs during a request, or wrap it: `await app.run(async () => Log.info('hi'))`.

### `Route::get()` from a Laravel tutorial doesn't work

**Why:** TypeScript uses a dot for static members, and Strutvane's `Route.get()` returns a route value that you put in `defineRoutes([...])`. Calling it alone registers nothing.
**Fix:**

```ts title="routes/api.ts"
import { defineRoutes, Route } from '@strutvane/framework'

export default defineRoutes([
  Route.get('/hello', (ctx) => ctx.json({ message: 'Hello!' })),
])
```

### My fake leaked into another test

**Why:** it can't with Strutvane's design (each fake belongs to one app), so the other test is probably using the **same** app object.
**Fix:** create a fresh app per test with `createApp({ … })`.

### `Cache.get()` isn't there

**Why:** `Cache` arrives with the cache itself, in 0.3.
**Fix:** for now, keep cached values in a `singleton()` service, or wait for [Cache](../cache/).

## Next steps

- [Helpers](../helpers/): the functions that work today.
- [Service Container](../container/): tokens, bindings and injection.
- [Mocking](../mocking/): fakes in tests.
- [Logging](../logging/): `Log` channels and context.
