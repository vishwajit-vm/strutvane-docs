---
title: Contracts
description: The interfaces behind the framework's services (`@strutvane/framework/contracts`), how each is bound to a container token, how to provide your own implementation, and when your code should depend on a contract instead of a concrete class.
---

A **contract** is an interface: a list of what a service can do, without saying how. The framework's logger, cache, mailer and clock are each described by a contract, and the app gets a concrete implementation through the [service container](../container/). Your code can depend on the contract, so you can switch the implementation (a different mailer, a fake in tests) without touching the code that uses it.

:::tip[Coming from Laravel?]
These are Laravel's `Illuminate\Contracts\…` interfaces, as TypeScript types in `@strutvane/framework/contracts`. Because TypeScript types vanish at runtime, each contract is paired with a **token** (`LoggerToken`, from `@strutvane/framework/core`), and that token, not the interface, is what you bind and inject.
:::

:::caution[What exists, and when]
**On framework `main` (0.2.0-next.0, not on npm yet):** the `@strutvane/framework/contracts` entry point (0.1's `@strutvane/contracts`, folded in) with the shared types (`Logger`, `Actor`, `Problem`, `PermissionProvider`, `TenantContext`, the HTTP hook payloads), their tokens in `@strutvane/framework/core`, and the store contracts on the main entry (`CacheStore`, `SessionStore`, `IdempotencyStore`). **Coming with their features:** the contracts of mail, queues and storage drivers beyond `local`/`memory`. A rate-limit store and a user provider token, which the 0.2 prototype had, aren't public in this build.
:::

## The smallest example

Depend on the `Logger` contract, not on a particular logger:

```ts title="app/services/report.service.ts"
import { LoggerToken } from '@strutvane/framework/core'
import type { Logger } from '@strutvane/framework/contracts'

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

**What you'll see:** in the app, the line is written as one JSON line on standard output (the framework's logger today; see [Logging](../logging/)); in a test that hands it a logger with its own sink, it's captured in memory where the test can read it. `ReportService` didn't change.

## The contracts

| Contract | Import the type from | Token | What it promises | Default implementation |
|---|---|---|---|---|
| `Logger` | `/contracts` | `LoggerToken` (`/core`) | `trace`, `debug`, `info`, `warn`, `error`, `fatal` with a fields object, plus `child()`, `isLevelEnabled()` and `flush()` | JSON lines on standard output, secrets redacted |
| `Clock` | `/core` | `ClockToken` (`/core`) | `now()`: milliseconds since 1970 | the system clock |
| `EventBus` | `/core` | `EventBusToken` (`/core`) | publish and listen to domain events | in memory |
| `PermissionProvider` | `/contracts` | `PermissionProviderToken` (`/core`) | decide permissions and row filters | `@strutvane/auth` |
| `CacheStore`, `CacheManager` | root | `CacheManagerToken` (root) | get, put, forget, flush per store | `memory` and `file` stores |
| `SessionStore` | root | `SessionStoreToken` (root) | sessions that can be flushed | files under `storage/framework/sessions` |
| `IdempotencyStore` | root | `IdempotencyStoreToken` (root) | keep first responses per `Idempotency-Key` | in memory |

`node strut about` doesn't list bindings yet; the table above is the list for 0.2.0-next.0.

## Providing your own implementation

1. Write a class that implements the contract:

   ```ts title="app/services/console-logger.ts"
   import type { Logger, LogFields, LogLevel } from '@strutvane/framework/contracts'

   const write = (stream: NodeJS.WriteStream, msg: string, fields: LogFields = {}): void => {
     stream.write(`${msg} ${JSON.stringify(fields)}\n`)
   }

   export class ConsoleLikeLogger implements Logger {
     trace(msg: string, fields?: LogFields): void { write(process.stdout, msg, fields) }
     debug(msg: string, fields?: LogFields): void { write(process.stdout, msg, fields) }
     info(msg: string, fields?: LogFields): void { write(process.stdout, msg, fields) }
     warn(msg: string, fields?: LogFields): void { write(process.stderr, msg, fields) }
     error(msg: string, fields?: LogFields): void { write(process.stderr, msg, fields) }
     fatal(msg: string, fields?: LogFields): void { write(process.stderr, msg, fields) }
     child(_bindings: LogFields): Logger { return this }
     isLevelEnabled(_level: LogLevel): boolean { return true }
     async flush(): Promise<void> {}
   }
   ```

2. Bind it to the contract's token in a provider's `register()`:

   ```ts title="app/providers/app.provider.ts"
   import { ServiceProvider, type Application } from '@strutvane/framework'
   import { LoggerToken } from '@strutvane/framework/core'
   import { ConsoleLikeLogger } from '../services/console-logger.ts'

   export class AppServiceProvider extends ServiceProvider {
     override register(app: Application): void {
       app.container.singleton(LoggerToken, () => new ConsoleLikeLogger())
     }
   }
   ```

**What you'll see:** everything that injects `LoggerToken` (the framework too) now writes through your class. If your class misses a method, it doesn't compile: `implements Logger` checks it.

(This replaces the framework's logger entirely, losing redaction; it's only an illustration. Logging channels configured from `.env` are [coming in 0.2](../logging/).)

## Contracts in tests

A class that depends on a contract takes any implementation, so a test can hand it one that keeps lines in memory. `createLogger()` from `/core` takes a `sink`, the function each JSON line is written to:

```ts title="tests/unit/report.service.test.ts"
import { expect, test } from 'vitest'
import { createLogger } from '@strutvane/framework/core'
import { ReportService } from '../../app/services/report.service.ts'

test('building a report logs it', () => {
  const lines: string[] = []
  const log = createLogger({ sink: (line) => lines.push(line) })

  new ReportService(log).build()

  expect(lines.map((line) => JSON.parse(line).msg)).toContain('Report built')
})
```

**What you'll see** with `npm test`: the test passes, with nothing written to the terminal. In a booted app, bind the same logger before `boot()` (`app.container.value(LoggerToken, log)`) and everything that injects `LoggerToken` uses it: bindings made before `boot()` win over the framework's defaults.

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
import { token } from '@strutvane/framework/core'

export interface Notifier {
  notify(message: string): Promise<void>
}

export const NotifierToken = token<Notifier>('Notifier')
```

Bind an implementation per environment in a provider, and inject `NotifierToken` where you need it. See [Service Container](../container/).

## Common mistakes

### "No binding for … Register it in a service provider."

```text
No binding for "Notifier". Register it in a service provider.
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
