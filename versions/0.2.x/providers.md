---
title: Service Providers
description: Service providers are where your app (and every package) plugs itself in. Learn the register-then-boot order, what belongs in each, and how packages add routes, commands and menu entries.
---

A **service provider** is a small class that sets up one part of your app when it starts. It can put services into the [container](../container/), add routes, add `node strut` commands, and add entries to the sidebar of the React UI.

Every app has at least one, `AppServiceProvider`, and every package you install brings its own. They're all listed, in order, in `bootstrap/providers.ts`.

:::tip[Coming from Laravel?]
Same idea, same two methods: `register()` binds, `boot()` uses. `bootstrap/providers.ts` is Laravel 11's `bootstrap/providers.php`.

One difference: there is **no auto-discovery** from `node_modules`. A package's installer adds its provider line to `bootstrap/providers.ts`, so the file always shows exactly what runs when your app starts.
:::

## The smallest example

```ts title="app/providers/app.provider.ts"
import { ServiceProvider, type Application } from '@strutvane/framework'

/** The app's own provider, Laravel's AppServiceProvider. */
export class AppServiceProvider extends ServiceProvider {
  override boot(app: Application): void {
    app.navigation.add({ label: 'Posts', route: 'posts.index', order: 10 })
  }
}
```

```ts title="bootstrap/providers.ts"
import type { ProviderClass } from '@strutvane/framework'
import { AppServiceProvider } from '../app/providers/app.provider.ts'

/** The app's service providers. Package installers append here. */
export const providers: ProviderClass[] = [AppServiceProvider]
```

What you'll see: run `node strut about` and the navigation section lists your entry:

```text
  Navigation
    Posts
```

## Register, then boot

When the app boots, Strutvane runs providers in **two rounds**:

1. **`register(app)` on every provider**, in the order of `bootstrap/providers.ts`.
2. **`boot(app)` on every provider**, in the same order.

| Method | Do here | Don't do here |
|---|---|---|
| `register(app)` | Bind services (`app.container.singleton(…)`), add routes (`app.addRoutes(…)`), add commands | Use other services: they may not be registered yet |
| `boot(app)` | Use services, read config, add navigation entries | Add routes (it's too late, they're already compiled) |

**Why two rounds?** So no provider ever sees a half-built app. By the time any `boot()` runs, every provider has registered everything.

Both methods may be `async` (return a `Promise`); Strutvane waits for each one.

## Binding services (typical)

The most common job of `register()` is putting your services into the container:

```ts title="app/providers/app.provider.ts"
import { hashToken, ServiceProvider, UserProviderToken, type Application, type AuthUser, type UserProvider } from '@strutvane/framework'
import { Author } from '../models/author.ts'

/** Finds the author who owns a bearer token (tokens are stored as SHA-256 hashes). */
class AuthorTokenProvider implements UserProvider {
  async retrieveByToken(plainToken: string): Promise<AuthUser | null> {
    return (await Author.query().where('api_token', hashToken(plainToken)).first()) ?? null
  }
}

export class AppServiceProvider extends ServiceProvider {
  /** Bind the user provider the `auth` middleware uses. */
  override register(app: Application): void {
    app.container.singleton(UserProviderToken, () => new AuthorTokenProvider())
  }
}
```

The `auth` middleware asks the container for `UserProviderToken`, so this one binding decides how bearer tokens are checked.

:::caution[Coming in 0.2]
Sign-in with sessions and the built-in users table come with `@strutvane/auth`. The token provider above is how the application-core prototype (spike 12) signs requests in today.
:::

## Adding sidebar entries (typical)

`app.navigation.add()` contributes an entry to the React sidebar. Use it in `boot()`:

```ts
override boot(app: Application): void {
  app.navigation.add({ label: 'Posts', route: 'posts.index', order: 10 })
  app.navigation.add({ label: 'Authors', route: 'authors.index', order: 20 })
  app.navigation.add({ label: 'Billing', route: 'billing.index', group: 'Account', icon: 'credit-card', order: 50 })
}
```

| Field | Meaning |
|---|---|
| `label` | The text in the sidebar |
| `route` | A **named** route the entry links to |
| `group` | Optional heading to group entries under |
| `icon` | Optional icon name |
| `order` | Sort order within the group (lower first) |

Entries are sorted by group, then `order`, then label. The UI hides entries the user may not `viewAny`.

