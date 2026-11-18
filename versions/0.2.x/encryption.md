---
title: "Encryption"
description: "Encrypt values you need to read back later (API secrets, notes, tokens for other services) with encrypt() and decrypt(), bind each value to a purpose, and rotate APP_KEY without breaking anything."
---

**Encryption** turns a readable value into scrambled text that only your app can turn back. You use it for things you must **read back later**: a partner's API secret, a webhook signing secret, a private note. (Passwords are different: you never need them back, so they are [hashed](../hashing/), not encrypted.)

Strutvane encrypts with your app's **`APP_KEY`**, the secret in `.env`. You call `encrypt(value)` to lock a value and `decrypt(payload)` to unlock it. Anyone who steals your database but not your `APP_KEY` sees only scrambled text.

:::tip[Coming from Laravel?]
It's Laravel's `Crypt`: `encrypt($value)` and `decrypt($payload)` work the same way, `Crypt::encrypt()` is `Crypt.encrypt()` (from `@strutvane/framework/facades`), with the same `APP_KEY` and `APP_PREVIOUS_KEYS` for key rotation, and `php artisan key:generate` becomes `node strut key:generate`.

What's different:
- The cipher is **AES-256-GCM** (Laravel defaults to AES-256-CBC with a separate MAC).
- Every value can carry a **purpose** (`{ purpose: 'webhook-secret' }`). A value encrypted for one purpose won't decrypt as another, so a stolen value can't be replayed somewhere else.
- `decrypt()` returns `unknown`, not a typed value: validate it like any other input.
:::

:::caution[What exists, and when]
`encrypt()`, `decrypt()`, the `Encrypter` class, the `Crypt` facade, the keyring with `APP_PREVIOUS_KEYS`, and the `key:generate`, `key:rotate`, `env:encrypt` and `env:decrypt` commands ship in `@strutvane/framework` 0.2.0-next.0 (not published to npm yet). The `encrypted()` model cast is planned.
:::

## The smallest example

Encrypt a value, then decrypt it again:

```ts title="app/http/controllers/project.controller.ts"
import { decrypt, encrypt } from '@strutvane/framework'

const payload = encrypt('whsec_example_51Hk2')   // lock it
const secret = decrypt(payload)                   // unlock it

console.log(payload)
console.log(secret)
```

**What you'll see** (the last part is different every time):

```text
sv1.3f2a9c41d07b8e65.q1Hc0vR0Zk2uYF3mJ8w8bA-3rP9…
whsec_example_51Hk2
```

The encrypted value has three parts, separated by dots:

| Part | Example | Meaning |
|---|---|---|
| `sv1` | `sv1` | the format version, so the format can change later without confusion |
| key id | `3f2a9c41d07b8e65` | which key locked it (16 characters that reveal nothing about the key) |
| body | `q1Hc0vR0…` | the scrambled value, plus the random **IV** (a one-time number) and the **tag** (a checksum that detects any change), in base64url |

Encrypting the same value twice gives two different payloads, because each one gets a fresh random IV. That's on purpose: an attacker can't tell that two rows hold the same secret.

`encrypt()` and `decrypt()` work **inside your app** (in a controller, a command, a seeder), because they read the current app's key. Outside the app they fail with a message that says how to get the app explicitly. See [Helpers](../helpers/).

## What you can encrypt

`encrypt()` accepts any value that JSON can hold: strings, numbers, booleans, `null`, arrays and plain objects.

```ts title="app/http/controllers/project.controller.ts"
import { decrypt, encrypt } from '@strutvane/framework'

const payload = encrypt({ provider: 'stripe', secret: 'whsec_example_51Hk2', rotated_at: '2026-11-15' })

const value = decrypt(payload)
// → { provider: 'stripe', secret: 'whsec_example_51Hk2', rotated_at: '2026-11-15' }
```

**What you'll see:** the same object back, typed as `unknown`. Dates become strings on the way in, as in any JSON.

### Strings only: `encryptString()` and `decryptString()`

When the value is already a string, the `Encrypter` has string-only methods that skip the JSON step. Use the `Crypt` facade, or ask the container for the `Encrypter` with `EncrypterToken`:

```ts title="app/services/webhook-secrets.ts"
import { Crypt } from '@strutvane/framework/facades'

const payload = Crypt.encryptString('whsec_example_51Hk2')
const secret = Crypt.decryptString(payload)   // → 'whsec_example_51Hk2', typed as string
```

```ts title="app/services/webhook-secrets.ts"
import { app, EncrypterToken } from '@strutvane/framework'

const encrypter = app().container.make(EncrypterToken)
const payload = encrypter.encryptString('whsec_example_51Hk2')
```

