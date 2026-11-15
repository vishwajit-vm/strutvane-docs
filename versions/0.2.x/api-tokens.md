---
title: "API Tokens"
description: "Give scripts, mobile apps and other servers their own personal access tokens with abilities and an expiry, check abilities in your routes, and handle expired, revoked and mistyped tokens."
---

Your React UI signs in with a cookie session. But a nightly script, a mobile app or a partner's server has no browser. For them, a user creates a **personal access token**: a long secret string they paste into the other program, which sends it with every request. The token acts as that user, limited to the **abilities** (permissions) chosen when it was made, until it **expires** or is **revoked** (switched off).

In Strutvane, tokens are the `apiTokens` feature in `config/auth.ts`. The installer turns it on by default (question 9, "API access for other apps": personal access tokens).

:::tip[Coming from Laravel?]
This is Laravel Sanctum's personal access tokens: `$user->createToken('CI', ['post:view'])` becomes `POST /user/api-tokens` with `abilities`, `tokenCan('post:view')` becomes `token.can('post.view')`, and requests send `Authorization: Bearer …`.

What's different:
- Tokens **expire after a year** by default (Sanctum's default is never), and a user can pick a shorter life.
- Abilities use dots (`post.view`, `post.*`) and must fit an **allowed list** you set for the app.
- Only a **keyed digest** is stored, and tokens start with `svp_` plus a checksum, so leaked tokens are spotted by GitHub's secret scanning and typos are refused without touching the database.
- A password reset revokes **all** of a user's tokens.
:::

:::caution[Coming in 0.2]
Tokens are **proven in the auth prototype** (spike 20: format, digest-only storage, abilities within the allowed list, expiry, last-used throttling, revoke, forged and mutated tokens, and "a disabled feature authenticates nothing"). They aren't released yet. The routes and answers below are the prototype's. The `abilities:` middleware, the API-tokens settings screen and the `tokens:prune` and `token:revoke --all` commands are designed, not built. The feature is named `apiTokens` (the decided name; the prototype still calls the switch `tokens`), and the session cookie `strutvane_session`.
:::

## The smallest example

1. **Create a token** while signed in (the settings screen will do this; here with curl):

   ```bash
   curl -X POST http://localhost:3000/user/api-tokens \
     -H "Content-Type: application/json" \
     -H "Origin: http://localhost:3000" \
     -H "Cookie: strutvane_session=<your session>" \
     -d '{"name":"Nightly export"}'
   ```

   **What you'll see:**

   ```json
   {
     "plainText": "svp_3fKq9ZbX0aLmN2pQrS7tUvWx4yZ1Ab2Cd3Ef5Gh6Ij7k9QxA1b",
     "token": {
       "id": "0193a1d4-2b7e-7f10-8c3d-1e2f3a4b5c6d",
       "name": "Nightly export",
       "abilities": ["*"],
       "createdAt": 1763198521000,
       "lastUsedAt": null,
       "expiresAt": 1794734521000
     }
   }
   ```

2. **Copy `plainText` now.** It's shown this one time; only a digest is stored, so nobody can show it again.

3. **Use it** from the other program:

   ```bash
   curl http://localhost:3000/api/posts -H "Authorization: Bearer svp_3fKq9ZbX0aLmN2pQrS7tUvWx4yZ1Ab2Cd3Ef5Gh6Ij7k9QxA1b"
   ```

   **What you'll see:** the same posts list the user would see in the browser, filtered by your [policies](../authorization/).

With no `abilities` given, the token gets every ability the app allows (`["*"]` by default), like Sanctum.

## What a token looks like

```text
svp_3fKq9ZbX0aLmN2pQrS7tUvWx4yZ1Ab2Cd3Ef5Gh6Ij7k9QxA1b
└┬─┘└──────────────── 40 random ───────────────┘└ 6 ┘
prefix                                       checksum
```

| Part | Why it's there |
|---|---|
| `svp_` | a fixed prefix, so GitHub, GitLab and other secret scanners can recognise a leaked Strutvane token. Change it with `tokens.prefix` (2–8 lowercase letters and `_`) |
| 40 random characters | about 238 bits of randomness: impossible to guess |
| 6-character checksum | a CRC-32 of the rest. A mistyped or truncated token is refused **before** any database lookup |

The database stores only an HMAC-SHA-256 of the token, made with a key derived from your `APP_KEY`. A leaked database (a backup, a read-only SQL bug) doesn't leak usable tokens.

## Abilities: what a token may do

An **ability** is a short name for one kind of action: `post.view`, `post.create`, `invoice.export`. A token carries a list of them.

| Pattern | Grants |
|---|---|
| `post.view` | exactly `post.view` |
| `post.*` | every ability starting with `post.`: `post.view`, `post.create`, `post.comment.create` |
| `*` | everything |

Create a narrow token:

```bash
curl -X POST http://localhost:3000/user/api-tokens \
  -H "Content-Type: application/json" -H "Origin: http://localhost:3000" -H "Cookie: strutvane_session=<your session>" \
  -d '{"name":"CI deploy","abilities":["post.view","post.create"],"expiresInDays":90}'
```

**What you'll see:** a token whose `abilities` are `["post.view","post.create"]` and whose `expiresAt` is 90 days away.

### Abilities AND policies

A token never gives a user **more** than they already have. A request with a token is allowed only when:

1. the **token** has the ability, **and**
2. your **policy** allows the user.

So a token with `post.*` held by Bob still can't edit Alice's post, because `PostPolicy.update()` says no. And Alice's `post.view` token can't create posts even though Alice can. See [Authorization](../authorization/).

### The app's allowed list

You decide which abilities tokens may carry at all, in `config/auth.ts`. The default is `['*']` (anything). A tighter app:

```ts title="config/auth.ts"
import { defineAuthConfig } from '@strutvane/auth'

export default defineAuthConfig({
  appUrl: process.env.APP_URL ?? 'http://localhost:3000',
  features: { apiTokens: true },
  tokens: {
    abilities: ['post.*', 'tag.view', 'invoice.export'],
    defaultExpiryDays: 90,
    maxExpiryDays: 180,
  },
})
```

**What you'll see:** asking for `user.delete` or `*` now fails:

```json
{"type":"about:blank","title":"Some fields are missing or invalid.","status":422,"code":"VALIDATION_FAILED","issues":[{"field":"abilities","code":"not_allowed"}]}
```

A badly written pattern in the config stops the app at start-up:

```text
TypeError: auth config: invalid token ability "post:view"
```

(Abilities use dots, not Sanctum's colons.)

### Checking an ability on a route

Use the `abilities:` middleware, Laravel's name:

```ts title="routes/api.ts"
import { defineRoutes, Route } from '@strutvane/framework'
import { ExportController } from '../app/http/controllers/export.controller.ts'
import { PostController } from '../app/http/controllers/post.controller.ts'

export default defineRoutes([
  Route.apiResource('posts', PostController).middleware('auth'),
  Route.post('/exports/invoices', [ExportController, 'invoices']).middleware('auth', 'abilities:invoice.export'),
])
```

:::caution[Coming in 0.2]
The `abilities:` middleware is designed as a thin wrapper over the engine's `token.can(ability)` and isn't built yet. What it answers when the ability is missing (403, and with which `code`) isn't decided. How the generated CRUD API maps actions to abilities (`post.view` for index and show, `post.create` for store, and so on) isn't decided either.
:::

In your own code, the prototype's `tokens.authenticate(header)` gives back an object with `can()`:

```ts title="app/http/controllers/export.controller.ts"
// The prototype's engine API; how a controller reaches it in the framework isn't final.
const token = await auth.tokens.authenticate(ctx.header('authorization'))
if (token === undefined) throw new UnauthenticatedError()
if (!token.can('invoice.export')) throw new ForbiddenError('This token may not export invoices.')
```

`token.user` is the user, and `token.token` the token's public details (never the secret).

## Listing and revoking tokens

List your tokens (the secret is never included):

```bash
curl http://localhost:3000/user/api-tokens -H "Cookie: strutvane_session=<your session>"
```

**What you'll see:**

```json
[
  {"id":"0193a1d4-2b7e-7f10-8c3d-1e2f3a4b5c6d","name":"Nightly export","abilities":["*"],"createdAt":1763198521000,"lastUsedAt":1763284921000,"expiresAt":1794734521000},
  {"id":"0193a1d5-9c0a-7b21-8d4e-2f3a4b5c6d7e","name":"CI deploy","abilities":["post.view","post.create"],"createdAt":1763198600000,"lastUsedAt":null,"expiresAt":1770974600000}
]
```

`lastUsedAt` is updated at most **once a minute**, so a busy script doesn't write to the database on every request. A token that was never used shows `null`: a good hint that it can go.

Revoke one:

```bash
curl -i -X DELETE http://localhost:3000/user/api-tokens/0193a1d5-9c0a-7b21-8d4e-2f3a4b5c6d7e \
  -H "Origin: http://localhost:3000" -H "Cookie: strutvane_session=<your session>"
```

**What you'll see:** `204 No Content`. The next request with that token gets `401`. Someone else's token id answers exactly like an unknown one, `404 NOT_FOUND`, so ids can't be probed.

## How long tokens live

| Setting in `config/auth.ts` | Default | Meaning |
|---|---|---|
| `tokens.defaultExpiryDays` | 365 | life of a token created without `expiresInDays` |
| `tokens.maxExpiryDays` | 365 | the longest life a user may ask for |
| `tokens.abilities` | `['*']` | the patterns tokens may carry |
| `tokens.prefix` | `svp_` | the prefix secret scanners look for |

`expiresInDays` must be a whole number from 1 to `maxExpiryDays`; anything else is `VALIDATION_FAILED` with issue `{"field":"expiresInDays","code":"invalid"}`.

Tokens also die when:

- the user **resets** their password (all tokens);
- an admin runs `node strut token:revoke --all` after an incident (every token of every user);
- the user is deleted;

Rotating `APP_KEY` does **not** kill tokens: a token's digest is checked against `APP_KEY` and then every key in `APP_PREVIOUS_KEYS`, and re-digested under the current key on success (decided for 0.2; the prototype checks `APP_KEY` only, see [Encryption](../encryption/#rotating-app_key)).

Expired tokens stay in the table until `node strut tokens:prune` deletes them (usually from the [scheduler](../scheduling/)).

## Tokens and CSRF

A request with `Authorization: Bearer` **skips** the [CSRF](../csrf/) check. That's safe because browsers never attach a bearer header on their own, so another site can't make a victim's browser send it.

The flip side: a bearer request **never falls back to the cookie**. A wrong or expired token gets `401`, even if the same browser also has a valid session cookie. Mixing the two would let a broken token silently act as whoever is signed in.

## Calling the API from code

From Node (another server, a script):

```ts title="scripts/export-posts.ts"
const token = process.env.MY_APP_TOKEN
if (token === undefined) throw new Error('Set MY_APP_TOKEN first')

const response = await fetch('https://app.example.com/api/posts?filter[status]=published', {
  headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
})
if (response.status === 401) throw new Error('The token is invalid, expired or revoked: create a new one.')
console.log(await response.json())
```

Set the variable for one run:

**macOS / Linux:**

```bash
MY_APP_TOKEN=svp_3fKq… node scripts/export-posts.ts
```

**Windows (PowerShell):**

```powershell
$env:MY_APP_TOKEN='svp_3fKq…'; node scripts/export-posts.ts
```

Keep tokens in your CI's secret settings or a password manager, never in a committed file.

## When a token doesn't work

Every invalid token answers the **same** `401`, whatever the reason, so nobody can tell a revoked token from a made-up one:

```text
HTTP/1.1 401 Unauthorized
content-type: application/problem+json

{"type":"about:blank","title":"You need to sign in.","status":401,"code":"UNAUTHENTICATED"}
```

| Reason | What the caller sees |
|---|---|
| typo, missing characters, wrong prefix | `401` (refused by the checksum, no database lookup) |
| expired | `401` |
| revoked, or revoked by a password reset | `401` |
| the owner was deleted | `401` |
| `apiTokens` switched off in `config/auth.ts` | `401`: a disabled feature authenticates nothing |
| header isn't `Bearer <token>` | `401` |

To find out which one it was, look at the token list in settings (is it there? is `expiresAt` in the past?).

## Safety rails built in

- Tokens can't be created **while an admin impersonates** a user, because the token would outlive the impersonation.
- Creating and revoking tokens emits `token.created` and `token.revoked` events for the [audit log](../audit/), with ids only.
- No token value ever reaches a log line or an event; a test runs every feature and checks.
- The `Authorization` header is parsed strictly (at most 200 characters, `Bearer` then one token).

## With Docker or without Docker

Tokens behave the same. In Docker mode the app answers on the same `http://localhost:3000` from your computer, so scripts on your machine use the same URL. Commands like `node strut tokens:prune` are forwarded into the container as usual.

## Common mistakes

### I lost the token right after creating it

**Why:** `plainText` is shown once. Only a digest is stored, so it can't be shown again, by anyone.
**Fix:** revoke it and create a new one:

```bash
curl -X DELETE http://localhost:3000/user/api-tokens/<id> -H "Origin: http://localhost:3000" -H "Cookie: strutvane_session=<your session>"
```

### My script suddenly gets 401

```text
{"type":"about:blank","title":"You need to sign in.","status":401,"code":"UNAUTHENTICATED"}
```

**Why:** the token expired (one year by default), was revoked, or the owner reset their password, which revokes all their tokens.
**Fix:** create a new token and update the script's secret. Put the `expiresAt` date in your calendar.

### Creating a token answers `not_allowed`

```json
{"code":"VALIDATION_FAILED","issues":[{"field":"abilities","code":"not_allowed"}]}
```

**Why:** you asked for an ability outside the app's `tokens.abilities` list, or wrote it with a colon (`post:view`).
**Fix:** use dots and stay inside the list, or widen the list:

```ts title="config/auth.ts"
tokens: { abilities: ['post.*', 'tag.view', 'invoice.export'] },
```

### The token works but the request is still 403 or 404

**Why:** the token has the ability, but your policy refuses the user (403), or the user may not even see that record (404). Abilities never widen what the user may do.
**Fix:** check the policy for that user. In local debug mode the 403 body has a `hint` naming the policy method. See [Authorization](../authorization/).

### My browser code sends the token and also gets CSRF errors on other calls

**Why:** some requests go out with the bearer header and some with only the cookie. Cookie requests need CSRF protection; bearer requests don't.
**Fix:** in your own React UI, don't use tokens at all: the session cookie and the CSRF header are handled for you. Tokens are for programs outside the browser.

### POST /user/api-tokens answers 404

```text
{"type":"about:blank","title":"Not found.","status":404,"code":"NOT_FOUND"}
```

**Why:** the `apiTokens` feature is off.
**Fix:**

```ts title="config/auth.ts"
features: { apiTokens: true },
```

## Next steps

- [Authorization](../authorization/): the policies every token request must also pass.
- [Authentication](../authentication/): sessions, sign-in and the auth middleware.
- [CSRF Protection](../csrf/): why bearer requests skip the check.
- [Audit](../audit/): where token creation and revocation are recorded.
