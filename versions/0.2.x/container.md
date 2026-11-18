---
title: Service Container
description: How Strutvane creates and shares services (the logger, the clock, the cache, your own classes), how constructor injection works without decorators, and how to swap a service in tests.
---

The **service container** is the place where your app keeps its shared services, like the logger, the clock or the cache, and builds the objects that need them. You ask for something by its key; the container builds it (once, or every time) and hands it over.

You'll rarely call the container yourself. You *will* use it when a controller needs a service in its constructor, when you register your own services in a provider, and when a test replaces a real service with a fake.

:::tip[Coming from Laravel?]
`app()->bind()`, `app()->singleton()`, `app()->instance()` and `app()->make()` are `container.bind()`, `.singleton()`, `.value()` and `.make()`. Laravel's `scoped()` is `.scoped()`.

The big difference is **autowiring**. Laravel reads PHP type hints at runtime to know what a constructor needs. TypeScript erases types when it runs, and Strutvane doesn't use decorators or reflection, so a class **lists what it needs** in `static inject`. The compiler checks that list against the constructor, so the two can't drift apart.
:::

:::caution[What exists, and when]
Everything on this page is on framework `main` (0.2.0-next.0, not on npm yet). The container and tokens come from `@strutvane/framework/core`; the app's own tokens (`KeyringToken`, `CacheManagerToken`, …) from `@strutvane/framework`.
:::

## The smallest example

Make a key (a **token**), bind something to it, and get it back:

```ts title="scripts/container-demo.ts"
import { createContainer, token } from '@strutvane/framework/core'

const Greeting = token<string>('Greeting')

const container = createContainer()
container.singleton(Greeting, () => 'Hello from the container')

console.log(container.make(Greeting))
```

What you'll see:

```text
Hello from the container
```

`container.make(Greeting)` is typed as `string`, because the token says so. In an app you never create a container yourself: every app has one, `app.container`.

## Tokens: typed keys

A **token** is a key that also carries the type of the value it stands for. You create one with `token<Type>('ReadableName')`:

```ts title="app/services/tokens.ts"
import { token } from '@strutvane/framework/core'

export interface Mailer {
  send(to: string, subject: string): Promise<void>
}

/** The app's mailer. The name shows up in error messages. */
export const MailerToken = token<Mailer>('Mailer')
```

**Why tokens and not strings like `'mailer'`?** A string can't tell TypeScript what comes back. With a token, `container.make(MailerToken)` is a `Mailer`, and a typo is a compile error.

Strutvane binds these tokens for you:

| Token | Import from | What you get |
|---|---|---|
| `LoggerToken` | `/core` | The logger (`debug`, `info`, `warn`, `error`) |
| `ClockToken` | `/core` | The clock (`{ now(): number }`, milliseconds; what `now()` reads) |
| `IdGeneratorToken` | `/core` | The UUIDv7 generator |
| `EventBusToken` | `/core` | The domain event bus |
| `ConfigRepositoryToken` | root | The loaded config (what `config()` reads) |
| `KeyringToken` | root | Your `APP_KEY` and retired keys (`APP_PREVIOUS_KEYS`) |
| `EncrypterToken` | root | What `Crypt` uses |
| `UrlGeneratorToken`, `UrlSignerToken` | root | `route()` URLs and signed links |
| `HttpClientToken` | root | The SSRF-safe [HTTP client](../http-client/) |
| `CacheManagerToken` | root | The [cache](../cache/) stores from `config/cache.ts` |
| `SessionStoreToken` | root | Where [sessions](../session/) are kept (files by default) |
| `SecurityToken` | root | The resolved security settings (hosts, proxies, CORS, headers, limits) |

The clock, logger, event bus, encrypter, signer, HTTP client, cache and session store are **defaults that only fill gaps**: if you bind your own before boot (in a test) or in a provider's `register()`, yours wins.

## Three ways to bind

| Method | Runs the factory… | Use it for |
|---|---|---|
| `bind(token, factory)` | on **every** `make()` | Something fresh each time, like a request id |
| `singleton(token, factory)` | **once**, then reuses the value | Shared services: a mailer, a client, a cache |
| `value(token, value)` | never (you pass the value) | Something you already built |

