---
title: Session
description: How Strutvane remembers a signed-in browser between requests with the `strutvane_session` cookie, which drivers store sessions, how long they last, how to read and write session values and flash data, regenerate ids, sign everyone out, and block overlapping requests.
---

HTTP forgets everything between requests. A **session** is how your app remembers one browser across requests: who is signed in, the page they were going to, a "Saved!" message to show once. The browser holds only a random **session id** in a cookie; everything else stays on the server.

Your React UI uses a session automatically when people sign in. API clients (scripts, mobile apps, other servers) don't: they send an API token on every request instead.

:::tip[Coming from Laravel?]
Same ideas: drivers (`database`, `file`, `cookie`, `redis`), `session()->get()` / `put()`, flash data, `regenerate()` and session blocking. The differences: the cookie is called `strutvane_session`, stored ids are **hashed** (a database leak doesn't hand out live sessions), a request that sends a `Bearer` token is **never** also a cookie session, and session handling lives in `@strutvane/auth`, which every app with sign-in has.
:::

:::caution[Coming in 0.2]
**Proven in prototypes:** the sign-in sessions themselves in the auth prototype (spike 20: hashed ids, idle and absolute timeouts, rotation at sign-in, "sign out other sessions"), the session cookie seam and `node strut session:flush` in spike 12. **Decided and not built:** reading and writing your own session values, flash data and old input, `regenerate()`, the `cookie` and `redis` drivers, and the final cookie name `strutvane_session` (spike 20 still calls it `sv_session`). Session blocking comes in 0.3.
:::

## The smallest example

You don't write anything to get a session: sign in to the app in your browser, then look at its cookies (your browser's developer tools, Application → Cookies).

**What you'll see:**

| Name | Value | Flags |
|---|---|---|
| `strutvane_session` (`__Host-strutvane_session` over HTTPS) | a long random value | `HttpOnly`, `Secure` (HTTPS), `SameSite=Lax`, `Path=/` |
| `XSRF-TOKEN` | the CSRF token the UI copies into a header | readable by JavaScript, `SameSite=Lax` |

`HttpOnly` means JavaScript in the page can't read the session cookie, so a script injected into a page can't steal it. The `__Host-` prefix (on HTTPS) means no subdomain can set or overwrite it.

## Where sessions are stored: drivers

| Driver | Stores sessions in | Use it when |
|---|---|---|
| `database` (default) | a `sessions` table | Almost always: no extra service, works with several servers |
| `file` | `storage/framework/sessions/` | One server, no database for sessions |
| `redis` | Redis | You already run Redis (installer question 18) |
| `cookie` | an encrypted cookie in the browser | Tiny apps that store very little |

The installer picks `database` unless you chose Redis for "cache, queue and sessions". The `sessions` table is an ordinary migration in your app, and it's an **internal table**: it never gets a generated API or screen.

## How long a session lasts

| Setting | Default | Means |
|---|---|---|
| Idle timeout | 120 minutes | No request for that long → signed out |
| Absolute timeout | 12 hours | Signed out after that, however active |
| "Remember me" | 30 days | Both limits, for a session started with "remember me" |
| Strict security profile | 8 hours | The installer's Strict profile shortens the absolute timeout |

The session id is **rotated** (replaced by a new one) when someone signs in and when their privileges change, so an id someone saw before sign-in is useless afterwards ("session fixation" protection). Set these in `config/auth.ts`; see [Authentication](../authentication/).

## Reading and writing values (preview)

:::caution[Coming in 0.2]
Decided, not built yet. Names follow Laravel; details may change.
:::

```ts title="app/http/controllers/wizard.controller.ts"
import { Controller, type HttpContext } from '@strutvane/framework'

export class WizardController extends Controller {
  async step(ctx: HttpContext): Promise<Response> {
    const session = ctx.session()
    const current = session.get('wizard.step', 1)     // read, with a default
    session.put('wizard.step', current + 1)           // write
    return ctx.json({ step: current + 1 })
  }

  finish(ctx: HttpContext): Response {
    ctx.session().forget('wizard.step')               // remove one value
    return ctx.noContent()
  }
}
```

