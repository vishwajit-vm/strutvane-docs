---
title: Maintenance Mode
description: Take your app offline for a moment with `node strut down`, show visitors a friendly "back soon" answer, keep using it yourself with a secret link, and bring it back with `node strut up`. Every option, what visitors see, a safe deploy routine, and the mistakes to avoid.
---

**Maintenance mode** puts your app on pause: every visitor gets a "down for maintenance" answer with the HTTP status **503 Service Unavailable**, while you run a risky migration, restore a backup or fix something urgent. One command turns it on, one turns it off:

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
Maintenance mode is **proven in a prototype** (spike 12): the `down` and `up` commands, the 503 answer, the bypass secret and cookie, `--redirect`, `--render`, and the health route staying up, with tests. It's not released yet.
:::

## The smallest example

Put the app in maintenance mode:

```bash
node strut down
```

**What you'll see:**

```text
  ✔ The application is now in maintenance mode.
```

Now every request answers `503`:

```bash
curl -i http://localhost:3000/api/posts
```

```text
HTTP/1.1 503 Service Unavailable
content-type: application/problem+json

{"type":"https://strutvane.dev/problems/maintenance","title":"Service unavailable","status":503,"code":"maintenance","detail":"The application is down for maintenance. Please try again soon."}
```

A browser gets the same answer as a small HTML page. Bring the app back:

```bash
node strut up
```

```text
  ✔ The application is now live.
```

(Run `up` when the app isn't down and it says `· The application was not in maintenance mode.`)

## How it works

`down` writes a small state file, `storage/framework/down`. Every running process of your app checks it on each request (it notices the change at once, with no restart), and `up` deletes it.

| Request | Answer |
|---|---|
| A page in the browser | `503`, a small HTML page (or your own, see `--render`) |
| An API call (`/api/…`, or `Accept: application/json`) | `503` problem+json with code `maintenance` |
| The health route `/up` | Still `200 {"status":"ok"}`, so your load balancer doesn't think the server crashed |
| Someone with the bypass cookie (see `--secret`) | The real app, as usual |
| A host name you don't serve | Still refused first by the trusted-host check (`400`) |

The check runs **before** routing, middleware and your controllers, so no code of yours runs for a blocked request. That's the point: a half-finished migration can't be hit by a visitor.

**Fail closed:** if the state file is damaged or unreadable, the app stays **down** with the plain 503, rather than guessing it should be up.

## Every option

| Option | What it does | Example |
|---|---|---|
| `--secret=<value>` | Visiting `/<value>` sets a cookie that lets **you** use the app while it's down. 8 to 128 letters, digits, `-` or `_` | `--secret=team-preview-2026` |
| `--with-secret` | Like `--secret`, but Strutvane makes up a strong random secret and prints the link once | `--with-secret` |
| `--retry=<seconds>` | Adds a `Retry-After` header, so clients and crawlers know when to come back | `--retry=60` |
| `--refresh=<seconds>` | Adds a `Refresh` header: browsers reload the page after that many seconds | `--refresh=15` |
| `--render=<file>` | Shows your own HTML page from `resources/views/` instead of the default | `--render=maintenance.html` |
| `--redirect=<path>` | Sends every visitor to one path of your own site instead | `--redirect=/status` |

### Let yourself in: `--with-secret` and `--secret`

You often want to check that everything works **before** everyone else gets back in:

```bash
node strut down --with-secret
```

**What you'll see:**

```text
  ✔ The application is now in maintenance mode.
  · Bypass it by visiting http://localhost:3000/3sJ0q8yVx2kWm7Pz9aBcDeFgHiJkLmNo (shown once; the secret is not stored).
```

Open that link once. It sets a **bypass cookie** (`strutvane_maintenance`, valid for 12 hours, `HttpOnly`, `SameSite=Lax`, and `Secure` over HTTPS) and sends you to the home page. From then on, your browser sees the real app while everyone else sees the 503.

The secret itself is **never stored**: only a keyed hash of it (made with your `APP_KEY`) is in the state file, so reading the server's files doesn't reveal the link.

Prefer a secret you can type? Choose it yourself:

```bash
node strut down --secret=team-preview-2026
```

Then visit `http://localhost:3000/team-preview-2026`. Anyone who knows it can get in, so `--with-secret` is the safer choice.

### Tell clients when to come back: `--retry`

```bash
node strut down --retry=120
```

**What you'll see** on every blocked request:

```text
HTTP/1.1 503 Service Unavailable
retry-after: 120
```

Search engines read `Retry-After` and don't drop your pages during a short outage.

### Reload the page by itself: `--refresh`

```bash
node strut down --refresh=30
```

A visitor who leaves the page open sees it reload every 30 seconds, so they're back in your app as soon as you run `up`, without pressing anything.

### Your own page: `--render`

Show a page that matches your brand instead of the default. Put a self-contained HTML file in `resources/views/` (the one place Strutvane reads plain HTML pages from):

```html title="resources/views/maintenance.html"
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Back soon</title>
    <style>body { font: 18px system-ui; margin: 20vh auto; max-width: 32rem; }</style>
  </head>
  <body>
    <h1>We'll be right back</h1>
    <p>We're making a few improvements. Please try again in a few minutes.</p>
  </body>
</html>
```

```bash
node strut down --render=maintenance.html
```

The page is read **when you run `down`** and stored in the state file, so it shows even if your app can't load anything else (often the reason you're in maintenance mode). Rules, for safety: it must be an `.html` file inside `resources/views/` (no `../`, no links pointing outside), at most 256 KiB. API calls still get the problem+json answer.

