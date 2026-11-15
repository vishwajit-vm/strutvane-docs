---
title: Contracts
description: The interfaces behind the framework's services (`@strutvane/framework/contracts`), how each is bound to a container token, how to provide your own implementation, and when your code should depend on a contract instead of a concrete class.
---

A **contract** is an interface: a list of what a service can do, without saying how. The framework's logger, cache, mailer and clock are each described by a contract, and the app gets a concrete implementation through the [service container](../container/). Your code can depend on the contract, so you can switch the implementation (a different mailer, a fake in tests) without touching the code that uses it.

:::tip[Coming from Laravel?]
These are Laravel's `Illuminate\Contracts\…` interfaces, as TypeScript types in `@strutvane/framework/contracts`. Because TypeScript types vanish at runtime, each contract is paired with a **token** (`LoggerToken`), and that token, not the interface, is what you bind and inject.
:::

:::caution[Coming in 0.2]
**Proven in a prototype** (spike 12): contracts as plain types with tokens, exported from the framework's main entry: `Logger` + `LoggerToken`, the clock (`ClockToken`), `RateLimitStore` + `RateLimitStoreToken`, `IdempotencyStore` + `IdempotencyStoreToken`, `UserProvider` + `UserProviderToken`, `SessionStore` + `SessionStoreToken`. **Being folded in for 0.2:** the separate `@strutvane/framework/contracts` entry point (from 0.1's `@strutvane/contracts` package), with the contracts of the cache, mail, queue, events, storage and the HTTP client arriving with those features.
:::

## The smallest example

Depend on the `Logger` contract, not on a particular logger:

```ts title="app/services/report.service.ts"
import { LoggerToken, type Logger } from '@strutvane/framework'

export class ReportService {
  static readonly inject = [LoggerToken] as const
  readonly #log: Logger

  constructor(log: Logger) {
    this.#log = log
  }

  build(): void {
    this.#log.info('Report built')
  }
}
```

**What you'll see:** in the app, the line goes to your log files; in a test that binds a `MemoryLogger`, it's captured in memory where the test can read it. `ReportService` didn't change.

## The contracts

| Contract | Token | What it promises | Default implementation |
|---|---|---|---|
| `Logger` | `LoggerToken` | `info`, `warn`, `error` with a context object (the full level list arrives with the logging channels) | the framework logger (channels from `.env`) |
| clock: `() => Date` | `ClockToken` | the current time | the system clock |
| `RateLimitStore` | `RateLimitStoreToken` | count hits per key in a window | the cache (memory in the prototype) |
| `IdempotencyStore` | `IdempotencyStoreToken` | keep first responses per key | memory in the prototype |
| `UserProvider` | `UserProviderToken` | find the user for a token | `@strutvane/auth` |
| `SessionStore` | `SessionStoreToken` | sessions that can be flushed | `@strutvane/auth`'s database store |
| cache, mailer, queue, event dispatcher, file storage, HTTP client | one token each | as their pages describe | arrive with each feature |

The exact list for 0.2 will be in `@strutvane/framework/contracts`; `node strut about` will show what's bound.

## Providing your own implementation

1. Write a class that implements the contract:

   ```ts title="app/services/console-logger.ts"
   import type { Logger } from '@strutvane/framework'

   export class ConsoleLikeLogger implements Logger {
     info(message: string, context = {}): void { process.stdout.write(`${message} ${JSON.stringify(context)}\n`) }
     warn(message: string, context = {}): void { process.stderr.write(`${message} ${JSON.stringify(context)}\n`) }
     error(message: string, context = {}): void { process.stderr.write(`${message} ${JSON.stringify(context)}\n`) }
   }
   ```

2. Bind it to the contract's token in a provider's `register()`:

   ```ts title="app/providers/app.provider.ts"
   import { LoggerToken, ServiceProvider, type Application } from '@strutvane/framework'
   import { ConsoleLikeLogger } from '../services/console-logger.ts'

   export class AppServiceProvider extends ServiceProvider {
     override register(app: Application): void {
       app.container.singleton(LoggerToken, () => new ConsoleLikeLogger())
     }
   }
   ```

**What you'll see:** everything that injects `LoggerToken` (the framework too) now writes through your class. If your class misses a method, it doesn't compile: `implements Logger` checks it.

(This replaces the framework's logger entirely, losing channels and redaction; it's only an illustration. To change where logs go, configure channels instead: [Logging](../logging/).)

## Contracts in tests

```ts title="tests/feature/report.test.ts"
import { randomBytes } from 'node:crypto'
import { expect, test } from 'vitest'
import { LoggerToken, MemoryLogger } from '@strutvane/framework'
import { ReportService } from '../../app/services/report.service.ts'
import { createApp } from '../../bootstrap/app.ts'

test('building a report logs it', async () => {
  const app = createApp({ APP_ENV: 'testing', APP_KEY: `base64:${randomBytes(32).toString('base64')}`, DB_CONNECTION: 'sqlite' })
  const log = new MemoryLogger()
  app.container.instance(LoggerToken, log)
  await app.boot()

  app.make(ReportService).build()

  expect(log.entries.map((entry) => entry.message)).toContain('Report built')
})
```

**What you'll see** with `npm test`: the test passes, with nothing written to your log files. Bindings made before `boot()` win over the framework's defaults.

## Contract or concrete class?

| Depend on… | When | Example |
|---|---|---|
| **A contract** (token + interface) | The implementation may change: per environment, per customer, in tests, or by a package | the logger, the mailer, a payment gateway, your own `Notifier` |
| **A concrete class** | There's exactly one implementation and it's yours | `PostStats`, `InvoiceNumberGenerator` |
| **A facade** | Short code that isn't a class you control (a route closure, a seeder) | `Log.info(…)` ([Facades](../facades/)) |

Rules of thumb:

- **Start concrete.** Inject your own class directly (the container builds it from `static inject`). Introduce a contract when a second implementation appears, not before.
- **Packages depend on contracts.** A package shouldn't import another package's classes: it asks for a token, so any implementation can be bound. That's how Strutvane's own packages stay independent.
- **Keep contracts small.** A contract with three methods is easy to implement and to fake; one with thirty isn't.

### Your own contract

```ts title="app/contracts/notifier.ts"
import { token } from '@strutvane/framework'

export interface Notifier {
  notify(message: string): Promise<void>
}

export const NotifierToken = token<Notifier>('Notifier')
```

Bind an implementation per environment in a provider, and inject `NotifierToken` where you need it. See [Service Container](../container/).

## Common mistakes

### "Nothing is bound to … in the container"

```text
✖ Nothing is bound to "Notifier" in the container.
→ Bind it in a service provider's register() method, for example: app.container.singleton(NotifierToken, () => …).
```

**Why:** a contract (a token) has nothing to build from, so it must be bound. (Classes are built automatically; tokens never are.)
**Fix:** bind an implementation in a provider's `register()`.

### I injected the interface and got `undefined`

**Why:** an interface doesn't exist at runtime, so it can't be a key. `static inject = [Logger]` refers to nothing.
**Fix:** inject the **token**: `static inject = [LoggerToken] as const`, and type the constructor parameter with the interface.

### My fake isn't used in the test

**Why:** it was bound after the app booted and something had already resolved the real service.
**Fix:** bind fakes before `await app.boot()` (or before the first request).

## Next steps

- [Service Container](../container/): tokens, bindings and injection.
- [Service Providers](../providers/): where bindings live.
- [Facades](../facades/): the short form for the same services.
