---
title: Security Features
description: Every protection Strutvane turns on by default, how to adjust each one in bootstrap/app.ts, the security commands (key:rotate, env:encrypt, session:flush, security:check), and which parts ship in @strutvane/framework 0.2.0-next.0 versus later.
---

Strutvane's security rule is short: **safe without doing anything, and adjustable in whichever style you like.** Every protection on this page is on by default. You can apply or skip each one per route, group or controller, or call it as a plain function, and every opt-out is written down where `node strut route:list --security` shows it.

This page is the map. Each protection has a short explanation, a small example, and its **status**: shipped in `@strutvane/framework` 0.2.0-next.0, shipped by another package, or still planned.

:::tip[Coming from Laravel?]
Most of this is what Laravel gives you, with the same names where Laravel has one: `trustProxies()`, `trustHosts()`, `validateCsrfTokens()`, `throttle` with named limiters, signed URLs, `encrypt()`, `key:generate`, `env:encrypt`. The differences:
- security headers (a CSP with nonces, HSTS, `frame-ancestors 'none'`) are **on by default**, not a package;
- trusted hosts are on by default too, in every environment;
- CORS is **off** until you list origins, and `*` with credentials stops the app from starting;
- a `security:check` command reviews your configuration before you deploy.
:::

:::caution[What exists, and when]
The framework protections below are on `@strutvane/framework` `main` as **0.2.0-next.0**, with attack-style tests. That version isn't published to npm yet. Rows marked **auth package** come with `@strutvane/auth` (in development), and rows marked **planned** aren't built yet.
:::

## The smallest example (nothing to do)

A new app is protected the moment it starts. Ask it for a page and look at the headers:

```bash
curl -I http://localhost:3000/up
```

**What you'll see** (something like this; the nonce changes on every response):

```text
HTTP/1.1 200 OK
content-security-policy: default-src 'self'; script-src 'self' 'nonce-Zm9vYmFyYmF6cXV4'; style-src 'self' 'nonce-Zm9vYmFyYmF6cXV4'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; report-uri /_strutvane/csp-report
x-content-type-options: nosniff
referrer-policy: strict-origin-when-cross-origin
permissions-policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()
cross-origin-opener-policy: same-origin
cross-origin-resource-policy: same-origin
x-frame-options: DENY
```

HSTS (`strict-transport-security`) is added only when `APP_ENV=production` **and** the request came over HTTPS, because browsers ignore it over plain HTTP and it would pin `localhost` to HTTPS during development. In production the CSP also gets `upgrade-insecure-requests`.

`/up` is the health route every app has. It answers `200 {"status":"ok"}`, and stays reachable during [maintenance mode](../maintenance-mode/), so a load balancer doesn't take a healthy server out of rotation. Choose another path with `withRouting({ health: '/healthz' })`.

:::caution[Coming in 0.3]
A readiness route, `/ready`, arrives in 0.3 with the health-check registry. `/up` only says the process is alive; `/ready` will also check the database, the cache and the queue.
:::

## Where you adjust things

Settings that change a protection live in one place: `withMiddleware()` in `bootstrap/app.ts`, like Laravel 11.

```ts title="bootstrap/app.ts"
import { dirname } from 'node:path'
import { Application } from '@strutvane/framework'
import { config } from '../config/index.ts'
import api from '../routes/api.ts'
import web from '../routes/web.ts'
import { providers } from './providers.ts'

export default Application.configure({ basePath: dirname(import.meta.dirname) })
  .withConfig(config)
  .withProviders(providers)
  .withRouting({ web, api })
  .withMiddleware((middleware) => {
    // Patterns match the full path, so API routes need the `api/` prefix.
    middleware.validateCsrfTokens({ except: ['api/webhooks/*'] })
    middleware.trustProxies({ at: ['10.0.0.0/8'] })
    middleware.trustHosts({ at: ['blog.example.com'], subdomains: true })
    middleware.cors({ origins: ['https://app.example.com'], credentials: true })
    middleware.securityHeaders({ csp: { 'img-src': ['https://images.example.com'] } })
    middleware.limits({ maxBytes: 5 * 1024 * 1024 })
    middleware.requestTimeout(10_000)
    middleware.rateLimiter('login', { maxAttempts: 5, decaySeconds: 60 })
  })
  .create()
```

