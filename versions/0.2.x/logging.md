---
title: Logging
description: Write log messages from your app, choose where they go (one file, a file per day, the terminal, Slack) from .env, follow them live with log:tail, and keep secrets out of them.
---

A **log** is your app's diary: short messages it writes while it runs ("payment failed for invoice 42"), so you can find out later what happened. Strutvane's logging is built into the framework and works like Laravel's: you write `Log.info('…')` in your code, and **channels**, chosen in `.env`, decide where each message goes.

:::tip[Coming from Laravel?]
It's Laravel's logging, in TypeScript: `config/logging.ts` with the same drivers (`single`, `daily`, `stack`, `stderr`, `slack`, `null`, custom), the same `.env` keys (`LOG_CHANNEL`, `LOG_STACK`, `LOG_LEVEL`, `LOG_DAILY_DAYS`), the same eight levels, files in `storage/logs/`, and `Log::channel('x')` becomes `Log.channel('x')`. `php artisan pail` becomes `node strut log:tail`.

Three differences: every process (queue worker, scheduler) writes **its own file** instead of sharing one, so files never get corrupted; **secrets are always redacted**, on every channel; and request bodies are never logged by default.
:::

:::caution[Coming in 0.2]
Laravel-style channels are **decided** (ADR-0022, 2026-11-15) but **designed, not built yet**. What exists today is the 0.1 logging pipeline (redaction, a bounded queue, one file per process, rotation and clean shutdown; ADR-0015, measured in spike 09), which is being moved into `@strutvane/framework` and given channels. Names on this page follow ADR-0022 and may still change in small ways.
:::

## The smallest example

Log a message from anywhere in your app:

```ts title="app/http/controllers/post.controller.ts"
import { Log } from '@strutvane/framework'

Log.info('Post published', { postId: 42 })
```

**What you'll see:** a new line at the end of today's file, `storage/logs/strutvane-2026-11-15.log`:

```text
[2026-11-15 10:22:01.123] local.INFO: Post published {"postId":42,"requestId":"01JD7Q6Y9X3V2K8M4N5P6R7S8T"}
```

Read it as: the time, the environment (`local`), the level (`INFO`), your message, then the **context** (the extra data) as JSON. The request id was added for you. Nothing to configure: a new app logs to a daily file out of the box.

## Levels

Every message has a **level**: how serious it is. These are the eight levels from RFC 5424, the same as Laravel's, from most to least serious:

| Level | Use it when… | Example |
|---|---|---|
| `emergency` | the whole app is unusable | the database is gone |
| `alert` | someone must act now | the disk is full |
| `critical` | a key part is broken | payments are failing |
| `error` | something failed, but the app keeps going | one email couldn't be sent |
| `warning` | something odd that isn't an error yet | an API answered slowly |
| `notice` | normal, but worth noticing | a user changed their email |
| `info` | normal events | a post was published |
| `debug` | details for developers | the SQL a query ran |

`LOG_LEVEL` sets the **least serious level that's still written**. With `LOG_LEVEL=warning`, `warning` and everything above it is kept, and `notice`, `info` and `debug` are dropped. The default is `debug` in local development and `info` everywhere else.

The 0.1 names still work as aliases: `warn` means `warning`, `fatal` means `critical`, `trace` means `debug`.

## Writing log messages

### One level method per level

```ts title="app/http/controllers/post.controller.ts"
import { Log } from '@strutvane/framework'

Log.debug('Loading posts', { page: 2 })
Log.info('Post published', { postId: 42 })
Log.warning('Slug was changed to stay unique', { from: 'hello', to: 'hello-k3f9' })
Log.error('Could not send the "post published" email', { postId: 42 })
```

**What you'll see:** four lines in the log file, each with its level in capitals (`DEBUG`, `INFO`, `WARNING`, `ERROR`).

Always put values in the **context** object, never inside the message text. `Log.info('Post published', { postId: 42 })` can be searched and filtered; `Log.info('Post 42 published')` can't, and a value pasted into the text escapes redaction.

### Context that's added for you

Inside a request, every message automatically gets:

- `requestId`: one id per request, also sent back in the response, so a user's error report leads straight to its log lines;
- the signed-in **user's id**;
- the current **team's id** (the tenant), when teams are on.

### Adding your own context

```ts title="app/http/controllers/invoice.controller.ts"
import { Log } from '@strutvane/framework'

// For the rest of THIS request: every message below also carries orderId.
Log.withContext({ orderId: 'ord_123' })
Log.info('Charging the card')     // context: { orderId: 'ord_123', requestId: ... }

// For every channel, from now on (for example in a provider's boot()).
Log.shareContext({ region: 'eu-west' })

// Drop the context you added (the automatic request id stays).
Log.withoutContext()
```

