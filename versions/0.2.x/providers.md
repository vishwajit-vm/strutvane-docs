---
title: Service Providers
description: Service providers are where your app (and every package) plugs itself in. Learn the register-then-boot order, what belongs in each, and how packages add routes, commands and menu entries.
---

A **service provider** is a small class that sets up one part of your app when it starts. It can put services into the [container](../container/), add routes, add `node strut` commands, and add entries to the sidebar of the React UI.

Every app has at least one, `AppServiceProvider`, and every package you install brings its own. They're all listed, in order, in `bootstrap/providers.ts`.

:::tip[Coming from Laravel?]
Same idea, same two methods: `register()` binds, `boot()` uses, plus an optional `shutdown()` that runs when the app stops. `bootstrap/providers.ts` is Laravel 11's `bootstrap/providers.php`.

One difference: there is **no auto-discovery** from `node_modules`. A package's installer adds its provider line to `bootstrap/providers.ts`, so the file always shows exactly what runs when your app starts.
:::

:::caution[What exists, and when]
`ServiceProvider`, `withProviders()`, `app.addRoutes()`, `app.addCommand()` and `app.navigation` ship in `@strutvane/framework` 0.2.0-next.0 (not published to npm yet). Package installers that add the provider line for you (`node strut install:<name>`) are designed, not built.
:::

## The smallest example

```ts title="app/providers/app.provider.ts"
import { ServiceProvider, type Application } from '@strutvane/framework'

/** The app's own provider, Laravel's AppServiceProvider. */
export class AppServiceProvider extends ServiceProvider {
  override boot(app: Application): void {
    app.navigation.add({
      name: 'posts',
      label: 'Posts',
      path: '/posts',
      icon: 'file-text',
      group: 'Content',
      order: 10,
      permission: 'posts.viewAny',
    })
  }
}
```

```ts title="bootstrap/providers.ts"
import type { AnyProvider } from '@strutvane/framework'
import { AppServiceProvider } from '../app/providers/app.provider.ts'

/** The app's service providers. Package installers append here. */
export const providers: AnyProvider[] = [AppServiceProvider]
```

`bootstrap/app.ts` hands the list to the app with `.withProviders(providers)`.

**What you'll see:** nothing yet on the screen; `app.navigation.items` now holds the entry, and the React sidebar reads it. A provider that throws while booting stops the app with its error, so a broken provider never starts serving.

## Register, then boot

When the app boots, Strutvane runs providers in **two rounds**:

1. **`register(app)` on every provider**, in the order of `bootstrap/providers.ts`.
2. **`boot(app)` on every provider**, in the same order.

| Method | Do here | Don't do here |
|---|---|---|
| `register(app)` | Bind services (`app.container.singleton(…)`), add routes (`app.addRoutes(…)`) | Use other services: they may not be registered yet |
| `boot(app)` | Use services, read config, add navigation entries | Add routes (it's too late, they're already compiled) |

**Why two rounds?** So no provider ever sees a half-built app. By the time any `boot()` runs, every provider has registered everything.

`register()` is **synchronous**; `boot()` may be `async` (return a `Promise`), and Strutvane waits for each one before the next.

## Binding services (typical)

The most common job of `register()` is putting your services into the container:

```ts title="app/providers/app.provider.ts"
import { HttpClient, HttpClientToken, ServiceProvider, type Application } from '@strutvane/framework'

export class AppServiceProvider extends ServiceProvider {
  /** Every Http call from this app may reach the internal inventory service, and waits at most 5 s. */
  override register(app: Application): void {
    app.container.singleton(HttpClientToken, () => new HttpClient({ allow: ['10.20.0.0/16'], timeoutMs: 5000 }))
  }
}
```

The framework fills in its own defaults (the HTTP client, the cache manager, the encrypter, the session store…) only when a provider hasn't bound them, so your binding wins. Here every `Http.get()` now uses your client. See [HTTP Client](../http-client/).

:::caution[Coming in 0.2]
Signing users in (sessions, the built-in users table, bearer tokens) comes with `@strutvane/auth`, which binds its own services the same way.
:::

## Adding sidebar entries (typical)

`app.navigation.add()` contributes an entry to the React sidebar. Use it in `boot()`:

```ts title="app/providers/app.provider.ts"
import { ServiceProvider, type Application } from '@strutvane/framework'

export class AppServiceProvider extends ServiceProvider {
  override boot(app: Application): void {
    app.navigation.add({ name: 'posts', label: 'Posts', path: '/posts', icon: 'file-text', group: 'Content', order: 10, permission: 'posts.viewAny' })
    app.navigation.add({ name: 'authors', label: 'Authors', path: '/authors', icon: 'users', group: 'Content', order: 20, permission: 'authors.viewAny' })
    app.navigation.add({ name: 'billing', label: 'Billing', path: '/billing', icon: 'credit-card', group: 'Account', order: 50, permission: 'billing.view', badge: 3 })
  }
}
```

| Field | Meaning |
|---|---|
| `name` | A unique id for the entry (two entries with one name stop the app: `duplicate_navigation_item`) |
| `label` | The text in the sidebar |
| `path` | Where the entry links to |
| `icon` | An icon name |
| `group` | The heading to group entries under |
| `order` | Sort order within the group (lower first); must be a number |
| `permission` | Who sees it, or `null` for everyone signed in |
| `badge` | Optional: a count or short text next to the label |

Entries are sorted by group, then `order`, then label (`app.navigation.items`). The UI hides entries whose `permission` the user lacks. See [Sidebar](../crud-sidebar/).

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

:::caution[Known gap in 0.2.0-next.0]
A command added with `app.addCommand()` is part of the booted app, but `node strut` doesn't list or run it yet (that would need a boot on every CLI call). Register app commands with `.withCommands([...])` in `bootstrap/app.ts`; those appear in `node strut list`. `node strut install:<package>` adding the provider line for you is designed, not built: add it by hand.
:::

## Writing your own provider

Big apps split their setup by topic: one provider for billing, one for reports. A provider is any class that extends `ServiceProvider`:

1. Create the file:

   ```ts title="app/providers/report.provider.ts"
   import { config, ServiceProvider, type Application } from '@strutvane/framework'
   import { token } from '@strutvane/framework/core'

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
       app.navigation.add({ name: 'reports', label: 'Reports', path: '/reports', icon: 'chart-bar', group: 'Insights', order: 10, permission: 'reports.view' })
     }
   }
   ```

2. Add it to the list:

   ```ts title="bootstrap/providers.ts"
   import type { AnyProvider } from '@strutvane/framework'
   import { AppServiceProvider } from '../app/providers/app.provider.ts'
   import { ReportServiceProvider } from '../app/providers/report.provider.ts'

   export const providers: AnyProvider[] = [ReportServiceProvider, AppServiceProvider]
   ```

3. Check it boots:

   ```bash
   node strut route:list
   ```

**What you'll see:** the route table, which means every provider registered and booted. If a provider throws while booting, the command stops with that error instead, so a broken provider never reaches production silently. The test below checks the binding and the menu entry.

:::caution[Coming in 0.2]
`node strut make:provider ReportServiceProvider` (writing the file and adding the line) is planned with the other `make:*` commands. Until then, create the file by hand as above.
:::

## Async providers

`boot()` may return a `Promise`, and Strutvane waits for each one before the next. Use it when setup really needs to wait, for example to read a file once. `register()` stays synchronous, so bind a value there and fill it in `boot()`, or read the file synchronously:

```ts title="app/providers/feature-flags.provider.ts"
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ServiceProvider, type Application } from '@strutvane/framework'
import { token } from '@strutvane/framework/core'

export const FlagsToken = token<Map<string, boolean>>('FeatureFlags')

export class FeatureFlagsProvider extends ServiceProvider {
  readonly #flags = new Map<string, boolean>()

  override register(app: Application): void {
    app.container.value(FlagsToken, this.#flags)
  }

  override async boot(app: Application): Promise<void> {
    const raw = await readFile(join(app.basePath, 'storage', 'flags.json'), 'utf8')
    for (const [name, on] of Object.entries(JSON.parse(raw) as Record<string, boolean>)) this.#flags.set(name, on)
  }
}
```

Keep it quick: every provider runs before the first request, and `node strut` commands boot too.

## Only in some environments

A provider can check where it runs and skip work. `app.environment` is `APP_ENV` (`local`, `testing`, `staging` or `production`):

