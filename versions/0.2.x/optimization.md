---
title: Optimization
description: Make your app start faster in production with `node strut optimize` and the cache commands (config, routes, events, the application cache, the UI build, generated files, queues, the scheduler, logs and storage). What each one builds or clears, where the caches live, why they're encrypted, when to run them, and what to do when something looks stale.
---

In development, Strutvane reads everything fresh on every start: your config files, your routes, your event listeners. That's what you want while you change things. In production nothing changes between deploys, so it's faster to **build those once** and reuse them. **Optimizing** means building these production caches; **clearing** means throwing them away so everything is read fresh again.

One command builds them all, one clears them all:

```bash
node strut optimize          # on the server, after each deploy
node strut optimize:clear    # back to "read everything fresh"
```

:::tip[Coming from Laravel?]
The same family as artisan: `optimize` / `optimize:clear`, `config:cache`, `route:cache`, `event:cache`, `cache:clear`, `queue:restart`, `schedule:run`, `storage:link`, with the caches in `bootstrap/cache/` as in Laravel. Two differences: the caches are **encrypted** with your `APP_KEY` (Laravel's config cache holds your secrets in plain PHP), and a cache from other code or another key is **ignored with a warning** instead of trusted. Strutvane adds `ui:clear` (Vite's cache and the built UI) and `sync` (the generated files in `.strutvane/`).

There's no Octane: a Node server is already long-running, so your app boots once per process, not once per request.
:::

:::caution[Coming in 0.2]
**Proven in a prototype** (spike 12): `optimize`, `optimize:clear`, `config:cache`/`config:clear`, `route:cache`/`route:clear`, `event:cache`/`event:clear`/`event:list`, `cache:clear` and `cache:forget`. The queue and scheduler commands come with the queue and scheduler in 0.3; `ui:clear`, `log:clear` and `storage:*` are designed.
:::

## The smallest example

After deploying a new version to your server:

```bash
node strut optimize
```

**What you'll see:**

```text
  ✔ Cached: configuration, 15 routes, 2 listeners.
```

To undo it (for example while you debug on the server):

```bash
node strut optimize:clear
```

```text
  ✔ Configuration cache cleared (bootstrap/cache/config.json).
  ✔ Route cache cleared (bootstrap/cache/routes.json).
  ✔ Event cache cleared (bootstrap/cache/events.json).
  ✔ Application cache cleared (3 entries).
```

## Why it's fast without caches too

Strutvane already does a lot of work once, at start-up, instead of on every request:

- **Config** is read, checked and frozen once when the app boots. A typo in `.env` stops the start, not a request.
- **Routes** are compiled once, and every route is checked (middleware names, bindings, policies) before the first request.
- **Controllers and middleware** are built fresh per request, which is cheap and keeps requests from leaking state into each other.

In the prototype, booting an app with its config, providers and 15 routes took about **7 ms**. The caches matter most for **start-up time** (many servers, short-lived containers, `node strut` commands) rather than for each request.

## Where the caches live, and why they're encrypted

| Cache | File | Built by |
|---|---|---|
| Configuration | `bootstrap/cache/config.json` | `config:cache` |
| Route table | `bootstrap/cache/routes.json` | `route:cache` |
| Event listeners | `bootstrap/cache/events.json` | `event:cache` |

`bootstrap/cache/` is git-ignored: caches belong to one deployment. Each file is **encrypted and authenticated** with a subkey of your `APP_KEY`, and stamped with the key it was made with and a **fingerprint of your code**. The config cache holds every secret your config reads (database passwords, API keys), so a copied `bootstrap/cache` is useless without the key.

A cache is **ignored** (and your app reads everything fresh) with a warning in the log when:

| Reason | Warning |
|---|---|
| It was built with a different `APP_KEY` (copied from another server, or the key was rotated) | `Ignoring bootstrap/cache/config.json: it was built with a different APP_KEY. Run \`node strut config:cache\` (or \`node strut optimize\`) again.` |
| It was built from another version of your code (a deploy that forgot `optimize`) | `… it was built from another version of the code. …` |
| It was edited, truncated or damaged | `… it was changed after it was written. …` |
| Your routes changed since it was built | `Ignoring bootstrap/cache/routes.json: the routes changed since it was built. Run \`node strut route:cache\` again.` |

