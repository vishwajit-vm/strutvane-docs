---
title: Introduction
description: What Strutvane is and who it's for, then the whole first hour in order (create an app, start it, make a table, migrate, and use the screens and API you get). With links to every other page.
---

Strutvane is a **framework** for building business web apps in TypeScript. A framework is a ready-made structure for an app: it decides where files go, gives you tools for the common jobs (database, sign-in, forms, permissions), and lets you spend your time on what makes your app different.

It's made for apps with sign-in, users and permissions, many tables, and screens to list, search, create and edit records: CRMs, back offices, customer portals, internal tools, B2B products.

This page takes you from nothing to a working feature in about ten minutes, then shows you where everything else is explained.

:::tip[Coming from Laravel?]
Strutvane copies Laravel's flow on purpose: the same folders (`app/models`, `database/migrations`, `routes/`), the same commands (`node strut migrate` is `php artisan migrate`) and the same habits (`bootstrap/app.ts` is `bootstrap/app.php`).

The differences: everything is **TypeScript** running on **Node.js**, you only ever need **npm** (no Composer), and the admin screens you'd add with Filament or Nova are **generated for you** every time you migrate.
:::

:::caution[Coming in 0.2]
Strutvane 0.2 is being built right now. Every step on this page is **proven in a prototype** (the installer in spike 13, the application core in spike 12, the generated screens in spike 14), but nothing is published to npm yet, so `npm create strutvane@latest` doesn't work today. Pages mark anything that isn't built yet with a box like this one.
:::

## What you need

| You need | Why | Check it with |
|---|---|---|
| **Node.js 24.3 or newer** | Strutvane runs on Node, and npm comes with it. Earlier 24.x releases break command-line arguments in PowerShell. | `node --version` |
| **Docker Desktop** *(recommended, optional)* | New apps use MySQL. With Docker, MySQL and a test mail inbox run in containers, so you install nothing else. | `docker --version` |
| **Git** *(optional)* | Your project starts with a first commit. | `git --version` |

**What you'll see** (your numbers may be higher):

```text
v24.3.0
Docker version 29.8.2, build 1a2b3c4
git version 2.51.0
```

No Docker? That's fine: the installer offers **SQLite**, a database that lives in one file and needs nothing installed. See [Installation](../installation/) for every detail.

## Step 1: Create your app

Open a terminal (PowerShell or Windows Terminal on Windows, Terminal on macOS and Linux) in the folder where you keep your projects, and run:

```bash
npm create strutvane@latest my-app
```

`my-app` is the folder the installer creates. The first time, npm asks `Ok to proceed? (y)`: type `y` and press Enter.

| Operating system | Anything different? |
|---|---|
| macOS, Linux | No. |
| Windows (PowerShell) | If PowerShell says "running scripts is disabled on this system", type `npm.cmd` instead of `npm`, or allow scripts for your user once: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`. |

### Recommended or Custom

The **installer** (the small program `npm create` downloads and runs) first asks how much you want to decide (something like this):

```text
? How do you want to set up my-app?
❯ Recommended   a few quick questions, sensible defaults for the rest
  Custom        Choose everything (about 35 questions, grouped)
