---
title: "Password Reset"
description: "Let people reset a forgotten password safely, change it from their settings, confirm it before sensitive actions, and choose the password rules and breach checks your app enforces."
---

People forget passwords. **Password reset** lets them prove they own their email address and pick a new one, without anyone (you included) ever seeing the old one. This page also covers the rest of a password's life: the **rules** a new password must pass, **changing** it from the settings page, and **confirming** it again before sensitive actions.

Password sign-in is the `password` feature in `config/auth.ts` (on by default; "email link only" apps set `password: false, emailLink: true`). Reset is the `passwordReset` feature, always on when `password` is, and confirming is the `passwordConfirmation` feature. You don't build these routes: they come with `@strutvane/auth`, and your sign-in screens call them.

:::tip[Coming from Laravel?]
These are Fortify's routes with Laravel's names: `POST /forgot-password`, `POST /reset-password`, `PUT /user/password` and `POST /user/confirm-password`. The reset link lasts 60 minutes, like Laravel's default `expire`.

What's stricter:
- A reset **signs the user out everywhere**: every session, every API token, every remembered device and every other emailed link.
- The reset token is stored only as a keyed digest, works **once**, and dies if the password changes any other way.
- Passwords need **12 characters** by default (Laravel's `Password::defaults()` is 8), with no "one symbol, one capital" rules (NIST's advice), plus an optional breached-password check.
:::

:::caution[Coming in 0.2]
Everything on this page is **proven in the auth prototype** (spike 20: 215 tests, including token-reuse races, expiry, lockout lifting and "every other link dies"). It isn't released yet. The routes and answers below are the prototype's. The feature names `passwordReset` and `passwordConfirmation`, the cookie name `strutvane_session`, the lowercase error codes (`weak_password`), the issue shape with `path`, `field` and `message` and the breach check being on by default are the decided names and defaults (the prototype still uses `passwordLogin`, `sv_session`, uppercase codes and an opt-in check). The maximum stays at 256 characters: scrypt's cost doesn't grow with the length. The framework wiring, the reset and settings **screens**, the `user:password` and `auth:clear-resets` commands and the `Password` rule builder are designed, not built.
:::

## The smallest example

Ask for a reset link:

```bash
curl -X POST http://localhost:3000/forgot-password \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" \
  -d '{"email":"ada@my-app.test"}'
```

**What you'll see:**

```json
{"status":"sent"}
```

