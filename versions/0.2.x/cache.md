---
title: "Cache"
description: "Keep the result of slow work for a while so the next request is fast, with the memory and file stores, Cache.remember(), counters and the cache commands; plus the tags, locks, shared stores and per-team keys coming in 0.3."
---

A **cache** is a place to keep the answer to a slow question for a while, so the next person who asks gets it instantly. "How many published posts are there?" may take a database query; "the exchange rate from a partner API" may take a network call. You compute it once, keep it for, say, ten minutes, and serve the kept copy until it **expires** (runs out of time).

Strutvane's cache is part of the framework. Where the copies live is called the **store**. Two stores ship today: `memory` (inside the running process) and `file` (files in `storage/framework/cache`, shared by every process on the machine). Your code doesn't change when you switch.

:::tip[Coming from Laravel?]
It's Laravel's cache: `Cache::remember('key', $ttl, fn)` becomes `Cache.remember('key', ttl, fn)`, `config/cache.php` becomes `config/cache.ts` with a `default` store and `stores`, and `php artisan cache:clear` becomes `node strut cache:clear`.

What's different:
- `Cache` is a **facade** in Strutvane's sense: a typed static accessor (from `@strutvane/framework/facades`) that resolves from the current application's container, so tests can swap it.
- Times are always **seconds**, as a number.
- The database and Redis stores, tags, locks, `flexible` and `memo` aren't there yet; they arrive in 0.3.
:::

:::caution[What exists, and when]
`@strutvane/framework` 0.2.0-next.0 (not published to npm yet) ships the `memory` and `file` stores, `config/cache.ts`, the `Cache` facade (`get`, `has`, `put`, `add`, `increment`, `decrement`, `pull`, `forget`, `flush`, `remember`, `rememberForever`, `store`) and the `cache:clear` and `cache:forget` commands. Everything in the sections marked **Coming in 0.3** is designed, not built.
:::

## The smallest example

Count the published posts, but only ask the database once every ten minutes:

```ts title="app/http/controllers/stats.controller.ts"
import { Controller, type HttpContext } from '@strutvane/framework'
import { Cache } from '@strutvane/framework/facades'
import { Post } from '../../models/post.ts'

export class StatsController extends Controller {
  async show(ctx: HttpContext): Promise<Response> {
    const published = await Cache.remember('posts.published-count', 600, () =>
      Post.query().where('status', 'published').count(),
    )
    return ctx.json({ published })
  }
}
```

**What you'll see:** the first request runs the query and answers in, say, 40 ms:

```json
{ "published": 128 }
```

Every request in the next 600 seconds (10 minutes) answers the same number in about a millisecond, without touching the `posts` table. After 10 minutes the copy expires, and the next request runs the query again.

`remember` does three things in one call: look for the key, and if it's missing (a **cache miss**), run your function, store its result, and return it. When the key is there (a **cache hit**), your function doesn't run at all.

## Choosing a store

Without a `config/cache.ts`, the app uses the `memory` store. Add the file to pick another default:

```ts title="config/cache.ts"
import { defineConfig } from '@strutvane/framework'

export default defineConfig((env) => ({
  default: env.string('CACHE_STORE', 'file'),
  stores: {
    file: { driver: 'file' },
    reports: { driver: 'file', path: 'storage/framework/cache-reports' },
  },
}))
```

List it in `config/index.ts` (`export const config = { app, cache }`) so the app reads it. Every app always has a `memory` and a `file` store; `stores` adds more, or changes their settings.

| Driver | Where the copies live | Shared by | Good for |
|---|---|---|---|
| `memory` | inside the running process | that one process | tests, and values that may differ per process |
| `file` | one JSON file per key in `storage/framework/cache` (or `path`) | every process on the same machine | one server, including rate-limit counts |

The `file` store names each file by a hash of its key (so no key can become a path), writes atomically, and locks a key while `add` or `increment` runs, so two processes counting the same thing never lose a count. A damaged or hand-edited file counts as a miss.

**What you'll see** with an unknown driver: the cache refuses to load the first time it's used (a command exits with code 3).

```text
error The "redis" cache store uses the driver "redis", which doesn't exist.
  → Use "memory" or "file". Database and Redis stores come in 0.3 (@strutvane/redis).
```

## Reading and writing

These are the everyday calls. All of them are `async`, and every time is in **seconds**.

```ts title="app/services/exchange-rates.ts"
import { Cache } from '@strutvane/framework/facades'

// Store a value for 1 hour (3,600 seconds). Without a time, it never expires.
await Cache.put('rates.eur-usd', 1.0842, 3600)

// Read it. A missing or expired key gives undefined.
const rate = await Cache.get('rates.eur-usd')           // → 1.0842 (typed unknown)

// Is it there?
const known = await Cache.has('rates.eur-usd')          // → true

// Read and delete in one go.
const once = await Cache.pull('rates.eur-usd')          // → 1.0842, and the key is gone

// Delete one key. true when it was there.
await Cache.forget('rates.eur-usd')                     // → false (already pulled)
```

