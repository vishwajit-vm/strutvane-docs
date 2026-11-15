---
title: "Hashing"
description: "Store passwords safely with scrypt, check them, upgrade old hashes on the next sign-in, import bcrypt hashes from another app, and tune the cost for your servers."
---

**Hashing** turns a password into a fixed-looking string that **can't be turned back**. When someone signs in, you hash what they typed and compare it with the stored hash. You never store the password itself, so a stolen database doesn't hand out passwords.

Hashing is not [encryption](../encryption/). Encryption can be undone with the key; a hash can't be undone at all. Use hashing for passwords and anything else you only ever need to *check*, never *read*.

Strutvane hashes passwords with **scrypt**, an algorithm built into Node that is deliberately slow and memory-hungry, so guessing passwords from a stolen hash takes years instead of minutes. Sign-in, registration, password change and reset already hash for you: most apps never call the hasher directly.

:::tip[Coming from Laravel?]
`Hash::make()`, `Hash::check()` and `Hash::needsRehash()` become `hasher.hash()`, `hasher.verify()` and `hasher.needsRehash()`. Laravel's `rehash_on_login` is always on.

What's different:
- The default is **scrypt**, not bcrypt or argon2. scrypt is memory-hard like argon2, is OWASP's listed alternative, and needs no native binary.
- Your old Laravel **bcrypt** hashes can be imported: they're checked once and upgraded to scrypt at the next sign-in.
- Every hasher has a `verifyDummy()` that takes as long as a real check, so the response time never reveals whether an email has an account.
:::

:::caution[Coming in 0.2]
The scrypt hasher, rehash-on-login and legacy (bcrypt) import are **proven in the auth prototype** (spike 20: format, Unicode normalisation, rehash, legacy verifiers and absurd-parameter tests). They aren't released yet. The blueprint places hashing in the framework, the prototype in `@strutvane/auth`, so the import path below may change. An argon2id hasher is not included (see [Why scrypt](#why-scrypt-and-not-argon2)).
:::

## The smallest example

```ts title="scripts/hash-demo.ts"
import { createScryptHasher } from '@strutvane/auth'

const hasher = createScryptHasher()

const stored = await hasher.hash('a long sentence I can remember 42')
console.log(stored)

console.log(await hasher.verify('a long sentence I can remember 42', stored))
console.log(await hasher.verify('a long sentence I can remember 43', stored))
```

Run it:

```bash
node scripts/hash-demo.ts
```

**What you'll see** (the salt and hash differ every time):

```text
$scrypt$ln=17,r=8,p=1$9mY3KcQ0b1Tn2vX8pE4h1w$Qm0zR3V2c2tYb1d4M0hNaUt…
true
false
```

Each `hash()` call takes about a third of a second on a laptop. That's the point: an attacker must pay the same price for every guess.

## Reading a hash

A stored hash names everything needed to check it later:

```text
$scrypt$ln=17,r=8,p=1$<salt>$<key>
```

| Part | Meaning |
|---|---|
| `scrypt` | the algorithm |
| `ln=17` | the cost: N = 2^17. Higher is slower and uses more memory |
| `r=8` | the block size (memory per step) |
| `p=1` | the parallelism (how many independent lanes) |
| `<salt>` | 16 random bytes, different for every hash, so two users with the same password get different hashes |
| `<key>` | the 64-byte result |

