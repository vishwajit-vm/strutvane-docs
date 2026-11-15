---
title: Helpers
description: The plain, fully typed helper functions you can import anywhere (config, route, now, app, redirect, abort, signed URLs, encrypt and decrypt), how they find the current app, what to do outside a request, and the support helpers coming next (Str, Num, retry, once, Pipeline, Benchmark, Sleep, Timebox, Lottery).
---

**Helpers** are small functions you import and call from anywhere in your app's code: `config('app.name')`, `route('posts.show', { post })`, `now()`. They save you from passing the application object around, and every one of them is **fully typed**: a wrong config key or route name is a compile error, not a runtime surprise.

:::tip[Coming from Laravel?]
`config()`, `route()`, `now()`, `app()`, `redirect()`, `abort()`, `encrypt()` and `decrypt()` work as you expect, and `URL::signedRoute()` is `signedRoute()`.

The difference: Laravel's helpers reach a global container. Strutvane's read **the current app** from the request or command that's running, so two apps (two tests) in one process never see each other. Laravel's static facades (`Cache::get()`) are planned as typed accessors resolved the same way: see [Facades](../facades/).
:::

## The smallest example

```ts title="app/http/controllers/home.controller.ts"
import { config, Controller, now, route, type HttpContext } from '@strutvane/framework'

export class HomeController extends Controller {
  index(ctx: HttpContext): Response {
    return ctx.json({
      app: config('app.name'),
      time: now().toISOString(),
      posts: route('posts.index'),
    })
  }
}
```

What you'll see at `GET /api/home`:

```json
{
  "app": "My App",
  "time": "2026-11-14T10:00:00.000Z",
  "posts": "/api/posts"
}
```

## Every helper at a glance

| Helper | Returns | Laravel equivalent | Status |
|---|---|---|---|
| `config(key)` | A config value, typed by your `config/*.ts` files | `config('app.name')` | proven (spike 12) |
| `route(name, params?, options?)` | The URL of a named route | `route('posts.show', $post)` | proven |
| `now()` | The current `Date`, from the app's clock | `now()` | proven |
| `app()` | The current application: `container`, `config`, `url` | `app()` | proven |
| `redirect()` | A redirector: `.to()`, `.intended()`, `.away()` | `redirect()` | proven |
| `abort(status, detail?)` | Never returns: stops the request with 401, 403 or 404 | `abort(404)` | proven |
| `signedRoute(name, params?)` | A tamper-proof URL of a named route | `URL::signedRoute()` | proven |
| `temporarySignedRoute(name, expiresAt, params?)` | A signed URL that expires | `URL::temporarySignedRoute()` | proven |
| `encrypt(value, options?)` / `decrypt(payload, options?)` | An encrypted string / the original value | `encrypt()` / `decrypt()` | proven |
| `Str`, `Num`, `retry`, `rescue`, `once`, `Pipeline`, `Benchmark`, `Sleep`, `Timebox`, `Lottery` | Everyday utilities | the same names (`Number` is `Num`) | coming in 0.2 |
| `Concurrency`, `Process` | Run work in parallel; run other programs | the same names | coming in 0.3 |

## `config()`: typed settings

```ts
config('app.name')   // string
config('app.debug')  // boolean
config('app.env')    // 'local' | 'testing' | 'production'
config('app.nmae')   // compile error: there is no such key
```

The key is a **dot path**: the first part is the file name in `config/`, the rest is the path inside it. The return type comes from that file, so `config('app.debug')` is a `boolean`, never "anything". Config is **frozen** after boot: you read it, you don't change it. See [Configuration](../configuration/).

## `route()`: URLs from names

```ts
route('posts.index')                                   // '/api/posts'
route('posts.show', { post })                          // '/api/posts/hello-world' (the post's slug)
route('posts.show', { post: 'hello-world' })           // a plain string or number works too
route('posts.index', {}, { query: { page: 2 } })       // '/api/posts?page=2'
route('posts.index', { page: 2 })                      // '/api/posts?page=2' (extra params become the query)
route('posts.show', { post }, { absolute: true })      // 'http://localhost:3000/api/posts/hello-world'
route('posts.shwo', { post })                          // compile error: no such route
route('posts.show')                                    // compile error: {post} is missing
```

