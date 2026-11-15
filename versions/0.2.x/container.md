---
title: Service Container
description: How Strutvane creates and shares services (the database, the logger, your own classes), how constructor injection works without decorators, and how to swap a service in tests.
---

The **service container** is the place where your app keeps its shared services, like the database connection, the logger or the clock, and builds the objects that need them. You ask for something by its key; the container builds it (once, or every time) and hands it over.

You'll rarely call the container yourself. You *will* use it when a controller needs a service in its constructor, when you register your own services in a provider, and when a test replaces a real service with a fake.

:::tip[Coming from Laravel?]
`app()->bind()`, `app()->singleton()`, `app()->instance()` and `app()->make()` are `container.bind()`, `.singleton()`, `.instance()` and `.make()`.

The big difference is **autowiring**. Laravel reads PHP type hints at runtime to know what a constructor needs. TypeScript erases types when it runs, and Strutvane doesn't use decorators or reflection, so a class **lists what it needs** in `static inject`. The compiler checks that list against the constructor, so the two can't drift apart.
:::

## The smallest example

Make a key (a **token**), bind something to it, and get it back:

```ts title="scripts/container-demo.ts"
import { Container, token } from '@strutvane/framework'

const Greeting = token<string>('Greeting')

const container = new Container()
container.singleton(Greeting, () => 'Hello from the container')

console.log(container.make(Greeting))
```

What you'll see:

```text
Hello from the container
```

`container.make(Greeting)` is typed as `string`, because the token says so.

## Tokens: typed keys

A **token** is a key that also carries the type of the value it stands for. You create one with `token<Type>('ReadableName')`:

```ts title="app/services/tokens.ts"
import { token } from '@strutvane/framework'

export interface Mailer {
  send(to: string, subject: string): Promise<void>
}

/** The app's mailer. The name shows up in error messages and `node strut about`. */
export const MailerToken = token<Mailer>('Mailer')
```

**Why tokens and not strings like `'mailer'`?** A string can't tell TypeScript what comes back. With a token, `container.make(MailerToken)` is a `Mailer`, and a typo is a compile error.

Strutvane binds these tokens for you during boot:

| Token | What you get | Replace it to… |
|---|---|---|
| `ConfigToken` | The loaded config (what `config()` reads) | — (built from your config files) |
| `LoggerToken` | The logger (`info`, `warn`, `error`) | capture log lines in tests (`MemoryLogger`) |
| `ClockToken` | A function returning the current `Date` (what `now()` uses) | freeze time in tests |
| `ConnectionToken` | The database connection (when `config/database.ts` exists) | — |
| `RateLimitStoreToken` | Where the `throttle` middleware counts hits (in memory by default) | share counts between servers |
| `IdempotencyStoreToken` | Where `idempotent` keeps first responses (in memory by default) | share them between servers |
| `KeyringToken` | Your `APP_KEY` and retired keys (`APP_PREVIOUS_KEYS`) | — |
| `EncrypterToken` | What `encrypt()` and `decrypt()` use | — |
| `SecurityToken` | The resolved security settings (hosts, proxies, CORS, headers, limits) | — |

The clock, logger and the two stores are **defaults that only fill gaps**: if you bind your own before boot (in a test) or in a provider's `register()`, yours wins.

## Three ways to bind

| Method | Runs the factory… | Use it for |
|---|---|---|
| `bind(key, factory)` | on **every** `make()` | Something fresh each time, like a request id |
| `singleton(key, factory)` | **once**, then reuses the value | Shared services: a mailer, a client, a cache |
| `instance(key, value)` | never (you pass the value) | Something you already built |

```ts title="app/providers/app.provider.ts"
import { randomUUID } from 'node:crypto'
import { ServiceProvider, token, type Application } from '@strutvane/framework'
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
app.container.singleton(ReportServiceToken, (container) => new ReportService(container.make(ConnectionToken)))
```

Check whether something is bound with `container.has(MailerToken)` (it returns `true` or `false`).

## Constructor injection with `static inject`

A class that needs services lists their keys in `static inject`, **in the same order** as its constructor parameters. The container reads the list, builds each dependency, and passes them in.

```ts title="app/http/controllers/stats.controller.ts"
import { ConnectionToken, Controller, type Connection, type HttpContext } from '@strutvane/framework'

export class StatsController extends Controller {
  static readonly inject = [ConnectionToken] as const
  readonly #db: Connection

  constructor(db: Connection) {
    super()
    this.#db = db
  }

  async show(ctx: HttpContext): Promise<Response> {
    const [posts] = await this.#db.select('SELECT COUNT(*) AS "total" FROM "posts" WHERE "deleted_at" IS NULL')
    return ctx.json({ data: { posts: Number(posts?.['total'] ?? 0) } })
  }
}
```

