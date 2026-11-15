---
title: HTTP Client
description: Call other servers from your app safely with `safeFetch`, which blocks requests to your private network (SSRF), pins DNS, re-checks redirects, and enforces time and size limits. Every option, every error, and the `Http` client with retries and fakes coming in 0.2.
---

Your app often needs to call **other servers**: a payment provider, a currency-rate API, a customer's webhook URL, an image someone pasted a link to. Strutvane's HTTP client makes those calls with safety checks a plain `fetch()` doesn't have.

The most important one: it refuses to call **your own private network**. When a URL comes from a user (a webhook address, an "import from URL" field), an attacker could type `http://169.254.169.254/` (the cloud's secret metadata service) or `http://localhost:6379/` (your Redis) and make **your server** fetch it for them. That attack is called **SSRF** (server-side request forgery). `safeFetch` blocks it.

:::tip[Coming from Laravel?]
Laravel's `Http::get()` is a convenient client; guarding against SSRF is left to you. Strutvane's `safeFetch()` is the guarded building block, proven today. The convenient `Http` client (`Http.get()`, retries, pools, `Http.fake()`, `Http.preventStrayRequests()`) is planned for 0.2 on top of it.
:::

:::caution[Coming in 0.2]
`safeFetch` is **proven in a prototype** (spike 12: the SSRF guard, DNS pinning, redirect checks and limits, with attack-style tests). The `Http` client with retries, pools, middleware and fakes, and webhook signatures, are planned for 0.2 and not built yet.
:::

## The smallest example

```ts title="app/services/exchange-rates.ts"
import { safeFetch } from '@strutvane/framework/security'

export async function euroRate(): Promise<number> {
  const response = await safeFetch('https://rates.example.com/latest?base=EUR')
  if (response.status !== 200) throw new Error(`Rates answered ${response.status}`)
  const body = JSON.parse(response.text()) as { rate: number }
  return body.rate
}
```

**What you'll see:** `1.08` (or whatever the service answers). The response is already read in full (up to the size limit), so `response.text()` and `response.body` are ready.

## What you get back

| Field | Type | Means |
|---|---|---|
| `status` | `number` | The HTTP status, such as `200` |
| `headers` | `Headers` | The response headers (`response.headers.get('content-type')`) |
| `url` | `string` | The final URL, after redirects |
| `body` | `Buffer` | The raw bytes |
| `text()` | `string` | The body as UTF-8 text |

A `4xx` or `5xx` answer is **not** an error: you get the response and decide. Errors are only for things that stopped the call (see below).

## Sending data

```ts title="app/services/webhooks.ts"
import { safeFetch } from '@strutvane/framework/security'

export async function notifyPartner(url: string, event: { type: string; id: number }): Promise<number> {
  const response = await safeFetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(event),
    timeoutMs: 5000,
  })
  return response.status
}
```

**What you'll see:** the partner's status code, such as `200` or `204`.

## Every option

| Option | Default | Means |
|---|---|---|
| `method` | `'GET'` | The HTTP method |
| `headers` | `{}` | Request headers |
| `body` | none | A string or bytes |
| `timeoutMs` | `10000` (10 s) | The time for the **whole** exchange, every redirect included |
| `maxBytes` | 5 MiB | The largest response body read; more is an error, and reading stops at once |
| `maxRedirects` | `3` | Redirects followed; each one is checked like the first |
| `allow` | `[]` | Private ranges you deliberately allow, as CIDRs (an internal service) |
| `resolver` | the system DNS | Tests can pass their own |

## What the guard blocks

Before connecting, `safeFetch` looks up the host name **once**, checks **every** address it resolves to, then connects to the address it checked. It refuses:

| Range | Example | Why |
|---|---|---|
| Loopback | `127.0.0.1`, `::1`, `localhost` | Your own server's private services |
| Private networks | `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16` | Your internal network |
| Link-local and cloud metadata | `169.254.169.254` | The cloud's credentials service |
| Other special ranges | multicast, reserved, IPv4 hidden inside IPv6 | Never a real public server |

It also refuses URLs that aren't `http` or `https`, and URLs with a user name or password in them.

**Tricks it handles:**

- **Odd spellings of an address:** `http://2130706433/` and `http://0177.0.0.1/` are both `127.0.0.1`, and are blocked.
- **DNS rebinding:** a host name that resolves to a public address when checked and to `127.0.0.1` a moment later. The client connects to the **checked** address itself, so a second lookup can't change it. TLS still uses the real host name, so certificates are checked as usual.
- **Redirects into your network:** a public URL that redirects to `http://localhost/` is checked again at each hop and blocked.
- **One bad address:** if a name resolves to one public and one private address, it's blocked: the system could pick either.

### Allowing an internal service on purpose

```ts
const response = await safeFetch('http://inventory.internal:8080/stock', { allow: ['10.20.0.0/16'] })
```

Allow the narrowest range you can, and never for a URL a user typed.

## When a call fails

Every failure throws an `HttpClientError` with a `code`:

| `code` | Means | Sent anything? |
|---|---|---|
| `SSRF_BLOCKED` | The address is private or special | **No**, nothing was sent |
| `INVALID_URL` | Not a valid http(s) URL, or it has credentials | No |
| `DNS_FAILED` | The host name couldn't be resolved | No |
| `CONNECTION_FAILED` | The connection failed or broke | Maybe |
| `TIMEOUT` | The whole exchange took longer than `timeoutMs` | Maybe |
| `RESPONSE_TOO_LARGE` | The body was bigger than `maxBytes` | Yes |
| `TOO_MANY_REDIRECTS` | More than `maxRedirects` | Yes |

```ts title="app/services/link-preview.ts"
import { HttpClientError, safeFetch } from '@strutvane/framework/security'

export async function preview(url: string): Promise<string | undefined> {
  try {
    const response = await safeFetch(url, { timeoutMs: 3000, maxBytes: 512 * 1024 })
    return /<title>([^<]*)<\/title>/i.exec(response.text())?.[1]
  } catch (error) {
    if (error instanceof HttpClientError && error.code === 'SSRF_BLOCKED') return undefined   // a hostile link: ignore it
    throw error
  }
}
```

**What you'll see** for `preview('http://169.254.169.254/latest/meta-data/')`: `undefined`, and nothing was sent. The error's message says why, for your logs: `169.254.169.254 resolves to 169.254.169.254, a link-local (includes cloud metadata 169.254.169.254) address, which this client never connects to.`

## Redirects

`301`, `302`, `303`, `307` and `308` are followed up to `maxRedirects`. A `303` (and a `301` or `302` after a POST) continues as a GET without a body, as browsers do. The final address is `response.url`.

## Coming in 0.2: the `Http` client

:::caution[Coming in 0.2]
Planned in the Laravel parity matrix, built on `safeFetch` so the SSRF guard always applies. A preview; names may change.
:::

```ts
import { Http } from '@strutvane/framework'

const rate = await Http.timeout(5).retry(3, 200).get('https://rates.example.com/latest').json()
const [a, b] = await Http.pool((pool) => [pool.get('https://a.example.com'), pool.get('https://b.example.com')])
```

- **Retries** with a wait between tries, only for failures worth retrying.
- **Pools:** several requests at once.
- **Middleware:** add a header or log every request in one place.
- **Fakes for tests:** `Http.fake({ 'https://rates.example.com/*': { status: 200, body: { rate: 1.08 } } })` answers without the internet, and `Http.preventStrayRequests()` fails any request you didn't fake, so a test never calls a real server by accident.
- **Webhook signatures:** sign what you send with an HMAC secret, and verify signatures on webhooks you receive.

See [Facades](../facades/) for how `Http` is resolved and faked.

## Windows, macOS, Linux and Docker

- The guard works the same on every system; it uses the system's DNS resolver.
- **With Docker,** your app runs inside the `app` container, so `localhost` means the container, not your computer. Calling a service on your computer from the container needs its Docker host name, and that address is private, so it must be in `allow` (only in development).

## Common mistakes

### My call to `http://localhost:4000` is blocked in development

```text
HttpClientError [SSRF_BLOCKED]: localhost is a loopback name.
```

**Why:** loopback is always blocked; your dev mock service is on it.
**Fix:** allow it explicitly while developing, never for user-supplied URLs:

```ts
await safeFetch('http://127.0.0.1:4000/mock', { allow: ['127.0.0.1/32'] })
```

### "The response is larger than … bytes"

**Why:** the body is bigger than `maxBytes` (5 MiB by default).
**Fix:** raise `maxBytes` for that call if you really expect big files, or stream large downloads with the storage tools.

### The call times out although the server answers

**Why:** `timeoutMs` counts the **whole** exchange, redirects included.
**Fix:** raise `timeoutMs` for slow partners, or ask them for a direct URL.

### I used plain `fetch()` for a user-supplied URL

**Why:** `fetch()` has no SSRF guard, so a user could make your server read internal services.
**Fix:** use `safeFetch()` for any URL that came from outside your code.

## Next steps

- [Security Features](../security/): the other protections.
- [Helpers](../helpers/): `retry` and friends, coming next.
- [Mocking](../mocking/): fakes in tests.