A mail arrives with a link like this (where it arrives in development: [below](#where-the-mail-goes-in-development)):

```text
http://localhost:3000/reset-password/q8Zr0d0wQm1cJb7X2pV4nT6yK9aE3sH5uL1fG8iD2oA
```

Your reset page reads the token from the link and sends it with the new password:

```bash
curl -i -X POST http://localhost:3000/reset-password \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" \
  -d '{"token":"q8Zr0d0wQm1cJb7X2pV4nT6yK9aE3sH5uL1fG8iD2oA","password":"a long sentence I can remember 42"}'
```

**What you'll see:**

```text
HTTP/1.1 204 No Content
```

The password is changed. The user is **not** signed in by the reset: they sign in with the new password next (and two-factor still applies).

## How a reset works, step by step

1. **The request.** Someone types an email on the "Forgot password?" page. The app always answers `{"status":"sent"}`, whether or not the email has an account, so the page can't be used to find out who has one.
2. **The token.** If the account exists, the app makes a **token**: 256 random bits, written in the link. Only a **keyed digest** of it (an HMAC made with a key derived from your `APP_KEY`) is stored, so even someone reading your database can't use it.
3. **The mail** goes to the address **stored on the account**, never to the text the person typed. (That matters: `Ada@x.test` or a look-alike with an accent can't redirect someone else's reset.) Mail is sent in the background, so the answer takes the same time either way.
4. **The reset.** The new password is checked against the [rules](#password-rules) **first**. A too-short password gets an error and the link still works, so a typo doesn't waste it.
5. **One use.** The token is then used up in one atomic step. If two tabs submit at the same moment, exactly one wins; the other gets `invalid_token`.
6. **Clean-up.** The app signs the user out everywhere, deletes their API tokens, forgets remembered devices, cancels every other reset and email link, lifts a password lockout, and mails a "your password was changed" notice.

### What the reset link looks like

| Detail | Value |
|---|---|
| Path | `/reset-password/<token>` (the token is 43 characters, base64url) |
| Lifetime | 60 minutes (`links.passwordResetMinutes`) |
| Uses | one |
| Dies early when | the password changes by any route, or another reset completes |

## Password rules

Every new password (registration, reset, change) passes the same rules:

| Rule | Default | Setting in `config/auth.ts` |
|---|---|---|
| At least this many characters | **12** | `passwords.min` (8 or more) |
| At most this many characters | 256 | `passwords.max` |
| Not found in a data breach | **on** | see [Breached passwords](#breached-and-common-passwords) |

Length is counted in characters after Unicode normalisation, so an emoji or an accented letter counts as one. By default there are **no composition rules** ("one capital, one digit, one symbol"): they make passwords harder to remember without making them harder to guess, so NIST (SP 800-63B) advises against them. A long sentence is a great password. Apps that are *required* to use composition rules (a customer contract, an auditor) can opt in, see [Your own rules](#your-own-rules).

Change the length rules:

```ts title="config/auth.ts"
import { defineAuthConfig } from '@strutvane/auth'

export default defineAuthConfig({
  appUrl: process.env.APP_URL ?? 'http://localhost:3000',
  passwords: { min: 14, max: 200 },
})
```

**What you'll see:** a 13-character password is refused. A value below 8 stops the app at start-up:

```text
RangeError: auth config: passwords.min must be at least 8 and at most max
```

### What a refused password looks like

```text
HTTP/1.1 422 Unprocessable Content
content-type: application/problem+json

{"type":"about:blank","title":"Choose a stronger password.","status":422,"code":"weak_password","issues":[{"path":["password"],"field":"password","code":"too_short","message":"The password must be at least 12 characters."}]}
```

Your form shows a message per issue `code`:

| Issue code | Meaning |
|---|---|
| `too_short` | fewer characters than `passwords.min` |
| `too_long` | more characters than `passwords.max` |
| `compromised` | the breach or common-password check matched |
| `check_unavailable` | the breach service couldn't be reached and your app [fails closed](#when-the-breach-service-is-down) |
| `required` (`validation_failed`) | no password was sent, or it wasn't a string |

## Breached and common passwords

A password that appeared in a data breach is the first one attackers try, so the default rule, `Password.min(12).uncompromised()`, refuses them. The check is pluggable; two come with the engine:

| Check | What it does | Network |
|---|---|---|
| `commonPasswordCheck` | refuses a short list of the most common long passwords (`password1234`, `qwerty123456`, `correcthorsebatterystaple`…) and one character repeated | none |
| `rangeBreachCheck(fetchRange)` | asks a "k-anonymity" breach service: only the **first 5 characters** of the password's SHA-1 leave your server, and the service answers with every matching suffix | one request |

The breach check is **on by default** (the auth prototype still has it as an opt-in hook). The **Strict** security profile in the installer (question 26) also makes it fail closed.

:::caution[Coming in 0.2]
**Planned API (a sketch: names may change).** The check functions and the options `passwordCheck` and `passwordCheckOnUnknown` are the prototype's. *Where* you pass them in the framework (a provider, or `config/auth.ts`) isn't decided. The example below uses a provider.
:::

```ts title="app/providers/auth.provider.ts"
import { rangeBreachCheck } from '@strutvane/auth'
import { safeFetch } from '@strutvane/framework'

/**
 * Refuse passwords found in public breaches. Only the first 5 hex characters of the SHA-1
 * leave the server. safeFetch adds a timeout and a response size cap.
 */
export const passwordCheck = rangeBreachCheck(async (prefix) => {
  const response = await safeFetch(`https://api.pwnedpasswords.com/range/${prefix}`, { timeoutMs: 3000 })
  if (response.status !== 200) throw new Error(`breach service answered ${response.status}`)
  return response.text()
})
```

**What you'll see** when someone picks a breached password:

```json
{"type":"about:blank","title":"Choose a stronger password.","status":422,"code":"weak_password","issues":[{"path":["password"],"field":"password","code":"compromised","message":"This password has appeared in a data breach. Choose another one."}]}
```

### When the breach service is down

If the check can't run (timeout, outage), it answers "unknown". You choose what happens then:

| `passwordCheckOnUnknown` | What happens | When to pick it |
|---|---|---|
| `'open'` (default) | the password is **allowed**, and a warning is logged: `auth: the password check could not run` | most apps: a third-party outage shouldn't stop every sign-up and reset |
| `'closed'` | the password is **refused** with issue `check_unavailable` | apps where a weak password is worse than a failed sign-up |

### Your own rules

:::caution[Coming in 0.2]
**Planned API (a sketch: names may change).** The `Password` rule builder is decided but not built. The default is `Password.min(12).uncompromised()`. `mixedCase()`, `numbers()` and `symbols()` exist only for apps that are required to use composition rules.
:::

```ts title="config/auth.ts"
import { defineAuthConfig } from '@strutvane/auth'
import { Password } from '@strutvane/framework'

export default defineAuthConfig({
  appUrl: process.env.APP_URL ?? 'http://localhost:3000',
  // A bank customer's contract demands composition rules. Most apps keep the default.
  passwordRule: Password.min(14).mixedCase().numbers().uncompromised(),
})
```

**What you'll see:** `Correct battery staple horse` (no digit) is refused with an issue `code` such as `numbers`; the exact codes aren't final.

## Changing a password from settings

A signed-in user changes their password with their current one:

```bash
curl -i -X PUT http://localhost:3000/user/password \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" \
  -H "Cookie: strutvane_session=<your session>" \
  -d '{"current":"a long sentence I can remember 42","password":"an even longer sentence I will remember 43"}'
```

**What you'll see:** `204 No Content`, and a **new session id** in `set-cookie` (the old id stops working). On top of that:

- **every other session** of this user is signed out (a thief's session included);
- outstanding reset links stop working (an old link must never reset the *new* password);
- remembered "skip two-factor on this device" browsers are forgotten;
- a "your password was changed" mail goes to the account's address.

API tokens are **kept** on a change from settings (the user is clearly in control). A reset, where the user may *not* be in control, revokes them.

A wrong current password:

```json
{"type":"about:blank","title":"These credentials do not match our records.","status":422,"code":"invalid_credentials","issues":[{"path":["current"],"field":"current","code":"mismatch","message":"The current password is wrong."}]}
```

**Accounts without a password** (people who sign in with an email link or a passkey) set their first password the same way, without `current`, after a recent [password confirmation](#confirming-the-password-before-sensitive-actions) with their passkey.

While an admin is [impersonating](../authentication/#impersonation) a user, changing that user's password is refused.

## Confirming the password before sensitive actions

Some actions ask for the password again even when the user is signed in: turning two-factor on or off, new recovery codes, starting an impersonation, and any route you protect with the `password.confirm` middleware. Without a recent confirmation they answer:

```text
HTTP/1.1 423 Locked
content-type: application/problem+json

{"type":"about:blank","title":"Confirm your password to continue.","status":423,"code":"password_confirmation_required"}
```

Your UI asks for the password and confirms:

```bash
curl -i -X POST http://localhost:3000/user/confirm-password \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" \
  -H "Cookie: strutvane_session=<your session>" \
  -d '{"password":"a long sentence I can remember 42"}'
```

**What you'll see:** `204 No Content`. The confirmation counts for **3 hours** (`sessions.confirmPasswordMinutes`, Laravel's `password_timeout`), then retry the original action. Confirmations are limited to 5 attempts per 5 minutes per account. Passkey-only users confirm with a passkey (`mode: "confirm"`, see [Authentication](../authentication/#signing-in-with-a-passkey)).

Protect your own route the Laravel way:

```ts title="routes/web.ts"
import { defineRoutes, Route } from '@strutvane/framework'
import { BillingController } from '../app/http/controllers/billing.controller.ts'

export default defineRoutes([
  Route.delete('/billing/card', [BillingController, 'removeCard']).middleware('auth', 'password.confirm'),
])
```

:::caution[Coming in 0.2]
The `password.confirm` middleware alias is designed as a thin wrapper over the auth engine and isn't built yet.
:::

## Rate limits

| What | Limit (default) | Setting |
|---|---|---|
| Asking for a reset link, per IP | 5 per 15 minutes | `limits.resetPerIp` (the named limiter `password-reset`) |
| Asking for a reset link, per account | 3 per 15 minutes | `limits.resetPerAccount` |
| Submitting a new password, per IP | 5 per 15 minutes | (same as `resetPerIp`) |
| Confirming the password, per account | 5 per 5 minutes | `limits.confirmPasswordPerAccount` |

IPv6 addresses are grouped by `/64`. The limits use the shared cache, so they hold across several servers. Over the limit:

```text
HTTP/1.1 429 Too Many Requests
retry-after: 600
content-type: application/problem+json

{"type":"about:blank","title":"Too many attempts. Please try again later.","status":429,"code":"rate_limited"}
```

## When mail is down

The reset request answers `{"status":"sent"}` **even if the mail server is down**. That's deliberate: an answer that depended on delivery would reveal whether the account exists. The failure is written to your log (by mail kind only; the link is never logged), and with a queue (0.3) the mail is retried.

So when a user says "the reset mail never came":

1. Check the log for a mail failure.
2. Check where mail goes in this environment (next section).
3. Let them ask again after a minute: a new link works even if the first one arrives late, and both stop working once one is used.

## Where the mail goes in development

- **With Docker,** every mail lands in the **Mailpit** inbox at `http://localhost:8025`. Open it, click the mail, click the link.
- **Without Docker,** new apps use `MAIL_MAILER=log`: the whole mail, link included, is written to your log (`storage/logs/`). Copy the link from there.

See [Mail](../mail/) for production mailers.

## Resetting a password from the command line

The installer's first admin gets a generated password, shown once, that **must be changed at first sign-in** (a password you typed yourself during install isn't forced). Locked out of the admin account? Set a new password from the terminal:

```bash
node strut user:password admin@my-app.test
```

:::caution[Coming in 0.2]
`node strut user:password` is designed (the installer prototype already points to it), not built. `node strut auth:clear-resets` (deletes expired reset tokens, email links and invitations, usually from the scheduler) is designed too.
:::

## Common mistakes

### The reset link says "invalid or has expired"

```text
{"type":"about:blank","title":"This link or token is invalid or has expired.","status":422,"code":"invalid_token"}
```

**Why:** one of these, all answered the same on purpose: the link is older than 60 minutes; it was already used; another reset was completed since; the password was changed in settings since; or the link was cut short when copied (mail apps sometimes wrap long links).
**Fix:** ask for a new link from the "Forgot password?" page. If links expire before people get to them, lengthen them:

```ts title="config/auth.ts"
links: { passwordResetMinutes: 120 },
```

### My new password is refused as `compromised`, but it's long and random

**Why:** it was found in a breach list (random-looking strings are reused more than you'd think), or it's on the common list after spaces are removed: `correct horse battery staple` is the most famous example.
**Fix:** pick another one. A password manager's generator is the easiest way.

### Nobody can sign up or reset since the breach service went down

```json
{"code":"weak_password","issues":[{"path":["password"],"field":"password","code":"check_unavailable","message":"We could not check this password right now. Try again in a minute."}]}
```

**Why:** your app fails closed (`passwordCheckOnUnknown: 'closed'`) and the service can't be reached.
**Fix:** switch to `'open'` until it's back, or check the network path from your server (proxies, firewall). The [HTTP client](../http-client/) refuses private addresses, so a breach mirror inside your network must be allowed explicitly.

### After resetting, my scripts get 401

**Why:** a reset revokes every API token, on purpose: if someone else had access, their tokens die too.
**Fix:** create new tokens after a reset. See [API Tokens](../api-tokens/).

### "These credentials do not match" when changing the password

```text
{"code":"invalid_credentials","issues":[{"path":["current"],"field":"current","code":"mismatch","message":"The current password is wrong."}]}
```

**Why:** the `current` field doesn't match. Password managers sometimes fill the *new* password into both fields.
**Fix:** send the current password in `current` and the new one in `password`.

### My reset page loses the token when it reloads

**Why:** the page reads the token from the URL, then a redirect drops it.
**Fix:** read the last path segment once and keep it in the form:

```ts title="resources/ui/pages/auth/reset-password.tsx"
const token = window.location.pathname.split('/').pop() ?? ''
```

## Next steps

- [Authentication](../authentication/): every sign-in method and the sessions list.
- [Hashing](../hashing/): how passwords are stored.
- [Email Verification](../email-verification/): proving an address before using it.
- [Mail](../mail/): sending real mail in production.