```ts title="app/providers/app.provider.ts"
import { randomUUID } from 'node:crypto'
import { ServiceProvider, type Application } from '@strutvane/framework'
import { token } from '@strutvane/framework/core'
import { MailerToken } from '../services/tokens.ts'
import { LogMailer } from '../services/log-mailer.ts'

export const RequestIdToken = token<string>('RequestId')

export class AppServiceProvider extends ServiceProvider {
  override register(app: Application): void {
    app.container.bind(RequestIdToken, () => randomUUID())          // new every time
    app.container.singleton(MailerToken, () => new LogMailer())     // one for the whole app
  }
}
```

The factory receives the container, so one service can be built from another:

```ts
app.container.singleton(ReportServiceToken, (container) => new ReportService(container.make(LoggerToken)))
```

Check whether something is bound with `container.has(MailerToken)` (it returns `true` or `false`). A `singleton()` can also take `{ dispose(instance) { … } }` as a third argument: it runs when the app shuts down, to close a pool or stop a timer.

## Constructor injection with `static inject`

A class that needs services lists their keys in `static inject`, **in the same order** as its constructor parameters. When Strutvane builds a controller, a middleware or a policy, it reads the list, builds each dependency, and passes them in.

```ts title="app/http/controllers/clock.controller.ts"
import { Controller, type HttpContext } from '@strutvane/framework'
import { ClockToken, LoggerToken, type Clock } from '@strutvane/framework/core'
import type { Logger } from '@strutvane/framework/contracts'

export class ClockController extends Controller {
  static readonly inject = [ClockToken, LoggerToken] as const
  readonly #clock: Clock
  readonly #logger: Logger

  constructor(clock: Clock, logger: Logger) {
    super()
    this.#clock = clock
    this.#logger = logger
  }

  show(ctx: HttpContext): Response {
    this.#logger.info('Clock checked')
    return ctx.json({ data: { now: new Date(this.#clock.now()).toISOString() } })
  }
}
```

Route it as usual (`Route.get('/clock', [ClockController, 'show'])` in `routes/api.ts`). Strutvane builds the controller through the container for each request:

```bash
curl http://localhost:3000/api/clock
```

What you'll see (with today's time):

```json
{ "data": { "now": "2026-11-18T09:30:00.000Z" } }
```

**Why `as const`?** It keeps the list's exact order and types, which is what lets the compiler compare it with the constructor (see the next section).

A `static inject` list may name **tokens** or **classes**. A class with no constructor parameters needs no `inject` at all.

### What a mismatch looks like

The list and the constructor must agree, entry by entry:

```ts title="app/http/controllers/report.controller.ts"
import { Controller } from '@strutvane/framework'
import { ClockToken, LoggerToken, type Clock } from '@strutvane/framework/core'
import type { Logger } from '@strutvane/framework/contracts'

export class ReportController extends Controller {
  // Wrong order: the constructor takes the logger first.
  static readonly inject = [ClockToken, LoggerToken] as const
  readonly logger: Logger
  readonly clock: Clock

  constructor(logger: Logger, clock: Clock) {
    super()
    this.logger = logger
    this.clock = clock
  }
}
```

The framework has a type, `CheckInjectable<typeof ReportController>`, that turns a wrong list into `never`, so a mismatch becomes a compile error (`… is not assignable to parameter of type 'never'`).

:::caution[Coming in 0.2]
In 0.2.0-next.0 that check runs only inside the framework: `CheckInjectable` isn't exported, and `Route.get()` and the other route builders accept any class with a `static inject` list. So a list in the wrong order **compiles and runs**, and the constructor gets the services in the wrong places (here, `this.logger` would be the clock). Until the check reaches routes, keep the list and the constructor in the same order by hand, and cover each controller with a feature test.
:::

## Your own classes, built for you

You don't have to bind a class to inject it: an unbound **class** in an `inject` list is built automatically from its own `static inject` list (like Laravel's zero-config resolution). Only **tokens** must be bound, because a token has nothing to build from.

```ts title="app/services/uptime.ts"
import { ClockToken, type Clock } from '@strutvane/framework/core'

export class Uptime {
  static readonly inject = [ClockToken] as const
  readonly #clock: Clock
  readonly #startedAt: number

  constructor(clock: Clock) {
    this.#clock = clock
    this.#startedAt = clock.now()
  }

  seconds(): number {
    return Math.floor((this.#clock.now() - this.#startedAt) / 1000)
  }
}
```

