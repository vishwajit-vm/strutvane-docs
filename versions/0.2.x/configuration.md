---
title: Configuration
description: How settings work in a Strutvane app. Secrets and per-machine values go in .env, everything else in typed config/*.ts files, and mistakes are reported all at once when the app starts. Includes every .env key, and which ones the framework itself reads.
---

**Settings** are the values your app needs that aren't code: its name, its address, how to reach the database, secret keys. This page shows where they live, how to read them from your code, what happens when one is wrong, and every key a new app's `.env` contains.

:::tip[Coming from Laravel?]
It's the same model: `.env` plus `config/*.php` becomes `.env` plus `config/*.ts`, and `config('app.name')` works the same way. Most keys keep Laravel's names (`APP_KEY`, `DB_HOST`, `LOG_CHANNEL`, `LOG_STACK`, `FORWARD_DB_PORT` as in Sail). Two differences: `env('APP_DEBUG', false)` becomes a **typed reader** (`env.boolean('APP_DEBUG', false)`), so `config('app.debug')` is a real `boolean`; and the app checks **every** setting at start-up and lists all the problems at once.
:::

## Two places for settings

A Strutvane app keeps its settings in two places:

| Where | What goes there | Committed to git? |
|---|---|---|
| **`.env`** | Values that change from machine to machine: passwords, keys, ports, the database name. | **Never** |
| **`config/*.ts`** | Everything else, plus *which* `.env` values to read, with their types and defaults. | Yes |

So `config/app.ts` says "the port is a number, read from `APP_PORT`, default `3000`", and `.env` on your laptop says `APP_PORT=3001`.

## The `.env` file

`.env` sits in your project's root folder. Each line is a `KEY=value` pair. Here is the start of a new app's `.env` (MySQL, without Docker; the secret values are replaced by placeholders here):

```ini title=".env"
# Application
APP_NAME=my-app
APP_ENV=local
APP_KEY=generated-for-you
APP_DEBUG=true
APP_URL=http://localhost:3000
APP_PORT=3000

# Database
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=my_app
DB_TEST_DATABASE=my_app_test
DB_USERNAME=my_app
DB_PASSWORD=the-password-you-typed
```

You don't write this file by hand. `npm create strutvane@latest` writes it, **generates the secrets** (like `APP_KEY`) and picks free ports. If you ever need a key yourself, `node strut key:generate` writes a fresh `APP_KEY` into `.env`. The full list of keys is in [Every `.env` key](#every-env-key) below.

### `.env.example`: the list of every setting

Next to `.env` is **`.env.example`**. It has the same keys, **with every secret left empty**, and it *is* committed. It's how a teammate (or a server) knows which settings exist. A few values also differ on purpose: `.env.example` says `APP_ENV=production` and `APP_DEBUG=false`, so a server that copies it starts safe.

`node strut env:check` compares the two files: it reports keys missing from `.env`, unknown or empty ones, invalid lines (by file and line number only, never the value), and a secret-looking key that has a value in `.env.example`. It exits with code 3 when there are errors, so it fits in CI.

:::danger[Never commit `.env`]
`.env` holds passwords and keys. New projects already list `.env*` in `.gitignore` (only `.env.example` is kept). If a secret ever lands in git, treat it as leaked: change it, don't only delete the commit.
:::

### Real environment variables win

On servers you often set variables in the environment instead of a file (in your hosting dashboard, Docker or CI). When a key is set both in the environment and in `.env`, **the environment wins**. That's Laravel's rule too, and it means one build works everywhere. An empty value (`APP_NAME=`) counts as "not set".

## Config files

Each file in `config/` returns one group of settings: `config/app.ts`, `config/cache.ts`, `config/session.ts` and so on. A config file reads `.env` through a small, typed **reader** (`env`), so every value comes out with the right type.

### The smallest config file

```ts title="config/app.ts"
import { defineConfig } from '@strutvane/framework'

export default defineConfig((env) => ({
  name: env.string('APP_NAME', 'My App'),
}))
```

**What you'll see:** `config('app.name')` returns `'My App'`, or whatever `APP_NAME` says in `.env`.

### A typical config file

```ts title="config/app.ts"
import { APP_ENVIRONMENTS, defineConfig } from '@strutvane/framework'

export default defineConfig((env) => ({
  name: env.string('APP_NAME', 'My App'),
  env: env.oneOf('APP_ENV', APP_ENVIRONMENTS, 'production'),
  debug: env.boolean('APP_DEBUG', false),
  url: env.url('APP_URL', 'http://localhost:3000'),
  port: env.integer('APP_PORT', 3000),
  key: env.string('APP_KEY'), // no default: the app refuses to start without it
  previous_keys: env.string('APP_PREVIOUS_KEYS', ''),
}))
```

`APP_ENVIRONMENTS` is `['local', 'testing', 'staging', 'production']`, so `config('app.env')` is typed as exactly those four.

Every config file is listed in `config/index.ts`, and `bootstrap/app.ts` hands that object to the app:

```ts title="config/index.ts"
import app from './app.ts'
import cache from './cache.ts'

export const config = { app, cache }
```

```ts title="bootstrap/app.ts"
import { dirname } from 'node:path'
import { Application } from '@strutvane/framework'
import { config } from '../config/index.ts'

// Teach config() your keys and their types (see "Reading a setting anywhere").
type AppConfig = { readonly [File in keyof typeof config]: ReturnType<(typeof config)[File]['build']> }
declare module '@strutvane/framework' {
  interface ConfigRegistry extends AppConfig {}
}

export default Application.configure({ basePath: dirname(import.meta.dirname) })
  .withConfig(config)
  .create()
```

### What the framework itself reads

Your config files may hold anything, but a few keys are read by the framework. Name them exactly like this:

| Key | Read for | When it's missing |
|---|---|---|
| `app.env` | The environment (`local`, `testing`, `staging`, `production`) | `APP_ENV` from the environment, else `production` |
| `app.debug` | The debug page (only in `local` and `testing`) | `false` |
| `app.key` | The root secret every key is derived from | `APP_KEY` from the environment; the app refuses to start without one |
| `app.previous_keys` | Old keys, comma-separated, still accepted after a rotation | `APP_PREVIOUS_KEYS` from the environment |
| `app.url` | Trusted host, CSRF origin, absolute URLs, `Secure` cookies | `http://localhost` |
| `app.port` | The port `node strut start` and `dev` listen on | `3000` |
| `session.cookie` | The session cookie's base name | `strutvane_session` |
| `cache` | `{ default, stores }` for the [cache](../cache/) | a `memory` store |

:::caution[An optional key must hold a string]
Write `previous_keys: env.string('APP_PREVIOUS_KEYS', '')`, not `env.optional(…)`. When `app.previous_keys` exists but holds `undefined`, 0.2.0-next.0 reads it as the text `undefined` and refuses to start with `APP_PREVIOUS_KEYS[0] is too short`.
:::

The database is the exception: the ORM and the migration commands read the `DB_*` keys **directly** from the environment (see [Database](#database) below), so you don't need a `config/database.ts` for them.

### Every reader

| Reader | Returns | Without a default… | Example |
|---|---|---|---|
| `env.string(key, default?)` | text | the key is required | `env.string('APP_NAME', 'My App')` |
| `env.optional(key)` | text or `undefined` | it's `undefined` | `env.optional('SENTRY_DSN')` |
| `env.integer(key, default?)` | a whole number | required | `env.integer('APP_PORT', 3000)` |
| `env.boolean(key, default?)` | `true`/`false` (also accepts `1`/`0`) | required | `env.boolean('APP_DEBUG', false)` |
| `env.oneOf(key, list, default?)` | one value from the list, typed as that list | required | `env.oneOf('APP_ENV', ['local', 'production'])` |
| `env.url(key, default?)` | an absolute `http(s)` URL | required | `env.url('APP_URL')` |

An empty value (`APP_NAME=`) counts as "not set", as in Laravel.

### Reading a setting anywhere

```ts title="app/http/controllers/home.controller.ts"
import { config, Controller, type HttpContext } from '@strutvane/framework'

export class HomeController extends Controller {
  index(ctx: HttpContext): Response {
    const title = config('app.name')   // string
    const debug = config('app.debug')  // boolean
    return ctx.json({ title, debug })
  }
}
```

**What you'll see:** the values from your config files, already typed. With the `ConfigRegistry` block in `bootstrap/app.ts`, a typo like `config('app.debg')` is a **compile error**, not a silent `undefined`; without it, `config()` takes any string and returns `unknown`. An unknown key always throws at runtime (`unknown_config_key`). Config is **frozen** after the app boots. See [Helpers](../helpers/) for how `config()` finds the current app.

### An advanced config file: your own settings

Anything an app needs can live in config. Here a reports feature gets typed settings:

```ts title="config/reports.ts"
import { defineConfig } from '@strutvane/framework'

export default defineConfig((env) => ({
  timezone: env.string('REPORTS_TIMEZONE', 'UTC'),
  maxRows: env.integer('REPORTS_MAX_ROWS', 10_000),
  format: env.oneOf('REPORTS_FORMAT', ['csv', 'xlsx'], 'csv'),
}))
```

**What you'll see:** once `reports` is in `config/index.ts`, `config('reports.format')` is typed as `'csv' | 'xlsx'`, and `config('reports.maxRows')` is a `number`.

## Every mistake, reported at once

When the app boots (`node strut start`, `node strut dev`, and every command that boots the app, such as `route:list` or `optimize`), Strutvane checks **every** setting before doing anything else. If something is wrong, it stops with exit code 3 and lists all the problems together:

```text
error The app can't start: 2 environment variables need attention.
  - APP_KEY is required (a text value); add it to .env (read in config/app.ts)
  - APP_DEBUG must be true or false (got "yes") (read in config/app.ts)
  → Fix the values in .env (see .env.example for every key) and start again.
```

Why all at once? Fixing a new server one setting at a time ("restart, next error, restart…") is the most frustrating loop in operations. A value is quoted only when it can't be a secret (a boolean, a number, a choice); text and URL problems name the key alone.

## Every `.env` key

The installer writes only the keys your answers need. The tables say what each key is for and what a new app gets.

:::caution[What exists, and when]
`@strutvane/framework` 0.2.0-next.0 reads the `APP_*` keys through your `config/app.ts` (see [What the framework itself reads](#what-the-framework-itself-reads)) and the `DB_*` keys directly. The installer that writes `.env` is `create-strutvane`, which isn't published yet; keys only it uses are marked *installer*.
:::

### Application

| Key | What it's for | Default in a new app |
|---|---|---|
| `APP_NAME` | Your app's name, shown in the UI and in emails. | the project name |
| `APP_ENV` | `local`, `testing`, `staging` or `production`. Destructive commands (`migrate:fresh`, `key:rotate`, …) run without confirmation only in local environments; elsewhere they need `--force --i-understand`, and `migrate` needs `--force` in production. The debug error page only appears in `local` and `testing`. When it isn't set at all, the app runs as `production`. | `local` (`.env.example`: `production`) |
| `APP_KEY` | The root secret: it signs links and CSRF tokens and encrypts data, and every other key is derived from it. At least 32 bytes; `key:generate` writes 32 random bytes. Keep it secret. | generated |
| `APP_DEBUG` | `true` shows detailed error pages, in `local`/`testing` only. With `APP_ENV=production`, `APP_DEBUG=true` stops the app from starting (see [Security](../security/#secrets-and-the-debug-page)). | `true` (`.env.example`: `false`) |
| `APP_URL` | The address people use to reach the app. Also the host and origin the trusted-host and CSRF checks trust. | `http://localhost:3000` |
| `APP_PORT` | The port `node strut dev` and `start` listen on (`--port` overrides it). | `3000` |
| `APP_PREVIOUS_KEYS` | Old keys kept by `node strut key:rotate`, comma-separated, newest first, so encrypted values and signed links made with them still open. | not set |

### Database

The ORM and the migration commands read these keys directly. Every problem is reported at once (exit code 3), and the password is never printed.

| Key | What it's for | Default in a new app |
|---|---|---|
| `DB_CONNECTION` | `mysql`, `mariadb`, `pgsql` or `sqlite`. `postgres` is accepted as another name for `pgsql`. A MySQL-family server is identified from its version when it connects, so XAMPP's MariaDB configured as `mysql` still gets MariaDB's SQL. | `mysql` |
| `DB_HOST`, `DB_PORT` | Where the database server is. With Docker, `DB_HOST=db` (the container's name) and the database's own port. | `127.0.0.1` / `3306` (PostgreSQL `5432`; Docker: `db`) |
| `DB_DATABASE` | The database name, or the file for SQLite (relative to the project, or `:memory:`). | your project name (SQLite: `database/database.sqlite`) |
| `DB_TEST_DATABASE` | *Installer.* A separate database for `npm test`, so tests never touch your local data. | `<name>_test` (SQLite: `database/testing.sqlite`) |
| `DB_USERNAME`, `DB_PASSWORD` | How the app signs in to the database. With Docker the password is **generated**; with your own server it's the one you typed. | `root` (PostgreSQL `postgres`); Docker: your project name |
| `DB_URL` | The whole connection in one line, as cloud providers give it: `mysql://user:password@host:3306/my_app` (also `mariadb://`, `postgres://`, `postgresql://`). When it's set, it wins over the separate keys above, and without `DB_CONNECTION` its scheme picks the engine. A secret, because it contains the password. | not set |
| `DB_SOCKET` | A Unix socket instead of host and port (a MySQL/MariaDB socket file, or the PostgreSQL socket folder) on macOS and Linux. | not set |
| `DB_SSLMODE` | Encrypt the connection: `disable`, `prefer`, `require`, `verify-ca` or `verify-full` (PostgreSQL's names, used for every engine). Use `require` or stricter for a remote or cloud database. | not set (no TLS for a local server) |
| `DB_SSL_CA` | The path to your provider's CA certificate, for `verify-ca` and `verify-full`. The file is read at start-up; an unreadable file is reported. | not set |
| `DB_MIGRATION_LOCK_TIMEOUT` | **PostgreSQL.** How long a migration waits for a table lock (`250ms`, `10s` or a number of milliseconds), so a migration never queues behind a long query and blocks your app. | `10s` |
| `DB_MIGRATION_USERNAME`, `DB_MIGRATION_PASSWORD` | *Installer.* **PostgreSQL.** Migrations run as an "owner" role, while the app connects as a plain role that can't bypass row-level security. | `<name>_owner` |
| `DB_ROOT_PASSWORD` | *Installer.* **Docker only.** The database image needs an administrator password; the app never uses it. **Generated.** | generated |

Without any `DB_*` keys, the framework's own fallbacks are MySQL on `127.0.0.1:3306`, database `strutvane`, user `root`.

```ini title=".env (a cloud database)"
DB_CONNECTION=pgsql
DB_URL=postgres://my_app_app:the-password@db.example.com:5432/my_app
DB_SSLMODE=verify-full
DB_SSL_CA=storage/certs/provider-ca.pem
```

See [Database](../database/) for each engine and for local servers such as XAMPP.

### Mail

| Key | What it's for | Default in a new app |
|---|---|---|
| `MAIL_MAILER` | How mail is sent. Without Docker, `log` writes mail to the log. With Docker, `smtp` sends it to Mailpit, a local inbox. | `log` (Docker: `smtp`) |
| `MAIL_HOST`, `MAIL_PORT` | **Docker only.** Mailpit inside Docker. | `mailpit` / `1025` |
| `FORWARD_MAILPIT_PORT` | **Docker only.** The port of the Mailpit inbox on your computer. | `8025` |

:::caution[Coming in 0.3]
The framework's mailer (and the `Mail` facade) arrives in 0.3; until then these keys are written by the installer for the auth package's emails and for Docker's Mailpit.
:::

### Docker (local only)

These exist only when you chose **with Docker**. See [Docker](../docker/).

| Key | What it's for | Default in a new app |
|---|---|---|
| `COMPOSE_PROJECT_NAME` | Names your containers, so two projects never touch each other's. | from the project name |
| `STRUT_UID`, `STRUT_GID` | The user the app container runs as on Linux, so files it writes belong to you, not to `root`. Docker Desktop on Windows and macOS maps ownership itself. | `1000` |
| `FORWARD_DB_PORT` | The database's port on your computer, for a GUI client such as TablePlus. | `3306` or `5432` |

### Auth

Which sign-in features are on lives in `config/auth.ts`, which the installer writes from your answers, not in `.env` keys. The only auth key in `.env` is the first admin's address:

| Key | What it's for | Default in a new app |
|---|---|---|
| `SEED_ADMIN_EMAIL` | The first admin's email, used by the default seeder. | `admin@<name>.test` |

There is **no `SEED_ADMIN_PASSWORD`**. The first admin's password is never written to any file: the installer shows a generated one once, or you type one. See [Seeding](../seeding/). There is no `AUTH_SECRET` either: `APP_KEY` is the one root secret, and auth derives its own keys from it. See [Authentication](../authentication/).

### Teams and AI

| Key | What it's for | Default in a new app |
|---|---|---|
| `AI_PROVIDER` | *Installer.* Written when you chose AI features: `anthropic`, `openai`, `google` or `ollama`. | your choice |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY` | The provider's key. Written **empty**: the installer never asks for it, so it can't end up in your shell history or a CI log. Paste it in yourself. | empty |
| `OLLAMA_HOST` | For local models with Ollama. | `http://127.0.0.1:11434` |

Teams aren't a `.env` key: they're switched on in `config/tenancy.ts` (`enabled`, which is `false` unless you answered yes to teams). The ORM's tenant scope is active only when it's on. See [Tenancy](../tenancy/).

### Logging

:::caution[Coming in 0.2]
The logging keys are decided (ADR-0022) and being built; `@strutvane/framework` 0.2.0-next.0 doesn't read them yet (its logger writes JSON lines to the terminal). See [Logging](../logging/).
:::

| Key | What it's for | Default |
|---|---|---|
| `LOG_CHANNEL` | Where logs go: `single`, `daily`, `stack`, `stderr`, `stdout`, `slack`, `null`, or a channel you define. | `stack` (the [production Dockerfile](../docker/#the-production-dockerfile) sets `stderr`) |
| `LOG_STACK` | The channels `stack` writes to, comma-separated (`daily,slack`). | `daily` |
| `LOG_LEVEL` | The least important level that's still written. | `debug` in local, `info` otherwise |
| `LOG_DAILY_DAYS` | How many days of daily files to keep. | `14` |
| `LOG_FORMAT` | `line` (readable) or `json` (one JSON object per line). | `line` (the production Dockerfile sets `json`) |
| `LOG_MAX_FILE_SIZE` | A file grows to this size, then a new part file starts. | `100mb` |
| `LOG_PATH` | The folder for log files. | `storage/logs` |
| `LOG_SLACK_WEBHOOK_URL` | The Slack webhook for the `slack` channel. A secret. | not set |
| `LOG_DEPRECATIONS_CHANNEL` | Where deprecation warnings go. | `null` (discarded) |

### Which secrets are generated

`APP_KEY`, and with Docker `DB_PASSWORD`, `DB_ROOT_PASSWORD` and `DB_MIGRATION_PASSWORD` (PostgreSQL). Each is 32 random bytes, written to `.env` only, always empty in `.env.example`. On macOS and Linux, `.env` is created readable only by you.

## With Docker or without Docker

What `.env` looks like depends on that installer answer:

| | With Docker | Without Docker |
|---|---|---|
| Database host | `DB_HOST=db` (the container's name; only the app container can reach it by that name) | `127.0.0.1` or your server, or a SQLite file |
| Database port on your computer | `FORWARD_DB_PORT` | `DB_PORT` |
| Mail | `MAIL_MAILER=smtp` to Mailpit; inbox at `http://localhost:8025` | `MAIL_MAILER=log` |
| Who reads `.env` | the app container (every `node strut` command runs there) | Node on your computer |

You don't edit the Docker values by hand: the installer writes the values that match the containers it starts. See [Docker](../docker/).

## The files next to `.env`

- **`strutvane.json`** (committed, *installer*) records every installer answer, defaults included, plus the packages they brought, so a later package install knows what you picked. It **never holds a secret**.
- **`config/ui.ts`** (full-stack apps) names your design (`design: 'crisp'`), the default appearance, the UI languages and a few UI switches. See [Designs](../designs/).
- **`.strutvane/`** (committed) holds the files `node strut migrate` and `node strut sync` generate from your migrations: `types/models.d.ts`, `resources.json`, `schema.json` and the SQL per engine.
- **`.strutvane/local/`** (git-ignored) is per-computer state, such as the installer's progress. It holds no secret either.

## Setting a variable for one command

Sometimes you want a different value only once, for example to see what production would do. The environment beats `.env`.

macOS / Linux (bash, zsh):

```bash
APP_ENV=production node strut security:check
```

Windows PowerShell:

```powershell
$env:APP_ENV='production'; node strut security:check; Remove-Item Env:APP_ENV
```

Windows cmd:

```bat
set APP_ENV=production && node strut security:check
```

Every command also takes `--env <name>`, which loads `.env.<name>` over `.env` for that command: `node strut migrate:status --env=testing` reads `.env.testing`.

## Committing an encrypted `.env.production`

Some teams want production settings in git, encrypted. Like Laravel's `env:encrypt`:

```bash
node strut env:encrypt --env=production   # writes .env.production.encrypted and prints the key once
node strut env:decrypt --env=production   # on the server, with the key in STRUT_ENV_KEY
```

**What you'll see** after `env:encrypt` (the key is different every time):

```text
✔ Encrypted .env.production into .env.production.encrypted.

  Decryption key (shown once, never saved; keep it in your secrets manager or CI secrets):
  base64:q4F2n0vXm8Lk…(44 characters in all)
```

The key is never written to disk. `env:decrypt` reads it from the `STRUT_ENV_KEY` environment variable (preferred) or `--key=base64:…` (which lands in shell history). A wrong key or a changed file writes nothing, and an existing file is replaced only with `--force`. See [Security Features](../security/#encrypted-environment-files).

## Switching database

To move from SQLite to MySQL later (or the other way around), change the `DB_*` keys in `.env` and run your migrations against the new database:

```ini title=".env"
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=my_app
DB_USERNAME=root
DB_PASSWORD=secret
```

```bash
node strut migrate
```

Your migrations are written once and work on MySQL, MariaDB, PostgreSQL and SQLite. See [Migrations](../migrations/).

## Common mistakes

### The app won't start: "environment variables need attention"

```text
error The app can't start: 1 environment variable needs attention.
  - APP_KEY is required (a text value); add it to .env (read in config/app.ts)
  → Fix the values in .env (see .env.example for every key) and start again.
```

**Why:** `.env` is missing, or a required key is empty. This happens after `git clone`, because `.env` is never committed.
**Fix:** copy `.env.example` to `.env`, fill in your values, and generate a key:

```bash
node strut key:generate
```

### "APP_KEY is too short"

```text
error APP_KEY is too short: 11 bytes, at least 32 are needed.
  → Run `node strut key:generate` to create a strong key (32 random bytes).
```

**Why:** the key must hold at least 32 bytes; a placeholder like `changeme` doesn't.
**Fix:** `node strut key:generate --force` (replacing a key makes values encrypted with the old one unreadable; on a live app use `node strut key:rotate`).

### "must be true or false (got "yes")"

```text
  - APP_DEBUG must be true or false (got "yes") (read in config/app.ts)
```

**Why:** boolean settings accept only `true`, `false`, `1` or `0`.
**Fix:** `APP_DEBUG=true` in `.env`.

### My change to `.env` didn't do anything

**Why:** the same key is also set in your shell or by your host, and the real environment wins over `.env`. Or you ran `node strut config:cache`, so the app reads the cached snapshot (see [Optimization](../optimization/)).
**Fix:** check where it's set (`echo $APP_ENV` in bash, `$env:APP_ENV` in PowerShell) and remove it there, or run `node strut config:clear`.

### My database GUI can't connect with `DB_HOST=db`

**Why:** `db` is a name only the containers know. Your computer reaches the database through the forwarded port.
**Fix:** connect your GUI to `127.0.0.1` on the port in `FORWARD_DB_PORT`, with `DB_USERNAME` and `DB_PASSWORD`. Leave `DB_HOST=db` as it is.

### "There is no config value at …"

```text
There is no config value at "app.nmae".
  → Check the key against the files in config/; the first segment is the file name (for example "app.name" reads config/app.ts).
```

**Why:** the key doesn't exist. With the `ConfigRegistry` block in `bootstrap/app.ts`, TypeScript catches this before the code runs (`Argument of type '"app.nmae"' is not assignable to parameter of type …`).
**Fix:** use the right key (`config('app.name')`). If it's a new setting, add it to the config file first.

## Next steps

- [Docker](../docker/): what the Docker keys do.
- [Database](../database/): each engine and its `DB_*` keys.
- [Directory Structure](../structure/): where `config/` and everything else lives.
- [Helpers](../helpers/): `config()`, `route()` and friends.