| Method | Takes | Gives back |
|---|---|---|
| `encrypt(value, options?)` | any JSON value | a payload string |
| `decrypt(payload, options?)` | a payload string | `unknown` (validate it) |
| `encryptString(text, options?)` | a string | a payload string |
| `decryptString(payload, options?)` | a payload string | a `string` |

The helpers `encrypt()` and `decrypt()` come from `@strutvane/framework`; all four methods are also on `Crypt` (from `@strutvane/framework/facades`) and on the `Encrypter` class.

## Why `decrypt()` returns `unknown`

A payload comes from your database or a cookie, and both could have been changed by someone. The tag check guarantees **your app** made the value, but not that it has the shape your code expects today (an older release may have stored a different shape). So `decrypt()` gives you `unknown`, and you check it, for example with Zod:

```ts title="app/services/webhook-secrets.ts"
import { decrypt } from '@strutvane/framework'
import { z } from 'zod'

const WebhookSecret = z.object({ provider: z.enum(['stripe', 'github']), secret: z.string().min(8) })

export function readSettings(stored: string) {
  return WebhookSecret.parse(decrypt(stored))
  // .provider is 'stripe' | 'github', .secret is a string
}
```

**What you'll see:** a typed object, or a Zod error naming the field that doesn't match.

## Purposes: one value, one job

Pass a **purpose** to tie a value to the place it belongs. The same purpose must be given to decrypt it.

```ts title="app/services/webhook-secrets.ts"
import { decrypt, encrypt } from '@strutvane/framework'

const stored = encrypt('whsec_example_51Hk2', { purpose: 'project.webhook-secret' })

decrypt(stored, { purpose: 'project.webhook-secret' })   // → 'whsec_example_51Hk2'
decrypt(stored)                                          // throws DecryptError
decrypt(stored, { purpose: 'session' })                  // throws DecryptError
```

**Why it matters:** imagine your app encrypts a user's id into a cookie, and also encrypts webhook secrets. Without purposes, a value copied from one place could be pasted into the other and still decrypt. With purposes, it can't. The default purpose is `'default'`.

Good purpose names say where the value lives: `'project.webhook-secret'`, `'user.phone'`, `'export.download'`.

## A typical use: a column you need to read back

Here the `projects` table keeps each customer's webhook signing secret. You need the real secret to sign outgoing requests, so you encrypt it (a hash would lose it forever).

The migration stores the payload in a text column, because payloads are longer than the value:

```ts title="database/migrations/2026_11_15_120000_add_webhook_secret_to_projects_table.ts"
import { migration } from '@strutvane/framework/schema'

export default migration({
  up(schema) {
    schema.table('projects', (t) => {
      t.text('webhook_secret').nullable()
    })
  },
  down(schema) {
    schema.table('projects', (t) => {
      t.dropColumn('webhook_secret')
    })
  },
})
```

Encrypt on the way in, decrypt on the way out:

```ts title="app/http/controllers/project-webhook.controller.ts"
import { Controller, decrypt, encrypt, type HttpContext } from '@strutvane/framework'
import { z } from 'zod'
import { Project } from '../../models/project.ts'

const PURPOSE = { purpose: 'project.webhook-secret' }

export class ProjectWebhookController extends Controller {
  /** PUT /api/projects/{project}/webhook-secret (bindings: { project: Project } in bootstrap/app.ts) */
  async update(ctx: HttpContext): Promise<Response> {
    const project = ctx.model(Project)
    const { secret } = z.object({ secret: z.string().min(8).max(200) }).parse(await ctx.body())
    // forceFill: webhook_secret is a secret column, so it isn't fillable from a request.
    await project.forceFill({ webhook_secret: encrypt(secret, PURPOSE) }).save()
    return ctx.json({ data: { webhook_secret_set: true } })
  }

  /** Used when sending a webhook: the real secret, never sent to the browser. */
  static secretOf(project: Project): string | null {
    if (project.webhook_secret === null) return null
    return z.string().parse(decrypt(project.webhook_secret, PURPOSE))
  }
}
```

**What you'll see:** the API answers `{"data":{"webhook_secret_set":true}}`, and the database row holds `sv1.3f2a…`, never the secret. Protect the route with a policy or the `can` middleware, like any write. See [Authorization](../authorization/).

:::note[Secret columns stay out of responses]
A column named like a secret (`*_secret`, `*_token`, `password`, `api_key`…) or marked `.secret()` or `.hidden()` in its migration is hidden from every model automatically: `toJSON()`, the generated API and filters never include it, even scrambled. See [Serialization](../orm-serialization/).
:::

### An encrypted cast (planned)

:::caution[Planned]
**A sketch: names may change.** A model cast, `encrypted()`, will do the encrypt-on-write and decrypt-on-read for you. It isn't in the ORM yet.
:::

