---
title: Optimization
description: Make your app start and answer faster in production with `node strut optimize` and the cache commands (config, routes, events, the application cache, the UI build, generated files, queues, the scheduler, logs and storage). What each one builds or clears, when to run it, and what to do when something looks stale.
---

In development, Strutvane reads everything fresh on every start: your config files, your routes, your event listeners. That's what you want while you change things. In production nothing changes between deploys, so it's faster to **build those once** and reuse them. **Optimizing** means building these production caches; **clearing** means throwing them away so everything is read fresh again.

One command builds them all, one clears them all:

```bash
node strut optimize          # on the server, after each deploy
node strut optimize:clear    # back to "read everything fresh"
```

:::tip[Coming from Laravel?]
The same family as artisan: `optimize` / `optimize:clear`, `config:cache`, `route:cache`, `event:cache`, `cache:clear`, `queue:restart`, `schedule:run`, `storage:link`. Strutvane adds `ui:clear` (Vite's cache and the built UI) and `sync` (the generated files in `.strutvane/`).

There's no Octane: a Node server is already long-running, so your app boots once per process, not once per request.
:::

:::caution[Coming in 0.2]
The `optimize` family is **designed** (blueprint §2.2) and **not built yet**. `cache:*` depends on the cache, `queue:*` on the queue and `schedule:*` on the scheduler, which the roadmap places in phase 2 (0.3). What you see below is the planned behaviour; the exact output isn't final.
:::

## The smallest example

After deploying a new version to your server:

```bash
node strut optimize
```

**What you'll see** (something like this):

```text
  Caching framework bootstrap files.
  config ............................................ 4ms DONE
  routes ............................................ 9ms DONE
  events ............................................ 3ms DONE
```

To undo it (for example while you debug on the server):

```bash
node strut optimize:clear
```

```text
  Clearing cached bootstrap files.
  config ............................................ 1ms DONE
  routes ............................................ 1ms DONE
  events ............................................ 1ms DONE
  cache ............................................. 2ms DONE
```

## Why it's fast without caches too

Strutvane already does a lot of work once, at start-up, instead of on every request:

- **Config** is read, checked and frozen once when the app boots. A typo in `.env` stops the start, not a request.
- **Routes** are compiled once, and every route is checked (middleware names, bindings, policies) before the first request.
- **Controllers and middleware** are built fresh per request, which is cheap and keeps requests from leaking state into each other.

In the application core prototype, booting an app with its config, providers and 15 routes took about **7 ms**. The caches matter more for **start-up time** (many servers, serverless platforms, `node strut` commands) than for each request.

## Every command

| Command | Builds or clears | Run it |
|---|---|---|
| `optimize` / `optimize:clear` | Every production cache below, in one go | after each deploy / when debugging on a server |
| `config:cache` / `config:clear` | The merged config snapshot | part of `optimize` |
| `route:cache` / `route:clear` | The compiled route table | part of `optimize` |
| `event:cache` / `event:clear` / `event:list` | The discovered event listeners | part of `optimize`; `event:list` to see them |
| `cache:clear [--store=redis]` / `cache:forget <key>` | The application cache (what your code stored with the cache) | when cached data is wrong or stale |
| `ui:clear` | Vite's development cache and the built UI files | when the UI shows an old version |
| `sync` | The generated files in `.strutvane/` (types, resources, and the outputs of installed packages such as the UI registry), regenerated from your migrations | when generated files are missing or stale |
| `ui:sync` | Only the UI registry and new `resources/ui/<table>.ui.ts` files (also run by `sync` and `migrate`) | after editing UI settings by hand, or a merge conflict |
| `queue:restart` / `queue:clear` / `queue:retry <id\|all>` / `queue:flush` | Queue workers and jobs | after each deploy (`queue:restart`) |
| `schedule:list` / `schedule:run` / `schedule:work` | The scheduler | `schedule:run` every minute from cron |
| `log:clear` | Local log files | when `storage/logs/` grows too big on your machine |
| `storage:link` / `storage:prune-temp` | The public disk link / stale uploads | once per server / from the scheduler |

### `config:cache`: the config snapshot

```bash
node strut config:cache
```

Builds every `config/*.ts` file from the environment once and saves the result, so the next start reads one snapshot instead of evaluating each file.

**Watch out:** after `config:cache`, changing `.env` does nothing until you run it again (or `config:clear`), because the snapshot already holds the old values. That's also why you never run it on your development machine.

The snapshot holds your configured values, the same ones the running app has in memory. Where it's stored isn't decided yet; it must never be served publicly or committed, like `.env` itself.

### `route:cache`: the route table

```bash
node strut route:cache
```

Saves the compiled route table (names, paths, middleware, bindings), so start-up skips compiling and checking every route. Run `node strut route:list` after it to see exactly what's cached.

### `event:cache`: listeners

```bash
node strut event:cache
node strut event:list
```

Saves which listeners handle which events, so they aren't discovered at every start. `event:list` prints them. See [Events](../events/).

### `cache:clear` and `cache:forget`: the application cache

```bash
node strut cache:clear                # everything in the default cache store
node strut cache:clear --store=redis  # one store
node strut cache:forget dashboard:stats   # one key
```

This clears what **your code** stored in the cache (for example, expensive dashboard numbers). It's different from the bootstrap caches above. See [Cache](../cache/).

### `ui:clear`: the UI build

```bash
node strut ui:clear
```

Deletes Vite's development cache and the built UI files. Run it when the browser keeps showing an old screen after an upgrade, then start `npm run dev` or `npm run build` again. See [Frontend](../frontend/).

### `sync`: the generated files

```bash
node strut sync
```

Regenerates every machine-owned file in `.strutvane/` from your migrations, without touching the database: the types and `resources.json` always, and the outputs of the packages you have installed (the UI registry through `node strut ui:sync` when `@strutvane/ui` is installed, chart data only when `@strutvane/charts` is). `migrate` does this for you; use `sync` after resolving a merge conflict in generated files, or after a fresh clone. Files you own are never overwritten.

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
node strut migrate --force      # --force: it's production
node strut optimize             # build the production caches
node strut queue:restart        # workers pick up the new code
npm start                       # or let your process manager restart the app
```

On a platform that runs several copies of your app, run `migrate` with `--isolated`, so only one copy migrates while the others wait. When a deploy needs downtime, wrap it in [maintenance mode](../maintenance-mode/). See [Deployment](../deployment/).

## Development, production and Docker

| | Development | Production |
|---|---|---|
| Caches | Never: you'd see stale config and routes | `node strut optimize` after each deploy |
| `.env` changes | Picked up on the next start | Need `config:cache` again (or `config:clear`) |
| Where commands run | With Docker, inside the `app` container (forwarded for you) | On the server, or in your image's start step |

In a production **Docker image**, run `node strut optimize` as part of the container's start command (not while building the image), because the config snapshot needs the real environment variables, which only exist when the container runs.

## Faster processes

Beyond the caches, a few things make a production app quicker:

- **The framework ships compiled JavaScript.** Your app's own files can stay TypeScript (Node strips the types), but `@strutvane/framework` is published as JavaScript, because Node won't strip types inside `node_modules`.
- **Fast commands.** In the prototype, a cold `node strut route:list` took 0.75 to 1.0 seconds, mostly loading TypeScript. Loading command modules only when they're used is the planned fix; the target is under 300 ms *(unverified until built)*.
- **Several processes per server.** Node runs your code on one CPU core per process. A cluster mode, `node strut serve --workers=4`, is planned to use every core (Laravel's Octane covers a similar need).
- **JSON logs** in production (`LOG_FORMAT=json`), which log tools read without parsing text. See [Logging](../logging/).

:::caution[Coming after 0.2]
`serve --workers=N` (cluster mode) is planned for phase 3 (1.0). Lazy command loading is a recommendation from the prototype, not built yet.
:::

## Common mistakes

### I changed `.env` on the server and nothing happened

**Why:** you ran `config:cache` (or `optimize`) earlier, so the app reads the snapshot, not `.env`.
**Fix:**

```bash
node strut config:cache      # rebuild the snapshot with the new values
```

### A new route returns 404 after deploying

**Why:** the route table was cached before the deploy, so the new route isn't in it.
**Fix:** run `node strut optimize` (or `route:cache`) as part of every deploy, after the new code is in place.

### I ran `optimize` on my laptop and now my changes don't show

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
