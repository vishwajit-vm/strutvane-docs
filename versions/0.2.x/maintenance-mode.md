---
title: Maintenance Mode
description: Take your app offline for a moment with `node strut down`, show visitors a friendly "back soon" page, keep using it yourself with a secret link, and bring it back with `node strut up`. Every option, a safe deploy routine, and the mistakes to avoid.
---

**Maintenance mode** puts your app on pause: every visitor gets a friendly "we'll be right back" page with the HTTP status **503 Service Unavailable**, while you run a risky migration, restore a backup or fix something urgent. One command turns it on, one turns it off:

```bash
node strut down
node strut up
```

You'd use it during a deploy that changes the database in a way the running code can't handle, or when something is broken and you'd rather show a clean page than errors.

:::tip[Coming from Laravel?]
It's `php artisan down` and `php artisan up`, with the same options: `--secret`, `--with-secret`, `--retry`, `--refresh`, `--render` and `--redirect`. The `/up` health route keeps answering, as in Laravel 11.

One naming difference: Docker's own start and stop commands are `node strut services:up` and `services:down`, so `up` and `down` keep their Laravel meaning.
:::

:::caution[Coming in 0.2]
Maintenance mode is **designed** (blueprint §2.2, Laravel parity matrix) and **not built yet**. The application core prototype (spike 12) reserves its place in the request pipeline, right after the trusted-host check, but the `down` and `up` commands don't exist yet. The examples on this page show the planned behaviour; the exact wording on screen will be settled when it's built.
:::

## The smallest example

Put the app in maintenance mode:

```bash
node strut down
```

**What you'll see** (something like this):

```text
  Application is now in maintenance mode.
```

Open your app in a browser: instead of your pages, you get the maintenance page, with status 503. An API client gets the same status as a problem+json body. Bring the app back:

```bash
node strut up
```

```text
  Application is now live.
```

## What happens while the app is down

| Request | Answer |
|---|---|
| A page in the browser | The maintenance page, status `503` |
| An API call (`/api/…`, or `Accept: application/json`) | Status `503` with a problem+json body |
| The health route `/up` | Still `200`, so your load balancer doesn't think the server crashed and restart it |
| Someone with the bypass cookie (see `--secret`) | The real app, as usual |
| A request for a host name you don't serve | Still refused by the trusted-host check first |

The check runs **before** routing, middleware and your controllers, so no code of yours runs for a blocked request. That's the point: a half-finished migration can't be hit by a visitor.

## Every option

| Option | What it does | Example |
|---|---|---|
| `--secret=<value>` | Visiting `/<value>` once sets a cookie that lets **you** use the app while it's down | `--secret=let-me-in` |
| `--with-secret` | Like `--secret`, but Strutvane makes up a long random secret and prints it | `--with-secret` |
| `--retry=<seconds>` | Adds a `Retry-After` header, so clients and crawlers know when to come back | `--retry=60` |
| `--refresh=<seconds>` | Tells the browser to reload the maintenance page after that many seconds | `--refresh=15` |
| `--render=<page>` | Shows your own maintenance page instead of the default one | `--render=errors/maintenance` |
| `--redirect=<path>` | Sends every visitor to one path of your own app instead of showing the page | `--redirect=/status` |

### Let yourself in: `--secret` and `--with-secret`

You often want to check that everything works **before** everyone else gets back in:

```bash
node strut down --with-secret
```

**What you'll see** (something like this):

```text
  Application is now in maintenance mode.
  Bypass link: http://localhost:3000/9f3c1b7e2a4d4e0f8c6b5a1d3e7f9a2b
```

Open that link once. It sets a **bypass cookie** in your browser and sends you to the home page; from then on, your browser sees the real app while everyone else sees the maintenance page. Nobody else can guess the link.

Prefer a secret you can type? Choose it yourself:

```bash
node strut down --secret=let-me-in
```

Then visit `http://localhost:3000/let-me-in`. Use a long, hard-to-guess value on a real server, because anyone who knows it can bypass maintenance mode. `--with-secret` is the safer choice.

### Tell clients when to come back: `--retry`

```bash
node strut down --retry=120
```

**What you'll see** on every blocked request:

```text
HTTP/1.1 503 Service Unavailable
retry-after: 120
```

Search engines read `Retry-After` and don't drop your pages from their index during a short outage.

### Reload the page by itself: `--refresh`

```bash
node strut down --refresh=30
```

A visitor who leaves the maintenance page open sees it reload every 30 seconds, so they're back in your app as soon as you run `up`, without pressing anything.

### Your own page: `--render`

Show a page that matches your brand instead of the default:

```bash
node strut down --render=errors/maintenance
```

The page is rendered **when you run `down`** and stored, so it shows even if your app can't boot (that's often why you're in maintenance mode). Keep it self-contained: inline styles, no calls to your API.

### Send everyone somewhere else: `--redirect`

```bash
node strut down --redirect=/status
```

Every blocked request is redirected to `/status`. For safety, the target must be a path **on your own site**: an address like `https://other.example` or `//other.example` is refused, so `down` can't be turned into an open redirect.

### Typical: several options together

```bash
node strut down --with-secret --retry=60 --refresh=15
```

## A safe deploy routine

Most deploys don't need maintenance mode: new code and backwards-compatible migrations can go out while the app runs. Use it when a change can't run side by side with the old code:

```bash
node strut down --with-secret --retry=60   # 1. pause the app, keep a way in for yourself
node strut migrate --force                 # 2. change the database (--force: it's production)
node strut optimize                        # 3. rebuild the production caches
# 4. open the bypass link and check the app works
node strut up                              # 5. everyone back in
```

If anything fails in steps 2 to 4, you're still in maintenance mode: fix it, then run `up`. Nobody saw errors. See [Optimization](../optimization/) and [Deployment](../deployment/).

## With Docker or without

| | With Docker | Without Docker |
|---|---|---|
| Typing `node strut down` | Forwarded into the `app` container for you | Runs on your computer or server |
| What it pauses | Your app | Your app |
| What it does **not** do | Stop the containers: that's `node strut services:down` | — |

On a server with several copies of your app behind a load balancer, every copy must see the same "down" state. How that state is shared across servers (Laravel offers a file or a cache store) is not decided yet.

## Common mistakes

### I ran `node strut down` to stop Docker, and my app shows "be right back"

**Why:** `down` is maintenance mode, as in Laravel. Docker's stop command is a different one.
**Fix:** bring the app back and stop the containers with the right command:

```bash
node strut up
node strut services:down
```

### I locked myself out

**Why:** you ran `down` without `--secret` or `--with-secret`, so there's no bypass cookie.
**Fix:** run `node strut up`, then `node strut down --with-secret` and open the printed link.

### My load balancer marks the server as unhealthy during maintenance

**Why:** it checks a page that now answers 503, not the health route.
**Fix:** point the health check at `/up`, which keeps answering `200` in maintenance mode.

### `--redirect` refuses my URL

**Why:** the target must be a path on your own site (`/status`), so maintenance mode can't send your visitors to someone else's site.
**Fix:** use a path such as `--redirect=/status`, and serve the external link from that page if you need one.

### My custom page shows broken styles

**Why:** the page tried to load CSS or JavaScript from your app, which is blocked while it's down.
**Fix:** put the styles inline in the page you pass to `--render`.

## Next steps

- [Optimization](../optimization/): the production caches to rebuild after a deploy.
- [Deployment](../deployment/): building and running in production.
- [CLI Reference](../cli-reference/): every `node strut` command.
- [Docker](../docker/): `services:up` and `services:down`.