:::caution[Coming in 0.2]
Two prototypes describe a sidebar entry slightly differently: the application core (spike 12) uses `{ label, route, group, icon, order }` as above, while the UI prototype (spike 14) uses `{ name, label, path, icon, group, sort, badge, permission }`, with a `permission` that decides who sees it and a `badge` (a count or short text). The final shape will merge the two. See [Sidebar](../crud-sidebar/).
:::

## Adding routes and commands from a package (advanced)

A package's provider can bring its own routes and commands. Add both in `register()`:

```ts title="node_modules/@acme/billing/src/billing.provider.ts"
import { defineRoutes, Route, ServiceProvider, type Application } from '@strutvane/framework'
import { InvoiceController } from './invoice.controller.ts'
import { billingSyncCommand } from './billing-sync.command.ts'

const billingRoutes = defineRoutes([
  Route.get('/invoices', [InvoiceController, 'index']).name('billing.invoices'),
])

export class BillingServiceProvider extends ServiceProvider {
  override register(app: Application): void {
    app.addRoutes(billingRoutes, { prefix: '/api/billing', group: 'api' })
    app.addCommand(billingSyncCommand)
  }
}
```

What you'll see when you list the routes (something like this):

```bash
node strut route:list --path billing
```

```text
  Method  URI                     Name              Action                   Middleware
  ------  ----------------------  ----------------  -----------------------  ----------
  GET     /api/billing/invoices   billing.invoices  InvoiceController@index  api

  Showing 1 of 16 routes.
```

`group: 'api'` gives the routes the same middleware as your own API routes (CSRF check and rate limit).

:::caution[Coming in 0.2]
`node strut install:<package>` will add the provider line to `bootstrap/providers.ts` for you. Until then, add it by hand.
:::

## Writing your own provider

Big apps split their setup by topic: one provider for billing, one for reports. A provider is any class that extends `ServiceProvider`:

1. Create the file:

   ```ts title="app/providers/report.provider.ts"
   import { config, ServiceProvider, token, type Application } from '@strutvane/framework'

   export interface ReportSettings {
     readonly title: string
     readonly timezone: string
   }

   export const ReportSettingsToken = token<ReportSettings>('ReportSettings')

   /** Everything the reports feature needs. */
   export class ReportServiceProvider extends ServiceProvider {
     override register(app: Application): void {
       // config() works inside the factory: it runs later, inside the app.
       app.container.singleton(ReportSettingsToken, () => ({ title: `${config('app.name')} reports`, timezone: 'UTC' }))
     }

     override boot(app: Application): void {
       app.navigation.add({ label: 'Reports', route: 'reports.index', group: 'Insights', icon: 'chart-bar', order: 10 })
     }
   }
   ```

2. Add it to the list:

   ```ts title="bootstrap/providers.ts"
   import type { ProviderClass } from '@strutvane/framework'
   import { AppServiceProvider } from '../app/providers/app.provider.ts'
   import { ReportServiceProvider } from '../app/providers/report.provider.ts'

   export const providers: ProviderClass[] = [ReportServiceProvider, AppServiceProvider]
   ```

3. Check it ran:

   ```bash
   node strut about
   ```

**What you'll see:** "Reports" in the Navigation section. If a provider throws while booting, the app doesn't start, and `node strut about` prints the error, so a broken provider never reaches production silently.

:::caution[Coming in 0.2]
`node strut make:provider ReportServiceProvider` (writing the file and adding the line) is planned with the other `make:*` commands. Until then, create the file by hand as above.
:::

## Async providers

`register()` and `boot()` may return a `Promise`, and Strutvane waits for each one before the next. Use it when setup really needs to wait, for example to read a file once:

```ts title="app/providers/feature-flags.provider.ts"
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ServiceProvider, token, type Application } from '@strutvane/framework'

export const FlagsToken = token<Readonly<Record<string, boolean>>>('FeatureFlags')

export class FeatureFlagsProvider extends ServiceProvider {
  override async register(app: Application): Promise<void> {
    const raw = await readFile(join(app.basePath, 'storage', 'flags.json'), 'utf8')
    app.container.instance(FlagsToken, JSON.parse(raw) as Record<string, boolean>)
  }
}
```

Keep it quick: every provider runs before the first request, and `node strut` commands boot too.

## Only in some environments

A provider can check where it runs and skip work. `app.environment` is `APP_ENV` (`local`, `testing` or `production`):