**What you'll see:** `Charging the card {"orderId":"ord_123","region":"eu-west","requestId":"01JD7Q6Y9X3V2K8M4N5P6R7S8T"}`, once `shareContext` has run.

### Logging an error, and the `logger()` helper

```ts title="app/jobs/send-invoice.ts"
import { logger, report } from '@strutvane/framework'

try {
  await sendInvoice(invoice)
} catch (error) {
  report(error)   // logs it at "error", with the stack trace, and carries on
}

logger().info('Invoice job finished')   // the same as Log.info(...)
```

`report(error)` is Laravel's `report()`: it writes the error to the log the same way the error page would, without stopping your code.

## Channels: where messages go

A **channel** is one destination with its settings. `LOG_CHANNEL` picks the default channel; `config/logging.ts` defines the channels. Every driver:

| Driver | Where messages go | Good for |
|---|---|---|
| `single` | one file, `storage/logs/strutvane.log` | small apps, quick experiments |
| `daily` | one file per day, `storage/logs/strutvane-2026-11-15.log`, old days deleted after `LOG_DAILY_DAYS` | most apps (the default, through `stack`) |
| `stack` | several channels at once, listed in `LOG_STACK` | "a file **and** Slack" |
| `stderr` / `stdout` | the process's output, where containers and hosting platforms collect it | Docker images, Kubernetes, PaaS |
| `slack` | a Slack channel through a webhook, for `critical` and above | waking someone up |
| `null` | nowhere (messages are discarded) | silencing a channel in tests |
| `custom` | a function you write that returns a transport | anything else |

### Switching channel from `.env`

The commonest change needs no code. A new app logs through `stack`, which writes to `daily`:

```ini title=".env"
LOG_CHANNEL=stack
LOG_STACK=daily
LOG_LEVEL=debug
LOG_DAILY_DAYS=14
LOG_FORMAT=line
LOG_MAX_FILE_SIZE=100mb
```

To also send serious problems to Slack, add `slack` to the stack and the webhook:

```ini title=".env"
LOG_STACK=daily,slack
LOG_SLACK_WEBHOOK_URL=https://hooks.slack.com/services/your/webhook/url
```

**What you'll see:** every message still lands in the daily file, and `critical`, `alert` and `emergency` messages also arrive in Slack.

### Every `LOG_*` key

| Key | What it does | Default |
|---|---|---|
| `LOG_CHANNEL` | The default channel: `single`, `daily`, `stack`, `stderr`, `stdout`, `slack`, `null`, or any channel you define. | `stack` |
| `LOG_STACK` | The channels `stack` writes to, comma-separated. | `daily` |
| `LOG_LEVEL` | The least serious level that's written. | `debug` in local, `info` otherwise |
| `LOG_DAILY_DAYS` | Days of daily files to keep. | `14` |
| `LOG_FORMAT` | `line` (readable) or `json` (one JSON object per line). | `line` |
| `LOG_MAX_FILE_SIZE` | Size at which a file is closed and a new part starts. | `100mb` |
| `LOG_PATH` | The folder for log files. | `storage/logs` |
| `LOG_SLACK_WEBHOOK_URL` | The Slack webhook for `slack`. Treat it as a secret. | not set |
| `LOG_DEPRECATIONS_CHANNEL` | Where deprecation warnings go. | `null` (discarded) |

### `config/logging.ts`, and your own `payments` channel

Channels are defined in `config/logging.ts`. You can add your own and give them any name. Here, payments get their own file, kept for 90 days:

```ts title="config/logging.ts"
import { defineConfig } from '@strutvane/framework'

export default defineConfig((env) => ({
  default: env.string('LOG_CHANNEL', 'stack'),
  channels: {
    stack: { driver: 'stack', channels: env.string('LOG_STACK', 'daily').split(',') },
    single: { driver: 'single', path: 'storage/logs/strutvane.log' },
    daily: { driver: 'daily', path: 'storage/logs/strutvane.log', days: env.integer('LOG_DAILY_DAYS', 14) },
    stderr: { driver: 'stderr' },
    slack: { driver: 'slack', url: env.optional('LOG_SLACK_WEBHOOK_URL'), level: 'critical' },
    null: { driver: 'null' },

    // Your own channel: one daily file only for payments.
    payments: { driver: 'daily', path: 'storage/logs/payments.log', days: 90, level: 'info' },
  },
}))
```