Pass a model and Strutvane uses the field the route binds by (`{post:slug}` uses the slug). `absolute: true` prefixes `APP_URL`. Full details in [Routing](../routing/).

## `now()`: a clock you can freeze

```ts
const publishedAt = now()            // a Date from the app's clock
await post.update({ status: 'published' })
```

`now()` reads the clock bound to `ClockToken` in the container. In tests, bind a fixed clock and every timestamp is predictable:

```ts
app.container.instance(ClockToken, () => new Date('2026-11-14T10:00:00Z'))
```

Use `now()` instead of `new Date()` in app code, so tests can control time. The rate limiter and signed URLs read the same clock.

## `app()`: the current application

```ts
import { app, ConnectionToken } from '@strutvane/framework'

const db = app().container.make(ConnectionToken)
const url = app().url.route('posts.index')
```

Prefer constructor injection (`static inject`) in your own classes; `app()` is the escape hatch for places where injection isn't available. See [Service Container](../container/).

## `redirect()`: send the browser elsewhere, safely

```ts title="app/http/controllers/session.controller.ts"
import { Controller, redirect, type HttpContext } from '@strutvane/framework'

export class SessionController extends Controller {
  afterLogin(ctx: HttpContext): Response {
    // Back to where the user was going (?intended=/posts/42), or /dashboard.
    return redirect().intended(ctx, '/dashboard')
  }
}
```

| Call | Goes to | When the target is unsafe |
|---|---|---|
| `redirect().to('/posts', 303)` | One of **your own** paths (status 302 by default) | Throws: a bug in your code |
| `redirect().intended(ctx, '/dashboard')` | The `intended` query value, if it's a same-site path | Falls back to `/dashboard` quietly |
| `redirect().away('https://billing.example.com')` | Another site, on purpose (http or https only) | Throws for anything that isn't a full http(s) URL |

**What you'll see:** status `302` (or the one you passed) with a `Location` header.

**Why so strict?** An **open redirect** (your site sending people anywhere a link says) is a classic phishing tool. `to()` and `intended()` accept only same-site paths, and catch tricks like `//evil.com`, `/\evil.com` and `/%2F%2Fevil.com`. Leaving your site is always the explicit `away()`.

## `abort()`: stop right here

```ts
import { abort } from '@strutvane/framework'

if (post.status !== 'published') abort(404, 'No such post.')
```

`abort()` throws, so code after it never runs. The exception handler turns it into a problem+json response:

| Call | Status | `code` |
|---|---|---|
| `abort(401)` | 401 | `unauthenticated` |
| `abort(403, 'Only editors may do this.')` | 403 | `forbidden` |
| `abort(404, 'No such post.')` | 404 | `not_found` |

For other statuses, throw an `HttpError` (see [Responses](../responses/)).

## `signedRoute()` and `temporarySignedRoute()`: links nobody can change

A **signed URL** carries a signature made with your `APP_KEY`. Change any part of it (the id, the expiry) and the signature no longer matches. Use them for "unsubscribe" links, downloads, or anything you email.

```ts title="app/http/controllers/newsletter.controller.ts"
import { Controller, temporarySignedRoute, type HttpContext } from '@strutvane/framework'

export class NewsletterController extends Controller {
  unsubscribeLink(ctx: HttpContext): Response {
    const user = ctx.requireUser()
    const in24Hours = new Date(Date.now() + 24 * 60 * 60 * 1000)
    return ctx.json({ link: temporarySignedRoute('newsletter.unsubscribe', in24Hours, { user: user.id }) })
  }
}
```

Protect the target route with the `signed` middleware:

```ts title="routes/api.ts"
Route.get('/newsletter/unsubscribe/{user}', [NewsletterController, 'unsubscribe']).name('newsletter.unsubscribe').middleware('signed'),
```

