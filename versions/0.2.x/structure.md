---
title: Directory Structure
description: A guided tour of a new Strutvane app. Which folder holds what, which files depend on your installer answers, which files you edit, which ones Strutvane writes for you, what is committed to git, and where to put new code.
---

Every Strutvane app has the same folders, so you (and your teammates, and AI coding agents) always know where to look. This page is a tour: what each folder is for, which files are yours, which ones Strutvane writes, and where new code belongs.

:::tip[Coming from Laravel?]
It's Laravel's layout with TypeScript file names: `app/Http/Controllers/PostController.php` becomes `app/http/controllers/post.controller.ts`, `app/Models/Post.php` becomes `app/models/post.ts`, `bootstrap/app.php` becomes `bootstrap/app.ts`, and `artisan` becomes `strut.js` (run with `node strut`).

There's no `resources/views`: the UI is a React app, and its customisations live in `resources/ui`. There's no `vendor/` either: packages live in `node_modules/`, installed by npm.
:::

## The big picture

Here is what `npm create strutvane@latest my-app` gives you with the default answers (a full app with email sign-in, MySQL with Docker):

```text
my-app/
├─ app/
│  ├─ http/
│  │  ├─ controllers/      your controllers (optional: resources work without one)
│  │  ├─ middleware/       code that runs before or after requests
│  │  └─ requests/         form requests (validation rules)
│  ├─ models/              one class per table: post.ts, user.ts
│  ├─ policies/            who may do what: post.policy.ts, user.policy.ts
│  └─ providers/           register your own services: app.provider.ts
├─ bootstrap/
│  ├─ app.ts               builds the application: routing, middleware, errors
│  └─ providers.ts         the list of service providers
├─ config/                 typed settings: app.ts, database.ts, auth.ts, ui.ts, …
├─ database/
│  ├─ migrations/          your tables and columns (the source of truth)
│  ├─ seeders/             starting data: database.seeder.ts and one per table
│  └─ factories/           fake records for tests and seeders
├─ resources/
│  └─ ui/                  the React app: main.tsx, theme.css, posts.ui.ts, pages
├─ routes/
│  ├─ web.ts               routes for the browser
│  ├─ api.ts               routes for the JSON API
│  └─ resources.gen.ts     generated: one API resource per model (don't edit)
├─ storage/                files your app writes: logs, uploads, the SQLite database
├─ tests/
│  └─ feature/             tests that call your app over HTTP
├─ .github/workflows/      ci.yml: runs your tests on every push
├─ .vscode/                editor settings and recommended extensions
├─ .strutvane/             written by Strutvane: types, metadata, setup state
├─ docker/                 compose.yaml for local services (only with Docker; git-ignored)
├─ .env                    your local settings and secrets (never committed)
├─ .env.example            every setting, without secrets (committed)
├─ .gitignore
├─ .npmrc                  ignore-scripts=true: package install scripts don't run
├─ AGENTS.md               instructions for AI coding assistants (if you said yes)
├─ package.json            scripts: dev, build, start, test, setup
├─ package-lock.json       exact versions of every package
├─ README.md               the three commands a teammate needs
├─ strutvane.json          your installer answers (never secrets)
└─ strut.js                the command line: node strut <command>
```

**What you'll see** when you open it in your editor: these folders. To check what the app has registered, ask it:

```bash
node strut about
```

```text
  Application
    name          My App
    environment   local
    debug         true
    url           http://localhost:3000

  Runtime
    node          v24.21.0
    platform      win32

  Database
    connection    mysql
    driverLoaded  true
    tables        posts, users

  Http
    routes        15
    namedRoutes   14

  Console
    commands      7

  Navigation
    Posts, Users
```

(Your values will differ. `node strut about --json` prints the same as JSON, and never includes secrets: no keys, no passwords, no full database URLs.)

## Files that depend on your installer answers

The installer only writes what your answers need. Some files appear or disappear depending on the choice:

| Answer | Files you get |
|---|---|
| Full app (API + admin UI) | `resources/ui/index.html`, `resources/ui/main.tsx`, `config/ui.ts`, `resources/ui/theme.css` |
| API only | none of the `resources/ui/` files |
| Email and password, or email link | `app/models/user.ts`, `app/policies/user.policy.ts`, `config/auth.ts`, `database/factories/user.factory.ts`, the `users` migration |
| No sign-in | no users files; `config/api.ts` requires an API token for every request |
| Teams: yes | `config/tenancy.ts` |
| Sample data: yes | `database/seeders/sample-data.seeder.ts` |
| Tests: Vitest | `tests/feature/health.test.ts` |
| Tests: Vitest + Playwright | also `tests/browser/home.spec.ts` and a `test:e2e` script |
| AI coding assistants: yes | `AGENTS.md` |
| Git CI: yes | `.github/workflows/ci.yml` |
| Editor setup: yes | `.vscode/settings.json`, `.vscode/extensions.json` |
| Dev container: yes | `.devcontainer/devcontainer.json`, `.devcontainer/compose.yaml` (committed) |
| Deploy: any Node host or Docker image | `deploy/README.md` (a recipe) and the public `/up` health route |
| Deploy: Docker image | also `Dockerfile` and `.dockerignore` (committed) |
| With Docker (for development) | `docker/compose.yaml` (git-ignored) |
| Each extra answer (cache, storage, mail, security, monitoring, roles, AI) | its own `config/*.ts` file, such as `config/cache.ts` or `config/security.ts` |

### File naming

Models are plain: `app/models/post.ts`. **Every other kind of file takes a dot suffix** naming its kind, so you can tell files apart in editor tabs and search:

| Kind | File name |
|---|---|
| Model | `app/models/post.ts` |
| Controller | `app/http/controllers/post.controller.ts` |
| Policy | `app/policies/post.policy.ts` |
| Form request | `app/http/requests/post.request.ts` |
| Seeder | `database/seeders/post.seeder.ts`, `database/seeders/database.seeder.ts` |
| Factory | `database/factories/post.factory.ts` |
| Provider | `app/providers/app.provider.ts` |
| Screen settings | `resources/ui/posts.ui.ts` |

:::caution[Coming in 0.2]
The installer prototype (spike 13) still names some files with dashes (`user-policy.ts`, `database-seeder.ts`, `health-controller.ts`). The dotted names above are the decided ones and will be used from 0.2.
:::

## Folder by folder

### `app/`: your application code

This is where most of your own code goes.

**`app/models/`** has one class per table. A **model** holds *behaviour*, not columns: the columns come from your migrations, with their exact names (`created_at`, `author_id`). The one list you write is `fillable`: the columns people may set through forms and the API.

```ts title="app/models/post.ts"
import { Model } from '@strutvane/framework'
import { User } from './user.ts'

export class Post extends Model('posts', { fillable: ['title', 'body', 'status'] }) {
  author() {
    return this.belongsTo(User, 'author_id')
  }
}
```

See [ORM: Getting Started](../orm/).

**`app/policies/`** decides who may do what. `post.policy.ts` holds the rules for posts. With no rule, the answer is **no** (deny by default). See [Authorization](../authorization/).

**`app/http/controllers/`** is optional. Every table with a model gets a full API after `node strut migrate`. Write a **controller** (a class that handles requests) only when you want different behaviour: `node strut make:controller PostController --model=Post`. See [Controllers](../controllers/).

**`app/http/requests/`** holds **form requests**: the validation rules for what a client may send. See [Requests](../requests/) and [Validation](../validation/).

**`app/http/middleware/`** is code that runs around requests (for example "only admins"). See [Middleware](../middleware/).

**`app/providers/`** registers your own services and sidebar entries. `app.provider.ts` is there from the start. See [Service Providers](../providers/).

### `bootstrap/`: how the app starts

`bootstrap/app.ts` builds your application in one readable chain, like Laravel's `bootstrap/app.php`:

```ts title="bootstrap/app.ts"
import { dirname } from 'node:path'
import { Application, type ConfigOf, type RoutesOf } from '@strutvane/framework'
import { User } from '../app/models/user.ts'
import { config } from '../config/index.ts'
import api from '../routes/api.ts'
import web from '../routes/web.ts'
import { providers } from './providers.ts'

export default Application.configure({ basePath: dirname(import.meta.dirname) })
  .withConfig(config)
  .withProviders(providers)
  .withRouting({ web, api, health: '/up' })
  .withMiddleware((middleware) => {
    // aliases, groups, rate limiters, CSRF exceptions, CORS…
  })
  .withExceptions((exceptions) => {
    // how errors are reported and rendered
  })
  .create()

// Teaches TypeScript your route names, config keys and user type.
declare module '@strutvane/framework' {
  interface RouteRegistry extends RoutesOf<[typeof web, typeof api]> {}
  interface ConfigRegistry extends ConfigOf<typeof config> {}
  interface UserRegistry { user: User }
}
```

`bootstrap/providers.ts` lists the service providers; installing a package adds its line there for you:

```ts title="bootstrap/providers.ts"
import type { ProviderClass } from '@strutvane/framework'
import { AppServiceProvider } from '../app/providers/app.provider.ts'

export const providers: ProviderClass[] = [AppServiceProvider]
```

See [Request Lifecycle](../lifecycle/).

### `config/`: settings

Typed settings files that read `.env`. `config/index.ts` gathers them into one object for `bootstrap/app.ts`. A wrong or missing value stops the app at start-up with a list of everything to fix. See [Configuration](../configuration/).

### `database/`: tables and data

- **`migrations/`** is the **source of truth** for your tables. Columns are written here, and only here. File names start with a UTC time stamp (`2026_11_14_093000_create_posts_table.ts`), so they always run in the same order; the installer's own migrations start with `0001_01_01_` so they run first. See [Migrations](../migrations/).
- **`seeders/`** fills the database with starting data. `database.seeder.ts` runs the others in order. See [Seeding](../seeding/).
- **`factories/`** makes realistic fake records for tests and seeders.

### `resources/ui/`: your screens

The React app lives here:

| File | What it is | Yours? |
|---|---|---|
| `index.html`, `main.tsx` | The page shell and the React entry point | Yes |
| `theme.css` | Your brand colour, font and corner radius, on top of the design | Yes |
| `posts.ui.ts` (one per table) | Which columns, form fields and filters a resource shows | Yes, written once by `migrate` |
| `pages/`, `components/` | Your own screens and components | Yes |

The first time a table appears, `node strut migrate` writes `resources/ui/posts.ui.ts` with `columns: auto()` and `form: auto()`. Change it as you like: Strutvane **never overwrites it**. See [Frontend](../frontend/) and [Customising Screens](../crud-customising/).

### `routes/`

`routes/web.ts` and `routes/api.ts` are yours. Everything in `routes/api.ts` is served under `/api`. `routes/resources.gen.ts` is **written by Strutvane** on every migrate and registers one API resource per model. Don't edit it; to change one resource, write your own controller. See [Routing](../routing/).

### `storage/`

Files your app writes while it runs: `storage/logs/` (log files), uploaded files, and the SQLite database if you chose SQLite. It's git-ignored, because these files belong to one machine. See [Logging](../logging/).

### `tests/`

`tests/feature/` holds tests that call your app the way a browser or API client would. `npm test` runs them. See [Testing](../testing/).

### `.strutvane/`: generated files

`node strut migrate` writes here:

| File | What it is |
|---|---|
| `types/models.d.ts` | TypeScript types for every table: `Post`, `NewPost`, `PostPatch`, `PostJson` |
| `resources.json` | Metadata the API and UI run on: labels, searchable, sortable and filterable fields, relations, slug source, sidebar order |
| `ui.gen.ts` | The UI registry (which screens exist, with typed field names) |
| `ui.lock.json` | The field names seen at the last sync, so new columns can be reported |
| `client.gen.ts` | The typed API client the UI uses |
| `local/setup.json` | The installer's progress on this machine, so `npm run setup` can resume (never a secret) |
| `local/env.json` | Whether this machine runs commands in Docker |