So a stale cache can make the app slower to start, but never wrong.

## Every command

| Command | Builds or clears | Run it |
|---|---|---|
| `optimize` / `optimize:clear` | Config, routes and events in one go / every bootstrap cache plus the application cache | after each deploy / when debugging on a server |
| `config:cache` / `config:clear` | The configuration snapshot | part of `optimize` |
| `route:cache` / `route:clear` | The checked route table (boot can then skip the route checks) | part of `optimize` |
| `event:cache` / `event:clear` / `event:list` | The listeners discovered in `app/listeners` | part of `optimize`; `event:list` to see them |
| `cache:clear [--store=redis]` / `cache:forget <key>` | The application cache (what your code stored) | when cached data is wrong or stale |
| `ui:clear` | Vite's development cache and the built UI files | when the UI shows an old version |
| `sync` | The generated files in `.strutvane/`, from your migrations | when generated files are missing or stale |
| `ui:sync` | Only the UI registry and new `resources/ui/<table>.ui.ts` files (also run by `sync` and `migrate`) | after a merge conflict in UI files |
| `queue:restart` / `queue:clear` / `queue:retry <id\|all>` / `queue:flush` | Queue workers and jobs | after each deploy (`queue:restart`) |
| `schedule:list` / `schedule:run` / `schedule:work` | The scheduler | `schedule:run` every minute from cron |
| `log:clear` | Local log files | when `storage/logs/` grows too big on your machine |
| `storage:link` / `storage:prune-temp` | The public disk link / stale uploads | once per server / from the scheduler |

### `config:cache`: the config snapshot

```bash
node strut config:cache
```

```text
  ✔ Configuration cached (bootstrap/cache/config.json, encrypted with APP_KEY).
```

Builds every `config/*.ts` file from the environment once and saves the result, so the next start reads one snapshot instead of evaluating each file.

**Watch out:** after `config:cache`, changing `.env` does nothing until you run it again (or `config:clear`), because the snapshot holds the old values. That's also why you don't run it on your development machine.

### `route:cache`: the route table

```bash
node strut route:cache
```

```text
  ✔ 15 routes cached (bootstrap/cache/routes.json).
```

Saves the compiled, **already checked** route table, so start-up skips compiling and checking every route. It's only used when your live routes match it exactly; otherwise it's ignored with a warning and the routes are checked as usual.

### `event:cache` and `event:list`: listeners

```bash
node strut event:cache
node strut event:list
```

```text
  ✔ 2 listeners cached (bootstrap/cache/events.json).
```

Listeners are discovered from `*.listener.ts` files in `app/listeners/`, and only imported when their event fires. `event:list` prints a table of each event and its listeners (or `No listeners. Add a *.listener.ts file in app/listeners.`). See [Events](../events/).

### `cache:clear` and `cache:forget`: the application cache

```bash
node strut cache:clear                    # everything in the default store
node strut cache:clear --store=redis      # one store
node strut cache:forget dashboard:stats   # one key
```

```text
  ✔ Application cache cleared: 12 entries removed from the "database" store.
  ✔ Removed "dashboard:stats" from the "database" store.
```

This clears what **your code** stored in the cache (for example, expensive dashboard numbers). It's different from the bootstrap caches above. See [Cache](../cache/).

### `ui:clear`: the UI build

```bash
node strut ui:clear
```

Deletes Vite's development cache and the built UI files. Run it when the browser keeps showing an old screen after an upgrade, then start `npm run dev` or `npm run build` again. See [Frontend](../frontend/).

### `sync` and `ui:sync`: the generated files

```bash
node strut sync
```

Regenerates every machine-owned file in `.strutvane/` from your migrations, without touching the database: the types and `resources.json` always, and the outputs of the packages you have installed (the UI registry through `node strut ui:sync` when `@strutvane/ui` is installed, chart data only when `@strutvane/charts` is). `migrate` does this for you; use `sync` after resolving a merge conflict in generated files. Files you own are never overwritten.

### `queue:restart`: after every deploy

Queue workers are long-running processes, so they keep running your **old** code after a deploy until they restart:

```bash
node strut queue:restart
```

Each worker finishes its current job, then exits, and your process manager starts it again with the new code. See [Queues](../queues/).

### The scheduler

```bash
node strut schedule:list    # what runs when
node strut schedule:work    # development: run the scheduler in the foreground
node strut schedule:run     # production: run from cron every minute
```

See [Task Scheduling](../scheduling/).

### `storage:link`

```bash
node strut storage:link
```

Creates the link that makes the public disk reachable from the web, once per server. `storage:prune-temp` removes uploads that were started but never finished. See [File Storage](../storage/).

## A deploy routine

```bash
npm ci                          # exact versions from package-lock.json
npm run build                   # compiled server and UI in build/
node strut migrate --force      # production asks for confirmation unless --force
node strut optimize             # build the production caches
node strut queue:restart        # workers pick up the new code (0.3)
npm start                       # or let your process manager restart the app
```

On a platform that runs several copies of your app, run `migrate` with `--isolated`, so only one copy migrates while the others wait. When a deploy needs downtime, wrap it in [maintenance mode](../maintenance-mode/). See [Deployment](../deployment/).

## Development, production and Docker

| | Development | Production |
|---|---|---|
| Caches | Don't build them: you'd see stale config and routes | `node strut optimize` after each deploy |
| `.env` changes | Picked up on the next start | Need `config:cache` again (or `config:clear`) |
| Where commands run | With Docker, inside the `app` container (forwarded for you) | On the server, or in your container's start step |

In a production **Docker image**, run `node strut optimize` when the container starts (not while building the image): the config snapshot needs the real environment variables and `APP_KEY`, which only exist when the container runs.

## Faster processes

- **The framework ships compiled JavaScript.** Your app's own files can stay TypeScript (Node strips the types), but `@strutvane/framework` is published as JavaScript, because Node won't strip types inside `node_modules`.
- **Fast commands.** In the prototype, a cold `node strut route:list` took 0.75 to 1.0 seconds, mostly loading TypeScript. Loading command modules only when they run is the planned fix; the target is under 300 ms *(unverified until built)*.
- **Several processes per server.** Node runs your code on one CPU core per process. A cluster mode, `node strut serve --workers=4`, is planned to use every core (Laravel's Octane covers a similar need).
- **JSON logs** in production (`LOG_FORMAT=json`), which log tools read without parsing text. See [Logging](../logging/).

:::caution[Coming in 1.0]
`serve --workers=N` (cluster mode) is planned for phase 3 (1.0). Lazy command loading is a recommendation from the prototype, not built yet.
:::

## Common mistakes

### I changed `.env` on the server and nothing happened

**Why:** you ran `config:cache` (or `optimize`) earlier, so the app reads the snapshot, not `.env`.
**Fix:**

```bash
node strut config:cache      # rebuild the snapshot with the new values
```

### The log says "Ignoring bootstrap/cache/…"

**Why:** the cache was built with another `APP_KEY`, from other code, or was changed by hand. The app ignored it and read everything fresh, so it's working, just slower to start.
**Fix:** run `node strut optimize` again on this server, after the deploy.

### I ran `optimize` on my laptop and now my `.env` changes don't show

**Why:** the caches are meant for production; in development they hide your edits.
**Fix:**

```bash
node strut optimize:clear
```

### Queue jobs still run the old code after a deploy

**Why:** workers are long-running and loaded the old code when they started.
**Fix:** add `node strut queue:restart` to your deploy steps.

### The browser shows an old screen after upgrading

**Why:** stale built files or Vite's cache.
**Fix:** `node strut ui:clear`, then `npm run build` (production) or restart `npm run dev`.

### TypeScript errors about missing types after `git pull`

**Why:** the generated files in `.strutvane/` don't match the migrations you pulled.
**Fix:** `node strut migrate` (if there are new migrations), or `node strut sync` to regenerate without touching the database.

## Next steps

- [Deployment](../deployment/): building and running in production.
- [Maintenance Mode](../maintenance-mode/): pause the app during a risky deploy.
- [CLI Reference](../cli-reference/): every command and option.
- [Configuration](../configuration/): how config and `.env` work.
