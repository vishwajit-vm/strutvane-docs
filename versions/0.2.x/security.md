---
title: Security Features
description: Every protection Strutvane turns on by default, how to adjust each one in bootstrap/app.ts, the Strict security profile, the security commands (key:rotate, env:encrypt, session:flush, security:check), and what is already proven versus still being built.
---

Strutvane's security rule is short: **safe without doing anything, and adjustable in whichever style you like.** Every protection on this page is on by default. You can apply or skip each one per route, group or controller, or call it as a plain function, and every opt-out is written down where `node strut route:list --security` shows it.

This page is the map. Each protection has a short explanation, a small example where an API exists, and its **status**: what is proven in a prototype, what is decided but not built that way yet, and what is designed but not built.

:::tip[Coming from Laravel?]
Most of this is what Laravel gives you, with the same names where Laravel has one: `trustProxies()`, `trustHosts()`, `validateCsrfTokens()`, `throttle` with named limiters, signed URLs, `encrypt()`, `key:generate`, `env:encrypt`. The differences:
- security headers (a CSP with nonces, HSTS, `frame-ancestors 'none'`) are **on by default**, not a package;
- trusted hosts are on by default too, not commented out;
- CORS is **off** until you list origins, and `*` with credentials stops the app from starting;
- a `security:check` command reviews your configuration before you deploy.
:::

:::caution[Coming in 0.2]
Strutvane 0.2 isn't released. The **Status** column below says, for each protection, whether it is **proven** in a prototype (with tests; not released), **decided** (settled for 0.2, but the prototype doesn't do it that way yet), **designed** (in the blueprint, not built yet), or arrives in **0.3**, **before 1.0** or **after 1.0**. Import paths inside `@strutvane/framework` may still change.
:::

## The smallest example (nothing to do)

A new app is protected the moment it starts. Ask it for a page and look at the headers:

```bash
curl -I http://localhost:3000/up
```

**What you'll see** (something like this; the nonce changes on every response):

```text
HTTP/1.1 200 OK
content-security-policy: default-src 'self'; script-src 'self' 'nonce-Zm9vYmFy'; style-src 'self' 'nonce-Zm9vYmFy'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; report-uri /_strutvane/csp-report
x-content-type-options: nosniff
referrer-policy: strict-origin-when-cross-origin
permissions-policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()
cross-origin-opener-policy: same-origin
cross-origin-resource-policy: same-origin
x-frame-options: DENY
```

HSTS (`strict-transport-security`) is added only in production over HTTPS, because browsers ignore it over plain HTTP and it would pin `localhost` to HTTPS during development.

`/up` is the health route every app has. It answers `200 {"status":"ok"}` to GET and HEAD, and stays reachable during [maintenance mode](../maintenance-mode/), so a load balancer doesn't take a healthy server out of rotation.

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
    middleware.rateLimiter('login', { maxAttempts: 5, decaySeconds: 60 })
  })
  .create()
```

**What you'll see:** nothing, if every value is valid. If any setting is unsafe or invalid, the app refuses to start and lists **every** problem at once:

```text
  ✖ The app can't start: 2 security settings are unsafe or invalid.
  - cors: origins "*" can't be combined with credentials: true. List the exact origins that may send cookies.
  - trustProxies: "*" is not an IP address or CIDR range (to trust a load balancer, list its address or subnet, never "*").
  → Fix them in bootstrap/app.ts (withMiddleware). Each line above says what is wrong and what is allowed.