**What you'll see:** nothing, if every value is valid. If any setting is unsafe or invalid, the app refuses to start (`node strut start` exits with code 3) and lists **every** problem at once:

```text
error The app can't start: 2 security settings are unsafe or invalid.
  - cors: origins "*" can't be combined with credentials: true. List the exact origins that may send cookies.
  - trustProxy: "*" is not an IP address or CIDR range (to trust a load balancer, list its address or subnet, never "*").
  → Fix them where the app configures security (bootstrap/app.ts, withMiddleware). Each line says what is wrong and what is allowed.
```

Calls add up: a package's provider and your app can both add CSRF exceptions, trusted proxies or trusted hosts.

## Every protection

| Area | Protection (on by default) | Status |
|---|---|---|
| Requests | CSRF on every cookie-authenticated write (419 `csrf_token_mismatch`) | 0.2.0-next.0 |
| Requests | Trusted hosts: a `Host` header allowlist (400 `untrusted_host`), in every environment | 0.2.0-next.0 |
| Requests | Trusted proxies: `X-Forwarded-*` only from listed proxies | 0.2.0-next.0 |
| Requests | Body size, JSON depth and JSON key-count limits; prototype-pollution-safe JSON | 0.2.0-next.0 |
| Requests | Request timeout: 30 s by default, then a 503 `service_unavailable` | 0.2.0-next.0 |
| Responses | CSP with a fresh nonce per response, HSTS (production over HTTPS), `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP/CORP, `frame-ancestors 'none'`, CSP violation reports logged as warnings | 0.2.0-next.0 |
| CORS | Off by default; an exact allowlist; never `*` with credentials | 0.2.0-next.0 |
| Sessions and cookies | One session-cookie name (`strutvane_session`, `__Host-` prefix on HTTPS) shared by CSRF and the session layer; the file session store; `session:flush` | 0.2.0-next.0 |
| Sessions and cookies | New session id on sign-in, idle and absolute timeouts, "sign out other sessions" | auth package |
| Rate limiting | `throttle` with named limiters (`api`, `login`, `password-reset`, `aggregate`), per-user or per-IP (IPv6 per /64) keys, `Retry-After` | 0.2.0-next.0 (fixed window, counted in the default cache store) |
| Rate limiting | Lockout with backoff on sign-in and 2FA | auth package |
| Validation | Unknown fields rejected; writes only through `fillable`; secret columns refused in `fillable` unless allowed | 0.2.0-next.0 |
| Validation | Zod schemas generated from migrations; ReDoS-safe rules | planned |
| Passwords | NIST rules and a breached-password check; hashing | auth package (the framework's `Hash` facade arrives in 0.3) |
| Authorization | Deny by default; policies; the `can` middleware and `defineAbility()` | 0.2.0-next.0 |
| Tenancy | The ORM tenant scope, plus PostgreSQL row-level security created by migrations | 0.2.0-next.0 |
| Data | Parameterised SQL only (the `` sql`…` `` tag binds every value) | 0.2.0-next.0 |
| Data | `encrypt()` / `decrypt()` (AES-256-GCM) with key rotation | 0.2.0-next.0 |
| Data | Encrypted casts | planned |
| Data | `.secret()` and `.hidden()` columns (and secret-looking names) never serialised, filtered, sorted or searched | 0.2.0-next.0 |
| Output | `sanitizeHtml()`; a rich-text cast that sanitises on write; CSV formula-injection guard; safe `Content-Disposition` | planned (React escaping is React's) |
| URLs and redirects | Signed and temporary signed URLs with a `purpose`, one-time links (`signed`, 403 `invalid_signature` / `signature_expired`); open-redirect guard | 0.2.0-next.0 |
| Outgoing HTTP | `safeFetch()` and the `Http` client block private, loopback and metadata addresses (SSRF guard), with timeouts and a size cap | 0.2.0-next.0 |
| Outgoing HTTP | HMAC webhook signatures | planned |
| Files | Uploads sniffed by content (magic bytes), size and type limits while streaming, random stored names | 0.2.0-next.0 (the upload parser) |
| Files | Zip-slip guard, virus-scan hook | planned |
| Secrets and logs | Secrets only in `.env`; `env:encrypt`; log redaction; one log record per line; no debug page in production; `APP_DEBUG=true` in production refuses to start | 0.2.0-next.0 |
| Abuse | Honeypot and a CAPTCHA hook for public forms | planned |
| Abuse | `idempotent` middleware for payments and imports | 0.2.0-next.0 (in-memory store; bind `IdempotencyStoreToken` for a shared one) |
| Auth | 2FA, passkeys, email-link sign-in, password confirmation, token abilities and expiry, impersonation | auth package |
| Supply chain | `npm audit` in `security:check --audit` | 0.2.0-next.0 |
| Operations | `security:check`, `session:flush`, `key:rotate`, `env:encrypt`/`env:decrypt`, maintenance-mode secret bypass | 0.2.0-next.0 |
| Operations | `token:revoke`; security events in an `audit_events` table ([Audit](../audit/)) | auth package |

The sections below explain each area.

## Requests

### CSRF

Every POST, PUT, PATCH or DELETE that rides on a session cookie must prove it came from your own pages, or it gets a **419** with the problem code `csrf_token_mismatch`. Every cross-origin refusal uses that same status and code. Bearer-token API calls without the session cookie skip the check. Every way to adjust it is on its own page: [CSRF Protection](../csrf/).

### Trusted hosts

A request whose `Host` header isn't on the allowlist is refused before any of your code runs. **Why:** anything built from the request's host (a password-reset link, a redirect) could otherwise be poisoned by `Host: evil.example`, and DNS rebinding lets a website you visit talk to your local app under its own name.

The list always holds `localhost`, `127.0.0.1`, `[::1]` and `APP_URL`'s host, in every environment. To serve more names:

```ts title="bootstrap/app.ts"
// inside .withMiddleware((middleware) => { ... })
middleware.trustHosts({ at: ['blog.example.com'], subdomains: true })
```

**What you'll see:** `blog.example.com` and `acme.blog.example.com` are answered; `evil.example` gets (something like this):

```json
{"type":"https://strutvane.dev/errors/untrusted-host","title":"Untrusted host","status":400,"code":"untrusted_host","detail":"This server does not answer for the requested host name.","traceId":"…"}
```

The status is 400, as in Laravel and Symfony. `*` alone is refused: it would trust every host.

### Trusted proxies

`X-Forwarded-For`, `X-Forwarded-Proto` and `X-Forwarded-Host` are believed **only** when the request comes straight from a proxy you listed. From anyone else they're ignored, because any client can send them to fake its IP (and dodge rate limits) or claim HTTPS.

```ts title="bootstrap/app.ts"
// inside .withMiddleware((middleware) => { ... })
// Your load balancer's subnet. There is no "trust everyone" value, on purpose.
middleware.trustProxies({ at: ['10.0.0.0/8'] })
```

**What you'll see:** behind that load balancer, `ctx.ip` is the visitor's address and HTTPS is detected. The client's address is found by reading `X-Forwarded-For` from the right and skipping your proxies, because the left-most entries are written by the client and prove nothing.

On a platform whose proxy addresses you don't know, pass a hop count instead: `middleware.trustProxies(1)`. A list is safer; giving both is refused at start-up. `headers: ['for', 'proto']` limits which `X-Forwarded-*` headers are read.

### Body limits and safe JSON

JSON bodies are capped before they're parsed:

| Limit | Default | Over the limit |
|---|---|---|
| Size | 1 MiB | `413 payload_too_large` |
| Nesting depth | 32 | `413 json_too_deep` |
| Object keys in total | 1,000 | `413 json_too_many_keys` |
| `__proto__` keys, `constructor.prototype` objects | never accepted | `400 forbidden_json_key` |
| Not JSON at all | — | `400 invalid_json` |

A `__proto__` key is refused because the first deep merge of such a body pollutes every object in your app (**prototype pollution**). To accept bigger bodies on an API:

```ts title="bootstrap/app.ts"
// inside .withMiddleware((middleware) => { ... })
middleware.limits({ maxBytes: 5 * 1024 * 1024 })
```

Each limit has a ceiling (100 MiB, depth 512, a million keys); past it a limit protects nothing, so the app refuses to start.

### Request timeouts

A request that takes longer than **30 seconds** gets a `503` problem with the code `service_unavailable`, so a stuck handler can't hold a connection forever. Change it with `middleware.requestTimeout(10_000)` (milliseconds); `0` turns it off.

## Responses: security headers

The headers in the [first example](#the-smallest-example-nothing-to-do) go on **every** response, error pages included. A header your route sets itself wins, so an embeddable page can send its own `frame-ancestors`.

The **CSP** (Content Security Policy) tells the browser which scripts, styles and images it may load. Scripts and styles need the response's **nonce** (a random value made fresh for each response), so an injected `<script>` without it doesn't run. To allow images from your CDN:

```ts title="bootstrap/app.ts"
// inside .withMiddleware((middleware) => { ... })
middleware.securityHeaders({
  csp: { 'img-src': ['https://images.example.com'] },
  // true: send the policy as report-only (violations are reported, nothing is blocked).
  cspReportOnly: false,
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: false },
})
```

**What you'll see:** `img-src 'self' data: https://images.example.com` in the header. A source containing `;`, `,` or a space is refused at start-up, because it would inject another directive. Violations are posted to `/_strutvane/csp-report` and logged as a `CSP violation` warning.

