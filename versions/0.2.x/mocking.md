---
title: "Mocking"
description: "Replace slow or outside services in tests: swap anything in the container, freeze and travel in time, fake outgoing HTTP calls and block stray ones, fake mail, queues, events, notifications, storage and processes, and check what your code tried to do."
---

Some things your code does shouldn't really happen in a test: sending mail to a customer, charging a card, calling a partner's API, waiting a week for a link to expire. **Mocking** means swapping the real thing for a stand-in during the test. A **fake** is a stand-in that records what your code asked of it, so you can check it afterwards: "a welcome mail was sent to Asha", "nothing called the internet".

Strutvane is built for this: services come from the app's **container** (a registry of the app's services), so a test can replace any of them for **that test's app only**, without touching global state.

:::tip[Coming from Laravel?]
Laravel's fakes keep their names: `Http::fake()` → `Http.fake()`, `Http::preventStrayRequests()` → `Http.preventStrayRequests()`, `Http::assertSent()` → `Http.assertSent()`; later `Mail.fake()`, `Queue.fake()`, `Event.fake()`, `Notification.fake()`, `Storage.fake()`, `Process.fake()`, and `$this->travelTo()` / `$this->freezeTime()` → `travelTo()` / `freezeTime()`. `actingAs(user)` signs requests in, see [HTTP Tests](../http-tests/). `$this->app->instance(...)` → `app.container.value(...)`.

What's different: fakes live in the **current app's** container, not in a global, so two tests running at the same time never share a fake.
:::

:::caution[What exists, and when]
- **On framework `main` (0.2.0-next.0, not on npm yet):** replacing any container service with `app.container.value(token, value)`, including the clock (`ClockToken`) that `now()` reads, with `createTestClock()` to move time by hand; the `Http` facade's fakes (`Http.fake()`, `Http.preventStrayRequests()`, `Http.assertSent()` and friends); injecting a DNS resolver into `safeFetch`.
- **Coming in 0.2:** time travel helpers (`travelTo()`, `freezeTime()`).
- **Coming in 0.3:** `Mail` (the `Mail` facade throws `facade_not_available` until then), and fakes for queues, events, notifications, storage and processes, with the features they fake.

**Planned API (a sketch: names may change)** where a section says so. Fake and assertion names follow Laravel, as the parity checklist asks.
:::

## The smallest example: freeze the clock

Everything in the app that asks "what time is it?" through `now()` reads the **clock** service. Replace it before the app handles its first request, and time stands still:

```ts title="tests/feature/clock.test.ts"
import { expect, it } from 'vitest'
import { now } from '@strutvane/framework'
import { ClockToken, createTestClock } from '@strutvane/framework/core'
import app from '../../bootstrap/app.ts'

it('reads the frozen clock', async () => {
  app.container.value(ClockToken, createTestClock(Date.UTC(2026, 10, 15, 10)))
  await app.boot()

  expect(app.run(() => now().toISOString())).toBe('2026-11-15T10:00:00.000Z')
})
```

**What you'll see:**

```text
 ✓ tests/feature/clock.test.ts (1 test) 9ms
```

The test is now the same tomorrow as today. Use `now()` instead of `new Date()` in app code so the clock can be swapped. Bind the clock **before** the app boots: the URL signer and other services read it once, at boot.

## Swapping any service

Everything registered in the container can be replaced with `app.container.value(token, value)`, before the code that uses it runs:

```ts title="tests/feature/exchange-rate.test.ts"
import { expect, it } from 'vitest'
import app from '../../bootstrap/app.ts'
import { RatesToken, type Rates } from '../../app/services/rates.ts'

it('converts with the partner rate', async () => {
  const fixedRates: Rates = { rate: async () => 1.08 }   // a hand-written stand-in
  app.container.value(RatesToken, fixedRates)

  const response = await app.handle(new Request('http://localhost/api/prices/42?currency=USD'))
  expect(response.status).toBe(200)
  expect((await response.json()).data.price).toBe('108.00')
})
```

This works because your controller asks the container for `RatesToken` (with `static inject`) instead of creating the service itself. That's the main reason Strutvane uses injection: **anything injected can be swapped in a test**. See [Service Container](../container/).

