---
title: "Queues"
description: "Move slow work (sending mail, generating reports, calling other services) out of the request into background jobs, with retries, failed-job handling, chains, batches, unique jobs and workers that survive deploys."
---

Some work is too slow to do while a person waits for the page: sending ten emails, building a PDF, calling a partner's API that takes three seconds. A **queue** lets you say "do this soon, in the background" and answer the request straight away.

The piece of work is a **job**: a small class with a `handle()` method and the data it needs. **Dispatching** a job writes it to the queue. A **worker** is a separate, long-running process that takes jobs off the queue one by one and runs them. If a job fails, the worker **retries** it; if it keeps failing, it lands in the **failed jobs** list, where you can look at it and retry it once you've fixed the cause.

:::tip[Coming from Laravel?]
It's Laravel's queue: a job class with `handle()`, `$tries`, `$backoff`, `$timeout` and `failed()`; database and Redis connections; chains, batches, unique jobs, job middleware and rate-limited jobs; `queue:work`, `queue:listen`, `queue:restart`, `queue:retry`, `queue:flush`, `queue:clear` and `queue:monitor`. Horizon becomes [`@strutvane/queue-dashboard`](../packages/queue-dashboard/).

What's different:
- **The request's context travels with the job**: the team (tenant), the user who dispatched it and the request id are restored when the job runs, so tenant scoping and log lines just work inside jobs.
- **`afterCommit: true`** is the recommended default for jobs dispatched inside a transaction, so a job never runs for a row that was rolled back.
- Workers write to **their own log file** (`…worker-2.log`), so log files never get mixed up.
- The default connection is `database`; there's no `sync` connection in production.
:::

:::caution[Coming in 0.3]
Queues are in **phase 2 of the roadmap (0.3, "background work")**, with the scheduler, the cache, notifications, `@strutvane/redis` and `@strutvane/queue-dashboard`. Nothing on this page is built yet. What's decided: the worker commands (`queue:work`, `queue:listen`, `queue:monitor`, `queue:restart`, `queue:retry <id|all>`, `queue:flush`, plus `queue:clear`), the `Queue` facade and its `Queue.fake()`, the database and Redis connections (installer question 18), chains, batches, unique jobs, job middleware and rate-limited jobs, `afterCommit`, context propagation into jobs, and the testing fake.

**Planned API (a sketch: names may change before 0.3).** The classes and methods below (`Job`, `Queue.push()`, `Queue.chain()`, `Queue.batch()`, `make:job`, the `--queue` option) follow Laravel's shape, which is the stated goal, but their exact names aren't in the design yet. Every "What you'll see" is "something like this".
:::

## The smallest example

**Step 1: write a job.** It sends a welcome mail to a new user:

```ts title="app/jobs/send-welcome-mail.ts"
import { Job } from '@strutvane/framework'
import { User } from '../models/user.ts'
import { sendWelcomeMail } from '../mail/welcome.ts'

/** Sends the welcome mail in the background, so sign-up answers instantly. */
export class SendWelcomeMail extends Job<{ userId: string }> {
  async handle(): Promise<void> {
    const user = await User.findOrFail(this.payload.userId)
    await sendWelcomeMail(user)
  }
}
```

**Step 2: dispatch it** from wherever the user is created:

```ts title="app/http/controllers/user.controller.ts (excerpt)"
import { Queue } from '@strutvane/framework'
import { SendWelcomeMail } from '../../jobs/send-welcome-mail.ts'

await Queue.push(new SendWelcomeMail({ userId: user.id }))
return ctx.json({ data: user }, 201)
```

**Step 3: run a worker.** In development, `npm run dev` starts one for you, next to the API and the UI. To run one on its own:

```bash
node strut queue:work
```

**What you'll see:** the request answers in a few milliseconds. In the worker's terminal (and in `storage/logs/strutvane-worker-1.log`):

```text
[2026-11-15 10:22:01] local.INFO: Processing SendWelcomeMail {"job":"01JD7Q…","queue":"default","attempt":1}
[2026-11-15 10:22:02] local.INFO: Processed SendWelcomeMail {"job":"01JD7Q…","ms":412}
```

