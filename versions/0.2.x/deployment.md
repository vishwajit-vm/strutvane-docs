---
title: "Deployment"
description: "Put your app on a real server: build it, set production settings, migrate safely, run it on any Node host or as a Docker image, check health with /up, shut down gracefully, and go through a production checklist before launch."
---

**Deploying** means taking the app that runs on your laptop and running it on a server where your users can reach it. With Strutvane that's four steps: **build** (check the app boots and build the UI), give the server its **settings** (environment variables), **migrate** the database, and **start** the server with `node strut start`. This page walks through each, for a plain Node host and for a Docker image, and ends with a checklist to go through before launch.

:::tip[Coming from Laravel?]
The flow is Laravel's: `composer install --no-dev` → `npm ci`, `php artisan migrate --force` → `node strut migrate --force`, `php artisan optimize` → `node strut optimize`, `php artisan down` / `up` keep their names, and Laravel 11's `/up` health route is there too.

What's different:
- There's a **build step** (`node strut build`) that checks the app boots and builds the UI with Vite, and the server is one long-running Node process (no PHP-FPM, no Octane needed).
- The installer can write a **secure production `Dockerfile`** for you (question 35, "Where will you deploy?").
- Deploy recipes replace Envoy and Forge-style scripts; any Node host or container platform works.
:::

:::caution[What exists, and when]
- **On framework `main` (0.2.0-next.0, not on npm yet):** `node strut build` (checks the app boots, then runs your Vite build), `node strut start`, `migrate --force` and `--isolated`, graceful shutdown on `SIGTERM` (exit code 143), the `/up` route answering `{"status":"ok"}`, `optimize`, maintenance mode (`down`/`up`) and `security:check`.
- **Proven in the installer prototype (spike 13), not released:** the deploy question, the deploy recipe in `deploy/README.md`, the production `Dockerfile` and `.dockerignore` (their content is tested: non-root, no secrets, no `.env*`).
- **Coming in 0.2:** `node strut docker:prod`, and the `Dockerfile` setting `LOG_CHANNEL=stderr` and `LOG_FORMAT=json` (decided; the prototype's template doesn't set them yet). The prototype's `Dockerfile` and `npm start` still run a `build/server.js` that the framework's `node strut build` doesn't produce; they're being aligned with `node strut start`.
- **Coming in 0.3:** queue workers and the scheduler, which production apps run as extra processes.

The image itself hasn't been built and run end to end yet. Commands and output are "something like this".
:::

## The smallest example

On any server with Node 24.3 or newer, from a fresh copy of your repository:

```bash
npm ci --ignore-scripts          # exact dependencies from package-lock.json, no install scripts
node strut build                 # checks the app boots, then builds the UI with Vite
node strut migrate --force       # applies new migrations (--force: yes, this is production)
node strut start --host 0.0.0.0  # serves the app (the default host is 127.0.0.1)
```

**What you'll see** (something like this; the migration lines depend on your app):

```text
✔ Migrated 2026_11_18_015306_create_posts_table (batch 3)
✔ Listening on http://0.0.0.0:3000 (APP_ENV=production)
```

Check it's alive:

```bash
curl -i http://your-server:3000/up
```

**What you'll see:**

```text
HTTP/1.1 200 OK
content-type: application/json

{"status":"ok"}
```

Your load balancer or host calls `/up` the same way.

The installer writes a recipe like this to `deploy/README.md` when you pick "Any Node host" (its 0.2 version is being aligned with `node strut start`).

## Step 1: build

```bash
node strut build
```

`node strut build` checks that the app boots (models, config, routes), so a broken route or a missing setting fails the build instead of the deploy, and then runs your project's Vite build for the UI (`dist/web`). The server itself runs your TypeScript directly (Node strips the types), so there's no compiled server file: deploy the project folder with its `node_modules`.

Build on the same Node major version you run in production, so native details match.

## Step 2: production settings

Settings come from **environment variables**, set in your host's dashboard (or a systemd unit, or your container platform). `.env.example` lists every key your app reads. **Never upload `.env`**, and never put secrets in the image or the repository.

The keys that must change for production:

| Key | Production value | Why |
|---|---|---|
| `APP_ENV` | `production` | turns off developer pages and hints |
| `APP_DEBUG` | `false` | the app **refuses to start** with `APP_DEBUG=true` in production (the app commands accept `--force-debug`; `node strut start` doesn't yet) |
| `APP_KEY` | a new key, made with `node strut key:generate` (never the development one) | signs and encrypts everything. The same on every server |
| `APP_PREVIOUS_KEYS` | old keys after a rotation | keeps old cookies, tokens and encrypted values working |
| `APP_URL` | `https://app.example.com` | links in mails, cookie security, CSRF origin checks |
| `DB_*` | your production database | — |
| `MAIL_*` | your production mailer | see [Mail](../mail/) |
| `LOG_CHANNEL`, `LOG_FORMAT` | `stderr` and `json` in containers; `daily` on a VPS | let the platform collect logs |

The app checks every setting at start-up and lists **all** problems at once, so a missing key fails the deploy instead of the first request:

```text
error The app refuses to start: APP_DEBUG=true with APP_ENV=production.
  → Set APP_DEBUG=false in the production environment. To start anyway for a short investigation, pass --force-debug (debug pages stay off in production either way).
```

Want to commit production settings safely? `node strut env:encrypt --env=production` encrypts `.env.production` so the encrypted file can live in Git, and `node strut env:decrypt` turns it back on the server with a key you keep in the host's secrets (see [Configuration](../configuration/)).

## Step 3: migrate safely

```bash
node strut migrate --force --isolated
```

- With `APP_ENV=production`, `migrate` refuses to change the database without `--force` (there's no question to answer, so deploy scripts always pass it). `--seed` in production also needs `--force`.
- `--isolated`: when several servers deploy at the same moment, **only one** migrates; the others see the lock is taken, say so, and skip instead of waiting.
- **PostgreSQL and SQLite** run each migration in a transaction: a failure leaves nothing behind.
- **MySQL and MariaDB** commit schema changes as they go. If a migration fails halfway, the next `migrate` resumes it from the failed statement. See [Migrations](../migrations/).

Before a risky change, preview the SQL:

```bash
node strut migrate --pretend
```

The pre-flight check warns about a drop that looks like a rename before anything runs (`looks_like_rename`). See [Migrations](../migrations/).

**Order matters for zero-downtime deploys:** migrate **before** switching traffic to the new code, and make each migration safe for the old code too (add columns first, remove them in a later release).

## Step 4: run it

```bash
node strut start --host 0.0.0.0 --port 3000
```

Keep it running with whatever your host offers: the platform's process manager (Railway, Render, Fly, Cloud Run, Kubernetes), or systemd on a VPS:

```ini title="/etc/systemd/system/my-app.service"
[Unit]
Description=my-app
After=network.target

[Service]
User=myapp
WorkingDirectory=/srv/my-app
EnvironmentFile=/etc/my-app/env
ExecStart=/usr/bin/node strut start --host 0.0.0.0
Restart=always
KillSignal=SIGTERM
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now my-app
```

### Graceful shutdown

When the host stops or replaces your app, it sends `SIGTERM`. The server then stops accepting new requests, lets the requests in flight and their deferred work finish, shuts the app's providers down, and exits with code `143` (so a process manager can tell a requested stop from a crash). Give it time: `TimeoutStopSec=30` above, or your platform's grace period. Don't `kill -9` it unless it's stuck. On Windows, where `SIGTERM` can't be caught, process managers send the IPC message `shutdown` instead.

### Behind a proxy or load balancer

Most hosts put a proxy in front of your app that handles HTTPS. Two settings then matter:

- **Trusted proxies:** tell the app which proxies may set `X-Forwarded-For` and `X-Forwarded-Proto`. Without it, every visitor seems to have the proxy's IP, so rate limits hit everyone at once.
- **Trusted hosts:** the app answers only for your own domain names, and refuses others with `400`.

Both are covered in [Security Features](../security/).

### More than one server

- Use the **same `APP_KEY`** (and `APP_PREVIOUS_KEYS`) everywhere, or sessions and signed links made by one server fail on another.
- Rate limits live in the **cache store**. In 0.2.0-next.0 the stores are `memory` (the default, one per process) and `file` (one per machine), so each server counts on its own and every limit is multiplied by the number of servers. Shared stores (database, Redis) come in 0.3. See [Cache](../cache/).
- Files written to the local disk exist only on that server. Use shared storage or a cloud disk (`@strutvane/files`, planned) when several servers serve uploads.
- Or run several Node processes on one machine: a cluster mode for `node strut start` is coming before 1.0.

## Health checks: `/up`

`/up` answers `200 {"status":"ok"}` to `GET` and `HEAD` as soon as the app is running, and says nothing else (no versions, no settings), so it's safe to leave public. It stays reachable during [maintenance mode](../maintenance-mode/), so your platform doesn't restart a container that's down on purpose. Point your host's health check, your load balancer and the `Dockerfile`'s `HEALTHCHECK` at it. The path is `withRouting({ health: '/up' })` in `bootstrap/app.ts`.

:::caution[Coming in 0.3]
A **readiness** route, `/ready`, that also runs the critical checks (the database and anything packages register, such as `@strutvane/health`), comes in 0.3 with the health-check registry. Until then, `/up` only tells you the process is alive.
:::

## Deploying as a Docker image

Pick **Docker image** when the installer asks "Where will you deploy?", or run `node strut docker:prod` later. You get three committed files:

- `Dockerfile`, which builds in three stages: build, production dependencies only, then a clean runtime image;
- `.dockerignore`, which keeps `.env*`, `.git`, `node_modules`, `storage/`, tests and `.strutvane/local/` out of the image (the rest of `.strutvane/` is generated code the build needs);
- `deploy/README.md`, the recipe.

The generated `Dockerfile` (from the installer prototype, without its prototype-only `stubs/` lines and with some comments shortened):

```dockerfile title="Dockerfile"
# syntax=docker/dockerfile:1
# Secrets are never copied in: .dockerignore excludes every .env* file, and the platform passes
# settings as environment variables when the container starts. Regenerate: node strut docker:prod

# 1. Build: install everything (dev dependencies too) and compile to build/.
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --ignore-scripts
COPY . .
RUN node strut build

# 2. Production dependencies only.
FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev --ignore-scripts

# 3. Run: only build/ and production dependencies, as the image's non-root "node" user.
FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/build ./build
COPY --chown=node:node package.json ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.APP_PORT || 3000) + '/up').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "build/server.js"]
```

Build and run it:

1. Generate a production key **once**, and store it in your host's secret settings (never in the image or in Git):

   ```bash
   node strut key:generate --show
   ```

   (`--show` prints the key instead of writing it to `.env`.)

2. Build the image and run it, passing settings from your environment:

   ```bash
   docker build -t my-app .
   docker run -p 3000:3000 --env APP_KEY --env DB_HOST --env APP_URL my-app
   ```

   `--env APP_KEY` with no value copies `APP_KEY` from your shell's environment (set it from your secrets manager first), so the key never appears in your shell history or in this command.

**What you'll see:** Docker builds the three stages, then `docker ps` shows the container as `healthy` once `/up` answers.

Why it's built this way:

| Choice | Protects against |
|---|---|
| non-root `node` user | a bug in the app becoming root inside the container |
| only `build/` and production dependencies | a bigger attack surface and image (no sources, tests, dev tools) |
| `.env*` excluded, settings at runtime | secrets baked into image layers, readable by anyone who pulls the image |
| `npm ci --ignore-scripts` | dependency install scripts running during the build |
| `HEALTHCHECK` on `/up` | a hung container staying in rotation |

Logs: in a container, write logs to the process output as JSON lines, and let the platform collect them:

```ini
LOG_CHANNEL=stderr
LOG_FORMAT=json
```

The generated `Dockerfile` sets these two (decided for 0.2; the prototype's template doesn't yet, so set them in the environment for now). See [Logging](../logging/).

**Run migrations as a separate step,** not when each container starts: a one-off job (`docker run my-app node strut migrate --force --isolated`), a Kubernetes Job, or your platform's release command. Note that the runtime image has only production dependencies; `node strut migrate` must work from them, which the framework's packaging (it ships compiled JavaScript) is designed for.

**Persistent files:** the container's own disk is thrown away on every deploy. Mount a volume at `storage/` or use a cloud disk.

## Every deploy, in order

1. Build (or pull the new image).
2. Optional: `node strut down --secret=<a long random string>` for maintenance mode on risky deploys. See [Maintenance Mode](../maintenance-mode/).
3. `node strut migrate --force --isolated`.
4. `node strut optimize` to cache config, routes and events for faster start-up. See [Optimization](../optimization/).
5. Start the new version; let the old one shut down gracefully.
6. From 0.3: `node strut queue:restart`, so workers pick up the new code after their current job.
7. `node strut up` if you used maintenance mode.
8. Watch `/up`, the logs and your error rate for a few minutes.

**Rolling back:** deploy the previous build or image. Only roll a migration back (`node strut migrate:rollback`) if it can't work with the old code, and only after checking what it drops.

## Background work (coming in 0.3)

Production apps that use [queues](../queues/) or the [scheduler](../scheduling/) run extra processes next to the web server:

- one or more **queue workers**, restarted on deploy (`queue:restart`);
- the **scheduler**: one cron entry calling `node strut schedule:run` every minute, or a `node strut schedule:work` process.

Each extra process writes its own log file, so files never get mixed up.

## Production checklist

Go through this before launch, and again before big releases. It follows Strutvane's production readiness protocol, applied to your app.

**Settings and secrets**

- [ ] `APP_ENV=production`, `APP_DEBUG=false`.
- [ ] A fresh `APP_KEY` (not the development one), the same on every server, stored in a password manager.
- [ ] `APP_URL` is `https://…` (over HTTPS the session cookie becomes `__Host-strutvane_session`, which a sibling subdomain can't set).
- [ ] No secrets in Git, in `.env.example` or in the image; `.env*` is in `.dockerignore`.
- [ ] `node strut security:check` passes (it flags debug on, a missing key, a non-HTTPS `APP_URL`, insecure cookies, CORS `*` with credentials, a weak CSP, `npm audit` highs and exposed `/_strutvane/*` tools).

**Data**

- [ ] Migrations applied with `--isolated`; `migrate --pretend` reviewed for risky changes.
- [ ] Database backups run and a restore has been **tested**.
- [ ] With teams on PostgreSQL: row-level security is on (`tenancyAudit` reports nothing).
- [ ] Uploaded files live on a persistent volume or cloud disk.

**Traffic**

- [ ] HTTPS everywhere; trusted proxies and trusted hosts configured.
- [ ] Health checks point at `/up`.
- [ ] Rate limits use the shared cache store, not memory.

**Operations**

- [ ] Logs reach your platform (`stderr` + `json` in containers, `daily` with retention on a VPS), and nothing secret is in them.
- [ ] A rollback plan: the previous build or image is kept.
- [ ] Graceful shutdown has time to finish (30 seconds or more).
- [ ] `npm audit --omit=dev` shows no high or critical issues.
- [ ] Mail: SPF, DKIM and DMARC set for your sending domain.

## Platform notes

- **Building on Windows, deploying to Linux:** fine; `build/` is plain JavaScript. Use `npm ci` on the server so platform-specific packages match Linux.
- **macOS or Windows with Docker Desktop:** `docker build` works the same; images target Linux.
- **Node version:** Node 24.3 or newer (earlier 24.x releases break arguments in PowerShell); the image pins Node 24.

## Common mistakes

### The app won't start in production: "APP_DEBUG=true with APP_ENV=production"

```text
✖ The app refuses to start: APP_DEBUG=true with APP_ENV=production.
```

**Why:** the debug setting from development reached production. The app refuses to start rather than risk showing debug details.
**Fix:** set `APP_DEBUG=false` in the production environment.

### Everyone was signed out after the deploy

**Why:** the new servers got a different `APP_KEY`.
**Fix:** use the same `APP_KEY` everywhere. When you do rotate it, move the old one to `APP_PREVIOUS_KEYS` (`node strut key:rotate`).

### The container is "unhealthy" and keeps restarting

**Why:** `/up` doesn't answer: the app failed to start (look at the container's logs for the start-up error), or it listens on another port than the health check calls.
**Fix:** read `docker logs <container>`, and make `APP_PORT` match the port you expose.

### Uploaded files disappear after every deploy

**Why:** they were written inside the container.
**Fix:** mount a volume at `storage/`, or use a cloud disk.

### Every visitor is rate-limited at once

**Why:** the app sees the proxy's IP for everyone, because trusted proxies aren't configured.
**Fix:** configure trusted proxies (see [Security Features](../security/)).

### Links in mails point at localhost

**Why:** `APP_URL` still has its development value.
**Fix:** set `APP_URL=https://app.example.com` in production.

## Next steps

- [Docker](../docker/): local Docker mode and the production image.
- [Configuration](../configuration/): every `.env` key.
- [Security Features](../security/): proxies, hosts, headers and `security:check`.
- [Logging](../logging/): logs in production and containers.
