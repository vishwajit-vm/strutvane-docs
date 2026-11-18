---
title: Directory Structure
description: A guided tour of a new Strutvane app. Which folder holds what, which files depend on your installer answers, which files you edit, which ones Strutvane writes for you, what is committed to git, and where to put new code.
---

Every Strutvane app has the same folders, so you (and your teammates, and AI coding agents) always know where to look. This page is a tour: what each folder is for, which files are yours, which ones Strutvane writes, and where new code belongs.

:::tip[Coming from Laravel?]
It's Laravel's layout with TypeScript file names: `app/Http/Controllers/PostController.php` becomes `app/http/controllers/post.controller.ts`, `app/Models/Post.php` becomes `app/models/post.ts`, `bootstrap/app.php` becomes `bootstrap/app.ts`, and `artisan` becomes `strut.js` (run with `node strut`).

There are no Blade views: the UI is a React app, and its customisations live in `resources/ui` (`resources/views/` holds only plain HTML pages, such as a custom maintenance page). There's no `vendor/` either: packages live in `node_modules/`, installed by npm.
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
│  ├─ console/commands/    your own node strut commands (node strut make:command)
│  ├─ listeners/           event listeners, found by name: *.listener.ts
│  ├─ models/              one class per table: post.ts, user.ts
│  ├─ observers/           model observers (node strut make:observer)
│  ├─ policies/            who may do what: post.policy.ts, user.policy.ts
│  ├─ providers/           register your own services: app.provider.ts
│  └─ rules/               your own validation rules (node strut make:rule)
├─ bootstrap/
│  ├─ app.ts               builds the application: routing, middleware, errors
│  ├─ providers.ts         the list of service providers
│  └─ cache/               production caches from node strut optimize (git-ignored)
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
│  └─ resources.gen.ts     generated CRUD routes (coming in 0.2; don't edit)
├─ storage/                files your app writes: uploads, framework/cache, framework/sessions, framework/down
├─ tests/
│  └─ feature/             tests that call your app over HTTP
├─ .github/workflows/      ci.yml: runs your tests on every push
├─ .vscode/                editor settings and recommended extensions
├─ .strutvane/             written by Strutvane: types, metadata, schema, SQL
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

**What you'll see** when you open it in your editor: these folders. To check which versions the project runs on, ask it:

```bash
node strut about
```

```text
@strutvane/framework  0.2.0-next.0
Node.js               24.21.0
Platform              win32 x64
Project               my-app (C:\code\my-app)
Package manager       npm

Package               Declared        Installed
@strutvane/framework  ^0.2.0-next.0   0.2.0-next.0
```

(Your values will differ. `node strut about --json` prints the same as JSON.) To see what the app registered, use `node strut route:list` for routes and `node strut event:list` for listeners.

:::caution[What exists, and when]
The folders below are what `create-strutvane` writes; the installer isn't published yet. Everything `@strutvane/framework` 0.2.0-next.0 itself reads or writes (`bootstrap/app.ts`, `config/`, `database/`, `app/policies/`, `app/listeners/`, `bootstrap/cache/`, `storage/framework/`, `.strutvane/`) is marked as such in the sections below.
:::

## Files that depend on your installer answers

The installer only writes what your answers need. Some files appear or disappear depending on the choice:

| Answer | Files you get |
|---|---|
| Full app (API + admin UI) | `resources/ui/index.html`, `resources/ui/main.tsx`, `config/ui.ts`, `resources/ui/theme.css` |
| API only | none of the `resources/ui/` files |
| Email and password, or email link | `app/models/user.ts`, `app/policies/user.policy.ts`, `config/auth.ts`, `database/factories/user.factory.ts`, the `users` migration |
| No sign-in | no users files; `config/api.ts` requires an API token for every request |
| Teams (any answer) | `config/tenancy.ts`: `{ enabled, column: 'tenant_id' }`, with `enabled: true` only if you said yes |
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

The framework's own generators follow it: `node strut make:command`, `make:rule` and `make:observer` write `app/console/commands/<name>.command.ts`, `app/rules/<name>.rule.ts` and `app/observers/<name>.observer.ts`, and a policy is found as `app/policies/<model-name>.policy.ts` (`BlogPost` → `blog-post.policy.ts`).

## Folder by folder

### `app/`: your application code

This is where most of your own code goes.

**`app/models/`** has one class per table. A **model** holds *behaviour*, not columns: the columns come from your migrations, with their exact names (`created_at`, `author_id`). The one list you write is `fillable`: the columns people may set through forms and the API.

```ts title="app/models/post.ts"
import { Model } from '@strutvane/framework/database'
import { User } from './user.ts'

export class Post extends Model('posts', { fillable: ['title', 'body', 'status'] }) {
  author() {
    return this.belongsTo(User, 'author_id')
  }
}
```

See [ORM: Getting Started](../orm/).

**`app/policies/`** decides who may do what. `post.policy.ts` holds the rules for posts, and it's **found by name**: the model `Post` uses `app/policies/post.policy.ts`, with nothing to register. With no rule, the answer is **no** (deny by default). See [Authorization](../authorization/).

**`app/http/controllers/`** holds your **controllers** (classes that handle requests), routed from `routes/web.ts` and `routes/api.ts`. A `make:controller` generator is planned; write the class by hand for now. See [Controllers](../controllers/).

**`app/http/requests/`** holds **form requests**: the validation rules for what a client may send. See [Requests](../requests/) and [Validation](../validation/).

**`app/http/middleware/`** is code that runs around requests (for example "only admins"). See [Middleware](../middleware/).

**`app/providers/`** registers your own services and sidebar entries. `app.provider.ts` is there from the start. See [Service Providers](../providers/).

**`app/listeners/`** holds event listeners: every `*.listener.ts` file is discovered when the app boots (or read from the event cache), with nothing to register. See [Events](../events/).

**`app/console/commands/`**, **`app/rules/`** and **`app/observers/`** hold your own commands, validation rules and model observers; the `make:command`, `make:rule` and `make:observer` generators write them.

### `bootstrap/`: how the app starts

`node strut start`, `node strut dev` and every app command load `bootstrap/app.ts` (or its built `.js`) and boot the application it exports. `bootstrap/cache/` holds the production caches `node strut optimize` writes (git-ignored). See [Optimization](../optimization/).

`bootstrap/app.ts` builds your application in one readable chain, like Laravel's `bootstrap/app.php`:

```ts title="bootstrap/app.ts"
import { dirname } from 'node:path'
import { Application } from '@strutvane/framework'
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

// Teaches TypeScript your config keys and your user type.
type AppConfig = { readonly [File in keyof typeof config]: ReturnType<(typeof config)[File]['build']> }
declare module '@strutvane/framework' {
  interface ConfigRegistry extends AppConfig {}
  interface UserRegistry { user: User }
}
```

:::caution[Known gap in 0.2.0-next.0]
Typed route names (`interface RouteRegistry extends RoutesOf<…>`) need the `RoutesOf` helper type, which 0.2.0-next.0 doesn't export yet (nor `ConfigOf`, hence the `AppConfig` line above). Until it does, `route()` accepts any name and checks it when it runs.
:::

`bootstrap/providers.ts` lists the service providers; installing a package adds its line there for you:

```ts title="bootstrap/providers.ts"
import type { AnyProvider } from '@strutvane/framework'
import { AppServiceProvider } from '../app/providers/app.provider.ts'

export const providers: AnyProvider[] = [AppServiceProvider]
```

See [Request Lifecycle](../lifecycle/).

### `config/`: settings

Typed settings files that read `.env`. `config/index.ts` gathers them into one object for `bootstrap/app.ts`. A wrong or missing value stops the app at start-up with a list of everything to fix. See [Configuration](../configuration/).

### `database/`: tables and data

- **`migrations/`** is the **source of truth** for your tables. Columns are written here, and only here. File names start with a UTC time stamp (`2026_11_14_093000_create_posts_table.ts`), so they always run in the same order; the installer's own migrations start with `0001_01_01_` so they run first. See [Migrations](../migrations/).
- **`seeders/`** fills the database with starting data. Each seeder is a `defineSeeder({ after, run })` file such as `post.seeder.ts`, and `node strut db:seed` runs `database.seeder.ts`, which calls the others. See [Seeding](../seeding/).
- **`database.sqlite`**: the database file, if you chose SQLite (git-ignored; `DB_DATABASE` can point elsewhere).
- **`factories/`** makes realistic fake records for tests and seeders with `defineFactory(Post, ({ faker, sequence }) => ({ title: faker.lorem.sentence() }))`. See [Factories](../orm-factories/).

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

`routes/web.ts` and `routes/api.ts` are yours, handed to `withRouting({ web, api })`. Everything in `routes/api.ts` is served under `/api` (the `apiPrefix` option changes it). See [Routing](../routing/).

:::caution[Coming in 0.2]
`routes/resources.gen.ts`, written on every migrate with one API resource per model, comes with the generated CRUD API; `@strutvane/framework` 0.2.0-next.0 doesn't write it yet.
:::

### `storage/`

Files your app writes while it runs: uploaded files, and `storage/framework/`, where the framework keeps the `file` cache store (`cache/`), the file session store (`sessions/`) and the maintenance-mode state (`down`). Log files in `storage/logs/` come with the logging channels in 0.2. It's git-ignored, because these files belong to one machine. See [Cache](../cache/) and [Maintenance Mode](../maintenance-mode/).

### `tests/`

`tests/feature/` holds tests that call your app the way a browser or API client would. `npm test` runs them. See [Testing](../testing/).

### `.strutvane/`: generated files

`node strut migrate` and `node strut sync` write here, from your migrations:

| File | What it is |
|---|---|
| `types/models.d.ts` | TypeScript types for every table, which the models read their columns from |
| `resources.json` | Metadata the API and UI run on: labels, searchable, sortable and filterable fields, relations, slug source |
| `schema.json` | The schema your migrations add up to |
| `sql/schema.<engine>.sql`, `sql/migrations.<engine>.sql` | The SQL for each engine (`mysql`, `mariadb`, `pgsql`, `sqlite`), for review |

The generated files are **committed**, so a fresh clone type-checks before anyone runs a command, and CI can fail when they're stale. You never edit anything in `.strutvane/`: it's regenerated by `migrate` and `sync`.

:::caution[Coming in 0.2]
Files written by other parts of 0.2 join them: the UI registry (`ui.gen.ts`, `ui.lock.json`) and the typed API client (`client.gen.ts`) from `@strutvane/ui`, and machine-local installer state in the git-ignored `.strutvane/local/`.
:::

### `strut.js`: the command line

`node strut <command>` is Strutvane's `php artisan`. It's a plain `.js` file, so it works the same in PowerShell, cmd, bash and zsh, with no wrapper scripts. `npx strutvane <command>` does the same. See [Strut Console](../strut-console/) and the [CLI Reference](../cli-reference/).

### `docker/` (only with Docker)

If you chose "with Docker", the installer writes `docker/compose.yaml`. It's for your machine only and is git-ignored; `npm run setup` recreates it for teammates. See [Docker](../docker/).

### `package.json` scripts

| Script | Runs | Use it for |
|---|---|---|
| `npm run dev` | `node strut dev` | Developing: API and UI on one port, hot reload |
| `npm run build` | `node strut build` | Checking the app boots and building the UI with Vite |
| `npm start` | `node build/server.js` | Running the production build (see [Installation](../installation/#whats-in-your-new-project) for a known gap; `node strut start` serves the app today) |
| `npm test` | `vitest run` | Running your tests |
| `npm run setup` | `node strut setup` (handled by `strut.js` itself) | Finishing setup after `git clone`, or resuming a failed install |
| `npm run strut -- <command>` | `node strut <command>` | The same as `node strut`, through npm |

### `strutvane.json`

Every installer answer, defaults included, so a later package install knows what you picked. It never holds a secret. *(Written by `create-strutvane`, which isn't published yet.)*

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
| `database/seeders/post.seeder.ts`, `database/factories/post.factory.ts` | `make:migration … --seeder` (first time), then you | Never |
| `app/policies/post.policy.ts` | `make:policy Post`, then you | Never |
| `resources/ui/posts.ui.ts` | `migrate` (first time, with `@strutvane/ui`), then you | Never |
| `.strutvane/**` | `migrate` and `sync` | Every migrate |

The rule is simple: **files you own are never overwritten**. Generated files say so in their name (`.gen.ts`) or live in `.strutvane/`.

## Where do I put…?

| New code | Folder | Make command |
|---|---|---|
| A table or column | `database/migrations/` | `node strut make:migration create_tags_table` |
| A model | `app/models/` | written by `make:migration create_…_table` |
| An endpoint | `routes/api.ts` + `app/http/controllers/` | write the class *(`make:controller` planned)* |
| Validation for an endpoint | `app/http/requests/` | write the class *(`make:request` planned)* |
| A validation rule | `app/rules/` | `node strut make:rule Slug` |
| A permission rule | `app/policies/` | `node strut make:policy Tag` |
| An event listener | `app/listeners/` | write a `*.listener.ts` file |
| A model observer | `app/observers/` | `node strut make:observer PostObserver --model=Post` |
| Code that runs around requests | `app/http/middleware/` | write the class, then alias it in `bootstrap/app.ts` |
| A shared service | anywhere under `app/` (for example `app/services/`), bound in `app/providers/` | none |
| A console command | `app/console/commands/`, registered with `withCommands([...])` in `bootstrap/app.ts` | `node strut make:command SendReports` |
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

### I edited a file in `.strutvane/` and my change disappeared

**Why:** everything in `.strutvane/` is regenerated on every `node strut migrate` and `node strut sync`.
**Fix:** change the migration instead, then regenerate:

```bash
node strut sync
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

### "Unknown command"

```text
error Unknown command "make:migraton".
  - Did you mean `node strut make:migration`?
hint: Run `node strut help` to see every command.
```

**Why:** a typo in the command name.
**Fix:** use the suggestion, or run `node strut list` to see every command.

### I put a model in `app/Models/Post.ts`

**Why:** folder and file names are lower-case in Strutvane (`app/models/post.ts`), so imports are the same on every operating system. Windows and macOS ignore case, Linux doesn't, so mixed case works on your laptop and breaks on the server.
**Fix:** rename the folder to `app/models` and the file to `post.ts`.

### A teammate cloned the repo and nothing starts

```text
error The app can't start: 1 environment variable needs attention.
  - APP_KEY is required (a text value); add it to .env (read in config/app.ts)
  → Fix the values in .env (see .env.example for every key) and start again.
```

**Why:** `.env` is never committed, so a fresh clone has no settings and no secrets.
**Fix:** run the setup, which creates `.env` with new secrets, starts the services and migrates. Without the installer's setup step, copy `.env.example` to `.env`, fill it in, and run `node strut key:generate` and `node strut migrate`:

```bash
npm install
npm run setup
```

### I committed `.env` by accident

**Why:** usually `.gitignore` was edited, or the file was added with `git add -f`.
**Fix:** remove it from git (the file stays on your disk), then rotate the secrets it held, because they're in your history now:

```bash
git rm --cached .env
node strut key:rotate --force --i-understand   # outside local environments
```

See [Configuration](../configuration/) for every secret and how to rotate it.

## Next steps

- [Your First CRUD](../first-crud/): see these folders in action.
- [Migrations](../migrations/): the most important folder.
- [Request Lifecycle](../lifecycle/): how a request travels through these files.
- [Frontend](../frontend/): the React app in `resources/ui/`.