Route it as usual. Strutvane builds the controller through the container for each request:

```bash
curl http://localhost:3000/api/admin/stats -H "Authorization: Bearer <admin token>"
```

What you'll see:

```json
{ "data": { "posts": 5 } }
```

**Why `as const`?** It keeps the list's exact order and types, which is what lets the compiler compare it with the constructor. If the list and the constructor don't match (wrong order, wrong type, a missing entry), `make()` doesn't compile.

The same works for **middleware** and for **your own classes**: anything with `static inject` can be built with `container.make(TheClass)`. A class with no constructor parameters needs no `inject` at all.

### What a mismatch looks like

If the list and the constructor disagree, your editor shows the error before you run anything:

```ts title="app/services/report.service.ts"
import { ConnectionToken, LoggerToken, type Connection, type Logger } from '@strutvane/framework'

export class ReportService {
  // Wrong order: the constructor takes the logger first.
  static readonly inject = [ConnectionToken, LoggerToken] as const
  readonly logger: Logger
  readonly db: Connection

  constructor(logger: Logger, db: Connection) {
    this.logger = logger
    this.db = db
  }
}

app.container.make(ReportService) // ✖ compile error
```

**What you'll see** (something like this): `No overload matches this call. … Argument of type 'typeof ReportService' is not assignable to parameter of type 'never'.` The `never` comes from Strutvane's `CheckInjectable<typeof ReportService>` check, which turns a wrong list into a type that nothing fits. Swap the two entries and it compiles.

You can run the same check yourself in a type test:

```ts title="tests/types/report.service.test-d.ts"
import type { CheckInjectable } from '@strutvane/framework'
import { ReportService } from '../../app/services/report.service.ts'

// Compiles only while the inject list matches the constructor.
const ok: CheckInjectable<typeof ReportService> = ReportService
```

## Your own classes, built for you

You don't have to bind a class to get it: an unbound **class** is built automatically from its `static inject` list (like Laravel's zero-config resolution). Only **tokens** must be bound, because a token has nothing to build from.

```ts title="app/services/post-stats.ts"
import { ConnectionToken, type Connection } from '@strutvane/framework'

export class PostStats {
  static readonly inject = [ConnectionToken] as const
  readonly #db: Connection

  constructor(db: Connection) {
    this.#db = db
  }

  async published(): Promise<number> {
    const [row] = await this.#db.select(`SELECT COUNT(*) AS "total" FROM "posts" WHERE "status" = 'published'`)
    return Number(row?.['total'] ?? 0)
  }
}
```

```ts title="app/http/controllers/dashboard.controller.ts"
import { Controller, type HttpContext } from '@strutvane/framework'
import { PostStats } from '../../services/post-stats.ts'

export class DashboardController extends Controller {
  static readonly inject = [PostStats] as const
  readonly #stats: PostStats

  constructor(stats: PostStats) {
    super()
    this.#stats = stats
  }

  async show(ctx: HttpContext): Promise<Response> {
    return ctx.json({ data: { published: await this.#stats.published() } })
  }
}
```

**What you'll see:** `{ "data": { "published": 4 } }`. The container built `PostStats` (with the connection) and then the controller (with `PostStats`), with no binding at all. An unbound class is built fresh every time; bind it with `singleton()` if it should be shared.

## Interfaces and implementations

The most useful pattern: code depends on an **interface** (what a service can do), and a provider decides which **implementation** (how it does it) the app gets. Then you can switch the implementation per environment, or in tests, without touching the code that uses it.

```ts title="app/services/tokens.ts"
import { token } from '@strutvane/framework'

export interface Notifier {
  notify(message: string): Promise<void>
}

export const NotifierToken = token<Notifier>('Notifier')
```

```ts title="app/providers/app.provider.ts"
import { config, ServiceProvider, type Application } from '@strutvane/framework'
import { NotifierToken } from '../services/tokens.ts'
import { ConsoleNotifier } from '../services/console-notifier.ts'
import { SlackNotifier } from '../services/slack-notifier.ts'

export class AppServiceProvider extends ServiceProvider {
  override register(app: Application): void {
    app.container.singleton(NotifierToken, () =>
      app.environment === 'production' ? new SlackNotifier() : new ConsoleNotifier(),
    )
  }
}
```

Classes that need it ask for the token: `static inject = [NotifierToken] as const`, constructor `(notifier: Notifier)`.

**Binding twice:** a later `bind()`, `singleton()` or `instance()` for the same key replaces the earlier one (and forgets a value already built), so a package's default can be overridden by your app's provider, and a test can override both.

## How long things live

