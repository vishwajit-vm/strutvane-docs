---
title: Context
description: The request context that follows every request and command through each `await` (the current app, the request id, the user and team), how it flows into log lines and, from 0.3, into queued jobs, how to add your own values and hidden values, and what to do in scripts and tests.
---

When a request comes in, many small pieces of code run for it: middleware, your controller, a model, a helper, a log call. They all need to know a few things about **this** request (which app, which user, which team, its request id) without you passing them from function to function. **Context** is that shared, per-request information.

Strutvane keeps it in Node's **`AsyncLocalStorage`**: a built-in way to attach a value to one request, so that it follows the code across every `await`, and two requests running at the same time never see each other's value.

:::tip[Coming from Laravel?]
It's Laravel's `Context` facade: `Context::add()` becomes `Context.add()`, values appear in every log line of the request, `addHidden()` keeps a value out of the logs, and (from 0.3) the context travels with queued jobs. The base is different: Laravel gets one process per request; a Node server handles many requests at once, so the context is carried by `AsyncLocalStorage` instead of a global.
:::

:::caution[Coming in 0.2]
**Proven in a prototype** (spike 12): the current-app context set around every request and every command, which `config()`, `route()`, `now()` and models read. **Designed for 0.2:** the request id, user and team in every log line, and `Log.withContext()` (see [Logging](../logging/)). **Planned:** the `Context` accessor (`add`, `get`, `addHidden`) and carrying context into queued jobs, which comes with the queue in 0.3.
:::

## The smallest example

You already use context every time you call a helper:

```ts title="app/http/controllers/home.controller.ts"
import { config, Controller, type HttpContext } from '@strutvane/framework'

export class HomeController extends Controller {
  async index(ctx: HttpContext): Promise<Response> {
    await new Promise((resolve) => setTimeout(resolve, 10))   // any await…
    return ctx.json({ app: config('app.name') })               // …still knows which app this is
  }
}
```

**What you'll see:** `{ "app": "My App" }`. `config()` found the app through the context, after an `await`, with no app object passed in.

## What's in the context

| Value | Set by | Used by |
|---|---|---|
| The current app (container, config, URLs) | Strutvane, around every request and command | `config()`, `route()`, `now()`, `app()`, models, [facades](../facades/) |
| The request id | Strutvane, for every request | every log line of the request, error reports |
| The signed-in user | the `auth` middleware | every log line (as an id), policies |
| The current team | tenancy, when teams are on | the ORM tenant scope, every log line |
| Your own values | you, with `Context.add()` | every log line, and queued jobs from 0.3 |

Values that are about the **request itself** (the body, the bound models, the route) live on `ctx`, the request object every action receives. Context is for what **all** code should know without being handed `ctx`.

## Context in your logs

Every log line written during a request carries its context, so you can find everything one request did:

```ts
import { Log } from '@strutvane/framework'

Log.info('Post published', { postId: 42 })
```

**What you'll see** in `storage/logs/strutvane-2026-11-15.log`:

```text
[2026-11-15 10:22:01.123] local.INFO: Post published {"postId":42,"requestId":"01JD7Q6Y9X3V2K8M4N5P6R7S8T","userId":1}
```

Add your own value for the rest of the request with `Log.withContext()`:

```ts
Log.withContext({ orderId: 'ord_123' })
Log.info('Charging the card')     // context: { orderId: 'ord_123', requestId: … }
```

Secrets are redacted from context like from everything else that's logged. See [Logging](../logging/).

## Adding your own values (preview)

:::caution[Coming in 0.2]
The `Context` accessor is planned (Laravel parity matrix); names follow Laravel and may change.
:::

```ts title="app/http/middleware/add-plan-context.ts"
import { Context, type HttpContext, type Middleware, type Next } from '@strutvane/framework'

export class AddPlanContext implements Middleware {
  async handle(ctx: HttpContext, next: Next): Promise<Response> {
    Context.add('plan', ctx.user === null ? 'guest' : 'pro')
    return next()
  }
}
```

Anywhere later in the same request:

```ts
Context.get('plan')   // → 'pro'
```

### Hidden values

Some values are useful to code but must never reach a log file: an internal key, a customer's account number.

```ts
Context.addHidden('partnerAccount', account.number)
Context.getHidden('partnerAccount')   // available to your code, never written to logs
```

## Context in queued jobs (coming in 0.3)

:::caution[Coming in 0.3]
Arrives with the queue in phase 2 (0.3).
:::

When a request dispatches a job, its context (request id, user, team and your own values, hidden ones included) is saved with the job and **restored** when a worker runs it. So the job's log lines carry the same request id as the request that queued it, and the job runs inside the same team. Code that runs work on other threads (`Concurrency.run`) passes the team and request context along explicitly for the same reason ([Concurrency](../concurrency/)).

## Outside a request: scripts and tests

A standalone script or a test isn't a request, so there's no context until you create one. Helpers then stop with a clear message:

```text
✖ config() was called outside a request or console command, so there is no current app.
→ Call it from a controller, middleware or command, or wrap the code in app.run(() => …) (tests: await app.run(async () => …)).
```

Wrap the code in `app.run()`, which sets the context for everything inside it:

```ts title="tests/feature/context.test.ts"
import { randomBytes } from 'node:crypto'
import { expect, test } from 'vitest'
import { config } from '@strutvane/framework'
import { createApp } from '../../bootstrap/app.ts'

test('code inside app.run() sees the app', async () => {
  const app = createApp({ APP_ENV: 'testing', APP_KEY: `base64:${randomBytes(32).toString('base64')}`, APP_NAME: 'Test App', DB_CONNECTION: 'sqlite' })
  await app.boot()
  expect(await app.run(async () => config('app.name'))).toBe('Test App')
})
```

`node strut` commands get a context automatically, like requests.

## Why not a global?

A global "current user" works when one process handles one request (PHP). A Node server handles many requests **at the same time**: while request A waits for the database, request B runs. A global would let B overwrite A's user mid-request. `AsyncLocalStorage` gives each request its own value, carried across every `await`, and it's also why two apps in one test file never see each other.

## Common mistakes

### "… was called outside a request or console command"

**Why:** the code ran at the top level of a file (when it was imported), in a `setTimeout` started before the request, or in a script.
**Fix:** move it into a function that runs during a request, or wrap it in `app.run(() => …)`.

### My log lines from a background callback have no request id

**Why:** work started outside the request (for example from a timer created at start-up) has no request context.
**Fix:** do the work inside the request, or queue a job (from 0.3 it carries the context).

### I put the user's password in the context

**Why:** context values are written to every log line of the request.
**Fix:** never put secrets in context; use hidden context for values code needs but logs must not show.

## Next steps

- [Logging](../logging/): what context looks like in log files.
- [Helpers](../helpers/): the helpers that read the current app.
- [Request Lifecycle](../lifecycle/): where the context is set.