**What you'll see:** the values in the comments. `get` returns `unknown`, so check or cast what you read. Store plain data (numbers, strings, arrays, objects): the `file` store keeps values as JSON, so class instances and functions don't survive it.

### `remember`: the one you'll use most

Use `remember` whenever "compute it, then keep it" is what you want. It's shorter than `get` + `put`, and it can't forget to store the result.

```ts title="app/services/post-stats.ts"
import { Cache } from '@strutvane/framework/facades'
import { Post } from '../models/post.ts'

/** The five newest published posts, refreshed every 5 minutes. */
export function topPosts() {
  return Cache.remember('posts.top-5', 300, async () => {
    const posts = await Post.query().where('status', 'published').orderBy('created_at', 'desc').limit(5).get()
    // Keep only what the page needs: smaller entries, and no hidden columns in the cache.
    return posts.map((post) => ({ title: post.title, slug: post.slug }))
  })
}
```

**What you'll see:**

```json
[
  { "title": "Hello world", "slug": "hello-world" },
  { "title": "Release notes", "slug": "release-notes" }
]
```

`remember` returns whatever type your function returns. A function that returns `undefined` isn't cached, so it runs again next time.

### Keeping a value until you remove it

`rememberForever` keeps a value with no expiry (Laravel's `rememberForever`; `put` without a time does the same). Use it for things that only change when you change them, and `forget` them when you do.

```ts title="app/services/settings.ts"
import { Cache } from '@strutvane/framework/facades'

export function bannerText() {
  return Cache.rememberForever('settings.homepage-banner', () => 'Spring sale: 20% off')
}

// …later, when an admin edits the banner:
await Cache.forget('settings.homepage-banner')
```

### Counters and "only if missing"

```ts title="app/services/downloads.ts"
import { Cache } from '@strutvane/framework/facades'

// Count downloads today; the counter expires after a day.
const count = await Cache.increment('downloads.today', 1, 86_400)   // → 1, then 2, 3…
await Cache.decrement('downloads.today')                            // → one less

// Store only when the key isn't there yet. true when it was stored.
const first = await Cache.add('welcome-mail.sent.42', true, 3600)  // → true the first time, then false
```

**What you'll see:** the numbers in the comments. A counter keeps the expiry it got when it was created (a **fixed window**), which is how the `throttle` middleware counts requests. `add` is the building block for "do this once per hour".

### Choosing a different store for one call

Every method above uses the default store. Pick another one per call with `store(name)`:

```ts title="app/services/report-cache.ts"
import { Cache } from '@strutvane/framework/facades'

const store = Cache.store('reports')
await store.put('reports.monthly', { total: 1200 }, 86_400)
const report = await store.get('reports.monthly')
```

A store has `get`, `has`, `put`, `add`, `increment`, `ttl`, `forget` and `flush`. An unknown name throws `unknown_cache_store`, with a "Did you mean" hint.

## Clearing the cache from the command line

```bash
node strut cache:clear                    # everything in the default store
node strut cache:clear --store=reports    # one store
node strut cache:forget posts.top-5       # one key
```

**What you'll see:**

```text
✔ Application cache cleared (the "file" store).
✔ Removed "posts.top-5" from the "file" store.
```

`cache:clear` also resets rate-limit counts, so outside `local`, `test`, `testing` and `development` it needs `--force --i-understand`. Clearing the `memory` store from a command only empties the command's own process; restart the app to empty it there. `cache:clear` is separate from `node strut optimize:clear`, which removes the bootstrap caches (config, routes, events). See [Optimization](../optimization/).

## When things go wrong

| What happens | What you see | What to do |
|---|---|---|
| The key is missing or expired | `get` returns `undefined`; `remember` runs your function | Nothing: that's normal |
| Your `remember` function throws | The error reaches your code; **nothing is stored**, so the next call tries again | Handle the error like any other; don't cache failures by accident |
| Two requests miss at the same moment | Both may run the function (a "stampede") | Fine for cheap work; locks arrive in 0.3 |
| A cache file is damaged | A miss, never a crash | Nothing: the next `put` replaces it |

Treat the cache as a speed-up and never as the only copy of anything: if the cache is emptied, your app must still work, just slower.

## Coming in 0.3

:::caution[Coming in 0.3]
The cache's second half is in **phase 2 of the roadmap (0.3, "background work")**, together with queues, the scheduler and `@strutvane/redis`. The sections below are the design (catalogue F16 and the Laravel parity checklist). **Planned API: names may change before 0.3**, and each "What you'll see" is "something like this".
:::

### Shared stores: database and Redis

A `database` store (a `cache` table, no extra service) and a Redis or Valkey store from `@strutvane/redis` will share the cache between **servers**, so rate limits and locks hold across a whole cluster. The installer's question 18 ("Cache, queue and sessions") will pick one, and `node strut install:redis` will set `CACHE_STORE=redis` and `REDIS_URL`.

### Every key is per team

When your app has **teams** (`config/tenancy.ts` has `enabled: true`; see [Tenancy](../tenancy/)), the cache will add the current team's id to every key for you, so Alice in team **Acme** and Bob in team **Globex** calling `Cache.remember('posts.published-count', …)` get **two separate entries**:

```text
team:7:posts.published-count    → 128   (Acme's posts)
team:9:posts.published-count    → 3     (Globex's posts)
```

Until then, **put the team in the key yourself** whenever the value depends on it, as in the [common mistakes](#alice-sees-a-number-that-belongs-to-another-team) below.

### Tags: forgetting a group of keys at once

A **tag** is a label you put on cache entries so you can delete all of them together:

```ts title="app/services/post-stats.ts"
import { Cache } from '@strutvane/framework/facades'
import { Post } from '../models/post.ts'

// Planned API, not in 0.2.0-next.0.
export function publishedCount() {
  return Cache.tags(['posts']).remember('published-count', 600, () =>
    Post.query().where('status', 'published').count(),
  )
}

// after a post is published:
await Cache.tags(['posts']).flush()
```

### Locks: only one at a time

A **lock** is a "this is mine for now" flag in the cache, so that two servers (or two requests) don't do the same work at the same moment, such as generating a monthly invoice once:

```ts title="app/services/monthly-report.ts"
import { Cache } from '@strutvane/framework/facades'
import { buildMonthlyReport } from './build-monthly-report.ts'

// Planned API, not in 0.2.0-next.0.
export async function refreshMonthlyReport(): Promise<'done' | 'busy'> {
  const lock = Cache.lock('reports.monthly', 120)   // freed after 120 s even if this process crashes
  if (!(await lock.get())) return 'busy'
  try {
    await buildMonthlyReport()
    return 'done'
  } finally {
    await lock.release()
  }
}
```

`block(seconds, work)` will wait for a lock instead of giving up. Locks need a store every server shares, so they come with the database and Redis stores. Until then, `Cache.add(key, true, seconds)` on the `file` store is a lock for the processes of one machine.

### Stale-while-revalidate and per-request memory

`Cache.flexible('key', [60, 300], fn)` will serve a stale value instantly while it refreshes in the background, and `Cache.memo()` will keep what one request read in memory for the rest of that request.

## With Docker or without Docker

- **`memory` and `file` stores:** work the same everywhere. With Docker, `storage/framework/cache` is in your project folder, shared with the `app` container.
- **Commands** like `node strut cache:clear` run inside the app container in Docker mode; you type them the same way.
- **Several servers:** each server has its own `file` store until the shared stores arrive in 0.3.

## Common mistakes

### Alice sees a number that belongs to another team

**Why:** the automatic team prefix arrives in 0.3, and the key you used doesn't say which team (or which user) the answer is for.
**Fix:** put everything the answer depends on in the key, or don't cache it:

```ts title="app/services/my-drafts.ts"
import { Cache } from '@strutvane/framework/facades'
import { Post } from '../models/post.ts'

export function draftCount(teamId: string, userId: string) {
  return Cache.remember(`team-${teamId}.posts.draft-count.user-${userId}`, 60, () =>
    Post.query().where('status', 'draft').where('author_id', userId).count(),
  )
}
```

### My change doesn't show up

**Why:** the old value is still cached until it expires.
**Fix:** forget the key right after you change the data:

```ts title="app/http/controllers/post.controller.ts"
import { Cache } from '@strutvane/framework/facades'

// after post.save() succeeded:
await Cache.forget('posts.top-5')
```

Or, from the terminal, `node strut cache:forget posts.top-5`.

### I get a plain object back instead of my model

**Why:** the `file` store keeps values as JSON, so a `Post` instance comes back as plain data, without methods. (The `memory` store keeps the object itself, which hides the problem until you switch.)
**Fix:** cache the plain fields you need, and load models fresh when you need to change them, as in the `topPosts()` example above.

### Rate limits are higher than I configured

**Why:** the default `memory` store counts inside each process, so several processes each count on their own.
**Fix:** make `file` the default store (all processes on one machine share it). Across several servers, wait for the shared stores in 0.3.

### "There is no "redis" cache store"

```text
error There is no "redis" cache store.
  → The stores are: file, memory (config/cache.ts).
```

**Why:** `--store` (or `Cache.store()`) named a store that isn't configured.
**Fix:** use one of the names listed, or add the store to `config/cache.ts`.

### I cached an API token "to save a lookup"

**Why:** the cache is not a secrets vault. The `file` store is readable by anyone with access to the server's disk, and it isn't encrypted.
**Fix:** keep secrets in `.env` or in encrypted columns ([Encryption](../encryption/)), never in the cache.

## Next steps

- [Rate Limiting](../rate-limiting/): the `throttle` middleware counts in this cache.
- [Optimization](../optimization/): the bootstrap caches, which are a different thing.
- [Tenancy](../tenancy/): how teams keep each customer's data apart.
- [@strutvane/redis](../packages/redis/): the Redis and Valkey store, coming in 0.3.