```

Calls add up: a package's provider and your app can both add CSRF exceptions or trusted proxies.

## Every protection

| Area | Protection (on by default) | Status |
|---|---|---|
| Requests | CSRF on every cookie-authenticated write (419 `csrf_token_mismatch`) | proven (spike 12) |
| Requests | Trusted hosts: a `Host` header allowlist (400 `untrusted_host`) | proven (spike 12) |
| Requests | Trusted proxies: `X-Forwarded-*` only from listed proxies | proven (spike 12) |
| Requests | Body size, JSON depth and JSON key-count limits; prototype-pollution-safe JSON | proven (spike 12) |
| Requests | Request timeouts | designed |
| Responses | CSP with a fresh nonce per response, HSTS (production), `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP/CORP, `frame-ancestors 'none'`, CSP violation reports to the log | proven (spike 12) |
| CORS | Off by default; an exact allowlist; never `*` with credentials | proven (spike 12) |
| Sessions and cookies | The `strutvane_session` cookie: `HttpOnly`, `Secure`, `SameSite=Lax`, `__Host-` prefix on HTTPS; new id on sign-in and privilege change; idle and absolute timeouts; "sign out other sessions" | proven in the auth prototype (spike 20, under another cookie name); the name is decided; encrypted cookies designed |
| Rate limiting | `throttle` with named limiters (`api`, `login`, `password-reset`, `aggregate`), per-IP (IPv6 per /64) and per-user keys, `Retry-After` | proven (spike 12, fixed window, in memory, `api` only); the other three limiters and the cache store are decided; sliding window designed |
| Rate limiting | Lockout with backoff on sign-in and 2FA | proven (spike 20) |
| Validation | Unknown fields rejected; writes only through `fillable` | proven (spikes 11 and 12) |
| Validation | Zod schemas from migrations; ReDoS-safe rules | designed |
| Passwords | NIST rules: 12 to 128 characters and a breached-password check (`Password.min(12).uncompromised()`), no composition rules unless you opt in; hashed with scrypt through `Hash` | the length rule, an optional breach hook and scrypt proven in the auth prototype (spike 20); `Password`, `Hash` and the check on by default decided |
| Authorization | Deny by default; policies; `can` middleware; a dev-only "why was this denied" hint | proven (spike 12); policies compiled to SQL kept from 0.1 |
| Tenancy | The ORM tenant scope everywhere, plus PostgreSQL row-level security | proven (spike 11, and RLS in spikes 3 and 16) |
| Data | Parameterised SQL only | proven (spike 11) |
| Data | `encrypt()` / `decrypt()` (AES-256-GCM) with key rotation | proven (spike 12) |
| Data | Encrypted casts | designed |
| Data | `.secret()` and `.hidden()` columns never serialised, searched or shown | proven (spikes 12 and 14) |
| Output | React escaping; `sanitizeHtml()`; rich-text cast that sanitises on write; CSV formula-injection guard; safe `Content-Disposition` | designed (React escaping is React's) |
| URLs and redirects | Signed and temporary signed URLs (`signed`, 403 `invalid_signature` / `signature_expired`); open-redirect guard | proven (spike 12); one shared signer, `url.signedRoute()` options and one-time links decided |
| Outgoing HTTP | `safeFetch()` blocks private, loopback and metadata addresses (SSRF guard), with timeouts and a size cap | proven (spike 12); the `Http` client designed |
| Outgoing HTTP | HMAC webhook signatures | designed |
| Files | Uploads checked by content, not extension; size and type limits; random stored names; path-traversal and zip-slip guards; a virus-scan hook | designed |
| Secrets and logs | Secrets only in `.env`; `env:encrypt`; log redaction; log-injection-safe lines; no debug page in production; `APP_DEBUG=true` in production refuses to start | redaction proven in 0.1 and kept; the rest proven (spike 12) |
| Abuse | Honeypot and a CAPTCHA hook for public forms | designed |
| Abuse | `idempotent` middleware for payments and imports | proven (spike 12, in-memory store); a shared store designed |
| Auth | 2FA, passkeys, email-link sign-in, password confirmation, token abilities and expiry, impersonation | proven (spike 20) |
| Auth | Impersonation needs the `impersonate` ability (only `admin` has it by default), and nobody can impersonate a user who also holds it or a higher role | decided (spike 20 checks the `admin` role) |
| Supply chain | `ignore-scripts` with an allowlist; a shipped lockfile; `npm audit` in `security:check --audit`, `doctor` and CI; provenance on publish | proven in the installer (spike 13) and `security:check` (spike 12); `doctor` designed |
| Operations | `security:check`, `session:flush`, `key:rotate`, `env:encrypt`, maintenance-mode secret bypass | proven (spike 12) |
| Operations | Security events (sign-ins, role changes, tokens, impersonation) written by the framework to the `audit_events` table; per-record history comes from `@strutvane/activity-log` ([Audit](../audit/)) | `recordAudit()` built in 0.1; auth events proven (spike 20); the `audit_events` table designed |

Each protection ships with attack-style tests in the framework (tests that play the attacker). The sections below explain each area.

## Requests

### CSRF

Every POST, PUT, PATCH or DELETE that rides on a session cookie must prove it came from your own pages, or it gets a **419** with the problem code `csrf_token_mismatch`. Every cross-origin refusal uses that same status and code, in the same problem shape, whichever package refuses it. Bearer-token API calls skip the check. Every way to adjust it is on its own page: [CSRF Protection](../csrf/).

### Trusted hosts

A request whose `Host` header isn't on the allowlist is refused before any of your code runs. **Why:** anything built from the request's host (a password-reset link, a redirect) could otherwise be poisoned by `Host: evil.example`, and DNS rebinding lets a website you visit talk to your local app under its own name.

The default list is `APP_URL`'s host, plus `localhost`, `127.0.0.1` and `[::1]` in `local` and `testing`. To serve more names:

```ts title="bootstrap/app.ts"
// inside .withMiddleware((middleware) => { ... })
middleware.trustHosts({ at: ['blog.example.com'], subdomains: true })
```

**What you'll see:** `blog.example.com` and `acme.blog.example.com` are answered; `evil.example` gets:

```text
{"type":"https://strutvane.dev/problems/untrusted_host","title":"Untrusted host","status":400,"code":"untrusted_host","detail":"This server does not answer for the requested host name."}
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

### Body limits and safe JSON

JSON bodies are capped before they're parsed:

| Limit | Default | Over the limit |
|---|---|---|
| Size | 1 MiB | `413 payload_too_large` |
| Nesting depth | 32 | `413 json_too_deep` |
| Object keys in total | 1,000 | `413 json_too_many_keys` |
| `__proto__` keys, `constructor.prototype` objects | never accepted | `400 forbidden_json_key` |
| Not JSON at all | — | `400 invalid_json` |

A `__proto__` key is refused because the first deep merge of such a body pollutes every object in your app (**prototype pollution**). To accept bigger uploads on an API:

```ts title="bootstrap/app.ts"
// inside .withMiddleware((middleware) => { ... })
middleware.limits({ maxBytes: 5 * 1024 * 1024 })
```

Each limit has a ceiling (100 MiB, depth 512, a million keys); past it a limit protects nothing, so the app refuses to start.

## Responses: security headers

The headers in the [first example](#the-smallest-example-nothing-to-do) go on **every** response, error pages included. A header your route sets itself wins, so an embeddable page can send its own `frame-ancestors`.

The **CSP** (Content Security Policy) tells the browser which scripts, styles and images it may load. Scripts and styles need the response's **nonce** (a random value made fresh for each response), so an injected `<script>` without it doesn't run. To allow images from your CDN:

```ts title="bootstrap/app.ts"
// inside .withMiddleware((middleware) => { ... })
middleware.securityHeaders({
  csp: { 'img-src': ['https://images.example.com'] },
  // Try a stricter policy first: violations are reported, nothing is blocked.
  cspReportOnly: false,
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: false },
})
```

**What you'll see:** `img-src 'self' data: https://images.example.com` in the header. A source containing `;`, `,` or a space is refused at start-up, because it would inject another directive. Violations are posted to `/_strutvane/csp-report` and written to the [log](../logging/).