```

Press **Enter** for **Recommended**. You're asked these questions; press Enter on each to take the default:

| Question | Default | What it means |
|---|---|---|
| What are you building? | **Full app (API + admin UI)** | An API plus a React app with generated screens. "API only" skips the screens. |
| Which design should your app use? | **Crisp** | The look of the screens. You can switch to Vivid later with one command ([Designs](../designs/)). |
| How do people sign in? | **Email and password** | Or an email link only, or no sign-in (then the API needs a token). |
| Teams / multi-tenancy? | **No** | Yes means each customer company sees only its own data ([Tenancy](../tenancy/)). |
| Which database? | **MySQL** | Or PostgreSQL (picked for you with teams) or SQLite. |
| With Docker or without? | **With Docker** | Docker runs the database and a mail inbox for you, like Laravel Sail. |
| AI coding assistants? | **Yes** | Adds an `AGENTS.md` and helpers so AI tools understand your project. |

A question that brings a package is shown only once that package is published and works with your framework version. The AI assistants question brings `@strutvane/agent-tools`, coming in 0.3, so in 0.2 Recommended mode asks the first six.

**Custom** asks about 35 questions in groups (sign-in security, roles, cache, storage, mail, tests, CI, deployment, and more). Every question also has a flag, so a whole setup can be one line: `npm create strutvane@latest my-app -- --db sqlite --yes`. [Installation](../installation/) lists every question and flag.

Then you see a **review screen** with every answer, the defaults included, and three choices: **Create it**, **Change an answer**, or **Cancel**. Choose **Create it**.

### What the installer does next

You watch it work, step by step:

1. writes the project files;
2. generates secrets (such as `APP_KEY`, the key that signs and encrypts your app's data) into `.env`, never into `.env.example`;
3. checks the ports it needs and picks free ones;
4. starts the database (with Docker);
5. installs the packages with npm;
6. creates your tables and the first admin user;
7. makes a first git commit.

**What you'll see** at the end (something like this; the password line appears only in a real terminal):

```text
✔ Files written (33 files in C:\Users\you\projects\my-app)  41ms
✔ Secrets generated in .env (APP_KEY, DB_PASSWORD, DB_ROOT_PASSWORD)  1ms
✔ Ports checked (3000 free; 3306 free; 8025 free)  15ms
✔ Containers running and healthy (app, db, mailpit)  15.3s
✔ Dependencies installed with npm (added 13 packages)  4.8s
✔ Migrations run (3 new, 3 total); Admin created: admin@my-app.test; Database seeded  850ms
✔ Git repository created (main, 1 commit)  1.9s

── Ready ───────────────────────────────────────────────────────
   App          http://localhost:3000
   Database     MySQL in Docker, 127.0.0.1:3306/my_app
   Design       crisp (@strutvane/design-crisp)
   Mail inbox   http://localhost:8025
   Admin        admin@my-app.test
   Password     q7Vd-3kPz-Xm2c-8RtL   (shown once; change it at first sign-in)

   Every day:   cd my-app; npm run dev
   Commands:    node strut help
   Teammates:   npm run setup   (after git clone)
```

**Copy the password now.** It's shown once and never written to any file. Lost it? `node strut user:password admin@my-app.test` sets a new one.

If a step fails (Docker isn't running, a port is taken, the network drops), the installer tells you what happened and offers to retry, fall back to SQLite, or stop. Your project is kept, and `npm run setup` continues from the step that failed.

## Step 2: Go into the folder

```bash
cd my-app
```

Every `node strut` and `npm run` command works only from inside this folder, because that's where `strut.js` and `package.json` live.

## Step 3: Start the app

```bash
npm run dev
```

**What you'll see:**

```text
  My App  development
  App + API   http://localhost:3000
  Press Ctrl+C to stop
```

`npm run dev` starts your **API** (the part that answers `/api/...` with JSON) and your **UI** (the React app in the browser) together, on **one port**, with hot reload: save a file and the browser updates.

Open [http://localhost:3000](http://localhost:3000) and sign in with `admin@my-app.test` and the password from the Ready box. You're asked to choose a new password, then you land on the **dashboard**: a sidebar on the left (Dashboard and Users, for now) and a welcome checklist.

Leave this terminal running. Open a **second terminal** in the same folder for the next steps.

### With Docker or without

| | With Docker | Without Docker |
|---|---|---|
| Where the app runs | Inside the `app` container | On your computer |
| `npm run dev` | Forwarded into the container for you | Runs directly |
| `node strut <command>` | Forwarded into the container for you | Runs directly |
| Database | MySQL 8.4 (or PostgreSQL) in a container | SQLite file, or your own server |
| Mail inbox | Mailpit at [http://localhost:8025](http://localhost:8025) | Emails are written to the log |
| Stop everything | `Ctrl+C`, then `node strut services:down` | `Ctrl+C` |

You type exactly the same commands either way. See [Docker](../docker/).

## Step 4: Make a table

Your app needs a place to store blog posts. In the second terminal, ask for a new **migration**: a small file that describes one change to your database.

```bash
node strut make:migration create_posts_table --seeder
```

**What you'll see** (something like this):

```text
  Created database/migrations/2026_11_14_093000_create_posts_table.ts
  Created app/models/post.ts
  Created database/seeders/post.seeder.ts
  Created database/factories/post.factory.ts

  Next: add your columns to the migration, then run `node strut migrate`.