| Container method | Use in tests for |
|---|---|
| `value(token, value)` | "use exactly this object" (the usual choice) |
| `singleton(token, factory)` | "build it once, lazily" |
| `bind(token, factory)` | "build a new one every time" |
| `has(token)` | checking whether something is registered |

A `singleton()` that something already used can't be replaced any more (`Cannot rebind "Rates": it was already resolved…`): swap it before the first request.

## Time travel

:::caution[Coming in 0.2]
**Planned API (a sketch).** `travelTo()` and `freezeTime()` are named in the parity checklist; they'll set the app's clock for you. Today, bind a `createTestClock()` and move it yourself: `clock.advance(61 * 60_000)` or `clock.set(Date.UTC(2026, 11, 1))`.
:::

```ts
import { freezeTime, travel, travelTo } from '@strutvane/framework/testing'

freezeTime(app)                                         // now() stops at the current moment
travelTo(app, new Date('2026-12-01T00:00:00Z'))         // jump to a date
travel(app, { minutes: 61 })                            // move forward: an hour-long link is now expired
```

A typical use is expiry:

```ts
it('expires a temporary download link after 10 minutes', async () => {
  freezeTime(app)
  const link = await app.run(() => url.temporarySignedRoute('downloads.show', new Date(Date.now() + 10 * 60_000), { file }))
  travel(app, { minutes: 11 })
  ;(await testClient(app).get(link)).assertProblem(403, 'signature_expired')
})
```

## Outgoing HTTP calls

Your code may call other services: a payment provider, an exchange-rate API, a webhook. In tests, those calls must **never reach the internet**: they'd be slow, flaky, and could change real data.

`Http.fake()` makes the app's HTTP client (the one behind the `Http` facade) answer from your stubs; `Http.preventStrayRequests()` makes any request without a stub fail. Both change the client in **this app's** container, so they also apply to requests your test sends with `app.handle()`:

```ts title="tests/feature/rates.test.ts"
import { expect, it } from 'vitest'
import { Http } from '@strutvane/framework/facades'
import app from '../../bootstrap/app.ts'

it('reads the rate from the partner', async () => {
  await app.run(async () => {
    Http.preventStrayRequests()                        // any call without a fake fails
    Http.fake({ 'https://rates.example.com/*': { status: 200, body: { rate: 1.08 } } })

    const response = await app.handle(new Request('http://localhost/api/prices/42?currency=USD'))
    expect((await response.json()).data.price).toBe('108.00')
    Http.assertSent((request) => request.url.startsWith('https://rates.example.com/'))
  })
})
```

The facades need a current app, so the fake and the assertions run inside `app.run()`. A stub is `{ status?, body?, headers? }` (a string or bytes as is, anything else as JSON); a function `(request) => stub` can answer per request. `Http.recorded()`, `assertNotSent()`, `assertNothingSent()` and `assertSentCount(n)` check what was sent.

**What you'll see:** the test passes without network access. If your code calls an address you didn't fake, the call throws instead of quietly reaching a real server:

```text
HttpClientError: GET https://api.other.example/v1 has no fake, and stray requests are prevented.
```

Its `code` is `stray_request`.

### Faking failures

Test what happens when the partner is down:

```ts
Http.fake({ 'https://rates.example.com/*': { status: 503, body: 'Service Unavailable' } })
const response = await app.handle(new Request('http://localhost/api/prices/42?currency=USD'))
expect(response.status).toBe(502)   // whatever your controller answers when the partner is down
```

The status and code your app answers are yours to choose; the point is that the test proves you handle it.

### Injecting a resolver into `safeFetch`

The SSRF-safe client (`safeFetch`) already takes a `resolver` for tests, so you can prove your code refuses internal addresses without a real DNS lookup:

```ts
import { HttpClientError, safeFetch } from '@strutvane/framework'
import { expect, it } from 'vitest'

it('refuses a webhook URL that points at the cloud metadata service', async () => {
  const resolver = async () => ['169.254.169.254']   // the name "resolves" to a metadata address
  await expect(safeFetch('https://hooks.example.com/x', { resolver })).rejects.toMatchObject({ code: 'ssrf_blocked' })
})
```

`ssrf_blocked` means nothing was sent at all. See [HTTP Client](../http-client/).

## Mail