**What you'll see:** the link works until it expires. A changed link answers `403 invalid_signature` ("This link is not valid. It may have been changed or copied incompletely."), an expired one `403 signature_expired` ("This link has expired. Ask for a new one."). See [Routing](../routing/).

## `encrypt()` and `decrypt()`

```ts
import { decrypt, encrypt } from '@strutvane/framework'

const sealed = encrypt({ iban: 'DE89 3704 0044 0532 0130 00' }, { purpose: 'billing' })
const original = decrypt(sealed, { purpose: 'billing' }) // unknown: check its shape before use
```

- Values are encrypted with AES-256-GCM using your `APP_KEY`; tampering is detected.
- `purpose` must match when decrypting, so a value encrypted for one job can't be replayed in another.
- After `node strut key:rotate`, the old key moves to `APP_PREVIOUS_KEYS`, so values encrypted earlier still decrypt.
- A tampered or foreign value throws `DecryptError`: "The value could not be decrypted: it was tampered with, truncated, or made with another key."

See [Encryption](../encryption/).

## How they know which app you mean

There is no global app object. Instead, Strutvane remembers "the current app" for the duration of each request and each `node strut` command, using Node's `AsyncLocalStorage` (a built-in feature that follows your code across every `await`).

```text
request arrives ──► app.handle(request) ──► [ current app = this app ] ──► middleware ──► controller ──► config() ✓
```

**Why go to this trouble?** Because one Node process can hold several apps: every test file creates its own. With a global, test A could read test B's config. With `AsyncLocalStorage`, each request only ever sees its own app.

## Outside a request: `app.run()`