| Method | Does |
|---|---|
| `get(key, fallback?)` | Read a value |
| `put(key, value)` | Write a value |
| `has(key)` | `true` when the key is set |
| `pull(key)` | Read and remove |
| `forget(key)` | Remove |
| `flush()` | Remove every value (the user stays signed in only if you sign them in again) |

Keep sessions small and never store secrets in them: an id, a step number, a few preferences.

## Flash data and old input (preview)

**Flash data** is kept for the **next** request only, then removed: the classic "Post saved" message after a redirect.

```ts
ctx.session().flash('status', 'Post saved.')
return redirect().to('/posts/hello-world', 303)
```

On the next request `ctx.session().get('status')` is `'Post saved.'`; on the one after, it's gone. **Old input** (re-filling a plain HTML form after a validation error) works the same way. The React UI doesn't need either: it keeps form state and messages in the browser.

## Regenerating the id (preview)

```ts
ctx.session().regenerate()   // new id, same values
ctx.session().invalidate()   // new id, values cleared (sign-out)
```

Sign-in, sign-out and privilege changes already do this for you; call it yourself after any other change of trust level (switching to an impersonated user is handled by the auth package).

## Signing everyone out

After a security incident, one command ends every session:

```bash
node strut session:flush
```

**What you'll see:**

```text
  ✔ 42 sessions deleted. Everyone signed in with a session must sign in again.
  · API tokens are not affected; revoke them with the auth package (token:revoke --all).
```

Combine it with `node strut token:revoke --all` to cut off API tokens too. People can also end their own other sessions from their account settings ("Sign out other sessions").

## Session blocking (coming in 0.3)

:::caution[Coming in 0.3]
Planned for phase 2 (0.3) in the parity matrix.
:::

Two quick clicks on "Pay" send two requests at once with the same session. Laravel's `->block()` makes the second wait until the first finishes. Strutvane will offer the same on a route:

```ts
Route.post('/checkout', [CheckoutController, 'store']).block(),
```

For API calls today, use the `idempotent` middleware: a retry with the same `Idempotency-Key` gets the first response instead of running twice ([Middleware](../middleware/)).

## Sessions and API tokens

A request that carries `Authorization: Bearer …` is treated as a **token** request, even if a session cookie came along too. Why: otherwise a forged cross-site request could add a junk `Bearer` header to skip the CSRF check while still riding on the victim's cookie. Cookie requests must pass the CSRF check; token requests don't need it. See [CSRF Protection](../csrf/) and [API Tokens](../api-tokens/).

## With Docker, several servers and tests

- **Several servers** behind a load balancer: use `database` or `redis` so every server sees the same sessions (`file` keeps them on one server's disk).
- **Docker** changes nothing: the `database` driver uses the database container.
- **Tests** don't need a browser session: the test client signs in with `actingAs(user)` (a user model), or `withToken(token)` for API tokens ([HTTP Tests](../http-tests/)).

## Common mistakes

### I'm signed out every few minutes

**Why:** the idle timeout is short, or each server stores sessions separately (`file` driver behind a load balancer).
**Fix:** use the `database` or `redis` driver with several servers, and check `idleMinutes` in `config/auth.ts`.

### The session cookie doesn't arrive over plain HTTP in production

**Why:** in production the cookie is `Secure` (HTTPS only), and over HTTPS it's named `__Host-strutvane_session`.
**Fix:** serve the app over HTTPS, and behind a proxy tell Strutvane to trust it so it knows the request was HTTPS (`middleware.trustProxies({ at: [...] })`).

### My POST from a script gets 419 "Page expired"

**Why:** the script sent the session cookie, so the request must pass the CSRF check.
**Fix:** scripts should use an API token (`Authorization: Bearer …`) instead of a session.

### I stored a big object in the session and everything got slow

**Why:** the whole session is read and written on every request.
**Fix:** store an id in the session and the data in a table or the cache.

## Next steps

- [Authentication](../authentication/): sign-in, timeouts and "remember me".
- [CSRF Protection](../csrf/): why cookie requests need a token.
- [URL Generation](../urls/): the previous URL, kept in the session.
