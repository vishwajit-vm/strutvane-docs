---
title: Facades
description: Strutvane's facades are typed static accessors (Log, Cache, DB, Route, Storage, Http, Event, Crypt, Url, plus Mail, Queue, Bus, Notification and Hash in 0.3) that resolve from the current app's container, so tests can swap them. How they work, how to fake them, and when to inject instead.
---

In Laravel, a **facade** is a class with static methods, like `Cache::get('key')` or `Log::info('hi')`, that quietly forwards each call to a real service inside the app's container. It reads like a global, but behind it is an object you can swap.

Strutvane's facades are **typed static accessors** with Laravel's short names, imported from `@strutvane/framework/facades`. Each one resolves its service from the **current app's** container on every call, with no magic and no global state.

:::tip[Coming from Laravel?]
`Log::info()` becomes `Log.info()`, `Cache::remember()` becomes `Cache.remember()`, `Http::fake()` becomes `Http.fake()`. The differences:

- there's no `__callStatic`: every method is a real, typed method, so autocomplete and the compiler know exactly what exists and what it returns;
- each accessor reads the **current app** (the one handling this request or command), not a process-wide global, so tests running side by side never share a fake;
- the `Route` **facade** (`Route.has()`, `Route.currentRouteName()`) lives on `@strutvane/framework/facades`, while the `Route` **builder** you write routes with (`Route.get(…)`) comes from `@strutvane/framework`. They never shadow each other.
:::

:::caution[What exists, and when]
The facades ship in `@strutvane/framework` 0.2.0-next.0 (not published to npm yet). `Mail`, `Queue`, `Bus`, `Notification` and `Hash` exist as names, but every call throws "arrives in Strutvane 0.3" until their features do.
:::

## The smallest example

```ts title="app/http/controllers/report.controller.ts"
import { Controller, type HttpContext } from '@strutvane/framework'
import { Log } from '@strutvane/framework/facades'

export class ReportController extends Controller {
  async show(ctx: HttpContext): Promise<Response> {
    Log.info('Report opened', { report: ctx.param('report') })
    return ctx.json({ data: { opened: true } })
  }
}
```

**What you'll see** in the terminal running the app (something like this; the request id is added for you, and `fields` holds what you passed):

```text
{"time":"2026-11-15T10:00:00.000Z","level":"info","msg":"Report opened","requestId":"01J…","fields":{"report":"monthly"}}
```

That's the framework's built-in logger in 0.2.0-next.0: one JSON line per message on standard output, with secrets redacted. File channels come with [Logging](../logging/).

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

## Every accessor

| Accessor | Shortcut to | Main methods | Laravel |
|---|---|---|---|
| `Log` | the logger (`LoggerToken`) | `trace`, `debug`, `info`, `warn`, `error`, `fatal`, `child`, `isLevelEnabled`, `flush` | `Log::` |
| `Cache` | the cache manager | `get`, `has`, `put`, `add`, `increment`, `decrement`, `pull`, `forget`, `flush`, `remember`, `rememberForever`, `store(name)` | `Cache::` |
| `DB` | the database connection (`DatabaseToken`) | `query(sql, params)`, `execute(sql, params)`, `transaction(work)`, `dialect` | `DB::` |
| `Route` | the app's route table | `has(name)`, `current()`, `currentRouteName()`, `is('posts.*')` | `Route::` |
| `Storage` | file disks (`StorageManagerToken`) | `disk(name)`, `forTenant(id)`, `put`, `get`, `exists`, `delete`, `temporaryUrl` | `Storage::` |
| `Http` | the outgoing HTTP client | `get`, `post`, `withToken`, `timeout`, `allow`, `fake`, `preventStrayRequests`, `assertSent`… | `Http::` |
| `Event` | the event bus | `on`, `once`, `emit`, `dispatch`, `listenerCount` | `Event::` |
| `Crypt` | the encrypter | `encrypt`, `decrypt`, `encryptString`, `decryptString` | `Crypt::` |
| `Url` | URL generation and signed links | `route`, `signedRoute`, `temporarySignedRoute`, `has` | `URL::` |
| `Mail`, `Queue`, `Bus`, `Notification`, `Hash` | — | every call throws until 0.3 | the same |

`DB` and `Storage` resolve what the framework provider binds (the database connection and the disks from `config/filesystems.ts`). When nothing is bound under a facade's token, the call throws `facade_not_bound` with a hint saying how to bind it.

Each page covers its facade in detail: [Cache](../cache/), [HTTP Client](../http-client/), [Encryption](../encryption/), [File Storage](../storage/), [Events](../events/), [URL Generation](../urls/).

## Every way to reach a service

The accessors are one of three ways to get a service. All three end at the same container binding, so they always agree.

### 1. Constructor injection (recommended for your classes)

The class says what it needs; the container passes it in. Best for testing and for reading code, because dependencies are visible at the top of the class:

```ts title="app/http/controllers/stats.controller.ts"
import { Controller, type HttpContext } from '@strutvane/framework'
import type { Logger } from '@strutvane/framework/contracts'
import { LoggerToken } from '@strutvane/framework/core'

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

A `static inject` list that doesn't match the constructor is a compile error. See [Service Container](../container/).

### 2. Helpers and `app()` (anywhere inside the app)

```ts title="app/services/hello.ts"
import { app } from '@strutvane/framework'
import { LoggerToken } from '@strutvane/framework/core'

app().container.make(LoggerToken).info('Hello')
```

See [Helpers](../helpers/).

### 3. Accessors (anywhere inside the app)

```ts title="app/services/hello.ts"
import { Log } from '@strutvane/framework/facades'

Log.info('Hello')
```

The shortest, for code that isn't a class you control: a route closure, a small function, a seeder.

| | Injection | `app()` | Accessor |
|---|---|---|---|
| Typed | yes | yes | yes |
| Dependencies visible | yes, in `static inject` | no | no |
| Needs a class | yes | no | no |
| Needs a current app | no | yes | yes |

## Faking in tests

`Http` has fakes built in. A fake replaces the real behaviour **in that test's app only**, because the client it changes belongs to that app's container:

```ts title="tests/unit/rates.test.ts"
import { expect, test } from 'vitest'
import { HttpClient } from '@strutvane/framework'
import { Http } from '@strutvane/framework/facades'
import app from '../../bootstrap/app.ts'

test('rates are read from the partner', async () => {
  await app.boot()
  await app.run(async () => {
    Http.fake({ 'rates.example.com/*': HttpClient.response({ rate: 1.08 }) }).preventStrayRequests()
    const response = await Http.get('https://rates.example.com/latest')
    expect(response.json()).toEqual({ rate: 1.08 })
    Http.assertSentCount(1)
  })
})
```

**What you'll see:** the test passes without calling the internet. With `preventStrayRequests()`, an un-faked request fails with `stray_request` instead of reaching a real server.

For the other facades, bind a stand-in under the facade's token before the app boots (for example `app.container.value(LoggerToken, myTestLogger)`); the accessor then returns it. `Mail.fake()`, `Queue.fake()`, `Bus.fake()` and `Notification.fake()` arrive with their features in 0.3.

## When to use which

- **Your own classes** (controllers, services, middleware): inject. It's explicit and needs no current app.
- **Route closures, seeders, small functions**: accessors or `app()`.
- **Library code you publish as a package**: inject, and bind your defaults in your provider.

## Common mistakes

### "… was called outside a request or console command"

```text
BootError: Log.info() was called outside a request or console command, so there is no current app.
```

The hint that comes with it: `Call it from a controller, middleware or command, or wrap the code in app.run(() => …) (tests: await app.run(async () => …)).`

**Why:** accessors read the current app, which exists only while a request or command runs (error code `no_current_application`).
**Fix:** call it inside a function that runs during a request, or wrap it: `await app.run(async () => Log.info('hi'))`.

### "Mail.send() is not available yet"

```text
BootError: Mail.send() is not available yet: the Mail facade arrives in Strutvane 0.3.
```

**Why:** `Mail`, `Queue`, `Bus`, `Notification` and `Hash` are placeholders until 0.3 (error code `facade_not_available`). Each error's hint says what to do meanwhile: send mail with your provider's SDK, run work after the response with `defer(() => …)`, emit an event with `Event.emit()`, or let `@strutvane/auth` hash passwords.
**Fix:** follow the hint, and switch to the facade when 0.3 ships.

### "… needs …, but nothing is bound"

```text
BootError: Storage.disk() needs the storage manager, but nothing is bound to "strutvane.storage" in this app.
```

**Why:** no provider bound the service this facade fronts (code `facade_not_bound`).
**Fix:** follow the hint in the error: for `Storage` and `DB`, configure `config/filesystems.ts` or the database and register the framework provider; for your own services, bind them in a provider's `register()`.

### `Route::get()` from a Laravel tutorial doesn't work

**Why:** TypeScript uses a dot for static members, and the route **builder** `Route.get()` comes from `@strutvane/framework`, not from the facades. It returns a route value that you put in `defineRoutes([...])`; calling it alone registers nothing.
**Fix:**

```ts title="routes/api.ts"
import { defineRoutes, Route } from '@strutvane/framework'

export default defineRoutes([
  Route.get('/hello', (ctx) => ctx.json({ message: 'Hello!' })),
])
```

### My fake leaked into another test

**Why:** it can't with Strutvane's design (each fake belongs to one app's client), so the other test is probably using the **same** app object.
**Fix:** build a fresh app per test file, or call `Http.fake()` again (it replaces the fakes; recorded requests are kept).

## Next steps

- [Helpers](../helpers/): `config()`, `route()`, `app()` and friends.
- [Service Container](../container/): tokens, bindings and injection.
- [Mocking](../mocking/): fakes in tests.
- [Logging](../logging/): the logger behind `Log`, and the channels coming in 0.2.
