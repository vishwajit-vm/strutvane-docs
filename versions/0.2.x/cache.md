---
title: "Cache"
description: "Keep the result of slow work for a while so the next request is fast, with stores you can swap, tags, locks, stale-while-revalidate and per-request memoisation, always separated per team."
---

A **cache** is a place to keep the answer to a slow question for a while, so the next person who asks gets it instantly. "How many published posts are there?" may take a database query; "the exchange rate from a partner API" may take a network call. You compute it once, keep it for, say, ten minutes, and serve the kept copy until it **expires** (runs out of time).

Strutvane's cache is part of the framework. Where the copies live is called the **store**: the `database` store (a `cache` table, no extra service) is the default, and `@strutvane/redis` adds a Redis or Valkey store. Your code doesn't change when you switch.

:::tip[Coming from Laravel?]
It's Laravel's cache: `Cache::remember('key', $ttl, fn)` becomes `Cache.remember('key', ttl, fn)`, `Cache::tags([...])`, `Cache::lock()`, `Cache::flexible()` and `Cache::memo()` all have a home, and `php artisan cache:clear` becomes `node strut cache:clear`.

What's different:
- **Every key is prefixed with the current team (tenant) automatically**, and you can't turn that off by accident, so one customer can never read another customer's cached numbers.
- `Cache` is a **typed accessor** resolved from the container, not a facade with `__callStatic` magic, and you can swap it in tests.
- The default store is `database`, so a new app needs no Redis.
:::

:::caution[Coming in 0.3]
The cache is in **phase 2 of the roadmap (0.3, "background work")**, together with queues, the scheduler and `@strutvane/redis`. What exists today is the design: the commands (`cache:clear`, `cache:forget`), the installer question that picks the store, the tagged and tenant-prefixed cache (catalogue F16), stale-while-revalidate (`flexible`) and per-request memoisation (`memo`), all listed in the Laravel parity checklist.

**Planned API (a sketch: names may change before 0.3).** The code on this page follows Laravel's names, which is the stated goal. The exact method names, the time unit and the error texts are not final. Each "What you'll see" is "something like this".
:::

## The smallest example

Count the published posts, but only ask the database once every ten minutes:

```ts title="app/http/controllers/stats.controller.ts"
import { Cache } from '@strutvane/framework'
import type { HttpContext } from '@strutvane/framework'
import { Post } from '../../models/post.ts'

export class StatsController {
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

The installer asks about the store in question 18:

| # | Question | Choices (default **bold**) | What it writes |
|---|---|---|---|
| 18 | Cache, queue and sessions | **database (no extra service)**, Redis | `config/cache.ts` with `store`, `queue` and `sessions`; Redis also adds `@strutvane/redis` |

A new app gets a small `config/cache.ts` that records your answer:

```ts title="config/cache.ts"
// Cache, queue and sessions. "database" needs no extra service; "redis" needs REDIS_URL in .env.
export default {
  store: 'database',
  queue: 'database',
  sessions: 'database',
}
```

| Store | Where the copies live | Good for | Needs |
|---|---|---|---|
| `database` | a `cache` table in your app's database | most apps, one or a few servers | nothing extra |
| `redis` | Redis or Valkey | many servers, lots of cache traffic, locks under load | `@strutvane/redis`, `REDIS_URL` |

The `cache` table is an **internal table**: it never gets an automatic API or admin screen, like `sessions` and `jobs`.

### Switching to Redis later

```bash
node strut install:redis
```

**What you'll see** (something like this):

```text
  ✔ Installed @strutvane/redis
  ✔ Wrote config/redis.ts
  ✔ .env: CACHE_STORE=redis, QUEUE_CONNECTION=redis, REDIS_URL=redis://127.0.0.1:6379
  ✔ Docker: added a valkey service to docker/compose.yaml
```

The installer sets `CACHE_STORE`, `QUEUE_CONNECTION` and `REDIS_URL` in `.env` (and their names, without values, in `.env.example`). Nothing in your code changes: `Cache.remember()` now talks to Redis.

:::note[Why the store is shared]
The cache must be **shared** by every server running your app. The sign-in rate limits are a good example: they count attempts in the shared cache. If each server kept its own counts, three servers would allow three times as many password guesses. That's why there is no "memory" store for production.
:::

## Reading and writing

These are the everyday calls. All of them are `async`.

```ts title="app/services/exchange-rates.ts"
import { Cache } from '@strutvane/framework'