The job's data (`this.payload`) is stored as **JSON**, so pass ids and plain values, never a whole model: the worker loads a fresh copy when it runs, which may be seconds or hours later.

## Connections: where the jobs wait

A **connection** is where jobs are stored until a worker picks them up. The installer asks in question 18:

| Connection | Where jobs wait | Good for | Needs |
|---|---|---|---|
| `database` (default) | a `jobs` table in your database | most apps; nothing extra to run | nothing |
| `redis` | Redis or Valkey (with BullMQ inside `@strutvane/redis`) | lots of jobs, many workers | `node strut install:redis`, `REDIS_URL` |

`QUEUE_CONNECTION` in `.env` selects it (`node strut install:redis` sets it to `redis`). The `jobs` table is an **internal table**: no automatic API, no admin screen. Cloud connections such as Amazon SQS may come later as a separate driver package if people ask for them.

## Dispatching in every way

### Later: a delay

Send a reminder in one hour:

```ts title="app/http/controllers/post.controller.ts (excerpt)"
import { Queue } from '@strutvane/framework'
import { RemindAuthorToPublish } from '../../jobs/remind-author-to-publish.ts'

await Queue.push(new RemindAuthorToPublish({ postId: post.id }), { delay: 3600 })   // seconds
```

**What you'll see:** the job sits in the queue and a worker runs it about an hour later (never earlier).

### On a named queue: priorities

A connection can hold several **queues** (named lines). Put urgent work on its own line, and tell workers which lines to watch first:

```ts title="app/http/controllers/password.controller.ts (excerpt)"
await Queue.push(new SendPasswordResetMail({ userId: user.id }), { queue: 'mail' })
```

```bash
node strut queue:work --queue=mail,default   # empties "mail" first, then "default"
```

### Only after the transaction commits: `afterCommit`

If you dispatch inside a [transaction](../orm-transactions/) and the transaction is rolled back, the job must not run: the row it's about doesn't exist. `afterCommit: true` holds the job until the commit, and drops it on a rollback.

```ts title="app/services/publish-post.ts"
import { Queue, transaction } from '@strutvane/framework'
import { Post } from '../models/post.ts'
import { NotifyFollowers } from '../jobs/notify-followers.ts'

export async function publish(postId: string): Promise<void> {
  await transaction(async () => {
    const post = await Post.findOrFail(postId)
    await post.update({ status: 'published' })
    await Queue.push(new NotifyFollowers({ postId }), { afterCommit: true })
    // If anything below throws, the update is rolled back AND the job is never queued.
  })
}
```

**What you'll see:** followers are notified only for posts that really are published. Without `afterCommit`, a fast worker could pick the job up before the commit and find a post that is still a draft, or doesn't exist at all.

The same `afterCommit: true` option exists on events and mail ([Events](../events/), [Mail](../mail/)).

## What travels with a job: context

When you dispatch from a request, the job carries that request's **context**: the current team (tenant), the user who caused it, the request id, and anything you added with `Log.withContext()`. The worker restores it before `handle()` runs.

```ts title="app/jobs/export-tasks.ts"
import { Job, Log } from '@strutvane/framework'
import { Task } from '../models/task.ts'

export class ExportTasks extends Job<{ projectId: string }> {
  async handle(): Promise<void> {
    // Runs as the same team that dispatched it: the tenant scope applies, so only
    // this team's tasks are read, exactly as in the request.
    const tasks = await Task.query().where('project_id', this.payload.projectId).get()
    Log.info('Exported tasks', { count: tasks.length })
  }
}
```

**What you'll see** in the worker's log: the same request id as the request that dispatched it, plus the team, so you can follow one action across processes:

```text
[2026-11-15 10:30:12] local.INFO: Exported tasks {"count":42,"requestId":"01JD7R…","tenant":"7"}
```

