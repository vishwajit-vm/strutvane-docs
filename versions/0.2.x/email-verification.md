---
title: "Email Verification"
description: "Make sure people own the email address they signed up with: switch verification on, understand the signed link, resend it, require a verified address on routes, and handle expired or edited links."
---

**Email verification** proves that a person can read mail sent to the address on their account. Until they click the link you mailed them, the account is **unverified**. You'd want this before sending invoices to that address, before letting them join a team, or before trusting the address for a password reset.

In Strutvane it's the `emailVerification` switch in `config/auth.ts`. The installer turns it on by default (question 6, "Extra sign-in security").

:::tip[Coming from Laravel?]
It's Laravel's `MustVerifyEmail` flow with the same URLs: the link is `/email/verify/{id}/{hash}?expires=…&signature=…`, `POST /email/verification-notification` resends it, and the `verified` middleware guards routes.

What's different:
- The `{hash}` is a **keyed** digest of the address (not a plain SHA-1), so nobody can compute it from an email alone.
- Resending is throttled for you: **60 seconds** between mails and **6 per hour**.
- With verification on, registration never reveals that an email is already taken.
:::

:::caution[Coming in 0.2]
The verification flow is **proven in the auth prototype** (spike 20: signed links, edited, expired and other-user links, idempotent verify, resend throttling, and a fuzz test where any one-character change to a link is refused). It isn't released yet. The `verified` middleware, the "check your inbox" screen and the framework routes are designed, not built. The answers below are the prototype's.
:::

## The smallest example

1. Turn it on:

   ```ts title="config/auth.ts"
   import { defineAuthConfig } from '@strutvane/auth'

   export default defineAuthConfig({
     appUrl: process.env.APP_URL ?? 'http://localhost:3000',
     features: { emailVerification: true },
   })
   ```

2. A new user signs up (with `registration` on) or is created by an admin. They receive a mail with a link like:

   ```text
   http://localhost:3000/email/verify/0193a1c2-7e4b-7c1d-9f2e-5a6b7c8d9e0f/4f1c2e7a0b4d6f8e1a3c5b7d9e0f2a4c6b8d0e1f?expires=1763202121&signature=5d1c8a3e…
   ```

3. They click it.

**What you'll see:** the link answers `204 No Content` (your page then shows "Thanks, your email is verified"), and `GET /user` now says:

```json
{ "user": { "id": "0193a1c2-7e4b-7c1d-9f2e-5a6b7c8d9e0f", "email": "grace@example.com", "emailVerified": true } }
```

## The link, piece by piece

```text
/email/verify/{id}/{hash}?expires={expires}&signature={signature}
```

| Part | Example | What it is |
|---|---|---|
| `{id}` | `0193a1c2-7e4b-…` | the user's id (a UUID) |
| `{hash}` | `4f1c2e7a…` (40 hex characters) | a keyed digest of the user's **current** address |
| `expires` | `1763202121` | when the link stops working, in seconds since 1970 |
| `signature` | `5d1c8a3e…` (64 hex characters) | an HMAC over the three values above, made with a key derived from your `APP_KEY` |

What this gives you:

- **It can't be edited.** Change any character (another user's id, a later `expires`) and the signature no longer matches.
- **It expires.** 60 minutes by default (`links.verificationMinutes`).
- **It's tied to the address.** If the user changes their email, links sent to the old address stop working, because the `{hash}` no longer matches.
- **It needs no session.** The signature is the proof, so the link works on a phone even if the user signed up on a laptop.
- **Clicking it twice is harmless.** The second click also answers `204`.
- **Nothing is stored.** The link carries everything; there is no table of verification tokens to clean up.

## Resending the link

A signed-in, unverified user asks for a fresh link (your "check your inbox" screen has a "Send it again" button):

```bash
curl -X POST http://localhost:3000/email/verification-notification \
  -H "Origin: http://localhost:3000" \
  -H "Cookie: strutvane_session=<your session>"
```

**What you'll see:** one of two answers:

```json
{"status":"sent"}
```

```json
{"status":"already-verified"}
```

Throttling, per account:

| Limit | Default | Setting |
|---|---|---|
| Wait between two mails | 60 seconds | `limits.verificationResendCooldown` |
| Mails per hour | 6 | `limits.verificationResendPerAccount` |

Only a mail that was actually sent starts the 60-second wait, so a refused click doesn't push it further away. Too soon:

```text
HTTP/1.1 429 Too Many Requests
retry-after: 42
content-type: application/problem+json

{"type":"about:blank","title":"Too many attempts. Please try again later.","status":429,"code":"RATE_LIMITED"}
```

Show the `retry-after` seconds as a countdown on the button.

## Requiring a verified email on routes

Use the `verified` middleware, Laravel's name:

```ts title="routes/api.ts"
import { defineRoutes, Route } from '@strutvane/framework'
import { InvoiceController } from '../app/http/controllers/invoice.controller.ts'
import { PostController } from '../app/http/controllers/post.controller.ts'

export default defineRoutes([
  // Anyone signed in may read; only verified users may write.
  Route.apiResource('posts', PostController)
    .middlewareFor(['index', 'show'], 'auth')
    .middlewareFor(['store', 'update', 'destroy'], 'auth', 'verified'),

  // A whole group that needs a verified address.
  Route.group({ prefix: 'billing', middleware: ['auth', 'verified'] }, [
    Route.get('/invoices', [InvoiceController, 'index']).name('billing.invoices'),
  ]),
])
```

**What you'll see** for an unverified user:

```text
HTTP/1.1 403 Forbidden
content-type: application/problem+json

{"type":"about:blank","title":"Verify your email address first.","status":403,"code":"EMAIL_NOT_VERIFIED"}
```

