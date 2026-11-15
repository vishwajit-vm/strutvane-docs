---
title: "Events"
description: "Announce that something happened (a post was published) and let other parts of your app react to it, without the two knowing about each other, in the same request, after the commit, or in the background."
---

An **event** is a short announcement that something happened: "post 42 was published", "a user signed in". A **listener** is a function that reacts to one kind of event: send the followers a mail, flush a cache tag, write to the audit log.

The point is that the code that **emits** (sends) the event doesn't know who listens. Your `PostController` says "a post was published" and moves on; the mail, the cache and the search index each subscribe on their own. Adding a fourth reaction doesn't touch the controller at all.

:::tip[Coming from Laravel?]
It's Laravel's event system: `Event::dispatch()` becomes `events.emit()`, `Event::listen()` becomes `events.on()`, `Event::fake()` becomes `Event.fake()`, and listeners can be queued and run only after the database commits (`ShouldDispatchAfterCommit` becomes `afterCommit: true`). `event:list`, `event:cache` and `event:clear` keep their names.

What's different:
- An event is a **name plus plain data** (`'post.published'`, `{ postId }`), not a class. Names follow `resource.pastTenseVerb`.
- **A failing listener never breaks the code that emitted the event, or the other listeners.** Its error is collected and logged.
- Every event carries an id, the time, the team (tenant), the user who caused it and an **idempotency key**, so a listener that runs twice can tell.
- Model events (`creating`, `saved`…) and observers belong to the ORM and come in 0.2; see [ORM: Getting Started](../orm/#model-events-and-observers).
:::

:::caution[Coming in 0.2]
The **event bus** on this page (`on`, `once`, `emit`, `listenerCount`, error isolation, the event's id, time, tenant, actor and idempotency key) is **built in 0.1** (`@strutvane/core`, with tests) and is being moved into `@strutvane/framework`. It isn't released in its 0.2 form yet, so import paths may still move.

**What 0.2 promises, plainly:** the framework's own domain events (such as `post.created` from the generated API) are dispatched **in-process, after the transaction commits**. In-process means the listeners run inside the same app process, right away. If the process stops between the commit and the listener (a crash, a deploy), that listener's work is **lost**. The durable outbox, which stores each event with the data so it is delivered even after a crash ("never lost"), arrives **with the queue in 0.3**. Until then, don't rely on a listener for something that must happen; do it in the action itself.
:::

:::caution[Coming in 0.3]
In **phase 2 (0.3)**, application events get: listener classes and **discovery** (listeners found by folder, cached with `event:cache`), **queued listeners**, **subscribers**, the durable outbox, the `afterCommit: true` option for events you emit yourself, the `Event.fake()` test fake, and the `model.changed` event with a redacted diff. **Planned API (a sketch: names may change before 0.3):** `make:listener`, the `app/listeners/` folder and the listener class shape below follow Laravel; they're marked where they appear.
:::

## The smallest example

**Step 1: listen.** In a [service provider](../providers/), react to `post.published`:

```ts title="app/providers/app.provider.ts"
import { EventBusToken, Log, ServiceProvider, type Application } from '@strutvane/framework'

export class AppServiceProvider extends ServiceProvider {
  override boot(app: Application): void {
    const events = app.container.make(EventBusToken)
    events.on('post.published', (event) => {
      Log.info('A post was published', { postId: (event.payload as { postId: string }).postId })
    })
  }
}
```

**Step 2: emit.** In the controller action that publishes a post:

```ts title="app/http/controllers/post.controller.ts (excerpt)"
import { app, authorize, EventBusToken, ResourceController, type HttpContext } from '@strutvane/framework'
import { Post } from '../../models/post.ts'
import { PostPolicy } from '../../policies/post.policy.ts'

export class PostController extends ResourceController<typeof Post> {
  protected readonly model = Post
  protected readonly policy = new PostPolicy()

  async publish(ctx: HttpContext): Promise<Response> {
    const post = await this.visible(ctx)
    await authorize(this.policy, 'update', ctx.user, post, 'post')
    await post.update({ status: 'published' })
    await app().container.make(EventBusToken).emit('post.published', { postId: post.id })
    return ctx.json({ data: post })
  }
}
```

(In a class of your own you can also list `EventBusToken` in `static inject` and receive the bus in the constructor; see [Service Container](../container/).)

**What you'll see** in `storage/logs/`:

```text
[2026-11-15 10:22:01] local.INFO: A post was published {"postId":"42","requestId":"01JD7Q…"}
```

And `emit` tells you what happened:

```ts
const result = await app().container.make(EventBusToken).emit('post.published', { postId: post.id })
// → { event: { id: '01JD7Q…', type: 'post.published', version: 1, payload: { postId: '42' },
//              occurredAt: '2026-11-15T10:22:01.123Z', idempotencyKey: '01JD7Q…' },
//     delivered: 1, errors: [] }
```

## What's inside an event

Your listener receives the whole event, not just your data:

| Field | What it is | Example |
|---|---|---|
| `id` | a unique, time-sortable id (UUIDv7) | `'01JD7Q6Y9X…'` |
| `type` | the name, `resource.pastTenseVerb` | `'post.published'` |
| `version` | the version of the payload's shape (default 1); bump it when you change the shape incompatibly | `1` |
| `payload` | your data | `{ postId: '42' }` |
| `occurredAt` | when it was emitted, ISO 8601 in UTC | `'2026-11-15T10:22:01.123Z'` |
| `tenantId` | the team, when you pass it | `'7'` |
| `actor` | who caused it: `{ id, type }`, when you pass it | `{ id: '3', type: 'user' }` |
| `idempotencyKey` | the same for every delivery of one event, so a listener can ignore duplicates | defaults to `id` |
| `correlationId` | links events caused by the same request or workflow | `'01JD7Q…'` |

Pass the optional fields as a third argument:

```ts title="app/http/controllers/post.controller.ts (excerpt)"
await app().container.make(EventBusToken).emit(
  'post.published',
  { postId: post.id },
  { tenantId: '7', actor: { id: ctx.requireUser().id, type: 'user' }, version: 1 },
)
```

:::danger[Ids, not secrets]
Put **ids and small values** in a payload, never passwords, tokens, mail links or whole records with private columns. Events end up in logs, queues and the audit trail. The auth package follows this strictly: its events carry ids, methods and counts only, and a test proves no secret ever reaches one.
:::

## Every way to listen

### `on`: every time

`on` returns a function that removes the listener again. Keep it when the listener should stop at some point (tests, a temporary feature):

```ts title="app/providers/app.provider.ts (excerpt)"
const stop = events.on('post.published', async (event) => {
  // runs for every post.published
})
// later:
stop()
```

### `once`: only the next one

```ts title="app/providers/app.provider.ts (excerpt)"
events.once('post.published', (event) => {
  Log.info('The first post since the app started was published')
})
```

**What you'll see:** the listener runs for the next `post.published`, then removes itself.

### Several listeners for one event

Every listener for the type runs, **at the same time** (concurrently), and `emit` waits for all of them to finish:

```ts title="app/providers/app.provider.ts (excerpt)"
import { Cache } from '@strutvane/framework'

events.on('post.published', () => Cache.tags(['posts']).flush())          // fresh numbers
events.on('post.published', (event) => notifyFollowers(event.payload))      // mail
events.on('post.published', (event) => reindexForSearch(event.payload))     // search
```

Because they run concurrently, **don't rely on their order**. If one step needs another to finish first, put both in one listener, or chain [queued jobs](../queues/#chains-one-after-another).

### How many listeners are there?

```ts
events.listenerCount('post.published')   // → 3
```

Handy in tests and in `node strut event:list`.

## When a listener fails

A listener that throws **doesn't** stop the others, and **doesn't** make `emit` throw. The error is collected and returned:

```ts title="app/http/controllers/post.controller.ts (excerpt)"
const { delivered, errors } = await app().container.make(EventBusToken).emit('post.published', { postId: post.id })
// → delivered: 3, errors: [ Error: Search service unreachable ]
```

**What you'll see:** the post is published, the response is `200`, the cache was flushed and the mail sent; only search indexing failed, and the framework logs it:

```text
local.ERROR: Listener failed for "post.published" {"eventId":"01JD7Q…","error":"Error: Search service unreachable"}
```

Why this default: an announcement is a side effect. A broken search index must not make "Publish" fail for the person clicking it. When a listener's work matters, make it a [queued listener](#queued-listeners) so it gets retries.

### Making failures loud: `throwListenerErrors`

Sometimes a failure **should** stop everything: in tests, or for a listener that must succeed in the same transaction. A bus created with `throwListenerErrors: true` makes `emit` reject with an `AggregateError` naming every failure:

```ts title="tests/unit/events.test.ts"
import { describe, expect, it } from 'vitest'
import { createEventBus } from '@strutvane/framework'

describe('post.published', () => {
  it('surfaces listener errors in tests', async () => {
    const events = createEventBus<{ 'post.published': { postId: string } }>({ throwListenerErrors: true })
    events.on('post.published', () => {
      throw new Error('boom')
    })
    await expect(events.emit('post.published', { postId: '42' })).rejects.toThrow('1 listener(s) failed for "post.published"')
  })
})
```

**What you'll see:** the test passes because `emit` rejected with:

```text
AggregateError: 1 listener(s) failed for "post.published"
```

`createEventBus<E>()` takes a map of event names to payload types, so on your own bus `events.emit('post.publish', …)` (a typo) or a payload of the wrong shape is a compile error. `onListenerError(error, event)` is the option that receives every listener error (the app's bus uses it to log them).

## Events from the generated CRUD API

The generated CRUD API emits an event after every write, named after the resource. In 0.1 it does this right after the write; in 0.2 these domain events are dispatched **after the transaction commits**, in-process (see the box at the top of this page):

| Action | Event | Payload |
|---|---|---|
| create | `post.created` | `{ resource, id, tenantId, actorId }` |
| update | `post.updated` | same |
| delete | `post.deleted` | same |
| restore | `post.restored` | same |

So you can react to admin-screen changes without writing a controller:

```ts title="app/providers/app.provider.ts (excerpt)"
events.on('post.created', (event) => {
  const { id, actorId } = event.payload as { id: string; actorId: string | null }
  Log.info('Post created from the admin screens', { id, actorId })
})
```

:::caution[Coming in 0.3]
For 0.3 the framework plans one **`model.changed`** event for every committed change, from the API, the admin screens or your own code: `{ table, key, tenant, actor, before, after, changed }`, with secret and hidden columns replaced by `[redacted]`, sent **after the commit**. Packages such as the activity log, webhooks, search, realtime and charts listen to it. Whether the per-resource names above stay next to it isn't decided yet.
:::

## Events after the commit: `afterCommit`

If you emit inside a [transaction](../orm-transactions/) and the transaction is rolled back, listeners would have reacted to something that never happened: a "welcome" mail for a user who was never saved. `afterCommit: true` holds the event until the commit and drops it on a rollback.

```ts title="app/services/publish-post.ts"
import { app, EventBusToken, transaction } from '@strutvane/framework'
import { Post } from '../models/post.ts'

export async function publish(postId: string): Promise<void> {
  const events = app().container.make(EventBusToken)
  await transaction(async () => {
    const post = await Post.findOrFail(postId)
    await post.update({ status: 'published' })
    await events.emit('post.published', { postId }, { afterCommit: true })
  })
}
```

**What you'll see:** listeners run right after the commit. If anything in the transaction throws, nothing is published **and** no listener runs. The same option exists on [jobs](../queues/#only-after-the-transaction-commits-aftercommit) and mail.

:::caution[Coming in 0.3]
The `afterCommit` option for events you emit yourself is planned for 0.3 (Laravel parity: "Events after the DB commit"). In 0.2, the framework's own domain events are already dispatched after the commit, but an `emit()` you call inside `transaction()` is delivered immediately; emit after `transaction()` returns instead.
:::

## Listener classes and discovery

:::caution[Coming in 0.3]
**Planned API (a sketch: names may change before 0.3).** Listener classes in `app/listeners/`, found automatically and cached for production.
:::

For anything bigger than a few lines, give a listener its own file. A listener class names its event and has a `handle()` method:

```ts title="app/listeners/notify-followers.ts"
import type { DomainEvent } from '@strutvane/framework'

/** Mails everyone who follows the author when a post is published. */
export class NotifyFollowers {
  static readonly event = 'post.published'

  async handle(event: DomainEvent<'post.published', { postId: string }>): Promise<void> {
    // look up the followers, queue one mail each
  }
}
```

```bash
node strut make:listener NotifyFollowers --event=post.published
node strut event:list
```

**What you'll see** from `event:list`:

```text
  post.published
    ⇂ app/listeners/notify-followers.ts (queued)
    ⇂ closure in app/providers/app.provider.ts:12
  post.created
    ⇂ closure in app/providers/app.provider.ts:20
```

In production, `node strut event:cache` stores the discovered list so the app doesn't scan folders at start-up; `event:clear` removes the cache. Both are part of `node strut optimize` and `optimize:clear`.

## Queued listeners

A **queued listener** doesn't run during the request: the event is handed to the [queue](../queues/), and a worker runs the listener later, with retries and a failed-jobs list. Use it for mail, calls to other services and anything slow.

:::caution[Coming in 0.3]
**Planned API (a sketch: names may change before 0.3).**
:::

```ts title="app/listeners/notify-followers.ts"
import type { DomainEvent } from '@strutvane/framework'

export class NotifyFollowers {
  static readonly event = 'post.published'
  /** Run on a worker, after the commit, with up to 3 tries. */
  static readonly queued = { afterCommit: true, tries: 3 }

  async handle(event: DomainEvent<'post.published', { postId: string }>): Promise<void> {
    // mail the followers
  }
}
```

**What you'll see:** the "Publish" request answers at once; a worker log shows the listener a moment later:

```text
local.INFO: Processing listener NotifyFollowers for post.published {"eventId":"01JD7Q…","attempt":1}
```

The request's context (team, user, request id) travels with the event to the worker, exactly as with [jobs](../queues/#what-travels-with-a-job-context). Delivery to a queued listener is **at least once**: after a crash it may run again, so check `event.idempotencyKey` before doing something that mustn't happen twice (charging a card, sending one mail).

## Subscribers

:::caution[Coming in 0.3]
**Planned API (a sketch: names may change before 0.3).**
:::

A **subscriber** is one class that listens to several events, so related reactions stay together:

```ts title="app/listeners/post-search-subscriber.ts"
import type { DomainEvent, EventBus } from '@strutvane/framework'

/** Keeps the search index in step with posts. */
export class PostSearchSubscriber {
  subscribe(events: EventBus<Record<string, unknown>>): void {
    events.on('post.published', (event) => this.index(event))
    events.on('post.deleted', (event) => this.remove(event))
  }

  private async index(event: DomainEvent<string, unknown>): Promise<void> {}
  private async remove(event: DomainEvent<string, unknown>): Promise<void> {}
}
```

## Events, hooks and model events: which one?

Strutvane has three similar-sounding tools. They do different jobs:

| Tool | Answers | Can it change or stop the action? | Example |
|---|---|---|---|
| **Event** (this page) | "This happened. Anyone interested?" | No. Listeners react afterwards; a failure doesn't undo anything | `post.published` → mail followers |
| **Hook** | "I'm about to do this. Does anyone want to adjust or refuse it?" | Yes. A handler may change the payload, stop the chain, or throw to refuse (fail closed) | the auth package adds a row filter on `resource.beforeQuery` |
| **Model event** | "This model is being saved / was saved" | `creating`, `updating`, `deleting` may refuse; the others react | `created` → write an audit entry |

Use an event for reactions, a hook when packages must take part in a decision, and model events for rules that belong to one model. See [ORM: Getting Started](../orm/#model-events-and-observers).

## With Docker or without Docker

The event bus runs inside your app's process, so it behaves the same with or without Docker and on every operating system. Queued listeners run on queue workers, which run **inside the `app` container** in Docker mode ([Queues](../queues/#with-docker-or-without-docker)).

## Testing

To check that your code emits an event without running the real listeners, use the fake (planned with the other fakes):

```ts title="tests/feature/publish.test.ts"
import { it } from 'vitest'
import { Event } from '@strutvane/framework'

it('announces the publication', async () => {
  const events = Event.fake()
  // …publish post 42 through the API…
  events.assertEmitted('post.published', (event) => event.payload.postId === '42')
})
```

See [Mocking](../mocking/) for every fake.

## Common mistakes

### My listener never runs

**Why:** the names don't match exactly (`post.publish` vs `post.published`), or the listener is registered in `register()` of a provider that builds the bus later, or after the event was already emitted.
**Fix:** register in `boot()`, and check the names with `listenerCount`:

```ts
Log.debug('post.published listeners', { count: events.listenerCount('post.published') })
```

### A listener failed, but my request still answered 200

**Why:** that's on purpose: a listener's failure never breaks the action that emitted the event. The error is in `errors` and in the log.
**Fix:** if the work must succeed, do it in the action itself (inside the transaction), or make it a queued listener so it's retried and lands in the failed-jobs list if it can't succeed.

### Followers got a mail for a post that was never published

**Why:** the event was emitted inside a transaction that was later rolled back.
**Fix:** in 0.2, emit after `transaction()` returns (in 0.3 you can also emit with `afterCommit: true`):

```ts
await transaction(async () => {
  await post.update({ status: 'published' })
})
await events.emit('post.published', { postId: post.id })
```

### My listeners run in a different order each time

**Why:** listeners for one event run concurrently; there's no order.
**Fix:** put steps that depend on each other in one listener, or chain [queued jobs](../queues/#chains-one-after-another).

### A password ended up in the log

**Why:** a whole record (or a request body) was put in an event payload, and a listener logged the payload.
**Fix:** put ids in payloads, and load what you need in the listener:

```ts
await events.emit('user.registered', { userId: user.id })
```

## Next steps

- [Queues](../queues/): run slow reactions in the background.
- [Cache](../cache/): flush cache tags when data changes.
- [Service Providers](../providers/): where listeners are registered.
- [Audit Log](../audit/): the permanent record of who did what.