// Store a value for 1 hour (3,600 seconds).
await Cache.put('rates.eur-usd', 1.0842, 3600)

// Read it. A missing or expired key gives undefined.
const rate = await Cache.get<number>('rates.eur-usd')        // → 1.0842

// Read with a fallback value for a miss.
const fallback = await Cache.get('rates.gbp-usd', 1.27)       // → 1.27

// Is it there?
const known = await Cache.has('rates.eur-usd')                // → true

// Delete one key.
await Cache.forget('rates.eur-usd')
```

**What you'll see:** the values in the comments. A value goes in as JSON and comes back as JSON, so store plain data (numbers, strings, arrays, objects), not class instances or functions.

### `remember`: the one you'll use most

Use `remember` whenever "compute it, then keep it" is what you want. It's shorter than `get` + `put`, and it can't forget to store the result.

```ts title="app/services/post-stats.ts"
import { Cache } from '@strutvane/framework'
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

### Keeping a value until you remove it

`forever` keeps a value with no expiry. Use it for things that only change when you change them, and remember to `forget` them when you do.

```ts title="app/services/settings.ts"
import { Cache } from '@strutvane/framework'

await Cache.forever('settings.homepage-banner', 'Spring sale: 20% off')
// …later, when an admin edits the banner:
await Cache.forget('settings.homepage-banner')
```

## Every key is per team

When your app has **teams** (each customer company is a team; see [Tenancy](../tenancy/)), the cache adds the current team's id to every key for you. Alice in team **Acme** and Bob in team **Globex** can both call `Cache.remember('posts.published-count', …)`, and they get **two separate entries**:

```text
team:7:posts.published-count    → 128   (Acme's posts)
team:9:posts.published-count    → 3     (Globex's posts)
```

You never write the prefix yourself, and there's no option to leave it out by mistake (catalogue F16: "the tenant prefix is automatic and impossible to omit"). Why: a cached number is data. If the key weren't per team, Globex could see Acme's count on its dashboard, a data leak that no policy would catch, because the database was never asked.

