---
title: HTTP Client
description: Call other servers from your app safely with the `Http` client and `safeFetch`, which block requests to your private network (SSRF), pin DNS, re-check redirects, and enforce time and size limits. Every option, every error, and fakes for tests.
---

Your app often needs to call **other servers**: a payment provider, a currency-rate API, a customer's webhook URL, an image someone pasted a link to. Strutvane's HTTP client makes those calls with safety checks a plain `fetch()` doesn't have.

The most important one: it refuses to call **your own private network**. When a URL comes from a user (a webhook address, an "import from URL" field), an attacker could type `http://169.254.169.254/` (the cloud's secret metadata service) or `http://localhost:6379/` (your Redis) and make **your server** fetch it for them. That attack is called **SSRF** (server-side request forgery). The client blocks it.

:::tip[Coming from Laravel?]
`Http::get()` becomes `Http.get()`, `Http::withToken()` becomes `Http.withToken()`, and `Http::fake()` / `Http::preventStrayRequests()` work as you know them. The difference: the SSRF guard is built in and always on, so you allow internal addresses explicitly instead of blocking them yourself. Retries and pools aren't there yet (planned).
:::

:::caution[What exists, and when]
The `Http` facade, the `HttpClient` class, `safeFetch()` and fakes ship in `@strutvane/framework` 0.2.0-next.0 (not published to npm yet). Retries, pools, client middleware and webhook signatures are planned.
:::

## The smallest example

```ts title="app/services/exchange-rates.ts"
import { Http } from '@strutvane/framework/facades'

export async function euroRate(): Promise<number> {
  const response = await Http.acceptJson().get('https://rates.example.com/latest', { base: 'EUR' })
  if (!response.ok) throw new Error(`Rates answered ${response.status}`)
  const body = response.json() as { rate: number }
  return body.rate
}
```

**What you'll see:** `1.08` (or whatever the service answers). The response is already read in full (up to the size limit), so `response.json()`, `response.text()` and `response.body` are ready.

`Http` resolves the app's client from the container, so it works inside a request, a command or `app.run()`. In code that has no app, use `new HttpClient()` (from `@strutvane/framework`) or `safeFetch()` directly; both have the same guard.

## What you get back

| Field | Type | Means |
|---|---|---|
| `status` | `number` | The HTTP status, such as `200` |
| `ok` | `boolean` | `true` for a 2xx status |
| `headers` | `Headers` | The response headers (`response.headers.get('content-type')`) |
| `url` | `string` | The final URL, after redirects |
| `body` | `Buffer` | The raw bytes |
| `text()` | `string` | The body as UTF-8 text |
| `json()` | `unknown` | The body parsed as JSON, with the same prototype-pollution guard as request bodies; validate it |

A `4xx` or `5xx` answer is **not** an error: you get the response and decide. Errors are only for things that stopped the call (see below).

## Sending data

```ts title="app/services/webhooks.ts"
import { Http } from '@strutvane/framework/facades'

export async function notifyPartner(url: string, event: { type: string; id: number }): Promise<number> {
  const response = await Http.withToken('partner-api-token').timeout(5000).post(url, event)
  return response.status
}
```

**What you'll see:** the partner's status code, such as `200` or `204`. An object is sent as JSON (`content-type: application/json`); a string as text; bytes as `application/octet-stream`. `asForm()` sends an object as `application/x-www-form-urlencoded` instead.

## Every request option

Each method returns a new pending request, so options chain and never leak into the next call:

| Method | Default | Means |
|---|---|---|
| `withHeaders({ … })` | `{}` | Request headers (a line break in a value is refused) |
| `withToken(token, type?)` | — | `Authorization: Bearer <token>` (or another `type`) |
| `acceptJson()` | — | `Accept: application/json` |
| `asForm()` | — | Send objects as a URL-encoded form |
| `timeout(ms)` | `10000` (10 s) | The time for the **whole** exchange, every redirect included (at most 10 minutes) |
| `maxBytes(bytes)` | 5 MiB | The largest response body read; more is an error, and reading stops at once (at most 1 GiB) |
| `maxRedirects(count)` | `3` | Redirects followed (0 to 20); each one is checked like the first |
| `allow([…])` | `[]` | Private ranges or host names you deliberately allow (an internal service) |

Then send with `get(url, query?)`, `head(url, query?)`, `post(url, data?)`, `put(url, data?)`, `patch(url, data?)` or `delete(url, data?)`. `query` is an object whose values are appended to the URL.

### `safeFetch()`: the building block

`safeFetch()` is what the client uses underneath. Use it when you want `fetch`-style options in one call:

```ts title="app/services/link-preview.ts"
import { safeFetch } from '@strutvane/framework'

const response = await safeFetch('https://example.com/feed.json', {
  method: 'GET',
  headers: { accept: 'application/json' },
  timeoutMs: 3000,
  maxBytes: 512 * 1024,
  maxRedirects: 3,
  allow: [],
})
```

Its options are `method`, `headers`, `body` (a string or bytes), `timeoutMs`, `maxBytes`, `maxRedirects`, `allow` and `resolver` (tests can pass their own DNS lookup).

## What the guard blocks

Before connecting, the client looks up the host name **once**, checks **every** address it resolves to, then connects to the address it checked. It refuses:

| Range | Example | Why |
|---|---|---|
| Loopback | `127.0.0.1`, `::1`, `localhost`, `*.localhost` | Your own server's private services |
| Private networks | `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `fc00::/7` | Your internal network |
| Link-local and cloud metadata | `169.254.169.254`, `100.100.100.200`, `fd00:ec2::254` | The cloud's credentials service |
| Other special ranges | carrier-grade NAT, documentation, benchmarking, multicast, reserved, IPv4 hidden inside IPv6 | Never a real public server |

It also refuses URLs that aren't `http` or `https`, and URLs with a user name or password in them.

**Tricks it handles:**

- **Odd spellings of an address:** `http://2130706433/` and `http://0177.0.0.1/` are both `127.0.0.1`, and are blocked.
- **DNS rebinding:** a host name that resolves to a public address when checked and to `127.0.0.1` a moment later. The client connects to the **checked** address itself, so a second lookup can't change it. TLS still uses the real host name, so certificates are checked as usual.
- **Redirects into your network:** a public URL that redirects to `http://localhost/` is checked again at each hop and blocked. `Authorization` and cookies are dropped when a redirect leaves the origin.
- **One bad address:** if a name resolves to one public and one private address, it's blocked: the system could pick either.

### Allowing an internal service on purpose

```ts title="app/services/inventory.ts"
import { Http } from '@strutvane/framework/facades'

const response = await Http.allow(['10.20.0.0/16']).get('http://inventory.internal:8080/stock')
```

An entry is a CIDR range (`10.20.0.0/16`) or a host name (`inventory.internal`, or `*.internal` for its subdomains). `*` alone is refused. Allow the narrowest range you can, and never for a URL a user typed.

## When a call fails

Every failure throws an `HttpClientError` (from `@strutvane/framework`) with a `code`:

| `code` | Means | Sent anything? |
|---|---|---|
| `ssrf_blocked` | The address is private or special | **No**, nothing was sent |
| `invalid_url` | Not a valid http(s) URL, or it has credentials | No |
| `invalid_header` | A header name is invalid, or a value contains a line break | No |
| `dns_failed` | The host name couldn't be resolved | No |
| `connection_failed` | The connection failed or broke | Maybe |
| `timeout` | The whole exchange took longer than the timeout | Maybe |
| `response_too_large` | The body was bigger than `maxBytes` | Yes |
| `too_many_redirects` | More than `maxRedirects` | Yes |
| `stray_request` | In a test with `preventStrayRequests()`, a request had no fake | No |

```ts title="app/services/link-preview.ts"
import { HttpClientError } from '@strutvane/framework'
import { Http } from '@strutvane/framework/facades'

export async function preview(url: string): Promise<string | undefined> {
  try {
    const response = await Http.timeout(3000).maxBytes(512 * 1024).get(url)
    return /<title>([^<]*)<\/title>/i.exec(response.text())?.[1]
  } catch (error) {
    if (error instanceof HttpClientError && error.code === 'ssrf_blocked') return undefined   // a hostile link: ignore it
    throw error
  }
}
```

**What you'll see** for `preview('http://169.254.169.254/latest/meta-data/')`: `undefined`, and nothing was sent. The error's message says why, for your logs: `169.254.169.254 resolves to 169.254.169.254, a link-local (includes cloud metadata 169.254.169.254) address, which this client never connects to.`

## Redirects

`301`, `302`, `303`, `307` and `308` are followed up to `maxRedirects`. A `303` (and a `301` or `302` after a POST) continues as a GET without a body, as browsers do. The final address is `response.url`.

## Fakes for tests

`Http.fake()` answers requests without the internet, and records them so you can assert what was sent. A fake belongs to that test's app only.

```ts title="tests/unit/exchange-rates.test.ts"
import { expect, test } from 'vitest'
import { HttpClient } from '@strutvane/framework'
import { Http } from '@strutvane/framework/facades'
import app from '../../bootstrap/app.ts'
import { euroRate } from '../../app/services/exchange-rates.ts'

test('rates are read from the partner', async () => {
  await app.boot()
  await app.run(async () => {
    Http.fake({ 'rates.example.com/*': HttpClient.response({ rate: 1.08 }) }).preventStrayRequests()

    expect(await euroRate()).toBe(1.08)
    Http.assertSent((request) => request.url.startsWith('https://rates.example.com/latest'))
  })
})
```

**What you'll see:** the test passes without calling the internet. With `preventStrayRequests()`, a request without a fake throws `stray_request` instead of reaching a real server.

- A pattern without a scheme (`rates.example.com/*`) matches host, path and query; one with a scheme (`https://rates.example.com/*`) matches the whole URL. `*` matches anything.
- A stub is `{ status?, body?, headers? }` (an object body becomes JSON), or a function of the recorded request.
- `Http.fake()` with no argument answers every request with an empty `200`.
- `recorded()`, `assertSent()`, `assertNotSent()`, `assertNothingSent()` and `assertSentCount(n)` check what was sent.

Even a faked request to a literal private address (`http://127.0.0.1/`) is refused, so a test can't hide an SSRF bug.

## Planned

:::caution[Planned]
Built on the same guard, not in 0.2.0-next.0: **retries** with a wait between tries, **pools** (several requests at once), client **middleware** (add a header or log every request in one place), and **webhook signatures** (sign what you send with an HMAC secret, and verify signatures on webhooks you receive).
:::

## Windows, macOS, Linux and Docker

- The guard works the same on every system; it uses the system's DNS resolver.
- **With Docker,** your app runs inside the `app` container, so `localhost` means the container, not your computer. Calling a service on your computer from the container needs its Docker host name, and that address is private, so it must be allowed (only in development).

## Common mistakes

### My call to `http://localhost:4000` is blocked in development

```text
HttpClientError: localhost is a loopback name.
```

**Why:** loopback is always blocked; your dev mock service is on it.
**Fix:** allow it explicitly while developing, never for user-supplied URLs:

```ts title="app/services/mock-partner.ts"
import { Http } from '@strutvane/framework/facades'

await Http.allow(['127.0.0.1/32']).get('http://127.0.0.1:4000/mock')
```

### "The response is larger than … bytes"

```text
HttpClientError: The response is larger than 5242880 bytes.
```

**Why:** the body is bigger than the limit (5 MiB by default).
**Fix:** raise it for that call with `maxBytes(…)` if you really expect big files, or stream large downloads with the storage tools.

### "The request timed out" although the server answers

**Why:** the timeout counts the **whole** exchange, redirects included.
**Fix:** raise it with `timeout(…)` for slow partners, or ask them for a direct URL.

### "… has no fake, and stray requests are prevented"

```text
HttpClientError: GET https://rates.example.com/latest?base=EUR has no fake, and stray requests are prevented.
```

**Why:** your test prevents real requests, and no fake pattern matches this URL.
**Fix:** add a pattern that matches it, such as `'rates.example.com/*'`.

### I used plain `fetch()` for a user-supplied URL

**Why:** `fetch()` has no SSRF guard, so a user could make your server read internal services.
**Fix:** use `Http` or `safeFetch()` for any URL that came from outside your code.

## Next steps

- [Security Features](../security/): the other protections.
- [Facades](../facades/): how `Http` is resolved and faked.
- [Mocking](../mocking/): fakes in tests.