```ts title="app/http/controllers/status.controller.ts"
import { Controller, type HttpContext } from '@strutvane/framework'
import { Uptime } from '../../services/uptime.ts'

export class StatusController extends Controller {
  static readonly inject = [Uptime] as const
  readonly #uptime: Uptime

  constructor(uptime: Uptime) {
    super()
    this.#uptime = uptime
  }

  show(ctx: HttpContext): Response {
    return ctx.json({ data: { uptime: this.#uptime.seconds() } })
  }
}
```

**What you'll see:** `{ "data": { "uptime": 0 } }`. The container built `Uptime` (with the clock) and then the controller (with `Uptime`), with no binding at all. An unbound class is built fresh every time (so `uptime` here is always about `0`); to share one, give it a token and bind it with `singleton()`.

`container.make()` itself takes **tokens** only. Classes are built where Strutvane builds things: controllers, middleware, policies and the classes they list.

## Interfaces and implementations

The most useful pattern: code depends on an **interface** (what a service can do), and a provider decides which **implementation** (how it does it) the app gets. Then you can switch the implementation per environment, or in tests, without touching the code that uses it.

```ts title="app/services/tokens.ts"
import { token } from '@strutvane/framework/core'

export interface Notifier {
  notify(message: string): Promise<void>
}

export const NotifierToken = token<Notifier>('Notifier')
```

```ts title="app/providers/app.provider.ts"
import { ServiceProvider, type Application } from '@strutvane/framework'
import { NotifierToken } from '../services/tokens.ts'
import { ConsoleNotifier } from '../services/console-notifier.ts'
import { SlackNotifier } from '../services/slack-notifier.ts'

export class AppServiceProvider extends ServiceProvider {
  override register(app: Application): void {
    app.container.singleton(NotifierToken, () =>
      process.env['APP_ENV'] === 'production' ? new SlackNotifier() : new ConsoleNotifier(),
    )
  }
}
```

Classes that need it ask for the token: `static inject = [NotifierToken] as const`, constructor `(notifier: Notifier)`.

**Binding twice:** a later `bind()`, `singleton()` or `value()` for the same token replaces the earlier one, so a package's default can be overridden by your app's provider, and a test can override both. Once a token has been **resolved**, it can't be rebound (see Common mistakes): existing users would keep the old instance.

## How long things live

| What | Lifetime | Why |
|---|---|---|
| A `singleton()` or `value()` | The whole app (one per process) | Shared, expensive things: connections, clients |
| A `bind()` or an unbound class | Built on every `make()` | Cheap things that must not be shared |
| Controllers and middleware | Built for **every request** | Nothing stored on `this` can leak from one user's request into another's |

Anything about the current request (the user, the bound models, the body) lives on `ctx`, the request context, which every action and middleware receives.

## Contracts: the interfaces the framework uses

Laravel's "contracts" are the interfaces behind its services (`Illuminate\Contracts\…`). Strutvane's live in `@strutvane/framework/contracts` (types such as `Logger`, `Actor`, `Problem`, `PermissionProvider`), and their tokens in `@strutvane/framework/core` (`LoggerToken`, `ClockToken`, `PermissionProviderToken`, …), so a package or your app can provide another implementation and bind it to the framework's token. See [Contracts](../contracts/).

Laravel's contextual binding (`when()->needs()`) and tagging aren't planned: list what a class needs in `static inject` and bind a distinct token for each variant.

## Facades and the container

A **facade** in Laravel is a static-looking shortcut to a service in the container (`Cache::get()`). Strutvane's are on `@strutvane/framework/facades` (`Log`, `Cache`, `DB`, `Storage`, `Http`, `Event`, `Crypt`, `Url`, `Route`): each one resolves from the current app's container on every call, so a test swaps it by binding a fake. See [Facades](../facades/).

## Getting a service

| Where you are | How to get it |
|---|---|
| In a provider's `boot()` | `app.make(MailerToken)` (or `app.container.make(MailerToken)`) |
| In a controller, middleware or your own class | Ask for it in `static inject` (preferred) |
| Anywhere during a request or command | `app().container.make(MailerToken)` (see [Helpers](../helpers/)) |

