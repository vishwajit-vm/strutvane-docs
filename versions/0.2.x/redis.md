---
title: "Redis"
description: "Use Redis or Valkey for your app's cache, queues, locks, sessions and rate limits: when you need it, installing @strutvane/redis, connecting with REDIS_URL, running it with Docker or on your own server, and what happens when it goes down."
---

**Redis** is a very fast in-memory data store: it keeps small pieces of data in RAM and answers in well under a millisecond. **Valkey** is its open-source twin (a community fork of Redis that speaks the same protocol), so everything on this page works with either. Apps use Redis for the things that must be fast and shared between servers: the [cache](../cache/), [queues](../queues/), locks, sessions and [rate limits](../rate-limiting/).

You **don't need Redis to start**. A new Strutvane app keeps all of those in its database (installer question 18, "Cache, queue and sessions": **database**, the default). Add Redis when you outgrow that: many servers, lots of queued jobs, or a cache that's hit thousands of times a second.

:::tip[Coming from Laravel?]
It's Laravel's Redis support as an installable package: `config/database.php`'s `redis` block becomes `config/redis.ts`, `REDIS_URL` works the same, and `CACHE_STORE=redis`, `QUEUE_CONNECTION=redis` and sessions on Redis keep their names. `Redis::get()` becomes a typed connection from the container.