:::danger[Per user, too, when the answer depends on who asks]
The team prefix keeps customers apart. It does **not** keep two users of the same team apart. If the answer depends on what the user may see (Alice sees her drafts, Bob doesn't), put that in the key, or don't cache it.

```ts title="app/services/my-drafts.ts"
import { Cache } from '@strutvane/framework'
import { Post } from '../models/post.ts'

export function draftCount(userId: string) {
  // The user id is part of the key, so Bob never gets Alice's number.
  return Cache.remember(`posts.draft-count.user-${userId}`, 60, () =>
    Post.query().where('status', 'draft').where('author_id', userId).count(),
  )
}
```

The charts in `@strutvane/charts` follow the same rule: their cache key holds the team **and** a fingerprint of the user's policy filter, so two users with different permissions never share a cached chart.
:::

Whether there will be an explicit way to share one entry across every team (for truly global data, like an exchange rate) isn't decided yet. Until it is, a global value is cached once per team, which is safe and only costs a little memory.

## Tags: forgetting a group of keys at once

A **tag** is a label you put on cache entries so you can delete all of them together. Tag every post-related entry with `posts`, and when a post changes you flush the tag instead of remembering every key you ever used.

```ts title="app/services/post-stats.ts"
import { Cache } from '@strutvane/framework'
import { Post } from '../models/post.ts'

export function publishedCount() {
  return Cache.tags(['posts']).remember('published-count', 600, () =>
    Post.query().where('status', 'published').count(),
  )
}

export function countByAuthor(authorId: string) {
  return Cache.tags(['posts', 'authors']).remember(`count-by-author.${authorId}`, 600, () =>
    Post.query().where('author_id', authorId).count(),
  )
}
```

When a post is published, forget everything tagged `posts`:

```ts title="app/http/controllers/post.controller.ts"
import { Cache } from '@strutvane/framework'

// after post.save() succeeded:
await Cache.tags(['posts']).flush()
```

**What you'll see:** the next call to `publishedCount()` or `countByAuthor()` runs its query again. Entries tagged only `authors` are kept.

Tags are per team too: flushing `posts` in Acme doesn't empty Globex's cache.

:::tip[Let the framework flush for you]
The framework plans a **`model.changed`** event (catalogue F8), sent after every committed change with the table name. Packages like charts use it to flush their table tag automatically. You can do the same in a listener; see [Events](../events/).
:::

## Locks: only one at a time

A **lock** is a "this is mine for now" flag in the cache, so that two servers (or two requests) don't do the same work at the same moment. Typical uses: generating a monthly invoice once, refreshing an expensive report, importing a file.

```ts title="app/services/monthly-report.ts"
import { Cache } from '@strutvane/framework'
import { buildMonthlyReport } from './build-monthly-report.ts'

export async function refreshMonthlyReport(): Promise<'done' | 'busy'> {
  // Hold the lock for at most 120 seconds, even if this process crashes.
  const lock = Cache.lock('reports.monthly', 120)
  if (!(await lock.get())) return 'busy'   // someone else is already doing it
  try {
    await buildMonthlyReport()
    return 'done'
  } finally {
    await lock.release()                   // always give it back
  }
}
```

**What you'll see:** the first caller gets `'done'`. A second caller while the first is still working gets `'busy'` straight away, without building the report twice.

The number (120) is the lock's **lifetime**. If the process holding it crashes, the lock frees itself after that many seconds, so a crash can never block the work forever. Pick a lifetime longer than the work normally takes.

### Waiting for a lock instead of giving up

Sometimes the second caller should wait its turn. `block(seconds)` waits up to that long:

```ts title="app/services/stock.ts"
import { Cache } from '@strutvane/framework'

export async function reserveStock(sku: string, quantity: number): Promise<void> {
  await Cache.lock(`stock.${sku}`, 10).block(5, async () => {
    // Only one reservation for this SKU runs at a time.
    await decrementStock(sku, quantity)
  })
}

async function decrementStock(sku: string, quantity: number): Promise<void> {
  // your database update here
}
```

**What you'll see:** concurrent reservations for the same SKU run one after the other. If the lock is still taken after 5 seconds, `block` gives up with an error, something like this:

```text
LockTimeoutError: Could not acquire the lock "stock.ABC-123" within 5 seconds.
```

Your code (or the [queue](../queues/), if this runs in a job) can then retry later.

:::note[Locks need a shared store]
A lock only works if every server asks the **same** store. Both `database` and `redis` are shared. With Redis, locks are cheaper under heavy contention.
:::

## Stale-while-revalidate: `flexible`

With `remember`, the request that arrives just after the entry expires pays the full price of recomputing it. **Stale-while-revalidate** avoids that: for a while after the value goes **stale** (old but still usable), callers get the old value instantly, and the framework refreshes it in the background.

```ts title="app/services/dashboard.ts"
import { Cache } from '@strutvane/framework'
import { Post } from '../models/post.ts'

export function publishedCount() {
  // Fresh for 60 s. From 60 s to 300 s: serve the old value, refresh in the background.
  // After 300 s: recompute before answering, like remember().
  return Cache.flexible('posts.published-count', [60, 300], () =>
    Post.query().where('status', 'published').count(),
  )
}
```

| Age of the entry | What the caller gets | What happens behind |
|---|---|---|
| 0–60 s | the cached value | nothing |
| 60–300 s | the cached (stale) value, instantly | one background refresh |
| over 300 s, or missing | the new value | computed now |

**What you'll see:** dashboards stay fast even right after the entry goes stale. Use it for numbers where "a few minutes old" is fine.

## Per-request memory: `memo`

Inside one request, the same cache key may be read many times (a layout, a policy and a controller all asking for the same setting). `memo` keeps what it read **in memory for the rest of this request**, so the store is asked once.

```ts title="app/services/settings.ts"
import { Cache } from '@strutvane/framework'

export async function bannerText(): Promise<string | undefined> {
  // The first call in this request asks the store; later calls in the same request don't.
  return Cache.memo().get<string>('settings.homepage-banner')
}
```

**What you'll see:** one store read per request, however often `bannerText()` is called. The memory is thrown away when the request ends, so the next request sees changes.

## Choosing a different store for one call

When you have more than one store configured, pick one per call:

```ts title="app/services/sessions-report.ts"
import { Cache } from '@strutvane/framework'

const value = await Cache.store('redis').get('reports.active-sessions')
```

## Clearing the cache from the command line

```bash
node strut cache:clear                 # everything in the default store
node strut cache:clear --store=redis   # one store
node strut cache:forget posts.top-5    # one key
```

**What you'll see** (something like this):

```text
  ✔ Application cache cleared (store: database).
```

`cache:clear` is also part of `node strut optimize:clear`, which clears every production cache in one go (config, routes, events, the application cache). See [CLI Reference](../cli-reference/).

## When things go wrong

| What happens | What you see | What to do |
|---|---|---|
| The key is missing or expired | `get` returns `undefined` (or your default); `remember` runs your function | Nothing: that's normal |
| Your `remember` function throws | The error reaches your code; **nothing is stored**, so the next call tries again | Handle the error like any other; don't cache failures by accident |
| Two requests miss at the same moment | Both may run the function (a "stampede") | Use `flexible`, or a `lock` around expensive work |
| The lock is taken | `lock.get()` returns `false`; `block()` waits, then errors | Skip, wait, or retry later |
| Redis is unreachable | Something like `CacheStoreError: The "redis" cache store is unreachable (REDIS_URL).` | Check `REDIS_URL` and that Redis is running |

What exactly happens when the store is down isn't decided yet. The framework's rule is **fail closed, with a friendly error**, so expect the call to throw rather than quietly skip the cache. Treat the cache as a speed-up and never as the only copy of anything: if the cache is emptied, your app must still work, just slower.

## With Docker or without Docker

- **`database` store:** works the same everywhere. The `cache` table lives in your app's database (MySQL, PostgreSQL or SQLite).
- **Redis, with Docker:** `node strut install:redis` adds a Valkey service to your local `docker/compose.yaml`, and `REDIS_URL` points at it. `node strut services:up` starts it with the rest.
- **Redis, without Docker:** you run Redis or Valkey yourself and put its address in `REDIS_URL`. **macOS:** a package manager such as Homebrew. **Linux:** your distribution's package. **Windows:** the simplest way is Docker or WSL2.
- **Commands** like `node strut cache:clear` run inside the app container in Docker mode; you type them the same way.

## Common mistakes

### Alice sees a number that belongs to Bob

**Why:** the team prefix keeps **teams** apart, not users. A value that depends on the user was cached under a key without the user in it.
**Fix:** put the user (or anything else the answer depends on) in the key, or don't cache it:

```ts
Cache.remember(`posts.draft-count.user-${user.id}`, 60, () => countDrafts(user.id))
```

### My change doesn't show up

**Why:** the old value is still cached until it expires.
**Fix:** forget the key (or flush its tag) right after you change the data:

```ts
await post.save()
await Cache.tags(['posts']).flush()
```

Or, from the terminal, `node strut cache:forget posts.top-5`.

### I get a plain object back instead of my model

**Why:** cache values are stored as JSON, so a `Post` instance comes back as plain data, without methods.
**Fix:** cache the plain fields you need, and load models fresh when you need to change them:

```ts
return Cache.remember('posts.top-5', 300, async () =>
  (await Post.query().limit(5).get()).map((post) => ({ title: post.title, slug: post.slug })),
)
```

### Rate limits are higher than I configured

**Why:** you're running several servers, each with its own non-shared store, so each counts on its own.
**Fix:** use a shared store (`database` or `redis`) on every server, all pointing at the same database or Redis.

### `cache:clear` didn't clear Redis

**Why:** without `--store`, the command clears the **default** store, which may still be `database`.
**Fix:**

```bash
node strut cache:clear --store=redis
```

### I cached an API token "to save a lookup"

**Why:** the cache is not a secrets vault. It's readable by anyone with database or Redis access, and it isn't encrypted.
**Fix:** keep secrets in `.env` or in encrypted columns ([Encryption](../encryption/)), never in the cache.

## Next steps

- [Queues](../queues/): move slow work out of the request entirely.
- [Events](../events/): flush cache tags when data changes.
- [Tenancy](../tenancy/): how teams keep each customer's data apart.
- [@strutvane/redis](../packages/redis/): the Redis and Valkey store.