Every option of `securityHeaders()`:

| Option | Default | What it does |
|---|---|---|
| `preset` | `'page'` | `'api'` switches to an API profile: `default-src 'none'`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store` and a stricter `Permissions-Policy` |
| `csp` | the policy above | Extra sources per directive, or `false` to send no CSP (`security:check` warns) |
| `cspReportOnly` | `false` | Send `Content-Security-Policy-Report-Only` instead |
| `hsts` | one year, `includeSubDomains` | `{ maxAge, includeSubDomains, preload }`, or `false`. `preload` needs `includeSubDomains` and at least a year |
| `referrerPolicy` | `strict-origin-when-cross-origin` | Any standard `Referrer-Policy` value |
| `permissionsPolicy` | camera, microphone, geolocation, payment, USB and topics off | The whole header value |
| `cacheControl` | none (`no-store` with the `api` preset) | A `Cache-Control` value, or `false` |

## CORS

**CORS** (cross-origin resource sharing) lets JavaScript on *another* site read your API's responses. Same-origin apps don't need it, so it's **off**. Turn it on for exact origins:

```ts title="bootstrap/app.ts"
// inside .withMiddleware((middleware) => { ... })
middleware.cors({ origins: ['https://app.example.com'], credentials: true })
```

**What you'll see:** requests from `https://app.example.com` to `/api/...` (the default `paths: ['api/*']`) get `access-control-allow-origin: https://app.example.com` and `access-control-allow-credentials: true`; other origins get no CORS headers, so the browser blocks them. `origins: ['*']` is allowed only for a public API **without** credentials.