The generated files are **committed**, so a fresh clone type-checks before anyone runs a command, and CI can fail when they're stale. Machine-local state lives in **`.strutvane/local/`**, which is git-ignored. You never edit anything in `.strutvane/`: it's regenerated by `migrate`, `ui:sync` and `sync`.

:::caution[Coming in 0.2]
The installer prototype (spike 13) still git-ignores the whole `.strutvane/` folder and keeps `setup.json` and `env.json` at its top level. The split above is the decided layout for 0.2.
:::

### `strut.js`: the command line

`node strut <command>` is Strutvane's `php artisan`. It's a plain `.js` file, so it works the same in PowerShell, cmd, bash and zsh, with no wrapper scripts. `npx strutvane <command>` does the same. See [Strut Console](../strut-console/) and the [CLI Reference](../cli-reference/).

### `docker/` (only with Docker)

If you chose "with Docker", the installer writes `docker/compose.yaml`. It's for your machine only and is git-ignored; `npm run setup` recreates it for teammates. See [Docker](../docker/).

### `package.json` scripts

| Script | Runs | Use it for |
|---|---|---|
| `npm run dev` | `node strut dev` | Developing: API and UI on one port, hot reload |
| `npm run build` | `node strut build` | Building for production into `build/` |
| `npm start` | `node build/server.js` | Running the production build |
| `npm test` | `node strut test` | Running your tests |
| `npm run setup` | `node strut setup` | Finishing setup after `git clone`, or resuming a failed install |
| `npm run strut -- <command>` | `node strut <command>` | The same as `node strut`, through npm |

### `strutvane.json`

Every installer answer, defaults included, so `node strut install:<name>` later knows what you picked. It never holds a secret.

## What is committed to git?

