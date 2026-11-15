---
title: "Concurrency"
description: "Do several things at the same time: wait for many database or HTTP calls at once with plain promises, move CPU-heavy work to other threads with Concurrency.run(), and finish work after the response with defer()."
---

**Concurrency** means doing several things in overlapping time instead of one after the other. A dashboard that needs five numbers can ask for all five at once and wait about as long as the slowest one, instead of the sum of all five.

In a Strutvane app there are three tools for this, and picking the right one matters more than anything else on this page:

| You want to… | Use | Built? |
|---|---|---|
| wait for several **database queries or HTTP calls** at once | `Promise.all()` (plain JavaScript) | yes, it's part of the language |
| run **CPU-heavy** work (parsing a big file, crunching numbers) without freezing the app | `Concurrency.run([...])` on worker threads or processes | planned for 0.3 |
| do something **after the response** has been sent | `defer(fn)` | planned for 0.2 |
| do something **later, reliably, with retries** | a [queued job](../queues/) | planned for 0.3 |
| run **another program** | [`Process`](../processes/) | planned for 0.3 |

:::tip[Coming from Laravel?]
PHP runs one thing at a time per request, so Laravel needs `Concurrency::run()` (separate PHP processes) even to run two queries side by side. Node doesn't: while one query waits for the database, the same thread can start the next one, so **`Promise.all()` already covers most of what `Concurrency::run()` is used for in Laravel**.

`Concurrency.run([...])` is still planned, for the case Node can't do on one thread: heavy computation. It runs on worker threads or processes, with a `sync` driver for tests, like Laravel's. `defer()` is Laravel 11's `defer()`: work that runs after the response is sent.
:::

:::caution[Coming in 0.3]
`Concurrency.run()` is in **phase 2 of the roadmap (0.3)**: "on worker threads or processes, with a sync driver for tests" (Laravel parity checklist). `defer(fn)`, together with a `terminate()` hook for middleware, is planned for **0.2** ("errors are logged, never lost"). Neither is built yet.

**Planned API (a sketch: names may change).** How a task is handed to another thread is still open: JavaScript can't copy a function, together with the variables it uses, to another thread. The final API may require each task to live in its own file. The sections on `Promise.all()` work today in any Node program.
:::

## The smallest example

A stats endpoint needs three counts. Ask for all three at once:

```ts title="app/http/controllers/stats.controller.ts"
import type { HttpContext } from '@strutvane/framework'
import { Post } from '../../models/post.ts'
import { Tag } from '../../models/tag.ts'
import { User } from '../../models/user.ts'

export class StatsController {
  async show(ctx: HttpContext): Promise<Response> {
    const [posts, users, tags] = await Promise.all([
      Post.query().count(),
      User.query().count(),
      Tag.query().count(),
    ])
    return ctx.json({ posts, users, tags })
  }
}
```

**What you'll see:**

```json
{ "posts": 128, "users": 14, "tags": 9 }
```

If each count takes 30 ms, the response takes about 30 ms instead of 90 ms. `Promise.all()` starts all three queries, then waits until every one has answered, and gives you the answers **in the same order** you listed them.

## Why one thread is enough for waiting

Node runs your code on one **thread** (one line of execution). That sounds limiting, but most of a web request is **waiting**: for the database, for another API, for a file. While one query waits, Node is free to start the next one. That's why `Promise.all()` gives real speed-ups for database and HTTP work without any threads.

The work this does **not** help with is **CPU-bound** work: code that keeps the processor busy (resizing a big image in JavaScript, parsing a 200 MB CSV, hashing thousands of values). While it runs, that thread can do nothing else, so every other request on the server waits. That's what `Concurrency.run()` is for.

## When some of them fail

### `Promise.all()`: stop at the first failure

If one call fails, `Promise.all()` fails at once with that error. Use it when you need **every** answer:

```ts title="app/services/project-summary.ts"
import { Project } from '../models/project.ts'
import { Task } from '../models/task.ts'

export async function projectSummary(projectId: string) {
  const [project, openTasks] = await Promise.all([
    Project.findOrFail(projectId),                                   // throws if missing
    Task.query().where('project_id', projectId).where('status', 'open').count(),
  ])
  return { name: project.name, openTasks }
}
```

**What you'll see** for an unknown project: the `ModelNotFoundError` from `findOrFail`, which your app turns into a `404`, exactly as if you'd awaited the calls one by one. The other query still runs to the end in the background; its answer is thrown away.

