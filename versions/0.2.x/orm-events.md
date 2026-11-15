---
title: "Events & Observers"
description: "Run your own code when a model is created, updated, deleted or restored: model hooks, observer classes, the exact order events fire in, events inside transactions, and how to skip them."
---

A **model event** is a moment in a model's life that your code can react to: "a post is about to be created", "a user was deleted". A **hook** is the function you attach to one of those moments, for example "after a user is created, send a welcome email". An **observer** is a class that groups all the hooks for one model in one file.

Use them for side effects that must happen **every** time, wherever the change comes from (the generated API, a controller, a seeder, a job): audit entries, cache clearing, notifications, keeping a counter in step.

:::tip[Coming from Laravel?]
Same event names and the same order: `creating`, `created`, `updating`, `updated`, `saving`, `saved`, `deleting`, `deleted`, `restoring`, `restored`. `protected static function booted()` with `static::created(...)` becomes a typed `static events = { created: … }` on the model, `php artisan make:observer` becomes `node strut make:observer`, and `Post::observe(PostObserver::class)` becomes `observe(Post, new PostObserver())`. One difference: "after" events inside a transaction wait for the commit **by default** (Laravel's `afterCommit`), so a rolled-back write never sends an email.
:::

:::caution[Coming in 0.2]
Model events and observers are **decided for 0.2** (ORM design §6.7 and the 2026-11-15 consistency decisions) but not built yet; the ORM prototype has none. Until then, call your code next to the write (see [What works today](#what-works-today)).
:::

## The smallest example

```ts title="app/models/post.ts"
import { Model, type ModelEvents } from '@strutvane/framework'
import { audit } from '../support/audit.ts'

export class Post extends Model('posts', { fillable: ['title', 'body', 'status'] }) {
  static readonly events = {
    deleted: (post) => audit('post.deleted', { id: post.id }),
  } satisfies ModelEvents<Post>
}
```

```ts
const post = await Post.findOrFail(7)
await post.delete()
```

**What you'll see:** one `post.deleted` audit entry for post 7, whether the post was deleted from your controller, the generated API or a job.

## The events

| Event | When | Typical use |
|---|---|---|
| `saving` | Before any insert or update | Normalise values (trim, lower-case) |
| `creating` | Before an insert | Fill in a default that depends on other columns |
| `created` | After an insert | Welcome email, audit entry |
| `updating` | Before an update (only when something changed) | Check a status change is allowed |
| `updated` | After an update | Clear a cache, notify followers |
| `saved` | After any insert or update | Re-index for search |
| `deleting` | Before a delete (soft or real) | Refuse deleting something still in use |
| `deleted` | After a delete | Audit entry, remove files |
| `restoring` | Before a soft-deleted row comes back | |
| `restored` | After it came back | Audit entry |

"Before" events (`…ing`) run inside the write, so they can change the model's values. "After" events (`…ed`) see the saved row, with its id and timestamps.

### Cancelling a write

A "before" hook (`saving`, `creating`, `updating`, `deleting`, `restoring`) can **stop** the write by returning `false`. Nothing is written, the "after" events don't run, and the call tells you:

```ts title="app/models/post.ts"
import { Model, type ModelEvents } from '@strutvane/framework'

export class Post extends Model('posts', { fillable: ['title', 'body', 'status'] }) {
  static readonly events = {
    // A published post can't go back to draft.
    updating: (post) => {
      if (post.isDirty('status') && post.status === 'draft' && post.published_on !== null) return false
    },
  } satisfies ModelEvents<Post>
}
```

```ts
const saved = await post.save()
console.log(saved)
```

**What you'll see** when the hook refuses: `false`, and the row is unchanged. `save()` resolves to `false` only when a hook cancelled it.

| Who wrote | What happens when a hook returns `false` |
|---|---|
| Your code calling `save()`, `delete()` or `restore()` | It resolves to `false`; nothing is written |
| The generated API | It answers **422** with the problem code `write_cancelled` |

Returning `false` is for "this write is not allowed, carry on". If something went **wrong**, **throw** instead: the error propagates, and inside a [transaction](../orm-transactions/) everything rolls back.

### The order they fire in

| You call | Events, in order |
|---|---|
| `Post.create(…)`, or `save()` on a new model | `saving` → `creating` → *insert* → `created` → `saved` |
| `save()` on a loaded model with changes | `saving` → `updating` → *update* → `updated` → `saved` |
| `save()` with no changes | `saving` → `saved` (no update runs) |
| `delete()` | `deleting` → *delete (or set `deleted_at`)* → `deleted` |
| `restore()` | `restoring` → `saving` → `updating` → *update* → `updated` → `saved` → `restored` |

## Hooks on the model: `static events`

For one or two short hooks, put them on the model:

```ts title="app/models/user.ts"
import { Model, type ModelEvents } from '@strutvane/framework'

export class User extends Model('users', { fillable: ['name', 'email'], hidden: ['password'] }) {
  static readonly events = {
    saving: (user) => {
      user.name = user.name.trim()
    },
  } satisfies ModelEvents<User>
}
```

**What you'll see:** `await User.create({ name: '  Ada ', email: 'ada@example.com' })` saves `name` as `'Ada'`.

`satisfies ModelEvents<User>` checks the event names and gives each hook a typed `user`, so `user.nmae` doesn't compile.

## Observers

When a model has several hooks, or they need other services (a mailer, a cache), move them into an observer class.

1. **Create it:**

   ```bash
   node strut make:observer PostObserver --model=Post
   ```

   **What you'll see** (something like this):

   ```text
     Created app/observers/post.observer.ts
   ```

2. **Fill in the methods you need** (delete the others):

   ```ts title="app/observers/post.observer.ts"
   import type { Post } from '../models/post.ts'
   import { audit } from '../support/audit.ts'
   import { notifyFollowers } from '../support/notify-followers.ts'

   /** Everything that happens around a post's life. */
   export class PostObserver {
     async created(post: Post): Promise<void> {
       await audit('post.created', { id: post.id })
     }

     async updated(post: Post): Promise<void> {
       if (post.status === 'published') await notifyFollowers(post)
     }

     async deleted(post: Post): Promise<void> {
       await audit('post.deleted', { id: post.id })
     }
   }
   ```

3. **Register it** in a service provider, so it's active everywhere:

   ```ts title="app/providers/app.provider.ts (excerpt)"
   import { observe, ServiceProvider, type Application } from '@strutvane/framework'
   import { Post } from '../models/post.ts'
   import { PostObserver } from '../observers/post.observer.ts'

   export class AppServiceProvider extends ServiceProvider {
     override boot(_app: Application): void {
       observe(Post, new PostObserver())
     }
   }
   ```

**What you'll see:** publishing a post through the generated API (`PATCH /api/posts/7` with `{"status":"published"}`) notifies its followers, with no code in any controller.

## Events and transactions

"After" events (`created`, `updated`, `saved`, `deleted`, `restored`) that happen **inside a transaction** are held back until the transaction **commits**. If it rolls back, they never run:

```ts
import { transaction } from '@strutvane/framework'

await transaction(async () => {
  const user = await User.create({ name: 'Ada', email: 'ada@example.com' })
  throw new Error('payment failed')   // rolls everything back
})
```

**What you'll see:** no user in the database, and **no** welcome email, because the `created` hook never ran. Without this rule, the email would go out for an account that doesn't exist.

"Before" events (`creating`, `saving`…) run immediately, inside the transaction, because they're part of the write. See [Transactions](../orm-transactions/).

## Skipping events

Some writes should be silent: a data fix, an import, a seeder.

```ts
import { withoutEvents } from '@strutvane/framework'

await post.saveQuietly()                              // this one save, no events
await withoutEvents(async () => {
  for (const post of drafts) await post.delete()      // no events for anything inside
})
```

Use them sparingly: anything that skips events also skips your audit entries.

## Events and teams

On tenant tables, hooks run inside the same team as the write, so a hook that queries other team tables sees only that team's rows. Hooks that run after the commit keep the team they started in.

## What works today

Until model events ship, call the side effect right after the write, in one place your controllers share:

```ts title="app/services/publish-post.ts"
import { transaction } from '@strutvane/framework'
import type { Post } from '../models/post.ts'
import { notifyFollowers } from '../support/notify-followers.ts'

/** Publish a post, then notify, only once the change is saved. */
export async function publishPost(post: Post): Promise<void> {
  await transaction(async () => {
    post.status = 'published'
    await post.save()
  })
  await notifyFollowers(post)  // after the commit, like an "after" event
}
```

**What you'll see:** the same result as an `updated` hook, as long as every place that publishes calls `publishPost`.

## Small, typical, advanced

- **Small:** one `saving` hook on the model to tidy a value.
- **Typical:** an observer with `created`, `updated` and `deleted`, registered in a provider.
- **Advanced:** hooks that dispatch queued jobs (they run after the commit, so the job never sees a row that was rolled back), combined with `saveQuietly()` for imports.

## Common mistakes

### My hook sends an email even when the save failed

**Why:** you sent it from a "before" event (`creating`, `saving`), which runs before the write is committed.
**Fix:** move it to the matching "after" event (`created`, `saved`).

### My observer never runs

**Why:** it isn't registered, or it's registered for another model.
**Fix:** add `observe(Post, new PostObserver())` to a provider's `boot()`, and check the model class.

### A hook runs in a loop

**Why:** an `updated` hook calls `save()` on the same model, which fires `updated` again.
**Fix:** change values in `updating` or `saving` instead (they're saved with the write), or use `saveQuietly()` inside the hook.

### `save()` returned `false`

**Why:** a "before" hook (on the model or in an observer) returned `false` and cancelled the write.
**Fix:** check the result where it matters (`if (!(await post.save())) …`), or, if the hook really means "error", make it throw instead.

### Bulk changes don't fire events

**Why:** events belong to a model instance. A change that never loads models (a raw SQL update, a future bulk `query().update()`) can't fire them.
**Fix:** load the rows and save each one, or call your side effect yourself after the bulk change.

## Next steps

- [Transactions](../orm-transactions/): why "after" events wait for the commit.
- [Soft Deletes](../orm-soft-deletes/): `deleting`, `deleted`, `restoring`, `restored`.
- [Events](../events/): application events, beyond one model.
