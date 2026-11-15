---
title: "Mocking"
description: "Replace slow or outside services in tests: swap anything in the container, freeze and travel in time, fake outgoing HTTP calls and block stray ones, fake mail, queues, events, notifications, storage and processes, and check what your code tried to do."
---

Some things your code does shouldn't really happen in a test: sending mail to a customer, charging a card, calling a partner's API, waiting a week for a link to expire. **Mocking** means swapping the real thing for a stand-in during the test. A **fake** is a stand-in that records what your code asked of it, so you can check it afterwards: "a welcome mail was sent to Asha", "nothing called the internet".

Strutvane is built for this: services come from the app's **container** (a registry of the app's services), so a test can replace any of them for **that test's app only**, without touching global state.

:::tip[Coming from Laravel?]
Laravel's fakes keep their names: `Mail::fake()` → `Mail.fake()`, `Http::fake()` → `Http.fake()`, `Http::preventStrayRequests()` → `Http.preventStrayRequests()`, `Queue::fake()`, `Event::fake()`, `Notification::fake()`, `Storage::fake()`, `Process::fake()`, and `$this->travelTo()` / `$this->freezeTime()` → `travelTo()` / `freezeTime()`. `actingAs(user)` and `withToken(token)` sign requests in, see [HTTP Tests](../http-tests/). `$this->app->instance(...)` → `app.container.instance(...)`. Every fake belongs to the decided accessor list (`Mail`, `Queue`, `Event`, `Bus`, `Notification`, `Storage`, `Http`, …).

What's different: fakes live in the **current app's** container, not in a global, so two tests running at the same time never share a fake.
:::

:::caution[What exists, and when]
- **Proven in a prototype:** replacing any container service with `app.container.instance(token, value)`, including the clock (`ClockToken`) that `now()` reads (spike 12); injecting a DNS resolver into the SSRF-safe HTTP client (spike 12's SSRF tests); a manual clock in the auth engine (spike 20).
- **Coming in 0.2:** the typed accessors and their fakes for mail and outgoing HTTP (`Mail.fake()`, `Http.fake()`, `Http.preventStrayRequests()`), and time travel (`travelTo()`, `freezeTime()`).
- **Coming in 0.3:** fakes for queues, events, notifications, storage and processes, with the features they fake.

**Planned API (a sketch: names may change).** Fake and assertion names follow Laravel, as the parity checklist asks. Only the container and clock examples run in a prototype today.
:::

## The smallest example: freeze the clock

Everything in the app that asks "what time is it?" through `now()` reads the **clock** service. Replace it, and time stands still:

```ts title="tests/feature/report-date.test.ts"
import { ClockToken } from '@strutvane/framework'
import { client } from '@strutvane/framework/testing'
import { expect, it } from 'vitest'

it('stamps the report with today', async () => {
  app.container.instance(ClockToken, () => new Date('2026-11-15T10:00:00Z'))

  const response = await client(app).withToken(demoTokens.alice).postJson('/api/reports', {})
  expect(response.path('data.generated_at')).toBe('2026-11-15T10:00:00.000Z')
})
```

**What you'll see:**

```text
 ✓ tests/feature/report-date.test.ts (1 test) 9ms
```

The test is now the same tomorrow as today. Use `now()` instead of `new Date()` in app code so the clock can be swapped.

## Swapping any service

Everything registered in the container can be replaced with `app.container.instance(token, value)`, before the code that uses it runs:

```ts title="tests/feature/exchange-rate.test.ts"
import { it, expect } from 'vitest'
import { client } from '@strutvane/framework/testing'
import { RatesToken, type Rates } from '../../app/services/rates.ts'

it('converts with the partner rate', async () => {
  const fixedRates: Rates = { rate: async () => 1.08 }   // a hand-written stand-in
  app.container.instance(RatesToken, fixedRates)

  const response = await client(app).getJson('/api/prices/42?currency=USD')
  response.assertStatus(200).assertJsonPath('data.price', '108.00')
})
```

This works because your controller asks the container for `RatesToken` (with `static inject`) instead of creating the service itself. That's the main reason Strutvane uses injection: **anything injected can be swapped in a test**. See [Service Container](../container/).

| Container method | Use in tests for |
|---|---|
| `instance(token, value)` | "use exactly this object" (the usual choice) |
| `singleton(token, factory)` | "build it once, lazily" |
| `bind(token, factory)` | "build a new one every time" |
| `has(token)` | checking whether something is registered |

## Time travel

:::caution[Coming in 0.2]
**Planned API (a sketch).** `travelTo()` and `freezeTime()` are named in the parity checklist; they'll set the app's clock for you.
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
  ;(await client(app).get(link)).assertProblem(403, 'signature_expired')
})
```

## Outgoing HTTP calls

Your code may call other services: a payment provider, an exchange-rate API, a webhook. In tests, those calls must **never reach the internet**: they'd be slow, flaky, and could change real data.

:::caution[Coming in 0.2]
**Planned API (a sketch).** `Http.fake()` and `Http.preventStrayRequests()` are in the parity checklist for 0.2, on top of the SSRF-safe client proven in spike 12.
:::

```ts title="tests/feature/rates.test.ts"
import { Http } from '@strutvane/framework'
import { client } from '@strutvane/framework/testing'
import { it } from 'vitest'