Your UI can recognise `EMAIL_NOT_VERIFIED` and send the user to the "check your inbox" screen.

When `emailVerification` is **off**, `verified` lets everyone through: there's nothing to verify against.

:::caution[Coming in 0.2]
The `verified` alias is designed as a thin wrapper over the engine's `assertVerified(user)` and isn't built yet. Like every protection, it will also be usable as a controller `static middleware` entry or a wrapper function (see [Security Features](../security/)); those names aren't final.
:::

### Checking in your own code

Inside a controller, the same check is one call on the auth engine. In the prototype it's `verification.assertVerified(user)`, which throws the `EMAIL_NOT_VERIFIED` error above:

```ts title="app/http/controllers/invoice.controller.ts"
// Planned wiring: how a controller reaches the auth engine isn't final.
auth.verification.assertVerified(user)
```

## Registration and verification together

With both `registration` and `emailVerification` on, signing up **doesn't sign you in**:

```bash
curl -X POST http://localhost:3000/register \
  -H "Content-Type: application/json" -H "Origin: http://localhost:3000" \
  -d '{"name":"Grace","email":"grace@example.com","password":"a long sentence I can remember 42"}'
```

**What you'll see:** `{"status":"verification-sent"}` and no session. You get the **same answer if the email is already taken**; the owner of that address gets a "someone tried to register with your address" mail instead of a verification link. That way, the sign-up form can't be used to find out who has an account.

## Edge cases you'll meet

| Situation | What happens |
|---|---|
| The link is older than 60 minutes | `422 INVALID_TOKEN`; the user asks for a new one |
| The link was edited (id, hash, expires or signature) | `422 INVALID_TOKEN` |
| The user changed their address after the mail was sent | `422 INVALID_TOKEN` (the hash no longer matches) |
| The user already verified | `204`, nothing changes |
| The user was deleted | `422 INVALID_TOKEN`, the same answer as an edited link |
| The link is opened on another device | works: no session needed |
| `APP_KEY` was rotated since the mail | still works: links signed with a key in `APP_PREVIOUS_KEYS` are accepted (decided; the prototype doesn't do this yet, see [Encryption](../encryption/#rotating-app_key)) |
| A mail scanner opens the link before the user | the address is verified by the scanner's visit; harmless, since the scanner reads the same inbox |

Every bad link gets the same answer on purpose, so nobody learns which part was wrong.

## When mail is down

`POST /email/verification-notification` still answers `{"status":"sent"}` and starts the 60-second wait. The failure goes to your log (the mail kind and user id only; the link is never logged). If users report missing mail, check the log, then where mail goes (below). Once a queue is available (0.3), failed mails are retried.

## Where the mail goes in development

- **With Docker,** open the **Mailpit** inbox at `http://localhost:8025` and click the link in the mail.
- **Without Docker,** new apps use `MAIL_MAILER=log`: the mail, with its link, is written to your log in `storage/logs/`. Copy the link into your browser.

Links are built from `APP_URL`, so they point at `http://localhost:3000` in development. On a server, set `APP_URL` to your real address, or the links will point at localhost.

## Settings

| Setting in `config/auth.ts` | Default | Meaning |
|---|---|---|
| `features.emailVerification` | off (the installer turns it on) | the whole feature; off means no routes at all |
| `links.verificationMinutes` | 60 | how long a link works |
| `limits.verificationResendCooldown` | 1 per 60 s | wait between resends |
| `limits.verificationResendPerAccount` | 6 per hour | resends per hour |

A switched-off feature doesn't exist: `/email/verify/…` and `/email/verification-notification` answer the same `404 NOT_FOUND` as a path that was never there.

## Common mistakes

### Every link answers INVALID_TOKEN

```text
{"type":"about:blank","title":"This link or token is invalid or has expired.","status":422,"code":"INVALID_TOKEN"}
```

**Why:** most often the link is older than 60 minutes, the mail app wrapped the long link across two lines so it was cut, or `APP_KEY` differs between the server that sent the mail and the one that checked it.
**Fix:** ask for a new link. If you run several servers, make sure they all share the same `APP_KEY`.

### The links in the mail point at localhost on my server

**Why:** links are built from `APP_URL`, and the server still has the development value.
**Fix:**

```ini title=".env.production"
APP_URL=https://app.example.com
```

### "Send it again" answers 429

```text
{"type":"about:blank","title":"Too many attempts. Please try again later.","status":429,"code":"RATE_LIMITED"}
```

**Why:** the last mail went out less than 60 seconds ago, or 6 mails were sent this hour.
**Fix:** wait for the seconds in the `retry-after` header. Disable the button and show a countdown so people don't keep clicking.

### `/email/verify/…` answers 404

```text
{"type":"about:blank","title":"Not found.","status":404,"code":"NOT_FOUND"}
```

**Why:** `emailVerification` is off, so its routes don't exist.
**Fix:**

```ts title="config/auth.ts"
features: { emailVerification: true },
```

### Verified users still get EMAIL_NOT_VERIFIED

**Why:** the request is made with an old session or token that was loaded before verification, or as a different user than you think.
**Fix:** check `GET /user` with the same cookie or token; `emailVerified` must be `true`. Sign out and in again if your UI cached the user.

### My mail doesn't arrive at all

**Why:** in development without Docker, nothing is sent: `MAIL_MAILER=log` writes mail to the log.
**Fix:** look in `storage/logs/`, or start the Docker services and open Mailpit at `http://localhost:8025`. See [Mail](../mail/).

## Next steps

- [Authentication](../authentication/): registration, sign-in and the auth middleware.
- [Password Reset](../passwords/): the other emailed link.
- [Mail](../mail/): sending real mail in production.
- [Middleware](../middleware/): how `auth` and `verified` run on routes.