## Sessions and cookies

The session cookie is called `strutvane_session` (change the base name in `config/session.ts` `cookie`). On HTTPS it gets the `__Host-` prefix (`__Host-strutvane_session`), which browsers accept only with `Secure`, `Path=/` and no `Domain`, so a sibling subdomain can't set or shadow it. The framework and the session layer read the name from one place, so the CSRF check always recognises the session.

The framework ships a file session store (`storage/framework/sessions`) and `node strut session:flush`. Signing in, regenerating the session id at sign-in (against **session fixation**), idle and absolute timeouts and "sign out other sessions" are the auth package's job. See [Authentication](../authentication/).

## Rate limiting

The `throttle` middleware limits how often a client may call a route. Every app has four named limiters:

| Limiter | Default | Counted per |
|---|---|---|
| `api` | 60 requests a minute (the `api` route group uses it) | signed-in user, else IP |
| `login` | 5 attempts a minute | IP |
| `password-reset` | 3 requests per 15 minutes | IP |
| `aggregate` | 1,000 requests a minute | everyone together (a circuit breaker) |

Redefine one, or add your own, in one place:

```ts title="bootstrap/app.ts"
// inside .withMiddleware((middleware) => { ... })
middleware.rateLimiter('api', { maxAttempts: 120, decaySeconds: 60 })
middleware.rateLimiter('login', { maxAttempts: 5, decaySeconds: 60 })
```