| What | Lifetime | Why |
|---|---|---|
| A `singleton()` or `instance()` | The whole app (one per process) | Shared, expensive things: connections, clients |
| A `bind()` or an unbound class | Built on every `make()` | Cheap things that must not be shared |
| Controllers and middleware | Built for **every request** | Nothing stored on `this` can leak from one user's request into another's |

There's no "per request" binding: anything about the current request (the user, the bound models, the body) lives on `ctx`, the request context, which every action and middleware receives.

## Contracts: the interfaces the framework uses

Laravel's "contracts" are the interfaces behind its services (`Illuminate\Contracts\…`). Strutvane's live in `@strutvane/framework/contracts`: the `Logger`, the cache, the mailer and so on, so a package or your app can provide another implementation and bind it to the framework's token.

:::caution[Coming in 0.2]
The `contracts` entry point is being folded into `@strutvane/framework` from the 0.1 `@strutvane/contracts` package. The spike-12 core exports its tokens and types (`Logger`, `LoggerToken`, `ClockToken`, …) from the main entry. Laravel's contextual binding (`when()->needs()`) and tagging aren't planned: list what a class needs in `static inject` and bind a distinct token for each variant.
:::

## Facades and the container

A **facade** in Laravel is a static-looking shortcut to a service in the container (`Cache::get()`). Strutvane's plan is the same idea, typed and without magic: `Log`, `Cache`, `DB` and friends will be resolved from the current app's container, so a test can swap them by binding a fake. See [Facades](../facades/).

## Getting a service

| Where you are | How to get it |
|---|---|
| In a provider | `app.container.make(MailerToken)` or `app.make(MailerToken)` |
| In a controller, middleware or your own class | Ask for it in `static inject` (preferred) |
| Anywhere during a request or command | `app().container.make(MailerToken)` (see [Helpers](../helpers/)) |

Prefer `static inject`: the class says up front what it depends on, and tests can see it.

## Swapping a service in tests

Because each app has its **own** container (nothing is global), a test can replace any service before the app boots. Strutvane only fills in its defaults (clock, logger, rate limit store) when you haven't bound them yourself:

```ts title="tests/feature/clock.test.ts"
import { randomBytes } from 'node:crypto'
import { expect, it } from 'vitest'
import { ClockToken, now } from '@strutvane/framework'
import { createApp } from '../../bootstrap/app.ts'

it('uses a frozen clock', async () => {
  const app = createApp({ APP_ENV: 'testing', APP_KEY: `base64:${randomBytes(32).toString('base64')}`, DB_CONNECTION: 'sqlite', DB_DATABASE: ':memory:' })
  app.container.instance(ClockToken, () => new Date('2026-11-14T10:00:00Z'))
  await app.boot()

  expect(await app.run(() => now().toISOString())).toBe('2026-11-14T10:00:00.000Z')
})
```

What you'll see: the test passes, and every timestamp written through `now()` in that test is exactly `2026-11-14T10:00:00Z`.

## Common mistakes

### "Nothing is bound to … in the container"

```text
✖ Nothing is bound to "Mailer" in the container.
→ Bind it in a service provider's register() method, for example: app.container.singleton(MailerToken, () => …).
```

**Why:** you asked for a token nobody bound. (Classes are built automatically; tokens never are.)

**Fix:** bind it in a provider's `register()`:

```ts
app.container.singleton(MailerToken, () => new LogMailer())
```

### "These services depend on each other in a loop"

```text
✖ These services depend on each other in a loop: ReportService → Mailer → ReportService.
→ Break the loop by injecting a factory (() => service) instead of the service itself.
```

**Why:** A needs B and B needs A, so neither can be built first.

**Fix:** inject a function that builds the other service later:

```ts
app.container.singleton(MailerToken, (container) => new LogMailer(() => container.make(ReportServiceToken)))
```

### `make()` doesn't compile for my class

**Why:** the `static inject` list doesn't match the constructor (different order, a missing entry, or a wrong type), or you forgot `as const`.

**Fix:** write the list in the same order as the constructor parameters, and end it with `as const`:

```ts
static readonly inject = [ConnectionToken, LoggerToken] as const
constructor(db: Connection, logger: Logger) { … }
```

### "TypeScript parameter properties are not supported in strip-only mode"

```text
SyntaxError [ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX]: TypeScript parameter property is not supported in strip-only mode
```

**Why:** Node runs your `.ts` files by **stripping** the types, and a constructor shorthand like `constructor(readonly db: Connection) {}` is real code, not just a type, so it can't be stripped.
**Fix:** declare the field and assign it in the constructor, as every example on this page does:

```ts
readonly #db: Connection
constructor(db: Connection) {
  this.#db = db
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