| Committed | Never committed (in `.gitignore`) |
|---|---|
| `app/`, `bootstrap/`, `config/`, `database/migrations/`, `seeders/`, `factories/`, `resources/`, `routes/`, `tests/` | `.env` and every `.env.*` file except `.env.example` |
| `.env.example`, `package.json`, `package-lock.json`, `.npmrc`, `strut.js`, `strutvane.json` | `node_modules/`, `build/` |
| `Dockerfile`, `.dockerignore`, `.devcontainer/` (only if you chose them) | `docker/` (local services) |
| `.github/`, `.vscode/`, `AGENTS.md`, `README.md` | `storage/`, `database/*.sqlite*` |
| `.strutvane/` (generated types, metadata, UI registry, client) | `.strutvane/local/` (this machine's setup state) |

A teammate's `npm run setup` reads the committed `strutvane.json` to recreate everything else, so the git-ignored files never need to be shared.

Before the first commit, the installer checks with `git check-ignore` that every secret file really is ignored. If one isn't, it makes no commit at all.

## Who writes which file?

| File | Written by | Overwritten later? |
|---|---|---|
| `database/migrations/*.ts` | `make:migration`, then you | Never |
| `app/models/post.ts` | `make:migration` (first time), then you | Never |
| `app/policies/post.policy.ts` | `make:controller` (first time), then you | Never |
| `app/http/controllers/post.controller.ts` | `make:controller`, then you | Never (only with `--force`) |
| `resources/ui/posts.ui.ts` | `migrate` (first time), then you | Never |
| `routes/resources.gen.ts` | `migrate` | Every migrate |
| `.strutvane/**` | `migrate` and the installer | Every migrate |

The rule is simple: **files you own are never overwritten**. Generated files say so in their name (`.gen.ts`) or live in `.strutvane/`.

## Where do I put…?

| New code | Folder | Make command |
|---|---|---|
| A table or column | `database/migrations/` | `node strut make:migration create_tags_table` |
| A model | `app/models/` | written by `make:migration create_…_table` |
| An endpoint | `routes/api.ts` + `app/http/controllers/` | `node strut make:controller TagController --api` |
| Validation for an endpoint | `app/http/requests/` | `node strut make:request StoreTagRequest` *(coming in 0.2)* |
| A permission rule | `app/policies/` | `node strut make:policy TagPolicy` *(coming in 0.2)* |
| Code that runs around requests | `app/http/middleware/` | write the class, then alias it in `bootstrap/app.ts` |
| A shared service | anywhere under `app/` (for example `app/services/`), bound in `app/providers/` | none |
| A console command | anywhere under `app/` (for example `app/console/`), registered in `bootstrap/app.ts` | `node strut make:command` *(coming in 0.2)* |
| A screen tweak | `resources/ui/<table>.ui.ts` | written by `migrate` |
| A custom page | `resources/ui/pages/` | none |
| Starting data | `database/seeders/` | `--seeder` on `make:migration` |

Jobs, mail, events and notifications get their folders when those features arrive (see [Queues](../queues/) and [Mail](../mail/)).

## Laravel folder by folder

| Laravel | Strutvane |
|---|---|
| `app/Http/Controllers/PostController.php` | `app/http/controllers/post.controller.ts` |
| `app/Http/Middleware/` | `app/http/middleware/` |
| `app/Http/Requests/StorePostRequest.php` | `app/http/requests/post.request.ts` |
| `app/Models/Post.php` | `app/models/post.ts` |
| `app/Policies/PostPolicy.php` | `app/policies/post.policy.ts` |
| `app/Providers/AppServiceProvider.php` | `app/providers/app.provider.ts` |
| `bootstrap/app.php`, `bootstrap/providers.php` | `bootstrap/app.ts`, `bootstrap/providers.ts` |
| `config/*.php` | `config/*.ts` |
| `database/migrations/`, `seeders/`, `factories/` | the same |
| `resources/views/` (Blade) | `resources/ui/` (React) |
| `routes/web.php`, `routes/api.php` | `routes/web.ts`, `routes/api.ts` |
| `routes/console.php` | commands registered in `bootstrap/app.ts` |
| `storage/` | `storage/` |
| `vendor/` | `node_modules/` |
| `artisan` | `strut.js` |

## Common mistakes

### I edited `routes/resources.gen.ts` and my change disappeared

**Why:** it's regenerated on every `node strut migrate`.
**Fix:** put your change in `routes/api.ts`, or give the model its own controller:

```bash
node strut make:controller PostController --model=Post
```

### TypeScript says a column doesn't exist, but it's in my migration

```text
error TS2339: Property 'subtitle' does not exist on type 'Post'.
```

**Why:** the types in `.strutvane/types/` are regenerated by `node strut migrate`, and you haven't run it since adding the column.
**Fix:**

```bash
node strut migrate
```

### "There is no 'make:controler' command"

```text
  ✖ There is no "make:controler" command.
  → Did you mean `node strut make:controller`?
```

**Why:** a typo in the command name.
**Fix:** use the suggestion, or run `node strut list` to see every command.

### I put a model in `app/Models/Post.ts`

**Why:** folder and file names are lower-case in Strutvane (`app/models/post.ts`), so imports are the same on every operating system. Windows and macOS ignore case, Linux doesn't, so mixed case works on your laptop and breaks on the server.
**Fix:** rename the folder to `app/models` and the file to `post.ts`.

### A teammate cloned the repo and nothing starts

```text
  ✖ The app can't start: 1 environment variable needs attention.
  - APP_KEY is required (a text value); add it to .env (read in config/app.ts)
  → Fix the values in .env (see .env.example for every key) and start again.
```

**Why:** `.env` is never committed, so a fresh clone has no settings and no secrets.
**Fix:** run the setup, which creates `.env` with new secrets, starts the services and migrates:

```bash
npm install
npm run setup
```

### I committed `.env` by accident

**Why:** usually `.gitignore` was edited, or the file was added with `git add -f`.
**Fix:** remove it from git (the file stays on your disk), then rotate the secrets it held, because they're in your history now:

```bash
git rm --cached .env
node strut key:rotate
```

See [Configuration](../configuration/) for every secret and how to rotate it.

## Next steps

- [Your First CRUD](../first-crud/): see these folders in action.
- [Migrations](../migrations/): the most important folder.
- [Request Lifecycle](../lifecycle/): how a request travels through these files.
- [Frontend](../frontend/): the React app in `resources/ui/`.