```ts title="routes/web.ts"
import { defineRoutes, Route } from '@strutvane/framework'
import { LoginController } from '../app/http/controllers/login.controller.ts'

export default defineRoutes([Route.post('/login', [LoginController, 'store']).middleware('throttle:login')])
```

**What you'll see** on the sixth attempt within a minute (something like this):

```text
HTTP/1.1 429 Too Many Requests
retry-after: 42
x-ratelimit-limit: 5
x-ratelimit-remaining: 0

{"type":"https://strutvane.dev/errors/rate-limited","title":"Too many requests","status":429,"code":"rate_limited","detail":"Please wait a moment and try again.","traceId":"…"}
```

Signed-in users are counted per user, guests per IP, and IPv6 addresses per /64 block, so rotating through one home network's addresses doesn't help.

The counts live in the app's **default cache store**. That's `memory` unless `config/cache.ts` says otherwise, so each process counts on its own; set the default store to `file` and every process on the machine shares the counts. See [Cache](../cache/) and [Rate Limiting](../rate-limiting/).

:::caution[Coming in 0.3]
Stores shared between servers (database and Redis) arrive in 0.3 with `@strutvane/redis`.
:::

## Validation, authorization and tenancy

- **Unknown fields** in a request body are a 422 `validation_failed` with an `unknown_field` issue, and writes accept only the model's `fillable` columns, so a form can't set `is_admin`. Each issue has the shape `{ path, field, code, message }`, for example `{ "path": ["is_admin"], "field": "is_admin", "code": "unknown_field", "message": "…" }`. See [Validation](../validation/).
- **Secret columns** (`.secret()` in the migration, or names such as `password`, `*_token`, `*_secret`, `api_key`) are hidden from every model, and one listed in `fillable` is refused with `secret_fillable` unless it's also in `allowSensitive`.
- **Passwords** are the auth package's job: NIST rules by default and a breached-password check. See [Passwords](../passwords/) and [Hashing](../hashing/).
- **Deny by default:** a missing policy method denies, `can:<ability>` allows only when the check returns exactly `true`, and a record you can't view answers 404, the same as a missing one. See [Authorization](../authorization/).
- **Tenancy:** with teams on, every query goes through the ORM's tenant scope; on PostgreSQL, row-level security inside the database is a second wall. See [Tenancy](../tenancy/).

## Data and output

- **SQL** only ever gets values as bound parameters. Raw SQL is written with the `` sql`...` `` tagged template, which binds every `${value}`.
- **Hidden and secret columns** are never sent, filtered, sorted, searched or shown, not even in `util.inspect` output.
- **Encryption:** `encrypt()` / `decrypt()` use AES-256-GCM and keep working across key rotation. See [Encryption](../encryption/).
- **Planned, not built yet:** encrypted casts, `sanitizeHtml()`, a rich-text cast that sanitises on write, a formula-injection guard for CSV exports (a cell starting with `=` can run in a spreadsheet), and safe download headers.

Every key Strutvane uses comes from **one keyring**: `keyring.derive(purpose)` is HKDF-SHA256 over `APP_KEY` (salt `strutvane`, info `strutvane:<purpose>:v1`), and it also knows the keys in `APP_PREVIOUS_KEYS`. Encryption, signed links, CSRF tokens, the maintenance bypass and the bootstrap caches each get their own subkey, so a weakness in one can't spill into another, and each survives a [key rotation](#keys).

## URLs, outgoing HTTP, files and abuse

### Signed URLs

A **signed URL** carries a signature that proves your app made it, so a link in an email ("unsubscribe", "download your export") can't be edited to point at someone else's data. Strutvane uses Laravel's names:

```ts title="app/http/controllers/export.controller.ts"
import { Controller, url, type HttpContext } from '@strutvane/framework'

export class ExportController extends Controller {
  store(ctx: HttpContext): Response {
    // Valid for one hour, and only once.
    const link = url.signedRoute('exports.download', { export: 42 }, { expiresIn: 3600, oneTime: true })
    // Valid until a fixed moment.
    const report = url.temporarySignedRoute('reports.show', new Date('2026-12-01T00:00:00Z'), { report: 7 })
    return ctx.json({ link, report })
  }
}
```