```ts title="app/providers/app.provider.ts"
import { ServiceProvider, type Application } from '@strutvane/framework'

export class AppServiceProvider extends ServiceProvider {
  override boot(app: Application): void {
    if (app.environment === 'local') {
      app.navigation.add({ label: 'Mail inbox', route: 'dev.mail', group: 'Developer', order: 99 })
    }
  }
}
```

## How a package plugs in

A Strutvane package (the log viewer, billing, your own) ships one provider. Installing it with `node strut install:<name>` runs the **installer protocol**: it adds the package's config file, `.env` keys (and `.env.example` entries, never secrets), migrations, routes, screens and sidebar entries, and the provider line in `bootstrap/providers.ts`. Install order never changes the result.

Each package describes what it installs in a `strutvane` block in its `package.json` (its id, name, the framework versions it supports, its config and `.env` keys, its optional installer questions), and no code runs to read it. To copy a package's files into your app so you can change them, `node strut publish <package> --tag=config` (or `migrations`, `views`) will do what Laravel's `vendor:publish` does.

:::caution[Coming in 0.2]
The package manifest, `install:<name>` and `publish` are designed (blueprint §3.3, Laravel parity matrix). `app.addRoutes()`, `app.addCommand()` and `app.navigation.add()` from a provider are proven in spike 12.
:::

## Testing a provider

Build a fresh app in the test, boot it, and look at what the provider set up:

```ts title="tests/feature/report-provider.test.ts"
import { expect, test } from 'vitest'
import { ReportSettingsToken } from '../../app/providers/report.provider.ts'
import { createApp } from '../../bootstrap/app.ts'

test('the report provider binds its settings and menu entry', async () => {
  const app = createApp({ APP_ENV: 'testing', APP_KEY: 'test-key', DB_CONNECTION: 'sqlite' })
  await app.boot()

  expect(app.make(ReportSettingsToken).timezone).toBe('UTC')
  expect(app.navigation.items.map((item) => item.label)).toContain('Reports')
})
```

**What you'll see** with `npm test`: the test passes. Each test gets its own app and container, so nothing leaks between tests.

## Order matters (a little)

Providers run in the order of the `providers` array. That matters only when two providers bind the **same** key: the later binding wins. Put `AppServiceProvider` last if you want your app to override a package's default.

```ts title="bootstrap/providers.ts"
export const providers: ProviderClass[] = [BillingServiceProvider, AppServiceProvider]
```

## Common mistakes

### "Routes were added after the app booted"

```text
✖ Routes were added after the app booted, so they would never be matched.
→ Call app.addRoutes() in a provider's register() method.
```

**Why:** routes are compiled between the two rounds. Anything added in `boot()` is too late.

**Fix:** move `app.addRoutes(...)` into `register()`.

### "Nothing is bound to … in the container" from inside `register()`

```text
✖ Nothing is bound to "Mailer" in the container.
→ Bind it in a service provider's register() method, for example: app.container.singleton(MailerToken, () => …).
```

**Why:** one provider's `register()` used a service another provider registers later.

**Fix:** don't *use* services in `register()`. Bind with a factory (it runs later, when someone asks), or move the code to `boot()`:

```ts
override register(app: Application): void {
  app.container.singleton(ReportServiceToken, (container) => new ReportService(container.make(MailerToken)))
}
```

### My provider never runs

**Why:** it isn't in `bootstrap/providers.ts`. There is no auto-discovery.

**Fix:** add it to the array.

### "… was called outside a request or console command" in a provider file

```text
✖ config() was called outside a request or console command, so there is no current app.
→ Call it from a controller, middleware or command, or wrap the code in app.run(() => …) (tests: await app.run(async () => …)).
```

**Why:** the helper ran at the **top level** of the provider file, when it was imported, before any app existed.
**Fix:** move the call into `register()` or `boot()` (both run inside the app):

```ts
override boot(app: Application): void {
  const name = config('app.name') // fine here
}
```

### My navigation entry links nowhere

**Why:** `route` must be the **name** of a route (`'reports.index'`), not a path (`'/reports'`).
**Fix:** name the route with `.name('reports.index')` in your routes file, and use that name. `node strut route:list` shows every name.

## Next steps

- [Service Container](../container/): the bindings providers create.
- [Request Lifecycle](../lifecycle/): where boot happens.
- [CLI Reference](../cli-reference/): `node strut about` shows what your providers set up.