## CORS

**CORS** (cross-origin resource sharing) lets JavaScript on *another* site read your API's responses. Same-origin apps don't need it, so it's **off**. Turn it on for exact origins:

```ts title="bootstrap/app.ts"
// inside .withMiddleware((middleware) => { ... })
middleware.cors({ origins: ['https://app.example.com'], credentials: true })
```

**What you'll see:** requests from `https://app.example.com` to `/api/...` (the default `paths: ['api/*']`) get `access-control-allow-origin: https://app.example.com` and `access-control-allow-credentials: true`; other origins get no CORS headers, so the browser blocks them. `origins: ['*']` is allowed only for a public API **without** credentials.

## Sessions and cookies

The session cookie is called `strutvane_session`. It is `HttpOnly` (scripts can't read it), `Secure` over HTTPS, `SameSite=Lax`, and uses the `__Host-` name prefix on HTTPS (`__Host-strutvane_session`), which stops a sibling subdomain from setting it. A new session id is issued at every sign-in and privilege change (against **session fixation**), sessions end after 2 hours idle or 12 hours in total (30 days with "remember me"), and users can sign out their other sessions. See [Authentication](../authentication/).

## Rate limiting

The `throttle` middleware limits how often a client may call a route. Named limiters keep the numbers in one place:

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

**What you'll see** on the sixth attempt within a minute:

```text
HTTP/1.1 429
retry-after: 42

{"type":"https://strutvane.dev/problems/too_many_requests","title":"Too many requests","status":429,"code":"too_many_requests","detail":"Slow down: try again in 42 seconds."}
```

Signed-in users are counted per user, guests per IP, and IPv6 addresses per /64 block, so rotating through one home network's addresses doesn't help.

Strutvane ships four named limiters: `api`, `login`, `password-reset` and `aggregate`. The counts are kept in the **cache store** (the database by default, Redis if you choose it), not in the process's memory, so a limit holds across processes and servers. See [Rate Limiting](../rate-limiting/).

:::caution[Coming in 0.2]
The prototype (spike 12) defines only `api`, and counts in memory, so each process counts alone. `login`, `password-reset`, `aggregate` and the cache store are decided for 0.2 but not built yet.
:::

## Validation, authorization and tenancy

- **Unknown fields** in a request body are a 422 `validation_failed` with an `unknown_field` issue, and writes accept only the model's `fillable` columns, so a form can't set `is_admin`. Each issue has the shape `{ path, field, code, message }`, for example `{ "path": ["is_admin"], "field": "is_admin", "code": "unknown_field", "message": "…" }`. See [Validation](../validation/).
- **Passwords** follow NIST by default: at least 12 characters, at most 128, and a check against breached passwords, with **no** composition rules ("one symbol"), because those push people to predictable passwords. `Password.min(12).uncompromised()` is the default rule; `mixedCase()`, `numbers()` and `symbols()` exist for apps that are required to use them. Passwords are hashed with scrypt through `Hash` (argon2 is a later opt-in package, not in 0.2). See [Passwords](../passwords/) and [Hashing](../hashing/).
- **Deny by default:** a missing policy method denies, generated policies allow only admins, and a record you can't view answers 404, the same as a missing one. In development, a 403 explains which rule denied it. See [Authorization](../authorization/).
- **Tenancy:** with teams on, every query goes through the ORM's tenant scope; on PostgreSQL, row-level security inside the database is a second wall. See [Tenancy](../tenancy/).

## Data and output

- **SQL** only ever gets values as bound parameters. Raw SQL is written with the `` sql`...` `` tagged template, which binds every `${value}`.
- **Hidden and secret columns** (`.hidden()`, `.secret()`, and names such as `password` or `api_token`) are never sent, searched, sorted or shown.
- **Encryption:** `encrypt()` / `decrypt()` use AES-256-GCM and keep working across key rotation. They are proven in the prototype (spike 12). See [Encryption](../encryption/).
- **Designed, not built yet:** encrypted casts, `sanitizeHtml()`, a rich-text cast that sanitises on write, a formula-injection guard for CSV exports (a cell starting with `=` can run in a spreadsheet), and safe download headers.

Every key Strutvane uses comes from **one keyring**: `keyring.derive(purpose)` is HKDF-SHA256 over `APP_KEY` (salt `strutvane`, info `strutvane:<purpose>:v1`), and it also knows the keys in `APP_PREVIOUS_KEYS`. Encryption, signed links, CSRF tokens and cookies each get their own subkey, so a weakness in one can't spill into another, and every one of them survives a [key rotation](#keys).

## URLs, outgoing HTTP, files and abuse

### Signed URLs

A **signed URL** carries a signature that proves your app made it, so a link in an email ("unsubscribe", "download your export") can't be edited to point at someone else's data. Strutvane uses Laravel's names:

```ts title="app/http/controllers/export.controller.ts"
import { url, type HttpContext } from '@strutvane/framework'

export class ExportController {
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

**What you'll see:** the link works as is. Change one character and it answers:

```text
{"type":"https://strutvane.dev/problems/invalid_signature","title":"Invalid signature","status":403,"code":"invalid_signature","detail":"This link is not valid. It may have been changed or copied incompletely."}
```

An expired link answers 403 `signature_expired` instead, so the page can offer "send me a new link". Every link answers this way, including email-verification and password-reset links from the auth package.

There is **one signer** in the framework. Signed routes, auth verification and reset links, and temporary storage URLs all use it: an HMAC over the path, the sorted query, the expiry and a `purpose`, under a key from the keyring.

:::caution[Coming in 0.2]
The prototype (spike 12) proves `signedRoute(name, params)`, `temporarySignedRoute(name, expiresAt, params)`, the `signed` middleware and both 403 codes. The `url.` accessor, the `{ expiresIn, oneTime }` options, the `purpose` in the signature, and auth and storage links going through the same signer are decided but not built yet.
:::

### Redirects, outgoing HTTP, uploads and abuse

- **Open redirects:** `redirect().intended()` goes only to same-origin paths, so a link can't bounce users to a phishing site. Proven in the prototype (spike 12).
- **SSRF guard:** `safeFetch()` refuses private, loopback and cloud-metadata addresses by default (so a "fetch this URL" feature can't reach your internal network), resolves DNS once and connects only to the address it checked, with timeouts and a response size cap. Proven in the prototype (spike 12). See [HTTP Client](../http-client/).
- **Idempotency:** the `idempotent` middleware makes a retried payment or import run once. Proven in the prototype (spike 12), which keeps keys in memory.

:::caution[Coming in 0.2]
**Designed, not built yet:**
- the `Http` client built on `safeFetch()`, and HMAC signatures for webhooks;
- **uploads** checked by their content (magic bytes), not their extension; size and type limits; random stored names; path-traversal and zip-slip guards; an optional virus-scan hook;
- a honeypot field and a CAPTCHA hook for public forms;
- a shared store for idempotency keys, so they hold across processes.
:::

## Secrets and the debug page

- Secrets live only in `.env`, never in `.env.example`, code or logs. The logging pipeline redacts tokens, passwords, keys and cookies, and writes every record as one line, so a value can't forge extra log lines.
- The detailed **debug page** appears only when `APP_DEBUG=true` **and** `APP_ENV` is `local` or `testing`. The environments are `local`, `testing`, `staging` and `production`.
- With `APP_DEBUG=true` and `APP_ENV=production`, the app **refuses to start**. That combination almost always means a development `.env` was deployed, with its development keys and passwords, so failing closed is safer than starting. For a deliberate short investigation, `--force-debug` starts it anyway with a logged warning; the debug page stays off in production either way. Proven in the prototype (spike 12).

```bash
node strut serve --force-debug
```

## The Strict security profile

The installer asks for a **security profile** (question 26). **Standard** is everything on this page, including the breached-password check on every new password. **Strict** adds:

- two-factor authentication required for admins;
- 8-hour sessions;
- a strict CSP;
- HSTS with `preload`.

```bash
npm create strutvane@latest my-app -- --security-profile strict
```

:::caution[Coming in 0.2]
The question and its `--security-profile standard|strict` flag are proven in the installer prototype (spike 13), which records the answer in `config/security.ts`. What Strict switches on is designed, not built yet.
:::

## Security commands

:::caution[Coming in 0.2]
`key:generate`, `key:rotate`, `env:encrypt`, `env:decrypt`, `session:flush` and `security:check` are proven in the application-core prototype (spike 12, with tests on copies of an example app). They aren't released. `token:revoke` comes with the auth package and isn't built yet.
:::

### Keys

```bash
node strut key:generate      # a new 32-byte APP_KEY in .env (new apps get one from the installer)
node strut key:rotate        # a new APP_KEY; the old one moves to the front of APP_PREVIOUS_KEYS
```

**What you'll see** after `key:rotate`:

```text
  ✔ New APP_KEY set; the old key is first in APP_PREVIOUS_KEYS.
  · 1 previous key still accepted for decryption and signed links.
  · Deploy the new .env everywhere, and run `node strut optimize` again if you cache config.
```

Neither command prints the key, because it would land in terminal scrollback and CI logs.

**Rotation signs nobody out.** Everything checks `APP_KEY` first and then every key in `APP_PREVIOUS_KEYS`: encrypted values, signed links, CSRF tokens, sessions, API tokens and recovery codes. A session or token that matches an old key is re-digested under the new one.

:::caution[Coming in 0.2]
In the prototypes, encrypted values and signed links already survive a rotation (spike 12). CSRF tokens (spike 12) and sessions, API tokens and recovery codes (spike 20) still use the current key only, so today a rotation means open forms need a reload and everyone signs in again. Moving them onto the keyring is decided for 0.2.
:::

### Encrypted environment files

```bash
node strut env:encrypt --env=production   # .env.production → .env.production.encrypted, which you can commit
node strut env:decrypt --env=production   # turns it back into .env.production on the server
```

This is Laravel's way to commit production settings without exposing them. Without a key, `env:encrypt` makes one and prints it **once**; it is never written to disk, so keep it in your secrets manager or CI secrets. Give it back to `env:decrypt` through the `STRUT_ENV_KEY` environment variable (or `--key`, which lands in shell history). A wrong key or a changed file writes nothing. `--force` overwrites an existing file.

### After an incident

```bash
node strut session:flush          # signs every user out of the web app
node strut token:revoke --all     # revokes every personal access token
```

**What you'll see** after `session:flush` (something like this):

```text
  ✔ 14 sessions deleted. Everyone signed in with a session must sign in again.
  · API tokens are not affected; revoke them with the auth package (token:revoke --all).
```

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
| `dev-tools` | ✖ in production (! elsewhere) a developer tool under `/_…` is reachable without sign-in |
| `npm-audit` | ✖ high or critical advisories; runs only with `--audit`, because it needs the network |

**What you'll see** (something like this):

```text
     Check            Detail
  -  ---------------  ------------------------------------------------------------
  ✖  debug            APP_DEBUG=true with APP_ENV=production. Set APP_DEBUG=false.
  ✔  app-key          APP_KEY is set and at least 32 bytes
  ✔  https            https://blog.example.com
  ✔  cookies          Secure, HttpOnly, SameSite=Lax
  ✔  boot             every boot-time security check passed (CORS, headers, hosts, proxies, limits, routes)
  !  csp              script-src allows 'unsafe-inline'
  ✔  csrf-exceptions  1 exception pattern(s)
  ✔  cors             off
  ✔  dev-tools        no /_ routes without auth
  ·  npm-audit        run with --audit (needs the network)

  ✖ 1 failure, 1 warning.
```

It exits with code `1` when any check fails, so CI can stop the deploy. Add `--json` for the same report in a form scripts can read.

## The security tests your app gets

:::caution[Coming in 0.2]
Designed, not built yet: every resource `node strut migrate` generates also gets a security test suite in your app, covering CSRF, tenancy (one team never sees another's rows), mass assignment and enumeration (a hidden record answers like a missing one). The framework's own protections ship with attack-style tests, and 25 release-blocking items from the 0.2 security review must pass before 0.2.0 is published.
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
The app refuses to start: APP_DEBUG=true with APP_ENV=production.
  → Set APP_DEBUG=false in the production environment. To start anyway for a short investigation, pass --force-debug (the debug page stays off in production either way).
```

**Why:** detailed error pages show code and configuration, so they never appear outside `local` and `testing`, and `APP_DEBUG=true` in production usually means a development `.env` was deployed by mistake.

**Fix:** set `APP_DEBUG=false` in production, and read the [logs](../logging/) instead. Each production 500 carries a reference id that matches its log line. Use `--force-debug` only for a deliberate, short investigation.

### Every visitor has the same IP and rate limits hit everyone

**Why:** the app sits behind a proxy you haven't trusted, so `X-Forwarded-For` is ignored and every request seems to come from the proxy.

**Fix:**

```ts title="bootstrap/app.ts"
// inside .withMiddleware((middleware) => { ... })
middleware.trustProxies({ at: ['10.0.0.0/8'] })
```

### I get 400 "Untrusted host"

```text
{"type":"https://strutvane.dev/problems/untrusted_host","title":"Untrusted host","status":400,"code":"untrusted_host","detail":"This server does not answer for the requested host name."}
```

**Why:** the address you used isn't `APP_URL`'s host (or a loopback name in development).

**Fix:** use the address in `APP_URL`, change `APP_URL`, or add the host:

```ts title="bootstrap/app.ts"
// inside .withMiddleware((middleware) => { ... })
middleware.trustHosts({ at: ['blog.example.com', 'www.blog.example.com'] })
```

### My upload or import gets 413

```text
{"type":"https://strutvane.dev/problems/payload_too_large","title":"Payload too large","status":413,"code":"payload_too_large","detail":"The body is larger than 1048576 bytes."}
```

**Why:** JSON bodies are capped at 1 MiB by default.

**Fix:** raise the limit for your app, or send files as uploads instead of JSON:

```ts title="bootstrap/app.ts"
// inside .withMiddleware((middleware) => { ... })
middleware.limits({ maxBytes: 5 * 1024 * 1024 })
```

### My JSON is refused as "too complex"

```text
{"type":"https://strutvane.dev/problems/json_too_deep","title":"JSON too complex","status":413,"code":"json_too_deep","detail":"The JSON is nested 40 levels deep; the limit is 32."}
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