```

Because the name starts with `create_` and ends with `_table`, Strutvane knows you want a new `posts` table, so it also writes the **model** (`app/models/post.ts`, the class you use in code to read and save posts). `--seeder` adds a **seeder** (fills the table with starting data) and the **factory** it uses (makes fake posts for tests and demos). `--factory` on its own adds only the factory.

:::caution[Coming in 0.2]
In the prototype (spike 12), `--seeder` writes only the seeder, `--factory` must be passed separately, and you register the seeder in `database/seeders/database.seeder.ts` yourself. Typing `--seeder --factory` today gives you both files.
:::

## Step 5: Describe your columns

Open the new migration file and list the columns a post has:

```ts title="database/migrations/2026_11_14_093000_create_posts_table.ts"
import { migration } from '@strutvane/framework/schema'

export default migration({
  up(schema) {
    schema.create('posts', (t) => {
      t.id()
      t.string('title', 200)
      t.slug('slug').from('title')
      t.text('body').nullable()
      t.enum('status', ['draft', 'published']).default('draft')
      t.foreignId('author_id').constrained('users')
      t.timestamps()
    })
  },
  down(schema) {
    schema.drop('posts')
  },
})
```

Read it line by line:

| Line | Means |
|---|---|
| `t.id()` | A whole-number `id` that counts up by itself |
| `t.string('title', 200)` | Text up to 200 characters |
| `t.slug('slug').from('title')` | A readable address made from the title: "Hello World" → `hello-world` |
| `t.text('body').nullable()` | Long text that may be empty |
| `t.enum('status', [...]).default('draft')` | One of a fixed list of values, `draft` unless you say otherwise |
| `t.foreignId('author_id').constrained('users')` | Points at a row in `users`; the database refuses a user that doesn't exist |
| `t.timestamps()` | `created_at` and `updated_at`, filled in for you |

`up` makes the change; `down` undoes it (for `migrate:rollback`).

**Columns live only in migrations.** You never type them on the command line or repeat them in the model, so the types, the database and the screens can't drift apart. See [Migrations](../migrations/) for every column type.

## Step 6: Migrate

```bash
node strut migrate
```

**What you'll see** (something like this; the exact wording isn't final):

```text
  ✔ 2026_11_14_093000_create_posts_table   14ms
  ✔ Types and metadata regenerated (3 tables)
  ✔ Seeded post.seeder.ts
  ✔ API: /api/posts  ·  UI: Posts (sidebar)