```ts title="app/providers/app.provider.ts"
import { ServiceProvider, type Application } from '@strutvane/framework'

export class AppServiceProvider extends ServiceProvider {
  override boot(app: Application): void {
    if (app.environment === 'local') {
      app.navigation.add({ name: 'dev.mail', label: 'Mail inbox', path: '/dev/mail', icon: 'inbox', group: 'Developer', order: 99, permission: null })
    }
  }
}
```

## How a package plugs in

A Strutvane package (the log viewer, billing, your own) ships one provider. Installing it with `node strut install:<name>` runs the **installer protocol**: it adds the package's config file, `.env` keys (and `.env.example` entries, never secrets), migrations, routes, screens and sidebar entries, and the provider line in `bootstrap/providers.ts`. Install order never changes the result.

Each package describes what it installs in a `strutvane` block in its `package.json` (its id, name, the framework versions it supports, its config and `.env` keys, its optional installer questions), and no code runs to read it. To copy a package's files into your app so you can change them, `node strut publish <package> --tag=config` (or `migrations`, `views`) will do what Laravel's `vendor:publish` does.

:::caution[Coming in 0.2]
The package manifest, `install:<name>` and `publish` are designed (blueprint §3.3, Laravel parity matrix). Today `node strut add <package>` installs a package and runs its installer. `app.addRoutes()` and `app.navigation.add()` from a provider ship in 0.2.0-next.0.
:::

## Testing a provider

Build a fresh app in the test, boot it, and look at what the provider set up:

```ts title="tests/feature/report-provider.test.ts"
import { randomBytes } from 'node:crypto'
import { dirname } from 'node:path'
import { expect, test } from 'vitest'
import { Application } from '@strutvane/framework'
import { ReportServiceProvider, ReportSettingsToken } from '../../app/providers/report.provider.ts'
import { config } from '../../config/index.ts'

test('the report provider binds its settings and menu entry', async () => {
  const app = Application.configure({
    basePath: dirname(dirname(import.meta.dirname)),
    // env is used instead of process.env (a .env file in basePath is still read underneath).
    env: { APP_ENV: 'testing', APP_KEY: `base64:${randomBytes(32).toString('base64')}` },
  })
    .withConfig(config)
    .withProviders([ReportServiceProvider])
    .create()
  await app.boot()

  expect(app.make(ReportSettingsToken).timezone).toBe('UTC')
  expect(app.navigation.items.map((item) => item.label)).toContain('Reports')
  await app.shutdown()
})
```

**What you'll see** with `npm test`: the test passes. Each test gets its own app and container, so nothing leaks between tests.

## Order matters (a little)

Providers run in the order of the `providers` array. That matters only when two providers bind the **same** key: the later binding wins. Put `AppServiceProvider` last if you want your app to override a package's default.

```ts title="bootstrap/providers.ts"
export const providers: AnyProvider[] = [BillingServiceProvider, AppServiceProvider]
```

## Common mistakes

### "Routes were added after the app booted"

```text
error Routes were added after the app compiled its routes, so they would never be matched.
  → Call app.addRoutes() in a provider's register() method.
```

**Why:** routes are compiled between the two rounds. Anything added in `boot()` is too late.

**Fix:** move `app.addRoutes(...)` into `register()`.

### "No binding for …" from inside `register()`

```text
ContainerError: No binding for "Mailer". Register it in a service provider.
```

**Why:** one provider's `register()` used a service another provider registers later (error code `unknown_token`).

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
BootError: config() was called outside a request or console command, so there is no current app.
```

Its hint: `Call it from a controller, middleware or command, or wrap the code in app.run(() => …) (tests: await app.run(async () => …)).`

**Why:** the helper ran at the **top level** of the provider file, when it was imported, before any app existed.
**Fix:** move the call into `register()` or `boot()` (both run inside the app):

```ts
override boot(app: Application): void {
  const name = config('app.name') // fine here
}
```

### "Two navigation entries are named …"

```text
error Two navigation entries are named "reports".
  → Give each entry its own name, or remove one of them.
```

**Why:** `name` identifies an entry, and two providers (or one provider twice) used the same one.
**Fix:** give each entry a unique `name`, such as `reports` and `reports.monthly`.

## Next steps

- [Service Container](../container/): the bindings providers create.
- [Request Lifecycle](../lifecycle/): where boot happens.
- [CLI Reference](../cli-reference/): `node strut route:list` shows the routes your providers added.