The route checks it with the `signed` middleware: `Route.get('/exports/{export}', [ExportController, 'download']).name('exports.download').middleware('signed')`.

**What you'll see:** the link works as is. Change one character and it answers (something like this):

```json
{"type":"https://strutvane.dev/errors/invalid-signature","title":"Invalid link","status":403,"code":"invalid_signature","detail":"This link is not valid. It may have been changed or copied incompletely. Ask for a new one.","traceId":"…"}
```

An expired or already-used link answers 403 `signature_expired` ("This link has expired or has already been used. Ask for a new one."), so the page can offer "send me a new link".

There is **one signer** in the framework (`UrlSigner`): an HMAC over the path, the sorted query, the expiry and a `purpose`, under the keyring's `signer` subkey, checked against every key in the keyring. One-time links remember used signatures in the process's memory, so on several processes a link is one-time per process.

:::caution[Coming in 0.2]
The auth package's verification and reset links moving onto this signer are decided but not on `main` yet.
:::

### Redirects, outgoing HTTP, uploads and abuse

- **Open redirects:** `redirect().to()` and `redirect().intended()` go only to same-origin paths, so a link can't bounce users to a phishing site; `redirect().away()` is the one explicit way off-site. See [Helpers](../helpers/).
- **SSRF guard:** `safeFetch()` and the `Http` client refuse private, loopback and cloud-metadata addresses by default (so a "fetch this URL" feature can't reach your internal network), resolve DNS once and connect only to the address they checked, with timeouts and a response size cap. See [HTTP Client](../http-client/).
- **Idempotency:** the `idempotent` middleware makes a retried payment or import run once. Keys live in memory unless you bind `IdempotencyStoreToken` to a shared store.
- **Uploads:** the multipart parser enforces limits while streaming and decides a file's type from its bytes, never from the browser. See [File Storage](../storage/).

:::caution[Planned]
HMAC signatures for webhooks, a zip-slip guard and a virus-scan hook for uploads, and a honeypot field and CAPTCHA hook for public forms.
:::

## Secrets and the debug page

- Secrets live only in `.env`, never in `.env.example`, code or logs. The framework's logger redacts values under secret-looking keys (passwords, tokens, keys, cookies, `authorization`) and writes every record as one JSON line, so a value can't forge extra log lines. See [Logging](../logging/).
- The detailed **debug page** appears only when `APP_DEBUG=true` **and** `APP_ENV` is `local` or `testing`. The environments are `local`, `testing`, `staging` and `production`.
- With `APP_DEBUG=true` and `APP_ENV=production`, the app **refuses to start** (code `debug_in_production`). That combination almost always means a development `.env` was deployed, with its development keys and passwords, so failing closed is safer than starting.

For a deliberate, short investigation, the commands that boot the app (`route:list`, `optimize`, `down`, `cache:clear` and the other app commands) accept `--force-debug`: they start anyway with a logged warning, and the debug page stays off in production either way.

```bash
node strut route:list --force-debug
```

:::caution[Known gap in 0.2.0-next.0]
`node strut start` and `node strut dev` don't accept `--force-debug` yet (they take only `--port` and `--host`), although the start-up error mentions it. Set `APP_DEBUG=false` to start the server.
:::

## The Strict security profile

The installer asks for a **security profile**. **Standard** is everything on this page. **Strict** adds two-factor authentication required for admins, 8-hour sessions, a strict CSP and HSTS with `preload`.

```bash
npm create strutvane@latest my-app -- --security-profile strict
```

:::caution[Coming in 0.2]
The question and its `--security-profile standard|strict` flag belong to `create-strutvane`, which isn't published yet. The framework on `main` doesn't read a security profile; what Strict switches on is designed, not built.
:::

## Security commands

`key:generate`, `key:rotate`, `env:encrypt`, `env:decrypt`, `session:flush` and `security:check` ship in 0.2.0-next.0. `token:revoke` comes with the auth package.

### Keys

```bash
node strut key:generate      # a new APP_KEY in .env (32 random bytes)
node strut key:rotate        # a new APP_KEY; the old one moves to the front of APP_PREVIOUS_KEYS
```

**What you'll see** after `key:rotate`:

```text
✔ New APP_KEY set; the old key is first in APP_PREVIOUS_KEYS.
  1 previous key still accepted for decryption and signed links.
  Deploy the new .env everywhere, and run node strut optimize again if you cache config.
```

Neither command prints the key, because it would land in terminal scrollback and CI logs (`key:generate --show` prints a key without writing it, for when you want one on purpose). `key:generate` refuses to replace an existing key without `--force`, and `key:rotate` is a destructive command: outside `local`, `test`, `testing` and `development` it needs `--force --i-understand`.

**After a rotation,** encrypted values, signed links, CSRF tokens and the maintenance bypass are checked against `APP_KEY` first and then every key in `APP_PREVIOUS_KEYS`, so they keep working. `key:rotate` also deletes the config cache, which was encrypted with the old key.

:::caution[Coming in 0.2]
Sessions, API tokens and recovery codes surviving a rotation is the auth package's part, decided but not on `main` yet.
:::

### Encrypted environment files

```bash
node strut env:encrypt --env=production   # .env.production → .env.production.encrypted, which you can commit
node strut env:decrypt --env=production   # turns it back into .env.production on the server
```

This is Laravel's way to commit production settings without exposing them. Without a key, `env:encrypt` makes one and prints it **once** (`base64:` followed by 32 bytes); it is never written to disk, so keep it in your secrets manager or CI secrets. Give it back to `env:decrypt` through the `STRUT_ENV_KEY` environment variable (or `--key`, which lands in shell history). A wrong key or a changed file writes nothing. `--force` replaces an existing file; replacing a live `.env` file outside local environments also needs `--i-understand`.

### After an incident

```bash
node strut session:flush          # signs every user out of the web app
```

**What you'll see** (something like this):

```text
✔ 14 sessions deleted. Everyone signed in with a session must sign in again.
API tokens are not affected; revoke them with the auth package.
```

`session:flush` is destructive: outside local environments it needs `--force --i-understand`.

### `security:check`

Run it before every deploy (and in CI):

```bash
node strut security:check
```

It checks:

| Check | Fails (✖) or warns (!) when |
|---|---|
| `debug` | ✖ `APP_DEBUG=true` with `APP_ENV=production` |
| `app-key` | ✖ `APP_KEY` is missing, shorter than 32 bytes or malformed |
| `https` | ✖ the production `APP_URL` isn't HTTPS |
| `cookies` | ✖ production cookies can't be `Secure` (because `APP_URL` is plain HTTP) |
| `boot` | ✖ the app refuses to start (CORS `*` with credentials, unsafe headers, bad hosts, …) |
| `csp` | ! the CSP is off, or scripts are allowed through `'unsafe-inline'`, `'unsafe-eval'`, `*`, `http:`, `https:` or `data:` |
| `csrf-exceptions` | ! a CSRF exception pattern matches every path |
| `cors` | ! CORS is open to `*` |
| `dev-tools` | ✖ in production (! elsewhere) a route under `/_…` is reachable without sign-in |
| `npm-audit` | ✖ high or critical advisories; runs only with `--audit`, because it needs the network |

**What you'll see** (something like this):

```text
   Check            Detail
✖  debug            APP_DEBUG=true with APP_ENV=production. Set APP_DEBUG=false.
✔  app-key          APP_KEY is set and at least 32 bytes
✔  https            https://blog.example.com
✔  cookies          Secure, HttpOnly, SameSite=Lax
✔  boot             every boot-time check passed (CORS, headers, hosts, proxies, limits, routes)
!  csp              script-src allows 'unsafe-inline'
✔  csrf-exceptions  1 exception pattern
✔  cors             off
✔  dev-tools        no /_ routes without auth
·  npm-audit        run with --audit (needs the network)

  ✖ 1 failure, 1 warning.
```

It exits with code `3` when any check fails, so CI can stop the deploy. Add `--json` for the same report in a form scripts can read.

## The security tests your app gets

:::caution[Coming in 0.2]
Designed, not built yet: every resource `node strut migrate` generates also gets a security test suite in your app, covering CSRF, tenancy (one team never sees another's rows), mass assignment and enumeration (a hidden record answers like a missing one). The framework's own protections already ship with attack-style tests.
:::

## With Docker or without

The protections are the same. Two settings differ in practice:

- **With Docker**, the dev server listens on `0.0.0.0` *inside* the container and is published only on `127.0.0.1` on your computer, so nothing on your network can reach it; the trusted-hosts list still refuses other host names.
- **Behind a proxy in production** (a load balancer, a Kubernetes ingress), list it with `trustProxies()`, or every visitor looks like the proxy and HTTPS isn't detected.

## Common mistakes

### The app won't start: "cors: origins "*" can't be combined with credentials: true"

```text
  - cors: origins "*" can't be combined with credentials: true. List the exact origins that may send cookies.
```

**Why:** that combination would let every website read a signed-in user's API responses.

**Fix:** list the exact origins:

```ts title="bootstrap/app.ts"
// inside .withMiddleware((middleware) => { ... })
middleware.cors({ origins: ['https://app.example.com'], credentials: true })
```

### The app won't start in production: "APP_DEBUG=true with APP_ENV=production"

```text
error The app refuses to start: APP_DEBUG=true with APP_ENV=production.
  → Set APP_DEBUG=false in the production environment. To start anyway for a short investigation, pass --force-debug (debug pages stay off in production either way).
```

**Why:** detailed error pages show code and configuration, so they never appear outside `local` and `testing`, and `APP_DEBUG=true` in production usually means a development `.env` was deployed by mistake.

**Fix:** set `APP_DEBUG=false` in production, and read the [logs](../logging/) instead. Each production 500 carries a `traceId` that matches its log line and the `X-Request-Id` header.

### Every visitor has the same IP and rate limits hit everyone

**Why:** the app sits behind a proxy you haven't trusted, so `X-Forwarded-For` is ignored and every request seems to come from the proxy.

**Fix:**

```ts title="bootstrap/app.ts"
// inside .withMiddleware((middleware) => { ... })
middleware.trustProxies({ at: ['10.0.0.0/8'] })
```

### I get 400 "Untrusted host"

```json
{"type":"https://strutvane.dev/errors/untrusted-host","title":"Untrusted host","status":400,"code":"untrusted_host","detail":"This server does not answer for the requested host name.","traceId":"…"}
```

**Why:** the address you used isn't `APP_URL`'s host or a loopback name (for example a LAN address such as `192.168.1.20`).

**Fix:** use the address in `APP_URL`, change `APP_URL`, or add the host:

```ts title="bootstrap/app.ts"
// inside .withMiddleware((middleware) => { ... })
middleware.trustHosts({ at: ['blog.example.com', 'www.blog.example.com'] })
```

### My upload or import gets 413

```json
{"type":"https://strutvane.dev/errors/payload-too-large","title":"Request too large","status":413,"code":"payload_too_large","traceId":"…"}
```

**Why:** JSON bodies are capped at 1 MiB by default.

**Fix:** raise the limit for your app, or send files as uploads instead of JSON:

```ts title="bootstrap/app.ts"
// inside .withMiddleware((middleware) => { ... })
middleware.limits({ maxBytes: 5 * 1024 * 1024 })
```

### My JSON is refused as "nested too deeply"

```json
{"type":"https://strutvane.dev/errors/json-too-deep","title":"JSON nested too deeply","status":413,"code":"json_too_deep","detail":"The request body is nested deeper than this server accepts.","traceId":"…"}
```

**Why:** deeply nested or huge JSON is a common way to exhaust a server, so it's refused before parsing.

**Fix:** flatten the payload, or raise the limit deliberately:

```ts title="bootstrap/app.ts"
// inside .withMiddleware((middleware) => { ... })
middleware.limits({ maxDepth: 64 })
```

## Next steps

- [CSRF Protection](../csrf/): every style, with examples.
- [Authentication](../authentication/): sign-in, 2FA, passkeys and tokens.
- [Authorization](../authorization/): policies and deny by default.
- [Configuration](../configuration/): `.env` and `APP_KEY`.