### `Promise.allSettled()`: keep what worked

When each part is optional (a dashboard where one widget may fail), use `Promise.allSettled()`. It never fails; it tells you which parts worked:

```ts title="app/services/dashboard.ts"
import { Log } from '@strutvane/framework'
import { Post } from '../models/post.ts'
import { fetchPartnerStatus } from './partner.ts'

export async function dashboard() {
  const [posts, partner] = await Promise.allSettled([
    Post.query().where('status', 'published').count(),
    fetchPartnerStatus(),                       // another company's API: may be down
  ])
  if (partner.status === 'rejected') Log.warning('Partner status unavailable', { error: partner.reason })
  return {
    published: posts.status === 'fulfilled' ? posts.value : null,
    partner: partner.status === 'fulfilled' ? partner.value : 'unavailable',
  }
}
```

**What you'll see** when the partner API is down:

```json
{ "published": 128, "partner": "unavailable" }
```

The page still loads; only the partner widget shows "unavailable".

### Don't start thousands at once

`Promise.all()` over a list of 10,000 items starts 10,000 queries at the same moment. Your database has a limited number of connections, so most of them queue up, and the database may refuse new ones. Work in **chunks**:

```ts title="app/services/recalculate.ts"
import { recalculateProject } from './recalculate-project.ts'

/** At most 10 projects at a time. */
export async function recalculateAll(projectIds: readonly string[]): Promise<void> {
  for (let start = 0; start < projectIds.length; start += 10) {
    const chunk = projectIds.slice(start, start + 10)
    await Promise.all(chunk.map((id) => recalculateProject(id)))
  }
}
```