Prefer `static inject`: the class says up front what it depends on, and tests can see it.

## Swapping a service in tests

Because each app has its **own** container (nothing is global), a test can replace any service before the app boots. Strutvane only fills in its defaults when you haven't bound them yourself:

```ts title="tests/feature/clock.test.ts"
import { randomBytes } from 'node:crypto'
import { expect, it } from 'vitest'
import { Application, now } from '@strutvane/framework'
import { ClockToken, createTestClock } from '@strutvane/framework/core'

it('uses a frozen clock', async () => {
  const app = Application.configure({
    basePath: process.cwd(),
    env: { APP_ENV: 'testing', APP_KEY: randomBytes(32).toString('base64url') },
  }).create()
  app.container.value(ClockToken, createTestClock(Date.UTC(2026, 10, 14, 10)))
  await app.boot()

  expect(app.run(() => now().toISOString())).toBe('2026-11-14T10:00:00.000Z')
})
```

What you'll see: the test passes, and every timestamp read through `now()` in that app is exactly `2026-11-14T10:00:00Z`. `createTestClock()` also has `advance(ms)` and `set(ms)` to move time on purpose.

## Common mistakes

### "No binding for … Register it in a service provider."

```text
No binding for "Mailer". Register it in a service provider.
```

When another service needed it, the message names that one too: `No binding for "Mailer" (needed by "ReportService").`

**Why:** you asked for a token nobody bound. (Classes in an `inject` list are built automatically; tokens never are.)

**Fix:** bind it in a provider's `register()`:

```ts
app.container.singleton(MailerToken, () => new LogMailer())
```

### "These classes depend on each other in a loop"

```text
These classes depend on each other in a loop: ReportService → Mailer → ReportService.
→ Break the loop by injecting a factory (() => service) instead of the service itself.
```

Between tokens the same mistake reads `Circular dependency: Report -> Mailer -> Report`.

**Why:** A needs B and B needs A, so neither can be built first.

**Fix:** inject a function that builds the other service later:

```ts
app.container.singleton(MailerToken, (container) => new LogMailer(() => container.make(ReportServiceToken)))
```

### "Cannot rebind …: it was already resolved"

```text
Cannot rebind "Mailer": it was already resolved, so existing users hold the old instance.
```

**Why:** something already asked for this `singleton()` service, and swapping it now would leave them with the old one. (A token bound with `value()`, like the clock, can be replaced at any time.)

**Fix:** bind your replacement earlier: in a provider's `register()`, or in a test before `await app.boot()`.

### My controller gets the wrong service (`this.logger.info is not a function`)

**Why:** the `static inject` list doesn't match the constructor (different order, a missing entry, or a wrong type). In 0.2.0-next.0 this isn't caught at compile time yet, so the services arrive in the wrong parameters.

**Fix:** write the list in the same order as the constructor parameters, and end it with `as const`:

```ts
static readonly inject = [ClockToken, LoggerToken] as const
constructor(clock: Clock, logger: Logger) { /* … */ }
```

### "TypeScript parameter properties are not supported in strip-only mode"

```text
SyntaxError [ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX]: TypeScript parameter property is not supported in strip-only mode
```

**Why:** Node runs your `.ts` files by **stripping** the types, and a constructor shorthand like `constructor(readonly clock: Clock) {}` is real code, not just a type, so it can't be stripped.
**Fix:** declare the field and assign it in the constructor, as every example on this page does:

```ts
readonly #clock: Clock
constructor(clock: Clock) {
  this.#clock = clock
}
```

### My controller's `this.something` is empty on the second request

**Why:** a new controller is built for every request, so values you stored on `this` in an earlier request are gone (on purpose: one user's data must never reach another's request).
**Fix:** keep shared state in a `singleton()` service and inject it; keep per-request data on `ctx`.

### I bound my service in `boot()` and a controller didn't get it

**Why:** another provider (or a check during boot) already asked for it, and got the default or an error, before your `boot()` ran.
**Fix:** bind in `register()`. Every provider's `register()` runs before any `boot()`.

## Next steps

- [Service Providers](../providers/): where your bindings live.
- [Controllers](../controllers/): constructor injection in practice.
- [Helpers](../helpers/) and [Facades](../facades/): reaching the container from anywhere.
