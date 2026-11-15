---
title: Configuration
description: How settings work in a Strutvane app. Secrets and per-machine values go in .env, everything else in typed config/*.ts files, and mistakes are reported all at once when the app starts. Includes every .env key the installer writes.
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

So `config/database.ts` says "the database port is a number, read from `DB_PORT`, default `3306`", and `.env` on your laptop says `DB_PORT=3307`.

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

You don't write this file by hand. `npm create strutvane@latest` writes it, **generates the secrets** (like `APP_KEY`) and picks free ports. The full list of keys is in [Every `.env` key](#every-env-key) below.

### `.env.example`: the list of every setting

Next to `.env` is **`.env.example`**. It has the same keys, **with every secret left empty**, and it *is* committed. It's how a teammate (or a server) knows which settings exist. A few values also differ on purpose: `.env.example` says `APP_ENV=production` and `APP_DEBUG=false`, so a server that copies it starts safe.

After `git clone`, a teammate runs `npm run setup`, which creates `.env` and fills in fresh secrets.

:::danger[Never commit `.env`]
`.env` holds passwords and keys. New projects already list `.env*` in `.gitignore` (only `.env.example` is kept), and the installer refuses to make its first commit if `.env` would be included. If a secret ever lands in git, treat it as leaked: change it, don't only delete the commit.
:::

### Real environment variables win

On servers you often set variables in the environment instead of a file (in your hosting dashboard, Docker or CI). When a key is set both in the environment and in `.env`, **the environment wins**. That's Laravel's rule too, and it means one build works everywhere.

## Config files

Each file in `config/` returns one group of settings: `config/app.ts`, `config/database.ts`, `config/auth.ts`, `config/logging.ts` and so on. A config file reads `.env` through a small, typed **reader** (`env`), so every value comes out with the right type.

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
import { defineConfig } from '@strutvane/framework'

export default defineConfig((env) => ({
  name: env.string('APP_NAME', 'My App'),
  env: env.oneOf('APP_ENV', ['local', 'testing', 'production'], 'production'),
  debug: env.boolean('APP_DEBUG', false),
  url: env.url('APP_URL', 'http://localhost:3000'),
  key: env.string('APP_KEY'), // no default: the app refuses to start without it
}))
```

Every config file is listed in `config/index.ts`, so the types (and `node strut about`) know about it:

```ts title="config/index.ts"
import app from './app.ts'
import database from './database.ts'

export const config = { app, database }
```

### Every reader

| Reader | Returns | Without a default… | Example |
|---|---|---|---|
| `env.string(key, default?)` | text | the key is required | `env.string('APP_NAME', 'My App')` |
| `env.optional(key)` | text or `undefined` | it's `undefined` | `env.optional('DB_PASSWORD')` |
| `env.integer(key, default?)` | a whole number | required | `env.integer('DB_PORT', 3306)` |
| `env.boolean(key, default?)` | `true`/`false` (also accepts `1`/`0`) | required | `env.boolean('APP_DEBUG', false)` |
| `env.oneOf(key, list, default?)` | one value from the list, typed as that list | required | `env.oneOf('APP_ENV', ['local', 'production'])` |
| `env.url(key, default?)` | an absolute `http(s)` URL | required | `env.url('APP_URL')` |

An empty value (`APP_NAME=`) counts as "not set", as in Laravel.

### Reading a setting anywhere

```ts title="app/http/controllers/home.controller.ts"
import { config } from '@strutvane/framework'

const title = config('app.name')   // string
const debug = config('app.debug')  // boolean
```

**What you'll see:** the values from your config files, already typed. A typo like `config('app.debg')` is a **compile error**, not a silent `undefined`. See [Helpers, Not Facades](../helpers/) for how `config()` finds the current app.

### An advanced config file: one setting, several connections

```ts title="config/database.ts"
import { defineConfig } from '@strutvane/framework'

export default defineConfig((env) => ({
  default: env.oneOf('DB_CONNECTION', ['mysql', 'mariadb', 'pgsql', 'sqlite'], 'mysql'),
  connections: {
    mysql: {
      driver: 'mysql',
      host: env.string('DB_HOST', '127.0.0.1'),
      port: env.integer('DB_PORT', 3306),
      database: env.string('DB_DATABASE', 'my_app'),
      username: env.string('DB_USERNAME', 'root'),
      password: env.optional('DB_PASSWORD'),
    },
    sqlite: {
      driver: 'sqlite',
      database: env.string('DB_DATABASE', 'database/database.sqlite'),
    },
  },
}))
```

**What you'll see:** `config('database.default')` is typed as `'mysql' | 'mariadb' | 'pgsql' | 'sqlite'`, and `config('database.connections.mysql.port')` is a `number`.

:::caution[Coming in 0.2]
`defineConfig`, the `env` readers and `config()` are proven in the application-core prototype (spike 12). The exact import path inside `@strutvane/framework` may still change.
:::

## Every mistake, reported at once

When the app starts (and when any `node strut` command runs), Strutvane checks **every** setting before doing anything else. If something is wrong, it stops and lists all the problems together:

```text
  ✖ The app can't start: 2 environment variables need attention.
  - APP_KEY is required (a text value); add it to .env (read in config/app.ts)
  - APP_DEBUG must be true or false (got "yes") (read in config/app.ts)
  → Fix the values in .env (see .env.example for every key) and start again.
```

Why all at once? Fixing a new server one setting at a time ("restart, next error, restart…") is the most frustrating loop in operations.

## Every `.env` key

The installer writes only the keys your answers need, in this order. "Written today" means the installer prototype (spike 13) already writes the key; everything else is designed and marked.

:::caution[Coming in 0.2]
The installer and its `.env` writer are proven in a prototype (spike 13). Keys marked *designed* below are decided but not written by the prototype yet.
:::

### Application

| Key | What it's for | Default in a new app |
|---|---|---|
| `APP_NAME` | Your app's name, shown in the UI and in emails. | the project name |
| `APP_ENV` | `local`, `testing` or `production`. Seeders don't run by themselves in production, and the debug error page only appears in `local` and `testing`. | `local` (`.env.example`: `production`) |
| `APP_KEY` | The key that signs cookies and CSRF tokens and encrypts data. 32 random bytes, **generated**. Keep it secret. | generated |
| `APP_DEBUG` | `true` shows detailed error pages, in `local`/`testing` only. The debug page is never shown in production, whatever this says. | `true` (`.env.example`: `false`) |
| `APP_URL` | The address people use to reach the app. Also the origin the CSRF check trusts. | `http://localhost:3000` |
| `APP_PORT` | The port `npm run dev` listens on. The installer picks the next free one if 3000 is taken. | `3000` |
| `APP_PREVIOUS_KEYS` | Old keys kept by `node strut key:rotate`, so existing cookies and encrypted values still open. *Designed.* | not set |

### Database

| Key | What it's for | Default in a new app |
|---|---|---|
| `DB_CONNECTION` | `mysql`, `mariadb`, `pgsql` or `sqlite`. `postgres` is accepted as another name for `pgsql`. The installer writes `mariadb` when it finds a MariaDB server (XAMPP ships one). | `mysql` |
| `DB_HOST`, `DB_PORT` | Where the database server is. With Docker, `DB_HOST=db` (the container's name) and the database's own port. | `127.0.0.1` / `3306` (PostgreSQL `5432`; Docker: `db`) |
| `DB_DATABASE` | The database name, or the file for SQLite. | your project name (SQLite: `database/database.sqlite`) |
| `DB_TEST_DATABASE` | A separate database for `npm test`, so tests never touch your local data. | `<name>_test` (SQLite: `database/testing.sqlite`) |
| `DB_USERNAME`, `DB_PASSWORD` | How the app signs in to the database. With Docker the password is **generated**; with your own server it's the one you typed. An empty password is accepted for a server on your own computer (XAMPP's `root`), with a warning. | `root` (PostgreSQL `postgres`); Docker: your project name |
| `DB_URL` | The whole connection in one line, as cloud providers give it: `mysql://user:password@host:3306/my_app`. When it's set, it wins over the separate keys above. A secret, because it contains the password. | not set |
| `DB_SOCKET` | A Unix socket instead of host and port (MySQL, MariaDB or PostgreSQL on macOS and Linux). | not set |
| `DB_SSLMODE` | Encrypt the connection: `disable`, `prefer`, `require`, `verify-ca` or `verify-full` (PostgreSQL's names, as in Laravel). Use `require` or stricter for a remote or cloud database. | not set (no TLS for a local server) |
| `DB_SSL_CA` | The path to your provider's CA certificate, for `verify-ca` and `verify-full`. | not set |
| `DB_MIGRATION_USERNAME`, `DB_MIGRATION_PASSWORD` | **PostgreSQL.** Migrations run as an "owner" role, while the app connects as a plain role that can't bypass row-level security. With Docker the installer creates both roles; on your own server it creates them when your account may, or prints the SQL. Password **generated** in Docker. | `<name>_owner` |
| `DB_ROOT_PASSWORD` | **Docker only.** The database image needs an administrator password; the app never uses it. **Generated.** | generated |

```ini title=".env (a cloud database)"
DB_CONNECTION=pgsql
DB_URL=postgres://my_app_app:the-password@db.example.com:5432/my_app
DB_SSLMODE=verify-full
DB_SSL_CA=storage/certs/provider-ca.pem
```

:::caution[Coming in 0.2]
Decided on 2026-11-15 and not built yet: `mariadb` (and detecting it), `pgsql` as the written name (the installer prototype still writes `postgres`), `DB_URL`, `DB_SOCKET`, `DB_SSLMODE`, `DB_SSL_CA`, the empty-password warning and the PostgreSQL roles on your own server. The values accepted by `DB_SSLMODE` follow Laravel's PostgreSQL setting; how they map onto MySQL and MariaDB isn't written down yet.
:::

### Mail

| Key | What it's for | Default in a new app |
|---|---|---|
| `MAIL_MAILER` | How mail is sent. Without Docker, `log` writes mail to the log. With Docker, `smtp` sends it to Mailpit, a local inbox. | `log` (Docker: `smtp`) |
| `MAIL_HOST`, `MAIL_PORT` | **Docker only.** Mailpit inside Docker. | `mailpit` / `1025` |
| `FORWARD_MAILPIT_PORT` | **Docker only.** The port of the Mailpit inbox on your computer. | `8025` |

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

There is **no `SEED_ADMIN_PASSWORD`**. The first admin's password is never written to any file: the installer shows a generated one once, or you type one. See [Seeding](../seeding/). There is no `AUTH_SECRET` either: `APP_KEY` is the one root secret, and auth derives its own keys from it.

:::caution[Coming in 0.2]
The installer prototype (spike 13) still writes `AUTH_SECRET`, `AUTH_MODE`, `AUTH_REGISTRATION`, `AUTH_EMAIL_VERIFICATION`, `AUTH_TWO_FACTOR` and `AUTH_PASSKEYS`. Those keys are removed: the features move into `config/auth.ts` (decided on 2026-11-15). See [Authentication](../authentication/).
:::

### Teams and AI

| Key | What it's for | Default in a new app |
|---|---|---|
| `TENANCY_ENABLED` | Written when you chose teams. | `true` |
| `AI_PROVIDER` | Written when you chose AI features: `anthropic`, `openai`, `google` or `ollama`. | your choice |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY` | The provider's key. Written **empty**: the installer never asks for it, so it can't end up in your shell history or a CI log. Paste it in yourself. | empty |
| `OLLAMA_HOST` | For local models with Ollama. | `http://127.0.0.1:11434` |

### Logging

:::caution[Coming in 0.2]
The logging keys are decided (ADR-0022) but **designed, not built yet**: the installer prototype doesn't write them, and the framework reads these defaults when a key is missing. See [Logging](../logging/).
:::

| Key | What it's for | Default |
|---|---|---|
| `LOG_CHANNEL` | Where logs go: `single`, `daily`, `stack`, `stderr`, `stdout`, `slack`, `null`, or a channel you define. | `stack` |
| `LOG_STACK` | The channels `stack` writes to, comma-separated (`daily,slack`). | `daily` |
| `LOG_LEVEL` | The least important level that's still written. | `debug` in local, `info` otherwise |
| `LOG_DAILY_DAYS` | How many days of daily files to keep. | `14` |
| `LOG_FORMAT` | `line` (readable) or `json` (one JSON object per line). | `line` |
| `LOG_MAX_FILE_SIZE` | A file grows to this size, then a new part file starts. | `100mb` |
| `LOG_PATH` | The folder for log files. | `storage/logs` |
| `LOG_SLACK_WEBHOOK_URL` | The Slack webhook for the `slack` channel. A secret. | not set |
| `LOG_DEPRECATIONS_CHANNEL` | Where deprecation warnings go. | `null` (discarded) |

### Which secrets are generated

`APP_KEY`, and with Docker `DB_PASSWORD`, `DB_ROOT_PASSWORD` and `DB_MIGRATION_PASSWORD` (PostgreSQL). Each is 32 random bytes, written to `.env` only, always empty in `.env.example`. If `npm run setup` finds a placeholder such as `APP_KEY=changeme`, it replaces it. On macOS and Linux, `.env` is created readable only by you.

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

- **`strutvane.json`** (committed) records every installer answer, defaults included, plus the packages they brought, so `node strut install:<name>` later knows what you picked. It **never holds a secret**.
- **`config/ui.ts`** (full-stack apps) names your design (`design: 'crisp'`), the default appearance, the UI languages and a few UI switches. See [Designs](../designs/).
- **`.strutvane/setup.json`** (git-ignored) tracks the installer's steps so `npm run setup` can resume. It holds no secret either.

## Setting a variable for one command

Sometimes you want a different value only once, for example to see what production would do. The environment beats `.env`.

macOS / Linux (bash, zsh):

```bash
APP_ENV=production node strut about
```

Windows PowerShell:

```powershell
$env:APP_ENV='production'; node strut about; Remove-Item Env:APP_ENV
```

Windows cmd:

```bat
set APP_ENV=production && node strut about
```

## Committing an encrypted `.env.production`

Some teams want production settings in git, encrypted. Like Laravel's `env:encrypt`:

```bash
node strut env:encrypt --env=production   # writes .env.production.encrypted
node strut env:decrypt --env=production   # on the server, with the key in an environment variable
```

:::caution[Coming in 0.2]
`env:encrypt` and `env:decrypt` are designed (blueprint §2.2) but not built yet. The options above follow Laravel's and may change.
:::

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

Your migrations are written once and work on MySQL, PostgreSQL and SQLite. See [Migrations](../migrations/).

## Common mistakes

### The app won't start: "environment variables need attention"

```text
  ✖ The app can't start: 1 environment variable needs attention.
  - APP_KEY is required (a text value); add it to .env (read in config/app.ts)
```

**Why:** `.env` is missing, or a required key is empty. This happens after `git clone`, because `.env` is never committed.
**Fix:** let setup create it with fresh secrets:

```bash
npm run setup
```

### "must be true or false (got "yes")"

```text
  - APP_DEBUG must be true or false (got "yes") (read in config/app.ts)
```

**Why:** boolean settings accept only `true`, `false`, `1` or `0`.
**Fix:** `APP_DEBUG=true` in `.env`.

### My change to `.env` didn't do anything

**Why:** the same key is also set in your shell or by your host, and the real environment wins over `.env`.
**Fix:** check where it's set (`echo $APP_ENV` in bash, `$env:APP_ENV` in PowerShell) and remove it there, or change it there.

### I can't find the admin password in `.env`

**Why:** it's never stored in a file. The installer showed it once.
**Fix:** set a new one:

```bash
node strut user:password admin@my-app.test
```

### My database GUI can't connect with `DB_HOST=db`

**Why:** `db` is a name only the containers know. Your computer reaches the database through the forwarded port.
**Fix:** connect your GUI to `127.0.0.1` on the port in `FORWARD_DB_PORT`, with `DB_USERNAME` and `DB_PASSWORD`. Leave `DB_HOST=db` as it is.

### `config('app.nmae')` doesn't compile

```text
error TS2345: Argument of type '"app.nmae"' is not assignable to parameter of type …
```

**Why:** config keys are typed from your config files, so typos are caught before the code runs.
**Fix:** use the right key (`config('app.name')`). If it's a new setting, add it to the config file first.

## Next steps

- [Docker](../docker/): what the Docker keys do.
- [Logging](../logging/): the `LOG_*` keys in action.
- [Directory Structure](../structure/): where `config/` and everything else lives.
- [Helpers, Not Facades](../helpers/): `config()`, `route()` and friends.