Because the parameters live **inside** the hash, you can raise them later without breaking existing users. See [Upgrading old hashes](#upgrading-old-hashes-rehash-on-login).

## The hasher's four methods

| Method | What it does | Returns |
|---|---|---|
| `hash(password)` | hashes with a fresh salt and the current parameters | `Promise<string>` |
| `verify(password, stored)` | checks a password against a stored hash, in constant time | `Promise<boolean>`, never throws (a malformed hash is `false`) |
| `needsRehash(stored)` | `true` when the hash is in an old format or uses weaker parameters than today's | `boolean` |
| `verifyDummy(password)` | spends exactly as long as a real `verify()` and returns `false` | `Promise<false>` |

### `verifyDummy()`: when there's no user

When someone signs in with an email that doesn't exist, there's no hash to check. If you answered right away, the fast answer would tell an attacker "this email has no account". So you check against a dummy instead:

```ts title="app/services/sign-in-check.ts"
import type { PasswordHasher } from '@strutvane/auth'
import { User } from '../models/user.ts'

export async function passwordMatches(hasher: PasswordHasher, email: string, password: string): Promise<boolean> {
  const user = await User.query().where('email', email).first()
  if (user === null || user.password === null) return hasher.verifyDummy(password)   // same time, always false
  return hasher.verify(password, user.password)
}
```

**What you'll see:** `false` for an unknown email, after the same third of a second a real check takes. The built-in sign-in does exactly this; the prototype has a test that counts one full-cost verification on every failure path.

## Unicode: the same password typed on two keyboards

Passwords are normalised (Unicode **NFKC**) before hashing. A password with an accent typed as one character (`é`) on one keyboard, or as `e` plus an accent mark on another, hashes the same, so people aren't locked out by their keyboard. This follows NIST's guidance (SP 800-63B).

## Upgrading old hashes: rehash on login

Say you raise the cost from `ln=16` to `ln=17` after buying faster servers. Old hashes still say `ln=16`, and `needsRehash()` reports them:

```ts
hasher.needsRehash('$scrypt$ln=16,r=8,p=1$…')   // → true
hasher.needsRehash('$scrypt$ln=17,r=8,p=1$…')   // → false
```

You don't have to do anything with that: **on every successful sign-in**, Strutvane checks `needsRehash()` and, if needed, stores a fresh hash made with the current parameters. Over a few weeks every active user moves to the new cost, with nobody resetting a password. The audit stream records a `password.rehashed` event (with the user id only).

## Importing bcrypt hashes from another app

Moving users from a Laravel app (or any app using bcrypt, argon2 or PBKDF2)? You don't need their passwords. Plug in a **legacy verifier**: a small object that recognises the old format and checks it.

```ts title="app/providers/auth.provider.ts"
import { createScryptHasher, type LegacyVerifier } from '@strutvane/auth'
import bcrypt from 'bcryptjs'

/** Laravel's bcrypt hashes start with $2y$. */
const laravelBcrypt: LegacyVerifier = {
  id: 'bcrypt',
  matches: (stored) => stored.startsWith('$2y$') || stored.startsWith('$2b$'),
  verify: (password, stored) => bcrypt.compare(password, stored.replace(/^\$2y\$/, '$2b$')),
}

export const hasher = createScryptHasher({ legacy: [laravelBcrypt] })
```

**What you'll see:** imported users sign in with their old passwords. On that first sign-in the bcrypt hash is checked, then **replaced** by a scrypt hash (`needsRehash()` is always `true` for a legacy format). Users who never come back keep their bcrypt hash.

Rules for legacy verifiers:

- They are **only ever used to check**, never to create hashes.
- A verifier that throws counts as a wrong password (`false`), never as an error page.
- A hash in a format nobody recognises still costs a full verification, then fails, so timing doesn't reveal it.

:::note
`bcryptjs` is an example: pick any bcrypt library you trust. Strutvane itself ships no bcrypt code.
:::

## Choosing the cost

Higher `logN` is safer and slower. Measured in the prototype (Node 24.21, Windows 11 laptop, median of 5):

| `logN` | Memory per hash | Time per hash |
|---|---|---|
| 14 | 16 MiB | 45 ms |
| 15 | 32 MiB | 82 ms |
| 16 | 64 MiB | 163 ms |
| **17 (default)** | **128 MiB** | **351 ms** |

The default (`ln=17, r=8, p=1`) is OWASP's scrypt recommendation. To change it:

```ts title="app/providers/auth.provider.ts"
import { createScryptHasher } from '@strutvane/auth'

export const hasher = createScryptHasher({ params: { logN: 16, r: 8, p: 1 } })
```

**What you'll see:** new hashes say `ln=16`. `createScryptHasher()` refuses `logN` below 14 or above 20 at start-up:

```text
RangeError: scrypt logN must be between 14 and 20
```

**Think about memory, too.** Each sign-in briefly uses 128 MiB at the default. Twenty sign-ins at the same moment need about 2.5 GiB. On a small container, either lower `logN` to 16 or keep the sign-in [rate limits](../rate-limiting/) (which are on by default) tight.

### Fast hashing in tests

Tests create many users, and 350 ms each adds up. Use a lower cost in tests only:

```ts title="tests/setup.ts"
import { createScryptHasher } from '@strutvane/auth'

export const testHasher = createScryptHasher({ params: { logN: 14, r: 8, p: 1 } })
```

The prototype's own tests use `ln=14`. Never lower it in production.

## Why scrypt and not argon2

argon2id is the first choice of OWASP's password cheat sheet. The Node package for it (`@node-rs/argon2` 2.2.2, checked 2026-11-15) ships a prebuilt **native binary** for each platform: a compiled file nobody can review, one more way into your supply chain, and missing on some platforms. scrypt is memory-hard too, is OWASP's listed alternative, and is built into Node, so hashing needs no dependency at all.

The hash format names its algorithm, so an argon2id hasher can be added later and existing scrypt hashes would upgrade on the next sign-in, like bcrypt ones do today.

## Safety rails built in

- **Hostile hashes are refused.** A stored hash with absurd parameters (`ln=30`) would make one check use gigabytes of memory. Parameters outside `ln` 10–20, `r` 1–32 and `p` 1–16 make `verify()` return `false` instead of running.
- **Constant-time comparison.** The result is compared with `timingSafeEqual`, so the time doesn't reveal how many bytes matched.
- **No length surprises.** Passwords are limited to 256 characters by default (`passwords.max`), so nobody can send a megabyte to hash.

## With Docker or without Docker

Hashing behaves the same. One difference: Docker Desktop on Windows and macOS gives the containers a fixed amount of memory (often 2–4 GiB by default). If many sign-ins run at once in development and the `app` container is killed, raise Docker Desktop's memory limit or lower `logN` in development only.

## Common mistakes

### Every sign-in fails after I imported users

```text
{"type":"about:blank","title":"These credentials do not match our records.","status":422,"code":"INVALID_CREDENTIALS"}
```

**Why:** the imported hashes are bcrypt (`$2y$…`), and no legacy verifier recognises them, so they're treated as unknown and fail.
**Fix:** add a legacy verifier for that format, as in [Importing bcrypt hashes](#importing-bcrypt-hashes-from-another-app).

### My test suite is very slow

**Why:** every factory user is hashed at `ln=17` (about 350 ms each).
**Fix:** hash once and reuse the result in factories, or use `logN: 14` in tests:

```ts title="database/factories/user.factory.ts"
// Hashed once at load time, shared by every test user. Never use this in production seeders.
const TEST_PASSWORD_HASH = await testHasher.hash('a long sentence I can remember 42')
```

### The container restarts during load tests

**Why:** scrypt at `ln=17` uses 128 MiB per check; dozens of simultaneous sign-ins exceed the container's memory.
**Fix:** keep the sign-in rate limits on, give the container more memory, or use `logN: 16`.

### I compared hashes with `===`

```ts
// Wrong: a fresh hash has a fresh salt, so this is always false
(await hasher.hash(typed)) === user.password
```

**Why:** every hash has its own random salt, so hashing the same password twice gives two different strings.
**Fix:** use `verify()`:

```ts
await hasher.verify(typed, user.password)   // true or false
```

## Next steps

- [Password Reset](../passwords/): password rules, breach checks, changing and resetting passwords.
- [Authentication](../authentication/): where sign-in uses the hasher.
- [Encryption](../encryption/): for values you need to read back.