What's different:
- It's a package, `@strutvane/redis`, so apps that don't need Redis install nothing.
- Queues on Redis use **BullMQ** underneath (where Laravel has its own Redis queue; Horizon's role goes to `@strutvane/queue-dashboard`).
- Cache keys are always **prefixed with the team**, so one customer's cached data can never be read by another.
:::

:::caution[Coming in 0.3]
`@strutvane/redis` is planned for **phase 2 of the roadmap (0.3, "background work")**, with the cache, queues and the scheduler. Nothing on this page is built or proven in a prototype. What's decided (package catalogue): `node strut install:redis`, the `.env` keys `CACHE_STORE`, `QUEUE_CONNECTION` and `REDIS_URL`, a Valkey service in the local Docker setup, `config/redis.ts`, TLS and passwords from the environment, tenant-prefixed cache keys, a health check, and drivers for cache, queues (BullMQ), locks, sessions, rate limits and broadcasting.

**Planned API (a sketch: names may change before 0.3).** The config shape, the command output and the error texts below are "something like this".
:::

## The smallest example

Add Redis to an existing app:

```bash
node strut install:redis
```

**What you'll see** (something like this):

```text
  ✔ Installed @strutvane/redis
  ✔ Wrote config/redis.ts
  ✔ Docker: added a valkey service to docker/compose.yaml (port 6379)
  ✔ .env: CACHE_STORE=redis, QUEUE_CONNECTION=redis, REDIS_URL=redis://127.0.0.1:6379
  ✔ .env.example: CACHE_STORE, QUEUE_CONNECTION, REDIS_URL (no values)
  → Start it: node strut services:up
```

Start the services and check:

```bash
node strut services:up
node strut about
```

**What you'll see** in `about`, among the other lines:

```text
  Cache ............................................ redis
  Queue ............................................ redis
  Redis ............................. redis://127.0.0.1:6379 (connected)
```

Your code doesn't change: `Cache.remember()` and `Queue.push()` now talk to Redis.

You can also pick Redis when you create the app, by answering **Redis** to question 18; the installer then does all of this for you.

## When should you use Redis?

| Situation | Database (default) | Redis |
|---|---|---|
| One server, modest traffic | ✔ simplest, no extra service | not needed |
| Several app servers | works (the database is shared) | ✔ faster, takes load off the database |
| Thousands of cache reads a second | the database becomes busy | ✔ |
| Many queued jobs, many workers | works, but polling adds database load | ✔ BullMQ, pushes jobs to workers |
| Locks under heavy contention | works | ✔ |
| You can't run another service | ✔ | — |

Rate limits and lockouts already work across servers with the database store (they use the shared cache store, never memory). Redis makes them cheaper, not more correct.

## What Redis is used for

`@strutvane/redis` registers one **driver** for each of these. You choose which ones use Redis:

| Feature | `.env` key | Values |
|---|---|---|
| Cache (and rate limits, lockouts, cache locks) | `CACHE_STORE` | `database`, `redis` |
| Queues | `QUEUE_CONNECTION` | `database`, `redis` |
| Sessions | (in `config/cache.ts`, `sessions`) | `database`, `redis` |
| Broadcasting (coming after 1.0) | with `@strutvane/realtime` | `redis` to share messages between WebSocket servers |

A typical split: cache and queues on Redis, sessions in the database (so a Redis restart never signs anyone out).

```ts title="config/cache.ts"
// Cache, queue and sessions. "database" needs no extra service; "redis" needs REDIS_URL in .env.
export default {
  store: 'redis',
  queue: 'redis',
  sessions: 'database',
}
```

## Connecting: `REDIS_URL`

One URL holds everything:

```ini title=".env"
REDIS_URL=redis://127.0.0.1:6379
```

| URL | Meaning |
|---|---|
| `redis://127.0.0.1:6379` | local, no password |
| `redis://:s3cret@redis.internal:6379` | with a password (no user name) |
| `redis://app:s3cret@redis.internal:6379/2` | user `app`, database number 2 |
| `rediss://app:s3cret@redis.example.com:6380` | **TLS** (note the double `s`), for any Redis reached over a network you don't control |

Passwords go only in `.env` or your host's secret settings, never in `config/redis.ts` and never in `.env.example`. Logs redact the password inside `REDIS_URL`.

### More than one connection

`config/redis.ts` names connections, like Laravel's `default` and `cache` connections. Use separate ones when you want queues and cache in different Redis databases or servers, so flushing the cache can never delete queued jobs:

```ts title="config/redis.ts"
import { defineConfig, env } from '@strutvane/framework'

export default defineConfig({
  default: { url: env.string('REDIS_URL') },
  cache: { url: env.string('REDIS_CACHE_URL', env.string('REDIS_URL')) },
  prefix: env.string('REDIS_PREFIX', 'my_app:'),
})
```

**Why a prefix:** several apps (or your staging and production) may share one Redis. The prefix keeps their keys apart. On top of it, cache keys always get the current team's prefix (tenant-prefixed cache), which you can't turn off.

## Using Redis directly

Most apps never talk to Redis directly: the cache, queue and session drivers do. When you need a Redis feature they don't cover (a sorted set for a leaderboard, a counter, a stream), ask the container for a connection:

```ts title="app/http/controllers/leaderboard.controller.ts"
import type { HttpContext } from '@strutvane/framework'
import { RedisToken, type RedisConnection } from '@strutvane/redis'

export class LeaderboardController {
  static readonly inject = [RedisToken] as const

  constructor(private readonly redis: RedisConnection) {}

  async show(ctx: HttpContext): Promise<Response> {
    const top = await this.redis.zrevrange(`leaderboard:${ctx.tenant.id}`, 0, 9, 'WITHSCORES')
    return ctx.json({ data: top })
  }
}
```

The connection is the underlying client's (the catalogue names `iovalkey` or `ioredis`), with your prefix applied.

:::danger[Keys you write yourself aren't team-prefixed]
The automatic team prefix applies to the **cache**. Keys you write with the raw connection are exactly what you type. Always put the team in the key yourself (`leaderboard:${tenant}`), or one customer could read another's data.
:::

## Running Redis or Valkey

### With Docker (local development)

`install:redis` adds a **Valkey** service to your local, git-ignored `docker/compose.yaml`. It starts and stops with the rest:

```bash
node strut services:up       # app, database, mailpit and valkey
node strut services:logs     # includes valkey's log
```

Like the other services, its port is bound to `127.0.0.1` only, so nothing outside your computer can reach it. If port 6379 is taken, change the forwarded port in `.env` and run `services:up` again.

### Without Docker (your own machine)

Run Redis or Valkey yourself and point `REDIS_URL` at it:

**macOS:**

```bash
brew install valkey
brew services start valkey
```

**Linux (Debian, Ubuntu):**

```bash
sudo apt install redis-server
sudo systemctl enable --now redis-server
```

**Windows:** Redis and Valkey don't ship native Windows builds. Use Docker mode, or install it inside **WSL2** with the Linux commands above; `redis://127.0.0.1:6379` then works from Windows too.

### In production

Use a managed Redis or Valkey from your cloud (or run your own), and:

1. Turn on **TLS** and a **password**, and use `rediss://` in `REDIS_URL`.
2. Keep it on a private network; never expose 6379 to the internet.
3. For queues, configure Redis to **keep data on disk** (AOF persistence) and to **not evict** keys (`maxmemory-policy noeviction`). A Redis that evicts keys under memory pressure can silently drop queued jobs.
4. For a pure cache instance, eviction (`allkeys-lru`) is fine: losing a cached value only costs a recomputation.

That's why separate instances for cache and queues are a good idea at scale.

## Health and failures

`@strutvane/redis` registers a **ping check** with the health-check registry, so the planned `/ready` route (0.3) fails when Redis is down, and your load balancer stops sending traffic.

What users and you see when Redis is unreachable:

| Feature on Redis | What happens |
|---|---|
| Cache | requests that need a cached value fail with an error (something like `CacheStoreError: The "redis" cache store is unreachable (REDIS_URL).`); they don't silently skip the cache |
| Rate limits, lockouts | **fail closed**: sign-in and other limited routes are refused rather than left unlimited |
| Queues | dispatching a job fails (the request gets an error); workers pause and reconnect, and no job is lost while Redis keeps its data |
| Sessions | users can't be recognised, so they're treated as signed out until Redis is back |

The client reconnects by itself when Redis returns. Errors are logged with the connection name, never the password.

## Testing

Tests don't need Redis: the testing kit uses in-memory fakes (`Cache` swapped, `Queue.fake()`). When you want to test against a real Redis (for example your own sorted-set code), point `REDIS_URL` at a separate database number for tests (`redis://127.0.0.1:6379/15`) and flush it before each test.

## Common mistakes

### "connect ECONNREFUSED 127.0.0.1:6379"

```text
Error: connect ECONNREFUSED 127.0.0.1:6379
```

**Why:** Redis isn't running, or it runs in Docker and the services are stopped.
**Fix:**

```bash
node strut services:up
```

Without Docker, start your local Redis or Valkey (see above).

### "NOAUTH Authentication required"

```text
ReplyError: NOAUTH Authentication required.
```

**Why:** the server has a password and `REDIS_URL` doesn't.
**Fix:** `REDIS_URL=redis://:your-password@host:6379` (or `rediss://` with TLS).

### Flushing the cache deleted my queued jobs

**Why:** cache and queues share one Redis database, and the flush cleared everything.
**Fix:** give the cache its own connection (`REDIS_CACHE_URL`, another database number or instance). `node strut cache:clear` only clears cache keys, but a manual `FLUSHDB` doesn't know the difference.

### Queued jobs disappeared under load

**Why:** Redis ran out of memory and evicted keys, jobs included.
**Fix:** `maxmemory-policy noeviction` and more memory for the queue instance, and keep the cache elsewhere.

### Everyone was signed out after Redis restarted

**Why:** sessions were on a Redis without persistence.
**Fix:** keep sessions in the database (`sessions: 'database'`), or turn on Redis persistence.

## Next steps

- [Cache](../cache/): the cache API that Redis can store.
- [Queues](../queues/): workers, retries and BullMQ.
- [Rate Limiting](../rate-limiting/): limits that use the cache store.
- [@strutvane/redis](../packages/redis/): the package page.
