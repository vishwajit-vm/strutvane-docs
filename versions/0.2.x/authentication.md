---
title: "Authentication"
description: "Sign people in with a password, an emailed link or a passkey; add two-factor, sessions, API tokens, teams and impersonation; and switch each feature on or off."
---

**Authentication** is how your app knows *who* is making a request: someone signs in once, and every later request carries proof that it's them. (Deciding *what* they may do is [authorization](../authorization/), a separate step.) In Strutvane, authentication comes from **`@strutvane/auth`**, which is part of every new app. You choose what it does in the installer, and you can change your mind later in `config/auth.ts`.

This page covers every sign-in method, two-factor, passkeys, sessions, API tokens, teams, impersonation and the switches that turn each feature on or off.

:::caution[Coming in 0.2]
The auth engine is **proven in a prototype** (spike 20: 215 tests, run against an in-memory store and a real SQLite database, including attack-style tests). The framework wiring is **not built yet**: the ORM-backed store, the routes inside your app, the middleware aliases, the screens (sign-in, 2FA challenge, settings), the `user:create` and `tokens:prune` commands, and changing your email address. The examples below use the prototype's routes and responses; names may still change before 0.2 is released.
:::

:::tip[Coming from Laravel?]
`@strutvane/auth` is **Fortify + Sanctum** in one package: a `features` switch list (Fortify's `features` array), the same routes (`/login`, `/register`, `/forgot-password`, `/user/two-factor-authentication`), cookie sessions for your own UI and personal access tokens with abilities for APIs (Sanctum).

What's different:
- **Passkeys and passwordless email links are built in**, not add-ons.
- **Public registration is off by default**: B2B apps usually invite people.
- Tokens **expire after a year** by default (Sanctum's default is never).
- Socialite, Passport and SSO become the add-ons `social-login`, `oauth-server` and `sso`.
:::

## The smallest example

A new app with the default answers (**email and password**) already has sign-in. Start the app and sign in as the first admin from the API:

```bash
curl -i -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" \
  -d '{"email":"admin@my-app.test","password":"the-password-the-installer-showed-you"}'
```

**What you'll see** (something like this):

```text
HTTP/1.1 200 OK
content-type: application/json
set-cookie: sv_session=4kQ…; HttpOnly; SameSite=Lax; Path=/

{"status":"signed-in"}
```

The `sv_session` cookie is your **session**: a random id the browser sends with every later request, so the app knows it's you. On `https` the cookie is named `__Host-sv_session`, which a sibling subdomain can't set or overwrite. Ask who you are:

```bash
curl http://localhost:3000/user -H "Cookie: sv_session=<the value from set-cookie>"
```

**What you'll see:**

```json
{
  "user": { "id": "1", "email": "admin@my-app.test", "name": "Admin", "emailVerified": true, "twoFactorEnabled": false },
  "session": { "method": "password", "createdAt": 1763198521000, "passwordConfirmedAt": null },
  "impersonator": null,
  "team": null,
  "roles": ["admin"]
}
```

In a real app you rarely call these routes by hand: the sign-in screen in your React UI does it for you.

## Choosing what you need at install time

The installer asks about sign-in in its **Sign-in** and **Teams** groups (see [Installation](../installation/)). Each answer switches on features in `config/auth.ts`.

| # | Question | Choices (default **bold**) | What it switches on |
|---|---|---|---|
| 5 | ★ How do people sign in? | **Email and password**, email link only (passwordless), no sign-in | `passwordLogin`, or `emailLink`, or nothing |
| 6 | Extra sign-in security | **two-factor**, **email verification**, passkeys, public registration (off) | `twoFactor`, `emailVerification`, `passkeys`, `registration` |
| 7 | Social login | **none**, Google, Microsoft, GitHub, Apple | the `social-login` add-on |
| 8 | Enterprise SSO (needs teams) | **no**, yes | the `sso` add-on |
| 9 | API access for other apps | **personal access tokens**, OAuth 2.1 server, none | `tokens`, or the `oauth-server` add-on |
| 10 | Starting roles | **admin + member**, admin + manager + member + viewer | the role preset |
| 11 | ★ Teams | **no**, yes | `teams` |
| 12 | How a request picks its team | **team switcher in the app**, subdomain | how the current team is chosen |

★ means the question is asked in **Recommended** mode; the others take their default unless you choose **Custom**.

**The three sign-in modes (question 5):**

- **Email and password** follows Fortify's model. Password reset is always part of it.
- **Email link only** is **passwordless**: people type their email and get a single-use link that signs them in. Two-factor and passkeys still work on top.
- **No sign-in** is for internal tools behind a gateway. Your generated API then **requires an API token** on every route unless you opt a route out, so nothing is open by accident (deny by default).

:::caution[Planned after 0.2]
**Social login** (question 7) needs the `@strutvane/social-login` package, planned for phase 2. **Enterprise SSO** (question 8) and the **OAuth 2.1 server** (question 9) need `@strutvane/sso` and `@strutvane/oauth-server`, planned for phase 4. The installer only offers a package once it's published. See [social-login](../packages/social-login/), [sso](../packages/sso/) and [oauth-server](../packages/oauth-server/).
:::

## Feature switches

`config/auth.ts` holds one switch per feature. Here is a typical file, with two-factor, email verification and passkeys on:

```ts title="config/auth.ts"
import { defineAuthConfig } from '@strutvane/auth'

export default defineAuthConfig({
  appUrl: process.env.APP_URL ?? 'http://localhost:3000',
  features: {
    passwordLogin: true,
    registration: false,
    emailVerification: true,
    emailLink: false,
    twoFactor: true,
    passkeys: true,
    tokens: true,
    teams: false,
    impersonation: false,
  },
  passkeys: { rpId: 'localhost', rpName: 'My App', origins: ['http://localhost:3000'] },
  roles: 'admin-member',
})
```

**What you'll see:** the app starts with exactly those routes. If you turn on `passkeys` without the `passkeys` block, start-up stops with:

```text
TypeError: auth config: features.passkeys needs a `passkeys: { rpId, rpName, origins }` block
```

| Switch | Default | What it gives you |
|---|---|---|
| `passwordLogin` | on | `/login`, `/forgot-password`, `/reset-password`, `PUT /user/password` |
| `registration` | **off** | `/register` (public sign-up) |
| `emailVerification` | off | signed verification links, `/email/verification-notification` |
| `emailLink` | off | passwordless `/email-link` |
| `twoFactor` | off | authenticator-app codes and recovery codes |
| `passkeys` | off | passkey sign-in and passkeys as a second factor |
| `tokens` | off | personal access tokens |
| `teams` | off | teams, invitations, switching |
| `impersonation` | off | admins can sign in as another user |

(These are the engine's own defaults. The installer turns on the ones your answers picked, so a default install has `twoFactor`, `emailVerification` and `tokens` on.)

**A switched-off feature doesn't exist.** It has no routes, and its paths answer with the **same 404, byte for byte**, as a path that was never there. Its services refuse too, with `NOT_FOUND`, so calling one from your own controller can't bring it back. Why: a `403` would tell an attacker the feature exists.

```text
HTTP/1.1 404 Not Found
content-type: application/problem+json

{"type":"about:blank","title":"Not found.","status":404,"code":"NOT_FOUND"}
```

:::note[The error bodies on this page]
They come from the prototype's small HTTP adapter. In the framework, the same `code` and status are rendered by the framework's problem renderer, so `type`, `title` and an added `detail` may read differently. Branch on `code`, which is stable.
:::

## Signing in with a password

Send the email and password. Add `"remember": true` for a long-lived session (see [Sessions](#sessions)).

```bash
curl -i -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" \
  -d '{"email":"ada@my-app.test","password":"correct horse battery staple","remember":true}'
```

**What you'll see:** one of two answers.

```json
{"status":"signed-in"}
```

or, when the user has two-factor turned on:

```json
{"status":"two-factor-required","methods":["totp","recovery-code","passkey"]}
```

In the second case the user is **not signed in yet**. They hold a short **pending session** (10 minutes) that counts as a guest everywhere, until they answer the [two-factor challenge](#two-factor-authentication).

Every failure gives the **same answer**, whether the email is unknown or the password is wrong, so nobody can find out which emails have accounts:

```text
HTTP/1.1 422 Unprocessable Content
content-type: application/problem+json

{"type":"about:blank","title":"These credentials do not match our records.","status":422,"code":"INVALID_CREDENTIALS"}
```

Behind the scenes:
- Passwords are hashed with **scrypt** (`ln=17`, about 128 MiB of memory per hash), Node's built-in memory-hard algorithm. Old hashes are upgraded on the next sign-in.
- An unknown email still runs one full hash, so the response time doesn't give it away either.
- Every sign-in starts a **new session id**, so an id planted before sign-in is useless (session fixation).
- Passwords need at least **12 characters** (`passwords.min`, minimum 8). An optional check against known breached passwords can be plugged in.

To sign out:

```bash
curl -X POST http://localhost:3000/logout -H "Origin: http://localhost:3000" -H "Cookie: sv_session=<your session>"
```

**What you'll see:** `204 No Content`, and the cookie is cleared.

## Signing in with an email link

An **email link** (also called a magic link) signs someone in without a password. Turn on `emailLink`, or answer "Email link only" in the installer.

**Step 1: ask for a link.**

```bash
curl -X POST http://localhost:3000/email-link \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" \
  -d '{"email":"ada@my-app.test"}'
```

**What you'll see:**

```json
{"status":"sent"}
```

You get this answer **even for an unknown email**, so it can't be used to find accounts. If the account exists, a mail with a link like `http://localhost:3000/email-link/<token>` is sent.

**Step 2: use the link.** The link opens a page in your app, which confirms with a **POST** (mail scanners open links with GET to check them, and must not use up the link):

```bash
curl -X POST http://localhost:3000/email-link/<token> \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" \
  -H "Cookie: sv_link=<the nonce cookie set in step 1>" \
  -d '{"remember":false}'
```

**What you'll see:** `{"status":"signed-in"}`, or `two-factor-required` when the user has two-factor on (an email link never skips 2FA).

The link:
- works **once** and expires after **15 minutes**;
- is **bound to the browser that asked for it** with a cookie, so a forwarded or intercepted link is useless on another device. Opening it in the wrong browser doesn't use it up, so the right browser can still use it.

:::note[Where the mail goes in development]
- **With Docker**, every mail lands in the **Mailpit** inbox at `http://localhost:8025`. See [Docker](../docker/).
- **Without Docker**, new apps use `MAIL_MAILER=log`: the mail, link included, is written to your log instead of being sent.
:::

## Signing in with a passkey

A **passkey** is a sign-in key stored on your phone, laptop or password manager (the WebAuthn standard). It can't be phished, and it replaces both the password and the second step. Turn on `passkeys` and give the `passkeys` block in `config/auth.ts`.

A passkey sign-in is two requests that your sign-in page makes with the browser's `navigator.credentials.get()`:

```ts title="resources/ui/lib/passkey-sign-in.ts"
import { startAuthentication } from '@simplewebauthn/browser'

export async function signInWithPasskey(): Promise<void> {
  const options = await fetch('/passkeys/options', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode: 'passwordless' }),
  }).then((response) => response.json())

  const response = await startAuthentication({ optionsJSON: options })

  const result = await fetch('/passkeys/authenticate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ response, remember: true }),
  }).then((res) => res.json())

  console.log(result) // { status: 'signed-in' }
}
```

**What you'll see:** the browser shows its passkey prompt, then `{ status: 'signed-in' }`. A passkey counts as **two factors** (the device plus your fingerprint, face or PIN), so a user with two-factor on isn't asked for a code.

The `mode` is `passwordless` for signing in, `second-factor` for answering a two-factor challenge with a passkey, and `confirm` for [confirming your password](#confirming-the-password) when you have no password. Signed-in users manage their passkeys at `/user/passkeys` (add, list, rename, remove; several per user).

:::note
`@simplewebauthn/browser` is the browser half of the library the engine uses on the server (`@simplewebauthn/server` 14.1.0, MIT). The generated sign-in screen will do this for you; the code above shows what happens.
:::

## Registration

Public sign-up is **off by default**, because most B2B apps invite people instead. Turn it on with `registration: true` (or the installer's "public registration" choice).

```bash
curl -X POST http://localhost:3000/register \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" \
  -d '{"name":"Grace","email":"grace@example.com","password":"correct horse battery staple"}'
```

**What you'll see:**
- With email verification **on**: `{"status":"verification-sent"}`, and no session yet. You get the **same answer when the email is already taken**; the owner of that address gets a "someone tried to register" mail instead. So registration can't reveal who has an account.
- With email verification **off**: `{"status":"signed-in"}`. A taken email has to be reported, as `EMAIL_TAKEN` (rate-limited per IP).

New users get **no roles**. Give them roles yourself, or through a team invitation.

## Password reset

Password reset is part of `passwordLogin`. It's two requests, like Laravel:

```bash
curl -X POST http://localhost:3000/forgot-password \
  -H "Content-Type: application/json" -H "Origin: http://localhost:3000" \
  -d '{"email":"ada@my-app.test"}'
```

**What you'll see:** `{"status":"sent"}`, for known and unknown emails alike. The mail links to `http://localhost:3000/reset-password/<token>`; your reset page then sends:

```bash
curl -X POST http://localhost:3000/reset-password \
  -H "Content-Type: application/json" -H "Origin: http://localhost:3000" \
  -d '{"token":"<token from the link>","password":"a brand new long password"}'
```

**What you'll see:** `204 No Content`. The reset token:
- lasts **60 minutes** and works **once**;
- dies if the password changes any other way.

A successful reset **signs the user out everywhere**: it revokes every session, every API token, every remembered device and every pending email link, and it lifts a lockout.

A signed-in user changes their own password with `PUT /user/password` and `{ "current": "…", "password": "…" }`.

## Email verification

With `emailVerification` on, new users get a **signed link**: the link carries a signature made with your `APP_KEY`, so it can't be edited or forged. It has Laravel's shape:

```text
http://localhost:3000/email/verify/42/9f2c1e7a0b4d6f8e1a3c5b7d9e0f2a4c6b8d0e1f?expires=1763202121&signature=5d1c…
```

- `42` is the user id; the hash part is tied to the **current** email address, so the link stops working if the address changes.
- The link is valid for **60 minutes** by default. Opening it again after it worked is harmless.

A signed-in user asks for a new link:

```bash
curl -X POST http://localhost:3000/email/verification-notification -H "Origin: http://localhost:3000" -H "Cookie: sv_session=<your session>"
```

**What you'll see:** `{"status":"sent"}`, or `{"status":"already-verified"}`. Resending waits **60 seconds** between mails and allows **6 per hour**.

To require a verified email on a route, use the `verified` middleware (see [Middleware for routes](#middleware-for-routes)). Unverified users get `403 EMAIL_NOT_VERIFIED`. More detail: [Email Verification](../email-verification/).

## Two-factor authentication

**Two-factor authentication** (2FA) asks for a second proof after the password: a 6-digit code from an **authenticator app** (Google Authenticator, 1Password, Authy…). The codes follow the TOTP standard (RFC 6238).

**Turning it on is two steps, so nobody locks themselves out.** Both need a recent [password confirmation](#confirming-the-password).

```bash
# Step 1: get a secret to scan
curl -X POST http://localhost:3000/user/two-factor-authentication -H "Origin: http://localhost:3000" -H "Cookie: sv_session=<your session>"
```

**What you'll see:**

```json
{"secret":"JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP","otpauthUri":"otpauth://totp/my-app.test:ada%40my-app.test?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=my-app.test"}
```

Show `otpauthUri` as a QR code. Then prove the app works with a current code:

```bash
# Step 2: confirm with a code from the app
curl -X POST http://localhost:3000/user/confirmed-two-factor-authentication \
  -H "Content-Type: application/json" -H "Origin: http://localhost:3000" -H "Cookie: sv_session=<your session>" \
  -d '{"code":"123456"}'
```

**What you'll see:** the **recovery codes**, shown this once:

```json
{"recoveryCodes":["7KQPM-X3RTN","H9WCD-2MZFA","…eight more…"]}
```

A **recovery code** is a one-time backup for when the phone is lost. There are 10 (`twoFactor.recoveryCodes`, 8 to 10), each works once, and `POST /user/two-factor-recovery-codes` replaces them all.

**Answering the challenge** at sign-in, after `two-factor-required`:

```bash
curl -X POST http://localhost:3000/two-factor-challenge \
  -H "Content-Type: application/json" -H "Origin: http://localhost:3000" -H "Cookie: sv_session=<pending session>" \
  -d '{"code":"123456","rememberDevice":true}'
```

Send `"recoveryCode": "7KQPM-X3RTN"` instead of `code` to use a recovery code. **What you'll see:** `{"status":"signed-in"}`, with a new session id.

Good to know:
- **A code works once.** Each 30-second step can be used a single time, even by two requests at the same moment, so a code read over your shoulder is useless.
- **"Remember this device"** skips the code on this browser for **30 days**, for this user only (`twoFactor.rememberDeviceDays`; 0 turns it off). Turning 2FA off forgets every remembered device.
- The secret is stored **encrypted** (AES-256-GCM) and bound to the user.
- `DELETE /user/two-factor-authentication` turns 2FA off.

More detail: [Two-Factor Authentication](../two-factor/).

## Sessions

Your own UI uses **cookie sessions**. The cookie holds a random id; the database stores only a keyed digest of it, so a database leak doesn't hand out live sessions.

| Setting in `config/auth.ts` | Default | Meaning |
|---|---|---|
| `sessions.idleMinutes` | 120 | signed out after 2 hours without a request |
| `sessions.absoluteHours` | 12 | signed out 12 hours after signing in, whatever happens |
| `sessions.rememberDays` | 30 | "remember me" sessions last 30 days |
| `sessions.confirmPasswordMinutes` | 180 | how long a password confirmation counts |
| `sessions.twoFactorPendingMinutes` | 10 | how long a half-done 2FA sign-in waits |

**"Remember me"** is a long-lived session, not a separate cookie, so it shows up in the sessions list and can be revoked like any other.

Users see and end their own sessions:

```bash
curl http://localhost:3000/user/sessions -H "Cookie: sv_session=<your session>"
```

**What you'll see:**

```json
[
  {"handle":"a1b2c3d4e5f60718","current":true,"method":"password","createdAt":1763198521000,"lastSeenAt":1763199002000,"ip":"127.0.0.1","userAgent":"Mozilla/5.0"},
  {"handle":"0f1e2d3c4b5a6978","current":false,"method":"passkey","createdAt":1763112121000,"lastSeenAt":1763140000000,"ip":"203.0.113.7","userAgent":"Safari"}
]
```

- `DELETE /user/sessions/0f1e2d3c4b5a6978` signs out that one session.
- `DELETE /user/other-sessions` signs out every session but this one, and answers `{"revoked": 1}`.

The session id also changes whenever privileges change: on sign-in, after 2FA, when switching teams and when impersonating.

### Confirming the password

Some actions are sensitive enough to ask for the password again, even when signed in: turning 2FA on or off, new recovery codes, starting an impersonation. Without a recent confirmation they answer:

```text
HTTP/1.1 423 Locked
content-type: application/problem+json

{"type":"about:blank","title":"Confirm your password to continue.","status":423,"code":"PASSWORD_CONFIRMATION_REQUIRED"}
```

Confirm, then retry:

```bash
curl -X POST http://localhost:3000/user/confirm-password \
  -H "Content-Type: application/json" -H "Origin: http://localhost:3000" -H "Cookie: sv_session=<your session>" \
  -d '{"password":"correct horse battery staple"}'
```

**What you'll see:** `204 No Content`. The confirmation counts for 3 hours. Users without a password confirm with a passkey (`mode: "confirm"`).

## API tokens

**Personal access tokens** let scripts, mobile apps and other servers call your API without a browser session (Laravel Sanctum's tokens). Turn on `tokens` (the installer's default for question 9).

**Create one** while signed in:

```bash
curl -X POST http://localhost:3000/user/api-tokens \
  -H "Content-Type: application/json" -H "Origin: http://localhost:3000" -H "Cookie: sv_session=<your session>" \
  -d '{"name":"CI deploy","abilities":["post.view","post.create"],"expiresInDays":90}'
```

**What you'll see:**

```json
{
  "plainText": "svp_3fKq9ZbX0aLmN2pQrS7tUvWx4yZ1Ab2Cd3Ef5Gh6Ij7k9QxA1b",
  "token": {"id":"t_01","name":"CI deploy","abilities":["post.view","post.create"],"createdAt":1763198521000,"lastUsedAt":null,"expiresAt":1770974521000}
}
```

**`plainText` is shown once.** Only a keyed digest is stored, so nobody, you included, can read it again. Copy it now.

**Use it** with a `Bearer` header:

```bash
curl http://localhost:3000/api/posts -H "Authorization: Bearer svp_3fKq9ZbX0aLmN2pQrS7tUvWx4yZ1Ab2Cd3Ef5Gh6Ij7k9QxA1b"
```

- **Format:** `svp_` + 40 random characters + a 6-character checksum. The prefix lets GitHub and other secret scanners spot a leaked token; the checksum rejects typos without a database lookup.
- **Abilities** are what the token may do: `post.view`, `post.*` or `*`. A token can only get abilities inside the app's allowed list (`tokens.abilities`, default `['*']`). The request must pass **both** the token's abilities **and** your [policies](../authorization/).
- **Expiry:** 1 year by default (`tokens.defaultExpiryDays`), at most `tokens.maxExpiryDays`.
- **A bearer request never falls back to the cookie**, and it skips the [CSRF](../csrf/) check, because browsers never attach bearer headers by themselves.
- `GET /user/api-tokens` lists tokens (never the secret); `DELETE /user/api-tokens/t_01` revokes one. A password reset revokes them all.
- `lastUsedAt` is updated at most once a minute.

More detail: [API Tokens](../api-tokens/).

## Teams

With `teams` on, each **team** is one customer company, and people see only their team's data ([tenancy](../tenancy/)). Every user has a **current team**; the framework feeds it into the ORM's tenant scope on every request.

```bash
# Create a team (you become its admin)
curl -X POST http://localhost:3000/teams -H "Content-Type: application/json" -H "Origin: http://localhost:3000" -H "Cookie: sv_session=<your session>" -d '{"name":"Acme"}'

# Invite someone as a member
curl -X POST http://localhost:3000/teams/7/invitations -H "Content-Type: application/json" -H "Origin: http://localhost:3000" -H "Cookie: sv_session=<your session>" -d '{"email":"grace@example.com","role":"member"}'
```

**What you'll see:**

```json
{"id":"7","name":"Acme","role":"admin"}
{"id":"inv_3","email":"grace@example.com","role":"member","expiresAt":1763803321000}
```

- **Invitations** are mailed as a link to `/team-invitations/<token>`. They work once, last **7 days**, only for the invited email address, and only once that address is verified. The invitee accepts with `POST /team-invitations/accept` and `{"token":"…"}`.
- **Roles** come from the preset chosen in question 10: `admin-member` (admin, member) or `admin-manager-member-viewer`. What each role may do is decided by your policies.
- **A team always keeps at least one admin.** Removing or demoting the last one answers `409 LAST_ADMIN`.
- **Switching** (`POST /teams/7/switch`) changes the current team and starts a new session id. Removing someone from a team takes effect on their very next request.
- Team routes: `GET /teams`, `GET /teams/7/members`, `PUT /teams/7/members/<user>` (change role), `DELETE /teams/7/members/<user>`.

Outsiders get `404`, never `403`, so team ids can't be probed.

## Impersonation

**Impersonation** lets an admin sign in as another user to see what they see, for support. Turn on `impersonation`.

```bash
curl -X POST http://localhost:3000/impersonate/42 -H "Origin: http://localhost:3000" -H "Cookie: sv_session=<admin session>"
```

**What you'll see:** `204 No Content` and a new session, signed in as user 42. `GET /user` now shows `"impersonator": {"id":"1","name":"Admin","email":"admin@my-app.test"}`; your UI **must** show a banner with a "Leave" button when it's set.

The rules:
- Only users with the global `admin` role, and only after a recent [password confirmation](#confirming-the-password).
- Never another admin, never yourself, never nested.
- Lasts at most **1 hour**. `DELETE /impersonate` leaves and gives the admin a fresh session of their own.
- While impersonating you **can't** change the user's password, two-factor, passkeys, tokens or sessions.
- The start and the end are written to the audit log.

## The first admin

The installer creates the **first admin account** by running your seeder. Its email (default `admin@<your-app>.test`) is in `.env` as `SEED_ADMIN_EMAIL`. Its password is **never written to any file**:

- In an interactive install, a generated password is **shown once** in the summary box. Copy it.
- You can type your own instead (masked, at least 12 characters; `STRUT_ADMIN_PASSWORD` in CI).
- The account is marked so the admin must change the password at first sign-in.

Lost it? Set a new one:

```bash
node strut user:password admin@my-app.test
```

:::caution[Coming in 0.2]
`node strut user:password` and `node strut user:create --password-env` are designed (the installer prototype already points to `user:password`) but not built yet. The "must change password at first sign-in" flag is set by the installer prototype's seeder; the auth engine doesn't enforce it yet.
:::

## Rate limits and lockouts

Every sign-in route is rate-limited per IP address and per account. IPv6 addresses are grouped by `/64`, so rotating through one network's addresses doesn't help. Limits use the **shared cache**, so they hold across several app servers.

| Limit (`limits.*`) | Default |
|---|---|
| `loginPerIp` | 10 per minute |
| `loginPerAccount` | 20 per 15 minutes |
| `registerPerIp` | 10 per hour |
| `resetPerIp`, `resetPerAccount` | 5 and 3 per 15 minutes |
| `emailLinkPerIp`, `emailLinkPerAccount` | 5 and 3 per 15 minutes |
| `twoFactorPerAccount` | 10 per 5 minutes |
| `passkeyPerIp` | 20 per minute |
| `confirmPasswordPerAccount` | 5 per 5 minutes |

On top, an account is **locked** after **5 failed password attempts in a row**: first for 60 seconds, then twice as long after each further failure, up to 1 hour (`lockout.threshold`, `baseSeconds`, `maxSeconds`). Unknown emails lock exactly like real ones, so a lockout reveals nothing. A lockout blocks **password** sign-in only: password reset, email links and passkeys still work, and a reset lifts it.

```text
HTTP/1.1 429 Too Many Requests
retry-after: 120
content-type: application/problem+json

{"type":"about:blank","title":"Too many attempts. Please try again later.","status":429,"code":"RATE_LIMITED"}
```

## Events, the audit log and secrets

Every important step emits an **event** (sign-in, failed sign-in, 2FA enabled, token created, impersonation started…) for the audit log. Events carry ids, methods and counts only. A test runs every feature end to end and proves that **no password, token, code, cookie, link or 2FA secret** ever reaches an event or a log line.

Every stored secret (session ids, tokens, reset and email-link tokens, recovery codes) is a **keyed digest**: HMAC-SHA-256 with a key derived from your `APP_KEY`. Rotating `APP_KEY` therefore signs everyone out and invalidates tokens and recovery codes; how `key:rotate` will handle this is still an open question.

Mails go out in the background, so how long a response takes never depends on whether an account exists.

## Middleware for routes

You protect your own routes with middleware aliases, like Laravel:

| Alias | Lets the request through when… | Otherwise |
|---|---|---|
| `auth` | someone is signed in (a pending 2FA session doesn't count) | `401 UNAUTHENTICATED` |
| `guest` | nobody is signed in | refused (the exact answer isn't decided yet) |
| `verified` | the email is verified | `403 EMAIL_NOT_VERIFIED` |
| `password.confirm` | the password was confirmed recently | `423 PASSWORD_CONFIRMATION_REQUIRED` |
| `abilities:post.create` | the bearer token has that ability | refused (the exact answer isn't decided yet) |

```ts title="routes/api.ts"
import { defineRoutes, Route } from '@strutvane/framework'
import { PostController } from '../app/http/controllers/post.controller.ts'

export default defineRoutes([
  Route.apiResource('posts', PostController).middlewareFor(['store', 'update', 'destroy'], 'auth'),
])
```

:::caution[Coming in 0.2]
`auth` is proven in the application-core prototype (spike 12, with a bearer-token stand-in). `guest`, `verified`, `password.confirm` and `abilities` are designed as thin wrappers over the auth engine and are not built yet.
:::

## The auth tables

The auth tables are **ordinary migrations in your app**, applied by `node strut migrate`, with a real `users` model. They're all marked **internal**, so they never get an automatic API or admin screen:

`users`, `user_roles`, `sessions`, `auth_one_time_tokens` (reset, email-link, passkey-challenge and remembered-device tokens), `two_factor_recovery_codes`, `passkeys`, `personal_access_tokens`, `teams`, `team_members`, `team_invitations`.

On MySQL, emails are compared with a binary collation, so `Ada@x.test` and `ada@x.test` can't become two accounts by accident.

## With Docker or without Docker

Auth works the same in both. The differences are around it:

- **Mail:** with Docker, reset, verification, invitation and email-link mails land in Mailpit at `http://localhost:8025`. Without Docker, `MAIL_MAILER=log` writes them to your log.
- **Passkeys** need an exact origin: use the address in `APP_URL` (`http://localhost:3000`), not `127.0.0.1`, or the browser refuses the ceremony.
- **Commands** like `node strut user:password` run inside the app container in Docker mode; you type them the same way.

## Common mistakes

### Every sign-in fails with INVALID_CREDENTIALS

```text
{"type":"about:blank","title":"These credentials do not match our records.","status":422,"code":"INVALID_CREDENTIALS"}
```

**Why:** the email is unknown, the password is wrong, or the account uses an email link or passkey and has no password. All of these give the same answer on purpose.
**Fix:** check the email in your database, then set a known password:

```bash
node strut user:password ada@my-app.test
```

### The email link says to use the same browser

```text
{"type":"about:blank","title":"Open the sign-in link in the same browser you requested it from.","status":422,"code":"EMAIL_LINK_OTHER_BROWSER"}
```

**Why:** the link is bound to the browser that asked for it. You requested it on your laptop and opened it on your phone.
**Fix:** open the link in the browser where you typed your email. The link isn't used up, so it still works there. Or request a new one from the phone.

### /register answers 404

```text
{"type":"about:blank","title":"Not found.","status":404,"code":"NOT_FOUND"}
```

**Why:** public registration is off by default. A switched-off feature has no routes.
**Fix:** switch it on, or invite people through a team instead:

```ts title="config/auth.ts"
features: { registration: true },
```

### My two-factor code is rejected

```text
{"type":"about:blank","title":"The code is invalid.","status":422,"code":"INVALID_CODE"}
```

**Why:** the code was already used (each code works once), it expired (codes change every 30 seconds), or the phone's clock is off.
**Fix:** wait for the next code, and turn on automatic time in the phone's settings. If the phone is lost, send a recovery code instead:

```json
{"recoveryCode":"7KQPM-X3RTN"}
```

### I lost my API token right after creating it

**Why:** `plainText` is shown once; only a digest is stored, so it can't be shown again.
**Fix:** revoke the old one and create a new one:

```bash
curl -X DELETE http://localhost:3000/user/api-tokens/t_01 -H "Origin: http://localhost:3000" -H "Cookie: sv_session=<your session>"
```

### I'm locked out after a few wrong passwords

```text
{"type":"about:blank","title":"Too many attempts. Please try again later.","status":429,"code":"RATE_LIMITED"}
```

**Why:** 5 failed password attempts in a row lock password sign-in for that email, for 60 seconds and then longer.
**Fix:** wait for the time in the `retry-after` header, or reset the password with `/forgot-password`: a reset lifts the lockout.

### Turning on 2FA answers 423

```text
{"type":"about:blank","title":"Confirm your password to continue.","status":423,"code":"PASSWORD_CONFIRMATION_REQUIRED"}
```

**Why:** turning 2FA on or off, new recovery codes and impersonation need a password confirmed in the last 3 hours.
**Fix:** confirm first, then retry:

```bash
curl -X POST http://localhost:3000/user/confirm-password -H "Content-Type: application/json" -H "Origin: http://localhost:3000" -H "Cookie: sv_session=<your session>" -d '{"password":"your password"}'
```

### Requests from my script get 403 FORBIDDEN

**Why:** the prototype's routes refuse unsafe cookie requests that don't come from your own origin. In the framework this becomes the [CSRF](../csrf/) check, which answers `419` instead.
**Fix:** send the `Origin` header matching `APP_URL` from browser-like clients, or use an API token with `Authorization: Bearer` from scripts.

## Next steps

- [Authorization](../authorization/): what a signed-in user may do.
- [CSRF Protection](../csrf/): why cookie requests must come from your own pages.
- [Security Features](../security/): every protection that's on by default.
- [Tenancy](../tenancy/): how teams keep each customer's data apart.