Until then, the ORM's own `cast({ get, set })` (see [Casts & Accessors](../orm-casts/)) can call `encrypt()` and `decrypt()` in the same way.

## Rotating `APP_KEY`

A key should be replaced if it may have leaked, when someone with access leaves, or on a schedule. Replacing it is called **rotating** it. Strutvane keeps the old key around so nothing breaks:

1. Run the rotate command (or do it by hand, below):

   ```bash
   node strut key:rotate
   ```

2. **What you'll see:**

   ```text
   ✔ New APP_KEY set; the old key is first in APP_PREVIOUS_KEYS.
     1 previous key still accepted for decryption and signed links.
     Deploy the new .env everywhere, and run node strut optimize again if you cache config.
   ```

3. Your `.env` now looks like this (the values are shortened here):

   ```ini title=".env"
   APP_KEY=TRCz9LNT…   (the new key, made for you)
   APP_PREVIOUS_KEYS=Hk3w0Pq…   (your old key)
   ```

4. Deploy the new `.env` to **every** server at once.

From then on:

- **New** values are always encrypted with the new `APP_KEY`.
- **Old** values still decrypt, because `decrypt()` reads the key id inside the payload and finds that key in `APP_PREVIOUS_KEYS`.
- When you remove a key from `APP_PREVIOUS_KEYS`, values made with it **can't be read any more**. Re-encrypt them first (read with `decrypt()`, write back with `encrypt()`).

`key:rotate` is destructive: outside `local`, `test`, `testing` and `development` it needs `--force --i-understand`. It also deletes the config cache (`bootstrap/cache/config.json`), which was encrypted with the old key.

`APP_PREVIOUS_KEYS` takes several keys, separated by commas, newest first:

```ini title=".env"
APP_PREVIOUS_KEYS=N2r0Qw…,x8VbLs…
```

:::caution[Coming in 0.2: sessions and API tokens after a rotation]
Decided for 0.2: the auth engine checks session ids, API tokens and recovery codes against `APP_KEY` **and then every key in `APP_PREVIOUS_KEYS`**, so a rotation signs nobody out. That part belongs to `@strutvane/auth` and isn't released yet. See [Authentication](../authentication/).
:::

### Rotating by hand

If you'd rather not use the command, or you're on a server without the CLI:

1. Copy the current `APP_KEY` value to the front of `APP_PREVIOUS_KEYS`.
2. Generate a new key and put it in `APP_KEY`:

   ```bash
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
   ```

   The command is the same in bash, zsh, PowerShell and `cmd.exe`. It prints a key in the same form `key:generate` writes.

3. Restart the app on every server.

## What a key must look like

`APP_KEY` must hold at least **32 bytes** (256 bits, the size of an AES-256 key). Two forms are accepted:

| Form | Example | Notes |
|---|---|---|
| plain text | 43 random characters, such as what `key:generate` writes | Used as UTF-8 bytes. `key:generate` writes 32 random bytes in base64url (43 characters, no prefix). |
| `base64:` + base64 | `base64:qUXgZwZVTFOLD…` (44 characters after the prefix) | Laravel's format: the part after `base64:` is decoded, and must decode to at least 32 bytes. |

Each use of the key gets its **own subkey** from the framework's one **keyring**: `keyring.derive(purpose)` is HKDF-SHA-256 over `APP_KEY`, with salt `strutvane` and info `strutvane:<purpose>:v1`, and it knows `APP_PREVIOUS_KEYS` too. Encryption, signed links, CSRF tokens, the maintenance bypass and the bootstrap caches all derive through it, so they never share the raw key, and a weakness in one can't spill into another.

## With Docker or without Docker

Encryption works the same in both. Only where `APP_KEY` lives differs:

- **Without Docker,** the app reads `.env` in your project folder.
- **With Docker,** the `app` container reads the same `.env` (your project folder is shared with it). After changing `APP_KEY`, restart the app (stop and start `npm run dev`).
- **In production,** set `APP_KEY` (and `APP_PREVIOUS_KEYS`) in your host's environment settings. Never bake them into an image: the generated `.dockerignore` keeps every `.env*` file out. See [Deployment](../deployment/).

## Encrypted environment files

`node strut env:encrypt` encrypts `.env.production` so you can commit it, and `env:decrypt` turns it back on the server, like Laravel's commands. They use their own key (`STRUT_ENV_KEY`), not `APP_KEY`. See [Configuration](../configuration/#committing-an-encrypted-envproduction) for their options.

## When decryption fails

Every failure gives the **same** error, on purpose. Telling an attacker *why* a value didn't open (wrong key, changed byte, wrong purpose) would help them.

```text
DecryptError: The value could not be decrypted: it was tampered with, truncated, or made with another key.
```

The error's `code` is `decrypt_failed`. It happens when:

- any character of the payload was changed, removed or added;
- the payload was made for another purpose;
- the key that made it is no longer in `APP_KEY` or `APP_PREVIOUS_KEYS`;
- the value doesn't start with `sv1.` (it was never encrypted, or by another tool).

Handle it where a bad value is possible:

```ts title="app/services/webhook-secrets.ts"
import { decrypt, DecryptError } from '@strutvane/framework'
import { Log } from '@strutvane/framework/facades'

export function readSecret(payload: string): string | null {
  try {
    return String(decrypt(payload, { purpose: 'project.webhook-secret' }))
  } catch (error) {
    if (error instanceof DecryptError) {
      Log.warn('A stored webhook secret could not be decrypted', { code: error.code })
      return null   // ask the user to enter the secret again
    }
    throw error
  }
}
```

**What you'll see:** `null` for a broken value, and one warning line in the log. The log line never contains the payload or the secret.

## How it's built (for the curious)

- **AES-256-GCM**, with a fresh random 12-byte IV for every value. Reusing an IV with the same key would break GCM, so there is no way to pass one in.
- The 16-byte **authentication tag** is checked at full length. Node accepts shorter tags by default (deprecated as DEP0182), which makes forgeries far cheaper; Strutvane refuses any tag that isn't exactly 16 bytes.
- The purpose is bound as GCM's **additional data** (`strutvane:encrypt:<purpose>`), so it's checked by the same tag.
- The key id is an HMAC of the key, so it identifies the key without revealing it.

## Common mistakes

### The app won't start: "APP_KEY is too short"

```text
error APP_KEY is too short: 11 bytes, at least 32 are needed.
  → Run `node strut key:generate` to create a strong key (32 random bytes).
```

**Why:** the key in `.env` is shorter than 32 bytes, so AES-256 can't use it. The error code is `invalid_app_key`; a missing key says `APP_KEY is missing.`, and a broken `base64:` one says `starts with "base64:" but the rest is not valid base64`. A bad entry in `APP_PREVIOUS_KEYS` names its position, such as `APP_PREVIOUS_KEYS[0]`.
**Fix:** generate a real key:

```bash
node strut key:generate
```

### Everything I encrypted yesterday throws `DecryptError` today

```text
DecryptError: The value could not be decrypted: it was tampered with, truncated, or made with another key.
```

**Why:** `APP_KEY` changed, and the old key isn't in `APP_PREVIOUS_KEYS`. This often happens when someone runs `key:generate --force`, or when a server has a different `.env` from the others.
**Fix:** put the old key back in `APP_PREVIOUS_KEYS` (you'll find it in your password manager or your host's settings history), then restart:

```ini title=".env"
APP_PREVIOUS_KEYS=the-old-key
```

### `decrypt()` works in one place but not another

**Why:** the value was encrypted with a `purpose`, and the other place decrypts without it (or with a different one).
**Fix:** use one constant for the purpose, shared by both places:

```ts title="app/services/purposes.ts"
import { decrypt, encrypt } from '@strutvane/framework'

export const WEBHOOK_SECRET = { purpose: 'project.webhook-secret' } as const

export const seal = (secret: string): string => encrypt(secret, WEBHOOK_SECRET)
export const open = (payload: string): unknown => decrypt(payload, WEBHOOK_SECRET)
```

### "encrypt() was called outside a request or console command"

```text
BootError: encrypt() was called outside a request or console command, so there is no current app.
```

The hint that comes with it: `Call it from a controller, middleware or command, or wrap the code in app.run(() => …) (tests: await app.run(async () => …)).`

**Why:** you called `encrypt()` at the top level of a file, or in a script that never started the app, so there is no current app to read the key from (the error code is `no_current_application`).
**Fix:** call it inside a request, command or seeder. In a test, run it inside the app (`app.run(() => encrypt('x'))`), or build an `Encrypter` yourself:

```ts title="tests/unit/webhook-secret.test.ts"
import { randomBytes } from 'node:crypto'
import { Encrypter, Keyring } from '@strutvane/framework'

// A fresh, generated 32-byte key for this test only.
const encrypter = new Encrypter(Keyring.from(`base64:${randomBytes(32).toString('base64')}`))
encrypter.decryptString(encrypter.encryptString('hi'))   // → 'hi'
```

### I encrypted passwords

**Why:** encryption can be undone by anyone who has `APP_KEY`. Passwords must never be recoverable.
**Fix:** hash them instead. See [Hashing](../hashing/).

## Next steps

- [Hashing](../hashing/): one-way protection for passwords.
- [Security Features](../security/): every protection that's on by default, including signed URLs.
- [Configuration](../configuration/): where `APP_KEY` lives and how `.env` is read.
- [Deployment](../deployment/): setting keys on a production host.