it('reads the rate from the partner', async () => {
  await app.run(async () => {
    Http.preventStrayRequests()                        // any call without a fake fails the test
    Http.fake({ 'https://rates.example.com/*': { status: 200, body: { rate: 1.08 } } })

    ;(await client(app).getJson('/api/prices/42?currency=USD')).assertJsonPath('data.price', '108.00')
    Http.assertSent((request) => request.url.startsWith('https://rates.example.com/'))
  })
})
```

**What you'll see:** the test passes without network access. If your code calls an address you didn't fake, the test fails loudly instead of quietly calling a real server, something like:

```text
StrayRequestError: GET https://api.other.example/v1 was not faked, and stray requests are prevented.
```

### Faking failures

Test what happens when the partner is down:

```ts
Http.fake({ 'https://rates.example.com/*': { status: 503, body: 'Service Unavailable' } })
;(await client(app).getJson('/api/prices/42?currency=USD')).assertProblem(502, 'upstream_unavailable')
```

The status and code your app answers are yours to choose; the point is that the test proves you handle it.

### Today: inject a resolver into `safeFetch`

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
import { Mail } from '@strutvane/framework'

await app.run(async () => {
  Mail.fake()
  await client(app).postJson('/register', { name: 'Asha', email: 'asha@example.test', password: 'a long sentence I can remember 42' })
  Mail.assertSent('WelcomeMail', (mail) => mail.to === 'asha@example.test')
  Mail.assertNothingSent()   // or this, to prove no mail went out
})
```

`Mail.fake()` is part of the 0.2 testing kit. See [Mail](../mail/).

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
await client(app).withToken(demoTokens.alice).postJson('/api/exports', {})
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

Prefer the container when you can: a swapped container service is undone automatically when the next test builds a fresh app, while `vi.spyOn` must be restored (`vi.restoreAllMocks()` in `afterEach`).

## Fakes are per app, so tests stay independent

Each test builds its own app (`createApp()` in `beforeEach`), and fakes live in that app's container. Two test files running in parallel never see each other's fakes, and a fake never leaks into the next test. This is why the accessors read the **current app** instead of a global.

## Platform and Docker differences

Fakes are plain in-process objects: they behave the same on Windows, macOS and Linux, and with or without Docker. One difference matters: in Docker mode, a test that accidentally makes a real HTTP call goes out through the container's network. `Http.preventStrayRequests()` catches that in both modes.

## Common mistakes

### "Mail.fake() was called outside a request or console command"

```text
✖ Mail.fake() was called outside a request or console command, so there is no current app.
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

### The test passes but a real email went out

**Why:** `Mail.fake()` was called in another app (an app built in `beforeAll`, while the request went to the one from `beforeEach`).
**Fix:** fake on the same app the request goes to, inside `app.run()`.

### My queued job never ran in the test

**Why:** `Queue.fake()` records jobs instead of running them, on purpose.
**Fix:** assert it was pushed, and test the job itself in its own test.

## Next steps

- [HTTP Tests](../http-tests/): request helpers and assertions.
- [Service Container](../container/): tokens, injection and swapping.
- [HTTP Client](../http-client/): the SSRF-safe client and its errors.
- [Testing](../testing/): how tests are organised and run.