```

That one command did five things, in order:

1. **created the `posts` table** in your database;
2. **regenerated your TypeScript types**, so `Post` has `title`, `slug`, `body`, `status`, `author_id`, `created_at` and `updated_at`;
3. **ran the new seeder** once (seeders are remembered, so they never run twice by accident);
4. **generated a CRUD API** for posts (CRUD means create, read, update, delete);
5. **generated the screens** and a sidebar entry.

:::caution[Coming in 0.2]
Each part is proven separately: the migration and types in spike 10, the API in spikes 10 and 12, the screens and sidebar in spike 14. Running all five from one `node strut migrate` is designed, not built as one command yet.
:::

## Step 7: Look at what you built

Go back to the browser. **Without refreshing your code or writing anything else**, Posts is in the sidebar:

- **A list** with search, sorting by any column, filters (status, author, dates), and numbered pages (25 per page; 10, 50 or 100 if you prefer).
- **A "New post" form** with the right field for each column: a text box for the title, a slug that fills itself in from the title, a dropdown for status, a searchable picker for the author.
- **A detail page** at a readable address: `/posts/hello-world`.
- **An edit form**, and **delete** with a confirmation (and Undo).

Try it: create a post called "Hello World", then open it. The address bar shows `/posts/hello-world`.

The same data is available as a **JSON API** for other apps and scripts. It's protected: try it without signing in.

```bash
curl http://localhost:3000/api/posts
```

**What you'll see:**

```json
{
  "type": "https://strutvane.dev/problems/unauthenticated",
  "title": "Unauthenticated",
  "status": 401,
  "code": "unauthenticated",
  "detail": "Sign in first: send an \"Authorization: Bearer <token>\" header."
}
```

That's **deny by default**: nobody can read or change posts until you say who may. Sign in, or create an API token ([API Tokens](../api-tokens/)), and the same request returns your posts:

```json
{
  "data": [
    { "id": 1, "title": "Hello World", "slug": "hello-world", "body": null, "status": "draft", "author_id": 1, "created_at": "2026-11-14T09:31:02.000Z", "updated_at": "2026-11-14T09:31:02.000Z" }
  ],
  "meta": { "page": 1, "perPage": 25, "total": 1, "lastPage": 1, "from": 1, "to": 1 }
}
```

On Windows PowerShell, `curl` may be an alias for a different command. Use `curl.exe` instead, exactly as above.

## Step 8: Make it yours

Everything generated is ordinary code in your project, and Strutvane never overwrites a file you've changed:

| You want to… | Edit | Read |
|---|---|---|
| Choose which columns the list shows | `resources/ui/posts.ui.ts` | [Customising Screens](../crud-customising/) |
| Change who may see or edit posts | `app/policies/post.policy.ts` | [Authorization](../authorization/) |
| Add a scope like `published()` | `app/models/post.ts` | [ORM: Scopes](../orm-scopes/) |
| Write your own endpoint | `routes/api.ts` + a controller | [Routing](../routing/), [Controllers](../controllers/) |
| Add a column later | a new migration, then `node strut migrate` | [Your First CRUD](../first-crud/) |

When you add a column later, the generated screens pick it up by themselves, and anything you customised stays exactly as you left it.

## What Strutvane does for you

### It writes the boring parts

Most business apps spend their first weeks on the same plumbing: tables, an API per table, checking input, sign-in, "who may see what", and admin screens. In Strutvane:

- your **migrations** are the single source of truth;
- `node strut migrate` turns them into **TypeScript types**, a **CRUD API** and **UI pages**;
- you write only the parts that make your app different.

### You own every line

Nothing is hidden. Models are ordinary classes in `app/models`, routes are in `routes/`, and the screen settings you might change are files in `resources/ui/`. Strutvane **never overwrites a file you own**.

### It's safe by default

- **Deny by default:** nobody can see or change a record until a **policy** (a small class with the rules for one model) allows it. New policies allow only admins.
- **No SQL injection by construction:** every value goes to the database as a bound parameter, never pasted into SQL text.
- **Secrets stay secret:** they're generated into `.env`, never into `.env.example`, and hidden columns like `password` are never sent to the browser.
- **Protections on by default:** CSRF checks, rate limits, security headers and more, each one visible in `node strut route:list --security` ([Security Features](../security/)).
- **Teams:** with teams switched on, each customer company sees only its own data.

### It's typed from end to end

Your columns live in migrations, and Strutvane generates the TypeScript types from them. Rename or drop a column and every line of code that still uses the old name becomes a compile error, so you find it in your editor instead of in production:

```text
error TS2339: Property 'body' does not exist on type 'Post'.
```

Route names (`route('posts.show', { post })`) and settings (`config('app.debug')`) are typed the same way.

## Strutvane and Laravel, side by side

| You want to… | Laravel | Strutvane |
|---|---|---|
| Create a project | `laravel new my-app` | `npm create strutvane@latest my-app` |
| Run the app | `composer run dev` | `npm run dev` |
| Run a command | `php artisan migrate` | `node strut migrate` |
| Make a table | `php artisan make:migration create_posts_table` | `node strut make:migration create_posts_table` |
| Describe a column | `$table->string('title')` | `t.string('title')` |
| Write a model | `class Post extends Model {}` | `class Post extends Model('posts', { fillable: [...] }) {}` |
| Define routes | `Route::get('/', ...)` in `routes/web.php` | `Route.get('/', ...)` in `routes/web.ts` |
| Configure the app | `bootstrap/app.php` | `bootstrap/app.ts` |
| Admin screens | Filament or Nova (add-ons) | Built in, generated on `migrate` |
| Docker for development | Sail | "With Docker" in the installer |
| Package manager | Composer + npm | npm only |

## Find your way around these docs

The menu on the left follows Laravel's order, so you always know where to look:

| Section | What's in it | Start with |
|---|---|---|
| **Prologue** | What's new, the support table, upgrading | [Release Notes](../releases/), [Upgrade Guide](../upgrade/) |
| **Getting Started** | Installing, configuring, the folder layout, the first feature, the UI, deploying | [Installation](../installation/), [Directory Structure](../structure/), [Your First CRUD](../first-crud/), [Frontend](../frontend/), [Starter Kits](../starter-kits/), [Deployment](../deployment/) |
| **Architecture Concepts** | How a request flows through the app, and how services are wired | [Request Lifecycle](../lifecycle/), [Service Container](../container/), [Service Providers](../providers/), [Helpers](../helpers/), [Facades](../facades/) |
| **The Basics** | Writing your own endpoints | [Routing](../routing/), [Middleware](../middleware/), [CSRF](../csrf/), [Controllers](../controllers/), [Requests](../requests/), [Validation](../validation/), [Responses](../responses/), [Error Handling](../errors/), [Logging](../logging/) |
| **Digging Deeper** | Commands, background work and the other everyday tools | [Strut Console](../strut-console/), [Prompts](../prompts/), [Rate Limiting](../rate-limiting/), [HTTP Client](../http-client/), [Maintenance Mode](../maintenance-mode/), [Optimization](../optimization/) |
| **Security** | Sign-in, permissions, teams | [Security Features](../security/), [Authentication](../authentication/), [Authorization](../authorization/), [Tenancy](../tenancy/) |
| **Database** and **ORM** | Tables, queries, models and relationships | [Migrations](../migrations/), [Seeding](../seeding/), [ORM](../orm/), [Relationships](../orm-relationships/) |
| **Auto CRUD & UI** | The generated API and screens, and how to change them | [Resources](../crud/), [Sidebar](../crud-sidebar/), [Customising](../crud-customising/), [Slugs](../crud-slugs/), [Search](../crud-search/), [Precognition](../precognition/) |
| **Testing** | Feature, database and browser tests | [Testing](../testing/) |
| **Packages** | Every first-party package | [Package Catalogue](../packages/catalogue/) |
| **CLI Reference** | Every `node strut` command | [CLI Reference](../cli-reference/) |

## Who is it for?

- **Small teams building internal tools and B2B products** with many tables and roles.
- **Laravel developers moving to TypeScript** who want the same productivity.
- **TypeScript developers** who are tired of gluing ten libraries together before the first feature.
- **Beginners:** these docs explain every new word, and every example can be copied as it is.

## What Strutvane is not

- It isn't a website builder or a CMS: you write code.
- It doesn't render pages on the server with templates (Laravel's Blade). The UI is a React app in the same project ([Frontend](../frontend/)).
- It isn't a hosting product. You deploy it to any Node host or as a Docker image ([Deployment](../deployment/)).

## Common mistakes

### "npm create strutvane" says the package doesn't exist

```text
npm error 404 Not Found - GET https://registry.npmjs.org/create-strutvane - Not found
```

**Why:** 0.2 hasn't been published to npm yet (see the banner at the top of this page).
**Fix:** read along for now; this command works once 0.2 is released.

### "node strut" says it can't find the module

```text
Error: Cannot find module 'C:\Users\you\strut'
```

**Why:** `strut.js` lives in your project's root folder, so `node strut` only works from inside it.
**Fix:**

```bash
cd my-app
node strut list
```

### "There is no … command"

```text
  ✖ There is no "migarte" command.
  → Did you mean `node strut migrate`?