Why it matters: without this, a job would run with **no team**, and the tenant scope would refuse to read tenant tables (or, worse, a hand-written query could read every team's rows). Carrying the team is what keeps background work as isolated as requests. Secrets are never put in the context, and job payloads are redacted in logs and in the dashboard.

## Retries, back-off and timeouts

A job that throws is retried. You decide how often, how long to wait between tries, and how long one try may take:

```ts title="app/jobs/sync-partner-prices.ts"
import { Job } from '@strutvane/framework'

export class SyncPartnerPrices extends Job<{ partnerId: string }> {
  /** Try at most 4 times in total. */
  static tries = 4
  /** Wait 10 s, then 60 s, then 5 minutes between tries. */
  static backoff = [10, 60, 300]
  /** One try may take at most 120 s; then it counts as failed. */
  static timeout = 120

  async handle(): Promise<void> {
    // call the partner's API; throw on any error so the job is retried
  }
}
```

| Setting | Meaning | Laravel |
|---|---|---|
| `tries` | attempts in total, the first one included | `$tries` |
| `backoff` | seconds to wait before each retry (one number, or one per retry) | `$backoff` |
| `timeout` | seconds one attempt may run before it's stopped | `$timeout` |

**What you'll see** when the partner's API is down for a minute:

```text
local.WARNING: SyncPartnerPrices failed, retrying in 10 s {"attempt":1,"error":"HttpClientError: connection_failed"}
local.WARNING: SyncPartnerPrices failed, retrying in 60 s {"attempt":2,"error":"HttpClientError: connection_failed"}
local.INFO: Processed SyncPartnerPrices {"attempt":3,"ms":830}
```

:::danger[Make every job safe to run twice]
A job can run more than once: a retry after a timeout, a worker killed halfway, a redelivery after a crash. Write `handle()` so that running it twice gives the same result as running it once (**idempotent**): "set status to published", not "add 1 to the count"; check "already sent?" before sending. This is an engineering rule for every Strutvane package, and it applies to your jobs too.
:::

## When a job fails for good

After the last try, the job is **failed**: it moves to the failed jobs list, with the error, and stays there until you retry or delete it. The worker carries on with the next job; one bad job never stops the queue.

Run code when that happens with `failed()`:

```ts title="app/jobs/export-project-report.ts"
import { Job, Log } from '@strutvane/framework'
import { Project } from '../models/project.ts'

export class ExportProjectReport extends Job<{ projectId: string }> {
  static tries = 3

  async handle(): Promise<void> {
    // build the report file
  }

  /** Called once, after the last try failed. */
  async failed(error: Error): Promise<void> {
    const project = await Project.find(this.payload.projectId)
    Log.error('Project report failed for good', { projectId: project?.id, error })
    // e.g. tell the user who asked for it, so they aren't left waiting
  }
}
```

**What you'll see** in the worker log:

```text
local.ERROR: ExportProjectReport failed after 3 attempts {"job":"01JD7S…","error":"Error: template not found"}
local.ERROR: Project report failed for good {"projectId":"7","error":{"name":"Error","message":"template not found"}}
```

The user who asked for the report isn't left on a spinning page: they got their answer ("your report is being prepared") when the job was dispatched, and `failed()` is your chance to tell them it didn't work.

### Retrying and cleaning up failed jobs

```bash
node strut queue:retry 01JD7S8K2M      # retry one failed job by its id
node strut queue:retry all             # retry every failed job
node strut queue:flush                 # delete every failed job
node strut queue:clear                 # delete jobs still WAITING in the default queue
```

**What you'll see** (something like this):

```text
  ✔ 1 failed job pushed back onto the "default" queue.
```

`queue:clear` and `queue:flush` delete jobs for good; there's no undo. With `@strutvane/queue-dashboard`, the same retries and purges are buttons on the **Failed** page, and each one is written to the audit log.

## Chains: one after another

A **chain** runs jobs in order, each only if the one before succeeded. If one fails, the rest are not run.

```ts title="app/services/import-tasks.ts"
import { Queue } from '@strutvane/framework'
import { DownloadImportFile } from '../jobs/download-import-file.ts'
import { ValidateImportFile } from '../jobs/validate-import-file.ts'
import { ImportTasksFromFile } from '../jobs/import-tasks-from-file.ts'

export async function startImport(importId: string): Promise<void> {
  await Queue.chain([
    new DownloadImportFile({ importId }),
    new ValidateImportFile({ importId }),
    new ImportTasksFromFile({ importId }),
  ])
}
```

**What you'll see:** the three jobs run one after the other. If validation fails for good, the import job never runs, and the failed jobs list shows `ValidateImportFile` with its error.

## Batches: many at once, then one callback

A **batch** is a group of jobs that may run in parallel on several workers, with code that runs when the whole group is done. Typical: "email 5,000 customers, then tell the admin it's finished".

```ts title="app/services/newsletter.ts"
import { Queue } from '@strutvane/framework'
import { SendNewsletterTo } from '../jobs/send-newsletter-to.ts'
import { NewsletterFinished } from '../jobs/newsletter-finished.ts'

export async function sendNewsletter(issueId: string, userIds: readonly string[]): Promise<string> {
  const batch = await Queue.batch(userIds.map((userId) => new SendNewsletterTo({ issueId, userId })), {
    then: new NewsletterFinished({ issueId }),   // runs once, when every job has finished
    allowFailures: true,                          // one bad address doesn't stop the others
  })
  return batch.id
}
```

**What you'll see:** the jobs spread over your workers. You can show progress from the batch's counts (total, pending, failed); when the last one is done, `NewsletterFinished` runs once.

## Unique jobs: never twice in the queue

Mark a job **unique** when two copies waiting at the same time would be wasteful or wrong, such as "recalculate project 7's totals".

```ts title="app/jobs/recalculate-project-totals.ts"
import { Job } from '@strutvane/framework'

export class RecalculateProjectTotals extends Job<{ projectId: string }> {
  /** At most one waiting copy per project. */
  static uniqueId(payload: { projectId: string }): string {
    return payload.projectId
  }

  async handle(): Promise<void> {
    // sum the project's tasks and store the totals
  }
}
```

**What you'll see:** dispatching it ten times in a second while one copy is waiting adds it once. The uniqueness uses a [cache lock](../cache/#locks-only-one-at-a-time), so it holds across every server.

## Job middleware and rate-limited jobs

**Job middleware** wraps `handle()` like route middleware wraps a request. The common case is **rate limiting**: a partner allows 60 calls a minute, so your jobs must not go faster.

```ts title="app/jobs/push-task-to-partner.ts"
import { Job, rateLimited } from '@strutvane/framework'

export class PushTaskToPartner extends Job<{ taskId: string }> {
  /** At most 60 runs per minute across all workers; extra jobs are released and retried later. */
  static middleware = [rateLimited('partner-api', { maxAttempts: 60, decaySeconds: 60 })]

  async handle(): Promise<void> {
    // call the partner's API
  }
}
```

**What you'll see:** with 500 jobs waiting, about 60 run each minute; the rest are put back with a delay, not failed.

## Running workers

### In development

`npm run dev` starts a worker for you (packages register extra processes, like Laravel's `composer run dev`), and restarts it when your code changes. You can also run one in its own terminal:

```bash
node strut queue:work
```

`queue:work` loads your code once and keeps it in memory, which is fast. While you're changing job code without `npm run dev`, use `queue:listen` instead: it picks up your latest code for every job, at the cost of speed.

```bash
node strut queue:listen
```

### In production

A worker is a **long-running process**. Run it next to your web server, under something that restarts it if it stops:

- **A VPS:** a process manager (systemd on Linux) with one service per worker.
- **Containers:** the same image as the web app, started with a different command (`node strut queue:work`), as its own service.
- **A PaaS:** a "worker" process type next to the "web" one.

After every deploy, tell the workers to pick up the new code:

```bash
node strut queue:restart
```

**What you'll see:** each worker finishes the job it's on, then exits; your process manager starts it again with the new code. No job is cut in half.

### Shutting down cleanly

When a worker is told to stop (Ctrl+C, a deploy, the container stopping), it **stops taking new jobs, finishes the current one**, then exits. If the current job is still running when the host's grace period runs out, the job is released back to the queue and runs again later, which is one more reason jobs must be safe to run twice.

### Keeping an eye on it

```bash
node strut queue:monitor default,mail --max=100
```

**What you'll see:** a warning (in the log, and as an event you can alert on) when a queue holds more than 100 waiting jobs, so you notice a stuck or too-slow worker before your users do. `@strutvane/queue-dashboard` shows throughput, waiting and failed jobs, and adds a health check for queue lag.

## With Docker or without Docker

- **With Docker,** workers run **inside the `app` container**, like everything else. `npm run dev` starts them there; `node strut queue:work` typed on your computer is forwarded into the container.
- **Without Docker,** the same commands run on your machine.
- **Log files:** each worker writes its own file in `storage/logs/` (`strutvane-worker-1.log`, `strutvane-worker-2.log`, …), so two processes never write to one file. `node strut log:tail` merges them by time. In production containers, workers log to `stderr` as JSON, like the web app.
- **Windows, macOS and Linux** behave the same. On Windows, stop a foreground worker with Ctrl+C; it still finishes the current job first.

## Testing code that dispatches jobs

In tests you rarely want jobs to really run. Swap the queue for a **fake** that only records what was pushed:

```ts title="tests/feature/users.test.ts"
import { describe, it } from 'vitest'
import { Queue } from '@strutvane/framework'
import { SendWelcomeMail } from '../../app/jobs/send-welcome-mail.ts'

describe('sign-up', () => {
  it('queues the welcome mail', async () => {
    const queue = Queue.fake()
    // …register a user through the API…
    queue.assertPushed(SendWelcomeMail)
  })
})
```

More fakes on [Mocking](../mocking/).

## Common mistakes

### My job ran, but the post it needs "doesn't exist"

```text
ModelNotFoundError: No post matches "01JD7Q…".
```

**Why:** you dispatched inside a transaction, and the worker ran the job before the transaction committed (or after it was rolled back).
**Fix:** dispatch with `afterCommit: true`:

```ts
await Queue.push(new NotifyFollowers({ postId }), { afterCommit: true })
```

### Jobs pile up and nothing happens

**Why:** no worker is running. Dispatching only writes the job down.
**Fix:** start one, and in production keep one running under a process manager:

```bash
node strut queue:work
```

### After a deploy, workers still run the old code

**Why:** a worker loads your code once when it starts and keeps it in memory.
**Fix:** restart workers as the last step of every deploy:

```bash
node strut queue:restart
```

### My job sees no data, or fails with `tenant_required`

**Why:** the job was dispatched outside a request (a script, a command) with no team in the context, so the tenant scope refuses to read tenant tables (error code `tenant_required`). This only applies when tenancy is on (`enabled: true` in `config/tenancy.ts`).
**Fix:** dispatch from inside the team's context (from a request, or a command that sets the team), or pass the team explicitly when your design allows it. Never work around the scope with raw SQL.

### Customers got the same email twice

**Why:** the job was retried after a timeout or a crash, and `handle()` isn't safe to run twice.
**Fix:** record what was done and check it first:

```ts
if (await alreadySent(this.payload.issueId, this.payload.userId)) return
await send()
await markSent(this.payload.issueId, this.payload.userId)
```

### I passed a model and got a plain object back

**Why:** the payload is stored as JSON; a `Post` instance can't survive that trip.
**Fix:** pass the id and load the model inside `handle()`:

```ts
await Queue.push(new PublishPost({ postId: post.id }))
```

## Next steps

- [Task Scheduling](../scheduling/): run jobs and commands on a timetable.
- [Events](../events/): queued listeners react to what happened.
- [Mail](../mail/): queue mail instead of sending it during the request.
- [@strutvane/queue-dashboard](../packages/queue-dashboard/): jobs, failures and retries in the browser.
