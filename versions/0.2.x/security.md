---
title: Security Features
description: Every protection Strutvane turns on by default, how to adjust each one in bootstrap/app.ts, the Strict security profile, the security commands (key:rotate, env:encrypt, session:flush, security:check), and what is already proven versus still being built.
---

Strutvane's security rule is short: **safe without doing anything, and adjustable in whichever style you like.** Every protection on this page is on by default. You can apply or skip each one per route, group or controller, or call it as a plain function, and every opt-out is written down where `node strut route:list --security` shows it.

This page is the map. Each protection has a short explanation, a small example where an API exists, and its **status**: what is proven in a prototype, what is still in progress, and what is designed but not built.

:::tip[Coming from Laravel?]
Most of this is what Laravel gives you, with the same names where Laravel has one: `trustProxies()`, `trustHosts()`, `validateCsrfTokens()`, `throttle` with named limiters, signed URLs, `encrypt()`, `key:generate`, `env:encrypt`. The differences:
- security headers (a CSP with nonces, HSTS, `frame-ancestors 'none'`) are **on by default**, not a package;
- trusted hosts are on by default too, not commented out;
- CORS is **off** until you list origins, and `*` with credentials stops the app from starting;
- a `security:check` command reviews your configuration before you deploy.
:::

:::caution[Coming in 0.2]
Strutvane 0.2 isn't released. The **Status** column below says, for each protection, whether it is **proven** in a prototype (with tests), **in progress** in a prototype (written, not finished), **designed** (decided in the blueprint, not built yet) or in a **package after 0.2**. Import paths inside `@strutvane/framework` may still change.
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
  .withRouting({ web, api, health: '/up' })
  .withMiddleware((middleware) => {
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
| Requests | CSRF on every cookie-authenticated write | proven (spike 12) |
| Requests | Trusted hosts: a `Host` header allowlist | in progress (spike 12) |
| Requests | Trusted proxies: `X-Forwarded-*` only from listed proxies | in progress (spike 12) |
| Requests | Body size, JSON depth and JSON key-count limits; prototype-pollution-safe JSON | proven (spike 12); the `limits()` setting is in progress |
| Requests | Request timeouts | designed |
| Responses | CSP with a fresh nonce per response, HSTS (production), `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP/CORP, `frame-ancestors 'none'`, CSP violation reports to the log | in progress (spike 12) |
| CORS | Off by default; an exact allowlist; never `*` with credentials | in progress (spike 12) |
| Sessions and cookies | `HttpOnly`, `Secure`, `SameSite=Lax`, `__Host-` prefix; new id on sign-in and privilege change; idle and absolute timeouts; "sign out other sessions" | proven in the auth prototype (spike 20); encrypted cookies designed |
| Rate limiting | `throttle` with named limiters, per-IP (IPv6 per /64) and per-user keys, `Retry-After` | proven (spike 12, fixed window); sliding window and shared store designed |
| Rate limiting | Lockout with backoff on sign-in and 2FA | proven (spike 20) |
| Validation | Unknown fields rejected; writes only through `fillable` | proven (spikes 11 and 12) |
| Validation | Zod schemas from migrations; ReDoS-safe rules; `Password.min(12).mixedCase().uncompromised()` | designed |
| Authorization | Deny by default; policies; `can` middleware; a dev-only "why was this denied" hint | proven (spike 12); policies compiled to SQL kept from 0.1 |
| Tenancy | The ORM tenant scope everywhere, plus PostgreSQL row-level security | proven (spike 11, and RLS in spikes 3 and 16) |
| Data | Parameterised SQL only | proven (spike 11) |
| Data | `encrypt()` / `decrypt()` (AES-256-GCM) with key rotation; encrypted casts | designed |
| Data | `.secret()` and `.hidden()` columns never serialised, searched or shown | proven (spikes 12 and 14) |
| Output | React escaping; `sanitizeHtml()`; rich-text cast that sanitises on write; CSV formula-injection guard; safe `Content-Disposition` | designed (React escaping is React's) |
| URLs and redirects | Signed and temporary signed URLs (`signed`); open-redirect guard | designed (signed email-verification links are proven in spike 20) |
| Outgoing HTTP | The HTTP client blocks private, loopback and metadata addresses (SSRF guard), with timeouts and a size cap; HMAC webhook signatures | designed (address checks in progress in spike 12) |
| Files | Uploads checked by content, not extension; size and type limits; random stored names; path-traversal and zip-slip guards; a virus-scan hook | designed |
| Secrets and logs | Secrets only in `.env`; `env:encrypt`; log redaction; log-injection-safe lines; no debug page in production | redaction proven in 0.1 and kept; the rest designed |
| Abuse | Honeypot and a CAPTCHA hook for public forms; `idempotent` middleware for payments and imports | designed |
| Auth | 2FA, passkeys, email-link sign-in, password confirmation, token abilities and expiry, audited impersonation | proven (spike 20) |
| Supply chain | `ignore-scripts` with an allowlist; a shipped lockfile; `npm audit` in `doctor` and CI; provenance on publish | proven in the installer (spike 13); `doctor` designed |
| Operations | `security:check`, `session:flush`, `key:rotate`, maintenance-mode secret bypass, an audit log of security events | designed |

Each protection ships with attack-style tests in the framework (tests that play the attacker). The sections below explain each area.

## Requests

### CSRF

Every POST, PUT, PATCH or DELETE that rides on a session cookie must prove it came from your own pages, or it gets a **419**. Bearer-token API calls skip the check. Every way to adjust it is on its own page: [CSRF Protection](../csrf/).

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

`*` alone is refused: it would trust every host.

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

The session cookie is `HttpOnly` (scripts can't read it), `Secure` over HTTPS, `SameSite=Lax`, and uses the `__Host-` name prefix on HTTPS, which stops a sibling subdomain from setting it. A new session id is issued at every sign-in and privilege change (against **session fixation**), sessions end after 2 hours idle or 12 hours in total (30 days with "remember me"), and users can sign out their other sessions. See [Authentication](../authentication/).

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

Signed-in users are counted per user, guests per IP, and IPv6 addresses per /64 block, so rotating through one home network's addresses doesn't help. The planned default limiters are `api`, `login`, `password-reset` and `aggregate`. See [Rate Limiting](../rate-limiting/).

## Validation, authorization and tenancy

- **Unknown fields** in a request body are a 422 `unknown_field`, and writes accept only the model's `fillable` columns, so a form can't set `is_admin`.
- **Deny by default:** a missing policy method denies, generated policies allow only admins, and a record you can't view answers 404, the same as a missing one. In development, a 403 explains which rule denied it. See [Authorization](../authorization/).
- **Tenancy:** with teams on, every query goes through the ORM's tenant scope; on PostgreSQL, row-level security inside the database is a second wall. See [Tenancy](../tenancy/).

## Data and output

- **SQL** only ever gets values as bound parameters. Raw SQL is written with the `` sql`...` `` tagged template, which binds every `${value}`.
- **Hidden and secret columns** (`.hidden()`, `.secret()`, and names such as `password` or `api_token`) are never sent, searched, sorted or shown.
- **Designed, not built yet:** `encrypt()` / `decrypt()` with AES-256-GCM and key rotation, encrypted casts, `sanitizeHtml()`, a rich-text cast that sanitises on write, a formula-injection guard for CSV exports (a cell starting with `=` can run in a spreadsheet), and safe download headers. See [Encryption](../encryption/).

## URLs, outgoing HTTP, files and abuse

:::caution[Coming in 0.2]
**Designed, not built yet:**
- **Signed URLs** (`signed` middleware) and temporary signed URLs; `redirect().intended()` only to same-origin paths, so a link can't bounce users to a phishing site.
- **SSRF guard:** the HTTP client refuses private, loopback and cloud-metadata addresses by default (so a "fetch this URL" feature can't reach your internal network), with timeouts, a response size cap, and HMAC signatures for webhooks.
- **Uploads** checked by their content (magic bytes), not their extension; size and type limits; random stored names; path-traversal and zip-slip guards; an optional virus-scan hook.
- **Abuse:** a honeypot field and a CAPTCHA hook for public forms; the `idempotent` middleware so a retried payment or import runs once.
:::

## Secrets and the debug page

- Secrets live only in `.env`, never in `.env.example`, code or logs. The logging pipeline redacts tokens, passwords, keys and cookies, and writes every record as one line, so a value can't forge extra log lines.
- The detailed **debug page** appears only when `APP_DEBUG=true` **and** `APP_ENV` is `local` or `testing`. In the prototype, production ignores `APP_DEBUG` and logs a warning. The blueprint goes further: the app should refuse to start with `APP_DEBUG=true` and `APP_ENV=production` unless forced. Which of the two ships in 0.2 is still open.

## The Strict security profile

The installer asks for a **security profile** (question 26). **Standard** is everything on this page. **Strict** adds:

- two-factor authentication required for admins;
- a breached-password check on every new password;
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
These commands are designed, not built yet. The output shown is "something like this".
:::

### Keys

```bash
node strut key:generate      # a new APP_KEY in .env (new apps get one from the installer)
node strut key:rotate        # a new APP_KEY; the old one moves to APP_PREVIOUS_KEYS
```

**What you'll see** after `key:rotate`:

```text
  ✔ New APP_KEY written to .env. The previous key moved to APP_PREVIOUS_KEYS.
  → Existing cookies and encrypted values keep working. Deploy the new .env to every server.
```

Old keys stay in `APP_PREVIOUS_KEYS`, so values encrypted with them can still be read.

### Encrypted environment files

```bash
node strut env:encrypt     # encrypts .env.production so the encrypted copy can be committed
node strut env:decrypt     # turns the encrypted copy back into .env.production on the server
```

This is Laravel's way to commit production settings without exposing them. The exact options (which file, where the decryption key comes from) aren't designed yet.

### After an incident

```bash
node strut session:flush          # signs every user out of the web app
node strut token:revoke --all     # revokes every personal access token
```

### `security:check`

Run it before every deploy (and in CI):

```bash
node strut security:check
```

It flags:

- `APP_DEBUG` on in production;
- a missing `APP_KEY`;
- an `APP_URL` that isn't HTTPS;
- insecure cookie settings;
- CORS `*` with credentials;
- a weak CSP (turned off, or scripts allowed through `'unsafe-inline'`, `'unsafe-eval'`, `*`, `http:`, `https:` or `data:`);
- high-severity `npm audit` findings;
- developer tools under `/_strutvane/*` reachable without sign-in.

**What you'll see** (something like this):

```text
  Security check (APP_ENV=production)

  ✔ APP_KEY is set
  ✔ APP_URL uses HTTPS
  ✖ APP_DEBUG=true in production
  ✖ script-src allows 'unsafe-inline'
  ✔ No high-severity npm audit findings

  2 problems. Fix them before you deploy.
```

It exits with code `1` when it finds a problem, so CI can stop the deploy.

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

### `APP_DEBUG=true` in production does nothing

```text
APP_DEBUG=true is ignored outside local and testing environments; production errors stay plain.
```

**Why:** detailed error pages show code and configuration, so they never appear outside `local` and `testing`.

**Fix:** set `APP_DEBUG=false` in production, and read the [logs](../logging/) instead. Each production 500 carries a reference id that matches its log line.

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