```ts
import { Mail } from '@strutvane/framework/facades'

await app.run(async () => {
  Mail.fake()
  await testClient(app).postJson('/register', { name: 'Asha', email: 'asha@example.test', password: 'a long sentence I can remember 42' })
  Mail.assertSent('WelcomeMail', (mail) => mail.to === 'asha@example.test')
  Mail.assertNothingSent()   // or this, to prove no mail went out
})
```

:::caution[Coming in 0.3]
**Planned API (a sketch).** Mail arrives in 0.3; until then every `Mail` member, `fake()` included, throws `facade_not_available`. See [Mail](../mail/).
:::

## Queues, events, notifications, storage and processes

These fakes arrive with their features in 0.3. They all work the same way: call `.fake()`, run your code, then assert.

| Fake | Asserts (Laravel's names) | Page |
|---|---|---|
| `Queue.fake()` | `assertPushed(Job)`, `assertNotPushed(Job)`, `assertNothingPushed()` | [Queues](../queues/) |
| `Event.fake()` | `assertEmitted('post.published')`, `assertNotEmitted(…)` | [Events](../events/) |
| `Notification.fake()` | `assertSentTo(user, Notification)`, `assertNotSentTo(…)` | [Notifications](../notifications/) |
| `Storage.fake('local')` | a temporary disk; check files with `exists()` | [File Storage](../storage/) |
| `Process.fake({...})` | `assertRan([...])` | [Processes](../processes/) |

```ts
Queue.fake()
await testClient(app).actingAs(alice).postJson('/api/exports', {})
Queue.assertPushed(ExportPosts)
```

Faking a queue means jobs are **recorded, not run**. Test the job itself separately, by calling it directly.

## Plain functions: Vitest's own mocks

For your own modules that aren't in the container, Vitest's `vi.fn()` and `vi.spyOn()` work as usual:

```ts
import { vi } from 'vitest'
import * as slugs from '../../app/support/slugs.ts'

vi.spyOn(slugs, 'randomSuffix').mockReturnValue('ab12')
```

Prefer the container when you can: the swap belongs to one app and is easy to see in the test. `vi.spyOn` must be restored (`vi.restoreAllMocks()` in `afterEach`).

## Fakes are per app, so tests stay independent

Fakes live in an app's container. Vitest runs each test file in its own worker, so two files running in parallel never see each other's fakes. Inside one file, `bootstrap/app.ts` is one app shared by its tests: undo a fake when a test is done (`Http.fake()` stays on; bind the real service back, or build a separate app with `Application.configure()` for that test). This is why the accessors read the **current app** instead of a global.

## Platform and Docker differences

Fakes are plain in-process objects: they behave the same on Windows, macOS and Linux, and with or without Docker. One difference matters: in Docker mode, a test that accidentally makes a real HTTP call goes out through the container's network. `Http.preventStrayRequests()` catches that in both modes.

## Common mistakes

### "Http.fake() was called outside a request or console command"

```text
Http.fake() was called outside a request or console command, so there is no current app.
→ Call it from a controller, middleware or command, or wrap the code in app.run(() => …) (tests: await app.run(async () => …)).
```

**Why:** accessors read the current app, and test code runs outside one.
**Fix:** wrap the test body in `await app.run(async () => { … })`.

### My swapped service isn't used

**Why:** the code created the service itself (`new RatesClient()`) instead of asking the container, or the swap happened after the service was already built and cached as a singleton.
**Fix:** inject it with `static inject = [RatesToken]`, and swap it before the first request in the test.

### Time-based tests fail around midnight

**Why:** the code uses `new Date()` instead of `now()`, so freezing the clock has no effect.
**Fix:** use `now()` in app code, and freeze the clock in the test.

### The test passes but a real call went out

**Why:** the fake was set on another app than the one the request went to (for example an app built with `Application.configure()` in the test, while the request went to `bootstrap/app.ts`).
**Fix:** fake on the same app the request goes to, inside `app.run()`.

### My queued job never ran in the test

**Why:** `Queue.fake()` records jobs instead of running them, on purpose.
**Fix:** assert it was pushed, and test the job itself in its own test.

## Next steps

- [HTTP Tests](../http-tests/): request helpers and assertions.
- [Service Container](../container/): tokens, injection and swapping.
- [HTTP Client](../http-client/): the SSRF-safe client, its fakes and its errors.
- [Testing](../testing/): how tests are organised and run.