For really large amounts of work, push one [queued job](../queues/) per item (or a [batch](../queues/#batches-many-at-once-then-one-callback)) and let workers spread it out.

### Inside a transaction, one at a time

A [transaction](../orm-transactions/) runs on **one** database connection, and a connection runs one statement at a time. Inside `transaction()`, `await` each write in turn instead of using `Promise.all()`: the writes can't overlap anyway, and keeping them in order makes failures easy to follow.

## CPU-heavy work: `Concurrency.run()`

:::caution[Coming in 0.3]
**Planned API (a sketch: names may change before 0.3).** The parity checklist fixes the name `Concurrency.run([...])`, worker threads or processes, and a `sync` driver for tests. Everything else here (how tasks are written, the options, the error names) is a sketch.
:::

`Concurrency.run()` takes a list of tasks, runs each one on **another thread or process**, and returns their results in order. The main thread stays free to answer other requests while they work.

```ts title="app/services/import-preview.ts"
import { Concurrency } from '@strutvane/framework'
import { parseCsvChunk } from './parse-csv-chunk.ts'

/** Parses a large upload in four parts at once, on other threads. */
export async function previewImport(chunks: readonly [string, string, string, string]) {
  const [a, b, c, d] = await Concurrency.run([
    () => parseCsvChunk(chunks[0]),
    () => parseCsvChunk(chunks[1]),
    () => parseCsvChunk(chunks[2]),
    () => parseCsvChunk(chunks[3]),
  ])
  return [...a, ...b, ...c, ...d]
}
```

**What you'll see:** on a machine with four or more cores, about a quarter of the time it takes on one thread, and the app keeps answering other requests meanwhile.

### What can cross to another thread

A task runs in a separate JavaScript world. What goes in and what comes out is **copied**, with the same rules as Node's worker threads (the "structured clone" rules):

| Crosses fine | Doesn't cross |
|---|---|
| strings, numbers, booleans, `null`, `undefined` | functions |
| plain objects and arrays | class instances keep their data but lose their methods (a `Post` comes back as a plain object) |
| `Date`, `Map`, `Set`, `ArrayBuffer`, typed arrays | open database connections, sockets, file handles |

So: give tasks **plain data**, do **pure computation** (no database, no HTTP), and return plain data. Do the database work on the main thread before and after.

:::danger[No tenant queries inside a task]
Whether the request's context (the current team, the user, the request id) will be carried into another thread isn't decided yet. Without it, the tenant scope can't protect a query. Until the design says otherwise, **never query tenant tables inside a `Concurrency.run()` task**: load the team's rows first, pass them in, and compute.
:::

### Workers or processes

| Driver | Runs tasks on | Good for |
|---|---|---|
| threads (worker threads) | other threads in the same process; cheap to start | most CPU-heavy work |
| processes | separate Node processes | work that may crash or use a lot of memory, so it can't take the app down |
| `sync` | the main thread, one after the other | tests: deterministic and easy to debug |

### When a task throws

If a task throws, `Concurrency.run()` rejects with that error, like `Promise.all()`:

```ts title="app/services/import-preview.ts"
try {
  await previewImport(chunks)
} catch (error) {
  // e.g. "Row 1,204: expected 5 columns, got 4" thrown inside parseCsvChunk
}
```

**What you'll see:** the original error message from inside the task. If a thread or process dies outright (out of memory, a crash), you get an error that says so, something like:

```text
ConcurrencyError: A task's worker exited unexpectedly (code 134).
```

and the main app keeps running.

### In tests: the `sync` driver

In tests, run tasks on the main thread so they're deterministic and your debugger can step into them:

```ts title="tests/unit/import-preview.test.ts"
import { describe, expect, it } from 'vitest'
import { Concurrency } from '@strutvane/framework'
import { previewImport } from '../../app/services/import-preview.ts'

describe('previewImport', () => {
  it('parses every chunk', async () => {
    Concurrency.driver('sync')
    const rows = await previewImport(['a,1', 'b,2', 'c,3', 'd,4'])
    expect(rows).toHaveLength(4)
  })
})
```

## After the response: `defer()`

:::caution[Coming in 0.2]
**Planned API (a sketch: names may change before 0.2).** The parity checklist plans "`terminate()` hook + `defer(fn)`; errors are logged, never lost".
:::

Some work doesn't need to happen before the user sees the page, but is too small for a queue: recording that a post was viewed, warming a cache entry. `defer(fn)` runs it **right after the response has been sent**:

```ts title="app/http/controllers/post.controller.ts (excerpt)"
import { defer, type HttpContext } from '@strutvane/framework'
import { recordView } from '../../services/views.ts'

async show(ctx: HttpContext): Promise<Response> {
  const post = await this.visible(ctx)
  defer(() => recordView(post.id))          // runs after the response is on its way
  return ctx.json({ data: post })
}
```

**What you'll see:** the response arrives without waiting for `recordView`. If `recordView` throws, the error is **logged** (with the request id), never lost, and the user, who already has their page, is unaffected.

`defer()` is **not** a queue: there are no retries, and if the server stops right after the response, the deferred work may not run. Use a [queued job](../queues/) for anything that must happen.

## With Docker or without Docker

Everything on this page runs inside your app's own process (and, for `Concurrency.run()`, its threads or child processes), so it works the same with and without Docker. Two things to know:

- **Cores:** threads only help up to the number of CPU cores the app can use. Docker Desktop on Windows and macOS gives containers a share of your cores (set in Docker Desktop's resources settings); a production container may be limited too.
- **Memory:** each worker thread or process has its own memory. Four tasks that each load a 200 MB file need about 800 MB.

## Common mistakes

### `Promise.all()` made my page slower, not faster

**Why:** the calls were CPU-heavy, not waiting. On one thread they still run one after the other.
**Fix:** for computation, use `Concurrency.run()` (0.3) or a queued job. Keep `Promise.all()` for database and HTTP calls.

### The database refuses connections under load

```text
Error: Too many connections
```

**Why:** a `Promise.all()` over a long list started far more queries than the database allows at once.
**Fix:** work in chunks, or queue one job per item:

```ts
for (let start = 0; start < ids.length; start += 10) {
  await Promise.all(ids.slice(start, start + 10).map(recalculateProject))
}
```

### My object came back from a task without its methods

**Why:** data crossing to another thread is copied as plain data; class instances lose their methods.
**Fix:** return plain data from tasks, and turn it back into what you need on the main thread.

### A task can't see a variable from my file

**Why:** a task runs in a separate JavaScript world; it doesn't share the variables of the code that started it.
**Fix:** pass everything the task needs as plain arguments, and import helpers inside the task's own module.

### Work I deferred sometimes never happens

**Why:** `defer()` runs after the response in the same process, with no retries; a restart or crash right after the response skips it.
**Fix:** if it must happen, dispatch a [queued job](../queues/) instead.

## Next steps

- [Queues](../queues/): reliable background work with retries.
- [Processes](../processes/): run other programs safely.
- [Cache](../cache/): avoid recomputing in the first place.
- [ORM: Transactions](../orm-transactions/): why writes in a transaction run one at a time.