Use it by name:

```ts title="app/services/payments.ts"
import { Log } from '@strutvane/framework'

Log.channel('payments').warning('Card declined', { invoiceId: 42, reason: 'insufficient_funds' })
```

**What you'll see:** the line in `storage/logs/payments-2026-11-15.log`, and not in the main file.

### Several channels for one message, or a channel made on the spot

```ts title="app/services/payments.ts"
import { Log } from '@strutvane/framework'

// This one message goes to the daily file AND to Slack.
Log.stack(['daily', 'slack']).critical('Payment provider is down', { provider: 'stripe' })

// A channel built right here, without touching config/logging.ts.
Log.build({ driver: 'single', path: 'storage/logs/import-2026-11-15.log' }).info('Import started', { rows: 1200 })
```

:::caution[Coming in 0.2]
The exact option names inside each channel (`path`, `days`, `level`, `url`) and the shape of a `custom` driver are designed, not final.
:::

## The two file formats

`LOG_FORMAT=line` (the default) is readable in any text editor, like Laravel's:

```text
[2026-11-15 10:22:01.123] local.ERROR: Payment failed {"invoice":42,"requestId":"…"}
```

`LOG_FORMAT=json` writes one JSON object per line (often called **NDJSON**), which log shippers such as Loki, Datadog or CloudWatch read directly:

```text
{"time":"2026-11-15T10:22:01.123Z","level":"error","env":"local","message":"Payment failed","context":{"invoice":42,"requestId":"…"}}
```

(The JSON field names are not final.) In both formats, newlines and terminal colour codes inside values are escaped, so **one message is always exactly one line**. Someone can't fake a log line by putting a newline in their name.

## Log files on disk

| File | Written by |
|---|---|
| `storage/logs/strutvane.log` | the `single` channel |
| `storage/logs/strutvane-2026-11-15.log` | the `daily` channel, main process, on 15 November |
| `storage/logs/strutvane-2026-11-15.worker-2.log` | the same day, from another process (a queue worker, the scheduler, a cluster worker) |
| `storage/logs/strutvane-2026-11-15-2.log` | the second **part** of the day, after the first reached `LOG_MAX_FILE_SIZE` |

The rules behind those names:

- The main process writes the plain name; **every other process writes its own file**.
- When a file reaches `LOG_MAX_FILE_SIZE`, a new part starts. Files are **never renamed**, so a program reading a file never loses its place.
- Retention (`LOG_DAILY_DAYS`) deletes **whole days**, never half a day.
- `log:tail` and the log viewer **merge** all the files of a day by timestamp, so you still read one timeline.

**Why one file per process?** Laravel lets every process append to the same file. The 0.1 measurements (spike 09) found that with several writers on one file, the size cap broke in 24 to 25 files out of every 28 to 30: files grew past their limit. Separate files keep the guarantee, and the names stay close to Laravel's.

## Following logs live: `log:tail`

`node strut log:tail` shows new messages as they're written, from every process, merged in time order. Like Laravel Pail, you can narrow it to some levels or one channel.

```bash
node strut log:tail
```

**What you'll see** (something like this):

```text
[2026-11-15 10:22:01.123] local.INFO: Post published {"postId":42}
[2026-11-15 10:22:03.981] local.ERROR: Could not send the "post published" email {"postId":42}
```

Press <kbd>Ctrl</kbd>+<kbd>C</kbd> to stop.

The other log commands:

| Command | What it does |
|---|---|
| `node strut log:tail` | Follow new messages live; filter by level and by channel |
| `node strut log:list` | List the log files, with their size and dates |
| `node strut log:clear` | Delete the local log files |
| `node strut log:clear --days=7` | Delete only files older than 7 days |

:::caution[Coming in 0.2]
The three commands are decided (ADR-0022) but not built. The exact names of `log:tail`'s level and channel filters are not decided yet, so they aren't shown here; `node strut help log:tail` will list them.
:::

## With Docker or without Docker

- **Without Docker,** files are written to `storage/logs/` in your project and `log:tail` reads them directly.
- **With Docker,** your app runs in the `app` container, but your project folder is shared with it, so the files still appear in `storage/logs/` on your computer and you can open them in your editor. `node strut log:tail` typed on your computer is forwarded into the container like every other command. See [Docker](../docker/).

On Windows and macOS, `storage/logs/` is a normal folder you can open in Explorer or Finder. `storage/` is git-ignored, so logs are never committed.

## Production and containers

In a container, write to the process output and let the platform collect it:

```ini title=".env.production"
LOG_CHANNEL=stderr
LOG_FORMAT=json
```

The production `Dockerfile` the installer can write (question "Where will you deploy?", answer "Docker image") already sets these two values. On a plain server (a VPS), keep `daily`, and make sure `LOG_DAILY_DAYS` fits your disk and your data-retention rules.

## Secrets stay out of logs

You can't switch these off, on any channel:

- **Redaction is always on.** Values under keys that look secret (passwords, tokens, API keys, cookies, `authorization` headers) are replaced before anything is written. The same matcher hides secret columns from the generated API and screens.
- **Request bodies are not logged** by default.
- **Slack is rate-limited** and goes through the framework's HTTP client, which refuses private and internal network addresses, so a crafted webhook URL can't reach your internal services.

```ts title="app/http/controllers/session.controller.ts"
import { Log } from '@strutvane/framework'

Log.info('Login attempt', { email: 'asha@example.com', password: 'hunter2hunter2' })
```

**What you'll see:**

```text
[2026-11-15 10:30:12.044] local.INFO: Login attempt {"email":"asha@example.com","password":"[REDACTED]","requestId":"01JD7QA1B2C3D4E5F6G7H8J9K0"}
```

(The exact redaction marker may differ.) Redaction is a safety net, not permission: don't log secrets on purpose.

## Seeing logs in the browser: `@strutvane/log-viewer`

The optional [`@strutvane/log-viewer`](../packages/log-viewer/) package adds a screen at `/_strutvane/logs` to tail, search and filter your logs. It reads both formats and merges the per-process files. It's **pre-selected** in the installer's "Extra features" question, so most new apps have it. To add it later:

```bash
node strut install:log-viewer
```

The screen is a developer tool behind sign-in and a permission; logging itself works without it.

:::caution[Coming in 0.2]
`@strutvane/log-viewer` is planned for 0.2 (phase 1): it becomes the screen and read API of the 0.1 logs package. `node strut install:<name>` is designed, not built yet.
:::

## Common mistakes

### My `Log.debug()` messages never appear

```text
LOG_LEVEL=info
```

**Why:** `LOG_LEVEL` is the least serious level that's written, and `debug` is below `info`. Outside local development, the default is `info`.
**Fix:** lower it while you investigate, then put it back:

```ini title=".env"
LOG_LEVEL=debug
```

### I used `console.log()` and the message isn't in the log file

**Why:** `console.log` writes to the terminal only. It skips channels, levels, context and redaction, so it can also leak a secret.
**Fix:** use the logger:

```ts
import { Log } from '@strutvane/framework'

Log.info('Imported posts', { count: 120 })
```

### Two processes write to one file and the lines are mixed up

**Why:** a channel you defined points every process at one fixed path, or another tool appends to Strutvane's file. Several writers on one file break the size cap and interleave lines.
**Fix:** let each process keep its own file (the default), and read them together with `node strut log:tail` or the log viewer. Point other tools at their own file:

```ts title="config/logging.ts"
// in channels:
reports: { driver: 'daily', path: 'storage/logs/reports.log', days: 30 },
```

### Old daily files keep disappearing

**Why:** `daily` deletes files older than `LOG_DAILY_DAYS` (14 by default).
**Fix:** keep them longer, or ship them elsewhere before they go:

```ini title=".env"
LOG_DAILY_DAYS=90
```

### Slack never receives anything

**Why:** the `slack` channel only sends `critical` and above, it's rate-limited (a burst of errors doesn't all reach Slack), and it does nothing unless `slack` is in `LOG_STACK` or you call it by name.
**Fix:** add it to the stack, set the webhook, and test with a `critical` message:

```ini title=".env"
LOG_STACK=daily,slack
LOG_SLACK_WEBHOOK_URL=https://hooks.slack.com/services/your/webhook/url
```

```ts
import { Log } from '@strutvane/framework'

Log.critical('Testing the Slack channel')
```

### My log file is a wall of JSON

**Why:** `LOG_FORMAT=json` is set (often copied from a production setup). It's made for log shippers, not for reading.
**Fix:** use the readable format locally:

```ini title=".env"
LOG_FORMAT=line
```

## Next steps

- [Configuration](../configuration/): every `.env` key, including the `LOG_*` ones.
- [Error Handling](../errors/): what gets logged when a request fails.
- [Security Features](../security/): redaction, and the other protections that are on by default.
- [CLI Reference](../cli-reference/): `log:tail`, `log:list` and `log:clear` with the other commands.
