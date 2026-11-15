---
title: "Task Scheduling"
description: "Run commands, jobs and small functions on a timetable (every minute, nightly, on weekdays), declared in your code, with one cron entry, no overlapping runs, one server only, and hooks for success and failure."
---

Every app has chores: delete expired API tokens every night, send a weekly digest on Monday morning, clean up half-finished uploads every hour. The **scheduler** lets you write that timetable **in your code**, next to everything else, instead of in a server's cron file that nobody remembers.

It works like Laravel's: the server runs **one** command every minute (`node strut schedule:run`), and that command checks your timetable and starts whatever is **due** (whose time has come). Each entry in the timetable is a **scheduled task**: a `node strut` command, a queued job, or a small function.

:::tip[Coming from Laravel?]
It's Laravel's scheduler: tasks are declared in `routes/console.ts` (Laravel 11's `routes/console.php`), with the same frequency helpers (`daily()`, `hourly()`, `everyFiveMinutes()`, `cron('…')`), `withoutOverlapping()`, `onOneServer()`, `before`/`after`/`onSuccess`/`onFailure` hooks, and the same commands: `schedule:list`, `schedule:run` (from cron, every minute) and `schedule:work` (in the foreground, for development). The scheduled-tasks screen that `spatie/laravel-schedule-monitor` adds is a tab of [`@strutvane/queue-dashboard`](../packages/queue-dashboard/).

What's different: in Docker mode the scheduler runs inside the `app` container like every other process, and it writes its own log file instead of sharing the web server's.
:::

:::caution[Coming in 0.3]
The scheduler is in **phase 2 of the roadmap (0.3, "background work")**, with queues and the cache. Nothing on this page is built yet. What's decided: the commands `schedule:list`, `schedule:run` and `schedule:work`; cron-style timetables; no overlapping runs; running on one server only; hooks; scheduled housekeeping such as `model:prune`; and a "missed schedule" health check in `@strutvane/queue-dashboard`.

**Planned API (a sketch: names may change before 0.3).** Where the timetable lives (`routes/console.ts`), `defineSchedule()` and the method names below follow Laravel, which is the stated goal, but they aren't fixed in the design yet. Every "What you'll see" is "something like this".
:::

## The smallest example

**Step 1: write the timetable.** Delete expired personal access tokens every night:

```ts title="routes/console.ts"
import { defineSchedule } from '@strutvane/framework'

export default defineSchedule((schedule) => {
  schedule.command('tokens:prune').daily()
})
```

**Step 2: check it.**

```bash
node strut schedule:list
```

**What you'll see:**

```text
  0 0 * * *  node strut tokens:prune ............ Next due: in 13 hours (2026-11-16 00:00 Europe/Berlin)
```

**Step 3: run it.** In development, `npm run dev` runs the scheduler for you. On a server, you add one line to cron (see [Running the scheduler on a server](#running-the-scheduler-on-a-server)). At midnight:

```text
[2026-11-16 00:00:00] production.INFO: Running scheduled command: tokens:prune
[2026-11-16 00:00:00] production.INFO: Deleted 14 expired personal access tokens.
```

## What you can schedule

### A `node strut` command

Any command, with its arguments, exactly as you'd type it:

```ts title="routes/console.ts"
import { defineSchedule } from '@strutvane/framework'

export default defineSchedule((schedule) => {
  schedule.command('tokens:prune').daily()
  schedule.command('auth:clear-resets').hourly()           // expired reset tokens, email links, invitations
  schedule.command('storage:prune-temp').everyThirtyMinutes()
  schedule.command('model:prune').dailyAt('02:30')          // models marked prunable()
})
```

These four are the usual housekeeping chores. `tokens:prune` and `auth:clear-resets` come with the auth package; `model:prune` deletes rows your models mark as **prunable** (for example, soft-deleted posts older than a year); `storage:prune-temp` removes uploads that were never finished.

### Your own command

Write the command with `defineCommand` (see [Console Commands](../strut-console/)), then schedule it by name:

```ts title="app/console/commands/send-weekly-digest.ts"
import { defineCommand } from '@strutvane/framework'

export default defineCommand({
  name: 'digest:weekly',
  description: 'Mail every author a summary of last week',
  async run({ output }) {
    // find authors, build and queue their digests
    output.line('Queued 37 digests.')
  },
})
```

```ts title="routes/console.ts"
import { defineSchedule } from '@strutvane/framework'

export default defineSchedule((schedule) => {
  schedule.command('digest:weekly').weeklyOn(1, '08:00')    // Mondays at 08:00
})
```

### A queued job

Schedule a [job](../queues/) to put it on the queue at the right time. The scheduler only **dispatches** it; a worker runs it, with retries:

```ts title="routes/console.ts"
import { defineSchedule } from '@strutvane/framework'
import { SyncPartnerPrices } from '../app/jobs/sync-partner-prices.ts'

export default defineSchedule((schedule) => {
  schedule.job(new SyncPartnerPrices({ partnerId: 'acme-wholesale' })).everyFifteenMinutes()
})
```

Prefer this for anything slow or that talks to other services: the scheduler stays quick, and failures get the queue's retries and failed-jobs list.

### A small function

For a few lines that don't deserve a command, schedule a function, and give it a **name** (it's what `schedule:list` and the logs show):

```ts title="routes/console.ts"
import { defineSchedule, Log } from '@strutvane/framework'
import { Post } from '../app/models/post.ts'

export default defineSchedule((schedule) => {
  schedule
    .call(async () => {
      const drafts = await Post.query().where('status', 'draft').count()
      Log.info('Draft posts waiting', { drafts })
    })
    .name('count-drafts')
    .hourly()
})
```

## How often: frequencies

| Method | Runs |
|---|---|
| `everyMinute()` | every minute |
| `everyFiveMinutes()`, `everyFifteenMinutes()`, `everyThirtyMinutes()` | every 5, 15 or 30 minutes |
| `hourly()` | at minute 0 of every hour |
| `daily()` | at midnight |
| `dailyAt('02:30')` | every day at 02:30 |
| `weekdays()` | Monday to Friday (combine with another, e.g. `.weekdays().dailyAt('09:00')`) |
| `weeklyOn(1, '08:00')` | every Monday at 08:00 (0 = Sunday) |
| `monthly()` | on the 1st, at midnight |
| `cron('0 3 * * 1')` | any **cron expression**: minute, hour, day of month, month, day of week |

A **cron expression** is five fields that describe when to run: `0 3 * * 1` reads "minute 0, hour 3, any day of the month, any month, Monday", so every Monday at 03:00.

### Time zones

Times are read in your app's time zone (the one the installer asked for in question 21) unless you say otherwise:

```ts title="routes/console.ts"
schedule.command('digest:weekly').weeklyOn(1, '08:00').timezone('America/New_York')
```

:::caution[Daylight saving time]
In time zones with daylight saving time, a local time can happen twice (when clocks go back) or not at all (when they go forward). For tasks that must run exactly once a day, pick a time outside the switch (02:00–03:00 in most of Europe and North America), or schedule in `UTC`.
:::

### Only in some environments

```ts title="routes/console.ts"
schedule.command('reports:send-to-partner').daily().environments(['production'])
```

Your laptop then never mails a partner by accident.

## Never twice at the same time: `withoutOverlapping`

If a task can take longer than its interval (a 15-minute sync that sometimes takes 20), the next run could start while the last one is still going. `withoutOverlapping()` skips the new run until the old one has finished:

```ts title="routes/console.ts"
schedule.command('partners:sync').everyFifteenMinutes().withoutOverlapping()
```

**What you'll see** when a run is skipped:

```text
local.INFO: Skipping scheduled command partners:sync: the previous run is still going.
```

It uses a [cache lock](../cache/#locks-only-one-at-a-time) with a lifetime, so a crashed run doesn't block the task forever: the lock frees itself after its lifetime. The default lifetime isn't decided yet; you can pass one in minutes: `withoutOverlapping(30)`.

## Only on one server: `onOneServer`

With three web servers each running `schedule:run`, a daily task would run **three times**. `onOneServer()` lets only the first server that grabs the task run it:

```ts title="routes/console.ts"
schedule.command('digest:weekly').weeklyOn(1, '08:00').onOneServer()
```

**What you'll see:** the digest goes out once. The other two servers log that another server took it.

:::note[It needs a shared store]
`onOneServer()` and `withoutOverlapping()` work through the cache, so every server must use the **same** cache store: the `database` store (the default) or Redis. See [Cache](../cache/).
:::

## Hooks: before, after, success and failure

Run code around a task, for example to alert someone when the weekly digest fails:

```ts title="routes/console.ts"
import { defineSchedule, Log } from '@strutvane/framework'

export default defineSchedule((schedule) => {
  schedule
    .command('digest:weekly')
    .weeklyOn(1, '08:00')
    .before(() => Log.info('Weekly digest starting'))
    .onSuccess(() => Log.info('Weekly digest finished'))
    .onFailure(() => Log.critical('Weekly digest FAILED'))
    .after(() => Log.info('Weekly digest task done, whatever the result'))
})
```

**What you'll see** when `digest:weekly` exits with a non-zero code:

```text
production.INFO: Weekly digest starting
production.ERROR: Scheduled command failed: digest:weekly (exit code 1)
production.CRITICAL: Weekly digest FAILED
production.INFO: Weekly digest task done, whatever the result
```

Route `critical` messages to Slack in `config/logging.ts` and someone hears about it at once (see [Logging](../logging/)). A failing task never stops the other tasks that were due in the same minute.

## Running the scheduler

### In development

`npm run dev` starts the scheduler with your app (packages register extra processes, like Laravel's `composer run dev`). To run it on its own, in the foreground:

```bash
node strut schedule:work
```

**What you'll see:** it wakes up every minute and runs whatever is due, until you press Ctrl+C.

To run whatever is due **right now**, once (handy when testing a new task):

```bash
node strut schedule:run
```

### Running the scheduler on a server

On a server, cron (or your platform's equivalent) runs `schedule:run` **every minute**. That's the only cron entry your app ever needs.

**Linux and macOS** (`crontab -e` as the user that owns the app):

```text
* * * * * cd /var/www/my-app && node strut schedule:run >> /dev/null 2>&1
```

The output goes nowhere because the scheduler writes its own log file in `storage/logs/`.

**Windows (Task Scheduler):** create a task that runs every minute, with:

```text
Program:    node
Arguments:  strut schedule:run
Start in:   C:\apps\my-app
```

**Containers (Kubernetes, ECS, Fly…):** run **one** extra container from the same image with the command `node strut schedule:work`, next to your web and worker containers. Run exactly one replica of it, or use `onOneServer()` on every task, so tasks don't run once per copy.

**A PaaS:** use its cron or scheduler feature to run `node strut schedule:run` every minute, or a worker process running `schedule:work`.

### Knowing it really runs

A scheduler that silently stopped is worse than none: nobody notices the nightly clean-up stopped. `@strutvane/queue-dashboard` adds a **Schedules** tab (last run, next run, result of each task) and a health check that fails when a task **missed** its run, which `@strutvane/health` can alert on.

## With Docker or without Docker

- **With Docker,** the scheduler runs **inside the `app` container**. `npm run dev` starts it there; `node strut schedule:list` or `schedule:run` typed on your computer is forwarded into the container. You don't install cron on your computer.
- **Without Docker,** `npm run dev` runs it on your machine; for a long-running setup use cron (Linux, macOS) or Task Scheduler (Windows) as above.
- **Logs:** the scheduler writes its own file in `storage/logs/` (each extra process gets its own file, so lines never mix). `node strut log:tail` merges it with the others.

## Common mistakes

### My task never runs on the server

**Why:** nothing calls `schedule:run`. Declaring a task in `routes/console.ts` only writes the timetable.
**Fix:** add the cron line (or the container / Task Scheduler entry), then check:

```bash
node strut schedule:list
```

### My task runs three times

**Why:** three servers (or three container replicas) each run the scheduler, and the task isn't limited to one.
**Fix:**

```ts
schedule.command('digest:weekly').weeklyOn(1, '08:00').onOneServer()
```

or run exactly one scheduler container.

### `onOneServer()` doesn't stop duplicates

**Why:** each server uses its own non-shared cache, so each one "wins" the lock.
**Fix:** point every server at the same cache store (the same database, or the same `REDIS_URL`).

### The task ran an hour early (or late)

**Why:** the server's time zone or a daylight saving switch differs from what you expected.
**Fix:** set the time zone on the task, and avoid times inside the switch:

```ts
schedule.command('reports:daily').dailyAt('06:00').timezone('Europe/Berlin')
```

### A long task stops other tasks

**Why:** slow work runs inside the scheduler process itself.
**Fix:** schedule a [queued job](../queues/) instead of the slow code, so the scheduler only dispatches it:

```ts
schedule.job(new SyncPartnerPrices({ partnerId: 'acme-wholesale' })).everyFifteenMinutes()
```

### A task is "skipped: the previous run is still going" forever

**Why:** a run crashed while holding the overlap lock, and the lock hasn't expired yet.
**Fix:** wait for the lock's lifetime, or give it a shorter one that's still longer than a normal run:

```ts
schedule.command('partners:sync').everyFifteenMinutes().withoutOverlapping(30)
```

## Next steps

- [Queues](../queues/): run the slow part of a scheduled task in the background.
- [Console Commands](../strut-console/): write your own `node strut` commands.
- [Cache](../cache/): the locks behind `withoutOverlapping` and `onOneServer`.
- [Deployment](../deployment/): where the scheduler runs in production.