Code that runs at the top level of a file (when it's imported), in a standalone script, or in a test runs **outside** any request. There's no current app there, so the helpers stop with a clear message. Wrap the code in `app.run()`:

```ts title="scripts/print-routes.ts"
import app from '../bootstrap/app.ts'
import { route } from '@strutvane/framework'

await app.boot()
const url = app.run(() => route('posts.index'))
console.log(url)
```

What you'll see:

```bash
node scripts/print-routes.ts
```

```text
/api/posts
```

In a test, `await app.run(async () => …)` works the same way and supports `await` inside. With Docker, run scripts inside the container: `node strut node scripts/print-routes.ts`.

## Coming next: the support helpers

Laravel ships a toolbox of small utilities (`Str`, `Number`, `retry`, `once`…). Strutvane's will live in `@strutvane/framework/support`, built on the platform where it can (`Intl` for numbers, native arrays rather than a Collection class).

:::caution[Coming in 0.2]
None of the helpers in this section exist yet. They're planned for 0.2 in the Laravel parity matrix; the names below are decided, while every signature and output shown is a **preview that may change**.
:::

| Helper | What it's for | Preview |
|---|---|---|
| `Str` | String helpers: slugs, case changes, limits, masking | `Str.slug('Crème brûlée, again!')` → `'creme-brulee-again'` |
| `Num` | Numbers for people, using `Intl` (your locale and currency) | `Num.currency(1234.5)` → `'$1,234.50'` |
| `retry` | Try something again a few times, waiting between tries | `await retry(3, () => callPartner(), { sleepMs: 200 })` |
| `rescue` | Run something; return a fallback (and report) if it throws | `rescue(() => parse(raw), [])` |
| `once` | Run a function only the first time; reuse the result | `const settings = once(() => loadSettings())` |
| `Pipeline` | Pass a value through a list of steps | `await Pipeline.send(order).through([validate, price, tax]).thenReturn()` |
| `Benchmark` | Measure how long code takes | `await Benchmark.measure(() => report.build())` → milliseconds |
| `Sleep` | Wait, in a way tests can fake | `await Sleep.for(2).seconds()`; in tests `Sleep.fake()` returns at once |
| `Timebox` | Make a function always take the same time | protects sign-in from timing attacks: an unknown email takes as long as a wrong password |
| `Lottery` | Do something only sometimes | `Lottery.odds(1, 100).winner(() => cleanUpOldFiles()).choose()` |

### Small: a slug and a price

```ts
import { Num, Str } from '@strutvane/framework/support'

Str.slug('Hello World')     // → 'hello-world'
Num.currency(19.9, 'EUR')    // → '€19.90' (depends on the locale)
```

### Typical: calling a flaky partner API

```ts title="app/services/exchange-rates.ts"
import { retry } from '@strutvane/framework/support'
import { safeFetch } from '@strutvane/framework/security'

export async function euroRate(): Promise<number> {
  const response = await retry(3, () => safeFetch('https://rates.example.com/eur'), { sleepMs: 500 })
  return Number(JSON.parse(response.text()).rate)
}
```

### Advanced: constant-time sign-in

```ts
import { Timebox } from '@strutvane/framework/support'

// Every attempt takes at least 300 ms, so the response time can't reveal whether the email exists.
const user = await Timebox.call(300, async () => findAndCheck(email, password))
```

## Coming in 0.3: work in parallel and run programs

:::caution[Coming in 0.3]
Planned for phase 2 (0.3) in the parity matrix. Each has its own page.
:::

- **`Concurrency.run([...])`** runs several independent, CPU-heavy tasks on other threads or processes and returns all results, with a "sync" driver for tests (Laravel's `Concurrency::run`). For several database or HTTP calls at once, plain `Promise.all()` already works today. See [Concurrency](../concurrency/).
- **`Process.run()`** runs another program **without a shell** (so nothing in an argument can become a second command), with time limits, pools, pipes and a fake for tests (Laravel's `Process`). See [Processes](../processes/).

## What about collections?

Laravel's `Collection` class isn't copied. Query results are ordinary arrays, so `map`, `filter`, `reduce` and `Object.groupBy` already work, and the ORM adds a few typed helpers (`pluck`, `keyBy`, `groupBy`, `chunk`) plus `cursor()` / `lazy()` for streaming big tables. See [ORM: Collections](../orm-collections/).

## Common mistakes

### "… was called outside a request or console command"

```text
✖ route() was called outside a request or console command, so there is no current app.
→ Call it from a controller, middleware or command, or wrap the code in app.run(() => …) (tests: await app.run(async () => …)).
```

**Why:** the helper ran when no request or command was active, for example in a constant at the top of a file:

```ts
const POSTS_URL = route('posts.index')   // runs on import: too early
```

**Fix:** compute it inside a function that runs during a request, or use `app.run()`:

```ts
function postsUrl(): string {
  return route('posts.index')
}
```

### "There is no config value at …"

```text
✖ There is no config value at "app.nmae".
→ Check the key against the files in config/; the first segment is the file name (for example "app.name" reads config/app.ts).
```

**Why:** a key built at runtime (from a variable) skipped the compile-time check, and it doesn't exist.

**Fix:** use a literal key so TypeScript checks it, or fix the spelling.

### "No route is named …"

```text
✖ No route is named "post.show".
→ Did you mean "posts.show"?
```

**Fix:** use the suggested name, or run `node strut route:list` to see every name.

### "redirect().to() was given …, which is not a same-origin path"

```text
✖ redirect().to() was given "https://partner.example/page", which is not a same-origin path.
→ Use redirect().away(url) for a deliberate external redirect.
```

**Why:** `to()` only goes to your own paths.
**Fix:** `redirect().away('https://partner.example/page')` when leaving your site is intended.

### My test's timestamps are different every run

**Why:** the code uses `new Date()` instead of `now()`, so it ignores the test's frozen clock.
**Fix:** use `now()` in app code, and bind `ClockToken` in the test.

## Next steps

- [Facades](../facades/): typed static accessors, coming next.
- [Configuration](../configuration/): the files `config()` reads.
- [Routing](../routing/): naming routes for `route()`, and signed routes.
- [Service Container](../container/): what `app().container` holds.