```

**Why:** a typo. Strutvane suggests the closest command.
**Fix:** run the suggestion, or `node strut list` to see every command.

### I typed `sv migrate` from an old tutorial

**Why:** `sv` was the 0.1 command. In 0.2 the command line is `node strut` (or `npx strutvane`). `sv` also clashes with a built-in PowerShell alias.
**Fix:** `node strut migrate`. The [Upgrade Guide](../upgrade/) lists every rename.

### The installer says Docker isn't running

```text
? Docker is installed but not running. What now?
❯ Retry (start Docker Desktop first)
  Continue without Docker (SQLite)
  Skip this step
  Stop
```

**Why:** Docker Desktop is installed but closed.
**Fix:** start Docker Desktop, wait until it says it's running, and choose **Retry**. Or choose **Continue without Docker** to use SQLite now; you can move to MySQL later.

### `npm run dev` says the port is in use

**Why:** another program (often another app you left running) uses port 3000.
**Fix:** stop the other program, or set a different port in `.env` (`APP_PORT=3001`) and start again. The installer already picks free ports when it creates the project.

### Posts doesn't appear in the sidebar after `migrate`

**Why:** usually one of three things: the migration file has an error (read the `migrate` output), you're not signed in as a user whose policy allows `viewAny` on posts, or the browser shows an old page.
**Fix:** check the `migrate` output, sign in as the admin, and refresh the page.

## Next steps

1. [Installation](../installation/): every question, flag and recovery option.
2. [Your First CRUD](../first-crud/): the same posts feature, with every step explained in more depth.
3. [Directory Structure](../structure/): where everything lives.
4. [Routing](../routing/): your first hand-written endpoint.