### Send everyone somewhere else: `--redirect`

```bash
node strut down --redirect=/status
```

Every blocked request gets a `302` to `/status` (the page itself is still answered, so you can serve a status page from it). The target must be a **path on your own site**: `https://other.example`, `//other.example` and encoded tricks are refused, so `down` can never become an open redirect.

### Typical: several options together

```bash
node strut down --with-secret --retry=60 --refresh=15
```

## A safe deploy routine

Most deploys don't need maintenance mode: new code and backwards-compatible migrations can go out while the app runs. Use it when a change can't run side by side with the old code:

```bash
node strut down --with-secret --retry=60   # 1. pause the app, keep a way in for yourself
node strut migrate --force                 # 2. change the database (--force: production asks otherwise)
node strut optimize                        # 3. rebuild the production caches
# 4. open the bypass link and check the app works
node strut up                              # 5. everyone back in
```

If anything fails in steps 2 to 4, you're still in maintenance mode: fix it, then run `up`. Nobody saw errors. See [Optimization](../optimization/) and [Deployment](../deployment/).

## Several processes and servers

Every process that shares the project folder reads the same state file, so one `down` pauses all of them (the API, workers, a cluster of processes on one server). On **several servers**, run `down` and `up` on each, or put `storage/framework/` on shared storage.

## With Docker or without

| | With Docker | Without Docker |
|---|---|---|
| Typing `node strut down` | Forwarded into the `app` container for you | Runs on your computer or server |
| What it pauses | Your app | Your app |
| What it does **not** do | Stop the containers: that's `node strut services:down` | — |

## Common mistakes

### I ran `node strut down` to stop Docker, and my app answers 503

**Why:** `down` is maintenance mode, as in Laravel. Docker's stop command is a different one.
**Fix:** bring the app back and stop the containers with the right command:

```bash
node strut up
node strut services:down
```

### I locked myself out

**Why:** you ran `down` without `--secret` or `--with-secret`, so there's no bypass link.
**Fix:** run `node strut up`, then `node strut down --with-secret` and open the printed link.

### "--secret must be 8 to 128 letters, digits, "-" or "_""

```text
  ✖ --secret must be 8 to 128 letters, digits, "-" or "_".
  → Or use --with-secret to generate a strong one.
```

**Fix:** use a longer secret with only those characters, or `--with-secret`.

### "--redirect must be a path on this site"

```text
  ✖ --redirect must be a path on this site, such as /status (got "https://status.example.com").
  → Absolute URLs, "//host" and encoded variants are refused, so maintenance mode can never send visitors elsewhere.
```

**Fix:** use a path such as `--redirect=/status`, and link to the external status page from there.

### "--render must name an .html file inside resources/views"

```text
  ✖ --render must name an .html file inside resources/views (got "../maintenance.html").
  → Example: --render=maintenance.html for resources/views/maintenance.html.
```

**Fix:** put the file in `resources/views/` and pass only its name.

### My load balancer marks the server as unhealthy during maintenance

**Why:** it checks a page that now answers 503, not the health route.
**Fix:** point the health check at `/up`, which keeps answering `200` in maintenance mode.

### My custom page shows broken styles

**Why:** the page loads CSS or JavaScript from your app, which is blocked while it's down.
**Fix:** put the styles inline in the HTML file.

## Next steps

- [Optimization](../optimization/): the production caches to rebuild after a deploy.
- [Deployment](../deployment/): building and running in production.
- [CLI Reference](../cli-reference/): every `node strut` command.
- [Docker](../docker/): `services:up` and `services:down`.
